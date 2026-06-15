const DIRECT_REPLAY_TAB_RE = /<li\s+class="tab1"[^>]*>\s*<a\s+href="(https:\/\/sports\.cctv\.com\/[^"]+)"[^>]*>/i;
const DIRECT_VIDEO_LINK_RE = /https:\/\/sports\.cctv\.com\/\d{4}\/\d{2}\/\d{2}\/VIDE[a-zA-Z0-9]+\.shtml(?:\?[^"'\\s<>]*)?/gi;
const GUID_ATTR_RE = /data-guid="([0-9a-f]{32})"/gi;

const CLIP_TITLE_RE = /(集锦|破门|进球|世界波|点球|闪击|扩大优势|扳平|锁定胜局|暂时领先|梅开二度|造点|头球|推射|扫射|低射|补射|任意球|角球|远射|传中|单刀|凌空|抢点|直塞|助攻)/;
const FULL_MATCH_TITLE_RE = /(VS|vs|对阵|迎战|回放|全场|录像)/;

function createLogger(logger) {
  return typeof logger === 'function' ? logger : () => {};
}

function parseDurationToSeconds(value) {
  if (!value || typeof value !== 'string') return 0;
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function extractDirectReplayUrl(html) {
  const replayMatch = html.match(DIRECT_REPLAY_TAB_RE);
  if (replayMatch && replayMatch[1]) {
    return replayMatch[1];
  }

  const directLinks = [...new Set(html.match(DIRECT_VIDEO_LINK_RE) || [])];
  if (directLinks.length === 1) {
    return directLinks[0];
  }

  return null;
}

function extractGuids(html) {
  return [...new Set(
    [...html.matchAll(GUID_ATTR_RE)]
      .map((match) => match[1])
      .filter(Boolean)
  )];
}

function scoreReplayCandidate(candidate, matchMeta) {
  const title = String(candidate.title || '');
  const normalizedTitle = normalizeText(title);
  const normalizedHome = normalizeText(matchMeta.home);
  const normalizedAway = normalizeText(matchMeta.away);
  const durationSeconds = parseDurationToSeconds(candidate.len);
  let score = 0;

  if (durationSeconds >= 5400) score += 90;
  else if (durationSeconds >= 3600) score += 75;
  else if (durationSeconds >= 3000) score += 45;
  else if (durationSeconds >= 1800) score += 10;
  else score -= 50;

  if (FULL_MATCH_TITLE_RE.test(title)) score += 20;
  if (/第\d+轮/.test(title)) score += 10;

  if (normalizedHome && normalizedTitle.includes(normalizedHome)) score += 12;
  if (normalizedAway && normalizedTitle.includes(normalizedAway)) score += 12;
  if (normalizedHome && normalizedAway &&
      normalizedTitle.includes(normalizedHome) &&
      normalizedTitle.includes(normalizedAway)) {
    score += 20;
  }

  if (CLIP_TITLE_RE.test(title)) score -= 60;
  if (!String(candidate.url || candidate.curl || '').includes('sports.cctv.com/')) score -= 25;

  return {
    score,
    durationSeconds
  };
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NoSpoilReplayBot/1.1',
        'Accept': 'application/json,text/javascript,*/*'
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NoSpoilReplayBot/1.1',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      return { status: response.status, html: '' };
    }

    return {
      status: response.status,
      html: await response.text()
    };
  } catch (err) {
    return { status: 'ERR', html: '', error: err };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchReplayByGuidFallback(html, matchMeta, logger) {
  const log = createLogger(logger);
  const guids = extractGuids(html);

  if (guids.length === 0) {
    return null;
  }

  log(`  [${matchMeta.matchId}] 尝试 guid 回退，共 ${guids.length} 个候选`);

  const candidates = [];
  for (const guid of guids) {
    try {
      const data = await fetchJsonWithTimeout(
        `https://api.cntv.cn/video/videoinfoByGuid?serviceId=cbox&guid=${encodeURIComponent(guid)}`,
        8000
      );

      if (!data || !(data.url || data.curl)) {
        continue;
      }

      const scored = scoreReplayCandidate(data, matchMeta);
      candidates.push({
        guid,
        url: data.url || data.curl,
        title: data.title || '',
        len: data.len || '',
        score: scored.score,
        durationSeconds: scored.durationSeconds
      });
    } catch (err) {
      log(`  [${matchMeta.matchId}] guid=${guid} 查询失败: ${err.message}`);
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.durationSeconds - a.durationSeconds;
  });

  const best = candidates.find((candidate) => candidate.durationSeconds >= 3600 && candidate.score > 0);
  if (!best) {
    if (candidates.length > 0) {
      const preview = candidates
        .slice(0, 3)
        .map((candidate) => `${candidate.title} (${candidate.len || '未知时长'}, score=${candidate.score})`)
        .join(' | ');
      log(`  [${matchMeta.matchId}] guid 候选未命中全场回放: ${preview}`);
    }
    return null;
  }

  log(`  [${matchMeta.matchId}] guid 回退命中: ${best.title} (${best.len})`);
  return best.url;
}

async function resolveReplayUrl(matchMeta, options = {}) {
  const log = createLogger(options.logger);
  const liveUrl = matchMeta.liveUrl;
  if (!liveUrl) {
    return null;
  }

  const { status, html, error } = await fetchTextWithTimeout(liveUrl, options.timeoutMs || 10000);
  if (!html) {
    const detail = error && error.message ? `: ${error.message}` : '';
    log(`  [${matchMeta.matchId}] HTTP ${status || 'ERR'}${detail}, 跳过`);
    return null;
  }

  const directReplayUrl = extractDirectReplayUrl(html);
  if (directReplayUrl) {
    return directReplayUrl;
  }

  return await fetchReplayByGuidFallback(html, matchMeta, log);
}

module.exports = {
  parseDurationToSeconds,
  resolveReplayUrl
};

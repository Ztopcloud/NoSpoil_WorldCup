const DIRECT_REPLAY_TAB_RE = /<li\s+class="tab1"[^>]*>\s*<a\s+href="(https:\/\/sports\.cctv\.com\/[^"]+)"[^>]*>/i;
const DIRECT_VIDEO_LINK_RE = /https:\/\/sports\.cctv\.com\/\d{4}\/\d{2}\/\d{2}\/VIDE[a-zA-Z0-9]+\.shtml(?:\?[^"'\\s<>]*)?/gi;
const GUID_ATTR_RE = /data-guid="([0-9a-f]{32})"/gi;

const CLIP_TITLE_RE = /(集锦|破门|进球|世界波|点球|闪击|扩大优势|扳平|锁定胜局|暂时领先|梅开二度|造点|头球|推射|扫射|低射|补射|任意球|角球|远射|传中|单刀|凌空|抢点|直塞|助攻)/;
const FULL_MATCH_TITLE_RE = /(VS|vs|对阵|迎战|回放|全场|录像)/;

// CCTV 搜索用名映射：搜索时用简称命中率更高
const SEARCH_NAME_MAP = {
  '刚果民主共和国': '刚果',
  '沙特阿拉伯': '沙特',
  '大韩民国': '韩国',
  '波斯尼亚和黑塞哥维那': '波黑',
  '阿拉伯联合酋长国': '阿联酋',
  '美利坚合众国': '美国',
};

function toSearchName(name) {
  return SEARCH_NAME_MAP[name] || name;
}

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

// ===== CCTV 搜索 API 回退 =====
// 使用 ifsearch.php JSON 接口（原 search.php 是 AJAX 渲染，静态抓取拿不到数据）

const CCTV_IFSEARCH_API = 'https://search.cctv.com/ifsearch.php';
const FULL_MATCH_MIN_SECONDS = 3000; // 全场回放最低 50 分钟（部分比赛回放可能被裁剪）

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '未知时长';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function fetchReplayBySearchFallback(matchMeta, logger) {
  const log = createLogger(logger);
  const homeSearch = toSearchName(matchMeta.home);
  const awaySearch = toSearchName(matchMeta.away);
  const query = encodeURIComponent(`${homeSearch} ${awaySearch}`);

  const searchUrl = `${CCTV_IFSEARCH_API}?qtext=${query}&type=video&page=1&pageSize=50&sort=date&vtime=-1&datepid=1&channel=%E4%B8%8D%E9%99%90&pageflag=0&qtext_str=${query}`;
  log(`  [${matchMeta.matchId}] 尝试 CCTV ifsearch API: "${homeSearch} ${awaySearch}"`);

  try {
    const data = await fetchJsonWithTimeout(searchUrl, 10000);
    if (!data || !Array.isArray(data.list) || data.list.length === 0) {
      log(`  [${matchMeta.matchId}] ifsearch API: 无结果`);
      return null;
    }

    // 分离体育和非体育链接，优先 sports.cctv.com
    const sportsVideos = data.list.filter((item) => /sports\.cctv\.com/.test(String(item.urllink || '')));
    const nonSportsVideos = data.list.filter((item) => !/sports\.cctv\.com/.test(String(item.urllink || '')));

    // 优先找 sports.cctv.com 中时长 >= 50 分钟的全场回放
    const fullMatch = sportsVideos.find((item) => item.durations >= FULL_MATCH_MIN_SECONDS);
    if (fullMatch && fullMatch.urllink) {
      log(`  [${matchMeta.matchId}] ifsearch 命中全场回放: ${fullMatch.all_title} (${formatDuration(fullMatch.durations)})`);
      return fullMatch.urllink;
    }

    // 宽松：sports 中时长 >= 50 分钟且标题含双方球队名，不含集锦关键词
    const relaxed = sportsVideos.filter((item) => {
      if (item.durations < FULL_MATCH_MIN_SECONDS) return false;
      const title = String(item.all_title || '');
      if (CLIP_TITLE_RE.test(title)) return false;
      return normalizeText(title).includes(normalizeText(matchMeta.home)) &&
        normalizeText(title).includes(normalizeText(matchMeta.away));
    });
    if (relaxed.length > 0) {
      log(`  [${matchMeta.matchId}] ifsearch 宽松命中: ${relaxed[0].all_title} (${formatDuration(relaxed[0].durations)})`);
      return relaxed[0].urllink;
    }

    // 极宽松：sports 中最长视频
    const longSports = sportsVideos
      .filter((item) => item.durations >= FULL_MATCH_MIN_SECONDS)
      .sort((a, b) => (b.durations || 0) - (a.durations || 0));
    if (longSports.length > 0) {
      log(`  [${matchMeta.matchId}] ifsearch 极宽松命中: ${longSports[0].all_title} (${formatDuration(longSports[0].durations)})`);
      return longSports[0].urllink;
    }

    // 兜底：sports 中取最长且有双方队名的视频
    const anySportsWithTeams = sportsVideos.filter((item) => {
      const title = String(item.all_title || '');
      return normalizeText(title).includes(normalizeText(matchMeta.home)) &&
        normalizeText(title).includes(normalizeText(matchMeta.away));
    }).sort((a, b) => (b.durations || 0) - (a.durations || 0));
    if (anySportsWithTeams.length > 0) {
      log(`  [${matchMeta.matchId}] ifsearch 兜底命中: ${anySportsWithTeams[0].all_title} (${formatDuration(anySportsWithTeams[0].durations)})`);
      return anySportsWithTeams[0].urllink;
    }

    log(`  [${matchMeta.matchId}] ifsearch API: 未找到长视频回放 (共${sportsVideos.length}体育+${nonSportsVideos.length}非体育结果, 最长${Math.max(...data.list.map(i => i.durations || 0))}秒)`);
    return null;
  } catch (err) {
    log(`  [${matchMeta.matchId}] ifsearch API 异常: ${err.message}`);
    return null;
  }
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

  const guidResult = await fetchReplayByGuidFallback(html, matchMeta, log);
  if (guidResult) {
    return guidResult;
  }

  // 第三层回退：CCTV 搜索 API
  return await fetchReplayBySearchFallback(matchMeta, log);
}

module.exports = {
  parseDurationToSeconds,
  resolveReplayUrl,
  fetchReplayBySearchFallback,
  toSearchName,
  formatDuration
};

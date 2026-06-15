const POSITIVE_TEXT_RE = /(全场|回放|录像|完整|复播|重播|比赛视频|世界杯)/;
const NEGATIVE_TEXT_RE = /(集锦|进球|破门|精彩瞬间|花絮|预测|前瞻|新闻|战报|比分)/;
const XHS_URL_RE = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\/[A-Za-z0-9]+[^\s"'<>]*/gi;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function scoreCandidate(candidate, match) {
  const haystack = `${candidate.title || ''} ${candidate.text || ''} ${candidate.url || ''}`;
  const normalized = normalizeText(haystack);
  const home = normalizeText(match.home);
  const away = normalizeText(match.away);
  let score = 0;

  if (home && normalized.includes(home)) score += 25;
  if (away && normalized.includes(away)) score += 25;
  if (home && away && normalized.includes(home) && normalized.includes(away)) score += 30;
  if (POSITIVE_TEXT_RE.test(haystack)) score += 20;
  if (NEGATIVE_TEXT_RE.test(haystack)) score -= 30;
  if (/xiaohongshu\.com\/(explore|discovery\/item)\//i.test(candidate.url || '')) score += 15;

  return score;
}

function collectLocalCandidates(match, allMatches) {
  const candidates = [];

  if (match.videoUrl && /xiaohongshu\.com/i.test(match.videoUrl)) {
    candidates.push({
      source: 'match-videoUrl',
      title: `${match.home} vs ${match.away}`,
      text: match.title || match.subtitle || '',
      url: match.videoUrl
    });
  }

  if (match.replayUrl && /xiaohongshu\.com/i.test(match.replayUrl)) {
    candidates.push({
      source: 'match-replayUrl',
      title: `${match.home} vs ${match.away}`,
      text: match.title || match.subtitle || '',
      url: match.replayUrl
    });
  }

  allMatches.forEach((other) => {
    const url = other.videoUrl || other.replayUrl || '';
    if (!url || !/xiaohongshu\.com/i.test(url)) return;
    const text = `${other.home || ''} ${other.away || ''} ${other.title || ''} ${other.subtitle || ''}`;
    const normalizedText = normalizeText(text);
    const home = normalizeText(match.home);
    const away = normalizeText(match.away);
    if ((home && normalizedText.includes(home)) || (away && normalizedText.includes(away))) {
      candidates.push({
        source: `local-match:${other.id}`,
        title: `${other.home || ''} vs ${other.away || ''}`.trim(),
        text,
        url
      });
    }
  });

  return candidates;
}

function collectManualCandidates(match, rawManualText) {
  if (!rawManualText) return [];

  const candidates = [];
  const urls = [...new Set(String(rawManualText).match(XHS_URL_RE) || [])];
  urls.forEach((url) => {
    const lines = String(rawManualText).split(/\r?\n/);
    const contextLine = lines.find((line) => line.includes(url)) || '';
    candidates.push({
      source: 'manual-config',
      title: `${match.home} vs ${match.away}`,
      text: contextLine,
      url
    });
  });

  return candidates;
}

function buildSearchKeywords(match) {
  return [
    `${match.home} ${match.away} 世界杯 回放`,
    `${match.home} vs ${match.away} 全场`,
    `${match.home} ${match.away} 录像 完整`
  ];
}

function resolveXhsCandidates(match, allMatches, options = {}) {
  const candidates = [
    ...collectLocalCandidates(match, allMatches),
    ...collectManualCandidates(match, options.manualText || process.env.XHS_CANDIDATE_LINKS || '')
  ];

  const seen = new Set();
  const scored = candidates
    .filter((candidate) => {
      if (!candidate.url || seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, match)
    }))
    .sort((a, b) => b.score - a.score);

  return {
    candidates: scored,
    searchKeywords: buildSearchKeywords(match)
  };
}

module.exports = {
  resolveXhsCandidates,
  scoreCandidate,
  buildSearchKeywords
};

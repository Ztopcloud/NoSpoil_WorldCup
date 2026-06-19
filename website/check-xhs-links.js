/**
 * Checks Xiaohongshu replay links saved in matches.json.
 *
 * Usage:
 *   node website/check-xhs-links.js
 *   node website/check-xhs-links.js --url "https://www.xiaohongshu.com/explore/..."
 *   node website/check-xhs-links.js --show-title
 */
const fs = require('fs');
const path = require('path');
const { inspectXhsLink, isXhsUrl } = require('./xhs-link-health');

const DATA_FILE = path.join(__dirname, 'data', 'matches.json');
const CONCURRENCY = 3;

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function collectUrlsFromMatches(matches) {
  const rows = [];
  matches.forEach((match) => {
    ['videoUrl', 'replayUrl'].forEach((field) => {
      const url = match[field];
      if (!isXhsUrl(url)) return;
      rows.push({
        matchId: match.id,
        matchName: `${match.home || ''} vs ${match.away || ''}`.trim(),
        field,
        url
      });
    });
  });
  return rows;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function statusLabel(status) {
  return {
    web_playable: '网页可播',
    restricted: '受限/可能需登录',
    not_found: '不存在',
    network_error: '网络错误',
    unknown: '未知'
  }[status] || status;
}

async function main() {
  const urlArgIndex = process.argv.indexOf('--url');
  const showTitle = process.argv.includes('--show-title');
  let rows;

  if (urlArgIndex !== -1 && process.argv[urlArgIndex + 1]) {
    const urls = unique(process.argv.slice(urlArgIndex + 1).filter((value) => /^https?:\/\//i.test(value)));
    rows = urls.map((url) => ({ matchId: '-', matchName: 'manual', field: 'url', url }));
  } else {
    const matches = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    rows = collectUrlsFromMatches(matches);
  }

  if (rows.length === 0) {
    console.log('未找到小红书链接。');
    return;
  }

  console.log(`检查 ${rows.length} 条小红书链接...\n`);
  const results = await mapLimit(rows, CONCURRENCY, async (row) => {
    const health = await inspectXhsLink(row.url);
    return { ...row, ...health };
  });

  const counts = {};
  results.forEach((result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
  });

  results.forEach((result) => {
    const title = showTitle && result.title ? ` | ${result.title}` : '';
    const detail = result.error ? ` | ${result.error}` : '';
    console.log(`[${statusLabel(result.status)}] ${result.matchId} ${result.field} ${result.matchName}${title}${detail}`);
    console.log(`  ${result.url}`);
  });

  console.log('\n汇总:');
  Object.keys(counts).sort().forEach((status) => {
    console.log(`  ${statusLabel(status)}: ${counts[status]}`);
  });
}

main().catch((err) => {
  console.error('检查失败:', err.message);
  process.exit(1);
});

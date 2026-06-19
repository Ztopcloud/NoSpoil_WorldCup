/**
 * fetch-zhibo8-links.js
 * 从直播吧 (zhibo8.com) 抓取小红书全场回放链接，更新 matches.json
 *
 * 适用场景：CCTV 尚未上线全场回放的比赛，通过直播吧索引的小红书链接作为替代
 */
const fs = require('fs');
const path = require('path');
const { resolveZhibo8Replay } = require('./zhibo8-resolver');

const DATA_FILE = path.join(__dirname, 'data', 'matches.json');
const SW_FILE = path.join(__dirname, 'sw.js');

function bumpSwVersion() {
  let content = fs.readFileSync(SW_FILE, 'utf8');
  const match = content.match(/const CACHE_VERSION = '(.+?)'/);
  if (!match) return;
  const num = parseInt(match[1].match(/\d+$/)[0]);
  const newVersion = match[1].replace(/\d+$/, String(num + 1));
  content = content.replace(`'${match[1]}'`, `'${newVersion}'`);
  fs.writeFileSync(SW_FILE, content, 'utf8');
  console.log(`  SW 版本: ${match[1]} → ${newVersion}`);
}

function hasKickedOff(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const [month, day] = dateStr.split('/').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!month || !day || hour == null || minute == null) return false;
  const now = new Date();
  const matchBeijing = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hour - 8, minute, 0));
  return matchBeijing <= now;
}

function isValidReplayUrl(url) {
  if (!url) return false;
  // 排除 liveUrl 被误填为 replayUrl 的情况
  if (/worldcup\.cctv\.com\/\d{4}\/match\//i.test(url)) return false;
  return true;
}

async function main() {
  console.log('=== 直播吧 → 小红书回放链接抓取 ===\n');

  const matches = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let updatedCount = 0;

  for (const match of matches) {
    // 跳过仍未开赛的比赛
    if (!hasKickedOff(match.date, match.timeBeijing)) continue;

    const matchName = `${match.home} vs ${match.away}`;

    // 已有有效回放链接的跳过
    if (isValidReplayUrl(match.replayUrl)) {
      console.log(`✅ ${matchName} (${match.id}) - 已有回放`);
      continue;
    }

    // 开幕式/赛前等特殊条目跳过
    if (match.round === 'pre') continue;

    console.log(`🔍 查找: ${matchName} (${match.id}) [${match.date} ${match.timeBeijing}]`);

    try {
      const xhsUrl = await resolveZhibo8Replay(match);
      if (xhsUrl) {
        match.replayUrl = xhsUrl;
        if (match.source) {
          match.source = '小红书';
        }
        console.log(`  ✅ → ${xhsUrl}`);
        updatedCount++;
      } else {
        console.log(`  ⏭ 直播吧暂无该场回放`);
      }
    } catch (err) {
      console.log(`  ❌ 抓取失败: ${err.message}`);
    }

    // 礼貌延迟
    await new Promise(r => setTimeout(r, 800));
  }

  if (updatedCount > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(path.dirname(DATA_FILE), `matches.${stamp}.bak.json`);
    fs.copyFileSync(DATA_FILE, backupFile);
    console.log(`\n📦 备份: ${backupFile}`);

    fs.writeFileSync(DATA_FILE, JSON.stringify(matches, null, 2) + '\n', 'utf8');
    console.log(`✅ 共更新 ${updatedCount} 场比赛的回放链接`);

    // 更新 SW 缓存版本
    bumpSwVersion();
    console.log('\n📋 需要部署的文件:');
    console.log('  - website/data/matches.json');
    console.log('  - website/sw.js');
  } else {
    console.log('\n✅ 所有回放链接已是最新，无需更新');
  }
}

main().catch(err => {
  console.error('执行失败:', err.message);
  process.exit(1);
});

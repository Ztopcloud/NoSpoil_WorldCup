/**
 * fetch-replay-links.js
 * 自动从央视世界杯 match 页面抓取全场回放链接，更新 matches.json
 * 
 * 原理：每个 match 页面 (worldcup.cctv.com/2026/match/{id}/index.shtml)
 * 的 HTML 中有 <li class="tab1"><a href="回放URL">回放</a></li>
 * 提取该链接并更新到对应比赛的 replayUrl 字段
 */

const fs = require('fs');
const path = require('path');
const { resolveReplayUrl } = require('./replay-resolver');

const DATA_FILE = path.join(__dirname, 'data', 'matches.json');
const SW_FILE = path.join(__dirname, 'sw.js');

function bumpSwVersion() {
  let content = fs.readFileSync(SW_FILE, 'utf8');
  const match = content.match(/const CACHE_VERSION = '(.+?)'/);
  if (!match) return;
  
  const current = match[1];
  // 提取版本号末尾数字并递增
  const num = parseInt(current.match(/\d+$/)[0]);
  const newVersion = current.replace(/\d+$/, String(num + 1));
  
  content = content.replace(`'${current}'`, `'${newVersion}'`);
  fs.writeFileSync(SW_FILE, content, 'utf8');
  console.log(`  SW 版本: ${current} → ${newVersion}`);
}

/**
 * 判断比赛是否已经开赛（北京时间的开球时间已过）
 * @param {string} dateStr - 格式 "MM/DD"
 * @param {string} timeStr - 格式 "HH:MM"
 */
function hasKickedOff(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const [month, day] = dateStr.split('/').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!month || !day || hour == null || minute == null) return false;

  const now = new Date();
  // 构建比赛北京时间的 Date 对象（北京 = UTC+8）
  const matchBeijing = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hour - 8, minute, 0));
  return matchBeijing <= now;
}

async function main() {
  console.log('=== 世界杯回放链接自动抓取 ===\n');

  const matches = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let updatedCount = 0;

  for (const match of matches) {
    // 只处理有 liveUrl 且是 CCTV match 页面的比赛
    if (!match.liveUrl || !match.liveUrl.includes('worldcup.cctv.com/2026/match/')) {
      continue;
    }

    // 如果已有 sports.cctv.com 的回放链接，跳过
    if (match.replayUrl && match.replayUrl.includes('sports.cctv.com')) {
      continue;
    }

    // 还没开赛的跳过
    if (!hasKickedOff(match.date, match.timeBeijing)) {
      continue;
    }

    const matchName = `${match.home} vs ${match.away}`;
    console.log(`检查: ${matchName} (${match.id}) [${match.date} ${match.timeBeijing}]`);
    console.log(`  liveUrl: ${match.liveUrl}`);

    const replayUrl = await resolveReplayUrl(
      {
        matchId: match.id,
        liveUrl: match.liveUrl,
        home: match.home,
        away: match.away
      },
      {
        logger: (message) => console.log(message)
      }
    );

    if (replayUrl && replayUrl !== match.replayUrl) {
      match.replayUrl = replayUrl;
      console.log(`  ✅ 已更新回放: ${replayUrl}`);
      updatedCount++;
    } else if (!replayUrl) {
      console.log(`  [${match.id}] 暂无可用全场回放`);
    }

    // 礼貌延迟
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (updatedCount > 0) {
    // 先备份
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(path.dirname(DATA_FILE), `matches.${stamp}.bak.json`);
    if (fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(DATA_FILE, backupFile);
      console.log(`\n备份文件: ${backupFile}`);
    }
    
    // 写入更新
    fs.writeFileSync(DATA_FILE, JSON.stringify(matches, null, 2) + '\n', 'utf8');
    console.log(`\n✅ 共更新 ${updatedCount} 场比赛的回放链接`);
    
    // 更新 SW 缓存版本，让所有用户强制刷新
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

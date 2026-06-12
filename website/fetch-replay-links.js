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

const DATA_FILE = path.join(__dirname, 'data', 'matches.json');
const SW_FILE = path.join(__dirname, 'sw.js');

async function fetchReplayUrl(liveUrl, matchId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(liveUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NoSpoilReplayBot/1.0',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.log(`  [${matchId}] HTTP ${response.status}, 跳过`);
      return null;
    }
    
    const html = await response.text();
    
    // 提取 class="tab1" 的 <a> 标签中的回放链接
    const replayMatch = html.match(/<li\s+class="tab1"[^>]*>\s*<a\s+href="(https:\/\/sports\.cctv\.com\/[^"]+)"[^>]*>/i);
    if (replayMatch && replayMatch[1]) {
      return replayMatch[1];
    }
    
    // 备选：提取所有 sports.cctv.com 视频链接，取第一个（通常是回放）
    const allVideoLinks = html.match(/https:\/\/sports\.cctv\.com\/\d{4}\/\d{2}\/\d{2}\/VIDE[a-zA-Z0-9]+\.shtml/gi);
    if (allVideoLinks && allVideoLinks.length > 0) {
      console.log(`  [${matchId}] 未找到 tab1 回放标签，使用备选提取: ${allVideoLinks[0]}`);
      return allVideoLinks[0];
    }
    
    console.log(`  [${matchId}] 未找到回放链接`);
    return null;
  } catch (err) {
    console.log(`  [${matchId}] 请求失败: ${err.message}`);
    return null;
  }
}

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
 * @param {number} lookbackHours - 只关注最近 N 小时内的比赛（0=不限）
 */
function hasKickedOff(dateStr, timeStr, lookbackHours) {
  if (!dateStr || !timeStr) return false;
  const [month, day] = dateStr.split('/').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!month || !day || hour == null || minute == null) return false;

  const now = new Date();
  // 构建比赛北京时间的 Date 对象（北京 = UTC+8）
  const matchBeijing = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hour - 8, minute, 0));

  if (lookbackHours > 0) {
    const cutoff = new Date(now.getTime() - lookbackHours * 3600 * 1000);
    return matchBeijing <= now && matchBeijing >= cutoff;
  }
  return matchBeijing <= now;
}

async function main() {
  console.log('=== 世界杯回放链接自动抓取 ===\n');

  const matches = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let skippedFuture = 0;
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

    // 还没开赛的跳过（只关注最近 48 小时内开赛但还没回放链接的）
    if (!hasKickedOff(match.date, match.timeBeijing, 48)) {
      skippedFuture++;
      continue;
    }

    const matchName = `${match.home} vs ${match.away}`;
    console.log(`检查: ${matchName} (${match.id}) [${match.date} ${match.timeBeijing}]`);
    console.log(`  liveUrl: ${match.liveUrl}`);

    const replayUrl = await fetchReplayUrl(match.liveUrl, match.id);

    if (replayUrl && replayUrl !== match.replayUrl) {
      match.replayUrl = replayUrl;
      console.log(`  ✅ 已更新回放: ${replayUrl}`);
      updatedCount++;
    }

    // 礼貌延迟
    await new Promise(r => setTimeout(r, 500));
  }

  if (skippedFuture > 0) {
    console.log(`\n⏭ 跳过 ${skippedFuture} 场未开赛的比赛`);
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

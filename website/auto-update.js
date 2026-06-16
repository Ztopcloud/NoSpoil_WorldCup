/**
 * auto-update.js - 世界杯赛程&回放全自动更新系统
 * 
 * 功能：
 * 1. 从央视 CBS 页面 (cbs.sports.cctv.com/index.html#3400) 抓取比赛直播链接
 * 2. 对比 matches.json，自动补充新比赛的 liveUrl
 * 3. 对已结束的比赛，扫描央视 match 页面获取回放链接
 * 4. 有更新时自动递增 SW 版本号
 * 5. 可选：通过 git 自动提交和推送变更
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { resolveReplayUrl } = require('./replay-resolver');
const { createAlertNotifier } = require('./alert-notifier');
const { resolveXhsCandidates } = require('./xhs-candidate-resolver');
const { resolveZhibo8Replay } = require('./zhibo8-resolver');

const DATA_FILE = path.join(__dirname, 'data', 'matches.json');
const SW_FILE = path.join(__dirname, 'sw.js');
const APP_FILE = path.join(__dirname, 'app.js');
const DEPLOY_TEMP_DIR = path.join(__dirname, '..', '.tmp', 'auto-update');
const ALERT_STATE_FILE = path.join(DEPLOY_TEMP_DIR, 'alert-state.json');
const SSH_KEY_WIN = path.join(os.homedir(), '.ssh', 'id_ed25519');
const SSH_KEY_WSL = '/home/bond/.ssh/id_ed25519';
const WSL_CMD = 'wsl -d Ubuntu';

// 自动加载 .env 文件
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  });
  console.log('✅ 已加载 .env 配置');
}

// ===== 配置 =====
const CBS_URL = 'https://cbs.sports.cctv.com/index.html#3400';
const REPLAY_SCAN_INTERVAL_MINUTES = 30; // 回放扫描间隔
const AUTO_GIT = process.env.AUTO_GIT === 'true';   // 是否自动 git 提交推送
const RSYNC_HOST = process.env.RSYNC_HOST || '';     // 服务器地址
const RSYNC_PATH = process.env.RSYNC_PATH || '';     // 服务器目标路径，如 /var/www/scgs/
const RSYNC_USER = process.env.RSYNC_USER || '';     // SSH 用户名 (可选)
const RSYNC_PORT = process.env.RSYNC_PORT || '22';   // SSH 端口 (可选)
const REPLAY_MATCH_DURATION_MINUTES = Number(process.env.REPLAY_MATCH_DURATION_MINUTES || 120);
const REPLAY_ALERT_DELAY_MINUTES = Number(process.env.REPLAY_ALERT_DELAY_MINUTES || 60);
let localRsyncChecked = false;

// ===== 工具函数 =====

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function toWslPath(winPath) {
  let result = winPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(result)) {
    result = '/mnt/' + result[0].toLowerCase() + result.slice(2);
  }
  return result;
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = filePath.replace(/\.json$/, `.${stamp}.bak.json`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function bumpSwVersion() {
  let content = fs.readFileSync(SW_FILE, 'utf8');
  const match = content.match(/const CACHE_VERSION = '(.+?)'/);
  if (!match) return false;

  const current = match[1];
  const numMatch = current.match(/\d+$/);
  if (!numMatch) return false;

  const num = parseInt(numMatch[0]);
  const newVersion = current.replace(/\d+$/, String(num + 1));

  content = content.replace(`'${current}'`, `'${newVersion}'`);
  fs.writeFileSync(SW_FILE, content, 'utf8');
  console.log(`  SW 版本: ${current} → ${newVersion}`);
  return true;
}

function bumpAppVersion() {
  let content = fs.readFileSync(APP_FILE, 'utf8');
  const verMatch = content.match(/var MATCHES_VERSION = '(.+?)'/);
  if (!verMatch) return false;

  const currentVer = verMatch[1];
  const parts = currentVer.split('-');
  const suffix = parseInt(parts.pop() || '0', 10);
  if (!Number.isFinite(suffix)) return false;

  const newVer = parts.join('-') + '-' + String(suffix + 1);
  content = content.replace(`'${currentVer}'`, `'${newVer}'`);
  fs.writeFileSync(APP_FILE, content, 'utf8');
  console.log(`  MATCHES_VERSION: ${currentVer} → ${newVer}`);
  return true;
}

async function tryFetchPlaywrightMatches() {
  try {
    require.resolve('playwright');
  } catch (err) {
    return null;
  }
  return await fetchCBSWithPlaywright();
}

// 提取 match ID (如 22920296)
function extractMatchId(url) {
  const m = String(url || '').match(/\/match\/(\d+)\//);
  return m ? m[1] : null;
}

function getMatchKickoffDate(match) {
  if (!match.date || !match.timeBeijing) return null;
  const [month, day] = match.date.split('/').map(Number);
  const [hour, minute] = match.timeBeijing.split(':').map(Number);
  if (!month || !day || hour == null || minute == null) return null;

  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hour - 8, minute, 0));
}

function getReplayAlertDeadline(match) {
  const kickoff = getMatchKickoffDate(match);
  if (!kickoff) return null;
  const minutes = REPLAY_MATCH_DURATION_MINUTES + REPLAY_ALERT_DELAY_MINUTES;
  return new Date(kickoff.getTime() + minutes * 60 * 1000);
}

function isOfficialReplayUrl(url) {
  const s = String(url || '');
  return /https:\/\/sports\.cctv\.com\/\d{4}\/\d{2}\/\d{2}\/VIDE/i.test(s) ||
         /https:\/\/(www\.)?xiaohongshu\.com\/explore\/[A-Za-z0-9]+/i.test(s);
}

function formatBeijingTime(date) {
  if (!date) return '未知';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  });
}

function formatCandidates(candidates) {
  if (!candidates.length) {
    return ['暂无本地小红书候选链接。'];
  }

  return candidates.slice(0, 5).map((candidate, index) => (
    `${index + 1}. score=${candidate.score} source=${candidate.source} ${candidate.url}`
  ));
}

function buildReplayMissingAlert(match, matches) {
  const kickoff = getMatchKickoffDate(match);
  const deadline = getReplayAlertDeadline(match);
  const xhs = resolveXhsCandidates(match, matches);

  return {
    subject: `[SCGS] 赛后仍未找到央视全场回放: ${match.home} vs ${match.away}`,
    summary: `${match.home} vs ${match.away} 已超过回放等待窗口，但 replayUrl 仍不是央视全场回放。`,
    sections: [
      {
        title: '比赛信息',
        lines: [
          `比赛: ${match.home} vs ${match.away}`,
          `开球: ${match.date || ''} ${match.timeBeijing || ''} 北京时间`,
          `计算开球: ${formatBeijingTime(kickoff)}`,
          `告警阈值: ${formatBeijingTime(deadline)}`
        ]
      },
      {
        title: '当前链接',
        lines: [
          `liveUrl: ${match.liveUrl || '(空)'}`,
          `replayUrl: ${match.replayUrl || '(空)'}`
        ]
      },
      {
        title: '小红书候选',
        lines: [
          ...formatCandidates(xhs.candidates),
          '',
          '建议搜索词:',
          ...xhs.searchKeywords.map((keyword) => `- ${keyword}`)
        ]
      },
      {
        title: '建议',
        lines: [
          '先人工打开央视单场页确认是否已经补出全场回放。',
          '如果央视仍无全场回放，可人工检查小红书候选，再从后台写入确认过的链接。'
        ]
      }
    ]
  };
}

function buildFailureAlert(subject, detail, extraLines = []) {
  return {
    subject: `[SCGS] ${subject}`,
    summary: detail || subject,
    sections: [
      {
        title: '错误摘要',
        lines: [detail || '(无错误详情)', ...extraLines]
      },
      {
        title: '建议',
        lines: [
          '检查本次 auto-update 日志。',
          '如果是部署失败，确认服务器路径、SSH 密钥、rsync/scp 可用性。'
        ]
      }
    ]
  };
}

// ===== 1. 从 CBS 页面抓取比赛列表 =====

async function fetchCBSMatchList() {
  console.log('[1] 从 CBS 页面抓取世界杯比赛列表...\n');

  // CBS 页面是 JS 渲染的，但数据可能内嵌在 HTML 中或通过 API 加载
  // 我们先尝试直接 fetch HTML，看是否有内嵌数据
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(CBS_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NoSpoilBot/1.0',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();

    // 提取所有 worldcup.cctv.com/2026/match/{ID}/ 链接
    const matchUrlPattern = /worldcup\.cctv\.com\/2026\/match\/(\d+)\/index\.shtml/gi;
    const matchIds = [...new Set(
      [...html.matchAll(matchUrlPattern)].map(m => m[1])
    )];

    if (matchIds.length > 0) {
      console.log(`  从 HTML 中提取到 ${matchIds.length} 个比赛 ID`);
      // 注意：仅从静态 HTML 可能只能拿到部分数据
    }

    // 尝试提取比分数据 (如 "墨西哥 2 南非 0")
    // CBS 页面可能将数据内嵌在 <script> 标签或 data 属性中
    const scriptData = html.match(/window\.__NUXT__\s*=\s*({[\s\S]*?});/);
    if (scriptData) {
      console.log('  发现 NUXT 数据');
      // 尝试解析
      try {
        const data = JSON.parse(scriptData[1]);
        console.log('  成功解析内嵌数据');
      } catch (e) {
        // 忽略解析错误
      }
    }

    return matchIds;

  } catch (err) {
    console.log(`  ⚠ CBS 页面抓取失败: ${err.message}`);
    console.log('  提示: CBS 是 JS 渲染页面，需要使用 Playwright');
    console.log('  请改用: node auto-update.js --playwright\n');
    return [];
  }
}

// ===== 1b. 使用 Playwright 抓取 CBS 页面 =====

async function fetchCBSWithPlaywright() {
  console.log('[1] 使用 Playwright 抓取 CBS 比赛列表...\n');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(CBS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    // 等待比赛数据渲染
    await page.waitForSelector('a[href*="worldcup.cctv.com/2026/match/"]', { timeout: 15000 });

    // 提取所有比赛链接和基本信息
    const matches = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="worldcup.cctv.com/2026/match/"]');
      return Array.from(links).map(link => {
        const text = (link.innerText || link.textContent || '').trim();
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
        const href = link.getAttribute('href');

        const time = lines.find(line => /^\d{2}:\d{2}$/.test(line)) || '';
        const meta = lines.find(line => /世界杯\s+[A-L]组\s+第\d+轮/.test(line)) || '';
        const statusIndex = lines.findIndex(line => /^(已结束|未开始|进行中|上半场|下半场|中场)$/.test(line));
        const status = statusIndex >= 0 ? lines[statusIndex] : '';
        const teamStart = statusIndex >= 0 && /^\d{1,3}:\d{2}$/.test(lines[statusIndex + 1] || '')
          ? statusIndex + 2
          : statusIndex + 1;
        const home = lines[teamStart] || '';
        const homeScoreText = lines[teamStart + 1] || '';
        const away = lines[teamStart + 2] || '';
        const awayScoreText = lines[teamStart + 3] || '';

        return {
          matchId: (href.match(/\/match\/(\d+)\//) || [])[1] || '',
          url: 'https:' + href,
          time,
          group: (meta.match(/([A-L])组/) || [])[1] || '',
          round: parseInt((meta.match(/第(\d+)轮/) || [])[1] || '1', 10),
          status,
          home,
          away,
          homeScore: /^\d+$/.test(homeScoreText) ? parseInt(homeScoreText, 10) : null,
          awayScore: /^\d+$/.test(awayScoreText) ? parseInt(awayScoreText, 10) : null,
          fullText: text
        };
      });
    });

    console.log(`  提取到 ${matches.length} 场比赛`);
    matches.forEach(m => {
      console.log(`    ${m.matchId} | ${m.time} | ${m.home} vs ${m.away} | ${m.status}`);
    });

    await browser.close();
    return matches;

  } catch (err) {
    console.log(`  ⚠ Playwright 抓取失败: ${err.message}`);
    try { await browser.close(); } catch (e) { /* ignore */ }
    return [];
  }
}

// ===== 2. 比赛是否已开赛 =====

function hasKickedOff(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const [month, day] = dateStr.split('/').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!month || !day || hour == null || minute == null) return false;

  const now = new Date();
  const matchTime = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, hour - 8, minute, 0));
  return matchTime <= now;
}

function rsyncUploadWebsiteFiles(files) {
  if (!files.length) return;
  ensureLocalRsyncAvailable();

  fs.mkdirSync(DEPLOY_TEMP_DIR, { recursive: true });
  const listFileWin = path.join(DEPLOY_TEMP_DIR, 'upload-list.txt');
  fs.writeFileSync(listFileWin, files.join('\n') + '\n', 'utf8');

  const wslListFile = toWslPath(listFileWin);
  const wslSourceDir = toWslPath(path.join(__dirname, '..'));
  const wslKeyFile = SSH_KEY_WSL;
  const userHost = RSYNC_USER ? `${RSYNC_USER}@${RSYNC_HOST}` : RSYNC_HOST;
  const sshCmd = `ssh -i ${wslKeyFile} -p ${RSYNC_PORT} -o StrictHostKeyChecking=no`;
  const cmd = `${WSL_CMD} rsync -avz --files-from="${wslListFile}" -e "${sshCmd}" "${wslSourceDir}/" "${userHost}:${RSYNC_PATH}/"`;

  console.log('\n[5] rsync 上传到服务器...');
  const output = execSync(cmd, { stdio: 'pipe', cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  output.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !/^(sending|sent|total|receiving)/i.test(trimmed)) {
      console.log(`  ${trimmed}`);
    }
  });
  console.log('  ✅ rsync 上传完成');
}

function ensureLocalRsyncAvailable() {
  if (localRsyncChecked) return;

  try {
    execSync(`${WSL_CMD} rsync --version`, { stdio: 'pipe' });
    localRsyncChecked = true;
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : err.message.trim();
    throw new Error(`LOCAL_RSYNC_UNAVAILABLE: 本机 WSL rsync 不可用。${detail}`);
  }
}

function scpUploadWebsiteFiles(files) {
  if (!files.length) return;

  const userHost = RSYNC_USER ? `${RSYNC_USER}@${RSYNC_HOST}` : RSYNC_HOST;
  console.log('\n[5] scp 上传到服务器...');

  files.forEach((file) => {
    const localPath = path.join(__dirname, '..', file);
    const relPath = file.replace(/^website\//, '');
    const remoteDir = path.posix.dirname(relPath);
    const remoteFull = remoteDir === '.' ? `${userHost}:${RSYNC_PATH}/` : `${userHost}:${RSYNC_PATH}/${remoteDir}/`;

    console.log(`  上传: ${file}`);
    const keyFlag = SSH_KEY_WIN && fs.existsSync(SSH_KEY_WIN) ? ` -i "${SSH_KEY_WIN}"` : '';
    execSync(`scp${keyFlag} -P ${RSYNC_PORT} -o StrictHostKeyChecking=no "${localPath}" "${remoteFull}"`, {
      stdio: 'pipe',
      cwd: path.join(__dirname, '..')
    });
  });

  console.log('  ✅ scp 上传完成');
}

function deployWebsiteFiles(files) {
  try {
    rsyncUploadWebsiteFiles(files);
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : err.message.trim();
    if (/^LOCAL_RSYNC_UNAVAILABLE:/.test(detail)) {
      console.log(`  ⚠ ${detail.replace(/^LOCAL_RSYNC_UNAVAILABLE:\s*/, '')}`);
      console.log('  ⚠ 自动回退到 scp 上传');
      scpUploadWebsiteFiles(files);
      return;
    }

    if (/rsync: not found/i.test(detail)) {
      console.log('  ⚠ 当前链路缺少 rsync，自动回退到 scp');
      console.log('  提示: 这是远端服务器缺少 rsync，可运行 node website/install-rsync-remote.js');
      scpUploadWebsiteFiles(files);
      return;
    }
    throw new Error(detail);
  }
}

async function safeNotify(notifier, key, message) {
  try {
    if (key) {
      await notifier.notifyOnce(key, message);
    } else {
      await notifier.notify(message);
    }
  } catch (err) {
    console.log(`  ⚠ 邮件通知失败: ${err.message}`);
  }
}

// ===== 主流程 =====

async function main() {
  const forcePlaywright = process.argv.includes('--playwright');
  const dryRun = process.argv.includes('--dry-run');
  let mode = 'fetch';
  let cbsFetchFailed = false;

  console.log(`=== 世界杯赛程&回放全自动更新 ===`);
  console.log(`时间: ${new Date().toISOString()}`);
  console.log(`模式: ${forcePlaywright ? 'playwright' : 'auto'}${dryRun ? ' (试运行)' : ''}\n`);

  const notifier = createAlertNotifier({
    stateFile: ALERT_STATE_FILE,
    dryRun,
    logger: (message) => console.log(message)
  });

  // 读取现有数据
  const matches = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let updatedCount = 0;
  const changedFiles = [];

  // ----- 步骤1: 抓取 CBS 比赛列表 -----
  let cbsMatches = [];
  if (forcePlaywright) {
    mode = 'playwright';
    cbsMatches = await fetchCBSWithPlaywright();
    if (cbsMatches.length === 0) cbsFetchFailed = true;
  } else {
    const ids = await fetchCBSMatchList();
    if (ids.length > 0) {
      mode = 'fetch';
      cbsMatches = ids.map(id => ({ matchId: id }));
    } else {
      cbsFetchFailed = true;
      const fallbackMatches = await tryFetchPlaywrightMatches();
      if (fallbackMatches) {
        mode = 'playwright';
        cbsMatches = fallbackMatches;
        cbsFetchFailed = false;
      } else {
        mode = 'fetch';
        cbsMatches = [];
      }
    }
  }

  if (cbsMatches.length === 0) {
    console.log(`\n⚠ 未抓到任何 CBS 比赛数据，建议检查网络、页面结构或手动执行 --playwright`);
  }

  // ----- 步骤2: 对比并补充缺失的 liveUrl -----
  if (cbsMatches.length > 0) {
    console.log('\n[2] 对比现有数据，补充缺失的 liveUrl...\n');

    const existingIds = new Set(matches.map(m =>
      extractMatchId(m.liveUrl) || (m.liveUrl ? m.id : '')
    ));

    for (const cbs of cbsMatches) {
      if (cbs.matchId && !existingIds.has(cbs.matchId)) {
        // 这是一个新比赛！尝试在我们的数据中找对应项
        // 按时间+对阵匹配
        let found = null;
        if (cbs.time && cbs.home && cbs.away) {
          found = matches.find(m => {
            const mTime = m.timeBeijing || '';
            return mTime === cbs.time &&
              m.home === cbs.home &&
              m.away === cbs.away;
          });
        }

        if (found) {
          // 更新已有比赛的 liveUrl
          const nextLiveUrl = `https://worldcup.cctv.com/2026/match/${cbs.matchId}/index.shtml`;
          if (found.liveUrl !== nextLiveUrl) {
            found.liveUrl = nextLiveUrl;
            updatedCount++;
          }
          if (!found.replayUrl || !found.replayUrl.includes('sports.cctv.com')) {
            found.replayUrl = found.liveUrl; // fallback
          }
          console.log(`  补全: ${found.home} vs ${found.away} → ${cbs.matchId}`);
        } else {
          console.log(`  发现新比赛 ID=${cbs.matchId}，但未在数据中匹配到 (需手动添加)`);
        }
      }
    }
  }

  // ----- 步骤3: 扫描已结束比赛的回放链接 -----
  console.log('\n[3] 扫描已结束比赛的回放链接...\n');

  for (const match of matches) {
    // 跳过已有 sports.cctv.com 回放链接的
    if (match.replayUrl && match.replayUrl.includes('sports.cctv.com')) continue;

    // 跳过没有 liveUrl 的
    if (!match.liveUrl || !match.liveUrl.includes('worldcup.cctv.com/2026/match/')) continue;

    // 跳过还没开赛的
    if (!hasKickedOff(match.date, match.timeBeijing)) continue;

    const matchName = `${match.home} vs ${match.away}`;
    console.log(`  检查: ${matchName} (${match.id}) [${match.date} ${match.timeBeijing}]`);

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
      console.log(`    ✅ 回放: ${replayUrl}`);
      updatedCount++;
    } else if (replayUrl) {
      console.log(`    ✅ 回放已存在，无需更新`);
    } else {
      // 央视暂无回放，如果也没小红书链接，尝试从直播吧抓取
      if (!isOfficialReplayUrl(match.replayUrl)) {
        console.log(`    ⏳ 暂无央视回放，尝试直播吧...`);
        const xhsUrl = await resolveZhibo8Replay(match);
        if (xhsUrl) {
          match.replayUrl = xhsUrl;
          console.log(`    🎯 直播吧→小红书: ${xhsUrl}`);
          updatedCount++;
        } else {
          console.log(`    ⏳ 暂无回放`);
        }
      } else {
        console.log(`    ⏳ 暂无央视回放（已有其他回放）`);
      }
    }

    await sleep(500);
  }

  // ----- 步骤3b: 赛后 1 小时仍无央视全场回放时发送告警 -----
  console.log('\n[3b] 检查回放缺失告警...\n');
  const now = new Date();
  for (const match of matches) {
    if (!match.liveUrl || !match.liveUrl.includes('worldcup.cctv.com/2026/match/')) continue;
    if (isOfficialReplayUrl(match.replayUrl)) continue;

    const deadline = getReplayAlertDeadline(match);
    if (!deadline || now < deadline) continue;

    const alertKey = `replay-missing:${match.id}:${extractMatchId(match.liveUrl) || match.liveUrl}`;
    console.log(`  告警候选: ${match.home} vs ${match.away} (${match.id})`);
    await safeNotify(notifier, alertKey, buildReplayMissingAlert(match, matches));
  }

  // ----- 步骤4: 保存并更新版本 -----
  if (updatedCount > 0 && !dryRun) {
    console.log(`\n[4] 保存更新 (${updatedCount} 处更改)...`);

    backupFile(DATA_FILE);
    fs.writeFileSync(DATA_FILE, JSON.stringify(matches, null, 2) + '\n', 'utf8');
    changedFiles.push('website/data/matches.json');

    if (bumpSwVersion()) {
      changedFiles.push('website/sw.js');
    }

    // 同步更新 app.js 中的数据版本号
    if (bumpAppVersion()) {
      changedFiles.push('website/app.js');
    }

    console.log(`\n✅ 更新完成！`);
    console.log(`📋 变更文件: ${changedFiles.join(', ')}`);

    // ----- 步骤5: 自动部署 -----
    const deployMethod = RSYNC_HOST ? 'rsync' : (AUTO_GIT ? 'git' : '');

    if (deployMethod === 'rsync') {
      const files = ['website/data/matches.json', 'website/sw.js'];

      // 检查是否有 app.js 变更
      if (changedFiles.includes('website/app.js')) {
        files.push('website/app.js');
      }

      try {
        deployWebsiteFiles(files);
      } catch (err) {
        const detail = err.stderr ? err.stderr.toString().trim() : err.message.trim();
        console.log(`  ⚠ rsync 失败: ${detail}`);
        await safeNotify(
          notifier,
          `deploy-failed:${new Date().toISOString().slice(0, 13)}`,
          buildFailureAlert('部署同步失败', detail, [`文件: ${files.join(', ')}`])
        );
      }
    } else if (deployMethod === 'git') {
      console.log('\n[5] 自动 git 提交...');
      try {
        execSync('git add website/data/matches.json website/sw.js website/app.js', { cwd: __dirname + '/..' });
        const commitMsg = `auto: update replay links & data [${new Date().toISOString().slice(0, 16)}]`;
        execSync(`git commit -m "${commitMsg}"`, { cwd: __dirname + '/..' });
        execSync('git push', { cwd: __dirname + '/..' });
        console.log('  ✅ Git 提交 & 推送完成');
      } catch (err) {
        console.log(`  ⚠ Git 操作失败: ${err.message}`);
        await safeNotify(
          notifier,
          `git-failed:${new Date().toISOString().slice(0, 13)}`,
          buildFailureAlert('自动 Git 提交或推送失败', err.message)
        );
      }
    }
  } else if (updatedCount > 0 && dryRun) {
    console.log(`\n🔍 [试运行] 发现 ${updatedCount} 处待更新 (未实际写入)`);
  } else if (cbsFetchFailed) {
    console.log('\n⚠ 本次未检测到数据更新，但 CBS 抓取失败，不能确认数据一定是最新');
    await safeNotify(
      notifier,
      `cbs-fetch-failed:${new Date().toISOString().slice(0, 10)}`,
      buildFailureAlert('CBS 比赛数据抓取失败', '本次未抓到 CBS 比赛数据，不能确认直播链接和回放数据一定是最新。')
    );
  } else {
    console.log('\n✅ 无需更新，所有数据已是最新');
  }
}

main().catch(err => {
  console.error('执行失败:', err.message);
  process.exit(1);
});

/**
 * zhibo8-resolver.js - 从直播吧 (zhibo8.com) 抓取小红书回放链接
 *
 * 流程：
 *   1. 解析 https://www.zhibo8.com/zuqiu/luxiang.htm 获取所有录像条目
 *   2. 按日期+队名匹配比赛
 *   3. 抓取对应比赛页面，提取小红书回放链接
 */

const XHS_URL_RE = /https?:\/\/(?:www\.)?xiaohongshu\.com\/explore\/[A-Za-z0-9]+[^\s"'<>]*/gi;

// ---- 缓存 ----
let indexCache = null;         // { matchKey → zhibo8Url }
let indexCacheTime = 0;
const INDEX_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// ---- 网络请求 ----
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? require('https') : require('http');
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(new URL(res.headers.location, url).href).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ---- 队名标准化 ----
// 直播吧常用简称 vs 央视/我们使用的全名
const TEAM_ALIASES = {
  '沙特阿拉伯': '沙特',
  '大韩民国': '韩国',
  '刚果民主共和国': '刚果',
  '英格兰': '英格兰',  // 同名
};

function normalizeTeam(name) {
  let result = String(name || '')
    .replace(/\s+/g, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]+/gu, '') // 去掉国旗 emoji
    .replace(/^[|•·・･]+/, '')                 // 去掉行首装饰符 (直播吧列表常见)
    .toLowerCase();

  // 队名别名：双向映射，使 matches.json 的全名能匹配直播吧简称
  for (const [full, short] of Object.entries(TEAM_ALIASES)) {
    const f = full.toLowerCase();
    const s = short.toLowerCase();
    if (result === f) result = s;
    if (result === s) result = s; // 保持简称
  }

  return result;
}

function buildMatchKey(dateStr, home, away) {
  // dateStr 如 "06/16"，转成 "0616"
  const datePart = String(dateStr).replace(/\//g, '');
  const h = normalizeTeam(home);
  const a = normalizeTeam(away);
  return `${datePart}:${h}:${a}`;
}

// ---- 步骤1: 解析录像列表页，构建索引 ----
// HTML 结构示例:
// <div class="box"><div class="titlebar"><h2>6月16日 星期二</h2></div>
// <div class="content">&nbsp;&nbsp;<span><b>伊朗vs新西兰 <a href="/zuqiu/2026/0616-match1869172v-luxiang.htm" target="_blank">全场录像</a></b> | ...
function parseIndexPage(html) {
  const map = {}; // matchKey → { zhibo8Url, home, away }

  // 按 "box" 块分割，每个块对应一天的录像
  const boxes = html.split(/<div class="box">/g);
  boxes.shift(); // 去掉第一个空段

  for (const box of boxes) {
    // 提取日期：<h2>6月16日 星期二</h2>
    const dateH2 = box.match(/<h2>(\d+)月(\d+)日/);
    if (!dateH2) continue;
    const month = String(parseInt(dateH2[1])).padStart(2, '0');
    const day = String(parseInt(dateH2[2])).padStart(2, '0');
    const datePart = month + day; // "0616"

    // 匹配: 队名文本 后紧跟 <a href="...luxiang.htm">
    // 如: 伊朗vs新西兰 <a href="/zuqiu/2026/0616-match1869172v-luxiang.htm"
    const entryRe = /([^<>]+?vs[^<>]+?)\s*<a\s[^>]*href="(\/zuqiu\/\d{4}\/\d{4}-match\d+v-luxiang\.htm)"/gi;
    let m;
    while ((m = entryRe.exec(box)) !== null) {
      const teamText = m[1].trim();
      const href = m[2];

      // 清理队名文本（去掉 <b> </b> 残留）
      const cleanText = teamText.replace(/<\/?[^>]+>/g, '').trim();

      const vsMatch = cleanText.match(/^(.+?)\s*vs\s*(.+)$/i);
      if (!vsMatch) continue;

      const homeRaw = vsMatch[1].trim();
      const awayRaw = vsMatch[2].trim();
      const home = normalizeTeam(homeRaw);
      const away = normalizeTeam(awayRaw);

      // 双向索引
      const key1 = `${datePart}:${home}:${away}`;
      const key2 = `${datePart}:${away}:${home}`;

      const entry = {
        zhibo8Url: `https://www.zhibo8.com${href}`,
        home,
        away
      };

      map[key1] = entry;
      map[key2] = entry;
    }
  }

  return map;
}

async function fetchIndex() {
  if (indexCache && Date.now() - indexCacheTime < INDEX_CACHE_TTL) {
    return indexCache;
  }

  const html = await httpGet('https://www.zhibo8.com/zuqiu/luxiang.htm');
  indexCache = parseIndexPage(html);
  indexCacheTime = Date.now();

  console.log(`[zhibo8] 录像列表已刷新，共 ${Object.keys(indexCache).length / 2} 场比赛`);
  return indexCache;
}

// ---- 步骤2: 从比赛页面提取小红书链接 ----
// 小红书需要 xsec_token 参数才能从外部站点直接访问（防盗链）
// 去掉不需要的垃圾参数，保留 xsec_token 和 xsec_source
function extractXhsUrls(html) {
  const urls = [];
  const re = new RegExp(XHS_URL_RE.source, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[0];
    // 清理：去掉 app_platform, ignoreEngage, app_version, share_*, apptime, appuid, xhsshare 等非必要参数
    const clean = raw
      .replace(/[?&]app_platform=[^&]*/g, '')
      .replace(/[?&]ignoreEngage=[^&]*/g, '')
      .replace(/[?&]app_version=[^&]*/g, '')
      .replace(/[?&]share_from_user_hidden=[^&]*/g, '')
      .replace(/[?&]shareRedId=[^&]*/g, '')
      .replace(/[?&]apptime=[^&]*/g, '')
      .replace(/[?&]appuid=[^&]*/g, '')
      .replace(/[?&]xhsshare=[^&]*/g, '')
      .replace(/[?&]share_id=[^&]*/g, '')
      .replace(/[?&]share_channel=[^&]*/g, '')
      .replace(/[?&]author_share=[^&]*/g, '')
      .replace(/[?&]container_type=[^&]*/g, '')
      .replace(/[?&]type=[^&]*/g, '')
      .replace(/(explore\/[A-Za-z0-9]+)&/, '$1?') // 修复被吞掉的 ?
      .replace(/xsec_source=app_share/g, 'xsec_source=pc_user') // app_share 在PC上会要求登录
      .replace(/[?&]$/, '')     // 去掉末尾残留
      .replace(/\?$/, '');
    if (!urls.includes(clean)) {
      urls.push(clean);
    }
  }
  return urls;
}

// ---- 步骤3: 为比赛解析 zhibo8 回放链接 ----
async function resolveZhibo8Replay(match) {
  try {
    const index = await fetchIndex();
    const key = buildMatchKey(match.date, match.home, match.away);
    const entry = index[key];

    if (!entry) {
      console.log(`[zhibo8] 未找到 ${match.home} vs ${match.away} 的直播吧页面`);
      return null;
    }

    console.log(`[zhibo8] 找到页面: ${entry.zhibo8Url}`);

    const html = await httpGet(entry.zhibo8Url);
    const xhsUrls = extractXhsUrls(html);

    if (xhsUrls.length === 0) {
      console.log(`[zhibo8] 该页面暂无小红书回放链接`);
      return null;
    }

    console.log(`[zhibo8] 提取到 ${xhsUrls.length} 个小红书链接: ${xhsUrls.join(', ')}`);
    return xhsUrls[0]; // 返回第一个（通常就是全场回放）
  } catch (err) {
    console.error(`[zhibo8] 解析 ${match.home} vs ${match.away} 失败:`, err.message);
    return null;
  }
}

// ---- 供批量调用 ----
async function resolveAll(matches) {
  const results = {};
  for (const match of matches) {
    const url = await resolveZhibo8Replay(match);
    if (url) {
      results[match.id] = url;
    }
  }
  return results;
}

module.exports = { resolveZhibo8Replay, resolveAll, fetchIndex, buildMatchKey };

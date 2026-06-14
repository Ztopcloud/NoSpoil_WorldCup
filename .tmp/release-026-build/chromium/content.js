// 时差观赛助手 - content script
// MVP 目标：隐藏可能剧透的文字区域，保留视频播放区域。

(function () {
  if (window.__nospoilWorldcupContentLoaded) return;
  window.__nospoilWorldcupContentLoaded = true;

  const STORAGE_KEY = 'nospoil_enabled';
  const DURATION_STORAGE_KEY = 'nospoil_hide_duration';
  const DURATION_HIDE_CLASS = 'nospoil-hide-duration';
  const DURATION_STYLE_ID = 'nospoil-hide-duration-style';
  const DEFAULT_SKIP_SECONDS = 0;
  const NOTICE_ID = 'nospoil-worldcup-notice';
  const PLAYER_ROOT_CLASS = 'nospoil-player-root';
  const OUTSIDE_PLAYER_CLASS = 'nospoil-outside-player';
  const CCTV_MATCH_CLASS = 'nospoil-cctv-match-page';
  const THEATER_CLASS = 'nospoil-theater-mode';
  const PREPAINT_SHIELD_CLASS = 'nospoil-prepaint-shield';
  const PREPAINT_READY_CLASS = 'nospoil-prepaint-ready';
  const PREPAINT_STYLE_ID = 'nospoil-prepaint-style';
  const RERUN_DELAYS_MS = [80, 250, 600, 1200, 2200, 4000, 7000, 11000];
  const processedVideos = new WeakSet();
  const fullscreenVideos = new WeakSet();
  let prepaintShieldEnabled = false;
  let pendingFullscreenVideo = null;
  let userGestureFullscreenArmed = false;
  let pluginEnabled = true;
  let hideDurationEnabled = true;

  async function isPluginEnabled() {
    try {
      const result = await (chrome.storage && chrome.storage.local ? chrome.storage.local.get(STORAGE_KEY) : Promise.resolve({}));
      return result[STORAGE_KEY] !== false;
    } catch {
      return true;
    }
  }

  function restoreNormalPage() {
    document.querySelectorAll('.nospoil-hidden').forEach((el) => el.classList.remove('nospoil-hidden'));
    document.querySelectorAll(`.${OUTSIDE_PLAYER_CLASS}`).forEach((el) => el.classList.remove(OUTSIDE_PLAYER_CLASS));
    document.querySelectorAll(`.${PLAYER_ROOT_CLASS}`).forEach((el) => el.classList.remove(PLAYER_ROOT_CLASS));

    if (document.body) {
      document.body.classList.remove('nospoil-clean-screen');
    }

    if (document.documentElement) {
      document.documentElement.classList.remove(CCTV_MATCH_CLASS);
      document.documentElement.classList.remove(THEATER_CLASS);
      document.documentElement.classList.remove(PREPAINT_SHIELD_CLASS);
      document.documentElement.classList.remove(PREPAINT_READY_CLASS);
      document.documentElement.classList.remove(DURATION_HIDE_CLASS);
    }

    const prepaintStyle = document.getElementById(PREPAINT_STYLE_ID);
    if (prepaintStyle) prepaintStyle.remove();
    prepaintShieldEnabled = false;
    pendingFullscreenVideo = null;

    applyHideDuration(false);

    if (document.originalTitle) {
      document.title = document.originalTitle;
    }

    const notice = document.getElementById(NOTICE_ID);
    if (notice) notice.remove();
  }

  function handleToggle(enabled) {
    pluginEnabled = enabled;
    if (!enabled) {
      restoreNormalPage();
    } else {
      // 恢复时长隐藏状态
      chrome.storage && chrome.storage.local && chrome.storage.local.get(DURATION_STORAGE_KEY).then((result) => {
        applyHideDuration(result[DURATION_STORAGE_KEY] !== false);
      }).catch(() => {});
      run();
    }
  }

  function handleDurationToggle(enabled) {
    hideDurationEnabled = enabled;
    if (pluginEnabled) {
      applyHideDuration(enabled);
    }
  }

  // 监听来自 popup 的切换消息
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'nospoil_toggle') {
        handleToggle(msg.enabled);
      }
      if (msg && msg.type === 'nospoil_duration_toggle') {
        handleDurationToggle(msg.enabled);
      }
    });
  }

  const SCGS_HOST_RE = /(^|\.)scgs\.tv$/i;
  const SUPPORTED_REPLAY_HOST_RE = /(^|\.)(cctv\.com|cntv\.cn|yangshipin\.cn|xiaohongshu\.com)$/i;

  function isScgsSite() {
    return SCGS_HOST_RE.test(window.location.hostname);
  }

  function isSupportedReplayUrl(url) {
    try {
      return SUPPORTED_REPLAY_HOST_RE.test(new URL(url, window.location.href).hostname);
    } catch (error) {
      return false;
    }
  }

  function keepReplayLinksInApp() {
    if (!isScgsSite() || !document.documentElement) return;

    document.addEventListener('click', (event) => {
      const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!link || !isSupportedReplayUrl(link.href)) return;

      event.preventDefault();
      event.stopPropagation();
      window.location.href = link.href;
    }, true);

    const normalizeLinks = () => {
      document.querySelectorAll('a[href]').forEach((link) => {
        if (!isSupportedReplayUrl(link.href)) return;
        link.removeAttribute('target');
        link.removeAttribute('rel');
      });
    };

    normalizeLinks();
    new MutationObserver(normalizeLinks).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'target', 'rel']
    });
  }

  const PLAYER_SAFE_SELECTORS = [
    'video',
    'iframe',
    'object',
    'embed',
    '.video',
    '.player',
    '.video-player',
    '.player-box',
    '.player-container',
    '.live-player',
    '.cctv-player',
    '#myflash',
    '#player',
    '#video',
    '[class*="flash"]',
    '[class*="player"]',
    '[id*="flash"]',
    '[id*="player"]'
  ];

  const SPOILER_SELECTORS = [
    'h1',
    '[class*="title"]',
    '[class*="headline"]',
    '[class*="summary"]',
    '[class*="desc"]',
    '[class*="comment"]',
    '[class*="recommend"]',
    '[class*="related"]',
    '[class*="sidebar"]',
    '[class*="rank"]',
    '[class*="news"]',
    '[class*="breadcrumb"]',
    '[id*="comment"]',
    '[id*="recommend"]',
    '[id*="related"]',
    '[id*="sidebar"]',
    '[id*="rank"]',
    '[id*="news"]',
    'aside'
  ];

  const CCTV_TEXT_MARKERS = [
    '播放列表',
    '本期内容',
    '往期节目',
    '热播榜',
    '看点',
    '主持人',
    '片库',
    '频道大全',
    '栏目大全'
  ];

  const TITLE_LIKE_TEXT = /\[[^\]]+\]\d{6,}/;
  const PLAYER_CONTROL_TEXT = [
    '暂停',
    '播放',
    '当前时间',
    '时长',
    '画质',
    '静音',
    '全屏',
    '进度条',
    '画中画'
  ];
  const PLAYER_REJECT_TEXT = [
    '分析',
    '数据',
    '阵容',
    '战报',
    '竞猜',
    '助威',
    '评论',
    '赛程',
    '积分榜',
    '查看全部'
  ];
  const PLAYER_CONTROL_ATTR_RE = /暂停|播放|静音|音量|全屏|退出全屏|进度条|拖动|快进|后退|当前时间|时长|seek|progress|timeline|scrub|slider|fullscreen|mute|volume|pause|play/i;

  function shouldUsePrepaintShield() {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();

    if (hostname === 'worldcup.cctv.com' && /\/2026\/match\/\d+\/index\.shtml$/.test(pathname)) return true;
    if (hostname === 'sports.cctv.com') return true;
    return false;
  }

  function installPrepaintShield() {
    if (!shouldUsePrepaintShield() || !document.documentElement) return;

    prepaintShieldEnabled = true;
    document.documentElement.classList.add(PREPAINT_SHIELD_CLASS);

    if (document.getElementById(PREPAINT_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = PREPAINT_STYLE_ID;
    style.textContent = `
html.${PREPAINT_SHIELD_CLASS}:not(.${PREPAINT_READY_CLASS}) {
  background: #000000 !important;
}
html.${PREPAINT_SHIELD_CLASS}:not(.${PREPAINT_READY_CLASS}) body {
  visibility: hidden !important;
  background: #000000 !important;
}
html.${PREPAINT_SHIELD_CLASS}:not(.${PREPAINT_READY_CLASS})::before {
  content: "时差观赛模式正在净屏...";
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483646 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #000000 !important;
  color: #ffffff !important;
  font: 600 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  letter-spacing: 0 !important;
  text-align: center !important;
}`;
    document.documentElement.appendChild(style);
  }

  function applyKnownPageMode() {
    if (!document.documentElement) return;

    if (isWorldcupMatchPage()) {
      document.documentElement.classList.add(CCTV_MATCH_CLASS);
      document.documentElement.classList.add(THEATER_CLASS);
      releasePrepaintShield();
      if (document.body) {
        document.body.classList.add('nospoil-clean-screen');
      }
    } else {
      document.documentElement.classList.remove(CCTV_MATCH_CLASS);
    }
  }

  function releasePrepaintShield() {
    if (!prepaintShieldEnabled || !document.documentElement) return;
    document.documentElement.classList.add(PREPAINT_READY_CLASS);
  }

  function installDurationHideStyle() {
    if (document.getElementById(DURATION_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = DURATION_STYLE_ID;
    style.textContent = `
html.${DURATION_HIDE_CLASS} .duration-display,
html.${DURATION_HIDE_CLASS} .total-time,
html.${DURATION_HIDE_CLASS} [class*="total-duration"],
html.${DURATION_HIDE_CLASS} [class*="duration-text"],
html.${DURATION_HIDE_CLASS} .vjs-duration,
html.${DURATION_HIDE_CLASS} .vjs-remaining-time,
html.${DURATION_HIDE_CLASS} .video-duration,
html.${DURATION_HIDE_CLASS} [data-e2e="video-duration"],
html.${DURATION_HIDE_CLASS} .player-time-total,
html.${DURATION_HIDE_CLASS} .xgplayer-time-total,
html.${DURATION_HIDE_CLASS} .xgplayer-time-duration,
html.${DURATION_HIDE_CLASS} [class*="-total-time"],
html.${DURATION_HIDE_CLASS} .txp_time_duration,
html.${DURATION_HIDE_CLASS} .time-display span:last-child:not(:only-child),
html.${DURATION_HIDE_CLASS} [aria-label*="总时长"],
html.${DURATION_HIDE_CLASS} .vjs-time-control.vjs-duration-divider {
  display: none !important;
  visibility: hidden !important;
}`;
    document.documentElement.appendChild(style);
  }

  function applyHideDuration(enabled) {
    hideDurationEnabled = enabled;
    if (enabled && document.documentElement) {
      installDurationHideStyle();
      document.documentElement.classList.add(DURATION_HIDE_CLASS);
    } else if (document.documentElement) {
      document.documentElement.classList.remove(DURATION_HIDE_CLASS);
    }
  }

  function createNotice() {
    if (document.getElementById(NOTICE_ID)) return;

    const notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.textContent = '时差观赛模式已开启：已净屏，可从开头观看';
    document.documentElement.appendChild(notice);
    window.setTimeout(() => {
      notice.classList.add('nospoil-notice-fade');
    }, 3200);
  }

  function isInsidePlayer(el) {
    return PLAYER_SAFE_SELECTORS.some((selector) => el.closest(selector));
  }

  function isCctvPage() {
    return /(^|\.)cctv\.com$/i.test(window.location.hostname);
  }

  function isWorldcupMatchPage() {
    return window.location.hostname.toLowerCase() === 'worldcup.cctv.com' &&
      /\/2026\/match\/\d+\/index\.shtml$/i.test(window.location.pathname);
  }

  function isXiaohongshuPage() {
    return /(^|\.)xiaohongshu\.com$/i.test(window.location.hostname);
  }

  function hideElement(el) {
    if (!el || el.id === NOTICE_ID || isInsidePlayer(el)) return;
    el.classList.add('nospoil-hidden');
  }

  function getLargestVisibleVideo() {
    return Array.from(document.querySelectorAll('video'))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const area = rect.width * rect.height;
        return area > 57600 && rect.width > 120 && rect.height > 120;
      })
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0];
  }

  function elementText(el) {
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  }

  function candidatePlayerScore(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 320 || rect.height <= 180) return 0;

    const attrs = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('role'),
      el.id,
      typeof el.className === 'string' ? el.className : ''
    ].join(' ');
    const text = elementText(el).slice(0, 420);
    const haystack = `${attrs} ${text}`.toLowerCase();
    const hasPlayerLabel = /视频播放器|播放器|video\s*player|(^|\s|[-_])player($|\s|[-_])|video/.test(haystack);
    const hasControls = PLAYER_CONTROL_TEXT.filter((marker) => text.includes(marker)).length >= 2;
    const hasRejectedText = PLAYER_REJECT_TEXT.some((marker) => text.includes(marker));

    let score = 0;
    if (el.matches('video')) score += 100;
    if (/视频播放器|video\s*player/i.test(attrs)) score += 90;
    if (/(^|\s|[-_])(cctv-)?(video-)?player($|\s|[-_])|cctvplayer/i.test(attrs)) score += 60;
    if (hasControls) score += 55;
    if (hasPlayerLabel) score += 25;
    if (el.matches('iframe') && !/视频播放器|video\s*player|player/i.test(attrs)) score -= 120;
    if (hasRejectedText && !hasControls) score -= 120;

    return score;
  }

  function getPlayerFallbackRoot() {
    return Array.from(document.querySelectorAll([
      '[aria-label*="视频播放器"]',
      '[title*="视频播放器"]',
      '[role="region"]',
      '[role="application"]',
      '[class*="player"]',
      '[id*="player"]',
      '[class*="video"]',
      '[id*="video"]',
      'iframe[title*="player" i]',
      'iframe[title*="视频播放器"]'
    ].join(',')))
      .map((el) => ({ el, rect: el.getBoundingClientRect(), score: candidatePlayerScore(el) }))
      .filter(({ score }) => score >= 70)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height);
      })[0]?.el || null;
  }

  function getCctvMatchPlayerRoot() {
    if (!isWorldcupMatchPage()) return null;

    const rootSelectors = [
      '#myflash',
      '.shijiebei20989_er_ind01 .bottomBox .leftBox',
      '.shijiebei20989_er_ind01 .bottomBox .con01',
      '.shijiebei20989_er_ind01'
    ];

    return rootSelectors
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 320 && rect.height > 180)
      .sort((a, b) => {
        const aPreferred = a.el.id === 'myflash' || a.el.classList.contains('leftBox') ? 1 : 0;
        const bPreferred = b.el.id === 'myflash' || b.el.classList.contains('leftBox') ? 1 : 0;
        if (bPreferred !== aPreferred) return bPreferred - aPreferred;
        return (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height);
      })[0]?.el || null;
  }

  function getPlayerRoot() {
    const cctvMatchRoot = getCctvMatchPlayerRoot();
    if (cctvMatchRoot) return cctvMatchRoot;

    const video = getLargestVisibleVideo();

    if (!video) {
      return getPlayerFallbackRoot();
    }

    let best = video.el;
    let bestArea = video.rect.width * video.rect.height;
    let current = video.el.parentElement;

    while (current && current !== document.body && current !== document.documentElement) {
      const rect = current.getBoundingClientRect();
      const area = rect.width * rect.height;
      const wrapsVideo = rect.width >= video.rect.width * 0.94 && rect.height >= video.rect.height * 0.94;
      const closeToVideo = rect.left <= video.rect.left + 24 && rect.top <= video.rect.top + 80;
      const avoidsRightRail = rect.right <= video.rect.right + 120;
      const avoidsTextBelow = rect.bottom <= video.rect.bottom + 120;

      if (wrapsVideo && closeToVideo && avoidsRightRail && avoidsTextBelow && area >= bestArea) {
        best = current;
        bestArea = area;
      }

      current = current.parentElement;
    }

    return best;
  }

  function getPlayerRect() {
    const playerRoot = getPlayerRoot();
    if (playerRoot) return playerRoot.getBoundingClientRect();

    const fallbackRoot = getPlayerFallbackRoot();
    if (fallbackRoot) return fallbackRoot.getBoundingClientRect();

    const candidates = Array.from(document.querySelectorAll('video'))
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width * rect.height > 57600 && rect.width > 120 && rect.height > 120);

    return candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  }

  function isLikelyPlayerControl(el, playerRect) {
    if (!el || !playerRect) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 2 || rect.height <= 2) return false;

    const attrs = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('role'),
      el.id,
      typeof el.className === 'string' ? el.className : ''
    ].join(' ');
    const text = elementText(el).slice(0, 120);
    const tagName = (el.tagName || '').toLowerCase();
    const interactive = tagName === 'button' || tagName === 'input' || tagName === 'progress' || tagName === 'video';
    const role = safeLower(el.getAttribute('role'));
    const isSliderLike = role === 'slider' || role === 'progressbar';
    const looksLikeControl = PLAYER_CONTROL_ATTR_RE.test(`${attrs} ${text}`) ||
      PLAYER_CONTROL_TEXT.some((marker) => text.includes(marker));
    const nearPlayerHorizontally = rect.right >= playerRect.left - 40 && rect.left <= playerRect.right + 40;
    const nearPlayerBottom = rect.top <= playerRect.bottom + 140 && rect.bottom >= playerRect.bottom - 60;
    const insidePlayerBand = rect.top >= playerRect.top - 40 && rect.bottom <= playerRect.bottom + 140;

    return (interactive || isSliderLike || looksLikeControl) &&
      nearPlayerHorizontally &&
      nearPlayerBottom &&
      insidePlayerBand;
  }

  function safeLower(value) {
    return value == null ? '' : String(value).toLowerCase();
  }

  function isWithinPlayerRoot(el, playerRoot) {
    return el === playerRoot || playerRoot.contains(el);
  }

  function hideOutsidePlayer(playerRoot) {
    if (!playerRoot) return;
    const playerRect = playerRoot.getBoundingClientRect();

    document.body.classList.add('nospoil-clean-screen');
    document.documentElement.classList.add(THEATER_CLASS);
    document.querySelectorAll(`.${PLAYER_ROOT_CLASS}`).forEach((el) => {
      if (el !== playerRoot) el.classList.remove(PLAYER_ROOT_CLASS);
    });
    playerRoot.classList.add(PLAYER_ROOT_CLASS);

    document.querySelectorAll(`.${OUTSIDE_PLAYER_CLASS}`).forEach((el) => {
      if (isWithinPlayerRoot(el, playerRoot) || el.contains(playerRoot)) {
        el.classList.remove(OUTSIDE_PLAYER_CLASS);
      }
    });

    document.body.querySelectorAll('*').forEach((el) => {
      if (el.id === NOTICE_ID || isWithinPlayerRoot(el, playerRoot) || el.contains(playerRoot)) return;
      if (isLikelyPlayerControl(el, playerRect)) return;

      const rect = el.getBoundingClientRect();
      const hasVisibleBox = rect.width > 2 && rect.height > 2;
      const hasVisibleText = Boolean((el.innerText || '').trim());
      const isMedia = el.matches('img, picture, svg, canvas, iframe');

      if (hasVisibleBox && (hasVisibleText || isMedia || rect.width > 120 || rect.height > 48)) {
        el.classList.add(OUTSIDE_PLAYER_CLASS);
      }
    });
  }

  function hideCctvLayoutAroundVideo() {
    const video = Array.from(document.querySelectorAll('video'))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width * rect.height > 57600 && rect.width > 120 && rect.height > 120)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0];

    if (!video) return;

    document.body.querySelectorAll('*').forEach((el) => {
      if (el.id === NOTICE_ID || el === video.el || video.el.contains(el) || el.contains(video.el)) return;
      if (isLikelyPlayerControl(el, video.rect)) return;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return;

      const rightRail = rect.left >= video.rect.right - 24;
      const belowVideo = rect.top >= video.rect.bottom - 12;
      const aboveVideo = rect.bottom <= video.rect.top + 8;
      const textOrMedia = Boolean((el.innerText || '').trim()) || el.matches('img, picture, svg, canvas, iframe');

      if (textOrMedia && (rightRail || belowVideo || aboveVideo)) {
        el.classList.add(OUTSIDE_PLAYER_CLASS);
      }
    });
  }

  function hideCctvSideContent() {
    if (!isCctvPage()) return;

    const playerRoot = getPlayerRoot();
    hideOutsidePlayer(playerRoot);
    if (playerRoot) releasePrepaintShield();
    hideCctvLayoutAroundVideo();

    const playerRect = getPlayerRect();
    if (playerRect) {
      document.querySelectorAll('body *').forEach((el) => {
        if (el.id === NOTICE_ID || (playerRoot && isWithinPlayerRoot(el, playerRoot)) || isInsidePlayer(el)) return;
        if (isLikelyPlayerControl(el, playerRect)) return;

        const rect = el.getBoundingClientRect();
        const sitsRightOfPlayer = rect.left >= playerRect.right - 32 && rect.width > 40 && rect.height > 12;
        const sitsBelowPlayer = rect.top >= playerRect.bottom - 24 && rect.width > 40 && rect.height > 12;
        const sitsAbovePlayer = rect.bottom <= playerRect.top + 18 && rect.width > 40 && rect.height > 12;
        const overlapsPlayerBand = rect.bottom > playerRect.top - 120 && rect.top < playerRect.bottom + 260;

        if ((sitsRightOfPlayer && overlapsPlayerBand) || sitsBelowPlayer || sitsAbovePlayer) {
          el.classList.add(OUTSIDE_PLAYER_CLASS);
        }
      });
    }

    document.querySelectorAll('body *').forEach((el) => {
      if (el.id === NOTICE_ID || (playerRoot && isWithinPlayerRoot(el, playerRoot)) || isInsidePlayer(el)) return;
      if (isLikelyPlayerControl(el, playerRect)) return;

      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (!text || text.length > 260) return;

      const containsCctvMarker = CCTV_TEXT_MARKERS.some((marker) => text.includes(marker));
      if (containsCctvMarker || TITLE_LIKE_TEXT.test(text)) {
        const target = el.closest('section, article, aside, li, .column, .box, .list, .content, div') || el;
        target.classList.add(OUTSIDE_PLAYER_CLASS);
      }
    });

    document.querySelectorAll('[title], img[alt]').forEach((el) => {
      if (playerRoot && isWithinPlayerRoot(el, playerRoot)) return;

      const text = `${el.getAttribute('title') || ''} ${el.getAttribute('alt') || ''}`;
      if (TITLE_LIKE_TEXT.test(text)) {
        const target = el.closest('li, article, section, div') || el;
        target.classList.add(OUTSIDE_PLAYER_CLASS);
      }
    });
  }

  function hideXiaohongshuSideContent() {
    if (!isXiaohongshuPage()) return;

    const playerRoot = getPlayerRoot();
    if (!playerRoot) return;

    hideOutsidePlayer(playerRoot);
    sanitizeDocumentTitle();
  }

  function sanitizeDocumentTitle() {
    if (TITLE_LIKE_TEXT.test(document.title)) {
      if (!document.originalTitle) document.originalTitle = document.title;
      document.title = '时差观赛';
    }
  }

  function getConfiguredSkipSeconds() {
    const hash = window.location.hash || '';
    const match = hash.match(/(?:^#?|&)scgs_skip=([^&]+)/);
    if (match) {
      const value = Number(decodeURIComponent(match[1]));
      if (Number.isFinite(value) && value >= 0) return Math.round(value);
    }

    return DEFAULT_SKIP_SECONDS;
  }

  function getSkipTargetSeconds(video) {
    const configuredSeconds = getConfiguredSkipSeconds();
    if (configuredSeconds === 0) return 0;

    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0) return configuredSeconds;
    if (duration < 30) return 3;
    if (duration < 60) return 8;
    if (duration < 120) return 15;
    if (duration < 200) return 25;
    return configuredSeconds;
  }

  function hidePossibleSpoilers() {
    SPOILER_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        hideElement(el);
      });
    });

    hideCctvSideContent();
    hideXiaohongshuSideContent();
    sanitizeDocumentTitle();
  }

  function scheduleIntroSkip(video) {
    if (processedVideos.has(video)) return;
    processedVideos.add(video);

    let attempted = false;
    const skip = () => {
      if (attempted) return;

      try {
        const targetSeconds = getSkipTargetSeconds(video);
        if (
          targetSeconds > 0 &&
          video.duration &&
          video.currentTime < targetSeconds
        ) {
          attempted = true;
          video.currentTime = targetSeconds;
        }
      } catch (err) {
        attempted = true;
        // 某些播放器可能限制 currentTime，失败时不影响用户手动播放。
        console.warn('[SCGS] skip intro failed:', err);
      }
    };

    video.addEventListener('loadedmetadata', skip, { once: true });
    video.addEventListener('canplay', skip, { once: true });
    video.addEventListener('play', skip, { once: true });
    window.setTimeout(skip, 1500);
    window.setTimeout(skip, 4000);
    window.setTimeout(skip, 8000);
  }

  function trySkipIntro() {
    document.querySelectorAll('video').forEach(scheduleIntroSkip);
  }

  function requestElementFullscreen(el) {
    if (!el) return false;

    const requestFullscreen = el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen;

    if (requestFullscreen) {
      try {
        const result = requestFullscreen.call(el);
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
        return true;
      } catch (err) {
        return false;
      }
    }

    if (typeof el.webkitEnterFullscreen === 'function') {
      try {
        el.webkitEnterFullscreen();
        return true;
      } catch (err) {
        return false;
      }
    }

    return false;
  }

  function tryPlay(video) {
    if (!video || !video.paused) return;

    try {
      const result = video.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => { tryPlayMuted(video); });
      }
    } catch (err) {
      tryPlayMuted(video);
    }
  }

  function tryPlayMuted(video) {
    if (!video || !video.paused) return;
    const wasMuted = video.muted;
    video.muted = true;
    try {
      const result = video.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (err) {
      // 静音自动播放也失败
      if (!wasMuted) video.muted = wasMuted;
    }
  }

  function tryAutoFullscreen(video) {
    if (!video || (!isCctvPage() && !isXiaohongshuPage())) return;

    tryPlay(video);

    const playerRoot = getPlayerRoot();
    requestElementFullscreen(playerRoot || video);
  }

  function armUserGestureFullscreen(video) {
    pendingFullscreenVideo = video;
    if (userGestureFullscreenArmed) return;

    userGestureFullscreenArmed = true;
    const handler = () => {
      userGestureFullscreenArmed = false;
      document.removeEventListener('click', handler, true);
      document.removeEventListener('touchend', handler, true);
      document.removeEventListener('keydown', handler, true);

      const targetVideo = pendingFullscreenVideo;
      pendingFullscreenVideo = null;
      tryAutoFullscreen(targetVideo);
    };

    document.addEventListener('click', handler, true);
    document.addEventListener('touchend', handler, true);
    document.addEventListener('keydown', handler, true);
  }

  function scheduleAutoFullscreen(video) {
    if (fullscreenVideos.has(video)) return;
    fullscreenVideos.add(video);

    const engage = () => {
      tryAutoFullscreen(video);
      armUserGestureFullscreen(video);
    };

    video.addEventListener('loadedmetadata', engage, { once: true });
    video.addEventListener('canplay', engage, { once: true });
    video.addEventListener('play', engage, { once: true });
    window.setTimeout(engage, 500);
    window.setTimeout(engage, 1500);
    window.setTimeout(engage, 4000);
  }

  function tryAutoFullscreenVideos() {
    document.querySelectorAll('video').forEach(scheduleAutoFullscreen);
  }

  function run() {
    if (!pluginEnabled) return;
    applyKnownPageMode();
    createNotice();
    hidePossibleSpoilers();
    trySkipIntro();
    if (isWorldcupMatchPage()) releasePrepaintShield();
  }

  function scheduleReruns() {
    RERUN_DELAYS_MS.forEach((delay) => {
      window.setTimeout(run, delay);
    });
    window.addEventListener('load', run, { once: true });
    document.addEventListener('readystatechange', run);
  }

  keepReplayLinksInApp();
  installPrepaintShield();

  Promise.all([
    isPluginEnabled(),
    chrome.storage && chrome.storage.local ? chrome.storage.local.get(DURATION_STORAGE_KEY) : Promise.resolve({})
  ]).then(([enabled, durationResult]) => {
    pluginEnabled = enabled;
    const hideDuration = durationResult[DURATION_STORAGE_KEY] !== false;
    if (enabled) {
      applyHideDuration(hideDuration);
      run();
      scheduleReruns();
    } else {
      restoreNormalPage();
    }
  }).catch(() => {
    // 降级：无法读取存储时默认启用
    pluginEnabled = true;
    applyHideDuration(true);
    run();
    scheduleReruns();
  });

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(run);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // 监听 SPA 导航（CCTV 比赛页面通过 pushState 跳转，不触发页面重载）
  let lastSpaUrl = location.href;
  const _origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _origPushState(...args);
    window.dispatchEvent(new Event('nospoil-navigate'));
  };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('nospoil-navigate')));
  window.addEventListener('nospoil-navigate', () => {
    if (location.href === lastSpaUrl) return;
    lastSpaUrl = location.href;
    if (pluginEnabled) {
      installPrepaintShield();
      run();
      scheduleReruns();
    }
  });
})();

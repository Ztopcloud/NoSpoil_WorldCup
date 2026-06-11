// 时差观赛助手 - content script
// MVP 目标：隐藏可能剧透的文字区域，保留视频播放区域。

(function () {
  const DEFAULT_SKIP_SECONDS = 190;
  const MIN_SKIP_DURATION_SECONDS = 200;
  const NOTICE_ID = 'nospoil-worldcup-notice';
  const PLAYER_ROOT_CLASS = 'nospoil-player-root';
  const OUTSIDE_PLAYER_CLASS = 'nospoil-outside-player';
  const THEATER_CLASS = 'nospoil-theater-mode';
  const processedVideos = new WeakSet();

  const PLAYER_SAFE_SELECTORS = [
    'video',
    '.video',
    '.player',
    '.video-player',
    '.player-box',
    '.player-container',
    '.live-player',
    '.cctv-player',
    '#player',
    '#video',
    '[class*="player"]',
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

  function createNotice() {
    if (document.getElementById(NOTICE_ID)) return;

    const notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.textContent = '时差观赛模式已开启：已净屏并跳过开头';
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

  function hideElement(el) {
    if (!el || el.id === NOTICE_ID || isInsidePlayer(el)) return;
    el.classList.add('nospoil-hidden');
  }

  function getPlayerRoot() {
    const video = Array.from(document.querySelectorAll('video'))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 320 && rect.height > 180)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0];

    if (!video) return null;

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

    const candidates = Array.from(document.querySelectorAll('video, [class*="player"], [id*="player"]'))
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 320 && rect.height > 180);

    return candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  }

  function isWithinPlayerRoot(el, playerRoot) {
    return el === playerRoot || playerRoot.contains(el);
  }

  function hideOutsidePlayer(playerRoot) {
    if (!playerRoot) return;

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
      .filter(({ rect }) => rect.width > 320 && rect.height > 180)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0];

    if (!video) return;

    document.body.querySelectorAll('*').forEach((el) => {
      if (el.id === NOTICE_ID || el === video.el || video.el.contains(el) || el.contains(video.el)) return;

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
    hideCctvLayoutAroundVideo();

    const playerRect = getPlayerRect();
    if (playerRect) {
      document.querySelectorAll('body *').forEach((el) => {
        if (el.id === NOTICE_ID || (playerRoot && isWithinPlayerRoot(el, playerRoot)) || isInsidePlayer(el)) return;

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

  function sanitizeDocumentTitle() {
    if (TITLE_LIKE_TEXT.test(document.title)) {
      document.title = '时差观赛';
    }
  }

  function hidePossibleSpoilers() {
    SPOILER_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        hideElement(el);
      });
    });

    hideCctvSideContent();
    sanitizeDocumentTitle();
  }

  function scheduleIntroSkip(video) {
    if (processedVideos.has(video)) return;
    processedVideos.add(video);

    let attempted = false;
    const skip = () => {
      if (attempted) return;

      try {
        if (
          video.duration &&
          video.duration >= MIN_SKIP_DURATION_SECONDS &&
          video.currentTime < DEFAULT_SKIP_SECONDS
        ) {
          attempted = true;
          video.currentTime = DEFAULT_SKIP_SECONDS;
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

  function run() {
    createNotice();
    hidePossibleSpoilers();
    trySkipIntro();
  }

  run();

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(run);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

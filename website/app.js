(function () {
  /* ===== Countdown ===== */
  const daysEl = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl = document.getElementById('cd-mins');
  const secsEl = document.getElementById('cd-secs');
  const countdownLabelEl = document.querySelector('.countdown-label');
  let countdownTarget = null;

  function setCountdownNumbers(days, hours, mins, secs) {
    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
  }

  function updateCountdown() {
    if (!countdownTarget) {
      setCountdownNumbers(0, 0, 0, 0);
      return;
    }

    if (countdownTarget.getTime() <= Date.now() && allMatches.length > 0) {
      const previousTarget = countdownTarget.getTime();
      setCountdownTargetFromMatches(allMatches);
      if (!countdownTarget || countdownTarget.getTime() === previousTarget) {
        setCountdownNumbers(0, 0, 0, 0);
        return;
      }
    }

    const diff = countdownTarget.getTime() - Date.now();
    if (diff <= 0) {
      setCountdownNumbers(0, 0, 0, 0);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    setCountdownNumbers(days, hours, mins, secs);
  }

  if (daysEl && hoursEl && minsEl && secsEl) {
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  /* ===== Platform Tabs ===== */
  var tabButtons = document.querySelectorAll('.platform-tab');
  var tabPanels = document.querySelectorAll('.platform-panel');

  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-tab');
      tabButtons.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      tabPanels.forEach(function(p) {
        p.classList.remove('active');
        if (p.id === 'panel-' + tab) p.classList.add('active');
      });
    });
  });

  /* ===== Schedule Rendering ===== */
  const grid = document.getElementById('schedule-grid');
  if (grid) {
  const scheduleNav = document.querySelector('.schedule-nav');
  const countryFilters = document.getElementById('country-filters');

  const roundLabels = {
    pre: '赛前',
    group: '小组赛',
    round32: '32强淘汰赛',
    round16: '16强淘汰赛',
    quarter: '1/4决赛',
    semi: '半决赛',
    third: '季军决赛',
    final: '决赛'
  };
  const continentLabels = {
    europe: '欧洲',
    asiaOceania: '大洋/亚洲',
    africa: '非洲',
    americas: '美洲'
  };
  const continentOrder = ['europe', 'asiaOceania', 'africa', 'americas'];
  const popularCountryOrder = {
    europe: [
      '德国', '法国', '英格兰', '西班牙', '葡萄牙', '荷兰', '比利时', '克罗地亚',
      '瑞士', '瑞典', '土耳其', '苏格兰', '奥地利', '挪威', '捷克', '波黑'
    ],
    asiaOceania: [
      '日本', '韩国', '澳大利亚', '伊朗', '沙特阿拉伯', '卡塔尔', '乌兹别克斯坦',
      '伊拉克', '约旦', '新西兰'
    ],
    africa: [
      '摩洛哥', '埃及', '阿尔及利亚', '塞内加尔', '科特迪瓦', '加纳',
      '突尼斯', '南非', '刚果民主共和国', '佛得角'
    ],
    americas: [
      '巴西', '阿根廷', '美国', '墨西哥', '哥伦比亚', '乌拉圭', '加拿大',
      '厄瓜多尔', '巴拉圭', '巴拿马', '海地', '库拉索'
    ]
  };
  const teamContinents = {
    阿尔及利亚: 'africa',
    阿根廷: 'americas',
    埃及: 'africa',
    奥地利: 'europe',
    澳大利亚: 'asiaOceania',
    巴拉圭: 'americas',
    巴拿马: 'americas',
    巴西: 'americas',
    比利时: 'europe',
    波黑: 'europe',
    德国: 'europe',
    厄瓜多尔: 'americas',
    法国: 'europe',
    佛得角: 'africa',
    刚果民主共和国: 'africa',
    哥伦比亚: 'americas',
    海地: 'americas',
    韩国: 'asiaOceania',
    荷兰: 'europe',
    加拿大: 'americas',
    加纳: 'africa',
    捷克: 'europe',
    卡塔尔: 'asiaOceania',
    科特迪瓦: 'africa',
    克罗地亚: 'europe',
    库拉索: 'americas',
    美国: 'americas',
    摩洛哥: 'africa',
    墨西哥: 'americas',
    南非: 'africa',
    挪威: 'europe',
    葡萄牙: 'europe',
    日本: 'asiaOceania',
    瑞典: 'europe',
    瑞士: 'europe',
    塞内加尔: 'africa',
    沙特阿拉伯: 'asiaOceania',
    苏格兰: 'europe',
    突尼斯: 'africa',
    土耳其: 'europe',
    乌拉圭: 'americas',
    乌兹别克斯坦: 'asiaOceania',
    西班牙: 'europe',
    新西兰: 'asiaOceania',
    伊拉克: 'asiaOceania',
    伊朗: 'asiaOceania',
    英格兰: 'europe',
    约旦: 'asiaOceania'
  };

  const MATCH_YEAR = 2026;
  const LIVE_WINDOW_MINUTES = 150;
  const REPLAY_PREP_MINUTES = 90;
  const finalRounds = ['semi', 'third', 'final'];
  const scheduleMatchRounds = ['group', 'round32', 'round16', 'quarter', 'semi', 'third', 'final'];

  let allMatches = [];
  let activeView = 'countries';
  let activeCountry = 'all';

  function flagUrl(code) {
    if (!code || code === 'xx') return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2256%22 height=%2238%22%3E%3Crect fill=%22%23d8e0ee%22 width=%2256%22 height=%2238%22 rx=%223%22/%3E%3Ctext x=%2228%22 y=%2223%22 text-anchor=%22middle%22 font-size=%2212%22 fill=%22%23999%22%3E?%3C/text%3E%3C/svg%3E';
    return 'https://flagcdn.com/w80/' + code + '.png';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function isPreMatchVideo(match) {
    return match && match.round === 'pre';
  }

  function isScheduleMatch(match) {
    return match && scheduleMatchRounds.indexOf(match.round) !== -1;
  }

  function matchStartTime(match) {
    const parts = match.date.split('/');
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    return new Date(MATCH_YEAR + '-' + month + '-' + day + 'T' + match.timeBeijing + ':00+08:00');
  }

  // 计算小组赛轮次：每组4队，前2场=第一轮，中间2场=第二轮，后2场=第三轮
  function getGroupRound(match) {
    if (!match || match.round !== 'group' || !match.group) return 0;
    var groupMatches = allMatches.filter(function(m) {
      return m.round === 'group' && m.group === match.group && m.date && m.timeBeijing;
    });
    groupMatches.sort(function(a, b) {
      return matchStartTime(a).getTime() - matchStartTime(b).getTime();
    });
    for (var i = 0; i < groupMatches.length; i++) {
      if (groupMatches[i].id === match.id) {
        return Math.floor(i / 2) + 1;
      }
    }
    return 0;
  }

  var roundNumMap = { 1: '第一轮', 2: '第二轮', 3: '第三轮' };

  function updateNextMatchPreview(nextMatchData) {
    const previewEl = document.getElementById('next-match-preview');
    if (!previewEl) return;

    if (!nextMatchData) {
      previewEl.style.display = 'none';
      return;
    }

    var m = nextMatchData.match;
    var homeFlag = document.getElementById('next-home-flag');
    var awayFlag = document.getElementById('next-away-flag');
    var homeName = document.getElementById('next-home-name');
    var awayName = document.getElementById('next-away-name');
    var matchRound = document.getElementById('next-match-round');
    var matchDate = document.getElementById('next-match-date');

    if (homeFlag) { homeFlag.src = flagUrl(m.homeCode); homeFlag.alt = m.home; homeFlag.style.display = ''; }
    if (awayFlag) { awayFlag.src = flagUrl(m.awayCode); awayFlag.alt = m.away; awayFlag.style.display = ''; }
    if (homeName) homeName.textContent = m.home;
    if (awayName) awayName.textContent = m.away;

    // 日期格式化
    var dateParts = m.date.split('/');
    var month = parseInt(dateParts[0], 10);
    var day = parseInt(dateParts[1], 10);
    var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var d = new Date(MATCH_YEAR, month - 1, day);
    var weekday = weekdays[d.getDay()];
    var dateStr = month + '月' + day + '日 ' + weekday + ' ' + m.timeBeijing + ' (北京时间)';

    // 小组/轮次信息 放在 VS 下方
    var roundStr = '';
    if (m.group) {
      var grRound = getGroupRound(m);
      roundStr = grRound > 0 ? m.group + '组 ' + roundNumMap[grRound] : m.group + '组';
    } else if (m.round) {
      var roundMap = {
        'round32': '32强赛',
        'round16': '16强赛',
        'quarter': '1/4决赛',
        'semi': '半决赛',
        'third': '季军赛',
        'final': '决赛'
      };
      roundStr = roundMap[m.round] || '';
    }

    if (matchRound) matchRound.textContent = roundStr;
    if (matchDate) matchDate.textContent = dateStr;

    previewEl.style.display = '';
  }

  function setCountdownTargetFromMatches(matches) {
    const now = Date.now();
    var upcomingMatches = matches
      .filter(function(match) {
        return isScheduleMatch(match) && match.date && match.timeBeijing;
      })
      .map(function(match) {
        return { match: match, start: matchStartTime(match) };
      })
      .filter(function(item) {
        return Number.isFinite(item.start.getTime()) && item.start.getTime() > now;
      })
      .sort(function(a, b) {
        return a.start.getTime() - b.start.getTime();
      });

    var nextMatch = upcomingMatches[0];

    countdownTarget = nextMatch ? nextMatch.start : null;
    if (countdownLabelEl) {
      countdownLabelEl.textContent = nextMatch ? '距离下一场比赛' : '赛程已结束';
    }
    updateNextMatchPreview(nextMatch || null);
    updateCountdown();
  }

  function getPreviewNow() {
    return new Date();
  }

  function formatCountdown(ms) {
    const totalMinutes = Math.max(0, Math.ceil(ms / (60 * 1000)));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return days + '天' + hours + '小时' + minutes + '分';
    if (hours > 0) return hours + '小时' + minutes + '分';
    return minutes + '分';
  }

  function addSkipHash(url, skipSeconds) {
    if (!url) return '';

    const seconds = Number(skipSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) return url;

    const hashValue = 'scgs_skip=' + encodeURIComponent(String(Math.round(seconds)));
    const baseHash = url.indexOf('#') === -1 ? '' : url.slice(url.indexOf('#') + 1);
    const baseUrl = url.indexOf('#') === -1 ? url : url.slice(0, url.indexOf('#'));
    const hashParts = baseHash ? baseHash.split('&').filter(function(part) {
      return part && !/^scgs_skip=/.test(part);
    }) : [];
    hashParts.push(hashValue);
    return baseUrl + '#' + hashParts.join('&');
  }

  function isCctvReplayUrl(url) {
    return /sports\.cctv\.com\/\d{4}\/\d{2}\/\d{2}\/VIDE/i.test(String(url || ''));
  }

  function isXhsUrl(url) {
    return /(^|\.)xiaohongshu\.com\//i.test(String(url || ''));
  }

  function buildXhsState(url) {
    return {
      key: 'xhs',
      centerLabel: '外部入口',
      hoverLabel: '小红书入口',
      hoverSubLabel: '可能需登录或 App 打开',
      topType: 'external',
      topLabel: '可能需登录',
      link: url || ''
    };
  }

  function getMatchState(match) {
    const now = getPreviewNow().getTime();
    const start = matchStartTime(match).getTime();
    const liveEnd = start + LIVE_WINDOW_MINUTES * 60 * 1000;
    const replayReady = liveEnd + REPLAY_PREP_MINUTES * 60 * 1000;

    if (now < start) {
      return {
        key: 'upcoming',
        centerLabel: '未开始',
        hoverLabel: '未开始',
        hoverSubLabel: formatCountdown(start - now),
        topType: 'countdown',
        topLabel: formatCountdown(start - now),
        link: match.liveUrl || match.replayUrl || ''
      };
    }

    if (now < liveEnd) {
      return {
        key: 'live',
        centerLabel: '美区进行中',
        hoverLabel: '视频直播',
        hoverSubLabel: '',
        topType: 'live',
        topLabel: '视频直播',
      link: match.liveUrl || ''
      };
    }

    if (now < replayReady) {
      // 只有央视回放继续视作网页可播；小红书外链近期常返回登录壳。
      if (isCctvReplayUrl(match.replayUrl)) {
        return {
          key: 'replay',
          centerLabel: '国区进行中',
          hoverLabel: '视频直播',
          hoverSubLabel: '',
          topType: 'live',
          topLabel: '视频直播',
          link: addSkipHash(match.replayUrl, match.skipSeconds)
        };
      }
      if (isXhsUrl(match.replayUrl)) return buildXhsState(match.replayUrl);
      return {
        key: 'ended',
        centerLabel: '刚结束',
        hoverLabel: '刚结束',
        hoverSubLabel: '正在准备复播视频',
        topType: 'preparing',
        topLabel: '正在准备视频',
        link: ''
      };
    }

    if (isXhsUrl(match.replayUrl)) return buildXhsState(match.replayUrl);

    return {
      key: 'replay',
      centerLabel: '国区进行中',
      hoverLabel: '视频直播',
      hoverSubLabel: '',
      topType: 'live',
      topLabel: '视频直播',
      link: addSkipHash(match.replayUrl || match.liveUrl || '', match.skipSeconds)
    };
  }

  function buildTile(match) {
    if (isPreMatchVideo(match)) return buildPreMatchTile(match);

    const isPlaceholder = match.home === '待定';
    const state = getMatchState(match);
    let tileClass = 'match-tile';
    tileClass += ' match-status-' + state.key;
    if (state.link && !isPlaceholder) tileClass += ' match-tile-actionable';
    if (isPlaceholder) tileClass += ' match-tile-placeholder';

    const roundLabel = roundLabels[match.round] || match.round;
    var roundText;
    if (match.round === 'group' && match.group) {
      var grRound = getGroupRound(match);
      roundText = grRound > 0 ? match.group + '组 ' + roundNumMap[grRound] : match.group + '组';
    } else {
      roundText = roundLabel;
    }
    const dateParts = match.date.split('/');
    const dateText = dateParts[0] + '<span class="time-unit">月</span>' + dateParts[1] + '<span class="time-unit">日</span>';
    const liveLabel = state.topType === 'live'
      ? '<span class="match-live-label"><span class="match-live-icon"></span>' + state.topLabel + '</span>'
      : state.topType === 'countdown'
        ? '<span class="match-countdown-label"><span class="match-bell-icon"></span>' + state.topLabel + '</span>'
        : state.topType === 'external'
          ? '<span class="match-external-label">' + state.topLabel + '</span>'
        : state.topType === 'preparing'
          ? '<span class="match-live-label">' + state.topLabel + '</span>'
        : '';
    const hoverSub = state.hoverSubLabel ? '<span class="match-hover-sub">' + state.hoverSubLabel + '</span>' : '';
    const highlightUrl = match.liveUrl || '';
    const replayUrl = isCctvReplayUrl(match.replayUrl) ? addSkipHash(match.replayUrl, match.skipSeconds) : '';
    const highlightAction = highlightUrl && !isPlaceholder
      ? '<a class="match-option-link match-option-highlight" href="' + escapeHtml(highlightUrl) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="match-option-icon match-live-icon"></span>' +
          '<span class="match-option-text">观看集锦</span>' +
        '</a>'
      : '<span class="match-option-link match-option-highlight match-option-disabled" aria-disabled="true">' +
          '<span class="match-option-icon match-live-icon"></span>' +
          '<span class="match-option-text">观看集锦</span>' +
          '<span class="match-option-note">准备中</span>' +
        '</span>';
    const replayAction = replayUrl && !isPlaceholder
      ? '<a class="match-option-link match-option-replay" href="' + escapeHtml(replayUrl) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="match-option-icon match-live-icon"></span>' +
          '<span class="match-option-text">完整视频</span>' +
        '</a>'
      : '<span class="match-option-link match-option-replay match-option-disabled" aria-disabled="true">' +
          '<span class="match-option-icon match-live-icon"></span>' +
          '<span class="match-option-text">完整视频</span>' +
          '<span class="match-option-note">准备中</span>' +
        '</span>';
    const actionLayer = isPlaceholder ? '' :
      '<div class="match-hover-action">' +
        '<div class="match-option-grid">' +
          highlightAction +
          '<span class="match-option-divider" aria-hidden="true"></span>' +
          replayAction +
        '</div>' +
        hoverSub +
      '</div>';

    return '<div class="' + tileClass + '" tabindex="' + (isPlaceholder ? '-1' : '0') + '">' +
      '<div class="match-content">' +
        '<div class="match-topline">' +
          '<div class="match-round-time">' +
            '<span class="match-round-text">' + roundText + '</span>' +
          '</div>' +
          liveLabel +
        '</div>' +
        '<div class="match-body">' +
          '<div class="match-team match-team-home">' +
            '<img src="' + flagUrl(match.homeCode) + '" alt="' + match.home + '" width="72" height="48" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2248%22%3E%3Crect fill=%22%23d8e0ee%22 width=%2272%22 height=%2248%22 rx=%223%22/%3E%3C/svg%3E\'">' +
            '<span>' + match.home + '</span>' +
          '</div>' +
          '<div class="match-status">' +
            '<strong>VS</strong>' +
            '<span>' + state.centerLabel + '</span>' +
          '</div>' +
          '<div class="match-team match-team-away">' +
            '<img src="' + flagUrl(match.awayCode) + '" alt="' + match.away + '" width="72" height="48" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2248%22%3E%3Crect fill=%22%23d8e0ee%22 width=%2272%22 height=%2248%22 rx=%223%22/%3E%3C/svg%3E\'">' +
            '<span>' + match.away + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="match-card-time">' + dateText + ' ' + match.timeBeijing + '</span>' +
      '</div>' +
      actionLayer +
      '</div>';
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function buildPreMatchTile(match) {
    var mobile = isMobileDevice();
    var baseUrl = match.videoUrl || match.replayUrl || match.liveUrl || '';
    var isXhs = isXhsUrl(baseUrl);
    // 手机端：安卓版维护中，暂不可用
    var url = mobile ? 'javascript:void(0)' : baseUrl;
    var tag = mobile ? 'a' : (url ? 'a' : 'div');
    var hrefAttr = url ? (mobile
      ? ' href="javascript:void(0)" onclick="alert(\'安卓版正在维护中，请稍后再试。\')"'
      : ' href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"'
    ) : '';
    var linkClose = url ? '</a>' : '</div>';
    var title = escapeHtml(match.title || (match.home + ' VS ' + match.away));
    var subtitle = escapeHtml(match.subtitle || '赛前视频');
    var source = escapeHtml(isXhs ? '小红书入口' : (match.source || '视频入口'));
    var dateText = match.date && match.date.indexOf('/') !== -1
      ? escapeHtml(match.date.split('/')[0] + '月' + match.date.split('/')[1] + '日')
      : escapeHtml(match.date || '');
    var timeText = escapeHtml(match.timeBeijing || '');
    var meta = [dateText, timeText].filter(Boolean).join(' ');
    var hasTeams = match.homeCode && match.awayCode && match.homeCode !== 'xx' && match.awayCode !== 'xx';
    var mainHtml = hasTeams
      ? '<div class="prematch-video-teams">' +
          '<span><img src="' + flagUrl(match.homeCode) + '" alt="" width="40" height="27">' + escapeHtml(match.home) + '</span>' +
          '<em>VS</em>' +
          '<span><img src="' + flagUrl(match.awayCode) + '" alt="" width="40" height="27">' + escapeHtml(match.away) + '</span>' +
        '</div>'
      : '<strong class="prematch-video-title">' + title + '</strong>';

    // 手机端：顶部标签和 hover 文案改为引导下载
    var topLabelHtml = mobile
      ? '<span class="match-round-text">赛前</span><span class="match-live-label"><span class="match-live-icon"></span>安卓维护中</span>'
      : '<span class="match-round-text">赛前</span>' + (isXhs
        ? '<span class="match-external-label">可能需登录</span>'
        : '<span class="match-live-label"><span class="match-live-icon"></span>视频入口</span>');
    var hoverLabel = mobile ? '安卓版正在维护中' : (isXhs ? '小红书入口' : '打开视频');
    var subtitleExtra = mobile
      ? '<span class="prematch-video-mobile-hint">安卓版正在维护中，请先用电脑观赛</span>'
      : isXhs
        ? '<span class="prematch-video-mobile-hint">可能需要登录小红书或用 App 打开</span>'
        : '';

    return '<' + tag + ' class="match-tile prematch-video-tile match-tile-actionable"' + hrefAttr + '>' +
      '<div class="match-content prematch-video-content">' +
        '<div class="match-topline">' +
          topLabelHtml +
        '</div>' +
        '<div class="prematch-video-body">' +
          '<span class="prematch-video-source">' + source + '</span>' +
          mainHtml +
          '<span class="prematch-video-subtitle">' + subtitle + '</span>' +
          subtitleExtra +
        '</div>' +
        '<span class="match-card-time">' + meta + '</span>' +
      '</div>' +
      '<span class="match-hover-action"><span class="match-hover-main"><span class="match-live-icon"></span>' + hoverLabel + '</span></span>' +
      linkClose;
  }

  function isFinalRound(round) {
    return finalRounds.indexOf(round) !== -1;
  }

  function getCountryGroups(matches) {
    var countryMap = {};
    var groups = {};

    matches.filter(function(match) {
      return isScheduleMatch(match);
    }).forEach(function(match) {
      [
        { name: match.home, code: match.homeCode },
        { name: match.away, code: match.awayCode }
      ].forEach(function(team) {
        if (!team.name || team.name === '待定' || team.code === 'xx') return;
        if (!countryMap[team.name]) countryMap[team.name] = team.code;
      });
    });

    Object.keys(countryMap).forEach(function(name) {
      var continent = teamContinents[name] || 'other';
      if (!groups[continent]) groups[continent] = [];
      groups[continent].push({ name: name, code: countryMap[name] });
    });

    Object.keys(groups).forEach(function(continent) {
      var popularity = popularCountryOrder[continent] || [];
      groups[continent].sort(function(a, b) {
        var rankA = popularity.indexOf(a.name);
        var rankB = popularity.indexOf(b.name);
        var hasRankA = rankA !== -1;
        var hasRankB = rankB !== -1;

        if (hasRankA && hasRankB) return rankA - rankB;
        if (hasRankA) return -1;
        if (hasRankB) return 1;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
    });

    return groups;
  }

  function buildFilterButton(label, value, isActive, className) {
    return '<button class="' + className + (isActive ? ' active' : '') + '" type="button" data-filter="' + value + '">' + label + '</button>';
  }

  function buildCountryButton(country) {
    return '<button class="country-filter-btn' + (activeCountry === country.name ? ' active' : '') + '" type="button" data-filter="' + country.name + '">' +
      '<img src="' + flagUrl(country.code) + '" alt="" width="24" height="16">' +
      '<span>' + country.name + '</span>' +
    '</button>';
  }

  function getInlineScrollList(listShell) {
    return listShell ? listShell.querySelector('[data-scroll-list]') : null;
  }

  function updateInlineScrollState(listShell, list) {
    if (!listShell || !list) return;

    var leftButton = listShell.querySelector('[data-scroll-dir="left"]');
    var rightButton = listShell.querySelector('[data-scroll-dir="right"]');
    var maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
    var hasOverflow = maxScroll > 8;
    var atStart = list.scrollLeft <= 4;
    var atEnd = list.scrollLeft >= maxScroll - 4;

    listShell.classList.toggle('has-overflow', hasOverflow);
    listShell.classList.toggle('can-scroll-left', hasOverflow && !atStart);
    listShell.classList.toggle('can-scroll-right', hasOverflow && !atEnd);

    if (leftButton) leftButton.disabled = !hasOverflow || atStart;
    if (rightButton) rightButton.disabled = !hasOverflow || atEnd;
  }

  function setupInlineScrollControls(root) {
    if (!root) return;

    root.querySelectorAll('.country-filter-list-shell, .match-row-shell').forEach(function(listShell) {
      var list = getInlineScrollList(listShell);
      if (!list) return;

      updateInlineScrollState(listShell, list);
      list.onscroll = function() {
        updateInlineScrollState(listShell, list);
      };
    });
  }

  function scrollInlineListFromButton(scrollButton) {
    var listShell = scrollButton.closest('.country-filter-list-shell, .match-row-shell');
    var list = getInlineScrollList(listShell);
    if (!list) return false;

    var direction = scrollButton.getAttribute('data-scroll-dir') === 'left' ? -1 : 1;
    list.scrollBy({
      left: direction * Math.max(220, Math.round(list.clientWidth * 0.72)),
      behavior: 'smooth'
    });
    return true;
  }

  function renderCountryFilters() {
    if (!countryFilters) return;

    if (activeView !== 'countries') {
      countryFilters.innerHTML = '';
      countryFilters.hidden = true;
      return;
    }

    var countryGroups = getCountryGroups(allMatches);
    var allCountries = [];
    Object.keys(countryGroups).forEach(function(groupKey) {
      allCountries = allCountries.concat(countryGroups[groupKey]);
    });
    var hasActiveCountry = activeCountry === 'all' || allCountries.some(function(country) {
      return country.name === activeCountry;
    });
    if (!hasActiveCountry) activeCountry = 'all';

    var html = '';

    continentOrder.forEach(function(continent) {
      var countries = countryGroups[continent];
      if (!countries || countries.length === 0) return;
      html += '<div class="country-filter-group">' +
        '<div class="country-filter-continent">' + continentLabels[continent] + '</div>' +
        '<div class="country-filter-list-shell">' +
          '<button class="country-filter-fade country-filter-fade-left" type="button" data-scroll-dir="left" aria-label="向左查看更多国家"><span class="country-filter-arrow"></span></button>' +
          '<div class="country-filter-list" data-scroll-list tabindex="0" aria-label="' + continentLabels[continent] + '国家列表">' + countries.map(buildCountryButton).join('') + '</div>' +
          '<button class="country-filter-fade country-filter-fade-right" type="button" data-scroll-dir="right" aria-label="向右查看更多国家"><span class="country-filter-arrow"></span></button>' +
        '</div>' +
      '</div>';
    });

    countryFilters.hidden = false;
    countryFilters.innerHTML = html;
    setupInlineScrollControls(countryFilters);
  }

  function filterMatchesByView(matches) {
    var filtered = matches;

    if (activeView === 'upcoming') {
      var now = Date.now();
      return filtered.filter(function(match) {
        return isScheduleMatch(match) && match.date && match.timeBeijing && matchStartTime(match).getTime() > now;
      });
    }

    if (activeView === 'countries') {
      if (activeCountry !== 'all') {
        return filtered.filter(function(match) {
          return isScheduleMatch(match) && (match.home === activeCountry || match.away === activeCountry);
        });
      }
      return filtered.filter(function(match) {
        return isScheduleMatch(match) || isPreMatchVideo(match);
      });
    }

    if (activeView === 'pre') {
      return filtered.filter(isPreMatchVideo);
    }

    if (activeView === 'finals') {
      return filtered.filter(function(match) {
        return isFinalRound(match.round);
      });
    }

    return filtered.filter(function(match) {
      return match.round === activeView;
    });
  }

  function renderRoundBlock(title, matches) {
    // 按比赛时间正序排列：最近的/最早的在最左边
    var sorted = matches.slice().sort(function(a, b) {
      return matchStartTime(a).getTime() - matchStartTime(b).getTime();
    });
    return '<div class="match-round-block">' +
      '<div class="round-header"><span>' + title + '</span></div>' +
      '<div class="match-round-grid">' + sorted.map(buildTile).join('') + '</div>' +
      '</div>';
  }

  function renderVideoBlock(title, matches) {
    return '<div class="match-round-block prematch-video-block">' +
      '<div class="round-header"><span>' + title + '</span></div>' +
      '<div class="match-round-grid prematch-video-grid">' + matches.map(buildTile).join('') + '</div>' +
      '</div>';
  }

  function renderScrollableRoundBlock(title, matches) {
    // 按比赛时间正序排列：最近的/最早的在最左边
    var sorted = matches.slice().sort(function(a, b) {
      return matchStartTime(a).getTime() - matchStartTime(b).getTime();
    });
    return '<div class="match-row-section">' +
      '<div class="round-header"><span>' + title + '</span></div>' +
      '<div class="match-row-shell">' +
        '<button class="country-filter-fade country-filter-fade-left" type="button" data-scroll-dir="left" aria-label="向左查看更多比赛"><span class="country-filter-arrow"></span></button>' +
        '<div class="match-row-list" data-scroll-list tabindex="0" aria-label="' + title + '比赛列表">' + sorted.map(buildTile).join('') + '</div>' +
        '<button class="country-filter-fade country-filter-fade-right" type="button" data-scroll-dir="right" aria-label="向右查看更多比赛"><span class="country-filter-arrow"></span></button>' +
      '</div>' +
    '</div>';
  }

  function shouldUseMobileMatchCentering() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function getDefaultCenteredTile(list) {
    return list.querySelector('.match-status-live') ||
      list.querySelector('.match-status-replay') ||
      list.querySelector('.match-tile-actionable') ||
      list.querySelector('.match-tile');
  }

  function centerMobileMatchRows() {
    if (!shouldUseMobileMatchCentering()) return;

    grid.querySelectorAll('.match-row-list').forEach(function(list) {
      var tile = getDefaultCenteredTile(list);
      if (!tile) return;

      var targetLeft = tile.offsetLeft - ((list.clientWidth - tile.offsetWidth) / 2);
      list.scrollLeft = Math.max(0, targetLeft);
    });
  }

  function scrollMatchRowsToEnd() {
    if (!grid) return;

    grid.querySelectorAll('.match-row-shell').forEach(function(listShell) {
      var list = getInlineScrollList(listShell);
      if (!list) return;

      list.scrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
      updateInlineScrollState(listShell, list);
    });
  }

  function renderSchedule(matches) {
    if (!grid) return;
    renderCountryFilters();

    if (!Array.isArray(matches) || matches.length === 0) {
      grid.innerHTML = '<div class="empty-state">暂无赛程数据。</div>';
      return;
    }

    var visibleMatches = filterMatchesByView(matches);

    if (visibleMatches.length === 0) {
      grid.innerHTML = '<div class="empty-state">当前分类暂无赛程。</div>';
      return;
    }

    if (activeView === 'pre') {
      grid.innerHTML = renderVideoBlock('赛前视频', visibleMatches);
      return;
    }

    if (activeView === 'upcoming') {
      var scheduleMatches = visibleMatches.filter(function(match) {
        return !isPreMatchVideo(match);
      });
      var grouped = {};
      var otherRounds = {};
      scheduleMatches.forEach(function(m) {
        if (m.round === 'group' && m.group) {
          if (!grouped[m.group]) grouped[m.group] = [];
          grouped[m.group].push(m);
        } else if (isFinalRound(m.round)) {
          if (!otherRounds.finals) otherRounds.finals = [];
          otherRounds.finals.push(m);
        } else {
          if (!otherRounds[m.round]) otherRounds[m.round] = [];
          otherRounds[m.round].push(m);
        }
      });

      var html = '';

      'ABCDEFGHIJKL'.split('').forEach(function(group) {
        if (grouped[group] && grouped[group].length > 0) {
          html += renderScrollableRoundBlock(group + '组', grouped[group]);
        }
      });

      ['round32', 'round16', 'quarter'].forEach(function(round) {
        if (otherRounds[round] && otherRounds[round].length > 0) {
          html += renderRoundBlock(roundLabels[round], otherRounds[round]);
        }
      });

      if (otherRounds.finals && otherRounds.finals.length > 0) {
        html += renderRoundBlock('决赛阶段', otherRounds.finals);
      }

      grid.innerHTML = html;
      setupInlineScrollControls(grid);
      window.requestAnimationFrame(centerMobileMatchRows);
      return;
    }

    var countryPreMatches = activeView === 'countries'
      ? visibleMatches.filter(isPreMatchVideo)
      : [];
    var scheduleMatches = visibleMatches.filter(function(match) {
      return !isPreMatchVideo(match);
    });
    var grouped = {};
    var otherRounds = {};
    scheduleMatches.forEach(function(m) {
      if (m.round === 'group' && m.group) {
        if (!grouped[m.group]) grouped[m.group] = [];
        grouped[m.group].push(m);
      } else if (isFinalRound(m.round)) {
        if (!otherRounds.finals) otherRounds.finals = [];
        otherRounds.finals.push(m);
      } else {
        if (!otherRounds[m.round]) otherRounds[m.round] = [];
        otherRounds[m.round].push(m);
      }
    });

    var html = '';
    if (countryPreMatches.length > 0) {
      html += renderVideoBlock('赛前视频', countryPreMatches);
    }

    'ABCDEFGHIJKL'.split('').forEach(function(group) {
      if (grouped[group] && grouped[group].length > 0) {
        html += renderScrollableRoundBlock(group + '组', grouped[group]);
      }
    });

    ['round32', 'round16', 'quarter'].forEach(function(round) {
      if (otherRounds[round] && otherRounds[round].length > 0) {
        html += renderRoundBlock(roundLabels[round], otherRounds[round]);
      }
    });

    if (otherRounds.finals && otherRounds.finals.length > 0) {
      html += renderRoundBlock('决赛阶段', otherRounds.finals);
    }

    grid.innerHTML = html;
    setupInlineScrollControls(grid);
    if (activeView === 'countries') {
      window.requestAnimationFrame(scrollMatchRowsToEnd);
    } else {
      window.requestAnimationFrame(centerMobileMatchRows);
    }
  }

  if (scheduleNav) {
    scheduleNav.addEventListener('click', function(event) {
      var button = event.target.closest('button[data-view]');
      if (!button) return;

      activeView = button.getAttribute('data-view');
      if (activeView !== 'countries') activeCountry = 'all';

      scheduleNav.querySelectorAll('.schedule-nav-btn').forEach(function(item) {
        item.classList.toggle('active', item === button);
      });
      renderSchedule(allMatches);
    });
  }

  if (countryFilters) {
    countryFilters.addEventListener('click', function(event) {
      var scrollButton = event.target.closest('.country-filter-fade');
      if (scrollButton) {
        scrollInlineListFromButton(scrollButton);
        return;
      }

      var button = event.target.closest('button[data-filter]');
      if (!button) return;

      activeCountry = button.getAttribute('data-filter');
      renderSchedule(allMatches);
    });
  }

  grid.addEventListener('click', function(event) {
    var scrollButton = event.target.closest('.country-filter-fade');
    if (scrollButton) {
      scrollInlineListFromButton(scrollButton);
      return;
    }

    var optionLink = event.target.closest('.match-option-link:not(.match-option-disabled)');
    if (optionLink) return;

    var disabledOption = event.target.closest('.match-option-disabled');
    if (disabledOption) {
      event.preventDefault();
      return;
    }

    var useTapExpand = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (!useTapExpand) return;

    var tile = event.target.closest('.match-tile-actionable:not(.prematch-video-tile)');
    grid.querySelectorAll('.match-tile-options-open').forEach(function(item) {
      if (item !== tile) item.classList.remove('match-tile-options-open');
    });
    if (!tile) return;

    event.preventDefault();
    tile.classList.toggle('match-tile-options-open');
  });

  document.addEventListener('click', function(event) {
    if (event.target.closest('#schedule-grid')) return;
    grid.querySelectorAll('.match-tile-options-open').forEach(function(item) {
      item.classList.remove('match-tile-options-open');
    });
  });

  /* ===== Fetch & Init ===== */
  // 使用固定版本号替代 Date.now()，允许浏览器/CDN 条件缓存（304 Not Modified），
  // 同时更新版本号后会拉取最新数据，兼顾加载速度与内容更新。
  var MATCHES_VERSION = '20260624-16';
  fetch('data/matches.json?v=' + MATCHES_VERSION)
    .then(function(response) {
      if (!response.ok) throw new Error('matches load failed');
      return response.json();
    })
    .then(function(data) {
      allMatches = data;
      setCountdownTargetFromMatches(allMatches);
      renderSchedule(allMatches);
    })
    .catch(function() {
      grid.innerHTML = '<div class="empty-state">赛事数据暂时无法加载，请稍后刷新页面。</div>';
    });

  // 预览模式下按分钟重绘状态，方便观察倒计时变化。
  setInterval(function() {
    if (allMatches.length > 0) renderSchedule(allMatches);
  }, 60 * 1000);

  window.addEventListener('resize', function() {
    setupInlineScrollControls(document);
  });

  } // end if (grid)

  /* ===== News Rendering ===== */
  var newsGrid = document.getElementById('news-grid');
  if (newsGrid) {
    var NEWS_VERSION = '20260613-1';
    var newsFilterBar = document.querySelector('.news-filter-bar');
    var allNews = [];
    var activeNewsCategory = 'all';

    var categoryClassMap = {
      '前瞻': 'news-category-pre',
      '赛果': 'news-category-result',
      '花絮': 'news-category-fun',
      '攻略': 'news-category-guide',
      '动态': 'news-category-dynamic',
      '综合': 'news-category-general'
    };

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char];
      });
    }

    function buildNewsCard(news) {
      var catClass = categoryClassMap[news.category] || 'news-category-general';
      var tagHtml = news.tags && news.tags.length > 0
        ? '<div class="news-card-tags">' + news.tags.map(function(t) { return '<span class="news-tag">' + escapeHtml(t) + '</span>'; }).join('') + '</div>'
        : '';

      var imageHtml = news.image
        ? '<div class="news-card-image"><img src="' + escapeHtml(news.image) + '" alt="' + escapeHtml(news.title) + '" loading="lazy"></div>'
        : '<div class="news-card-image"><div class="news-card-image-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M0 0h24v24H0z" fill="none"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="m21 15l-5-5L5 21"/></svg><span>赛事资讯</span></div></div>';

      var tag = news.url ? 'a' : 'div';
      var isExternalUrl = /^https?:\/\//i.test(news.url || '');
      var hrefAttr = news.url
        ? ' href="' + escapeHtml(news.url) + '"' + (isExternalUrl ? ' target="_blank" rel="noopener noreferrer"' : '')
        : '';
      var linkClose = news.url ? '</a>' : '</div>';

      return '<' + tag + ' class="news-card"' + hrefAttr + '>' +
        imageHtml +
        '<div class="news-card-body">' +
          '<div class="news-card-header">' +
            '<span class="news-category ' + catClass + '">' + escapeHtml(news.category) + '</span>' +
            '<span class="news-date">' + escapeHtml(news.date) + '</span>' +
          '</div>' +
          '<h3 class="news-card-title">' + escapeHtml(news.title) + '</h3>' +
          '<p class="news-card-summary">' + escapeHtml(news.summary) + '</p>' +
          tagHtml +
        '</div>' +
        linkClose;
    }

    function renderNews() {
      if (!newsGrid) return;

      var filtered = allNews;
      if (activeNewsCategory !== 'all') {
        filtered = allNews.filter(function(n) { return n.category === activeNewsCategory; });
      }

      // 按日期倒序排列
      filtered.sort(function(a, b) {
        return b.date.localeCompare(a.date);
      });

      if (filtered.length === 0) {
        newsGrid.innerHTML = '<div class="empty-state">该分类暂无资讯。</div>';
        return;
      }

      newsGrid.innerHTML = filtered.map(buildNewsCard).join('');
    }

    if (newsFilterBar) {
      newsFilterBar.addEventListener('click', function(event) {
        var button = event.target.closest('button[data-news-category]');
        if (!button) return;

        activeNewsCategory = button.getAttribute('data-news-category');
        newsFilterBar.querySelectorAll('.news-filter-btn').forEach(function(btn) {
          btn.classList.toggle('active', btn === button);
        });
        renderNews();
      });
    }

    fetch('data/news.json?v=' + NEWS_VERSION)
      .then(function(response) {
        if (!response.ok) throw new Error('news load failed');
        return response.json();
      })
      .then(function(data) {
        allNews = data;
        renderNews();
      })
      .catch(function() {
        newsGrid.innerHTML = '<div class="empty-state">资讯暂时无法加载，请稍后刷新页面。</div>';
      });
  }

  /* ===== Nav Dropdowns ===== */
  var dropTriggers = document.querySelectorAll('.nav-drop-trigger');
  dropTriggers.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var dropdown = this.closest('.nav-dropdown');
      var isOpen = dropdown.classList.contains('open');
      // 关闭其他所有下拉
      document.querySelectorAll('.nav-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
      if (!isOpen) dropdown.classList.add('open');
    });
  });

  // 点击页面其他区域关闭下拉
  document.addEventListener('click', function() {
    document.querySelectorAll('.nav-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
  });
})();

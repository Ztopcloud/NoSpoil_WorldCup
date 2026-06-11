(function () {
  /* ===== Countdown ===== */
  const daysEl = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl = document.getElementById('cd-mins');
  const secsEl = document.getElementById('cd-secs');
  const target = new Date('2026-06-12T03:00:00+08:00'); // 北京时间 6月12日 03:00 揭幕战

  function updateCountdown() {
    const now = Date.now();
    const diff = target.getTime() - now;

    if (diff <= 0) {
      if (daysEl) daysEl.textContent = '00';
      if (hoursEl) hoursEl.textContent = '00';
      if (minsEl) minsEl.textContent = '00';
      if (secsEl) secsEl.textContent = '00';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
  }

  if (daysEl && hoursEl && minsEl && secsEl) {
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  /* ===== Schedule Rendering ===== */
  const grid = document.getElementById('schedule-grid');
  if (!grid) return;
  const scheduleNav = document.querySelector('.schedule-nav');
  const countryFilters = document.getElementById('country-filters');

  const roundLabels = {
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

  let allMatches = [];
  let activeView = 'countries';
  let activeCountry = 'all';

  function flagUrl(code) {
    if (!code || code === 'xx') return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2256%22 height=%2238%22%3E%3Crect fill=%22%23d8e0ee%22 width=%2256%22 height=%2238%22 rx=%223%22/%3E%3Ctext x=%2228%22 y=%2223%22 text-anchor=%22middle%22 font-size=%2212%22 fill=%22%23999%22%3E?%3C/text%3E%3C/svg%3E';
    return 'https://flagcdn.com/w80/' + code + '.png';
  }

  function matchStartTime(match) {
    const parts = match.date.split('/');
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    return new Date(MATCH_YEAR + '-' + month + '-' + day + 'T' + match.timeBeijing + ':00+08:00');
  }

  function getPreviewNow() {
    // TEST_TIME: temporarily freeze match state previews at 2026-06-19 09:00 Beijing time.
    return new Date('2026-06-19T09:00:00+08:00');
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
        link: ''
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

    return {
      key: 'replay',
      centerLabel: '国区进行中',
      hoverLabel: '视频直播',
      hoverSubLabel: '',
      topType: 'live',
      topLabel: '视频直播',
      link: match.replayUrl || match.liveUrl || ''
    };
  }

  function buildTile(match) {
    const isPlaceholder = match.home === '待定';
    const state = getMatchState(match);
    let tileClass = 'match-tile';
    tileClass += ' match-status-' + state.key;
    if (state.link && !isPlaceholder) tileClass += ' match-tile-actionable';
    if (isPlaceholder) tileClass += ' match-tile-placeholder';

    const hasLink = state.link && !isPlaceholder;
    const tag = hasLink ? 'a' : 'div';
    const hrefAttr = hasLink ? ' href="' + state.link + '" target="_blank" rel="noopener noreferrer"' : '';
    const linkClose = hasLink ? '</a>' : '</div>';

    const roundLabel = roundLabels[match.round] || match.round;
    const roundText = match.round === 'group' && match.group ? match.group + '组 第1轮' : roundLabel;
    const dateParts = match.date.split('/');
    const dateText = dateParts[0] + '<span class="time-unit">月</span>' + dateParts[1] + '<span class="time-unit">日</span>';
    const liveLabel = state.topType === 'live'
      ? '<span class="match-live-label"><span class="match-live-icon"></span>' + state.topLabel + '</span>'
      : state.topType === 'countdown'
        ? '<span class="match-countdown-label"><span class="match-bell-icon"></span>' + state.topLabel + '</span>'
        : state.topType === 'preparing'
          ? '<span class="match-live-label">' + state.topLabel + '</span>'
        : '';
    const hoverIcon = state.hoverLabel === '视频直播' ? '<span class="match-live-icon"></span>' : '';
    const hoverSub = state.hoverSubLabel ? '<span class="match-hover-sub">' + state.hoverSubLabel + '</span>' : '';

    return '<' + tag + ' class="' + tileClass + '"' + hrefAttr + '>' +
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
      '<span class="match-hover-action"><span class="match-hover-main">' + hoverIcon + state.hoverLabel + '</span>' + hoverSub + '</span>' +
      linkClose;
  }

  function isFinalRound(round) {
    return finalRounds.indexOf(round) !== -1;
  }

  function getCountryGroups(matches) {
    var countryMap = {};
    var groups = {};

    matches.forEach(function(match) {
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

    if (activeView === 'countries') {
      if (activeCountry !== 'all') {
        filtered = filtered.filter(function(match) {
          return match.home === activeCountry || match.away === activeCountry;
        });
      }
      return filtered;
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

    var grouped = {};
    var otherRounds = {};
    visibleMatches.forEach(function(m) {
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
    if (!scrollButton) return;
    scrollInlineListFromButton(scrollButton);
  });

  /* ===== Fetch & Init ===== */
  // 使用固定版本号替代 Date.now()，允许浏览器/CDN 条件缓存（304 Not Modified），
  // 同时更新版本号后会拉取最新数据，兼顾加载速度与内容更新。
  var MATCHES_VERSION = '20260611';
  fetch('data/matches.json?v=' + MATCHES_VERSION)
    .then(function(response) {
      if (!response.ok) throw new Error('matches load failed');
      return response.json();
    })
    .then(function(data) {
      allMatches = data;
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

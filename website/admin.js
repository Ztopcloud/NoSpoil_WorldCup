(function () {
  const apiUrl = 'api/matches';
  const resolveLinksUrl = 'api/resolve-links';
  const cctvSourceUrl = 'https://cbs.sports.cctv.com/index.html#3400';
  const knownCctvMatchTitles = {
    '22920296': '2026年世界杯：墨西哥VS南非'
  };
  const roundLabels = {
    pre: '赛前',
    group: '小组赛',
    round32: '32强',
    round16: '16强',
    quarter: '1/4决赛',
    semi: '半决赛',
    third: '季军决赛',
    final: '决赛'
  };
  // 48支参赛队伍 → ISO国家代码映射（与 app.js 保持一致）
  const teamCodeMap = {
    '墨西哥': 'mx', '南非': 'za', '韩国': 'kr', '捷克': 'cz',
    '加拿大': 'ca', '波黑': 'ba', '美国': 'us', '巴拉圭': 'py',
    '卡塔尔': 'qa', '瑞士': 'ch', '巴西': 'br', '摩洛哥': 'ma',
    '海地': 'ht', '苏格兰': 'gb-sct', '澳大利亚': 'au', '土耳其': 'tr',
    '德国': 'de', '库拉索': 'cw', '荷兰': 'nl', '日本': 'jp',
    '科特迪瓦': 'ci', '厄瓜多尔': 'ec', '瑞典': 'se', '突尼斯': 'tn',
    '西班牙': 'es', '佛得角': 'cv', '比利时': 'be', '埃及': 'eg',
    '沙特阿拉伯': 'sa', '乌拉圭': 'uy', '伊朗': 'ir', '新西兰': 'nz',
    '法国': 'fr', '塞内加尔': 'sn', '伊拉克': 'iq', '挪威': 'no',
    '阿根廷': 'ar', '阿尔及利亚': 'dz', '奥地利': 'at', '约旦': 'jo',
    '葡萄牙': 'pt', '刚果民主共和国': 'cd', '英格兰': 'gb-eng', '克罗地亚': 'hr',
    '冰岛': 'is',
    '加纳': 'gh', '巴拿马': 'pa', '乌兹别克斯坦': 'uz', '哥伦比亚': 'co'
  };
  const teamNames = Object.keys(teamCodeMap).sort();

  let matches = [];
  let dirty = false;
  let importMatches = [];
  let adminToken = localStorage.getItem('nospoilAdminToken') || '';
  let isAuthenticated = false;

  const loginShell = document.getElementById('admin-login-shell');
  const adminApp = document.getElementById('admin-app');
  const loginForm = document.getElementById('login-form');
  const loginTokenInput = document.getElementById('admin-token-input');
  const loginError = document.getElementById('login-error');
  const logoutButton = document.getElementById('logout-btn');
  const matchList = document.getElementById('match-list');
  const searchInput = document.getElementById('search-input');
  const roundFilter = document.getElementById('round-filter');
  const saveButton = document.getElementById('save-btn');
  const downloadButton = document.getElementById('download-btn');
  const saveStatus = document.getElementById('save-status');
  const bulkInput = document.getElementById('bulk-input');
  const previewImportButton = document.getElementById('preview-import-btn');
  const applyImportButton = document.getElementById('apply-import-btn');
  const clearImportButton = document.getElementById('clear-import-btn');
  const importPreview = document.getElementById('import-preview');
  const bulkTargetField = document.getElementById('bulk-target-field');

  function headers() {
    const result = { 'Content-Type': 'application/json' };
    if (adminToken) result['X-Admin-Token'] = adminToken;
    return result;
  }

  function setStatus(text, isDirty) {
    dirty = Boolean(isDirty);
    saveStatus.textContent = text;
    saveStatus.classList.toggle('dirty-ring', dirty);
  }

  function setAuthState(authenticated) {
    isAuthenticated = authenticated;
    loginShell.hidden = authenticated;
    adminApp.hidden = !authenticated;
    if (!authenticated) {
      loginError.hidden = true;
      if (loginTokenInput) loginTokenInput.value = '';
    }
  }

  function setLoginError(message) {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.hidden = false;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[：:·\-—_（）()【】\[\],，.。]/g, '');
  }

  function isPlaceholder(match) {
    return match.home === '待定' || match.away === '待定';
  }

  function matchLabel(match) {
    return `${match.date} ${match.timeBeijing} ${match.home} vs ${match.away}`;
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

  function updateStats() {
    document.getElementById('stat-total').textContent = matches.length;
    document.getElementById('stat-replay').textContent = matches.filter(match => match.replayUrl).length;
    document.getElementById('stat-live').textContent = matches.filter(match => match.liveUrl).length;
    var pendingKnockout = matches.filter(function(m) { return m.round !== 'group' && isPlaceholder(m); }).length;
    var pendingEl = document.getElementById('stat-pending');
    if (pendingEl) pendingEl.textContent = pendingKnockout;
  }

  function getVisibleMatches() {
    const query = normalizeText(searchInput.value);
    const round = roundFilter.value;

    return matches.filter(match => {
      if (round !== 'all' && match.round !== round) return false;
      if (!query) return true;
      return normalizeText([
        match.id,
        match.date,
        match.timeBeijing,
        match.home,
        match.away,
        match.group,
        roundLabels[match.round] || match.round
      ].join(' ')).includes(query);
    });
  }

  function renderMatches() {
    var visibleMatches = getVisibleMatches();
    if (visibleMatches.length === 0) {
      matchList.innerHTML = '<div class="empty-state">没有匹配的比赛。</div>';
      return;
    }

    // 构建 datalist 选项
    var teamOptions = teamNames.map(function(n) { return '<option value="' + escapeHtml(n) + '">'; }).join('');

    matchList.innerHTML =
      '<datalist id="team-list">' + teamOptions + '</datalist>' +
      visibleMatches.map(function(match) {
        var roundLabel = match.round === 'group' && match.group
          ? match.group + '组'
          : (roundLabels[match.round] || match.round);
        var placeholderClass = isPlaceholder(match) ? ' placeholder' : '';

        function urlOpenBtn(url, skipSeconds) {
          if (!url) return '<span class="match-inline-open disabled" title="暂无链接">打开</span>';
          var openUrl = skipSeconds == null ? url : addSkipHash(url, skipSeconds);
          return '<a class="match-inline-open" href="' + escapeHtml(openUrl) +
            '" target="_blank" rel="noopener noreferrer" title="在新标签页打开">打开</a>';
        }

        return (
          '<article class="match-admin-card' + placeholderClass + '" data-id="' + escapeHtml(match.id) + '">' +
            '<div class="match-title">' +
              '<div class="match-teams-row">' +
                '<input class="team-name-input" data-field="home" ' +
                (match.home === '待定' ? 'placeholder="主队" ' : 'value="' + escapeHtml(match.home) + '" placeholder="主队" ') +
                'list="team-list" autocomplete="off" title="输入队名，自动带出国旗代码">' +
                '<span class="match-vs">vs</span>' +
                '<input class="team-name-input" data-field="away" ' +
                (match.away === '待定' ? 'placeholder="客队" ' : 'value="' + escapeHtml(match.away) + '" placeholder="客队" ') +
                'list="team-list" autocomplete="off" title="输入队名，自动带出国旗代码">' +
              '</div>' +
              '<div class="match-code-row">' +
                '<input class="team-code-input" data-field="homeCode" value="' + escapeHtml(match.homeCode) +
                '" placeholder="代码" maxlength="6" title="ISO国家代码，如 mx, br, de">' +
                '<input class="team-code-input" data-field="awayCode" value="' + escapeHtml(match.awayCode) +
                '" placeholder="代码" maxlength="6" title="ISO国家代码，如 mx, br, de">' +
                '<span class="match-meta">' + escapeHtml(match.id) + ' · ' + escapeHtml(roundLabel) +
                ' · ' + escapeHtml(match.date) + ' ' + escapeHtml(match.timeBeijing) + '</span>' +
              '</div>' +
            '</div>' +
            '<label class="match-url-label">直播' +
              '<div class="match-url-row">' +
                '<input data-field="liveUrl" value="' + escapeHtml(match.liveUrl || '') + '" placeholder="https://...">' +
                urlOpenBtn(match.liveUrl) +
              '</div>' +
            '</label>' +
            '<label class="match-url-label">复播' +
              '<div class="match-url-row">' +
                '<input data-field="replayUrl" value="' + escapeHtml(match.replayUrl || '') + '" placeholder="https://cbs.sports.cctv.com/...">' +
                urlOpenBtn(match.replayUrl, match.skipSeconds) +
              '</div>' +
            '</label>' +
            '<label class="match-url-label skip-seconds-label">跳过秒数' +
              '<input class="skip-seconds-input" data-field="skipSeconds" type="number" min="0" step="1" value="' + escapeHtml(match.skipSeconds == null ? '' : match.skipSeconds) +
              '" placeholder="自动" title="留空使用平台默认值；填 0 表示不跳过开头">' +
            '</label>' +
            '<button class="match-clear-btn" data-action="clear-urls" title="清除直播/复播链接及主客队信息">清除</button>' +
          '</article>'
        );
      }).join('');
  }

  function parseBulkLines(raw) {
    const urlPattern = /(https?:\/\/[^\s"'<>，。]+)/ig;
    return raw.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const urls = line.match(urlPattern) || [];
        const url = urls[0] || '';
        const knownTitle = knownCctvTitle(url);
        return {
          line,
          url,
          resolvedTitle: knownTitle,
          text: [line.replace(urlPattern, ' '), knownTitle].filter(Boolean).join(' ')
        };
      })
      .filter(entry => entry.url);
  }

  function knownCctvTitle(url) {
    const match = String(url || '').match(/\/match\/(\d+)\//);
    return match ? knownCctvMatchTitles[match[1]] || '' : '';
  }

  function detectUrlField(url) {
    const value = String(url || '').toLowerCase();
    if (/worldcup\.cctv\.com\/2026\/match\/\d+\/index\.shtml/.test(value)) return 'liveUrl';
    if (/\/video\/|\/vod\/|replay|huikan|回放|复播/.test(value)) return 'replayUrl';
    return 'replayUrl';
  }

  function shouldMirrorReplay(url) {
    return detectUrlField(url) === 'liveUrl';
  }

  function fieldLabel(field) {
    return field === 'liveUrl' ? '直播链接 liveUrl' : '复播链接 replayUrl';
  }

  async function resolveBulkEntries(entries) {
    const urls = Array.from(new Set(entries.map(entry => entry.url)));
    if (urls.length === 0) return entries;

    try {
      const response = await fetch(resolveLinksUrl, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ urls })
      });
      if (!response.ok) return entries;
      const payload = await response.json();
      const titleMap = {};
      (payload.resolved || []).forEach(item => {
        if (item.url && item.title) titleMap[item.url] = item.title;
      });
      return entries.map(entry => {
        const resolvedTitle = titleMap[entry.url] || knownCctvTitle(entry.url);
        return Object.assign({}, entry, {
          resolvedTitle,
          text: [entry.text, resolvedTitle].filter(Boolean).join(' ')
        });
      });
    } catch (error) {
      return entries.map(entry => {
        const resolvedTitle = knownCctvTitle(entry.url);
        return Object.assign({}, entry, {
          resolvedTitle,
          text: [entry.text, resolvedTitle].filter(Boolean).join(' ')
        });
      });
    }
  }

  function scoreEntryForMatch(entry, match) {
    if (isPlaceholder(match)) return -1;
    const text = normalizeText(entry.text);
    const pairA = normalizeText(match.home + match.away);
    const pairB = normalizeText(match.away + match.home);
    const dateA = match.date;
    const dateB = match.date.replace('/', '月') + '日';
    let score = 0;

    if (text.includes(normalizeText(match.home))) score += 4;
    if (text.includes(normalizeText(match.away))) score += 4;
    if (text.includes(normalizeText(dateA)) || text.includes(normalizeText(dateB))) score += 2;
    if (text.includes(pairA) || text.includes(pairB)) score += 2;
    if (entry.url.includes('cctv.com') || entry.url.includes('cntv.')) score += 1;
    return score;
  }

  function findBestMatch(entry) {
    let best = null;
    let bestScore = -1;
    matches.forEach(match => {
      const score = scoreEntryForMatch(entry, match);
      if (score > bestScore) {
        best = match;
        bestScore = score;
      }
    });
    return bestScore >= 8 ? { match: best, score: bestScore } : null;
  }

  async function previewImport() {
    previewImportButton.disabled = true;
    previewImportButton.textContent = '正在解析';

    const entries = await resolveBulkEntries(parseBulkLines(bulkInput.value));
    importMatches = entries.map(entry => {
      const result = findBestMatch(entry);
      return {
        entry,
        match: result ? result.match : null,
        score: result ? result.score : 0,
        targetField: detectUrlField(entry.url),
        mirrorReplay: shouldMirrorReplay(entry.url)
      };
    });

    previewImportButton.disabled = false;
    previewImportButton.textContent = '预览匹配';

    if (importMatches.length === 0) {
      importPreview.hidden = false;
      importPreview.innerHTML = '<div class="import-preview-row"><span class="import-badge miss">无链接</span><div>没有识别到 URL。</div><div></div></div>';
      applyImportButton.disabled = true;
      return;
    }

    importPreview.hidden = false;
    importPreview.innerHTML = importMatches.map(item => {
      const isMatch = Boolean(item.match);
      return `
        <div class="import-preview-row">
          <span class="import-badge${isMatch ? '' : ' miss'}">${isMatch ? '可绑定' : '需手动'}</span>
          <div class="import-source">${escapeHtml(item.entry.resolvedTitle || item.entry.text || item.entry.line)}</div>
          <div class="import-url">
            ${isMatch ? escapeHtml(matchLabel(item.match)) + ` · 写入 ${describeImportTarget(item)}<br>` : '没有找到双方队名都匹配的比赛<br>'}
            ${escapeHtml(item.entry.url)}
          </div>
        </div>
      `;
    }).join('');
    applyImportButton.disabled = !importMatches.some(item => item.match);
  }

  function applyImport() {
    let applied = 0;
    importMatches.forEach(item => {
      if (!item.match) return;
      const targetField = resolveTargetField(item);
      item.match[targetField] = item.entry.url;
      if (shouldApplyToReplay(item, targetField)) item.match.replayUrl = item.entry.url;
      applied += 1;
    });

    if (applied > 0) {
      setStatus(`已应用 ${applied} 条链接，待保存`, true);
      updateStats();
      renderMatches();
    }
  }

  function resolveTargetField(item) {
    const selectedField = bulkTargetField.value;
    if (selectedField === 'liveUrl' || selectedField === 'replayUrl') return selectedField;
    return item.targetField || detectUrlField(item.entry && item.entry.url);
  }

  function shouldApplyToReplay(item, targetField) {
    const selectedField = bulkTargetField.value;
    if (selectedField === 'replayUrl') return true;
    if (selectedField === 'liveUrl') return false;
    return targetField === 'liveUrl' && Boolean(item.mirrorReplay);
  }

  function describeImportTarget(item) {
    const targetField = resolveTargetField(item);
    if (shouldApplyToReplay(item, targetField) && targetField === 'liveUrl') {
      return '直播链接 liveUrl + 复播链接 replayUrl';
    }
    return fieldLabel(targetField);
  }

  function updateMatch(id, field, value) {
    const match = matches.find(item => item.id === id);
    if (!match) return;
    if (field === 'skipSeconds') {
      const trimmed = value.trim();
      if (trimmed === '') {
        delete match.skipSeconds;
      } else {
        match.skipSeconds = Math.max(0, Math.round(Number(trimmed) || 0));
      }
    } else {
      match[field] = value.trim();
    }
    setStatus('有未保存修改', true);
    updateStats();
  }

  async function loadMatches() {
    const response = await fetch(apiUrl, { cache: 'no-store', headers: adminToken ? { 'X-Admin-Token': adminToken } : {} });
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    if (!response.ok) throw new Error('无法读取比赛数据');
    matches = await response.json();
    setStatus('已加载', false);
    updateStats();
    renderMatches();
  }

  async function saveMatches() {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ matches })
    });

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }

    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || '保存失败');
    setStatus(`已保存 ${result.count} 场，备份：${result.backup}`, false);
  }

  async function attemptLogin(token) {
    adminToken = token.trim();
    localStorage.setItem('nospoilAdminToken', adminToken);
    await loadMatches();
    setAuthState(true);
  }

  function logout() {
    adminToken = '';
    isAuthenticated = false;
    localStorage.removeItem('nospoilAdminToken');
    setAuthState(false);
  }

  function downloadMatches() {
    const blob = new Blob([JSON.stringify(matches, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'matches.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function refreshOpenButton(card, field) {
    var row = card.querySelector('[data-field="' + field + '"]')?.closest('.match-url-row');
    if (!row) return;

    var openBtn = row.querySelector('.match-inline-open');
    var input = row.querySelector('[data-field="' + field + '"]');
    if (!openBtn || !input) return;

    var url = input.value.trim();
    if (url) {
      var skipInput = card.querySelector('[data-field="skipSeconds"]');
      var skipValue = skipInput && skipInput.value.trim() !== '' ? skipInput.value.trim() : null;
      var href = field === 'replayUrl' && skipValue != null ? addSkipHash(url, skipValue) : url;
      var a = document.createElement('a');
      a.className = 'match-inline-open';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = '在新标签页打开';
      a.textContent = '打开';
      openBtn.replaceWith(a);
    } else {
      var span = document.createElement('span');
      span.className = 'match-inline-open disabled';
      span.title = '暂无链接';
      span.textContent = '打开';
      openBtn.replaceWith(span);
    }
  }

  matchList.addEventListener('input', function(event) {
    var input = event.target;
    var card = input.closest('[data-id]');
    if (!card) return;
    var matchId = card.getAttribute('data-id');
    var field = input.getAttribute('data-field');

    // 当输入队名时，自动匹配并填充国旗代码
    if (field === 'home' || field === 'away') {
      var teamName = input.value.trim();
      var code = teamCodeMap[teamName];
      if (code) {
        var codeField = field === 'home' ? 'homeCode' : 'awayCode';
        var codeInput = card.querySelector('[data-field="' + codeField + '"]');
        if (codeInput) {
          codeInput.value = code;
          updateMatch(matchId, codeField, code);
        }
      }
    }

    // 当修改直播/复播链接或跳过秒数时，实时更新打开按钮
    if (field === 'liveUrl' || field === 'replayUrl') {
      refreshOpenButton(card, field);
    }
    if (field === 'skipSeconds') {
      refreshOpenButton(card, 'replayUrl');
    }

    // 当手动修改国旗代码时，也触发保存标记
    if (field === 'homeCode' || field === 'awayCode') {
      updateMatch(matchId, field, input.value);
    } else if (field !== 'home' && field !== 'away') {
      updateMatch(matchId, field, input.value);
    } else {
      updateMatch(matchId, field, input.value);
    }
  });

  // 单场维护区清除按钮 - 清除直播和复播链接
  matchList.addEventListener('click', function(event) {
    var btn = event.target.closest('[data-action="clear-urls"]');
    if (!btn) return;
    var card = btn.closest('[data-id]');
    if (!card) return;
    clearUrls(card.getAttribute('data-id'));
  });

  searchInput.addEventListener('input', renderMatches);
  roundFilter.addEventListener('change', renderMatches);
  previewImportButton.addEventListener('click', previewImport);
  applyImportButton.addEventListener('click', applyImport);
  clearImportButton.addEventListener('click', () => {
    bulkInput.value = '';
    importMatches = [];
    importPreview.hidden = true;
    importPreview.innerHTML = '';
    applyImportButton.disabled = true;
  });
  saveButton.addEventListener('click', () => {
    saveMatches().catch(error => {
      if (error.message === 'UNAUTHORIZED') {
        logout();
        setLoginError('登录已失效，请重新输入后台密码。');
        return;
      }
      setStatus(error.message, true);
    });
  });
  downloadButton.addEventListener('click', downloadMatches);
  if (logoutButton) logoutButton.addEventListener('click', logout);
  if (loginForm) {
    loginForm.addEventListener('submit', event => {
      event.preventDefault();
      loginError.hidden = true;
      attemptLogin(loginTokenInput.value).catch(error => {
        logout();
        setLoginError(error.message === 'UNAUTHORIZED' ? '后台密码错误，请重新输入。' : '暂时无法连接后台服务。');
      });
    });
  }

  window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  /* ===== 淘汰赛快速填充面板 ===== */
  var knockoutGrid = document.getElementById('knockout-grid');

  function renderKnockoutPanel() {
    if (!knockoutGrid) return;
    var koMatches = matches.filter(function(m) { return m.round !== 'group' && m.round !== 'pre'; });
    if (koMatches.length === 0) {
      knockoutGrid.innerHTML = '<div class="empty-state">暂无淘汰赛数据。</div>';
      return;
    }

    var teamOptions = teamNames.map(function(n) { return '<option value="' + escapeHtml(n) + '">'; }).join('');
    knockoutGrid.innerHTML =
      '<datalist id="ko-team-list">' + teamOptions + '</datalist>' +
      '<table class="knockout-table">' +
        '<thead><tr>' +
          '<th>ID</th><th>阶段</th><th>日期</th><th>时间</th>' +
          '<th>主队</th><th>代码</th><th></th><th>客队</th><th>代码</th>' +
          '<th>状态</th><th>操作</th>' +
        '</tr></thead>' +
        '<tbody>' +
          koMatches.map(function(match) {
            var roundLabel = roundLabels[match.round] || match.round;
            var isPending = isPlaceholder(match);
            return (
              '<tr class="' + (isPending ? 'ko-row-pending' : 'ko-row-done') + '" data-id="' + escapeHtml(match.id) + '">' +
                '<td><code>' + escapeHtml(match.id) + '</code></td>' +
                '<td>' + escapeHtml(roundLabel) + '</td>' +
                '<td>' + escapeHtml(match.date) + '</td>' +
                '<td>' + escapeHtml(match.timeBeijing) + '</td>' +
                '<td><input class="ko-team-input" data-field="home" ' +
                (match.home === '待定' ? 'placeholder="主队" ' : 'value="' + escapeHtml(match.home) + '" placeholder="主队" ') +
                'list="ko-team-list" autocomplete="off"></td>' +
                '<td><input class="ko-code-input" data-field="homeCode" value="' + escapeHtml(match.homeCode) +
                '" placeholder="代码" maxlength="6"></td>' +
                '<td class="ko-vs">vs</td>' +
                '<td><input class="ko-team-input" data-field="away" ' +
                (match.away === '待定' ? 'placeholder="客队" ' : 'value="' + escapeHtml(match.away) + '" placeholder="客队" ') +
                'list="ko-team-list" autocomplete="off"></td>' +
                '<td><input class="ko-code-input" data-field="awayCode" value="' + escapeHtml(match.awayCode) +
                '" placeholder="代码" maxlength="6"></td>' +
                '<td><span class="ko-status-tag' + (isPending ? ' tag-pending' : ' tag-ok') + '">' +
                (isPending ? '待更新' : '✓') + '</span></td>' +
                '<td><button class="ko-clear-btn" data-action="clear-match" title="重置为待定">清除</button></td>' +
              '</tr>'
            );
          }).join('') +
        '</tbody>' +
      '</table>';
  }

  // 清除单场比赛的直播/复播链接及主客队信息
  function clearUrls(matchId) {
    var match = matches.find(function(m) { return m.id === matchId; });
    if (!match) return;
    match.liveUrl = '';
    match.replayUrl = '';
    match.home = '待定';
    match.away = '待定';
    match.homeCode = 'xx';
    match.awayCode = 'xx';
    delete match.skipSeconds;
    setStatus('有未保存修改', true);
    updateStats();
    renderMatches();
  }

  // 清除单场比赛为待定
  function clearMatch(matchId) {
    var match = matches.find(function(m) { return m.id === matchId; });
    if (!match) return;
    match.home = '待定';
    match.away = '待定';
    match.homeCode = 'xx';
    match.awayCode = 'xx';
    setStatus('有未保存修改', true);
    updateStats();
    // 刷新两个面板
    renderMatches();
    renderKnockoutPanel();
  }

  // 淘汰赛面板输入事件：自动填充国旗代码
  if (knockoutGrid) {
    knockoutGrid.addEventListener('input', function(event) {
      var input = event.target;
      var row = input.closest('[data-id]');
      if (!row) return;
      var matchId = row.getAttribute('data-id');
      var field = input.getAttribute('data-field');

      if (field === 'home' || field === 'away') {
        var teamName = input.value.trim();
        var code = teamCodeMap[teamName];
        if (code) {
          var codeField = field === 'home' ? 'homeCode' : 'awayCode';
          var codeInput = row.querySelector('[data-field="' + codeField + '"]');
          if (codeInput) {
            codeInput.value = code;
            updateMatch(matchId, codeField, code);
          }
        }
        updateMatch(matchId, field, input.value);
      } else if (field === 'homeCode' || field === 'awayCode') {
        updateMatch(matchId, field, input.value);
      }

      // 实时刷新面板显示
      var koMatch = matches.find(function(m) { return m.id === matchId; });
      if (koMatch) {
        row.className = isPlaceholder(koMatch) ? 'ko-row-pending' : 'ko-row-done';
        var tag = row.querySelector('.ko-status-tag');
        if (tag) {
          tag.className = 'ko-status-tag' + (isPlaceholder(koMatch) ? ' tag-pending' : ' tag-ok');
          tag.textContent = isPlaceholder(koMatch) ? '待更新' : '✓';
        }
      }
      updateStats();
    });

    // 清除按钮点击事件
    knockoutGrid.addEventListener('click', function(event) {
      var btn = event.target.closest('[data-action="clear-match"]');
      if (!btn) return;
      var row = btn.closest('[data-id]');
      if (!row) return;
      var matchId = row.getAttribute('data-id');
      clearMatch(matchId);
    });
  }

  /* ===== 标签切换 ===== */
  var adminTabs = document.querySelectorAll('.admin-tab');
  adminTabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var targetTab = tab.getAttribute('data-tab');
      // 切换标签激活状态
      adminTabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      // 切换面板显示
      document.querySelectorAll('.admin-tab-panel').forEach(function(panel) {
        panel.hidden = true;
      });
      var targetPanel = document.getElementById('tab-' + targetTab);
      if (targetPanel) {
        targetPanel.hidden = false;
        if (targetTab === 'knockout') renderKnockoutPanel();
      }
    });
  });

  // 扩展 loadMatches，加载后同时渲染淘汰赛面板
  var _origLoadMatches = loadMatches;
  loadMatches = function() {
    return _origLoadMatches().then(function() {
      renderKnockoutPanel();
    });
  };

  // 扩展 applyImport，应用后刷新淘汰赛面板
  var _origApplyImport = applyImport;
  applyImport = function() {
    _origApplyImport();
    renderKnockoutPanel();
  };

  if (adminToken) {
    attemptLogin(adminToken).catch(error => {
      logout();
      setLoginError(error.message === 'UNAUTHORIZED' ? '后台密码错误，请重新输入。' : '暂时无法连接后台服务。');
    });
  } else {
    setAuthState(false);
  }
})();

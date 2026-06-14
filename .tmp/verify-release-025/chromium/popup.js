(function () {
  const STORAGE_KEY = 'nospoil_enabled';
  const DURATION_KEY = 'nospoil_hide_duration';

  const toggle = document.getElementById('enableToggle');
  const statusText = document.getElementById('statusText');
  const currentUrlEl = document.getElementById('currentUrl');
  const durationToggle = document.getElementById('durationToggle');
  const durationStatusText = document.getElementById('durationStatusText');
  const durationSection = document.querySelector('.duration-section');
  const SUPPORTED_URL_RE = /^https:\/\/([^/]+\.)*(scgs\.tv|cctv\.com|cntv\.cn|yangshipin\.cn|xiaohongshu\.com)\//i;

  function updateUI(enabled) {
    toggle.checked = enabled;
    if (enabled) {
      statusText.textContent = '已启用 — 正在保护您的观赛体验';
      statusText.className = 'status-text status-enabled';
      durationSection.classList.remove('disabled');
    } else {
      statusText.textContent = '已暂停 — 页面已恢复正常浏览';
      statusText.className = 'status-text status-disabled';
      durationSection.classList.add('disabled');
    }
  }

  function updateDurationUI(hide) {
    durationToggle.checked = hide;
    if (hide) {
      durationStatusText.textContent = '已开启 — 回放中不显示视频总时长';
    } else {
      durationStatusText.textContent = '已关闭 — 正常显示视频总时长';
    }
  }

  function canInjectIntoTab(tab) {
    return Boolean(tab && tab.id && tab.url && SUPPORTED_URL_RE.test(tab.url));
  }

  async function injectContentScript(tab) {
    if (!canInjectIntoTab(tab) || !chrome.scripting) return false;

    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['style.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      return true;
    } catch {
      return false;
    }
  }

  async function sendMessageWithInjection(tab, message) {
    if (!tab) return;

    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      const injected = await injectContentScript(tab);
      if (injected) {
        await chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  }

  async function sendToggleMessage(type, enabled) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await sendMessageWithInjection(tab, { type, enabled });
    } catch {
      // 忽略
    }
  }

  async function init() {
    // 显示当前页面信息
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        try {
          const url = new URL(tab.url);
          currentUrlEl.textContent = url.hostname || tab.url.slice(0, 40);
        } catch {
          currentUrlEl.textContent = tab.url.slice(0, 40);
        }
      }
    } catch {
      // 在某些上下文中可能无法获取 tabs
    }

    // 读取存储状态
    const result = await chrome.storage.local.get([STORAGE_KEY, DURATION_KEY]);
    const enabled = result[STORAGE_KEY] !== false;
    const hideDuration = result[DURATION_KEY] !== false;
    updateUI(enabled);
    updateDurationUI(hideDuration);
    if (enabled) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await sendMessageWithInjection(tab, { type: 'nospoil_toggle', enabled: true });
        await sendMessageWithInjection(tab, { type: 'nospoil_duration_toggle', enabled: hideDuration });
      } catch {
        // 忽略
      }
    }

    toggle.addEventListener('change', async () => {
      const newState = toggle.checked;
      await chrome.storage.local.set({ [STORAGE_KEY]: newState });
      updateUI(newState);
      sendToggleMessage('nospoil_toggle', newState);
      window.close();
    });

    durationToggle.addEventListener('change', async () => {
      const newState = durationToggle.checked;
      await chrome.storage.local.set({ [DURATION_KEY]: newState });
      updateDurationUI(newState);
      sendToggleMessage('nospoil_duration_toggle', newState);
      window.close();
    });
  }

  init();
})();

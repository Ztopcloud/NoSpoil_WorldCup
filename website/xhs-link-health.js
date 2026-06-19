const XHS_HOST_RE = /(^|\.)xiaohongshu\.com$/i;
const XHS_URL_RE = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\/[A-Za-z0-9]+[^\s"'<>]*/gi;
const LOGIN_TEXT_RE = /(登录后|登录小红书|扫码登录|验证码登录|手机号登录|打开小红书|下载小红书|请先登录|注册\/登录|注册登录)/i;
const NOT_FOUND_TEXT_RE = /(内容不存在|无法查看|已被删除|笔记已被删除|该内容无法展示|页面不见了)/i;

function isXhsUrl(url) {
  try {
    return XHS_HOST_RE.test(new URL(String(url || '')).hostname);
  } catch (err) {
    return false;
  }
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([^<]{0,240})<\/title>/i);
  return match ? decodeHtml(match[1].trim()) : '';
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function classifyXhsHtml(html) {
  const source = String(html || '');
  const title = extractTitle(source);
  const hasVideoTag = /<video\b/i.test(source);
  const hasVideoMetadata = /("video"\s*:\s*\{|og:video|twitter:player|video_src)/i.test(source);
  const needsLogin = LOGIN_TEXT_RE.test(source);
  const notFound = NOT_FOUND_TEXT_RE.test(source);

  let status = 'unknown';
  if (notFound) {
    status = 'not_found';
  } else if (hasVideoTag && !needsLogin) {
    status = 'web_playable';
  } else if (needsLogin || (hasVideoMetadata && !hasVideoTag)) {
    status = 'restricted';
  }

  return {
    status,
    title,
    hasVideoTag,
    hasVideoMetadata,
    needsLogin,
    notFound
  };
}

async function inspectXhsLink(url, options = {}) {
  const timeoutMs = options.timeoutMs || 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    return {
      url,
      finalUrl: response.url,
      httpStatus: response.status,
      ok: response.ok,
      ...classifyXhsHtml(html)
    };
  } catch (err) {
    return {
      url,
      finalUrl: '',
      httpStatus: 0,
      ok: false,
      status: 'network_error',
      title: '',
      hasVideoTag: false,
      hasVideoMetadata: false,
      needsLogin: false,
      notFound: false,
      error: err.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  XHS_URL_RE,
  isXhsUrl,
  classifyXhsHtml,
  inspectXhsLink
};

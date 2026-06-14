const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const defaultStateFile = path.join(rootDir, 'data', 'baidu-submitted-urls.json');
const defaultSite = 'https://scgs.tv';
const defaultTimeoutMs = 10000;

function siteOrigin() {
  return String(process.env.BAIDU_SUBMIT_SITE || defaultSite).replace(/\/+$/, '');
}

function submitEndpoint() {
  return String(process.env.BAIDU_SUBMIT_ENDPOINT || '').trim();
}

function stateFilePath() {
  return process.env.BAIDU_SUBMIT_STATE_FILE || defaultStateFile;
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function readState() {
  const state = readJsonFile(stateFilePath(), { submittedUrls: [], submittedKeys: [] });
  return {
    submittedUrls: Array.isArray(state.submittedUrls) ? state.submittedUrls : [],
    submittedKeys: Array.isArray(state.submittedKeys) ? state.submittedKeys : []
  };
}

function writeState(state) {
  writeJsonFile(stateFilePath(), {
    submittedUrls: Array.from(new Set(state.submittedUrls)).sort(),
    submittedKeys: Array.from(new Set(state.submittedKeys)).sort()
  });
}

function publicUrlForPath(publicPath) {
  const trimmed = String(publicPath || '').trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    return parsed.href.replace(/#.*$/, '');
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${siteOrigin()}${normalizedPath}`.replace(/#.*$/, '');
}

function htmlFileToPublicUrl(filePath) {
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  if (relativePath === 'index.html') return `${siteOrigin()}/`;
  return publicUrlForPath(relativePath);
}

function walkFiles(dir, result) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['assets', 'data', 'node_modules', 'public'].includes(entry.name)) return;
      walkFiles(fullPath, result);
      return;
    }
    result.push(fullPath);
  });
  return result;
}

function collectStaticPageUrls() {
  return walkFiles(rootDir, [])
    .filter(filePath => path.extname(filePath).toLowerCase() === '.html')
    .filter(filePath => !['admin.html', 'install.html'].includes(path.basename(filePath).toLowerCase()))
    .map(htmlFileToPublicUrl);
}

function matchKey(match, field) {
  return `match:${match.id}:${field}:${match[field]}`;
}

function collectNewMatchPageUrls(previousMatches, nextMatches, state) {
  const previousById = new Map((previousMatches || []).map(match => [match.id, match]));
  const submittedKeys = new Set(state.submittedKeys || []);
  const submittedUrls = new Set(state.submittedUrls || []);
  const urls = [];
  const keys = [];

  (nextMatches || []).forEach(match => {
    if (!match || !match.id) return;
    const previous = previousById.get(match.id) || {};
    const becamePublished = ['liveUrl', 'replayUrl'].some(field => {
      return match[field] && match[field] !== previous[field] && !submittedKeys.has(matchKey(match, field));
    });

    ['pageUrl', 'publicUrl', 'canonicalUrl'].forEach(field => {
      const url = publicUrlForPath(match[field]);
      if (url && match[field] !== previous[field] && !submittedUrls.has(url)) urls.push(url);
    });

    if (becamePublished) {
      urls.push(`${siteOrigin()}/`);
      ['liveUrl', 'replayUrl'].forEach(field => {
        if (match[field]) keys.push(matchKey(match, field));
      });
    }
  });

  return { urls, keys };
}

function dedupeUrls(urls) {
  const origin = new URL(siteOrigin()).origin;
  return Array.from(new Set((urls || [])
    .map(publicUrlForPath)
    .filter(Boolean)
    .filter(url => {
      try {
        return new URL(url).origin === origin;
      } catch (error) {
        return false;
      }
    })));
}

async function postToBaidu(urls) {
  const endpoint = submitEndpoint();
  if (!endpoint) {
    return { ok: false, skipped: true, error: 'BAIDU_SUBMIT_ENDPOINT is not set' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.BAIDU_SUBMIT_TIMEOUT_MS || defaultTimeoutMs));
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'User-Agent': 'NoSpoilWorldCupBaiduSubmit/1.0'
      },
      body: urls.join('\n')
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = { raw: text };
    }
    const hasPayloadError = payload && (payload.error || payload.message === 'over quota');
    return {
      ok: response.ok && !hasPayloadError,
      status: response.status,
      submitted: urls.length,
      response: payload
    };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function submitUrls(urls, options) {
  const state = readState();
  const submittedUrls = new Set(state.submittedUrls);
  const shouldForce = Boolean(options && options.force);
  const nextUrls = dedupeUrls(urls).filter(url => shouldForce || !submittedUrls.has(url));

  if (nextUrls.length === 0) {
    return { ok: true, skipped: true, submitted: 0, urls: [] };
  }

  const result = await postToBaidu(nextUrls);
  if (result.ok) {
    nextUrls.forEach(url => submittedUrls.add(url));
    (options && options.keys ? options.keys : []).forEach(key => state.submittedKeys.push(key));
    writeState({
      submittedUrls: Array.from(submittedUrls),
      submittedKeys: state.submittedKeys
    });
  }
  return Object.assign({ urls: nextUrls }, result);
}

async function submitChangedMatches(previousMatches, nextMatches) {
  const state = readState();
  const collected = collectNewMatchPageUrls(previousMatches, nextMatches, state);
  return submitUrls(collected.urls, { keys: collected.keys, force: true });
}

async function submitStaticPages() {
  return submitUrls(collectStaticPageUrls());
}

async function runCli() {
  const args = process.argv.slice(2);
  let result;

  if (args.includes('--scan')) {
    result = await submitStaticPages();
  } else if (args.includes('--url')) {
    const index = args.indexOf('--url');
    result = await submitUrls(args.slice(index + 1));
  } else {
    console.log('Usage: node baidu-submit.js --scan');
    console.log('   or: node baidu-submit.js --url https://www.scgs.tv/new-page.html');
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && !result.skipped) process.exitCode = 1;
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  collectStaticPageUrls,
  submitChangedMatches,
  submitStaticPages,
  submitUrls
};

const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const dataFile = path.join(rootDir, 'data', 'matches.json');
const port = Number(process.env.PORT || 4181);
const host = process.env.HOST || '0.0.0.0';
const adminToken = process.env.ADMIN_TOKEN || '';
const knownCctvMatchTitles = {
  '22920296': '2026年世界杯：墨西哥VS南非'
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.zip': 'application/zip'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers || {}));
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload, null, 2), { 'Content-Type': 'application/json; charset=utf-8' });
}

function isAuthorized(req) {
  if (!adminToken) return true;
  const headerToken = req.headers['x-admin-token'] || '';
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return headerToken === adminToken || bearer === adminToken;
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > limitBytes) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function normalizeTitle(value) {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .replace(/_央视网.*$/i, '')
    .replace(/-央视网.*$/i, '')
    .trim();
}

function knownCctvTitle(url) {
  const match = String(url || '').match(/\/match\/(\d+)\//);
  return match ? knownCctvMatchTitles[match[1]] || '' : '';
}

async function fetchResolvedTitle(url) {
  const knownTitle = knownCctvTitle(url);
  if (knownTitle) return knownTitle;

  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('only http(s) URLs are supported');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NoSpoilWorldCupAdmin/1.0',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
    const html = await response.text();
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    return normalizeTitle((ogTitle && ogTitle[1]) || (title && title[1]) || (description && description[1]) || '');
  } finally {
    clearTimeout(timeout);
  }
}

function assertSafeMatches(matches) {
  if (!Array.isArray(matches)) throw new Error('matches must be an array');
  const ids = new Set();

  matches.forEach((match, index) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)) {
      throw new Error(`match at ${index} must be an object`);
    }
    ['id', 'date', 'timeBeijing', 'home', 'away', 'round'].forEach(key => {
      if (typeof match[key] !== 'string') throw new Error(`${match.id || index}: missing ${key}`);
    });
    if (ids.has(match.id)) throw new Error(`duplicate id: ${match.id}`);
    ids.add(match.id);

    ['liveUrl', 'replayUrl'].forEach(key => {
      if (match[key] == null) match[key] = '';
      if (typeof match[key] !== 'string') throw new Error(`${match.id}: ${key} must be a string`);
      if (match[key] && !/^https?:\/\//i.test(match[key])) {
        throw new Error(`${match.id}: ${key} must start with http:// or https://`);
      }
    });
  });
}

function writeMatches(matches) {
  assertSafeMatches(matches);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(path.dirname(dataFile), `matches.${stamp}.bak.json`);
  if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, backupFile);
  fs.writeFileSync(dataFile, JSON.stringify(matches, null, 2) + '\n', 'utf8');
  return backupFile;
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';

  const target = path.normalize(path.join(rootDir, pathname));
  if (!target.startsWith(rootDir)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(target, (error, content) => {
    if (error) {
      send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    const headers = { 'Content-Type': mimeTypes[path.extname(target)] || 'application/octet-stream' };
    if (['/admin', '/admin.html', '/admin.js', '/admin.css', '/data/matches.json'].includes(pathname)) {
      headers['Cache-Control'] = 'no-store, max-age=0';
    }
    send(res, 200, content, headers);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, 'http://localhost');

    if (requestUrl.pathname === '/api/matches') {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized. Set ADMIN_TOKEN in the admin page.' });
        return;
      }

      if (req.method === 'GET') {
        const content = fs.readFileSync(dataFile, 'utf8');
        send(res, 200, content, { 'Content-Type': 'application/json; charset=utf-8' });
        return;
      }

      if (req.method === 'POST') {
        const body = await readBody(req, 2 * 1024 * 1024);
        const payload = JSON.parse(body);
        const backupFile = writeMatches(payload.matches);
        sendJson(res, 200, {
          ok: true,
          count: payload.matches.length,
          backup: path.relative(rootDir, backupFile).replace(/\\/g, '/')
        });
        return;
      }
    }

    if (requestUrl.pathname === '/api/resolve-links') {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized. Set ADMIN_TOKEN in the admin page.' });
        return;
      }

      if (req.method === 'POST') {
        const body = await readBody(req, 512 * 1024);
        const payload = JSON.parse(body);
        const urls = Array.isArray(payload.urls) ? payload.urls.slice(0, 50) : [];
        const resolved = await Promise.all(urls.map(async url => {
          try {
            return { url, title: await fetchResolvedTitle(url), ok: true };
          } catch (error) {
            return { url, title: knownCctvTitle(url), ok: false, error: error.message };
          }
        }));
        sendJson(res, 200, { resolved });
        return;
      }
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`NoSpoil admin server: http://localhost:${port}/admin`);
    console.log(`NoSpoil admin server: http://127.0.0.1:${port}/admin`);
    if (adminToken) console.log('ADMIN_TOKEN is enabled.');
  });
}

module.exports = { createServer, dataFile, writeMatches, fetchResolvedTitle, knownCctvTitle };

const CACHE_VERSION = 'scgs-tv-pwa-v12';
const CORE_ASSETS = [
  './',
  './index.html',
  './plugin.html',
  './disclaimer.html',
  './styles.css',
  './app.js',
  './pwa-register.js',
  './manifest.webmanifest',
  './assets/logo-white-wide.png',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png',
  './assets/hero-bg.png',
  './assets/disclaimer-hero-bg.png',
  './assets/360.png',
  './assets/QQ.png',
  './assets/UC.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/matches.json')) {
    // 缓存优先 + 后台更新：立即返回缓存，同时在后台拉取最新数据更新缓存
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigateWithFallback(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function navigateWithFallback(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return cache.match(request) || cache.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkOnly(request) {
  return fetch(request);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(function(response) {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  // 有缓存就立即返回缓存，同时在后台拉取最新数据
  return cached || fetchPromise;
}

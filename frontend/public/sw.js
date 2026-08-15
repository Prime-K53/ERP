const CACHE_VERSION = 'primeerp-cloud-pwa-v26-03-5-001';
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;
const OFFLINE_FALLBACK_URL = '/offline.html';

const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/pwa-icon-192x192.png',
  '/pwa-icon-192x192-maskable.png',
  '/pwa-icon-512x512.png',
  '/pwa-icon-512x512-maskable.png',
  '/screenshot-dashboard.png',
  '/screenshot-mobile.png',
  OFFLINE_FALLBACK_URL
];

const isCacheableAsset = (pathname) => /\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff|woff2|ttf)$/i.test(pathname);

const collectManifestAssets = (manifest) => {
  const assets = new Set();

  const visit = (value) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value === 'string') {
      if (value.startsWith('/')) {
        assets.add(value);
      } else if (!/^https?:\/\//i.test(value)) {
        assets.add(`/${value.replace(/^\/+/, '')}`);
      }
      return;
    }

    if (typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };

  visit(manifest);
  return Array.from(assets);
};

const precacheBuildAssets = async () => {
  try {
    const manifestResponse = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) return;

    const manifest = await manifestResponse.json();
    const assets = collectManifestAssets(manifest);
    if (assets.length === 0) return;

    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(assets);
  } catch {
    // The build asset manifest is optional in development and older deployments.
  }
};

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
};

const networkFirst = async (request, cacheName, fallbackResponse) => {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || fallbackResponse || Response.error();
  }
};

const handleNavigation = async (request) => {
  const fallback = await caches.match('/index.html') || await caches.match(OFFLINE_FALLBACK_URL);
  return networkFirst(request, RUNTIME_CACHE, fallback);
};

const handleApiGet = async (request) => {
  const offlineJson = new Response(JSON.stringify({
    error: 'network_unavailable',
    message: 'Prime ERP requires an internet connection. Business data is not stored locally.'
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });

  return networkFirst(request, RUNTIME_CACHE, offlineJson);
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL_FILES);
    await precacheBuildAssets();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('primeerp-') && !key.startsWith(CACHE_VERSION))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
    await precacheBuildAssets();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (
    url.pathname.endsWith('/__open-in-editor') ||
    url.pathname.includes('/@vite/') ||
    url.pathname.includes('/@react-refresh') ||
    url.pathname === '/@vite/client' ||
    request.headers?.get('Upgrade')?.toLowerCase() === 'websocket'
  ) {
    return;
  }

  if (url.origin !== self.location.origin) {
    if (url.hostname.endsWith('.supabase.co')) {
      // Supabase REST/Realtime — NetworkOnly: never cache database responses
      event.respondWith(fetch(request).catch(() => {
        return new Response(JSON.stringify({
          error: 'network_unavailable',
          message: 'Cloud data requires an internet connection. Business data is not stored locally.'
        }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }));
      return;
    }

    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/functions/v1/')) {
      // Supabase REST/functions — NetworkOnly: never cache stale data
      event.respondWith(fetch(request).catch(() => {
        return new Response(JSON.stringify({
          error: 'network_unavailable',
          message: 'Cloud data requires an internet connection.'
        }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }));
      return;
    }

    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    // All API calls — NetworkOnly: never cache stale business data
    event.respondWith(fetch(request).catch(() => {
      const msg = url.pathname.startsWith('/api/inventory')
        ? 'Cannot load inventory data. Please check your connection.'
        : 'Cloud data requires an internet connection. Business data is not stored locally.';
      return new Response(JSON.stringify({
        error: 'network_unavailable',
        message: msg
      }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }));
    return;
  }

  if (isCacheableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

import { build, files, version } from '$service-worker';

const CACHE = `videoflam-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Don't cache API calls or large media
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api') ||
      /\.(mp4|mp3|wav|webm|blob)$/.test(url.pathname)) return;

  e.respondWith(
    caches.match(e.request).then(r => r ?? fetch(e.request))
  );
});

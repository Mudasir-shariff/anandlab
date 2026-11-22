// Labflow Service Worker for PWA (Installable on Android & Windows)
const CACHE_NAME = 'labflow-app-v1.3.1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './report.css',
  './app.js',
  './catalog.js',
  './report.js',
  './supabase.js',
  './manifest.json',
  './assets/favicon.ico',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('PWA cache error during install:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network first strategy with fallback to cache for shell files
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip supabase API requests from service worker caching
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

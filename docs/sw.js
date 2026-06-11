const APP_VERSION = '1.1';
const CACHE = `opportunity-cost-${APP_VERSION}`;

const PRECACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) {
                return cached;
            }

            return fetch(event.request).then(response => {
                if (
                    response.ok &&
                    event.request.url.startsWith(self.location.origin)
                ) {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache =>
                        cache.put(event.request, copy)
                    );
                }

                return response;
            });
        })
    );
});

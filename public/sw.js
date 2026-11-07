const CACHE_VERSION = '2.6';
const CACHE_NAME = `alfiepro-v${CACHE_VERSION}`;
const RUNTIME_CACHE = `alfiepro-runtime-v${CACHE_VERSION}`;
const API_CACHE = `alfiepro-api-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

const OAUTH_ROUTES = [
  '/stripe-oauth-callback',
  '/auth/callback/youtube'
];

const SUPABASE_DOMAINS = [
  'supabase.co',
  'supabase.com'
];

const EXTERNAL_DOMAINS_TO_SKIP = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'ytimg.com',
  'googlevideo.com',
  'googleusercontent.com',
  'gstatic.com',
  'ggpht.com'
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
    }).then(cachesToDelete => {
      return Promise.all(cachesToDelete.map(cacheToDelete => {
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  // Skip service worker for YouTube and related domains
  const isExternalDomainToSkip = EXTERNAL_DOMAINS_TO_SKIP.some(domain => url.hostname.includes(domain));
  if (isExternalDomainToSkip) {
    return;
  }

  // Never cache OAuth callback routes
  const isOAuthRoute = OAUTH_ROUTES.some(route => url.pathname.startsWith(route));
  if (isOAuthRoute) {
    event.respondWith(
      fetch('/index.html').then(response => {
        return response;
      }).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Skip iframe embeds
  if (request.destination === 'iframe') {
    return;
  }

  // Handle navigation requests - network first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch('/index.html').then(response => {
        // Cache the fresh index.html
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put('/index.html', responseToCache);
        });
        return response;
      }).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Supabase requests
  const isSupabaseRequest = SUPABASE_DOMAINS.some(domain => url.hostname.includes(domain));
  if (isSupabaseRequest) {
    // Public files (images, documents): show the saved copy, refresh it in the background
    if (url.pathname.includes('/storage/v1/object/public/')) {
      event.respondWith(cacheThenRefresh(request, RUNTIME_CACHE));
      return;
    }
    // Database reads: always from the server so changes show straight away.
    // The saved copy is only used when the device is offline.
    if (url.pathname.startsWith('/rest/v1/')) {
      event.respondWith(networkFirst(request, API_CACHE));
      return;
    }
    // Sign-in, functions, realtime and everything else: straight to the network
    return;
  }

  // Same-origin static assets (JS, CSS, fonts, images) - cache first, network fallback
  if (url.origin === location.origin) {
    // JS and CSS bundles with hashes - cache first (immutable content)
    const isHashedAsset = /\/assets\/.*\.[a-f0-9]{8,}\.(js|css)$/i.test(url.pathname);
    if (isHashedAsset) {
      event.respondWith(
        caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          }).catch(() => {
            return new Response('', { status: 503, statusText: 'Offline' });
          });
        })
      );
      return;
    }

    // Images - cache first
    if (request.destination === 'image') {
      event.respondWith(
        caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          }).catch(() => {
            return new Response('', { status: 503, statusText: 'Offline' });
          });
        })
      );
      return;
    }

    // Other same-origin assets - network first, cache fallback
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        return caches.match(request).then(cachedResponse => {
          return cachedResponse || new Response('', { status: 503, statusText: 'Offline' });
        });
      })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  const db = await openIndexedDB();
  const pendingChanges = await getPendingChanges(db);

  for (const change of pendingChanges) {
    try {
      await fetch(change.url, {
        method: change.method,
        headers: change.headers,
        body: change.body
      });
      await removePendingChange(db, change.id);
    } catch (error) {
      console.error('Sync failed for change:', change, error);
    }
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AlfiePRO', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPendingChanges(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineQueue'], 'readonly');
    const store = transaction.objectStore('offlineQueue');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function removePendingChange(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const copy = response.clone();
      caches.open(cacheName).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(JSON.stringify({
      error: 'offline',
      message: 'Network unavailable.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheThenRefresh(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  const refresh = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  });
  if (cachedResponse) {
    refresh.catch(() => {});
    return cachedResponse;
  }
  return refresh.catch(() => new Response('', { status: 503, statusText: 'Offline' }));
}

self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    const cache = await caches.open(API_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map(key => cache.delete(key)));
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
  }

  if (event.data && event.data.type === 'CHECK_CACHE_STATUS') {
    const cache = await caches.open(API_CACHE);
    const keys = await cache.keys();
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        cacheSize: keys.length,
        cacheName: API_CACHE
      });
    }
  }
});

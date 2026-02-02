const CACHE_VERSION = '2.4';
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

const API_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const STALE_WHILE_REVALIDATE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

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

  // CRITICAL: Skip service worker for YouTube and related domains
  // This prevents interference with video streaming
  const isExternalDomainToSkip = EXTERNAL_DOMAINS_TO_SKIP.some(domain => url.hostname.includes(domain));
  if (isExternalDomainToSkip) {
    return; // Let the browser handle it directly - NO CACHING
  }

  // CRITICAL: Never cache OAuth callback routes - they must always be fresh
  const isOAuthRoute = OAUTH_ROUTES.some(route => url.pathname.startsWith(route));
  if (isOAuthRoute) {
    // For OAuth routes, always fetch fresh and serve the SPA shell
    event.respondWith(
      fetch('/index.html').then(response => {
        return response;
      }).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // CRITICAL: Skip iframe embeds to prevent video glitching
  if (request.destination === 'iframe') {
    return; // Let browser handle iframes directly
  }

  // Handle navigation requests (page loads) - always serve fresh SPA shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch('/index.html').then(response => {
        return response;
      }).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  const isSupabaseRequest = SUPABASE_DOMAINS.some(domain => url.hostname.includes(domain));

  if (isSupabaseRequest) {
    event.respondWith(
      staleWhileRevalidate(request, API_CACHE)
    );
    return;
  }

  if (url.origin === location.origin) {
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
          });
        })
      );
      return;
    }

    event.respondWith(
      caches.match(request).then(cachedResponse => {
        return cachedResponse || fetch(request).then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
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

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        const responseToCache = response.clone();
        const headers = new Headers(responseToCache.headers);
        headers.set('sw-cache-time', Date.now().toString());

        const responseWithTimestamp = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: headers
        });

        cache.put(request, responseWithTimestamp);
      }
      return response;
    })
    .catch(error => {
      console.log('Fetch failed, using cache:', error);
      return cachedResponse || new Response(JSON.stringify({
        error: 'offline',
        message: 'Network unavailable. Showing cached data.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    });

  if (cachedResponse) {
    const cacheTime = cachedResponse.headers.get('sw-cache-time');
    const age = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

    if (age < API_CACHE_DURATION) {
      fetchPromise.catch(() => {});
      return cachedResponse;
    }

    if (age < STALE_WHILE_REVALIDATE_DURATION) {
      const cachedClone = cachedResponse.clone();
      const headers = new Headers(cachedClone.headers);
      headers.set('X-Cache-Status', 'stale');

      const staleResponse = new Response(cachedClone.body, {
        status: cachedClone.status,
        statusText: cachedClone.statusText,
        headers: headers
      });

      fetchPromise.catch(() => {});
      return staleResponse;
    }
  }

  return fetchPromise;
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

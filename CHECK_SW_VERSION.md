# Check Service Worker Version

## Quick Check in Browser Console

Paste this in your browser console on www.alfiepro.com.au:

```javascript
fetch('/sw.js').then(r => r.text()).then(text => {
  const match = text.match(/CACHE_VERSION = '([^']+)'/);
  console.log('🔍 Server sw.js version:', match ? match[1] : 'NOT FOUND');

  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg && reg.active) {
      console.log('✅ Active SW:', reg.active.scriptURL);
      console.log('📅 SW State:', reg.active.state);

      // Check what the active SW has cached
      caches.keys().then(names => {
        console.log('💾 Active caches:', names);
        const versionCache = names.find(n => n.startsWith('alfiepro-v'));
        if (versionCache) {
          console.log('📦 Running cache version:', versionCache);
        }
      });
    } else {
      console.log('❌ No active service worker');
    }
  });
});
```

## What You Should See

**If updated correctly:**
```
🔍 Server sw.js version: 2.2
📦 Running cache version: alfiepro-v2.2
```

**If NOT updated:**
```
🔍 Server sw.js version: 2.0 or 2.1
📦 Running cache version: alfiepro-v2.0 or alfiepro-v2.1
```

## Force Update Steps

### Step 1: Unregister Old Service Worker

```javascript
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister();
    console.log('✅ Unregistered:', registration.scope);
  }
});
```

### Step 2: Clear All Caches

```javascript
caches.keys().then(cacheNames => {
  return Promise.all(
    cacheNames.map(cacheName => {
      console.log('🗑️ Deleting cache:', cacheName);
      return caches.delete(cacheName);
    })
  );
}).then(() => {
  console.log('✅ All caches cleared');
});
```

### Step 3: Hard Reload

After running steps 1 and 2, do a **hard refresh**:
- **Windows/Linux:** Ctrl + Shift + R
- **Mac:** Cmd + Shift + R

### Step 4: Verify

Run the version check script again. You should now see:
```
🔍 Server sw.js version: 2.2
📦 Running cache version: alfiepro-v2.2
```

## If Server Still Shows Old Version

Your CDN/hosting is caching the sw.js file. You need to:

1. **Netlify:** Trigger cache invalidation
2. **Vercel:** Redeploy or clear cache
3. **Cloudflare:** Purge cache for sw.js
4. **AWS CloudFront:** Invalidate /sw.js path

## Complete Nuclear Option

If nothing else works:

```javascript
// Run this in console
(async () => {
  // 1. Unregister all service workers
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(r => r.unregister()));
  console.log('✅ Service workers unregistered');

  // 2. Clear all caches
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('✅ Caches cleared');

  // 3. Clear localStorage
  localStorage.clear();
  console.log('✅ LocalStorage cleared');

  // 4. Clear sessionStorage
  sessionStorage.clear();
  console.log('✅ SessionStorage cleared');

  // 5. Hard reload
  window.location.reload(true);
})();
```

**WARNING:** This clears ALL data including login sessions!

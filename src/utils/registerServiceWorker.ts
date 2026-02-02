export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    console.log('Service Worker registered successfully:', registration);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('New service worker available');
          const event = new CustomEvent('swUpdate', { detail: registration });
          window.dispatchEvent(event);
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

export function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }

  return navigator.serviceWorker.ready
    .then(registration => registration.unregister())
    .catch(error => {
      console.error('Service Worker unregistration failed:', error);
      return false;
    });
}

export function checkForServiceWorkerUpdate(registration: ServiceWorkerRegistration): Promise<void> {
  return registration.update();
}

function isServiceWorkerSupported(): boolean {
  // Check if service workers are supported at all
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  // Detect StackBlitz environment
  const isStackBlitz =
    window.location.hostname.includes('stackblitz') ||
    window.location.hostname.includes('webcontainer') ||
    typeof (window as any).process !== 'undefined';

  // Detect other development/preview environments that may not support SW
  const isUnsupportedEnvironment =
    window.location.protocol === 'file:' ||
    (window.location.hostname === 'localhost' && import.meta.env.DEV);

  return !isStackBlitz && !isUnsupportedEnvironment;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    // Silently skip registration in unsupported environments
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
    // Silently handle registration errors in development
    if (import.meta.env.DEV) {
      console.log('Service Worker registration skipped in development');
    } else {
      console.error('Service Worker registration failed:', error);
    }
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

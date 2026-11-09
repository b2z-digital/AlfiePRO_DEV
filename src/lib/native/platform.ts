import { Capacitor } from '@capacitor/core';

/**
 * Where the app is running. Native = inside the iOS / Android app built with Capacitor.
 * Everything native goes through src/lib/native so the web build is unaffected.
 */
export const isNative: boolean = Capacitor.isNativePlatform();
export const nativePlatform: 'ios' | 'android' | 'web' = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
export const isIOS = nativePlatform === 'ios';
export const isAndroid = nativePlatform === 'android';

/** Deep-link scheme shared with the live Expo app (alfiepro://). */
export const APP_SCHEME = 'alfiepro';

/** OAuth providers send the browser back here; must be in Supabase Auth → URL configuration → Redirect URLs. */
export const NATIVE_AUTH_CALLBACK = `${APP_SCHEME}://auth/callback`;

/** Public web address, used when the app needs a shareable link. */
export const WEB_APP_ORIGIN = 'https://app.alfiepro.com.au';

/** Value for Supabase's X-Client-Info header, so API logs show which surface made a call. */
export const clientInfo = isNative ? `alfie-pro-${nativePlatform}` : 'alfie-pro-web';

/** Push registration stays off until the server can send to APNs/FCM tokens (see MOBILE.md). */
export const nativePushEnabled = isNative && import.meta.env.VITE_NATIVE_PUSH === 'true';

/**
 * Navigate from outside React Router (deep links, notification taps).
 * BrowserRouter listens for popstate, so this behaves like a router push.
 */
export function navigateTo(path: string) {
  if (!path.startsWith('/')) path = `/${path}`;
  const current = window.location.pathname + window.location.search;
  if (current === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

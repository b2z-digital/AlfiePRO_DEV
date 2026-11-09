import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { isNative, isAndroid, navigateTo } from './platform';
import { parseAppUrl } from './deepLinks';

/**
 * Native start-up for the Capacitor apps. Does nothing in a browser.
 * Called once from main.tsx before React renders.
 */
export async function initNative() {
  if (!isNative) return;

  const root = document.documentElement;
  root.classList.add('is-native', isAndroid ? 'is-android' : 'is-ios');

  // Status bar: transparent over the page; text colour follows the Alfie theme
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    const syncStatusBar = () => {
      const light = root.classList.contains('alfie-light');
      void StatusBar.setStyle({ style: light ? Style.Light : Style.Dark });
    };
    syncStatusBar();
    new MutationObserver(syncStatusBar).observe(root, { attributes: true, attributeFilter: ['class'] });
  } catch { /* not available */ }

  // Keyboard: expose its height so fixed composers and sheets can sit above it
  try {
    await Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
      root.style.setProperty('--native-keyboard', `${keyboardHeight}px`);
      root.classList.add('keyboard-open');
    });
    await Keyboard.addListener('keyboardWillHide', () => {
      root.style.setProperty('--native-keyboard', '0px');
      root.classList.remove('keyboard-open');
    });
  } catch { /* not available */ }

  // Deep links: alfiepro://… and (later) universal links
  await App.addListener('appUrlOpen', ({ url }) => { void handleAppUrl(url); });
  const launch = await App.getLaunchUrl();
  if (launch?.url) void handleAppUrl(launch.url);

  // Android hardware back: go back in history, or leave the app from the root
  if (isAndroid) {
    await App.addListener('backButton', ({ canGoBack }) => {
      // Let open sheets close themselves first (they listen for this event)
      const evt = new CustomEvent('alfie-native-back', { cancelable: true });
      if (!window.dispatchEvent(evt)) return;
      if (canGoBack && window.location.pathname !== '/') window.history.back();
      else void App.exitApp();
    });
  }

  // Coming back to the app: let screens refresh stale data
  await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('alfie-native-resume'));
  });

  // Push stays off until the server side is ready (see push.ts)
  void import('./push').then((m) => m.initNativePush()).catch(() => {});
}

/** Hide the native splash once the first screen has painted (the web #alf-boot splash takes over). */
export function hideNativeSplash() {
  if (!isNative) return;
  requestAnimationFrame(() => { void SplashScreen.hide({ fadeOutDuration: 200 }); });
}

async function handleAppUrl(url: string) {
  const link = parseAppUrl(url);
  if (!link) return;
  if (link.kind === 'auth-callback') {
    const { completeNativeOAuth } = await import('./oauth');
    const { error } = await completeNativeOAuth(link.params);
    navigateTo(error ? `/login?error=${encodeURIComponent(error)}` : '/');
    return;
  }
  navigateTo(link.path);
}

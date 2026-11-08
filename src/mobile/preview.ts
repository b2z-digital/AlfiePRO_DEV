/**
 * While the phone screens are being built, phone browsers keep the "get the app" page unless
 * the phone preview is switched on: open app.alfiepro.com.au/?mobile=1 once on a phone
 * (?mobile=0 turns it off). The native apps always use the phone screens.
 */
const KEY = 'alfie-mobile-preview';

export function readMobilePreviewFlag(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('mobile');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setMobilePreview(on: boolean) {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* ignore */ }
}

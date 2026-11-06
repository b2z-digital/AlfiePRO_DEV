import { useEffect } from 'react';

/**
 * Adds the Alfie theme classes to <html> while the signed-in app is mounted:
 *   - `alfie-theme` always (fonts, Alfie blue, shared polish)
 *   - `alfie-dark` or `alfie-light` for the current mode
 * All Alfie theme styling (src/styles/alfie-theme.css) is scoped to these
 * classes, so public club/event websites are untouched. Using <html> (not a
 * wrapper div) means portalled modals and menus pick the theme up too.
 */
export function useAlfieTheme(enabled: boolean, mode: 'dark' | 'light' = 'dark') {
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.classList.remove('alfie-theme', 'alfie-dark', 'alfie-light');
    clear();
    if (enabled) {
      root.classList.add('alfie-theme', mode === 'light' ? 'alfie-light' : 'alfie-dark');
    }
    return clear;
  }, [enabled, mode]);
}

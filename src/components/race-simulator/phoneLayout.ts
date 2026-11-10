// When the race screen gets its phone layout, and where it keeps clear of the notch and the home bar.
import { useEffect, useState } from 'react';

function screen() {
  const w = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const h = typeof window === 'undefined' ? 800 : window.innerHeight;
  return { phone: Math.min(w, h) < 540, portrait: h > w, w, h };
}

/** A phone, or any window this small (either side under 540 px): the race screen's phone layout. */
export function usePhone(): { phone: boolean; portrait: boolean; w: number; h: number } {
  const [s, setS] = useState(screen);
  useEffect(() => {
    const on = () => setS(screen());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return s;
}

/** Clear of the notch, the rounded corners and the home bar. */
export const SAFE = {
  top: 'max(8px, env(safe-area-inset-top))',
  right: 'max(10px, env(safe-area-inset-right))',
  bottom: 'max(8px, env(safe-area-inset-bottom))',
  left: 'max(10px, env(safe-area-inset-left))',
};

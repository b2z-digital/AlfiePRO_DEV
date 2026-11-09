/**
 * Turning the phone (Race Management board, "Landscape"): the app stays upright, except the finish
 * pad and the full sheet, which follow the phone when it's turned.
 */
import { useEffect, useState } from 'react';
import { isNative } from '../lib/native/platform';

const QUERY = '(orientation: landscape) and (max-height: 540px)';

async function orientation() {
  const { ScreenOrientation } = await import('@capacitor/screen-orientation');
  return ScreenOrientation;
}

/** Apps: keep screens upright unless a screen allows turning. */
export function lockPortrait() {
  if (!isNative) return;
  void orientation().then(o => o.lock({ orientation: 'portrait' })).catch(() => {});
}

/** This screen turns with the phone (apps); upright again when it closes. */
export function useAllowLandscape() {
  useEffect(() => {
    if (!isNative) return;
    void orientation().then(o => o.unlock()).catch(() => {});
    return () => lockPortrait();
  }, []);
}

/** The phone is on its side (short screen, wider than tall). */
export function useLandscape(): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const ch = () => setOn(mq.matches);
    mq.addEventListener?.('change', ch);
    window.addEventListener('resize', ch);
    return () => { mq.removeEventListener?.('change', ch); window.removeEventListener('resize', ch); };
  }, []);
  return on;
}

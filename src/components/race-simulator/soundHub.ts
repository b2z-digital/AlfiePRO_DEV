// One sound output for the whole simulator. Browsers only let a page make sound once you've touched
// it, so the output is opened on your first tap, click or key press anywhere on the simulator (the
// "Start race" button will do) and then kept for every race, drill and demonstration after it.
// Before this, each race opened its own output on the first tap or key press inside that race: a
// race you only watched, or sailed with a transmitter alone, stayed silent.

let ctx: AudioContext | null = null;
let armed = false;

const wake = (): void => {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  } catch { /* no sound on this device */ }
};

/** Listen for the first touch (and every one after: an output put to sleep is woken by the next). */
export function armSound(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  for (const ev of ['pointerdown', 'keydown', 'touchend', 'click'] as const) window.addEventListener(ev, wake, { capture: true, passive: true });
  // Coming back to the tab (or unlocking the phone) can leave the output asleep.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined); });
}

/** The output, opened if the browser allows it yet (it does once the page has been touched). */
export function soundOut(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  armSound();
  // Chrome lets a page that has already been touched open and start its sound without another tap.
  const touched = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
  if (!ctx && touched) wake();
  else if (ctx && ctx.state !== 'running' && touched !== false) void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Is sound actually coming out? (False until the page has been touched.) */
export const soundRunning = (): boolean => !!ctx && ctx.state === 'running';

armSound();

// Going on from a card with the transmitter, so a skipper holding one needn't reach for the mouse.
import { useEffect, useRef } from 'react';

/** Go from the transmitter: any button pressed after this opens, or (given its axis) the rudder stick
 *  centred and then held right over. */
export function usePadGo(onGo: () => void, rudderAxis: number | null, enabled: boolean) {
  const go = useRef(onGo); go.current = onGo;
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let raf = 0, dead = false, heldSince = 0;
    const first = new Map<number, boolean[]>();
    let centred = false;
    const tick = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(tick);
      for (const g of navigator.getGamepads()) {
        if (!g) continue;
        const pressed = g.buttons.map(b => b.pressed);
        const was = first.get(g.index);
        if (!was) { first.set(g.index, pressed); continue; }
        if (pressed.some((p, i) => p && !was[i])) { dead = true; go.current(); return; }
        first.set(g.index, pressed.map((p, i) => p && was[i]));
        if (rudderAxis === null) continue;
        const r = g.axes[rudderAxis] ?? 0;
        if (Math.abs(r) < 0.4) { centred = true; heldSince = 0; }
        else if (centred && Math.abs(r) > 0.85) {
          if (!heldSince) heldSince = now;
          else if (now - heldSince > 450) { dead = true; go.current(); return; }
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [rudderAxis, enabled]);
}

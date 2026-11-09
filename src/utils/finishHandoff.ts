/**
 * A finish order called on the phone finish pad, waiting to be saved by the scoring screen
 * (Touch mode applies it through its own handlers, so handicaps, heats and confirmation run
 * exactly as on the desktop). Skipper indices are the event's own (not the heat's).
 */
import type { FinishingEntry } from './finishOrder';

export interface FinishHandoff {
  eventId: string;
  race: number;
  heat: string | null;
  entries: FinishingEntry[];
  at: number;
}

const KEY = 'alfie-finish-handoff';
/** Older than this, a hand-off is left behind by a closed screen and is ignored. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function setFinishHandoff(h: Omit<FinishHandoff, 'at'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() })); } catch { /* ignore */ }
}

export function peekFinishHandoff(eventId: string, race?: number): FinishHandoff | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as FinishHandoff;
    if (h.eventId !== eventId) return null;
    if (race !== undefined && h.race !== race) return null;
    if (!h.at || Date.now() - h.at > MAX_AGE_MS) return null;
    return h;
  } catch {
    return null;
  }
}

export function takeFinishHandoff(eventId: string): FinishHandoff | null {
  const h = peekFinishHandoff(eventId);
  if (h) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
  return h;
}

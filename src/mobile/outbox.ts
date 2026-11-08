/**
 * No signal on race day (board "No signal: scoring carries on"). Taps, marks and the finish
 * order already live on the phone (the race session). A confirmed race or heat that can't be
 * saved waits here, in order, with the event as it now stands kept on the phone so the next heat
 * starts from it; everything is sent by itself when signal returns, the same way it would have
 * been sent at the time (saveConfirmation / saveRun).
 */
import { useEffect, useState } from 'react';
import type { RaceEvent } from '../types/race';
import type { HandicapSettings } from '../utils/scoringConfirm';
import { saveConfirmation, saveRun, type HeatConfirmation, type RaceConfirmation, type ScoringRun } from './confirmRace';

export interface OutboxItem {
  id: string;
  eventId: string;
  label: string;
  at: number;
  kind: 'confirm' | 'save';
  /** The event the change was made on (set as the current event when sending). */
  event: RaceEvent;
  confirmation?: RaceConfirmation | HeatConfirmation;
  run?: ScoringRun;
  settings?: HandicapSettings;
  tries?: number;
}

const KEY = 'alfie-m-outbox';
const LOCAL = (eventId: string) => `alfie-m-local-event:${eventId}`;
const CHANGED = 'alfie-m-outbox-changed';

export const isNetworkError = (e: any) => !navigator.onLine || /fetch|network|Failed to fetch|Load failed|timeout|NetworkError/i.test(String(e?.message || e));

export function outboxItems(): OutboxItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function write(items: OutboxItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full: kept in memory for this visit */ }
  try { window.dispatchEvent(new Event(CHANGED)); } catch { /* no window */ }
}

/** The event as this phone has it while changes wait to be sent. */
export function localEvent(eventId: string): RaceEvent | null {
  try { const raw = localStorage.getItem(LOCAL(eventId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/** The event with a scoring state applied, as the save would leave it (single-day events). */
export function withRun(event: RaceEvent, a: ScoringRun): RaceEvent {
  return {
    ...event,
    skippers: a.skippers,
    raceResults: a.raceResults,
    lastCompletedRace: a.lastCompletedRace,
    hasDeterminedInitialHcaps: a.hasDeterminedInitialHcaps,
    isManualHandicaps: a.isManualHandicaps,
    heatManagement: a.heatManagement || undefined,
    numRaces: a.numRaces,
    dropRules: a.dropRules as any,
    currentDay: a.currentDay,
  };
}

/** Keeps a change to send later; returns the event as it now stands on this phone. */
export function enqueue(item: Omit<OutboxItem, 'id' | 'at'>): RaceEvent {
  const run = item.confirmation?.after || item.run!;
  const local = withRun(item.event, run);
  try { localStorage.setItem(LOCAL(item.eventId), JSON.stringify(local)); } catch { /* storage full */ }
  write([...outboxItems(), { ...item, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now() }]);
  return local;
}

let flushing = false;

/** Sends what's waiting, oldest first; stops at the first failure so the order is kept. */
export async function flushOutbox(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const [item] = outboxItems();
      if (!item) break;
      try {
        if (item.kind === 'confirm' && item.confirmation) await saveConfirmation(item.event, item.confirmation, item.settings!);
        else if (item.run) await saveRun(item.event, item.run);
      } catch (e) {
        if (isNetworkError(e)) break;
        // not a signal problem: keep it for the scorer to see, try again later
        const rest = outboxItems();
        rest[0] = { ...rest[0], tries: (rest[0].tries || 0) + 1 };
        write(rest);
        break;
      }
      const rest = outboxItems().filter(x => x.id !== item.id);
      if (!rest.some(x => x.eventId === item.eventId)) { try { localStorage.removeItem(LOCAL(item.eventId)); } catch { /* ignore */ } }
      write(rest);
      sent++;
    }
  } finally {
    flushing = false;
  }
  return sent;
}

/** Sends waiting changes when signal returns (and every so often while any wait). */
export function startOutbox(): () => void {
  const go = () => { void flushOutbox(); };
  window.addEventListener('online', go);
  const t = setInterval(() => { if (outboxItems().length) go(); }, 20000);
  go();
  return () => { window.removeEventListener('online', go); clearInterval(t); };
}

export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>(outboxItems);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const ch = () => setItems(outboxItems());
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener(CHANGED, ch);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener(CHANGED, ch); window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return { items, online };
}

/**
 * Saves now when there's signal and nothing older is waiting for the event; otherwise keeps the
 * change on the phone to send in order. Returns the event as it now stands.
 */
export async function sendOrKeep(item: Omit<OutboxItem, 'id' | 'at'>, send: () => Promise<RaceEvent>): Promise<{ event: RaceEvent; kept: boolean }> {
  if (!navigator.onLine || outboxItems().some(x => x.eventId === item.eventId)) {
    const event = enqueue(item);
    void flushOutbox();
    return { event, kept: true };
  }
  try {
    return { event: await send(), kept: false };
  } catch (e) {
    if (isNetworkError(e)) return { event: enqueue(item), kept: true };
    throw e;
  }
}

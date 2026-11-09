/**
 * Score together and no signal: spotters' calls go into the scorer's finish order with the
 * finish order rules, two phones calling different boats for one place pause and ask, and
 * results confirmed with no signal are sent later in the order they were confirmed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRemoteCall, resolveConflict, readBack, padSkippers } from '../../mobile/finishPad';
import { addFinish } from '../../utils/finishOrder';
import type { RaceSession } from '../../mobile/raceSession';

const sent: string[] = [];
let failNext = 0;
vi.mock('../../mobile/confirmRace', () => ({
  saveConfirmation: async (_e: any, c: any) => { if (failNext > 0) { failNext--; throw new Error('Failed to fetch'); } sent.push(`confirm:${c.race}`); return {}; },
  saveRun: async (_e: any, r: any) => { if (failNext > 0) { failNext--; throw new Error('Failed to fetch'); } sent.push(`run:${r.lastCompletedRace}`); return {}; },
}));

const pad = { globalOf: [9, 10, 11, 12, 13], boats: ['9', '19', '21', '33', '42'].map(s => ({ sail: s, name: `Boat ${s}` })), raceLabel: 'Race 3', heatLabel: 'B', heatIndex: 1 };
const base = (): RaceSession => ({ eventId: 'e1', race: 3, heat: 'B', marks: [], rollCall: { ready: [], absent: [] }, recalls: 0, gunAt: 1, pad, finish: [], added: [] });
const call = (g: number, place: number, who = 'Mark J.', at = 2) => ({ id: `c${g}-${place}`, g, place, who, at });
const order = (s: RaceSession) => (s.finish || []).map(e => [pad.boats[e.skipperIndex].sail, e.letterScore || e.position]);

describe('spotters calling finishes', () => {
  it('a call takes the next place; a boat already in is left alone; boats not in the heat are ignored', () => {
    let s = applyRemoteCall(base(), call(11, 1)).session;
    expect(order(s)).toEqual([['21', 1]]);
    expect(applyRemoteCall(s, call(11, 2)).outcome).toBe('already');
    expect(applyRemoteCall(s, call(99, 2)).outcome).toBe('unknown');
    s = applyRemoteCall(s, call(9, 2)).session;
    expect(order(s)).toEqual([['21', 1], ['9', 2]]);
    expect(s.callers?.[0]).toMatchObject({ who: 'Mark J.' });
  });

  it('before the finish pad is opened, boats marked OCS at the start are already in', () => {
    const s = applyRemoteCall({ ...base(), finish: undefined, marks: [{ skipperIndex: 12, code: 'OCS', atMs: 1000 }] }, call(9, 1)).session;
    expect(order(s)).toEqual([['9', 1], ['33', 'OCS']]);
  });

  it('two phones recording different boats for one place pause on it and ask', () => {
    // the scorer tapped 21 for 1st; the spotter, not yet updated, called 9 for 1st
    let s: RaceSession = { ...base(), finish: readBack(addFinish([], padSkippers(pad), 2)!), callers: { 2: { who: 'You', at: 1 } } };
    const r = applyRemoteCall(s, call(9, 1, 'Mark J.', 3));
    expect(r.outcome).toBe('conflict');
    s = r.session;
    expect(order(s)).toEqual([['21', 1], ['9', 2]]); // 9 waits one place lower
    expect(s.conflicts).toEqual([expect.objectContaining({ place: 1, a: 2, aWho: 'You', b: 0, bWho: 'Mark J.' })]);

    // keeping the scorer's boat changes nothing but the question
    expect(order(resolveConflict(s, s.conflicts![0].id, 2))).toEqual([['21', 1], ['9', 2]]);
    // keeping the spotter's boat moves it to 1st and 21 to 2nd
    const kept = resolveConflict(s, s.conflicts![0].id, 0);
    expect(order(kept)).toEqual([['9', 1], ['21', 2]]);
    expect(kept.conflicts).toEqual([]);
  });

  it('a later boat still follows when the disputed boat moves up', () => {
    let s: RaceSession = { ...base(), finish: readBack(addFinish([], padSkippers(pad), 2)!) };
    s = applyRemoteCall(s, call(9, 1)).session;           // conflict over 1st
    s = applyRemoteCall(s, call(13, 3, 'Mark J.', 4)).session; // 42 in 3rd, no dispute
    expect(s.conflicts).toHaveLength(1);
    s = resolveConflict(s, s.conflicts![0].id, 0);
    expect(order(s)).toEqual([['9', 1], ['21', 2], ['42', 3]]);
  });
});

describe('no signal', () => {
  beforeEach(() => { localStorage.clear(); sent.length = 0; failNext = 0; });
  const ev: any = { id: 'e1', eventName: 'Test', skippers: [], raceResults: [] };
  const run = (n: number): any => ({ skippers: [], raceResults: [{ race: n, skipperIndex: 0, position: 1 }], heatManagement: null, lastCompletedRace: n, numRaces: 8, dropRules: [4], hasDeterminedInitialHcaps: false, isManualHandicaps: false, currentDay: 1, raceType: 'scratch' });

  it('keeps confirmed races on the phone, then sends them oldest first', async () => {
    const { enqueue, flushOutbox, localEvent, outboxItems } = await import('../../mobile/outbox');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const local1 = enqueue({ eventId: 'e1', kind: 'confirm', event: ev, confirmation: { kind: 'race', race: 1, after: run(1) } as any, settings: {} as any, label: 'Race 1 confirmed' });
    expect(local1.lastCompletedRace).toBe(1);
    enqueue({ eventId: 'e1', kind: 'confirm', event: local1, confirmation: { kind: 'race', race: 2, after: run(2) } as any, settings: {} as any, label: 'Race 2 confirmed' });
    expect(localEvent('e1')?.lastCompletedRace).toBe(2);
    expect(await flushOutbox()).toBe(0); // still offline

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    failNext = 1; // the first try drops out
    expect(await flushOutbox()).toBe(0);
    expect(outboxItems()).toHaveLength(2);
    expect(await flushOutbox()).toBe(2);
    expect(sent).toEqual(['confirm:1', 'confirm:2']);
    expect(outboxItems()).toEqual([]);
    expect(localEvent('e1')).toBeNull(); // the server has it now
  });
});

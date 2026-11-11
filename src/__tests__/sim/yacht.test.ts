// Design your yacht: the boat's finish (colours, tapes, corner and deck patches) and her number.
// Looks only: a designed boat sails exactly the race an undesigned one does.
import { beforeEach, describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { DEFAULT_LOOK, cleanLook, clearOf, sailNumber } from '@/sim/look';
import type { BoatLook, RaceSettings } from '@/sim/types';
import { ID_DIGIT, ID_ONE, idMarks, patchShapes } from '@/components/race-simulator/boat3d';
import { mergeTraining, type TrainingProgress } from '@/components/race-simulator/progress';
import { HULL_COLOURS, MAX_YACHTS, SAIL_COLOURS, cleanName, cleanYard, dropYacht, loadYard, lookFor, lookOf, newYacht, newerYard, paintName, putYacht, raceYacht, sailFor, saveYard, surprise, yachtFor, type Yacht, type Yard } from '@/components/race-simulator/yacht';
import type { ClassId } from '@/sim/classes';

const MINE: BoatLook = { hull: '#FF6A1A', jibLuff: '#FF3EA5', patch: { style: 'fingers', one: '#14181F', two: '#FFC51A' }, deckPatch: '#D8F01C', country: 'ITA' };
const base: RaceSettings = { classId: 'IOM', fleetSize: 6, level: 'state', windStrength: 'medium', windCharacter: 'oscillating', laps: 1, length: 'medium', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 11 };

describe("A boat's finish", () => {
  it('is checked before it is drawn: a bad colour takes the default, a good one is kept', () => {
    expect(cleanLook(MINE)).toEqual(MINE);
    const odd = cleanLook({ hull: 'red', jibLuff: '#12345', patch: { style: 'stripes', one: '#abcdef', two: 7 }, deckPatch: '<b>', country: 'a1b' })!;
    expect(odd.hull).toBe(DEFAULT_LOOK.hull);
    expect(odd.jibLuff).toBe(DEFAULT_LOOK.jibLuff);
    expect(odd.patch).toEqual({ style: 'fingers', one: '#ABCDEF', two: null });
    expect(odd.deckPatch).toBe('#262C36');
    expect(odd.country).toBe('AUS');
    // Nothing down the back edge of a sail: a finish saved when there was has it dropped.
    expect(cleanLook({ ...MINE, leech: '#FF3EA5' })).toEqual(MINE);
    for (const junk of [null, undefined, 'blue', 4]) expect(cleanLook(junk)).toBeUndefined();
  });

  it('puts patches at the tack, the clew and the head of a sail, inside the sail', () => {
    const fingers = patchShapes({ style: 'fingers', one: '#111111', two: '#EEEEEE' }, 0.36, 1.6);
    // Five fingers fanned from each foot corner and three hanging side by side from the head, taking turn about.
    expect(fingers).toHaveLength(13);
    expect(fingers.slice(0, 5).map(s => s.color)).toEqual(['#111111', '#EEEEEE', '#111111', '#EEEEEE', '#111111']);
    expect(fingers.slice(0, 5).every(s => s.pts[0][0] === 0 && s.pts[0][1] === 0)).toBe(true);
    expect(fingers.slice(5, 10).every(s => s.pts[0][0] === 0 && s.pts[0][1] === 1)).toBe(true);
    expect(fingers.slice(10).map(s => s.color)).toEqual(['#111111', '#EEEEEE', '#111111']);
    expect(fingers.slice(10).every(s => s.pts[0][0] === 1 && s.pts.every(([f]) => f > 0.9))).toBe(true);
    // At the head they are long and narrow, the one by the leech the longest and the one by the mast the shortest.
    const reach = fingers.slice(10).map(s => (1 - Math.min(...s.pts.map(p => p[0]))) * 1.6);
    expect(reach[0]).toBeGreaterThan(reach[1]); expect(reach[1]).toBeGreaterThan(reach[2]);
    expect(reach[0]).toBeGreaterThan(0.1); expect(reach[2]).toBeGreaterThan(0.06);
    expect(fingers[10].pts[0][1]).toBeGreaterThan(fingers[12].pts[0][1]);
    // Plain patches: a band across the head.
    expect(patchShapes({ style: 'solid', one: '#111111', two: null }, 0.36, 1.6)[2].pts.every(([f]) => f > 0.95)).toBe(true);
    // A finger runs out to a round end, not a point: at its tip the outline turns a little at a
    // time (many short steps round the end), where a point would be one sharp corner.
    const mid = fingers[2].pts.map(([f, g]) => [g * 0.36, f * 1.6]); // metres on the sail
    const far = Math.max(...mid.map(p => Math.hypot(p[0], p[1])));
    const round = mid.filter(p => Math.hypot(p[0], p[1]) > far * 0.9);
    expect(round.length).toBeGreaterThanOrEqual(5);
    let sharpest = 180;
    for (let i = 1; i < mid.length - 1; i++) {
      if (Math.hypot(mid[i][0], mid[i][1]) < far * 0.9) continue;
      const a = [mid[i - 1][0] - mid[i][0], mid[i - 1][1] - mid[i][1]], b = [mid[i + 1][0] - mid[i][0], mid[i + 1][1] - mid[i][1]];
      sharpest = Math.min(sharpest, (Math.acos((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]))) * 180) / Math.PI);
    }
    expect(sharpest).toBeGreaterThan(140);
    // One colour: every finger the same.
    expect(new Set(patchShapes({ style: 'fingers', one: '#111111', two: null }, 0.36, 1.6).map(s => s.color))).toEqual(new Set(['#111111']));
    // Plain: one patch a corner, or two (the second colour inside the first).
    expect(patchShapes({ style: 'solid', one: '#111111', two: null }, 0.36, 1.6)).toHaveLength(3);
    expect(patchShapes({ style: 'solid', one: '#111111', two: '#EEEEEE' }, 0.36, 1.6)).toHaveLength(5);
    for (const style of ['fingers', 'solid'] as const) for (const [foot, luff] of [[0.36, 1.6], [0.3, 0.74], [0.45, 2.0]]) {
      for (const s of patchShapes({ style, one: '#111111', two: '#EEEEEE' }, foot, luff)) for (const [f, g] of s.pts) {
        expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1);
      }
      // A patch stays a corner patch: nothing reaches more than a tenth of the way up the sail.
      expect(Math.max(...patchShapes({ style, one: '#111111', two: null }, foot, luff).filter(s => s.pts[0][0] === 0).flatMap(s => s.pts.map(p => p[0])))).toBeLessThan(0.1);
    }
  });

  it('carries her number the way the rules for identification on sails have it', () => {
    // The last two digits, a 0 before a single one; a clash in the fleet puts a 1 in front.
    expect(['123', 'AUS 2024', '7', '07', '100'].map(sailNumber)).toEqual(['23', '24', '07', '07', '00']);
    expect(clearOf('23', new Set(['07']))).toBe('23');
    expect(clearOf('23', new Set(['23']))).toBe('123');
    expect(clearOf('23', new Set(['23', '123']))).toBe('223');
    // An IOM's A rig: mainsail 1600 on the luff, jib 1325.
    const mainChord = (f: number) => 0.355 * (1 - f) * (1 + 0.59 * f) + 0.02 * f, jibChord = (f: number) => 0.38 * (1 - f) + 0.02 * f;
    const main = idMarks('IOM', 'main', 1.6, mainChord, '24', 'AUS'), jib = idMarks('IOM', 'jib', 1.325, jibChord, '24', 'AUS');
    const of = (ms: typeof main, what: string, side: string) => ms.find(m => m.what === what && m.side === side)!;
    for (const [ms, luff] of [[main, 1.6], [jib, 1.325]] as const) {
      const s = of(ms, 'number', 'stbd'), p = of(ms, 'number', 'port');
      // Both sides, the same two digits, 100 to 110 mm tall and 20 to 30 apart.
      expect([s.text, p.text]).toEqual(['24', '24']);
      for (const m of [s, p]) { expect(m.h).toBeGreaterThanOrEqual(0.1); expect(m.h).toBeLessThanOrEqual(0.11); expect(m.space).toBeGreaterThanOrEqual(0.02); expect(m.space).toBeLessThanOrEqual(0.03); }
      // Starboard uppermost, and 40 mm or more of clear sail between the two.
      expect(s.z - s.h / 2 - (p.z + p.h / 2)).toBeGreaterThanOrEqual(0.04 - 1e-9);
      // Room across the sail for the digits and a 1 in front of them.
      for (const m of [s, p]) expect(ms === main ? mainChord(m.z / luff) : jibChord(m.z / luff)).toBeGreaterThan((2 * ID_DIGIT + ID_ONE) * m.h + 2 * m.space);
    }
    // On the mainsail: the class mark above three-quarter height, the numbers below it and above the
    // quarter line, the national letters below the numbers (60 to 70 mm, starboard uppermost, 40 clear).
    const ns = of(main, 'number', 'stbd'), np = of(main, 'number', 'port'), ls = of(main, 'letters', 'stbd'), lp = of(main, 'letters', 'port'), mark = of(main, 'insignia', 'both');
    expect(mark.text).toBe('IOM');
    expect((mark.z - mark.h / 2) / 1.6).toBeGreaterThan(0.75);
    expect((ns.z + ns.h / 2) / 1.6).toBeLessThan(0.75);
    expect((np.z - np.h / 2) / 1.6).toBeGreaterThan(0.25);
    for (const m of [ls, lp]) { expect(m.text).toBe('AUS'); expect(m.h).toBeGreaterThanOrEqual(0.06); expect(m.h).toBeLessThanOrEqual(0.07); expect(m.space).toBeGreaterThanOrEqual(0.013); expect(m.space).toBeLessThanOrEqual(0.023); }
    expect(np.z - np.h / 2 - (ls.z + ls.h / 2)).toBeGreaterThanOrEqual(0.04 - 1e-9);
    expect(ls.z - ls.h / 2 - (lp.z + lp.h / 2)).toBeGreaterThanOrEqual(0.04 - 1e-9);
    expect(lp.z - lp.h / 2).toBeGreaterThan(0);
    // A jib carries her number only; a sail with no country, no letters.
    expect(jib.map(m => m.what)).toEqual(['number', 'number']);
    expect(idMarks('IOM', 'main', 1.6, mainChord, '24').map(m => m.what)).toEqual(['number', 'number', 'insignia']);
    // A 1 in front goes on with the digits.
    expect(idMarks('IOM', 'jib', 1.325, jibChord, '124')[0].text).toBe('124');
    // Her smallest suit (a C rig: 880 on the luff): the rules give way in their own order, and the
    // rows of numbers never close to less than 20 mm nor the digits to less than 80.
    const small = idMarks('IOM', 'main', 0.88, f => 0.315 * (1 - f) * (1 + 0.54 * f) + 0.02 * f, '24', 'AUS');
    const ss = of(small, 'number', 'stbd'), sp = of(small, 'number', 'port');
    expect(ss.z - ss.h / 2 - (sp.z + sp.h / 2)).toBeGreaterThanOrEqual(0.02 - 1e-9);
    expect(ss.h).toBeGreaterThanOrEqual(0.08);
    for (const m of small) { expect(m.z - m.h / 2).toBeGreaterThan(0); expect(m.z + m.h / 2).toBeLessThan(0.88); }
    // The one-design classes have tables of their own: a DF65's numbers are 85 to 100 mm.
    const df = idMarks('DF65', 'main', 1.6 * 0.66, f => 0.234 * (1 - f) * (1 + 0.59 * f) + 0.013 * f, '24');
    expect(df[0].h).toBeGreaterThanOrEqual(0.085); expect(df[0].h).toBeLessThanOrEqual(0.1);
    expect(df[2].text).toBe('65');
  });

  it("is on your boat in the race, and changes nothing about how the race is sailed", () => {
    const plain = new Race({ ...base, player: { name: 'Ann', sail: '24' } });
    const mine = new Race({ ...base, player: { name: 'Ann', sail: '24', look: MINE } });
    expect(mine.player!.look).toEqual(MINE);
    expect(mine.player!.color).toBe('#FF6A1A');
    expect(mine.player!.sail).toBe('24');
    expect(plain.player!.look).toBeUndefined();
    // Nobody else's boat is touched.
    expect(mine.boats.filter(b => !b.isPlayer).map(b => [b.color, b.sail, b.look])).toEqual(plain.boats.filter(b => !b.isPlayer).map(b => [b.color, b.sail, b.look]));
    for (let i = 0; i < 1200; i++) { plain.step(); mine.step(); }
    expect(mine.boats.map(b => [b.x, b.y, b.hdg, b.spd])).toEqual(plain.boats.map(b => [b.x, b.y, b.hdg, b.spd]));
  });

  it('is on each person\'s boat in a live race', () => {
    const r = new Race({ ...base, crew: [{ id: 'a', name: 'Ann', sail: '24', look: MINE }, { id: 'b', name: 'Bo', sail: '07' }], seat: 1 });
    expect(r.boats[0].look).toEqual(MINE);
    expect(r.boats[0].color).toBe('#FF6A1A');
    expect(r.boats[1].look).toBeUndefined();
    // A look sent by someone else is cleaned like any other.
    const bad = new Race({ ...base, crew: [{ id: 'a', name: 'Ann', sail: '24', look: { ...MINE, hull: 'javascript:1' } as BoatLook }], seat: 0 });
    expect(bad.boats[0].color).toBe(DEFAULT_LOOK.hull);
  });
});

describe('Your yachts', () => {
  beforeEach(() => localStorage.clear());
  const me = { name: 'Ann Lee', short: 'Ann L', sails: { IOM: '12', '10R': '35' } };
  const yacht = (id: string, cls: ClassId, over: Partial<Yacht> = {}): Yacht => ({ ...MINE, patch: { ...MINE.patch }, id, cls, name: `Boat ${id}`, ...over });

  it('start with none: the blue boat you have always had, under the number on your boat in Alfie', () => {
    const yard = loadYard();
    expect(yard).toEqual({ yachts: [], racing: {}, at: 0 });
    expect(yachtFor(yard, 'IOM')).toBeNull();
    expect(lookFor(yard, 'IOM')).toEqual(DEFAULT_LOOK);
    expect(sailFor(yard, 'IOM', me)).toEqual({ sail: '12', from: 'alfie' });
    expect(sailFor(yard, '10R', me)).toEqual({ sail: '35', from: 'alfie' });
    expect(sailFor(yard, 'DF95', me)).toEqual({ sail: '01', from: 'none' });
    expect(sailFor(yard, 'IOM', null)).toEqual({ sail: '01', from: 'none' });
  });

  it('are saved, changed and deleted, and the first in a class is the one you race there', () => {
    let yard = loadYard();
    const a = newYacht(yard, 'IOM');
    expect(a.name).toBe('My IOM');
    yard = saveYard(putYacht(yard, a, 1));
    expect(loadYard()).toEqual(yard);
    expect(yard.racing).toEqual({ IOM: a.id });
    // A second IOM and a Ten Rater: each new one is named apart, and your first IOM is still the one you race.
    const b = { ...newYacht(yard, 'IOM'), ...MINE, number: '24' }, c = newYacht(yard, '10R');
    expect(b.name).toBe('My IOM 2');
    expect(b.id).not.toBe(a.id);
    yard = putYacht(putYacht(yard, b, 2), c, 3);
    expect(yard.yachts.map(y => y.id)).toEqual([a.id, b.id, c.id]);
    expect(yard.racing).toEqual({ IOM: a.id, '10R': c.id });
    expect(yachtFor(yard, 'IOM')!.id).toBe(a.id);
    // Changed in place.
    yard = putYacht(yard, { ...b, name: 'Orange Crush', hull: '#1FA34E' }, 4);
    expect(yard.yachts).toHaveLength(3);
    expect(yard.yachts[1]).toMatchObject({ name: 'Orange Crush', hull: '#1FA34E', number: '24' });
    // Pick the other IOM to race: her finish and her own number are what the race gets.
    yard = raceYacht(yard, b.id, 5);
    expect(lookFor(yard, 'IOM').hull).toBe('#1FA34E');
    expect(sailFor(yard, 'IOM', me)).toEqual({ sail: '24', from: 'yours' });
    expect(sailFor(yard, '10R', me)).toEqual({ sail: '35', from: 'alfie' });
    // Delete the one you race: your other IOM takes over. Delete her too: back to the plain boat.
    yard = dropYacht(yard, b.id, 6);
    expect(yard.yachts.map(y => y.id)).toEqual([a.id, c.id]);
    expect(yard.racing).toEqual({ IOM: a.id, '10R': c.id });
    yard = dropYacht(yard, a.id, 7);
    expect(yard.racing).toEqual({ '10R': c.id });
    expect(lookFor(yard, 'IOM')).toEqual(DEFAULT_LOOK);
    expect(yard.at).toBe(7);
    // Moved to another class, she stops being the one you race in her old one.
    yard = putYacht(yard, { ...c, cls: 'M' }, 8);
    expect(yard.racing).toEqual({ M: c.id });
  });

  it('have a limit, and tidy names', () => {
    let yard: Yard = { yachts: [], racing: {}, at: 0 };
    for (let i = 0; i < MAX_YACHTS + 3; i++) yard = putYacht(yard, yacht(`y${i}`, 'IOM'), i + 1);
    expect(yard.yachts).toHaveLength(MAX_YACHTS);
    expect(cleanName('  Orange   Crush  ')).toBe('Orange Crush');
    expect(cleanName('<b>Bold</b>\u0007')).toBe('bBold/b');
    expect(cleanName('x'.repeat(60))).toHaveLength(24);
  });

  it('are cleaned when read (from this device or the account), and the newer copy wins whole', () => {
    const dirty = cleanYard({
      yachts: [yacht('a', 'IOM', { number: 'AUS 7', name: '  ' }), 'blue', yacht('a', '10R'), { ...yacht('b', 'IOM'), cls: 'Laser' }, { ...yacht('c', 'M'), id: 'no spaces allowed' }, yacht('d', 'M', { hull: 'red' })],
      racing: { IOM: 'a', M: 'zzz', '10R': 'a' }, at: 'yesterday',
    });
    // The duplicate id, the unknown class and the bad id are left out; the bad colour is put right.
    expect(dirty.yachts.map(y => [y.id, y.cls])).toEqual([['a', 'IOM'], ['d', 'M']]);
    expect(dirty.yachts[0]).toMatchObject({ number: '07', name: 'My IOM' });
    expect(dirty.yachts[1].hull).toBe(DEFAULT_LOOK.hull);
    expect(dirty.racing).toEqual({ IOM: 'a' });
    expect(dirty.at).toBe(0);
    const here: Yard = { yachts: [yacht('a', 'IOM')], racing: { IOM: 'a' }, at: 10 }, there: Yard = { yachts: [], racing: {}, at: 20 };
    // The account's is newer and has no yachts: a yacht deleted on another device stays deleted.
    expect(newerYard(here, there)).toEqual(there);
    expect(newerYard(there, here)).toEqual(there);
    expect(newerYard(undefined, here)).toEqual(here);
    // They ride with your training progress to your account.
    const a: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 1, yard: here }, b: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 2, yard: there };
    expect(mergeTraining(a, b).yard).toEqual(there);
    expect(mergeTraining(a, { drills: {}, lessons: {}, lab: {}, updatedAt: 3 }).yard).toEqual(here);
  });

  it('can be painted by chance, always from the paint locker', () => {
    let s = 3;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const all = new Set([...HULL_COLOURS, ...SAIL_COLOURS].map(p => p.hex).concat('#262C36'));
    for (let i = 0; i < 60; i++) {
      const y = surprise(rnd);
      expect(cleanLook(y)).toEqual(lookOf(y));
      for (const c of [y.hull, y.jibLuff, y.patch.one, y.patch.two, y.deckPatch]) if (c) expect(all.has(c), c).toBe(true);
      expect(y.patch.two).not.toBe(y.patch.one);
    }
    expect(paintName('#FF6A1A')).toBe('Fluoro orange');
    expect(paintName(null)).toBe('None');
  });
});

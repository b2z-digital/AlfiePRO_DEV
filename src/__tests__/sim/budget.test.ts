// Money on the Circuit: entry fees, prize money, sponsors' goals, the shop, and the prizes that are
// paint; and the deck and bottom colours they unlock, kept with the yacht and drawn on the boat.
import { describe, expect, it } from 'vitest';
import { CHAMPION_PAINT, GRANT, ME, SHOP, SPONSORS, START_MONEY, buy, careerRace, dayState, dealOf, eventAt, finishDay, moneyOf, moveUp, newCareer, owns, recordRace, simulateRest, wonPaints, type Career, type RowResult } from '@/components/race-simulator/career';
import { mergeTraining, type TrainingProgress } from '@/components/race-simulator/progress';
import { cleanLook, DEFAULT_LOOK } from '@/sim/look';
import { lookOf, paintName } from '@/components/race-simulator/yacht';
import { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';

const NOW = Date.UTC(2026, 10, 12);
const me = { name: 'Sam S', sail: '39' };
const base: RaceSettings = { classId: 'IOM', fleetSize: 6, level: 'club', windStrength: 'medium', windCharacter: 'steady', laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 1, player: me, tune: 2 };
const rows = (c: Career, place: number): RowResult[] => [{ id: ME, place, code: null }, ...c.fleet.slice(0, (dayState(c).event.entries ?? (c.tier && c.tier !== 'club' ? 16 : 10)) - 1).map((id, k) => ({ id, place: k + 1 + (k + 1 >= place ? 1 : 0), code: null }))];
const day = (c0: Career, place: number) => {
  let c = c0;
  for (let d = 0; d < dayState(c).days; d++) { for (let i = 0; i < 3; i++) c = recordRace(c, rows(c, place), NOW); c = simulateRest(c, NOW); }
  return finishDay(c, me, NOW)!;
};

describe('Money', () => {
  it('a new career starts with a little money and the club sponsor', () => {
    const c = newCareer('IOM', NOW);
    expect(moneyOf(c)).toBe(START_MONEY);
    expect(dealOf(c)).toMatchObject({ sponsor: 'harbourlight', tier: 'club', met: [] });
    // A career from before money existed: the same.
    const old = { ...c, money: undefined, sponsor: undefined, owned: undefined } as Career;
    expect(moneyOf(old)).toBe(START_MONEY);
    expect(dealOf(old).sponsor).toBe('harbourlight');
  });

  it('a podium pays prize money and the sponsor pays for each goal met, once', () => {
    const won = day(newCareer('IOM', NOW), 1);
    expect(won.result.rank).toBe(1);
    expect(won.earned.prize).toBe(60);
    expect(won.earned.goals.map(g => g.id).sort()).toEqual(['podium', 'win']);
    expect(moneyOf(won.career)).toBe(START_MONEY + 60 + 100 + 60);
    // A podium earns the deck colour, the first time.
    expect(won.earned.unlocked).toEqual(['deck']);
    expect(owns(won.career, 'deck')).toBe(true);
    const again = day(won.career, 1);
    expect(again.earned.goals).toEqual([]);
    expect(again.earned.unlocked).toEqual([]);
    expect(moneyOf(again.career)).toBe(moneyOf(won.career) + 60);
    const last = day(newCareer('IOM', NOW), 10);
    expect(last.earned).toEqual({ prize: 0, goals: [], unlocked: [] });
  });

  it("the club season's Championship: a title wins its own colour and the two-tone hull, and a new season a new deal", () => {
    let c = newCareer('IOM', NOW);
    for (let i = 0; i < 6; i++) c = day(c, 4).career;
    const champ = day(c, 1);
    expect(champ.earned.unlocked).toEqual(expect.arrayContaining(['bottom', 'paint:club']));
    expect(champ.earned.goals.map(g => g.id)).toContain('champ');
    expect(wonPaints(champ.career)).toEqual([CHAMPION_PAINT.club]);
    expect(dealOf(champ.career)).toMatchObject({ season: 2, met: [] });
  });

  it('away events cost an entry, paid when they open; moving up brings a travel grant; you can owe', () => {
    const up = moveUp({ ...newCareer('IOM', NOW), ticket: 'state', money: 0 }, NOW);
    expect(moneyOf(up)).toBe(GRANT.state);
    expect(dealOf(up).sponsor).toBe(SPONSORS.state.id);
    expect(eventAt(up).event.fee).toBe(150);
    const open = recordRace(up, rows(up, 5), NOW);
    expect(moneyOf(open)).toBe(GRANT.state - 150);
    // Only once.
    expect(moneyOf(recordRace(open, rows(open, 5), NOW))).toBe(GRANT.state - 150);
    const broke = recordRace({ ...up, money: 50 }, rows(up, 5), NOW);
    expect(moneyOf(broke)).toBe(-100);
    expect(broke.ledger![0]).toMatchObject({ text: 'Entry: Kogarah Bay Regatta', amount: -150 });
  });

  it('the shop: buy with money you have, once; nothing for sale makes a boat faster', () => {
    const c = { ...newCareer('IOM', NOW), money: 300 };
    const b = buy(c, 'rigB', NOW);
    expect(owns(b, 'rigB')).toBe(true);
    expect(moneyOf(b)).toBe(50);
    expect(buy(b, 'rigB', NOW)).toBe(b);
    expect(buy(b, 'deck', NOW)).toBe(b);
    expect(SHOP.map(s => s.id)).toEqual(['deck', 'bottom', 'rigB']);
  });

  it("an IOM without the B rig sails a fresh day on the A rig, overpowered; with it, the right rig for the breeze", () => {
    let c = newCareer('IOM', NOW);
    for (let i = 0; i < 3; i++) c = day(c, 5).career;
    expect(eventAt(c).event.wind).toBe('fresh');
    expect(careerRace(c, base).rig).toBe('A');
    const r = new Race(careerRace(c, base));
    expect(r.boats[0].rig).toBe('A');
    expect(r.boats.slice(1).every(b => b.rig === 'B')).toBe(true);
    const kit = buy({ ...c, money: 1000 }, 'rigB', NOW);
    expect(careerRace(kit, base).rig).toBeUndefined();
    expect(new Race(careerRace(kit, base)).boats[0].rig).toBe('B');
    // Not an IOM, or not a fresh day: no say.
    expect(careerRace({ ...c, cls: 'DF65' }, base).rig).toBeUndefined();
  });

  it('money and what you own follow you between devices with the season', () => {
    const none: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 0 };
    const a = newCareer('IOM', NOW), b = day(a, 1).career;
    expect(mergeTraining({ ...none, career: a }, { ...none, career: b }).career).toMatchObject({ money: moneyOf(b), owned: ['deck'] });
  });
});

describe('Deck and bottom colours', () => {
  it('are kept with the yacht, and only as colours', () => {
    expect(cleanLook({ ...DEFAULT_LOOK, deck: '#c9a227', bottom: '#16204a' })).toMatchObject({ deck: '#C9A227', bottom: '#16204A' });
    const plain = cleanLook({ ...DEFAULT_LOOK, deck: 'carbon', bottom: 'url(x)' })!;
    expect(plain.deck).toBeUndefined();
    expect(plain.bottom).toBeUndefined();
    expect(lookOf({ ...DEFAULT_LOOK, deck: '#C9A227' })).toMatchObject({ deck: '#C9A227' });
    expect(paintName('#C9A227')).toBe('Champion gold');
  });
});

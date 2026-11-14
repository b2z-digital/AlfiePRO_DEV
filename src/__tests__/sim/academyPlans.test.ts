// The Sailing Academy's plans: who has Academy, what a free skipper can sail, and the prices shown.
import { describe, expect, it } from 'vitest';
import { FREE_SCENES, LOCKED_SCREENS, PRICES, money, raceGate, tierOf, trialDaysLeft, yearSaving, type PlanRow } from '@/components/academy/plans';
import { FIRST } from '@/sim/training';

const row = (status: string, extra: Partial<PlanRow> = {}): PlanRow => ({ status, plan: 'academy', billing_interval: 'year', trial_end: null, current_period_end: null, cancel_at_period_end: false, member_club_id: null, ...extra });

describe('Who has Academy', () => {
  it('a free week, a paid plan and a payment being retried do; a stopped or never-started plan doesn\'t', () => {
    expect(tierOf(row('trialing'))).toBe('academy');
    expect(tierOf(row('active'))).toBe('academy');
    expect(tierOf(row('past_due'))).toBe('academy');
    expect(tierOf(row('canceled'))).toBe('free');
    expect(tierOf(row('none'))).toBe('free');
    expect(tierOf(null)).toBe('free');
    expect(tierOf(null, true)).toBe('academy');
  });

  it('counts the free week\'s days left, rounding up', () => {
    const now = Date.parse('2026-11-14T10:00:00Z');
    expect(trialDaysLeft(row('trialing', { trial_end: '2026-11-21T10:00:00Z' }), now)).toBe(7);
    expect(trialDaysLeft(row('trialing', { trial_end: '2026-11-14T22:00:00Z' }), now)).toBe(1);
    expect(trialDaysLeft(row('active', { trial_end: '2026-11-21T10:00:00Z' }), now)).toBeNull();
  });
});

describe('What a free skipper can sail', () => {
  const free = { venue: 'lmryc', classId: 'IOM', transmitterRaces: 0 };
  const race = { level: 'club' as const, venue: 'lmryc', classId: 'IOM', transmitter: false };

  it('Club skippers, their water, their class, on the keyboard', () => {
    expect(raceGate('free', race, free)).toBeNull();
    expect(raceGate('free', { ...race, level: 'national' }, free)).toBe('level');
    expect(raceGate('free', { ...race, venue: 'kbryc' }, free)).toBe('venue');
    expect(raceGate('free', { ...race, classId: 'DF95' }, free)).toBe('class');
    // Before a class is chosen, any class (the first sailed becomes theirs).
    expect(raceGate('free', { ...race, classId: 'DF95' }, { ...free, classId: null })).toBeNull();
  });

  it('one race on their own transmitter, then the keyboard', () => {
    expect(raceGate('free', { ...race, transmitter: true }, free)).toBeNull();
    expect(raceGate('free', { ...race, transmitter: true }, { ...free, transmitterRaces: 1 })).toBe('transmitter');
  });

  it('Academy sails anything', () => {
    expect(raceGate('academy', { level: 'world', venue: 'kbryc', classId: '10R', transmitter: true }, { ...free, transmitterRaces: 9 })).toBeNull();
  });

  it('the two starter lessons are the first two of First sail; the Circuit and the lesson library are Academy', () => {
    expect(FREE_SCENES).toEqual(FIRST.slice(0, 2).map(m => m.id));
    expect(LOCKED_SCREENS.career).toBe('circuit');
    expect(LOCKED_SCREENS.academy).toBe('lesson');
    expect(LOCKED_SCREENS.home).toBeUndefined();
  });
});

describe('Prices', () => {
  it('are shown as people write them, and a year saves about three months', () => {
    expect(money(PRICES.academy.year)).toBe('A$119');
    expect(money(PRICES.academy.month)).toBe('A$12.99');
    expect(money(PRICES.member.year)).toBe('A$79');
    expect(yearSaving('academy')).toBe('A$36');
    expect(yearSaving('member')).toBe('A$28');
    expect(PRICES.member.year).toBeLessThan(PRICES.academy.year * 0.7);
  });
});

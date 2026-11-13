// The race officer's career: the course duty (the day, the truth, the marking, the fleet sailing it),
// the line duty (the call against the boats really over), and the standards you hold.
import { beforeEach, describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import {
  courseGuide, courseRaceSettings, courseRun, courseStart, courseTask, courseTruth, generalDue, lineRaceSettings, lineTask, markCourse, markLine, recordDuty, roLevel, roNext,
  markProtest, markScore, protestParties, protestTask, scoreTask, scoreTruth, sheetCell,
} from '@/components/race-simulator/ro';
import { loadTraining, mergeTraining, saveRo } from '@/components/race-simulator/progress';

describe('Race officer: set the course', () => {
  it('builds the same day from the same seed, harder by standard', () => {
    const a = courseTask('national', 7), b = courseTask('national', 7);
    expect(a).toEqual(b);
    expect(a.readings).toHaveLength(10);
    expect(courseTask('club', 7).character).toBe('steady');
    expect(courseTask('club', 7).shift).toBe(0);
    expect(Math.abs(courseTask('world', 9).shift)).toBeGreaterThanOrEqual(6);
    expect(courseTask('world', 9).fleet).toBeGreaterThan(courseTask('club', 9).fleet);
  });

  it('marks a course set to the truth at 100, and a poor one below the club pass', () => {
    const t = courseTask('state', 31), truth = courseTruth(t), g = courseGuide(t);
    expect(markCourse(t, { square: truth.start, mark: truth.beat, line: g.line, beat: g.beat }).score).toBe(100);
    const bad = markCourse(t, { square: truth.start + 14, mark: truth.beat - 15, line: Math.round(g.line * 0.4), beat: g.beat });
    expect(bad.score).toBeLessThan(60);
    expect(bad.parts[0].note).toMatch(/favoured/);
  });

  it('sizes the line and beat to the fleet', () => {
    const small = courseGuide({ ...courseTask('club', 1), fleet: 8 }), big = courseGuide({ ...courseTask('club', 1), fleet: 20 });
    expect(big.line).toBeGreaterThan(small.line);
    expect(big.beat).toBeGreaterThan(small.beat);
  });

  it('lays the race on your course: the mark where you put it, the line as long as you set', () => {
    const t = courseTask('state', 4), c = { ...courseStart(t), mark: courseStart(t).mark + 8 };
    const r = new Race(courseRaceSettings(t, c));
    const { pin, stbd } = r.course.start;
    const len = Math.hypot(stbd.x - pin.x, stbd.y - pin.y) / r.course.L;
    expect(len).toBeGreaterThan(c.line * 0.8); expect(len).toBeLessThan(c.line * 1.2);
    expect(r.player).toBeFalsy();
  });

  it('sails the course a slice at a time and reports how it went', () => {
    const t = courseTask('club', 12), run = courseRun(courseRaceSettings(t, courseStart(t)));
    let done = false, slices = 0;
    while (!done && slices < 400) { done = run.step(400); slices++; }
    expect(done).toBe(true);
    const o = run.result()!;
    expect(o.thirds.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(o.topLeft + o.topRight).toBeGreaterThan(0);
  }, 30000);
});

describe('Race officer: call the line', () => {
  it('sets some boats on the line early, by their real sail numbers', () => {
    const t = lineTask('state', 5);
    const r = new Race(lineRaceSettings(t));
    const sails = r.boats.map(b => b.sail);
    expect(Object.keys(t.eager).length).toBeGreaterThan(0);
    for (const s of Object.keys(t.eager)) expect(sails).toContain(s);
  });

  it('calls a general recall when a third of the fleet or five are over', () => {
    expect(generalDue(4, 12)).toBe(false);
    expect(generalDue(5, 12)).toBe(true);
    expect(generalDue(5, 16)).toBe(false);
    expect(generalDue(6, 16)).toBe(true);
  });

  it('marks the call', () => {
    expect(markLine(['3', '7'], ['3', '7'], false, 12)).toMatchObject({ score: 100, decisionRight: true });
    expect(markLine(['3', '7'], ['3'], false, 12)).toMatchObject({ score: 50, missed: ['7'] });
    expect(markLine(['3', '7'], ['3', '7', '9'], false, 12).score).toBe(70);
    expect(markLine([], [], false, 12).score).toBe(100);
    expect(markLine([], ['4'], false, 12).score).toBe(60);
    expect(markLine(['1', '2'], [], true, 12)).toMatchObject({ score: 25, decisionRight: false });
    expect(markLine(['1', '2', '3', '4', '5'], [], true, 12)).toMatchObject({ score: 100, decisionRight: true });
    expect(markLine(['1', '2', '3', '4', '5'], ['1', '2'], false, 12).score).toBe(16);
  });
});

describe('Race officer: score the racing', () => {
  it('builds the same series from the same seed, bigger and harder by standard', () => {
    expect(scoreTask('state', 9)).toEqual(scoreTask('state', 9));
    const club = scoreTask('club', 9), world = scoreTask('world', 9);
    expect(club.boats.length).toBe(8); expect(world.boats.length).toBe(14);
    expect(world.races.length).toBeGreaterThan(club.races.length);
  });
  it('at National and World there is always a tie on net to break', () => {
    for (const lv of ['national', 'world'] as const) for (const seed of [1, 2, 3]) {
      const rows = scoreTruth(scoreTask(lv, seed));
      expect(rows.some((r, i) => i > 0 && rows[i - 1].net === r.net), `${lv} ${seed}`).toBe(true);
    }
  });
  it('marks the nets and places against the results engine', () => {
    const t = scoreTask('state', 4), truth = scoreTruth(t);
    const nets = Object.fromEntries(truth.map(r => [r.userId, r.net])), places = Object.fromEntries(truth.map(r => [r.userId, r.rank]));
    expect(markScore(t, nets, places).score).toBe(100);
    expect(markScore(t, nets, {}).score).toBe(60);
    const off = { ...nets, [truth[0].userId]: truth[0].net + 1 };
    expect(markScore(t, off, places).score).toBe(94);
    // A letter scores the boats plus one.
    const coded = truth.flatMap(r => r.scores).find(s => s?.code);
    if (coded) expect(coded.points).toBe(t.boats.length + 1);
  });
  it('the sheet shows places among the finishers, and letters', () => {
    const t = scoreTask('world', 2);
    for (const r of t.races) {
      const cells = t.boats.map(b => sheetCell(t, r.no, b.id));
      const nums = cells.filter(c => /^\d+$/.test(c)).map(Number).sort((a, b) => a - b);
      expect(nums).toEqual(nums.map((_, k) => k + 1));
      for (const c of cells.filter(c => !/^\d+$/.test(c))) expect(['DNF', 'OCS', 'DSQ', 'DNC']).toContain(c);
    }
  });
});

describe('Race officer: hear a protest', () => {
  const v = (offender: string | null, rule: string | null) => ({ offender, rule, ruleTitle: null, text: '', at: null });
  const t = (hail: 'prompt' | 'late') => ({ ...protestTask('national', 3), hail });
  it('a late hail makes the protest invalid, whatever happened', () => {
    expect(markProtest(t('late'), v('Orange', '10'), { kind: 'invalid' }).score).toBe(100);
    expect(markProtest(t('late'), v('Orange', '10'), { kind: 'upheld', boat: 'Orange', rule: '10' }).score).toBe(0);
  });
  it('a valid protest: dismissed when nobody broke a rule, upheld against the right boat under the right rule', () => {
    expect(markProtest(t('prompt'), v(null, null), { kind: 'dismissed' }).score).toBe(100);
    expect(markProtest(t('prompt'), v('Orange', '18.2(a)'), { kind: 'upheld', boat: 'Orange', rule: '18.2(b)' }).score).toBe(100);
    expect(markProtest(t('prompt'), v('Orange', '10'), { kind: 'upheld', boat: 'Orange', rule: '11' }).score).toBe(70);
    expect(markProtest(t('prompt'), v('Orange', '10'), { kind: 'upheld', boat: 'Purple', rule: '10' }).score).toBe(20);
    expect(markProtest(t('prompt'), v('Orange', '10'), { kind: 'invalid' }).score).toBe(0);
  });
  it('the club standard always has a prompt hail; the protestee is the boat that fouled', () => {
    for (let s = 1; s < 20; s++) expect(protestTask('club', s).hail).toBe('prompt');
    expect(protestParties(t('prompt'), ['Purple', 'Orange'], v('Orange', '10'))).toEqual({ protestor: 'Purple', protestee: 'Orange' });
  });
});

describe('Race officer: standards', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it('steps up a standard when every duty is passed at it', () => {
    let r = recordDuty(undefined, 'course', 'club', 72, 1);
    r = recordDuty(r, 'line', 'club', 60, 2);
    r = recordDuty(r, 'score', 'club', 65, 3);
    expect(roLevel(r)).toBeNull(); expect(roNext(r)).toBe('club');
    r = recordDuty(r, 'protest', 'club', 100, 4);
    expect(roLevel(r)).toBe('club'); expect(roNext(r)).toBe('state');
    for (const d of ['course', 'score', 'protest'] as const) r = recordDuty(r, d, 'state', 90, 5);
    r = recordDuty(r, 'line', 'state', 40, 6);
    expect(roLevel(r)).toBe('club');
    r = recordDuty(r, 'line', 'state', 20, 7);
    expect(r.best['line:state']).toMatchObject({ score: 40, tries: 2 });
  });

  it('keeps the record with your training and merges the best of two devices', () => {
    saveRo(recordDuty(undefined, 'course', 'club', 70, 10));
    expect(loadTraining().ro?.best['course:club']?.score).toBe(70);
    const a = { ...loadTraining(), ro: recordDuty(undefined, 'course', 'club', 70, 10) };
    const b = { ...loadTraining(), ro: recordDuty(recordDuty(undefined, 'course', 'club', 55, 20), 'line', 'club', 80, 21) };
    const m = mergeTraining(a, b).ro!;
    expect(m.best['course:club']?.score).toBe(70);
    expect(m.best['line:club']?.score).toBe(80);
  });

});

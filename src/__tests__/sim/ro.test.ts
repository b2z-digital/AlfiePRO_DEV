// The race officer's career: the course duty (the day, the truth, the marking, the fleet sailing it),
// the line duty (the call against the boats really over), and the standards you hold.
import { beforeEach, describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import {
  courseGuide, courseRaceSettings, courseRun, courseStart, courseTask, courseTruth, generalDue, lineRaceSettings, lineTask, markCourse, markLine, recordDuty, roLevel, roNext,
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

describe('Race officer: standards', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it('steps up a standard when every duty is passed at it', () => {
    let r = recordDuty(undefined, 'course', 'club', 72, 1);
    expect(roLevel(r)).toBeNull(); expect(roNext(r)).toBe('club');
    r = recordDuty(r, 'line', 'club', 60, 2);
    expect(roLevel(r)).toBe('club'); expect(roNext(r)).toBe('state');
    r = recordDuty(r, 'course', 'state', 90, 3);
    r = recordDuty(r, 'line', 'state', 40, 4);
    expect(roLevel(r)).toBe('club');
    r = recordDuty(r, 'line', 'state', 20, 5);
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

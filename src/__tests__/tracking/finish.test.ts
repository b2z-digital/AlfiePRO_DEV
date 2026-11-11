import { describe, expect, it } from 'vitest';
import { analyseRace, type TrackedBoat, type TrackedCourse } from '@/components/tracking/core/analyse';
import { DemoRace } from '@/components/tracking/core/demo';

// A straight line course: start at y = 0, one mark far up the course is skipped by giving none,
// and the finish line at y = 20 crossed going up.
const course: TrackedCourse = {
  start: { pin: { x: -10, y: 0 }, boat: { x: 10, y: 0 } },
  finish: { pin: { x: -10, y: 20 }, boat: { x: 10, y: 20 } },
  waypoints: [],
  windDeg: 0,
};
/** A boat sailing straight up the course at 1 m/s from y0 (tag position) at t = 0, tag `bow` metres behind the bow. */
function boat(id: string, x: number, y0: number, bow: number, compass = true): TrackedBoat {
  const fixes = [];
  for (let t = -5; t <= 30; t += 0.1) fixes.push({ t, x, y: y0 + t, h: compass ? 0 : null });
  return { id, sail: id, name: id, color: '#fff', bow, length: 1, fixes };
}

describe('finishes are judged on the bow, not the tag', () => {
  it('splits bows 10 cm apart and calls 3 cm too close', () => {
    // A's tag is 0.42 m behind her bow, B's 0.30 m: same tag height, but A's bow is 12 cm ahead.
    const a = analyseRace([boat('A', -2, -1, 0.42), boat('B', 2, -1, 0.30)], course, 0, 30, { accuracy: 0.05, roundingM: 2, closeM: 0.3, stoppedS: 20, lostS: 5 });
    expect(a.finishes.map(f => f.boatId)).toEqual(['A', 'B']);
    expect(a.finishes[0].t).toBeCloseTo(21 - 0.42, 2);
    expect(a.finishes[0].margin).toBeCloseTo(0.12, 2);
    expect(a.finishes[0].tooClose).toEqual([]);
    const b = analyseRace([boat('A', -2, -1, 0.42), boat('B', 2, -0.91, 0.30)], course, 0, 30);
    expect(b.finishes[0].tooClose).toEqual(['B']);
  });
  it('works out the heading from the track when the tag has no compass', () => {
    const a = analyseRace([boat('A', -2, -1, 0.42, false), boat('B', 2, -1, 0.30, false)], course, 0, 30);
    expect(a.finishes.map(f => f.boatId)).toEqual(['A', 'B']);
    expect(a.finishes[0].t).toBeCloseTo(21 - 0.42, 1);
  });
  it('calls a bow over at the gun, and one exactly on the line too close to call', () => {
    const a = analyseRace([boat('A', -2, 0.2 - 0.42, 0.42), boat('B', 2, -0.42 + 0.01, 0.42), boat('C', 0, -1.5, 0.42)], course, 0, 30);
    expect(a.starts.find(s => s.boatId === 'A')!.call).toBe('over');
    expect(a.starts.find(s => s.boatId === 'B')!.call).toBe('close');
    expect(a.starts.find(s => s.boatId === 'C')!.call).toBe('clear');
    // A never went back: she hasn't started.
    expect(a.starts.find(s => s.boatId === 'A')!.startedAt).toBeNull();
  });
});

describe('a demo race with no compass on the tags', () => {
  it('still gets the finishing order right', () => {
    // (A race where nobody makes a muddle of a penalty on the finish line itself: positions alone can't unpick that.)
    const d = new DemoRace({ seed: 13, compass: false });
    d.sailToEnd();
    const a = analyseRace(d.boats, d.course, d.gun, d.t);
    const engine = d.race.results().filter(x => x.time != null).map(x => x.boat.id);
    expect(a.finishes.map(f => f.boatId)).toEqual(engine);
  }, 120000);
});

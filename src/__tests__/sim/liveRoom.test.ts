// Live race rooms end to end, over an in-memory network with delays: open a room, join, ready up,
// start, race in lockstep, and carry on when someone's connection drops.
import { describe, expect, it } from 'vitest';
import { LiveRoom, MemoryHub, MemoryTransport, newCode, cleanCode, type LiveMe, type RoomSettings } from '@/components/race-simulator/live';
import { Rng } from '@/sim/math';

const settings: RoomSettings = {
  classId: 'IOM', fleetSize: 6, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 1, length: 'short', sequenceSeconds: 30, coach: 'off', autoTrim: true, venue: 'lmryc', seaState: 'chop',
};
const person = (n: number): LiveMe => ({ id: `u${n}`, name: ['Ann', 'Ben', 'Cal'][n], sails: { IOM: ['12', '34', '56'][n] }, autoTrim: true });

describe('Live race rooms', () => {
  it('makes room codes that are easy to read out', () => {
    const r = new Rng(3);
    const c = newCode(() => r.next());
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(cleanCode(' ab-c1o2 ')).toBe('ABC102');
  });

  it('opens, fills, starts and sails the same race on every device, even when one drops out', () => {
    // Messages take 1 to 4 frames to arrive, a different time between each pair of devices.
    const hub = new MemoryHub((a, b) => 1 + ((a as unknown as { n: number }).n * 3 + (b as unknown as { n: number }).n) % 4);
    const ends: MemoryTransport[] = [];
    const link = () => { const t = hub.connect(); (t as unknown as { n: number }).n = ends.length; ends.push(t); return t; };
    const code = newCode();
    let clock = 1e6;
    const now = () => clock; // 50 ms a frame
    const host = new LiveRoom(code, person(0), true, settings, link(), now);
    clock += 10;
    const ben = new LiveRoom(code, person(1), false, null, link(), now);
    clock += 10;
    const cal = new LiveRoom(code, person(2), false, null, link(), now);
    for (let k = 0; k < 6; k++) hub.flush();
    expect(ben.settings?.classId).toBe('IOM');
    expect(host.people.map(p => p.name)).toEqual(['Ann', 'Ben', 'Cal']);
    expect(host.canStart).toBe(false); // Ben and Cal aren't ready yet
    ben.setReady(true); cal.setReady(true);
    for (let k = 0; k < 3; k++) hub.flush();
    expect(host.canStart).toBe(true);
    expect(ben.isHost).toBe(false);
    host.start(4242);
    for (let k = 0; k < 6; k++) hub.flush();
    const rooms = [host, ben, cal];
    expect(rooms.every(r => r.race)).toBe(true);
    expect(rooms.map(r => r.race!.seat)).toEqual([0, 1, 2]);
    expect(cal.race!.race.boats.slice(0, 3).map(b => `${b.name} ${b.sail}`)).toEqual(['Ann 12', 'Ben 34', 'Cal 56']);

    // Race: each device a frame at a time (one step a frame), helm moving now and then.
    const rng = [new Rng(1), new Rng(2), new Rng(3)];
    const helm = [[0, 1], [0, 1], [0, 1]];
    const DROP = 1300; // Cal's connection drops after this many frames
    for (let f = 0; f < 2600; f++) {
      rooms.forEach((room, k) => {
        if (k === 2 && f >= DROP) return; // Cal's device has gone quiet
        const lr = room.race!;
        if (rng[k].chance(0.04)) helm[k] = [Math.round(rng[k].range(-0.5, 0.5) * 100) / 100, 1];
        if (rng[k].chance(0.003)) lr.act(rng[k].chance(0.5) ? 'tack' : 'hail');
        lr.input(helm[k][0], helm[k][1]);
        const before = lr.race.step_;
        lr.race.step();
        if (lr.race.step_ !== before) lr.afterStep();
        lr.pump();
      });
      if (f === DROP) ends[2].close(); // and her presence goes
      hub.flush();
      clock += 50;
    }
    const [a, b, c] = rooms.map(r => r.race!);
    // Ann and Ben sailed on together, step for step; Cal's boat went to an AI skipper at a step both agree on.
    expect(a.race.step_).toBeGreaterThan(2000);
    expect(Math.abs(a.race.step_ - b.race.step_)).toBeLessThanOrEqual(12);
    expect(a.race.crew[2].aiFrom).not.toBe(Infinity);
    expect(b.race.crew[2].aiFrom).toBe(a.race.crew[2].aiFrom);
    expect(a.desync || b.desync).toBe(false);
    // Bring the two to the same step and compare the races, boat for boat.
    const target = Math.min(a.race.step_, b.race.step_);
    const at = (lr: typeof a) => { const r = new (lr.race.constructor as typeof import('@/sim/engine').Race)(lr.race.settings); r.followCrew(lr.race.crew.map(x => x.log)); r.crew.forEach((x, k) => { if (lr.race.crew[k].aiFrom !== Infinity) r.handOver(k, lr.race.crew[k].aiFrom); }); while (r.step_ < target) r.step(); return r.boats.map(x => `${x.x},${x.y},${x.hdg}`).join('|'); };
    expect(at(b)).toBe(at(a));
    expect(c.race.step_).toBeLessThan(a.race.step_); // Cal's device stopped where it lost touch
  }, 120000);
});

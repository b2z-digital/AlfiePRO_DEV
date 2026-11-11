// A club's water in the database: what's saved reads back as the same venue, and anything that
// isn't a sound venue is refused rather than raced on.
import { describe, expect, it } from 'vitest';
import { Race } from '@/sim/engine';
import { BUILT_IN, VENUES, registerVenue } from '@/sim/venues';
import { parseWaterId, shapeOf, traitsFrom, venueFromRow, waterId, type VenueRow } from '@/sim/venueJson';
import type { RaceSettings } from '@/sim/types';

const ROW = '0b0e3c7e-1111-4222-8333-444455556666';
const rowOf = (id: string, over: Partial<VenueRow> = {}): VenueRow => {
  const d = VENUES[id];
  return {
    id: ROW, club_id: 'club-1', venue_id: d.venueId ?? null, name: d.name, short_name: d.short, place: d.place,
    latitude: d.lat, longitude: d.lon, shape: JSON.parse(JSON.stringify(shapeOf(d))), version: 3,
    traits: JSON.parse(JSON.stringify(d.traits ?? {})), look: d.look ?? null, is_published: true, ...over,
  };
};
const base: RaceSettings = {
  classId: 'IOM', fleetSize: 6, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 1, length: 'medium', sequenceSeconds: 30, coach: 'off', autoTrim: true, seed: 7, noPlayer: true,
};

describe("A club's water in the database", () => {
  it.each(BUILT_IN.map(d => d.id))('reads %s back as the same venue', id => {
    const d = VENUES[id], back = venueFromRow(rowOf(id))!;
    expect(back).not.toBeNull();
    expect(back.id).toBe(waterId(ROW, 3));
    expect(back.water).toEqual(d.water);
    expect(back.islands).toEqual(d.islands);
    expect(back.control).toEqual(d.control);
    expect(back.features.length).toBe(d.features.length);
    expect(back.traits?.winds).toEqual(d.traits!.winds);
    expect(back.usualWind).toBe(d.usualWind);
    expect(back.cut).toBe(d.cut);
    expect(back.clubs).toEqual(['club-1']);
  });

  it('races the same on the saved copy as on the venue it was saved from', () => {
    const back = venueFromRow(rowOf('kbryc'))!;
    registerVenue(back);
    const run = (venue: string) => {
      const r = new Race({ ...base, venue, windFrom: 50 });
      while (!r.ended && r.t < 500) r.step();
      return { S: r.venue!.frame.S, order: r.results().map(x => `${x.boat.sail}:${x.time?.toFixed(2)}`).join(',') };
    };
    expect(run(back.id)).toEqual(run('kbryc'));
    // A venue never changes under an id.
    registerVenue({ ...back, name: 'Something else' });
    expect(VENUES[back.id].name).toBe(back.name);
  });

  it('knows its ids', () => {
    expect(parseWaterId(waterId(ROW, 12))).toEqual({ rowId: ROW, version: 12 });
    expect(parseWaterId('lmryc')).toBeNull();
    expect(parseWaterId(`db-${ROW}-v`)).toBeNull();
    expect(parseWaterId(undefined)).toBeNull();
  });

  it('refuses a row that is not a sound venue', () => {
    const good = rowOf('plrmyc');
    expect(venueFromRow(good)).not.toBeNull();
    const shape = good.shape as Record<string, unknown>;
    expect(venueFromRow({ ...good, shape: null })).toBeNull();
    expect(venueFromRow({ ...good, shape: { ...shape, v: 2 } })).toBeNull();
    expect(venueFromRow({ ...good, shape: { ...shape, water: [0, 0, 1, 1] } })).toBeNull();
    expect(venueFromRow({ ...good, shape: { ...shape, water: [0, 0, 100, 0, 'x', 100] } })).toBeNull();
    expect(venueFromRow({ ...good, shape: { ...shape, water: [0, 0, 1e9, 0, 0, 100] } })).toBeNull();
    expect(venueFromRow({ ...good, shape: { ...shape, control: [0, 0] } })).toBeNull();
    expect(venueFromRow({ ...good, latitude: 'x' as unknown as number })).toBeNull();
    expect(venueFromRow({ ...good, name: '' })).toBeNull();
  });

  it('puts a shore drawn the wrong way round the right way round, and drops what it does not understand', () => {
    const good = rowOf('plrmyc');
    const shape = good.shape as { water: number[]; features: unknown[] };
    const rev: number[] = [];
    for (let i = shape.water.length - 2; i >= 0; i -= 2) rev.push(shape.water[i], shape.water[i + 1]);
    const back = venueFromRow({ ...good, shape: { ...shape, water: rev, features: [['castle', 'x', [0, 0, 1, 1]], ['pier', '', [0, 0, 5, 5]], 'junk', ['bld', 'Shed', [0, 0, 'a', 2, 3, 3]]] } })!;
    const area = (r: { x: number; y: number }[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y; return a / 2; };
    expect(area(back.water)).toBeGreaterThan(0);
    expect(back.features.map(f => f.kind)).toEqual(['pier']);
  });

  it("tidies the club's local knowledge", () => {
    const t = traitsFrom({
      about: '  A   pond.  ', notes: ['  One. ', '', 7, 'x'.repeat(500)],
      winds: [
        { from: 405, name: ' WNW ', character: 'gale', pays: 'bank', note: ' Gusty.\n Shifty. ', when: '' },
        { from: 'north', name: 'Bad' }, { from: 10, name: '' }, null,
        { from: -90, name: 'Westerly', character: 'puffy', pays: 'sideways' },
      ],
    });
    expect(t.about).toBe('A pond.');
    expect(t.notes).toEqual(['One.', 'x'.repeat(200)]);
    expect(t.winds).toEqual([
      { from: 45, name: 'WNW', character: 'oscillating', note: 'Gusty. Shifty.', pays: 'bank' },
      { from: 270, name: 'Westerly', character: 'puffy' },
    ]);
    expect(traitsFrom(null)).toEqual({ about: '', winds: [], notes: [] });
  });
});

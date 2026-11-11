// Building a venue from the map: the water's edge comes off whatever way the place is mapped.
import { describe, expect, it } from 'vitest';
import { buildVenue, controlNear, type OsmElement } from '@/sim/venueBuild';
import { pts, wetIn } from '@/sim/venue';

const LAT = -33, LON = 151;
const KX = 111320 * Math.cos((LAT * Math.PI) / 180), KY = 110574;
const ll = (x: number, y: number) => ({ lat: LAT + y / KY, lon: LON + x / KX });
const way = (id: number, tags: Record<string, string>, xy: [number, number][]): OsmElement => ({ type: 'way', id, tags, geometry: xy.map(([x, y]) => ll(x, y)) });
const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (a: number[]) => { let s = 0; for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) s += a[j] * a[i + 1] - a[i] * a[j + 1]; return s / 2; };

describe('Building a venue from the map', () => {
  it('traces a lake: the shore anticlockwise, the island clockwise, both where the map has them', () => {
    const els: OsmElement[] = [
      { type: 'relation', id: 1, tags: { natural: 'water', name: 'Test Lake' }, members: [
        // The outer shore in two pieces, as lakes are often mapped.
        { type: 'way', role: 'outer', geometry: [[20, -150], [220, -150], [220, 150]].map(([x, y]) => ll(x, y)) },
        { type: 'way', role: 'outer', geometry: [[220, 150], [20, 150], [20, -150]].map(([x, y]) => ll(x, y)) },
        { type: 'way', role: 'inner', geometry: box(100, -20, 140, 20).map(([x, y]) => ll(x, y)) },
      ] },
    ];
    const v = buildVenue(els, LAT, LON, { half: 300, cell: 2 })!;
    expect(v).not.toBeNull();
    expect(v.waterName).toBe('Test Lake');
    expect(area(v.water)).toBeGreaterThan(0);
    expect(area(v.water)).toBeGreaterThan(200 * 300 * 0.97);
    expect(area(v.water)).toBeLessThan(200 * 300 * 1.03);
    expect(v.islands).toHaveLength(1);
    expect(area(v.islands[0])).toBeLessThan(0);
    expect(-area(v.islands[0])).toBeGreaterThan(40 * 40 * 0.85);
    const rings = [pts(v.water), ...v.islands.map(pts)];
    expect(wetIn(rings, 60, 0)).toBe(true);
    expect(wetIn(rings, 120, 0)).toBe(false);   // on the island
    expect(wetIn(rings, 10, 0)).toBe(false);    // on the bank
    // The skippers stand on the bank nearest the club, a step back from the water, 38 m end to end.
    const [a, b] = v.control;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(36);
    expect(a.x).toBeLessThan(20); expect(a.x).toBeGreaterThan(16);
    expect(wetIn(rings, a.x, a.y)).toBe(false);
  });

  it('picks the big water beside the club, not the pond that happens to be a step closer', () => {
    const els = [
      way(1, { natural: 'water', name: 'Duck Pond' }, box(-60, -30, -20, 30)),
      way(2, { natural: 'water' }, box(40, -400, 400, 400)),
      way(3, { waterway: 'river', name: 'Long River' }, [[200, -400], [200, 400]]),
    ];
    const v = buildVenue(els, LAT, LON, { half: 300, cell: 2 })!;
    expect(v.waterName).toBe('Long River');
    expect(wetIn([pts(v.water)], 100, 0)).toBe(true);
    // The river runs off the extract: it's cut at the edge.
    expect(Math.max(...v.water.filter((_, i) => i % 2 === 1))).toBeCloseTo(300, 0);
    // Pointing at the pond picks the pond.
    const p = buildVenue(els, LAT, LON, { half: 300, cell: 2, pick: { x: -40, y: 0 } })!;
    expect(p.waterName).toBe('Duck Pond');
    expect(area(p.water)).toBeLessThan(40 * 60 * 1.1);
  });

  it('fills the sea inside a coastline (water on the right of the way it is drawn)', () => {
    // Land to the west: the coast runs north to south down x = 30, so the sea (to its right) is... east
    // when drawn heading south.
    const els = [way(1, { natural: 'coastline' }, [[30, 400], [30, 60], [80, 0], [30, -60], [30, -400]].reverse() as [number, number][])];
    // Reversed it runs south to north with the land on its left (west) and the sea on its right (east).
    const v = buildVenue(els, LAT, LON, { half: 300, cell: 2 })!;
    expect(v).not.toBeNull();
    const rings = [pts(v.water)];
    expect(wetIn(rings, 200, 0)).toBe(true);
    expect(wetIn(rings, 60, 0)).toBe(false);  // the headland
    expect(wetIn(rings, -100, 0)).toBe(false);
  });

  it('keeps what is on the bank, nearest first, and the places across the water', () => {
    const els: OsmElement[] = [
      way(1, { natural: 'water' }, box(20, -200, 300, 200)),
      way(2, { building: 'yes', name: 'Clubhouse' }, box(-20, -8, -4, 8)),
      way(3, { highway: 'footway' }, [[10, -100], [10, 100]]),
      way(4, { man_made: 'pier' }, [[20, 40], [45, 40]]),
      way(5, { natural: 'beach' }, box(12, -60, 20, -30)),
      way(6, { building: 'yes' }, box(-900, 0, -880, 20)),
      { type: 'node', id: 7, lat: ll(0, 600).lat, lon: ll(700, 0).lon, tags: { place: 'suburb', name: 'Far Shore' } },
    ];
    const v = buildVenue(els, LAT, LON, { half: 300, cell: 2 })!;
    expect(v.features.map(f => f[0]).sort()).toEqual(['bld', 'path', 'pier', 'sand']);
    expect(v.features.find(f => f[0] === 'bld')![1]).toBe('Clubhouse');
    expect(v.landmarks.map(l => l.name)).toEqual(['Far Shore']);
  });

  it('gives the same venue every time', () => {
    const els = [way(1, { natural: 'water' }, [[20, -150], [120, -180], [260, -40], [240, 160], [90, 190], [20, -150]])];
    expect(JSON.stringify(buildVenue(els, LAT, LON, { half: 300 }))).toBe(JSON.stringify(buildVenue(els, LAT, LON, { half: 300 })));
  });

  it('finds a stretch of bank to stand on near any point', () => {
    const ring = pts([0, 0, 200, 0, 200, 100, 0, 100]);
    const c = controlNear([ring], { x: 100, y: 10 })!;
    expect(c[0].y).toBeCloseTo(-1.5, 5); expect(c[1].y).toBeCloseTo(-1.5, 5);
    expect(Math.abs(c[1].x - c[0].x)).toBeCloseTo(38, 5);
  });
});

describe('Parks drawn across the water', () => {
  it('are left out, so the water is never painted over', () => {
    const els: OsmElement[] = [
      way(1, { natural: 'water' }, box(20, -200, 300, 200)),
      way(2, { leisure: 'park', name: 'Water Sports Reserve' }, box(-100, -250, 280, 250)),
      way(3, { leisure: 'park', name: 'Foreshore Park' }, box(-100, -250, 30, 250)),
    ];
    const v = buildVenue(els, LAT, LON, { half: 300, cell: 2 })!;
    expect(v.features.map(f => f[1])).toEqual(['Foreshore Park']);
  });
});

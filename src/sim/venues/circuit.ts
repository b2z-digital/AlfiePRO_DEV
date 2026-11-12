// The waters of the AlfiePRO Circuit: invented places, so the career has somewhere to go that
// belongs to no country and no club. Each is drawn here from a few numbers (its size, how square
// its corners are, how much its shore wanders), with woods, a few buildings and a clubhouse green
// on its banks, and the winds it's known for. Nothing here is a real place or from a map.
//
// Metres from where the skippers stand: x east, y north. The skippers are on the south bank and
// look north across the water.
import type { Feature, VenueDef, VenueTraits } from '../venue';
import type { V2 } from '../math';
import { Rng } from '../math';

interface Spec {
  id: string; name: string; short: string; place: string;
  /** Half its length east to west and half its width north to south, m. */
  a: number; b: number;
  /** How square its corners are (2 is an ellipse; more is boxier), and how much its shore wanders (0 to 0.1). */
  square: number; wander: number;
  /** Where along the south bank the skippers stand: -1 the west end, 1 the east end. */
  stand: number;
  seed: number;
  /** Stretches of wooded bank, each from one compass bearing to another (degrees, clockwise from north, as seen from the middle of the water). */
  woods: [number, number][];
  /** Bearings with a building on the bank. */
  buildings: number[];
  landmarks: [string, number][];
  look: VenueDef['look'];
  traits: VenueTraits;
}

const TAU = Math.PI * 2;
/** A compass bearing from the middle of the water to the angle round it (anticlockwise from east). */
const ang = (bearing: number) => ((90 - bearing) * Math.PI) / 180;

function build(s: Spec): VenueDef {
  const rng = new Rng(s.seed);
  const waves = [2, 3, 4, 5, 7].map(k => ({ k, amp: (s.wander * rng.range(0.4, 1)) / Math.sqrt(k), ph: rng.range(0, TAU) }));
  const radius = (th: number) => {
    const c = Math.abs(Math.cos(th)) / s.a, d = Math.abs(Math.sin(th)) / s.b;
    const base = 1 / Math.pow(Math.pow(c, s.square) + Math.pow(d, s.square), 1 / s.square);
    return base * (1 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * th + w.ph), 0));
  };
  const at = (th: number, out = 0): V2 => { const r = radius(th) + out; return { x: r * Math.cos(th), y: r * Math.sin(th) }; };
  const N = 120;
  let water = Array.from({ length: N }, (_, i) => at((i / N) * TAU));
  // The skippers stand on the south bank: the shore there is put three metres in front of them.
  const x0 = s.stand * s.a * 0.55;
  const south = water.filter(p => p.y < 0 && Math.abs(p.x - x0) <= 22);
  const y0 = Math.min(...south.map(p => p.y));
  const move = (p: V2): V2 => ({ x: Math.round((p.x - x0) * 10) / 10, y: Math.round((p.y - y0 + 3) * 10) / 10 });
  water = water.map(move);
  const band = (b0: number, b1: number, near: number, far: number): V2[] => {
    // (Bearings run clockwise and angles anticlockwise, so the band is walked from b1 back to b0.)
    const t0 = ang(b1), t1 = ang(b0) < ang(b1) ? ang(b0) + TAU : ang(b0), n = Math.max(3, Math.round(((t1 - t0) / TAU) * 60));
    const ths = Array.from({ length: n + 1 }, (_, i) => t0 + ((t1 - t0) * i) / n);
    return [...ths.map(t => move(at(t, near))), ...ths.reverse().map(t => move(at(t, far)))];
  };
  const features: Feature[] = [
    // The green the skippers stand on, the clubhouse behind it and the lane that reaches it.
    { kind: 'park', name: `${s.name} green`, pts: [{ x: -46, y: -34 }, { x: 46, y: -34 }, { x: 46, y: 1 }, { x: -46, y: 1 }] },
    { kind: 'bld', name: 'Clubhouse', pts: [{ x: -12, y: -30 }, { x: 10, y: -30 }, { x: 10, y: -18 }, { x: -12, y: -18 }] },
    { kind: 'road', pts: [{ x: -160, y: -52 }, { x: -40, y: -44 }, { x: 60, y: -46 }, { x: 170, y: -58 }] },
    ...s.woods.map(([b0, b1]): Feature => ({ kind: 'wood', pts: band(b0, b1, 7, 52 + rng.range(0, 30)) })),
    ...s.buildings.map((bearing): Feature => {
      const c = move(at(ang(bearing), 20 + rng.range(0, 14))), w = 6 + rng.range(0, 5), d = 4 + rng.range(0, 3);
      return { kind: 'bld', pts: [{ x: c.x - w, y: c.y - d }, { x: c.x + w, y: c.y - d }, { x: c.x + w, y: c.y + d }, { x: c.x - w, y: c.y + d }] };
    }),
  ];
  return {
    id: s.id, name: s.name, short: s.short, place: s.place, lat: 0, lon: 0, invented: true,
    usualWind: s.traits.winds[0].from, usualWindName: s.traits.winds[0].name,
    control: [{ x: -14, y: 0 }, { x: 14, y: 0 }],
    water, islands: [], features,
    landmarks: s.landmarks.map(([name, bearing]) => ({ name, at: move(at(ang(bearing), 12)) })),
    credit: '', traits: s.traits, look: s.look,
  };
}

export const LANTERN_QUAY = build({
  id: 'circuit-lantern-quay', name: 'Lantern Quay', short: 'Lantern Quay', place: 'The old harbour basin',
  a: 210, b: 125, square: 5, wander: 0.012, stand: -0.3, seed: 4101,
  woods: [[200, 235]], buildings: [262, 276, 290, 304, 318, 332, 346, 0, 14, 28, 42, 56, 70, 84, 98, 125, 150],
  landmarks: [['The lantern tower', 60], ['Customs steps', 300]],
  look: { hills: 0.15, trees: 0.25, houses: 1 },
  traits: {
    about: 'A walled harbour basin with warehouses on three sides. Flat water, and a breeze that comes over the roofs in pieces.',
    winds: [
      { from: 250, name: 'Westerly over the warehouses', character: 'puffy', note: 'It drops into the basin in puffs. The gusts land first along the far wall.', pays: 'out' },
      { from: 70, name: 'Sea breeze through the harbour mouth', character: 'steady', note: 'Clean and even once it fills in.', pays: 'bank' },
    ],
    notes: ['The walls throw the breeze back: expect a lull within a few lengths of them.', 'Flat water rewards pointing high.'],
  },
});

export const HERON_REACH = build({
  id: 'circuit-heron-reach', name: 'Heron Reach', short: 'Heron Reach', place: 'A long bend of the river',
  a: 330, b: 105, square: 3.2, wander: 0.03, stand: 0.15, seed: 4202,
  woods: [[285, 75], [105, 160], [200, 250]], buildings: [90, 265],
  landmarks: [['Heron Point', 315], ['The old ferry stage', 80]],
  look: { hills: 0.35, trees: 1, houses: 0.2 },
  traits: {
    about: 'A long reach of slow river between wooded banks. The breeze funnels along it and swings as it comes round the bend.',
    winds: [
      { from: 285, name: 'Down-river breeze', character: 'persistent', note: 'It bends round Heron Point: the first beat usually pays on the far side.', pays: 'out' },
      { from: 100, name: 'Up-river breeze', character: 'oscillating', note: 'Regular shifts off the trees. Tack on the headers.', pays: 'bank' },
    ],
    notes: ['Under the trees on either bank the wind is light and late.', 'The middle of the river keeps its breeze longest.'],
  },
});

export const KESTRELWATER = build({
  id: 'circuit-kestrelwater', name: 'Kestrelwater', short: 'Kestrelwater', place: 'A tarn under the fells',
  a: 195, b: 150, square: 2.3, wander: 0.05, stand: 0.1, seed: 4303,
  woods: [[330, 30], [120, 150]], buildings: [200],
  landmarks: [['Kestrel Crag', 350], ['The boat landing', 110]],
  look: { hills: 1, trees: 0.45, houses: 0.05 },
  traits: {
    about: 'A round upland tarn with hills close on every side. The wind arrives in gusts off the crag and never from quite the same place twice.',
    winds: [
      { from: 340, name: 'Northerly off the crag', character: 'puffy', note: 'Hard gusts with holes between them. Keep the boat moving and look upwind for the next one.', pays: 'out' },
      { from: 265, name: 'Westerly up the valley', character: 'oscillating', note: 'Steadier, with a slow swing either way.', pays: 'bank' },
    ],
    notes: ['The gusts fan out as they land: the first boat into one is lifted on either tack.', 'Small waves build fast at the far shore in a blow.'],
  },
});

export const AUREL_LAKE = build({
  id: 'circuit-aurel-lake', name: 'Aurel Lake', short: 'Aurel Lake', place: 'The regatta lake',
  a: 300, b: 185, square: 2.6, wander: 0.035, stand: -0.1, seed: 4404,
  woods: [[280, 330], [20, 60], [130, 165]], buildings: [75, 90, 240, 255, 345],
  landmarks: [['The grandstand', 250], ['Aurel Island light', 15]],
  look: { hills: 0.5, trees: 0.7, houses: 0.5 },
  traits: {
    about: 'A wide, open lake built for regattas, with room for a full course in any wind. The home of the Regional Championship.',
    winds: [
      { from: 225, name: 'South-westerly across the lake', character: 'oscillating', note: 'Open and fair: shifts every minute or so, the same for everyone.', pays: 'out' },
      { from: 45, name: 'North-easterly', character: 'steady', note: 'Comes clean off the far shore. A boat-speed day.', pays: 'out' },
      { from: 315, name: 'North-westerly off the hills', character: 'puffy', note: 'Gusty, with more wind on the left of the first beat.', pays: 'bank' },
    ],
    notes: ['Enough fetch for a chop in a fresh breeze.', 'A championship course here is long: clear air matters more than the last shift.'],
  },
});

/** The Circuit's waters built so far. */
export const CIRCUIT_WATERS: VenueDef[] = [LANTERN_QUAY, HERON_REACH, KESTRELWATER, AUREL_LAKE];

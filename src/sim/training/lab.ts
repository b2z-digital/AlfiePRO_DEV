// The Scenario Lab: classic racing moments set up mid-race against AI skippers, in real wind, to
// replay until you win them. Each one ends at the next mark: did you get there ahead?
import type { SceneBoat } from '../scene';
import type { GoalCtx, Outcome } from './common';
import { SceneSpec, fouled, lost, rule14, won } from './common';
import { hold } from '../scene';

export interface LabMoment extends SceneSpec {
  /** One line for the card. */
  blurb: string;
  /** What it trains. */
  skill: string;
}

const CH_S = 317.5, CH_P = 42.5, RUN_S = 195, RUN_P = 165;


const rival = (role: string, at: [number, number], hdg: number, persona: string, level: SceneBoat['level'] = 'state', extra: Partial<SceneBoat> = {}): SceneBoat =>
  ({ role, at, hdg, helm: 'ai', persona, level, ...extra });

/** Ends when you round mark `leg` (the leg index you're on now): win if you're in the top `top`. */
function topAtMark(text: string, leg: number, top: number, seconds: number, mark: string): SceneSpec['goal'] {
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      const f = fouled(g) ?? rule14(g); if (f) return f;
      const p = g.player;
      if (p.legIndex > leg) {
        const place = p.placeAtLeg[p.placeAtLeg.length - 1] ?? 99;
        const of = g.race.boats.length;
        return place <= top
          ? won(`Round ${mark} ${ordinal(place)} of ${of}`, place === 1 ? 'Led them round.' : `In the top ${top}: that's the win.`, { score: place, stars: place === 1 ? 3 : place <= Math.ceil(top / 2) ? 2 : 1 })
          : lost(`Round ${mark} ${ordinal(place)} of ${of}`, `You needed the top ${top}. Try another way in.`, { score: place });
      }
      return null;
    },
    final: () => lost('Out of time', `Get round ${mark} before the time runs out.`),
    progress: g => `Place now: ${ordinal(g.race.livePlace(g.player))} of ${g.race.boats.length}`,
  };
}

/** Ends when either you or the rival rounds mark `leg`: win if it's you. */
function beatRival(text: string, leg: number, seconds: number, mark: string, rivalRole: string): SceneSpec['goal'] {
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      const f = fouled(g) ?? rule14(g); if (f) return f;
      const r = g.race.boats.find(b => b.name === rivalRole)!;
      if (g.player.legIndex > leg) return won(`Round ${mark} ahead of ${rivalRole}`, 'You won the moment.', { stars: 3 });
      if (r.legIndex > leg) return lost(`${rivalRole} rounded first`, 'She got there ahead. Watch the replay and try another plan.');
      return null;
    },
    final: () => lost('Out of time', `Get round ${mark} before ${rivalRole} does.`),
  };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const realWind = { flatWind: false, windCharacter: 'oscillating' as const };

export const LAB: LabMoment[] = [
  {
    kind: 'lab', id: 'port-approach', title: 'Port-tack approach', skill: 'Mark 1, crossing the fleet',
    blurb: 'Coming into mark 1 on port with three boats on the starboard layline.',
    brief: "You're on port, heading for mark 1. Three boats are coming in on starboard from the right.",
    tip: "You can't tack in front of them inside the zone (Rule 18.3) and you can't cross them unless you're clearly ahead. Decide early: duck and tack in their wake, or tack early below them to leeward.",
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [-5, -9], hdg: CH_P, helm: 'player', persona: 'steady', level: 'world' },
        rival('Steady', [5.5, -9.5], CH_S, 'steady'), rival('Squeezer', [7.0, -8.2], CH_S, 'squeezer'), rival('Speed builder', [8.5, -10.6], CH_S, 'builder'),
      ],
    }),
    goal: topAtMark('Round mark 1 in the top 2', 0, 2, 70, 'mark 1'),
    solution: 'ai',
    mistake: hold(CH_P),
    mistakeRule: '',
  },
  {
    kind: 'lab', id: 'crowded-rounding', title: 'Crowded rounding', skill: 'Mark 1, traffic',
    blurb: 'Five boats arrive at mark 1 together. Keep your place, or gain one.',
    brief: "You're third in a queue on the starboard layline to mark 1, with a port tacker coming in.",
    tip: "Stay on the layline with speed, don't pinch. Inside you, a boat clear ahead at the zone gets room. Round wide in and tight out so nobody can sneak inside on the exit.",
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [5.4, -5.6], hdg: CH_S, helm: 'player', persona: 'steady', level: 'world' },
        rival('Leader', [3.5, -3.7], CH_S, 'steady', 'national'), rival('Second', [4.4, -4.8], CH_S, 'careful', 'national'),
        rival('Fourth', [6.5, -6.8], CH_S, 'squeezer', 'national'), rival('Fifth', [7.6, -8.0], CH_S, 'builder', 'national'),
        rival('Port tacker', [-3, -5.5], CH_P, 'gambler', 'state'),
      ],
    }),
    goal: topAtMark('Round mark 1 in the top 3', 0, 3, 50, 'mark 1'),
    solution: 'ai',
    mistakeRule: '',
  },
  {
    kind: 'lab', id: 'gate-choice', title: 'Gate choice', skill: 'The leeward gate',
    blurb: 'Running to the gate with four boats. Which mark?',
    brief: "You're running to the leeward gate in the middle of a pack. Pick your gate mark.",
    tip: "Go for the less crowded mark, or the one that puts you on the favoured side for the next beat. Being inside at the zone matters more than which mark you pick.",
    scene: () => ({
      origin: 'GP', settings: realWind,
      boats: [
        { role: 'You', at: [-3.2, 11], hdg: RUN_S, leg: 2, helm: 'player', persona: 'steady', level: 'world' },
        rival('Steady', [-5.5, 12], RUN_S, 'steady', 'state', { leg: 2 }), rival('Gambler', [-1.0, 12.5], RUN_P, 'gambler', 'state', { leg: 2 }),
        rival('Shift player', [-3.8, 13.5], RUN_S, 'shifty', 'state', { leg: 2 }), rival('Squeezer', [0.5, 10.5], RUN_P, 'squeezer', 'state', { leg: 2 }),
      ],
    }),
    goal: topAtMark('Round the gate in the top 2', 2, 2, 60, 'the gate'),
    solution: 'ai',
    mistakeRule: '',
  },
  {
    kind: 'lab', id: 'layline', title: 'The layline call', skill: 'Shifts and laylines',
    blurb: 'Beat to mark 1 against one rival in a shifty breeze.',
    brief: "You and one rival are side by side, 16 lengths below mark 1, in an oscillating breeze.",
    tip: "Tack on the headers (watch the wind graph), stay off the laylines until late, and don't overstand: tack when the mark is just behind your beam.",
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [1, -16], hdg: CH_S, helm: 'player', persona: 'shifty', level: 'world' },
        rival('Rival', [3.2, -16.4], CH_S, 'steady', 'state'),
      ],
    }),
    goal: beatRival('Round mark 1 ahead of your rival', 0, 90, 'mark 1', 'Rival'),
    solution: 'ai',
    mistakeRule: '',
  },
  {
    kind: 'lab', id: 'cover', title: 'Protect your lead', skill: 'Covering',
    blurb: "You're three lengths ahead. Stay there.",
    brief: "You're leading by three lengths up the beat. Your rival behind will split away and look for a shift.",
    tip: 'Stay between her and the mark. When she tacks, tack soon after so you stay on the same side of the course, and keep her in your wind shadow if you can.',
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [0, -14], hdg: CH_S, helm: 'player', persona: 'steady', level: 'world' },
        rival('Rival', [2.0, -16.2], CH_S, 'shifty', 'national'),
      ],
    }),
    goal: beatRival('Round mark 1 still ahead of your rival', 0, 90, 'mark 1', 'Rival'),
    solution: 'ai',
    mistakeRule: '',
  },
  {
    kind: 'lab', id: 'downwind-pass', title: 'Pass on the run', skill: 'Downwind',
    blurb: 'Two lengths behind on the run. Use your wind shadow.',
    brief: "You're two lengths behind your rival on the run to the gate.",
    tip: "Your wind shadow reaches several lengths downwind: sit right behind her to slow her, then pass. Get the inside overlap before the zone and you'll get mark-room.",
    scene: () => ({
      origin: 'GP', settings: realWind,
      boats: [
        { role: 'You', at: [-3.1, 14.6], hdg: RUN_S, leg: 2, helm: 'player', persona: 'builder', level: 'world' },
        rival('Rival', [-2.8, 12.9], RUN_S, 'careful', 'club', { leg: 2 }),
      ],
    }),
    goal: beatRival('Round the gate ahead of your rival', 2, 60, 'the gate', 'Rival'),
    solution: 'ai',
    mistakeRule: '',
  },
];

export function findMoment(id: string): LabMoment | null { return LAB.find(m => m.id === id) ?? null; }

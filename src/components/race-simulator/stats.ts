// What happened in a race, from the player's point of view: a light log taken while racing,
// turned into the debrief numbers and the three things to work on.
import type { Race } from '@/sim/engine';
import type { Boat, Incident } from '@/sim/types';
import { dist, dot, n180, sub, KN } from '@/sim/math';
import { iomRig } from '@/sim/classes';
import { DRILLS, LAB, MODULES } from '@/sim/training';
import { LossTally, versus, type Cause, type Ledger } from './ledger';
import type { Focus } from './focus';

interface Sample { t: number; leg: number; upwind: boolean; tack: 'port' | 'stbd'; shift: number; spdPct: number; shadow: number; started: boolean }

/** Sampled twice a second while racing. */
export class PlayerLog {
  samples: Sample[] = [];
  tacks: { t: number; headed: number; upwind: boolean }[] = [];
  gybes = 0;
  atGun: { spdPct: number } | null = null;
  startAlong: number | null = null;
  /** Where the race is going: lengths given away, by cause, kept as you sail. */
  tally = new LossTally();
  /** The same for every other boat, so yours can be set against the fleet you raced. */
  others = new Map<string, LossTally>();
  private lastTack: 'port' | 'stbd' | null = null;
  private lastT = -1;

  sample(race: Race, p: Boat, meanTwd: number) {
    this.tally.step(race, p);
    for (const b of race.boats) {
      if (b === p) continue;
      let t = this.others.get(b.id);
      if (!t) this.others.set(b.id, (t = new LossTally()));
      t.step(race, b);
    }
    if (race.t - this.lastT < 0.5) return;
    this.lastT = race.t;
    const leg = race.course.legs[p.legIndex];
    const upwind = !!leg?.upwind;
    const shift = n180(p.twd - meanTwd);
    const lifted = p.tack === 'stbd' ? shift : -shift;
    if (this.lastTack && p.tack !== this.lastTack && p.started && !p.finished) {
      // How headed she was on the tack she left: the same shift lifts the new tack by as much.
      if (Math.abs(p.twa) < 100) this.tacks.push({ t: race.t, headed: lifted, upwind });
      else this.gybes++;
    }
    this.lastTack = p.tack;
    if (!this.atGun && race.t >= race.gunT) this.atGun = { spdPct: p.targetSpd > 0 ? p.spd / p.targetSpd : 0 };
    if (p.started && this.startAlong === null) {
      const c = race.course;
      this.startAlong = dot(sub(p, c.start.pin), { x: (c.start.stbd.x - c.start.pin.x) / dist(c.start.pin, c.start.stbd), y: (c.start.stbd.y - c.start.pin.y) / dist(c.start.pin, c.start.stbd) });
    }
    if (!p.started || p.finished) return;
    this.samples.push({ t: race.t, leg: p.legIndex, upwind, tack: p.tack, shift: lifted, spdPct: p.targetSpd > 0 ? Math.min(1.3, p.spd / p.targetSpd) : 0, shadow: p.shadow, started: p.started });
  }
}

/** Where a takeaway points: the drill, rules lesson or lab moment that trains it. */
export interface TrainLink { kind: 'drill' | 'lesson' | 'lab'; id: string; label: string }
export interface Takeaway { tone: 'warn' | 'good' | 'plain'; text: string; link?: TrainLink }

/** The first Rules Academy situation about a rule that you can sail. */
function lessonFor(rule: string): TrainLink | undefined {
  const base = rule.replace(/\(.*$/, '');
  for (const m of MODULES) for (const s of m.situations) {
    if (s.play && s.rules.some(r => r === rule || r.replace(/\(.*$/, '') === base)) return { kind: 'lesson', id: `${m.id}/${s.id}`, label: `Sail Rule ${rule} in the Academy` };
  }
  return undefined;
}

export interface RaceSummary {
  at: number;
  mode: 'race' | 'start';
  title: string;
  cls: string; level: string; fleet: number; wind: string;
  status: 'finished' | 'dsq' | 'ocs' | 'dnf' | 'racing';
  place: number | null; of: number;
  time: number | null; behind: number | null;
  late: number | null; spdAtGun: number | null; fromFavouredL: number | null; favoured: string; ocs: boolean;
  penalties: number;
  incidents: { t: number; rule: string; title: string; mine: boolean; victim: boolean; text: string; next: string }[];
  placesByLeg: { label: string; place: number }[];
  upwind: { liftedPct: number | null; tacks: number; headerTacks: number; headers: number; winnerLiftedPct: number | null };
  downwind: { spdPct: number | null; gybes: number; clearAirPct: number | null };
  roundings: { gained: number; count: number };
  takeaways: Takeaway[];
  /** Where the race went: lengths given away to a perfect race, by cause (races sailed before this was kept have none). */
  ledger?: Ledger;
  /** The one thing this race was for, and whether it was met. */
  focus?: Focus;
  /** A rig you chose yourself (IOM): yours, the one the fleet carried, and the breeze in knots. */
  rig?: { mine: 'A' | 'B' | 'C'; fleet: 'A' | 'B' | 'C'; knots: number };
}

/** The practice that fixes each cause of lost lengths. */
export function causeLink(cause: Cause, led: Ledger): TrainLink {
  const lab = (id: string): TrainLink => ({ kind: 'lab', id, label: `Practise: ${LAB.find(m => m.id === id)?.title ?? id}` });
  const drill = (id: string): TrainLink => ({ kind: 'drill', id, label: `Practise: ${DRILLS.find(d => d.id === id)?.title ?? id}` });
  const speed = led.parts.find(p => p.cause === 'speed')?.lengths ?? 0, turns = led.parts.find(p => p.cause === 'turns')?.lengths ?? 0;
  switch (cause) {
    case 'start': return drill('time-distance');
    case 'speed': return lab(led.speedUp >= speed / 2 ? 'speed-up-chop' : 'speed-down-chop');
    case 'turns': return lab(led.tacks >= turns / 2 ? 'tacks' : 'gybes');
    case 'shifts': return lab('last-beat');
    case 'laylines': return lab('layline');
    case 'roundings': return lab('gate-exit');
    case 'air': return lab('dirty-air');
    case 'penalties': return lab('cross-or-duck');
  }
}

const pct = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function summarize(race: Race, log: PlayerLog, mode: 'race' | 'start'): RaceSummary {
  const p = race.player!;
  const s = race.settings;
  const c = race.course, L = c.L;
  const rows = race.results();
  const mine = rows.find(r => r.boat === p)!;
  const winner = rows[0];
  const startEv = race.events.find(e => e.type === 'started' && e.boat === p.id) as { late: number } | undefined;
  const late = startEv ? startEv.late : null;

  // Favoured end and how far from it she started.
  const P = c.start.pin, S = c.start.stbd;
  const twd = race.wind.meanTwd(race.gunT);
  const sq = (Math.atan2(S.x - P.x, S.y - P.y) * 180) / Math.PI - 90;
  const bias = n180(twd - sq);
  const favoured = Math.abs(bias) < 1.5 ? 'square' : bias > 0 ? 'starboard end' : 'pin end';
  const lineLen = dist(P, S);
  const fromFavouredL = log.startAlong === null || favoured === 'square' ? null
    : (bias > 0 ? lineLen - log.startAlong : log.startAlong) / L;

  // Places: at the start (order of crossing), then at each mark.
  const starts = race.events.filter(e => e.type === 'started') as { boat: string; t: number }[];
  const startPlace = starts.findIndex(e => e.boat === p.id) + 1;
  const legLabel = (k: number) => {
    const leg = c.legs[k];
    if (!leg) return 'Finish';
    if (leg.kind === 'finish') return 'Finish';
    if (leg.kind === 'gate') return 'Gate';
    return leg.rounding.markId === 'W' ? 'M1' : leg.rounding.markId === 'F' ? 'Offset' : leg.rounding.markId;
  };
  const placesByLeg: { label: string; place: number }[] = [];
  if (startPlace > 0) placesByLeg.push({ label: 'Start', place: startPlace });
  p.placeAtLeg.forEach((pl, k) => { if (legLabel(k) !== 'Offset') placesByLeg.push({ label: legLabel(k), place: pl }); });

  // Roundings: places gained from one mark to the next.
  let gained = 0, count = 0;
  for (let k = 1; k < placesByLeg.length; k++) { gained += placesByLeg[k - 1].place - placesByLeg[k].place; count++; }

  const up = log.samples.filter(x => x.upwind);
  const dn = log.samples.filter(x => !x.upwind);
  const liftedPct = up.length ? up.filter(x => x.shift > 0).length / up.length : null;
  const upTacks = log.tacks.filter(x => x.upwind);
  const headerTacks = upTacks.filter(x => x.headed > 3).length;
  const headers = countHeaders(up);

  const incidents = race.incidents
    .filter(i => i.offender === p.id || i.victim === p.id)
    .map((i: Incident) => ({ t: i.t - race.gunT, rule: i.rule, title: i.title, mine: i.offender === p.id, victim: i.victim === p.id, text: i.explanation, next: i.nextTime ?? '' }));

  const sum: RaceSummary = {
    at: Date.now(), mode,
    title: mode === 'start' ? 'Start practice' : 'Quick race',
    cls: p.cls.name, level: s.level, fleet: race.boats.length,
    wind: `${s.windKnots != null ? `${Math.round(s.windKnots)} kn` : `${s.windStrength} wind`}, ${s.windCharacter}${race.venue ? ` · ${race.venue.def.short}` : ''}`,
    status: mine.status, place: mine.status === 'finished' ? mine.place : null, of: race.boats.length,
    time: mine.time, behind: mine.time !== null && winner.time !== null ? mine.time - winner.time : null,
    late, spdAtGun: log.atGun?.spdPct ?? null, fromFavouredL, favoured,
    ocs: race.incidents.some(i => i.kind === 'ocs' && i.offender === p.id),
    penalties: p.penalty.taken,
    incidents,
    placesByLeg,
    upwind: { liftedPct, tacks: upTacks.length, headerTacks, headers, winnerLiftedPct: null },
    downwind: { spdPct: pct(dn.map(x => x.spdPct)), gybes: log.gybes, clearAirPct: dn.length ? dn.filter(x => x.shadow < 0.05).length / dn.length : null },
    roundings: { gained, count },
    takeaways: [],
    // (Away from the favoured end of a biased line: that far along it, times the sine of the bias.)
    ledger: mode === 'race' ? log.tally.result(p, fromFavouredL === null ? 0 : fromFavouredL * Math.sin((Math.abs(bias) * Math.PI) / 180)) : undefined,
  };
  if (s.rig && p.rig) { const kn = race.wind.baseTws / KN; sum.rig = { mine: p.rig, fleet: iomRig(kn), knots: Math.round(kn) }; }
  // Against the fleet: every other boat that raced most of what you did (like with like, so without
  // the favoured-end allowance only your own start has).
  if (sum.ledger && mine.status === 'finished') {
    const own = log.tally.result(p);
    const others = race.boats
      .filter(b => b !== p && b.started && !b.retired && !b.disabled && !b.dsq && log.others.has(b.id))
      .map(b => log.others.get(b.id)!.result(b))
      .filter(l => l.minutes >= 0.6 * own.minutes);
    if (others.length >= 3) sum.ledger.vs = versus(own, others, s.level);
  }
  sum.takeaways = takeaways(sum);
  // The wrong rig for the day comes first: nothing else you did mattered as much.
  const rigNote = rigTakeaway(sum);
  if (rigNote) sum.takeaways = [rigNote, ...sum.takeaways].slice(0, 3);
  return sum;
}

/** Headers big enough to tack on: count each time the shift goes past -5° on a beat. */
function countHeaders(up: Sample[]): number {
  let n = 0, inHeader = false;
  for (const x of up) {
    if (!inHeader && x.shift < -5) { n++; inHeader = true; }
    else if (inHeader && x.shift > -2) inHeader = false;
  }
  return n;
}

/** You chose your own rig and it wasn't the fleet's: what that did. */
export function rigTakeaway(s: RaceSummary): Takeaway | null {
  const r = s.rig;
  if (!r || r.mine === r.fleet) return null;
  const big = r.mine < r.fleet; // 'A' < 'B' < 'C': a letter earlier is a bigger rig
  return {
    tone: 'warn',
    text: `You carried the ${r.mine} rig in ${r.knots} knots; the fleet was on the ${r.fleet}. ${big
      ? 'With too much sail she lies over past 28 degrees, where the hull drags and the rudder loses its grip, and she buries her bow on the run.'
      : "With too little sail she's short of drive, most of all in the lulls and out of the tacks."} It shows under boat speed in where your race went.`,
  };
}

/** Full speed at the gun: below this she was still getting going as she crossed. */
const START_SPEED = 0.9;
/** Further than this from the favoured end (lengths) is worth saying. */
const START_FAR = 4;

/**
 * What the start cost you, in words that match the numbers: late, slow across the line, away from
 * the favoured end, or (none of those) just getting up to full speed in the first seconds.
 */
export function startWords(s: Pick<RaceSummary, 'late' | 'spdAtGun' | 'fromFavouredL' | 'favoured' | 'ocs'>): string {
  if (s.ocs) return 'Over the line at the gun, and back round to start again.';
  if (s.late === null) return 'Getting away from the line.';
  const pct = s.spdAtGun !== null ? Math.round(s.spdAtGun * 100) : null;
  const slow = pct !== null && s.spdAtGun! < START_SPEED;
  const far = s.fromFavouredL !== null && s.fromFavouredL > START_FAR;
  const when = s.late > 3 ? `You crossed ${s.late.toFixed(1)} s after the gun` : `On time (${s.late.toFixed(1)} s after the gun)`;
  const bits: string[] = [];
  if (slow) bits.push(`${s.late > 3 ? 'and' : 'but'} at ${pct}% speed, still getting going`);
  if (far) bits.push(`${bits.length || s.late > 3 ? 'and' : 'but'} ${Math.round(s.fromFavouredL!)} lengths from the favoured ${s.favoured}`);
  if (!bits.length && s.late <= 3) return `${when}${pct !== null ? ` at ${pct}% speed` : ''}: what's here is the first seconds of getting up to full speed.`;
  return `${when}${bits.length ? `, ${bits.join(', ')}` : ''}.`;
}

export function takeaways(s: RaceSummary): Takeaway[] {
  const out: Takeaway[] = [];
  const myInc = s.incidents.filter(i => i.mine && i.rule !== '29.1');
  if (myInc.length) {
    const i = myInc[0];
    out.push({ tone: 'warn', text: `${i.title} (Rule ${i.rule}) ${i.t < 0 ? 'before the start' : `at ${fmt(i.t)}`} cost you a penalty. ${i.next || 'Read the situation earlier and keep clear in good time.'}`, link: lessonFor(i.rule) });
  }
  if (s.ocs) out.push({ tone: 'warn', text: 'You were over the line at the gun. Judge time-to-line from where you are, and pull the trigger only when it matches the clock.', link: { kind: 'drill', id: 'recall', label: 'Over early: the recovery drill' } });
  else if (s.late !== null) {
    if (s.late > 3) out.push({ tone: 'warn', text: `You crossed the line ${s.late.toFixed(1)} s after the gun. Hover a length or two back and pull the trigger when time-to-line matches the clock.`, link: { kind: 'drill', id: 'time-distance', label: 'Time on distance drill' } });
    else if (s.spdAtGun !== null && s.spdAtGun < START_SPEED) {
      // On time but slow: that's not a good start, and the ledger above says so too.
      out.push({ tone: 'plain', text: `On time at the gun (${s.late.toFixed(1)} s after it), but at only ${Math.round(s.spdAtGun * 100)}% speed, so the boats beside you sailed away. Be at full speed as the gun goes: start your run a second or two sooner, with the sail sheeted in.${s.fromFavouredL !== null && s.fromFavouredL > START_FAR ? ` And the ${s.favoured} was favoured: you were ${Math.round(s.fromFavouredL)} lengths from it.` : ''}`, link: { kind: 'drill', id: 'speed', label: 'Full speed at the gun drill' } });
    } else if (s.fromFavouredL !== null && s.fromFavouredL > START_FAR) {
      out.push({ tone: 'plain', text: `On time and at speed (${s.late.toFixed(1)} s after the gun${s.spdAtGun !== null ? `, ${Math.round(s.spdAtGun * 100)}%` : ''}), but ${Math.round(s.fromFavouredL)} lengths from the favoured ${s.favoured}, which cost you before the race had begun.`, link: { kind: 'drill', id: 'favoured-end', label: 'Find the favoured end drill' } });
    } else out.push({ tone: 'good', text: `Good start: ${s.late.toFixed(1)} s after the gun${s.spdAtGun !== null ? ` at ${Math.round(s.spdAtGun * 100)}% speed` : ''}.` });
  }
  if (s.mode === 'race' && s.upwind.liftedPct !== null) {
    if (s.upwind.headers > 0 && s.upwind.headerTacks < s.upwind.headers / 2) out.push({ tone: 'plain', text: `You tacked on ${s.upwind.headerTacks} of ${s.upwind.headers} big headers upwind. Watch the wind graph and tack when you're knocked more than 5°.`, link: { kind: 'lab', id: 'layline', label: 'The layline call in the Lab' } });
    else if (s.upwind.liftedPct < 0.55) out.push({ tone: 'plain', text: `Only ${Math.round(s.upwind.liftedPct * 100)}% of your beating was on the lifted tack. Stay on the tack that points you closer to the mark.`, link: { kind: 'lab', id: 'layline', label: 'The layline call in the Lab' } });
    else out.push({ tone: 'good', text: `You spent ${Math.round(s.upwind.liftedPct * 100)}% of the beats on the lifted tack. Keep it up.` });
  }
  if (s.mode === 'race' && s.downwind.spdPct !== null && s.downwind.spdPct < 0.88) out.push({ tone: 'plain', text: `Downwind you averaged ${Math.round(s.downwind.spdPct * 100)}% of target speed. Keep the sail eased right out and avoid sailing in other boats' wind shadow.`, link: { kind: 'lab', id: 'downwind-pass', label: 'Pass on the run in the Lab' } });
  if (s.mode === 'race' && s.roundings.gained < -1) out.push({ tone: 'plain', text: `You lost ${-s.roundings.gained} places between marks. Round wide in and tight out, and keep clear air on the exits.`, link: { kind: 'lab', id: 'crowded-rounding', label: 'Crowded rounding in the Lab' } });
  return out.slice(0, 3);
}

export function fmt(sec: number): string {
  const a = Math.max(0, sec);
  return `${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, '0')}`;
}

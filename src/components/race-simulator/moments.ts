// Alfie's moments: the times in a race worth watching again, each with what happened and what would
// have been better. Found from the race's track (every boat, five times a second), its events and
// incidents, and the player's log. The debrief replay jumps to each one, and you can take over the
// race from there and sail it again.
import type { Race } from '@/sim/engine';
import { vmgAngles } from '@/sim/classes';
import { bearing, dist, n180 } from '@/sim/math';
import type { PlayerLog, RaceSummary, TrainLink } from './stats';
import { fmt } from './stats';
import { ordinal } from './ui';

export interface Moment {
  /** Race time, seconds from the start of the sequence (as race.t). */
  t: number;
  kind: 'start' | 'tack' | 'header' | 'layline' | 'mark' | 'incident' | 'downwind' | 'finish';
  title: string;
  /** Alfie on what happened, and what would have been better. */
  text: string;
  tone: 'good' | 'warn' | 'plain';
  /** Boats to follow in the replay, the player first. */
  focus: string[];
  /** Somewhere to practise it. */
  link?: TrainLink;
  /** Where to take over to sail it again (race time), if it makes sense here. */
  from?: number;
}

const DEG = Math.PI / 180;

/** The track frame nearest race time t. */
export function frameAt(race: Race, t: number): number {
  const T = race.track;
  if (!T.length) return 0;
  let lo = 0, hi = T.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (T[m].t < t) lo = m + 1; else hi = m; }
  return lo;
}

export function findMoments(race: Race, log: PlayerLog, sum: RaceSummary): Moment[] {
  const p = race.player;
  if (!p) return [];
  const c = race.course, L = c.L;
  const i0 = race.boats.indexOf(p);
  const rows = race.results();
  const winner = rows[0]?.boat;
  const others = (ids: (string | undefined | null)[]) => [p.id, ...ids.filter((x): x is string => !!x && x !== p.id)];
  const out: Moment[] = [];
  const extra: (Moment & { score: number })[] = [];

  // ── The start ──
  {
    const startEv = race.events.find(e => e.type === 'started' && e.boat === p.id) as { t: number; late: number } | undefined;
    const t = startEv ? Math.min(startEv.t, race.gunT + 6) : race.gunT;
    let text: string, tone: Moment['tone'], link: TrainLink | undefined;
    if (sum.ocs) {
      text = 'Over the line at the gun, so you had to dip back below it and start again. Judge time to the line from where you are, hold back a length, and go when it matches the clock.';
      tone = 'warn'; link = { kind: 'drill', id: 'recall', label: 'Over early: the recovery drill' };
    } else if (sum.late === null) {
      text = "You didn't get across the line. Be in the starting area with a minute to go, and line up your run in good time.";
      tone = 'warn'; link = { kind: 'drill', id: 'time-distance', label: 'Time on distance drill' };
    } else if (sum.late > 3) {
      text = `Across the line ${sum.late.toFixed(1)} s after the gun${sum.spdAtGun !== null ? `, at ${Math.round(sum.spdAtGun * 100)}% speed` : ''}. Hover a length or two below the line and pull the trigger when your time to the line matches the clock, so you cross at full speed on the gun.`;
      tone = 'warn'; link = { kind: 'drill', id: 'time-distance', label: 'Time on distance drill' };
    } else if (sum.spdAtGun !== null && sum.spdAtGun < 0.75) {
      text = `On time, ${sum.late.toFixed(1)} s after the gun, but at only ${Math.round(sum.spdAtGun * 100)}% speed. Sheet in and bear away a touch in the last five seconds so you cross at full pace.`;
      tone = 'plain'; link = { kind: 'drill', id: 'time-distance', label: 'Time on distance drill' };
    } else {
      text = `A good start: ${sum.late.toFixed(1)} s after the gun${sum.spdAtGun !== null ? ` at ${Math.round(sum.spdAtGun * 100)}% speed` : ''}.`;
      tone = 'good';
    }
    if (sum.fromFavouredL !== null && sum.fromFavouredL > 4 && !sum.ocs) {
      text += ` The ${sum.favoured} was favoured and you started ${Math.round(sum.fromFavouredL)} lengths from it: check the line with a quick luff head to wind before the start.`;
      if (tone === 'good') tone = 'plain';
      link = link ?? { kind: 'drill', id: 'favoured-end', label: 'Find the favoured end drill' };
    }
    // Where the winner started.
    if (winner && winner !== p) {
      const wEv = race.events.find(e => e.type === 'started' && e.boat === winner.id) as { t: number } | undefined;
      if (wEv) {
        const k = frameAt(race, wEv.t), wi = race.boats.indexOf(winner);
        const d = race.track[k]?.d;
        if (d) {
          const P = c.start.pin, S = c.start.stbd, ll = dist(P, S);
          const along = ((d[wi * 5] - P.x) * (S.x - P.x) + (d[wi * 5 + 1] - P.y) * (S.y - P.y)) / ll;
          const end = along < ll * 0.3 ? 'near the pin' : along > ll * 0.7 ? 'near the starboard end' : 'in the middle of the line';
          text += ` ${winner.sail}, the winner, started ${end}.`;
        }
      }
    }
    out.push({ t, kind: 'start', title: 'The start', text, tone, focus: others([winner?.id]), link, from: race.gunT - 25 });
  }

  // ── Tacks upwind: on a header is right, on a lift gives it away ──
  const upTacks = log.tacks.filter(x => x.upwind);
  for (const tk of upTacks) {
    if (tk.headed > 4.5) extra.push({ t: tk.t, kind: 'tack', title: `Tacked on a ${Math.round(tk.headed)}° header`, text: `Right on: you were knocked ${Math.round(tk.headed)}° and tacked, so the new tack points you that much closer to the mark.`, tone: 'good', focus: [p.id], score: tk.headed * 0.8, from: tk.t - 8 });
    else if (tk.headed < -3.5) extra.push({ t: tk.t, kind: 'tack', title: `Tacked on a ${Math.round(-tk.headed)}° lift`, text: `The tack you left was lifted ${Math.round(-tk.headed)}°: it pointed you closer to the mark than the one you tacked onto. Unless you needed clear air or the layline, hold on until you're headed, then tack.`, tone: 'warn', focus: [p.id], score: -tk.headed * 1.2, link: { kind: 'lab', id: 'layline', label: 'The layline call in the Lab' }, from: tk.t - 8 });
  }

  // ── Headers she sailed on without tacking ──
  {
    const up = log.samples.filter(x => x.upwind);
    let s0 = -1, worst = 0;
    const flush = (end: number) => {
      if (s0 < 0) return;
      const a = up[s0], b = up[end];
      const dur = b.t - a.t;
      if (dur >= 10) extra.push({ t: a.t + 3, kind: 'header', title: `${Math.round(dur)} s on a ${Math.round(-worst)}° header`, text: `You were knocked ${Math.round(-worst)}° on ${a.tack === 'stbd' ? 'starboard' : 'port'} and kept going for ${Math.round(dur)} s. When you're headed more than 5° the other tack is lifted: tack, unless the layline or a boat stops you. The wind graph shows it.`, tone: 'warn', focus: [p.id], score: dur * 0.4 - worst * 0.6, link: { kind: 'lab', id: 'layline', label: 'The layline call in the Lab' }, from: a.t - 4 });
      s0 = -1; worst = 0;
    };
    for (let k = 0; k < up.length; k++) {
      const x = up[k];
      const prev = up[k - 1];
      const broken = prev && (x.t - prev.t > 1.6 || x.tack !== prev.tack || x.leg !== prev.leg);
      if (broken) flush(k - 1);
      if (x.shift < -5) { if (s0 < 0) s0 = k; worst = Math.min(worst, x.shift); }
      else if (x.shift > -2) flush(k);
    }
    if (up.length) flush(up.length - 1);
  }

  // ── Overstanding the layline to mark 1 ──
  {
    const W = c.byId.W.p;
    const started = (race.events.find(e => e.type === 'started' && e.boat === p.id) as { t: number } | undefined)?.t ?? Infinity;
    const upA = vmgAngles(p.cls, race.wind.baseTws).up + 1.5;
    c.legs.forEach((leg, li) => {
      if (leg.kind !== 'mark' || !leg.upwind || leg.rounding.markId !== 'W') return;
      let best: { over: number; t: number; tack: string } | null = null;
      let runMax = 0, runT = -1, runTack = '';
      let lastTack: 'stbd' | 'port' | null = null;
      for (const fr of race.track) {
        const d = fr.d;
        if (fr.t < started || d[i0 * 5 + 4] !== li) continue;
        const x = d[i0 * 5], y = d[i0 * 5 + 1], h = d[i0 * 5 + 2];
        const tack = n180(fr.twd - h) >= 0 ? 'stbd' : 'port';
        if (tack !== lastTack) {
          if (runMax > 0 && (!best || runMax > best.over)) best = { over: runMax, t: runT, tack: runTack };
          runMax = 0; runT = -1; lastTack = tack;
        }
        const dm = Math.hypot(W.x - x, W.y - y);
        if (dm < 4 * L) continue;
        // After a tack she'd sail this heading. Past the layline, the mark is already beyond it:
        // to the right of the port heading from starboard, to the left of the starboard one from port.
        const other = tack === 'stbd' ? fr.twd + upA : fr.twd - upA;
        const off = tack === 'stbd' ? n180(bearing({ x, y }, W) - other) : n180(other - bearing({ x, y }, W));
        const over = off > 0 ? dm * Math.sin(Math.min(90, off) * DEG) : 0;
        if (over > 0.5 * L && runT < 0) { runT = fr.t; runTack = tack; }
        runMax = Math.max(runMax, over);
      }
      if (runMax > 0 && (!best || runMax > best.over)) best = { over: runMax, t: runT, tack: runTack };
      if (best && best.over > 3 * L && best.t > 0) {
        const n = Math.round(best.over / L);
        extra.push({ t: best.t + 2, kind: 'layline', title: `Overstood mark 1 by ${n} lengths`, text: `On ${best.tack === 'stbd' ? 'starboard' : 'port'} you sailed past the layline and ended up ${n} lengths beyond it: distance sailed for nothing. Tack when you can lay the mark, allowing about a length for the tack itself, and a little more if boats are coming in above you.`, tone: 'warn', focus: [p.id], score: n * 1.5, from: best.t - 6 });
      }
    });
  }

  // ── Mark roundings: places won and lost on each leg ──
  {
    const starts = race.events.filter(e => e.type === 'started') as { boat: string; t: number }[];
    let prevPlace = starts.findIndex(e => e.boat === p.id) + 1 || null;
    let prevLabel = 'the start';
    const rounds = race.events.filter(e => e.type === 'rounded') as { t: number; boat: string; leg: number; place: number }[];
    for (const e of rounds.filter(r => r.boat === p.id)) {
      const leg = c.legs[e.leg];
      if (!leg || leg.kind === 'finish') continue;
      if (leg.kind === 'mark' && leg.rounding.markId === 'F') continue; // the offset counts with mark 1
      const name = leg.kind === 'gate' ? 'The gate' : 'Mark 1';
      const ahead = rounds.filter(r => r.leg === e.leg && r.place === e.place - 1)[0]?.boat;
      let text: string, tone: Moment['tone'] = 'plain';
      const diff = prevPlace ? prevPlace - e.place : 0;
      const legWas = leg.upwind ? 'beat' : 'run'; // the leg she has just sailed
      if (diff > 0) { tone = 'good'; text = `Rounded ${ordinal(e.place)}: up ${diff} ${diff === 1 ? 'place' : 'places'} since ${prevLabel}.`; }
      else if (diff < 0) {
        tone = diff <= -2 ? 'warn' : 'plain';
        text = `Rounded ${ordinal(e.place)}: down ${-diff} since ${prevLabel}.` + (legWas === 'beat'
          ? ' On the beat, get onto the lifted tack early, keep your air clear of boats to windward and ahead, and come into the mark on the starboard layline without overstanding.'
          : ' On the run, keep the sail eased right out, gybe on the shifts, and stay out of the wind shadow of the boats behind you.');
      } else text = `Rounded ${ordinal(e.place)}, the same place as at ${prevLabel}.`;
      if (leg.kind === 'gate') text += ' At the gate, take the end that is less crowded and leads to the side of the beat you want, and come in wide to go out tight, close-hauled and on your way.';
      else text += ' At the windward mark, come in on the starboard layline with speed, round close, and bear away smoothly onto the run.';
      out.push({ t: e.t, kind: 'mark', title: `${name}: ${ordinal(e.place)}`, text, tone, focus: others([ahead]), link: diff <= -2 ? { kind: 'lab', id: 'crowded-rounding', label: 'Crowded rounding in the Lab' } : undefined, from: e.t - 10 });
      prevPlace = e.place; prevLabel = name === 'The gate' ? 'the gate' : 'mark 1';
    }
  }

  // ── Downwind: slow stretches and wind shadow ──
  {
    const dn = log.samples.filter(x => !x.upwind);
    const stretch = (bad: (x: typeof dn[number]) => boolean, min: number) => {
      let best: { a: number; b: number } | null = null, s0 = -1;
      for (let k = 0; k <= dn.length; k++) {
        const x = dn[k], prev = dn[k - 1];
        const ok = x && bad(x) && !(prev && x.t - prev.t > 1.6);
        if (ok && s0 < 0) s0 = k;
        if (!ok && s0 >= 0) { const dur = dn[k - 1].t - dn[s0].t; if (dur >= min && (!best || dur > dn[best.b].t - dn[best.a].t)) best = { a: s0, b: k - 1 }; s0 = x && bad(x) ? k : -1; }
      }
      return best;
    };
    const slow = stretch(x => x.spdPct < 0.8, 8);
    if (slow) {
      const a = dn[slow.a], b = dn[slow.b];
      const avg = dn.slice(slow.a, slow.b + 1).reduce((s, x) => s + x.spdPct, 0) / (slow.b - slow.a + 1);
      extra.push({ t: a.t + 2, kind: 'downwind', title: `Slow on the run for ${Math.round(b.t - a.t)} s`, text: `You averaged ${Math.round(avg * 100)}% of target speed here. Ease the sail right out (watch the trim line), come up a few degrees to build speed when you slow, and gybe to stay in the puffs.`, tone: 'warn', focus: [p.id], score: (b.t - a.t) * 0.5, link: { kind: 'lab', id: 'downwind-pass', label: 'Pass on the run in the Lab' }, from: a.t - 5 });
    }
    const shade = stretch(x => x.shadow > 0.12, 6);
    if (shade) {
      const a = dn[shade.a], b = dn[shade.b];
      extra.push({ t: a.t + 2, kind: 'downwind', title: `In someone's wind shadow for ${Math.round(b.t - a.t)} s`, text: 'A boat behind you was taking your wind. Downwind, the boats behind have the advantage: gybe away or come up a little to get your air back, before they roll you.', tone: 'warn', focus: [p.id], score: (b.t - a.t) * 0.45, from: a.t - 5 });
    }
  }

  // ── Rules incidents you were in ──
  for (const inc of race.incidents) {
    if (inc.offender !== p.id && inc.victim !== p.id) continue;
    if (inc.kind === 'ocs') continue; // the start covers it
    const mine = inc.offender === p.id;
    const other = mine ? inc.victim : inc.offender;
    out.push({ t: inc.t, kind: 'incident', title: `Rule ${inc.rule}: ${inc.title}`, text: `${inc.explanation}${inc.nextTime ? ` ${inc.nextTime}` : ''}`, tone: mine ? 'warn' : 'plain', focus: others([other]), from: inc.t - 10 });
  }

  // ── The finish ──
  {
    const fin = race.events.find(e => e.type === 'finish' && e.boat === p.id) as { t: number; place: number } | undefined;
    if (fin) {
      const wt = rows[0]?.time, mt = rows.find(r => r.boat === p)?.time;
      const behind = wt != null && mt != null ? mt - wt : null;
      const text = fin.place === 1 ? 'First across the line. Well sailed.' : `Finished ${ordinal(fin.place)}${behind !== null ? `, ${fmt(behind)} behind the winner` : ''}. The orange moments are where most of that went.`;
      out.push({ t: fin.t, kind: 'finish', title: `Finished ${ordinal(fin.place)}`, text, tone: fin.place <= Math.ceil(race.boats.length / 3) ? 'good' : 'plain', focus: others([winner?.id]) });
    }
  }

  // The rest, the most telling first, up to six.
  extra.sort((a, b) => b.score - a.score);
  for (const m of extra.slice(0, 6)) { const { score: _s, ...rest } = m; void _s; out.push(rest); }
  out.sort((a, b) => a.t - b.t);
  // Taking over before the race began, or after you finished, isn't a thing.
  for (const m of out) if (m.from !== undefined) m.from = Math.max(0, m.from);
  return sum.mode === 'start' ? out.filter(m => m.kind === 'start' || m.kind === 'incident') : out;
}

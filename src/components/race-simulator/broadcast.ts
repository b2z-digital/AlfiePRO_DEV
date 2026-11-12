// Broadcast the final: a race kept as its "tape" (its settings and the log of everything you did,
// which sail the race again exactly), played back under AlfiePRO's broadcast graphics, in full or
// cut to about thirty seconds of highlights. Tapes are kept on this device: every Circuit race you
// finish on the podium, and any race you choose to keep. Pure, apart from the tape store.
import { Race, type RaceLog } from '@/sim/engine';
import type { Boat, RaceSettings } from '@/sim/types';

export interface Tape {
  id: string;
  /** When it was sailed. */
  at: number;
  /** What it was ("Club Championship · race 9", "Quick race"), and where and in what. */
  title: string; sub: string;
  settings: RaceSettings; log: RaceLog;
  place: number | null; of: number;
  /** A title race (a Championship's), a podium, or one you kept. */
  kind: 'title' | 'podium' | 'kept';
  /** The Circuit event it was part of, for finding a Championship's final from its podium. */
  event?: string;
}

const KEY = 'alfie-race-sim-tapes-v1';
/** How many are kept: titles first, then the newest. */
export const MAX_TAPES = 8;

export function loadTapes(): Tape[] {
  try {
    const s = localStorage.getItem(KEY);
    const t = s ? JSON.parse(s) : [];
    return Array.isArray(t) ? (t as Tape[]).filter(x => x && x.settings && x.log) : [];
  } catch { return []; }
}

/** Keep a tape (replacing one of the same moment): titles are kept before podiums and races you kept, newest first. */
export function saveTape(t: Tape): Tape[] {
  const rank = (x: Tape) => (x.kind === 'title' ? 0 : 1);
  const all = [t, ...loadTapes().filter(x => x.at !== t.at)].sort((a, b) => rank(a) - rank(b) || b.at - a.at).slice(0, MAX_TAPES);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or unavailable: not kept */ }
  return loadTapes();
}

export function deleteTape(id: string): Tape[] {
  const all = loadTapes().filter(x => x.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* unavailable */ }
  return all;
}

/** A tape of a race just sailed. */
export function tapeOf(race: Race, o: { title: string; sub: string; kind: Tape['kind']; event?: string; at?: number }): Tape {
  const p = race.player;
  const rows = race.results();
  const mine = p ? rows.find(r => r.boat === p) : undefined;
  return {
    id: `tape-${race.settings.seed}-${Math.round(race.t)}-${(o.at ?? Date.now()).toString(36)}`, at: o.at ?? Date.now(),
    title: o.title, sub: o.sub, settings: race.settings, log: { input: race.log.input.slice(), acts: race.log.acts.slice() },
    place: mine && mine.status === 'finished' ? mine.place : null, of: race.boats.length, kind: o.kind, ...(o.event ? { event: o.event } : {}),
  };
}

const CLASS_NAME: Record<string, string> = { IOM: 'IOM', DF95: 'DF95', DF65: 'DF65', '10R': '10 Rater', M: 'Marblehead' };
/** A tape's second line: where, in what, and when. */
export function tapeSub(s: RaceSettings, water: (id: string) => string, at = Date.now()): string {
  const where = s.venue ? water(s.venue) : 'The practice pond';
  return `${where} · ${CLASS_NAME[s.classId] ?? s.classId} · ${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** The race on a tape, ready to sail again from the start. */
export function playTape(t: Tape): Race {
  const r = new Race(t.settings);
  r.followLog(t.log);
  return r;
}

/** The name a boat goes by on the broadcast: her skipper's, or her sail number. */
export function boatName(race: Race, b: Boat): string {
  if (b.isPlayer) return race.settings.player?.name || 'You';
  if (race.settings.cast?.some(c => c.sail === b.sail)) return b.name;
  return `Sail ${b.sail}`;
}

/** A piece of the highlights: race time from and to, and its title card. */
export interface Segment { from: number; to: number; label: string }
/** How the race finished: each boat (by her place in the fleet) and where she came. */
export interface Final { boat: number; place: number; status: 'finished' | 'dsq' | 'ocs' | 'dnf' | 'racing' }

/**
 * Cut the highlights: the start, the race's decisive moment (the last change of lead, or else your
 * biggest gain), and the finish; about thirty seconds. Sails the race through once, without drawing,
 * a chunk at a time (so the page keeps moving), and calls back with the cut.
 */
export function cutHighlights(t: Tape, done: (s: Segment[], final: Final[]) => void, chunk = 800): () => void {
  const r = playTape(t);
  const samples: { t: number; leader: string; mine: number | null }[] = [];
  let next = 0, stopped = false, winner: number | null = null, mineAt: number | null = null;
  const step = () => {
    if (stopped) return;
    for (let k = 0; k < chunk && !r.ended && r.t < r.gunT + 1500; k++) {
      r.step();
      if (r.t >= next) {
        next = r.t + 1;
        const ranked = [...r.boats].sort((a, b) => r.progressScore(b) - r.progressScore(a));
        samples.push({ t: r.t, leader: ranked[0].id, mine: r.player ? ranked.indexOf(r.player) + 1 : null });
      }
      for (const b of r.boats) if (b.finished && winner === null) winner = b.finishTime;
      if (r.player?.finished && mineAt === null) mineAt = r.player.finishTime;
    }
    if (!r.ended && r.t < r.gunT + 1500) { window.setTimeout(step, 0); return; }
    done(cut(r.gunT, samples, winner, mineAt), r.results().map(x => ({ boat: r.boats.indexOf(x.boat), place: x.place, status: x.status })));
  };
  window.setTimeout(step, 0);
  return () => { stopped = true; };
}

/** The cut itself, from a sample a second of who led and where you were (exported for testing). */
export function cut(gun: number, samples: { t: number; leader: string; mine: number | null }[], winner: number | null, mineAt: number | null): Segment[] {
  const segs: Segment[] = [{ from: Math.max(0, gun - 7), to: gun + 6, label: 'The start' }];
  const end = winner ?? samples[samples.length - 1]?.t ?? gun + 60;
  // The decisive moment: the last change of lead well after the start and before the finish run-in.
  let moment: Segment | null = null;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    if (s.t < gun + 25 || s.t > end - 14) continue;
    if (s.leader !== samples[i - 1].leader) moment = { from: s.t - 6, to: s.t + 4, label: 'A change of lead' };
  }
  // Or else your biggest gain over ten seconds.
  if (!moment) {
    let best = 0;
    for (let i = 10; i < samples.length; i++) {
      const a = samples[i - 10], b = samples[i];
      if (b.t < gun + 20 || b.t > end - 14 || a.mine === null || b.mine === null) continue;
      if (a.mine - b.mine > best) { best = a.mine - b.mine; moment = { from: b.t - 9, to: b.t + 1, label: best === 1 ? 'Up a place' : `Up ${best} places` }; }
    }
  }
  if (moment) segs.push(moment);
  // The finish: the winner's run to the line, and yours if you were close behind.
  if (winner !== null) {
    const to = mineAt !== null && mineAt - winner <= 10 ? mineAt + 2 : winner + 3;
    segs.push({ from: winner - 7, to, label: 'The finish' });
  }
  // Keep them apart and in order.
  for (let i = 1; i < segs.length; i++) segs[i].from = Math.max(segs[i].from, segs[i - 1].to + 1);
  return segs.filter(s => s.to > s.from + 2);
}

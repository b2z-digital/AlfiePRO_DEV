// One thing to work on in each race. Before you start, Alfie picks the part of your racing that has
// been costing you most (from the loss ledgers of your last few races) and sets a target a fifth
// better than you've been doing. The debrief says whether you met it. Pure: nothing stored here.
import { CAUSES, CAUSE_WORDS, per, rate, type Cause, type Ledger } from './ledger';

export { per, rate };
import { PLAYS, type Play } from './playbook';
import type { Profile } from './profile';

/** What a race's focus is, and how it went once the race is sailed. Saved with the race's summary. */
export interface Focus {
  cause: Cause;
  /** What you've been giving away here lately, and what to get under: boat lengths, in the part's own unit (see `rate`). */
  was: number; target: number;
  /** What you gave away in this race, and whether that met the target (set by the debrief). */
  got?: number; met?: boolean;
}

/** The play whose one line Alfie gives you to carry round the course, for each cause. */
const CUE: Record<Cause, string> = {
  start: 'own-a-gap', speed: 'gears', turns: 'clean-turns', shifts: 'lifted-tack',
  laylines: 'top-mark', roundings: 'wide-tight', air: 'clear-lanes', penalties: 'cross-duck-leebow',
};
export const focusPlay = (cause: Cause): Play => PLAYS.find(p => p.id === CUE[cause])!;

/** The races that count: full races against a fleet that kept a ledger, newest first. */
export const ledgerRaces = (profile: Profile) => profile.races.filter(r => r.mode === 'race' && r.ledger && r.status !== 'dnf' && r.status !== 'racing');

/** A target a fifth better: to the nearest half length when it's a few lengths, the nearest tenth when it's less. */
function better(was: number): number {
  const step = was >= 3 ? 0.5 : 0.1;
  const t = Math.min(Math.round((was * 0.8) / step) * step, Math.round((was - step) / step) * step);
  return Math.max(step, Math.round(t * 10) / 10);
}

/**
 * The focus for your next race: the part of your last five races that cost the most boat lengths
 * (null until you've sailed one, or with nothing worth chasing), with what you've been giving
 * away there, in its own unit, and a target a fifth better.
 */
export function raceFocus(profile: Profile): Focus | null {
  const rs = ledgerRaces(profile).slice(0, 5);
  if (!rs.length) return null;
  let best: Cause | null = null, most = 0;
  for (const c of CAUSES) {
    const v = rs.reduce((s, r) => s + (r.ledger!.parts.find(p => p.cause === c)?.lengths ?? 0), 0) / rs.length;
    if (v > most) { most = v; best = c; }
  }
  if (!best || most < 1.5) return null;
  const was = Math.round((rs.reduce((s, r) => s + rate(r.ledger!)[best!], 0) / rs.length) * 10) / 10;
  if (was < 0.2) return null;
  return { cause: best, was, target: better(was) };
}

/** How the race went against its focus. */
export function focusResult(f: Focus, led: Ledger): Focus {
  const got = Math.round(rate(led)[f.cause] * 10) / 10;
  return { cause: f.cause, was: f.was, target: f.target, got, met: got <= f.target };
}

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
/** "1 length", "0.8 lengths", "4 lengths". */
const len = (v: number) => `${n1(v)} length${v === 1 ? '' : 's'}`;
const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

/** The focus in words: for the set-up card, the race, Alfie's voice and the debrief. */
export function focusWords(f: Focus): { title: string; line: string; say: string; cue: string; result: string | null } {
  const name = CAUSE_WORDS[f.cause].name, cue = focusPlay(f.cause).remember;
  return {
    title: `This race: ${lower(name)}`,
    line: `${name} ${f.cause === 'start' || f.cause === 'speed' || f.cause === 'air' ? 'has' : 'have'} been your biggest leak: about ${len(f.was)} ${per(f.cause)}. Get under ${n1(f.target)}.`,
    say: `Your focus this race: ${lower(name)}. ${cue}`,
    cue,
    result: f.got === undefined ? null
      : f.met ? `Met. You gave away ${len(f.got)} ${per(f.cause)}, against a target of ${n1(f.target)} (you had been at ${n1(f.was)}).`
        : `Not this time. You gave away ${len(f.got)} ${per(f.cause)}; the target was ${n1(f.target)} (you had been at ${n1(f.was)}).`,
  };
}

// Today's ten minutes: three things to practise, chosen from where your races are going (the loss
// ledger) and what you haven't mastered or haven't touched lately. Something you've passed comes
// back after a few days, then a week, then three, until it sticks. Pure: nothing stored here.
import { CAUSES, CAUSE_WORDS, type Cause } from './ledger';
import { PLAYS, type PlayLink } from './playbook';
import type { Profile } from './profile';
import type { TrainingProgress } from './progress';
import { FIRST } from '@/sim/training/first';

export interface PlanItem {
  link: PlayLink;
  cause: Cause;
  /** Why it's on today's list, in a line. */
  why: string;
  /** Done today already. */
  done: boolean;
}

const DAY = 86400000;
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Lengths given away per race, by cause, over your last few races that kept a ledger (null with none). */
export function lossPerRace(profile: Profile, last = 5): { races: number; by: Record<Cause, number> } | null {
  const led = profile.races.filter(r => r.mode === 'race' && r.ledger).slice(0, last).map(r => r.ledger!);
  if (!led.length) return null;
  const by = Object.fromEntries(CAUSES.map(c => [c, 0])) as Record<Cause, number>;
  for (const l of led) for (const p of l.parts) by[p.cause] += p.lengths / led.length;
  return { races: led.length, by };
}

/** How well a drill or scenario is known (0 never passed, 3 mastered), and when it was last tried. */
function standing(l: PlayLink, t: TrainingProgress): { level: number; at: number } {
  if (l.kind === 'drill') { const r = t.drills[l.id]; return { level: r?.stars ?? 0, at: r?.at ?? 0 }; }
  const r = t.lab[l.id];
  return { level: r?.won ? 2 : 0, at: r?.at ?? 0 };
}
/** Days before something at this level is due again. */
const dueAfter = (level: number) => (level <= 0 ? 0 : level === 1 ? 3 : level === 2 ? 7 : 21);

/** Today's three, most useful first. `now` is the time in milliseconds. */
export function todaysPlan(profile: Profile, training: TrainingProgress, now: number): PlanItem[] {
  const loss = lossPerRace(profile);
  // Where you lose most first; for a newcomer, the three that decide most club races.
  const order: Cause[] = loss ? [...CAUSES].sort((a, z) => loss.by[z] - loss.by[a]) : ['start', 'turns', 'shifts', 'roundings', 'speed', 'air', 'laylines', 'penalties'];
  const out: PlanItem[] = [];
  const taken = new Set<string>();
  for (const cause of order) {
    if (out.length >= 3) break;
    const links = PLAYS.filter(p => p.fixes === cause).flatMap(p => p.practise).filter(l => l.kind !== 'lesson');
    // Done today stays on the list (ticked); otherwise the least known that's due, longest untouched first.
    const ranked = links
      .filter(l => !taken.has(`${l.kind}:${l.id}`))
      .map(l => ({ l, s: standing(l, training) }))
      .map(x => ({ ...x, today: x.s.at > 0 && sameDay(x.s.at, now), due: x.s.at === 0 || now - x.s.at >= dueAfter(x.s.level) * DAY }))
      .filter(x => x.today || x.due)
      .sort((a, z) => Number(z.today) - Number(a.today) || a.s.level - z.s.level || a.s.at - z.s.at);
    const pick = ranked[0];
    if (!pick) continue;
    taken.add(`${pick.l.kind}:${pick.l.id}`);
    const n = loss ? loss.by[cause] : 0;
    out.push({
      link: pick.l, cause, done: pick.today,
      why: loss && n >= 0.5
        ? `${CAUSE_WORDS[cause].name}: about ${n.toFixed(1)} lengths a race over your last ${loss.races === 1 ? 'race' : `${loss.races} races`}.`
        : pick.s.level > 0 ? `${CAUSE_WORDS[cause].name}: due again, to keep it sharp.` : `${CAUSE_WORDS[cause].name}: a good place to start.`,
    });
  }
  return out;
}

/**
 * Is this someone to offer "learn to sail" to? Not once they've shown they can sail: three races
 * sailed, or one finished in the top half of the fleet, or three Start Trainer stars, or a Rules
 * Academy situation sailed, or a Scenario Lab scenario won. Not once they've done First sail's
 * five steps, and not once they've said they don't want it.
 */
export function offerFirstSail(profile: Profile, training: TrainingProgress): boolean {
  if (training.dismissed?.['first-sail']) return false;
  if (FIRST.every(m => training.lab[m.id]?.won)) return false;
  if (profile.races.length >= 3) return false;
  if (profile.races.some(r => r.status === 'finished' && r.place != null && r.place <= Math.ceil(r.of / 2))) return false;
  if (Object.values(training.drills).reduce((n, d) => n + (d.stars ?? 0), 0) >= 3) return false;
  if (Object.values(training.lessons).some(l => l.played)) return false;
  const first = new Set(FIRST.map(m => m.id));
  if (Object.entries(training.lab).some(([id, r]) => r.won && !first.has(id))) return false;
  return true;
}

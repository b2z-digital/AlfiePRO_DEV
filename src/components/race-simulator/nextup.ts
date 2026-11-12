// "Next up": the one thing the home screen puts in front of you. The first of these that applies:
// learn to sail (a newcomer), your placement races (not placed yet), the club's real race day in
// the next few days (rehearse it), a licence that's one requirement short, a club challenge about
// to close, this week's next session, and otherwise a race. Pure: nothing stored here.
import type { SkipperLevel } from '@/sim/types';
import type { Challenge } from './challenges';
import { offerFirstSail } from './plan';
import type { Profile } from './profile';
import type { TrainingProgress } from './progress';
import type { LevelLicence, Requirement, Session, Week } from './programme';
import { PLACED_AFTER, type Standing } from './rating';
import type { NextRace } from './rehearse';

export type NextUp =
  | { kind: 'first-sail' }
  | { kind: 'placement'; sailed: number; of: number }
  | { kind: 'rehearse'; race: NextRace }
  | { kind: 'licence'; req: Requirement; to: SkipperLevel }
  | { kind: 'challenge'; challenge: Challenge; hours: number }
  | { kind: 'session'; session: Session; n: number; of: number }
  | { kind: 'race' };

/** How near the club's race day has to be to come first (days), and a challenge's close (hours). */
export const REHEARSE_WITHIN = 4, CLOSING_WITHIN = 48;

export function nextUp(a: {
  profile: Profile; training: TrainingProgress; standing: Standing; week: Week; licence: LevelLicence | null;
  /** The club's next real race day (null with none, or when it can't be rehearsed). */
  next: NextRace | null;
  /** Challenges you can see, and the ones you've already sailed. */
  challenges: Challenge[]; sailed?: ReadonlySet<string>;
  now: number;
}): NextUp {
  if (offerFirstSail(a.profile, a.training)) return { kind: 'first-sail' };
  if (!a.standing.placed) return { kind: 'placement', sailed: a.standing.races, of: PLACED_AFTER };
  if (a.next && a.next.days >= 0 && a.next.days <= REHEARSE_WITHIN) return { kind: 'rehearse', race: a.next };
  if (a.licence && a.licence.reqs.length - a.licence.met === 1) return { kind: 'licence', req: a.licence.reqs.find(r => !r.met)!, to: a.licence.to };
  const closing = a.challenges
    .filter(c => c.club_id && !c.event_id && c.closes_at && !a.sailed?.has(c.id))
    .map(c => ({ c, hours: (Date.parse(c.closes_at!) - a.now) / 3600000 }))
    .filter(x => x.hours > 0 && x.hours <= CLOSING_WITHIN && Date.parse(x.c.opens_at) <= a.now)
    .sort((x, z) => x.hours - z.hours)[0];
  if (closing) return { kind: 'challenge', challenge: closing.c, hours: Math.max(1, Math.round(closing.hours)) };
  const i = a.week.sessions.findIndex(s => !s.done);
  if (i >= 0) return { kind: 'session', session: a.week.sessions[i], n: i + 1, of: a.week.sessions.length };
  return { kind: 'race' };
}

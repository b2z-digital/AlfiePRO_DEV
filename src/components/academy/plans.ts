// The Sailing Academy's plans: what Free gives, what Academy adds, and the prices.
//
// Free is a taste: Quick races against Club skippers at one venue in one class, keyboard or touch
// (and one race on your own transmitter), the first two lessons, and joining a mate's room.
// Academy is everything, and comes with a 7-day free week (card up front, nothing charged before
// day 8, one per skipper). AlfiePRO club members pay a third less. Prices in A$ cents, GST included;
// keep in step with supabase/functions/academy-checkout.
import type { SkipperLevel } from '@/sim/types';

export const PRICES = {
  academy: { month: 1299, year: 11900 },
  member: { month: 899, year: 7900 },
} as const;
export const TRIAL_DAYS = 7;

export type PricePlan = keyof typeof PRICES;
export type Interval = 'month' | 'year';
export type Tier = 'free' | 'academy';

/** The first-sail lessons a free skipper can take (by id, in order). */
export const FREE_SCENES = ['first-steer', 'first-trim'];

/** What a free skipper can do. */
export const FREE = {
  levels: ['club'] as SkipperLevel[],
  /** Lessons (in the Academy's lesson order) a free skipper can take. */
  lessons: 2,
  /** Races a free skipper can sail on their own transmitter. */
  transmitterRaces: 1,
} as const;

/** The parts of the Academy that need a plan, by the screen they live on. */
export type Feature =
  | 'level' | 'venue' | 'class' | 'transmitter' | 'lesson'
  | 'circuit' | 'programme' | 'lab' | 'trainer' | 'playbook' | 'judge' | 'ro'
  | 'replay' | 'year' | 'world' | 'yacht' | 'events' | 'challenge' | 'host' | 'rehearse' | 'all';

export interface Sell { title: string; line: string }

/** What to say when a free skipper reaches for a feature: the moment, then the offer. */
export const SELL: Record<Feature, Sell> = {
  level: { title: 'Ready for a tougher fleet?', line: 'State, National and World skippers fight for the favoured end, hold their gaps and cover you up the beat.' },
  venue: { title: 'Sail every venue', line: 'Real club waters with their banks, trees and local breezes. Learn where the shifts come from before race day.' },
  class: { title: 'Sail every class', line: 'IOM, Marblehead, 10 Rater, DF95 and DF65, each with its own speed and feel.' },
  transmitter: { title: 'Race on your own transmitter', line: 'You’ve had your free race on your radio. Academy keeps your own sticks in your hands, every race.' },
  lesson: { title: 'Keep learning with Alfie', line: 'The whole lesson library, from your first start to tactics in a packed fleet.' },
  circuit: { title: 'Ready for a season?', line: 'The AlfiePRO Circuit: race days, a season and a championship, scored the way your club scores.' },
  programme: { title: 'Your weekly programme', line: 'Alfie picks three sessions a week from how you race, and moves you up when you’re ready.' },
  lab: { title: 'The Scenario Lab', line: 'Replay the tricky moments, crowded marks, port starts, until they’re second nature.' },
  trainer: { title: 'The Start Trainer', line: 'Timed runs, holding your spot and hitting the line at full speed on the gun.' },
  playbook: { title: 'The full playbook', line: 'Starts, rules and tactics, each with a picture and the stick moves to make.' },
  judge: { title: 'Call the incidents', line: 'Watch a moment from above, make the call, and see the rule that decides it.' },
  ro: { title: 'Be the race officer', line: 'Set a square line, call the boats over early, score the heats and hear a protest.' },
  replay: { title: 'Watch it back like TV', line: 'Replays with a leaderboard and the camera on the action. Save the highlights as a video.' },
  year: { title: 'Your racing year', line: 'Every race kept, your progress month by month, and where you lose places.' },
  world: { title: 'Club against club', line: 'Race the daily race and the World Regatta, and score for your club on the world boards.' },
  yacht: { title: 'Design your yacht', line: 'Your hull colours, your sail number, your country. Class-legal, like the boat in your shed.' },
  events: { title: 'Club events in the Academy', line: 'Sail your club’s Academy series and see where you finish.' },
  challenge: { title: 'Challenges', line: 'Set a challenge for your mates, or take theirs on.' },
  all: { title: 'The whole Academy, free for a week', line: 'Every level, the Circuit, your weekly programme with Alfie, your own transmitter and every venue.' },
  rehearse: { title: 'Rehearse your next race day', line: 'Your club\u2019s water with the forecast breeze, before you get there.' },
  host: { title: 'Open a room for your mates', line: 'Free skippers can join a mate’s room. Academy lets you open one and invite anyone.' },
};

/** What a skipper's subscription row says (null: never subscribed). */
export interface PlanRow {
  status: string;
  plan: PricePlan | null;
  billing_interval: Interval | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  member_club_id: string | null;
}

const LIVE = new Set(['trialing', 'active', 'past_due']);

export function tierOf(row: PlanRow | null, superAdmin = false): Tier {
  if (superAdmin) return 'academy';
  return row && LIVE.has(row.status) ? 'academy' : 'free';
}

/** Days left of a free week (rounded up), or null when not in one. */
export function trialDaysLeft(row: PlanRow | null, now = Date.now()): number | null {
  if (!row || row.status !== 'trialing' || !row.trial_end) return null;
  return Math.max(0, Math.ceil((Date.parse(row.trial_end) - now) / 86400000));
}

/** "A$119", "A$12.99". */
export function money(cents: number): string {
  return `A$${cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)}`;
}

/** What a year costs against twelve months: "A$36". */
export function yearSaving(plan: PricePlan): string {
  return money(Math.floor((PRICES[plan].month * 12 - PRICES[plan].year) / 100) * 100);
}

/** Free-tier gates that depend on what you're about to sail. Pure (tested). */
export function raceGate(
  tier: Tier,
  race: { level: SkipperLevel; venue: string; classId: string; transmitter: boolean },
  free: { venue: string; classId: string | null; transmitterRaces: number },
): Feature | null {
  if (tier === 'academy') return null;
  if (!FREE.levels.includes(race.level)) return 'level';
  if (race.venue !== free.venue) return 'venue';
  if (free.classId && race.classId !== free.classId) return 'class';
  if (race.transmitter && free.transmitterRaces >= FREE.transmitterRaces) return 'transmitter';
  return null;
}

/** The Academy's screens that are Academy-only, by the page's name for them. */
export const LOCKED_SCREENS: Partial<Record<string, Feature>> = {
  academy: 'lesson', career: 'circuit', ro: 'ro', judge: 'judge', lab: 'lab', trainer: 'trainer', playbook: 'playbook',
  passport: 'programme', year: 'year', world: 'world', yacht: 'yacht', event: 'events', challenge: 'challenge',
};

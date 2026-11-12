// Your training programme: a syllabus for the level you sail at, the licence that takes you to the
// next one, and this week's three sessions. Two of the three work on the part of a race where you
// give away most against the fleets you race; the third keeps something you've passed from going
// stale. The bar rises with your level: one star passes a drill at Club, two at Regional, three at
// National and World. Pure: nothing stored here.
import type { SkipperLevel } from '@/sim/types';
import { DRILLS, LAB, FIRST } from '@/sim/training';
import { CAUSES, CAUSE_WORDS, type Cause } from './ledger';
import { focusPlay } from './focus';
import { passport } from './passport';
import { lossPerRace } from './plan';
import { PLAYS, type PlayLink } from './playbook';
import type { Profile } from './profile';
import { licence, type TrainingProgress } from './progress';
import { LEVELS, cleanSailing, type Standing } from './rating';

export interface Syllabus {
  level: SkipperLevel;
  /** What this level's training is for, in a line. */
  aim: string;
  text: string;
  /** The stars that pass a drill at this level. */
  stars: 1 | 2 | 3;
  /** What it takes to graduate to the level above (null at World): Rules licence level, Start Trainer stars, scenarios won, and fewer fouls a race than this. */
  licence: { rules: number; stars: number; scenarios: number; fouls: number } | null;
}

export const SYLLABUS: Record<SkipperLevel, Syllabus> = {
  club: { level: 'club', aim: 'Sail clean and start on time', text: 'Know who has right of way, be on the line at the gun, and get round the marks without touching anything.', stars: 1, licence: { rules: 2, stars: 12, scenarios: 0, fouls: 1 } },
  state: { level: 'state', aim: 'Win your side of the course', text: 'Start at the favoured end, sail the lifted tack, and come into every mark with a plan.', stars: 2, licence: { rules: 4, stars: 24, scenarios: 8, fouls: 0.5 } },
  national: { level: 'national', aim: 'Give nothing away', text: 'Clean turns, clean roundings and clear air, so the only lengths you lose are the ones you choose to.', stars: 3, licence: { rules: 6, stars: 30, scenarios: 14, fouls: 0.3 } },
  world: { level: 'world', aim: 'The same, every race, under pressure', text: 'Bigger fleets, gusts and chop. Nothing new to learn: no race where it goes missing.', stars: 3, licence: null },
};

export interface Requirement {
  id: 'rules' | 'starts' | 'scenarios' | 'clean';
  label: string;
  /** Where you stand and what it takes, in words. */
  have: string; need: string;
  met: boolean;
  /** Where to go to work on it. */
  go: 'academy' | 'trainer' | 'lab' | 'race';
}

export interface LevelLicence { to: SkipperLevel; reqs: Requirement[]; met: number; ready: boolean }

const firstIds = new Set(FIRST.map(m => m.id));
/** Scenario Lab scenarios won (the five First sail steps aren't counted). */
export const scenariosWon = (t: TrainingProgress): number => LAB.filter(m => !firstIds.has(m.id) && t.lab[m.id]?.won).length;
export const startStars = (t: TrainingProgress): number => DRILLS.reduce((a, d) => a + (t.drills[d.id]?.stars ?? 0), 0);

/** The licence that takes a skipper at `level` up to the next one, and how far along they are (null at World). */
export function levelLicence(level: SkipperLevel, profile: Profile, training: TrainingProgress): LevelLicence | null {
  const need = SYLLABUS[level].licence;
  if (!need) return null;
  const lic = licence(training).level, stars = startStars(training), won = scenariosWon(training), clean = cleanSailing(profile);
  const reqs: Requirement[] = [
    { id: 'rules', label: 'Rules licence', have: `Level ${lic}`, need: `level ${need.rules} of 6`, met: lic >= need.rules, go: 'academy' },
    { id: 'starts', label: 'Start Trainer', have: `${stars} star${stars === 1 ? '' : 's'}`, need: `${need.stars} stars`, met: stars >= need.stars, go: 'trainer' },
    ...(need.scenarios ? [{ id: 'scenarios', label: 'Scenario Lab', have: `${won} won`, need: `${need.scenarios} scenarios won`, met: won >= need.scenarios, go: 'lab' } as Requirement] : []),
    {
      id: 'clean', label: 'Clean sailing', have: clean ? `${clean.fouls} foul${clean.fouls === 1 ? '' : 's'} a race` : 'No races yet',
      need: `fewer than ${need.fouls} a race, over at least three races`, met: !!clean && clean.races >= 3 && clean.fouls < need.fouls, go: 'race',
    },
  ];
  const met = reqs.filter(r => r.met).length;
  return { to: LEVELS[LEVELS.indexOf(level) + 1], reqs, met, ready: met === reqs.length };
}

export interface Session {
  link: PlayLink; cause: Cause;
  /** 'work': on your weakest part. 'keep': something passed, kept sharp. */
  kind: 'work' | 'keep';
  why: string;
  /** The Playbook play that closes this gap. */
  play: { id: string; title: string };
  done: boolean;
}

export interface Week { weakest: Cause | null; bar: 1 | 2 | 3; sessions: Session[]; done: number }

/** Monday, midnight, of the week `now` is in (local time). */
export function weekStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** The part of a race to work on: where you stand lowest against the fleets you race, or where most lengths go (null with no races to go on). */
export function weakest(profile: Profile): Cause | null {
  const pp = passport(profile);
  const graded = pp?.skills.filter(s => s.beat !== null) ?? [];
  if (graded.length) return [...graded].sort((a, z) => a.beat! - z.beat! || (z.now ?? 0) - (a.now ?? 0))[0].part as Cause;
  const loss = lossPerRace(profile);
  return loss ? [...CAUSES].sort((a, z) => loss.by[z] - loss.by[a])[0] : null;
}

const NEWCOMER: Cause[] = ['start', 'turns', 'shifts', 'roundings', 'speed', 'air', 'laylines', 'penalties'];
const mark = (l: PlayLink, t: TrainingProgress): { level: number; at: number } => (l.kind === 'drill' ? { level: t.drills[l.id]?.stars ?? 0, at: t.drills[l.id]?.at ?? 0 } : { level: t.lab[l.id]?.won ? 3 : 0, at: t.lab[l.id]?.at ?? 0 });
const linksFor = (cause: Cause): PlayLink[] => {
  const seen = new Set<string>();
  return PLAYS.filter(p => p.fixes === cause).flatMap(p => p.practise).filter(l => l.kind !== 'lesson' && !seen.has(`${l.kind}:${l.id}`) && !!seen.add(`${l.kind}:${l.id}`));
};

/**
 * This week's three sessions for a skipper standing at `st`. Something done this week stays on the
 * list, ticked, so the list doesn't change under you; it's new on Monday.
 */
export function weekPlan(profile: Profile, training: TrainingProgress, now: number, st: Pick<Standing, 'level'>): Week {
  const from = weekStart(now);
  const bar = SYLLABUS[st.level].stars;
  const weak = weakest(profile);
  const loss = lossPerRace(profile);
  const order = weak ? [weak, ...(loss ? [...CAUSES].sort((a, z) => loss.by[z] - loss.by[a]) : NEWCOMER).filter(c => c !== weak)] : NEWCOMER;
  const taken = new Set<string>();
  const sessions: Session[] = [];
  const add = (l: PlayLink, cause: Cause, kind: Session['kind'], why: string) => {
    const m = mark(l, training), play = focusPlay(cause);
    taken.add(`${l.kind}:${l.id}`);
    sessions.push({ link: l, cause, kind, why, play: { id: play.id, title: play.title }, done: m.at >= from && (kind === 'keep' || m.level >= bar) });
  };
  // Two to work on, from the weakest part first: tried this week first, then the least known, longest untouched.
  for (const cause of order) {
    if (sessions.length >= 2) break;
    const ranked = linksFor(cause).filter(l => !taken.has(`${l.kind}:${l.id}`)).map(l => ({ l, m: mark(l, training) }))
      .filter(x => x.m.at >= from || x.m.level < bar)
      .sort((a, z) => Number(z.m.at >= from) - Number(a.m.at >= from) || a.m.level - z.m.level || a.m.at - z.m.at);
    const n = loss ? loss.by[cause] : 0;
    for (const x of ranked.slice(0, 2 - sessions.length)) {
      add(x.l, cause, 'work', cause === weak && n >= 0.5 ? `${CAUSE_WORDS[cause].name} is where you give away most: about ${n.toFixed(1)} lengths a race.`
        : cause === weak ? `${CAUSE_WORDS[cause].name} is where you stand lowest against the fleet.`
          : x.m.level > 0 ? `${CAUSE_WORDS[cause].name}: ${bar} star${bar > 1 ? 's' : ''} passes it at your level.` : `${CAUSE_WORDS[cause].name}: a good place to start.`);
    }
  }
  // One to keep: something passed at this level, longest untouched (one touched this week stays).
  const kept = CAUSES.flatMap(c => linksFor(c).map(l => ({ l, c, m: mark(l, training) })))
    .filter(x => !taken.has(`${x.l.kind}:${x.l.id}`) && x.m.level >= bar)
    .sort((a, z) => Number(z.m.at >= from) - Number(a.m.at >= from) || a.m.at - z.m.at)[0];
  if (kept) add(kept.l, kept.c, 'keep', `${CAUSE_WORDS[kept.c].name}: you've passed this. Once more, to keep it.`);
  else {
    // Nothing passed yet: a third to work on, from the next part down.
    for (const cause of order.filter(c => !sessions.some(s => s.cause === c))) {
      const x = linksFor(cause).filter(l => !taken.has(`${l.kind}:${l.id}`)).map(l => ({ l, m: mark(l, training) })).sort((a, z) => a.m.level - z.m.level || a.m.at - z.m.at)[0];
      if (x) { add(x.l, cause, 'work', `${CAUSE_WORDS[cause].name}: ${x.m.level > 0 ? 'the next star' : 'a good place to start'}.`); break; }
    }
  }
  return { weakest: weak, bar, sessions, done: sessions.filter(s => s.done).length };
}

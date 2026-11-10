// Challenges: a race everyone sails the same way (the same class, venue, wind and seed), set by a
// club admin or the platform, with a leaderboard of each member's best result. Every entry keeps its
// race log, so you can race the leader's ghost. Stored in sim_challenges and sim_challenge_entries;
// row-level security decides who sees and enters what.
import type { RaceLog } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';
import type { RaceSummary } from './stats';
import type { Account } from './sync';

export interface Challenge {
  id: string;
  club_id: string | null;
  title: string;
  description: string | null;
  settings: RaceSettings;
  opens_at: string;
  closes_at: string | null;
  created_at: string;
}

export interface ChallengeEntry {
  id: string;
  challenge_id: string;
  user_id: string;
  display_name: string;
  sail_number: string | null;
  place: number | null;
  status: 'finished' | 'dsq' | 'ocs' | 'dnf';
  elapsed_s: number | null;
  summary: RaceSummary | null;
  sailed_at: string;
}

async function db() {
  const { supabase } = await import('@/utils/supabase');
  return supabase;
}

/** Open now (or not closed yet). */
export function isOpen(c: Challenge, now = Date.now()): boolean {
  return Date.parse(c.opens_at) <= now && (!c.closes_at || now < Date.parse(c.closes_at));
}

/** "Closes in 3 days", "Closed", "Open". */
export function closesText(c: Challenge, now = Date.now()): string {
  if (!c.closes_at) return 'Open';
  const ms = Date.parse(c.closes_at) - now;
  if (ms <= 0) return 'Closed';
  const h = ms / 3.6e6;
  return h < 1 ? 'Closes within the hour' : h < 24 ? `Closes in ${Math.round(h)} h` : `Closes in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`;
}

/** The challenges you can see (your club's and the platform's), newest first. */
export async function listChallenges(limit = 12): Promise<Challenge[] | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_challenges').select('id, club_id, title, description, settings, opens_at, closes_at, created_at').order('opens_at', { ascending: false }).limit(limit);
    if (error) return null;
    return (data ?? []) as Challenge[];
  } catch { return null; }
}

/** Set a new challenge for the club (club admins) or everyone (super admins, clubId null). */
export async function createChallenge(a: Account, c: { clubId: string | null; title: string; description?: string; settings: RaceSettings; closesAt: Date | null }): Promise<Challenge | string> {
  try {
    const supabase = await db();
    // The race is the same for everyone: no one's own name or number in its settings.
    const { player: _p, ...settings } = c.settings;
    void _p;
    const { data, error } = await supabase.from('sim_challenges').insert({
      club_id: c.clubId, title: c.title.trim(), description: c.description?.trim() || null, settings,
      closes_at: c.closesAt ? c.closesAt.toISOString() : null, created_by: a.userId,
    }).select('id, club_id, title, description, settings, opens_at, closes_at, created_at').single();
    if (error) return error.message;
    return data as Challenge;
  } catch (e) { return e instanceof Error ? e.message : 'Something went wrong'; }
}

/** Finishers by time, then everyone else. */
export function rankEntries(es: ChallengeEntry[]): ChallengeEntry[] {
  const rank = (e: ChallengeEntry) => (e.status === 'finished' && e.elapsed_s != null ? e.elapsed_s : 1e9 + (e.status === 'dnf' ? 1 : e.status === 'ocs' ? 2 : 3));
  return [...es].sort((a, b) => rank(a) - rank(b) || Date.parse(a.sailed_at) - Date.parse(b.sailed_at));
}

export async function leaderboard(challengeId: string): Promise<ChallengeEntry[] | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_challenge_entries').select('id, challenge_id, user_id, display_name, sail_number, place, status, elapsed_s, summary, sailed_at').eq('challenge_id', challengeId).limit(200);
    if (error) return null;
    return rankEntries((data ?? []) as ChallengeEntry[]);
  } catch { return null; }
}

/** An entry's race log (with the settings it was sailed with), to sail against as a ghost. */
export async function entryLog(entryId: string): Promise<(RaceLog & { settings: RaceSettings }) | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_challenge_entries').select('log').eq('id', entryId).maybeSingle();
    if (error || !data?.log) return null;
    const log = data.log as RaceLog;
    return Array.isArray(log.input) && Array.isArray(log.acts) && log.settings ? (log as RaceLog & { settings: RaceSettings }) : null;
  } catch { return null; }
}

/** Is this result better than that one? A finish beats anything else; then the faster time. */
export function better(a: { status: string; elapsed_s: number | null }, b: { status: string; elapsed_s: number | null } | null): boolean {
  if (!b) return true;
  if (a.status === 'finished' && b.status !== 'finished') return true;
  if (a.status !== 'finished') return false;
  return a.elapsed_s != null && (b.elapsed_s == null || a.elapsed_s < b.elapsed_s);
}

/**
 * Enter a result: saved if it's your first or better than your best, with the race log for your
 * ghost. Returns where you are on the leaderboard now (1-based), or null if it couldn't be saved.
 */
export async function submitEntry(a: Account, ch: Challenge, me: { name: string; sail: string | null }, sum: RaceSummary, raceLog: RaceLog, settings: RaceSettings): Promise<{ saved: boolean; rank: number | null; of: number; best: number | null } | null> {
  try {
    const supabase = await db();
    const status = sum.status === 'racing' ? 'dnf' : sum.status;
    const row = {
      challenge_id: ch.id, user_id: a.userId, display_name: me.name.slice(0, 60), sail_number: me.sail,
      // The log carries the exact settings (your auto-trim, your number), so your ghost sails true.
      place: sum.place, status, elapsed_s: sum.time, summary: sum, log: { ...raceLog, settings }, sailed_at: new Date(sum.at).toISOString(),
    };
    const { data: mine } = await supabase.from('sim_challenge_entries').select('id, status, elapsed_s').eq('challenge_id', ch.id).eq('user_id', a.userId).maybeSingle();
    let saved = false;
    if (better(row, mine as { status: string; elapsed_s: number | null } | null)) {
      const { error } = mine
        ? await supabase.from('sim_challenge_entries').update(row).eq('id', (mine as { id: string }).id)
        : await supabase.from('sim_challenge_entries').insert(row);
      if (error) return null;
      saved = true;
    }
    const board = await leaderboard(ch.id);
    if (!board) return { saved, rank: null, of: 0, best: null };
    const k = board.findIndex(e => e.user_id === a.userId);
    return { saved, rank: k >= 0 ? k + 1 : null, of: board.length, best: k >= 0 ? board[k].elapsed_s : null };
  } catch { return null; }
}

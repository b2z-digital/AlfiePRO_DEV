// Your simulator progress on every device: the races you've sailed (sim_sessions) and your training
// progress (sim_progress), saved to your account when you're signed in. Until those tables exist,
// or when you're offline, everything stays on this device as before.
import type { RaceSettings } from '@/sim/types';
import type { RaceSummary } from './stats';
import { TrainingProgress, mergeTraining } from './progress';

export interface Account { userId: string; clubId: string | null }

/** The tables aren't there yet (or the network isn't): stop asking for the rest of the session. */
let off = false;
const unavailable = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /does not exist|schema cache|Failed to fetch/i.test(e.message ?? ''));

async function db() {
  const { supabase } = await import('@/utils/supabase');
  return supabase;
}

/** Is saving to the account working (so far)? */
export function syncing(): boolean { return !off; }

/** Save a race you've just sailed. Sailing the same race twice (same moment) saves it once. */
export async function pushRace(a: Account, sum: RaceSummary, settings: RaceSettings): Promise<void> {
  if (off) return;
  try {
    const supabase = await db();
    const { error } = await supabase.from('sim_sessions').upsert({
      user_id: a.userId, club_id: a.clubId, mode: sum.mode, venue: settings.venue ?? null, class_id: settings.classId,
      level: settings.level, fleet: sum.of, place: sum.place, status: sum.status, elapsed_s: sum.time,
      settings, summary: sum, sailed_at: new Date(sum.at).toISOString(),
    }, { onConflict: 'user_id,sailed_at', ignoreDuplicates: true });
    if (unavailable(error)) off = true;
  } catch { off = true; }
}

/** Your last races from the account, newest first (null if there's no account copy). */
export async function pullRaces(a: Account, limit = 30): Promise<RaceSummary[] | null> {
  if (off) return null;
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_sessions').select('summary').eq('user_id', a.userId).order('sailed_at', { ascending: false }).limit(limit);
    if (error) { if (unavailable(error)) off = true; return null; }
    return (data ?? []).map(r => r.summary as RaceSummary).filter(s => s && typeof s.at === 'number');
  } catch { off = true; return null; }
}

/** Forget your races in the account too. */
export async function clearRaces(a: Account): Promise<void> {
  if (off) return;
  try {
    const supabase = await db();
    const { error } = await supabase.from('sim_sessions').delete().eq('user_id', a.userId);
    if (unavailable(error)) off = true;
  } catch { off = true; }
}

/** Merge this device's training progress with the account's, save the result there, and return it. */
export async function syncTraining(a: Account, local: TrainingProgress): Promise<TrainingProgress | null> {
  if (off) return null;
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('sim_progress').select('training').eq('user_id', a.userId).maybeSingle();
    if (error) { if (unavailable(error)) off = true; return null; }
    const remote = data?.training as TrainingProgress | undefined;
    const merged = remote && remote.drills ? mergeTraining(local, { ...remote, drills: remote.drills ?? {}, lessons: remote.lessons ?? {}, lab: remote.lab ?? {}, updatedAt: remote.updatedAt ?? 0 }) : local;
    if (!remote || JSON.stringify(merged) !== JSON.stringify(remote)) {
      const { error: e2 } = await supabase.from('sim_progress').upsert({ user_id: a.userId, training: merged, updated_at: new Date().toISOString() });
      if (unavailable(e2)) off = true;
    }
    return merged;
  } catch { off = true; return null; }
}

/**
 * Keeps PRO rosters in step with the series (or single event) they were built from.
 *
 * A roster takes a copy of the series name and round dates when it is created. This module
 * brings that copy up to date afterwards, without ever changing who is rostered:
 *
 *  - A series round that moved to a new date, or was renamed, keeps its PRO. The roster round's
 *    date follows the series, the duty task is moved with it, and the reminder is re-armed.
 *  - New series rounds (today or later) are added to the roster with no PRO, ready to assign.
 *  - Rounds that were cancelled or removed from the series are never deleted automatically.
 *    They are returned as issues so an admin can decide what to do with them.
 *  - Rosters still carrying the auto-generated "<series> PRO Roster" name follow series renames.
 *
 * Matching (series rounds have no stable id, only a name and a date):
 *  1. Same date. Covers renamed and renumbered rounds.
 *  2. Same round name, for roster rounds that already know their series round name
 *     (stored in pro_roster_rounds.series_round_id). Covers rounds that moved date.
 *  pro_roster_rounds.name is deliberately left alone: reminder emails use it as the duty title.
 */
import { supabase } from './supabase';
import type { RaceSeries, RaceEvent } from '../types/race';
import type { ProRoster, ProRosterRound } from '../types/proRoster';

const AUTO_NAME_SUFFIX = ' PRO Roster';
const SYNCABLE_STATUSES = ['active', 'draft'];

export type RosterIssueReason = 'cancelled' | 'removed';

export interface RosterSyncIssue {
  rosterId: string;
  rosterName: string;
  roundId: string;
  date: string;
  reason: RosterIssueReason;
  memberId: string | null;
}

export interface RosterSyncResult {
  rosterId: string;
  renamed: boolean;
  moved: number;
  added: number;
  issues: RosterSyncIssue[];
}

interface PlanSeriesRound {
  index: number;
  name: string;
  date: string;
  cancelled: boolean;
}

export interface RosterSyncPlan {
  newName: string | null;
  roundUpdates: Array<{ roundId: string; date?: string; seriesRoundKey?: string; moved: boolean; fromDate: string }>;
  additions: Array<{ date: string; seriesRoundKey: string; sortOrder: number }>;
  issues: Array<{ roundId: string; date: string; reason: RosterIssueReason }>;
  startDate: string | null;
  endDate: string | null;
}

export const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const normDate = (value: unknown): string | null => {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

const roundKey = (name: string | undefined, index: number) => (name || '').trim() || `Round ${index + 1}`;

export const isAutoRosterName = (name: string) => name.trim().toLowerCase().endsWith(AUTO_NAME_SUFFIX.toLowerCase());

/** Pure: works out what needs to change. No database access, so it can be checked on its own. */
export const planRosterSync = (
  roster: Pick<ProRoster, 'name' | 'start_date' | 'end_date'>,
  rosterRounds: Array<Pick<ProRosterRound, 'id' | 'date' | 'series_round_id' | 'sort_order'>>,
  sourceName: string,
  sourceRounds: Array<{ name?: string; date?: string; cancelled?: boolean }>,
  today: string
): RosterSyncPlan => {
  const series: PlanSeriesRound[] = [];
  sourceRounds.forEach((r, index) => {
    const date = normDate(r.date);
    if (date) series.push({ index, name: roundKey(r.name, index), date, cancelled: !!r.cancelled });
  });

  const rounds = [...rosterRounds].map(r => ({ ...r, date: normDate(r.date) || r.date })).sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<number>();
  const match = new Map<string, PlanSeriesRound>();

  // 1. Same date (prefer the round with the same name when two rounds share a date)
  for (const r of rounds) {
    const candidates = series.filter(s => !used.has(s.index) && s.date === r.date);
    if (candidates.length === 0) continue;
    const pick = candidates.find(s => s.name === r.series_round_id) || candidates[0];
    used.add(pick.index);
    match.set(r.id, pick);
  }

  // 2. Same round name, only when it is unambiguous on both sides
  const unmatched = rounds.filter(r => !match.has(r.id) && r.series_round_id);
  for (const r of unmatched) {
    const key = r.series_round_id!;
    if (unmatched.filter(o => o.series_round_id === key).length !== 1) continue;
    const candidates = series.filter(s => !used.has(s.index) && s.name === key);
    if (candidates.length !== 1) continue;
    used.add(candidates[0].index);
    match.set(r.id, candidates[0]);
  }

  const plan: RosterSyncPlan = { newName: null, roundUpdates: [], additions: [], issues: [], startDate: null, endDate: null };
  const finalDates: string[] = [];

  for (const r of rounds) {
    const s = match.get(r.id);
    if (!s) {
      finalDates.push(r.date);
      if (r.date >= today) plan.issues.push({ roundId: r.id, date: r.date, reason: 'removed' });
      continue;
    }
    finalDates.push(s.date);
    const moved = s.date !== r.date;
    if (moved || s.name !== r.series_round_id) {
      plan.roundUpdates.push({
        roundId: r.id,
        ...(moved ? { date: s.date } : {}),
        ...(s.name !== r.series_round_id ? { seriesRoundKey: s.name } : {}),
        moved,
        fromDate: r.date,
      });
    }
    if (s.cancelled && s.date >= today) plan.issues.push({ roundId: r.id, date: s.date, reason: 'cancelled' });
  }

  // A roster has one PRO per sailing day, so a second round on a day already rostered
  // (e.g. "Round 11A" and "Round 11B") does not get a slot of its own.
  const rosteredDays = new Set(finalDates);
  let sortOrder = rounds.reduce((max, r) => Math.max(max, r.sort_order ?? 0), -1) + 1;
  for (const s of series) {
    if (used.has(s.index) || s.cancelled || s.date < today || rosteredDays.has(s.date)) continue;
    plan.additions.push({ date: s.date, seriesRoundKey: s.name, sortOrder: sortOrder++ });
    rosteredDays.add(s.date);
    finalDates.push(s.date);
  }

  const name = sourceName.trim();
  if (name && isAutoRosterName(roster.name) && roster.name.trim() !== `${name}${AUTO_NAME_SUFFIX}`) {
    plan.newName = `${name}${AUTO_NAME_SUFFIX}`;
  }

  if (finalDates.length > 0) {
    const sorted = finalDates.sort();
    if (!roster.start_date || sorted[0] < roster.start_date) plan.startDate = sorted[0];
    if (!roster.end_date || sorted[sorted.length - 1] > roster.end_date) plan.endDate = sorted[sorted.length - 1];
  }

  return plan;
};

const isPlanEmpty = (p: RosterSyncPlan) =>
  !p.newName && p.roundUpdates.length === 0 && p.additions.length === 0 && !p.startDate && !p.endDate;

const minusDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Applies a plan to one roster. Assignments (who is rostered) are never created, removed or reassigned. */
const applyPlan = async (roster: ProRoster, plan: RosterSyncPlan): Promise<void> => {
  const rosterName = plan.newName || roster.name;

  for (const u of plan.roundUpdates) {
    const patch: Record<string, unknown> = {};
    if (u.date) patch.date = u.date;
    if (u.seriesRoundKey) patch.series_round_id = u.seriesRoundKey;
    const { error } = await supabase.from('pro_roster_rounds').update(patch).eq('id', u.roundId);
    if (error) throw error;
  }

  const movedIds = plan.roundUpdates.filter(u => u.moved).map(u => u.roundId);
  const touchTasksFor = plan.newName ? null : movedIds; // a rename touches every task's title
  if (touchTasksFor === null || touchTasksFor.length > 0) {
    let q = supabase.from('pro_roster_assignments').select('id, round_id, task_id').eq('roster_id', roster.id);
    if (touchTasksFor) q = q.in('round_id', touchTasksFor);
    const { data: assignments, error } = await q;
    if (error) throw error;

    const { data: rounds } = await supabase.from('pro_roster_rounds').select('id, date, name').eq('roster_id', roster.id);
    const roundById = new Map((rounds || []).map(r => [r.id, r]));

    for (const a of assignments || []) {
      const round = roundById.get(a.round_id);
      if (!round) continue;
      const moved = movedIds.includes(a.round_id);
      if (moved) {
        // New date, so the reminder for it has not been sent yet
        await supabase.from('pro_roster_assignments').update({ reminder_sent_at: null }).eq('id', a.id);
      }
      if (!a.task_id) continue;
      const taskPatch: Record<string, unknown> = {
        title: `PRO Duty: ${rosterName} - ${round.name || round.date}`,
      };
      if (moved) {
        taskPatch.due_date = round.date;
        taskPatch.reminder_date = minusDays(round.date, roster.reminder_days_before || 0);
        taskPatch.description = `You have been assigned as Principal Race Officer for ${roster.boat_class} on ${round.date}.`;
      }
      await supabase.from('club_tasks').update(taskPatch).eq('id', a.task_id).neq('status', 'completed');
    }
  }

  if (plan.additions.length > 0) {
    const { error } = await supabase.from('pro_roster_rounds').insert(
      plan.additions.map(a => ({ roster_id: roster.id, date: a.date, series_round_id: a.seriesRoundKey, sort_order: a.sortOrder }))
    );
    if (error) throw error;
  }

  const rosterPatch: Record<string, unknown> = {};
  if (plan.newName) rosterPatch.name = plan.newName;
  if (plan.startDate) rosterPatch.start_date = plan.startDate;
  if (plan.endDate) rosterPatch.end_date = plan.endDate;
  if (Object.keys(rosterPatch).length > 0) {
    rosterPatch.updated_at = new Date().toISOString();
    const { error } = await supabase.from('pro_rosters').update(rosterPatch).eq('id', roster.id);
    if (error) throw error;
  }
};

const syncOne = async (
  roster: ProRoster,
  sourceName: string,
  sourceRounds: Array<{ name?: string; date?: string; cancelled?: boolean }>,
  today: string
): Promise<RosterSyncResult> => {
  const [{ data: rounds, error }, { data: assignments }] = await Promise.all([
    supabase.from('pro_roster_rounds').select('id, date, series_round_id, sort_order').eq('roster_id', roster.id),
    supabase.from('pro_roster_assignments').select('round_id, member_id, status').eq('roster_id', roster.id),
  ]);
  if (error) throw error;

  const plan = planRosterSync(roster, (rounds || []) as any, sourceName, sourceRounds, today);
  if (!isPlanEmpty(plan)) await applyPlan(roster, plan);

  const memberByRound = new Map(
    (assignments || []).filter(a => ['assigned', 'confirmed'].includes(a.status)).map(a => [a.round_id, a.member_id as string])
  );
  return {
    rosterId: roster.id,
    renamed: !!plan.newName,
    moved: plan.roundUpdates.filter(u => u.moved).length,
    added: plan.additions.length,
    issues: plan.issues.map(i => ({
      rosterId: roster.id,
      rosterName: plan.newName || roster.name,
      roundId: i.roundId,
      date: i.date,
      reason: i.reason,
      memberId: memberByRound.get(i.roundId) || null,
    })),
  };
};

const eventSource = (event: Pick<RaceEvent, 'eventName' | 'date' | 'cancelled'>) => ({
  name: event.eventName || '',
  rounds: [{ name: 'Event', date: event.date, cancelled: !!event.cancelled }],
});

/** Syncs every active/draft roster of a club with the series and events they are linked to. */
export const syncClubRosters = async (
  rosters: ProRoster[],
  seriesList: RaceSeries[],
  events: RaceEvent[] = []
): Promise<RosterSyncResult[]> => {
  const today = localToday();
  const seriesById = new Map(seriesList.map(s => [s.id, s]));
  const eventById = new Map(events.map(e => [e.id, e]));
  const results: RosterSyncResult[] = [];

  for (const roster of rosters) {
    if (!SYNCABLE_STATUSES.includes(roster.status)) continue;
    try {
      if (roster.series_id) {
        const series = seriesById.get(roster.series_id);
        if (!series) continue; // series not loaded (or deleted): leave the roster untouched
        results.push(await syncOne(roster, series.seriesName, series.rounds || [], today));
      } else if (roster.event_id) {
        const event = eventById.get(roster.event_id);
        if (!event) continue;
        const src = eventSource(event);
        results.push(await syncOne(roster, src.name, src.rounds, today));
      }
    } catch (err) {
      console.error('PRO roster sync failed for roster', roster.id, err);
    }
  }
  return results;
};

/** Called after a series is saved. Cheap when the series has no roster (one small query). */
export const syncRostersForSeries = async (series: RaceSeries): Promise<void> => {
  if (!series?.id) return;
  const { data: rosters } = await supabase
    .from('pro_rosters')
    .select('*')
    .eq('series_id', series.id)
    .in('status', SYNCABLE_STATUSES);
  if (!rosters || rosters.length === 0) return;
  await syncClubRosters(rosters as ProRoster[], [series]);
};

/** Called after a single event is saved. */
export const syncRostersForEvent = async (event: RaceEvent): Promise<void> => {
  if (!event?.id || event.isSeriesEvent) return;
  const { data: rosters } = await supabase
    .from('pro_rosters')
    .select('*')
    .eq('event_id', event.id)
    .in('status', SYNCABLE_STATUSES);
  if (!rosters || rosters.length === 0) return;
  await syncClubRosters(rosters as ProRoster[], [], [event]);
};

/** Removes a roster round an admin chose to drop, along with its duty task. */
export const removeRosterRoundWithTask = async (roundId: string): Promise<void> => {
  const { data: assignments } = await supabase.from('pro_roster_assignments').select('id, task_id').eq('round_id', roundId);
  const taskIds = (assignments || []).map(a => a.task_id).filter(Boolean) as string[];
  if (taskIds.length > 0) await supabase.from('club_tasks').delete().in('id', taskIds);
  const { error } = await supabase.from('pro_roster_rounds').delete().eq('id', roundId);
  if (error) throw error;
};

/** Series with rounds still to sail that no active/draft roster is linked to. */
export const findSeriesWithoutRoster = (rosters: ProRoster[], seriesList: RaceSeries[]): RaceSeries[] => {
  const today = localToday();
  const linked = new Set(rosters.filter(r => r.series_id && r.status !== 'archived').map(r => r.series_id));
  return seriesList.filter(s =>
    !linked.has(s.id) &&
    !s.completed &&
    (s.rounds || []).some(r => !r.cancelled && (normDate(r.date) || '') >= today)
  );
};

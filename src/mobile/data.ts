/**
 * Data for the phone app. Reads through the same storage helpers as the desktop calendar
 * (raceStorage, publicEventStorage, calendarMeetingStorage) so both show the same events,
 * and writes RSVPs to event_attendance exactly the way EventDetails does.
 */
import { supabase } from '../utils/supabase';
import { combineAllDayResults, getStoredRaceEvents, getStoredRaceSeries } from '../utils/raceStorage';
import { getPublicEvents, convertToRaceEvent } from '../utils/publicEventStorage';
import { getCalendarMeetings } from '../utils/calendarMeetingStorage';
import { computeEventResults } from '../utils/eventResultsEngine';
import { seriesRoundToEvent } from '../utils/scoringStart';
import type { RaceEvent } from '../types/race';

export type AttendanceStatus = 'yes' | 'no' | 'maybe';

export interface MCalendarItem {
  key: string;               // stable key used in URLs
  kind: 'race' | 'meeting';
  title: string;
  date: string;              // YYYY-MM-DD
  endDate?: string;
  venue: string;
  raceClass?: string;
  raceFormat?: string;
  level: 'club' | 'state' | 'national';
  clubName?: string;
  completed: boolean;
  cancelled: boolean;
  /** For RSVP: series rounds are keyed by series + round name, single events by id. */
  seriesId?: string;
  roundName?: string;
  eventId?: string;
  isPublic?: boolean;
  startTime?: string | null;
  meetingId?: string;
  event?: RaceEvent;
}

/** Strip the round/day suffix the app adds to series and multi-day ids (same as EventDetails). */
export function extractDbId(eventId: string): string {
  const parts = eventId.split('-');
  return parts.length > 5 ? parts.slice(0, 5).join('-') : eventId;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDay(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysUntil(date: string): number {
  const ms = parseDay(date).getTime() - parseDay(todayISO()).getTime();
  return Math.round(ms / 86400000);
}

export async function loadCalendar(clubId: string | undefined, org: { type: string; id: string } | null): Promise<MCalendarItem[]> {
  const isAssoc = org?.type === 'state' || org?.type === 'national';
  const [raceEvents, series, publicEvents, meetings] = await Promise.all([
    isAssoc ? Promise.resolve([] as RaceEvent[]) : getStoredRaceEvents().catch(() => []),
    isAssoc ? Promise.resolve([]) : getStoredRaceSeries().catch(() => []),
    getPublicEvents(false, org?.type as any, org?.id).catch(() => []),
    getCalendarMeetings(
      clubId,
      org?.type === 'state' ? org.id : null,
      org?.type === 'national' ? org.id : null,
    ).catch(() => []),
  ]);

  const items: MCalendarItem[] = [];

  for (const e of raceEvents) {
    if (!e.date) continue;
    items.push({
      key: `e-${e.id}`,
      kind: 'race',
      title: e.eventName || `${e.raceClass} ${e.raceFormat}`,
      date: e.date.slice(0, 10),
      endDate: e.endDate?.slice(0, 10),
      startTime: e.startTime || null,
      venue: e.venue,
      raceClass: e.raceClass,
      raceFormat: e.raceFormat,
      level: (e.eventLevel as any) || 'club',
      clubName: e.clubName,
      completed: !!e.completed,
      cancelled: !!e.cancelled,
      eventId: extractDbId(e.id),
      event: e,
    });
  }

  for (const s of series as any[]) {
    (s.rounds || []).forEach((round: any, index: number) => {
      if (!round.date) return;
      const roundName = round.name || round.roundName;
      // Same mapping as the desktop Race Management page, so results and scoring see the same event
      const event: RaceEvent = seriesRoundToEvent(s, index);
      items.push({
        key: `s-${s.id}-${index}`,
        kind: 'race',
        title: `${s.seriesName} · ${roundName}`,
        date: round.date.slice(0, 10),
        startTime: round.startTime || null,
        venue: round.venue,
        raceClass: s.raceClass,
        raceFormat: s.raceFormat,
        level: 'club',
        clubName: s.clubName,
        completed: !!round.completed,
        cancelled: !!round.cancelled,
        seriesId: s.id,
        roundName,
        event,
      });
    });
  }

  // Public (state / national) events, unless the club holds a local copy
  const localCopies = new Set(raceEvents.map(e => (e as any).publicEventId).filter(Boolean));
  for (const pe of publicEvents as any[]) {
    if (localCopies.has(pe.id)) continue;
    const e = convertToRaceEvent(pe);
    if (!e.date) continue;
    items.push({
      key: `p-${pe.id}`,
      kind: 'race',
      title: e.eventName || 'Event',
      date: e.date.slice(0, 10),
      endDate: e.endDate?.slice(0, 10),
      venue: e.venue,
      raceClass: e.raceClass,
      raceFormat: e.raceFormat,
      level: (e.eventLevel as any) || 'state',
      clubName: e.clubName,
      completed: !!e.completed,
      cancelled: !!e.cancelled,
      eventId: pe.id,
      isPublic: true,
      event: e,
    });
  }

  for (const m of meetings) {
    if (!m.date) continue;
    items.push({
      key: `m-${m.id}`,
      kind: 'meeting',
      title: m.name,
      date: m.date.slice(0, 10),
      venue: m.location || '',
      level: m.organizationLevel === 'club' ? 'club' : m.organizationLevel === 'state_association' ? 'state' : 'national',
      completed: m.status === 'completed',
      cancelled: m.status === 'cancelled',
      startTime: m.start_time,
      meetingId: m.id,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return items;
}

/* ─────────────── Attendance ─────────────── */

export function attendanceKey(item: { seriesId?: string; roundName?: string; eventId?: string }): string | null {
  if (item.seriesId && item.roundName) return `${extractDbId(item.seriesId)}__${item.roundName}`;
  if (item.eventId) return item.eventId;
  return null;
}

export interface AttendanceIndex {
  mine: Record<string, AttendanceStatus>;
  going: Record<string, { userId: string; name: string; avatarUrl?: string }[]>;
}

/** One query for the whole club (the old app made one per event). */
export async function loadAttendance(clubId: string | undefined, userId: string | undefined): Promise<AttendanceIndex> {
  const out: AttendanceIndex = { mine: {}, going: {} };
  if (!clubId) return out;
  const { data, error } = await supabase
    .from('event_attendance')
    .select('event_id, series_id, round_name, user_id, status')
    .eq('club_id', clubId);
  if (error || !data) return out;

  const goingUserIds = [...new Set(data.filter(a => a.status === 'yes').map(a => a.user_id))];
  const profiles: Record<string, { name: string; avatarUrl?: string }> = {};
  if (goingUserIds.length) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', goingUserIds.slice(0, 500));
    (prof || []).forEach((p: any) => {
      profiles[p.id] = { name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Member', avatarUrl: p.avatar_url || undefined };
    });
  }

  for (const a of data as any[]) {
    const key = a.series_id && a.round_name ? `${a.series_id}__${a.round_name}` : a.event_id;
    if (!key) continue;
    if (a.user_id === userId) out.mine[key] = a.status;
    if (a.status === 'yes') {
      (out.going[key] ||= []).push({ userId: a.user_id, name: profiles[a.user_id]?.name || 'Member', avatarUrl: profiles[a.user_id]?.avatarUrl });
    }
  }
  return out;
}

/** Same write path as EventDetails: update the user's row, or insert one. */
export async function setAttendance(
  item: MCalendarItem,
  status: AttendanceStatus,
  userId: string,
  clubId: string,
): Promise<void> {
  let query = supabase.from('event_attendance').select('id').eq('user_id', userId);
  if (item.seriesId && item.roundName) {
    query = query.eq('series_id', extractDbId(item.seriesId)).eq('round_name', item.roundName);
  } else if (item.eventId) {
    query = query.eq('event_id', item.eventId);
  } else {
    throw new Error('This event cannot take answers.');
  }
  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase.from('event_attendance').update({ status }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const row: any = { user_id: userId, club_id: clubId, status };
    if (item.seriesId && item.roundName) {
      row.series_id = extractDbId(item.seriesId);
      row.round_name = item.roundName;
    } else {
      row.event_id = item.eventId;
    }
    const { error } = await supabase.from('event_attendance').insert([row]);
    if (error) throw error;
  }
}

/* ─────────────── Results ─────────────── */

export async function loadMyMemberIds(userId: string | undefined): Promise<string[]> {
  if (!userId) return [];
  const { data } = await supabase.from('members').select('id').eq('user_id', userId);
  return (data || []).map((m: any) => m.id);
}

export interface MyResult {
  item: MCalendarItem;
  position: number;
  of: number;
  points: number | null;
}

/**
 * Standings from the desktop results table's own scoring (utils/eventResultsEngine), so every
 * place, total and dropped race on the phone matches the desktop results page exactly.
 */
export interface MStandings {
  rows: { index: number; name: string; sailNo?: string; memberId?: string; net: number; netLabel: string; gross: number; grossLabel: string }[];
  races: number[];
  isDropped: (skipperIndex: number, race: number) => boolean;
  cell: (skipperIndex: number, race: number) => string;
}

export function eventStandings(src?: RaceEvent | null): MStandings | null {
  // Multi-day events combine every day's races, as the desktop Results page does
  const e = src?.multiDay && src.dayResults ? { ...src, raceResults: combineAllDayResults(src) } : src;
  if (!e || !e.skippers?.length || !e.raceResults?.length) return null;
  const r = computeEventResults(e);
  const label = (n: number) => (e.raceFormat === 'handicap' ? String(Number(n.toFixed(1))) : r.hasRODScoring ? n.toFixed(2) : String(Math.round(n)));
  return {
    rows: (r.displaySkippers as any[]).map(s => {
      const net = r.totals[s.index]?.net || 0;
      const gross = r.totals[s.index]?.gross || 0;
      return { index: s.index, name: s.name, sailNo: s.sailNo, memberId: s.memberId, net, netLabel: net ? label(net) : '0', gross, grossLabel: gross ? label(gross) : '0' };
    }),
    races: r.raceNumbers,
    isDropped: (i, race) => !!r.drops[`${i}-${race}`],
    cell: (i, race) => {
      const x = (r.resultsByRace[race] || []).find((y: any) => y.skipperIndex === i);
      if (!x) return '';
      return x.letterScore ? String(x.letterScore).replace('RDGfix', 'RDG') : x.position != null ? String(x.position) : '';
    },
  };
}

export function myResultFor(item: MCalendarItem, memberIds: string[], fullName?: string): MyResult | null {
  const st = eventStandings(item.event);
  if (!st) return null;
  const idx = st.rows.findIndex(s =>
    (s.memberId && memberIds.includes(s.memberId)) ||
    (!s.memberId && fullName && s.name?.trim().toLowerCase() === fullName.trim().toLowerCase()),
  );
  if (idx < 0) return null;
  const net = st.rows[idx].net;
  return { item, position: idx + 1, of: st.rows.length, points: Number.isFinite(net) ? Number(st.rows[idx].netLabel) : null };
}

export function podium(item: MCalendarItem): string[] {
  return (eventStandings(item.event)?.rows || []).slice(0, 3).map(s => s.name);
}

/* ─────────────── Notifications & news ─────────────── */

export interface MNotification {
  id: string;
  type: string;
  subject: string;
  body: string;
  read: boolean;
  created_at: string;
  link_url: string | null;
  category: string | null;
}

export async function loadNotifications(userId: string | undefined, limit = 60): Promise<MNotification[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, subject, body, read, created_at, link_url, notification_category')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((n: any) => ({ ...n, category: n.notification_category ?? null, read: !!n.read }));
}

export async function unreadNotificationCount(userId: string | undefined): Promise<number> {
  if (!userId) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  return count || 0;
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await supabase.from('notifications').update({ read: true }).in('id', ids);
}

export function stripHtml(html: string): string {
  return (html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short' });
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// Live Tracking: the club's tracking set-up, kit, sessions and fixes from Supabase. Row-level
// security decides who sees what: members watch their club's tracking, race officers (admins, PROs,
// race scorers) run it, club admins change the settings. club_tracking() is what every screen asks
// first, and nothing about tracking shows anywhere unless it says the club's system is on.
import { useEffect, useState } from 'react';
import type { CourseMark, Fix, Line, TrackedBoat, TrackedCourse, TrackingSetup, Waypoint } from './core/analyse';

async function db() {
  const { supabase } = await import('@/utils/supabase');
  return supabase;
}

export interface ClassGeometry { bow: number; length: number }
export interface ClubTracking {
  config_id: string;
  active: boolean;
  scoring_mode: 'off' | 'confirm' | 'auto';
  visibility: 'public' | 'members' | 'officers';
  public_delay_s: number;
  accuracy_m: number;
  class_geometry: Record<string, ClassGeometry>;
  alerts: { stopped_s: number; lost_s: number; close_m: number; keepout_s: number; battery_pct: number };
  update_hz: number;
  rounding_m: number | null;
  can_run: boolean;
  can_manage: boolean;
}

export async function getClubTracking(clubId: string): Promise<ClubTracking | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.rpc('club_tracking', { p_club: clubId });
    if (error || !data) return null;
    return data as ClubTracking;
  } catch {
    return null;
  }
}

/** Is tracking on at this club? Null while asking. Anything about tracking hides unless it's true. */
export function useClubTracking(clubId: string | null | undefined): { tracking: ClubTracking | null; on: boolean; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ tracking: ClubTracking | null; loading: boolean }>({ tracking: null, loading: !!clubId });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    if (!clubId) { setState({ tracking: null, loading: false }); return; }
    setState(s => ({ ...s, loading: true }));
    void getClubTracking(clubId).then(t => { if (live) setState({ tracking: t, loading: false }); });
    return () => { live = false; };
  }, [clubId, n]);
  return { ...state, on: !!state.tracking?.active, reload: () => setN(x => x + 1) };
}

export function setupFrom(t: ClubTracking | null): TrackingSetup {
  return {
    accuracy: Number(t?.accuracy_m ?? 0.05),
    roundingM: Number(t?.rounding_m ?? 2) || 2,
    closeM: Number(t?.alerts?.close_m ?? 0.3),
    stoppedS: Number(t?.alerts?.stopped_s ?? 20),
    lostS: Number(t?.alerts?.lost_s ?? 5),
  };
}

// ── Rows ──
export interface AnchorRow { id: string; config_id: string; anchor_id: string; name: string; role: string; position_x: number; position_y: number; latitude: number | null; longitude: number | null; battery_level: number | null; last_seen_at: string | null; is_active: boolean; sort_order: number }
export interface TagRow { id: string; config_id: string; tag_hardware_id: string; sail_number: string | null; skipper_name: string | null; member_id: string | null; boat_class: string | null; color: string | null; battery_level: number | null; last_seen_at: string | null; is_active: boolean; boat_id: string | null; bow_offset_m: number | null; hull_length_m: number | null; firmware: string | null }
export interface LayoutRow { id: string; config_id: string; name: string; course_type: string; marks: { anchor_id: string; rounding: 'port' | 'starboard' }[]; start_line: { pin_anchor_id: string; boat_anchor_id: string } | null; finish_line: { pin_anchor_id: string; boat_anchor_id: string } | null; wind_direction_deg: number | null; course_distance_m: number | null; is_default: boolean; zones: { name: string; points: { x: number; y: number }[] }[] }
export interface SessionRow { id: string; config_id: string; course_layout_id: string | null; event_id: string | null; heat_id: string | null; race_no: number | null; name: string; status: 'setup' | 'pre_start' | 'racing' | 'finished' | 'abandoned'; started_at: string | null; finished_at: string | null; gun_at: string | null; wind_speed_knots: number | null; wind_direction_deg: number | null; is_live: boolean; scoring: SessionScoring | null; created_at: string }
export interface SessionScoring { sent_at: string; by: string | null; mode: 'confirm' | 'auto'; order: { tag_id: string; sail: string; place: number; finish_s: number | null; code?: 'OCS' | 'DNF' | null }[] }

export interface Kit { anchors: AnchorRow[]; tags: TagRow[]; layouts: LayoutRow[] }

export async function loadKit(configId: string): Promise<Kit | null> {
  try {
    const supabase = await db();
    const [a, t, l] = await Promise.all([
      supabase.from('uwb_anchors').select('*').eq('config_id', configId).order('sort_order'),
      supabase.from('uwb_tags').select('*').eq('config_id', configId).order('sail_number'),
      supabase.from('uwb_course_layouts').select('*').eq('config_id', configId).order('is_default', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    if (a.error || t.error || l.error) return null;
    return { anchors: (a.data ?? []) as AnchorRow[], tags: (t.data ?? []) as TagRow[], layouts: (l.data ?? []) as LayoutRow[] };
  } catch {
    return null;
  }
}

export async function listSessions(configId: string, limit = 60): Promise<SessionRow[] | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from('uwb_race_sessions').select('*').eq('config_id', configId).order('created_at', { ascending: false }).limit(limit);
    return error ? null : ((data ?? []) as SessionRow[]);
  } catch {
    return null;
  }
}

/** The tracking session for a race in Race Management, if there is one. */
export async function sessionForRace(configId: string, eventId: string, raceNo: number): Promise<SessionRow | null> {
  try {
    const supabase = await db();
    const { data } = await supabase.from('uwb_race_sessions').select('*').eq('config_id', configId).eq('event_id', eventId).eq('race_no', raceNo).order('created_at', { ascending: false }).limit(1).maybeSingle();
    return (data as SessionRow) ?? null;
  } catch {
    return null;
  }
}

/** Start tracking a race (StartBox has started its sequence), or mark the gun. */
export async function openRaceSession(configId: string, eventId: string, raceNo: number, name: string, layoutId: string | null): Promise<SessionRow | null> {
  const supabase = await db();
  const existing = await sessionForRace(configId, eventId, raceNo);
  if (existing && existing.status !== 'abandoned' && existing.status !== 'finished') return existing;
  const { data, error } = await supabase.from('uwb_race_sessions').insert({
    config_id: configId, event_id: eventId, race_no: raceNo, name, course_layout_id: layoutId, status: 'pre_start', is_live: true, recording_enabled: true,
  }).select('*').single();
  return error ? null : (data as SessionRow);
}

export async function updateSession(id: string, patch: Partial<SessionRow>): Promise<boolean> {
  try {
    const supabase = await db();
    const { error } = await supabase.from('uwb_race_sessions').update(patch).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/** Every fix of a session, in time order (paged: PostgREST returns 1000 rows at a time). */
export async function loadFixes(sessionId: string, since?: string): Promise<{ tag_id: string; x: number; y: number; h: number | null; at: string }[] | null> {
  try {
    const supabase = await db();
    const out: { tag_id: string; x: number; y: number; h: number | null; at: string }[] = [];
    let after = since ?? '1970-01-01T00:00:00Z';
    for (let page = 0; page < 400; page++) {
      const { data, error } = await supabase.from('uwb_position_data').select('tag_id, position_x, position_y, heading_deg, recorded_at')
        .eq('session_id', sessionId).gt('recorded_at', after).order('recorded_at').limit(1000);
      if (error) return null;
      const rows = (data ?? []) as { tag_id: string; position_x: number; position_y: number; heading_deg: number | null; recorded_at: string }[];
      for (const r of rows) out.push({ tag_id: r.tag_id, x: Number(r.position_x), y: Number(r.position_y), h: r.heading_deg == null ? null : Number(r.heading_deg), at: r.recorded_at });
      if (rows.length < 1000) break;
      after = rows[rows.length - 1].recorded_at;
    }
    return out;
  } catch {
    return null;
  }
}

/** Live fixes as they arrive. Returns an unsubscribe. */
export async function subscribeFixes(sessionId: string, on: (f: { tag_id: string; x: number; y: number; h: number | null; at: string }) => void, onSession?: (s: SessionRow) => void): Promise<() => void> {
  const supabase = await db();
  const ch = supabase.channel(`trk-${sessionId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uwb_position_data', filter: `session_id=eq.${sessionId}` }, (p: { new: Record<string, unknown> }) => {
      const r = p.new as { tag_id: string; position_x: number; position_y: number; heading_deg: number | null; recorded_at: string };
      on({ tag_id: r.tag_id, x: Number(r.position_x), y: Number(r.position_y), h: r.heading_deg == null ? null : Number(r.heading_deg), at: r.recorded_at });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'uwb_race_sessions', filter: `id=eq.${sessionId}` }, (p: { new: Record<string, unknown> }) => {
      onSession?.(p.new as unknown as SessionRow);
    })
    .subscribe();
  return () => { void supabase.removeChannel(ch); };
}

export const epoch = (iso: string) => Date.parse(iso) / 1000;

const FALLBACK_COLORS = ['#FBBF24', '#E879F9', '#34D399', '#2DD4BF', '#F472B6', '#2A93FF', '#94A3B8', '#FB923C', '#A78BFA', '#F87171', '#60A5FA', '#4ADE80'];

/** Tags and their fixes as boats, with each boat's tag-to-bow distance and hull length. */
export function boatsFrom(tags: TagRow[], fixes: { tag_id: string; x: number; y: number; h: number | null; at: string }[], geo: Record<string, ClassGeometry>): TrackedBoat[] {
  const by: Record<string, Fix[]> = {};
  for (const f of fixes) (by[f.tag_id] ||= []).push({ t: epoch(f.at), x: f.x, y: f.y, h: f.h });
  return tags.filter(t => by[t.id]?.length).map((t, i) => {
    const g = geo[t.boat_class ?? ''] ?? geo.IOM ?? { bow: 0.42, length: 1 };
    return {
      id: t.id, sail: t.sail_number ?? t.tag_hardware_id, name: t.skipper_name ?? '', color: t.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      bow: Number(t.bow_offset_m ?? g.bow), length: Number(t.hull_length_m ?? g.length), fixes: by[t.id],
    };
  });
}

/** A layout as a course: marks where their anchors are; two gate anchors in a row make a gate. */
export function courseFrom(layout: LayoutRow, anchors: AnchorRow[]): TrackedCourse | null {
  const A = (id: string | undefined) => anchors.find(a => a.id === id || a.anchor_id === id);
  const line = (l: LayoutRow['start_line']): Line | null => {
    const p = A(l?.pin_anchor_id), b = A(l?.boat_anchor_id);
    return p && b ? { pin: { x: Number(p.position_x), y: Number(p.position_y) }, boat: { x: Number(b.position_x), y: Number(b.position_y) } } : null;
  };
  const start = line(layout.start_line);
  const finish = line(layout.finish_line) ?? start;
  if (!start || !finish) return null;
  const waypoints: Waypoint[] = [];
  const marks = layout.marks ?? [];
  for (let i = 0; i < marks.length; i++) {
    const a = A(marks[i].anchor_id);
    if (!a) continue;
    const m: CourseMark = { id: a.id, name: a.name, p: { x: Number(a.position_x), y: Number(a.position_y) }, rounding: marks[i].rounding ?? null };
    const nx = marks[i + 1] ? A(marks[i + 1].anchor_id) : undefined;
    if (a.role === 'gate' && nx && nx.role === 'gate') {
      waypoints.push({ kind: 'gate', name: `Gate ${a.name}/${nx.name}`, marks: [m, { id: nx.id, name: nx.name, p: { x: Number(nx.position_x), y: Number(nx.position_y) }, rounding: marks[i + 1].rounding ?? null }] });
      i++;
    } else waypoints.push({ kind: 'mark', name: `Mark ${a.name}`, marks: [m] });
  }
  return { start, finish, waypoints, windDeg: layout.wind_direction_deg == null ? null : Number(layout.wind_direction_deg) };
}

export async function saveConfig(configId: string, patch: Partial<Omit<ClubTracking, 'config_id' | 'can_run' | 'can_manage' | 'rounding_m' | 'update_hz' | 'active'>> & { rounding_threshold_m?: number; is_active?: boolean }): Promise<boolean> {
  try {
    const supabase = await db();
    const { error } = await supabase.from('uwb_tracking_configs').update(patch).eq('id', configId);
    return !error;
  } catch {
    return false;
  }
}

export async function saveTag(id: string, patch: Partial<TagRow>): Promise<boolean> {
  try {
    const supabase = await db();
    const { error } = await supabase.from('uwb_tags').update(patch).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export async function saveLayout(row: Partial<LayoutRow> & { config_id: string; name: string }): Promise<LayoutRow | null> {
  try {
    const supabase = await db();
    const q = row.id ? supabase.from('uwb_course_layouts').update(row).eq('id', row.id) : supabase.from('uwb_course_layouts').insert(row);
    const { data, error } = await q.select('*').single();
    return error ? null : (data as LayoutRow);
  } catch {
    return null;
  }
}

/** The coordinator key: race officers can read it (row-level security). */
export async function coordinatorKey(configId: string): Promise<string | null> {
  try {
    const supabase = await db();
    const { data } = await supabase.from('uwb_tracking_configs').select('coordinator_api_key').eq('id', configId).maybeSingle();
    return (data as { coordinator_api_key: string } | null)?.coordinator_api_key ?? null;
  } catch {
    return null;
  }
}

/** The signed-in user's member rows at this club (to find their tags). */
export async function myMemberIds(userId: string, clubId: string): Promise<string[]> {
  try {
    const supabase = await db();
    const { data } = await supabase.from('members').select('id').eq('user_id', userId).eq('club_id', clubId);
    return ((data ?? []) as { id: string }[]).map(r => r.id);
  } catch {
    return [];
  }
}

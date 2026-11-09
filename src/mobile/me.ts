/**
 * Data for the phone "Me" screens: membership card, boat shed and my stats.
 * Same tables and rules as desktop (members, membership_payments, member_boats,
 * boat_rigs, rig_conditions, race_logs, maintenance_*). Stats come from the same
 * results the calendar loaded, scored by the shared standings calculator.
 */
import { supabase } from '../utils/supabase';
import { MCalendarItem, myResultFor } from './data';

/* ─────────────── Membership ─────────────── */

export interface MMembership {
  memberId: string;
  name: string;
  level: string;
  financial: boolean;
  status: string | null;
  renewalDate: string | null;
  joined: string | null;
  club: { id: string; name: string; abbreviation?: string | null; logo?: string | null } | null;
  association: string | null;
  classes: string[];
  payments: { id: string; amount: number; currency: string; status: string; method: string | null; date: string; typeName: string | null }[];
}

const LEVELS: Record<string, string> = { full: 'Full member', junior: 'Junior member', senior: 'Senior member', family: 'Family member', life: 'Life member', associate: 'Associate member', social: 'Social member', honorary: 'Honorary member' };
export const levelLabel = (level?: string | null, custom?: string | null) =>
  (level === 'custom' && custom) || (level ? LEVELS[level.toLowerCase()] || `${level[0].toUpperCase()}${level.slice(1)}` : 'Member');

export async function loadMembership(userId: string | undefined, clubId: string | undefined): Promise<MMembership | null> {
  if (!userId) return null;
  const { data: rows } = await supabase
    .from('members')
    .select('id, first_name, last_name, club_id, membership_level, membership_level_custom, is_financial, membership_status, renewal_date, date_joined, created_at, state_association_id')
    .eq('user_id', userId);
  const m = (rows || []).find((r: any) => r.club_id === clubId) || rows?.[0];
  if (!m) return null;
  const [{ data: club }, { data: boats }, { data: pays }] = await Promise.all([
    m.club_id ? supabase.from('clubs').select('id, name, abbreviation, logo, state_association_id').eq('id', m.club_id).maybeSingle() : Promise.resolve({ data: null as any }),
    supabase.from('member_boats').select('boat_type').eq('member_id', m.id),
    supabase.from('membership_payments').select('id, amount, currency, status, payment_method, created_at, membership_type_id').eq('member_id', m.id).order('created_at', { ascending: false }).limit(10),
  ]);
  const assocId = club?.state_association_id || m.state_association_id;
  const typeIds = [...new Set((pays || []).map((p: any) => p.membership_type_id).filter(Boolean))];
  const [{ data: assoc }, { data: types }] = await Promise.all([
    assocId ? supabase.from('state_associations').select('name').eq('id', assocId).maybeSingle() : Promise.resolve({ data: null as any }),
    typeIds.length ? supabase.from('membership_types').select('id, name').in('id', typeIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const typeName = new Map((types || []).map((t: any) => [t.id, t.name]));
  return {
    memberId: m.id,
    name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
    level: levelLabel(m.membership_level, m.membership_level_custom),
    financial: !!m.is_financial,
    status: m.membership_status,
    renewalDate: m.renewal_date,
    joined: m.date_joined || m.created_at,
    club: club ? { id: club.id, name: club.name, abbreviation: club.abbreviation, logo: club.logo } : null,
    association: assoc?.name || null,
    classes: [...new Set((boats || []).map((b: any) => b.boat_type).filter(Boolean))] as string[],
    payments: (pays || []).map((p: any) => ({
      id: p.id, amount: Number(p.amount) || 0, currency: (p.currency || 'aud').toUpperCase(), status: p.status, method: p.payment_method,
      date: p.created_at, typeName: typeName.get(p.membership_type_id) || null,
    })),
  };
}

export const isCurrent = (m: MMembership) => m.financial && (!m.renewalDate || new Date(m.renewalDate) >= new Date(new Date().toDateString()));

/* ─────────────── Boat shed ─────────────── */

export interface MBoat {
  id: string; memberId: string; type: string; sail: string | null; name: string | null; hull: string | null; design: string | null;
  image: string | null; primary: boolean; description: string | null; tuningGuide: string | null; rigCount: number;
}

export async function loadBoats(memberIds: string[]): Promise<MBoat[]> {
  if (!memberIds.length) return [];
  const { data } = await supabase.from('member_boats').select('*').in('member_id', memberIds);
  const boats = data || [];
  const { data: rigs } = boats.length ? await supabase.from('boat_rigs').select('id, boat_id').in('boat_id', boats.map((b: any) => b.id)) : { data: [] as any[] };
  const count = new Map<string, number>();
  (rigs || []).forEach((r: any) => count.set(r.boat_id, (count.get(r.boat_id) || 0) + 1));
  return boats.map((b: any) => ({
    id: b.id, memberId: b.member_id, type: b.boat_type, sail: b.sail_number, name: b.boat_name, hull: b.hull, design: b.design_name,
    image: b.image_url, primary: !!b.is_primary, description: b.description, tuningGuide: b.tuning_guide_url, rigCount: count.get(b.id) || 0,
  })).sort((a, b) => Number(b.primary) - Number(a.primary) || a.type.localeCompare(b.type));
}

export type Wind = 'light' | 'medium' | 'strong';
export type Water = 'flat' | 'moderate' | 'rough';
export interface MRig { id: string; name: string; isDefault: boolean }
export interface MRigCondition { id: string; rigId: string; wind: Wind; water: Water; settings: Record<string, any>; notes: string | null; rating: number | null }

/** The settings the desktop Rig tuning tab records, in its order, with its units. */
export const RIG_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'staticRake', label: 'Static rake', unit: 'mm' },
  { key: 'rakeDatum', label: 'Rake datum', unit: 'mm' },
  { key: 'shroud', label: 'Shroud tension', unit: '' },
  { key: 'ramPosition', label: 'Ram position', unit: 'mm' },
  { key: 'vang', label: 'Vang', unit: '' },
  { key: 'mainsOuthaul', label: 'Mains outhaul', unit: 'mm' },
  { key: 'mainsFootDepth', label: 'Mains foot depth', unit: 'mm' },
  { key: 'mainsTwist', label: 'Mains twist', unit: '°' },
  { key: 'jibOuthaul', label: 'Jib outhaul', unit: 'mm' },
  { key: 'jibFootDepth', label: 'Jib foot depth', unit: 'mm' },
  { key: 'jibTwist', label: 'Jib twist', unit: '°' },
];

export const WIND_LABEL: Record<Wind, string> = { light: 'Light', medium: 'Medium', strong: 'Strong' };
export const WATER_LABEL: Record<Water, string> = { flat: 'Flat', moderate: 'Moderate', rough: 'Rough' };

export async function loadRigs(boatId: string): Promise<MRig[]> {
  const { data } = await supabase.from('boat_rigs').select('id, name, is_default').eq('boat_id', boatId);
  return (data || []).map((r: any) => ({ id: r.id, name: r.name, isDefault: !!r.is_default }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function createRig(boatId: string, name: string, first: boolean): Promise<MRig> {
  const { data, error } = await supabase.from('boat_rigs').insert({ boat_id: boatId, name, is_default: first, sail_configuration: {} }).select().single();
  if (error) throw error;
  return { id: data.id, name: data.name, isDefault: !!data.is_default };
}

export async function loadConditions(rigId: string): Promise<MRigCondition[]> {
  const { data } = await supabase.from('rig_conditions').select('*').eq('rig_id', rigId);
  return (data || []).map((c: any) => ({ id: c.id, rigId: c.rig_id, wind: c.wind_condition, water: c.water_condition, settings: c.settings || {}, notes: c.notes, rating: c.performance_rating }));
}

/** Insert or update, exactly as the desktop Save does. */
export async function saveCondition(rigId: string, existing: MRigCondition | undefined, wind: Wind, water: Water, settings: Record<string, any>, notes: string) {
  const row = { rig_id: rigId, wind_condition: wind, water_condition: water, settings, notes };
  const { error } = existing
    ? await supabase.from('rig_conditions').update(row).eq('id', existing.id)
    : await supabase.from('rig_conditions').insert(row);
  if (error) throw error;
}

export async function logRace(conditionId: string, r: { id: string; title: string; date: string; venue: string; position: number; of: number; points: number | null }) {
  const { error } = await supabase.from('race_logs').insert({
    rig_condition_id: conditionId, race_id: r.id, race_title: r.title, race_date: r.date, race_venue: r.venue,
    performance_position: r.position, performance_total_participants: r.of, performance_points: r.points,
  });
  if (error) throw error;
}

export async function loadRaceLogs(conditionIds: string[]) {
  if (!conditionIds.length) return [];
  const { data } = await supabase.from('race_logs').select('*').in('rig_condition_id', conditionIds).order('logged_date', { ascending: false }).limit(20);
  return data || [];
}

export async function loadCare(boatId: string) {
  const [{ data: reminders }, { data: logs }] = await Promise.all([
    supabase.from('maintenance_reminders').select('*').eq('boat_id', boatId).eq('is_active', true).eq('is_completed', false).order('due_date', { ascending: true }),
    supabase.from('maintenance_logs').select('*').eq('boat_id', boatId).order('performed_date', { ascending: false }).limit(20),
  ]);
  return { reminders: reminders || [], logs: logs || [] };
}

export async function completeReminder(id: string) {
  const { error } = await supabase.from('maintenance_reminders').update({ is_completed: true, completed_date: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/* ─────────────── Stats ─────────────── */

export interface MStats {
  races: number; wins: number; podiums: number; avgFinish: number | null;
  months: { key: string; label: string; avg: number }[];
  rivals: { name: string; memberId?: string; mine: number; theirs: number }[];
  results: NonNullable<ReturnType<typeof myResultFor>>[];
}

const norm = (s?: string) => (s || '').trim().toLowerCase();

/**
 * Races sailed, wins, podiums (race placings), average race finish, the monthly
 * trend and head-to-head counts, from every race in the calendar this person sailed.
 */
export function computeStats(items: MCalendarItem[], memberIds: string[], fullName: string, year: number | null, boatClass?: string): MStats {
  let races = 0, wins = 0, podiums = 0, finishSum = 0, finishN = 0;
  const monthAgg = new Map<string, { sum: number; n: number }>();
  const h2h = new Map<string, { name: string; memberId?: string; mine: number; theirs: number }>();
  const results: MStats['results'] = [];
  const me = norm(fullName);

  items.filter(i => i.kind === 'race' && (year == null || i.date.startsWith(String(year))) && i.event?.raceResults?.length && (!boatClass || i.raceClass === boatClass)).forEach(i => {
    const e = i.event!;
    const skippers = e.skippers || [];
    const idx = skippers.findIndex((s: any) => (s.memberId && memberIds.includes(s.memberId)) || (!s.memberId && norm(s.name) === me));
    if (idx < 0) return;
    const r = myResultFor(i, memberIds, fullName);
    if (r) results.push(r);
    const byRace = new Map<number, any[]>();
    (e.raceResults as any[]).forEach(x => { const l = byRace.get(x.race) || []; l.push(x); byRace.set(x.race, l); });
    byRace.forEach(list => {
      const mine = list.find(x => x.skipperIndex === idx);
      if (!mine) return;
      const sailed = mine.position != null || (mine.letterScore && !['DNC', 'DNS'].includes(mine.letterScore));
      if (!sailed) return;
      races++;
      const pos = mine.letterScore ? null : mine.position;
      if (pos === 1) wins++;
      if (pos != null && pos <= 3) podiums++;
      if (pos != null) {
        finishSum += pos; finishN++;
        const key = i.date.slice(0, 7);
        const m = monthAgg.get(key) || { sum: 0, n: 0 };
        m.sum += pos; m.n++;
        monthAgg.set(key, m);
      }
      list.forEach(o => {
        if (o.skipperIndex === idx) return;
        const s = skippers[o.skipperIndex];
        if (!s) return;
        const key = s.memberId || norm(s.name);
        const rec = h2h.get(key) || { name: s.name, memberId: s.memberId, mine: 0, theirs: 0 };
        const a = mine.letterScore ? Infinity : (mine.position ?? Infinity);
        const b = o.letterScore ? Infinity : (o.position ?? Infinity);
        if (a < b) rec.mine++;
        else if (b < a) rec.theirs++;
        h2h.set(key, rec);
      });
    });
  });

  const months = [...monthAgg.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({
    key, label: new Date(`${key}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short' }), avg: Math.round((v.sum / v.n) * 10) / 10,
  }));
  // Closest rivals: raced each other most, with the tightest record
  const rivals = [...h2h.values()].filter(r => r.mine + r.theirs >= 3)
    .sort((a, b) => (Math.abs(a.mine - a.theirs) / (a.mine + a.theirs)) - (Math.abs(b.mine - b.theirs) / (b.mine + b.theirs)) || (b.mine + b.theirs) - (a.mine + a.theirs))
    .slice(0, 3);
  results.sort((a, b) => b.item.date.localeCompare(a.item.date));
  return { races, wins, podiums, avgFinish: finishN ? Math.round((finishSum / finishN) * 10) / 10 : null, months, rivals, results };
}

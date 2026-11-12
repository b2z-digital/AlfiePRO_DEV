// Email studio data: campaigns, audiences, settings and the email-studio edge function.
import { supabase } from '../../utils/supabase';
import type { Brand, EmailDoc, Feed, Reader } from '../../lib/emailStudio/types';
import type { StudioSettingsRow } from '../../lib/emailStudio/brand';

export const FROM_EMAIL = 'noreply@alfiepro.com.au';

/* The studio works for a club or a state / national association. The id passed around as clubId is
   that organisation's id; an association's rows keep it in state_association_id / national_association_id. */
export type OrgKind = 'club' | 'state' | 'national';
const orgKinds: Record<string, OrgKind> = {};
export const setOrgKind = (id: string, kind: OrgKind) => { orgKinds[id] = kind; };
export const orgKindOf = (id: string): OrgKind => orgKinds[id] || 'club';
const col = (id: string) => (orgKindOf(id) === 'state' ? 'state_association_id' : orgKindOf(id) === 'national' ? 'national_association_id' : 'club_id');
/** The clubs whose members an organisation emails (a club is its own). */
export async function orgClubIds(id: string): Promise<string[]> {
  const kind = orgKindOf(id);
  if (kind === 'club') return [id];
  if (kind === 'state') {
    const { data } = await supabase.from('clubs').select('id').eq('state_association_id', id);
    return (data || []).map(c => c.id as string);
  }
  const { data: states } = await supabase.from('state_associations').select('id').eq('national_association_id', id);
  const sids = (states || []).map(s => s.id as string);
  if (!sids.length) return [];
  const { data } = await supabase.from('clubs').select('id').in('state_association_id', sids);
  return (data || []).map(c => c.id as string);
}

export type AudiencePart =
  | { kind: 'builtin'; key: string; label?: string }
  | { kind: 'segment' | 'list' | 'not_opened' | 'opened_not_clicked' | 'clicked'; id: string; label?: string }
  | { kind: 'rules'; def: { match: 'all' | 'any'; rules: SegmentRule[] }; label?: string };
export interface Audience { include: AudiencePart[]; exclude: AudiencePart[] }
export const DEFAULT_AUDIENCE: Audience = { include: [{ kind: 'builtin', key: 'all' }], exclude: [] };

export const BUILTINS: { key: string; label: string; note: string }[] = [
  { key: 'all', label: 'All members', note: 'Current members' },
  { key: 'financial', label: 'Financial members', note: 'Paid up and current' },
  { key: 'new', label: 'New this year', note: 'Joined in the last 12 months' },
  { key: 'renewing', label: 'Renewing soon', note: 'Due in the next 30 days' },
  { key: 'lapsed', label: 'Lapsed members', note: 'Membership has expired' },
  { key: 'everyone', label: 'Members and lapsed', note: 'Current and expired' },
  { key: 'signed_in', label: 'Using AlfiePRO', note: 'Have signed in' },
  { key: 'not_signed_in', label: 'Not using AlfiePRO yet', note: 'Never signed in' },
  { key: 'quiet', label: 'Gone quiet', note: 'No opens in 90 days' },
];

export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  from_name: string;
  reply_to: string | null;
  club_id: string;
  state_association_id?: string | null;
  national_association_id?: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | string;
  send_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  topic: string | null;
  audience: Audience | null;
  test_sent_at: string | null;
  last_error: string | null;
  total_recipients: number | null;
  total_sent: number | null;
  template_id?: string | null;
}

const CAMPAIGN_COLS = 'id, name, subject, preview_text, from_name, reply_to, club_id, state_association_id, national_association_id, status, send_at, sent_at, created_at, updated_at, topic, audience, test_sent_at, last_error, total_recipients, total_sent';

export async function listCampaigns(clubId: string): Promise<CampaignRow[]> {
  const { data, error } = await supabase.from('marketing_campaigns').select(CAMPAIGN_COLS).eq(col(clubId), clubId).eq('studio', true)
    .order('updated_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []) as CampaignRow[];
}

export interface CampaignStats { sent: number; opened: number; clicked: number; app: number }
/** Per-campaign numbers for sent campaigns. */
export async function campaignStats(ids: string[]): Promise<Record<string, CampaignStats>> {
  const out: Record<string, CampaignStats> = {};
  if (!ids.length) return out;
  const { data } = await supabase.from('marketing_recipients').select('campaign_id, status, opened_at, first_clicked_at, app_clicked').in('campaign_id', ids).limit(20000);
  for (const r of data || []) {
    const s = (out[r.campaign_id as string] ||= { sent: 0, opened: 0, clicked: 0, app: 0 });
    if (r.status === 'sent') s.sent++;
    if (r.opened_at) s.opened++;
    if (r.first_clicked_at) s.clicked++;
    if (r.app_clicked) s.app++;
  }
  return out;
}

export async function getCampaign(id: string): Promise<{ campaign: CampaignRow; doc: unknown } | null> {
  const [{ data: c }, { data: content }] = await Promise.all([
    supabase.from('marketing_campaigns').select(CAMPAIGN_COLS + ', template_id').eq('id', id).maybeSingle(),
    supabase.from('marketing_campaign_content').select('json_structure').eq('campaign_id', id).maybeSingle(),
  ]);
  if (!c) return null;
  return { campaign: c as unknown as CampaignRow, doc: content?.json_structure ?? null };
}

export async function createCampaign(clubId: string, o: { name: string; subject?: string; doc: EmailDoc; fromName: string; replyTo?: string | null; topic?: string; audience?: Audience; previewText?: string }) {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('marketing_campaigns').insert({
    [col(clubId)]: clubId, name: o.name, subject: o.subject || o.name, preview_text: o.previewText || null, from_name: o.fromName, from_email: FROM_EMAIL,
    reply_to: o.replyTo || null, status: 'draft', campaign_type: 'regular', studio: true, topic: o.topic || 'news',
    audience: o.audience || DEFAULT_AUDIENCE, created_by: u?.user?.id ?? null,
  }).select('id').single();
  if (error) throw error;
  await saveContent(data.id, o.doc);
  return data.id as string;
}

export async function saveCampaign(id: string, patch: Partial<CampaignRow>) {
  const { error } = await supabase.from('marketing_campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function saveContent(campaignId: string, doc: EmailDoc, html = '') {
  const { error } = await supabase.from('marketing_campaign_content')
    .upsert({ campaign_id: campaignId, json_structure: doc as never, html_content: html || ' ', updated_at: new Date().toISOString() }, { onConflict: 'campaign_id' });
  if (error) throw error;
  await supabase.from('marketing_campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId);
}

export async function deleteCampaign(id: string) {
  const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id).in('status', ['draft', 'scheduled']);
  if (error) throw error;
}

export async function duplicateCampaign(id: string) {
  const got = await getCampaign(id);
  if (!got) throw new Error('Not found');
  const c = got.campaign;
  return createCampaign(c.club_id || c.state_association_id || c.national_association_id || '', {
    name: `${c.name} (copy)`, subject: c.subject, doc: got.doc as EmailDoc, fromName: c.from_name, replyTo: c.reply_to,
    topic: c.topic || 'news', audience: c.audience || DEFAULT_AUDIENCE, previewText: c.preview_text || '',
  });
}

/* Edge function */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('email-studio', { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') msg = (await ctx.json())?.error || msg;
    } catch { /* keep the generic message */ }
    throw new Error(msg);
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
  return data as T;
}

export interface FeedResponse { feed: Feed; reader: Reader; brand: Brand; app: string; defaults: { from_name: string; reply_to: string | null; footer_address: string | null } }
export const fetchFeed = (clubId: string, memberId?: string | null) => call<FeedResponse>({ action: 'feed', club_id: clubId, member_id: memberId || null });
export const sendTest = (o: { clubId: string; doc: EmailDoc; subject: string; previewText?: string; fromName?: string; replyTo?: string | null; to: string[]; memberId?: string | null; campaignId?: string | null }) =>
  call<{ sent: number; failed: string[] }>({
    action: 'test', club_id: o.clubId, doc: o.doc, subject: o.subject, preview_text: o.previewText || '', from_name: o.fromName,
    reply_to: o.replyTo, to: o.to, member_id: o.memberId || null, campaign_id: o.campaignId || null,
  });
export const sendNow = (campaignId: string) => call<{ ok: boolean; recipients: number }>({ action: 'send', campaign_id: campaignId });

/* Audience */
export interface AudienceCount { count: number; members: number; others: number; left_out: number; sample: { name: string; member_id: string | null }[] }
export async function audienceCount(clubId: string, audience: Audience, topic?: string | null): Promise<AudienceCount> {
  const { data, error } = await supabase.rpc('email_studio_audience_count', { p_club: clubId, p_aud: audience as never, p_topic: topic || null });
  if (error) throw error;
  return data as AudienceCount;
}

export interface SegmentRow { id: string; name: string; description: string | null; filter_criteria: { match?: 'all' | 'any'; rules?: SegmentRule[] } | null; list_type: string; total_contacts: number | null; updated_at: string }
export interface SegmentRule { field: string; op?: string; value?: unknown }

export async function listSegments(clubId: string): Promise<SegmentRow[]> {
  const { data } = await supabase.from('marketing_subscriber_lists').select('id, name, description, filter_criteria, list_type, total_contacts, updated_at')
    .eq(col(clubId), clubId).eq('list_type', 'segment').order('name');
  return (data || []) as SegmentRow[];
}
export async function listLists(clubId: string): Promise<SegmentRow[]> {
  const { data } = await supabase.from('marketing_subscriber_lists').select('id, name, description, filter_criteria, list_type, total_contacts, updated_at')
    .eq(col(clubId), clubId).not('list_type', 'in', '("segment","all_members")').order('name');
  return (data || []) as SegmentRow[];
}
export async function saveSegment(clubId: string, s: { id?: string; name: string; description?: string; def: { match: 'all' | 'any'; rules: SegmentRule[] }; count?: number }) {
  const row = { name: s.name, description: s.description || null, filter_criteria: s.def as never, list_type: 'segment', [col(clubId)]: clubId, total_contacts: s.count ?? null, updated_at: new Date().toISOString() };
  if (s.id) {
    const { error } = await supabase.from('marketing_subscriber_lists').update(row).eq('id', s.id);
    if (error) throw error;
    return s.id;
  }
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('marketing_subscriber_lists').insert({ ...row, created_by: u?.user?.id ?? null }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
export async function deleteSegment(id: string) {
  const { error } = await supabase.from('marketing_subscriber_lists').delete().eq('id', id).eq('list_type', 'segment');
  if (error) throw error;
}

/* Numbers */
export interface HomeData {
  now: { sent: number; opened: number; clicked: number; app: number };
  prev: { sent: number; opened: number; clicked: number };
  recent: { id: string; name: string; subject: string; at: string; topic: string | null; sent: number; opened: number; clicked: number; app: number }[];
  upcoming: { id: string; name: string; subject: string; at: string; status: string }[];
  counts: { drafts: number; scheduled: number; sent: number; segments: number; lists: number; people: number; unsubscribed: number };
  whats_on: { at: string; recipients: number; kind: string }[];
}
export async function homeData(clubId: string): Promise<HomeData> {
  const { data, error } = await supabase.rpc('email_studio_home', { p_club: clubId, p_days: 30 });
  if (error) throw error;
  return data as HomeData;
}

export interface ReportData {
  totals: { recipients: number; sent: number; failed: number; queued: number; opened: number; clicked: number; app: number; unsubscribed: number; not_opened: number; opened_not_clicked: number; clicks: number };
  hours: { h: number; n: number }[];
  links: { url: string; block: string | null; clicks: number; people: number }[];
  blocks: Record<string, number>;
}
export async function reportData(campaignId: string): Promise<ReportData> {
  const { data, error } = await supabase.rpc('email_studio_report', { p_campaign: campaignId });
  if (error) throw error;
  return data as ReportData;
}

export async function memberActivity(clubId: string, email: string) {
  const { data, error } = await supabase.rpc('email_studio_member_activity', { p_club: clubId, p_email: email });
  if (error) throw error;
  return data as {
    emails: { campaign: string | null; subject: string | null; campaign_id: string | null; sent_at: string | null; opened_at: string | null; clicked_at: string | null; status: string }[];
    prefs: { unsubscribed: boolean; topics_off: string[] } | null;
    topics: { key: string; label: string }[];
  };
}

/* Settings */
export async function getSettings(clubId: string): Promise<StudioSettingsRow | null> {
  const { data } = await supabase.from('email_studio_settings').select('*').eq('club_id', clubId).maybeSingle();
  return (data as StudioSettingsRow) || null;
}
export async function saveSettings(clubId: string, s: StudioSettingsRow) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('email_studio_settings').upsert({ club_id: clubId, ...s, updated_at: new Date().toISOString(), updated_by: u?.user?.id ?? null } as never, { onConflict: 'club_id' });
  if (error) throw error;
}

/* Members (fill in as, profiles) */
export interface MemberLite { id: string; first_name: string | null; last_name: string | null; email: string | null; avatar_url?: string | null; membership_status?: string | null; is_financial?: boolean | null; renewal_date?: string | null; membership_level?: string | null; user_id?: string | null; date_joined?: string | null }
export async function searchMembers(clubId: string, q: string, limit = 12): Promise<MemberLite[]> {
  const clubs = orgKindOf(clubId) === 'club' ? [clubId] : await orgClubIds(clubId);
  if (!clubs.length) return [];
  let req = supabase.from('members').select('id, first_name, last_name, email, avatar_url, membership_status, is_financial, renewal_date, membership_level, user_id, date_joined')
    .in('club_id', clubs).is('archived_at', null).order('first_name').limit(limit);
  const t = q.trim().replace(/[%,()]/g, ' ').trim();
  if (t) req = req.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%`);
  const { data } = await req;
  return (data || []) as MemberLite[];
}

/* Templates the club saved */
export interface SavedTemplate { id: string; name: string; description: string | null; category: string; email_content_json: unknown; updated_at: string }
export async function listSavedTemplates(clubId: string): Promise<SavedTemplate[]> {
  const { data } = await supabase.from('marketing_email_templates').select('id, name, description, category, email_content_json, updated_at')
    .eq(col(clubId), clubId).not('email_content_json', 'is', null).order('updated_at', { ascending: false });
  return ((data || []) as SavedTemplate[]).filter(t => Array.isArray((t.email_content_json as EmailDoc | null)?.blocks));
}
export async function saveTemplate(clubId: string, t: { id?: string; name: string; description?: string; category?: string; doc: EmailDoc }) {
  const row = { name: t.name, description: t.description || null, category: t.category || 'general', email_content_json: t.doc as never, [col(clubId)]: clubId, html_content: ' ', updated_at: new Date().toISOString() };
  if (t.id) {
    const { error } = await supabase.from('marketing_email_templates').update(row).eq('id', t.id);
    if (error) throw error;
    return t.id;
  }
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('marketing_email_templates').insert({ ...row, created_by: u?.user?.id ?? null }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
export async function deleteTemplate(id: string) {
  const { error } = await supabase.from('marketing_email_templates').delete().eq('id', id);
  if (error) throw error;
}

/* Small helpers */
export const fmtDate = (s?: string | null, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  s ? new Date(s).toLocaleDateString('en-AU', opts) : '';
export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase() : '');
export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
export const ago = (s?: string | null) => {
  if (!s) return '';
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} day${d === 1 ? '' : 's'} ago` : fmtDate(s, { day: 'numeric', month: 'short' });
};
export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

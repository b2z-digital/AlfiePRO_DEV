// Email studio: live club content for the builder, test sends, and sending campaigns.
// Works for clubs and for state / national associations: wherever a club_id is passed it may be an
// association id (association campaigns keep it in state_association_id / national_association_id).
//   feed  {club_id, member_id?}            live content + reader + brand for previews (club admins)
//   test  {club_id, doc, subject, ...}      send a test to up to 10 addresses (club admins)
//   send  {campaign_id}                      start sending a campaign now (club admins)
//   run   {campaign_id}                      scheduled send / keep going with a big send (service role only)
// Emails are rendered with the same code as the app (lib/, synced from src/lib/emailStudio).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { renderEmail, todayIn, fillTokens } from './lib/render.ts';
import { normaliseDoc } from './lib/catalog.ts';
import { brandFor, type StudioSettingsRow } from './lib/brand.ts';
import type { Brand, EmailDoc, Feed, FeedEvent, Reader } from './lib/types.ts';
import { calculateEventStandings } from './lib/scoring/standingsCalculator.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SENDGRID = Deno.env.get('SENDGRID_API_KEY') ?? '';
const FROM_EMAIL = 'noreply@alfiepro.com.au';
const TRACK = `${SUPABASE_URL}/functions/v1/email-studio-track`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/* ── Signing (tracking links can't be pointed somewhere else) ─────────────── */
let hmacKey: CryptoKey | null = null;
async function sign(s: string) {
  if (!hmacKey) {
    hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(`email-studio:${SERVICE_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(s));
  return Array.from(new Uint8Array(sig).slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Who's asking ─────────────────────────────────────────────────────────── */
async function callerId(req: Request): Promise<{ service: boolean; userId: string | null }> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (token && token === SERVICE_KEY) return { service: true, userId: null };
  if (!token) return { service: false, userId: null };
  const { data } = await db.auth.getUser(token);
  return { service: false, userId: data?.user?.id ?? null };
}

type OrgKind = 'club' | 'state' | 'national';
async function orgKind(id: string): Promise<OrgKind | null> {
  if (!id) return null;
  const [{ data: c }, { data: s }, { data: n }] = await Promise.all([
    db.from('clubs').select('id').eq('id', id).maybeSingle(),
    db.from('state_associations').select('id').eq('id', id).maybeSingle(),
    db.from('national_associations').select('id').eq('id', id).maybeSingle(),
  ]);
  return c ? 'club' : s ? 'state' : n ? 'national' : null;
}
/** The organisation a campaign belongs to: its club, else its association. */
const orgOf = (c: { club_id?: string | null; state_association_id?: string | null; national_association_id?: string | null }) =>
  String(c.club_id || c.state_association_id || c.national_association_id || '');

async function canManage(userId: string | null, orgId: string) {
  if (!userId || !orgId) return false;
  const { data: p } = await db.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle();
  if (p?.is_super_admin) return true;
  const kind = await orgKind(orgId);
  if (kind === 'state') {
    const { data } = await db.from('user_state_associations').select('role').eq('user_id', userId).eq('state_association_id', orgId);
    return (data || []).some(r => ['state_admin', 'admin', 'editor'].includes(String(r.role)));
  }
  if (kind === 'national') {
    const { data } = await db.from('user_national_associations').select('role').eq('user_id', userId).eq('national_association_id', orgId);
    return (data || []).some(r => ['national_admin', 'admin', 'editor'].includes(String(r.role)));
  }
  const { data } = await db.from('user_clubs').select('role').eq('user_id', userId).eq('club_id', orgId);
  return (data || []).some(r => ['admin', 'super_admin', 'editor'].includes(String(r.role)));
}

/* ── Club, settings, brand and live content ───────────────────────────────── */
interface ClubCtx {
  kind: OrgKind;
  club: { id: string; name: string; logo: string | null; address: string | null; contact_email: string | null; state_association_id: string | null; website_theme: Record<string, unknown> | null };
  settings: StudioSettingsRow | null;
  brand: Brand;
  app: string;
  feed: Feed;
  fromName: string;
  replyTo: string | null;
  footer: string | null;
}

const strip = (html?: string | null) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const firstImage = (images: unknown): string | null => {
  const a = Array.isArray(images) ? images : [];
  const f = a[0] as unknown;
  if (typeof f === 'string') return f;
  if (f && typeof f === 'object' && typeof (f as { url?: string }).url === 'string') return (f as { url: string }).url;
  return null;
};

async function appUrl() {
  const { data } = await db.rpc('whats_on_app_url');
  return typeof data === 'string' && /^https?:\/\//.test(data) ? data.replace(/\/$/, '') : 'https://app.alfiepro.com.au';
}

async function loadClub(clubId: string): Promise<ClubCtx> {
  const kind = await orgKind(clubId);
  if (kind === 'state' || kind === 'national') return loadAssociation(clubId, kind);
  const [{ data: club, error }, { data: settings }, app] = await Promise.all([
    db.from('clubs').select('id, name, logo, address, contact_email, state_association_id, website_theme').eq('id', clubId).single(),
    db.from('email_studio_settings').select('*').eq('club_id', clubId).maybeSingle(),
    appUrl(),
  ]);
  if (error || !club) throw new Error('Club not found');
  const feed = await buildFeed(club, app);
  return {
    kind: 'club',
    club: club as ClubCtx['club'],
    settings: settings as StudioSettingsRow | null,
    brand: brandFor(club as never, settings as StudioSettingsRow | null),
    app,
    feed,
    fromName: (settings?.from_name || club.name || 'AlfiePRO').slice(0, 80),
    replyTo: [settings?.reply_to, club.contact_email].find(e => e && EMAIL_RE.test(String(e).trim()))?.trim() || null,
    footer: settings?.footer_address || club.address || null,
  };
}

/** A state or national association: its own news (and the national body's), its championships. */
async function loadAssociation(id: string, kind: 'state' | 'national'): Promise<ClubCtx> {
  const table = kind === 'state' ? 'state_associations' : 'national_associations';
  const [{ data: a, error }, { data: settings }, app] = await Promise.all([
    db.from(table).select('*').eq('id', id).single(),
    db.from('email_studio_settings').select('*').eq('club_id', id).maybeSingle(),
    appUrl(),
  ]);
  if (error || !a) throw new Error('Association not found');
  const address = [a.address, a.city, a.postcode].filter(Boolean).join(', ') || null;
  const club: ClubCtx['club'] = { id, name: a.name, logo: a.logo_url || null, address, contact_email: a.email || null, state_association_id: null, website_theme: null };
  const feed = await buildAssociationFeed(id, kind, kind === 'state' ? a.national_association_id : null, club, app);
  return {
    kind,
    club,
    settings: settings as StudioSettingsRow | null,
    brand: brandFor(club as never, settings as StudioSettingsRow | null),
    app,
    feed,
    fromName: (settings?.from_name || a.name || 'AlfiePRO').slice(0, 80),
    replyTo: [settings?.reply_to, a.email].find(e => e && EMAIL_RE.test(String(e).trim()))?.trim() || null,
    footer: settings?.footer_address || address,
  };
}

async function buildAssociationFeed(id: string, kind: 'state' | 'national', national: string | null, org: ClubCtx['club'], app: string): Promise<Feed> {
  const today = todayIn();
  const site = `${app}/news`;
  const or = kind === 'state'
    ? [`and(club_id.is.null,state_association_id.eq.${id})`, ...(national ? [`and(club_id.is.null,state_association_id.is.null,national_association_id.eq.${national})`] : [])]
    : [`and(club_id.is.null,state_association_id.is.null,national_association_id.eq.${id})`];
  const extCats = kind === 'state' ? [`state_${id}`, 'national'] : ['national'];
  const [arts, pub, ext, vids, last] = await Promise.all([
    db.from('articles').select('id, title, excerpt, content, cover_image, published_at, club_id, state_association_id')
      .eq('status', 'published').or(or.join(',')).order('published_at', { ascending: false }).limit(18),
    db.from('public_events').select('id, event_name, date, end_date, venue, race_class, race_format, is_paid, entry_fee, event_level, state_association_id, national_association_id, approval_status, archived')
      .gte('date', today).lte('date', addDays(today, 200))
      .or(kind === 'state' ? `state_association_id.eq.${id},event_level.eq.national` : `national_association_id.eq.${id},event_level.eq.national`)
      .order('date').limit(40),
    db.from('external_events').select('id, event_name, event_date, event_end_date, venue, boat_class_mapped, boat_class_raw, source_url, display_category, is_visible, event_status')
      .in('display_category', extCats).eq('is_visible', true).eq('event_status', 'active').gte('event_date', today).lte('event_date', addDays(today, 200))
      .order('event_date').limit(40),
    db.from('alfie_tv_videos').select('id, youtube_id, title, thumbnail_url, thumbnail_high_url, duration_formatted, channel_id, published_at').eq('is_approved', true)
      .order('published_at', { ascending: false }).limit(6),
    db.from('marketing_campaigns').select('sent_at').or(`state_association_id.eq.${id},national_association_id.eq.${id}`).is('club_id', null).eq('studio', true).eq('status', 'sent')
      .order('sent_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const news = (arts.data || []).map(a => ({
    id: a.id, title: a.title,
    excerpt: (a.excerpt && strip(a.excerpt)) || strip(a.content).slice(0, 200) || null,
    image: a.cover_image || null, published_at: a.published_at,
    source: (a.state_association_id ? 'state' : 'national') as 'club' | 'state' | 'national',
    url: `${site}/${a.id}`,
  }));
  const seen = new Set<string>();
  const key = (d: string, cls: string | null) => `${d}|${String(cls || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const evs: FeedEvent[] = [];
  for (const e of (pub.data || []).filter(e => !e.archived && (e.approval_status == null || ['approved', 'state_approved', 'national_approved'].includes(String(e.approval_status))))) {
    seen.add(key(e.date, e.race_class));
    evs.push({
      event_key: `p-${e.id}`, kind: 'event', title: e.event_name || 'Championship', event_date: e.date, end_date: e.end_date || null,
      venue: e.venue || null, map_url: e.venue ? `https://maps.google.com/?q=${encodeURIComponent(e.venue)}` : null,
      race_class: e.race_class || null, class_key: null, race_format: e.race_format || null, is_paid: !!e.is_paid, entry_fee: e.entry_fee ?? null,
      start_time: null, going: 0, url: `${app}/calendar`,
    } as FeedEvent);
  }
  for (const e of ext.data || []) {
    const cls = e.boat_class_mapped || e.boat_class_raw || null;
    if (seen.has(key(e.event_date, cls))) continue;
    seen.add(key(e.event_date, cls));
    evs.push({
      event_key: `x-${e.id}`, kind: 'event', title: e.event_name || 'Championship', event_date: e.event_date, end_date: e.event_end_date || null,
      venue: e.venue || null, map_url: e.venue ? `https://maps.google.com/?q=${encodeURIComponent(e.venue)}` : null,
      race_class: cls, class_key: null, race_format: null, is_paid: false, entry_fee: null, start_time: null, going: 0, url: e.source_url || `${app}/calendar`,
    } as FeedEvent);
  }
  evs.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
  const videos = (vids.data || []).map(v => ({
    id: String(v.id), title: String(v.title || 'Video'), thumb: (v.thumbnail_high_url as string) || (v.thumbnail_url as string) || null,
    duration: (v.duration_formatted as string) || null, mine: false,
    url: v.youtube_id ? `${app}/play/${encodeURIComponent(String(v.youtube_id))}?title=${encodeURIComponent(String(v.title || ''))}` : `${app}/alfie-tv`,
  }));
  return {
    club: { id: org.id, name: org.name, address: org.address, appUrl: app, siteUrl: app },
    news, events: evs.slice(0, 20), results: [], classifieds: [], videos,
    lastSentAt: last.data?.sent_at ?? null,
  };
}

async function buildFeed(club: ClubCtx['club'], app: string): Promise<Feed> {
  const site = `${app}/club/${club.id}/public`;
  const today = todayIn();
  let national: string | null = null;
  if (club.state_association_id) {
    const { data } = await db.from('state_associations').select('national_association_id').eq('id', club.state_association_id).maybeSingle();
    national = data?.national_association_id ?? null;
  }
  const or = [`club_id.eq.${club.id}`];
  if (club.state_association_id) or.push(`and(club_id.is.null,state_association_id.eq.${club.state_association_id})`);
  if (national) or.push(`and(club_id.is.null,state_association_id.is.null,national_association_id.eq.${national})`);

  const { data: myChannels } = await db.from('alfie_tv_channels').select('id').eq('club_id', club.id);
  const channelIds = (myChannels || []).map(c => c.id);

  const [arts, events, rounds, quick, cls, clsMine, vids, vidsMine, last] = await Promise.all([
    db.from('articles').select('id, title, excerpt, content, cover_image, published_at, club_id, state_association_id')
      .eq('status', 'published').or(or.join(',')).order('published_at', { ascending: false }).limit(18),
    db.rpc('whats_on_events', { p_club: club.id, p_from: today, p_to: addDays(today, 200) }),
    db.from('race_series_rounds').select('id, round_name, date, race_class, skippers, race_results, drop_rules, multi_day, day_results, number_of_days, heat_management, race_series(series_name)')
      .eq('club_id', club.id).eq('completed', true).order('date', { ascending: false }).limit(4),
    db.from('quick_races').select('id, event_name, race_date, race_class, skippers, race_results, drop_rules, multi_day, day_results, number_of_days, heat_management, is_simulated, archived')
      .eq('club_id', club.id).eq('completed', true).order('race_date', { ascending: false }).limit(6),
    db.from('classifieds').select('id, title, price, images, location, category, club_id, created_at').eq('status', 'active').eq('is_public', true)
      .order('created_at', { ascending: false }).limit(12),
    db.from('classifieds').select('id, title, price, images, location, category, club_id, created_at').eq('status', 'active').eq('club_id', club.id)
      .order('created_at', { ascending: false }).limit(9),
    db.from('alfie_tv_videos').select('id, youtube_id, title, thumbnail_url, thumbnail_high_url, duration_formatted, channel_id, published_at').eq('is_approved', true)
      .order('published_at', { ascending: false }).limit(6),
    channelIds.length
      ? db.from('alfie_tv_videos').select('id, youtube_id, title, thumbnail_url, thumbnail_high_url, duration_formatted, channel_id, published_at').eq('is_approved', true).in('channel_id', channelIds)
        .order('published_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] as never[] }),
    db.from('marketing_campaigns').select('sent_at').eq('club_id', club.id).eq('studio', true).eq('status', 'sent').order('sent_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const news = (arts.data || []).map(a => ({
    id: a.id,
    title: a.title,
    excerpt: (a.excerpt && strip(a.excerpt)) || strip(a.content).slice(0, 200) || null,
    image: a.cover_image || null,
    published_at: a.published_at,
    source: (a.club_id === club.id ? 'club' : a.state_association_id ? 'state' : 'national') as 'club' | 'state' | 'national',
    url: a.club_id === club.id ? `${site}/news/${a.id}` : `${app}/news/${a.id}`,
  }));

  const evs: FeedEvent[] = (Array.isArray(events.data) ? events.data : []).map((e: Record<string, unknown>) => ({
    event_key: String(e.event_key),
    kind: (e.kind as FeedEvent['kind']) || 'event',
    title: String(e.title || 'Club race'),
    event_date: String(e.event_date),
    end_date: (e.end_date as string) || null,
    venue: (e.venue as string) || null,
    map_url: (e.map_url as string) || null,
    race_class: (e.race_class as string) || null,
    class_key: (e.class_key as string) || null,
    race_format: (e.race_format as string) || null,
    is_paid: !!e.is_paid,
    entry_fee: (e.entry_fee as number) ?? null,
    start_time: (e.start_time as string) || null,
    going: Number(e.going || 0),
    url: `${site}/race-calendar`,
  }));

  const scored = [
    ...(rounds.data || []).map(r => ({ id: r.id, title: `${r.round_name}${(r as { race_series?: { series_name?: string } }).race_series?.series_name ? ` · ${(r as { race_series?: { series_name?: string } }).race_series!.series_name}` : ''}`, date: r.date, race_class: r.race_class, raw: r })),
    ...(quick.data || []).filter(q => !q.is_simulated && !q.archived).map(q => ({ id: q.id, title: q.event_name || `${q.race_class || 'Club'} race`, date: String(q.race_date || '').slice(0, 10), race_class: q.race_class, raw: q })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4);

  const results = scored.flatMap(s => {
    try {
      const r = s.raw as Record<string, unknown>;
      const skippers = Array.isArray(r.skippers) ? r.skippers : [];
      if (!skippers.length) return [];
      const standings = calculateEventStandings({
        skippers, raceResults: r.race_results || [], dropRules: r.drop_rules || undefined, multiDay: !!r.multi_day,
        dayResults: r.day_results || undefined, numberOfDays: r.number_of_days || 1, heatManagement: r.heat_management || undefined,
      } as never) as unknown as { name?: string; sailNo?: string; netTotal: number; hasResults?: boolean }[];
      const rows = standings.filter(x => x.hasResults !== false && x.name).map((x, i) => ({
        pos: i + 1, name: String(x.name), sail: x.sailNo ? String(x.sailNo) : null,
        points: Number.isFinite(x.netTotal) && x.netTotal < Number.MAX_SAFE_INTEGER ? Math.round(x.netTotal * 10) / 10 : null,
      }));
      if (!rows.length) return [];
      return [{ id: s.id, title: s.title, date: s.date, race_class: s.race_class || null, boats: skippers.length, url: `${site}/results/${s.id}`, standings: rows }];
    } catch (e) {
      console.error('results scoring failed', s.id, (e as Error).message);
      return [];
    }
  });

  const classified = (c: Record<string, unknown>) => ({
    id: String(c.id), title: String(c.title || 'Listing'), price: (c.price as number) ?? null, image: firstImage(c.images),
    location: (c.location as string) || null, category: (c.category as string) || null, url: `${site}/classifieds`, mine: c.club_id === club.id,
  });
  const seen = new Set<string>();
  const classifieds = [...(clsMine.data || []), ...(cls.data || [])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .map(classified);

  const video = (v: Record<string, unknown>) => ({
    id: String(v.id), title: String(v.title || 'Video'), thumb: (v.thumbnail_high_url as string) || (v.thumbnail_url as string) || null,
    duration: (v.duration_formatted as string) || null, mine: channelIds.includes(String(v.channel_id)),
    url: v.youtube_id ? `${app}/play/${encodeURIComponent(String(v.youtube_id))}?title=${encodeURIComponent(String(v.title || ''))}` : `${app}/alfie-tv`,
  });
  const vseen = new Set<string>();
  const videos = [...((vidsMine as { data?: Record<string, unknown>[] }).data || []), ...(vids.data || [])]
    .filter(v => (vseen.has(String(v.id)) ? false : (vseen.add(String(v.id)), true)))
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .map(video);

  return {
    club: { id: club.id, name: club.name, address: club.address, appUrl: app, siteUrl: site },
    news, events: evs, results, classifieds, videos,
    lastSentAt: last.data?.sent_at ?? null,
  };
}

/* ── The person reading ───────────────────────────────────────────────────── */
async function readerFor(ctx: ClubCtx, memberId: string | null, fallback: { email?: string | null; first_name?: string | null; last_name?: string | null } = {}, withToken = true): Promise<Reader> {
  if (memberId) {
    const { data: m } = await db.from('members')
      .select('id, first_name, last_name, email, user_id, renewal_date, membership_level, membership_level_custom, is_financial, membership_status, archived_at, club_id')
      .eq('id', memberId).maybeSingle();
    if (m && ctx.kind !== 'club') {
      // An association's reader: their name and membership; renewals stay with their club
      return {
        member_id: m.id, first_name: (m.first_name || '').trim() || 'there', last_name: (m.last_name || '').trim(), email: m.email, user_id: m.user_id,
        is_member: !m.archived_at && ['active', 'expired', null].includes(m.membership_status),
        is_financial: !!m.is_financial && m.membership_status !== 'expired', renewal_date: m.renewal_date,
        membership_level: m.membership_level_custom || m.membership_level || null, boats: [], answers: {}, token: null,
        renewUrl: `${ctx.app}/membership/${m.club_id}/renew/${m.id}`,
      };
    }
    if (m && m.club_id === ctx.club.id) {
      const [{ data: mc }, tok] = await Promise.all([
        db.rpc('whats_on_member_ctx', { p_member: m.id }),
        withToken ? db.rpc('whats_on_member_token', { p_member: m.id }) : Promise.resolve({ data: null }),
      ]);
      const c = (mc || {}) as { boats?: Reader['boats']; answers?: Reader['answers'] };
      return {
        member_id: m.id,
        first_name: (m.first_name || '').trim() || 'there',
        last_name: (m.last_name || '').trim(),
        email: m.email,
        user_id: m.user_id,
        is_member: !m.archived_at && ['active', 'expired', null].includes(m.membership_status),
        is_financial: !!m.is_financial && m.membership_status !== 'expired',
        renewal_date: m.renewal_date,
        membership_level: m.membership_level_custom || m.membership_level || null,
        boats: c.boats || [],
        answers: c.answers || {},
        token: typeof tok.data === 'string' ? tok.data : null,
        renewUrl: `${ctx.app}/membership/${ctx.club.id}/renew/${m.id}`,
      };
    }
  }
  return { first_name: (fallback.first_name || '').trim() || 'there', last_name: fallback.last_name || '', email: fallback.email || null, is_member: false, boats: [], answers: {} };
}

/* ── Sending ──────────────────────────────────────────────────────────────── */
async function sendgrid(o: { to: string; name?: string; subject: string; html: string; text: string; fromName: string; replyTo: string | null; headers?: Record<string, string>; rid?: string }) {
  if (!SENDGRID) throw new Error('Email sending is not set up');
  const body: Record<string, unknown> = {
    personalizations: [{ to: [{ email: o.to, ...(o.name ? { name: o.name.slice(0, 80) } : {}) }], subject: o.subject.slice(0, 200), ...(o.rid ? { custom_args: { rid: o.rid } } : {}) }],
    from: { email: FROM_EMAIL, name: o.fromName },
    content: [{ type: 'text/plain', value: o.text || ' ' }, { type: 'text/html', value: o.html }],
    categories: ['email-studio'],
    tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false }, subscription_tracking: { enable: false } },
  };
  if (o.replyTo) body.reply_to = { email: o.replyTo };
  if (o.headers) body.headers = o.headers;
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Render for one recipient, with tracked links, open pixel and unsubscribe. */
async function renderTracked(doc: EmailDoc, ctx: ClubCtx, reader: Reader, subject: string, previewText: string, rid: string) {
  const links: { url: string; block: string }[] = [];
  const out = renderEmail(doc, {
    subject, previewText, brand: ctx.brand, feed: ctx.feed, reader, footerAddress: ctx.footer,
    wrapLink: (url, block) => { links.push({ url, block }); return `__ESL${links.length - 1}__`; },
    openPixel: `${TRACK}?o=${rid}`,
    preferencesUrl: `${ctx.app}/email/preferences?t=${rid}`,
    unsubscribeUrl: `${TRACK}?x=${rid}&s=${await sign(`${rid}|unsub`)}`,
  });
  const finals = await Promise.all(links.map(async l => `${TRACK}?c=${rid}&b=${encodeURIComponent(l.block)}&u=${encodeURIComponent(l.url)}&s=${await sign(`${rid}|${l.url}`)}`));
  const swap = (s: string, enc: (v: string) => string) => s.replace(/__ESL(\d+)__/g, (_m, i) => enc(finals[+i]));
  return {
    html: swap(out.html, v => v.replace(/&/g, '&amp;')),
    text: swap(out.text, v => v),
    unsub: `${TRACK}?x=${rid}&s=${await sign(`${rid}|unsub`)}`,
  };
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Move a campaign from draft/scheduled to sending and queue everyone it goes to. */
async function startCampaign(id: string) {
  const { data: c } = await db.from('marketing_campaigns').update({ status: 'sending', sending_started_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null })
    .eq('id', id).in('status', ['draft', 'scheduled']).select('*').maybeSingle();
  if (!c) return null;
  const org = orgOf(c);
  const { data: people, error } = await db.rpc('email_studio_recipients', { p_club: org, p_aud: c.audience || { include: [{ kind: 'builtin', key: 'all' }] }, p_topic: c.topic || null });
  if (error) {
    await db.from('marketing_campaigns').update({ status: 'draft', last_error: `Could not work out who to send to: ${error.message}` }).eq('id', id);
    throw new Error(error.message);
  }
  const rows = (people || []).map((p: Record<string, unknown>) => ({
    campaign_id: id, club_id: org, email: p.email, first_name: p.first_name || null, last_name: p.last_name || null,
    member_id: p.member_id || null, user_id: p.user_id || null, status: 'queued',
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await db.from('marketing_recipients').insert(rows.slice(i, i + 500));
    if (e) throw new Error(e.message);
  }
  await db.from('marketing_campaigns').update({ total_recipients: rows.length }).eq('id', id);
  return { campaign: c, recipients: rows.length };
}

async function processCampaign(id: string) {
  const started = Date.now();
  const { data: c } = await db.from('marketing_campaigns').select('*').eq('id', id).single();
  if (!c || c.status !== 'sending') return;
  const { data: content } = await db.from('marketing_campaign_content').select('json_structure').eq('campaign_id', id).maybeSingle();
  const doc = normaliseDoc(content?.json_structure);
  const ctx = await loadClub(orgOf(c));
  const fromName = (c.from_name || ctx.fromName).slice(0, 80);
  const replyTo = c.reply_to && EMAIL_RE.test(c.reply_to) ? c.reply_to : ctx.replyTo;

  while (Date.now() - started < 110_000) {
    const { data: batch } = await db.rpc('email_studio_claim', { p_campaign: id, p_n: 20 });
    if (!batch || !batch.length) break;
    await pool(batch as Record<string, string>[], 5, async r => {
      try {
        const reader = await readerFor(ctx, r.member_id, r);
        const subject = fillTokens(c.subject || c.name, reader, ctx.brand);
        const out = await renderTracked(doc, ctx, reader, subject, c.preview_text || '', r.id);
        await sendgrid({
          to: r.email, name: `${reader.first_name === 'there' ? '' : reader.first_name} ${reader.last_name || ''}`.trim(), subject,
          html: out.html, text: out.text, fromName, replyTo, rid: r.id,
          headers: { 'List-Unsubscribe': `<${out.unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        });
        await db.from('marketing_recipients').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', r.id);
      } catch (e) {
        await db.from('marketing_recipients').update({ status: 'failed', error: String((e as Error).message || e).slice(0, 500) }).eq('id', r.id);
      }
    });
    await db.from('marketing_campaigns').update({ updated_at: new Date().toISOString() }).eq('id', id);
  }

  const { count } = await db.from('marketing_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', id).in('status', ['queued', 'sending']);
  if (count && count > 0) {
    await fetch(`${SUPABASE_URL}/functions/v1/email-studio`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run', campaign_id: id }),
    }).catch(e => console.error('could not continue send', e));
    return;
  }
  const [{ count: sent }, { count: failed }] = await Promise.all([
    db.from('marketing_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'sent'),
    db.from('marketing_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'failed'),
  ]);
  await db.from('marketing_campaigns').update({
    status: 'sent', sent_at: new Date().toISOString(), total_sent: sent || 0, total_delivered: sent || 0, total_bounced: failed || 0,
    last_error: failed && !sent ? 'No emails could be sent. Check the sending settings.' : null,
  }).eq('id', id).eq('status', 'sending');
}

/* ── Handler ──────────────────────────────────────────────────────────────── */
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const who = await callerId(req);

    if (action === 'run') {
      if (!who.service) return json({ error: 'Not allowed' }, 403);
      const id = String(body.campaign_id || '');
      const { data: c } = await db.from('marketing_campaigns').select('id, status, send_at').eq('id', id).maybeSingle();
      if (!c) return json({ error: 'Not found' }, 404);
      if (c.status === 'scheduled') {
        if (c.send_at && new Date(c.send_at).getTime() > Date.now() + 60_000) return json({ ok: true, waiting: true });
        await startCampaign(id);
      }
      EdgeRuntime.waitUntil(processCampaign(id).catch(async e => {
        console.error('send failed', id, e);
        await db.from('marketing_campaigns').update({ last_error: String((e as Error).message || e).slice(0, 300) }).eq('id', id);
      }));
      return json({ ok: true });
    }

    if (!who.userId && !who.service) return json({ error: 'Please sign in again' }, 401);
    // The server itself (service key) may build feeds and send tests, e.g. for checks after a deploy.
    const allowed = async (clubId: string) => who.service || (await canManage(who.userId, clubId));

    if (action === 'feed') {
      const clubId = String(body.club_id || '');
      if (!(await allowed(clubId))) return json({ error: 'Not allowed' }, 403);
      const ctx = await loadClub(clubId);
      let memberId: string | null = body.member_id || null;
      if (!memberId && who.userId) {
        const { data: me } = await db.from('members').select('id').eq('user_id', who.userId).order('club_id', { ascending: true })
          .or(ctx.kind === 'club' ? `club_id.eq.${clubId}` : `club_id.not.is.null`).limit(1).maybeSingle();
        memberId = me?.id ?? null;
      }
      const reader = await readerFor(ctx, memberId, {}, false);
      return json({ feed: ctx.feed, reader, brand: ctx.brand, app: ctx.app, defaults: { from_name: ctx.fromName, reply_to: ctx.replyTo, footer_address: ctx.footer } });
    }

    if (action === 'test') {
      const clubId = String(body.club_id || '');
      if (!(await allowed(clubId))) return json({ error: 'Not allowed' }, 403);
      const to: string[] = Array.from(new Set((Array.isArray(body.to) ? body.to : []).map((e: unknown) => String(e || '').trim().toLowerCase()).filter((e: string) => EMAIL_RE.test(e)))).slice(0, 10) as string[];
      if (!to.length) return json({ error: 'Add an email address to send the test to' }, 400);
      const ctx = await loadClub(clubId);
      const doc = normaliseDoc(body.doc);
      if (!doc.blocks.length) return json({ error: 'The email is empty' }, 400);
      let testMember: string | null = body.member_id || null;
      if (!testMember && who.userId) {
        const { data: me } = await db.from('members').select('id').eq('user_id', who.userId).order('club_id', { ascending: true })
          .or(ctx.kind === 'club' ? `club_id.eq.${clubId}` : `club_id.not.is.null`).limit(1).maybeSingle();
        testMember = me?.id ?? null;
      }
      const reader = await readerFor(ctx, testMember, { first_name: 'Sam', last_name: 'Sample' }, false);
      const subject = `[Test] ${fillTokens(String(body.subject || 'Test email'), reader, ctx.brand)}`;
      const out = renderEmail(doc, {
        subject, previewText: String(body.preview_text || ''), brand: ctx.brand, feed: ctx.feed, reader, footerAddress: ctx.footer,
        preferencesUrl: `${ctx.app}/email/preferences?test=1`, unsubscribeUrl: `${ctx.app}/email/preferences?test=1`,
      });
      const fromName = String(body.from_name || ctx.fromName).slice(0, 80);
      const replyTo = body.reply_to && EMAIL_RE.test(String(body.reply_to)) ? String(body.reply_to) : ctx.replyTo;
      const failed: string[] = [];
      for (const addr of to) {
        try {
          await sendgrid({ to: addr, subject, html: out.html, text: out.text, fromName, replyTo });
        } catch (e) {
          console.error('test send failed', addr, e);
          failed.push(addr);
        }
      }
      if (body.campaign_id && failed.length < to.length) {
        await db.from('marketing_campaigns').update({ test_sent_at: new Date().toISOString() }).eq('id', body.campaign_id)
          .or(`club_id.eq.${clubId},state_association_id.eq.${clubId},national_association_id.eq.${clubId}`);
      }
      if (failed.length === to.length) return json({ error: 'The test could not be sent. Please try again in a minute.' }, 502);
      return json({ sent: to.length - failed.length, failed });
    }

    if (action === 'send') {
      const id = String(body.campaign_id || '');
      const { data: c } = await db.from('marketing_campaigns').select('id, club_id, state_association_id, national_association_id, status').eq('id', id).maybeSingle();
      if (!c || !(await canManage(who.userId, orgOf(c)))) return json({ error: 'Not allowed' }, 403);
      if (c.status === 'sent') return json({ error: 'This email has already been sent' }, 400);
      let recipients = 0;
      if (c.status !== 'sending') {
        const started = await startCampaign(id);
        if (!started) return json({ error: 'This email is already on its way' }, 409);
        recipients = started.recipients;
        if (!recipients) {
          await db.from('marketing_campaigns').update({ status: 'draft', last_error: 'Nobody to send to. Check who it goes to.' }).eq('id', id);
          await db.from('marketing_recipients').delete().eq('campaign_id', id);
          return json({ error: 'Nobody to send to. Check who it goes to.' }, 400);
        }
      }
      EdgeRuntime.waitUntil(processCampaign(id).catch(async e => {
        console.error('send failed', id, e);
        await db.from('marketing_campaigns').update({ last_error: String((e as Error).message || e).slice(0, 300) }).eq('id', id);
      }));
      return json({ ok: true, recipients });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('email-studio error', e);
    return json({ error: (e as Error).message || 'Something went wrong' }, 500);
  }
});

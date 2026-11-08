/**
 * Data for the phone AlfieTV tab. Same queries and visibility rules as the desktop
 * AlfieTV page: club + global channels for a club (global only for associations),
 * public live broadcasts with a picture, public replays, watchlist and history.
 */
import { supabase } from '../utils/supabase';
import { alfieTVStorage, AlfieTVVideo } from '../utils/alfieTVStorage';
import { trackVideoView } from '../utils/alfieTVPersonalization';
import type { LivestreamArchive, LivestreamSession } from '../types/livestream';

export type { AlfieTVVideo, LivestreamSession, LivestreamArchive };
export type MStream = LivestreamSession & { club_name?: string; venue_image?: string };
export interface MChannel { id: string; channel_name: string; channel_thumbnail: string | null; video_count?: number; category?: string }
export interface MPlaylistRow { id: string; title: string; videos: AlfieTVVideo[] }
export interface MContinue { video: AlfieTVVideo; position: number; duration: number }

export interface TVHome {
  channels: MChannel[];
  live: MStream[];
  upcoming: MStream[];
  replays: LivestreamArchive[];
  hero: AlfieTVVideo[];
  top: AlfieTVVideo[];
  latest: AlfieTVVideo[];
  rows: MPlaylistRow[];
  continueWatching: MContinue[];
  watchlist: AlfieTVVideo[];
}

async function withClubs(streams: LivestreamSession[]): Promise<MStream[]> {
  const ids = [...new Set(streams.map(s => s.club_id).filter(Boolean))];
  if (!ids.length) return streams;
  const { data } = await supabase.from('clubs').select('id, name, cover_image_url, featured_image_url').in('id', ids);
  const by = new Map((data || []).map((c: any) => [c.id, c]));
  return streams.map(s => {
    const c: any = by.get(s.club_id);
    return { ...s, club_name: c?.name, venue_image: c?.cover_image_url || c?.featured_image_url || undefined };
  });
}

export async function loadStreams(): Promise<{ live: MStream[]; upcoming: MStream[]; replays: LivestreamArchive[] }> {
  const week = new Date(); week.setDate(week.getDate() + 7);
  const [live, upcoming, replays] = await Promise.all([
    supabase.from('livestream_sessions').select('*').eq('status', 'live').eq('is_public', true)
      .not('cloudflare_live_input_id', 'is', null).not('cloudflare_customer_code', 'is', null)
      .order('actual_start_time', { ascending: false }),
    supabase.from('livestream_sessions').select('*').eq('status', 'scheduled').eq('is_public', true)
      .not('scheduled_start_time', 'is', null).gte('scheduled_start_time', new Date().toISOString()).lte('scheduled_start_time', week.toISOString())
      .order('scheduled_start_time', { ascending: true }).limit(3),
    supabase.from('livestream_archives').select('*').eq('is_public', true)
      .or('youtube_url.not.is.null,cloudflare_playback_url.not.is.null').not('duration', 'is', null).gt('duration', 0)
      .order('recorded_at', { ascending: false }).limit(20),
  ]);
  return { live: await withClubs((live.data || []) as LivestreamSession[]), upcoming: await withClubs((upcoming.data || []) as LivestreamSession[]), replays: (replays.data || []) as LivestreamArchive[] };
}

export async function loadTVHome(clubId: string | undefined, orgId: string | undefined, orgType: string, userId: string | undefined): Promise<TVHome> {
  let q = supabase.from('alfie_tv_channels').select('id, channel_name, channel_thumbnail, is_visible, category, is_global, video_count').order('channel_name');
  q = orgType === 'club' && clubId ? q.or(`club_id.eq.${clubId},is_global.eq.true`) : q.eq('is_global', true);
  const [{ data: channelRows }, streams] = await Promise.all([q, loadStreams()]);
  const channels = (channelRows || []).filter((c: any) => c.is_visible !== false) as MChannel[];
  const ids = channels.map(c => c.id);
  const empty: TVHome = { channels, ...streams, hero: [], top: [], latest: [], rows: [], continueWatching: [], watchlist: [] };
  if (!ids.length) return empty;

  const orgKey = clubId || orgId;
  const [featured, latest, popular, playlists, cont, watch] = await Promise.all([
    orgKey ? alfieTVStorage.getFeaturedVideos(orgKey).catch(() => [] as AlfieTVVideo[]) : Promise.resolve([] as AlfieTVVideo[]),
    supabase.from('alfie_tv_videos').select('*').in('channel_id', ids).order('published_at', { ascending: false }).limit(20),
    supabase.from('alfie_tv_videos').select('*').in('channel_id', ids).order('view_count', { ascending: false }).limit(10),
    supabase.from('alfie_tv_youtube_playlists').select('id, title, is_featured, video_count, channel_id')
      .in('channel_id', ids).eq('is_visible', true).order('is_featured', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false }).limit(6),
    userId ? alfieTVStorage.getContinueWatching(userId).catch(() => []) : Promise.resolve([]),
    userId ? alfieTVStorage.getWatchlist(userId).catch(() => [] as AlfieTVVideo[]) : Promise.resolve([] as AlfieTVVideo[]),
  ]);

  // A few playlist rows, ordered as the playlist orders them
  const rows: MPlaylistRow[] = [];
  for (const p of (playlists.data || []).slice(0, 4)) {
    const { data: link } = await supabase.from('alfie_tv_youtube_playlist_videos').select('video_id').eq('youtube_playlist_id', p.id).order('position').limit(10);
    const order = (link || []).map((l: any) => l.video_id);
    if (!order.length) continue;
    const { data: vids } = await supabase.from('alfie_tv_videos').select('*').in('id', order);
    const idx = new Map(order.map((id, i) => [id, i]));
    rows.push({ id: p.id, title: p.title, videos: (vids || []).sort((a: any, b: any) => (idx.get(a.id) ?? 99) - (idx.get(b.id) ?? 99)) as AlfieTVVideo[] });
  }

  const latestList = (latest.data || []) as AlfieTVVideo[];
  const visibleFeatured = featured.filter(v => ids.includes(v.channel_id));
  return {
    ...empty,
    hero: (visibleFeatured.length ? visibleFeatured : latestList).slice(0, 5),
    top: (popular.data || []) as AlfieTVVideo[],
    latest: latestList,
    rows,
    continueWatching: (cont as any[]).filter(c => c.video).map(c => ({ video: c.video, position: c.watch_position || 0, duration: c.watch_duration || c.video.duration || 0 })),
    watchlist: watch,
  };
}

export async function loadChannelVideos(channelId: string): Promise<AlfieTVVideo[]> {
  const { data } = await supabase.from('alfie_tv_videos').select('*').eq('channel_id', channelId).order('published_at', { ascending: false }).limit(40);
  return (data || []) as AlfieTVVideo[];
}

export async function searchTV(userId: string | undefined, q: string): Promise<AlfieTVVideo[]> {
  if (userId) {
    try {
      const r = await alfieTVStorage.searchVideos(userId, q, 30);
      if (r?.length) return r.map((x: any) => x.video || x) as AlfieTVVideo[];
    } catch { /* fall back */ }
  }
  const { data } = await supabase.from('alfie_tv_videos').select('*').ilike('title', `%${q}%`).order('view_count', { ascending: false }).limit(30);
  return (data || []) as AlfieTVVideo[];
}

export async function toggleWatchlist(userId: string, videoId: string, inList: boolean) {
  if (inList) await alfieTVStorage.removeFromWatchlist(userId, videoId);
  else await alfieTVStorage.addToWatchlist(userId, videoId);
}

/** On close: the same view tracking as desktop, plus watch history so Continue watching works. */
export async function recordWatch(userId: string | undefined, v: AlfieTVVideo, position: number, duration: number, seconds: number) {
  if (seconds > 5) await trackVideoView(v.id, v.channel_id, Math.floor(seconds), duration || v.duration).catch(() => {});
  if (userId && position > 5) await alfieTVStorage.updateWatchHistory(userId, v.id, Math.floor(position), Math.floor(duration || v.duration || 0)).catch(() => {});
}

export const thumb = (v: { thumbnail_url?: string | null; youtube_id?: string; thumbnail_high_url?: string | null } & Record<string, any>) =>
  v.thumbnail_high_url || v.thumbnail_url || (v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg` : '');

export function duration(sec?: number | null) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

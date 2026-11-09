import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { livestreamStorage } from './livestreamStorage';
import { toLivestreamEventId } from './livestreamEventIds';
import { liveCloud } from './liveCloud';
import type { LivestreamSession } from '../types/livestream';

export interface StreamableEvent {
  /** The id a broadcast is linked with ("<seriesId>-<roundIndex>" for series rounds) */
  id: string;
  name: string;
  date: string;
  venue: string;
  kind: 'Series round' | 'Club race' | 'Event';
}

/** Club races, series rounds and events from the last week onwards, soonest first. */
export async function loadStreamableEvents(clubId: string): Promise<StreamableEvent[]> {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  const fromIso = from.toISOString().slice(0, 10);

  const [races, rounds, events] = await Promise.all([
    supabase.from('quick_races').select('id, event_name, race_date, race_venue, archived, public_event_id')
      .eq('club_id', clubId).eq('archived', false).is('public_event_id', null).gte('race_date', fromIso),
    supabase.from('race_series_rounds').select('id, series_id, round_index, round_name, date, venue, cancelled, race_series(series_name)')
      .eq('club_id', clubId).gte('date', fromIso),
    supabase.from('public_events').select('id, name, date, venue, cancelled').eq('club_id', clubId).gte('date', fromIso),
  ]);

  const list: StreamableEvent[] = [];
  (races.data || []).forEach((r: any) => {
    if (!r.race_date) return;
    list.push({ id: r.id, name: r.event_name || 'Club race', date: r.race_date, venue: r.race_venue || '', kind: 'Club race' });
  });
  (rounds.data || []).forEach((r: any) => {
    if (!r.date || r.cancelled || r.series_id == null || r.round_index == null) return;
    const series = r.race_series?.series_name;
    list.push({
      id: `${r.series_id}-${r.round_index}`,
      name: series ? `${series} · ${r.round_name}` : (r.round_name || 'Series round'),
      date: r.date,
      venue: r.venue || '',
      kind: 'Series round',
    });
  });
  (events.data || []).forEach((e: any) => {
    if (!e.date || e.cancelled) return;
    list.push({ id: e.id, name: e.name || 'Event', date: e.date, venue: e.venue || '', kind: 'Event' });
  });
  return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export type FilmingMode = 'device' | 'encoder' | 'cloud';

export interface NewBroadcastInput {
  clubId: string;
  userId: string;
  title: string;
  eventId?: string | null;
  scheduledTime?: string | null;
  filming: FilmingMode;
  isPublic: boolean;
  racesOnly?: boolean;
}

const DEFAULT_OVERLAYS = {
  showHeatNumber: true,
  showSkippers: true,
  showStandings: true,
  showWeather: true,
  showHandicaps: false,
  position: 'bottom' as const,
  theme: 'dark' as const,
  fleetOpacity: 0.58,
};

/** Creates a broadcast: a Cloudflare live input and the session row (or a cloud broadcast). */
export async function createBroadcast(input: NewBroadcastInput): Promise<LivestreamSession> {
  const eventId = input.eventId ? await toLivestreamEventId(input.eventId) : undefined;

  if (input.filming === 'cloud') {
    const res = await liveCloud<{ session: LivestreamSession }>('create', {
      clubId: input.clubId,
      title: input.title,
      eventId,
      test: !input.isPublic,
      mode: input.racesOnly ? 'races_only' : 'live',
    });
    if (input.scheduledTime && res.session?.id) {
      return livestreamStorage.updateSession(res.session.id, { status: 'scheduled', scheduled_start_time: input.scheduledTime });
    }
    return res.session;
  }

  const base: Partial<LivestreamSession> & Record<string, unknown> = {
    club_id: input.clubId,
    created_by: input.userId,
    title: input.title,
    event_id: eventId,
    status: input.scheduledTime ? 'scheduled' : 'draft',
    scheduled_start_time: input.scheduledTime || undefined,
    enable_chat: true,
    enable_overlays: true,
    is_public: input.isPublic,
    overlay_config: DEFAULT_OVERLAYS,
    broadcast_mode: input.racesOnly ? 'races_only' : 'live',
  };

  // Record races on this device: each race is recorded in the browser and uploaded, so there is
  // no live input to create and nothing is streamed
  if (input.racesOnly && input.filming === 'device') {
    return livestreamStorage.createSession({ ...base, streaming_mode: 'cloudflare_relay', stream_input_mode: 'browser' } as Partial<LivestreamSession>);
  }

  const { data: { session: auth } } = await supabase.auth.getSession();
  if (!auth) throw new Error('Sign in again to create a broadcast');
  const cfResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'createLiveInput', clubId: input.clubId, sessionData: { title: input.title, recording: true } }),
  });
  const cf = await cfResponse.json().catch(() => ({}));
  if (!cfResponse.ok || !cf.liveInput) throw new Error(cf.error || 'Could not create the Cloudflare input');

  const playback = cf.liveInput.webRTCPlayback?.url || cf.liveInput.rtmpsPlayback?.url || '';
  const customer = (playback.match(/customer-([a-z0-9]+)\./) || [])[1];

  const sessionData: Partial<LivestreamSession> & Record<string, unknown> = {
    ...base,
    streaming_mode: 'cloudflare_relay',
    stream_input_mode: input.filming === 'encoder' ? 'rtmp_external' : 'browser',
    cloudflare_live_input_id: cf.liveInput.uid,
    cloudflare_whip_url: cf.liveInput.webRTC?.url,
    cloudflare_whip_playback_url: cf.liveInput.webRTCPlayback?.url,
    cloudflare_rtmps_url: cf.liveInput.rtmps?.url,
    cloudflare_rtmps_stream_key: cf.liveInput.rtmps?.streamKey,
    cloudflare_customer_code: customer,
  };
  return livestreamStorage.createSession(sessionData as Partial<LivestreamSession>);
}

/**
 * Event ids with a public broadcast live right now, for LIVE badges on event cards.
 * Series rounds match by their "<seriesId>-<roundIndex>" id, as the calendar uses.
 */
export function useLiveEventIds(clubId?: string | null): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!clubId) { setIds(new Set()); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('livestream_sessions')
        .select('event_id')
        .eq('club_id', clubId)
        .eq('status', 'live')
        .eq('is_public', true)
        .neq('broadcast_mode', 'races_only');
      if (!cancelled) setIds(new Set((data || []).map((r: { event_id: string | null }) => r.event_id).filter((id): id is string => !!id)));
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [clubId]);
  return ids;
}

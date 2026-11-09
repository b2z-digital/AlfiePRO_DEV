/**
 * Connection servers (STUN/TURN) for phone cameras and the control room.
 *
 * Phones on mobile data usually can't reach the control laptop directly, so their video goes
 * through a relay (TURN). The relay is Cloudflare's TURN service: the turn-credentials function
 * hands out short-lived logins to signed-in users and to phones holding a camera link key.
 * Until that function is set up (or if it can't be reached) the old public servers are used.
 */
import { supabase } from './supabase';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

let cached: { servers: RTCIceServer[]; until: number; relay: boolean } | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

/** True once a Cloudflare relay login has been obtained (for status display) */
export const usingCloudflareRelay = () => !!cached?.relay;

export async function getIceServers(opts: { sessionId?: string | null; key?: string | null } = {}): Promise<RTCIceServer[]> {
  if (cached && cached.until > Date.now()) return cached.servers;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/turn-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anon,
          Authorization: `Bearer ${session?.access_token || anon}`,
        },
        body: JSON.stringify({ sessionId: opts.sessionId || undefined, key: opts.key || undefined }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`turn-credentials ${res.status}`);
      const body = await res.json();
      const servers: RTCIceServer[] = Array.isArray(body?.iceServers) ? body.iceServers : [];
      if (!servers.some(s => String(Array.isArray(s.urls) ? s.urls.join(',') : s.urls).includes('turn'))) {
        throw new Error('No relay in response');
      }
      // Logins last 6 hours; refresh well before that
      cached = { servers, until: Date.now() + 4 * 60 * 60 * 1000, relay: true };
      return servers;
    } catch (err) {
      console.warn('[ICE] Cloudflare relay unavailable, using public servers:', (err as Error)?.message);
      cached = { servers: FALLBACK_ICE_SERVERS, until: Date.now() + 5 * 60 * 1000, relay: false };
      return FALLBACK_ICE_SERVERS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

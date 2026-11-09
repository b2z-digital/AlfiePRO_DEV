/**
 * Connection servers (STUN/TURN) for phone cameras and the control room.
 *
 * Phones on mobile data usually can't reach the control laptop directly, so their video goes
 * through a relay (TURN). Club racing uses the free public relay. State and national
 * championship broadcasts use Cloudflare's paid TURN service: the turn-credentials function
 * decides from the broadcast's event and hands out short-lived logins. If the function can't
 * be reached, the free public servers are used.
 */
import { supabase } from './supabase';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

type Cached = { servers: RTCIceServer[]; until: number; relay: boolean };
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<RTCIceServer[]>>();

/** True once a Cloudflare relay login has been obtained for this broadcast (for status display) */
export const usingCloudflareRelay = (sessionId?: string | null) => !!cache.get(sessionId || '')?.relay;

export async function getIceServers(opts: { sessionId?: string | null; key?: string | null } = {}): Promise<RTCIceServer[]> {
  const cacheKey = opts.sessionId || '';
  const hit = cache.get(cacheKey);
  if (hit && hit.until > Date.now()) return hit.servers;
  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
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
      // Club racing: the function says to use the free public relay
      if (body?.relay === 'public') {
        console.log('[ICE] Standard relay (club broadcast)');
        cache.set(cacheKey, { servers: FALLBACK_ICE_SERVERS, until: Date.now() + 30 * 60 * 1000, relay: false });
        return FALLBACK_ICE_SERVERS;
      }
      const servers: RTCIceServer[] = Array.isArray(body?.iceServers) ? body.iceServers : [];
      if (!servers.some(s => String(Array.isArray(s.urls) ? s.urls.join(',') : s.urls).includes('turn'))) {
        throw new Error('No relay in response');
      }
      console.log('[ICE] Cloudflare relay (championship broadcast)');
      // Logins last 6 hours; refresh well before that
      cache.set(cacheKey, { servers, until: Date.now() + 4 * 60 * 60 * 1000, relay: true });
      return servers;
    } catch (err) {
      console.warn('[ICE] Cloudflare relay unavailable, using public servers:', (err as Error)?.message);
      cache.set(cacheKey, { servers: FALLBACK_ICE_SERVERS, until: Date.now() + 5 * 60 * 1000, relay: false });
      return FALLBACK_ICE_SERVERS;
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, request);
  return request;
}

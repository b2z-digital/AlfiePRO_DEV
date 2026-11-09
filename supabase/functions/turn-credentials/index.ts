// Short-lived relay (TURN) logins for livestream cameras, from Cloudflare's TURN service.
//
// Phones on mobile data usually can't connect straight to the control laptop, so their video is
// relayed. Cloudflare TURN logins expire; this function makes a fresh one per request.
//
// Who can ask:
//   - a signed-in AlfiePRO user (control room, scoring screen, signed-in phones), or
//   - a phone holding a valid camera link key for a session ({ sessionId, key }).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   CF_TURN_KEY_ID          the TURN key's ID   (Cloudflare → Realtime → TURN Server → Create)
//   CF_TURN_KEY_API_TOKEN   the TURN key's API token
// Deploy with JWT verification OFF (phones that aren't signed in call it); it checks callers itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TTL_SECONDS = 6 * 60 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const keyId = Deno.env.get("CF_TURN_KEY_ID");
  const keyToken = Deno.env.get("CF_TURN_KEY_API_TOKEN");
  if (!keyId || !keyToken) return json({ error: "Relay not configured", configured: false }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { sessionId, key } = await req.json().catch(() => ({} as Record<string, string>));

  // 1. A signed-in user
  let allowed = false;
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer && bearer.split(".").length === 3) {
    const { data } = await admin.auth.getUser(bearer).catch(() => ({ data: { user: null } } as any));
    allowed = !!data?.user;
  }
  // 2. A phone with a valid, unexpired camera link
  if (!allowed && typeof sessionId === "string" && typeof key === "string" && key.length >= 32) {
    const { data: link } = await admin
      .from("livestream_camera_links")
      .select("join_key, expires_at")
      .eq("session_id", sessionId)
      .maybeSingle();
    allowed = !!link && link.join_key === key && new Date(link.expires_at).getTime() > Date.now();
  }
  if (!allowed) return json({ error: "Not allowed" }, 401);

  const base = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials`;
  const headers = { Authorization: `Bearer ${keyToken}`, "Content-Type": "application/json" };
  const body = JSON.stringify({ ttl: TTL_SECONDS });

  // Current endpoint returns a ready-made iceServers list; the older one returns a single entry
  let res = await fetch(`${base}/generate-ice-servers`, { method: "POST", headers, body });
  if (res.status === 404) res = await fetch(`${base}/generate`, { method: "POST", headers, body });
  if (!res.ok) {
    console.error("[turn-credentials] Cloudflare refused:", res.status, (await res.text()).slice(0, 300));
    return json({ error: "Could not get a relay login" }, 502);
  }
  const data = await res.json();
  const raw = data?.iceServers;
  const iceServers = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    // Port 53 is blocked by many browsers and networks; drop those URLs
    .map((s: any) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u: string) => !/:53(\?|$)/.test(u)) }))
    .filter((s: any) => s.urls.length > 0);

  return json({ iceServers, ttl: TTL_SECONDS });
});

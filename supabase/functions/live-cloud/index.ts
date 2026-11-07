import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * AlfiePRO Live: cloud production engine on Cloudflare RealtimeKit.
 *
 *  cameras (phones, iPads via a no-login link) ─┐
 *  control room (director) ─────────────────────┼─ RealtimeKit meeting
 *  program page (cloud recorder, our web page) ─┘      │
 *        └─ program out: recording of /live/program/<id> streamed by RTMP
 *           to a Cloudflare Stream live input → viewers in AlfieTV
 *        └─ race videos: one recording of the program page per race
 *
 * Actions (POST JSON { action, ... }):
 *   setup            admin   make sure the camera/director presets exist
 *   create           admin   meeting + Stream live input + camera link + session row
 *   director_token   admin   token to join as the control room
 *   camera_link      admin   the no-login camera link (the current one, or a new one with { renew: true })
 *   join_camera      public  camera link key → camera token
 *   program_state    public  what the program page shows (program camera, title, hold,
 *                            and the race data its overlays need: the recorder isn't signed in)
 *   set_program      admin   choose the program camera
 *   program_hold     admin   hold screen on / off ({ paused })
 *   program_start    admin   start program out (live to AlfieTV)
 *   program_stop     admin   stop program out ({ end: true } also ends the broadcast, stops a
 *                            race that's recording and closes the room so cameras stop)
 *   race_start       admin   start recording a race
 *   race_stop        admin   stop recording a race
 *   status           admin   recordings and live input status
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const CF = "https://api.cloudflare.com/client/v4";
const APP_ORIGIN = Deno.env.get("ALFIE_APP_ORIGIN") ?? "https://alfiepro.com.au";
const RTK_APP_ID = Deno.env.get("CF_REALTIME_APP_ID") ?? "";
const CF_TOKEN = Deno.env.get("CF_REALTIME_API_TOKEN") ?? "";

const CAMERA_PRESET = "alfie_camera";
const DIRECTOR_PRESET = "alfie_director";

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function svc(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}

let accountIdCache: string | null = null;
async function accountId(s: SupabaseClient): Promise<string> {
  if (accountIdCache) return accountIdCache;
  const { data } = await s
    .from("integrations")
    .select("credentials")
    .is("club_id", null).is("state_association_id", null).is("national_association_id", null)
    .eq("platform", "cloudflare_stream").eq("is_active", true)
    .maybeSingle();
  const id = (data?.credentials as { account_id?: string } | null)?.account_id;
  if (!id) throw new HttpError(500, "Cloudflare account is not configured");
  accountIdCache = id;
  return id;
}

async function cf(s: SupabaseClient, path: string, init: RequestInit = {}) {
  if (!CF_TOKEN || !RTK_APP_ID) throw new HttpError(500, "Cloud engine secrets are missing (CF_REALTIME_APP_ID / CF_REALTIME_API_TOKEN)");
  const acc = await accountId(s);
  const res = await fetch(`${CF}/accounts/${acc}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok || body?.success === false) {
    const msg = body?.errors?.[0]?.message || body?.error?.message || body?.message || `Cloudflare ${res.status}`;
    console.error("[live-cloud] Cloudflare error", path, res.status, text.slice(0, 500));
    throw new HttpError(502, `${msg} (${path.split("?")[0]})`);
  }
  return body;
}
const rtk = (s: SupabaseClient, path: string, init?: RequestInit) => cf(s, `/realtime/kit/${RTK_APP_ID}${path}`, init);

// ── Presets ──────────────────────────────────────────────────────────

function presetBody(name: string, role: "camera" | "director") {
  const camera = role === "camera";
  return {
    name,
    config: {
      max_screenshare_count: 0,
      max_video_streams: { desktop: camera ? 0 : 9, mobile: camera ? 0 : 4 },
      media: {
        screenshare: { frame_rate: 5, quality: "vga" },
        video: { frame_rate: 30, quality: camera ? "fhd" : "hd", simulcast: true },
        audio: { enable_high_bitrate: camera, enable_stereo: false },
      },
      view_type: "GROUP_CALL",
    },
    permissions: {
      accept_waiting_requests: false,
      can_accept_production_requests: false,
      can_change_participant_permissions: false,
      can_edit_display_name: camera,
      can_livestream: false,
      can_record: !camera,
      can_spotlight: false,
      chat: {
        private: { can_receive: false, can_send: false, files: false, text: false },
        public: { can_send: false, files: false, text: false },
      },
      connected_meetings: { can_alter_connected_meetings: false, can_switch_connected_meetings: false, can_switch_to_parent_meeting: false },
      disable_participant_audio: !camera,
      disable_participant_screensharing: !camera,
      disable_participant_video: !camera,
      hidden_participant: false,
      kick_participant: !camera,
      media: {
        audio: { can_produce: camera ? "ALLOWED" : "NOT_ALLOWED" },
        screenshare: { can_produce: "NOT_ALLOWED" },
        video: { can_produce: camera ? "ALLOWED" : "NOT_ALLOWED" },
      },
      pin_participant: !camera,
      plugins: { can_close: false, can_edit_config: false, can_start: false, config: {} },
      polls: { can_create: false, can_view: false, can_vote: false },
      recorder_type: "NONE",
      show_participant_list: !camera,
      waiting_room_type: "SKIP",
    },
    ui: {
      design_tokens: {
        border_radius: "rounded",
        border_width: "thin",
        colors: {
          background: { "600": "#2A3142", "700": "#1C2232", "800": "#121826", "900": "#0A0F1C", "1000": "#060B16" },
          brand: { "300": "#8CC4FF", "400": "#5AABFF", "500": "#2A93FF", "600": "#0A78F0", "700": "#075FC0" },
          danger: "#E11D38", success: "#30D158", warning: "#FFB224",
          text: "#F4F6FB", text_on_brand: "#FFFFFF", video_bg: "#000000",
        },
        spacing_base: 4,
        theme: "darkest",
      },
    },
  };
}

async function ensurePresets(s: SupabaseClient) {
  const list = await rtk(s, "/presets?page_no=1&per_page=100");
  const names = new Set<string>((list?.data ?? []).map((p: { name: string }) => p.name));
  const created: string[] = [];
  for (const [name, role] of [[CAMERA_PRESET, "camera"], [DIRECTOR_PRESET, "director"]] as const) {
    if (!names.has(name)) {
      await rtk(s, "/presets", { method: "POST", body: JSON.stringify(presetBody(name, role)) });
      created.push(name);
    }
  }
  return { existing: [...names], created };
}

// ── Auth ─────────────────────────────────────────────────────────────

async function requireClubAdmin(req: Request, s: SupabaseClient, clubId: string) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await s.auth.getUser(token);
  if (!user) throw new HttpError(401, "Sign in to manage broadcasts");
  const { data: profile } = await s.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (profile?.is_super_admin) return user;
  const { data: membership } = await s
    .from("user_clubs").select("role")
    .eq("club_id", clubId).eq("user_id", user.id)
    .in("role", ["admin", "editor"]).maybeSingle();
  if (!membership) throw new HttpError(403, "Only club admins can manage broadcasts");
  return user;
}

async function loadSession(s: SupabaseClient, sessionId: string) {
  if (!sessionId) throw new HttpError(400, "sessionId is required");
  const { data, error } = await s.from("livestream_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error || !data) throw new HttpError(404, "Broadcast not found");
  if (data.engine !== "cloud" || !data.rtk_meeting_id) throw new HttpError(400, "This broadcast doesn't use the cloud engine");
  return data;
}

function randomKey() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function issueCameraLink(s: SupabaseClient, sessionId: string, reuse = false) {
  if (reuse) {
    // Keep the link volunteers already have (a QR on the clubhouse wall keeps working)
    const { data: existing } = await s.from("livestream_camera_links").select("join_key, expires_at").eq("session_id", sessionId).maybeSingle();
    if (existing && new Date(existing.expires_at).getTime() - Date.now() > 2 * 3600 * 1000) {
      return { url: `${APP_ORIGIN}/live/camera/${sessionId}?k=${encodeURIComponent(existing.join_key)}`, expiresAt: existing.expires_at };
    }
  }
  const key = randomKey();
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { error } = await s.from("livestream_camera_links")
    .upsert({ session_id: sessionId, join_key: key, expires_at: expires }, { onConflict: "session_id" });
  if (error) throw new HttpError(500, "Could not save the camera link");
  return { url: `${APP_ORIGIN}/live/camera/${sessionId}?k=${encodeURIComponent(key)}`, expiresAt: expires };
}

/** The club's time zone for the program page's clock (the recorder runs in UTC) */
function tzParam(body: any): string {
  const tz = String(body?.timeZone ?? "");
  return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) ? `tz=${encodeURIComponent(tz)}` : "tz=Australia%2FSydney";
}

function rtmpsTarget(session: any): string {
  const url = session.cloudflare_rtmps_url as string | null;
  const key = session.cloudflare_rtmps_stream_key as string | null;
  if (!url || !key) throw new HttpError(400, "This broadcast has no Cloudflare live input");
  return url.endsWith("/") ? `${url}${key}` : `${url}/${key}`;
}

// ── Overlay data for the program page ───────────────────────────────
// Mirrors LivestreamOverlayRenderer's loader (quick race, series round by "<seriesId>-<index>"
// or by round id, public event, race status) with the service client, because the program
// page runs signed out inside Cloudflare's recorder.

const ROUND_COLS = "id, round_name, date, race_results, completed, updated_at, skippers, heat_management, num_races, series_id, current_day, round_index, last_completed_race";
const QUICK_COLS = "id, event_name, race_date, race_format, race_results, completed, updated_at, skippers, heat_management, num_races, current_day, public_event_id, last_completed_race";

function roundAsRace(r: any, index: number) {
  return {
    id: r.id, event_name: r.round_name, race_date: r.date, race_format: null, race_results: r.race_results,
    completed: r.completed, updated_at: r.updated_at, skippers: r.skippers, heat_management: r.heat_management,
    num_races: r.num_races, current_day: index, public_event_id: null, last_completed_race: r.last_completed_race,
  };
}

async function overlaySource(s: SupabaseClient, eventId: string | null) {
  if (!eventId) return null;
  const parts = eventId.split("-");
  let race: any = null;
  let statusId = eventId;
  if (parts.length > 5 && /^\d+$/.test(parts[parts.length - 1])) {
    const seriesId = parts.slice(0, -1).join("-");
    const index = Number(parts[parts.length - 1]);
    const { data } = await s.from("race_series_rounds").select(ROUND_COLS).eq("series_id", seriesId).eq("round_index", index).maybeSingle();
    if (data) { race = roundAsRace(data, index); statusId = seriesId; }
  } else {
    const { data } = await s.from("quick_races").select(QUICK_COLS).eq("id", eventId).maybeSingle();
    if (data) race = data;
    else {
      const { data: round } = await s.from("race_series_rounds").select(ROUND_COLS).eq("id", eventId).maybeSingle();
      if (round) { race = roundAsRace(round, round.round_index); statusId = round.series_id || eventId; }
    }
  }
  let event = null;
  if (race?.public_event_id) {
    const { data } = await s.from("public_events").select("id, event_name, date, end_date").eq("id", race.public_event_id).maybeSingle();
    event = data;
  }
  const { data: st } = await s.from("live_tracking_events")
    .select("race_status, last_status_update, status_notes, status_day").eq("event_id", statusId).maybeSingle();
  const status = st ? { status: st.race_status || "on_hold", lastUpdate: st.last_status_update, notes: st.status_notes, day: st.status_day } : null;
  return { race, event, status };
}

// ── Actions ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const s = svc();
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    switch (action) {
      case "setup": {
        await requireClubAdmin(req, s, String(body.clubId ?? ""));
        return json({ success: true, presets: await ensurePresets(s) });
      }

      case "create": {
        const clubId = String(body.clubId ?? "");
        const user = await requireClubAdmin(req, s, clubId);
        await ensurePresets(s);
        const title = String(body.title || "Live broadcast").slice(0, 140);

        const meeting = await rtk(s, "/meetings", { method: "POST", body: JSON.stringify({ title }) });
        const meetingId = meeting?.data?.id;
        if (!meetingId) throw new HttpError(502, "RealtimeKit did not return a meeting id");

        const input = await cf(s, "/stream/live_inputs", {
          method: "POST",
          body: JSON.stringify({
            meta: { name: `${title} (cloud)` },
            // Race videos come from RealtimeKit, so Stream needn't store the whole broadcast
            recording: { mode: "off" },
            defaultCreator: "alfie-live-cloud",
          }),
        });
        const li = input?.result;
        const playback = li?.webRTCPlayback?.url || li?.rtmpsPlayback?.url || "";
        const customer = (playback.match(/customer-([a-z0-9]+)\./) || [])[1] || null;

        const { data: session, error } = await s.from("livestream_sessions").insert({
          club_id: clubId,
          created_by: user.id,
          title,
          description: body.description ? String(body.description) : null,
          event_id: body.eventId ? String(body.eventId) : null,
          status: "draft",
          is_public: body.test ? false : true,
          enable_chat: false,
          enable_overlays: true,
          streaming_mode: "cloudflare_relay",
          stream_input_mode: "rtmp_external",
          engine: "cloud",
          broadcast_mode: body.mode === "races_only" ? "races_only" : "live",
          rtk_meeting_id: meetingId,
          cloudflare_live_input_id: li?.uid ?? null,
          cloudflare_rtmps_url: li?.rtmps?.url ?? null,
          cloudflare_rtmps_stream_key: li?.rtmps?.streamKey ?? null,
          cloudflare_whip_playback_url: li?.webRTCPlayback?.url ?? null,
          cloudflare_customer_code: customer,
          auto_segment_enabled: true,
        }).select("*").single();
        if (error || !session) {
          console.error("[live-cloud] insert session", error);
          throw new HttpError(500, "Could not save the broadcast");
        }
        const cameraLink = await issueCameraLink(s, session.id);
        return json({ success: true, session, cameraLink });
      }

      case "director_token": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        const user = await requireClubAdmin(req, s, session.club_id);
        const p = await rtk(s, `/meetings/${session.rtk_meeting_id}/participants`, {
          method: "POST",
          body: JSON.stringify({ name: "Control room", preset_name: DIRECTOR_PRESET, custom_participant_id: `director-${user.id}-${Date.now()}` }),
        });
        return json({ success: true, token: p?.data?.token });
      }

      case "camera_link": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        return json({ success: true, cameraLink: await issueCameraLink(s, session.id, body.renew !== true) });
      }

      case "join_camera": {
        const sessionId = String(body.sessionId ?? "");
        const key = String(body.key ?? "");
        const { data: link } = await s.from("livestream_camera_links").select("join_key, expires_at").eq("session_id", sessionId).maybeSingle();
        if (!link || !key || link.join_key !== key) throw new HttpError(403, "This camera link isn't valid. Ask the race officer for a new one.");
        if (new Date(link.expires_at).getTime() < Date.now()) throw new HttpError(403, "This camera link has expired. Ask the race officer for a new one.");
        const session = await loadSession(s, sessionId);
        if (session.status === "ended") throw new HttpError(403, "This broadcast has ended.");
        const name = String(body.name || "Camera").slice(0, 40);
        const p = await rtk(s, `/meetings/${session.rtk_meeting_id}/participants`, {
          method: "POST",
          body: JSON.stringify({ name, preset_name: CAMERA_PRESET, custom_participant_id: `camera-${crypto.randomUUID()}` }),
        });
        return json({ success: true, token: p?.data?.token, title: session.title });
      }

      case "program_state": {
        // Read by the program page inside Cloudflare's recorder: nothing secret here
        // (no stream keys); the race data is what viewers see on the overlays anyway.
        const session = await loadSession(s, String(body.sessionId ?? ""));
        const wantOverlay = body.overlay === true && session.enable_overlays !== false;
        return json({
          success: true,
          title: session.title,
          status: session.status,
          isPaused: !!session.is_paused,
          programParticipantId: session.program_participant_id,
          eventId: session.event_id,
          enableOverlays: session.enable_overlays !== false,
          session: {
            id: session.id, club_id: session.club_id, title: session.title, event_id: session.event_id,
            heat_number: session.heat_number, status: session.status, is_paused: !!session.is_paused,
            is_public: session.is_public, enable_overlays: session.enable_overlays !== false,
            overlay_config: session.overlay_config, broadcast_mode: session.broadcast_mode,
          },
          overlay: wantOverlay ? await overlaySource(s, session.event_id).catch((e) => { console.warn("[live-cloud] overlay", e?.message); return null; }) : null,
        });
      }

      case "program_hold": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        await s.from("livestream_sessions").update({ is_paused: !!body.paused }).eq("id", session.id);
        return json({ success: true, paused: !!body.paused });
      }

      case "set_program": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        await s.from("livestream_sessions").update({ program_participant_id: body.participantId ? String(body.participantId) : null }).eq("id", session.id);
        return json({ success: true });
      }

      case "program_start": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        const rec = await rtk(s, "/recordings", {
          method: "POST",
          body: JSON.stringify({
            meeting_id: session.rtk_meeting_id,
            url: `${APP_ORIGIN}/live/program/${session.id}?${tzParam(body)}`,
            allow_multiple_recordings: true,
            file_name_prefix: `program-${session.id}`,
            max_seconds: 12 * 3600,
            video_config: { codec: "H264", width: 1920, height: 1080 },
            audio_config: { codec: "AAC", channel: "stereo" },
            realtimekit_bucket_config: { enabled: false },
            rtmp_out_config: { rtmp_url: rtmpsTarget(session) },
          }),
        });
        const id = rec?.data?.id;
        await s.from("livestream_sessions").update({
          program_recording_id: id ?? null,
          status: session.broadcast_mode === "races_only" ? session.status : "live",
          actual_start_time: session.actual_start_time ?? new Date().toISOString(),
        }).eq("id", session.id);
        return json({ success: true, recording: rec?.data });
      }

      case "program_stop": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        if (session.program_recording_id) {
          await rtk(s, `/recordings/${session.program_recording_id}`, { method: "PUT", body: JSON.stringify({ action: "stop" }) }).catch((e) => console.warn("[live-cloud] stop program", e.message));
        }
        if (body.end) {
          // A race still recording ends with the broadcast (its video still goes to YouTube)
          const { data: open } = await s.from("livestream_race_segments").select("id, rtk_recording_id")
            .eq("session_id", session.id).not("rtk_recording_id", "is", null).is("segment_end_time", null);
          for (const seg of open ?? []) {
            await rtk(s, `/recordings/${seg.rtk_recording_id}`, { method: "PUT", body: JSON.stringify({ action: "stop" }) })
              .catch((e) => console.warn("[live-cloud] stop race", e.message));
            await s.from("livestream_race_segments").update({ segment_end_time: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", seg.id);
          }
        }
        await s.from("livestream_sessions").update({
          program_recording_id: null,
          ...(body.end ? { status: "ended", end_time: new Date().toISOString(), is_paused: false } : {}),
        }).eq("id", session.id);
        if (body.end) {
          await s.from("livestream_camera_links").delete().eq("session_id", session.id);
          // Close the room: cameras get roomLeft "ended" and stop sending
          await rtk(s, `/meetings/${session.rtk_meeting_id}/active-session/kick-all`, { method: "POST" })
            .catch((e) => console.warn("[live-cloud] kick-all", e.message));
        }
        return json({ success: true });
      }

      case "race_start": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        const raceNumber = Math.max(1, Number(body.raceNumber) || 1);
        const { data: already } = await s.from("livestream_race_segments").select("id, race_number")
          .eq("session_id", session.id).not("rtk_recording_id", "is", null).is("segment_end_time", null).limit(1).maybeSingle();
        if (already) return json({ success: true, alreadyRecording: true, segment: already });
        const rec = await rtk(s, "/recordings", {
          method: "POST",
          body: JSON.stringify({
            meeting_id: session.rtk_meeting_id,
            url: `${APP_ORIGIN}/live/program/${session.id}?race=${raceNumber}&${tzParam(body)}`,
            allow_multiple_recordings: true,
            file_name_prefix: `race-${raceNumber}-${session.id}`,
            max_seconds: 3 * 3600,
            video_config: { codec: "H264", width: 1920, height: 1080 },
            audio_config: { codec: "AAC", channel: "stereo" },
            realtimekit_bucket_config: { enabled: true },
          }),
        });
        const heatNumber = Number(body.heatNumber) || session.heat_number || null;
        const title = heatNumber ? `Heat ${heatNumber} - Race ${raceNumber} | ${session.title}` : `Race ${raceNumber} | ${session.title}`;
        const { data: segment } = await s.from("livestream_race_segments").insert({
          session_id: session.id,
          club_id: session.club_id,
          event_id: session.event_id,
          race_number: raceNumber,
          heat_number: heatNumber,
          segment_title: title,
          segment_start_time: new Date().toISOString(),
          upload_status: "pending",
          trigger_type: body.trigger === "race_scored" ? "race_scored" : "manual",
          rtk_recording_id: rec?.data?.id ?? null,
        }).select("*").single();
        return json({ success: true, recording: rec?.data, segment });
      }

      case "race_stop": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        const { data: seg } = await s.from("livestream_race_segments").select("*")
          .eq("session_id", session.id).not("rtk_recording_id", "is", null).is("segment_end_time", null)
          .order("segment_start_time", { ascending: false }).limit(1).maybeSingle();
        if (!seg) return json({ success: true, message: "No race is recording" });
        await rtk(s, `/recordings/${seg.rtk_recording_id}`, { method: "PUT", body: JSON.stringify({ action: "stop" }) });
        await s.from("livestream_race_segments").update({ segment_end_time: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", seg.id);
        return json({ success: true, segmentId: seg.id });
      }

      case "status": {
        const session = await loadSession(s, String(body.sessionId ?? ""));
        await requireClubAdmin(req, s, session.club_id);
        const recs = await rtk(s, `/recordings?meeting_id=${session.rtk_meeting_id}&page_no=1&per_page=50`).catch((e) => ({ error: e.message }));
        const input = session.cloudflare_live_input_id
          ? await cf(s, `/stream/live_inputs/${session.cloudflare_live_input_id}`).catch((e) => ({ error: e.message }))
          : null;
        return json({
          success: true,
          recordings: (recs as any)?.data ?? [],
          recordingsError: (recs as any)?.error,
          liveInput: (input as any)?.result ? { status: (input as any).result.status, uid: (input as any).result.uid } : (input as any),
          hls: session.cloudflare_customer_code && session.cloudflare_live_input_id
            ? `https://customer-${session.cloudflare_customer_code}.cloudflarestream.com/${session.cloudflare_live_input_id}/manifest/video.m3u8`
            : null,
          iframe: session.cloudflare_customer_code && session.cloudflare_live_input_id
            ? `https://customer-${session.cloudflare_customer_code}.cloudflarestream.com/${session.cloudflare_live_input_id}/iframe`
            : null,
        });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error";
    if (status >= 500) console.error("[live-cloud]", message);
    return json({ error: message }, status);
  }
});

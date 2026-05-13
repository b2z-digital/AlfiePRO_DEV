import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Api-Key",
};

interface PositionPayload {
  tag_id: string;
  x: number;
  y: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}

interface BatchPayload {
  session_id: string;
  positions: PositionPayload[];
}

interface EventPayload {
  session_id: string;
  tag_id: string;
  event_type: string;
  anchor_id?: string;
  x: number;
  y: number;
  timestamp: string;
  lap_number?: number;
  metadata?: Record<string, unknown>;
}

interface AnchorHeartbeat {
  config_id: string;
  anchor_id: string;
  battery_level?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const apiKey = req.headers.get("X-Api-Key");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing X-Api-Key header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: config } = await supabase
      .from("uwb_tracking_configs")
      .select("id, club_id, is_active")
      .eq("coordinator_api_key", apiKey)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ error: "Invalid API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.is_active) {
      return new Response(
        JSON.stringify({ error: "UWB system is not active" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    if (req.method === "POST" && path === "positions") {
      const body: BatchPayload = await req.json();

      if (!body.session_id || !body.positions?.length) {
        return new Response(
          JSON.stringify({ error: "session_id and positions array required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rows = body.positions.map((p) => ({
        session_id: body.session_id,
        tag_id: p.tag_id,
        position_x: p.x,
        position_y: p.y,
        speed_mps: p.speed ?? null,
        heading_deg: p.heading ?? null,
        recorded_at: p.timestamp,
      }));

      const { error } = await supabase.from("uwb_position_data").insert(rows);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ inserted: rows.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "events") {
      const body: EventPayload = await req.json();

      const { error } = await supabase.from("uwb_race_events").insert({
        session_id: body.session_id,
        tag_id: body.tag_id,
        event_type: body.event_type,
        anchor_id: body.anchor_id ?? null,
        position_x: body.x,
        position_y: body.y,
        timestamp: body.timestamp,
        lap_number: body.lap_number ?? 1,
        metadata: body.metadata ?? {},
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "heartbeat") {
      const body: AnchorHeartbeat = await req.json();

      const { error } = await supabase
        .from("uwb_anchors")
        .update({
          battery_level: body.battery_level,
          last_seen_at: new Date().toISOString(),
        })
        .eq("config_id", config.id)
        .eq("anchor_id", body.anchor_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && path === "session-status") {
      const body = await req.json();

      const { error } = await supabase
        .from("uwb_race_sessions")
        .update({
          status: body.status,
          is_live: body.is_live ?? undefined,
          started_at: body.started_at ?? undefined,
          finished_at: body.finished_at ?? undefined,
        })
        .eq("id", body.session_id)
        .eq("config_id", config.id);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown endpoint. Use: positions, events, heartbeat, session-status" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

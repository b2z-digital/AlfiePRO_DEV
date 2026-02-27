import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SessionPayload {
  action: "start_session" | "heartbeat" | "page_view";
  session_id?: string;
  club_id?: string;
  association_id?: string;
  association_type?: string;
  page_path?: string;
  page_section?: string;
  user_agent?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: SessionPayload = await req.json();
    const forwarded = req.headers.get("x-forwarded-for") || "";
    const ipHash = forwarded
      ? btoa(forwarded.split(",")[0].trim()).slice(0, 16)
      : null;

    if (payload.action === "start_session") {
      const { data: session, error: sessErr } = await supabase
        .from("platform_sessions")
        .insert({
          user_id: user.id,
          club_id: payload.club_id || null,
          association_id: payload.association_id || null,
          association_type: payload.association_type || null,
          user_agent: payload.user_agent || null,
          ip_hash: ipHash,
        })
        .select("id")
        .single();

      if (sessErr) {
        return new Response(JSON.stringify({ error: sessErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ session_id: session.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "heartbeat" && payload.session_id) {
      await supabase
        .from("platform_sessions")
        .update({
          last_active_at: new Date().toISOString(),
          club_id: payload.club_id || undefined,
          association_id: payload.association_id || undefined,
          association_type: payload.association_type || undefined,
        })
        .eq("id", payload.session_id)
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "page_view") {
      await supabase.from("platform_page_views").insert({
        session_id: payload.session_id || null,
        user_id: user.id,
        club_id: payload.club_id || null,
        association_id: payload.association_id || null,
        page_path: payload.page_path || "/",
        page_section: payload.page_section || "other",
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

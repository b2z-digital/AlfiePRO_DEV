import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const { data: roleCheck } = await supabase
      .from("user_clubs")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "snapshot";

    if (action === "snapshot") {
      const dbStats = await gatherDatabaseStats(supabase);
      const storageStats = await gatherStorageStats(supabase);
      const usageStats = await gatherUsageStats(supabase);

      const today = new Date().toISOString().split("T")[0];

      const snapshots = [
        ...dbStats.map((s: any) => ({ ...s, snapshot_date: today, source: "supabase" })),
        ...storageStats.map((s: any) => ({ ...s, snapshot_date: today, source: "supabase" })),
        ...usageStats.map((s: any) => ({ ...s, snapshot_date: today, source: "platform" })),
      ];

      for (const snap of snapshots) {
        await supabase.from("platform_resource_snapshots").insert(snap);
      }

      return new Response(JSON.stringify({ snapshots, count: snapshots.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_db_size") {
      const dbStats = await gatherDatabaseStats(supabase);
      const storageStats = await gatherStorageStats(supabase);
      const usageStats = await gatherUsageStats(supabase);

      return new Response(
        JSON.stringify({
          database: dbStats,
          storage: storageStats,
          usage: usageStats,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_table_sizes") {
      const { data: tableSizes } = await supabase.rpc("get_public_table_stats");

      const { data: clubs } = await supabase
        .from("clubs")
        .select("id, name, abbreviation");
      const { data: stateAssocs } = await supabase
        .from("state_associations")
        .select("id, name, abbreviation");
      const { data: nationalAssocs } = await supabase
        .from("national_associations")
        .select("id, name, abbreviation");

      const clubMemberCounts: Record<string, number> = {};
      const { data: membersByClub } = await supabase
        .from("members")
        .select("club_id");
      (membersByClub || []).forEach((m: any) => {
        clubMemberCounts[m.club_id] = (clubMemberCounts[m.club_id] || 0) + 1;
      });

      const clubStorageEstimates = (clubs || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        abbreviation: c.abbreviation,
        type: "club",
        members: clubMemberCounts[c.id] || 0,
        estimated_db_mb: ((clubMemberCounts[c.id] || 0) * 0.05).toFixed(2),
      }));

      return new Response(
        JSON.stringify({
          tables: tableSizes || [],
          clubs: clubStorageEstimates,
          associations: {
            state: stateAssocs || [],
            national: nationalAssocs || [],
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save_cost_entry") {
      const { metric_name, metric_value, unit, cost_usd, source, metadata, snapshot_date } = body;
      const { error } = await supabase.from("platform_resource_snapshots").insert({
        snapshot_date: snapshot_date || new Date().toISOString().split("T")[0],
        source: source || "manual",
        metric_name,
        metric_value: metric_value || 0,
        unit: unit || "",
        cost_usd: cost_usd || null,
        metadata: metadata || null,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

async function gatherDatabaseStats(supabase: any) {
  const metrics: any[] = [];

  try {
    const { data: tableStats } = await supabase.rpc("get_public_table_stats");
    if (tableStats && Array.isArray(tableStats)) {
      let totalRows = 0;
      let totalSizeMb = 0;
      for (const t of tableStats) {
        totalRows += parseInt(t.row_count || "0", 10);
        const sizeStr = t.total_size || "0 bytes";
        const mbMatch = sizeStr.match(/([\d.]+)\s*(MB|GB|kB)/i);
        if (mbMatch) {
          const val = parseFloat(mbMatch[1]);
          if (mbMatch[2].toUpperCase() === "GB") totalSizeMb += val * 1024;
          else if (mbMatch[2].toUpperCase() === "MB") totalSizeMb += val;
          else if (mbMatch[2].toUpperCase() === "KB") totalSizeMb += val / 1024;
        }
      }
      metrics.push({ metric_name: "db_total_rows", metric_value: totalRows, unit: "rows" });
      metrics.push({ metric_name: "db_total_size_mb", metric_value: Math.round(totalSizeMb * 100) / 100, unit: "MB" });
      metrics.push({ metric_name: "db_table_count", metric_value: tableStats.length, unit: "tables" });
    }
  } catch (e) {
    console.error("Error gathering DB stats:", e);
  }

  return metrics;
}

async function gatherStorageStats(supabase: any) {
  const metrics: any[] = [];
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (buckets) {
      metrics.push({ metric_name: "storage_bucket_count", metric_value: buckets.length, unit: "buckets" });
    }
  } catch (e) {
    console.error("Error gathering storage stats:", e);
  }
  return metrics;
}

async function gatherUsageStats(supabase: any) {
  const metrics: any[] = [];
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { count: sessionsThisMonth } = await supabase
      .from("platform_sessions")
      .select("id", { count: "exact", head: true })
      .gte("started_at", monthStart);

    const { count: pageViewsThisMonth } = await supabase
      .from("platform_page_views")
      .select("id", { count: "exact", head: true })
      .gte("viewed_at", monthStart);

    metrics.push({ metric_name: "sessions_this_month", metric_value: sessionsThisMonth || 0, unit: "sessions" });
    metrics.push({ metric_name: "page_views_this_month", metric_value: pageViewsThisMonth || 0, unit: "views" });
  } catch (e) {
    console.error("Error gathering usage stats:", e);
  }
  return metrics;
}

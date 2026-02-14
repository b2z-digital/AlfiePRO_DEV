import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleCheck } = await adminClient
      .from("user_clubs")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden - super admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "create";

    if (action === "stats") {
      const { data: stats } = await adminClient.rpc("get_public_table_stats");
      return new Response(JSON.stringify({ stats: stats || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { data: tables } = await adminClient.rpc("get_public_table_stats");
      if (!tables || tables.length === 0) {
        return new Response(JSON.stringify({ error: "No tables found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const skipTables = ["trigger_debug_log", "cron_execution_log"];
      const exportTables = tables.filter(
        (t: any) => !skipTables.includes(t.table_name)
      );

      const backupData: Record<string, any> = {
        _meta: {
          created_at: new Date().toISOString(),
          created_by: user.id,
          tables_count: exportTables.length,
          version: "1.0",
        },
      };

      const tableDetails: any[] = [];
      let totalRows = 0;

      for (const table of exportTables) {
        const { data: rows, error: fetchErr } = await adminClient
          .from(table.table_name)
          .select("*")
          .limit(50000);

        const rowCount = rows?.length || 0;
        totalRows += rowCount;

        backupData[table.table_name] = rows || [];
        tableDetails.push({
          name: table.table_name,
          rows: rowCount,
          size_bytes: table.size_bytes,
        });
      }

      const jsonStr = JSON.stringify(backupData);
      const sizeBytes = new TextEncoder().encode(jsonStr).length;

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const storagePath = `backup-${timestamp}.json`;

      const { error: uploadError } = await adminClient.storage
        .from("backups")
        .upload(storagePath, jsonStr, {
          contentType: "application/json",
          upsert: false,
        });

      if (uploadError) {
        return new Response(
          JSON.stringify({ error: "Failed to store backup", details: uploadError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: backupRecord, error: insertError } = await adminClient
        .from("platform_backups")
        .insert({
          backup_type: "manual",
          status: "completed",
          tables_count: exportTables.length,
          rows_count: totalRows,
          size_bytes: sizeBytes,
          storage_location: "supabase-storage",
          storage_path: storagePath,
          table_details: tableDetails,
          notes: `Full database export - ${exportTables.length} tables, ${totalRows.toLocaleString()} rows`,
          triggered_by: user.id,
          completed_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (insertError) {
        return new Response(
          JSON.stringify({ error: "Failed to record backup", details: insertError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ backup: backupRecord, tableDetails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "download") {
      const path = url.searchParams.get("path");
      if (!path) {
        return new Response(JSON.stringify({ error: "Missing path parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: signedUrl, error: signError } = await adminClient.storage
        .from("backups")
        .createSignedUrl(path, 300);

      if (signError || !signedUrl) {
        return new Response(
          JSON.stringify({ error: "Failed to create download URL" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ url: signedUrl.signedUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const body = await req.json();
      const { backupId, storagePath } = body;

      if (storagePath) {
        await adminClient.storage.from("backups").remove([storagePath]);
      }

      if (backupId) {
        await adminClient.from("platform_backups").delete().eq("id", backupId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

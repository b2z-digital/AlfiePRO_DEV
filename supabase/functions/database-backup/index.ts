import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifySuperAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const isSuperAdmin = user.user_metadata?.is_super_admin === true;

  if (!isSuperAdmin) {
    const { data: platformAdmin } = await adminClient
      .from("platform_super_admins")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!platformAdmin) return null;
  }

  return { user, adminClient };
}

async function exportSchemaMetadata(adminClient: ReturnType<typeof createClient>) {
  const [schemas, policies, functions, triggers, indexes, enums, foreignKeys] = await Promise.all([
    adminClient.rpc("export_table_schemas"),
    adminClient.rpc("export_rls_policies"),
    adminClient.rpc("export_database_functions"),
    adminClient.rpc("export_triggers"),
    adminClient.rpc("export_indexes"),
    adminClient.rpc("export_enums"),
    adminClient.rpc("export_foreign_keys"),
  ]);

  return {
    table_schemas: schemas.data || [],
    rls_policies: policies.data || [],
    functions: functions.data || [],
    triggers: triggers.data || [],
    indexes: indexes.data || [],
    enums: enums.data || [],
    foreign_keys: foreignKeys.data || [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const result = await verifySuperAdmin(req);
    if (!result) {
      return jsonResponse({ error: "Forbidden - super admin only" }, 403);
    }

    const { user, adminClient } = result;
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "create";

    if (action === "stats") {
      const { data: stats } = await adminClient.rpc("get_public_table_stats");
      return jsonResponse({ stats: stats || [] });
    }

    if (action === "schema") {
      const schema = await exportSchemaMetadata(adminClient);
      return jsonResponse({ schema });
    }

    if (action === "create") {
      const { data: tables, error: rpcError } = await adminClient.rpc("get_public_table_stats");
      if (rpcError) {
        return jsonResponse({ error: "Failed to query tables", details: rpcError.message }, 500);
      }
      if (!tables || tables.length === 0) {
        return jsonResponse({ error: "No tables found" }, 400);
      }

      const skipTables = ["trigger_debug_log", "cron_execution_log"];
      const exportTables = tables.filter(
        (t: any) => !skipTables.includes(t.table_name)
      );

      const schemaMetadata = await exportSchemaMetadata(adminClient);

      const backupData: Record<string, any> = {
        _meta: {
          created_at: new Date().toISOString(),
          created_by: user.id,
          backup_version: "2.0",
          backup_type: "full",
          tables_count: exportTables.length,
          includes_schema: true,
          includes_rls_policies: true,
          includes_functions: true,
          includes_triggers: true,
          includes_indexes: true,
          includes_enums: true,
          includes_foreign_keys: true,
        },
        _schema: schemaMetadata,
      };

      const tableDetails: any[] = [];
      let totalRows = 0;

      for (const table of exportTables) {
        const { data: rows } = await adminClient
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
        return jsonResponse({ error: "Failed to store backup", details: uploadError.message }, 500);
      }

      const schemaStats = {
        rls_policies: schemaMetadata.rls_policies.length,
        functions: schemaMetadata.functions.length,
        triggers: schemaMetadata.triggers.length,
        indexes: schemaMetadata.indexes.length,
        enums: schemaMetadata.enums.length,
        foreign_keys: schemaMetadata.foreign_keys.length,
      };

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
          notes: `Full backup - ${exportTables.length} tables, ${totalRows.toLocaleString()} rows, ${schemaStats.rls_policies} RLS policies, ${schemaStats.functions} functions, ${schemaStats.triggers} triggers`,
          triggered_by: user.id,
          completed_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (insertError) {
        return jsonResponse({ error: "Failed to record backup", details: insertError.message }, 500);
      }

      return jsonResponse({ backup: backupRecord, tableDetails, schemaStats });
    }

    if (action === "download") {
      const path = url.searchParams.get("path");
      if (!path) {
        return jsonResponse({ error: "Missing path parameter" }, 400);
      }

      const { data: signedUrl, error: signError } = await adminClient.storage
        .from("backups")
        .createSignedUrl(path, 300);

      if (signError || !signedUrl) {
        return jsonResponse({ error: "Failed to create download URL" }, 500);
      }

      return jsonResponse({ url: signedUrl.signedUrl });
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

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (err) {
    return jsonResponse({ error: "Internal server error", details: String(err) }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AWS_REGION = "ap-southeast-2";
const AWS_CE_REGION = "us-east-1";
const AMPLIFY_APP_ID = "d13roi0uyfa9j";

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

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: authError?.message || "Invalid token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isSuperAdminFromMetadata =
      user.user_metadata?.is_super_admin === true;

    const { data: roleCheck } = await supabase
      .from("user_clubs")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!isSuperAdminFromMetadata && !roleCheck) {
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
        ...dbStats.map((s: any) => ({
          ...s,
          snapshot_date: today,
          source: "supabase",
        })),
        ...storageStats.map((s: any) => ({
          ...s,
          snapshot_date: today,
          source: "supabase",
        })),
        ...usageStats.map((s: any) => ({
          ...s,
          snapshot_date: today,
          source: "platform",
        })),
      ];

      for (const snap of snapshots) {
        await supabase.from("platform_resource_snapshots").insert(snap);
      }

      return new Response(
        JSON.stringify({ snapshots, count: snapshots.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_db_size") {
      const dbStats = await gatherDatabaseStats(supabase);
      const storageStats = await gatherStorageStats(supabase);
      const usageStats = await gatherUsageStats(supabase);

      return new Response(
        JSON.stringify({ database: dbStats, storage: storageStats, usage: usageStats }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_storage_details") {
      const storageDetails = await gatherDetailedStorageStats(supabase);
      return new Response(JSON.stringify(storageDetails), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_aws_costs") {
      const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
      const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");

      if (!awsAccessKeyId || !awsSecretAccessKey) {
        return new Response(
          JSON.stringify({
            error: "AWS credentials not configured",
            costs: [],
            amplify: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const months = body.months || 6;
      const [costs, amplifyInfo] = await Promise.allSettled([
        fetchAwsCostExplorer(awsAccessKeyId, awsSecretAccessKey, months),
        fetchAmplifyAppInfo(awsAccessKeyId, awsSecretAccessKey),
      ]);

      return new Response(
        JSON.stringify({
          costs: costs.status === "fulfilled" ? costs.value : { error: (costs as PromiseRejectedResult).reason?.message },
          amplify: amplifyInfo.status === "fulfilled" ? amplifyInfo.value : { error: (amplifyInfo as PromiseRejectedResult).reason?.message },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_table_sizes") {
      const { data: tableSizes } = await supabase.rpc("get_public_table_stats");
      const { data: clubs } = await supabase.from("clubs").select("id, name, abbreviation");
      const { data: membersByClub } = await supabase.from("members").select("club_id");

      const clubMemberCounts: Record<string, number> = {};
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
        JSON.stringify({ tables: tableSizes || [], clubs: clubStorageEstimates }),
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
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
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
        const mbMatch = sizeStr.match(/([\d.]+)\s*(MB|GB|kB|bytes)/i);
        if (mbMatch) {
          const val = parseFloat(mbMatch[1]);
          const u = mbMatch[2].toLowerCase();
          if (u === "gb") totalSizeMb += val * 1024;
          else if (u === "mb") totalSizeMb += val;
          else if (u === "kb") totalSizeMb += val / 1024;
          else totalSizeMb += val / (1024 * 1024);
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

    const { data: objects } = await supabase
      .from("objects")
      .select("metadata")
      .schema("storage");

    if (!objects) {
      const { count } = await supabase.rpc("get_storage_stats");
      if (count) {
        metrics.push({ metric_name: "storage_total_files", metric_value: count.total_files || 0, unit: "files" });
        metrics.push({ metric_name: "storage_total_bytes", metric_value: count.total_bytes || 0, unit: "bytes" });
      }
    }
  } catch (e) {
    console.error("Error gathering storage stats:", e);
  }
  return metrics;
}

async function gatherDetailedStorageStats(supabase: any) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketDetails = [];

    for (const bucket of buckets || []) {
      const { data: files } = await supabase.storage.from(bucket.name).list("", { limit: 1000 });
      let totalSize = 0;
      let fileCount = 0;

      if (files) {
        for (const file of files) {
          if (file.metadata?.size) {
            totalSize += file.metadata.size;
            fileCount++;
          }
        }
      }

      bucketDetails.push({
        id: bucket.id,
        name: bucket.name,
        public: bucket.public,
        created_at: bucket.created_at,
        file_count: fileCount,
        total_bytes: totalSize,
        total_mb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
      });
    }

    const totalFiles = bucketDetails.reduce((s, b) => s + b.file_count, 0);
    const totalBytes = bucketDetails.reduce((s, b) => s + b.total_bytes, 0);

    return {
      bucket_count: bucketDetails.length,
      total_files: totalFiles,
      total_bytes: totalBytes,
      total_mb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
      buckets: bucketDetails,
    };
  } catch (e) {
    console.error("Error gathering detailed storage stats:", e);
    return { bucket_count: 0, total_files: 0, total_bytes: 0, total_mb: 0, buckets: [] };
  }
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

// --- AWS Cost Explorer Integration ---

async function fetchAwsCostExplorer(
  accessKeyId: string,
  secretAccessKey: string,
  months: number
) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const start = new Date(now.getFullYear(), now.getMonth() - months, 1);

  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  const payload = {
    TimePeriod: { Start: startStr, End: endStr },
    Granularity: "MONTHLY",
    Metrics: ["BlendedCost", "UnblendedCost", "UsageQuantity"],
    GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
  };

  const host = `ce.${AWS_CE_REGION}.amazonaws.com`;
  const result = await awsApiRequest({
    method: "POST",
    host,
    region: AWS_CE_REGION,
    service: "ce",
    path: "/",
    body: JSON.stringify(payload),
    accessKeyId,
    secretAccessKey,
    extraHeaders: {
      "X-Amz-Target": "AWSInsightsIndexService.GetCostAndUsage",
      "Content-Type": "application/x-amz-json-1.1",
    },
  });

  const monthly: any[] = [];
  let totalCost = 0;
  const serviceBreakdown: Record<string, number> = {};

  for (const period of result.ResultsByTime || []) {
    const periodStart = period.TimePeriod?.Start || "";
    let periodTotal = 0;

    for (const group of period.Groups || []) {
      const serviceName = group.Keys?.[0] || "Unknown";
      const cost = parseFloat(group.Metrics?.BlendedCost?.Amount || "0");
      periodTotal += cost;
      serviceBreakdown[serviceName] = (serviceBreakdown[serviceName] || 0) + cost;
    }

    monthly.push({
      month: periodStart.slice(0, 7),
      total: Math.round(periodTotal * 100) / 100,
    });
    totalCost += periodTotal;
  }

  const topServices = Object.entries(serviceBreakdown)
    .map(([name, cost]) => ({ name, cost: Math.round(cost * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return {
    monthly,
    total: Math.round(totalCost * 100) / 100,
    topServices,
    period: { start: startStr, end: endStr },
  };
}

async function fetchAmplifyAppInfo(
  accessKeyId: string,
  secretAccessKey: string
) {
  const host = `amplify.${AWS_REGION}.amazonaws.com`;

  const appResult = await awsApiRequest({
    method: "GET",
    host,
    region: AWS_REGION,
    service: "amplify",
    path: `/apps/${AMPLIFY_APP_ID}`,
    accessKeyId,
    secretAccessKey,
    extraHeaders: { "Content-Type": "application/json" },
  });

  let branches: any[] = [];
  try {
    const branchResult = await awsApiRequest({
      method: "GET",
      host,
      region: AWS_REGION,
      service: "amplify",
      path: `/apps/${AMPLIFY_APP_ID}/branches`,
      accessKeyId,
      secretAccessKey,
      extraHeaders: { "Content-Type": "application/json" },
    });
    branches = (branchResult.branches || []).map((b: any) => ({
      branchName: b.branchName,
      stage: b.stage,
      lastDeployTime: b.updateTime,
      status: b.activeJobId ? "building" : "active",
    }));
  } catch (_e) {
    console.error("Error fetching branches:", _e);
  }

  const app = appResult.app || {};
  return {
    name: app.name,
    appId: app.appId,
    platform: app.platform,
    repository: app.repository,
    defaultDomain: app.defaultDomain,
    createTime: app.createTime,
    updateTime: app.updateTime,
    productionBranch: app.productionBranch?.branchName,
    branches,
  };
}

// --- AWS SigV4 Request Helper ---

async function awsApiRequest(params: {
  method: string;
  host: string;
  region: string;
  service: string;
  path: string;
  body?: string;
  accessKeyId: string;
  secretAccessKey: string;
  extraHeaders?: Record<string, string>;
}) {
  const {
    method,
    host,
    region,
    service,
    path,
    body,
    accessKeyId,
    secretAccessKey,
    extraHeaders,
  } = params;

  const endpoint = `https://${host}${path}`;
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = timestamp.substring(0, 8);

  const bodyString = body || "";
  const headers: Record<string, string> = {
    Host: host,
    "X-Amz-Date": timestamp,
    ...(extraHeaders || {}),
  };

  const sortedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!]}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const hashedPayload = await sha256(bodyString);

  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(secretAccessKey, date, region, service);
  const signature = hmac(signingKey, stringToSign);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method,
    headers: { ...headers, Authorization: authorizationHeader },
    body: method !== "GET" ? bodyString : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AWS ${service} API Error [${response.status}]:`, errorText);
    throw new Error(`AWS ${service} error: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  return await response.json();
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hmac(key: Uint8Array, message: string): string {
  const h = createHmac("sha256", key);
  h.update(message);
  return h.digest("hex");
}

function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Uint8Array {
  const kDate = hmacBuffer(`AWS4${key}`, dateStamp);
  const kRegion = hmacBuffer(kDate, regionName);
  const kService = hmacBuffer(kRegion, serviceName);
  return hmacBuffer(kService, "aws4_request");
}

function hmacBuffer(key: string | Uint8Array, message: string): Uint8Array {
  const h = createHmac("sha256", key);
  h.update(message);
  return new Uint8Array(h.digest());
}

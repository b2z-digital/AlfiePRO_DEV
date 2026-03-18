import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CloudflareCredentials {
  account_id: string;
  api_token: string;
}

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, clubId, sessionData } = await req.json();

    const { data: integration } = await supabaseClient
      .from("integrations")
      .select("credentials")
      .eq("club_id", clubId)
      .eq("platform", "cloudflare_stream")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration?.credentials) {
      return new Response(
        JSON.stringify({
          error: "Cloudflare Stream not configured",
          hint: "Please add your Cloudflare account ID and API token in Settings > Integrations"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = integration.credentials as CloudflareCredentials;

    switch (action) {
      case "createLiveInput":
        return await createLiveInput(credentials, sessionData, corsHeaders);

      case "getLiveInput":
        return await getLiveInput(credentials, sessionData, corsHeaders);

      case "deleteLiveInput":
        return await deleteLiveInput(credentials, sessionData, corsHeaders);

      case "addOutput":
        return await addOutput(credentials, sessionData, corsHeaders);

      case "removeOutput":
        return await removeOutput(credentials, sessionData, corsHeaders);

      case "getOutputs":
        return await getOutputs(credentials, sessionData, corsHeaders);

      case "getOutputStatus":
        return await getOutputStatus(credentials, sessionData, corsHeaders);

      case "updateOutput":
        return await updateOutput(credentials, sessionData, corsHeaders);

      case "restartOutput":
        return await restartOutput(credentials, sessionData, corsHeaders);

      case "recreateOutput":
        return await recreateOutput(credentials, sessionData, corsHeaders);

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Error in manage-cloudflare-stream:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createLiveInput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { title, recording = false } = sessionData;

  console.log("[CF Stream] Creating live input:", title);

  const response = await fetch(
    `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta: { name: title },
        recording: { mode: recording ? "automatic" : "off" },
        defaultCreator: "alfie-livestream",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    console.error("[CF Stream] Error creating live input:", data);
    return new Response(
      JSON.stringify({ error: data.errors?.[0]?.message || "Failed to create live input" }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const liveInput = data.result;
  console.log("[CF Stream] Live input created:", liveInput.uid);

  return new Response(
    JSON.stringify({
      success: true,
      liveInput: {
        uid: liveInput.uid,
        rtmps: liveInput.rtmps,
        rtmpsPlayback: liveInput.rtmpsPlayback,
        srt: liveInput.srt,
        srtPlayback: liveInput.srtPlayback,
        webRTC: liveInput.webRTC,
        webRTCPlayback: liveInput.webRTCPlayback,
        status: liveInput.status,
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getLiveInput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { liveInputId } = sessionData;

  console.log("[CF Stream] Getting live input:", liveInputId);

  const response = await fetch(
    `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    console.error("[CF Stream] Error getting live input:", data);
    return new Response(
      JSON.stringify({ error: data.errors?.[0]?.message || "Failed to get live input" }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[CF Stream] Live input retrieved:", data.result.uid);
  console.log("[CF Stream] Live input status:", data.result.status);
  console.log("[CF Stream] Live input WHIP URL:", data.result.webRTC?.url);

  // Also fetch outputs for this live input
  let outputs = [];
  try {
    const outputsResponse = await fetch(
      `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${credentials.api_token}`,
        },
      }
    );

    const outputsData = await outputsResponse.json();
    if (outputsResponse.ok && outputsData.success) {
      outputs = outputsData.result || [];
      console.log("[CF Stream] Outputs found:", outputs.length);
      outputs.forEach((o: any, i: number) => {
        console.log(`[CF Stream] Output ${i + 1}:`, {
          uid: o.uid,
          url: o.url,
          enabled: o.enabled,
          state: o.state,
          status: o.status,
          streamKey: o.streamKey ? `${o.streamKey.substring(0, 10)}...` : 'none',
          errorMessage: o.errorMessage || o.error
        });
      });
    }
  } catch (e) {
    console.error("[CF Stream] Error fetching outputs:", e);
  }

  return new Response(
    JSON.stringify({
      success: true,
      liveInput: {
        ...data.result,
        outputs: outputs
      }
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function deleteLiveInput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { liveInputId } = sessionData;

  const response = await fetch(
    `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}`,
    {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
      },
    }
  );

  if (!response.ok) {
    const data = await response.json();
    return new Response(
      JSON.stringify({ error: data.errors?.[0]?.message || "Failed to delete live input" }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function addOutput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let { liveInputId, streamUrl, streamKey } = sessionData;

  console.log("[CF Stream] Adding output to live input:", liveInputId);
  console.log("[CF Stream] Original Stream URL:", streamUrl);
  console.log("[CF Stream] Stream key length:", streamKey?.length);
  console.log("[CF Stream] Stream key first 10 chars:", streamKey?.substring(0, 10));

  if (streamUrl && streamUrl.startsWith('rtmps://')) {
    const originalUrl = streamUrl;
    streamUrl = streamUrl.replace('rtmps://', 'rtmp://').replace('.rtmps.', '.rtmp.');
    console.log("[CF Stream] Converted RTMPS to RTMP:", originalUrl, "->", streamUrl);
  }

  if (!streamUrl && streamKey) {
    streamUrl = 'rtmp://a.rtmp.youtube.com/live2';
    console.log("[CF Stream] No stream URL provided, defaulting to YouTube RTMP:", streamUrl);
  }

  console.log("[CF Stream] Final Stream URL:", streamUrl);

  const outputPayload = {
    url: streamUrl,
    streamKey: streamKey,
    enabled: true,
  };

  console.log("[CF Stream] Output payload:", JSON.stringify(outputPayload, null, 2));

  const response = await fetch(
    `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(outputPayload),
    }
  );

  const data = await response.json();
  console.log("[CF Stream] Cloudflare response:", JSON.stringify(data, null, 2));

  if (!response.ok || !data.success) {
    console.error("[CF Stream] Error adding output. Status:", response.status);
    console.error("[CF Stream] Error details:", data);
    return new Response(
      JSON.stringify({
        error: data.errors?.[0]?.message || "Failed to add output",
        details: data
      }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[CF Stream] Output added successfully!");
  console.log("[CF Stream] Output UID:", data.result.uid);
  console.log("[CF Stream] Output enabled:", data.result.enabled);
  console.log("[CF Stream] Output state:", data.result.state);
  console.log("[CF Stream] Full output object:", JSON.stringify(data.result, null, 2));

  return new Response(
    JSON.stringify({ success: true, output: data.result }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function removeOutput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { liveInputId, outputId } = sessionData;

  const response = await fetch(
    `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs/${outputId}`,
    {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
      },
    }
  );

  if (!response.ok) {
    const data = await response.json();
    return new Response(
      JSON.stringify({ error: data.errors?.[0]?.message || "Failed to remove output" }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getOutputs(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { liveInputId } = sessionData;

  const response = await fetch(
    `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    return new Response(
      JSON.stringify({ error: data.errors?.[0]?.message || "Failed to get outputs" }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, outputs: data.result }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getOutputStatus(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { liveInputId, outputId } = sessionData;

  console.log("[CF Stream] Getting output status for:", { liveInputId, outputId });

  // Validate required fields
  if (!liveInputId) {
    console.error("[CF Stream] Missing liveInputId in sessionData:", sessionData);
    return new Response(
      JSON.stringify({ error: "Missing liveInputId" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!outputId) {
    console.error("[CF Stream] Missing outputId in sessionData:", sessionData);
    return new Response(
      JSON.stringify({ error: "Missing outputId" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs/${outputId}`;
    console.log("[CF Stream] Fetching output status from URL:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
      },
    });

    console.log("[CF Stream] Output status HTTP response status:", response.status);

    const responseText = await response.text();
    console.log("[CF Stream] Output status raw response:", responseText);

    let data;
    try {
      data = responseText ? JSON.parse(responseText) : { success: false, errors: [{ message: "Empty response from Cloudflare" }] };
    } catch {
      console.warn("[CF Stream] Could not parse response as JSON, using list endpoint instead");
      const listResponse = await fetch(
        `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs`,
        { method: "GET", headers: { "Authorization": `Bearer ${credentials.api_token}` } }
      );
      const listData = await listResponse.json();
      if (listResponse.ok && listData.success) {
        const matchingOutput = listData.result?.find((o: any) => o.uid === outputId);
        if (matchingOutput) {
          return new Response(
            JSON.stringify({ success: true, output: matchingOutput }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      data = { success: false, errors: [{ message: "Could not parse individual output response and list fallback failed" }] };
    }

    if (!response.ok || !data.success) {
      console.error("[CF Stream] Error getting output status. HTTP status:", response.status, "Response:", data);

      // If it's a 404 or the output doesn't exist, return a specific error code
      // so the frontend knows to recreate rather than retry
      if (response.status === 404 || data.errors?.[0]?.code === 10009) {
        console.log("[CF Stream] Output not found (404 or code 10009). It may have been deleted or never existed.");
        return new Response(
          JSON.stringify({
            error: "Output not found",
            code: "OUTPUT_NOT_FOUND",
            needsRecreation: true,
            details: data
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: data.errors?.[0]?.message || "Failed to get output status",
          details: data,
          httpStatus: response.status
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[CF Stream] Output status retrieved successfully");
    console.log("[CF Stream] Output enabled:", data.result?.enabled);
    console.log("[CF Stream] Output state:", data.result?.state);
    return new Response(
      JSON.stringify({ success: true, output: data.result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CF Stream] Exception getting output status:", error);
    console.error("[CF Stream] Exception stack:", error.stack);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to get output status",
        type: error.name || "UnknownError"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

async function updateOutput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { liveInputId, outputId, enabled } = sessionData;

  const response = await fetch(
    `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs/${outputId}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${credentials.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    return new Response(
      JSON.stringify({ error: data.errors?.[0]?.message || "Failed to update output" }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, output: data.result }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function restartOutput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { liveInputId, outputId } = sessionData;

  console.log("[CF Stream] Restarting output:", { liveInputId, outputId });

  const baseUrl = `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs/${outputId}`;

  console.log("[CF Stream] Step 1: Disabling output...");
  const disableResponse = await fetch(baseUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${credentials.api_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled: false }),
  });

  const disableData = await disableResponse.json();
  console.log("[CF Stream] Disable response:", JSON.stringify(disableData, null, 2));

  if (!disableResponse.ok || !disableData.success) {
    console.error("[CF Stream] Failed to disable output:", disableData);
    return new Response(
      JSON.stringify({ error: disableData.errors?.[0]?.message || "Failed to disable output for restart" }),
      { status: disableResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[CF Stream] Output disabled. Waiting 2 seconds...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("[CF Stream] Step 2: Re-enabling output...");
  const enableResponse = await fetch(baseUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${credentials.api_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled: true }),
  });

  const enableData = await enableResponse.json();
  console.log("[CF Stream] Enable response:", JSON.stringify(enableData, null, 2));

  if (!enableResponse.ok || !enableData.success) {
    console.error("[CF Stream] Failed to re-enable output:", enableData);
    return new Response(
      JSON.stringify({ error: enableData.errors?.[0]?.message || "Failed to re-enable output after restart" }),
      { status: enableResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[CF Stream] Output restarted successfully!");
  console.log("[CF Stream] New output state:", enableData.result?.state);
  console.log("[CF Stream] New output status:", enableData.result?.status);

  return new Response(
    JSON.stringify({ success: true, output: enableData.result, restarted: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function recreateOutput(
  credentials: CloudflareCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let { liveInputId, outputId, streamUrl, streamKey } = sessionData;

  console.log("[CF Stream] Recreating output:", { liveInputId, outputId });
  console.log("[CF Stream] Original Stream URL:", streamUrl);
  console.log("[CF Stream] StreamKey provided:", !!streamKey);

  if (streamUrl && streamUrl.startsWith('rtmps://')) {
    streamUrl = streamUrl.replace('rtmps://', 'rtmp://').replace('.rtmps.', '.rtmp.');
    console.log("[CF Stream] Converted RTMPS to RTMP for recreate:", streamUrl);
  }

  if (!streamUrl && streamKey) {
    streamUrl = 'rtmp://a.rtmp.youtube.com/live2';
    console.log("[CF Stream] No stream URL provided, defaulting to YouTube RTMP:", streamUrl);
  }

  if (!liveInputId) {
    return new Response(
      JSON.stringify({ error: "liveInputId is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!streamKey) {
    return new Response(
      JSON.stringify({ error: "streamKey is required for recreating output" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const baseUrl = `${CF_API_BASE}/accounts/${credentials.account_id}/stream/live_inputs/${liveInputId}/outputs`;

  console.log("[CF Stream] Step 1: Deleting existing output...");
  const deleteResponse = await fetch(`${baseUrl}/${outputId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${credentials.api_token}`,
    },
  });

  if (!deleteResponse.ok) {
    const deleteData = await deleteResponse.json();
    console.error("[CF Stream] Failed to delete output:", deleteData);
  } else {
    console.log("[CF Stream] Output deleted successfully");
  }

  console.log("[CF Stream] Waiting 2 seconds before recreating...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("[CF Stream] Step 2: Creating new output...");

  const createResponse = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${credentials.api_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: streamUrl,
      streamKey: streamKey,
      enabled: true,
    }),
  });

  const createData = await createResponse.json();
  console.log("[CF Stream] Create response:", JSON.stringify(createData, null, 2));

  if (!createResponse.ok || !createData.success) {
    console.error("[CF Stream] Failed to recreate output:", createData);
    return new Response(
      JSON.stringify({ error: createData.errors?.[0]?.message || "Failed to recreate output" }),
      { status: createResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[CF Stream] Output recreated successfully!");
  console.log("[CF Stream] New output UID:", createData.result?.uid);
  console.log("[CF Stream] New output enabled:", createData.result?.enabled);
  console.log("[CF Stream] New output state:", createData.result?.state);

  return new Response(
    JSON.stringify({ success: true, output: createData.result, recreated: true, newOutputId: createData.result?.uid }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

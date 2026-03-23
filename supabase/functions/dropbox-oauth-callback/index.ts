import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OAuthCallbackRequest {
  code: string;
  redirectUri: string;
  organizationId: string;
  organizationType: "club" | "state" | "national";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const appKey = Deno.env.get("DROPBOX_APP_KEY");
  const appSecret = Deno.env.get("DROPBOX_APP_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (req.method === "GET") {
    if (!appKey) {
      return new Response(
        JSON.stringify({ error: "Dropbox app key not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    return new Response(
      JSON.stringify({ appKey }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  try {
    const { code, redirectUri, organizationId, organizationType }: OAuthCallbackRequest = await req.json();

    if (!code || !redirectUri || !organizationId || !organizationType) {
      throw new Error("Missing required parameters");
    }

    if (!appKey || !appSecret || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables");
    }

    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: appKey,
        client_secret: appSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorData}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      throw new Error("No access token received");
    }

    const accountResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!accountResponse.ok) {
      const errorData = await accountResponse.text();
      throw new Error(`Failed to fetch Dropbox account info: ${errorData}`);
    }

    const accountData = await accountResponse.json();
    const userEmail = accountData.email;
    const displayName = accountData.name?.display_name || userEmail;

    if (!userEmail) {
      throw new Error("Could not retrieve Dropbox account email");
    }

    const rootPath = "/AlfiePRO Resources";
    try {
      await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: rootPath, autorename: false }),
      });
    } catch (_) {
      // Folder may already exist
    }

    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : new Date(Date.now() + 14400 * 1000).toISOString();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const idColumn =
      organizationType === "club" ? "club_id" :
      organizationType === "state" ? "state_association_id" :
      "national_association_id";

    const integrationData: Record<string, unknown> = {
      [idColumn]: organizationId,
      platform: "dropbox",
      is_active: true,
      credentials: {
        dropbox_account_email: userEmail,
        dropbox_display_name: displayName,
        root_folder_path: rootPath,
        access_token,
        refresh_token,
        token_expires_at: expiresAt,
      },
      connected_at: new Date().toISOString(),
    };

    if (idColumn !== "club_id") integrationData["club_id"] = null;
    if (idColumn !== "state_association_id") integrationData["state_association_id"] = null;
    if (idColumn !== "national_association_id") integrationData["national_association_id"] = null;

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq(idColumn, organizationId)
      .eq("platform", "dropbox")
      .maybeSingle();

    let dbError: unknown;
    if (existing?.id) {
      const { error } = await supabase
        .from("integrations")
        .update(integrationData)
        .eq("id", existing.id);
      dbError = error;
    } else {
      const { error } = await supabase
        .from("integrations")
        .insert(integrationData);
      dbError = error;
    }

    if (dbError) {
      const err = dbError as { message: string };
      console.error("Database error details:", dbError);
      throw new Error(`Database error: ${err.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        userEmail,
        displayName,
        message: "Dropbox integration connected successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Dropbox OAuth callback error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process Dropbox OAuth callback" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});

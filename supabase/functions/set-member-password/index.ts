import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { token_hash, email, password } = await req.json();

    if (!token_hash || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: token_hash, email, password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        token_hash,
        type: "recovery",
      }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.access_token) {
      console.error("Token verification failed:", verifyRes.status, JSON.stringify(verifyData));
      return new Response(
        JSON.stringify({ error: "Recovery link has expired or is invalid. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verifiedEmail = verifyData.email || verifyData.user?.email;
    if (verifiedEmail && verifiedEmail.toLowerCase() !== email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Token does not match the provided email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = verifyData.user?.id || verifyData.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Could not determine user from recovery token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password,
    });

    if (updateError) {
      console.error("Password update failed:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update password. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("members")
      .update({
        activation_status: "activated",
        activated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ success: true, message: "Password has been set successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Set password error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

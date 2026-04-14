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

    const { activation_token, reset_token, email, password, admin_set, member_id } = await req.json();

    if (password && password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (admin_set && member_id && email && password) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const jwtToken = authHeader.replace("Bearer ", "");
      const { data: { user: callingUser }, error: authError } = await supabase.auth.getUser(jwtToken);
      if (authError || !callingUser) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: memberRecord } = await supabase
        .from("members")
        .select("id, user_id, club_id")
        .eq("id", member_id)
        .maybeSingle();

      if (!memberRecord || !memberRecord.user_id) {
        return new Response(
          JSON.stringify({ error: "Member not found or has no linked account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: roleCheck } = await supabase
        .from("user_clubs")
        .select("role")
        .eq("user_id", callingUser.id)
        .eq("club_id", memberRecord.club_id)
        .maybeSingle();

      const { data: profileCheck } = await supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", callingUser.id)
        .maybeSingle();

      const isSuperAdmin = profileCheck?.is_super_admin === true;
      const isClubAdmin = roleCheck && ["admin", "super_admin", "editor"].includes(roleCheck.role);

      if (!isSuperAdmin && !isClubAdmin) {
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(memberRecord.user_id, {
        password,
      });

      if (updateError) {
        console.error("Admin password set failed:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to set password. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("members")
        .update({
          activation_status: "activated",
          activated_at: new Date().toISOString(),
        })
        .eq("id", member_id);

      return new Response(
        JSON.stringify({ success: true, message: "Password has been set successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = activation_token || reset_token;
    if (!token || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: token, email, password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tokenRecord, error: tokenError } = await supabase
      .from("member_activation_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid activation link. Please request a new one from your club administrator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tokenRecord.used_at) {
      return new Response(
        JSON.stringify({ error: "This activation link has already been used. Please sign in with your password, or request a new link." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This activation link has expired. Please request a new one from your club administrator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tokenRecord.email.toLowerCase() !== email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Token does not match the provided email." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(tokenRecord.user_id, {
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
      .from("member_activation_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRecord.id);

    if (activation_token) {
      await supabase
        .from("members")
        .update({
          activation_status: "activated",
          activated_at: new Date().toISOString(),
        })
        .eq("user_id", tokenRecord.user_id);
    }

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

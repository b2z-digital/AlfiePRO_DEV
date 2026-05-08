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

    const { member_id, new_email } = await req.json();

    if (!member_id || !new_email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: member_id, new_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(new_email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      .select("id, user_id, club_id, email, first_name, last_name")
      .eq("id", member_id)
      .maybeSingle();

    if (!memberRecord || !memberRecord.user_id) {
      return new Response(
        JSON.stringify({ error: "Member not found or has no linked account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isSelf = callingUser.id === memberRecord.user_id;

    if (!isSelf) {
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
    }

    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const emailAlreadyTaken = existingUser?.users?.some(
      (u) => u.email?.toLowerCase() === new_email.toLowerCase() && u.id !== memberRecord.user_id
    );

    if (emailAlreadyTaken) {
      return new Response(
        JSON.stringify({ error: "This email address is already in use by another account. The member may need to use a different email." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(memberRecord.user_id, {
      email: new_email.toLowerCase(),
      email_confirm: true,
    });

    if (updateError) {
      console.error("Auth email update failed:", updateError.message, updateError);
      return new Response(
        JSON.stringify({ error: updateError.message || "Failed to update account email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("profiles")
      .update({ email: new_email.toLowerCase() })
      .eq("id", memberRecord.user_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Account email updated to ${new_email}`,
        old_email: memberRecord.email,
        new_email: new_email.toLowerCase(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Update auth email error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

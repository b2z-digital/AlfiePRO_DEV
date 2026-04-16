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
    const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
    const defaultFromEmail =
      Deno.env.get("DEFAULT_FROM_EMAIL") || "noreply@alfie.pro";

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: callingUser },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !callingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminCheck } = await supabase
      .from("super_admins")
      .select("id")
      .eq("user_id", callingUser.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminCheck) {
      return new Response(
        JSON.stringify({ error: "Access denied: super admin only" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { email, name } = await req.json();

    if (!email?.trim()) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: existingUsers } =
      await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      await supabase
        .from("profiles")
        .update({ is_race_officer: true })
        .eq("id", existingUser.id);

      return new Response(
        JSON.stringify({
          status: "existing_updated",
          message: `${normalizedEmail} already had an account and has been granted Race Officer access.`,
          user_id: existingUser.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tempPassword =
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6);

    const { data: newUser, error: createError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: name?.trim() || "",
          is_race_officer: true,
        },
      });

    if (createError || !newUser?.user) {
      return new Response(
        JSON.stringify({
          error: createError?.message || "Failed to create user account",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase
      .from("profiles")
      .update({
        is_race_officer: true,
        full_name: name?.trim() || "",
      })
      .eq("id", newUser.user.id);

    if (sendGridApiKey) {
      try {
        const siteUrl = Deno.env.get("SITE_URL") || "https://alfie.pro";

        await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sendGridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: normalizedEmail }] }],
            from: {
              email: defaultFromEmail,
              name: "AlfiePRO",
            },
            subject: "Your AlfiePRO Race Officer Account",
            content: [
              {
                type: "text/html",
                value: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                      <h1 style="color: #1e293b; font-size: 24px; margin: 0;">Welcome to AlfiePRO</h1>
                      <p style="color: #64748b; font-size: 14px; margin-top: 8px;">You've been added as a Race Officer</p>
                    </div>
                    <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                      <p style="color: #334155; margin: 0 0 12px;">Hi${name?.trim() ? ` ${name.trim()}` : ''},</p>
                      <p style="color: #334155; margin: 0 0 12px;">An AlfiePRO administrator has created a Race Officer account for you. You can now log in and manage races.</p>
                      <div style="background: white; border-radius: 8px; padding: 16px; margin: 16px 0; border: 1px solid #e2e8f0;">
                        <p style="color: #475569; margin: 0 0 8px; font-size: 13px;"><strong>Email:</strong> ${normalizedEmail}</p>
                        <p style="color: #475569; margin: 0; font-size: 13px;"><strong>Temporary Password:</strong> ${tempPassword}</p>
                      </div>
                      <p style="color: #64748b; font-size: 13px; margin: 12px 0 0;">Please change your password after your first login.</p>
                    </div>
                    <div style="text-align: center;">
                      <a href="${siteUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">Log In to AlfiePRO</a>
                    </div>
                    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">
                      Password must be at least 6 characters. No special characters required.
                    </p>
                  </div>
                `,
              },
            ],
          }),
        });
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        status: "created",
        message: `Account created for ${normalizedEmail} and Race Officer access granted.${sendGridApiKey ? " A welcome email with login details has been sent." : ` Temporary password: ${tempPassword}`}`,
        user_id: newUser.user.id,
        temp_password: sendGridApiKey ? undefined : tempPassword,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("invite-race-officer error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

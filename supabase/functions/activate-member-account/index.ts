import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ActivateRequest {
  member_ids: string[];
  club_id: string;
  club_name: string;
  app_deep_link_base?: string;
}

interface ActivationResult {
  member_id: string;
  email: string;
  name: string;
  status: "created" | "existing_linked" | "error" | "no_email";
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
    const defaultFromEmail = Deno.env.get("DEFAULT_FROM_EMAIL");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callingUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !callingUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { member_ids, club_id, club_name, app_deep_link_base }: ActivateRequest = await req.json();

    if (!member_ids?.length || !club_id || !club_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: member_ids, club_id, club_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleCheck } = await supabase
      .from("user_clubs")
      .select("role")
      .eq("user_id", callingUser.id)
      .eq("club_id", club_id)
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
        JSON.stringify({ error: "Insufficient permissions. Must be a club admin." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, user_id, club_id")
      .in("id", member_ids)
      .eq("club_id", club_id);

    if (membersError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch members: ${membersError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: ActivationResult[] = [];

    for (const member of members || []) {
      if (!member.email) {
        results.push({
          member_id: member.id,
          email: "",
          name: `${member.first_name} ${member.last_name}`,
          status: "no_email",
          error: "Member has no email address",
        });
        continue;
      }

      try {
        if (member.user_id) {
          results.push({
            member_id: member.id,
            email: member.email,
            name: `${member.first_name} ${member.last_name}`,
            status: "existing_linked",
          });
          continue;
        }

        const { data: existingUsers } = await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1,
        });

        let existingUser = null;
        if (existingUsers?.users) {
          const { data: searchResult } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", (
              await supabase.rpc("get_user_id_by_email", { p_email: member.email })
            ).data)
            .maybeSingle();

          if (searchResult) {
            existingUser = { id: searchResult.id };
          }
        }

        let userId: string;

        if (existingUser) {
          userId = existingUser.id;
        } else {
          const tempPassword = crypto.randomUUID() + "Aa1!";
          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: member.email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              first_name: member.first_name,
              last_name: member.last_name,
              activation_source: "admin_activation",
            },
          });

          if (createError) {
            if (createError.message?.includes("already been registered") ||
                createError.message?.includes("already exists")) {
              const { data: userList } = await supabase.auth.admin.listUsers();
              const found = userList?.users?.find(
                (u: any) => u.email?.toLowerCase() === member.email.toLowerCase()
              );
              if (found) {
                userId = found.id;
              } else {
                throw new Error(`User exists but could not be found: ${createError.message}`);
              }
            } else {
              throw createError;
            }
          } else {
            userId = newUser.user!.id;
          }
        }

        await supabase
          .from("members")
          .update({
            user_id: userId,
            activation_status: "pending",
            activation_sent_at: new Date().toISOString(),
          })
          .eq("id", member.id);

        await supabase
          .from("user_clubs")
          .upsert(
            { user_id: userId, club_id: member.club_id, role: "member" },
            { onConflict: "user_id,club_id" }
          );

        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (existingProfile) {
          await supabase
            .from("profiles")
            .update({
              onboarding_completed: true,
              default_club_id: member.club_id,
              primary_club_id: member.club_id,
            })
            .eq("id", userId);
        }

        const { data: recoveryLink } = await supabase.auth.admin.generateLink({
          type: "recovery",
          email: member.email,
        });

        let recoveryToken = "";
        if (recoveryLink?.properties?.hashed_token) {
          recoveryToken = recoveryLink.properties.hashed_token;
        }

        if (sendGridApiKey && defaultFromEmail) {
          const deepLinkBase = app_deep_link_base || "https://app.alfiepro.com";
          const activationDeepLink = recoveryToken
            ? `${deepLinkBase}/activate?token=${encodeURIComponent(recoveryToken)}&email=${encodeURIComponent(member.email)}`
            : `${deepLinkBase}/activate?email=${encodeURIComponent(member.email)}`;

          const appStoreUrl = "https://apps.apple.com/app/alfiepro/id0000000000";
          const playStoreUrl = "https://play.google.com/store/apps/details?id=com.alfiepro.app";

          await sendActivationEmail({
            sendGridApiKey,
            fromEmail: defaultFromEmail,
            toEmail: member.email,
            recipientName: member.first_name,
            clubName: club_name,
            activationDeepLink,
            appStoreUrl,
            playStoreUrl,
          });
        }

        results.push({
          member_id: member.id,
          email: member.email,
          name: `${member.first_name} ${member.last_name}`,
          status: "created",
        });
      } catch (err: any) {
        console.error(`Error activating member ${member.id}:`, err);
        results.push({
          member_id: member.id,
          email: member.email || "",
          name: `${member.first_name} ${member.last_name}`,
          status: "error",
          error: err.message || "Unknown error",
        });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const linked = results.filter((r) => r.status === "existing_linked").length;
    const errors = results.filter((r) => r.status === "error").length;
    const noEmail = results.filter((r) => r.status === "no_email").length;

    return new Response(
      JSON.stringify({
        success: true,
        summary: { created, existing_linked: linked, errors, no_email: noEmail, total: results.length },
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Activation error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface EmailParams {
  sendGridApiKey: string;
  fromEmail: string;
  toEmail: string;
  recipientName: string;
  clubName: string;
  activationDeepLink: string;
  appStoreUrl: string;
  playStoreUrl: string;
}

async function sendActivationEmail(params: EmailParams) {
  const {
    sendGridApiKey,
    fromEmail,
    toEmail,
    recipientName,
    clubName,
    activationDeepLink,
    appStoreUrl,
    playStoreUrl,
  } = params;

  const emailData = {
    personalizations: [
      {
        to: [{ email: toEmail, name: recipientName }],
        subject: `Welcome to ${clubName} on AlfiePRO`,
      },
    ],
    from: { email: fromEmail, name: clubName },
    content: [
      {
        type: "text/html",
        value: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${clubName} on AlfiePRO</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f0f2f5;">
  <div style="background: linear-gradient(135deg, #0a1628 0%, #1a2744 100%); padding: 40px 30px; text-align: center;">
    <img src="https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/media/alfie_app_logo.svg" alt="AlfiePRO" style="height: 48px; margin-bottom: 16px;" />
    <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">Welcome to ${clubName}!</h1>
    <p style="color: #94a3b8; margin: 8px 0 0; font-size: 15px;">Your membership account is ready</p>
  </div>

  <div style="background-color: white; padding: 36px 30px;">
    <p style="font-size: 16px; margin: 0 0 20px; color: #334155;">Hi ${recipientName},</p>

    <p style="font-size: 15px; margin: 0 0 24px; color: #475569;">
      Great news! <strong>${clubName}</strong> has set up your AlfiePRO account. Download the app, set your password, and you're in.
    </p>

    <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); border-radius: 12px; padding: 28px; text-align: center; margin: 28px 0;">
      <p style="color: rgba(255,255,255,0.9); font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Step 1</p>
      <p style="color: white; font-size: 18px; font-weight: 700; margin: 0 0 16px;">Download AlfiePRO</p>
      <div style="margin: 0 0 8px;">
        <a href="${appStoreUrl}" style="display: inline-block; margin: 4px 6px;">
          <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83" alt="Download on App Store" style="height: 40px; border-radius: 6px;" />
        </a>
        <a href="${playStoreUrl}" style="display: inline-block; margin: 4px 6px;">
          <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play" style="height: 40px; border-radius: 6px;" />
        </a>
      </div>
    </div>

    <div style="background-color: #f8fafc; border-radius: 12px; padding: 28px; text-align: center; margin: 20px 0; border: 1px solid #e2e8f0;">
      <p style="color: #64748b; font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Step 2</p>
      <p style="color: #1e293b; font-size: 18px; font-weight: 700; margin: 0 0 16px;">Set Your Password</p>
      <a href="${activationDeepLink}" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: white; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">Activate My Account</a>
      <p style="color: #94a3b8; font-size: 12px; margin: 12px 0 0;">Opens in the AlfiePRO app</p>
    </div>

    <div style="margin: 28px 0 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #0ea5e9;">
      <p style="font-size: 14px; color: #475569; margin: 0;">
        <strong>Already have the app?</strong> Open it and tap "Forgot password?" on the login screen. Enter your email <strong>${toEmail}</strong> and follow the prompts.
      </p>
    </div>
  </div>

  <div style="text-align: center; padding: 24px 30px; color: #94a3b8; font-size: 13px;">
    <p style="margin: 0;">Sent by ${clubName} via AlfiePRO</p>
    <p style="margin: 8px 0 0; color: #64748b;">The complete RC yacht club management platform</p>
  </div>
</body>
</html>`,
      },
    ],
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendGridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("SendGrid error:", response.status, errorText);
    throw new Error(`Email send failed: ${response.status}`);
  }
}

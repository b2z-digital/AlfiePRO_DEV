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

    const { data: appSettings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .eq("category", "mobile_app");

    const platformConfig: Record<string, string> = {};
    (appSettings || []).forEach((s: { key: string; value: string }) => {
      platformConfig[s.key] = s.value;
    });

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
          const deepLinkBase = app_deep_link_base || platformConfig.app_deep_link_base || "https://app.alfiepro.com";
          const activationDeepLink = recoveryToken
            ? `${deepLinkBase}/activate?token=${encodeURIComponent(recoveryToken)}&email=${encodeURIComponent(member.email)}`
            : `${deepLinkBase}/activate?email=${encodeURIComponent(member.email)}`;

          const appStoreUrl = platformConfig.ios_app_store_url || "";
          const playStoreUrl = platformConfig.android_play_store_url || "";

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

  const hasAppStoreLinks = !!(appStoreUrl || playStoreUrl);

  const appStoreButtonsHtml = hasAppStoreLinks
    ? `<tr>
        <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:12px;padding:24px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Step 1</p>
          <p style="margin:4px 0 16px;color:#ffffff;font-size:20px;font-weight:700;">Download AlfiePRO</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              ${appStoreUrl ? `<td style="padding:0 6px;"><a href="${appStoreUrl}" style="display:inline-block;background:rgba(0,0,0,0.3);color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">App Store</a></td>` : ""}
              ${playStoreUrl ? `<td style="padding:0 6px;"><a href="${playStoreUrl}" style="display:inline-block;background:rgba(0,0,0,0.3);color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Google Play</a></td>` : ""}
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="height:20px;"></td></tr>`
    : "";

  const stepNumber = hasAppStoreLinks ? "Step 2" : "";

  const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:16px 16px 0 0;padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Welcome to ${clubName}</h1>
                    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your AlfiePRO membership account is ready</p>
                  </td>
                  <td align="right" valign="top">
                    <div style="background:rgba(255,255,255,0.2);border-radius:10px;padding:8px 14px;display:inline-block;">
                      <span style="color:#ffffff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">NEW ACCOUNT</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
                Hi ${recipientName},
              </p>
              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
                Great news! <strong>${clubName}</strong> has set up your AlfiePRO account. ${hasAppStoreLinks ? "Download the app, set your password, and you're in." : "Set your password using the button below and you're in."}
              </p>

              <!-- App Store Download -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                ${appStoreButtonsHtml}
              </table>

              <!-- Activation Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border:1px solid #e2e8f0;border-radius:12px;padding:28px;text-align:center;">
                    ${stepNumber ? `<p style="margin:0 0 4px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">${stepNumber}</p>` : ""}
                    <p style="margin:0 0 16px;color:#0f172a;font-size:20px;font-weight:700;">Set Your Password</p>
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:8px;">
                          <a href="${activationDeepLink}" style="display:inline-block;color:#ffffff;padding:14px 40px;text-decoration:none;font-size:16px;font-weight:600;letter-spacing:0.3px;">Activate My Account</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0;color:#94a3b8;font-size:12px;">${hasAppStoreLinks ? "Opens in the AlfiePRO app" : "Click to set your password and get started"}</p>
                  </td>
                </tr>
              </table>

              <!-- Account Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Your Account Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;width:35%;">
                          <span style="color:#64748b;font-size:13px;">Club</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:600;">${clubName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Email</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${toEmail}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 20px;">
                          <span style="color:#64748b;font-size:13px;">Password</span>
                        </td>
                        <td style="padding:12px 20px;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">Set via the activation button above</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback tip -->
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:24px;border-left:4px solid #0ea5e9;">
                <p style="margin:0 0 4px;color:#334155;font-size:13px;font-weight:600;">Already have the app?</p>
                <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">Open it and tap "Forgot password?" on the login screen. Enter <strong>${toEmail}</strong> and follow the prompts.</p>
              </div>

              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;text-align:center;">
                This activation was sent on behalf of ${clubName}. If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                Powered by <strong style="color:#0ea5e9;">AlfiePRO</strong> &mdash; RC Yacht Club Management Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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
        value: emailHtml,
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

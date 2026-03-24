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
    const defaultFromEmail = Deno.env.get("DEFAULT_FROM_EMAIL");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sendGridApiKey || !defaultFromEmail) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userResult } = await supabase.rpc("get_user_id_by_email", {
      p_email: email.toLowerCase(),
    });

    if (!userResult) {
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userResult;

    const resetToken = crypto.randomUUID() + "-" + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();

    await supabase
      .from("member_activation_tokens")
      .insert({
        user_id: userId,
        email: email.toLowerCase(),
        token: resetToken,
        expires_at: expiresAt,
      });

    const { data: appSettings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .eq("category", "mobile_app");

    const platformConfig: Record<string, string> = {};
    (appSettings || []).forEach((s: { key: string; value: string }) => {
      platformConfig[s.key] = s.value;
    });

    const webAppUrl = (platformConfig.web_app_url || "https://app.alfiepro.com.au").replace(/\/+$/, "");
    const resetLink = `${webAppUrl}/reset-password?reset=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email.toLowerCase())}`;

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
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                <span style="font-weight:300;">Alfie</span><span style="font-weight:700;">PRO</span>
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:13px;text-transform:uppercase;letter-spacing:1.5px;">Password Reset</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;font-weight:700;">Reset Your Password</h2>
              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
                We received a request to reset the password for your account. Click the button below to choose a new password.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:8px;">
                          <a href="${resetLink}" style="display:inline-block;color:#ffffff;padding:14px 48px;text-decoration:none;font-size:16px;font-weight:600;letter-spacing:0.3px;">Reset Password</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;background-color:#f8fafc;">
                <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">
                  If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                </p>
              </div>
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetLink}" style="color:#0ea5e9;word-break:break-all;">${resetLink}</a>
              </p>
              <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">This link expires in 1 hour.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                This is an automated message from AlfiePRO.<br>Please do not reply to this email.
              </p>
              <p style="margin:8px 0 0;"><a href="https://alfiepro.com.au" style="color:#0ea5e9;font-size:12px;text-decoration:none;">alfiepro.com.au</a></p>
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
          to: [{ email: email.toLowerCase() }],
          subject: "Reset Your Password - AlfiePRO",
        },
      ],
      from: { email: defaultFromEmail, name: "AlfiePRO" },
      content: [{ type: "text/html", value: emailHtml }],
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
    }

    return new Response(
      JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Reset password request error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

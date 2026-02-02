import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { channelName, channelUrl, description, userName } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get superadmin email (Stephen Walsh)
    const superAdminEmail = "stephen@alfiesail.com";

    // Create notification in database for superadmin
    const { data: superAdminUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", superAdminEmail)
      .maybeSingle();

    if (superAdminUser) {
      // Insert in-app notification
      await supabase.from("notifications").insert({
        user_id: superAdminUser.id,
        type: "channel_suggestion",
        title: "New AlfieTV Channel Suggestion",
        body: `${userName} suggested adding "${channelName}" to AlfieTV.\n\nChannel: ${channelUrl}\n\nReason: ${description || "No description provided"}`,
        created_at: new Date().toISOString(),
      });
    }

    // Send email notification
    await sendEmail(superAdminEmail, channelName, channelUrl, description, userName);

    console.log("Channel suggestion notification sent:", {
      channelName,
      channelUrl,
      userName,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Suggestion sent successfully" }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error sending channel suggestion:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function sendEmail(
  to: string,
  channelName: string,
  channelUrl: string,
  description: string,
  userName: string
) {
  const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
  const defaultFromEmail = Deno.env.get("DEFAULT_FROM_EMAIL");

  if (!sendGridApiKey) {
    console.warn("SendGrid API key not configured - skipping email");
    return;
  }

  if (!defaultFromEmail) {
    console.warn("Default from email not configured - skipping email");
    return;
  }

  const emailData = {
    personalizations: [
      {
        to: [{ email: to, name: "Stephen Walsh" }],
        subject: `New AlfieTV Channel Suggestion: ${channelName}`,
      },
    ],
    from: {
      email: defaultFromEmail,
      name: "AlfieTV",
    },
    content: [
      {
        type: "text/html",
        value: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Channel Suggestion</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f172a;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155">
          <tr>
            <td style="background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%);padding:40px;text-align:center">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700">💡 New Channel Suggestion</h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.9);font-size:16px">Someone wants to add a channel to AlfieTV</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px">
              <div style="background:#0f172a;border-radius:8px;padding:24px;margin:0 0 24px;border:1px solid #334155">
                <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px">Channel Name</p>
                <h2 style="margin:0;color:#fff;font-size:24px;font-weight:600">${channelName}</h2>
              </div>

              <div style="background:#0f172a;border-radius:8px;padding:24px;margin:0 0 24px;border:1px solid #334155">
                <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px">Channel URL</p>
                <a href="${channelUrl}" style="color:#60a5fa;text-decoration:none;font-size:16px;word-break:break-all">${channelUrl}</a>
              </div>

              ${description ? `
              <div style="background:#0f172a;border-radius:8px;padding:24px;margin:0 0 24px;border:1px solid #334155">
                <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px">Why Add This Channel?</p>
                <p style="margin:0;color:#e2e8f0;font-size:16px;line-height:1.6">${description}</p>
              </div>
              ` : ''}

              <div style="background:#0f172a;border-radius:8px;padding:24px;border:1px solid #334155">
                <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px">Suggested By</p>
                <p style="margin:0;color:#e2e8f0;font-size:16px">${userName}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${Deno.env.get("SUPABASE_URL")}" style="display:inline-block;padding:14px 32px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View in AlfieTV Admin</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
    throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
  }

  console.log("Email sent successfully to:", to);
}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPeriod(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
}

interface BillingRecord {
  id: string;
  target_type: string;
  target_id: string;
  target_name: string;
  billing_period_start: string;
  billing_period_end: string;
  member_count: number;
  rate_per_member: number;
  annual_rate: number | null;
  total_amount: number;
  payment_status: string;
  due_date: string | null;
  notes: string | null;
}

function buildEmailHtml(
  record: BillingRecord,
  recipientName: string,
  message: string
): string {
  const annualRate = record.annual_rate || record.rate_per_member * 12;
  const monthlyRate = annualRate / 12;
  const isDue = record.due_date && new Date(record.due_date) > new Date();
  const isOverdue =
    record.due_date &&
    new Date(record.due_date) < new Date() &&
    record.payment_status !== "paid";

  return `<!DOCTYPE html>
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
                    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Platform Billing Invoice</h1>
                    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${formatPeriod(record.billing_period_start)}</p>
                  </td>
                  <td align="right" valign="top">
                    <div style="background:rgba(255,255,255,0.2);border-radius:10px;padding:8px 14px;display:inline-block;">
                      <span style="color:#ffffff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${record.payment_status === "paid" ? "PAID" : record.payment_status === "overdue" ? "OVERDUE" : "INVOICE"}</span>
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
                Dear ${recipientName || "Administrator"},
              </p>
              ${message ? `<p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">${message}</p>` : ""}

              <!-- Invoice Summary Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:12px;padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Amount Due</p>
                          <p style="margin:4px 0 0;color:#ffffff;font-size:32px;font-weight:800;">${formatCurrency(record.total_amount)}</p>
                        </td>
                        <td width="50%" align="right">
                          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Active Members</p>
                          <p style="margin:4px 0 0;color:#ffffff;font-size:32px;font-weight:800;">${record.member_count}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Organization Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Invoice Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;width:40%;">
                          <span style="color:#64748b;font-size:13px;">Organization</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:600;">${record.target_name}</span>
                          <span style="color:#94a3b8;font-size:12px;margin-left:8px;">${record.target_type.replace(/_/g, " ")}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Billing Period</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${formatDate(record.billing_period_start)} - ${formatDate(record.billing_period_end)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Active Members</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${record.member_count}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Annual Rate</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${formatCurrency(annualRate)} per member / year</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Monthly Rate</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${formatCurrency(monthlyRate)} per member / month</span>
                        </td>
                      </tr>
                      ${record.due_date ? `
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Due Date</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:${isOverdue ? "#ef4444" : "#0f172a"};font-size:13px;font-weight:600;">${formatDate(record.due_date)}${isOverdue ? " (OVERDUE)" : ""}</span>
                        </td>
                      </tr>
                      ` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Calculation Breakdown -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Fee Calculation</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:13px;">Active members</td>
                        <td align="right" style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:500;">${record.member_count}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:13px;">Monthly rate per member</td>
                        <td align="right" style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:500;">${formatCurrency(monthlyRate)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:10px;margin-top:6px;"></td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:700;">Total Due</td>
                        <td align="right" style="padding:6px 0;color:#0ea5e9;font-size:18px;font-weight:800;">${formatCurrency(record.total_amount)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding:4px 0;">
                          <p style="margin:0;color:#94a3b8;font-size:11px;">${record.member_count} members x ${formatCurrency(monthlyRate)}/month = ${formatCurrency(record.total_amount)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${record.notes ? `
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Notes</p>
                <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">${record.notes}</p>
              </div>
              ` : ""}

              <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;text-align:center;">
                This invoice was generated automatically by the AlfiePRO platform billing system.
                <br>If you have questions about this invoice, please contact the platform administrator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                Powered by <strong style="color:#0ea5e9;">Alfie PRO</strong> - RC Yacht Management Software
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const {
      record_id,
      recipient_email,
      recipient_name,
      subject,
      message,
    } = await req.json();

    if (!record_id || !recipient_email) {
      return jsonResponse({ error: "record_id and recipient_email are required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const { data: record, error: recordError } = await adminClient
      .from("platform_billing_records")
      .select("*")
      .eq("id", record_id)
      .maybeSingle();

    if (recordError || !record) {
      return jsonResponse({ error: "Billing record not found" }, 404);
    }

    const emailSubject =
      subject ||
      `AlfiePRO Platform Invoice - ${formatPeriod(record.billing_period_start)} - ${formatCurrency(record.total_amount)}`;

    const emailHtml = buildEmailHtml(
      record as BillingRecord,
      recipient_name || "",
      message || ""
    );

    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("DEFAULT_FROM_EMAIL") || "noreply@alfiepro.com";

    if (!sendgridKey) {
      return jsonResponse({ error: "Email service not configured" }, 500);
    }

    const emailPayload = {
      personalizations: [
        {
          to: [{ email: recipient_email, name: recipient_name || "" }],
          subject: emailSubject,
        },
      ],
      from: { email: fromEmail, name: "Alfie PRO Platform" },
      content: [{ type: "text/html", value: emailHtml }],
    };

    const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!sgResponse.ok) {
      const errorText = await sgResponse.text();
      console.error("SendGrid error:", errorText);
      return jsonResponse({ error: "Failed to send email" }, 500);
    }

    if (record.payment_status === "pending") {
      await adminClient
        .from("platform_billing_records")
        .update({ payment_status: "invoiced", updated_at: new Date().toISOString() })
        .eq("id", record_id);
    }

    return jsonResponse({ success: true, message: "Invoice email sent successfully" });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

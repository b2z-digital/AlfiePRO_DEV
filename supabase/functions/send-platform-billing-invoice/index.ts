import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUSINESS = {
  tradingName: "Stephen Walsh",
  abn: "89745703",
  accountName: "Stephen Walsh",
  bsb: "067-873",
  accountNumber: "2680 8108",
  paymentTermsDays: 14,
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(amount: number): string {
  return `$${Number(amount).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function periodLabel(start: string, end: string): string {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function invoiceNumber(record: BillingRecord): string {
  return `AP-${record.billing_period_start.slice(0, 7).replace("-", "")}-${record.id.slice(0, 6).toUpperCase()}`;
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
  created_at: string;
}

const row = (label: string, value: string, valueStyle = "color:#0f172a;font-weight:500;") => `
  <tr>
    <td style="padding:10px 20px;border-bottom:1px solid #f1f5f9;width:40%;"><span style="color:#64748b;font-size:13px;">${label}</span></td>
    <td style="padding:10px 20px;border-bottom:1px solid #f1f5f9;"><span style="font-size:13px;${valueStyle}">${value}</span></td>
  </tr>`;

const calcRow = (label: string, value: string) => `
  <tr>
    <td style="padding:6px 0;color:#64748b;font-size:13px;">${label}</td>
    <td align="right" style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:500;">${value}</td>
  </tr>`;

function buildEmailHtml(
  record: BillingRecord,
  newMembers: number,
  recipientName: string,
  message: string
): string {
  const annualRate = Number(record.annual_rate) || Number(record.rate_per_member) * 12;
  const periodRate = Number(record.rate_per_member);
  const existingMembers = record.member_count - newMembers;
  const isOverdue =
    record.due_date &&
    new Date(record.due_date) < new Date() &&
    record.payment_status !== "paid";
  const invoiceNo = invoiceNumber(record);
  const period = periodLabel(record.billing_period_start, record.billing_period_end);

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
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);background-color:#0284c7;border-radius:16px 16px 0 0;padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">AlfiePRO Invoice</h1>
                    <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Invoice ${invoiceNo} &middot; ${period}</p>
                  </td>
                  <td align="right" valign="top">
                    <div style="background:rgba(255,255,255,0.2);border-radius:10px;padding:8px 14px;display:inline-block;">
                      <span style="color:#ffffff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${record.payment_status === "paid" ? "PAID" : isOverdue ? "OVERDUE" : "INVOICE"}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Dear ${escapeHtml(recipientName || "Administrator")},</p>
              <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">${message ? escapeHtml(message).replace(/\n/g, "<br>") : `Please find below your AlfiePRO platform invoice for the period ${period}.`}</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#0284c7;border-radius:12px;padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Amount Due</p>
                          <p style="margin:4px 0 0;color:#ffffff;font-size:32px;font-weight:700;">${formatCurrency(record.total_amount)}</p>
                        </td>
                        <td width="50%" align="right">
                          <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Due Date</p>
                          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700;">${record.due_date ? formatShortDate(record.due_date) : "-"}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr><td colspan="2" style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Invoice Details</p></td></tr>
                ${row("Invoice Number", invoiceNo, "color:#0f172a;font-weight:600;")}
                ${row("Invoice Date", formatDate(record.created_at))}
                ${row("Billed To", escapeHtml(record.target_name), "color:#0f172a;font-weight:600;")}
                ${row("Billing Period", period)}
                ${row("Active Members", String(record.member_count))}
                ${row("Annual Rate", `${formatCurrency(annualRate)} per member / year`)}
                ${record.due_date ? row("Due Date", `${formatDate(record.due_date)}${isOverdue ? " (OVERDUE)" : ""}`, `color:${isOverdue ? "#dc2626" : "#0f172a"};font-weight:600;`) : ""}
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr><td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Fee Calculation</p></td></tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${calcRow(`${existingMembers} existing members x ${formatCurrency(periodRate)} for this period`, formatCurrency(existingMembers * periodRate))}
                      ${newMembers > 0 ? calcRow(`${newMembers} new members this period x ${formatCurrency(annualRate)} (full annual rate)`, formatCurrency(newMembers * annualRate)) : ""}
                      <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:10px;"></td></tr>
                      <tr>
                        <td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:700;">Total Due</td>
                        <td align="right" style="padding:6px 0;color:#0284c7;font-size:18px;font-weight:700;">${formatCurrency(record.total_amount)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #bae6fd;border-radius:12px;overflow:hidden;">
                <tr><td colspan="2" style="background-color:#f0f9ff;padding:14px 20px;border-bottom:1px solid #bae6fd;"><p style="margin:0;color:#0369a1;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">How to Pay - Direct Bank Transfer</p></td></tr>
                ${row("Account Name", BUSINESS.accountName, "color:#0f172a;font-weight:600;")}
                ${row("BSB", BUSINESS.bsb, "color:#0f172a;font-weight:600;")}
                ${row("Account Number", BUSINESS.accountNumber, "color:#0f172a;font-weight:600;")}
                ${row("Reference", invoiceNo, "color:#0f172a;font-weight:600;")}
                <tr><td colspan="2" style="padding:12px 20px;"><span style="color:#475569;font-size:12px;line-height:1.5;">Payment terms: ${BUSINESS.paymentTermsDays} days from invoice date. Please use the invoice number as your payment reference.</span></td></tr>
              </table>

              ${record.notes ? `
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Notes</p>
                <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">${escapeHtml(record.notes)}</p>
              </div>` : ""}

              <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;text-align:center;">
                If you have any questions about this invoice, simply reply to this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;line-height:1.5;">
                AlfiePRO is operated by ${BUSINESS.tradingName} &middot; ABN ${BUSINESS.abn}
              </p>
              <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.5;">
                Payment terms ${BUSINESS.paymentTermsDays} days from invoice date &middot; Bank: ${BUSINESS.accountName}, BSB ${BUSINESS.bsb}, Acc ${BUSINESS.accountNumber}
              </p>
              <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;">
                Powered by <strong style="color:#0284c7;">Alfie PRO</strong> - RC Yacht Management Software
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

async function isAuthorized(req: Request, adminClient: SupabaseClient, serviceRoleKey: string) {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  const { data: { user } } = await adminClient.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_super_admin === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    if (!(await isAuthorized(req, adminClient, supabaseKey))) {
      return jsonResponse({ error: "Not authorised" }, 403);
    }

    const { record_id, recipient_email, recipient_name, subject, message, preview } = await req.json();

    if (!record_id || (!preview && !recipient_email)) {
      return jsonResponse({ error: "record_id and recipient_email are required" }, 400);
    }

    const { data: record, error: recordError } = await adminClient
      .from("platform_billing_records")
      .select("*")
      .eq("id", record_id)
      .maybeSingle();

    if (recordError || !record) {
      return jsonResponse({ error: "Billing record not found" }, 404);
    }

    const { data: snapshot } = await adminClient
      .from("platform_billing_member_snapshots")
      .select("new_members_this_period")
      .eq("billing_record_id", record_id)
      .maybeSingle();

    const billingRecord = record as BillingRecord;
    const emailSubject =
      subject ||
      `AlfiePRO Invoice ${invoiceNumber(billingRecord)} - ${periodLabel(record.billing_period_start, record.billing_period_end)} - ${formatCurrency(record.total_amount)}`;

    const emailHtml = buildEmailHtml(
      billingRecord,
      snapshot?.new_members_this_period || 0,
      recipient_name || record.target_name,
      message || ""
    );

    if (preview) {
      return jsonResponse({ success: true, subject: emailSubject, html: emailHtml });
    }

    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("DEFAULT_FROM_EMAIL") || "noreply@alfiepro.com.au";

    if (!sendgridKey) {
      return jsonResponse({ error: "Email service not configured" }, 500);
    }

    const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          { to: [{ email: recipient_email, name: recipient_name || "" }], subject: emailSubject },
        ],
        from: { email: fromEmail, name: "Alfie PRO Platform" },
        content: [{ type: "text/html", value: emailHtml }],
      }),
    });

    if (!sgResponse.ok) {
      console.error("SendGrid error:", await sgResponse.text());
      return jsonResponse({ error: "Failed to send email" }, 500);
    }

    const updatePayload: Record<string, unknown> = {
      invoice_sent_at: new Date().toISOString(),
      invoice_sent_to: recipient_email,
      updated_at: new Date().toISOString(),
    };
    if (record.payment_status === "pending") {
      updatePayload.payment_status = "invoiced";
    }
    await adminClient.from("platform_billing_records").update(updatePayload).eq("id", record_id);

    return jsonResponse({ success: true, message: "Invoice email sent successfully" });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

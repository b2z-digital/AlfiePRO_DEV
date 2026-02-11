import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReportMember {
  member_name: string;
  member_email?: string;
  member_phone?: string;
  member_city?: string;
  member_state?: string;
  member_postcode?: string;
  member_country?: string;
  member_category?: string;
  membership_level?: string;
  date_joined?: string | null;
  club_name: string;
  state_fee: number;
  national_fee: number;
  membership_year: number;
  payment_date: string | null;
}

const CSV_FIELD_MAP: Record<string, { label: string; getValue: (m: ReportMember) => string }> = {
  member_name: { label: 'Member Name', getValue: (m) => m.member_name },
  club_name: { label: 'Club', getValue: (m) => m.club_name },
  national_fee: { label: 'National Fee', getValue: (m) => Number(m.national_fee).toFixed(2) },
  payment_date: { label: 'Payment Date', getValue: (m) => m.payment_date ? new Date(m.payment_date).toLocaleDateString() : '' },
  state_fee: { label: 'State Fee', getValue: (m) => Number(m.state_fee).toFixed(2) },
  membership_year: { label: 'Membership Year', getValue: (m) => String(m.membership_year) },
  member_email: { label: 'Email', getValue: (m) => m.member_email || '' },
  member_phone: { label: 'Phone', getValue: (m) => m.member_phone || '' },
  member_city: { label: 'City', getValue: (m) => m.member_city || '' },
  member_state: { label: 'State', getValue: (m) => m.member_state || '' },
  member_postcode: { label: 'Postcode', getValue: (m) => m.member_postcode || '' },
  member_country: { label: 'Country', getValue: (m) => m.member_country || '' },
  member_category: { label: 'Category', getValue: (m) => m.member_category || '' },
  membership_level: { label: 'Membership Type', getValue: (m) => m.membership_level || '' },
  date_joined: { label: 'Date Joined', getValue: (m) => m.date_joined ? new Date(m.date_joined).toLocaleDateString() : '' },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const {
      recipient_email,
      recipient_name,
      subject,
      notes,
      state_association_name,
      members,
      total_state,
      total_national,
      state_association_id,
      is_incremental,
      csv_fields
    } = await req.json();

    if (!recipient_email || !subject || !members || members.length === 0) {
      throw new Error('Missing required fields: recipient_email, subject, and members are required');
    }

    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const defaultFromEmail = Deno.env.get('DEFAULT_FROM_EMAIL');

    if (!sendGridApiKey || !defaultFromEmail) {
      throw new Error('Email service not configured. Please set SENDGRID_API_KEY and DEFAULT_FROM_EMAIL.');
    }

    const assocName = state_association_name || 'State Association';

    const clubGroups: Record<string, ReportMember[]> = {};
    for (const m of members as ReportMember[]) {
      if (!clubGroups[m.club_name]) clubGroups[m.club_name] = [];
      clubGroups[m.club_name].push(m);
    }

    const reportDate = new Date().toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const memberRows = (members as ReportMember[]).map((m: ReportMember) => `
      <tr>
        <td style="padding:10px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #e5e7eb">${m.member_name}</td>
        <td style="padding:10px 12px;font-size:14px;color:#64748b;border-bottom:1px solid #e5e7eb">${m.club_name}</td>
        <td style="padding:10px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">$${Number(m.national_fee).toFixed(2)}</td>
        <td style="padding:10px 12px;font-size:14px;color:#64748b;border-bottom:1px solid #e5e7eb;text-align:center">${m.payment_date ? new Date(m.payment_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
      </tr>
    `).join('');

    const clubSummaryRows = Object.entries(clubGroups).map(([clubName, clubMembers]) => {
      const clubTotal = clubMembers.reduce((s: number, m: ReportMember) => s + Number(m.national_fee), 0);
      return `
        <tr>
          <td style="padding:8px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #e5e7eb">${clubName}</td>
          <td style="padding:8px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #e5e7eb;text-align:center">${clubMembers.length}</td>
          <td style="padding:8px 12px;font-size:14px;color:#1f2937;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">$${clubTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const reportTypeLabel = is_incremental ? 'Incremental Update' : 'Full Member List';
    const reportTypeBadge = is_incremental
      ? '<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background-color:#fff7ed;color:#ea580c;border:1px solid #fed7aa">Incremental Update</span>'
      : '<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background-color:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0">Full Member List</span>';

    const notesSection = notes ? `
      <div style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:24px 0 0;border:1px solid #e2e8f0">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Notes</p>
        <p style="margin:0;font-size:15px;color:#334155;line-height:1.6">${notes}</p>
      </div>
    ` : '';

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f1f5f9">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">

          <tr>
            <td style="background:linear-gradient(135deg,#0d9488 0%,#059669 100%);padding:36px 40px;text-align:center">
              <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;letter-spacing:-.3px">Member Payment Report</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,.9);font-size:15px">${reportDate}</p>
              <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px">From: ${assocName}</p>
              <div style="margin:14px 0 0">${reportTypeBadge}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 40px 0">
              <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1f2937">
                Dear ${recipient_name || 'National Association'},
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569">
                Please find below the ${is_incremental ? 'updated' : 'complete'} list of member payments processed by <strong>${assocName}</strong>.
                This report includes <strong>${members.length} member${members.length !== 1 ? 's' : ''}</strong> across
                <strong>${Object.keys(clubGroups).length} club${Object.keys(clubGroups).length !== 1 ? 's' : ''}</strong>.
              </p>

              <div style="display:flex;gap:12px;margin:0 0 28px">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="50%" style="padding-right:8px">
                      <div style="background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border-radius:12px;padding:20px;text-align:center;border:1px solid #a7f3d0">
                        <p style="margin:0;font-size:13px;color:#047857;font-weight:600">${assocName}</p>
                        <p style="margin:8px 0 0;font-size:28px;font-weight:700;color:#065f46">$${Number(total_national).toFixed(2)}</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#047857;font-weight:500">Total Payment to National</p>
                      </div>
                    </td>
                    <td width="50%" style="padding-left:8px">
                      <div style="background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border-radius:12px;padding:20px;text-align:center;border:1px solid #a7f3d0">
                        <p style="margin:0;font-size:28px;font-weight:700;color:#065f46">${members.length}</p>
                        <p style="margin:4px 0 0;font-size:13px;color:#047857;font-weight:500">Total Members</p>
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <h2 style="margin:0 0 12px;font-size:17px;font-weight:600;color:#1e293b">Club Summary</h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 28px">
                <tr style="background-color:#f8fafc">
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Club</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Members</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">National Fee</th>
                </tr>
                ${clubSummaryRows}
                <tr style="background-color:#f0fdf4">
                  <td style="padding:10px 12px;font-size:14px;color:#065f46;font-weight:700">Total</td>
                  <td style="padding:10px 12px;font-size:14px;color:#065f46;font-weight:700;text-align:center">${members.length}</td>
                  <td style="padding:10px 12px;font-size:14px;color:#065f46;font-weight:700;text-align:right">$${Number(total_national).toFixed(2)}</td>
                </tr>
              </table>

              <h2 style="margin:0 0 12px;font-size:17px;font-weight:600;color:#1e293b">Member Details</h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 12px">
                <tr style="background-color:#f8fafc">
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Member</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Club</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">National Fee</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0">Paid Date</th>
                </tr>
                ${memberRows}
                <tr style="background-color:#f0fdf4">
                  <td colspan="2" style="padding:10px 12px;font-size:14px;color:#065f46;font-weight:700">Total (${members.length} members)</td>
                  <td style="padding:10px 12px;font-size:14px;color:#065f46;font-weight:700;text-align:right">$${Number(total_national).toFixed(2)}</td>
                  <td></td>
                </tr>
              </table>

              ${notesSection}

              <div style="margin:28px 0 0;padding:20px 0 0;border-top:1px solid #e5e7eb">
                <p style="margin:0;font-size:15px;color:#374151">Kind regards,</p>
                <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#1f2937">${assocName}</p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f8fafc;padding:28px 40px;text-align:center;border-top:1px solid #e5e7eb;margin-top:32px">
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">This report was generated automatically</p>
              <p style="margin:0;font-size:12px;color:#cbd5e1">Powered by <strong style="color:#0d9488">Alfie PRO</strong> - RC Yacht Management Software</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const selectedFields = (csv_fields && Array.isArray(csv_fields) && csv_fields.length > 0)
      ? csv_fields.filter((f: string) => CSV_FIELD_MAP[f])
      : ['member_name', 'club_name', 'state_fee', 'national_fee', 'membership_year', 'payment_date'];

    const csvHeaders = selectedFields.map((f: string) => CSV_FIELD_MAP[f].label);
    const csvDataRows = (members as ReportMember[]).map((m: ReportMember) =>
      selectedFields.map((f: string) => `"${CSV_FIELD_MAP[f].getValue(m)}"`)
    );

    const totalRow = selectedFields.map((f: string) => {
      if (f === 'member_name') return '"TOTALS"';
      if (f === 'national_fee') return `${Number(total_national).toFixed(2)}`;
      if (f === 'state_fee') return `${Number(total_state).toFixed(2)}`;
      return '""';
    });

    const memberCountRow = selectedFields.map((f: string, i: number) => {
      if (i === 0) return '"Total Members"';
      if (i === 1) return `${members.length}`;
      return '""';
    });

    const csvRows = [
      csvHeaders.join(','),
      ...csvDataRows.map((r: string[]) => r.join(',')),
      '',
      totalRow.join(','),
      memberCountRow.join(',')
    ].join('\n');

    const csvBase64 = btoa(unescape(encodeURIComponent(csvRows)));
    const year = (members as ReportMember[])[0]?.membership_year || new Date().getFullYear();

    const emailData: any = {
      personalizations: [{
        to: [{ email: recipient_email, name: recipient_name || 'National Association' }],
        subject: subject
      }],
      from: { email: defaultFromEmail, name: `${assocName} - Alfie PRO` },
      content: [{
        type: 'text/html',
        value: htmlContent
      }],
      attachments: [{
        content: csvBase64,
        filename: `national-member-report-${year}.csv`,
        type: 'text/csv',
        disposition: 'attachment'
      }]
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendGridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SendGrid error:', response.status, errorText);
      throw new Error('Failed to send email via SendGrid');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Report email sent successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending national report:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

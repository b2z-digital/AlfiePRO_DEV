import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EmailRequest {
  email_type: string
  recipient_email: string
  member_data: {
    first_name: string
    last_name: string
    club_name: string
    membership_type?: string
    renewal_date?: string
    amount?: number
    currency?: string
    club_id?: string
    user_id?: string
    member_id?: string
    bank_name?: string
    bsb?: string
    account_number?: string
    payment_method?: string
    event_name?: string
    event_date?: string
    event_location?: string
    app_url?: string
  }
  custom_template?: {
    subject: string
    body: string
  }
}

interface ClubInfo {
  name: string
  logo: string | null
  secretary_name: string | null
  secretary_email: string | null
}

const TYPE_ALIASES: Record<string, string> = {
  'renewal': 'renewal_reminder',
}

const defaultTemplates: Record<string, { subject: string; body: string }> = {
  welcome: {
    subject: 'Welcome to {{clubName}}!',
    body: `<p>Dear {{firstName}},</p><p>We're thrilled to welcome you as a new member of {{clubName}}!</p><p>Your membership is now active, and you can start enjoying all the benefits of being a member, including participating in our racing events and club activities.</p><h2>Getting Started</h2><ul><li>Access your dashboard to manage your profile</li><li>View upcoming events and register for races</li><li>Connect with other club members</li><li>Stay updated with club news and announcements</li></ul><p>If you have any questions or need assistance getting started, please don't hesitate to reach out to us.</p><p>Welcome aboard!</p>`
  },
  renewal_reminder: {
    subject: 'Time to renew your {{clubName}} membership',
    body: `<p>Hi {{firstName}},</p><p>Your {{membershipType}} membership with {{clubName}} is due for renewal.</p><h2 class="ql-align-center"><strong>Membership Details</strong></h2><p class="ql-align-center"><strong>Membership Type</strong>: {{membershipType}}</p><p class="ql-align-center"><strong>Renewal Date</strong>: {{renewalDate}}</p><p class="ql-align-center"><br></p><p class="ql-align-center">To keep racing and enjoying all club benefits without interruption,</p><p class="ql-align-center">you can renew your membership in just a few minutes:</p><p class="ql-align-center"><br></p><p class="ql-align-center">\u{1F449} <strong>Renew via AlfiePRO App</strong></p><p class="ql-align-center"><em>Open AlfiePRO \u2192 Tap your profile \u2192 Membership</em></p><p class="ql-align-center"><strong>OR</strong></p><p class="ql-align-center">\u{1F449} <strong>Renew Online</strong></p><p class="ql-align-center"><a href="{{renewalLink}}" rel="noopener noreferrer" target="_blank">Renew My Membership</a></p><h3><br></h3><h3><strong>\u26A0\uFE0F Why renew now?</strong></h3><p>Renewing before your expiry ensures:</p><ul><li>You stay eligible to race</li><li>Your results and rankings continue uninterrupted</li><li>You remain covered under association insurance</li><li>If you have any questions or need help, just email<strong> {{secretaryName}}</strong> - {{secretaryEmail}}</li></ul><p>Thank you for being a valued member of {{clubName}}!</p>`
  },
  event: {
    subject: 'New Event: {{eventName}}',
    body: `<p>Hi {{firstName}},</p><p>We're excited to announce a new upcoming event at {{clubName}}!</p><h2>{{eventName}}</h2><p>\u{1F4C5} Date{{eventDate}}\u{1F4CD} Location{{eventLocation}}</p><p>We hope to see you there! This is a great opportunity to connect with fellow members and enjoy some great racing.</p><p><a href="{{eventLink}}" rel="noopener noreferrer" target="_blank">View Event Details</a></p><p>For more information and to RSVP, please log in to your account or contact us directly.</p><p>See you on the water!</p><p><br></p><p>Best regards,</p>`
  },
  application_approved: {
    subject: 'Your membership application has been approved!',
    body: `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Congratulations {{firstName}} {{lastName}}!</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Your membership application to <strong>{{clubName}}</strong> has been approved.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">You are now a member of our club and can start participating in our events and activities.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">Welcome to the {{clubName}} family!</p>`
  },
  application_rejected: {
    subject: 'Update on your membership application',
    body: `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Dear {{firstName}} {{lastName}},</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Thank you for your interest in joining <strong>{{clubName}}</strong>.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Unfortunately, we are unable to approve your membership application at this time.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">If you have any questions about this decision, please feel free to contact us.</p>`
  },
  payment_confirmation: {
    subject: 'Payment confirmation for {{clubName}} membership',
    body: `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Payment Received - Thank you {{firstName}} {{lastName}}!</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">We have successfully received your payment of {{amount}} {{currency}} for your <strong>{{clubName}}</strong> membership.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Your membership is now active until {{renewalDate}}.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">Thank you for your continued support of {{clubName}}.</p>`
  },
  membership_expired: {
    subject: 'Your {{clubName}} membership has expired',
    body: `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Hi {{firstName}},</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Your membership with <strong>{{clubName}}</strong> has expired as of {{renewalDate}}.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">To continue participating in club activities, please renew your membership as soon as possible.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">You can renew your membership by logging into your account or contacting us directly.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">We hope to see you back as an active member soon!</p>`
  },
  password_reset: {
    subject: 'Your {{clubName}} password has been reset',
    body: `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Hi {{firstName}},</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Your password for <strong>{{clubName}}</strong> has been reset by a club administrator.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">You can now log in to your account using your email address and the new password provided by your club admin.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">If you did not expect this change, please contact your club administrator.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">For security, we recommend changing your password after logging in.</p>`
  },
  renewal_pending: {
    subject: 'Your {{clubName}} membership renewal - Payment Required',
    body: `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Hi {{firstName}},</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Your <strong>{{membershipType}}</strong> membership with <strong>{{clubName}}</strong> has been renewed and is now awaiting payment.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
  <tr><td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Membership Details</p></td></tr>
  <tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;width:40%;"><span style="color:#64748b;font-size:13px;">Membership Type</span></td>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">{{membershipType}}</span></td>
      </tr>
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;font-size:13px;">Amount Due</span></td>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">{{amount}} {{currency}}</span></td>
      </tr>
      <tr>
        <td style="padding:12px 20px;"><span style="color:#64748b;font-size:13px;">Valid Until</span></td>
        <td style="padding:12px 20px;"><span style="color:#0f172a;font-size:13px;font-weight:600;">{{renewalDate}}</span></td>
      </tr>
    </table>
  </td></tr>
</table>
{{bankDetails}}
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Please use your <strong>full name</strong> as the payment reference so we can identify your payment.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">Once your payment is received, your membership will be confirmed and you'll receive a payment confirmation email.</p>`
  },
  application_received: {
    subject: 'Application Received - {{clubName}}',
    body: `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">Thank you for your application, {{firstName}} {{lastName}}!</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">We have received your membership application to <strong>{{clubName}}</strong>.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
  <tr><td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Application Details</p></td></tr>
  <tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;width:40%;"><span style="color:#64748b;font-size:13px;">Name</span></td>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">{{firstName}} {{lastName}}</span></td>
      </tr>
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;font-size:13px;">Membership Type</span></td>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">{{membershipType}}</span></td>
      </tr>
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;font-size:13px;">Payment Method</span></td>
        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">{{paymentMethod}}</span></td>
      </tr>
    </table>
  </td></tr>
</table>
{{bankDetails}}
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">Your application will be reviewed by our committee, and we'll notify you once a decision has been made.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">If you have any questions, please don't hesitate to contact us.</p>`
  }
}

const HEADER_SUBTITLES: Record<string, string> = {
  'welcome': 'Welcome to the Club!',
  'renewal': 'Membership Renewal',
  'renewal_reminder': 'Membership Renewal',
  'event': 'Event Invitation',
  'application_received': 'Application Received',
  'application_approved': 'Application Approved',
  'application_rejected': 'Application Update',
  'payment_confirmation': 'Payment Confirmation',
  'renewal_pending': 'Membership Renewal - Payment Required',
  'membership_expired': 'Membership Expired',
  'password_reset': 'Password Reset',
}

function replacePlaceholders(template: string, data: EmailRequest['member_data'], clubInfo?: ClubInfo): string {
  let result = template

  result = result.replace(/\{\{member_name\}\}/g, `${data.first_name} ${data.last_name}`)
  result = result.replace(/\{\{memberName\}\}/g, `${data.first_name} ${data.last_name}`)
  result = result.replace(/\{\{first_name\}\}/g, data.first_name || '')
  result = result.replace(/\{\{firstName\}\}/g, data.first_name || '')
  result = result.replace(/\{\{last_name\}\}/g, data.last_name || '')
  result = result.replace(/\{\{lastName\}\}/g, data.last_name || '')
  result = result.replace(/\{\{club_name\}\}/g, data.club_name || '')
  result = result.replace(/\{\{clubName\}\}/g, data.club_name || '')

  const secName = clubInfo?.secretary_name || 'Club Secretary'
  const secEmail = clubInfo?.secretary_email || ''
  result = result.replace(/\{\{secretary_name\}\}/g, secName)
  result = result.replace(/\{\{secretaryName\}\}/g, secName)
  result = result.replace(/\{\{secretary_email\}\}/g, secEmail)
  result = result.replace(/\{\{secretaryEmail\}\}/g, secEmail)

  if (data.membership_type) {
    result = result.replace(/\{\{membership_type\}\}/g, data.membership_type)
    result = result.replace(/\{\{membershipType\}\}/g, data.membership_type)
  }

  if (data.renewal_date) {
    const formattedDate = new Date(data.renewal_date).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    result = result.replace(/\{\{renewal_date\}\}/g, formattedDate)
    result = result.replace(/\{\{renewalDate\}\}/g, formattedDate)
  }

  if (data.amount && data.currency) {
    result = result.replace(/\{\{amount\}\}/g, `$${data.amount.toFixed(2)}`)
    result = result.replace(/\{\{currency\}\}/g, data.currency)
  }

  const appBaseUrl = data.app_url || 'https://alfiepro.com.au'
  const renewalUrl = `${appBaseUrl}/my-membership`
  result = result.replace(/\{\{renewal_link\}\}/g, renewalUrl)
  result = result.replace(/\{\{renewalLink\}\}/g, renewalUrl)
  result = result.replace(/\{\{event_name\}\}/g, data.event_name || '')
  result = result.replace(/\{\{eventName\}\}/g, data.event_name || '')
  result = result.replace(/\{\{event_date\}\}/g, data.event_date || '')
  result = result.replace(/\{\{eventDate\}\}/g, data.event_date || '')
  result = result.replace(/\{\{event_location\}\}/g, data.event_location || 'TBA')
  result = result.replace(/\{\{eventLocation\}\}/g, data.event_location || 'TBA')
  result = result.replace(/\{\{event_link\}\}/g, '#')
  result = result.replace(/\{\{eventLink\}\}/g, '#')

  if (data.payment_method) {
    const methodLabel = data.payment_method === 'bank_transfer' ? 'Bank Transfer' : 'Credit Card';
    result = result.replace(/\{\{payment_method\}\}/g, methodLabel)
    result = result.replace(/\{\{paymentMethod\}\}/g, methodLabel)
  }

  if (data.bank_name || data.bsb || data.account_number) {
    const bankDetailsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Bank Payment Details</p></td></tr>
        <tr><td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${data.bank_name ? `<tr><td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;width:40%;"><span style="color:#64748b;font-size:13px;">Bank Name</span></td><td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">${data.bank_name}</span></td></tr>` : ''}
            ${data.bsb ? `<tr><td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;font-size:13px;">BSB</span></td><td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">${data.bsb}</span></td></tr>` : ''}
            ${data.account_number ? `<tr><td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;font-size:13px;">Account Number</span></td><td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;"><span style="color:#0f172a;font-size:13px;font-weight:600;">${data.account_number}</span></td></tr>` : ''}
            <tr><td style="padding:12px 20px;"><span style="color:#64748b;font-size:13px;">Reference</span></td><td style="padding:12px 20px;"><span style="color:#0f172a;font-size:13px;font-weight:600;">Use your name as the payment reference</span></td></tr>
          </table>
        </td></tr>
      </table>`;
    result = result.replace(/\{\{bank_details\}\}/g, bankDetailsHtml)
    result = result.replace(/\{\{bankDetails\}\}/g, bankDetailsHtml)
  } else {
    result = result.replace(/\{\{bank_details\}\}/g, '')
    result = result.replace(/\{\{bankDetails\}\}/g, '')
  }

  return result
}

function convertQuillClassesToInlineStyles(html: string): string {
  let result = html

  result = result.replace(/<(\w+)\s+class="ql-align-center"([^>]*)>/g, (_, tag, rest) => {
    return `<${tag} style="text-align:center;"${rest}>`
  })
  result = result.replace(/<(\w+)\s+class="ql-align-right"([^>]*)>/g, (_, tag, rest) => {
    return `<${tag} style="text-align:right;"${rest}>`
  })
  result = result.replace(/<(\w+)\s+class="ql-align-justify"([^>]*)>/g, (_, tag, rest) => {
    return `<${tag} style="text-align:justify;"${rest}>`
  })
  result = result.replace(/<(\w+)([^>]*)\s+class="ql-indent-(\d+)"([^>]*)>/g, (_, tag, before, level, after) => {
    const px = parseInt(level) * 30
    return `<${tag}${before} style="padding-left:${px}px;"${after}>`
  })

  result = result.replace(/<p(\s?)>/g, '<p style="margin:0 0 2px;line-height:1.6;"$1>')
  result = result.replace(/<p style="text-align:(center|right|justify);">/g,
    (_, align) => `<p style="margin:0 0 2px;line-height:1.6;text-align:${align};">`)

  result = result.replace(/<p style="margin:0 0 2px;line-height:1\.6;"><br><\/p>/g,
    '<p style="margin:0 0 12px;line-height:1.6;"><br></p>')

  return result
}

function buildEmailHtml(content: string, clubName: string, headerSubtitle: string, clubLogoUrl: string | null, senderName: string): string {
  if (content.trim().startsWith('<!DOCTYPE html>') || content.trim().startsWith('<html')) {
    return content
  }

  const logoHtml = clubLogoUrl
    ? `<img src="${clubLogoUrl}" alt="${clubName}" style="max-width:80px;height:auto;margin:0 0 12px;border-radius:8px;background:rgba(255,255,255,0.15);padding:6px" /><br/>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerSubtitle}</title>
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
                    ${logoHtml}
                    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${clubName}</h1>
                    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${headerSubtitle}</p>
                  </td>
                  <td align="right" valign="top">
                    <div style="background:rgba(255,255,255,0.2);border-radius:10px;padding:8px 14px;display:inline-block;">
                      <span style="color:#ffffff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Alfie PRO</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <div style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
                ${content}
              </div>

              <div style="margin:24px 0 0;padding:20px 0 0;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:15px;color:#334155;">Best regards,</p>
                <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#0f172a;">${senderName}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.5;">This email was sent by ${clubName}</p>
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
</html>`
}

async function getClubInfo(supabase: any, clubId: string): Promise<ClubInfo> {
  const { data: clubData } = await supabase
    .from('clubs')
    .select('name, logo')
    .eq('id', clubId)
    .maybeSingle()

  let secretaryName: string | null = null
  let secretaryEmail: string | null = null

  const { data: secretary } = await supabase
    .from('committee_positions')
    .select('name, email, position_title, member_id')
    .eq('club_id', clubId)
    .or('position_title.ilike.%secretary%,title.ilike.%secretary%')
    .limit(1)
    .maybeSingle()

  if (secretary) {
    secretaryName = secretary.name || null
    secretaryEmail = secretary.email || null

    if ((!secretaryName || !secretaryEmail) && secretary.member_id) {
      const { data: member } = await supabase
        .from('members')
        .select('first_name, last_name, email')
        .eq('id', secretary.member_id)
        .maybeSingle()

      if (member) {
        if (!secretaryName) secretaryName = `${member.first_name || ''} ${member.last_name || ''}`.trim()
        if (!secretaryEmail) secretaryEmail = member.email || null
      }
    }
  }

  return {
    name: clubData?.name || 'Your Club',
    logo: clubData?.logo || null,
    secretary_name: secretaryName,
    secretary_email: secretaryEmail,
  }
}

async function sendMembershipEmail(
  supabase: any,
  emailData: EmailRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    const resolvedType = TYPE_ALIASES[emailData.email_type] || emailData.email_type
    let template = defaultTemplates[resolvedType] || defaultTemplates[emailData.email_type]

    if (!template) {
      template = { subject: 'Notification from {{clubName}}', body: '<p>You have a notification from {{clubName}}.</p>' }
    }

    if (emailData.custom_template) {
      template = emailData.custom_template
    } else if (emailData.member_data.club_id) {
      const { data: customTemplate } = await supabase
        .from('email_templates')
        .select('subject, body')
        .eq('club_id', emailData.member_data.club_id)
        .eq('template_key', emailData.email_type)
        .maybeSingle()

      if (customTemplate) {
        template = customTemplate
      }
    }

    const clubInfo = emailData.member_data.club_id
      ? await getClubInfo(supabase, emailData.member_data.club_id)
      : { name: emailData.member_data.club_name || 'Your Club', logo: null, secretary_name: null, secretary_email: null }

    emailData.member_data.club_name = clubInfo.name

    const subject = replacePlaceholders(template.subject, emailData.member_data, clubInfo)
    const bodyContent = convertQuillClassesToInlineStyles(
      replacePlaceholders(template.body, emailData.member_data, clubInfo)
    )

    const headerSubtitle = HEADER_SUBTITLES[emailData.email_type] || HEADER_SUBTITLES[resolvedType] || 'Club Notification'
    const senderDisplayName = clubInfo.secretary_name
      ? `${clubInfo.secretary_name}, ${clubInfo.name}`
      : `${clubInfo.name} Committee`

    const html = buildEmailHtml(bodyContent, clubInfo.name, headerSubtitle, clubInfo.logo, senderDisplayName)

    const fromEmail = 'noreply@alfiepro.com.au'
    const fromName = clubInfo.secretary_name
      ? `${clubInfo.secretary_name} - ${clubInfo.name}`
      : clubInfo.name

    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY')
    if (!sendGridApiKey) {
      console.log('Email simulation (SendGrid not configured):', { to: emailData.recipient_email, subject })
      return { success: true }
    }

    const recipientName = `${emailData.member_data.first_name} ${emailData.member_data.last_name}`

    const sgPayload = {
      personalizations: [{
        to: [{ email: emailData.recipient_email, name: recipientName }],
        subject,
      }],
      from: { email: fromEmail, name: fromName },
      reply_to: clubInfo.secretary_email
        ? { email: clubInfo.secretary_email, name: clubInfo.secretary_name || clubInfo.name }
        : undefined,
      content: [{
        type: 'text/html',
        value: html,
      }],
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendGridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sgPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('SendGrid error:', response.status, errorText)
      throw new Error(`SendGrid API error: ${errorText}`)
    }

    try {
      await supabase
        .from('email_logs')
        .insert({
          club_id: emailData.member_data.club_id || null,
          user_id: emailData.member_data.user_id || null,
          recipient_email: emailData.recipient_email,
          subject,
          body: html,
          email_type: emailData.email_type,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
    } catch (logError) {
      console.error('Error logging email:', logError)
    }

    return { success: true }

  } catch (error) {
    console.error('Error sending email:', error)

    try {
      await supabase
        .from('email_logs')
        .insert({
          club_id: emailData.member_data.club_id || null,
          user_id: emailData.member_data.user_id || null,
          recipient_email: emailData.recipient_email,
          subject: `Failed: ${emailData.email_type}`,
          body: 'Email failed to send',
          email_type: emailData.email_type,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          sent_at: new Date().toISOString()
        })
    } catch (logError) {
      console.error('Error logging failed email:', logError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const isServiceRole = token === serviceRoleKey

    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
      if (authError || !user) {
        throw new Error('Unauthorized')
      }
    }

    const requestData = await req.json() as EmailRequest

    if (!requestData.email_type || !requestData.recipient_email || !requestData.member_data) {
      throw new Error('Missing required fields')
    }

    const result = await sendMembershipEmail(supabaseClient, requestData)

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 400
      }
    )

  } catch (error) {
    console.error('Function error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})

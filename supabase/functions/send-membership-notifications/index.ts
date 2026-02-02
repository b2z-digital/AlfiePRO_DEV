import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EmailRequest {
  email_type: 'welcome' | 'application_approved' | 'application_rejected' | 'renewal_reminder' | 'payment_confirmation' | 'membership_expired' | 'application_received' | 'event'
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
    bank_name?: string
    bsb?: string
    account_number?: string
    payment_method?: string
    event_name?: string
    event_date?: string
    event_location?: string
  }
  custom_template?: {
    subject: string
    body: string
  }
}

const defaultTemplates = {
  welcome: {
    subject: 'Welcome to {{clubName}}!',
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to {{clubName}}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)">
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:40px 40px 30px;text-align:center">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-.5px">{{clubName}}</h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.95);font-size:16px">Welcome to the Club!</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1f2937">Dear {{firstName}} {{lastName}},</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">We're thrilled to welcome you as a new member of {{clubName}}!</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">Your membership is now active, and you can start enjoying all the benefits of being a member, including participating in our racing events and club activities.</p>
              <div style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-radius:10px;padding:28px;margin:32px 0;border:1px solid #bfdbfe">
                <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1e40af">Getting Started</h2>
                <ul style="margin:0;padding:0 0 0 20px;color:#374151;line-height:1.8">
                  <li>Access your dashboard to manage your profile</li>
                  <li>View upcoming events and register for races</li>
                  <li>Connect with other club members</li>
                  <li>Stay updated with club news and announcements</li>
                </ul>
              </div>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">If you have any questions or need assistance getting started, please don't hesitate to reach out to us.</p>
              <p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#374151">Welcome aboard!</p>
              <div style="margin:32px 0 0;padding:20px 0 0;border-top:1px solid #e5e7eb">
                <p style="margin:0;font-size:16px;color:#374151">Best regards,</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#1f2937">{{clubName}} Committee</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 12px;font-size:14px;color:#64748b;line-height:1.5">This email was sent by {{clubName}}</p>
              <p style="margin:0;font-size:13px;color:#94a3b8">Powered by <strong style="color:#2563eb">Alfie PRO</strong> - RC Yacht Management Software</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  },
  renewal_reminder: {
    subject: 'Time to renew your {{clubName}} membership',
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Membership Renewal - {{clubName}}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)">
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:40px 40px 30px;text-align:center">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-.5px">{{clubName}}</h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.95);font-size:16px">Membership Renewal Reminder</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1f2937">Hi {{firstName}},</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">Your {{membershipType}} membership with {{clubName}} is due for renewal.</p>
              <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-radius:10px;padding:28px;margin:32px 0;border:1px solid #fbbf24">
                <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#92400e">Membership Details</h2>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:8px 0;font-size:15px;color:#78350f;width:45%">Membership Type</td>
                    <td style="padding:8px 0;font-size:15px;color:#1f2937;font-weight:600">{{membershipType}}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:15px;color:#78350f">Renewal Date</td>
                    <td style="padding:8px 0;font-size:15px;color:#dc2626;font-weight:600">{{renewalDate}}</td>
                  </tr>
                </table>
              </div>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#374151">To continue enjoying all the benefits of membership and participating in club racing, please renew your membership as soon as possible.</p>
              <div style="text-align:center;margin:32px 0">
                <a href="{{renewalLink}}" style="display:inline-block;padding:14px 40px;background-color:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;box-shadow:0 4px 6px rgba(22,163,74,.2)">Renew My Membership</a>
              </div>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">If you have any questions about your membership or need assistance with renewal, please don't hesitate to contact us.</p>
              <p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#374151">Thank you for being a valued member of {{clubName}}!</p>
              <div style="margin:32px 0 0;padding:20px 0 0;border-top:1px solid #e5e7eb">
                <p style="margin:0;font-size:16px;color:#374151">Best regards,</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#1f2937">{{clubName}} Committee</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 12px;font-size:14px;color:#64748b;line-height:1.5">This email was sent by {{clubName}}</p>
              <p style="margin:0;font-size:13px;color:#94a3b8">Powered by <strong style="color:#2563eb">Alfie PRO</strong> - RC Yacht Management Software</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  },
  event: {
    subject: 'New Event: {{eventName}}',
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event Invitation - {{clubName}}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)">
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:40px 40px 30px;text-align:center">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-.5px">{{clubName}}</h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.95);font-size:16px">You're Invited!</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1f2937">Hi {{firstName}},</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">We're excited to announce a new upcoming event at {{clubName}}!</p>
              <div style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-radius:10px;padding:28px;margin:32px 0;border:1px solid #bfdbfe">
                <h2 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#1e40af;text-align:center">{{eventName}}</h2>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:8px 0;font-size:15px;color:#64748b;width:35%">📅 Date</td>
                    <td style="padding:8px 0;font-size:15px;color:#1f2937;font-weight:600">{{eventDate}}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:15px;color:#64748b">📍 Location</td>
                    <td style="padding:8px 0;font-size:15px;color:#1f2937;font-weight:600">{{eventLocation}}</td>
                  </tr>
                </table>
              </div>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#374151">We hope to see you there! This is a great opportunity to connect with fellow members and enjoy some great racing.</p>
              <div style="text-align:center;margin:32px 0">
                <a href="{{eventLink}}" style="display:inline-block;padding:14px 40px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;box-shadow:0 4px 6px rgba(37,99,235,.2)">View Event Details</a>
              </div>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">For more information and to RSVP, please log in to your account or contact us directly.</p>
              <p style="margin:0 0 8px;font-size:16px;line-height:1.7;color:#374151">See you on the water!</p>
              <div style="margin:32px 0 0;padding:20px 0 0;border-top:1px solid #e5e7eb">
                <p style="margin:0;font-size:16px;color:#374151">Best regards,</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#1f2937">{{clubName}} Committee</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 12px;font-size:14px;color:#64748b;line-height:1.5">This email was sent by {{clubName}}</p>
              <p style="margin:0;font-size:13px;color:#94a3b8">Powered by <strong style="color:#2563eb">Alfie PRO</strong> - RC Yacht Management Software</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  },
  application_approved: {
    subject: 'Your membership application has been approved!',
    body: `<h2>Congratulations {{member_name}}!</h2><p>Your membership application to {{club_name}} has been approved.</p><p>You are now a member of our club and can start participating in our events and activities.</p><p>Welcome to the {{club_name}} family!</p><p>Best regards,<br>{{club_name}} Committee</p>`
  },
  application_rejected: {
    subject: 'Update on your membership application',
    body: `<h2>Dear {{member_name}},</h2><p>Thank you for your interest in joining {{club_name}}.</p><p>Unfortunately, we are unable to approve your membership application at this time.</p><p>If you have any questions about this decision, please feel free to contact us.</p><p>Best regards,<br>{{club_name}} Committee</p>`
  },
  payment_confirmation: {
    subject: 'Payment confirmation for {{club_name}} membership',
    body: `<h2>Payment Received - Thank you {{member_name}}!</h2><p>We have successfully received your payment of {{amount}} {{currency}} for your {{club_name}} membership.</p><p>Your membership is now active until {{renewal_date}}.</p><p>Thank you for your continued support of {{club_name}}.</p><p>Best regards,<br>{{club_name}} Committee</p>`
  },
  membership_expired: {
    subject: 'Your {{club_name}} membership has expired',
    body: `<h2>Hi {{member_name}},</h2><p>Your membership with {{club_name}} has expired as of {{renewal_date}}.</p><p>To continue participating in club activities, please renew your membership as soon as possible.</p><p>You can renew your membership by logging into your account or contacting us directly.</p><p>We hope to see you back as an active member soon!</p><p>Best regards,<br>{{club_name}} Committee</p>`
  },
  application_received: {
    subject: 'Application Received - {{club_name}}',
    body: `<h2>Thank you for your application, {{member_name}}!</h2><p>We have received your membership application to {{club_name}}.</p><p><strong>Application Details:</strong></p><ul><li><strong>Name:</strong> {{member_name}}</li><li><strong>Membership Type:</strong> {{membership_type}}</li><li><strong>Amount:</strong> {{amount}} {{currency}}</li><li><strong>Payment Method:</strong> {{payment_method}}</li></ul>{{bank_details}}<p>Your application will be reviewed by our committee, and we'll notify you once a decision has been made.</p><p>If you have any questions, please don't hesitate to contact us.</p><p>Best regards,<br>{{club_name}} Committee</p>`
  }
}

function replacePlaceholders(template: string, data: EmailRequest['member_data']): string {
  let result = template

  result = result.replace(/\{\{member_name\}\}/g, `${data.first_name} ${data.last_name}`)
  result = result.replace(/\{\{memberName\}\}/g, `${data.first_name} ${data.last_name}`)
  result = result.replace(/\{\{first_name\}\}/g, data.first_name || '')
  result = result.replace(/\{\{firstName\}\}/g, data.first_name || '')
  result = result.replace(/\{\{last_name\}\}/g, data.last_name || '')
  result = result.replace(/\{\{lastName\}\}/g, data.last_name || '')
  result = result.replace(/\{\{club_name\}\}/g, data.club_name || '')
  result = result.replace(/\{\{clubName\}\}/g, data.club_name || '')

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

  result = result.replace(/\{\{renewal_link\}\}/g, '#')
  result = result.replace(/\{\{renewalLink\}\}/g, '#')

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
      <p><strong>Bank Payment Details:</strong></p>
      <ul>
        ${data.bank_name ? `<li><strong>Bank Name:</strong> ${data.bank_name}</li>` : ''}
        ${data.bsb ? `<li><strong>BSB:</strong> ${data.bsb}</li>` : ''}
        ${data.account_number ? `<li><strong>Account Number:</strong> ${data.account_number}</li>` : ''}
        <li><strong>Reference:</strong> Use your name as the payment reference</li>
      </ul>
    `;
    result = result.replace(/\{\{bank_details\}\}/g, bankDetailsHtml)
    result = result.replace(/\{\{bankDetails\}\}/g, bankDetailsHtml)
  } else {
    result = result.replace(/\{\{bank_details\}\}/g, '')
    result = result.replace(/\{\{bankDetails\}\}/g, '')
  }

  return result
}

function wrapContentInEmailTemplate(content: string, clubName: string, headerText: string): string {
  if (content.trim().startsWith('<!DOCTYPE html>') || content.trim().startsWith('<html')) {
    return content
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerText}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)">
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:40px 40px 30px;text-align:center">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-.5px">${clubName}</h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.95);font-size:16px">${headerText}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 12px;font-size:14px;color:#64748b;line-height:1.5">This email was sent by ${clubName}</p>
              <p style="margin:0;font-size:13px;color:#94a3b8">Powered by <strong style="color:#2563eb">Alfie PRO</strong> - RC Yacht Management Software</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendEmailWithSendGrid(to: string, toName: string, subject: string, html: string, fromEmail: string, fromName: string) {
  const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');

  if (!sendGridApiKey) {
    console.log('📧 Email simulation (SendGrid not configured):', { to, subject });
    return { success: true, simulation: true };
  }

  const emailData = {
    personalizations: [{
      to: [{ email: to, name: toName }],
      subject: subject,
    }],
    from: { email: fromEmail, name: fromName },
    content: [{
      type: 'text/html',
      value: html,
    }],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sendGridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('SendGrid error:', response.status, error);
    throw new Error(`SendGrid API error: ${error}`);
  }

  return { success: true };
}

async function sendMembershipEmail(
  supabase: any,
  emailData: EmailRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    let template = defaultTemplates[emailData.email_type]

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

    const subject = replacePlaceholders(template.subject, emailData.member_data)
    let body = replacePlaceholders(template.body, emailData.member_data)

    const { data: clubData } = await supabase
      .from('clubs')
      .select('name')
      .eq('id', emailData.member_data.club_id)
      .maybeSingle()

    const clubName = clubData?.name || emailData.member_data.club_name || 'Your Club'
    const defaultFromEmail = Deno.env.get('DEFAULT_FROM_EMAIL') || 'noreply@alfiepro.com'

    const recipientName = `${emailData.member_data.first_name} ${emailData.member_data.last_name}`

    const headerTextMap: { [key: string]: string } = {
      'welcome': 'Welcome to the Club!',
      'renewal': 'Membership Renewal',
      'event': 'Event Invitation',
      'application_received': 'Application Received'
    }
    const headerText = headerTextMap[emailData.email_type] || 'Club Notification'

    body = wrapContentInEmailTemplate(body, clubName, headerText)

    await sendEmailWithSendGrid(
      emailData.recipient_email,
      recipientName,
      subject,
      body,
      defaultFromEmail,
      clubName
    )
    
    const { error: logError } = await supabase
      .from('email_logs')
      .insert({
        club_id: emailData.member_data.club_id || null,
        user_id: emailData.member_data.user_id || null,
        recipient_email: emailData.recipient_email,
        subject,
        body,
        email_type: emailData.email_type,
        status: 'sent',
        sent_at: new Date().toISOString()
      })
    
    if (logError) {
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
    return new Response('ok', { headers: corsHeaders })
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
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      throw new Error('Unauthorized')
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
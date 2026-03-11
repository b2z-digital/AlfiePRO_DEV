import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
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

    const {
      recipients,
      subject,
      body,
      type,
      club_id,
      send_email,
      skip_notifications,
      sender_name,
      sender_avatar,
      club_name,
      club_logo,
      meeting_id,
      meeting_name,
      meeting_date,
      meeting_time,
      meeting_location,
      attachments,
      raw_html,
      from_email,
      from_name,
      link_url
    } = await req.json()

    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const { data: userData } = await supabaseClient.auth.getUser(token)
    const sender_id = userData?.user?.id || null

    console.log('Processing notification request:', {
      recipientCount: recipients?.length,
      subject,
      type,
      club_id,
      send_email,
      sender_name,
      attachmentCount: attachments?.length || 0,
      body_preview: body?.substring(0, 100)
    })

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Recipients array is required')
    }

    if (!subject || !body) {
      throw new Error('Subject and body are required')
    }

    const notifications: any[] = []
    let emailsSent = 0

    for (const recipient of recipients) {
      try {
        const hasUserId = !!recipient.user_id
        const shouldCreateNotification = hasUserId && !skip_notifications

        if (shouldCreateNotification) {
          const { data: notification, error: notificationError } = await supabaseClient
            .from('notifications')
            .insert({
              user_id: recipient.user_id,
              club_id: club_id,
              type: type || 'message',
              subject: subject,
              body: body,
              read: false,
              email_status: send_email ? 'pending' : 'not_sent',
              sender_id: sender_id,
              sender_name: sender_name || 'Unknown',
              sender_avatar_url: sender_avatar,
              recipient_name: recipient.name || `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || 'Unknown',
              is_rich_text: body.includes('<p>') || body.includes('<div>'),
              attachments: attachments && attachments.length > 0 ? attachments : undefined,
              link_url: link_url || null
            })
            .select()
            .single()

          if (notificationError) {
            console.error('Error creating notification:', notificationError)
          } else {
            notifications.push(notification)
            console.log('Created notification for:', recipient.name || recipient.email)

            if (send_email && recipient.email) {
              try {
                await sendEmail({
                  to: recipient.email,
                  recipientName: recipient.name || 'Member',
                  subject,
                  body,
                  clubName: club_name,
                  clubLogo: club_logo,
                  responseToken: type === 'meeting_invite' ? recipient.response_token : undefined,
                  meetingName: meeting_name,
                  meetingDate: meeting_date,
                  meetingTime: meeting_time,
                  meetingLocation: meeting_location,
                  attachments,
                  rawHtml: raw_html,
                  fromEmail: from_email,
                  fromName: from_name,
                })
                await supabaseClient
                  .from('notifications')
                  .update({ email_status: 'sent' })
                  .eq('id', notification.id)
                emailsSent++
                console.log('Email sent successfully to:', recipient.email)
              } catch (emailError: any) {
                console.error('Error sending email to', recipient.email, ':', emailError)
                await supabaseClient
                  .from('notifications')
                  .update({
                    email_status: 'failed',
                    email_error_message: emailError.message
                  })
                  .eq('id', notification.id)
              }
            }
          }
        } else if (recipient.email) {
          try {
            await sendEmail({
              to: recipient.email,
              recipientName: recipient.name || 'Member',
              subject,
              body,
              clubName: club_name,
              clubLogo: club_logo,
              responseToken: type === 'meeting_invite' ? recipient.response_token : undefined,
              meetingName: meeting_name,
              meetingDate: meeting_date,
              meetingTime: meeting_time,
              meetingLocation: meeting_location,
              attachments,
              rawHtml: raw_html,
              fromEmail: from_email,
              fromName: from_name,
            })
            emailsSent++
            console.log('Email sent (no notification) to:', recipient.email)
          } catch (emailError: any) {
            console.error('Error sending email to', recipient.email, ':', emailError)
          }
        }
      } catch (error) {
        console.error('Error processing recipient:', recipient.email, error)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully processed ${notifications.length} notifications and ${emailsSent} emails`,
        notifications_created: notifications.length,
        emails_sent: emailsSent
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Error in send-notification function:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})

interface SendEmailOptions {
  to: string;
  recipientName: string;
  subject: string;
  body: string;
  clubName: string;
  clubLogo?: string;
  responseToken?: string;
  meetingName?: string;
  meetingDate?: string;
  meetingTime?: string;
  meetingLocation?: string;
  attachments?: Attachment[];
  rawHtml?: boolean;
  fromEmail?: string;
  fromName?: string;
}

async function sendEmail(opts: SendEmailOptions) {
  const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY')
  const defaultFromEmail = Deno.env.get('DEFAULT_FROM_EMAIL')

  if (!sendGridApiKey) {
    throw new Error('SendGrid API key not configured')
  }

  if (!defaultFromEmail) {
    throw new Error('Default from email not configured')
  }

  const senderEmail = opts.fromEmail || defaultFromEmail;
  const displayClubName = opts.fromName || opts.clubName || 'Alfie PRO';

  let htmlContent: string;

  if (opts.rawHtml) {
    htmlContent = opts.body;
  } else {
    const isRichText = opts.body.includes('<p>') || opts.body.includes('<div>') || opts.body.includes('<br');
    const formattedBody = isRichText
      ? opts.body
      : opts.body
          .split('\n')
          .filter(line => line.trim())
          .map(line => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">${line}</p>`)
          .join('');

    const isMeetingInvite = !!opts.responseToken;
    const hasMeetingDetails = !!opts.meetingName;
    const headerSubtitle = isMeetingInvite ? 'Meeting Invitation' : hasMeetingDetails ? 'Meeting Minutes' : '';

    let attachmentsHtml = '';
    if (opts.attachments && opts.attachments.length > 0) {
      const attachmentLinks = opts.attachments.map(att => {
        const sizeKB = Math.round(att.size / 1024);
        const sizeLabel = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
        return `<tr>
          <td style="padding:8px 0">
            <a href="${att.url}" target="_blank" style="color:#2563eb;text-decoration:none;font-size:14px;font-weight:500">${att.name}</a>
            <span style="color:#9ca3af;font-size:12px;margin-left:8px">(${sizeLabel})</span>
          </td>
        </tr>`;
      }).join('');

      attachmentsHtml = `
        <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin:24px 0;border:1px solid #e5e7eb">
          <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#374151">Attachments (${opts.attachments.length})</p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${attachmentLinks}
          </table>
        </div>`;
    }

    const meetingDetailsHtml = hasMeetingDetails ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:12px;padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Meeting</p>
                          <p style="margin:4px 0 0;color:#ffffff;font-size:22px;font-weight:700;">${opts.meetingName}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Meeting Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${opts.meetingDate ? `<tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;width:35%;">
                          <span style="color:#64748b;font-size:13px;">Date</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:600;">${opts.meetingDate}</span>
                        </td>
                      </tr>` : ''}
                      ${opts.meetingTime ? `<tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Time</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${opts.meetingTime}</span>
                        </td>
                      </tr>` : ''}
                      ${opts.meetingLocation ? `<tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#64748b;font-size:13px;">Location</span>
                        </td>
                        <td style="padding:12px 20px;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${opts.meetingLocation}</span>
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:12px 20px;">
                          <span style="color:#64748b;font-size:13px;">Organised By</span>
                        </td>
                        <td style="padding:12px 20px;">
                          <span style="color:#0f172a;font-size:13px;font-weight:500;">${displayClubName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>` : '';

    htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.subject}</title>
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
                    ${opts.clubLogo ? `<img src="${opts.clubLogo}" alt="${displayClubName}" style="max-width:80px;height:auto;margin:0 0 12px;border-radius:8px;background:rgba(255,255,255,0.15);padding:6px" />` : ''}
                    <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${displayClubName}</h1>
                    ${headerSubtitle ? `<p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${headerSubtitle}</p>` : ''}
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
              <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
                Dear ${opts.recipientName},
              </p>

              ${meetingDetailsHtml}

              <div style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;">
                ${formattedBody}
              </div>

              ${attachmentsHtml}

              ${opts.responseToken ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;text-align:center;">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Your Response</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;text-align:center;">
                    <p style="margin:0 0 20px;font-size:16px;color:#0f172a;font-weight:600;">Will you be attending?</p>
                    <table cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td style="padding:0 6px">
                          <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${opts.responseToken}&status=attending" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.3px;">Yes</a>
                        </td>
                        <td style="padding:0 6px">
                          <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${opts.responseToken}&status=maybe" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.3px;">Maybe</a>
                        </td>
                        <td style="padding:0 6px">
                          <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${opts.responseToken}&status=not_attending" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.3px;">No</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Click one of the buttons above to confirm your attendance</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <div style="margin:24px 0 0;padding:20px 0 0;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:15px;color:#334155;">Best regards,</p>
                <p style="margin:6px 0 0;font-size:15px;font-weight:600;color:#0f172a;">${displayClubName}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.5;">This email was sent by ${displayClubName}</p>
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

  const emailData: any = {
    personalizations: [
      {
        to: [{ email: opts.to, name: opts.recipientName }],
        subject: opts.subject
      }
    ],
    from: {
      email: senderEmail,
      name: displayClubName
    },
    content: [
      {
        type: 'text/html',
        value: htmlContent
      }
    ]
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sendGridApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailData)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('SendGrid API error:', response.status, errorText)
    throw new Error(`SendGrid API error: ${response.status} - ${errorText}`)
  }

  console.log('Email sent successfully via SendGrid to:', opts.to)
}

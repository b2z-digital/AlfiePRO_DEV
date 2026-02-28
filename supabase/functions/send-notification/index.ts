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
      attachments
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
              attachments: attachments && attachments.length > 0 ? attachments : undefined
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
                await sendEmail(
                  recipient.email,
                  recipient.name || 'Member',
                  subject,
                  body,
                  club_name,
                  club_logo,
                  type === 'meeting_invite' ? recipient.response_token : undefined,
                  meeting_name,
                  meeting_date,
                  meeting_time,
                  meeting_location,
                  attachments
                )
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
            await sendEmail(
              recipient.email,
              recipient.name || 'Member',
              subject,
              body,
              club_name,
              club_logo,
              type === 'meeting_invite' ? recipient.response_token : undefined,
              meeting_name,
              meeting_date,
              meeting_time,
              meeting_location,
              attachments
            )
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

async function sendEmail(
  to: string,
  recipientName: string,
  subject: string,
  body: string,
  clubName: string,
  clubLogo?: string,
  responseToken?: string,
  meetingName?: string,
  meetingDate?: string,
  meetingTime?: string,
  meetingLocation?: string,
  attachments?: Attachment[]
) {
  const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY')
  const defaultFromEmail = Deno.env.get('DEFAULT_FROM_EMAIL')

  if (!sendGridApiKey) {
    throw new Error('SendGrid API key not configured')
  }

  if (!defaultFromEmail) {
    throw new Error('Default from email not configured')
  }

  const displayClubName = clubName || 'Alfie PRO';

  const isRichText = body.includes('<p>') || body.includes('<div>') || body.includes('<br');
  const formattedBody = isRichText
    ? body
    : body
        .split('\n')
        .filter(line => line.trim())
        .map(line => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">${line}</p>`)
        .join('');

  const isMeetingInvite = !!responseToken;
  const headerSubtitle = isMeetingInvite ? 'Meeting Invitation' : '';

  let attachmentsHtml = '';
  if (attachments && attachments.length > 0) {
    const attachmentLinks = attachments.map(att => {
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
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#374151">Attachments (${attachments.length})</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          ${attachmentLinks}
        </table>
      </div>`;
  }

  const emailData: any = {
    personalizations: [
      {
        to: [{ email: to, name: recipientName }],
        subject: subject
      }
    ],
    from: {
      email: defaultFromEmail,
      name: displayClubName
    },
    content: [
      {
        type: 'text/html',
        value: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)">
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);padding:40px 40px 30px;text-align:center">
              ${clubLogo ? `<img src="${clubLogo}" alt="${displayClubName}" style="max-width:120px;height:auto;margin:0 0 16px;border-radius:8px;background:#fff;padding:8px" />` : ''}
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-.5px">${displayClubName}</h1>
              ${headerSubtitle ? `<p style="margin:10px 0 0;color:rgba(255,255,255,.95);font-size:16px">${headerSubtitle}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:40px">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1f2937">Dear ${recipientName},</p>

              <div style="margin:0 0 32px;font-size:16px;line-height:1.7;color:#374151">
                ${formattedBody}
              </div>

              ${attachmentsHtml}

              ${responseToken ? `
              <div style="background:#f9fafb;border-radius:10px;padding:28px;margin:32px 0;border:1px solid #e5e7eb;text-align:center">
                <p style="margin:0 0 20px;font-size:17px;color:#111827;font-weight:600">Will you be attending?</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center">
                      <table cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding:0 8px">
                            <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${responseToken}&status=attending" style="display:inline-block;padding:14px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Yes</a>
                          </td>
                          <td style="padding:0 8px">
                            <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${responseToken}&status=maybe" style="display:inline-block;padding:14px 24px;background:#f59e0b;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Maybe</a>
                          </td>
                          <td style="padding:0 8px">
                            <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${responseToken}&status=not_attending" style="display:inline-block;padding:14px 24px;background:#ef4444;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">No</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-size:13px;color:#6b7280">Click one of the buttons above to confirm your attendance</p>
              </div>
              ` : ''}

              <div style="margin:32px 0 0;padding:20px 0 0;border-top:1px solid #e5e7eb">
                <p style="margin:0;font-size:16px;color:#374151">Best regards,</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:600;color:#1f2937">${displayClubName}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb">
              <p style="margin:0 0 12px;font-size:14px;color:#64748b;line-height:1.5">This email was sent by ${displayClubName}</p>
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

  console.log('Email sent successfully via SendGrid to:', to)
}

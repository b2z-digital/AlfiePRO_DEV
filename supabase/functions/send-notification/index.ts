import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
      sender_name,
      sender_avatar,
      club_name,
      club_logo,
      meeting_id,
      meeting_name,
      meeting_date,
      meeting_time,
      meeting_location
    } = await req.json()

    // Get sender user_id from the Authorization header
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token)
    const sender_id = userData?.user?.id || null

    console.log('Processing notification request:', {
      recipientCount: recipients?.length,
      subject,
      type,
      club_id,
      send_email,
      sender_name,
      sender_avatar,
      club_name,
      body_preview: body?.substring(0, 100)
    })

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Recipients array is required')
    }

    if (!subject || !body) {
      throw new Error('Subject and body are required')
    }

    // Create notifications for each recipient
    const notifications = []
    for (const recipient of recipients) {
      try {
        // Create notification record
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
            is_rich_text: body.includes('<p>') || body.includes('<div>')
          })
          .select()
          .single()

        if (notificationError) {
          console.error('Error creating notification:', notificationError)
          continue
        }

        notifications.push(notification)
        console.log('Created notification for:', recipient.name || recipient.email)

        // Send email if requested and email service is configured
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
              meeting_location
            )
            
            // Update notification status to sent
            await supabaseClient
              .from('notifications')
              .update({ email_status: 'sent' })
              .eq('id', notification.id)
              
            console.log('Email sent successfully to:', recipient.email)
          } catch (emailError) {
            console.error('Error sending email to', recipient.email, ':', emailError)
            
            // Update notification status to failed
            await supabaseClient
              .from('notifications')
              .update({ 
                email_status: 'failed',
                email_error_message: emailError.message 
              })
              .eq('id', notification.id)
          }
        }
      } catch (error) {
        console.error('Error processing recipient:', recipient.email, error)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${notifications.length} notifications`,
        notifications_created: notifications.length,
        emails_requested: send_email ? recipients.filter(r => r.email).length : 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
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
  meetingLocation?: string
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

  // Convert body line breaks to HTML paragraphs
  const formattedBody = body
    .split('\n')
    .filter(line => line.trim())
    .map(line => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151">${line}</p>`)
    .join('');

  const emailData = {
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
              <p style="margin:10px 0 0;color:rgba(255,255,255,.95);font-size:16px">Meeting Invitation</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1f2937">Dear ${recipientName},</p>

              <div style="margin:0 0 32px;font-size:16px;line-height:1.7;color:#374151">
                ${formattedBody}
              </div>

              ${responseToken ? `
              <div style="background:#f9fafb;border-radius:10px;padding:28px;margin:32px 0;border:1px solid #e5e7eb;text-align:center">
                <p style="margin:0 0 20px;font-size:17px;color:#111827;font-weight:600">Will you be attending?</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center">
                      <table cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding:0 8px">
                            <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${responseToken}&status=attending" style="display:inline-block;padding:14px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">✓ Yes</a>
                          </td>
                          <td style="padding:0 8px">
                            <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${responseToken}&status=maybe" style="display:inline-block;padding:14px 24px;background:#f59e0b;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">? Maybe</a>
                          </td>
                          <td style="padding:0 8px">
                            <a href="${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-attendance-response?token=${responseToken}&status=not_attending" style="display:inline-block;padding:14px 24px;background:#ef4444;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">✗ No</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-size:13px;color:#6b7280">Click one of the buttons above to confirm your attendance</p>
              </div>
              ` : `
              <div style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-radius:10px;padding:28px;margin:32px 0;border:1px solid #bfdbfe">
                <p style="margin:0;font-size:15px;color:#1e40af;font-weight:600">📅 Please add this meeting to your calendar and confirm your attendance.</p>
              </div>
              `}

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
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Received email request');
    
    const { email, recipient_name, club_name, invitation_url } = await req.json();

    if (!email || !recipient_name || !club_name || !invitation_url) {
      throw new Error('Missing required fields');
    }

    console.log('Sending invitation email to:', email);

    await sendInvitationEmail(email, recipient_name, club_name, invitation_url);

    console.log('Email sent successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email sent successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error sending email:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
})

async function sendInvitationEmail(
  to: string,
  recipientName: string,
  clubName: string,
  invitationUrl: string
) {
  const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
  const defaultFromEmail = Deno.env.get('DEFAULT_FROM_EMAIL');

  console.log('SendGrid configured:', !!sendGridApiKey);
  console.log('From email configured:', !!defaultFromEmail);

  if (!sendGridApiKey) {
    console.error('SendGrid API key not configured');
    throw new Error('SendGrid API key not configured');
  }

  if (!defaultFromEmail) {
    console.error('Default from email not configured');
    throw new Error('Default from email not configured');
  }

  const emailData = {
    personalizations: [
      {
        to: [{ email: to, name: recipientName }],
        subject: `You're invited to join ${clubName} on Alfie PRO`,
      },
    ],
    from: {
      email: defaultFromEmail,
      name: clubName,
    },
    content: [
      {
        type: 'text/html',
        value: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>You're Invited to Join ${clubName}</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: #2563eb; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited!</h1>
            </div>
            
            <div style="background-color: white; padding: 40px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <p style="font-size: 16px; margin-bottom: 20px;">Hi ${recipientName},</p>
              
              <p style="font-size: 16px; margin-bottom: 20px;">
                <strong>${clubName}</strong> has invited you to join their club on Alfie PRO - the complete RC yacht club management platform.
              </p>
              
              <p style="font-size: 16px; margin-bottom: 30px;">
                Click the button below to accept your invitation and create your account:
              </p>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${invitationUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 16px 40px; text-decoration: none; border-radius: 6px; font-size: 18px; font-weight: bold;">Accept Invitation</a>
              </div>
              
              <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                Or copy and paste this link into your browser:<br>
                <a href="${invitationUrl}" style="color: #2563eb; word-break: break-all;">${invitationUrl}</a>
              </p>
              
              <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                This invitation will expire in 7 days.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 15px;">What's Alfie PRO?</h3>
              <ul style="color: #4b5563; line-height: 1.8;">
                <li>View race results and series standings</li>
                <li>Register for upcoming events</li>
                <li>Manage your membership and boats</li>
                <li>Stay updated with club news and announcements</li>
                <li>Access club documents and resources</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding: 20px; color: #6b7280; font-size: 14px;">
              <p>This invitation was sent by ${clubName}</p>
              <p style="margin-top: 10px;">Powered by <strong>Alfie PRO</strong> - RC Yacht Management Software</p>
            </div>
          </body>
          </html>
        `,
      },
    ],
  };

  console.log('Calling SendGrid API...');

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sendGridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('SendGrid API error:', response.status, errorText);
    throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
  }

  console.log('Invitation email sent successfully to:', to);
}

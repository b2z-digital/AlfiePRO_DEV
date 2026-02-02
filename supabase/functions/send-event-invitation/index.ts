import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InvitationRequest {
  recipientEmail: string;
  recipientName: string | null;
  senderName: string;
  eventName: string;
  eventDate: string;
  personalMessage: string | null;
  invitationLink: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const {
      recipientEmail,
      recipientName,
      senderName,
      eventName,
      eventDate,
      personalMessage,
      invitationLink
    }: InvitationRequest = await req.json();

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const formattedDate = new Date(eventDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const greeting = recipientName ? `Hi ${recipientName}` : 'Hi there';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Event Invitation</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited!</h1>
          </div>

          <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">${greeting},</p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              <strong>${senderName}</strong> has invited you to join them at an exciting sailing event!
            </p>

            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <h2 style="margin: 0 0 15px 0; color: #1f2937; font-size: 22px;">${eventName}</h2>
              <p style="margin: 5px 0; color: #4b5563; font-size: 16px;">
                <strong>Date:</strong> ${formattedDate}
              </p>
            </div>

            ${personalMessage ? `
              <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; font-style: italic; color: #1e40af;">
                  "${personalMessage}"
                </p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">
                  - ${senderName}
                </p>
              </div>
            ` : ''}

            <p style="font-size: 16px; margin: 25px 0 30px 0;">
              Don't miss out on this opportunity to hit the water and enjoy some great racing!
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${invitationLink}"
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: bold;
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                Register Now
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              If the button above doesn't work, copy and paste this link into your browser:<br>
              <a href="${invitationLink}" style="color: #3b82f6; word-break: break-all;">${invitationLink}</a>
            </p>

            <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
              This invitation was sent by ${senderName} through the Alfie sailing event management platform.
            </p>
          </div>

          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p style="margin: 5px 0;">Powered by Alfie - Sailing Event Management</p>
            <p style="margin: 5px 0;">Making sailing events better, one race at a time.</p>
          </div>
        </body>
      </html>
    `;

    const emailText = `
${greeting},

${senderName} has invited you to join them at an exciting sailing event!

Event: ${eventName}
Date: ${formattedDate}

${personalMessage ? `Personal message from ${senderName}:\n"${personalMessage}"\n\n` : ''}

Don't miss out on this opportunity to hit the water and enjoy some great racing!

Register now by visiting: ${invitationLink}

This invitation was sent by ${senderName} through the Alfie sailing event management platform.
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Alfie Events <events@alfie.racing>',
        to: recipientEmail,
        subject: `${senderName} invited you to ${eventName}`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend API error:', error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const data = await response.json();
    console.log('Email sent successfully:', data);

    return new Response(
      JSON.stringify({ success: true, messageId: data.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in send-event-invitation:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send invitation' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
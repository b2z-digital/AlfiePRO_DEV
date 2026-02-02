import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  recipient_email: string;
  recipient_name?: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  message: string;
  phone?: string;
  event_name?: string;
  club_name?: string;
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
      recipient_email,
      recipient_name,
      sender_name,
      sender_email,
      subject,
      message,
      phone,
      event_name,
      club_name
    }: RequestBody = await req.json();

    // Detailed validation
    const missingFields = [];
    if (!recipient_email) missingFields.push('recipient_email');
    if (!sender_name) missingFields.push('sender_name');
    if (!sender_email) missingFields.push('sender_email');
    if (!subject) missingFields.push('subject');
    if (!message) missingFields.push('message');

    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          received: {
            recipient_email: !!recipient_email,
            sender_name: !!sender_name,
            sender_email: !!sender_email,
            subject: !!subject,
            message: !!message
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const displayName = event_name || club_name || 'Alfie PRO';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f8fafc;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
          }
          .field {
            margin-bottom: 20px;
          }
          .label {
            font-weight: 600;
            color: #374151;
            margin-bottom: 5px;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .value {
            background: #f9fafb;
            padding: 12px;
            border-radius: 6px;
            border-left: 3px solid #0ea5e9;
            color: #1f2937;
          }
          .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📩 Contact Form Submission</h1>
            <p style="margin: 10px 0 0; opacity: 0.95;">${displayName}</p>
          </div>
          <div class="content">
            <p style="margin-bottom: 24px;">You have received a new message from your event website contact form.</p>

            <div class="field">
              <div class="label">From</div>
              <div class="value">${sender_name}</div>
            </div>

            <div class="field">
              <div class="label">Email</div>
              <div class="value"><a href="mailto:${sender_email}" style="color: #0ea5e9; text-decoration: none;">${sender_email}</a></div>
            </div>

            ${phone ? `
            <div class="field">
              <div class="label">Phone</div>
              <div class="value">${phone}</div>
            </div>
            ` : ''}

            <div class="field">
              <div class="label">Subject</div>
              <div class="value">${subject}</div>
            </div>

            <div class="field">
              <div class="label">Message</div>
              <div class="value message-content">${message}</div>
            </div>

            <div class="footer">
              <p>This message was sent via the ${displayName} contact form.</p>
              <p style="margin: 10px 0 0;">To reply, email <strong>${sender_email}</strong> directly.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailText = `
Contact Form Submission - ${displayName}

You have received a new message from your event website contact form.

From: ${sender_name}
Email: ${sender_email}
${phone ? `Phone: ${phone}\n` : ''}
Subject: ${subject}

Message:
${message}

---
This message was sent via the ${displayName} contact form.
To reply, email ${sender_email} directly.
    `;

    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const defaultFromEmail = Deno.env.get('DEFAULT_FROM_EMAIL');

    console.log('SendGrid configured:', !!sendGridApiKey);
    console.log('From email configured:', !!defaultFromEmail);

    if (!sendGridApiKey) {
      console.error('SendGrid API key not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!defaultFromEmail) {
      console.error('Default from email not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Default from email not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const emailData = {
      personalizations: [
        {
          to: [{ email: recipient_email, name: recipient_name || recipient_email }],
          subject: `Contact Form: ${subject}`,
        },
      ],
      from: {
        email: defaultFromEmail,
        name: displayName,
      },
      reply_to: {
        email: sender_email,
        name: sender_name,
      },
      content: [
        {
          type: 'text/plain',
          value: emailText,
        },
        {
          type: 'text/html',
          value: emailHtml,
        },
      ],
    };

    const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sendGridApiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('Email send failed:', errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-contact-form:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error instanceof Error ? error.stack : String(error);

    console.error('Full error details:', errorDetails);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
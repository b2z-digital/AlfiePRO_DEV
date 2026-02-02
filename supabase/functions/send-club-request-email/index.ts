import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  club_name: string;
  message: string;
  request_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { club_name, message, request_id }: RequestBody = await req.json();

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
          }
          .content {
            background: #f9fafb;
            padding: 30px;
            border-radius: 0 0 10px 10px;
          }
          .field {
            margin-bottom: 20px;
          }
          .label {
            font-weight: bold;
            color: #374151;
            margin-bottom: 5px;
          }
          .value {
            background: white;
            padding: 10px;
            border-radius: 5px;
            border-left: 3px solid #10b981;
          }
          .footer {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏆 New Club Request - Alfie</h1>
          </div>
          <div class="content">
            <p>A new sailing club has been requested to be added to the Alfie platform.</p>
            
            <div class="field">
              <div class="label">Club Name:</div>
              <div class="value">${club_name}</div>
            </div>
            
            ${message ? `
            <div class="field">
              <div class="label">Additional Information:</div>
              <div class="value">${message}</div>
            </div>
            ` : ''}
            
            <div class="field">
              <div class="label">Request ID:</div>
              <div class="value">${request_id}</div>
            </div>
            
            <div class="footer">
              <p>This request has been saved to the database and is awaiting review.</p>
              <p><strong>Action Required:</strong> Please review this club request and add the club to the platform if appropriate.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailText = `
New Club Request - Alfie

A new sailing club has been requested to be added to the Alfie platform.

Club Name: ${club_name}
${message ? `\nAdditional Information: ${message}` : ''}

Request ID: ${request_id}

This request has been saved to the database and is awaiting review.
Action Required: Please review this club request and add the club to the platform if appropriate.
    `;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Alfie <noreply@alfie.pro>',
        to: 'stephenwalshdigital@gmail.com',
        subject: `New Club Request: ${club_name}`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('Email send failed:', errorData);
      throw new Error('Failed to send email');
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-club-request-email:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

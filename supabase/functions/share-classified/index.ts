import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const senderId = userData?.user?.id;

    const { classified, recipientEmail, message, shareMethod } = await req.json();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${classified.title} - Classified Listing</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 30px;
          }
          .listing-image {
            width: 100%;
            height: 300px;
            object-fit: cover;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .listing-title {
            font-size: 28px;
            font-weight: 700;
            color: #1e293b;
            margin: 0 0 10px 0;
          }
          .listing-price {
            font-size: 32px;
            font-weight: 700;
            color: #10b981;
            margin: 0 0 20px 0;
          }
          .listing-description {
            color: #64748b;
            margin: 0 0 20px 0;
            line-height: 1.8;
          }
          .listing-details {
            background-color: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .detail-row {
            display: flex;
            padding: 10px 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .detail-row:last-child {
            border-bottom: none;
          }
          .detail-label {
            font-weight: 600;
            color: #475569;
            width: 120px;
          }
          .detail-value {
            color: #1e293b;
          }
          .message-box {
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .message-box p {
            margin: 0;
            color: #1e40af;
            font-style: italic;
          }
          .contact-section {
            background-color: #f0f9ff;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .contact-section h3 {
            color: #1e293b;
            margin: 0 0 15px 0;
          }
          .contact-info {
            font-size: 16px;
            color: #475569;
          }
          .footer {
            text-align: center;
            padding: 30px;
            color: #94a3b8;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
          }
          .badge {
            display: inline-block;
            padding: 6px 12px;
            background-color: #3b82f6;
            color: white;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-right: 8px;
            margin-bottom: 8px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚢 Sailing Classified Listing</h1>
          </div>

          <div class="content">
            ${classified.images && classified.images.length > 0 ? `
              <img src="${classified.images[0]}" alt="${classified.title}" class="listing-image" />
            ` : ''}

            <h2 class="listing-title">${classified.title}</h2>
            <div class="listing-price">$${classified.price.toLocaleString()}</div>

            ${message ? `
              <div class="message-box">
                <p><strong>Personal Message:</strong> ${message}</p>
              </div>
            ` : ''}

            <p class="listing-description">${classified.description}</p>

            <div class="listing-details">
              <div class="detail-row">
                <span class="detail-label">Condition:</span>
                <span class="detail-value">${classified.condition}</span>
              </div>
              ${classified.location ? `
                <div class="detail-row">
                  <span class="detail-label">Location:</span>
                  <span class="detail-value">${classified.location}</span>
                </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">Category:</span>
                <span class="detail-value">${classified.category}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Listed:</span>
                <span class="detail-value">${new Date(classified.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
            </div>

            ${classified.is_public ? '<span class="badge">Public Listing</span>' : ''}

            <div class="contact-section">
              <h3>Interested?</h3>
              <div class="contact-info">
                <p><strong>Email:</strong> ${classified.contact_email}</p>
                ${classified.contact_phone ? `<p><strong>Phone:</strong> ${classified.contact_phone}</p>` : ''}
              </div>
            </div>
          </div>

          <div class="footer">
            <p>This listing was shared with you from our Yacht Club Management System</p>
            <p style="margin-top: 10px; font-size: 12px;">
              Please contact the seller directly if you're interested in this item.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Get recipient user_id from email
    const { data: recipientMember } = await supabaseClient
      .from('members')
      .select('user_id')
      .eq('email', recipientEmail)
      .maybeSingle();

    if (recipientMember?.user_id) {
      // Create in-app notification
      const notificationMessage = message
        ? `${classified.title} - Personal message: ${message}`
        : classified.title;

      await supabaseClient
        .from('notifications')
        .insert({
          user_id: recipientMember.user_id,
          type: 'classified_shared',
          subject: 'Classified Listing Shared With You',
          body: notificationMessage,
          sender_id: senderId,
          link_url: `/classifieds?listing=${classified.id}`,
          read: false
        });

      console.log("Notification sent to user:", recipientMember.user_id);
    }

    // Note: In a production environment, you could also integrate with an email service
    console.log("Would send email to:", recipientEmail);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notification sent successfully"
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
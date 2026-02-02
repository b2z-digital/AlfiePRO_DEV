import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { generateInvoicePDF } from './pdf-generator.ts';

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
    const {
      invoice_id,
      recipient_email,
      recipient_name,
      subject,
      message,
      include_attachment,
      club_name
    } = await req.json();

    if (!recipient_email || !subject || !message || !invoice_id) {
      throw new Error('Missing required fields');
    }

    console.log('Sending invoice email to:', recipient_email);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (invoiceError) throw invoiceError;

    const { data: clubData, error: clubError } = await supabase
      .from('clubs')
      .select('name, bank_name, bsb, account_number, logo, address')
      .eq('id', invoiceData.club_id)
      .single();

    if (clubError) throw clubError;

    const invoice = {
      ...invoiceData,
      clubs: clubData
    };

    const { data: lineItems, error: lineItemsError } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice_id)
      .order('created_at', { ascending: true });

    if (lineItemsError) throw lineItemsError;

    let pdfBase64 = '';
    if (include_attachment) {
      pdfBase64 = await generateInvoicePDF(invoice, lineItems || []);
    }

    await sendInvoiceEmail({
      recipientEmail: recipient_email,
      recipientName: recipient_name,
      subject,
      message,
      clubName: club_name,
      includeAttachment: include_attachment,
      pdfBase64,
      invoice,
      lineItems: lineItems || []
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Invoice email sent successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

interface EmailParams {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message: string;
  clubName: string;
  includeAttachment: boolean;
  pdfBase64: string;
  invoice: any;
  lineItems: any[];
}


async function sendInvoiceEmail(params: EmailParams) {
  const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
  const defaultFromEmail = Deno.env.get('DEFAULT_FROM_EMAIL');

  if (!sendGridApiKey || !defaultFromEmail) {
    throw new Error('Email service not configured');
  }

  const clubName = params.clubName || 'Your Club';
  const invoice = params.invoice;
  const messageLines = params.message.split('\n').filter(line => line.trim());

  const emailData: any = {
    personalizations: [{ to: [{ email: params.recipientEmail, name: params.recipientName }], subject: params.subject }],
    from: { email: defaultFromEmail, name: clubName },
    content: [{
      type: 'text/html',
      value: `<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>${params.subject}</title></head><body style=\"margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f8fafc\"><table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background-color:#f8fafc;padding:40px 20px\"><tr><td align=\"center\"><table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)\"><tr><td style=\"background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:40px 40px 30px;text-align:center\"><h1 style=\"margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-.5px\">${clubName}</h1><p style=\"margin:10px 0 0;color:rgba(255,255,255,.95);font-size:16px\">Invoice Notification</p></td></tr><tr><td style=\"padding:40px\"><p style=\"margin:0 0 24px;font-size:16px;line-height:1.6;color:#1f2937\">Dear ${params.recipientName},</p><div style=\"margin:0 0 32px;font-size:16px;line-height:1.7;color:#374151\"><p style=\"margin:0 0 16px\">${messageLines[1] || `Please find your invoice ${invoice.invoice_number} for ${invoice.reference || 'services rendered'}.`}</p></div><div style=\"background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-radius:10px;padding:28px;margin:0 0 32px;border:1px solid #bfdbfe\"><h2 style=\"margin:0 0 20px;font-size:18px;font-weight:600;color:#1e40af\">Invoice Details</h2><table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td style=\"padding:8px 0;font-size:15px;color:#64748b;width:40%\">Invoice Number</td><td style=\"padding:8px 0;font-size:15px;color:#1f2937;font-weight:600\">${invoice.invoice_number}</td></tr><tr><td style=\"padding:8px 0;font-size:15px;color:#64748b\">Amount Due</td><td style=\"padding:8px 0;font-size:15px;color:#1f2937;font-weight:600\">$${parseFloat(invoice.total_amount).toFixed(2)}</td></tr><tr><td style=\"padding:8px 0;font-size:15px;color:#64748b\">Issue Date</td><td style=\"padding:8px 0;font-size:15px;color:#1f2937;font-weight:600\">${new Date(invoice.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>${invoice.due_date ? `<tr><td style=\"padding:8px 0;font-size:15px;color:#64748b\">Due Date</td><td style=\"padding:8px 0;font-size:15px;color:#dc2626;font-weight:600\">${new Date(invoice.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>` : ''}</table></div>${params.includeAttachment ? '<div style=\"background-color:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:20px;margin:0 0 32px\"><table><tr><td style=\"background-color:#22c55e;width:40px;height:40px;border-radius:8px;text-align:center;vertical-align:middle;padding:8px\"><span style=\"font-size:20px\">📎</span></td><td style=\"padding-left:16px\"><p style=\"margin:0;font-size:15px;font-weight:600;color:#166534\">Invoice Attached</p><p style=\"margin:4px 0 0;font-size:14px;color:#15803d\">The invoice PDF is attached to this email</p></td></tr></table></div>' : ''}<p style=\"margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151\">Please process payment at your earliest convenience. If you have any questions regarding this invoice, please don't hesitate to contact us.</p><p style=\"margin:0 0 8px;font-size:16px;line-height:1.7;color:#374151\">Thank you for your business!</p><div style=\"margin:32px 0 0;padding:20px 0 0;border-top:1px solid #e5e7eb\"><p style=\"margin:0;font-size:16px;color:#374151\">Best regards,</p><p style=\"margin:6px 0 0;font-size:16px;font-weight:600;color:#1f2937\">${clubName}</p></div></td></tr><tr><td style=\"background-color:#f8fafc;padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb\"><p style=\"margin:0 0 12px;font-size:14px;color:#64748b;line-height:1.5\">This email was sent by ${clubName}</p><p style=\"margin:0;font-size:13px;color:#94a3b8\">Powered by <strong style=\"color:#2563eb\">Alfie PRO</strong> - RC Yacht Management Software</p></td></tr></table></td></tr></table></body></html>`
    }]
  };

  if (params.includeAttachment && params.pdfBase64) {
    emailData.attachments = [{
      content: params.pdfBase64,
      filename: `invoice-${invoice.invoice_number}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment'
    }];
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${sendGridApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(emailData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('SendGrid error:', response.status, errorText);
    throw new Error('Failed to send email');
  }
}

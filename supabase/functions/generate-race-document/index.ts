import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      templateId,
      formSubmissionId,
      eventId,
      clubId,
      documentType,
      formData,
    } = await req.json();

    const { data: template, error: templateError } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError) throw templateError;

    let eventDetails = null;
    if (eventId) {
      const { data: event } = await supabase
        .from("quick_races")
        .select("*, clubs(name), venues(name, address)")
        .eq("id", eventId)
        .single();
      eventDetails = event;
    }

    const { data: club } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();

    let savedFormSubmissionId = formSubmissionId;
    if (!savedFormSubmissionId && template.linked_form_id) {
      const { data: submission, error: submissionError } = await supabase
        .from("form_submissions")
        .insert({
          form_id: template.linked_form_id,
          club_id: clubId,
          event_id: eventId || null,
          submitted_by: formData.userId || null,
          submission_data: formData,
          status: 'approved'
        })
        .select()
        .single();

      if (!submissionError && submission) {
        savedFormSubmissionId = submission.id;
      }
    }

    const htmlContent = generateHTMLFromTemplate(
      template,
      formData,
      eventDetails,
      club
    );

    const htmlBuffer = await generatePDFFromHTML(htmlContent);

    const fileName = `${Date.now()}_${documentType}_${eventId || "template"}.html`;
    const filePath = `${clubId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("race-documents")
      .upload(filePath, htmlBuffer, {
        contentType: "text/html; charset=utf-8",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("race-documents")
      .createSignedUrl(filePath, 31536000);

    if (signedUrlError) throw signedUrlError;

    const fileUrl = signedUrlData.signedUrl;

    const { data: document, error: docError } = await supabase
      .from("generated_documents")
      .insert({
        template_id: templateId,
        form_submission_id: savedFormSubmissionId,
        event_id: eventId || null,
        club_id: clubId,
        document_type: documentType,
        title: `${documentType.toUpperCase()} - ${eventDetails?.event_name || template.name}`,
        file_url: fileUrl,
        file_size: htmlBuffer.byteLength,
        generated_by: formData.userId || null,
      })
      .select()
      .single();

    if (docError) throw docError;

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl: fileUrl,
        document,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating document:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

function generateHTMLFromTemplate(
  template: any,
  formData: any,
  event: any,
  club: any
): string {
  if (template.template_type === 'html' && template.html_content) {
    let processedHTML = template.html_content;

    Object.keys(formData).forEach((key) => {
      const placeholder = `{{${key}}}`;
      const value = formData[key] || "";
      processedHTML = processedHTML.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), value);
    });

    if (event) {
      processedHTML = processedHTML.replace(/{{event_name}}/g, event.event_name || "");
      processedHTML = processedHTML.replace(/{{event_date}}/g, event.event_date || "");
      processedHTML = processedHTML.replace(/{{venue_name}}/g, event.venues?.name || "");
      processedHTML = processedHTML.replace(/{{venue_address}}/g, event.venues?.address || "");
    }

    if (club) {
      processedHTML = processedHTML.replace(/{{club_name}}/g, club.name || "");
      processedHTML = processedHTML.replace(/{{club_email}}/g, club.email || "");
      processedHTML = processedHTML.replace(/{{club_website}}/g, club.website || "");
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A4;
            margin: 25mm 20mm 20mm 20mm;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #1a1a1a;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 48px;
            background: white;
          }
          .document-content h1 {
            font-size: 24px;
            font-weight: 700;
            margin: 20px 0 12px 0;
          }
          .document-content h2 {
            font-size: 20px;
            font-weight: 600;
            margin: 16px 0 10px 0;
          }
          .document-content h3 {
            font-size: 18px;
            font-weight: 600;
            margin: 14px 0 8px 0;
          }
          .document-content p {
            margin: 8px 0;
            line-height: 1.6;
          }
          .document-content ul, .document-content ol {
            margin: 8px 0;
            padding-left: 24px;
          }
          .document-content li {
            margin: 4px 0;
          }
          .document-content .ql-indent-1 { margin-left: 3em; }
          .document-content .ql-indent-2 { margin-left: 6em; }
          .document-content .ql-indent-3 { margin-left: 9em; }
          .document-content .hanging-indent {
            text-indent: -1.5em;
            margin-left: 1.5em;
          }
          .document-content .ql-align-center { text-align: center; }
          .document-content .ql-align-right { text-align: right; }
          .document-content .ql-align-justify { text-align: justify; }
          .footer-text {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 9pt;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="document-content">
          ${processedHTML}
        </div>
        ${template.footer_text ? `<div class="footer-text">${template.footer_text}</div>` : ''}
      </body>
      </html>
    `;
  }

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          size: A4;
          margin: 25mm 20mm 20mm 20mm;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 10pt;
          line-height: 1.15;
          color: #1a1a1a;
          margin: 0;
          padding: 0;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
        .logo {
          max-height: 128px;
          margin-bottom: 12px;
          object-fit: contain;
        }
        h1 {
          font-size: 16pt;
          font-weight: 900;
          text-transform: uppercase;
          color: #000;
          margin: 24pt 0 24pt 0;
          line-height: 1.2;
        }
        h2 {
          font-size: 11pt;
          font-weight: 700;
          color: #000;
          margin: 20pt 0 8pt 0;
          line-height: 1.2;
        }
        h3 {
          font-size: 10pt;
          font-weight: 700;
          color: #000;
          margin: 12pt 0 4pt 0;
          line-height: 1.2;
        }
        p {
          margin: 0 0 16pt 0;
          text-align: justify;
          text-indent: -4.5em;
          margin-left: 4.5em;
        }
        p.no-indent {
          text-indent: 0;
          margin-left: 0;
        }
        ul, ol {
          margin: 0 0 16pt 0;
          padding: 0;
          list-style-position: outside;
        }
        li {
          margin: 0 0 4pt 0;
          padding-left: 0;
          text-align: justify;
        }
        .event-day {
          margin: 12pt 0;
        }
        .event-day-title {
          font-weight: 700;
          margin-bottom: 4pt;
        }
        .page-break {
          page-break-after: always;
        }
      </style>
    </head>
    <body>
  `;

  if (template.logo_url) {
    html += `
      <div class="header">
        <img src="${template.logo_url}" alt="Logo" class="logo" />
      </div>
    `;
  }

  html += `
    <div class="header">
      <h1>${template.name}</h1>
      ${template.description ? `<p>${template.description}</p>` : ""}
    </div>
  `;

  const sections = expandDynamicContent(template.sections || [], formData, event);

  sections.forEach((section: any) => {
    switch (section.type) {
      case "heading":
        const level = section.level || 2;
        html += `<h${level}>${processContent(section.content, formData, event, club)}</h${level}>`;
        break;

      case "paragraph":
        const processedPara = processContent(section.content, formData, event, club);
        html += `<p>${processedPara}</p>`;
        break;

      case "numbered_list":
        const listContent = processContent(section.content, formData, event, club);
        html += listContent;
        break;

      case "bullet_list":
        html += "<ul>";
        section.content.split("\n").forEach((item: string) => {
          if (item.trim()) {
            html += `<li>${processContent(item, formData, event, club)}</li>`;
          }
        });
        html += "</ul>";
        break;

      case "form_field":
        const fieldValue = getFieldValue(section.content, formData);
        html += `<p class="no-indent">${fieldValue}</p>`;
        break;

      case "page_break":
        if (section.forceBreak) {
          html += '<div class="page-break"></div>';
        }
        break;
    }
  });

  html += `
    </body>
    </html>
  `;

  return html;
}

function expandDynamicContent(sections: any[], formData: any, event: any): any[] {
  const expandedSections: any[] = [];

  sections.forEach((section) => {
    if (section.type === 'numbered_list' && section.content?.includes('{{day_2')) {
      expandedSections.push({ ...section, numDays: Object.keys(formData).filter(key => key.startsWith('day_') && key.endsWith('_date')).length });
    } else if (section.type !== 'page_break') {
      expandedSections.push(section);
    }
  });

  return expandedSections;
}

function processContent(
  content: string,
  formData: any,
  event: any,
  club: any
): string {
  let processed = content;

  if (content.includes('Day 2:') || content.includes('{{day_2')) {
    processed = generateEventScheduleDays(formData);
    return processed;
  }

  Object.keys(formData).forEach((key) => {
    const placeholder = `{{${key}}}`;
    const value = formData[key] || "";
    processed = processed.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), value);
  });

  if (event) {
    processed = processed.replace(/{{event_name}}/g, event.event_name || "");
    processed = processed.replace(/{{event_date}}/g, event.event_date || "");
    processed = processed.replace(/{{venue_name}}/g, event.venues?.name || "");
    processed = processed.replace(/{{venue_address}}/g, event.venues?.address || "");
  }

  if (club) {
    processed = processed.replace(/{{club_name}}/g, club.name || "");
    processed = processed.replace(/{{club_email}}/g, club.email || "");
    processed = processed.replace(/{{club_website}}/g, club.website || "");
  }

  return processed;
}

function generateEventScheduleDays(formData: any): string {
  const dayFields = Object.keys(formData).filter(key => key.startsWith('day_') && key.endsWith('_date'));
  const numDays = dayFields.length;

  if (numDays === 0) return "";

  let html = "";

  if (formData.day_1_date) {
    html += `<div class="event-day"><p class="event-day-title">Day One: ${formData.day_1_date}</p>`;
    if (formData.registration_start_and_end_times_type_over_to_chan) {
      html += `<p>Registration: ${formData.registration_start_and_end_times_type_over_to_chan}</p>`;
    }
    if (formData.measurement_start_and_end_times_type_over_to_chang) {
      html += `<p>Measurement and inspection: ${formData.measurement_start_and_end_times_type_over_to_chang}</p>`;
    }
    if (formData.day_1_briefing_start_time_type_over_to_change) {
      html += `<p>Briefing commences: ${formData.day_1_briefing_start_time_type_over_to_change}</p>`;
    }
    if (formData.day_1_warning_signal_first_race_type_over_to_chang) {
      html += `<p>Warning signal for first race: ${formData.day_1_warning_signal_first_race_type_over_to_chang}</p>`;
    }
    if (formData.day_1_no_heat_will_start_after_type_over_to_change) {
      html += `<p>Racing concludes: ${formData.day_1_no_heat_will_start_after_type_over_to_change}</p>`;
    }
    html += "</div>";
  }

  for (let i = 2; i <= numDays; i++) {
    const dayDateKey = `day_${i}_date`;
    const briefingKey = `day_${i}_briefing_start_time`;
    const warningKey = `day_${i}_warning_signal_first_race_`;
    const concludesKey = `day_${i}_no_heat_will_start_after`;

    if (formData[dayDateKey]) {
      const dayLabel = i === 2 ? "Day Two" : i === 3 ? "Day Three" : i === 4 ? "Day Four" : `Day ${i}`;
      html += `<div class="event-day"><p class="event-day-title">${dayLabel}: ${formData[dayDateKey]}</p>`;

      if (formData[briefingKey]) {
        html += `<p>Briefing commences: ${formData[briefingKey]}</p>`;
      }
      if (formData[warningKey]) {
        html += `<p>Warning signal for first race: ${formData[warningKey]}</p>`;
      }
      if (formData[concludesKey]) {
        html += `<p>Racing concludes: ${formData[concludesKey]}</p>`;
      }

      if (i === numDays) {
        html += `<p>Presentation function: As soon as possible after the last race.</p>`;
      }

      html += "</div>";
    }
  }

  return html;
}

function getFieldValue(fieldReference: string, formData: any): string {
  const match = fieldReference.match(/{{(.+?)}}/);
  if (match) {
    const fieldName = match[1];
    return formData[fieldName] || "";
  }
  return fieldReference;
}

async function generatePDFFromHTML(html: string): Promise<Uint8Array> {
  const completeHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Race Document</title>
  <style>
    ${html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || ''}

    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2563eb;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 1000;
    }
    .print-button:hover {
      background: #1d4ed8;
    }
    @media print {
      .print-button {
        display: none;
      }
    }
  </style>
  <script>
    function printDocument() {
      window.print();
    }
  </script>
</head>
${html.replace(/<\!DOCTYPE[\s\S]*?<body>/, '<body>\n  <button class="print-button" onclick="printDocument()">Print / Save as PDF</button>')}
</html>`;

  const encoder = new TextEncoder();
  return encoder.encode(completeHTML);
}

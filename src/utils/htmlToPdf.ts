import jsPDF from 'jspdf';

interface PageSettings {
  pageSize?: 'a4' | 'letter';
  orientation?: 'portrait' | 'landscape';
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}

interface ConversionOptions extends PageSettings {
  logoUrl?: string;
  mergeFields?: Record<string, string>;
}

/**
 * Convert HTML content to PDF with proper formatting
 * This preserves the WYSIWYG editor formatting as much as possible
 */
export async function convertHtmlToPdf(
  htmlContent: string,
  options: ConversionOptions = {}
): Promise<jsPDF> {
  const {
    pageSize = 'a4',
    orientation = 'portrait',
    marginTop = 20,
    marginBottom = 20,
    marginLeft = 20,
    marginRight = 20,
    logoUrl,
    mergeFields = {}
  } = options;

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: pageSize
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginLeft - marginRight;
  let yPos = marginTop;

  // Replace merge fields
  let processedHtml = htmlContent;
  Object.entries(mergeFields).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    processedHtml = processedHtml.replace(regex, value || '');
  });

  // Add logo if provided
  if (logoUrl) {
    try {
      const logoSize = 30;
      const logoX = (pageWidth - logoSize) / 2;
      doc.addImage(logoUrl, 'JPEG', logoX, yPos, logoSize, logoSize);
      yPos += logoSize + 10;
    } catch (err) {
      console.error('Error adding logo:', err);
    }
  }

  // Parse HTML and convert to PDF
  // Create a temporary DOM element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = processedHtml;

  // Process each element
  await processElement(doc, tempDiv, marginLeft, yPos, contentWidth, pageHeight, marginBottom, marginTop);

  return doc;
}

async function processElement(
  doc: jsPDF,
  element: HTMLElement,
  xPos: number,
  yPos: number,
  maxWidth: number,
  pageHeight: number,
  marginBottom: number,
  marginTop: number
): Promise<number> {
  const children = Array.from(element.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(text, maxWidth);

        for (const line of lines) {
          if (yPos + 10 > pageHeight - marginBottom) {
            doc.addPage();
            yPos = marginTop;
          }
          doc.text(line, xPos, yPos);
          yPos += 6;
        }
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      // Check for page break
      if (yPos + 20 > pageHeight - marginBottom) {
        doc.addPage();
        yPos = marginTop;
      }

      // Handle different HTML elements
      if (tagName === 'h1') {
        yPos += 5;
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        const text = el.textContent?.trim() || '';
        doc.text(text, xPos, yPos);
        yPos += 10;
        doc.setFont('helvetica', 'normal');
      } else if (tagName === 'h2') {
        yPos += 4;
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const text = el.textContent?.trim() || '';
        doc.text(text, xPos, yPos);
        yPos += 9;
        doc.setFont('helvetica', 'normal');
      } else if (tagName === 'h3') {
        yPos += 3;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        const text = el.textContent?.trim() || '';
        doc.text(text, xPos, yPos);
        yPos += 8;
        doc.setFont('helvetica', 'normal');
      } else if (tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
        yPos += 2;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const text = el.textContent?.trim() || '';
        doc.text(text, xPos, yPos);
        yPos += 7;
        doc.setFont('helvetica', 'normal');
      } else if (tagName === 'p') {
        doc.setFontSize(11);

        // Check for styling
        const style = window.getComputedStyle(el);
        const isBold = style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700;
        const isItalic = style.fontStyle === 'italic';

        let fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';
        if (isBold && isItalic) fontStyle = 'bolditalic';
        else if (isBold) fontStyle = 'bold';
        else if (isItalic) fontStyle = 'italic';

        doc.setFont('helvetica', fontStyle);

        const text = el.textContent?.trim() || '';
        if (text) {
          const lines = doc.splitTextToSize(text, maxWidth);
          for (const line of lines) {
            if (yPos + 10 > pageHeight - marginBottom) {
              doc.addPage();
              yPos = marginTop;
            }
            doc.text(line, xPos, yPos);
            yPos += 6;
          }
          yPos += 3; // Extra space after paragraph
        }
        doc.setFont('helvetica', 'normal');
      } else if (tagName === 'ul' || tagName === 'ol') {
        yPos = await processList(doc, el, xPos, yPos, maxWidth, pageHeight, marginBottom, marginTop, tagName === 'ol');
      } else if (tagName === 'strong' || tagName === 'b') {
        doc.setFont('helvetica', 'bold');
        const text = el.textContent?.trim() || '';
        const lines = doc.splitTextToSize(text, maxWidth);
        for (const line of lines) {
          if (yPos + 10 > pageHeight - marginBottom) {
            doc.addPage();
            yPos = marginTop;
          }
          doc.text(line, xPos, yPos);
          yPos += 6;
        }
        doc.setFont('helvetica', 'normal');
      } else if (tagName === 'em' || tagName === 'i') {
        doc.setFont('helvetica', 'italic');
        const text = el.textContent?.trim() || '';
        const lines = doc.splitTextToSize(text, maxWidth);
        for (const line of lines) {
          if (yPos + 10 > pageHeight - marginBottom) {
            doc.addPage();
            yPos = marginTop;
          }
          doc.text(line, xPos, yPos);
          yPos += 6;
        }
        doc.setFont('helvetica', 'normal');
      } else if (tagName === 'br') {
        yPos += 6;
      } else {
        // Recursively process children
        yPos = await processElement(doc, el, xPos, yPos, maxWidth, pageHeight, marginBottom, marginTop);
      }
    }
  }

  return yPos;
}

async function processList(
  doc: jsPDF,
  listElement: HTMLElement,
  xPos: number,
  yPos: number,
  maxWidth: number,
  pageHeight: number,
  marginBottom: number,
  marginTop: number,
  isOrdered: boolean
): Promise<number> {
  const items = listElement.querySelectorAll(':scope > li');
  let itemNumber = 1;

  for (const item of Array.from(items)) {
    if (yPos + 10 > pageHeight - marginBottom) {
      doc.addPage();
      yPos = marginTop;
    }

    const bullet = isOrdered ? `${itemNumber}.` : '•';
    const bulletWidth = 10;

    doc.setFontSize(11);
    doc.text(bullet, xPos, yPos);

    const text = item.textContent?.trim() || '';
    const lines = doc.splitTextToSize(text, maxWidth - bulletWidth);

    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && yPos + 10 > pageHeight - marginBottom) {
        doc.addPage();
        yPos = marginTop;
      }
      doc.text(lines[i], xPos + bulletWidth, yPos);
      yPos += 6;
    }

    itemNumber++;
  }

  yPos += 2; // Extra space after list
  return yPos;
}

/**
 * Generate and download a PDF from HTML content
 */
export async function generateAndDownloadPdf(
  htmlContent: string,
  filename: string,
  options: ConversionOptions = {}
): Promise<void> {
  const pdf = await convertHtmlToPdf(htmlContent, options);
  pdf.save(filename);
}

/**
 * Generate and upload a PDF to Supabase storage
 */
export async function generateAndUploadPdf(
  htmlContent: string,
  storagePath: string,
  options: ConversionOptions = {}
): Promise<string> {
  const pdf = await convertHtmlToPdf(htmlContent, options);
  const pdfBlob = pdf.output('blob');

  const { supabase } = await import('./supabase');

  const { error: uploadError, data } = await supabase.storage
    .from('race-documents')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('race-documents')
    .getPublicUrl(storagePath);

  return publicUrl;
}

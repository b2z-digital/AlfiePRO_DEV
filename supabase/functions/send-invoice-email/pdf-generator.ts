import { jsPDF } from 'npm:jspdf@2.5.1';

export async function generateInvoicePDF(invoice: any, lineItems: any[]): Promise<string> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  let yPos = 20;

  // Header Section - Club Name (left) and INVOICE label (right)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138); // Dark blue
  doc.text(invoice.clubs?.name || 'Club Name', 20, yPos);

  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.text('INVOICE', pageWidth - 20, yPos, { align: 'right' });

  yPos += 10;

  // Horizontal line under header
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(20, yPos, pageWidth - 20, yPos);

  yPos += 15;

  // Two column layout: Club details (left) and Invoice details (right)
  const leftColX = 20;
  const rightColX = pageWidth / 2 + 10;

  // Left column - Club details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('From:', leftColX, yPos);

  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(invoice.clubs?.name || '', leftColX, yPos);

  if (invoice.clubs?.address) {
    yPos += 5;
    doc.text(invoice.clubs.address, leftColX, yPos);
  }

  // Right column - Invoice details
  let rightYPos = yPos - 11;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Number:', rightColX, rightYPos);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoice_number, rightColX + 35, rightYPos);

  rightYPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Date:', rightColX, rightYPos);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(invoice.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), rightColX + 35, rightYPos);

  if (invoice.due_date) {
    rightYPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Due Date:', rightColX, rightYPos);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(invoice.due_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), rightColX + 35, rightYPos);
  }

  yPos += 15;

  // Bill To section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', leftColX, yPos);

  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(invoice.customer_name, leftColX, yPos);

  yPos += 15;

  // Line items table
  const tableTop = yPos;
  const colX = {
    description: 20,
    quantity: 110,
    unitPrice: 135,
    tax: 160,
    amount: pageWidth - 20
  };

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Description', colX.description, yPos);
  doc.text('Qty', colX.quantity, yPos);
  doc.text('Unit Price', colX.unitPrice, yPos);
  doc.text('Tax', colX.tax, yPos);
  doc.text('Amount', colX.amount, yPos, { align: 'right' });

  yPos += 8;

  // Table items
  doc.setFont('helvetica', 'normal');
  lineItems.forEach((item) => {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }

    const gstLabel = invoice.tax_amount > 0 ? 'GST' : '-';

    doc.text(item.description, colX.description, yPos);
    doc.text(String(item.quantity), colX.quantity, yPos);
    doc.text(`$${parseFloat(item.unit_price).toFixed(2)}`, colX.unitPrice, yPos);
    doc.text(gstLabel, colX.tax, yPos);
    doc.text(`$${parseFloat(item.line_total).toFixed(2)}`, colX.amount, yPos, { align: 'right' });
    yPos += 6;
  });

  yPos += 5;

  // Totals section
  const totalsX = pageWidth - 20;
  const totalsLabelX = pageWidth - 70;

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', totalsLabelX, yPos);
  doc.text(`$${parseFloat(invoice.subtotal).toFixed(2)}`, totalsX, yPos, { align: 'right' });

  yPos += 6;

  // Tax
  const taxLabel = invoice.tax_amount > 0 ? `Tax (${invoice.tax_rate || 10}%):` : 'Tax:';
  doc.text(taxLabel, totalsLabelX, yPos);
  doc.text(`$${parseFloat(invoice.tax_amount).toFixed(2)}`, totalsX, yPos, { align: 'right' });

  yPos += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(totalsLabelX, yPos, totalsX, yPos);
  yPos += 6;

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total:', totalsLabelX, yPos);
  doc.text(`$${parseFloat(invoice.total_amount).toFixed(2)}`, totalsX, yPos, { align: 'right' });

  yPos += 10;

  // Payment Details section
  if (invoice.clubs?.bank_name || invoice.clubs?.bsb || invoice.clubs?.account_number) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text('Payment Details', 20, yPos);
    yPos += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    if (invoice.clubs?.bank_name) {
      doc.text(`Bank: ${invoice.clubs.bank_name}`, 20, yPos);
      yPos += 5;
    }

    if (invoice.clubs?.bsb) {
      doc.text(`BSB: ${invoice.clubs.bsb}`, 20, yPos);
      yPos += 5;
    }

    if (invoice.clubs?.account_number) {
      doc.text(`Account: ${invoice.clubs.account_number}`, 20, yPos);
    }
  }

  const pdfOutput = doc.output('datauristring');
  return pdfOutput.split(',')[1];
}

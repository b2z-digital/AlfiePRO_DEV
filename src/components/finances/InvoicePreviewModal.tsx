import React from 'react';
import { X, Download } from 'lucide-react';
import { formatDate } from '../../utils/date';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  date: string;
  due_date?: string;
  reference?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
}

interface InvoiceLineItem {
  id: string;
  description: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  category?: string;
  tax_type: string;
}

interface Club {
  name: string;
  abbreviation: string;
  logo?: string;
}

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  club: Club;
  darkMode: boolean;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onClose,
  invoice,
  lineItems,
  club,
  darkMode
}) => {
  if (!isOpen) return null;

  const handleDownload = () => {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              margin: 0; 
              padding: 20px; 
              color: #333;
              line-height: 1.5;
            }
            .invoice-header { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start; 
              margin-bottom: 40px; 
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 20px;
            }
            .company-info h1 { 
              margin: 0; 
              color: #1f2937; 
              font-size: 28px;
              font-weight: 700;
            }
            .invoice-title { 
              font-size: 36px; 
              font-weight: 700; 
              color: #3b82f6; 
              margin: 0;
            }
            .invoice-details { 
              display: grid; 
              grid-template-columns: 1fr 1fr; 
              gap: 40px; 
              margin-bottom: 40px; 
            }
            .detail-section h3 { 
              margin: 0 0 10px 0; 
              color: #374151; 
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .detail-section p { 
              margin: 5px 0; 
              color: #6b7280;
            }
            .items-table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 30px; 
            }
            .items-table th, .items-table td { 
              padding: 12px; 
              text-align: left; 
              border-bottom: 1px solid #e5e7eb; 
            }
            .items-table th { 
              background-color: #f9fafb; 
              font-weight: 600; 
              color: #374151;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .items-table td { 
              color: #6b7280; 
            }
            .text-right { 
              text-align: right; 
            }
            .totals { 
              margin-left: auto; 
              width: 300px; 
            }
            .totals-row { 
              display: flex; 
              justify-content: space-between; 
              padding: 8px 0; 
              border-bottom: 1px solid #e5e7eb;
            }
            .totals-row.total { 
              font-weight: 700; 
              font-size: 18px; 
              color: #1f2937;
              border-bottom: 2px solid #3b82f6;
              margin-top: 10px;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .status-draft { background-color: #fef3c7; color: #92400e; }
            .status-sent { background-color: #dbeafe; color: #1e40af; }
            .status-paid { background-color: #d1fae5; color: #065f46; }
            .status-overdue { background-color: #fee2e2; color: #991b1b; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-header">
            <div class="company-info">
              <h1>${club.name}</h1>
              <p>${club.abbreviation}</p>
            </div>
            <div>
              <h2 class="invoice-title">INVOICE</h2>
              <p><strong>${invoice.invoice_number}</strong></p>
              <span class="status-badge status-${invoice.status.toLowerCase()}">${invoice.status}</span>
            </div>
          </div>

          <div class="invoice-details">
            <div class="detail-section">
              <h3>Bill To</h3>
              <p><strong>${invoice.customer_name}</strong></p>
              ${invoice.customer_email ? `<p>${invoice.customer_email}</p>` : ''}
            </div>
            <div class="detail-section">
              <h3>Invoice Details</h3>
              <p><strong>Date:</strong> ${formatDate(invoice.date)}</p>
              ${invoice.due_date ? `<p><strong>Due Date:</strong> ${formatDate(invoice.due_date)}</p>` : ''}
              ${invoice.reference ? `<p><strong>Reference:</strong> ${invoice.reference}</p>` : ''}
            </div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">$${item.unit_price.toFixed(2)}</td>
                  <td class="text-right">$${item.line_total.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-row">
              <span>Subtotal:</span>
              <span>$${invoice.subtotal.toFixed(2)}</span>
            </div>
            ${invoice.tax_amount > 0 ? `
              <div class="totals-row">
                <span>Tax:</span>
                <span>$${invoice.tax_amount.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="totals-row total">
              <span>Total:</span>
              <span>$${invoice.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl max-h-[90vh] rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Invoice Preview - {invoice.invoice_number}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={16} />
              Download
            </button>
            <button
              onClick={onClose}
              className={`
                p-2 rounded-full transition-colors
                ${darkMode 
                  ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              `}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Invoice Content */}
        <div className="p-8 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="max-w-3xl mx-auto bg-white text-slate-900 p-8 rounded-lg shadow-sm">
            {/* Invoice Header */}
            <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-slate-200">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">{club.name}</h1>
                <p className="text-slate-600">{club.abbreviation}</p>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-bold text-blue-600 mb-2">INVOICE</h2>
                <p className="text-lg font-semibold text-slate-900">{invoice.invoice_number}</p>
                <span className={`
                  inline-block px-3 py-1 rounded-full text-xs font-semibold mt-2
                  ${invoice.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    invoice.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'}
                `}>
                  {invoice.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Bill To</h3>
                <p className="font-semibold text-slate-900 mb-1">{invoice.customer_name}</p>
                {invoice.customer_email && (
                  <p className="text-slate-600">{invoice.customer_email}</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Invoice Details</h3>
                <div className="space-y-1">
                  <p className="text-slate-600">
                    <span className="font-medium">Date:</span> {formatDate(invoice.date)}
                  </p>
                  {invoice.due_date && (
                    <p className="text-slate-600">
                      <span className="font-medium">Due Date:</span> {formatDate(invoice.due_date)}
                    </p>
                  )}
                  {invoice.reference && (
                    <p className="text-slate-600">
                      <span className="font-medium">Reference:</span> {invoice.reference}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                    <th className="text-right py-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                    <th className="text-right py-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Unit Price</th>
                    <th className="text-right py-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index} className="border-b border-slate-100">
                      <td className="py-3 text-slate-900">{item.description}</td>
                      <td className="py-3 text-right text-slate-600">{item.quantity}</td>
                      <td className="py-3 text-right text-slate-600">${item.unit_price.toFixed(2)}</td>
                      <td className="py-3 text-right font-medium text-slate-900">${item.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-80">
                <div className="flex justify-between py-2 border-b border-slate-200">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-medium text-slate-900">${invoice.subtotal.toFixed(2)}</span>
                </div>
                {invoice.tax_amount > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-200">
                    <span className="text-slate-600">Tax:</span>
                    <span className="font-medium text-slate-900">${invoice.tax_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 border-b-2 border-blue-600 mt-2">
                  <span className="text-lg font-bold text-slate-900">Total:</span>
                  <span className="text-lg font-bold text-slate-900">${invoice.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
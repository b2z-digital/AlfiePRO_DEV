import React, { useState, useEffect } from 'react';
import { X, Send, Mail, User, FileText } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  date: string;
  due_date?: string;
  total_amount: number;
  status: string;
}

interface InvoiceEmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const InvoiceEmailPreviewModal: React.FC<InvoiceEmailPreviewModalProps> = ({
  isOpen,
  onClose,
  invoice,
  darkMode,
  associationId,
  associationType
}) => {
  const { currentClub, user } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const [emailData, setEmailData] = useState({
    to: invoice.customer_email || '',
    subject: `Invoice ${invoice.invoice_number} from ${currentClub?.club?.name || 'Your Club'}`,
    message: `Dear ${invoice.customer_name},

Please find attached invoice ${invoice.invoice_number} for the amount of ${new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(invoice.total_amount)}.

${invoice.due_date ? `Payment is due by ${new Date(invoice.due_date).toLocaleDateString('en-AU')}.` : ''}

If you have any questions about this invoice, please don't hesitate to contact us.

Thank you for your business.

Best regards,
${currentClub?.club?.name || 'Your Club'}`
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!emailData.to || !emailData.subject) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSending(true);
      setError(null);

      // TODO: Implement actual email sending functionality
      // This would typically involve calling an edge function or email service
      console.log('Sending email:', {
        to: emailData.to,
        subject: emailData.subject,
        message: emailData.message,
        invoiceId: invoice.id
      });

      // Simulate sending delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (invoice.status === 'draft') {
        const invoiceTable = isAssociation ? 'association_invoices' : 'invoices';
        const { error: updateError } = await supabase
          .from(invoiceTable)
          .update({ status: 'sent' })
          .eq('id', invoice.id);

        if (updateError) throw updateError;
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err) {
      console.error('Error sending email:', err);
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className={`
        w-full max-w-2xl rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Mail className="text-blue-400" size={24} />
            <div>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Send Invoice
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {invoice.invoice_number}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`
              p-2 rounded-lg transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
            `}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30">
              <p className="text-green-400 text-sm">Invoice sent successfully!</p>
            </div>
          )}

          {/* Email Form */}
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                To *
              </label>
              <div className="relative">
                <User size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="email"
                  required
                  value={emailData.to}
                  onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                  className={`
                    w-full pl-10 pr-4 py-3 rounded-lg border transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
                  `}
                  placeholder="customer@example.com"
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Subject *
              </label>
              <div className="relative">
                <FileText size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  required
                  value={emailData.subject}
                  onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                  className={`
                    w-full pl-10 pr-4 py-3 rounded-lg border transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
                  `}
                  placeholder="Invoice subject"
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Message
              </label>
              <textarea
                value={emailData.message}
                onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                rows={8}
                className={`
                  w-full px-4 py-3 rounded-lg border transition-colors resize-none
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
                `}
                placeholder="Enter your message..."
              />
            </div>
          </div>

          {/* Invoice Summary */}
          <div className={`
            p-4 rounded-lg border
            ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
          `}>
            <h4 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Invoice Summary
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Invoice:</span>
                <span className={`ml-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {invoice.invoice_number}
                </span>
              </div>
              <div>
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Amount:</span>
                <span className={`ml-2 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {new Intl.NumberFormat('en-AU', {
                    style: 'currency',
                    currency: 'AUD'
                  }).format(invoice.total_amount)}
                </span>
              </div>
              <div>
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Customer:</span>
                <span className={`ml-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {invoice.customer_name}
                </span>
              </div>
              {invoice.due_date && (
                <div>
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Due Date:</span>
                  <span className={`ml-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {new Date(invoice.due_date).toLocaleDateString('en-AU')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onClose}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
            `}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !emailData.to || !emailData.subject}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sending...
              </>
            ) : (
              <>
                <Send size={16} />
                Send Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
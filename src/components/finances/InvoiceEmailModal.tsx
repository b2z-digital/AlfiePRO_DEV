import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Send, FileText, Mail, Paperclip } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  total_amount: number;
  date: string;
  due_date?: string;
  reference?: string;
}

interface InvoiceEmailModalProps {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const InvoiceEmailModal: React.FC<InvoiceEmailModalProps> = ({
  invoice,
  isOpen,
  onClose,
  darkMode,
  associationId,
  associationType
}) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const { addNotification } = useNotifications();
  const [sending, setSending] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(invoice.customer_email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeAttachment, setIncludeAttachment] = useState(true);
  const [clubName, setClubName] = useState<string>('');

  useEffect(() => {
    const fetchOrgName = async () => {
      if (!invoice.id) return;

      try {
        if (isAssociation) {
          const assocTable = associationType === 'state' ? 'state_associations' : 'national_associations';
          const { data, error } = await supabase
            .from(assocTable)
            .select('name')
            .eq('id', associationId)
            .maybeSingle();

          if (error || !data) {
            setClubName('Your Association');
          } else {
            setClubName(data.name);
          }
        } else {
          const { data, error } = await supabase
            .from('invoices')
            .select('club_id, clubs(name)')
            .eq('id', invoice.id)
            .single();

          if (error) {
            setClubName(currentClub?.name || 'Your Club');
          } else if (data?.clubs && typeof data.clubs === 'object' && 'name' in data.clubs) {
            setClubName(data.clubs.name);
          } else {
            setClubName(currentClub?.name || 'Your Club');
          }
        }
      } catch (err) {
        console.error('Error:', err);
        setClubName(isAssociation ? 'Your Association' : (currentClub?.name || 'Your Club'));
      }
    };

    if (isOpen) {
      fetchOrgName();
    }
  }, [isOpen, invoice.id, currentClub, isAssociation, associationId, associationType]);

  useEffect(() => {
    if (isOpen && clubName) {
      // Generate default subject
      setSubject(`Invoice ${invoice.invoice_number} from ${clubName}`);

      // Generate default message
      const defaultMessage = `Dear ${invoice.customer_name},

Please find attached invoice ${invoice.invoice_number} for ${invoice.reference || 'services rendered'}.

Invoice Details:
- Invoice Number: ${invoice.invoice_number}
- Amount Due: $${parseFloat(invoice.total_amount.toString()).toFixed(2)}
- Issue Date: ${new Date(invoice.date).toLocaleDateString()}
${invoice.due_date ? `- Due Date: ${new Date(invoice.due_date).toLocaleDateString()}` : ''}

Please process payment at your earliest convenience. If you have any questions regarding this invoice, please don't hesitate to contact us.

Thank you for your business!

Best regards,
${clubName}`;

      setMessage(defaultMessage);
      setRecipientEmail(invoice.customer_email || '');
    }
  }, [isOpen, invoice, clubName]);

  const handleSend = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      addNotification('error', 'Please enter a valid email address');
      return;
    }

    if (!subject.trim()) {
      addNotification('error', 'Please enter a subject line');
      return;
    }

    if (!message.trim()) {
      addNotification('error', 'Please enter a message');
      return;
    }

    try {
      setSending(true);

      // Call edge function to send email
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice_id: invoice.id,
            recipient_email: recipientEmail,
            recipient_name: invoice.customer_name,
            subject,
            message,
            include_attachment: includeAttachment,
            club_name: clubName
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send email');
      }

      const invoiceTable = isAssociation ? 'association_invoices' : 'invoices';
      const { error: updateError } = await supabase
        .from(invoiceTable)
        .update({
          status: 'sent',
          updated_at: new Date().toISOString()
        })
        .eq('id', invoice.id)
        .eq('status', 'draft');

      if (updateError) {
        console.error('Error updating invoice status:', updateError);
      }

      addNotification('success', `Invoice sent successfully to ${recipientEmail}`);
      onClose();
    } catch (error) {
      console.error('Error sending invoice:', error);
      addNotification('error', error instanceof Error ? error.message : 'Failed to send invoice');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className={`
        w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-slideUp
        ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
      `}>
        {/* Modern Gradient Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <Send className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Send Invoice</h2>
              <p className="text-blue-100 text-sm mt-0.5">{invoice.invoice_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 space-y-6">
            {/* Invoice Summary Card */}
            <div className={`
              rounded-xl p-5 border-2 border-dashed
              ${darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'}
            `}>
              <div className="flex items-start gap-4">
                <div className={`
                  p-3 rounded-lg
                  ${darkMode ? 'bg-blue-500/10' : 'bg-blue-50'}
                `}>
                  <FileText size={24} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Invoice Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Customer</p>
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {invoice.customer_name}
                      </p>
                    </div>
                    <div>
                      <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Amount</p>
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        ${parseFloat(invoice.total_amount.toString()).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Date</p>
                      <p className={darkMode ? 'text-white' : 'text-slate-900'}>
                        {new Date(invoice.date).toLocaleDateString()}
                      </p>
                    </div>
                    {invoice.due_date && (
                      <div>
                        <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Due Date</p>
                        <p className={darkMode ? 'text-white' : 'text-slate-900'}>
                          {new Date(invoice.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recipient Email */}
            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <Mail size={16} />
                Recipient Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="customer@example.com"
                className={`
                  w-full px-4 py-2.5 rounded-lg border transition-colors
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500'}
                  focus:outline-none focus:ring-2 focus:ring-blue-500/20
                `}
              />
            </div>

            {/* Subject */}
            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <FileText size={16} />
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Invoice subject"
                className={`
                  w-full px-4 py-2.5 rounded-lg border transition-colors
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500'}
                  focus:outline-none focus:ring-2 focus:ring-blue-500/20
                `}
              />
            </div>

            {/* Message */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={10}
                placeholder="Enter your message..."
                className={`
                  w-full px-4 py-3 rounded-lg border transition-colors resize-none font-mono text-sm leading-relaxed
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500'}
                  focus:outline-none focus:ring-2 focus:ring-blue-500/20
                `}
              />
              <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Tip: Use line breaks to format your message professionally
              </p>
            </div>

            {/* Attachment Option */}
            <div className={`
              flex items-center gap-3 p-4 rounded-lg border
              ${darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'}
            `}>
              <input
                type="checkbox"
                id="include-attachment"
                checked={includeAttachment}
                onChange={(e) => setIncludeAttachment(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <label htmlFor="include-attachment" className={`flex items-center gap-2 text-sm cursor-pointer ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <Paperclip size={16} />
                Include invoice as PDF attachment
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`
          border-t px-8 py-4 flex justify-between items-center
          ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}
        `}>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {includeAttachment && 'Invoice PDF will be attached'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={sending}
              className={`
                px-6 py-2.5 rounded-lg font-medium transition-all
                ${darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !recipientEmail || !subject || !message}
              className="
                flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg
                hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                font-medium shadow-lg shadow-blue-500/30
              "
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
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
    </div>
  );

  return ReactDOM.createPortal(
    modalContent,
    document.body
  );
};

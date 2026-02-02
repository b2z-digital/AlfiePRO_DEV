import React, { useState } from 'react';
import { X, Calendar, DollarSign, CreditCard } from 'lucide-react';
import { Invoice } from '../../types/finance';

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  totalPaid: number;
  onAddPayment: (payment: {
    amount: number;
    paymentMethod: string;
    transactionReference?: string;
    date: string;
  }) => Promise<void>;
  darkMode: boolean;
}

export const AddPaymentModal: React.FC<AddPaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  totalPaid,
  onAddPayment,
  darkMode
}) => {
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [transactionReference, setTransactionReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [payInFull, setPayInFull] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountDue = invoice.total_amount - totalPaid;

  React.useEffect(() => {
    if (payInFull) {
      setAmount(amountDue);
    }
  }, [payInFull, amountDue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (amount <= 0) {
        throw new Error('Payment amount must be greater than 0');
      }

      if (amount > amountDue) {
        throw new Error('Payment amount cannot exceed the amount due');
      }

      await onAddPayment({
        amount,
        paymentMethod,
        transactionReference: transactionReference || undefined,
        date
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-md rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Add Payment
          </h2>
          <button
            onClick={onClose}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className={`
            p-4 rounded-lg
            ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
          `}>
            <h3 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              {invoice.invoice_number}
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Total Amount:</span>
                <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  ${invoice.total_amount.toFixed(2)}
                </div>
              </div>
              <div>
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Amount Due:</span>
                <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  ${amountDue.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Date
            </label>
            <div className="relative">
              <Calendar size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`
                  w-full pl-10 pr-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
                required
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Payment Type
            </label>
            <div className="relative">
              <CreditCard size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={`
                  w-full pl-10 pr-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
                required
              >
                <option value="bank">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Transaction Reference
            </label>
            <input
              type="text"
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
              placeholder="Optional"
              className={`
                w-full px-3 py-2 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
              `}
            />
          </div>

          <div className={`
            p-4 rounded-lg border
            ${darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'}
          `}>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="payInFull"
                checked={payInFull}
                onChange={(e) => setPayInFull(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="payInFull" className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Pay in full
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>AUD</span>
              <div className="relative flex-1">
                <DollarSign size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={amountDue}
                  value={amount}
                  onChange={(e) => {
                    setAmount(parseFloat(e.target.value) || 0);
                    setPayInFull(false);
                  }}
                  className={`
                    w-full pl-10 pr-3 py-2 rounded-lg border text-lg font-medium
                    ${darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-slate-300 text-slate-900'}
                  `}
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`
                flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}
              `}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || amount <= 0}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
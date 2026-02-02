import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Minus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NewTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onSuccess?: () => void;
  onCreateInvoice?: () => void;
  onCreateDeposit?: () => void;
  onCreateExpense?: () => void;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const NewTransactionModal: React.FC<NewTransactionModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onSuccess,
  onCreateInvoice,
  onCreateDeposit,
  onCreateExpense
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleInvoiceClick = () => {
    onClose();
    if (onCreateInvoice) {
      onCreateInvoice();
    } else {
      navigate('/finances/invoices?action=create&type=invoice');
    }
  };

  const handleDepositClick = () => {
    onClose();
    if (onCreateDeposit) {
      onCreateDeposit();
    } else {
      navigate('/finances/invoices?action=create&type=deposit');
    }
  };

  const handleExpenseClick = () => {
    onClose();
    if (onCreateExpense) {
      onCreateExpense();
    } else {
      navigate('/finances/invoices?action=create&type=expense');
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-white">New Transaction</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-slate-400 mb-6">Choose the type of transaction you'd like to create:</p>

        <div className="space-y-3">
          <button
            onClick={handleInvoiceClick}
            className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-blue-600/20">
              <FileText className="text-blue-400" size={20} />
            </div>
            <div>
              <div className="text-white font-medium">New Invoice</div>
              <div className="text-slate-400 text-sm">Create an invoice for services or products</div>
            </div>
          </button>

          <button
            onClick={handleDepositClick}
            className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-green-600/20">
              <Plus className="text-green-400" size={20} />
            </div>
            <div>
              <div className="text-white font-medium">New Deposit</div>
              <div className="text-slate-400 text-sm">Record incoming money or payments</div>
            </div>
          </button>

          <button
            onClick={handleExpenseClick}
            className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-red-600/20">
              <Minus className="text-red-400" size={20} />
            </div>
            <div>
              <div className="text-white font-medium">New Expense</div>
              <div className="text-slate-400 text-sm">Record money spent or outgoing payments</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
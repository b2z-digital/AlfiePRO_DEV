import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Minus, Plus, ChevronRight, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NewTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onSuccess?: () => void;
  onCreateInvoice?: () => void;
  onCreateDeposit?: () => void;
  onCreateExpense?: () => void;
  /** Alfie theme: shows the board's "Import transactions from CSV" option. */
  onImport?: () => void;
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
  onCreateExpense,
  onImport
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

  const Opt = ({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} className="a-opt">
      <span className="a-tile" style={{ width: 46, height: 46 }}>{icon}</span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block a-ink text-base font-semibold">{title}</span>
        <span className="block a-dim text-[13px] mt-[3px]">{desc}</span>
      </span>
      <ChevronRight size={18} className="a-dim" />
    </button>
  );

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <section className="a-msheet" style={{ width: 520 }} role="dialog" aria-modal="true" aria-label="New transaction">
        <div className="flex items-center gap-3" style={{ padding: '20px 18px 6px 22px' }}>
          <span className="a-tile a-tile-rim"><Plus size={19} /></span>
          <h2 className="a-display a-ink flex-1 m-0 text-[22px] font-semibold">New transaction</h2>
          <button onClick={onClose} className="a-ib" aria-label="Close"><X size={20} /></button>
        </div>
        <p className="a-mute text-sm" style={{ margin: '6px 22px 16px' }}>What would you like to record?</p>
        <div className="flex flex-col gap-2.5" style={{ padding: '0 18px 20px' }}>
          <Opt icon={<FileText size={20} />} title="New invoice" desc="Create an invoice for services or products" onClick={handleInvoiceClick} />
          <Opt icon={<Plus size={20} />} title="New deposit" desc="Record incoming money or payments" onClick={handleDepositClick} />
          <Opt icon={<Minus size={20} />} title="New expense" desc="Record money spent or outgoing payments" onClick={handleExpenseClick} />
          {onImport && (
            <button type="button" onClick={() => { onClose(); onImport(); }} className="a-btn a-btn-q" style={{ height: 48, padding: '0 16px', justifyContent: 'flex-start' }}>
              <Upload size={17} />Import transactions from CSV
            </button>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(modalContent, document.body);
};
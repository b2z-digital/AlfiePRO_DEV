import React, { useState, useEffect } from 'react';
import { Receipt, Clock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { formatCurrency } from '../../../utils/formatCurrency';
import { useNavigate } from 'react-router-dom';

interface PendingInvoicesWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const PendingInvoicesWidget: React.FC<PendingInvoicesWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [awaitingPayment, setAwaitingPayment] = useState(0);

  useEffect(() => {
    if (currentClub?.clubId) {
      loadPendingInvoices();
    }
  }, [currentClub]);

  const loadPendingInvoices = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, status')
        .eq('club_id', currentClub.clubId)
        .neq('status', 'paid');

      const pending = invoices?.filter(inv => inv.status === 'pending').length || 0;
      const awaiting = invoices?.filter(inv => inv.status === 'sent').length || 0;

      setPendingCount(pending);
      setAwaitingPayment(awaiting);
    } catch (error) {
      console.error('Error loading pending invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      navigate('/finances?tab=invoices');
    }
  };

  return (
    <div
      className="h-full rounded-xl border backdrop-blur-sm p-6 bg-slate-800/30 border-slate-700/50 relative cursor-pointer hover:border-slate-600/50 transition-colors"
      onClick={handleClick}
    >
      {isEditMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
          title="Remove widget"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-yellow-600/20">
          <Receipt className="text-yellow-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Pending Invoices</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-4xl font-bold text-white mb-1">
            {pendingCount}
          </div>
          <div className="text-sm text-slate-400">
            Draft invoices
          </div>
        </div>
        {awaitingPayment > 0 && (
          <div className="pt-2 border-t border-slate-700/50">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-yellow-400" />
              <span className="text-sm text-slate-300">
                {awaitingPayment} awaiting payment
              </span>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

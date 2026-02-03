import React, { useState, useEffect } from 'react';
import { Receipt, Clock, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { useWidgetTheme } from './ThemedWidgetWrapper';
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
  const themeColors = useWidgetTheme(colorTheme);

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
    <div className="relative w-full h-full">
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}
      <button
        onClick={handleClick}
        disabled={isEditMode}
        className={`relative rounded-2xl p-4 w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer transform hover:scale-[1.02]'}`}
      >
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-yellow-500/20">
            <Receipt className="text-yellow-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Pending Invoices</p>
          {loading ? (
            <p className="text-2xl font-bold text-white">...</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-white mb-0.5">
                {pendingCount}
              </p>
              <p className="text-xs text-slate-400">
                {pendingCount === 1 ? 'Draft invoice' : 'Draft invoices'}
              </p>
            </>
          )}
        </div>
        {awaitingPayment > 0 && (
          <div className="flex-shrink-0">
            <Clock className="text-yellow-400/40" size={32} />
          </div>
        )}
      </button>
    </div>
  );
};

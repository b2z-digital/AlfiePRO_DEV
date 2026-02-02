import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { formatCurrency } from '../../../utils/formatCurrency';

interface GrossIncomeWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const GrossIncomeWidget: React.FC<GrossIncomeWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(true);
  const [grossIncome, setGrossIncome] = useState(0);
  const [changePercent, setChangePercent] = useState(0);

  useEffect(() => {
    if (currentClub?.clubId) {
      loadGrossIncome();
    }
  }, [currentClub]);

  const loadGrossIncome = async () => {
    if (!currentClub?.clubId) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: currentPeriod } = await supabase
        .from('transactions')
        .select('amount')
        .eq('club_id', currentClub.clubId)
        .eq('type', 'deposit')
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const { data: previousPeriod } = await supabase
        .from('transactions')
        .select('amount')
        .eq('club_id', currentClub.clubId)
        .eq('type', 'deposit')
        .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
        .lt('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const currentTotal = currentPeriod?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const previousTotal = previousPeriod?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      setGrossIncome(currentTotal);

      if (previousTotal > 0) {
        const change = ((currentTotal - previousTotal) / previousTotal) * 100;
        setChangePercent(change);
      } else if (currentTotal > 0) {
        setChangePercent(100);
      }
    } catch (error) {
      console.error('Error loading gross income:', error);
    } finally {
      setLoading(false);
    }
  };

  const isPositive = changePercent >= 0;

  return (
    <div className="h-full rounded-xl border backdrop-blur-sm p-6 bg-slate-800/30 border-slate-700/50 relative">
      {isEditMode && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
          title="Remove widget"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-green-600/20">
          <DollarSign className="text-green-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Gross Income</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="text-3xl font-bold text-white mb-2">
            ${formatCurrency(grossIncome)}
          </div>
          <div className="flex items-center gap-1 text-sm">
            {isPositive ? (
              <TrendingUp size={16} className="text-green-400" />
            ) : (
              <TrendingDown size={16} className="text-red-400" />
            )}
            <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
              {isPositive ? '+' : ''}{changePercent.toFixed(1)}% from previous 30 days
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

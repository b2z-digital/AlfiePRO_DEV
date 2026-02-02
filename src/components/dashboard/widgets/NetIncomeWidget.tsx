import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { formatCurrency } from '../../../utils/formatCurrency';

interface NetIncomeWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const NetIncomeWidget: React.FC<NetIncomeWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(true);
  const [netIncome, setNetIncome] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [changePercent, setChangePercent] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);

  useEffect(() => {
    if (currentClub?.clubId) {
      loadNetIncome();
    }
  }, [currentClub]);

  const loadNetIncome = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data: clubData } = await supabase
        .from('clubs')
        .select('finance_settings')
        .eq('id', currentClub.clubId)
        .single();

      const taxSettings = clubData?.finance_settings?.tax || { enabled: false, rate: 0 };
      setTaxEnabled(taxSettings.enabled);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: currentIncome } = await supabase
        .from('transactions')
        .select('amount')
        .eq('club_id', currentClub.clubId)
        .eq('type', 'deposit')
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const { data: currentExpenses } = await supabase
        .from('transactions')
        .select('amount')
        .eq('club_id', currentClub.clubId)
        .eq('type', 'expense')
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const { data: previousIncome } = await supabase
        .from('transactions')
        .select('amount')
        .eq('club_id', currentClub.clubId)
        .eq('type', 'deposit')
        .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
        .lt('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const { data: previousExpenses } = await supabase
        .from('transactions')
        .select('amount')
        .eq('club_id', currentClub.clubId)
        .eq('type', 'expense')
        .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
        .lt('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const currentIncomeTotal = currentIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const currentExpensesTotal = currentExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const currentNet = currentIncomeTotal - currentExpensesTotal;

      const previousIncomeTotal = previousIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const previousExpensesTotal = previousExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const previousNet = previousIncomeTotal - previousExpensesTotal;

      let finalNetIncome = currentNet;
      let calculatedTax = 0;

      if (taxSettings.enabled && taxSettings.rate > 0 && currentNet > 0) {
        calculatedTax = currentNet * (taxSettings.rate / 100);
        finalNetIncome = currentNet - calculatedTax;
      }

      setNetIncome(finalNetIncome);
      setTaxAmount(calculatedTax);

      if (previousNet !== 0) {
        const change = ((currentNet - previousNet) / Math.abs(previousNet)) * 100;
        setChangePercent(change);
      } else if (currentNet > 0) {
        setChangePercent(100);
      }
    } catch (error) {
      console.error('Error loading net income:', error);
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
        <div className={`p-2 rounded-lg ${isPositive ? 'bg-green-600/20' : 'bg-red-600/20'}`}>
          {isPositive ? (
            <TrendingUp className="text-green-400" size={20} />
          ) : (
            <TrendingDown className="text-red-400" size={20} />
          )}
        </div>
        <h3 className="text-lg font-semibold text-white">{taxEnabled ? 'Net Income (After Tax)' : 'Net Income'}</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="text-3xl font-bold text-white mb-2">
            ${formatCurrency(netIncome)}
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

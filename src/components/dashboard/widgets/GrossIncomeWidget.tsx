import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { useWidgetTheme } from './ThemedWidgetWrapper';
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
  const themeColors = useWidgetTheme(colorTheme);

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
      <div className={`relative rounded-2xl p-4 w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background}`}>
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-green-500/20">
            <DollarSign className="text-green-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Gross Income</p>
          {loading ? (
            <p className="text-2xl font-bold text-white">...</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-white mb-0.5">
                ${formatCurrency(grossIncome)}
              </p>
              <p className={`text-xs flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isPositive ? '+' : ''}{changePercent.toFixed(1)}% from previous 30 days
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

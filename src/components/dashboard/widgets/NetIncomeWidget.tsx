import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { formatCurrency } from '../../../utils/formatCurrency';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';

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
  const { type, stateAssociationId, nationalAssociationId } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [netIncome, setNetIncome] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [changePercent, setChangePercent] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    loadNetIncome();
  }, [currentClub, type, stateAssociationId, nationalAssociationId]);

  const loadNetIncome = async () => {
    try {
      let taxSettings = { enabled: false, rate: 0 };
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      let currentIncomeTotal = 0;
      let currentExpensesTotal = 0;
      let previousIncomeTotal = 0;
      let previousExpensesTotal = 0;

      if (type === 'state' && stateAssociationId) {
        // Get tax settings for state association
        const { data: assocData } = await supabase
          .from('state_associations')
          .select('finance_settings')
          .eq('id', stateAssociationId)
          .single();

        taxSettings = assocData?.finance_settings?.tax || { enabled: false, rate: 0 };
        setTaxEnabled(taxSettings.enabled);

        const { data: currentIncome } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('type', 'income')
          .eq('payment_status', 'completed')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

        const { data: currentExpenses } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('type', 'expense')
          .eq('payment_status', 'completed')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

        const { data: previousIncome } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('type', 'income')
          .eq('payment_status', 'completed')
          .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
          .lt('date', thirtyDaysAgo.toISOString().split('T')[0]);

        const { data: previousExpenses } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('type', 'expense')
          .eq('payment_status', 'completed')
          .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
          .lt('date', thirtyDaysAgo.toISOString().split('T')[0]);

        currentIncomeTotal = currentIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        currentExpensesTotal = currentExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        previousIncomeTotal = previousIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        previousExpensesTotal = previousExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      } else if (type === 'national' && nationalAssociationId) {
        // Get tax settings for national association
        const { data: assocData } = await supabase
          .from('national_associations')
          .select('finance_settings')
          .eq('id', nationalAssociationId)
          .single();

        taxSettings = assocData?.finance_settings?.tax || { enabled: false, rate: 0 };
        setTaxEnabled(taxSettings.enabled);

        const { data: currentIncome } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', nationalAssociationId)
          .eq('association_type', 'national')
          .eq('type', 'income')
          .eq('payment_status', 'completed')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

        const { data: currentExpenses } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', nationalAssociationId)
          .eq('association_type', 'national')
          .eq('type', 'expense')
          .eq('payment_status', 'completed')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

        const { data: previousIncome } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', nationalAssociationId)
          .eq('association_type', 'national')
          .eq('type', 'income')
          .eq('payment_status', 'completed')
          .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
          .lt('date', thirtyDaysAgo.toISOString().split('T')[0]);

        const { data: previousExpenses } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', nationalAssociationId)
          .eq('association_type', 'national')
          .eq('type', 'expense')
          .eq('payment_status', 'completed')
          .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
          .lt('date', thirtyDaysAgo.toISOString().split('T')[0]);

        currentIncomeTotal = currentIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        currentExpensesTotal = currentExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        previousIncomeTotal = previousIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        previousExpensesTotal = previousExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      } else if (currentClub?.clubId) {
        const { data: clubData } = await supabase
          .from('clubs')
          .select('finance_settings')
          .eq('id', currentClub.clubId)
          .single();

        taxSettings = clubData?.finance_settings?.tax || { enabled: false, rate: 0 };
        setTaxEnabled(taxSettings.enabled);

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

        currentIncomeTotal = currentIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        currentExpensesTotal = currentExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        previousIncomeTotal = previousIncome?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        previousExpensesTotal = previousExpenses?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      }

      const currentNet = currentIncomeTotal - currentExpensesTotal;
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
          <div className={`p-3 rounded-xl ${isPositive ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {isPositive ? (
              <TrendingUp className="text-green-400" size={24} />
            ) : (
              <TrendingDown className="text-red-400" size={24} />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Net Income</p>
          {loading ? (
            <p className="text-2xl font-bold text-white">...</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-white mb-0.5">
                ${formatCurrency(netIncome)}
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

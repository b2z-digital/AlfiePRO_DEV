import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, AlertCircle, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';

export const FinancialHealthWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { type, stateAssociationId, nationalAssociationId } = useOrganizationContext();
  const [financialData, setFinancialData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchFinancialData();
  }, [currentClub, type, stateAssociationId, nationalAssociationId]);

  const fetchFinancialData = async () => {
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // For associations, query association_transactions
      if (type === 'state' && stateAssociationId) {
        const { data: transactions, error } = await supabase
          .from('association_transactions')
          .select('amount, type, payment_status, date')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

        if (error) {
          console.error('Error fetching association transactions:', error);
          setFinancialData({
            income: 0,
            expenses: 0,
            netIncome: 0,
            outstanding: 0,
            transactionCount: 0
          });
          setLoading(false);
          return;
        }

        const completedTransactions = transactions?.filter(t => t.payment_status === 'completed') || [];
        const income = completedTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
        const expenses = completedTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
        const outstanding = transactions?.filter(t => t.payment_status === 'pending').reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        setFinancialData({
          income,
          expenses,
          netIncome: income - expenses,
          outstanding,
          transactionCount: transactions?.length || 0
        });
      } else if (type === 'national' && nationalAssociationId) {
        const { data: transactions, error } = await supabase
          .from('association_transactions')
          .select('amount, type, payment_status, date')
          .eq('association_id', nationalAssociationId)
          .eq('association_type', 'national')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

        if (error) {
          console.error('Error fetching association transactions:', error);
          setFinancialData({
            income: 0,
            expenses: 0,
            netIncome: 0,
            outstanding: 0,
            transactionCount: 0
          });
          setLoading(false);
          return;
        }

        const completedTransactions = transactions?.filter(t => t.payment_status === 'completed') || [];
        const income = completedTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
        const expenses = completedTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
        const outstanding = transactions?.filter(t => t.payment_status === 'pending').reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        setFinancialData({
          income,
          expenses,
          netIncome: income - expenses,
          outstanding,
          transactionCount: transactions?.length || 0
        });
      } else if (currentClub?.clubId) {
        // For clubs, use membership_transactions as the finance source
        const { data: transactions, error } = await supabase
          .from('membership_transactions')
          .select('amount, payment_status, created_at')
          .eq('club_id', currentClub.clubId)
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (error) {
          console.error('Error fetching transactions:', error);
          setFinancialData({
            income: 0,
            expenses: 0,
            netIncome: 0,
            outstanding: 0,
            transactionCount: 0
          });
          setLoading(false);
          return;
        }

        const income = transactions?.filter(t => t.payment_status === 'paid').reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
        const outstanding = transactions?.filter(t => t.payment_status === 'pending').reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

        setFinancialData({
          income,
          expenses: 0,
          netIncome: income,
          outstanding,
          transactionCount: transactions?.length || 0
        });
      } else {
        setFinancialData({
          income: 0,
          expenses: 0,
          netIncome: 0,
          outstanding: 0,
          transactionCount: 0
        });
      }
    } catch (err) {
      console.error('Error fetching financial data:', err);
      setFinancialData({
        income: 0,
        expenses: 0,
        netIncome: 0,
        outstanding: 0,
        transactionCount: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      navigate('/finances');
    }
  };

  return (
    <div
      onClick={!isEditMode ? handleClick : undefined}
      className={`
        relative rounded-2xl p-4 text-left transition-all w-full h-full
        ${isEditMode ? 'cursor-auto' : 'cursor-pointer transform hover:scale-105'}
        ${darkMode
          ? `border backdrop-blur-sm ${themeColors.background} ${!isEditMode ? 'hover:bg-slate-700/40' : ''}`
          : `bg-white shadow-xl ${!isEditMode ? 'hover:shadow-2xl' : ''}`}
        ${isEditMode ? 'animate-wiggle' : ''}
      `}
    >
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Remove button clicked for Financial widget');
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className={darkMode ? "text-green-400" : "text-green-500"} size={18} />
          <h2 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-700'}`}>Financial Health</h2>
        </div>
        {!isEditMode && <ChevronRight size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />}
      </div>

      {loading ? (
        <div className="text-center py-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto"></div>
        </div>
      ) : financialData ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Net Income (30d)</span>
            <span className={`text-base font-bold ${financialData.netIncome >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${Math.abs(financialData.netIncome).toFixed(0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Outstanding</span>
            <span className={`text-xs font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
              ${financialData.outstanding.toFixed(0)}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-700/30">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-[10px] text-slate-400 mb-0.5">Income vs Expenses</div>
                <div className="flex gap-2 text-xs">
                  <span className="text-green-500">${financialData.income.toFixed(0)}</span>
                  <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>/</span>
                  <span className="text-red-500">${financialData.expenses.toFixed(0)}</span>
                </div>
              </div>
              {financialData.netIncome >= 0 ? (
                <TrendingUp className="text-green-500" size={14} />
              ) : (
                <AlertCircle className="text-red-500" size={16} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <DollarSign className="mx-auto mb-2 text-slate-500" size={32} />
          <p className="text-sm text-slate-400">No financial data</p>
        </div>
      )}
    </div>
  );
};

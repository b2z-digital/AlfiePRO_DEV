import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Receipt } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../utils/formatCurrency';

interface Transaction {
  id: string;
  type: 'deposit' | 'expense';
  description: string;
  amount: number;
  date: string;
  budget_categories?: {
    name: string;
  };
}

interface RecentTransactionsWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const RecentTransactionsWidget: React.FC<RecentTransactionsWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (currentClub?.clubId) {
      loadRecentTransactions();
    }
  }, [currentClub]);

  const loadRecentTransactions = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data } = await supabase
        .from('transactions')
        .select(`
          id,
          type,
          description,
          amount,
          date,
          budget_categories (
            name
          )
        `)
        .eq('club_id', currentClub.clubId)
        .order('date', { ascending: false })
        .limit(5);

      setTransactions(data || []);
    } catch (error) {
      console.error('Error loading recent transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleViewAll = () => {
    if (!isEditMode) {
      navigate('/finances?tab=transactions');
    }
  };

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
        <div className="p-2 rounded-lg bg-blue-600/20">
          <Receipt className="text-blue-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
      <div className="flex flex-col gap-2">
        {transactions.length === 0 ? (
          <div className="text-sm text-slate-400 py-4 text-center">
            No transactions yet
          </div>
        ) : (
          <>
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`p-1.5 rounded-lg ${
                    transaction.type === 'deposit'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {transaction.type === 'deposit' ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {transaction.description}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDate(transaction.date)} • {transaction.budget_categories?.name || 'Uncategorized'}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${
                  transaction.type === 'deposit' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {transaction.type === 'deposit' ? '+' : '-'}${formatCurrency(Number(transaction.amount))}
                </div>
              </div>
            ))}
            {!isEditMode && (
              <button
                onClick={handleViewAll}
                className="text-sm text-blue-400 hover:text-blue-300 text-center py-2 transition-colors"
              >
                View all transactions →
              </button>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
};

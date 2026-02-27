import React, { useState, useEffect } from 'react';
import { Coins, Plus, TrendingDown, TrendingUp, Gift, Clock, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface TokenBalance {
  balance: number;
  total_purchased: number;
  total_used: number;
}

interface TokenTransaction {
  id: string;
  transaction_type: 'purchase' | 'usage' | 'refund' | 'bonus';
  amount: number;
  description: string;
  created_at: string;
}

const TOKEN_PACKS = [
  { id: 'starter', name: 'Starter', tokens: 50, price: 10, popular: false },
  { id: 'standard', name: 'Standard', tokens: 200, price: 30, popular: true, savings: '25%' },
  { id: 'premium', name: 'Premium', tokens: 500, price: 60, popular: false, savings: '40%' },
  { id: 'enterprise', name: 'Enterprise', tokens: 1500, price: 150, popular: false, savings: '50%' },
];

interface SmsTokenManagerProps {
  darkMode?: boolean;
  clubId: string;
}

export const SmsTokenManager: React.FC<SmsTokenManagerProps> = ({ darkMode = true, clubId }) => {
  const { addNotification } = useNotifications();
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  useEffect(() => {
    if (clubId) {
      fetchData();
    }
  }, [clubId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: bal } = await supabase
        .from('sms_token_balances')
        .select('*')
        .eq('club_id', clubId)
        .maybeSingle();

      if (bal) {
        setBalance(bal);
      } else {
        const { data: newBal } = await supabase
          .from('sms_token_balances')
          .insert({ club_id: clubId, balance: 0, total_purchased: 0, total_used: 0 })
          .select()
          .single();
        setBalance(newBal ? { balance: newBal.balance, total_purchased: newBal.total_purchased, total_used: newBal.total_used } : { balance: 0, total_purchased: 0, total_used: 0 });
      }

      const { data: txns } = await supabase
        .from('sms_token_transactions')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(20);

      setTransactions(txns || []);
    } catch (err) {
      console.error('Error fetching token data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pack: typeof TOKEN_PACKS[0]) => {
    setPurchasing(pack.id);
    try {
      const currentBalance = balance?.balance || 0;
      const currentPurchased = balance?.total_purchased || 0;

      await supabase
        .from('sms_token_balances')
        .upsert({
          club_id: clubId,
          balance: currentBalance + pack.tokens,
          total_purchased: currentPurchased + pack.tokens,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'club_id' });

      await supabase
        .from('sms_token_transactions')
        .insert({
          club_id: clubId,
          transaction_type: 'purchase',
          amount: pack.tokens,
          description: `Purchased ${pack.name} pack - ${pack.tokens} tokens ($${pack.price})`,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        });

      addNotification('success', `${pack.tokens} SMS tokens added to your balance!`);
      fetchData();
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to purchase tokens');
    } finally {
      setPurchasing(null);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'purchase': return <ArrowUpRight size={14} className="text-green-400" />;
      case 'usage': return <ArrowDownRight size={14} className="text-red-400" />;
      case 'refund': return <ArrowUpRight size={14} className="text-blue-400" />;
      case 'bonus': return <Gift size={14} className="text-amber-400" />;
      default: return <Clock size={14} className="text-slate-400" />;
    }
  };

  const usagePercentage = balance
    ? balance.total_purchased > 0
      ? Math.round((balance.total_used / balance.total_purchased) * 100)
      : 0
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const displayedTransactions = showAllTransactions ? transactions : transactions.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className={`relative overflow-hidden rounded-2xl ${
        darkMode
          ? 'bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 border border-slate-700/50'
          : 'bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-slate-200'
      }`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/5 rounded-full -ml-24 -mb-24"></div>

        <div className="relative p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                SMS Token Balance
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-4xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {balance?.balance.toLocaleString() || '0'}
                </span>
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>tokens</span>
              </div>
            </div>
            <div className={`p-3 rounded-xl ${
              (balance?.balance || 0) > 50
                ? 'bg-teal-500/10 ring-1 ring-teal-500/20'
                : (balance?.balance || 0) > 0
                  ? 'bg-amber-500/10 ring-1 ring-amber-500/20'
                  : 'bg-red-500/10 ring-1 ring-red-500/20'
            }`}>
              <Coins size={24} className={
                (balance?.balance || 0) > 50
                  ? 'text-teal-400'
                  : (balance?.balance || 0) > 0
                    ? 'text-amber-400'
                    : 'text-red-400'
              } />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700/40' : 'bg-white/80'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={12} className="text-green-400" />
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Purchased</span>
              </div>
              <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {balance?.total_purchased.toLocaleString() || '0'}
              </p>
            </div>
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700/40' : 'bg-white/80'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown size={12} className="text-red-400" />
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Used</span>
              </div>
              <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {balance?.total_used.toLocaleString() || '0'}
              </p>
            </div>
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700/40' : 'bg-white/80'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Zap size={12} className="text-blue-400" />
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Usage</span>
              </div>
              <p className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {usagePercentage}%
              </p>
            </div>
          </div>

          {(balance?.balance || 0) <= 10 && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400 font-medium">
                {(balance?.balance || 0) === 0
                  ? 'No tokens remaining. Purchase tokens to send SMS notifications.'
                  : `Low balance! Only ${balance?.balance} tokens remaining.`
                }
              </p>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Top Up Tokens
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TOKEN_PACKS.map((pack) => (
            <div
              key={pack.id}
              className={`relative rounded-xl p-4 transition-all cursor-pointer group ${
                pack.popular
                  ? darkMode
                    ? 'bg-blue-500/10 border-2 border-blue-500/40 hover:border-blue-400/60'
                    : 'bg-blue-50 border-2 border-blue-300 hover:border-blue-400'
                  : darkMode
                    ? 'bg-slate-800 border border-slate-700 hover:border-slate-600'
                    : 'bg-white border border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => !purchasing && handlePurchase(pack)}
            >
              {pack.popular && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                  Popular
                </div>
              )}
              {pack.savings && (
                <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  darkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                }`}>
                  Save {pack.savings}
                </div>
              )}
              <div className="text-center">
                <p className={`text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {pack.name}
                </p>
                <div className="flex items-baseline justify-center gap-1 mb-2">
                  <span className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {pack.tokens}
                  </span>
                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>tokens</span>
                </div>
                <button
                  disabled={purchasing === pack.id}
                  className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${
                    pack.popular
                      ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20'
                      : darkMode
                        ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  {purchasing === pack.id ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    </div>
                  ) : (
                    `$${pack.price} AUD`
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className={`text-xs mt-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          1 token = 1 SMS message. Tokens never expire. Prices in AUD.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Transaction History
          </h3>
          {transactions.length > 5 && (
            <button
              onClick={() => setShowAllTransactions(!showAllTransactions)}
              className={`text-sm font-medium ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
            >
              {showAllTransactions ? 'Show Less' : 'View All'}
            </button>
          )}
        </div>

        {displayedTransactions.length === 0 ? (
          <div className={`text-center py-8 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
            <Coins size={32} className={`mx-auto mb-2 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              No transactions yet. Purchase tokens to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayedTransactions.map((txn) => (
              <div
                key={txn.id}
                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  darkMode ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    txn.transaction_type === 'purchase' ? 'bg-green-500/10' :
                    txn.transaction_type === 'usage' ? 'bg-red-500/10' :
                    txn.transaction_type === 'bonus' ? 'bg-amber-500/10' :
                    'bg-blue-500/10'
                  }`}>
                    {getTransactionIcon(txn.transaction_type)}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      {txn.description}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {new Date(txn.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-bold tabular-nums ${
                  txn.amount > 0
                    ? darkMode ? 'text-green-400' : 'text-green-600'
                    : darkMode ? 'text-red-400' : 'text-red-600'
                }`}>
                  {txn.amount > 0 ? '+' : ''}{txn.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

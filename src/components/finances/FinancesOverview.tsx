import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Receipt, Plus, ArrowUpRight, ArrowDownRight, ChevronDown, FileText, Minus, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { FinancialChart } from './FinancialChart';

interface Transaction {
  id: string;
  type: 'deposit' | 'expense' | 'income';
  description: string;
  amount: number;
  date: string;
  category_id?: string;
  created_at: string;
  budget_categories?: {
    name: string;
    type: 'income' | 'expense';
  };
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  status: string;
  date: string;
  created_at: string;
}

interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  taxAmount: number;
  netIncomeAfterTax: number;
  pendingInvoicesCount: number;
  pendingInvoicesAmount: number;
  incomeChange: number;
  expensesChange: number;
  netIncomeChange: number;
  membershipIncome: number;
  pendingMembershipPayments: number;
  openingBalance: number;
  currentBalance: number;
}

type PeriodType = '7d' | '30d' | '90d' | '1y';

interface FinancesOverviewProps {
  darkMode: boolean;
  onNewTransaction: () => void;
  onTabChange: (tab: string) => void;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const FinancesOverview: React.FC<FinancesOverviewProps> = ({
  darkMode,
  onNewTransaction,
  onTabChange,
  associationId,
  associationType
}) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<PeriodType>('30d');
  const [clubTaxSettings, setClubTaxSettings] = useState<{ enabled: boolean; rate: number; name: string }>({
    enabled: false,
    rate: 0,
    name: ''
  });
  const [summary, setSummary] = useState<FinancialSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    netIncome: 0,
    taxAmount: 0,
    netIncomeAfterTax: 0,
    pendingInvoicesCount: 0,
    pendingInvoicesAmount: 0,
    incomeChange: 0,
    expensesChange: 0,
    netIncomeChange: 0,
    membershipIncome: 0,
    pendingMembershipPayments: 0,
    openingBalance: 0,
    currentBalance: 0
  });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    console.log('FinancesOverview useEffect triggered - isAssociation:', isAssociation, 'currentClub:', currentClub?.clubId, 'associationId:', associationId);
    if (isAssociation || currentClub?.clubId) {
      loadFinancialData();
    } else {
      console.log('FinancesOverview: No association or club in useEffect, setting loading to false');
      setLoading(false);
    }
  }, [currentClub, period, associationId, associationType]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const handleTransactionTypeClick = (type: 'invoice' | 'deposit' | 'expense') => {
    setShowDropdown(false);
    navigate(`/finances/invoices?action=create&type=${type}`);
  };

  const loadFinancialData = async () => {
    console.log('loadFinancialData called - isAssociation:', isAssociation, 'currentClub:', currentClub?.clubId);

    if (!isAssociation && !currentClub?.clubId) {
      console.log('No association or club, returning early');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isAssociation) {
        console.log('Loading association financial data...');
        // Load association financial data
        await loadAssociationFinancialData();
      } else {
        console.log('Loading club financial data...');
        // Load club financial data
        await loadClubFinancialData();
      }

      console.log('Financial data loaded successfully');
    } catch (error: any) {
      console.error('Error loading financial data:', error);
      setError(error.message || 'Failed to load financial data');
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
    }
  };

  const loadAssociationFinancialData = async () => {
    if (!associationId || !associationType) {
      console.log('No association ID or type provided');
      return;
    }

    console.log('Loading association financial data for:', associationId, associationType);

    // Fetch opening balance from finance settings
    const { data: financeSettings, error: financeError } = await supabase
      .from('association_finance_settings')
      .select('opening_balance')
      .eq('association_id', associationId)
      .eq('association_type', associationType)
      .maybeSingle();

    const openingBalance = financeSettings?.opening_balance || 0;

    // Calculate date ranges based on selected period
    const now = new Date();
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Get recent transactions
    const { data: recentTrans, error: transError } = await supabase
      .from('association_transactions')
      .select('*, association_budget_categories(name, type)')
      .eq('association_id', associationId)
      .eq('association_type', associationType)
      .order('date', { ascending: false })
      .limit(5);

    if (transError) {
      console.error('Error loading transactions:', transError);
      throw transError;
    }

    setRecentTransactions(recentTrans || []);

    // Get all transactions for all-time calculation
    const { data: allTransactions, error: allTransError } = await supabase
      .from('association_transactions')
      .select('*')
      .eq('association_id', associationId)
      .eq('association_type', associationType);

    if (allTransError) {
      console.error('Error loading all transactions:', allTransError);
      throw allTransError;
    }

    // Calculate all-time totals
    const totalAllTimeIncome = (allTransactions || [])
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalAllTimeExpenses = (allTransactions || [])
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Current balance = Opening Balance + All Time Income - All Time Expenses
    const currentBalance = openingBalance + totalAllTimeIncome - totalAllTimeExpenses;

    // Calculate current period totals
    const currentIncome = (allTransactions || [])
      .filter(t => t.type === 'income' && new Date(t.date) >= startDate && new Date(t.date) <= endDate)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const currentExpenses = (allTransactions || [])
      .filter(t => t.type === 'expense' && new Date(t.date) >= startDate && new Date(t.date) <= endDate)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const currentNetIncome = currentIncome - currentExpenses;

    // Calculate previous period totals for comparison
    const prevIncome = (allTransactions || [])
      .filter(t => t.type === 'income' && new Date(t.date) >= prevStartDate && new Date(t.date) < startDate)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const prevExpenses = (allTransactions || [])
      .filter(t => t.type === 'expense' && new Date(t.date) >= prevStartDate && new Date(t.date) < startDate)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const prevNetIncome = prevIncome - prevExpenses;

    // Calculate percentage changes
    const incomeChange = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome) * 100 : 0;
    const expensesChange = prevExpenses > 0 ? ((currentExpenses - prevExpenses) / prevExpenses) * 100 : 0;
    const netIncomeChange = prevNetIncome > 0 ? ((currentNetIncome - prevNetIncome) / prevNetIncome) * 100 : 0;

    // Get pending invoices
    const { data: pendingInvoices, error: invoicesError } = await supabase
      .from('association_invoices')
      .select('*')
      .eq('association_id', associationId)
      .eq('association_type', associationType)
      .in('status', ['sent', 'overdue']);

    const pendingInvoicesCount = pendingInvoices?.length || 0;
    const pendingInvoicesAmount = (pendingInvoices || [])
      .reduce((sum, inv) => sum + Number(inv.total_amount), 0);

    // Calculate membership income (from remittances)
    const membershipIncome = (allTransactions || [])
      .filter(t => t.type === 'income' && t.linked_entity_type === 'remittance')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    setSummary({
      totalIncome: currentIncome,
      totalExpenses: currentExpenses,
      netIncome: currentNetIncome,
      taxAmount: 0,
      netIncomeAfterTax: currentNetIncome,
      pendingInvoicesCount,
      pendingInvoicesAmount,
      incomeChange,
      expensesChange,
      netIncomeChange,
      membershipIncome,
      pendingMembershipPayments: 0,
      openingBalance,
      currentBalance
    });
  };

  const loadClubFinancialData = async () => {
    if (!currentClub?.clubId) return;

    // Fetch club tax settings
    const { data: clubData, error: clubError } = await supabase
      .from('clubs')
        .select('tax_enabled, tax_rate, tax_name')
        .eq('id', currentClub.clubId)
        .single();

      if (clubError) throw clubError;

      setClubTaxSettings({
        enabled: clubData?.tax_enabled || false,
        rate: clubData?.tax_rate || 0,
        name: clubData?.tax_name || 'Tax'
      });

      // Fetch opening balance from finance settings
      const { data: financeSettings, error: financeError } = await supabase
        .from('club_finance_settings')
        .select('opening_balance')
        .eq('club_id', currentClub.clubId)
        .maybeSingle();

      const openingBalance = financeSettings?.opening_balance || 0;

      // Calculate date ranges based on selected period
      const now = new Date();
      const endDate = new Date();
      const startDate = new Date();
      const comparisonStartDate = new Date();
      const comparisonEndDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          comparisonStartDate.setDate(comparisonEndDate.getDate() - 14);
          comparisonEndDate.setDate(comparisonEndDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          comparisonStartDate.setDate(comparisonEndDate.getDate() - 60);
          comparisonEndDate.setDate(comparisonEndDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          comparisonStartDate.setDate(comparisonEndDate.getDate() - 180);
          comparisonEndDate.setDate(comparisonEndDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          comparisonStartDate.setFullYear(comparisonEndDate.getFullYear() - 2);
          comparisonEndDate.setFullYear(comparisonEndDate.getFullYear() - 1);
          break;
      }

      // Fetch current period transactions
      const { data: currentTransactions, error: currentTransError} = await supabase
        .from('transactions')
        .select(`
          *,
          budget_categories (
            name,
            type
          )
        `)
        .eq('club_id', currentClub.clubId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);

      if (currentTransError) throw currentTransError;

      // Fetch comparison period transactions
      const { data: previousTransactions, error: previousTransError } = await supabase
        .from('transactions')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .gte('date', comparisonStartDate.toISOString().split('T')[0])
        .lte('date', comparisonEndDate.toISOString().split('T')[0]);

      if (previousTransError) throw previousTransError;

      // Fetch pending invoices
      const { data: pendingInvoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('total_amount, status')
        .eq('club_id', currentClub.clubId)
        .in('status', ['draft', 'sent']);

      if (invoicesError) throw invoicesError;

      const pendingInvoicesAmount = (pendingInvoices || [])
        .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);

      // Fetch recent transactions (last 4)
      const { data: recentTrans, error: recentError } = await supabase
        .from('transactions')
        .select(`
          *,
          budget_categories (
            name,
            type
          )
        `)
        .eq('club_id', currentClub.clubId)
        .order('date', { ascending: false })
        .limit(4);

      if (recentError) throw recentError;

      // Fetch all membership transactions (not limited by date)
      const { data: membershipTrans, error: membershipError } = await supabase
        .from('membership_transactions')
        .select('total_amount, payment_status')
        .eq('club_id', currentClub.clubId);

      if (membershipError) throw membershipError;

      // Fetch all transactions categorized as Membership Fees
      const { data: membershipFeeTransactions, error: membershipFeeError } = await supabase
        .from('transactions')
        .select(`
          amount,
          type,
          budget_categories!inner (
            system_key
          )
        `)
        .eq('club_id', currentClub.clubId)
        .eq('budget_categories.system_key', 'membership_fees')
        .in('type', ['income', 'deposit']);

      if (membershipFeeError) throw membershipFeeError;

      // Calculate membership income from membership_transactions table
      const membershipTransIncome = (membershipTrans || [])
        .filter(t => t.payment_status === 'paid')
        .reduce((sum, t) => sum + Number(t.total_amount), 0);

      // Calculate membership income from transactions table (deposits/income in Membership Fees category)
      const membershipFeeIncome = (membershipFeeTransactions || [])
        .reduce((sum, t) => sum + Number(t.amount), 0);

      // Total membership income from both sources
      const membershipIncome = membershipTransIncome + membershipFeeIncome;

      const pendingMembershipPayments = (membershipTrans || [])
        .filter(t => t.payment_status === 'pending').length;

      // Calculate current period totals
      const currentIncome = (currentTransactions || [])
        .filter(t => t.type === 'income' || t.type === 'deposit')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const currentExpenses = (currentTransactions || [])
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const currentNetIncome = currentIncome - currentExpenses;

      // Calculate tax if enabled (GST-inclusive calculation)
      // For GST: if gross is $35 with 10% GST, the GST component is $35 × (0.1 / 1.1) = $3.18
      const taxRate = Number(clubData?.tax_rate) || 0;
      const taxAmount = clubData?.tax_enabled && taxRate > 0
        ? currentNetIncome * (taxRate / (1 + taxRate))
        : 0;

      const netIncomeAfterTax = currentNetIncome - taxAmount;

      // Calculate previous period totals for comparison
      const previousIncome = (previousTransactions || [])
        .filter(t => t.type === 'income' || t.type === 'deposit')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const previousExpenses = (previousTransactions || [])
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const previousNetIncome = previousIncome - previousExpenses;

      // Calculate percentage changes
      const incomeChange = previousIncome > 0
        ? ((currentIncome - previousIncome) / previousIncome) * 100
        : currentIncome > 0 ? 100 : 0;

      const expensesChange = previousExpenses > 0
        ? ((currentExpenses - previousExpenses) / previousExpenses) * 100
        : currentExpenses > 0 ? 100 : 0;

      const netIncomeChange = previousNetIncome !== 0
        ? ((currentNetIncome - previousNetIncome) / Math.abs(previousNetIncome)) * 100
        : currentNetIncome > 0 ? 100 : currentNetIncome < 0 ? -100 : 0;

      // Fetch ALL transactions to calculate current balance
      const { data: allTransactions, error: allTransError } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('club_id', currentClub.clubId);

      if (allTransError) throw allTransError;

      const totalAllTimeIncome = (allTransactions || [])
        .filter(t => t.type === 'income' || t.type === 'deposit')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const totalAllTimeExpenses = (allTransactions || [])
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      // Current balance = Opening Balance + All Time Income - All Time Expenses
      const currentBalance = openingBalance + totalAllTimeIncome - totalAllTimeExpenses;

      setSummary({
        totalIncome: currentIncome,
        totalExpenses: currentExpenses,
        netIncome: currentNetIncome,
        taxAmount,
        netIncomeAfterTax,
        pendingInvoicesCount: pendingInvoices?.length || 0,
        pendingInvoicesAmount,
        membershipIncome,
        pendingMembershipPayments,
        incomeChange,
        expensesChange,
        netIncomeChange,
        openingBalance,
        currentBalance
      });

      setRecentTransactions(recentTrans || []);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  };

  const getPeriodLabel = () => {
    switch (period) {
      case '7d': return '7 days';
      case '30d': return '30 days';
      case '90d': return '90 days';
      case '1y': return '1 year';
      default: return 'period';
    }
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-slate-400';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp size={14} />;
    if (change < 0) return <TrendingDown size={14} />;
    return null;
  };

  console.log('FinancesOverview render - loading:', loading, 'error:', error, 'summary:', summary);

  if (loading) {
    console.log('FinancesOverview: Showing loading spinner');
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={loadFinancialData}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-white">Financial Overview</h2>
        <div className="relative" ref={dropdownRef}>
          <div className="flex">
            <button
              onClick={onNewTransaction}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-l-lg hover:bg-green-700 transition-colors animate-pulse"
            >
              <Plus size={16} />
              New Transaction
            </button>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="px-3 py-2 bg-green-600 text-white border-l border-green-700 rounded-r-lg hover:bg-green-700 transition-colors"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
              <button
                onClick={() => handleTransactionTypeClick('invoice')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-blue-600/20">
                  <FileText className="text-blue-400" size={18} />
                </div>
                <div>
                  <div className="text-white font-medium text-sm">New Invoice</div>
                  <div className="text-slate-400 text-xs">Create an invoice for services or products</div>
                </div>
              </button>

              <button
                onClick={() => handleTransactionTypeClick('deposit')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-green-600/20">
                  <Plus className="text-green-400" size={18} />
                </div>
                <div>
                  <div className="text-white font-medium text-sm">New Deposit</div>
                  <div className="text-slate-400 text-xs">Record incoming money or payments</div>
                </div>
              </button>

              <button
                onClick={() => handleTransactionTypeClick('expense')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-red-600/20">
                  <Minus className="text-red-400" size={18} />
                </div>
                <div>
                  <div className="text-white font-medium text-sm">New Expense</div>
                  <div className="text-slate-400 text-xs">Record money spent or outgoing payments</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
        {/* Gross Income */}
        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode
            ? 'bg-slate-800/30 border-slate-700/50'
            : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-400 text-sm font-medium">Gross Income</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(summary.totalIncome)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-900/30">
              <TrendingUp className="text-green-400" size={24} />
            </div>
          </div>
          <div className={`flex items-center gap-1 text-sm ${getChangeColor(summary.incomeChange)}`}>
            {getChangeIcon(summary.incomeChange)}
            <span>{formatPercentage(summary.incomeChange)} from previous {getPeriodLabel()}</span>
          </div>
        </div>

        {/* Current Account Balance */}
        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode
            ? 'bg-slate-800/30 border-slate-700/50'
            : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-400 text-sm font-medium">
                Account Balance
              </p>
              <p className={`text-2xl font-bold ${summary.currentBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
                {formatCurrency(summary.currentBalance)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-blue-900/30">
              <DollarSign className="text-blue-400" size={24} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span>Opening: {formatCurrency(summary.openingBalance)}</span>
            <span className="mx-1">•</span>
            <span>Period Net: {formatCurrency(summary.netIncomeAfterTax)}</span>
          </div>
        </div>

        {/* Total Expenses */}
        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode
            ? 'bg-slate-800/30 border-slate-700/50'
            : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-400 text-sm font-medium">Total Expenses</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(summary.totalExpenses)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-red-900/30">
              <TrendingDown className="text-red-400" size={24} />
            </div>
          </div>
          <div className={`flex items-center gap-1 text-sm ${getChangeColor(summary.expensesChange)}`}>
            {getChangeIcon(summary.expensesChange)}
            <span>{formatPercentage(summary.expensesChange)} from previous {getPeriodLabel()}</span>
          </div>
        </div>

        {/* Membership Income */}
        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode
            ? 'bg-slate-800/30 border-slate-700/50'
            : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-400 text-sm font-medium">Membership Income</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(summary.membershipIncome)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-cyan-900/30">
              <Users className="text-cyan-400" size={24} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-slate-400">
            {summary.pendingMembershipPayments > 0 ? (
              <>
                <span className="text-orange-400">{summary.pendingMembershipPayments} pending</span>
              </>
            ) : (
              <span>All payments current</span>
            )}
          </div>
        </div>

        {/* Pending Invoices */}
        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode
            ? 'bg-slate-800/30 border-slate-700/50'
            : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-400 text-sm font-medium">Pending Invoices</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(summary.pendingInvoicesAmount)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-yellow-900/30">
              <Receipt className="text-yellow-400" size={24} />
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-yellow-400">
            <Receipt size={14} />
            <span>Awaiting payment</span>
          </div>
        </div>
      </div>

      {/* Financial Chart */}
      <FinancialChart
        darkMode={darkMode}
        period={period}
        onPeriodChange={setPeriod}
        associationId={associationId}
        associationType={associationType}
      />

      {/* Recent Transactions */}
      <div className={`
        rounded-xl border backdrop-blur-sm p-6
        ${darkMode 
          ? 'bg-slate-800/30 border-slate-700/50' 
          : 'bg-white/10 border-slate-200/20'}
      `}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
          <button
            onClick={() => onTabChange('transactions')}
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            View all
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="text-center py-8">
            <DollarSign size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
            <p className="text-slate-400 mb-2">No recent transactions</p>
            <p className="text-slate-500 text-sm">Transactions will appear here once you add them</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className={`
                  flex items-center justify-between p-4 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700/30 border-slate-600/50' 
                    : 'bg-white/5 border-slate-200/10'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    p-2 rounded-lg
                    ${transaction.type === 'deposit' || transaction.type === 'income'
                      ? 'bg-green-900/30'
                      : 'bg-red-900/30'}
                  `}>
                    {transaction.type === 'deposit' || transaction.type === 'income' ? (
                      <ArrowUpRight className="text-green-400" size={16} />
                    ) : (
                      <ArrowDownRight className="text-red-400" size={16} />
                    )}
                  </div>
                  <div>
                    <p className="text-white font-medium">{transaction.description}</p>
                    <p className="text-slate-400 text-sm">
                      {new Date(transaction.date).toLocaleDateString('en-AU')}
                      {transaction.budget_categories && (
                        <> • {transaction.budget_categories.name}</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${
                    transaction.type === 'deposit' || transaction.type === 'income' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {transaction.type === 'deposit' || transaction.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
import { createPortal } from 'react-dom';
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
  payment_status?: string;
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
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHeaderSlot(document.getElementById('alfie-page-actions')); }, []);
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

  console.log('FinancesOverview render - loading:', loading, 'error:', error, 'summary:', summary);

  if (loading) {
    console.log('FinancesOverview: Showing loading spinner');
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#0A84FF]"></div>
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

  const isIncome = (t: any) => t.type === 'deposit' || t.type === 'income';
  const newTxButton = (
    <div className="relative inline-flex" ref={dropdownRef}>
      <button onClick={onNewTransaction} className="a-btn a-btn-p" style={{ height: 42, borderRadius: '13px 0 0 13px', paddingRight: 14 }}>
        <Plus size={16} />New transaction
      </button>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="a-btn a-btn-p"
        aria-label="More transaction types"
        aria-haspopup="menu"
        aria-expanded={showDropdown}
        style={{ height: 42, borderRadius: '0 13px 13px 0', padding: '0 10px', borderLeft: '1px solid rgba(255,255,255,0.25)' }}
      >
        <ChevronDown size={16} />
      </button>
      {showDropdown && (
        <div className="a-pop absolute right-0 top-full mt-2 w-72 z-50 p-1.5 flex flex-col gap-0.5" role="menu">
          {([
            ['invoice', <FileText size={16} />, 'New invoice', 'Create an invoice for services or products'],
            ['deposit', <Plus size={16} />, 'New deposit', 'Record incoming money or payments'],
            ['expense', <Minus size={16} />, 'New expense', 'Record money spent or outgoing payments'],
          ] as const).map(([k, icon, title, desc]) => (
            <button key={k} role="menuitem" onClick={() => handleTransactionTypeClick(k)} className="a-pop-item" style={{ alignItems: 'flex-start', padding: '10px' }}>
              <span className="a-tile a-tile-sm" style={{ width: 32, height: 32 }}>{icon}</span>
              <span className="flex-1 min-w-0"><span className="block a-ink font-semibold text-[13.5px]">{title}</span><span className="block a-dim text-xs mt-0.5">{desc}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const Stat = ({ label, icon, value, sub }: { label: string; icon: React.ReactNode; value: React.ReactNode; sub: React.ReactNode }) => (
    <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
      <div className="flex items-center justify-between"><p className="a-cap">{label}</p><span className="a-tile a-tile-sm">{icon}</span></div>
      <div><div className="a-big a-ink" style={{ fontSize: 30 }}>{value}</div><div className="a-mute mt-[7px] text-[12.5px]">{sub}</div></div>
    </div>
  );
  const changeLine = (n: number) => (
    <span>{formatPercentage(n)} vs previous {getPeriodLabel()}</span>
  );

  return (
    <div className="flex flex-col gap-[22px]">
      {headerSlot ? createPortal(newTxButton, headerSlot) : <div className="flex justify-end">{newTxButton}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr] xl:grid-rows-[auto_auto] gap-4">
        <div className="a-card a-hero a-hero-spec xl:row-span-2 flex flex-col justify-between gap-[18px] relative overflow-hidden" style={{ padding: 24 }}>
          <div className="flex items-center justify-between"><p className="a-cap">Account balance</p><span className="a-tile a-tile-sm"><DollarSign size={17} /></span></div>
          <div>
            <div className={`a-big ${summary.currentBalance < 0 ? 'a-txt-r' : 'a-ink'}`} style={{ fontSize: 52 }}>{formatCurrency(summary.currentBalance)}</div>
            <div className="flex gap-[22px] mt-4">
              <div><p className="a-cap" style={{ fontSize: 10 }}>Opening</p><div className="a-num a-ink text-[15px] font-semibold mt-1">{formatCurrency(summary.openingBalance)}</div></div>
              <div className="a-vrule" />
              <div><p className="a-cap" style={{ fontSize: 10 }}>Period net</p><div className="a-num a-ink text-[15px] font-semibold mt-1">{formatCurrency(clubTaxSettings.enabled ? summary.netIncomeAfterTax : summary.netIncome)}</div></div>
            </div>
          </div>
        </div>
        <Stat label={clubTaxSettings.enabled ? 'Gross income' : 'Total income'} icon={<TrendingUp size={17} />} value={formatCurrency(summary.totalIncome)} sub={changeLine(summary.incomeChange)} />
        <Stat label="Total expenses" icon={<TrendingDown size={17} />} value={formatCurrency(summary.totalExpenses)} sub={changeLine(summary.expensesChange)} />
        <Stat label="Membership income" icon={<Users size={17} />} value={formatCurrency(summary.membershipIncome)} sub={summary.pendingMembershipPayments > 0 ? <span className="a-txt-a">{summary.pendingMembershipPayments} pending</span> : 'All payments current'} />
        <Stat label="Pending invoices" icon={<Receipt size={17} />} value={formatCurrency(summary.pendingInvoicesAmount)} sub="Awaiting payment" />
      </div>

      <FinancialChart
        darkMode={darkMode}
        period={period}
        onPeriodChange={setPeriod}
        associationId={associationId}
        associationType={associationType}
      />

      <div className="a-card overflow-hidden">
        <div style={{ padding: '20px 22px 8px' }}>
          <div className="flex items-center gap-3">
            <span className="a-tile a-tile-sm"><Receipt size={17} /></span>
            <h2 className="a-display a-ink m-0 flex-1 text-lg font-semibold">Recent transactions</h2>
            <button onClick={() => onTabChange('transactions')} className="a-link text-[13px] font-medium">View all</button>
          </div>
        </div>
        {recentTransactions.length === 0 ? (
          <div className="a-empty py-10 px-6">
            <span className="a-tile" style={{ width: 56, height: 56 }}><DollarSign size={24} /></span>
            <div className="a-display a-ink text-lg font-semibold">No recent transactions</div>
            <p className="a-mute m-0 text-sm">Transactions will appear here once you add them.</p>
          </div>
        ) : (
          <div className="pb-2">
            {recentTransactions.map((t) => {
              const d = new Date(t.date);
              const inc = isIncome(t);
              return (
                <div key={t.id} className="a-tx" style={{ gridTemplateColumns: '44px 36px minmax(0,1fr) minmax(0,210px) 90px 120px' }}>
                  <div className="a-chip-d"><b>{d.getDate()}</b><i>{d.toLocaleDateString('en-AU', { weekday: 'short' })}</i></div>
                  <span className={`a-tile a-tile-sm ${inc ? 'a-txt-g' : 'a-txt-r'}`}>{inc ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</span>
                  <div className="a-ink min-w-0 text-[14.5px] font-medium truncate">{t.description}</div>
                  {t.budget_categories ? (
                    <span className="a-lb-fmt justify-self-start max-w-full"><span className="a-light" style={{ background: inc ? '#30D158' : '#FF6B6B', boxShadow: 'none' }} /><span className="truncate">{t.budget_categories.name}</span></span>
                  ) : <span />}
                  {t.payment_status
                    ? <span className={`a-st text-[12.5px]`}><span className={`a-light ${t.payment_status === 'paid' || t.payment_status === 'completed' ? 'a-light-g' : 'a-light-a'}`} />{t.payment_status.charAt(0).toUpperCase() + t.payment_status.slice(1)}</span>
                    : <span />}
                  <span className={`a-num text-right text-[15.5px] font-semibold ${inc ? 'a-txt-g' : 'a-txt-r'}`}>{inc ? '+' : '−'}{formatCurrency(Math.abs(t.amount))}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

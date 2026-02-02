import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Download, Filter, TrendingUp, TrendingDown, DollarSign, FileText, PieChart as PieChartIcon, BarChart3, LineChart as LineChartIcon, ArrowUpRight, ArrowDownRight, Sparkles, Target, Wallet, CreditCard, MousePointerClick } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import DetailedReportModal from './DetailedReportModal';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

interface FinancesReportsProps {
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
}

interface ReportData {
  thisPeriod: {
    income: number;
    expenses: number;
    taxCollected: number;
    taxPaid: number;
    netCash: number;
  };
  previousPeriod: {
    income: number;
    expenses: number;
    taxCollected: number;
    taxPaid: number;
    netCash: number;
  };
  yearToDate: {
    income: number;
    expenses: number;
    taxCollected: number;
    taxPaid: number;
    netCash: number;
  };
}

interface CategoryData {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  netCash: number;
}

export const FinancesReports: React.FC<FinancesReportsProps> = ({ darkMode, associationId, associationType }) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cash-flow' | 'shared'>('cash-flow');
  const [dateRange, setDateRange] = useState('this-year');
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2025-12-31');
  const [showFilters, setShowFilters] = useState(false);
  const [reportData, setReportData] = useState<ReportData>({
    thisPeriod: { income: 0, expenses: 0, taxCollected: 0, taxPaid: 0, netCash: 0 },
    previousPeriod: { income: 0, expenses: 0, taxCollected: 0, taxPaid: 0, netCash: 0 },
    yearToDate: { income: 0, expenses: 0, taxCollected: 0, taxPaid: 0, netCash: 0 }
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ income: CategoryData[]; expenses: CategoryData[] }>({
    income: [],
    expenses: []
  });
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<{
    type: 'income' | 'expenses' | 'cash-flow' | 'profit-margin' | 'burn-rate' | 'ytd';
    title: string;
  } | null>(null);

  useEffect(() => {
    // Set default date range based on selection
    const today = new Date();
    const currentYear = today.getFullYear();

    if (dateRange === 'this-year') {
      setStartDate(`${currentYear}-01-01`);
      setEndDate(`${currentYear}-12-31`);
    } else if (dateRange === 'last-year') {
      setStartDate(`${currentYear - 1}-01-01`);
      setEndDate(`${currentYear - 1}-12-31`);
    }
  }, [dateRange]);

  useEffect(() => {
    if (isAssociation || currentClub?.clubId) {
      fetchReportData();
    } else {
      setLoading(false);
    }
  }, [currentClub?.clubId, startDate, endDate, associationId, associationType]);

  const fetchReportData = async () => {
    if (!isAssociation && !currentClub?.clubId) return;

    try {
      setLoading(true);
      setError(null);

      // Calculate previous period dates (same length as current period)
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodLength = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - periodLength);
      const previousEnd = new Date(start);
      previousEnd.setDate(previousEnd.getDate() - 1);

      // Year to date calculation
      const yearStart = new Date(end.getFullYear(), 0, 1);
      const ytdStart = yearStart.toISOString().split('T')[0];
      const ytdEnd = new Date().toISOString().split('T')[0];

      // Fetch transactions with categories
      let transactions, invoices, categories;
      if (isAssociation) {
        const { data: txData, error: txError } = await supabase
          .from('association_transactions')
          .select(`
            *,
            category:category_id(id, name)
          `)
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .order('date', { ascending: false });

        if (txError) throw txError;
        transactions = txData;

        const { data: catData } = await supabase
          .from('association_budget_categories')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType);

        categories = catData;
        invoices = [];
      } else {
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .select(`
            *,
            category:category_id(id, name)
          `)
          .eq('club_id', currentClub.clubId)
          .order('date', { ascending: false });

        if (txError) throw txError;
        transactions = txData;

        const { data: invData, error: invError } = await supabase
          .from('invoices')
          .select('*')
          .eq('club_id', currentClub.clubId);

        if (invError) throw invError;
        invoices = invData;

        const { data: catData } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('club_id', currentClub.clubId);

        categories = catData;
      }

      // Helper function to calculate period totals
      const calculatePeriodTotals = (startDate: Date, endDate: Date) => {
        const periodTx = (transactions || []).filter(tx => {
          const txDate = new Date(tx.date);
          return txDate >= startDate && txDate <= endDate;
        });

        const income = periodTx
          .filter(tx => tx.type === 'deposit' || tx.type === 'income')
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

        const expenses = periodTx
          .filter(tx => tx.type === 'expense')
          .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

        let taxCollected = periodTx
          .filter(tx => tx.type === 'deposit' || tx.type === 'income')
          .reduce((sum, tx) => sum + Number(tx.tax_amount || 0), 0);

        let taxPaid = periodTx
          .filter(tx => tx.type === 'expense')
          .reduce((sum, tx) => sum + Number(tx.tax_amount || 0), 0);

        const periodInvoices = (invoices || []).filter(inv => {
          const invDate = new Date(inv.date);
          return invDate >= startDate && invDate <= endDate;
        });

        const invoiceTax = periodInvoices.reduce((sum, inv) => sum + Number(inv.tax_amount || 0), 0);
        taxCollected += invoiceTax;

        const netCash = income - expenses;

        return { income, expenses, taxCollected, taxPaid, netCash };
      };

      // Calculate monthly data for trend charts
      const monthlyDataArray: MonthlyData[] = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(start.getFullYear(), i, 1);
        const monthEnd = new Date(start.getFullYear(), i + 1, 0);

        if (monthEnd >= start && monthStart <= end) {
          const monthTotals = calculatePeriodTotals(monthStart, monthEnd);
          monthlyDataArray.push({
            month: months[i],
            income: monthTotals.income,
            expenses: monthTotals.expenses,
            netCash: monthTotals.netCash
          });
        }
      }

      // Calculate category breakdown
      const incomeTx = (transactions || []).filter(tx => {
        const txDate = new Date(tx.date);
        return (tx.type === 'deposit' || tx.type === 'income') && txDate >= start && txDate <= end;
      });

      const expenseTx = (transactions || []).filter(tx => {
        const txDate = new Date(tx.date);
        return tx.type === 'expense' && txDate >= start && txDate <= end;
      });

      const totalIncome = incomeTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const totalExpenses = expenseTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      // Group by category
      const incomeByCategory = new Map<string, number>();
      const expensesByCategory = new Map<string, number>();

      incomeTx.forEach(tx => {
        const cat = tx.category?.name || 'Uncategorized';
        incomeByCategory.set(cat, (incomeByCategory.get(cat) || 0) + Number(tx.amount || 0));
      });

      expenseTx.forEach(tx => {
        const cat = tx.category?.name || 'Uncategorized';
        expensesByCategory.set(cat, (expensesByCategory.get(cat) || 0) + Number(tx.amount || 0));
      });

      const colors = [
        '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
        '#3b82f6', '#f97316', '#14b8a6', '#a855f7', '#ef4444'
      ];

      const incomeCategories: CategoryData[] = Array.from(incomeByCategory.entries())
        .map(([name, amount], index) => ({
          name,
          amount,
          percentage: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
          color: colors[index % colors.length]
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const expenseCategories: CategoryData[] = Array.from(expensesByCategory.entries())
        .map(([name, amount], index) => ({
          name,
          amount,
          percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
          color: colors[index % colors.length]
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      setReportData({
        thisPeriod: calculatePeriodTotals(start, end),
        previousPeriod: calculatePeriodTotals(previousStart, previousEnd),
        yearToDate: calculatePeriodTotals(new Date(ytdStart), new Date(ytdEnd))
      });
      setMonthlyData(monthlyDataArray);
      setCategoryBreakdown({ income: incomeCategories, expenses: expenseCategories });
      setAllTransactions(transactions || []);
    } catch (err) {
      console.error('Error fetching financial reports:', err);
      setError('Failed to load financial reports');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    return `${startDate.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })} – ${endDate.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })}`;
  };

  const calculateChange = (current: number, previous: number): { percent: number; isPositive: boolean } => {
    if (previous === 0) return { percent: current > 0 ? 100 : 0, isPositive: current > 0 };
    const percent = ((current - previous) / Math.abs(previous)) * 100;
    return { percent: Math.abs(percent), isPositive: percent >= 0 };
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Financial Reports', 14, 22);

    doc.setFontSize(10);
    doc.text(`Period: ${formatDateRange(startDate, endDate)}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-AU')}`, 14, 35);

    (doc as any).autoTable({
      startY: 45,
      head: [['Metric', 'This Period', 'Previous Period', 'Year To Date']],
      body: [
        ['Income', formatCurrency(reportData.thisPeriod.income), formatCurrency(reportData.previousPeriod.income), formatCurrency(reportData.yearToDate.income)],
        ['Expenses', formatCurrency(reportData.thisPeriod.expenses), formatCurrency(reportData.previousPeriod.expenses), formatCurrency(reportData.yearToDate.expenses)],
        ['Net Cash', formatCurrency(reportData.thisPeriod.netCash), formatCurrency(reportData.previousPeriod.netCash), formatCurrency(reportData.yearToDate.netCash)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] }
    });

    doc.save(`financial-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/10 border border-red-900/20 rounded-lg p-6 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Error</h2>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  const profitMargin = reportData.thisPeriod.income > 0
    ? ((reportData.thisPeriod.netCash / reportData.thisPeriod.income) * 100)
    : 0;

  const burnRate = monthlyData.length > 0
    ? monthlyData.reduce((sum, m) => sum + m.expenses, 0) / monthlyData.filter(m => m.expenses > 0).length
    : 0;

  // Chart configurations
  const trendChartData = {
    labels: monthlyData.map(m => m.month),
    datasets: [
      {
        label: 'Income',
        data: monthlyData.map(m => m.income),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Expenses',
        data: monthlyData.map(m => m.expenses),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const netCashChartData = {
    labels: monthlyData.map(m => m.month),
    datasets: [
      {
        label: 'Net Cash Flow',
        data: monthlyData.map(m => m.netCash),
        backgroundColor: monthlyData.map(m => m.netCash >= 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
        borderColor: monthlyData.map(m => m.netCash >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'),
        borderWidth: 1
      }
    ]
  };

  const incomePieData = {
    labels: categoryBreakdown.income.map(c => c.name),
    datasets: [{
      data: categoryBreakdown.income.map(c => c.amount),
      backgroundColor: categoryBreakdown.income.map(c => c.color),
      borderColor: 'rgb(15, 23, 42)',
      borderWidth: 2
    }]
  };

  const expensesPieData = {
    labels: categoryBreakdown.expenses.map(c => c.name),
    datasets: [{
      data: categoryBreakdown.expenses.map(c => c.amount),
      backgroundColor: categoryBreakdown.expenses.map(c => c.color),
      borderColor: 'rgb(15, 23, 42)',
      borderWidth: 2
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: 'rgb(203, 213, 225)',
          padding: 15,
          font: { size: 12 }
        }
      },
      tooltip: {
        backgroundColor: 'rgb(30, 41, 59)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgb(51, 65, 85)',
        borderWidth: 1,
        padding: 12,
        displayColors: true
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(71, 85, 105, 0.3)' },
        ticks: { color: 'rgb(148, 163, 184)' }
      },
      y: {
        grid: { color: 'rgba(71, 85, 105, 0.3)' },
        ticks: { color: 'rgb(148, 163, 184)' }
      }
    }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        labels: {
          color: 'rgb(203, 213, 225)',
          padding: 10,
          font: { size: 11 }
        }
      },
      tooltip: {
        backgroundColor: 'rgb(30, 41, 59)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgb(51, 65, 85)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: function(context: any) {
            const value = formatCurrency(context.parsed);
            const percentage = ((context.parsed / context.dataset.data.reduce((a: number, b: number) => a + b, 0)) * 100).toFixed(1);
            return `${context.label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  const openDetailedReport = (
    type: 'income' | 'expenses' | 'cash-flow' | 'profit-margin' | 'burn-rate' | 'ytd',
    title: string
  ) => {
    setSelectedReport({ type, title });
  };

  const getReportData = () => {
    if (!selectedReport) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodLength = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - periodLength);
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const yearStart = new Date(end.getFullYear(), 0, 1);

    let filteredTransactions = allTransactions;
    let summary: any = {
      total: 0,
      previousPeriod: 0,
      yearToDate: 0,
      breakdown: [],
      monthlyData: []
    };

    if (selectedReport.type === 'income') {
      filteredTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return (tx.type === 'deposit' || tx.type === 'income') && txDate >= start && txDate <= end;
      });

      const categoryMap = new Map<string, { amount: number; count: number }>();
      filteredTransactions.forEach(tx => {
        const cat = tx.category?.name || 'Uncategorized';
        const existing = categoryMap.get(cat) || { amount: 0, count: 0 };
        categoryMap.set(cat, {
          amount: existing.amount + Number(tx.amount || 0),
          count: existing.count + 1
        });
      });

      summary = {
        total: reportData.thisPeriod.income,
        previousPeriod: reportData.previousPeriod.income,
        yearToDate: reportData.yearToDate.income,
        breakdown: Array.from(categoryMap.entries()).map(([category, data]) => ({
          category,
          amount: data.amount,
          count: data.count
        })),
        monthlyData: monthlyData.map(m => ({ month: m.month, amount: m.income }))
      };
    } else if (selectedReport.type === 'expenses') {
      filteredTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return tx.type === 'expense' && txDate >= start && txDate <= end;
      });

      const categoryMap = new Map<string, { amount: number; count: number }>();
      filteredTransactions.forEach(tx => {
        const cat = tx.category?.name || 'Uncategorized';
        const existing = categoryMap.get(cat) || { amount: 0, count: 0 };
        categoryMap.set(cat, {
          amount: existing.amount + Number(tx.amount || 0),
          count: existing.count + 1
        });
      });

      summary = {
        total: reportData.thisPeriod.expenses,
        previousPeriod: reportData.previousPeriod.expenses,
        yearToDate: reportData.yearToDate.expenses,
        breakdown: Array.from(categoryMap.entries()).map(([category, data]) => ({
          category,
          amount: data.amount,
          count: data.count
        })),
        monthlyData: monthlyData.map(m => ({ month: m.month, amount: m.expenses }))
      };
    } else if (selectedReport.type === 'cash-flow') {
      filteredTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= start && txDate <= end;
      });

      summary = {
        total: reportData.thisPeriod.netCash,
        previousPeriod: reportData.previousPeriod.netCash,
        yearToDate: reportData.yearToDate.netCash,
        breakdown: [
          { category: 'Income', amount: reportData.thisPeriod.income, count: allTransactions.filter(tx => {
            const txDate = new Date(tx.date);
            return (tx.type === 'deposit' || tx.type === 'income') && txDate >= start && txDate <= end;
          }).length },
          { category: 'Expenses', amount: reportData.thisPeriod.expenses, count: allTransactions.filter(tx => {
            const txDate = new Date(tx.date);
            return tx.type === 'expense' && txDate >= start && txDate <= end;
          }).length }
        ],
        monthlyData: monthlyData.map(m => ({ month: m.month, amount: m.netCash }))
      };
    } else if (selectedReport.type === 'ytd') {
      filteredTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= yearStart && txDate <= new Date();
      });

      const categoryMap = new Map<string, { amount: number; count: number }>();
      filteredTransactions.forEach(tx => {
        const cat = tx.category?.name || 'Uncategorized';
        const existing = categoryMap.get(cat) || { amount: 0, count: 0 };
        const amount = tx.type === 'expense' ? -Number(tx.amount || 0) : Number(tx.amount || 0);
        categoryMap.set(cat, {
          amount: existing.amount + amount,
          count: existing.count + 1
        });
      });

      summary = {
        total: reportData.yearToDate.netCash,
        previousPeriod: 0,
        yearToDate: reportData.yearToDate.netCash,
        breakdown: Array.from(categoryMap.entries()).map(([category, data]) => ({
          category,
          amount: Math.abs(data.amount),
          count: data.count
        })),
        monthlyData: monthlyData.map(m => ({ month: m.month, amount: m.income - m.expenses }))
      };
    }

    return {
      transactions: filteredTransactions,
      summary,
      dateRange: { start: startDate, end: endDate }
    };
  };

  return (
    <div className="space-y-6">
      {/* Header with Tabs and Actions */}
      <div className="flex items-center justify-between">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('cash-flow')}
            className={`
              px-4 py-3 text-sm font-medium transition-colors border-b-2
              ${activeTab === 'cash-flow'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'}
            `}
          >
            Financial Analytics
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`
              px-4 py-3 text-sm font-medium transition-colors border-b-2
              ${activeTab === 'shared'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'}
            `}
          >
            Shared (0)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-slate-300"
            title="Filter"
          >
            <Filter size={18} />
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white transition-all shadow-lg shadow-cyan-500/20"
            title="Export PDF"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-300 mb-2">Period</label>
              <div className="relative">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/70 text-slate-200 rounded-lg border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                >
                  <option value="this-year">This Financial Year</option>
                  <option value="last-year">Last Financial Year</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-300 mb-2">Start Date</label>
              <div className="relative">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDateRange('custom');
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/70 text-slate-200 rounded-lg border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-300 mb-2">End Date</label>
              <div className="relative">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDateRange('custom');
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/70 text-slate-200 rounded-lg border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Income Card */}
        <button
          onClick={() => openDetailedReport('income', 'Income Report')}
          className="group relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-emerald-500/20 p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10 cursor-pointer text-left w-full hover:scale-105"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <MousePointerClick size={20} className="text-emerald-400" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/10 rounded-xl">
                <TrendingUp className="text-emerald-400" size={24} />
              </div>
              {(() => {
                const change = calculateChange(reportData.thisPeriod.income, reportData.previousPeriod.income);
                return (
                  <div className={`flex items-center gap-1 text-sm font-medium ${change.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change.isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    {change.percent.toFixed(1)}%
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-400 font-medium">Total Income</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(reportData.thisPeriod.income)}</p>
              <p className="text-xs text-slate-500">vs {formatCurrency(reportData.previousPeriod.income)} last period</p>
              <p className="text-xs text-emerald-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click for detailed report →</p>
            </div>
          </div>
        </button>

        {/* Total Expenses Card */}
        <button
          onClick={() => openDetailedReport('expenses', 'Expenses Report')}
          className="group relative overflow-hidden bg-gradient-to-br from-red-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-red-500/20 p-6 hover:border-red-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-red-500/10 cursor-pointer text-left w-full hover:scale-105"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <MousePointerClick size={20} className="text-red-400" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-500/10 rounded-xl">
                <TrendingDown className="text-red-400" size={24} />
              </div>
              {(() => {
                const change = calculateChange(reportData.thisPeriod.expenses, reportData.previousPeriod.expenses);
                return (
                  <div className={`flex items-center gap-1 text-sm font-medium ${!change.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change.isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    {change.percent.toFixed(1)}%
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-400 font-medium">Total Expenses</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(reportData.thisPeriod.expenses)}</p>
              <p className="text-xs text-slate-500">vs {formatCurrency(reportData.previousPeriod.expenses)} last period</p>
              <p className="text-xs text-red-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click for detailed report →</p>
            </div>
          </div>
        </button>

        {/* Net Cash Flow Card */}
        <button
          onClick={() => openDetailedReport('cash-flow', 'Cash Flow Report')}
          className="group relative overflow-hidden bg-gradient-to-br from-cyan-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-cyan-500/20 p-6 hover:border-cyan-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/10 cursor-pointer text-left w-full hover:scale-105"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <MousePointerClick size={20} className="text-cyan-400" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-cyan-500/10 rounded-xl">
                <Wallet className="text-cyan-400" size={24} />
              </div>
              {(() => {
                const change = calculateChange(reportData.thisPeriod.netCash, reportData.previousPeriod.netCash);
                return (
                  <div className={`flex items-center gap-1 text-sm font-medium ${change.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change.isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    {change.percent.toFixed(1)}%
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-400 font-medium">Net Cash Flow</p>
              <p className={`text-3xl font-bold ${reportData.thisPeriod.netCash >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(reportData.thisPeriod.netCash)}
              </p>
              <p className="text-xs text-slate-500">vs {formatCurrency(reportData.previousPeriod.netCash)} last period</p>
              <p className="text-xs text-cyan-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click for detailed report →</p>
            </div>
          </div>
        </button>

        {/* YTD Summary Card */}
        <button
          onClick={() => openDetailedReport('ytd', 'Year to Date Report')}
          className="group relative overflow-hidden bg-gradient-to-br from-violet-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-violet-500/20 p-6 hover:border-violet-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/10 cursor-pointer text-left w-full hover:scale-105"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <MousePointerClick size={20} className="text-violet-400" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-violet-500/10 rounded-xl">
                <Target className="text-violet-400" size={24} />
              </div>
              <div className="flex items-center gap-1 text-sm font-medium text-violet-400">
                <Sparkles size={16} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-400 font-medium">Profit Margin</p>
              <p className={`text-3xl font-bold ${profitMargin >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                {profitMargin.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-500">of total income</p>
              <p className="text-xs text-violet-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click for detailed report →</p>
            </div>
          </div>
        </button>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expenses Trend */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <LineChartIcon size={20} className="text-cyan-400" />
                Income vs Expenses Trend
              </h3>
              <p className="text-sm text-slate-400 mt-1">Monthly comparison</p>
            </div>
          </div>
          <div className="h-[300px]">
            <Line data={trendChartData} options={chartOptions} />
          </div>
        </div>

        {/* Net Cash Flow Chart */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <BarChart3 size={20} className="text-cyan-400" />
                Net Cash Flow
              </h3>
              <p className="text-sm text-slate-400 mt-1">Monthly net position</p>
            </div>
          </div>
          <div className="h-[300px]">
            <Bar data={netCashChartData} options={chartOptions} />
          </div>
        </div>

        {/* Income Breakdown */}
        {categoryBreakdown.income.length > 0 && (
          <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <PieChartIcon size={20} className="text-emerald-400" />
                  Income by Category
                </h3>
                <p className="text-sm text-slate-400 mt-1">Top 5 sources</p>
              </div>
            </div>
            <div className="h-[300px]">
              <Doughnut data={incomePieData} options={pieOptions} />
            </div>
          </div>
        )}

        {/* Expenses Breakdown */}
        {categoryBreakdown.expenses.length > 0 && (
          <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <PieChartIcon size={20} className="text-red-400" />
                  Expenses by Category
                </h3>
                <p className="text-sm text-slate-400 mt-1">Top 5 categories</p>
              </div>
            </div>
            <div className="h-[300px]">
              <Doughnut data={expensesPieData} options={pieOptions} />
            </div>
          </div>
        )}
      </div>

      {/* Financial Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cash Runway */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <DollarSign className="text-amber-400" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Average Monthly Burn</h3>
              <p className="text-sm text-slate-400">Based on current period</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-amber-400">{formatCurrency(burnRate)}</p>
            <p className="text-sm text-slate-500 mt-2">Average monthly expenses</p>
          </div>
        </div>

        {/* Year to Date Summary */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <CreditCard className="text-blue-400" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Year to Date Summary</h3>
              <p className="text-sm text-slate-400">{new Date().getFullYear()}</p>
            </div>
          </div>
          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Income</span>
              <span className="font-semibold text-emerald-400">{formatCurrency(reportData.yearToDate.income)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Expenses</span>
              <span className="font-semibold text-red-400">{formatCurrency(reportData.yearToDate.expenses)}</span>
            </div>
            <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between">
              <span className="text-white font-medium">Net Position</span>
              <span className={`font-bold text-lg ${reportData.yearToDate.netCash >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                {formatCurrency(reportData.yearToDate.netCash)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Report Modal */}
      {selectedReport && getReportData() && (
        <DetailedReportModal
          isOpen={true}
          onClose={() => setSelectedReport(null)}
          reportType={selectedReport.type}
          title={selectedReport.title}
          data={getReportData()!}
        />
      )}
    </div>
  );
};

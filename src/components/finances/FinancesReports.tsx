import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Download, TrendingUp, TrendingDown, DollarSign, ChartPie as PieChartIcon, ChartBar as BarChart3, ChartLine as LineChartIcon, ArrowUpRight, ArrowDownRight, Wallet, CreditCard, Landmark, Share2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
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
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cash-flow' | 'shared'>('cash-flow');
  const [dateRange, setDateRange] = useState('this-year');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const fyStartYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
    return `${fyStartYear}-07-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const fyEndYear = today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear();
    return `${fyEndYear}-06-30`;
  });
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
  const [bankPosition, setBankPosition] = useState({ openingBalance: 0, currentBalance: 0 });
  const [selectedReport, setSelectedReport] = useState<{
    type: 'income' | 'expenses' | 'cash-flow' | 'profit-margin' | 'burn-rate' | 'ytd';
    title: string;
  } | null>(null);

  useEffect(() => {
    const today = new Date();
    const currentMonth = today.getMonth();

    if (dateRange === 'this-year') {
      const fyStartYear = currentMonth >= 6 ? today.getFullYear() : today.getFullYear() - 1;
      const fyEndYear = fyStartYear + 1;
      setStartDate(`${fyStartYear}-07-01`);
      setEndDate(`${fyEndYear}-06-30`);
    } else if (dateRange === 'last-year') {
      const fyStartYear = currentMonth >= 6 ? today.getFullYear() - 1 : today.getFullYear() - 2;
      const fyEndYear = fyStartYear + 1;
      setStartDate(`${fyStartYear}-07-01`);
      setEndDate(`${fyEndYear}-06-30`);
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

      const today = new Date();
      const fyStartYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
      const yearStart = new Date(fyStartYear, 6, 1);
      const ytdStart = yearStart.toISOString().split('T')[0];
      const ytdEnd = today.toISOString().split('T')[0];

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

      const monthlyDataArray: MonthlyData[] = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fyMonthOrder = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];

      for (const monthIdx of fyMonthOrder) {
        const year = monthIdx >= 6 ? start.getFullYear() : start.getFullYear() + 1;
        const monthStart = new Date(year, monthIdx, 1);
        const monthEnd = new Date(year, monthIdx + 1, 0);

        if (monthEnd >= start && monthStart <= end) {
          const monthTotals = calculatePeriodTotals(monthStart, monthEnd);
          monthlyDataArray.push({
            month: months[monthIdx],
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

      let openingBalance = 0;
      if (isAssociation) {
        const { data: assocSettings } = await supabase
          .from('association_finance_settings')
          .select('opening_balance')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .maybeSingle();
        openingBalance = Number(assocSettings?.opening_balance || 0);
      } else {
        const { data: clubSettings } = await supabase
          .from('club_finance_settings')
          .select('opening_balance')
          .eq('club_id', currentClub!.clubId)
          .maybeSingle();
        openingBalance = Number(clubSettings?.opening_balance || 0);
      }

      const allTimeIncome = (transactions || [])
        .filter(tx => tx.type === 'income' || tx.type === 'deposit')
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const allTimeExpenses = (transactions || [])
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      setBankPosition({
        openingBalance,
        currentBalance: openingBalance + allTimeIncome - allTimeExpenses,
      });

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
      setInitialLoad(false);
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

  if (loading && initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/10 border border-red-900/20 rounded-lg p-6 text-center">
        <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'} mb-2`}>Error</h2>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  const profitMargin = reportData.thisPeriod.income > 0
    ? ((reportData.thisPeriod.netCash / reportData.thisPeriod.income) * 100)
    : 0;

  const monthsWithExpenses = monthlyData.filter(m => m.expenses > 0).length;
  const burnRate = monthsWithExpenses > 0
    ? monthlyData.reduce((sum, m) => sum + m.expenses, 0) / monthsWithExpenses
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
      backgroundColor: categoryBreakdown.income.map(c => c.color + 'aa'),
      borderColor: darkMode ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)',
      borderWidth: 2
    }]
  };

  const expensesPieData = {
    labels: categoryBreakdown.expenses.map(c => c.name),
    datasets: [{
      data: categoryBreakdown.expenses.map(c => c.amount),
      backgroundColor: categoryBreakdown.expenses.map(c => c.color + 'aa'),
      borderColor: darkMode ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)',
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
          color: darkMode ? 'rgb(203, 213, 225)' : 'rgb(71, 85, 105)',
          padding: 15,
          font: { size: 12 }
        }
      },
      tooltip: {
        backgroundColor: darkMode ? 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)',
        titleColor: darkMode ? 'rgb(226, 232, 240)' : 'rgb(15, 23, 42)',
        bodyColor: darkMode ? 'rgb(203, 213, 225)' : 'rgb(71, 85, 105)',
        borderColor: darkMode ? 'rgb(51, 65, 85)' : 'rgb(226, 232, 240)',
        borderWidth: 1,
        padding: 12,
        displayColors: true
      }
    },
    scales: {
      x: {
        grid: { color: darkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)' },
        ticks: { color: darkMode ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)' }
      },
      y: {
        grid: { color: darkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)' },
        ticks: { color: darkMode ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)' }
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
          color: darkMode ? 'rgb(203, 213, 225)' : 'rgb(71, 85, 105)',
          padding: 10,
          font: { size: 11 }
        }
      },
      tooltip: {
        backgroundColor: darkMode ? 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)',
        titleColor: darkMode ? 'rgb(226, 232, 240)' : 'rgb(15, 23, 42)',
        bodyColor: darkMode ? 'rgb(203, 213, 225)' : 'rgb(71, 85, 105)',
        borderColor: darkMode ? 'rgb(51, 65, 85)' : 'rgb(226, 232, 240)',
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
    const nowForYtd = new Date();
    const fyYtdStartYear = nowForYtd.getMonth() >= 6 ? nowForYtd.getFullYear() : nowForYtd.getFullYear() - 1;
    const yearStart = new Date(fyYtdStartYear, 6, 1);

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

  const RING = ['#40C8C0', '#8A4DFF', '#FF3E9A', '#FFB340', '#0A84FF'];
  const ring = (rows: CategoryData[]) => {
    const total = rows.reduce((s, r) => s + r.amount, 0) || 1;
    let acc = 0;
    return rows.map((r, i) => {
      const from = (acc / total) * 360; acc += r.amount; const to = (acc / total) * 360;
      return `${RING[i % RING.length]} ${from}deg ${to}deg`;
    }).join(', ');
  };
  const Delta = ({ now, prev, goodWhenUp = true }: { now: number; prev: number; goodWhenUp?: boolean }) => {
    const c = calculateChange(now, prev);
    const good = goodWhenUp ? c.isPositive : !c.isPositive;
    return (
      <span className={`a-delta ${good ? 'a-delta-g' : 'a-delta-r'}`}>
        {c.isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{c.percent.toFixed(1)}%
      </span>
    );
  };
  const Kpi = ({ icon, label, value, sub, delta, tone = 'a-ink', onClick }: { icon: React.ReactNode; label: string; value: string; sub: string; delta?: React.ReactNode; tone?: string; onClick?: () => void }) => {
    const body = (
      <>
        <div className="flex items-center justify-between w-full"><span className="a-tile">{icon}</span>{delta}</div>
        <div>
          <p className="a-cap">{label}</p>
          <div className={`a-big mt-2 ${tone}`} style={{ fontSize: 32 }}>{value}</div>
          <div className="a-dim text-[12.5px] mt-[7px]">{sub}</div>
        </div>
      </>
    );
    return onClick
      ? <button onClick={onClick} className="a-card a-hov flex flex-col gap-3.5 text-left w-full cursor-pointer" style={{ padding: 20 }} title="Open detailed report">{body}</button>
      : <div className="a-card flex flex-col gap-3.5" style={{ padding: 20 }}>{body}</div>;
  };
  const Breakdown = ({ title, sub, rows, empty, label }: { title: string; sub: string; rows: CategoryData[]; empty: string; label: string }) => {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return (
      <div className="a-card flex flex-col gap-4" style={{ padding: 22 }}>
        <div className="flex items-center gap-3">
          <span className="a-tile a-tile-sm"><PieChartIcon size={17} /></span>
          <div className="flex-1 min-w-0"><h2 className="a-display a-ink m-0 text-lg font-semibold">{title}</h2><p className="a-dim mt-0.5 mb-0 text-[12.5px]">{sub}</p></div>
        </div>
        {rows.length === 0 ? (
          <div className="a-mute text-sm py-12 text-center">{empty}</div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-7">
            <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
              <div className="a-ring a-ring-lg" style={{ background: `conic-gradient(${ring(rows)})` }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="a-big a-ink" style={{ fontSize: 22 }}>{formatCurrency(total).replace(/\.00$/, '')}</span>
                <span className="a-dim text-[11.5px] mt-[3px]">{label}</span>
              </div>
            </div>
            <div className="flex-1 w-full a-divide">
              {rows.map((r, i) => (
                <div key={r.name} className="flex items-center gap-2.5 py-2.5">
                  <span className="a-light" style={{ background: RING[i % RING.length], boxShadow: 'none' }} />
                  <span className="flex-1 a-ink text-[13.5px] truncate">{r.name}</span>
                  <span className="a-num a-ink text-sm font-semibold">{formatCurrency(r.amount)}</span>
                  <span className="a-dim a-num text-right text-[12.5px]" style={{ width: 44 }}>{Math.round(r.percentage)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="a-seg" role="tablist" aria-label="Reports">
          <button role="tab" aria-selected={activeTab === 'cash-flow'} onClick={() => setActiveTab('cash-flow')} className={`a-seg-i ${activeTab === 'cash-flow' ? 'a-seg-on' : ''}`}><BarChart3 size={16} />Financial analytics</button>
          <button role="tab" aria-selected={activeTab === 'shared'} onClick={() => setActiveTab('shared')} className={`a-seg-i ${activeTab === 'shared' ? 'a-seg-on' : ''}`}><Share2 size={16} />Shared<span className="a-cnt">0</span></button>
        </div>
        <div className="flex-1" />
        <label className="relative inline-flex">
          <span className="sr-only">Period</span>
          <Calendar size={16} className="a-mute absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="a-pick" style={{ paddingLeft: 36 }}>
            <option value="this-year">This financial year (Jul–Jun)</option>
            <option value="last-year">Last financial year (Jul–Jun)</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {dateRange === 'custom' && (
          <>
            <label><span className="sr-only">Start date</span><input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setDateRange('custom'); }} className="a-inp a-inp-date" style={{ height: 42, width: 160 }} /></label>
            <label><span className="sr-only">End date</span><input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setDateRange('custom'); }} className="a-inp a-inp-date" style={{ height: 42, width: 160 }} /></label>
          </>
        )}
        <button onClick={exportToPDF} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}><Download size={16} />Export PDF</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={<TrendingUp size={19} />} label="Total income" value={formatCurrency(reportData.thisPeriod.income)} sub={`vs ${formatCurrency(reportData.previousPeriod.income)} last period`} delta={<Delta now={reportData.thisPeriod.income} prev={reportData.previousPeriod.income} />} onClick={() => openDetailedReport('income', 'Income Report')} />
        <Kpi icon={<TrendingDown size={19} />} label="Total expenses" value={formatCurrency(reportData.thisPeriod.expenses)} sub={`vs ${formatCurrency(reportData.previousPeriod.expenses)} last period`} delta={<Delta now={reportData.thisPeriod.expenses} prev={reportData.previousPeriod.expenses} goodWhenUp={false} />} onClick={() => openDetailedReport('expenses', 'Expenses Report')} />
        <Kpi icon={<Wallet size={19} />} label="Net cash flow" value={formatCurrency(reportData.thisPeriod.netCash)} tone={reportData.thisPeriod.netCash >= 0 ? 'a-txt-g' : 'a-txt-r'} sub={`vs ${formatCurrency(reportData.previousPeriod.netCash)} last period`} delta={<Delta now={reportData.thisPeriod.netCash} prev={reportData.previousPeriod.netCash} />} onClick={() => openDetailedReport('cash-flow', 'Cash Flow Report')} />
        <Kpi icon={<Landmark size={19} />} label="Bank position" value={formatCurrency(bankPosition.currentBalance)} tone={bankPosition.currentBalance >= 0 ? 'a-ink' : 'a-txt-r'} sub={bankPosition.openingBalance > 0 ? `Opening balance ${formatCurrency(bankPosition.openingBalance)}` : 'No opening balance set'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="a-card flex flex-col gap-3" style={{ padding: 22 }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="a-tile a-tile-sm"><LineChartIcon size={17} /></span>
            <div className="flex-1 min-w-0"><h2 className="a-display a-ink m-0 text-lg font-semibold">Income vs expenses</h2><p className="a-dim mt-0.5 mb-0 text-[12.5px]">Monthly · {dateRange === 'last-year' ? 'last financial year' : dateRange === 'custom' ? 'custom range' : 'this financial year'}</p></div>
            <span className="a-st text-[12.5px]"><span className="a-light" style={{ background: '#30D158', boxShadow: 'none' }} />Income</span>
            <span className="a-st text-[12.5px] ml-3"><span className="a-light" style={{ background: '#FF6B6B', boxShadow: 'none' }} />Expenses</span>
          </div>
          <div className="h-[280px]"><Line data={trendChartData} options={chartOptions} /></div>
        </div>
        <div className="a-card flex flex-col gap-3" style={{ padding: 22 }}>
          <div className="flex items-center gap-3">
            <span className="a-tile a-tile-sm"><BarChart3 size={17} /></span>
            <div className="flex-1 min-w-0"><h2 className="a-display a-ink m-0 text-lg font-semibold">Net cash flow</h2><p className="a-dim mt-0.5 mb-0 text-[12.5px]">Monthly net position</p></div>
          </div>
          <div className="h-[280px]"><Bar data={netCashChartData} options={chartOptions} /></div>
        </div>
        <Breakdown title="Income by category" sub="Top 5 sources" rows={categoryBreakdown.income} empty="No income data for this period" label="income" />
        <Breakdown title="Expenses by category" sub="Top 5 categories" rows={categoryBreakdown.expenses} empty="No expense data for this period" label="expenses" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="a-card flex items-center gap-3.5" style={{ padding: '18px 20px' }}>
          <span className="a-tile"><DollarSign size={19} /></span>
          <div className="flex-1 min-w-0"><p className="a-cap">Average monthly burn</p><div className="a-dim text-[12.5px] mt-1">Average monthly expenses this period</div></div>
          <div className="a-big a-txt-a" style={{ fontSize: 26 }}>{formatCurrency(burnRate)}</div>
        </div>
        <div className="a-card flex flex-col gap-2" style={{ padding: '18px 20px' }}>
          <div className="flex items-center gap-3.5">
            <span className="a-tile"><CreditCard size={19} /></span>
            <div className="flex-1 min-w-0"><p className="a-cap">Year to date</p><div className="a-dim text-[12.5px] mt-1">FY {(() => { const t = new Date(); const s = t.getMonth() >= 6 ? t.getFullYear() : t.getFullYear() - 1; return `${s}/${s + 1}`; })()}</div></div>
            <div className={`a-big ${reportData.yearToDate.netCash >= 0 ? 'a-txt-g' : 'a-txt-r'}`} style={{ fontSize: 26 }}>{formatCurrency(reportData.yearToDate.netCash)}</div>
          </div>
          <div className="a-dim text-xs text-right">{formatCurrency(reportData.yearToDate.income)} income − {formatCurrency(reportData.yearToDate.expenses)} expenses</div>
        </div>
      </div>

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

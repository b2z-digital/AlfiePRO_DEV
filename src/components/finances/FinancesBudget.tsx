import React, { useState, useEffect, useMemo } from 'react';
import { Save, X, DollarSign, Calendar, TrendingUp, TrendingDown, BarChart3, PieChart as PieChartIcon, Target, Wallet, ChevronDown, ChevronRight, Edit3 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

interface BudgetCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  description?: string;
  is_active: boolean;
}

interface BudgetEntry {
  id: string;
  category_id: string;
  year: number;
  month: number;
  budgeted_amount: number;
  actual_amount?: number;
}

interface FinancesBudgetProps {
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const FinancesBudget: React.FC<FinancesBudgetProps> = ({ darkMode, associationId, associationType }) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<{ categoryId: string; month: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [incomeExpanded, setIncomeExpanded] = useState(true);
  const [expenseExpanded, setExpenseExpanded] = useState(true);

  useEffect(() => {
    if (isAssociation || currentClub?.clubId) {
      loadBudgetData();
    } else {
      setLoading(false);
    }
  }, [currentClub, selectedYear, associationId, associationType]);

  const loadBudgetData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isAssociation) {
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('association_budget_categories')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('type', { ascending: false })
          .order('name');

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);

        const { data: entriesData, error: entriesError } = await supabase
          .from('association_budget_entries')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('year', selectedYear);

        if (entriesError) throw entriesError;
        setBudgetEntries(entriesData || []);
      } else {
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('club_id', currentClub?.clubId)
          .eq('is_active', true)
          .order('type', { ascending: false })
          .order('name');

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);

        const { data: entriesData, error: entriesError } = await supabase
          .from('budget_entries')
          .select('*')
          .eq('club_id', currentClub?.clubId)
          .eq('year', selectedYear);

        if (entriesError) throw entriesError;
        setBudgetEntries(entriesData || []);
      }
    } catch (err) {
      console.error('Error loading budget data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load budget data');
    } finally {
      setLoading(false);
    }
  };

  const getBudgetEntry = (categoryId: string, month: number): BudgetEntry | undefined => {
    return budgetEntries.find(entry => entry.category_id === categoryId && entry.month === month);
  };

  const handleCellEdit = (categoryId: string, month: number) => {
    const entry = getBudgetEntry(categoryId, month);
    setEditingCell({ categoryId, month });
    setEditValue(entry?.budgeted_amount?.toString() || '0');
  };

  const handleCellSave = async () => {
    if (!editingCell) return;

    try {
      const amount = parseFloat(editValue) || 0;
      const existingEntry = getBudgetEntry(editingCell.categoryId, editingCell.month);
      const tableName = isAssociation ? 'association_budget_entries' : 'budget_entries';

      if (existingEntry) {
        const { error } = await supabase
          .from(tableName)
          .update({ budgeted_amount: amount })
          .eq('id', existingEntry.id);

        if (error) throw error;

        setBudgetEntries(entries =>
          entries.map(entry =>
            entry.id === existingEntry.id ? { ...entry, budgeted_amount: amount } : entry
          )
        );
      } else {
        const insertData: any = {
          category_id: editingCell.categoryId,
          year: selectedYear,
          month: editingCell.month,
          budgeted_amount: amount,
        };

        if (isAssociation) {
          insertData.association_id = associationId;
          insertData.association_type = associationType;
        } else {
          insertData.club_id = currentClub?.clubId;
        }

        const { data, error } = await supabase
          .from(tableName)
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        setBudgetEntries([...budgetEntries, data]);
      }

      setEditingCell(null);
      setEditValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save budget entry');
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleCellDelete = async () => {
    if (!editingCell) return;

    try {
      const existingEntry = getBudgetEntry(editingCell.categoryId, editingCell.month);

      if (existingEntry) {
        const tableName = isAssociation ? 'association_budget_entries' : 'budget_entries';
        const { error } = await supabase
          .from(tableName)
          .update({ budgeted_amount: 0 })
          .eq('id', existingEntry.id);

        if (error) throw error;

        setBudgetEntries(entries =>
          entries.map(entry =>
            entry.id === existingEntry.id ? { ...entry, budgeted_amount: 0 } : entry
          )
        );
      }

      setEditingCell(null);
      setEditValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete budget entry');
    }
  };

  const calculateCategoryTotal = (categoryId: string): number => {
    return budgetEntries
      .filter(entry => entry.category_id === categoryId)
      .reduce((sum, entry) => sum + entry.budgeted_amount, 0);
  };

  const calculateMonthTotal = (month: number, type?: 'income' | 'expense'): number => {
    const relevantCategories = type ? categories.filter(cat => cat.type === type) : categories;
    return budgetEntries
      .filter(entry => entry.month === month && relevantCategories.some(cat => cat.id === entry.category_id))
      .reduce((sum, entry) => sum + entry.budgeted_amount, 0);
  };

  const calculateGrandTotal = (type?: 'income' | 'expense'): number => {
    const relevantCategories = type ? categories.filter(cat => cat.type === type) : categories;
    return budgetEntries
      .filter(entry => relevantCategories.some(cat => cat.id === entry.category_id))
      .reduce((sum, entry) => sum + entry.budgeted_amount, 0);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const totalIncome = useMemo(() => calculateGrandTotal('income'), [budgetEntries, categories]);
  const totalExpenses = useMemo(() => calculateGrandTotal('expense'), [budgetEntries, categories]);
  const netBudget = totalIncome - totalExpenses;
  const incomeCategories = categories.filter(cat => cat.type === 'income');
  const expenseCategories = categories.filter(cat => cat.type === 'expense');

  const monthlyBudgetData = useMemo(() => {
    return MONTHS.map((_, idx) => ({
      income: calculateMonthTotal(idx + 1, 'income'),
      expense: calculateMonthTotal(idx + 1, 'expense'),
    }));
  }, [budgetEntries, categories]);

  const barChartData = {
    labels: MONTHS,
    datasets: [
      {
        label: 'Income',
        data: monthlyBudgetData.map(d => d.income),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Expenses',
        data: monthlyBudgetData.map(d => d.expense),
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { color: 'rgb(203, 213, 225)', padding: 15, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: 'rgb(30, 41, 59)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgb(51, 65, 85)',
        borderWidth: 1,
        padding: 12,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(71, 85, 105, 0.3)' },
        ticks: { color: 'rgb(148, 163, 184)' },
      },
      y: {
        grid: { color: 'rgba(71, 85, 105, 0.3)' },
        ticks: { color: 'rgb(148, 163, 184)' },
      },
    },
  };

  const incomeCategoryTotals = useMemo(() => {
    return incomeCategories.map(cat => ({
      name: cat.name,
      total: calculateCategoryTotal(cat.id),
    })).filter(c => c.total > 0);
  }, [budgetEntries, incomeCategories]);

  const expenseCategoryTotals = useMemo(() => {
    return expenseCategories.map(cat => ({
      name: cat.name,
      total: calculateCategoryTotal(cat.id),
    })).filter(c => c.total > 0);
  }, [budgetEntries, expenseCategories]);

  const allocationColors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#f97316', '#14b8a6', '#a855f7', '#ef4444'];

  const expenseAllocationData = {
    labels: expenseCategoryTotals.map(c => c.name),
    datasets: [{
      data: expenseCategoryTotals.map(c => c.total),
      backgroundColor: expenseCategoryTotals.map((_, i) => allocationColors[i % allocationColors.length]),
      borderColor: 'rgb(15, 23, 42)',
      borderWidth: 2,
    }],
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        labels: { color: 'rgb(203, 213, 225)', padding: 10, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgb(30, 41, 59)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgb(51, 65, 85)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: function (context: any) {
            const value = formatCurrency(context.parsed);
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : '0';
            return `${context.label}: ${value} (${pct}%)`;
          },
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  const renderEditableCell = (categoryId: string, month: number, type: 'income' | 'expense') => {
    const entry = getBudgetEntry(categoryId, month);
    const isEditing = editingCell?.categoryId === categoryId && editingCell?.month === month;
    const amount = entry?.budgeted_amount || 0;

    if (isEditing) {
      return (
        <div
          className="flex items-center justify-center gap-1"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              handleCellCancel();
            }
          }}
        >
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-24 pl-5 pr-2 py-1.5 text-xs bg-slate-900 border border-cyan-500 rounded-lg text-white text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCellSave();
                if (e.key === 'Escape') handleCellCancel();
              }}
              autoFocus
            />
          </div>
          <button onClick={handleCellSave} className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors">
            <Save size={12} />
          </button>
          <button onClick={handleCellDelete} className="p-1 text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Clear">
            <X size={12} />
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => handleCellEdit(categoryId, month)}
        className={`group/cell w-full px-2 py-1.5 text-xs rounded-lg transition-all text-right ${
          amount > 0
            ? 'text-slate-200 hover:bg-slate-700/60'
            : 'text-slate-600 hover:text-slate-400 hover:bg-slate-700/40'
        }`}
      >
        <span className="group-hover/cell:hidden">{amount > 0 ? formatCurrency(amount) : '-'}</span>
        <span className="hidden group-hover/cell:inline-flex items-center gap-1">
          <Edit3 size={10} />
          {amount > 0 ? formatCurrency(amount) : 'Set'}
        </span>
      </button>
    );
  };

  const renderCategorySection = (
    type: 'income' | 'expense',
    sectionCategories: BudgetCategory[],
    isExpanded: boolean,
    onToggle: () => void
  ) => {
    const isIncome = type === 'income';
    const Icon = isIncome ? TrendingUp : TrendingDown;
    const sectionTotal = calculateGrandTotal(type);

    const iconBg = isIncome ? 'bg-emerald-500/10' : 'bg-red-500/10';
    const iconColor = isIncome ? 'text-emerald-400' : 'text-red-400';
    const totalColor = isIncome ? 'text-emerald-400' : 'text-red-400';
    const totalRowBg = isIncome ? 'bg-emerald-500/5' : 'bg-red-500/5';
    const totalRowBorder = isIncome ? 'border-emerald-500/20' : 'border-red-500/20';
    const totalCellBg = isIncome ? 'bg-emerald-950/30' : 'bg-red-950/30';

    return (
      <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 backdrop-blur-sm overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-700/20 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${iconBg}`}>
              <Icon className={iconColor} size={20} />
            </div>
            <div className="text-left">
              <h3 className="text-base font-semibold text-white">
                {isIncome ? 'Income Budget' : 'Expense Budget'}
              </h3>
              <p className="text-xs text-slate-500">
                {sectionCategories.length} {sectionCategories.length === 1 ? 'category' : 'categories'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={`text-lg font-bold ${totalColor}`}>
              {formatCurrency(sectionTotal)}
            </span>
            {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
          </div>
        </button>

        {isExpanded && sectionCategories.length > 0 && (
          <div className="border-t border-slate-700/50">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-700/40">
                    <th className="sticky left-0 z-10 bg-slate-800/90 backdrop-blur-sm px-4 py-3 text-left w-[180px]">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Category</span>
                    </th>
                    {MONTHS.map((m) => (
                      <th key={m} className="px-1 py-3 text-center min-w-[80px]">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{m}</span>
                      </th>
                    ))}
                    <th className="sticky right-0 z-10 bg-slate-800/90 backdrop-blur-sm px-4 py-3 text-right w-[110px]">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Annual</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sectionCategories.map((category) => {
                    const catTotal = calculateCategoryTotal(category.id);
                    return (
                      <tr key={category.id} className="border-b border-slate-700/20 hover:bg-slate-700/15 transition-colors group">
                        <td className="sticky left-0 z-10 bg-slate-800/90 group-hover:bg-slate-700/90 backdrop-blur-sm px-4 py-2.5">
                          <span className="text-sm text-slate-300 font-medium">{category.name}</span>
                        </td>
                        {MONTHS.map((_, monthIndex) => (
                          <td key={monthIndex} className="px-1 py-1.5 text-center">
                            {renderEditableCell(category.id, monthIndex + 1, type)}
                          </td>
                        ))}
                        <td className="sticky right-0 z-10 bg-slate-800/90 group-hover:bg-slate-700/90 backdrop-blur-sm px-4 py-2.5 text-right">
                          <span className={`text-sm font-semibold ${totalColor}`}>
                            {formatCurrency(catTotal)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className={`${totalRowBg} border-t ${totalRowBorder}`}>
                    <td className={`sticky left-0 z-10 ${totalCellBg} backdrop-blur-sm px-4 py-3`}>
                      <span className={`text-xs font-bold uppercase tracking-wider ${totalColor}`}>
                        Total {isIncome ? 'Income' : 'Expenses'}
                      </span>
                    </td>
                    {MONTHS.map((_, monthIndex) => (
                      <td key={monthIndex} className="px-1 py-3 text-center">
                        <span className={`text-xs font-semibold ${totalColor}`}>
                          {formatCurrency(calculateMonthTotal(monthIndex + 1, type))}
                        </span>
                      </td>
                    ))}
                    <td className={`sticky right-0 z-10 ${totalCellBg} backdrop-blur-sm px-4 py-3 text-right`}>
                      <span className={`text-sm font-bold ${totalColor}`}>
                        {formatCurrency(sectionTotal)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isExpanded && sectionCategories.length === 0 && (
          <div className="px-6 py-8 text-center border-t border-slate-700/50">
            <p className="text-sm text-slate-500">
              No {isIncome ? 'income' : 'expense'} categories yet. Add categories in Settings to start budgeting.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Budget Planning</h2>
          <p className="text-sm text-slate-400 mt-1">Plan and track your financial budget for {selectedYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-slate-800/60 to-slate-800/40 border border-slate-700/50 rounded-xl backdrop-blur-sm">
            <Calendar size={16} className="text-slate-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - 2 + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {categories.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="group relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-emerald-500/20 p-5 transition-all duration-300 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                    <TrendingUp className="text-emerald-400" size={20} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-medium mb-1">Total Income Budget</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalIncome)}</p>
                <p className="text-[11px] text-slate-500 mt-1">{incomeCategories.length} categories</p>
              </div>
            </div>

            <div className="group relative overflow-hidden bg-gradient-to-br from-red-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-red-500/20 p-5 transition-all duration-300 hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/5">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-red-500/10 rounded-xl">
                    <TrendingDown className="text-red-400" size={20} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-medium mb-1">Total Expense Budget</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalExpenses)}</p>
                <p className="text-[11px] text-slate-500 mt-1">{expenseCategories.length} categories</p>
              </div>
            </div>

            <div className="group relative overflow-hidden bg-gradient-to-br from-cyan-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-cyan-500/20 p-5 transition-all duration-300 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                    <Wallet className="text-cyan-400" size={20} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-medium mb-1">Net Budget</p>
                <p className={`text-2xl font-bold ${netBudget >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(netBudget)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">{netBudget >= 0 ? 'Surplus' : 'Deficit'}</p>
              </div>
            </div>

            <div className="group relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-amber-500/20 p-5 transition-all duration-300 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-amber-500/10 rounded-xl">
                    <Target className="text-amber-400" size={20} />
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-medium mb-1">Budget Margin</p>
                <p className={`text-2xl font-bold ${netBudget >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                  {totalIncome > 0 ? ((netBudget / totalIncome) * 100).toFixed(1) : '0.0'}%
                </p>
                <p className="text-[11px] text-slate-500 mt-1">of planned income</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 size={20} className="text-cyan-400" />
                <div>
                  <h3 className="text-base font-semibold text-white">Monthly Budget Distribution</h3>
                  <p className="text-xs text-slate-400">Income vs Expenses by month</p>
                </div>
              </div>
              <div className="h-[280px]">
                <Bar data={barChartData} options={barChartOptions} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-6">
                <PieChartIcon size={20} className="text-cyan-400" />
                <div>
                  <h3 className="text-base font-semibold text-white">Expense Allocation</h3>
                  <p className="text-xs text-slate-400">Budget breakdown by category</p>
                </div>
              </div>
              {expenseCategoryTotals.length > 0 ? (
                <div className="h-[280px]">
                  <Doughnut data={expenseAllocationData} options={pieOptions} />
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center">
                  <p className="text-sm text-slate-500">No expense budget entries yet</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-2xl border border-slate-700/50 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign size={20} className="text-cyan-400" />
                <div>
                  <h3 className="text-base font-semibold text-white">Net Monthly Position</h3>
                  <p className="text-xs text-slate-400">Income minus expenses per month</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {MONTHS.map((m, idx) => {
                const income = calculateMonthTotal(idx + 1, 'income');
                const expense = calculateMonthTotal(idx + 1, 'expense');
                const net = income - expense;
                const maxVal = Math.max(...monthlyBudgetData.map(d => Math.abs(d.income - d.expense)), 1);
                const barHeight = Math.min(Math.abs(net) / maxVal * 48, 48);

                return (
                  <div key={m} className="flex flex-col items-center gap-1">
                    <div className="h-12 w-full flex items-end justify-center">
                      <div
                        className={`w-full max-w-[28px] rounded-t-md transition-all ${
                          net >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'
                        }`}
                        style={{ height: `${Math.max(barHeight, 2)}px` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">{m}</span>
                    <span className={`text-[10px] font-semibold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(net)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {renderCategorySection('income', incomeCategories, incomeExpanded, () => setIncomeExpanded(!incomeExpanded))}
          {renderCategorySection('expense', expenseCategories, expenseExpanded, () => setExpenseExpanded(!expenseExpanded))}

          <div className="bg-gradient-to-r from-cyan-500/10 via-slate-800/50 to-slate-800/30 rounded-2xl border border-cyan-500/20 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                  <Wallet className="text-cyan-400" size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Annual Net Position</p>
                  <p className="text-xs text-slate-400">{selectedYear} total income minus total expenses</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${netBudget >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(netBudget)}
                </p>
                <p className="text-xs text-slate-500">
                  {formatCurrency(totalIncome)} income - {formatCurrency(totalExpenses)} expenses
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-20 rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-800/40 backdrop-blur-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-700/50 mb-4">
            <DollarSign size={32} className="text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Budget Categories</h3>
          <p className="text-slate-400 mb-1 max-w-md mx-auto text-sm">
            Create budget categories before you can plan your budget.
          </p>
          <p className="text-slate-500 text-xs">
            Go to Settings &rarr; Finance &rarr; Categories to get started.
          </p>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { Save, X, DollarSign, Calendar, TrendingUp, TrendingDown, ChartBar as BarChart3, ChartPie as PieChartIcon, Wallet, ChevronDown, ChevronRight, CreditCard as Edit3, Tag, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar } from 'react-chartjs-2';

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
  const navigate = useNavigate();
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
        labels: { color: darkMode ? 'rgb(203, 213, 225)' : 'rgb(71, 85, 105)', padding: 15, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: darkMode ? 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)',
        titleColor: darkMode ? 'rgb(226, 232, 240)' : 'rgb(15, 23, 42)',
        bodyColor: darkMode ? 'rgb(203, 213, 225)' : 'rgb(71, 85, 105)',
        borderColor: darkMode ? 'rgb(51, 65, 85)' : 'rgb(226, 232, 240)',
        borderWidth: 1,
        padding: 12,
      },
    },
    scales: {
      x: {
        grid: { color: darkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)' },
        ticks: { color: darkMode ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)' },
      },
      y: {
        grid: { color: darkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)' },
        ticks: { color: darkMode ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)' },
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
              className={`w-24 pl-5 pr-2 py-1.5 text-xs border border-cyan-500 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}
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
            ? `${darkMode ? 'text-slate-200 hover:bg-slate-700/60' : 'text-slate-700 hover:bg-slate-100'}`
            : `${darkMode ? 'text-slate-600 hover:text-slate-400 hover:bg-slate-700/40' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`
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


    return (
      <div className="a-card overflow-hidden">
        <button onClick={onToggle} className="w-full flex items-center gap-3 text-left bg-transparent border-0 cursor-pointer" style={{ padding: '18px 20px' }} aria-expanded={isExpanded}>
          <span className="a-tile a-tile-sm"><Icon size={17} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="a-display a-ink m-0 text-lg font-semibold">{isIncome ? 'Income budget' : 'Expense budget'}</h2>
            <p className="a-dim mt-0.5 mb-0 text-[12.5px]">{sectionCategories.length} {sectionCategories.length === 1 ? 'category' : 'categories'} · click a month to edit</p>
          </div>
          <span className={`a-big ${isIncome ? 'a-txt-g' : 'a-txt-r'}`} style={{ fontSize: 22 }}>{formatCurrency(sectionTotal)}</span>
          <span className="a-dim flex">{isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
        </button>

        {isExpanded && sectionCategories.length > 0 && (
          <div className="overflow-x-auto">
            <table className="a-btable w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className="a-btable-sticky-l text-left" style={{ width: 180 }}>Category</th>
                  {MONTHS.map((m) => <th key={m}>{m}</th>)}
                  <th className="a-btable-sticky-r text-right" style={{ width: 110 }}>Annual</th>
                </tr>
              </thead>
              <tbody>
                {sectionCategories.map((category) => (
                  <tr key={category.id}>
                    <td className="a-btable-sticky-l a-ink text-sm">{category.name}</td>
                    {MONTHS.map((_, monthIndex) => (
                      <td key={monthIndex} className="text-center">{renderEditableCell(category.id, monthIndex + 1, type)}</td>
                    ))}
                    <td className={`a-btable-sticky-r a-num text-right font-semibold ${isIncome ? 'a-txt-g' : 'a-txt-r'}`}>{formatCurrency(calculateCategoryTotal(category.id))}</td>
                  </tr>
                ))}
                <tr className="a-btable-total">
                  <td className="a-btable-sticky-l a-cap" style={{ color: 'inherit' }}>Total {isIncome ? 'income' : 'expenses'}</td>
                  {MONTHS.map((_, monthIndex) => (
                    <td key={monthIndex} className="text-center a-num text-xs font-semibold">{formatCurrency(calculateMonthTotal(monthIndex + 1, type))}</td>
                  ))}
                  <td className={`a-btable-sticky-r a-num text-right font-semibold ${isIncome ? 'a-txt-g' : 'a-txt-r'}`}>{formatCurrency(sectionTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {isExpanded && sectionCategories.length === 0 && (
          <div className="px-6 py-8 text-center a-mute text-sm">
            No {isIncome ? 'income' : 'expense'} categories yet. Add categories to start budgeting.
          </div>
        )}
      </div>
    );
  };

  const margin = totalIncome > 0 ? (netBudget / totalIncome) * 100 : 0;
  const ringDeg = Math.max(0, Math.min(360, (Math.abs(margin) / 100) * 360));
  const allocTotal = expenseCategoryTotals.reduce((s, c) => s + c.total, 0);
  let acc = 0;
  const allocStops = expenseCategoryTotals.map((c, i) => {
    const from = (acc / (allocTotal || 1)) * 360;
    acc += c.total;
    const to = (acc / (allocTotal || 1)) * 360;
    return `${allocationColors[i % allocationColors.length]} ${from}deg ${to}deg`;
  }).join(', ');
  const Stat = ({ label, icon, value, sub, tone = 'a-ink' }: { label: string; icon: React.ReactNode; value: React.ReactNode; sub: React.ReactNode; tone?: string }) => (
    <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
      <div className="flex items-center justify-between"><p className="a-cap">{label}</p><span className="a-tile a-tile-sm">{icon}</span></div>
      <div><div className={`a-big ${tone}`} style={{ fontSize: 30 }}>{value}</div><div className="a-mute mt-[7px] text-[12.5px]">{sub}</div></div>
    </div>
  );
  const netMax = Math.max(...MONTHS.map((_, i) => Math.abs(calculateMonthTotal(i + 1, 'income') - calculateMonthTotal(i + 1, 'expense'))), 1);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="a-display a-ink m-0 text-[22px] font-semibold">Budget planning</h2>
          <p className="a-mute mt-1 mb-0 text-sm">Plan and track your financial budget for {selectedYear}</p>
        </div>
        <label className="relative inline-flex">
          <span className="sr-only">Budget year</span>
          <Calendar size={16} className="a-mute absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="a-pick" style={{ paddingLeft: 36 }}>
            {Array.from({ length: 5 }, (_, i) => { const year = new Date().getFullYear() - 2 + i; return <option key={year} value={year}>{year}</option>; })}
          </select>
        </label>
      </div>

      {error && <div className="a-note"><span className="a-txt-r text-sm">{error}</span></div>}

      {categories.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Income budget" icon={<TrendingUp size={17} />} value={formatCurrency(totalIncome)} sub={`${incomeCategories.length} categories`} />
            <Stat label="Expense budget" icon={<TrendingDown size={17} />} value={formatCurrency(totalExpenses)} sub={`${expenseCategories.length} categories`} />
            <Stat label="Net budget" icon={<Wallet size={17} />} value={formatCurrency(netBudget)} tone={netBudget >= 0 ? 'a-txt-g' : 'a-txt-r'} sub={<span className={netBudget >= 0 ? 'a-txt-g' : 'a-txt-r'}>{netBudget >= 0 ? 'Surplus' : 'Deficit'}</span>} />
            <div className="a-card flex items-center gap-[18px]" style={{ padding: '18px 20px' }}>
              <div className="relative flex-shrink-0" style={{ width: 78, height: 78 }} aria-hidden="true">
                <div className="a-ring" style={{ background: `conic-gradient(${netBudget >= 0 ? '#FFB340' : '#FF6B6B'} 0deg ${ringDeg}deg, var(--a-ring-track) ${ringDeg}deg 360deg)` }} />
              </div>
              <div>
                <p className="a-cap">Budget margin</p>
                <div className={`a-big mt-2 ${netBudget >= 0 ? 'a-txt-a' : 'a-txt-r'}`} style={{ fontSize: 30 }}>{margin.toFixed(1)}%</div>
                <div className="a-mute text-[12.5px] mt-1.5">of planned income</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="a-card xl:col-span-2 flex flex-col gap-3" style={{ padding: 22 }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="a-tile a-tile-sm"><BarChart3 size={17} /></span>
                <div className="flex-1 min-w-0">
                  <h2 className="a-display a-ink m-0 text-lg font-semibold">Monthly budget</h2>
                  <p className="a-dim mt-0.5 mb-0 text-[12.5px]">Income vs expenses by month</p>
                </div>
                <span className="a-st text-[12.5px]"><span className="a-light" style={{ background: '#30D158', boxShadow: 'none' }} />Income</span>
                <span className="a-st text-[12.5px] ml-3"><span className="a-light" style={{ background: '#FF6B6B', boxShadow: 'none' }} />Expenses</span>
              </div>
              <div className="h-[280px]"><Bar data={barChartData} options={barChartOptions} /></div>
            </div>

            <div className="a-card flex flex-col gap-4" style={{ padding: 22 }}>
              <div className="flex items-center gap-3">
                <span className="a-tile a-tile-sm"><PieChartIcon size={17} /></span>
                <div className="flex-1 min-w-0">
                  <h2 className="a-display a-ink m-0 text-lg font-semibold">Expense allocation</h2>
                  <p className="a-dim mt-0.5 mb-0 text-[12.5px]">By category</p>
                </div>
              </div>
              {expenseCategoryTotals.length > 0 ? (
                <>
                  <div className="flex justify-center">
                    <div className="relative flex-shrink-0" style={{ width: 170, height: 170 }}>
                      <div className="a-ring a-ring-lg" style={{ background: `conic-gradient(${allocStops})` }} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="a-big a-ink" style={{ fontSize: 22 }}>{formatCurrency(allocTotal)}</span>
                        <span className="a-dim text-[11.5px] mt-[3px]">budgeted</span>
                      </div>
                    </div>
                  </div>
                  <div className="a-divide">
                    {expenseCategoryTotals.map((c, i) => (
                      <div key={c.name} className="flex items-center gap-2.5 py-2.5">
                        <span className="a-light" style={{ background: allocationColors[i % allocationColors.length], boxShadow: 'none' }} />
                        <span className="flex-1 a-ink text-[13.5px] truncate">{c.name}</span>
                        <span className="a-num a-ink text-sm font-semibold">{formatCurrency(c.total)}</span>
                        <span className="a-dim a-num text-right text-[12.5px]" style={{ width: 44 }}>{Math.round((c.total / (allocTotal || 1)) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center a-mute text-sm py-10">No expense budget entries yet</div>
              )}
            </div>
          </div>

          <div className="a-card flex flex-col gap-3.5" style={{ padding: 22 }}>
            <div className="flex items-center gap-3">
              <span className="a-tile a-tile-sm"><DollarSign size={17} /></span>
              <div className="flex-1 min-w-0">
                <h2 className="a-display a-ink m-0 text-lg font-semibold">Net monthly position</h2>
                <p className="a-dim mt-0.5 mb-0 text-[12.5px]">Income minus expenses</p>
              </div>
            </div>
            <div className="grid grid-cols-6 lg:grid-cols-12 gap-1.5">
              {MONTHS.map((m, idx) => {
                const net = calculateMonthTotal(idx + 1, 'income') - calculateMonthTotal(idx + 1, 'expense');
                const h = net === 0 ? 3 : Math.max(4, Math.round((Math.abs(net) / netMax) * 64));
                return (
                  <div key={m} className="flex flex-col items-center gap-1.5">
                    <div className="w-full flex flex-col justify-end items-center" style={{ height: 70 }}>
                      <div className={`a-netbar ${net > 0 ? 'a-netbar-g' : net < 0 ? 'a-netbar-r' : ''}`} style={{ height: h }} />
                    </div>
                    <span className="a-dim text-[11.5px]">{m.charAt(0) + m.slice(1).toLowerCase()}</span>
                    <span className={`a-num text-[12.5px] font-semibold ${net > 0 ? 'a-txt-g' : net < 0 ? 'a-txt-r' : 'a-dim'}`}>{net < 0 ? '−' : ''}{formatCurrency(Math.abs(net))}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {renderCategorySection('income', incomeCategories, incomeExpanded, () => setIncomeExpanded(!incomeExpanded))}
          {renderCategorySection('expense', expenseCategories, expenseExpanded, () => setExpenseExpanded(!expenseExpanded))}

          <div className="a-card a-hero a-hero-b flex flex-wrap items-center gap-3.5" style={{ padding: '18px 20px' }}>
            <span className="a-tile"><Wallet size={19} /></span>
            <div className="flex-1 min-w-[200px]">
              <div className="a-ink text-[14.5px] font-semibold">Annual net position</div>
              <div className="a-dim text-[12.5px] mt-0.5">{selectedYear} total income minus total expenses</div>
            </div>
            <div className="text-right">
              <div className={`a-big ${netBudget >= 0 ? 'a-txt-g' : 'a-txt-r'}`} style={{ fontSize: 26 }}>{formatCurrency(netBudget)}</div>
              <div className="a-dim text-xs mt-1">{formatCurrency(totalIncome)} income − {formatCurrency(totalExpenses)} expenses</div>
            </div>
          </div>
        </>
      ) : (
        <div className="a-card a-empty" style={{ padding: '48px 24px' }}>
          <span className="a-tile" style={{ width: 56, height: 56 }}><Tag size={24} /></span>
          <div className="a-display a-ink text-lg font-semibold">No budget categories</div>
          <p className="a-mute m-0 text-sm">Create budget categories before you can plan your budget.</p>
          <button onClick={() => navigate('/finances/categories')} className="a-btn a-btn-p mt-1"><Tag size={16} />Set up categories<ArrowRight size={16} /></button>
        </div>
      )}
    </div>
  );
};

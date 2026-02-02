import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, DollarSign, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

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

export const FinancesBudget: React.FC<FinancesBudgetProps> = ({ darkMode, associationId, associationType }) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<{categoryId: string, month: number} | null>(null);
  const [editValue, setEditValue] = useState('');

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
        // Load association budget data
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

        // Load association budget entries
        const { data: entriesData, error: entriesError } = await supabase
          .from('association_budget_entries')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('year', selectedYear);

        if (entriesError) throw entriesError;
        setBudgetEntries(entriesData || []);
      } else {
        // Load club budget data
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
    return budgetEntries.find(entry =>
      entry.category_id === categoryId && entry.month === month
    );
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
            entry.id === existingEntry.id
              ? { ...entry, budgeted_amount: amount }
              : entry
          )
        );
      } else {
        const insertData: any = {
          category_id: editingCell.categoryId,
          year: selectedYear,
          month: editingCell.month,
          budgeted_amount: amount
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
            entry.id === existingEntry.id
              ? { ...entry, budgeted_amount: 0 }
              : entry
          )
        );
      }

      setEditingCell(null);
      setEditValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete budget entry');
    }
  };

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const calculateCategoryTotal = (categoryId: string): number => {
    return budgetEntries
      .filter(entry => entry.category_id === categoryId)
      .reduce((sum, entry) => sum + entry.budgeted_amount, 0);
  };

  const calculateMonthTotal = (month: number, type?: 'income' | 'expense'): number => {
    const relevantCategories = type
      ? categories.filter(cat => cat.type === type)
      : categories;

    return budgetEntries
      .filter(entry =>
        entry.month === month &&
        relevantCategories.some(cat => cat.id === entry.category_id)
      )
      .reduce((sum, entry) => sum + entry.budgeted_amount, 0);
  };

  const calculateGrandTotal = (type?: 'income' | 'expense'): number => {
    const relevantCategories = type
      ? categories.filter(cat => cat.type === type)
      : categories;

    return budgetEntries
      .filter(entry =>
        relevantCategories.some(cat => cat.id === entry.category_id)
      )
      .reduce((sum, entry) => sum + entry.budgeted_amount, 0);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Budget Planning</h2>
          <p className="text-slate-400 text-sm">Plan and track your club's financial budget</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
            <Calendar size={18} className="text-slate-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent text-white font-medium outline-none cursor-pointer"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - 2 + i;
                return (
                  <option key={year} value={year}>{year}</option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/30 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {categories.length > 0 ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm">
          <div className="overflow-x-auto" style={{ overflowX: 'auto', position: 'relative' }}>
            <div className="inline-block min-w-full align-middle">
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-slate-700/50">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-700/90 via-slate-700/80 to-slate-700/90 border-b-2 border-slate-600/50 shadow-lg">
                      <th className="sticky left-0 z-20 backdrop-blur-sm px-6 py-4 text-left border-r-2 border-slate-600/50 shadow-lg" style={{ backgroundColor: 'rgb(51 65 85 / 0.95)' }}>
                        <span className="text-sm font-bold uppercase tracking-wider text-slate-200">Category</span>
                      </th>
                      {months.map((month) => (
                        <th key={month} className="px-4 py-4 text-center min-w-[110px]">
                          <span className="text-sm font-bold uppercase tracking-wider text-slate-200">{month}</span>
                        </th>
                      ))}
                      <th className="sticky right-0 z-20 bg-slate-700/90 backdrop-blur-sm px-6 py-4 text-center border-l border-slate-600/30">
                        <span className="text-sm font-bold uppercase tracking-wider text-slate-200">Total</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {categories.filter(cat => cat.type === 'income').length > 0 && (
                      <>
                        <tr className="bg-gradient-to-r from-green-900/20 to-green-900/10 border-l-4 border-green-500">
                          <td colSpan={14} className="sticky left-0 z-10 px-6 py-3">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="text-green-400" size={18} />
                              <span className="text-sm font-bold uppercase tracking-wide text-green-400">Income</span>
                            </div>
                          </td>
                        </tr>
                        {categories.filter(cat => cat.type === 'income').map((category, idx) => (
                          <tr key={category.id} className="hover:bg-slate-700/20 transition-colors group">
                            <td className="sticky left-0 z-10 backdrop-blur-sm px-6 py-4 border-r-2 border-slate-700/50 shadow-md" style={{ backgroundColor: 'rgb(51 65 85 / 0.95)' }}>
                              <span className="text-sm font-normal text-slate-200">{category.name}</span>
                            </td>
                            {months.map((_, monthIndex) => {
                              const month = monthIndex + 1;
                              const entry = getBudgetEntry(category.id, month);
                              const isEditing = editingCell?.categoryId === category.id && editingCell?.month === month;

                              return (
                                <td key={month} className="px-4 py-4 text-center">
                                  {isEditing ? (
                                    <div
                                      className="flex items-center justify-center gap-1"
                                      onBlur={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget)) {
                                          handleCellCancel();
                                        }
                                      }}
                                    >
                                      <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                        <input
                                          type="number"
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="w-28 pl-6 pr-3 py-2 text-sm bg-slate-900 border border-blue-500 rounded-lg text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellSave();
                                            if (e.key === 'Escape') handleCellCancel();
                                          }}
                                          autoFocus
                                        />
                                      </div>
                                      <button
                                        onClick={handleCellSave}
                                        className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors"
                                      >
                                        <Save size={14} />
                                      </button>
                                      <button
                                        onClick={handleCellDelete}
                                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                        title="Clear entry"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleCellEdit(category.id, month)}
                                      className="px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all w-full"
                                    >
                                      {formatCurrency(entry?.budgeted_amount || 0)}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="sticky right-0 z-10 bg-slate-800/30 group-hover:bg-slate-700/30 backdrop-blur-sm px-6 py-4 text-center border-l border-slate-700/30">
                              <span className="text-sm font-semibold text-green-400">{formatCurrency(calculateCategoryTotal(category.id))}</span>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-green-900/10 font-semibold border-t-2 border-green-900/30">
                          <td className="sticky left-0 z-10 backdrop-blur-sm px-6 py-4 border-r-2 border-slate-700/50 shadow-md" style={{ backgroundColor: 'rgb(51 65 85 / 0.95)' }}>
                            <span className="text-sm uppercase tracking-wide text-green-400">Total Income</span>
                          </td>
                          {months.map((_, monthIndex) => (
                            <td key={monthIndex} className="px-4 py-4 text-center">
                              <span className="text-sm font-semibold text-green-400">{formatCurrency(calculateMonthTotal(monthIndex + 1, 'income'))}</span>
                            </td>
                          ))}
                          <td className="sticky right-0 z-10 bg-green-900/10 backdrop-blur-sm px-6 py-4 text-center border-l border-slate-700/30">
                            <span className="text-sm font-bold text-green-400">{formatCurrency(calculateGrandTotal('income'))}</span>
                          </td>
                        </tr>
                      </>
                    )}

                    {categories.filter(cat => cat.type === 'expense').length > 0 && (
                      <>
                        <tr className="bg-gradient-to-r from-red-900/20 to-red-900/10 border-l-4 border-red-500">
                          <td colSpan={14} className="sticky left-0 z-10 px-6 py-3">
                            <div className="flex items-center gap-2">
                              <TrendingDown className="text-red-400" size={18} />
                              <span className="text-sm font-bold uppercase tracking-wide text-red-400">Expenses</span>
                            </div>
                          </td>
                        </tr>
                        {categories.filter(cat => cat.type === 'expense').map((category) => (
                          <tr key={category.id} className="hover:bg-slate-700/20 transition-colors group">
                            <td className="sticky left-0 z-10 backdrop-blur-sm px-6 py-4 border-r-2 border-slate-700/50 shadow-md" style={{ backgroundColor: 'rgb(51 65 85 / 0.95)' }}>
                              <span className="text-sm font-normal text-slate-200">{category.name}</span>
                            </td>
                            {months.map((_, monthIndex) => {
                              const month = monthIndex + 1;
                              const entry = getBudgetEntry(category.id, month);
                              const isEditing = editingCell?.categoryId === category.id && editingCell?.month === month;

                              return (
                                <td key={month} className="px-4 py-4 text-center">
                                  {isEditing ? (
                                    <div
                                      className="flex items-center justify-center gap-1"
                                      onBlur={(e) => {
                                        if (!e.currentTarget.contains(e.relatedTarget)) {
                                          handleCellCancel();
                                        }
                                      }}
                                    >
                                      <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                        <input
                                          type="number"
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="w-28 pl-6 pr-3 py-2 text-sm bg-slate-900 border border-blue-500 rounded-lg text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellSave();
                                            if (e.key === 'Escape') handleCellCancel();
                                          }}
                                          autoFocus
                                        />
                                      </div>
                                      <button
                                        onClick={handleCellSave}
                                        className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors"
                                      >
                                        <Save size={14} />
                                      </button>
                                      <button
                                        onClick={handleCellDelete}
                                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                        title="Clear entry"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleCellEdit(category.id, month)}
                                      className="px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all w-full"
                                    >
                                      {formatCurrency(entry?.budgeted_amount || 0)}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="sticky right-0 z-10 bg-slate-800/30 group-hover:bg-slate-700/30 backdrop-blur-sm px-6 py-4 text-center border-l border-slate-700/30">
                              <span className="text-sm font-semibold text-red-400">{formatCurrency(calculateCategoryTotal(category.id))}</span>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-red-900/10 font-semibold border-t-2 border-red-900/30">
                          <td className="sticky left-0 z-10 backdrop-blur-sm px-6 py-4 border-r-2 border-slate-700/50 shadow-md" style={{ backgroundColor: 'rgb(51 65 85 / 0.95)' }}>
                            <span className="text-sm uppercase tracking-wide text-red-400">Total Expenses</span>
                          </td>
                          {months.map((_, monthIndex) => (
                            <td key={monthIndex} className="px-4 py-4 text-center">
                              <span className="text-sm font-semibold text-red-400">{formatCurrency(calculateMonthTotal(monthIndex + 1, 'expense'))}</span>
                            </td>
                          ))}
                          <td className="sticky right-0 z-10 bg-red-900/10 backdrop-blur-sm px-6 py-4 text-center border-l border-slate-700/30">
                            <span className="text-sm font-bold text-red-400">{formatCurrency(calculateGrandTotal('expense'))}</span>
                          </td>
                        </tr>
                      </>
                    )}

                    <tr className="bg-gradient-to-r from-blue-900/30 to-blue-800/20 border-t-4 border-blue-600/50">
                      <td className="sticky left-0 z-10 backdrop-blur-sm px-6 py-5 border-r-2 border-slate-700/50 shadow-md" style={{ backgroundColor: 'rgb(51 65 85 / 0.95)' }}>
                        <span className="text-base font-bold uppercase tracking-wide text-blue-300">Net Income</span>
                      </td>
                      {months.map((_, monthIndex) => {
                        const income = calculateMonthTotal(monthIndex + 1, 'income');
                        const expenses = calculateMonthTotal(monthIndex + 1, 'expense');
                        const net = income - expenses;
                        return (
                          <td key={monthIndex} className="px-4 py-5 text-center">
                            <span className={`text-sm font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(net)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-gradient-to-r from-blue-900/30 to-blue-800/20 backdrop-blur-sm px-6 py-5 text-center border-l border-blue-700/30">
                        {(() => {
                          const totalNet = calculateGrandTotal('income') - calculateGrandTotal('expense');
                          return (
                            <span className={`text-base font-bold ${totalNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(totalNet)}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-700/50 mb-4">
            <DollarSign size={32} className="text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Budget Categories</h3>
          <p className="text-slate-400 mb-1 max-w-md mx-auto">
            You need to create budget categories before you can plan your budget.
          </p>
          <p className="text-slate-500 text-sm">
            Go to Settings → Finance → Categories to create your first budget category.
          </p>
        </div>
      )}
    </div>
  );
};

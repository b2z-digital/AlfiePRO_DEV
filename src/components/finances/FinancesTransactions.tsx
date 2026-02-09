import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Edit, Trash2, DollarSign, TrendingUp, TrendingDown, Calendar, ChevronDown, FileText, Minus, Upload, Filter, Tag, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { NewTransactionModal } from './NewTransactionModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { ConfirmationModal } from '../ConfirmationModal';
import { CategoryCreationModal } from './CategoryCreationModal';
import { TransactionImportModal } from './TransactionImportModal';

interface Transaction {
  id: string;
  type: 'deposit' | 'expense';
  description: string;
  amount: number;
  date: string;
  category_id?: string;
  category_name?: string;
  payer?: string;
  payee?: string;
  reference?: string;
  notes?: string;
  payment_method: string;
  payment_status: string;
  line_items?: TransactionLineItem[];
  linked_entity_type?: string;
  linked_entity_id?: string;
}

interface TransactionLineItem {
  id: string;
  description: string;
  amount: number;
  category_id?: string;
  category_name?: string;
}

interface BudgetCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
}

interface FinancesTransactionsProps {
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
}

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  className?: string;
}

const CustomDropdown: React.FC<{
  darkMode: boolean;
  icon: React.ReactNode;
  value: string;
  label: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}> = ({ darkMode, icon, value, label, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
          ${darkMode
            ? 'bg-slate-700/80 hover:bg-slate-600/80 text-slate-200 border border-slate-600/50'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}
          ${open ? (darkMode ? 'ring-2 ring-blue-500/40' : 'ring-2 ring-blue-500/30') : ''}
        `}
      >
        <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
      </button>

      {open && (
        <div className={`
          absolute z-50 mt-2 min-w-[200px] rounded-xl shadow-xl border overflow-hidden
          ${darkMode
            ? 'bg-slate-800 border-slate-700 shadow-black/40'
            : 'bg-white border-slate-200 shadow-slate-200/60'}
        `}>
          <div className="py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  if (opt.value !== '__add_category__') setOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left
                  ${opt.className || ''}
                  ${value === opt.value
                    ? (darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                    : (darkMode ? 'text-slate-300 hover:bg-slate-700/80' : 'text-slate-700 hover:bg-slate-50')}
                `}
              >
                {opt.icon && <span>{opt.icon}</span>}
                <span className="flex-1">{opt.label}</span>
                {value === opt.value && <Check size={14} className="text-blue-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const FinancesTransactions: React.FC<FinancesTransactionsProps> = ({ darkMode, associationId, associationType }) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deposit' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Summary calculations
  const totalIncome = transactions
    .filter(t => t.type === 'deposit' || t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const netAmount = totalIncome - totalExpenses;

  useEffect(() => {
    console.log('FinancesTransactions useEffect - isAssociation:', isAssociation, 'currentClub:', currentClub?.clubId);
    if (isAssociation || currentClub?.clubId) {
      loadTransactions();
      loadCategories();
    } else {
      console.log('FinancesTransactions: No association or club, setting loading to false');
      setLoading(false);
    }
  }, [currentClub, associationId, associationType]);

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

  const loadCategories = async () => {
    try {
      if (isAssociation) {
        const { data, error } = await supabase
          .from('association_budget_categories')
          .select('id, name, type')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setCategories(data || []);
      } else {
        const { data, error } = await supabase
          .from('budget_categories')
          .select('id, name, type')
          .eq('club_id', currentClub?.clubId)
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setCategories(data || []);
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  const loadTransactions = async () => {
    console.log('FinancesTransactions loadTransactions called - isAssociation:', isAssociation);
    try {
      setLoading(true);
      setError(null);

      if (isAssociation) {
        console.log('Loading association transactions for:', associationId, associationType);
        // Load association transactions
        const { data: transactionsData, error: transactionsError } = await supabase
          .from('association_transactions')
          .select(`
            id,
            type,
            description,
            amount,
            date,
            category_id,
            tax_amount,
            tax_rate_id,
            tax_type,
            payer,
            payee,
            reference,
            notes,
            payment_method,
            payment_status,
            linked_entity_type,
            linked_entity_id,
            association_budget_categories!left (
              id,
              name
            )
          `)
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .order('date', { ascending: false });

        if (transactionsError) {
          console.error('Error loading association transactions:', transactionsError);
          throw transactionsError;
        }

        console.log('Association transactions loaded:', transactionsData);

        const formattedTransactions = (transactionsData || []).map(t => ({
          ...t,
          category_name: t.association_budget_categories?.name
        }));

        setTransactions(formattedTransactions);
        console.log('FinancesTransactions: Setting loading to false (association)');
        setLoading(false);
        return;
      }

      // Load club transactions with their line items and categories
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select(`
          id,
          type,
          description,
          amount,
          date,
          category_id,
          payer,
          payee,
          reference,
          notes,
          payment_method,
          payment_status,
          linked_entity_type,
          linked_entity_id,
          budget_categories!left (
            id,
            name
          )
        `)
        .eq('club_id', currentClub?.clubId)
        .order('date', { ascending: false });

      if (transactionsError) throw transactionsError;

      const transactionIds = (transactionsData || []).map(t => t.id);
      let lineItemsData: any[] = [];
      if (transactionIds.length > 0) {
        const { data, error: lineItemsError } = await supabase
          .from('transaction_line_items')
          .select(`
            id,
            transaction_id,
            description,
            amount,
            category_id,
            budget_categories!left (
              id,
              name
            )
          `)
          .in('transaction_id', transactionIds);

        if (lineItemsError) throw lineItemsError;
        lineItemsData = data || [];
      }

      // Group line items by transaction
      const lineItemsByTransaction: { [key: string]: TransactionLineItem[] } = {};
      lineItemsData?.forEach(item => {
        if (!lineItemsByTransaction[item.transaction_id]) {
          lineItemsByTransaction[item.transaction_id] = [];
        }
        lineItemsByTransaction[item.transaction_id].push({
          id: item.id,
          description: item.description,
          amount: item.amount,
          category_id: item.category_id,
          category_name: item.budget_categories?.name
        });
      });

      // Process transactions and determine categories
      const processedTransactions: Transaction[] = transactionsData?.map(transaction => {
        const lineItems = lineItemsByTransaction[transaction.id] || [];
        
        // Determine the primary category for display
        let categoryName = 'Uncategorized';
        
        if (transaction.budget_categories?.name) {
          // Use transaction-level category if available
          categoryName = transaction.budget_categories.name;
        } else if (lineItems.length > 0) {
          // Use the category from line items
          const categorizedItems = lineItems.filter(item => item.category_name);
          if (categorizedItems.length > 0) {
            if (categorizedItems.length === 1) {
              categoryName = categorizedItems[0].category_name!;
            } else {
              // Multiple categories - show "Mixed Categories"
              const uniqueCategories = [...new Set(categorizedItems.map(item => item.category_name))];
              if (uniqueCategories.length === 1) {
                categoryName = uniqueCategories[0]!;
              } else {
                categoryName = 'Mixed Categories';
              }
            }
          }
        }

        return {
          id: transaction.id,
          type: transaction.type,
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          category_id: transaction.category_id,
          category_name: categoryName,
          payer: transaction.payer,
          payee: transaction.payee,
          reference: transaction.reference,
          notes: transaction.notes,
          payment_method: transaction.payment_method,
          payment_status: transaction.payment_status,
          line_items: lineItems,
          linked_entity_type: transaction.linked_entity_type,
          linked_entity_id: transaction.linked_entity_id
        };
      }) || [];

      setTransactions(processedTransactions);
    } catch (err) {
      console.error('Error loading transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (transactionId: string) => {
    setTransactionToDelete(transactionId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return;

    try {
      const tableName = isAssociation ? 'association_transactions' : 'transactions';
      let query = supabase
        .from(tableName)
        .delete()
        .eq('id', transactionToDelete);

      if (isAssociation) {
        query = query.eq('association_id', associationId).eq('association_type', associationType);
      } else {
        query = query.eq('club_id', currentClub?.clubId);
      }

      const { error } = await query;

      if (error) throw error;

      addNotification('success', 'Transaction deleted successfully');
      await loadTransactions();
      setShowDeleteConfirm(false);
      setTransactionToDelete(null);
    } catch (err) {
      console.error('Error deleting transaction:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to delete transaction');
      setShowDeleteConfirm(false);
      setTransactionToDelete(null);
    }
  };

  // Filter transactions
  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transaction.payer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transaction.payee?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
    
    const matchesCategory = categoryFilter === 'all' || 
                           transaction.category_id === categoryFilter ||
                           (transaction.line_items && transaction.line_items.some(item => item.category_id === categoryFilter));
    
    return matchesSearch && matchesType && matchesCategory;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400 text-center">
          <p className="text-lg font-medium mb-2">Error: Failed to load data</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Total Income</p>
              <p className="text-2xl font-bold text-green-400">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-900/30">
              <DollarSign className="text-green-400" size={24} />
            </div>
          </div>
        </div>

        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Total Expenses</p>
              <p className="text-2xl font-bold text-red-400">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-900/30">
              <DollarSign className="text-red-400" size={24} />
            </div>
          </div>
        </div>

        <div className={`
          p-6 rounded-xl border backdrop-blur-sm
          ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium">Net Amount</p>
              <p className={`text-2xl font-bold ${netAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {netAmount >= 0 ? '' : '-'}{formatCurrency(Math.abs(netAmount))}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${netAmount >= 0 ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
              <DollarSign className={netAmount >= 0 ? 'text-green-400' : 'text-red-400'} size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`
                w-full pl-10 pr-4 py-2 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
              `}
            />
          </div>

          <CustomDropdown
            darkMode={darkMode}
            icon={<Filter size={15} />}
            value={typeFilter}
            label={typeFilter === 'all' ? 'All Types' : typeFilter === 'deposit' ? 'Income' : 'Expense'}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'deposit', label: 'Income', icon: <TrendingUp size={14} className="text-green-400" /> },
              { value: 'expense', label: 'Expense', icon: <TrendingDown size={14} className="text-red-400" /> },
            ]}
            onChange={(val) => setTypeFilter(val as 'all' | 'deposit' | 'expense')}
          />

          <CustomDropdown
            darkMode={darkMode}
            icon={<Tag size={15} />}
            value={categoryFilter}
            label={categoryFilter === 'all' ? 'All Categories' : categories.find(c => c.id === categoryFilter)?.name || 'All Categories'}
            options={[
              { value: 'all', label: 'All Categories' },
              ...categories.map(c => ({ value: c.id, label: c.name })),
              { value: '__add_category__', label: '+ Add Category', className: 'text-blue-400 font-medium' },
            ]}
            onChange={(val) => {
              if (val === '__add_category__') {
                setShowCategoryModal(true);
              } else {
                setCategoryFilter(val);
              }
            }}
          />
        </div>

        <div className="relative" ref={dropdownRef}>
          <div className="flex">
            <button
              onClick={() => setShowNewTransactionModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-l-lg hover:bg-green-700 transition-colors animate-pulse"
            >
              <Plus size={18} />
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

              <div className="my-2 border-t border-slate-700"></div>

              <button
                onClick={() => {
                  setShowImportModal(true);
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-purple-600/20">
                  <Upload className="text-purple-400" size={18} />
                </div>
                <div>
                  <div className="text-white font-medium text-sm">Import Transactions</div>
                  <div className="text-slate-400 text-xs">Import from CSV file with smart mapping</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className={`
        rounded-xl border backdrop-blur-sm overflow-hidden
        ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}
      `}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`
              ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100/50'}
            `}>
              <tr>
                <th className="text-left p-4 text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left p-4 text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="text-left p-4 text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left p-4 text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-right p-4 text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-center p-4 text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center p-4 text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedTransaction(transaction);
                      setShowDetailModal(true);
                    }}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Calendar size={14} />
                        {formatDate(transaction.date)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-white font-medium">
                        {transaction.description}
                      </div>
                      {transaction.line_items && transaction.line_items.length > 1 && (
                        <div className="text-xs text-slate-400 mt-1">
                          {transaction.line_items.length} line items
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`
                        px-2 py-1 rounded-full text-xs font-medium
                        ${transaction.type === 'deposit' || transaction.type === 'income'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-red-900/30 text-red-400'}
                      `}>
                        {transaction.type === 'deposit' || transaction.type === 'income' ? 'Income' : 'Expense'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                        {transaction.category_name}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-medium ${
                        transaction.type === 'deposit' || transaction.type === 'income' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {transaction.type === 'deposit' || transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`
                        px-2 py-1 rounded-full text-xs font-medium
                        ${(transaction.payment_status === 'paid' || transaction.payment_status === 'completed')
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-amber-900/30 text-amber-400'}
                      `}>
                        {(transaction.payment_status === 'paid' || transaction.payment_status === 'completed') ? 'Paid' : 'Awaiting Payment'}
                      </span>
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTransaction(transaction);
                            setShowDetailModal(true);
                          }}
                          className="p-2 text-slate-400 hover:text-white transition-colors"
                          title="View/Edit transaction"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(transaction.id);
                          }}
                          className="p-2 text-red-400 hover:text-red-300 transition-colors"
                          title="Delete transaction"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Transaction Modal */}
      {showNewTransactionModal && (
        <NewTransactionModal
          isOpen={showNewTransactionModal}
          onClose={() => setShowNewTransactionModal(false)}
          darkMode={darkMode}
          onSuccess={() => {
            setShowNewTransactionModal(false);
            loadTransactions();
          }}
        />
      )}

      {/* Transaction Detail Modal */}
      {showDetailModal && selectedTransaction && (
        <TransactionDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedTransaction(null);
          }}
          darkMode={darkMode}
          transaction={selectedTransaction}
          onUpdate={() => {
            loadTransactions();
          }}
          associationId={associationId}
          associationType={associationType}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setTransactionToDelete(null);
        }}
        onConfirm={handleDeleteTransaction}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      {/* Category Creation Modal */}
      <CategoryCreationModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onCategoryCreated={() => {
          loadCategories();
          setShowCategoryModal(false);
        }}
        darkMode={darkMode}
        associationId={associationId}
        associationType={associationType}
      />

      {/* Transaction Import Modal */}
      <TransactionImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          setShowImportModal(false);
          loadTransactions();
        }}
        darkMode={darkMode}
        clubId={!isAssociation ? currentClub?.clubId : undefined}
        associationId={associationId}
        associationType={associationType}
      />
    </div>
  );
};
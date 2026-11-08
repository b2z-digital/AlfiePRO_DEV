import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, CreditCard as Edit, Trash2, DollarSign, TrendingUp, TrendingDown, ChevronDown, FileText, Minus, Upload, Tag, Check, Receipt, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { NewTransactionModal } from './NewTransactionModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { removeAllAttachmentFiles } from '../../utils/financeAttachments';
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
  tax_amount?: number | null;
  tax_rate_id?: string | null;
  tax_type?: 'none' | 'included' | 'excluded' | null;
  approval_status?: 'not_required' | 'pending' | 'approved' | 'declined' | null;
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
}> = ({ icon, value, label, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, minWidth: 0 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      minWidth: Math.max(rect.width, 220),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onScroll = () => updatePosition();
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="a-pick"
      >
        <span className="a-mute flex">{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth, zIndex: 9999 }}
          className="a-pop"
          role="listbox"
        >
          <div className="p-1.5 max-h-[280px] overflow-y-auto overscroll-contain flex flex-col gap-0.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onChange(opt.value);
                  if (opt.value !== '__add_category__') setOpen(false);
                }}
                className={`a-pop-item ${opt.className || ''} ${value === opt.value ? 'a-pop-item-on' : ''}`}
              >
                {opt.icon && <span>{opt.icon}</span>}
                <span className="flex-1">{opt.label}</span>
                {value === opt.value && <Check size={14} className="a-txt-b" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
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
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHeaderSlot(document.getElementById('alfie-page-actions')); }, []);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const loadedOnceRef = useRef(false);

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
      loadedOnceRef.current = false; // a different club or association: show the loader again
      loadTransactions();
      loadCategories();
    } else {
      console.log('FinancesTransactions: No association or club, setting loading to false');
      setLoading(false);
    }
  }, [currentClub?.clubId, associationId, associationType]);

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
            approval_status,
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
        loadedOnceRef.current = true;
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
          tax_amount,
          tax_rate_id,
          tax_type,
          approval_status,
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
          tax_amount: transaction.tax_amount,
          tax_rate_id: transaction.tax_rate_id,
          tax_type: transaction.tax_type,
          approval_status: transaction.approval_status,
          line_items: lineItems,
          linked_entity_type: transaction.linked_entity_type,
          linked_entity_id: transaction.linked_entity_id
        };
      }) || [];

      setTransactions(processedTransactions);
      loadedOnceRef.current = true;
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
      // Files first: their rows go with the transaction, and then the paths are gone
      await removeAllAttachmentFiles(tableName, transactionToDelete);
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


  // Only the first load replaces the page; later refreshes (after an edit or a
  // status change) keep the list and any open transaction sheet on screen
  if (loading && !loadedOnceRef.current) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#0A84FF]"></div>
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

  const isInc = (t: Transaction) => t.type === 'deposit' || t.type === 'income';
  const isPaid = (t: Transaction) => t.payment_status === 'paid' || t.payment_status === 'completed';
  const months: { key: string; label: string; items: Transaction[]; net: number }[] = [];
  filteredTransactions.forEach((t) => {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = months.find((m) => m.key === key);
    if (!g) { g = { key, label: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), items: [], net: 0 }; months.push(g); }
    g.items.push(t);
    g.net += isInc(t) ? Math.abs(t.amount) : -Math.abs(t.amount);
  });
  const TX_COLS = '44px 36px minmax(0,1fr) minmax(0,210px) 80px 120px 84px';
  const newTxButton = (
    <div className="relative inline-flex" ref={dropdownRef}>
      <button onClick={() => setShowNewTransactionModal(true)} className="a-btn a-btn-p" style={{ height: 42, borderRadius: '13px 0 0 13px', paddingRight: 14 }}>
        <Plus size={16} />New transaction
      </button>
      <button onClick={() => setShowDropdown(!showDropdown)} className="a-btn a-btn-p" aria-label="More transaction types" aria-haspopup="menu" aria-expanded={showDropdown} style={{ height: 42, borderRadius: '0 13px 13px 0', padding: '0 10px', borderLeft: '1px solid rgba(255,255,255,0.25)' }}>
        <ChevronDown size={16} />
      </button>
      {showDropdown && (
        <div className="a-pop absolute right-0 top-full mt-2 w-72 z-50 p-1.5 flex flex-col gap-0.5" role="menu">
          {([
            ['invoice', <FileText size={16} />, 'New invoice', 'Create an invoice for services or products'],
            ['deposit', <Plus size={16} />, 'New deposit', 'Record incoming money or payments'],
            ['expense', <Minus size={16} />, 'New expense', 'Record money spent or outgoing payments'],
          ] as const).map(([k, icon, title, desc]) => (
            <button key={k} role="menuitem" onClick={() => handleTransactionTypeClick(k)} className="a-pop-item" style={{ alignItems: 'flex-start', padding: 10 }}>
              <span className="a-tile a-tile-sm" style={{ width: 32, height: 32 }}>{icon}</span>
              <span className="flex-1 min-w-0"><span className="block a-ink font-semibold text-[13.5px]">{title}</span><span className="block a-dim text-xs mt-0.5">{desc}</span></span>
            </button>
          ))}
          <div className="a-pop-rule" />
          <button role="menuitem" onClick={() => { setShowImportModal(true); setShowDropdown(false); }} className="a-pop-item" style={{ alignItems: 'flex-start', padding: 10 }}>
            <span className="a-tile a-tile-sm" style={{ width: 32, height: 32 }}><Upload size={16} /></span>
            <span className="flex-1 min-w-0"><span className="block a-ink font-semibold text-[13.5px]">Import transactions</span><span className="block a-dim text-xs mt-0.5">Import from CSV file with smart mapping</span></span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-[22px]">
      {headerSlot ? createPortal(newTxButton, headerSlot) : <div className="flex justify-end">{newTxButton}</div>}

      <div className="a-card grid grid-cols-1 md:grid-cols-3">
        {([
          ['Total income', <TrendingUp size={19} />, formatCurrency(totalIncome), 'a-txt-g'],
          ['Total expenses', <TrendingDown size={19} />, formatCurrency(totalExpenses), 'a-txt-r'],
          ['Net amount', <DollarSign size={19} />, `${netAmount < 0 ? '−' : ''}${formatCurrency(Math.abs(netAmount))}`, netAmount < 0 ? 'a-txt-r' : 'a-ink'],
        ] as const).map(([label, icon, value, tone], i) => (
          <div key={label} className={`flex items-center gap-3.5 ${i > 0 ? 'a-split' : ''}`} style={{ padding: '18px 22px' }}>
            <span className="a-tile">{icon}</span>
            <div><p className="a-cap">{label}</p><div className={`a-big mt-1.5 ${tone}`} style={{ fontSize: 28 }}>{value}</div></div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="a-field flex-1 min-w-[220px]">
          <Search size={17} />
          <span className="sr-only">Search transactions</span>
          <input type="text" placeholder="Search transactions" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </label>
        <div className="a-seg" role="tablist" aria-label="Type">
          <button role="tab" aria-selected={typeFilter === 'all'} onClick={() => setTypeFilter('all')} className={`a-seg-i ${typeFilter === 'all' ? 'a-seg-on' : ''}`}>All</button>
          <button role="tab" aria-selected={typeFilter === 'deposit'} onClick={() => setTypeFilter('deposit')} className={`a-seg-i ${typeFilter === 'deposit' ? 'a-seg-on' : ''}`}><span className="a-light" style={{ background: '#30D158', boxShadow: 'none' }} />Income</button>
          <button role="tab" aria-selected={typeFilter === 'expense'} onClick={() => setTypeFilter('expense')} className={`a-seg-i ${typeFilter === 'expense' ? 'a-seg-on' : ''}`}><span className="a-light" style={{ background: '#FF6B6B', boxShadow: 'none' }} />Expense</button>
        </div>
        <CustomDropdown
          darkMode={darkMode}
          icon={<Tag size={16} />}
          value={categoryFilter}
          label={categoryFilter === 'all' ? 'All categories' : categories.find(c => c.id === categoryFilter)?.name || 'All categories'}
          options={[
            { value: 'all', label: 'All categories' },
            ...categories.map(c => ({ value: c.id, label: c.name })),
            { value: '__add_category__', label: '+ Add category', className: 'a-link-item' },
          ]}
          onChange={(val) => {
            if (val === '__add_category__') setShowCategoryModal(true);
            else setCategoryFilter(val);
          }}
        />
      </div>

      <div className="a-card overflow-hidden">
        {months.length === 0 ? (
          <div className="a-empty py-12 px-6">
            <span className="a-tile" style={{ width: 56, height: 56 }}><Receipt size={24} /></span>
            <div className="a-display a-ink text-lg font-semibold">No transactions found</div>
            <p className="a-mute m-0 text-sm">{searchTerm || typeFilter !== 'all' || categoryFilter !== 'all' ? 'Try a different search or filter.' : 'Add a transaction to get started.'}</p>
          </div>
        ) : months.map((m, mi) => (
          <React.Fragment key={m.key}>
            {mi > 0 && <div className="a-month-rule" />}
            <div className="a-mhead">
              <span className="a-display a-ink text-[15px] font-semibold">{m.label}</span>
              <span className="a-cnt">{m.items.length}</span>
              <div className="flex-1" />
              <span className="a-dim text-[12.5px]">Net</span>
              <span className={`a-num text-sm font-semibold ${m.net < 0 ? 'a-txt-r' : 'a-txt-g'}`}>{m.net < 0 ? '−' : '+'}{formatCurrency(Math.abs(m.net))}</span>
            </div>
            {m.items.map((t) => {
              const d = new Date(t.date);
              const inc = isInc(t);
              const open = () => { setSelectedTransaction(t); setShowDetailModal(true); };
              return (
                <div key={t.id} className="a-tx" style={{ gridTemplateColumns: TX_COLS, cursor: 'pointer' }} onClick={open}>
                  <div className="a-chip-d"><b>{d.getDate()}</b><i>{d.toLocaleDateString('en-AU', { weekday: 'short' })}</i></div>
                  <span className={`a-tile a-tile-sm ${inc ? 'a-txt-g' : 'a-txt-r'}`}>{inc ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</span>
                  <div className="min-w-0">
                    <div className="a-ink text-[14.5px] font-medium truncate">{t.description}</div>
                    {t.line_items && t.line_items.length > 1 && <div className="a-dim text-xs mt-0.5">{t.line_items.length} line items</div>}
                  </div>
                  {t.category_name
                    ? <span className="a-lb-fmt justify-self-start max-w-full"><span className="a-light" style={{ background: inc ? '#30D158' : '#FF6B6B', boxShadow: 'none' }} /><span className="truncate">{t.category_name}</span></span>
                    : <span />}
                  {!isPaid(t) && t.approval_status === 'pending'
                    ? <span className="a-st text-[12.5px]" title="Waiting for approval"><span className="a-light a-light-b" />For approval</span>
                    : !isPaid(t) && t.approval_status === 'declined'
                      ? <span className="a-st text-[12.5px]" title="Approval declined"><span className="a-light a-light-r" />Declined</span>
                      : <span className="a-st text-[12.5px]"><span className={`a-light ${isPaid(t) ? 'a-light-g' : 'a-light-a'}`} />{isPaid(t) ? 'Paid' : 'Awaiting'}</span>}
                  <span className={`a-num text-right text-[15.5px] font-semibold ${inc ? 'a-txt-g' : 'a-txt-r'}`}>{inc ? '+' : '−'}{formatCurrency(t.amount)}</span>
                  <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={open} className="a-ib" aria-label="View or edit" title="View or edit"><Edit size={16} /></button>
                    <button onClick={() => handleDeleteClick(t.id)} className="a-ib a-ib-d" aria-label="Delete" title="Delete"><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* New Transaction Modal */}
      {showNewTransactionModal && (
        <NewTransactionModal
          isOpen={showNewTransactionModal}
          onClose={() => setShowNewTransactionModal(false)}
          darkMode={darkMode}
          onImport={() => setShowImportModal(true)}
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
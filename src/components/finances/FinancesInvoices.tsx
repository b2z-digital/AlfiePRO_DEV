import React, { useState, useEffect } from 'react';
import { Plus, Search, Download, CreditCard as Edit, Trash2, Send, FileText, Receipt, TrendingUp, Calendar, ChevronDown, DollarSign, CircleCheck as CheckCircle, Clock } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../utils/supabase';
import { InvoiceCreationPage } from './InvoiceCreationPage';
import { ExpenseCreationPage } from './ExpenseCreationPage';
import { DepositCreationPage } from './DepositCreationPage';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { ConfirmationModal } from '../ConfirmationModal';
import { InvoiceEmailModal } from './InvoiceEmailModal';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  date: string;
  due_date?: string;
  reference?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
}

interface Transaction {
  id: string;
  type: 'deposit' | 'expense';
  description: string;
  amount: number;
  date: string;
  category_id?: string;
  payer?: string;
  payee?: string;
  reference?: string;
  payment_method?: string;
  payment_status?: string;
  expense_number?: string;
  transaction_reference?: string;
}

interface FinancesInvoicesProps {
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const FinancesInvoices: React.FC<FinancesInvoicesProps> = ({ darkMode, associationId, associationType }) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const { addNotification } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'invoices' | 'expenses' | 'deposits'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('This Financial Year');
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCreateExpense, setShowCreateExpense] = useState(false);
  const [showCreateDeposit, setShowCreateDeposit] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [showDeleteTransactionConfirm, setShowDeleteTransactionConfirm] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [showInvoiceEmailModal, setShowInvoiceEmailModal] = useState(false);
  const [invoiceToEmail, setInvoiceToEmail] = useState<Invoice | null>(null);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (isAssociation || currentClub?.clubId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [currentClub, activeTab, associationId, associationType]);

  // Initialize to current financial year
  useEffect(() => {
    setQuickFilter('This Financial Year');
  }, []);

  // Handle query parameters for creating transactions
  useEffect(() => {
    const action = searchParams.get('action');
    const type = searchParams.get('type');

    if (action === 'create' && type) {
      // Clear the query parameters
      setSearchParams({});

      // Trigger the appropriate create action
      if (type === 'invoice') {
        setActiveTab('invoices');
        setEditingInvoice(null);
        setCurrentView('create');
      } else if (type === 'deposit') {
        setActiveTab('deposits');
        setShowCreateDeposit(true);
      } else if (type === 'expense') {
        setActiveTab('expenses');
        setShowCreateExpense(true);
      }
    }
  }, [searchParams, setSearchParams]);

  const loadData = async () => {
    if (!isAssociation && !currentClub?.clubId) return;

    try {
      setLoading(true);
      setError(null);

      // Load invoices from invoices table
      if (isAssociation) {
        const { data: invoicesData, error: invoicesError } = await supabase
          .from('association_invoices')
          .select(`
            id,
            invoice_number,
            customer_name,
            customer_email,
            date,
            due_date,
            reference,
            subtotal,
            tax_amount,
            total_amount,
            status,
            created_at
          `)
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .order('date', { ascending: false });

        if (invoicesError) throw invoicesError;
        setInvoices(invoicesData || []);

        // Load transactions (expenses and deposits)
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
            created_at,
            association_budget_categories (
              name
            )
          `)
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .order('date', { ascending: false });

        if (transactionsError) throw transactionsError;
        setTransactions(transactionsData || []);
      } else {
        const { data: invoicesData, error: invoicesError } = await supabase
          .from('invoices')
          .select(`
            id,
            invoice_number,
            customer_name,
            customer_email,
            date,
            due_date,
            reference,
            subtotal,
            tax_amount,
            total_amount,
            status,
            created_at
          `)
          .eq('club_id', currentClub.clubId)
          .order('date', { ascending: false });

        if (invoicesError) throw invoicesError;
        setInvoices(invoicesData || []);

        // Load transactions (expenses and deposits)
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
            expense_number,
            transaction_reference,
            created_at,
            budget_categories (
              name
            )
          `)
          .eq('club_id', currentClub.clubId)
          .order('date', { ascending: false});

        if (transactionsError) throw transactionsError;
        setTransactions(transactionsData || []);
      }

    } catch (err) {
      console.error('Error loading financial data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCreateInvoice = () => {
    setEditingInvoice(null);
    setCurrentView('create');
  };

  const handleCreateExpense = () => {
    setShowCreateExpense(true);
  };

  const handleCreateDeposit = () => {
    setShowCreateDeposit(true);
  };

  const handleEditExpense = (expense: Transaction) => {
    setEditingTransaction(expense);
    setShowCreateExpense(true);
  };

  const handleEditDeposit = (deposit: Transaction) => {
    setEditingTransaction(deposit);
    setShowCreateDeposit(true);
  };

  const handleDeleteTransactionClick = (transaction: Transaction) => {
    setTransactionToDelete(transaction);
    setShowDeleteTransactionConfirm(true);
  };

  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return;

    try {
      const tableName = isAssociation ? 'association_transactions' : 'transactions';
      let query = supabase
        .from(tableName)
        .delete()
        .eq('id', transactionToDelete.id);

      if (isAssociation) {
        query = query.eq('association_id', associationId).eq('association_type', associationType);
      } else {
        query = query.eq('club_id', currentClub?.clubId);
      }

      const { error } = await query;

      if (error) throw error;

      addNotification('success', `${transactionToDelete.type === 'expense' ? 'Expense' : 'Deposit'} deleted successfully`);
      await loadData();
      setShowDeleteTransactionConfirm(false);
      setTransactionToDelete(null);
    } catch (err) {
      console.error('Error deleting transaction:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to delete transaction');
      setShowDeleteTransactionConfirm(false);
      setTransactionToDelete(null);
    }
  };

  const handleInvoiceCreated = () => {
    setShowCreateInvoice(false);
    loadData();
  };

  const handleExpenseCreated = () => {
    setShowCreateExpense(false);
    loadData();
  };

  const handleDepositCreated = () => {
    setShowCreateDeposit(false);
    loadData();
  };

  const handleViewInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setShowPreviewModal(true);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setCurrentView('edit');
  };

  const handleDeleteClick = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete) return;

    try {
      setError(null);

      const invoiceTable = isAssociation ? 'association_invoices' : 'invoices';
      const lineItemsTable = isAssociation ? 'association_invoice_line_items' : 'invoice_line_items';

      // Delete invoice line items first (due to foreign key constraint)
      const { error: lineItemsError } = await supabase
        .from(lineItemsTable)
        .delete()
        .eq('invoice_id', invoiceToDelete.id);

      if (lineItemsError) throw lineItemsError;

      // Delete the invoice
      const { error: invoiceError } = await supabase
        .from(invoiceTable)
        .delete()
        .eq('id', invoiceToDelete.id);

      if (invoiceError) throw invoiceError;

      // Refresh the invoices list
      addNotification('success', 'Invoice deleted successfully');
      await loadData();

      setShowDeleteConfirm(false);
      setInvoiceToDelete(null);
    } catch (err) {
      console.error('Error deleting invoice:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to delete invoice');
    }
  };

  const handleSendInvoice = (invoice: Invoice) => {
    setInvoiceToEmail(invoice);
    setShowInvoiceEmailModal(true);
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setEditingInvoice(null);
    loadData(); // Refresh the list
  };

  const handleCreateNew = () => {
    if (activeTab === 'invoices') {
      setEditingInvoice(null);
      setCurrentView('create');
    } else if (activeTab === 'expenses') {
      setShowCreateExpense(true);
    } else if (activeTab === 'deposits') {
      setShowCreateDeposit(true);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };


  const handleExportCSV = () => {
    let data: any[] = [];
    let filename = '';
    let headers: string[] = [];

    if (activeTab === 'invoices') {
      headers = ['Invoice #', 'Customer', 'Email', 'Description', 'Date', 'Due Date', 'Status', 'Amount'];
      data = filteredInvoices.map(inv => [
        inv.invoice_number,
        inv.customer_name,
        inv.customer_email || '',
        inv.reference || '',
        new Date(inv.date).toLocaleDateString(),
        inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '',
        inv.status,
        parseFloat(inv.total_amount).toFixed(2)
      ]);
      filename = `invoices_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'expenses') {
      headers = ['Expense #', 'Description', 'Category', 'Payee', 'Date', 'Amount', 'Status'];
      data = filteredExpenses.map(exp => [
        exp.expense_number || `EXP-${exp.id.slice(-6).toUpperCase()}`,
        exp.description,
        exp.budget_categories?.name || '',
        exp.payee || '',
        new Date(exp.date).toLocaleDateString(),
        parseFloat(exp.amount).toFixed(2),
        exp.payment_status || ''
      ]);
      filename = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'deposits') {
      headers = ['Deposit #', 'Description', 'Category', 'Payer', 'Date', 'Amount'];
      data = filteredDeposits.map(dep => [
        dep.transaction_reference || `DEP-${dep.id.slice(-6).toUpperCase()}`,
        dep.description,
        dep.budget_categories?.name || '',
        dep.payer || '',
        new Date(dep.date).toLocaleDateString(),
        parseFloat(dep.amount).toFixed(2)
      ]);
      filename = `deposits_${new Date().toISOString().split('T')[0]}.csv`;
    }

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...data.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addNotification('success', `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} exported successfully`);
  };

  const setQuickFilter = (filter: string) => {
    const today = new Date();
    let from = '';
    let to = today.toISOString().split('T')[0];

    switch (filter) {
      case 'This Financial Year':
        // July 1st of current year to June 30th next year
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const fyStart = currentMonth >= 6 ? currentYear : currentYear - 1;
        from = `${fyStart}-07-01`;
        to = `${fyStart + 1}-06-30`;
        break;
      case 'Last Financial Year':
        const prevFyStart = today.getMonth() >= 6 ? today.getFullYear() - 1 : today.getFullYear() - 2;
        from = `${prevFyStart}-07-01`;
        to = `${prevFyStart + 1}-06-30`;
        break;
      case 'This Month':
        from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        to = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
        break;
      case 'Last Month':
        from = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
        to = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
        break;
      case 'This Quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        from = new Date(today.getFullYear(), quarter * 3, 1).toISOString().split('T')[0];
        to = new Date(today.getFullYear(), (quarter + 1) * 3, 0).toISOString().split('T')[0];
        break;
      case 'This Year':
        from = `${today.getFullYear()}-01-01`;
        to = `${today.getFullYear()}-12-31`;
        break;
      case 'All Time':
        from = '';
        to = '';
        break;
    }

    setDateFrom(from);
    setDateTo(to);
    setFilterPeriod(filter);
    setShowDateFilter(false);
  };

  // Filter and search logic
  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = searchTerm === '' ||
      invoice.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.reference?.toLowerCase().includes(searchTerm.toLowerCase());

    // Date filtering
    const invoiceDate = new Date(invoice.date);
    const matchesDateFrom = !dateFrom || invoiceDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || invoiceDate <= new Date(dateTo);

    return matchesSearch && matchesDateFrom && matchesDateTo;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredExpenses = transactions
    .filter(transaction => transaction.type === 'expense')
    .filter(expense => {
      const matchesSearch = searchTerm === '' ||
        expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.payee?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.expense_number?.toLowerCase().includes(searchTerm.toLowerCase());

      // Date filtering
      const expenseDate = new Date(expense.date);
      const matchesDateFrom = !dateFrom || expenseDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || expenseDate <= new Date(dateTo);

      return matchesSearch && matchesDateFrom && matchesDateTo;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredDeposits = transactions
    .filter(transaction => transaction.type === 'income')
    .filter(deposit => {
      const matchesSearch = searchTerm === '' ||
        deposit.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposit.payer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposit.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposit.transaction_reference?.toLowerCase().includes(searchTerm.toLowerCase());

      // Date filtering
      const depositDate = new Date(deposit.date);
      const matchesDateFrom = !dateFrom || depositDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || depositDate <= new Date(dateTo);

      return matchesSearch && matchesDateFrom && matchesDateTo;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate statistics based on active tab
  const getTabStatistics = () => {
    switch (activeTab) {
      case 'invoices':
        const totalInvoices = filteredInvoices.length;
        const totalAmount = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total_amount) || 0), 0);
        const paidAmount = filteredInvoices
          .filter(inv => inv.status === 'paid')
          .reduce((sum, inv) => sum + (parseFloat(inv.total_amount) || 0), 0);
        const outstandingAmount = totalAmount - paidAmount;

        return {
          count: totalInvoices,
          total: totalAmount,
          paid: paidAmount,
          outstanding: outstandingAmount
        };

      case 'expenses':
        const totalExpenses = filteredExpenses.length;
        const totalExpenseAmount = filteredExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
        const paidExpenses = filteredExpenses
          .filter(exp => exp.payment_status === 'completed' || exp.payment_status === 'paid')
          .reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
        const pendingExpenses = totalExpenseAmount - paidExpenses;

        return {
          count: totalExpenses,
          total: totalExpenseAmount,
          paid: paidExpenses,
          outstanding: pendingExpenses
        };

      case 'deposits':
        const totalDeposits = filteredDeposits.length;
        const totalDepositAmount = filteredDeposits.reduce((sum, dep) => sum + (parseFloat(dep.amount) || 0), 0);

        return {
          count: totalDeposits,
          total: totalDepositAmount,
          paid: totalDepositAmount, // Deposits are considered "received"
          outstanding: 0
        };

      default:
        return { count: 0, total: 0, paid: 0, outstanding: 0 };
    }
  };

  const stats = getTabStatistics();

  // Show invoice creation/edit page
  if (currentView === 'create' || currentView === 'edit') {
    return (
      <InvoiceCreationPage
        darkMode={darkMode}
        onBack={handleBackToList}
        editingInvoice={editingInvoice}
        associationId={associationId}
        associationType={associationType}
      />
    );
  }

  if (showCreateExpense) {
    return (
      <ExpenseCreationPage
        darkMode={darkMode}
        onBack={() => {
          setShowCreateExpense(false);
          setEditingTransaction(null);
        }}
        onExpenseCreated={handleExpenseCreated}
        editingExpense={editingTransaction}
        associationId={associationId}
        associationType={associationType}
      />
    );
  }

  if (showCreateDeposit) {
    return (
      <DepositCreationPage
        darkMode={darkMode}
        onBack={() => {
          setShowCreateDeposit(false);
          setEditingTransaction(null);
        }}
        onDepositCreated={handleDepositCreated}
        editingDeposit={editingTransaction}
        associationId={associationId}
        associationType={associationType}
      />
    );
  }

  const COLS = '120px minmax(0,1fr) minmax(0,230px) 108px 100px 92px 120px';
  const shortDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const statusTone = (s?: string) => (s === 'paid' || s === 'completed' ? 'a-light-g' : s === 'overdue' ? 'a-light-r' : s === 'sent' ? 'a-light-b' : s ? 'a-light-a' : '');
  const statusText = (s?: string) => (s ? (s === 'awaiting_payment' ? 'Awaiting' : s.charAt(0).toUpperCase() + s.slice(1)) : '—');
  const Code = ({ children }: { children: React.ReactNode }) => <span className="a-mono a-code justify-self-start">{children}</span>;
  const Cat = ({ name, tone }: { name?: string; tone: string }) => (name ? <span className="a-st a-dim text-xs mt-1"><span className="a-light" style={{ background: tone, width: 6, height: 6, boxShadow: 'none' }} />{name}</span> : null);
  const Empty = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <div className="a-empty py-12 px-6">
      <span className="a-tile" style={{ width: 56, height: 56 }}>{icon}</span>
      <div className="a-display a-ink text-lg font-semibold">No {label} found</div>
      <p className="a-mute m-0 text-sm">Try a different search or period.</p>
    </div>
  );
  const Head = ({ first, who }: { first: string; who: string }) => (
    <div className="a-tx a-thead" style={{ gridTemplateColumns: COLS, cursor: 'default', paddingTop: 12, paddingBottom: 12 }}>
      <p className="a-cap">{first}</p><p className="a-cap">Description</p><p className="a-cap">{who}</p><p className="a-cap">Date</p><p className="a-cap text-right">Amount</p><p className="a-cap">Status</p><span />
    </div>
  );

  const renderTabContent = () => {
    if (activeTab === 'invoices') {
      if (filteredInvoices.length === 0) return <Empty icon={<FileText size={24} />} label="invoices" />;
      return (
        <div className="overflow-x-auto"><div className="min-w-[960px]">
          <Head first="Invoice" who="Contact" />
          {filteredInvoices.map((invoice) => (
            <div key={invoice.id} className="a-tx" style={{ gridTemplateColumns: COLS, cursor: 'pointer' }} onClick={() => handleEditInvoice(invoice)}>
              <Code>{invoice.invoice_number}</Code>
              <div className="min-w-0"><div className="a-ink text-[14.5px] font-medium truncate">{invoice.reference || 'No description'}</div></div>
              <div className="min-w-0"><div className="a-mute text-[13.5px] truncate">{invoice.customer_name}</div>{invoice.customer_email && <div className="a-dim text-xs truncate">{invoice.customer_email}</div>}</div>
              <div><div className="a-mute a-num text-[13px]" style={{ letterSpacing: 0 }}>{shortDate(invoice.date)}</div>{invoice.due_date && <div className="a-dim text-[11.5px] mt-0.5">Due {shortDate(invoice.due_date)}</div>}</div>
              <span className="a-num a-ink text-right text-[15px] font-semibold">{formatCurrency(parseFloat(invoice.total_amount))}</span>
              <span className="a-st text-[12.5px]"><span className={`a-light ${statusTone(invoice.status)}`} />{statusText(invoice.status)}</span>
              <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleEditInvoice(invoice)} className="a-ib" aria-label="Edit invoice" title="Edit invoice"><Edit size={16} /></button>
                <button onClick={() => handleSendInvoice(invoice)} className="a-ib" aria-label="Send by email" title="Send by email"><Send size={16} /></button>
                <button onClick={() => handleDeleteClick(invoice)} className="a-ib a-ib-d" aria-label="Delete invoice" title="Delete invoice"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div></div>
      );
    }

    if (activeTab === 'expenses') {
      if (filteredExpenses.length === 0) return <Empty icon={<Receipt size={24} />} label="expenses" />;
      return (
        <div className="overflow-x-auto"><div className="min-w-[960px]">
          <Head first="Expense" who="Payee" />
          {filteredExpenses.map((expense) => (
            <div key={expense.id} className="a-tx" style={{ gridTemplateColumns: COLS, cursor: 'pointer' }} onClick={() => handleEditExpense(expense)}>
              <Code>{expense.expense_number || `EXP-${expense.id.slice(-6).toUpperCase()}`}</Code>
              <div className="min-w-0"><div className="a-ink text-[14.5px] font-medium truncate">{expense.description}</div><Cat name={expense.budget_categories?.name} tone="#FF6B6B" /></div>
              <span className="a-mute text-[13.5px] truncate">{expense.payee || '—'}</span>
              <span className="a-mute a-num text-[13px]" style={{ letterSpacing: 0 }}>{shortDate(expense.date)}</span>
              <span className="a-num a-ink text-right text-[15px] font-semibold">{formatCurrency(parseFloat(expense.amount))}</span>
              {(expense as any).approval_status === 'pending' && !['paid', 'completed'].includes(expense.payment_status)
                ? <span className="a-st text-[12.5px]" title="Waiting for approval"><span className="a-light a-light-b" />For approval</span>
                : (expense as any).approval_status === 'declined' && !['paid', 'completed'].includes(expense.payment_status)
                  ? <span className="a-st text-[12.5px]" title="Approval declined"><span className="a-light a-light-r" />Declined</span>
                  : <span className="a-st text-[12.5px]"><span className={`a-light ${statusTone(expense.payment_status)}`} />{statusText(expense.payment_status)}</span>}
              <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleEditExpense(expense)} className="a-ib" aria-label="Edit expense" title="Edit expense"><Edit size={16} /></button>
                <button onClick={() => handleDeleteTransactionClick(expense)} className="a-ib a-ib-d" aria-label="Delete expense" title="Delete expense"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div></div>
      );
    }

    if (activeTab === 'deposits') {
      if (filteredDeposits.length === 0) return <Empty icon={<TrendingUp size={24} />} label="deposits" />;
      return (
        <div className="overflow-x-auto"><div className="min-w-[960px]">
          <Head first="Deposit" who="Payer" />
          {filteredDeposits.map((deposit) => (
            <div key={deposit.id} className="a-tx" style={{ gridTemplateColumns: COLS, cursor: 'pointer' }} onClick={() => handleEditDeposit(deposit)}>
              <Code>{deposit.transaction_reference || `DEP-${deposit.id.slice(-6).toUpperCase()}`}</Code>
              <div className="min-w-0"><div className="a-ink text-[14.5px] font-medium truncate">{deposit.description}</div><Cat name={deposit.budget_categories?.name} tone="#30D158" /></div>
              <span className="a-mute text-[13.5px] truncate">{deposit.payer || '—'}</span>
              <span className="a-mute a-num text-[13px]" style={{ letterSpacing: 0 }}>{shortDate(deposit.date)}</span>
              <span className="a-num a-txt-g text-right text-[15px] font-semibold">{formatCurrency(parseFloat(deposit.amount))}</span>
              <span className="a-st text-[12.5px]"><span className={`a-light ${statusTone(deposit.payment_status) || 'a-light-g'}`} />{deposit.payment_status ? statusText(deposit.payment_status) : 'Received'}</span>
              <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleEditDeposit(deposit)} className="a-ib" aria-label="Edit deposit" title="Edit deposit"><Edit size={16} /></button>
                <button onClick={() => handleDeleteTransactionClick(deposit)} className="a-ib a-ib-d" aria-label="Delete deposit" title="Delete deposit"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div></div>
      );
    }
    return null;
  };

  const tabLabel = activeTab === 'invoices' ? 'Invoices' : activeTab === 'expenses' ? 'Expenses' : 'Deposits';
  const tabCount = activeTab === 'invoices' ? filteredInvoices.length : activeTab === 'expenses' ? filteredExpenses.length : filteredDeposits.length;
  const Stat = ({ label, icon, value, sub, tone = 'a-ink' }: { label: string; icon: React.ReactNode; value: React.ReactNode; sub: string; tone?: string }) => (
    <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
      <div className="flex items-center justify-between"><p className="a-cap">{label}</p><span className="a-tile a-tile-sm">{icon}</span></div>
      <div><div className={`a-big ${tone}`} style={{ fontSize: 30 }}>{value}</div><div className="a-mute mt-[7px] text-[12.5px]">{sub}</div></div>
    </div>
  );

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="a-seg" role="tablist" aria-label="Documents">
          {([['invoices', <FileText size={16} />, 'Invoices'], ['expenses', <Receipt size={16} />, 'Expenses'], ['deposits', <TrendingUp size={16} />, 'Deposits']] as const).map(([k, icon, label]) => (
            <button key={k} role="tab" aria-selected={activeTab === k} onClick={() => setActiveTab(k)} className={`a-seg-i ${activeTab === k ? 'a-seg-on' : ''}`}>
              {icon}{label}{activeTab === k && tabCount > 0 && <span className="a-cnt">{tabCount}</span>}
            </button>
          ))}
        </div>
        <label className="a-field flex-1 min-w-[200px]">
          <Search size={17} />
          <span className="sr-only">Search {activeTab}</span>
          <input type="text" placeholder={`Search ${activeTab}`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </label>
        <div className="relative">
          <button onClick={() => setShowDateFilter(!showDateFilter)} className="a-pick" aria-haspopup="menu" aria-expanded={showDateFilter}>
            <Calendar size={16} /><span>{filterPeriod}</span><ChevronDown size={15} />
          </button>
          {showDateFilter && (
            <div className="a-pop absolute top-full mt-2 right-0 z-50 min-w-[280px] p-1.5" role="menu">
              {['This Financial Year', 'Last Financial Year', 'This Month', 'Last Month', 'This Quarter', 'This Year', 'All Time'].map((p) => (
                <button key={p} role="menuitem" onClick={() => setQuickFilter(p)} className={`a-pop-item ${filterPeriod === p ? 'a-pop-item-on' : ''}`}>{p}</button>
              ))}
              <div className="a-pop-rule" />
              <p className="a-cap px-2.5 pt-1.5 pb-2">Custom range</p>
              <div className="px-2.5 pb-2 grid grid-cols-2 gap-2">
                <label><span className="sr-only">From</span><input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setFilterPeriod('Custom'); }} className="a-inp a-inp-date" style={{ height: 38, fontSize: 13 }} /></label>
                <label><span className="sr-only">To</span><input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setFilterPeriod('Custom'); }} className="a-inp a-inp-date" style={{ height: 38, fontSize: 13 }} /></label>
              </div>
            </div>
          )}
        </div>
        <button onClick={handleExportCSV} className="a-btn"><Download size={16} />Export CSV</button>
        <button onClick={handleCreateNew} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}>
          <Plus size={16} />New {activeTab === 'invoices' ? 'invoice' : activeTab === 'expenses' ? 'expense' : 'deposit'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label={tabLabel} icon={activeTab === 'invoices' ? <FileText size={17} /> : activeTab === 'expenses' ? <Receipt size={17} /> : <TrendingUp size={17} />} value={stats.count} sub={filterPeriod === 'Custom' ? 'Custom range' : filterPeriod} />
        <Stat label="Total amount" icon={<DollarSign size={17} />} value={formatCurrency(stats.total)} sub={activeTab === 'invoices' ? 'Across all contacts' : activeTab === 'expenses' ? 'Across all payees' : 'Across all payers'} />
        <Stat label="Paid" icon={<CheckCircle size={17} />} value={formatCurrency(stats.paid)} sub={stats.outstanding > 0 ? 'Settled so far' : 'All settled'} tone="a-txt-g" />
        <Stat label={activeTab === 'invoices' ? 'Outstanding' : 'Pending'} icon={<Clock size={17} />} value={formatCurrency(stats.outstanding)} sub={stats.outstanding > 0 ? 'Awaiting payment' : 'Nothing outstanding'} tone={stats.outstanding > 0 ? 'a-txt-a' : 'a-ink'} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#0A84FF]"></div>
        </div>
      ) : error ? (
        <div className="a-card p-6 a-txt-r text-sm">Error: {error}</div>
      ) : (
        <div className="a-card overflow-hidden">{renderTabContent()}</div>
      )}

      {/* Preview Modal - Removed for now as it requires refactoring */}

      {/* Invoice Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setInvoiceToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice ${invoiceToDelete?.invoice_number}? This will permanently remove the invoice and all its line items.`}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      {/* Transaction Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteTransactionConfirm}
        onClose={() => {
          setShowDeleteTransactionConfirm(false);
          setTransactionToDelete(null);
        }}
        onConfirm={handleDeleteTransaction}
        title={`Delete ${transactionToDelete?.type === 'expense' ? 'Expense' : 'Deposit'}`}
        message={`Are you sure you want to delete this ${transactionToDelete?.type}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      {/* Invoice Email Modal */}
      {invoiceToEmail && (
        <InvoiceEmailModal
          invoice={invoiceToEmail}
          isOpen={showInvoiceEmailModal}
          onClose={() => {
            setShowInvoiceEmailModal(false);
            setInvoiceToEmail(null);
            loadData();
          }}
          darkMode={darkMode}
          associationId={associationId}
          associationType={associationType}
        />
      )}
    </div>
  );
};

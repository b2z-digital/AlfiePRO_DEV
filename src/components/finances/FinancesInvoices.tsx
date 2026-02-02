import React, { useState, useEffect } from 'react';
import { Plus, Search, Download, Edit, Trash2, Send, FileText, Receipt, TrendingDown, TrendingUp, AlertTriangle, ArrowLeft, Calendar, X } from 'lucide-react';
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
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', transactionToDelete.id);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-900/30 text-green-400';
      case 'sent':
        return 'bg-blue-900/30 text-blue-400';
      case 'overdue':
        return 'bg-red-900/30 text-red-400';
      default:
        return 'bg-slate-700 text-slate-300';
    }
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

  const renderTabContent = () => {
    if (activeTab === 'invoices') {
      if (filteredInvoices.length === 0) {
        return (
          <div className="text-center py-12 text-slate-400">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>No invoices found</p>
          </div>
        );
      }

      return (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-slate-300">INVOICE #</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">CONTACT</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">DESCRIPTION</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">DATE</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">DUE DATE</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">STATUS</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">AMOUNT</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => handleEditInvoice(invoice)}
                >
                  <td className="py-4 px-4">
                    <span className="font-medium text-blue-400">
                      {invoice.invoice_number}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div>
                      <p className="text-white font-medium">{invoice.customer_name}</p>
                      {invoice.customer_email && (
                        <p className="text-slate-400 text-sm">{invoice.customer_email}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {invoice.reference || 'No description'}
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {new Date(invoice.date).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-white font-medium">
                    ${parseFloat(invoice.total_amount).toFixed(2)}
                  </td>
                  <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditInvoice(invoice);
                        }}
                        className="p-2 text-slate-400 hover:text-white transition-colors"
                        title="Edit invoice"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(invoice);
                        }}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                        title="Delete invoice"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendInvoice(invoice);
                        }}
                        className="p-2 text-green-400 hover:text-green-300 transition-colors"
                        title="Send invoice via email"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    
    if (activeTab === 'expenses') {
      if (filteredExpenses.length === 0) {
        return (
          <div className="text-center py-12 text-slate-400">
            <Receipt size={48} className="mx-auto mb-4 opacity-50" />
            <p>No expenses found</p>
          </div>
        );
      }

      return (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-slate-300">EXPENSE #</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">DESCRIPTION</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">PAYEE</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">DATE</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">AMOUNT</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">STATUS</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => handleEditExpense(expense)}
                >
                  <td className="py-4 px-4">
                    <span className="font-medium text-white">
                      {expense.expense_number || `EXP-${expense.id.slice(-6).toUpperCase()}`}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div>
                      <p className="text-white font-medium">{expense.description}</p>
                      {expense.budget_categories && (
                        <p className="text-slate-400 text-sm">{expense.budget_categories.name}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {expense.payee || 'N/A'}
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {new Date(expense.date).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 text-white font-medium">
                    ${parseFloat(expense.amount).toFixed(2)}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      expense.payment_status === 'completed' || expense.payment_status === 'paid'
                        ? 'bg-green-900/30 text-green-400'
                        : expense.payment_status === 'failed'
                        ? 'bg-red-900/30 text-red-400'
                        : 'bg-orange-900/30 text-orange-400'
                    }`}>
                      {expense.payment_status === 'completed' || expense.payment_status === 'paid'
                        ? 'Paid'
                        : expense.payment_status === 'failed'
                        ? 'Failed'
                        : 'Pending'}
                    </span>
                  </td>
                  <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditExpense(expense);
                        }}
                        className="p-2 text-slate-400 hover:text-white transition-colors"
                        title="Edit expense"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTransactionClick(expense);
                        }}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    
    if (activeTab === 'deposits') {
      if (filteredDeposits.length === 0) {
        return (
          <div className="text-center py-12 text-slate-400">
            <TrendingUp size={48} className="mx-auto mb-4 opacity-50" />
            <p>No deposits found</p>
          </div>
        );
      }

      return (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-slate-300">DEPOSIT #</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">DESCRIPTION</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">PAYER</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">DATE</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">AMOUNT</th>
                <th className="text-left py-3 px-4 font-medium text-slate-300">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeposits.map((deposit) => (
                <tr
                  key={deposit.id}
                  className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => handleEditDeposit(deposit)}
                >
                  <td className="py-4 px-4">
                    <span className="font-medium text-white">
                      {deposit.transaction_reference || `DEP-${deposit.id.slice(-6).toUpperCase()}`}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div>
                      <p className="text-white font-medium">{deposit.description}</p>
                      {deposit.budget_categories && (
                        <p className="text-slate-400 text-sm">{deposit.budget_categories.name}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {deposit.payer || 'N/A'}
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {new Date(deposit.date).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 text-white font-medium">
                    ${parseFloat(deposit.amount).toFixed(2)}
                  </td>
                  <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditDeposit(deposit);
                        }}
                        className="p-2 text-slate-400 hover:text-white transition-colors"
                        title="Edit deposit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTransactionClick(deposit);
                        }}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                        title="Delete deposit"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-slate-700">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'invoices'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} />
              <span>Invoices</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'expenses'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Receipt size={16} />
              <span>Expenses</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('deposits')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'deposits'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingDown size={16} />
              <span>Deposits</span>
            </div>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`
                pl-10 pr-4 py-2 rounded-lg border w-80
                ${darkMode 
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' 
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
              `}
            />
          </div>
          
          <div className="relative">
            <button
              onClick={() => setShowDateFilter(!showDateFilter)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors
                ${darkMode
                  ? 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600'
                  : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50'}
              `}
            >
              <Calendar size={16} />
              <span>{filterPeriod}</span>
            </button>

            {showDateFilter && (
              <div className="absolute top-full mt-2 right-0 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50 min-w-[280px]">
                <div className="p-2">
                  <button
                    onClick={() => setQuickFilter('This Financial Year')}
                    className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-700 text-white transition-colors"
                  >
                    This Financial Year
                  </button>
                  <button
                    onClick={() => setQuickFilter('Last Financial Year')}
                    className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-700 text-white transition-colors"
                  >
                    Last Financial Year
                  </button>
                  <button
                    onClick={() => setQuickFilter('This Month')}
                    className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-700 text-white transition-colors"
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => setQuickFilter('Last Month')}
                    className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-700 text-white transition-colors"
                  >
                    Last Month
                  </button>
                  <button
                    onClick={() => setQuickFilter('This Quarter')}
                    className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-700 text-white transition-colors"
                  >
                    This Quarter
                  </button>
                  <button
                    onClick={() => setQuickFilter('This Year')}
                    className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-700 text-white transition-colors"
                  >
                    This Year
                  </button>
                  <button
                    onClick={() => setQuickFilter('All Time')}
                    className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-700 text-white transition-colors"
                  >
                    All Time
                  </button>

                  <div className="border-t border-slate-700 mt-2 pt-2">
                    <p className="text-xs text-slate-400 px-4 mb-2">Custom Range</p>
                    <div className="px-4 py-2 space-y-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          setFilterPeriod('Custom');
                        }}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                      />
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          setFilterPeriod('Custom');
                        }}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors
              ${darkMode
                ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'}
            `}
          >
            <Download size={16} />
            Export CSV
          </button>
          
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={16} />
            New {activeTab === 'invoices' ? 'Invoice' : activeTab === 'expenses' ? 'Expense' : 'Deposit'}
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`
          p-4 rounded-lg border
          ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20">
              <FileText className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">
                Total {activeTab === 'invoices' ? 'Invoices' : activeTab === 'expenses' ? 'Expenses' : 'Deposits'}
              </p>
              <p className="text-2xl font-bold text-white">{stats.count}</p>
            </div>
          </div>
        </div>

        <div className={`
          p-4 rounded-lg border
          ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20">
              <Receipt className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">Total Amount</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(stats.total)}</p>
            </div>
          </div>
        </div>

        <div className={`
          p-4 rounded-lg border
          ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-600/20">
              <TrendingDown className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">Paid</p>
              <p className="text-2xl font-bold text-green-400">{formatCurrency(stats.paid)}</p>
            </div>
          </div>
        </div>

        <div className={`
          p-4 rounded-lg border
          ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-600/20">
              <TrendingDown className="text-orange-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-400">
                {activeTab === 'invoices' ? 'Outstanding' : 'Pending'}
              </p>
              <p className="text-2xl font-bold text-orange-400">{formatCurrency(stats.outstanding)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-400">
          <p>Error: {error}</p>
        </div>
      ) : (
        <div className={`
          rounded-lg border overflow-hidden
          ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          {renderTabContent()}
        </div>
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
            loadData(); // Refresh to update status if invoice was sent
          }}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};
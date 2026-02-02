import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Paperclip } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  currency: string;
}

interface BudgetCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
}

interface LineItem {
  description: string;
  amount: number;
  categoryId: string;
  taxRateId: string;
  taxType: 'none' | 'included' | 'excluded';
}

interface ExpenseCreationPageProps {
  darkMode: boolean;
  onBack: () => void;
  onExpenseCreated?: () => void;
  editingExpense?: any;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const ExpenseCreationPage: React.FC<ExpenseCreationPageProps> = ({
  darkMode,
  onBack,
  onExpenseCreated,
  editingExpense,
  associationId,
  associationType
}) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [payee, setPayee] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'awaiting_payment'>('paid');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'cheque' | 'bank' | 'other'>('cash');
  
  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', amount: 0, categoryId: '', taxRateId: '', taxType: 'none' }
  ]);
  
  // Data
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenseNumber, setExpenseNumber] = useState('');

  useEffect(() => {
    if (isAssociation || currentClub?.clubId) {
      loadData();
      if (!editingExpense) {
        generateExpenseNumber();
      }
    }
  }, [currentClub, associationId, associationType]);

  // Populate form when editing
  useEffect(() => {
    if (editingExpense) {
      setPayee(editingExpense.payee || '');
      setDate(editingExpense.date || new Date().toISOString().split('T')[0]);
      setReference(editingExpense.reference || '');
      setNotes(editingExpense.notes || '');
      setPaymentStatus(editingExpense.payment_status || 'paid');
      setPaymentMethod(editingExpense.payment_method || 'cash');
      setExpenseNumber(editingExpense.expense_number || '');

      // Set line item from the transaction amount
      if (editingExpense.amount) {
        setLineItems([{
          description: editingExpense.description || '',
          amount: parseFloat(editingExpense.amount),
          categoryId: editingExpense.category_id || '',
          taxRateId: editingExpense.tax_rate_id || '',
          taxType: editingExpense.tax_type || 'none'
        }]);
      }
    }
  }, [editingExpense]);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('ExpenseCreationPage loadData - isAssociation:', isAssociation, 'associationId:', associationId, 'associationType:', associationType);

      if (isAssociation) {
        // Load association categories and tax rates
        console.log('Loading association budget categories...');
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('association_budget_categories')
          .select('id, name, type')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('type', 'expense')
          .eq('is_active', true);

        console.log('Categories loaded:', categoriesData, 'Error:', categoriesError);
        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);

        // Load association tax rates
        console.log('Loading association tax rates for:', associationId, associationType);
        const { data: taxRatesData, error: taxRatesError } = await supabase
          .from('association_tax_rates')
          .select('id, name, rate, currency')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true);

        console.log('Tax rates loaded:', taxRatesData, 'Error:', taxRatesError);
        if (taxRatesError) throw taxRatesError;
        setTaxRates(taxRatesData || []);
      } else {
        // Load club tax rates and categories
        const { data: taxRatesData, error: taxRatesError } = await supabase
          .from('tax_rates')
          .select('id, name, rate, currency')
          .eq('club_id', currentClub?.clubId)
          .eq('is_active', true);

        if (taxRatesError) throw taxRatesError;
        setTaxRates(taxRatesData || []);

        const { data: categoriesData, error: categoriesError} = await supabase
          .from('budget_categories')
          .select('id, name, type')
          .eq('club_id', currentClub?.clubId)
          .eq('type', 'expense')
          .eq('is_active', true);

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);
      }

    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const generateExpenseNumber = async () => {
    try {
      // Get the next expense number
      const { data: settings } = await supabase
        .from('club_finance_settings')
        .select('number_prefix, next_number_starts_from')
        .eq('club_id', currentClub?.clubId)
        .single();
      
      const prefix = settings?.number_prefix || 'EXP-';
      const nextNumber = settings?.next_number_starts_from || 1;
      
      // Get the count of existing expenses to determine the next number
      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', currentClub?.clubId)
        .eq('type', 'expense');
      
      const expenseNum = (count || 0) + nextNumber;
      setExpenseNumber(`${prefix}${expenseNum.toString().padStart(5, '0')}`);
    } catch (err) {
      console.error('Error generating expense number:', err);
      setExpenseNumber(`EXP-${Date.now()}`);
    }
  };

  const handleBackToFinances = () => {
    navigate('/finances/transactions');
  };

  const handleCancel = () => {
    navigate('/finances/transactions');
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', amount: 0, categoryId: '', taxRateId: '', taxType: 'none' }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];

    if (field === 'taxSelection') {
      // Handle tax selection in format "taxRateId|taxType" or empty for no tax
      if (value === '') {
        updated[index].taxRateId = '';
        updated[index].taxType = 'none';
      } else {
        const [taxRateId, taxType] = value.split('|');
        updated[index].taxRateId = taxRateId;
        updated[index].taxType = taxType as 'included' | 'excluded';
        console.log('EXPENSE: Tax selection changed to:', { taxRateId, taxType, value });
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }

    console.log('EXPENSE: Updated line items:', updated);
    setLineItems(updated);
  };

  const getTaxSelectionValue = (item: LineItem): string => {
    if (!item.taxRateId || item.taxType === 'none') return '';
    return `${item.taxRateId}|${item.taxType}`;
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalTax = 0;

    lineItems.forEach(item => {
      const amount = item.amount || 0;
      subtotal += amount;

      if (item.taxRateId && item.taxType !== 'none') {
        const taxRate = taxRates.find(tr => tr.id === item.taxRateId);
        if (taxRate) {
          if (item.taxType === 'included') {
            // Tax is included in the amount
            const taxAmount = amount - (amount / (1 + taxRate.rate));
            totalTax += taxAmount;
            subtotal -= taxAmount; // Adjust subtotal to exclude tax
          } else if (item.taxType === 'excluded') {
            // Tax is added to the amount
            const taxAmount = amount * taxRate.rate;
            totalTax += taxAmount;
          }
        }
      }
    });

    const total = subtotal + totalTax;

    return {
      subtotal: subtotal,
      tax: totalTax,
      total: total
    };
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('handleSave called - isAssociation:', isAssociation, 'associationId:', associationId, 'associationType:', associationType);

      if (!payee.trim()) {
        setError('Payee is required');
        return;
      }

      if (lineItems.some(item => !item.description.trim() || item.amount <= 0)) {
        setError('All line items must have a description and amount greater than 0');
        return;
      }

      const totals = calculateTotals();
      console.log('=== EXPENSE SAVE DEBUG ===');
      console.log('Line items state:', JSON.stringify(lineItems, null, 2));
      console.log('Totals calculated:', totals);
      console.log('First line item tax:', {
        taxRateId: lineItems[0]?.taxRateId,
        taxType: lineItems[0]?.taxType
      });

      if (editingExpense) {
        // Update existing transaction
        const tableName = isAssociation ? 'association_transactions' : 'transactions';
        const updateData: any = {
          description: lineItems[0]?.description || `Expense from ${payee}`,
          amount: totals.total,
          tax_amount: totals.tax,
          tax_rate_id: lineItems[0]?.taxRateId || null,
          date,
          payee,
          reference,
          notes,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          category_id: lineItems[0]?.categoryId || null
        };

        const { error: transactionError } = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', editingExpense.id);

        if (transactionError) throw transactionError;

        if (onExpenseCreated) {
          onExpenseCreated();
        }
      } else {
        // Create the main transaction
        const tableName = isAssociation ? 'association_transactions' : 'transactions';
        const insertData: any = {
          type: 'expense',
          description: lineItems[0]?.description || `Expense from ${payee}`,
          amount: totals.total,
          tax_amount: totals.tax,
          tax_rate_id: lineItems[0]?.taxRateId || null,
          date,
          payee,
          reference,
          notes,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          category_id: lineItems[0]?.categoryId || null
        };

        if (isAssociation) {
          insertData.association_id = associationId;
          insertData.association_type = associationType;
        } else {
          insertData.club_id = currentClub?.clubId;
          insertData.expense_number = expenseNumber;
        }

        console.log('About to insert into', tableName, 'with data:', insertData);

        const { data: transaction, error: transactionError } = await supabase
          .from(tableName)
          .insert(insertData)
          .select()
          .single();

        console.log('Insert result - data:', transaction, 'error:', transactionError);

        if (transactionError) {
          console.error('Transaction error details:', transactionError);
          console.error('Error code:', transactionError.code);
          console.error('Error message:', transactionError.message);
          console.error('Error details:', transactionError.details);
          console.error('Error hint:', transactionError.hint);
          throw new Error(`Database error: ${transactionError.message} (Code: ${transactionError.code})`);
        }

        if (onExpenseCreated) {
          onExpenseCreated();
        }
      }

      onBack();
    } catch (err) {
      console.error('Error saving expense:', err);
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  if (loading && !taxRates.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={handleBackToFinances}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Finances
        </button>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Create Expense</h1>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-6">
          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payee *
              </label>
              <input
                type="text"
                required
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                placeholder="Enter payee name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Transaction Reference
              </label>
              <input
                type="text"
                value={expenseNumber}
                onChange={(e) => setExpenseNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                placeholder="EXP-123456"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'awaiting_payment')}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="paid">Paid</option>
                <option value="awaiting_payment">Awaiting Payment</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Reference
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              placeholder="Optional reference"
            />
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Line Items</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-4 text-sm font-medium text-slate-400">
                <div className="col-span-3">Description</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-3">Category</div>
                <div className="col-span-3">Tax</div>
                <div className="col-span-1">Actions</div>
              </div>

              {lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                      placeholder="Description"
                    />
                  </div>

                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.amount || ''}
                      onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="col-span-3">
                    <select
                      value={item.categoryId}
                      onChange={(e) => updateLineItem(index, 'categoryId', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    >
                      <option value="">Select category</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-3">
                    <select
                      value={getTaxSelectionValue(item)}
                      onChange={(e) => updateLineItem(index, 'taxSelection', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                    >
                      <option value="">No Tax</option>
                      {taxRates.map(taxRate => (
                        <optgroup key={taxRate.id} label={taxRate.name}>
                          <option value={`${taxRate.id}|included`}>
                            Tax Included
                          </option>
                          <option value={`${taxRate.id}|excluded`}>
                            Tax Excluded
                          </option>
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-1">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addLineItem}
              className="mt-4 flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus size={16} />
              Add Line Item
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none"
              placeholder="Add any additional notes..."
            />
          </div>

          {/* Add Attachment Button */}
          <div>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Paperclip size={16} />
              Add Attachment
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-80 space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Sub Total</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Tax</span>
                <span>${totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-white border-t border-slate-600 pt-2">
                <span>TOTAL</span>
                <span>${totals.total.toFixed(2)} AUD</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Paperclip } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface LineItem {
  description: string;
  amount: number | string;
  categoryId: string;
  taxRateId: string;
  taxType: 'included' | 'excluded' | 'none';
}

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

interface DepositCreationPageProps {
  darkMode: boolean;
  onBack: () => void;
  onDepositCreated?: () => void;
  editingDeposit?: any;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const DepositCreationPage: React.FC<DepositCreationPageProps> = ({
  darkMode,
  onBack,
  onDepositCreated,
  editingDeposit,
  associationId,
  associationType
}) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [payer, setPayer] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'awaiting_payment'>('paid');
  
  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', amount: '', categoryId: '', taxRateId: '', taxType: 'none' }
  ]);
  
  // Data
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  
  // Totals
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (isAssociation || currentClub?.clubId) {
      loadData();
      if (!editingDeposit) {
        generateTransactionReference();
      }
    }
  }, [currentClub, associationId, associationType]);

  useEffect(() => {
    calculateTotals(lineItems);
  }, [lineItems, taxRates]);

  // Populate form when editing
  useEffect(() => {
    if (editingDeposit) {
      setPayer(editingDeposit.payer || '');
      setDate(editingDeposit.date || new Date().toISOString().split('T')[0]);
      setReference(editingDeposit.reference || '');
      setNotes(editingDeposit.notes || '');
      setPaymentStatus(editingDeposit.payment_status || 'paid');
      setTransactionReference(editingDeposit.reference || '');

      // Set line item from the transaction amount
      if (editingDeposit.amount) {
        setLineItems([{
          description: editingDeposit.description || '',
          amount: editingDeposit.amount.toString(),
          categoryId: editingDeposit.category_id || '',
          taxRateId: editingDeposit.tax_rate_id || '',
          taxType: editingDeposit.tax_type || 'none'
        }]);
      }
    }
  }, [editingDeposit]);

  const loadData = async () => {
    try {
      if (isAssociation) {
        // Load association categories and tax rates
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('association_budget_categories')
          .select('id, name, type')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('type', 'income')
          .eq('is_active', true)
          .order('name');

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);

        // Load association tax rates
        const { data: taxRatesData, error: taxRatesError } = await supabase
          .from('association_tax_rates')
          .select('id, name, rate, currency')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('name');

        if (taxRatesError) throw taxRatesError;
        setTaxRates(taxRatesData || []);
      } else {
        // Load club tax rates and categories
        const { data: taxRatesData, error: taxRatesError } = await supabase
          .from('tax_rates')
          .select('id, name, rate, currency')
          .eq('club_id', currentClub?.clubId)
          .eq('is_active', true)
          .order('name');

        if (taxRatesError) throw taxRatesError;
        setTaxRates(taxRatesData || []);

        const { data: categoriesData, error: categoriesError } = await supabase
          .from('budget_categories')
          .select('id, name, type')
          .eq('club_id', currentClub?.clubId)
          .eq('type', 'income')
          .eq('is_active', true)
          .order('name');

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);
      }

    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  const generateTransactionReference = async () => {
    try {
      if (isAssociation) {
        // For associations, use a simple timestamp-based reference
        const timestamp = Date.now().toString().slice(-6);
        setTransactionReference(`DEP-${timestamp}`);
        return;
      }

      // Get the deposit numbering settings from club finance settings
      const { data: settings } = await supabase
        .from('club_finance_settings')
        .select('deposit_prefix, deposit_next_number')
        .eq('club_id', currentClub?.clubId)
        .single();

      const prefix = settings?.deposit_prefix || 'DEP-';
      const nextNumber = settings?.deposit_next_number || 1;

      setTransactionReference(`${prefix}${nextNumber}`);
    } catch (err) {
      console.error('Error generating deposit number:', err);
      // Fallback to timestamp-based reference
      const timestamp = Date.now().toString().slice(-6);
      setTransactionReference(`DEP-${timestamp}`);
    }
  };

  const handleBackToFinances = () => {
    navigate('/finances/transactions');
  };

  const handleCancel = () => {
    navigate('/finances/transactions');
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { 
      description: '', 
      amount: '', 
      categoryId: '', 
      taxRateId: '', 
      taxType: 'none' 
    }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      const newItems = lineItems.filter((_, i) => i !== index);
      setLineItems(newItems);
    }
  };

  const updateLineItem = (index: number, field: string, value: string | number) => {
    const newItems = [...lineItems];

    if (field === 'taxSelection') {
      // Handle tax selection in format "taxRateId|taxType" or empty string for no tax
      if (value === '') {
        newItems[index].taxRateId = '';
        newItems[index].taxType = 'none';
      } else {
        const [taxRateId, taxType] = (value as string).split('|');
        newItems[index].taxRateId = taxRateId;
        newItems[index].taxType = taxType as 'included' | 'excluded';
        console.log('DEPOSIT: Tax selection changed to:', { taxRateId, taxType, value });
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }

    console.log('DEPOSIT: Updated line items:', newItems);
    setLineItems(newItems);
  };

  const calculateTotals = (items: LineItem[]) => {
    let subtotalAmount = 0;
    let taxTotalAmount = 0;
    
    items.forEach(item => {
      const amount = parseFloat(item.amount.toString()) || 0;
      
      if (item.taxRateId && item.taxType !== 'none') {
        const taxRate = taxRates.find(rate => rate.id === item.taxRateId);
        if (taxRate) {
          if (item.taxType === 'included') {
            // Tax is included in the amount
            const taxIncluded = amount - (amount / (1 + taxRate.rate));
            subtotalAmount += amount - taxIncluded;
            taxTotalAmount += taxIncluded;
          } else {
            // Tax is excluded (added on top)
            subtotalAmount += amount;
            taxTotalAmount += amount * taxRate.rate;
          }
        } else {
          subtotalAmount += amount;
        }
      } else {
        subtotalAmount += amount;
      }
    });
    
    setSubtotal(subtotalAmount);
    setTaxAmount(taxTotalAmount);
    setTotal(subtotalAmount + taxTotalAmount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!payer.trim()) {
      setError('Payer is required');
      return;
    }

    if (lineItems.some(item => !item.description.trim() || !item.amount)) {
      setError('All line items must have a description and amount');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('=== DEPOSIT SAVE DEBUG ===');
      console.log('Line items state:', JSON.stringify(lineItems, null, 2));
      console.log('First line item tax:', {
        taxRateId: lineItems[0]?.taxRateId,
        taxType: lineItems[0]?.taxType
      });

      if (editingDeposit) {
        // Update existing transaction
        const tableName = isAssociation ? 'association_transactions' : 'transactions';
        const updateData: any = {
          description: lineItems[0]?.description || `Deposit from ${payer}`,
          amount: total,
          tax_amount: taxAmount,
          tax_rate_id: lineItems[0]?.taxRateId || null,
          date,
          payer,
          reference,
          notes,
          payment_status: paymentStatus,
          category_id: lineItems[0]?.categoryId || null
        };

        const { error: transactionError } = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', editingDeposit.id);

        if (transactionError) throw transactionError;

        if (onDepositCreated) {
          onDepositCreated();
        }
      } else {
        // Create the main transaction
        const tableName = isAssociation ? 'association_transactions' : 'transactions';
        const insertData: any = {
          type: 'income',
          description: lineItems[0]?.description || `Deposit from ${payer}`,
          amount: total,
          tax_amount: taxAmount,
          tax_rate_id: lineItems[0]?.taxRateId || null,
          date,
          payer,
          payee: null,
          reference,
          notes,
          payment_method: 'bank',
          payment_status: paymentStatus,
          category_id: lineItems[0]?.categoryId || null
        };

        if (isAssociation) {
          insertData.association_id = associationId;
          insertData.association_type = associationType;
        } else {
          insertData.club_id = currentClub?.clubId;
          insertData.transaction_reference = transactionReference;
        }

        console.log('About to insert deposit into', tableName, 'with data:', insertData);

        const { data: transaction, error: transactionError } = await supabase
          .from(tableName)
          .insert(insertData)
          .select()
          .single();

        console.log('Deposit insert result - data:', transaction, 'error:', transactionError);

        if (transactionError) {
          console.error('Deposit error details:', transactionError);
          console.error('Error code:', transactionError.code);
          console.error('Error message:', transactionError.message);
          console.error('Error details:', transactionError.details);
          console.error('Error hint:', transactionError.hint);
          throw new Error(`Database error: ${transactionError.message} (Code: ${transactionError.code})`);
        }

        // Increment the deposit number for clubs (not associations)
        if (!isAssociation && currentClub?.clubId) {
          const { data: settings } = await supabase
            .from('club_finance_settings')
            .select('deposit_next_number')
            .eq('club_id', currentClub.clubId)
            .single();

          if (settings) {
            await supabase
              .from('club_finance_settings')
              .update({ deposit_next_number: (settings.deposit_next_number || 1) + 1 })
              .eq('club_id', currentClub.clubId);
          }
        }

        if (onDepositCreated) {
          onDepositCreated();
        }
      }

      // Success - go back to finances
      onBack();

    } catch (err) {
      console.error('Error saving deposit:', err);
      setError(err instanceof Error ? err.message : 'Failed to save deposit');
    } finally {
      setLoading(false);
    }
  };

  const getTaxSelectionValue = (item: LineItem) => {
    if (!item.taxRateId || item.taxType === 'none') {
      return '';
    }
    return `${item.taxRateId}|${item.taxType}`;
  };

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
        <h1 className="text-2xl font-bold text-white mb-6">Create Deposit</h1>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payer *
              </label>
              <input
                type="text"
                required
                value={payer}
                onChange={(e) => setPayer(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                placeholder="Enter payer name"
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
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                placeholder="DEP-123456"
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
                <option value="paid">Received</option>
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
                      value={item.amount}
                      onChange={(e) => updateLineItem(index, 'amount', e.target.value)}
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
                      {taxRates.map(rate => (
                        <optgroup key={rate.id} label={rate.name}>
                          <option value={`${rate.id}|included`}>
                            Tax Included
                          </option>
                          <option value={`${rate.id}|excluded`}>
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
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Tax</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-white border-t border-slate-600 pt-2">
                <span>TOTAL</span>
                <span>${total.toFixed(2)} AUD</span>
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
              {loading ? 'Saving...' : 'Save Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
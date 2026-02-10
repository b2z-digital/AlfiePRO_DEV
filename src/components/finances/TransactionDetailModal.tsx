import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, DollarSign, FileText, User, CreditCard, Tag, MessageSquare, Users } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

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
  linked_entity_type?: string;
  linked_entity_id?: string;
}

interface BudgetCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
}

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  transaction: Transaction;
  onUpdate: () => void;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  transaction: initialTransaction,
  onUpdate,
  associationId,
  associationType
}) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const { addNotification } = useNotifications();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [formData, setFormData] = useState({
    description: initialTransaction.description,
    amount: initialTransaction.amount,
    date: initialTransaction.date,
    category_id: initialTransaction.category_id || '',
    payer: initialTransaction.payer || '',
    payee: initialTransaction.payee || '',
    reference: initialTransaction.reference || '',
    notes: initialTransaction.notes || '',
    payment_method: initialTransaction.payment_method,
    payment_status: initialTransaction.payment_status
  });

  useEffect(() => {
    setFormData({
      description: initialTransaction.description,
      amount: initialTransaction.amount,
      date: initialTransaction.date,
      category_id: initialTransaction.category_id || '',
      payer: initialTransaction.payer || '',
      payee: initialTransaction.payee || '',
      reference: initialTransaction.reference || '',
      notes: initialTransaction.notes || '',
      payment_method: initialTransaction.payment_method,
      payment_status: initialTransaction.payment_status
    });
    setIsEditing(false);
  }, [initialTransaction.id]);

  useEffect(() => {
    if (currentClub?.clubId || isAssociation) {
      loadCategories();
    }
  }, [currentClub, isAssociation]);

  const loadRemittanceMembers = async () => {
    if (!isAssociation || initialTransaction.linked_entity_type !== 'club') return;

    try {
      setLoadingMembers(true);
      // Get all remittances that were paid as part of this bulk payment
      // We'll match by club_id, date, and reference
      const { data, error } = await supabase
        .from('membership_remittances')
        .select(`
          id,
          member_id,
          membership_year,
          state_contribution_amount,
          national_contribution_amount,
          members (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('club_id', initialTransaction.linked_entity_id)
        .eq('club_to_state_paid_date', initialTransaction.date)
        .eq('club_to_state_status', 'paid')
        .eq('bulk_payment', true);

      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error loading members:', err);
      addNotification('error', 'Failed to load member list');
    } finally {
      setLoadingMembers(false);
    }
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

  const handleSave = async () => {
    try {
      setLoading(true);
      const tableName = isAssociation ? 'association_transactions' : 'transactions';
      const { error } = await supabase
        .from(tableName as any)
        .update({
          description: formData.description,
          amount: formData.amount,
          date: formData.date,
          category_id: formData.category_id,
          payer: formData.payer,
          payee: formData.payee,
          reference: formData.reference,
          notes: formData.notes,
          payment_method: formData.payment_method,
          payment_status: formData.payment_status,
          updated_at: new Date().toISOString()
        })
        .eq('id', initialTransaction.id);

      if (error) throw error;

      addNotification('success', 'Transaction updated successfully');
      setIsEditing(false);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Error updating transaction:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickStatusUpdate = async (newStatus: string) => {
    try {
      setLoading(true);
      const tableName = isAssociation ? 'association_transactions' : 'transactions';
      const { error } = await supabase
        .from(tableName as any)
        .update({
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', initialTransaction.id);

      if (error) throw error;

      const statusLabel = newStatus === 'paid' || newStatus === 'completed' ? 'Paid' : 'Awaiting Payment';
      addNotification('success', `Payment status updated to ${statusLabel}`);
      setFormData(prev => ({ ...prev, payment_status: newStatus }));
      onUpdate();
    } catch (err) {
      console.error('Error updating status:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className={`
        rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          sticky top-0 z-10 p-6 border-b
          ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Transaction Details
              </h3>
              <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {isEditing ? 'Edit transaction information' : 'View transaction details'}
              </p>
            </div>
            <button
              onClick={onClose}
              className={`
                p-2 rounded-lg transition-colors
                ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}
              `}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Type and Status Row */}
          <div className="flex items-center gap-4">
            <span className={`
              px-3 py-1.5 rounded-full text-sm font-medium
              ${initialTransaction.type === 'deposit'
                ? 'bg-green-900/30 text-green-400'
                : 'bg-red-900/30 text-red-400'}
            `}>
              {initialTransaction.type === 'deposit' ? 'Income' : 'Expense'}
            </span>

            {!isEditing && (
              <div className="flex items-center gap-2">
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Status:</span>
                <select
                  value={formData.payment_status}
                  onChange={(e) => handleQuickStatusUpdate(e.target.value)}
                  disabled={loading}
                  className={`
                    px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer
                    ${(formData.payment_status === 'paid' || formData.payment_status === 'completed')
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-amber-900/30 text-amber-400'}
                    ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {isAssociation ? (
                    <>
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                    </>
                  ) : (
                    <>
                      <option value="awaiting_payment">Awaiting Payment</option>
                      <option value="paid">Paid</option>
                    </>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Amount */}
          <div className={`
            p-4 rounded-lg border
            ${darkMode ? 'bg-slate-700/30 border-slate-700' : 'bg-slate-50 border-slate-200'}
          `}>
            <div className="flex items-center gap-3">
              <DollarSign className={darkMode ? 'text-slate-400' : 'text-slate-600'} size={20} />
              <div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Amount</p>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                    className={`
                      text-2xl font-bold mt-1 px-2 py-1 rounded
                      ${initialTransaction.type === 'deposit' ? 'text-green-400' : 'text-red-400'}
                      ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300'}
                      border
                    `}
                  />
                ) : (
                  <p className={`text-2xl font-bold ${initialTransaction.type === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>
                    {initialTransaction.type === 'deposit' ? '+' : '-'}{formatCurrency(formData.amount)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <FileText size={16} />
              Description
            </label>
            {isEditing ? (
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            ) : (
              <p className={`${darkMode ? 'text-white' : 'text-slate-900'}`}>{formData.description}</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <Calendar size={16} />
              Date
            </label>
            {isEditing ? (
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            ) : (
              <p className={`${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatDate(formData.date)}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <Tag size={16} />
              Category
            </label>
            {isEditing ? (
              <select
                value={formData.category_id}
                onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}
                `}
              >
                <option value="">Select category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            ) : (
              <p className={`${darkMode ? 'text-white' : 'text-slate-900'}`}>{initialTransaction.category_name || 'N/A'}</p>
            )}
          </div>

          {/* Payer/Payee */}
          <div>
            <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <User size={16} />
              {initialTransaction.type === 'deposit' || initialTransaction.type === 'income' ? 'Payer' : 'Payee'}
            </label>
            {isEditing ? (
              <input
                type="text"
                value={(initialTransaction.type === 'deposit' || initialTransaction.type === 'income') ? formData.payer : formData.payee}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  [(initialTransaction.type === 'deposit' || initialTransaction.type === 'income') ? 'payer' : 'payee']: e.target.value
                }))}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            ) : (
              <p className={`${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {(initialTransaction.type === 'deposit' || initialTransaction.type === 'income') ? (formData.payer || 'N/A') : (formData.payee || 'N/A')}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <CreditCard size={16} />
              Payment Method
            </label>
            {isEditing ? (
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}
                `}
              >
                <option value="cash">Cash</option>
                <option value="stripe">Stripe</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
                <option value="other">Other</option>
              </select>
            ) : (
              <p className={`${darkMode ? 'text-white' : 'text-slate-900'} capitalize`}>{formData.payment_method.replace('_', ' ')}</p>
            )}
          </div>

          {/* Reference */}
          {formData.reference && (
            <div>
              <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Reference
              </label>
              <p className={`font-mono text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{formData.reference}</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <MessageSquare size={16} />
              Notes
            </label>
            {isEditing ? (
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            ) : (
              <p className={`${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{formData.notes || 'No notes'}</p>
            )}
          </div>

          {/* Linked Members for Bulk Remittance */}
          {isAssociation && initialTransaction.linked_entity_type === 'club' && formData.description.includes('members') && (
            <div>
              <button
                onClick={() => {
                  if (!showMembers) {
                    loadRemittanceMembers();
                  }
                  setShowMembers(!showMembers);
                }}
                className={`
                  w-full flex items-center justify-between p-3 rounded-lg border transition-colors
                  ${darkMode ? 'bg-slate-700/30 border-slate-700 hover:bg-slate-700/50' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}
                `}
              >
                <div className="flex items-center gap-2">
                  <Users size={16} className={darkMode ? 'text-slate-400' : 'text-slate-600'} />
                  <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    View Member List
                  </span>
                </div>
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {showMembers ? 'Hide' : 'Show'}
                </span>
              </button>

              {showMembers && (
                <div className={`
                  mt-2 p-4 rounded-lg border max-h-60 overflow-y-auto
                  ${darkMode ? 'bg-slate-700/30 border-slate-700' : 'bg-slate-50 border-slate-200'}
                `}>
                  {loadingMembers ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className={`ml-2 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Loading members...
                      </span>
                    </div>
                  ) : members.length > 0 ? (
                    <div className="space-y-2">
                      {members.map((remittance: any) => (
                        <div
                          key={remittance.id}
                          className={`
                            p-2 rounded border
                            ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {remittance.members?.first_name} {remittance.members?.last_name}
                              </p>
                              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                {remittance.members?.email}
                              </p>
                            </div>
                            <span className={`text-sm font-medium ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                              ${remittance.state_contribution_amount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-sm text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      No members found
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Linked Entity Info */}
          {initialTransaction.linked_entity_type === 'event_registration' && (
            <div className={`
              p-3 rounded-lg border-l-4
              ${darkMode ? 'bg-blue-900/20 border-blue-500' : 'bg-blue-50 border-blue-400'}
            `}>
              <p className={`text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                Linked to Event Registration
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                This transaction was automatically created from an event registration
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`
          sticky bottom-0 p-6 border-t flex items-center justify-end gap-3
          ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                disabled={loading}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}
                `}
              >
                Close
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Edit Transaction
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

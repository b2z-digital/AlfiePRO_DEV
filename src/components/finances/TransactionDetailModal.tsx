import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, FileText, User, CreditCard, Tag, MessageSquare, Users, Receipt, SquarePen as Edit2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface Transaction {
  id: string;
  type: 'deposit' | 'income' | 'expense';
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


  if (!isOpen) return null;

  const inc = initialTransaction.type === 'deposit' || initialTransaction.type === 'income';
  const paid = formData.payment_status === 'paid' || formData.payment_status === 'completed';
  const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
    <div className="a-ir"><span className="a-ir-l">{icon}{label}</span><span className="a-ir-v">{children}</span></div>
  );

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <section className="a-msheet" style={{ width: 600 }} role="dialog" aria-modal="true" aria-label="Transaction details">
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '18px 18px 0 22px' }}>
          <span className="a-tile"><Receipt size={19} /></span>
          <div className="flex-1 min-w-0">
            <p className="a-cap">{isEditing ? 'Edit transaction' : 'Transaction'}</p>
            <div className="a-ink text-[15px] font-semibold mt-[3px] truncate">{formData.description}</div>
          </div>
          <button onClick={onClose} className="a-ib" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="a-amt-hero" style={{ margin: '18px 22px 0', ['--amt-glow' as any]: inc ? 'rgba(48,209,88,0.16)' : 'rgba(255,107,107,0.16)' }}>
            <div className="flex justify-center gap-2.5">
              <span className="a-lb-fmt"><span className="a-light" style={{ background: inc ? '#30D158' : '#FF6B6B', boxShadow: 'none' }} />{inc ? 'Income' : 'Expense'}</span>
            </div>
            {isEditing ? (
              <label className="inline-flex items-center gap-1 mt-3.5">
                <span className={`a-big ${inc ? 'a-txt-g' : 'a-txt-r'}`} style={{ fontSize: 40 }}>{inc ? '+' : '−'}$</span>
                <span className="sr-only">Amount</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                  className={`a-big a-amt-inp ${inc ? 'a-txt-g' : 'a-txt-r'}`}
                  style={{ fontSize: 40 }}
                />
              </label>
            ) : (
              <div className={`a-big mt-3.5 ${inc ? 'a-txt-g' : 'a-txt-r'}`} style={{ fontSize: 54 }}>{inc ? '+' : '−'}{formatCurrency(formData.amount)}</div>
            )}
            {!isEditing && (
              <div className="inline-flex mt-4 relative">
                <span className={`a-light ${paid ? 'a-light-g' : 'a-light-a'} absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none`} />
                <label className="sr-only" htmlFor="tx-status">Status</label>
                <select
                  id="tx-status"
                  value={formData.payment_status}
                  onChange={(e) => handleQuickStatusUpdate(e.target.value)}
                  disabled={loading}
                  className="a-pick"
                  style={{ height: 36, borderRadius: 11, paddingLeft: 30 }}
                >
                  {isAssociation ? (
                    <><option value="pending">Pending</option><option value="completed">Completed</option></>
                  ) : (
                    <><option value="awaiting_payment">Awaiting payment</option><option value="paid">Paid</option></>
                  )}
                </select>
              </div>
            )}
          </div>

          <div style={{ padding: '18px 22px 22px' }} className="flex flex-col gap-3">
            <div className="a-grp">
              {isEditing && (
                <Row icon={<FileText size={15} />} label="Description">
                  <input className="a-bare" type="text" value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} aria-label="Description" />
                </Row>
              )}
              <Row icon={<Calendar size={15} />} label="Date">
                {isEditing
                  ? <input className="a-bare a-inp-date" type="date" value={formData.date} onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))} aria-label="Date" />
                  : new Date(formData.date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Row>
              <Row icon={<Tag size={15} />} label="Category">
                {isEditing ? (
                  <select className="a-bare" value={formData.category_id} onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))} aria-label="Category">
                    <option value="">Select category</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                ) : (initialTransaction.category_name || <span className="a-dim">None</span>)}
              </Row>
              <Row icon={<User size={15} />} label={inc ? 'Payer' : 'Payee'}>
                {isEditing ? (
                  <input
                    className="a-bare"
                    type="text"
                    aria-label={inc ? 'Payer' : 'Payee'}
                    value={inc ? formData.payer : formData.payee}
                    onChange={(e) => setFormData(prev => ({ ...prev, [inc ? 'payer' : 'payee']: e.target.value }))}
                  />
                ) : ((inc ? formData.payer : formData.payee) || <span className="a-dim">—</span>)}
              </Row>
              <Row icon={<CreditCard size={15} />} label="Payment">
                {isEditing ? (
                  <select className="a-bare" value={formData.payment_method} onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))} aria-label="Payment method">
                    <option value="cash">Cash</option>
                    <option value="stripe">Stripe</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="credit_card">Credit card</option>
                    <option value="debit_card">Debit card</option>
                    <option value="other">Other</option>
                  </select>
                ) : <span className="capitalize">{formData.payment_method.replace('_', ' ')}</span>}
              </Row>
              {formData.reference && (
                <Row icon={<Receipt size={15} />} label="Reference"><span className="a-mono a-mute">{formData.reference}</span></Row>
              )}
              <Row icon={<MessageSquare size={15} />} label="Notes">
                {isEditing
                  ? <textarea className="a-bare" rows={3} value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} aria-label="Notes" />
                  : <span className="a-mute">{formData.notes || 'No notes'}</span>}
              </Row>
            </div>

            {isAssociation && initialTransaction.linked_entity_type === 'club' && formData.description.includes('members') && (
              <div className="a-grp">
                <button
                  onClick={() => { if (!showMembers) loadRemittanceMembers(); setShowMembers(!showMembers); }}
                  className="a-lnk w-full bg-transparent border-0 text-left cursor-pointer"
                  aria-expanded={showMembers}
                >
                  <span className="a-tile a-tile-sm"><Users size={15} /></span>
                  <span className="flex-1 a-ink text-sm font-medium">Member list</span>
                  <span className="a-dim text-xs">{showMembers ? 'Hide' : 'Show'}</span>
                </button>
                {showMembers && (
                  loadingMembers ? (
                    <div className="a-lnk justify-center"><span className="w-5 h-5 border-2 border-white/10 border-t-[#0A84FF] rounded-full animate-spin" /><span className="a-mute text-sm">Loading members…</span></div>
                  ) : members.length > 0 ? (
                    <div className="max-h-60 overflow-y-auto">
                      {members.map((remittance: any) => (
                        <div key={remittance.id} className="a-lnk">
                          <div className="flex-1 min-w-0">
                            <div className="a-ink text-sm font-medium truncate">{remittance.members?.first_name} {remittance.members?.last_name}</div>
                            <div className="a-dim text-xs truncate">{remittance.members?.email}</div>
                          </div>
                          <span className="a-num a-txt-g text-sm font-semibold">${remittance.state_contribution_amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="a-lnk a-mute text-sm">No members found</div>
                )}
              </div>
            )}

            {initialTransaction.linked_entity_type === 'event_registration' && (
              <div className="a-note">
                <span className="a-txt-b flex"><Calendar size={17} /></span>
                <span className="flex-1"><span className="block a-ink text-[13.5px] font-medium">Linked to an event registration</span><span className="block a-dim text-xs mt-0.5">Created automatically from an event registration.</span></span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2.5 flex-shrink-0 a-panel-foot" style={{ padding: '16px 22px', justifyContent: 'stretch' }}>
          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} disabled={loading} className="a-btn flex-1" style={{ height: 46 }}>Cancel</button>
              <button onClick={handleSave} disabled={loading} className="a-btn a-btn-p" style={{ height: 46, flex: 1.4 }}>{loading ? 'Saving…' : 'Save changes'}</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="a-btn flex-1" style={{ height: 46 }}>Close</button>
              <button onClick={() => setIsEditing(true)} className="a-btn a-btn-p" style={{ height: 46, flex: 1.4 }}><Edit2 size={16} />Edit transaction</button>
            </>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(modalContent, document.body);
};

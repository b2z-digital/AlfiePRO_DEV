import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, FileText, User, CreditCard, Tag, MessageSquare, Users, Receipt, Percent, SquarePen as Edit2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useModalFocus } from '../../hooks/useModalFocus';
import { computeTax, rateOf, TaxType } from '../../utils/financeTax';
import { TransactionAttachments } from './TransactionAttachments';
import { TransactionApprovalPanel } from './TransactionApprovalPanel';
import {
  ApprovalSetup, ApprovalStatus, ApprovalSummary, approvalErrorMessage, getApprovalSetup, latestApprovals, sendForApproval,
} from '../../utils/expenseApprovals';

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
  tax_amount?: number | string | null;
  tax_rate_id?: string | null;
  tax_type?: TaxType | null;
  approval_status?: ApprovalStatus | null;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number | string;
  is_default?: boolean | null;
}

// Club transactions only accept these; association ones also hold the older values
const CLUB_METHODS: [string, string][] = [['cash', 'Cash'], ['card', 'Card'], ['cheque', 'Cheque'], ['bank', 'Bank transfer'], ['other', 'Other']];
const ASSOC_METHODS: [string, string][] = [['cash', 'Cash'], ['stripe', 'Stripe'], ['bank_transfer', 'Bank transfer'], ['cheque', 'Cheque'], ['credit_card', 'Credit card'], ['debit_card', 'Debit card'], ['other', 'Other']];
const NO_RATE = '__gst10__'; // used when no tax rates are set up: 10% GST, saved without a rate id

/** What the amount field shows when editing: the total, or (GST added on top) the amount before GST */
const enteredAmount = (t: Transaction) => {
  const amount = Number(t.amount) || 0;
  const tax = Number(t.tax_amount) || 0;
  return t.tax_type === 'excluded' ? Math.round((amount - tax) * 100) / 100 : amount;
};

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

// Outside the sheet so editing a field doesn't rebuild it (and lose focus) on every key
const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div className="a-ir"><span className="a-ir-l">{icon}{label}</span><span className="a-ir-v">{children}</span></div>
);

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  transaction: initialTransaction,
  onUpdate,
  associationId,
  associationType
}) => {
  const { currentClub, currentOrganization } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const txTable = isAssociation ? 'association_transactions' : 'transactions';
  const isExpense = initialTransaction.type === 'expense';
  const orgName = isAssociation ? currentOrganization?.name : (currentClub?.club as any)?.name;
  const [approvalSetup, setApprovalSetup] = useState<ApprovalSetup | null>(null);
  const [latestApproval, setLatestApproval] = useState<ApprovalSummary | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(initialTransaction.approval_status || 'not_required');
  const { addNotification } = useNotifications();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  // Expense approvals: settings, and the latest request for this expense
  const loadApproval = async () => {
    const [setup, latest] = await Promise.all([
      getApprovalSetup(isAssociation ? { associationId, associationType } : { clubId: currentClub?.clubId }),
      latestApprovals(txTable, [initialTransaction.id]),
    ]);
    setApprovalSetup(setup);
    setLatestApproval(latest[initialTransaction.id] || null);
  };
  useEffect(() => {
    setApprovalStatus(initialTransaction.approval_status || 'not_required');
    if (isExpense) loadApproval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTransaction.id]);
  const sheetRef = useRef<HTMLElement>(null);
  const taxSelectionFor = (t: Transaction) =>
    t.tax_type && t.tax_type !== 'none' ? `${t.tax_rate_id || NO_RATE}|${t.tax_type}` : '';
  const [formData, setFormData] = useState({
    description: initialTransaction.description,
    amount: initialTransaction.amount,
    amount_input: String(enteredAmount(initialTransaction)),
    tax_selection: taxSelectionFor(initialTransaction),
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
      amount_input: String(enteredAmount(initialTransaction)),
      tax_selection: taxSelectionFor(initialTransaction),
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
      loadTaxRates();
    }
  }, [currentClub?.clubId, isAssociation]);

  const loadTaxRates = async () => {
    try {
      const q = isAssociation
        ? supabase.from('association_tax_rates').select('id, name, rate, is_default')
            .eq('association_id', associationId).eq('association_type', associationType)
        : supabase.from('tax_rates').select('id, name, rate, is_default').eq('club_id', currentClub?.clubId);
      const { data } = await q.eq('is_active', true);
      setTaxRates((data as TaxRate[]) || []);
    } catch (err) {
      console.error('Error loading tax rates:', err);
    }
  };

  // GST options for the Edit sheet; falls back to 10% GST when no rates are set up
  const taxOptions = useMemo(() => {
    const rates = taxRates.length ? taxRates : [{ id: NO_RATE, name: 'GST', rate: 0.1 }];
    const opts: { value: string; label: string; rate: number }[] = [];
    rates.forEach((r) => {
      const pct = `${Math.round(rateOf(r) * 1000) / 10}%`;
      opts.push({ value: `${r.id}|included`, label: `${r.name} ${pct} included in amount`, rate: rateOf(r) });
      opts.push({ value: `${r.id}|excluded`, label: `${r.name} ${pct} added on top`, rate: rateOf(r) });
    });
    // A saved rate that has since been switched off still shows
    const sel = formData.tax_selection;
    if (sel && !opts.some((o) => o.value === sel)) {
      const [, type] = sel.split('|');
      opts.push({ value: sel, label: type === 'excluded' ? 'GST added on top' : 'GST included in amount', rate: 0.1 });
    }
    return opts;
  }, [taxRates, formData.tax_selection]);

  const taxPreview = useMemo(() => {
    const entered = parseFloat(formData.amount_input);
    const amount = Number.isFinite(entered) ? entered : 0;
    if (!formData.tax_selection) return { total: Math.round(amount * 100) / 100, tax: 0, type: 'none' as TaxType, rateId: null as string | null };
    const [rateId, type] = formData.tax_selection.split('|') as [string, TaxType];
    const rate = taxOptions.find((o) => o.value === formData.tax_selection)?.rate || 0.1;
    const { total, tax } = computeTax(amount, type, rate);
    return { total, tax, type, rateId: rateId === NO_RATE ? null : rateId };
  }, [formData.amount_input, formData.tax_selection, taxOptions]);

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
    const entered = parseFloat(formData.amount_input);
    if (!Number.isFinite(entered) || entered <= 0) {
      addNotification('error', 'Please enter an amount greater than 0');
      return;
    }
    if (!formData.description?.trim()) {
      addNotification('error', 'Please enter a description');
      return;
    }
    try {
      setLoading(true);
      const tableName = isAssociation ? 'association_transactions' : 'transactions';
      const { error } = await supabase
        .from(tableName as any)
        .update({
          description: formData.description,
          amount: taxPreview.total,
          tax_amount: taxPreview.tax,
          tax_type: taxPreview.type,
          tax_rate_id: taxPreview.rateId,
          date: formData.date,
          category_id: formData.category_id || null,
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

      setFormData(prev => ({ ...prev, amount: taxPreview.total }));

      // Changing the amount of an approved (or waiting) expense sends it back to the same approver
      const amountChanged = Math.abs(taxPreview.total - Number(initialTransaction.amount)) > 0.004;
      if (isExpense && amountChanged && approvalSetup?.enabled && latestApproval
          && (approvalStatus === 'approved' || approvalStatus === 'pending')
          && latestApproval.approver_user_id !== approvalSetup.me) {
        try {
          const r = await sendForApproval(txTable, initialTransaction.id, latestApproval.approver_user_id, orgName);
          addNotification('success', `Saved. The amount changed, so it has gone back to ${r.approver_name} for approval.`);
        } catch (e) {
          addNotification('error', `Saved, but it couldn't be sent back for approval: ${approvalErrorMessage(e)}`);
        }
        setIsEditing(false);
        onUpdate();
        onClose();
        return;
      }
      addNotification('success', 'Transaction updated successfully');
      setIsEditing(false);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Error updating transaction:', err);
      addNotification('error', approvalErrorMessage(err));
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
      addNotification('error', approvalErrorMessage(err));
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


  const cancelEdit = () => {
    setFormData(prev => ({
      ...prev,
      description: initialTransaction.description,
      amount: initialTransaction.amount,
      amount_input: String(enteredAmount(initialTransaction)),
      tax_selection: taxSelectionFor(initialTransaction),
      date: initialTransaction.date,
      category_id: initialTransaction.category_id || '',
      payer: initialTransaction.payer || '',
      payee: initialTransaction.payee || '',
      reference: initialTransaction.reference || '',
      notes: initialTransaction.notes || '',
      payment_method: initialTransaction.payment_method,
    }));
    setIsEditing(false);
  };

  // Keep keyboard focus in the sheet (page behind is inert); Esc cancels an edit, then closes
  useModalFocus(sheetRef, isOpen, () => {
    if (loading) return;
    if (isEditing) cancelEdit(); else onClose();
  });

  if (!isOpen) return null;

  const methodOptions = (() => {
    const base = isAssociation ? ASSOC_METHODS : CLUB_METHODS;
    const cur = formData.payment_method;
    return cur && !base.some(([v]) => v === cur) ? [...base, [cur, cur.replace(/_/g, ' ')] as [string, string]] : base;
  })();
  const methodLabel = methodOptions.find(([v]) => v === formData.payment_method)?.[1] || (formData.payment_method || '').replace(/_/g, ' ');
  const savedTax = Number(initialTransaction.tax_amount) || 0;
  const savedTaxType = initialTransaction.tax_type || 'none';
  const showTaxRow = isEditing || savedTax > 0 || savedTaxType !== 'none' || taxRates.length > 0;

  const inc = initialTransaction.type === 'deposit' || initialTransaction.type === 'income';
  const paid = formData.payment_status === 'paid' || formData.payment_status === 'completed';
  // An expense waiting for (or refused) approval can't be marked paid
  const approvalLocked = isExpense && !paid && (approvalStatus === 'pending' || approvalStatus === 'declined');

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <section ref={sheetRef} tabIndex={-1} className="a-msheet outline-none" style={{ width: 600 }} role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit transaction' : 'Transaction details'}>
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
                  min="0"
                  inputMode="decimal"
                  value={formData.amount_input}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount_input: e.target.value }))}
                  onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  className={`a-big a-amt-inp ${inc ? 'a-txt-g' : 'a-txt-r'}`}
                  style={{ fontSize: 40 }}
                />
              </label>
            ) : (
              <div className={`a-big mt-3.5 ${inc ? 'a-txt-g' : 'a-txt-r'}`} style={{ fontSize: 54 }}>{inc ? '+' : '−'}{formatCurrency(formData.amount)}</div>
            )}
            {isEditing && taxPreview.type !== 'none' && (
              <div className="a-dim text-xs mt-2 a-num">
                {taxPreview.type === 'excluded'
                  ? <>Total {formatCurrency(taxPreview.total)} · includes {formatCurrency(taxPreview.tax)} GST added on top</>
                  : <>Includes {formatCurrency(taxPreview.tax)} GST</>}
              </div>
            )}
            {!isEditing && (
              <div className="inline-flex mt-4 relative">
                <span className={`a-light ${paid ? 'a-light-g' : 'a-light-a'} absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none`} />
                <label className="sr-only" htmlFor="tx-status">Status</label>
                <select
                  id="tx-status"
                  value={formData.payment_status}
                  onChange={(e) => handleQuickStatusUpdate(e.target.value)}
                  disabled={loading || approvalLocked}
                  title={approvalLocked ? 'Needs approval before it can be marked paid' : undefined}
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
                  <input autoFocus className="a-bare" type="text" value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} aria-label="Description" />
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
                  <select className="a-bare" value={formData.payment_method || ''} onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))} aria-label="Payment method">
                    {!formData.payment_method && <option value="">Select method</option>}
                    {methodOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : <span className="capitalize">{methodLabel || <span className="a-dim">—</span>}</span>}
              </Row>
              {showTaxRow && (
                <Row icon={<Percent size={15} />} label="Tax">
                  {isEditing ? (
                    <select className="a-bare" value={formData.tax_selection} onChange={(e) => setFormData(prev => ({ ...prev, tax_selection: e.target.value }))} aria-label="Tax">
                      <option value="">No tax</option>
                      {taxOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : savedTaxType === 'none' || savedTax === 0 ? (
                    <span className="a-dim">No tax</span>
                  ) : (
                    <span className="a-num">{formatCurrency(savedTax)} GST {savedTaxType === 'excluded' ? 'added on top' : 'included'}</span>
                  )}
                </Row>
              )}
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

            {isExpense && (
              <TransactionApprovalPanel
                table={txTable}
                transactionId={initialTransaction.id}
                approvalStatus={approvalStatus}
                isPaid={paid}
                setup={approvalSetup}
                latest={latestApproval}
                orgName={orgName}
                onSent={(name) => {
                  addNotification('success', `Sent to ${name} for approval`);
                  setApprovalStatus('pending');
                  setFormData(prev => ({ ...prev, payment_status: isAssociation ? 'pending' : 'awaiting_payment' }));
                  loadApproval();
                  onUpdate();
                }}
                onError={(m) => addNotification('error', m)}
              />
            )}

            <TransactionAttachments
              variant="sheet"
              table={isAssociation ? 'association_transactions' : 'transactions'}
              transactionId={initialTransaction.id}
            />

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
              <button onClick={cancelEdit} disabled={loading} className="a-btn flex-1" style={{ height: 46 }}>Cancel</button>
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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, Building2, CircleCheck as CheckCircle, Download, RefreshCw, ArrowRight, TrendingUp, Calendar, Check, SquareCheck as CheckSquare, Square, Eye, Plus, Receipt, Trash2, TriangleAlert as AlertTriangle, ChevronDown, ChevronRight, Mail, FileText, Clock, Send, Users, ArrowUpRight, ArrowDownLeft, History, X } from 'lucide-react';
import { InlineLoading, KpiCard, PageHead } from '../association/AssocUI';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';
import { AssociationPaymentReconciliationModal } from './AssociationPaymentReconciliationModal';
import { SimpleReconciliationTab } from './SimpleReconciliationTab';
import { Avatar } from '../ui/Avatar';
import { NationalReportModal } from './NationalReportModal';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

const AppDropdown: React.FC<{
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  placeholder?: string;
  minWidth?: number;
}> = ({ value, options, onChange, icon, placeholder = 'Select...', minWidth = 160 }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, minWidth) });
  }, [minWidth]);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onClickOut = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current && !btnRef.current.contains(t) && menuRef.current && !menuRef.current.contains(t)) {
        setOpen(false);
      }
    };
    const onScroll = () => updatePos();
    document.addEventListener('mousedown', onClickOut);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onClickOut);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePos]);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="a-pick justify-between"
        style={{ minWidth }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon && <span className="a-dim flex flex-shrink-0">{icon}</span>}
          <span className={`truncate ${selected ? '' : 'a-dim'}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown size={14} className={`a-dim transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="a-pop"
          role="listbox"
        >
          <div className="p-1.5 max-h-[280px] overflow-y-auto overscroll-contain flex flex-col gap-0.5">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                role="option"
                aria-selected={value === opt.value}
                className={`a-pop-item justify-between ${value === opt.value ? 'a-pop-item-on' : ''}`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {opt.icon && <span className="flex flex-shrink-0 a-dim">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </span>
                {value === opt.value && <Check size={14} className="a-txt-b flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

interface ClubSummary {
  club_id: string;
  club_name: string;
  total_paid: number;
  total_outstanding: number;
  paid_count: number;
  outstanding_count: number;
}

interface MembershipRemittance {
  id: string;
  member_id: string;
  member_name: string;
  member_avatar: string | null;
  club_name: string;
  club_id: string;
  total_fee: number;
  state_contribution: number;
  national_contribution: number;
  club_to_state_status: string;
  state_to_national_status: string;
  club_to_state_paid_date: string | null;
  state_to_national_paid_date: string | null;
  membership_start_date: string;
}

interface PaymentBatch {
  id: string;
  payment_date: string;
  total_amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  reconciliation_status: string;
  payment_method: string;
  payment_reference: string;
  notes: string;
  bank_transaction_id: string;
  member_count?: number;
  from_club_id?: string;
  clubs?: {
    name: string;
  };
}

interface ReportSubmission {
  id: string;
  report_type: string;
  report_scope: string;
  membership_year: number;
  member_count: number;
  total_state_amount: number;
  total_national_amount: number;
  recipient_email: string | null;
  recipient_name: string | null;
  subject: string | null;
  created_at: string;
}

interface StateRemittanceDashboardProps {
  darkMode: boolean;
  stateAssociationId: string;
  stateAssociationName?: string;
}

export const StateRemittanceDashboard: React.FC<StateRemittanceDashboardProps> = ({
  darkMode,
  stateAssociationId,
  stateAssociationName
}) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [clubSummaries, setClubSummaries] = useState<ClubSummary[]>([]);
  const [remittances, setRemittances] = useState<MembershipRemittance[]>([]);
  const [paymentBatches, setPaymentBatches] = useState<PaymentBatch[]>([]);
  const [selectedTab, setSelectedTab] = useState<'clubs' | 'club-payments' | 'national-remittance' | 'payments'>('clubs');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedClubFilter, setSelectedClubFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentBatch | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [paymentMembers, setPaymentMembers] = useState<MembershipRemittance[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [outboundPayments, setOutboundPayments] = useState<PaymentBatch[]>([]);
  const [reportSubmissions, setReportSubmissions] = useState<ReportSubmission[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [paymentHistorySubTab, setPaymentHistorySubTab] = useState<'from-clubs' | 'to-national' | 'reports'>('from-clubs');
  const [showDeleteReportConfirm, setShowDeleteReportConfirm] = useState(false);
  const [deleteReportTargetId, setDeleteReportTargetId] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState(false);
  const [showNationalPaymentModal, setShowNationalPaymentModal] = useState(false);
  const [showSendReportPrompt, setShowSendReportPrompt] = useState(false);
  const [lastPaidCount, setLastPaidCount] = useState(0);
  const [showUnpaidWarning, setShowUnpaidWarning] = useState(false);
  const [unpaidTargetId, setUnpaidTargetId] = useState<string | null>(null);
  const [unpaidTargetName, setUnpaidTargetName] = useState('');
  const [showBulkStatusUpdateWarning, setShowBulkStatusUpdateWarning] = useState(false);
  const [bulkStatusUpdateAction, setBulkStatusUpdateAction] = useState<'mark-paid' | 'mark-unpaid' | null>(null);

  useEffect(() => {
    if (stateAssociationId) {
      loadData();
    }
  }, [stateAssociationId, selectedYear, selectedClubFilter]);

  // Reload data when switching to National Remittance tab to ensure fresh data
  useEffect(() => {
    if (selectedTab === 'national-remittance' && stateAssociationId) {
      loadRemittances();
    }
  }, [selectedTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadClubSummaries(),
        loadRemittances(),
        loadPaymentBatches(),
        loadOutboundPayments(),
        loadReportSubmissions()
      ]);
    } catch (error) {
      console.error('Error loading state remittance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadClubSummaries = async () => {
    let query = supabase
      .from('membership_remittances')
      .select(`
        club_id,
        state_contribution_amount,
        club_to_state_status,
        clubs!inner(name)
      `)
      .eq('state_association_id', stateAssociationId);

    if (selectedYear !== 'all') {
      query = query.eq('membership_year', selectedYear);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading club summaries:', error);
      return;
    }

    const summaryMap = new Map<string, ClubSummary>();

    data?.forEach((record: any) => {
      const clubId = record.club_id;
      if (!summaryMap.has(clubId)) {
        summaryMap.set(clubId, {
          club_id: clubId,
          club_name: record.clubs.name,
          total_paid: 0,
          total_outstanding: 0,
          paid_count: 0,
          outstanding_count: 0
        });
      }

      const summary = summaryMap.get(clubId)!;
      const amount = Number(record.state_contribution_amount) || 0;

      if (record.club_to_state_status === 'paid') {
        summary.total_paid += amount;
        summary.paid_count += 1;
      } else {
        summary.total_outstanding += amount;
        summary.outstanding_count += 1;
      }
    });

    setClubSummaries(Array.from(summaryMap.values()));
  };

  const loadRemittances = async () => {
    let query = supabase
      .from('membership_remittances')
      .select(`
        id,
        member_id,
        total_membership_fee,
        state_contribution_amount,
        national_contribution_amount,
        club_to_state_status,
        state_to_national_status,
        club_to_state_paid_date,
        state_to_national_paid_date,
        membership_start_date,
        membership_year,
        members!inner(id, first_name, last_name, avatar_url),
        clubs!inner(id, name)
      `)
      .eq('state_association_id', stateAssociationId)
      .order('membership_start_date', { ascending: false });

    if (selectedYear !== 'all') {
      query = query.eq('membership_year', selectedYear);
    }

    if (selectedClubFilter !== 'all') {
      query = query.eq('club_id', selectedClubFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading remittances:', error);
      return;
    }

    const formatted = data?.map((r: any) => ({
      id: r.id,
      member_id: r.members.id,
      member_name: `${r.members.first_name} ${r.members.last_name}`,
      member_avatar: r.members.avatar_url,
      club_name: r.clubs.name,
      club_id: r.clubs.id,
      total_fee: Number(r.total_membership_fee) || 0,
      state_contribution: Number(r.state_contribution_amount) || 0,
      national_contribution: Number(r.national_contribution_amount) || 0,
      club_to_state_status: r.club_to_state_status,
      state_to_national_status: r.state_to_national_status,
      club_to_state_paid_date: r.club_to_state_paid_date,
      state_to_national_paid_date: r.state_to_national_paid_date,
      membership_start_date: r.membership_start_date
    })) || [];

    setRemittances(formatted);
  };

  const loadPaymentBatches = async () => {
    let query = supabase
      .from('remittance_payments')
      .select(`
        *,
        clubs:from_club_id(name)
      `)
      .eq('to_state_id', stateAssociationId)
      .eq('to_type', 'state')
      .order('payment_date', { ascending: false });

    if (selectedYear !== 'all') {
      query = query.eq('membership_year', selectedYear);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading payment batches:', error);
      return;
    }

    setPaymentBatches((data || []) as PaymentBatch[]);
  };

  const loadOutboundPayments = async () => {
    const { data, error } = await supabase
      .from('remittance_payment_batches')
      .select('*')
      .eq('from_association_id', stateAssociationId)
      .eq('from_association_type', 'state')
      .eq('to_association_type', 'national')
      .order('payment_date', { ascending: false });

    if (!error) {
      setOutboundPayments((data || []) as PaymentBatch[]);
    }
  };

  const loadReportSubmissions = async () => {
    const { data, error } = await supabase
      .from('national_report_submissions')
      .select('*')
      .eq('state_association_id', stateAssociationId)
      .order('created_at', { ascending: false });

    if (!error) {
      setReportSubmissions((data || []) as ReportSubmission[]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    // Select ALL members, not just pending ones
    if (selectedIds.size === remittances.length && remittances.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(remittances.map(r => r.id)));
    }
  };

  const handleBulkMarkNationalPaid = () => {
    if (selectedIds.size === 0) return;
    setShowNationalPaymentModal(true);
  };

  const processNationalPayment = async (paymentDetails: { reference: string; date: string; payment_method: string; notes: string }) => {
    if (selectedIds.size === 0) return;

    setBulkActionInProgress(true);
    try {
      const selectedRemittances = remittances.filter(r => selectedIds.has(r.id));
      const totalAmount = selectedRemittances.reduce((sum, r) => sum + r.national_contribution, 0);

      const { error } = await supabase
        .from('membership_remittances')
        .update({
          state_to_national_status: 'paid',
          state_to_national_paid_date: paymentDetails.date,
          state_to_national_payment_reference: paymentDetails.reference
        })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      const paidCount = selectedIds.size;
      setLastPaidCount(paidCount);

      await loadData();
      setSelectedIds(new Set());
      setShowNationalPaymentModal(false);

      addNotification('success', `${paidCount} member${paidCount !== 1 ? 's' : ''} marked as paid to National ($${totalAmount.toFixed(2)})`);

      setShowSendReportPrompt(true);
    } catch (error: any) {
      console.error('Error processing national payment:', error);
      addNotification('error', `Failed to process payment: ${error.message}`);
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const handleRecordPayment = async (formData: any) => {
    try {
      console.log('Recording payment:', formData);

      const { data, error } = await supabase
        .from('remittance_payments')
        .insert({
          payment_reference: formData.reference,
          payment_date: formData.date,
          from_club_id: formData.from_club_id || null,
          from_type: 'club',
          to_state_id: stateAssociationId,
          to_type: 'state',
          total_amount: formData.amount,
          payment_method: formData.payment_method,
          bank_transaction_id: formData.bank_transaction_id || null,
          notes: formData.notes || null
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Payment recorded successfully:', data);

      // Reload data
      await loadData();
      setShowRecordPaymentModal(false);

      // Show success message
      alert(`Payment recorded successfully! Amount: $${formData.amount}\n\nThe payment has been added to Payment History and a deposit transaction has been created in your Finance Management.\n\nClick "Reconcile" on the payment to match it to member remittances.`);
    } catch (error: any) {
      console.error('Error recording payment:', error);
      alert('Failed to record payment: ' + (error.message || 'Unknown error. Please check console for details.'));
    }
  };

  const handleOpenReconciliation = (payment: PaymentBatch) => {
    setSelectedPayment(payment);
    setShowReconciliationModal(true);
  };

  const loadPaymentMembers = async (payment: PaymentBatch) => {
    try {
      // Load all remittances that match this payment reference
      const { data, error } = await supabase
        .from('membership_remittances')
        .select(`
          id,
          member_id,
          club_id,
          state_contribution_amount,
          national_contribution_amount,
          members (
            id,
            first_name,
            last_name,
            email,
            avatar_url
          ),
          clubs (
            name
          )
        `)
        .eq('club_to_state_payment_reference', payment.payment_reference)
        .eq('club_to_state_status', 'paid');

      if (error) throw error;

      const formattedData = (data || []).map(r => ({
        id: r.id,
        member_id: r.member_id,
        member_name: `${r.members?.first_name} ${r.members?.last_name}`,
        member_avatar: r.members?.avatar_url || null,
        club_name: r.clubs?.name || '',
        club_id: r.club_id,
        total_fee: r.state_contribution_amount + r.national_contribution_amount,
        state_contribution: r.state_contribution_amount,
        national_contribution: r.national_contribution_amount,
        club_to_state_status: 'paid',
        state_to_national_status: 'pending',
        club_to_state_paid_date: payment.payment_date,
        state_to_national_paid_date: null,
        membership_start_date: ''
      }));

      setPaymentMembers(formattedData);
    } catch (error) {
      console.error('Error loading payment members:', error);
    }
  };

  const togglePaymentExpansion = async (paymentId: string, payment: PaymentBatch) => {
    if (expandedPaymentId === paymentId) {
      setExpandedPaymentId(null);
      setPaymentMembers([]);
    } else {
      setExpandedPaymentId(paymentId);
      await loadPaymentMembers(payment);
    }
  };

  const handleReconciliationComplete = () => {
    setShowReconciliationModal(false);
    setSelectedPayment(null);
    loadData();
  };

  const handleDeletePayment = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('remittance_payments')
        .delete()
        .eq('id', deleteTargetId);

      if (error) throw error;

      addNotification('success', 'Payment record deleted successfully');
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      if (expandedPaymentId === deleteTargetId) {
        setExpandedPaymentId(null);
        setPaymentMembers([]);
      }
      await loadData();
    } catch (error: any) {
      addNotification('error', `Failed to delete payment: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleClearAllPayments = async () => {
    setDeleting(true);
    try {
      let query = supabase
        .from('remittance_payments')
        .delete()
        .eq('to_state_id', stateAssociationId)
        .eq('to_type', 'state');

      if (selectedYear !== 'all') {
        query = query.eq('membership_year', selectedYear);
      }

      const { error } = await query;

      if (error) throw error;

      addNotification('success', `All payment records cleared successfully`);
      setShowClearAllConfirm(false);
      setExpandedPaymentId(null);
      setPaymentMembers([]);
      await loadData();
    } catch (error: any) {
      addNotification('error', `Failed to clear payments: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteReport = async () => {
    if (!deleteReportTargetId) return;
    setDeletingReport(true);
    try {
      const { error } = await supabase
        .from('national_report_submissions')
        .delete()
        .eq('id', deleteReportTargetId);

      if (error) throw error;

      addNotification('success', 'Report log deleted successfully');
      setShowDeleteReportConfirm(false);
      setDeleteReportTargetId(null);
      await loadReportSubmissions();
    } catch (error: any) {
      addNotification('error', `Failed to delete report: ${error.message}`);
    } finally {
      setDeletingReport(false);
    }
  };

  const handleToggleClubStatus = async (remittanceId: string, currentStatus: string) => {
    try{
      const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('membership_remittances')
        .update({
          club_to_state_status: newStatus,
          club_to_state_paid_date: newStatus === 'paid' ? today : null
        })
        .eq('id', remittanceId);

      if (error) throw error;

      await loadData();
    } catch (error: any) {
      console.error('Error updating club status:', error);
    }
  };

  const handleToggleNationalStatus = async (remittanceId: string, currentStatus: string) => {
    if (currentStatus === 'paid') {
      const rem = remittances.find(r => r.id === remittanceId);
      setUnpaidTargetId(remittanceId);
      setUnpaidTargetName(rem?.member_name || 'this member');
      setShowUnpaidWarning(true);
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('membership_remittances')
        .update({
          state_to_national_status: 'paid',
          state_to_national_paid_date: today
        })
        .eq('id', remittanceId);

      if (error) throw error;

      addNotification('success', 'Member marked as paid to National');
      await loadData();

      setLastPaidCount(1);
      setShowSendReportPrompt(true);
    } catch (error: any) {
      console.error('Error updating national status:', error);
      addNotification('error', 'Failed to update status');
    }
  };

  const confirmUnpaidNational = async () => {
    if (!unpaidTargetId) return;
    try {
      const { data: remittance } = await supabase
        .from('membership_remittances')
        .select('national_contribution_amount, state_to_national_paid_date, state_to_national_payment_reference, state_association_id, national_association_id')
        .eq('id', unpaidTargetId)
        .maybeSingle();

      if (remittance) {
        let batchQuery = supabase
          .from('remittance_payment_batches')
          .select('id, member_count, total_amount')
          .eq('from_association_id', remittance.state_association_id)
          .eq('to_association_id', remittance.national_association_id);

        if (remittance.state_to_national_paid_date) {
          batchQuery = batchQuery.eq('payment_date', remittance.state_to_national_paid_date);
        }
        if (remittance.state_to_national_payment_reference) {
          batchQuery = batchQuery.eq('payment_reference', remittance.state_to_national_payment_reference);
        } else {
          batchQuery = batchQuery.is('payment_reference', null);
        }

        const { data: batch } = await batchQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (batch && batch.member_count > 1) {
          const newAmount = batch.total_amount - (remittance.national_contribution_amount || 0);
          const newCount = batch.member_count - 1;

          await supabase
            .from('remittance_payment_batches')
            .update({ total_amount: newAmount, member_count: newCount })
            .eq('id', batch.id);

          await supabase
            .from('association_transactions')
            .update({
              amount: newAmount,
              description: `Membership Remittance to National Association - ${newCount} member${newCount !== 1 ? 's' : ''}`
            })
            .eq('batch_id', batch.id)
            .eq('association_id', remittance.state_association_id)
            .eq('type', 'expense');

          await supabase
            .from('association_transactions')
            .update({
              amount: newAmount,
              description: `Membership Remittance from State Association - ${newCount} member${newCount !== 1 ? 's' : ''}`
            })
            .eq('batch_id', batch.id)
            .eq('association_id', remittance.national_association_id)
            .eq('type', 'income');
        } else if (batch) {
          await supabase
            .from('association_transactions')
            .delete()
            .eq('batch_id', batch.id);

          await supabase
            .from('remittance_payment_batches')
            .delete()
            .eq('id', batch.id);
        } else {
          await supabase
            .from('association_transactions')
            .delete()
            .eq('linked_entity_type', 'remittance')
            .eq('linked_entity_id', unpaidTargetId);
        }
      }

      const { error } = await supabase
        .from('membership_remittances')
        .update({
          state_to_national_status: 'pending',
          state_to_national_paid_date: null,
          state_to_national_payment_reference: null
        })
        .eq('id', unpaidTargetId);

      if (error) throw error;

      addNotification('success', 'Member reverted to pending and finance entries adjusted');
      setShowUnpaidWarning(false);
      setUnpaidTargetId(null);
      setUnpaidTargetName('');
      await loadData();
    } catch (error: any) {
      console.error('Error reverting national status:', error);
      addNotification('error', `Failed to revert: ${error.message}`);
    }
  };

  const handleBulkStatusUpdate = (action: 'mark-paid' | 'mark-unpaid') => {
    if (selectedIds.size === 0) return;
    setBulkStatusUpdateAction(action);
    setShowBulkStatusUpdateWarning(true);
  };

  const confirmBulkStatusUpdate = async () => {
    if (!bulkStatusUpdateAction || selectedIds.size === 0) return;

    try {
      setBulkActionInProgress(true);
      const selectedRemittances = remittances.filter(r => selectedIds.has(r.id));

      if (bulkStatusUpdateAction === 'mark-paid') {
        const today = new Date().toISOString().split('T')[0];

        // Update all selected remittances to paid
        const { error } = await supabase
          .from('membership_remittances')
          .update({
            state_to_national_status: 'paid',
            state_to_national_paid_date: today
          })
          .in('id', Array.from(selectedIds));

        if (error) throw error;

        addNotification('success', `${selectedIds.size} member${selectedIds.size !== 1 ? 's' : ''} marked as paid to National`);

        setLastPaidCount(selectedIds.size);
        setShowSendReportPrompt(true);

      } else if (bulkStatusUpdateAction === 'mark-unpaid') {
        // Revert all selected remittances to pending
        for (const remittance of selectedRemittances) {
          // Clean up financial transactions for each remittance
          const { data: remittanceData } = await supabase
            .from('membership_remittances')
            .select('national_contribution_amount, state_to_national_paid_date, state_to_national_payment_reference, state_association_id, national_association_id')
            .eq('id', remittance.id)
            .maybeSingle();

          if (remittanceData) {
            let batchQuery = supabase
              .from('remittance_payment_batches')
              .select('id, member_count, total_amount')
              .eq('from_association_id', remittanceData.state_association_id)
              .eq('to_association_id', remittanceData.national_association_id);

            if (remittanceData.state_to_national_paid_date) {
              batchQuery = batchQuery.eq('payment_date', remittanceData.state_to_national_paid_date);
            }
            if (remittanceData.state_to_national_payment_reference) {
              batchQuery = batchQuery.eq('payment_reference', remittanceData.state_to_national_payment_reference);
            } else {
              batchQuery = batchQuery.is('payment_reference', null);
            }

            const { data: batch } = await batchQuery
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (batch && batch.member_count > 1) {
              const newAmount = batch.total_amount - (remittanceData.national_contribution_amount || 0);
              const newCount = batch.member_count - 1;

              await supabase
                .from('remittance_payment_batches')
                .update({ total_amount: newAmount, member_count: newCount })
                .eq('id', batch.id);

              await supabase
                .from('association_transactions')
                .delete()
                .eq('linked_entity_type', 'remittance')
                .eq('linked_entity_id', remittance.id);
            } else if (batch) {
              await supabase
                .from('association_transactions')
                .delete()
                .eq('batch_id', batch.id);

              await supabase
                .from('remittance_payment_batches')
                .delete()
                .eq('id', batch.id);
            } else {
              await supabase
                .from('association_transactions')
                .delete()
                .eq('linked_entity_type', 'remittance')
                .eq('linked_entity_id', remittance.id);
            }
          }
        }

        // Update all selected remittances to pending
        const { error } = await supabase
          .from('membership_remittances')
          .update({
            state_to_national_status: 'pending',
            state_to_national_paid_date: null,
            state_to_national_payment_reference: null
          })
          .in('id', Array.from(selectedIds));

        if (error) throw error;

        addNotification('success', `${selectedIds.size} member${selectedIds.size !== 1 ? 's' : ''} reverted to pending and finance entries adjusted`);
      }

      setShowBulkStatusUpdateWarning(false);
      setBulkStatusUpdateAction(null);
      setSelectedIds(new Set());
      await loadData();

    } catch (error: any) {
      console.error('Error updating bulk status:', error);
      addNotification('error', `Failed to update status: ${error.message}`);
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const totalFromClubs = clubSummaries.reduce((sum, club) => sum + club.total_paid, 0);
  const totalOutstanding = clubSummaries.reduce((sum, club) => sum + club.total_outstanding, 0);
  const totalPaidMembers = clubSummaries.reduce((sum, club) => sum + club.paid_count, 0);

  const nationalOwed = remittances
    .filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending')
    .reduce((sum, r) => sum + r.national_contribution, 0);

  const totalPaidToNational = paymentBatches.reduce((sum, batch) => sum + Number(batch.total_amount), 0);

  const availableYears = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - i
  );

  const uniqueClubs = Array.from(
    new Set(remittances.map(r => r.club_id))
  ).map(clubId => {
    const remittance = remittances.find(r => r.club_id === clubId);
    return {
      id: clubId,
      name: remittance?.club_name || ''
    };
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-[22px]">
        <PageHead icon={<DollarSign size={24} />} title="Remittances" sub="Gathering club data, payments and reconciliation status…" />
        <InlineLoading label="Loading remittances…" />
      </div>
    );
  }

  const readyForNational = remittances.filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending').length;
  const tabs: { id: typeof selectedTab; label: string; count: number; onSelect: () => void }[] = [
    { id: 'clubs', label: 'Clubs', count: clubSummaries.length, onSelect: () => { setSelectedTab('clubs'); setSelectedClubFilter('all'); } },
    { id: 'club-payments', label: 'Club payments', count: remittances.filter(r => r.club_to_state_status === 'pending').length, onSelect: () => { setSelectedTab('club-payments'); if (selectedClubFilter !== 'all') setSelectedClubFilter('all'); } },
    { id: 'national-remittance', label: 'National remittance', count: readyForNational, onSelect: () => setSelectedTab('national-remittance') },
    { id: 'payments', label: 'Payment history', count: paymentBatches.length, onSelect: () => setSelectedTab('payments') },
  ];

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHead
        icon={<DollarSign size={24} />}
        title="Remittances"
        sub={`Membership fees from clubs${stateAssociationName ? ` to ${stateAssociationName}` : ''}, and on to the national association`}
      >
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="a-btn"
          title="Refresh"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </PageHead>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard cap="Outstanding from clubs" value={`$${totalOutstanding.toFixed(2)}`} sub="Fees clubs still owe" icon={<TrendingUp size={18} />} tone={totalOutstanding > 0 ? 'red' : undefined} />
        <KpiCard cap="Owed to national" value={`$${nationalOwed.toFixed(2)}`} sub="Collected, not yet paid on" icon={<ArrowRight size={18} />} tone={nationalOwed > 0 ? 'amber' : undefined} />
        <KpiCard cap="Members to remit" value={readyForNational} sub="Paid by their club, waiting for national" icon={<CheckCircle size={18} />} />
        <KpiCard cap="Member clubs" value={clubSummaries.length} sub="Clubs with members this year" icon={<Building2 size={18} />} />
      </div>

      {/* Quick Action */}
      {nationalOwed > 0 && (
        <div className="a-note" style={{ borderColor: 'rgba(48,209,88,0.3)', background: 'rgba(48,209,88,0.06)' }}>
          <span className="a-tile a-tile-sm a-txt-g"><ArrowRight size={16} /></span>
          <span className="flex-1 min-w-0">
            <span className="block a-ink text-[14px] font-semibold">Ready to pay ${nationalOwed.toFixed(2)} to the national association</span>
            <span className="block a-dim text-xs mt-0.5">{readyForNational} member{readyForNational === 1 ? '' : 's'} ready to remit</span>
          </span>
          <button
            type="button"
            onClick={() => {
              const readyIds = remittances
                .filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending')
                .map(r => r.id);
              setSelectedIds(new Set(readyIds));
              setSelectedTab('national-remittance');
            }}
            className="a-btn a-btn-p"
          >
            <ArrowRight size={16} />
            Pay national
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="a-seg self-start" role="tablist" aria-label="Remittances">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selectedTab === t.id}
            onClick={t.onSelect}
            className={`a-seg-i ${selectedTab === t.id ? 'a-seg-on' : ''}`}
          >
            {t.label}
            <span className="a-cnt">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="a-card overflow-hidden">
        {/* Tab Content */}
        <div className="p-6">
          {/* Clubs Tab */}
          {selectedTab === 'clubs' && (
            <div>
              <div className="mb-5">
                <AppDropdown
                  value={String(selectedYear)}
                  onChange={(v) => setSelectedYear(v === 'all' ? 'all' : Number(v))}
                  icon={<Calendar size={15} />}
                  options={[
                    { value: 'all', label: 'All Years', icon: <Calendar size={14} className="a-mute" /> },
                    ...availableYears.map(year => ({
                      value: String(year),
                      label: String(year),
                      icon: <Calendar size={14} className="a-txt-b" />
                    }))
                  ]}
                  minWidth={160}
                />
              </div>

              <div className="a-grp">
                {clubSummaries.length === 0 ? (
                  <div className="a-empty py-12">
                    <span className="a-tile" style={{ width: 56, height: 56 }}><Building2 size={24} /></span>
                    <p className="a-mute text-sm m-0">No club remittances for this year</p>
                  </div>
                ) : (
                  clubSummaries.map((club) => (
                    <div
                      key={club.club_id}
                      onClick={() => {
                        setSelectedClubFilter(club.club_id);
                        setSelectedTab('club-payments');
                      }}
                      className="a-lnk a-hov-row cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedClubFilter(club.club_id); setSelectedTab('club-payments'); } }}
                    >
                      <span className="a-tile a-tile-sm"><Building2 size={16} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block a-ink text-[14.5px] font-semibold truncate">{club.club_name}</span>
                        <span className="a-meta-row mt-1">
                          <span><span className="a-light a-light-g" />Paid <b className="a-ink a-num">${club.total_paid.toFixed(2)}</b> ({club.paid_count})</span>
                          <span className={club.total_outstanding > 0 ? 'a-txt-r' : ''}><span className={`a-light ${club.total_outstanding > 0 ? 'a-light-r' : ''}`} />Outstanding <b className="a-num">${club.total_outstanding.toFixed(2)}</b> ({club.outstanding_count})</span>
                        </span>
                      </span>
                      <ChevronRight size={18} className="a-dim" />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Club Payments Tab - Reconcile payments FROM clubs */}
          {selectedTab === 'club-payments' && (
            <SimpleReconciliationTab
              darkMode={darkMode}
              stateAssociationId={stateAssociationId}
              selectedYear={selectedYear}
              selectedClubFilter={selectedClubFilter}
            />
          )}

          {/* National Remittance Tab - Track payments TO National */}
          {selectedTab === 'national-remittance' && (
            <div>
              {/* Bulk Actions Toolbar */}
              {selectedIds.size > 0 && (
                <div className="a-bulkbar mb-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <CheckSquare className="w-5 h-5 a-txt-b" />
                      <span className="a-ink font-semibold text-sm">
                        {selectedIds.size} member{selectedIds.size !== 1 ? 's' : ''} selected
                      </span>
                      <span className="text-sm a-txt-g font-semibold a-num">
                        ${remittances.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + r.national_contribution, 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleBulkStatusUpdate('mark-paid')}
                        disabled={bulkActionInProgress}
                        className="a-btn a-btn-g a-btn-sm"
                      >
                        <CheckCircle size={16} />
                        Mark as paid
                      </button>
                      <button
                        onClick={() => handleBulkStatusUpdate('mark-unpaid')}
                        disabled={bulkActionInProgress}
                        className="a-btn a-btn-a a-btn-sm"
                      >
                        <X size={16} />
                        Mark as unpaid
                      </button>
                      <button
                        onClick={handleBulkMarkNationalPaid}
                        disabled={bulkActionInProgress}
                        className="a-btn a-btn-p a-btn-sm"
                      >
                        <DollarSign size={16} />
                        Process payment
                      </button>
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="a-btn a-btn-q a-btn-sm"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <AppDropdown
                  value={String(selectedYear)}
                  onChange={(v) => setSelectedYear(v === 'all' ? 'all' : Number(v))}
                  icon={<Calendar size={15} />}
                  options={[
                    { value: 'all', label: 'All Years', icon: <Calendar size={14} className="a-mute" /> },
                    ...availableYears.map(year => ({
                      value: String(year),
                      label: String(year),
                      icon: <Calendar size={14} className="a-txt-b" />
                    }))
                  ]}
                  minWidth={160}
                />
                <AppDropdown
                  value={selectedClubFilter}
                  onChange={(v) => setSelectedClubFilter(v)}
                  icon={<Building2 size={15} />}
                  options={[
                    { value: 'all', label: 'All Clubs', icon: <Building2 size={14} className="a-mute" /> },
                    ...uniqueClubs.map(club => ({
                      value: club.id,
                      label: club.name,
                      icon: <Building2 size={14} className="a-txt-b" />
                    }))
                  ]}
                  minWidth={200}
                />
                <button
                  onClick={toggleSelectAll}
                  className="a-btn"
                >
                  <CheckSquare size={15} className="a-mute" />
                  {selectedIds.size === remittances.length && remittances.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Members Table */}
              <div className="overflow-x-auto">
                <table className="w-full a-atable">
                  <thead>
                    <tr>
                      <th className="text-left py-3 px-4">Member</th>
                      <th className="text-left py-3 px-4">Club</th>
                      <th className="text-right py-3 px-4">State Fee</th>
                      <th className="text-center py-3 px-4">State Status</th>
                      <th className="text-right py-3 px-4">National Fee</th>
                      <th className="text-center py-3 px-4">National Status</th>
                      <th className="text-center py-3 px-4">
                        {(() => {
                          if (remittances.length === 0) return 'Select';
                          const allSelected = remittances.length > 0 && remittances.every(r => selectedIds.has(r.id));
                          return (
                            <button onClick={toggleSelectAll} className="p-1 mx-auto block" title={allSelected ? 'Deselect All' : 'Select All'}>
                              {allSelected ? (
                                <CheckSquare className="w-5 h-5 a-txt-b" />
                              ) : (
                                <Square className="w-5 h-5 a-dim" />
                              )}
                            </button>
                          );
                        })()}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {remittances.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12">
                          <p className="a-mute text-sm">No remittances found</p>
                        </td>
                      </tr>
                    ) : (
                      remittances.map((remittance) => {
                        const isEligible = remittance.club_to_state_status === 'paid' && remittance.state_to_national_status === 'pending';
                        const isSelected = selectedIds.has(remittance.id);
                        return (
                          <tr key={remittance.id} className={isSelected ? 'is-sel' : ''}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  imageUrl={remittance.member_avatar}
                                  firstName={remittance.member_name.split(' ')[0]}
                                  lastName={remittance.member_name.split(' ').slice(1).join(' ')}
                                  size="sm"
                                />
                                <span className="a-ink font-medium whitespace-nowrap">{remittance.member_name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 a-mute">{remittance.club_name}</td>
                            <td className="py-3 px-4 text-right a-ink a-num">${remittance.state_contribution.toFixed(2)}</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => handleToggleClubStatus(remittance.id, remittance.club_to_state_status)}
                                className={`a-lb-fmt cursor-pointer ${remittance.club_to_state_status === 'paid' ? 'a-txt-g' : 'a-txt-a'}`}
                                title="Click to toggle status"
                              >
                                <span className={`a-light ${remittance.club_to_state_status === 'paid' ? 'a-light-g' : 'a-light-a'}`} />{remittance.club_to_state_status === 'paid' ? 'Paid' : 'Pending'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right a-ink a-num">${remittance.national_contribution.toFixed(2)}</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => handleToggleNationalStatus(remittance.id, remittance.state_to_national_status)}
                                className={`a-lb-fmt cursor-pointer ${remittance.state_to_national_status === 'paid' ? 'a-txt-g' : 'a-txt-a'}`}
                                title="Click to toggle status"
                              >
                                <span className={`a-light ${remittance.state_to_national_status === 'paid' ? 'a-light-g' : 'a-light-a'}`} />{remittance.state_to_national_status === 'paid' ? 'Paid' : 'Pending'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => toggleSelection(remittance.id)}
                                className="p-1"
                              >
                                {selectedIds.has(remittance.id) ? (
                                  <CheckSquare className="w-5 h-5 a-txt-b" />
                                ) : (
                                  <Square className="w-5 h-5 a-dim" />
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payment History Tab */}
          {selectedTab === 'payments' && (
            <div>
              {/* Sub-tab navigation */}
              <div className="a-seg mb-6 w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Payment history">
                <button
                  onClick={() => setPaymentHistorySubTab('from-clubs')}
                  role="tab"
                  aria-selected={paymentHistorySubTab === 'from-clubs'}
                  className={`a-seg-i ${paymentHistorySubTab === 'from-clubs' ? 'a-seg-on' : ''}`}
                >
                  <ArrowDownLeft size={16} />
                  Received from Clubs
                  <span className="a-cnt">
                    {paymentBatches.length}
                  </span>
                </button>
                <button
                  onClick={() => setPaymentHistorySubTab('to-national')}
                  role="tab"
                  aria-selected={paymentHistorySubTab === 'to-national'}
                  className={`a-seg-i ${paymentHistorySubTab === 'to-national' ? 'a-seg-on' : ''}`}
                >
                  <ArrowUpRight size={16} />
                  Paid to National
                  <span className="a-cnt">
                    {outboundPayments.length}
                  </span>
                </button>
                <button
                  onClick={() => setPaymentHistorySubTab('reports')}
                  role="tab"
                  aria-selected={paymentHistorySubTab === 'reports'}
                  className={`a-seg-i ${paymentHistorySubTab === 'reports' ? 'a-seg-on' : ''}`}
                >
                  <FileText size={16} />
                  National Reports
                  <span className="a-cnt">
                    {reportSubmissions.length}
                  </span>
                </button>
              </div>

              {/* Filters Row */}
              <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
                <div className="flex items-center gap-3">
                  <AppDropdown
                    value={String(selectedYear)}
                    onChange={(v) => setSelectedYear(v === 'all' ? 'all' : Number(v))}
                    icon={<Calendar size={15} />}
                    options={[
                      { value: 'all', label: 'All Years', icon: <Calendar size={14} className="a-mute" /> },
                      ...availableYears.map(year => ({
                        value: String(year),
                        label: String(year),
                        icon: <Calendar size={14} className="a-txt-b" />
                      }))
                    ]}
                    minWidth={160}
                  />
                </div>

                <div className="flex items-center gap-2">
                  {paymentHistorySubTab === 'from-clubs' && paymentBatches.length > 0 && (
                    <button
                      onClick={() => setShowClearAllConfirm(true)}
                      className="a-btn a-btn-d a-btn-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  )}
                  {paymentHistorySubTab === 'reports' && (
                    <button
                      onClick={() => setShowReportModal(true)}
                      className="a-btn a-btn-p"
                    >
                      <Send size={16} />
                      Generate Report
                    </button>
                  )}
                </div>
              </div>

              {/* From Clubs sub-tab */}
              {paymentHistorySubTab === 'from-clubs' && (
                <>
                  {paymentBatches.length === 0 ? (
                    <div className="a-empty py-12">
                      <span className="a-tile" style={{ width: 56, height: 56 }}><ArrowDownLeft size={24} /></span>
                      <p className="a-ink text-[15px] font-semibold m-0">No payments received from clubs</p>
                      <p className="text-sm a-dim">Payments appear here when reconciling member remittances</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="a-box a-box-on p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowDownLeft size={16} className="a-txt-b" />
                            <p className="text-sm a-txt-b font-medium">Total Received from Clubs</p>
                          </div>
                          <p className="text-2xl font-bold a-ink">
                            ${paymentBatches.reduce((sum, b) => sum + Number(b.total_amount), 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="a-box p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Receipt size={16} className="a-mute" />
                            <p className="text-sm a-mute font-medium">Total Transactions</p>
                          </div>
                          <p className="text-2xl font-bold a-ink">{paymentBatches.length}</p>
                        </div>
                      </div>

                      {paymentBatches.map((batch) => {
                        const progressPercent = (batch.allocated_amount / batch.total_amount) * 100;
                        const isFullyReconciled = batch.reconciliation_status === 'completed';
                        const isPartial = batch.reconciliation_status === 'partial';

                        return (
                          <div
                            key={batch.id}
                            className={`a-box p-5 ${isFullyReconciled ? 'a-box-ok' : isPartial ? 'a-box-on' : ''}`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className={`a-tile a-tile-sm ${isFullyReconciled ? 'a-txt-g' : 'a-txt-b'}`}>
                                    <Receipt className="w-4 h-4" />
                                  </span>
                                  <span className="a-ink font-semibold text-lg">{batch.payment_reference}</span>
                                  {isFullyReconciled && (
                                    <span className="a-lb-fmt a-txt-g flex gap-1">
                                      <CheckCircle className="w-3 h-3" /> Reconciled
                                    </span>
                                  )}
                                  {isPartial && (
                                    <span className="a-lb-fmt a-txt-b">Partial</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm a-mute">
                                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{new Date(batch.payment_date).toLocaleDateString()}</span>
                                  {batch.clubs?.name && <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{batch.clubs.name}</span>}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold a-ink">${Number(batch.total_amount).toFixed(2)}</p>
                                <p className="text-xs a-mute mt-1">{batch.payment_method || 'Transfer'}</p>
                              </div>
                            </div>

                            {!isFullyReconciled && (
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs a-mute">Reconciliation Progress</span>
                                  <span className="text-xs font-medium a-ink">{progressPercent.toFixed(0)}%</span>
                                </div>
                                <div className="a-progress" style={{ height: 6 }}>
                                  <i style={{ width: `${Math.min(100, progressPercent)}%` }} />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-slate-600/50">
                              <div className="flex-1 text-xs a-mute">
                                {batch.bank_transaction_id && <span>Ref: {batch.bank_transaction_id}</span>}
                                {batch.notes && <span className="ml-3">{batch.notes}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {batch.from_club_id && (
                                  <button onClick={() => togglePaymentExpansion(batch.id, batch)} className="a-btn a-btn-sm">
                                    <Eye className="w-3.5 h-3.5" />
                                    {expandedPaymentId === batch.id ? 'Hide' : 'View'} Members
                                  </button>
                                )}
                                {!isFullyReconciled && (
                                  <button onClick={() => handleOpenReconciliation(batch)} className="a-btn a-btn-p a-btn-sm">
                                    <CheckSquare className="w-3.5 h-3.5" /> Reconcile
                                  </button>
                                )}
                                <button onClick={() => { setDeleteTargetId(batch.id); setShowDeleteConfirm(true); }} className="a-ib a-ib-d" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {expandedPaymentId === batch.id && (
                              <div className="mt-4 pt-4 border-t border-slate-600/50">
                                <h4 className="text-sm font-medium a-ink mb-3">Members in this Payment</h4>
                                {paymentMembers.length > 0 ? (
                                  <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {paymentMembers.map((member) => (
                                      <div key={member.id} className="a-box flex items-center justify-between p-3">
                                        <div className="flex items-center gap-3">
                                          <Avatar name={member.member_name} size="sm" imageUrl={member.member_avatar} />
                                          <div>
                                            <p className="text-sm font-medium a-ink">{member.member_name}</p>
                                            <p className="text-xs a-mute">{member.club_name}</p>
                                          </div>
                                        </div>
                                        <span className="text-sm font-medium a-txt-g">${member.state_contribution.toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    <span className="ml-2 text-sm a-mute">Loading members...</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* To National sub-tab */}
              {paymentHistorySubTab === 'to-national' && (
                <>
                  {outboundPayments.length === 0 ? (
                    <div className="a-empty py-12">
                      <span className="a-tile" style={{ width: 56, height: 56 }}><ArrowUpRight size={24} /></span>
                      <p className="a-ink text-[15px] font-semibold m-0">No payments made to National yet</p>
                      <p className="text-sm a-dim">Payments to National appear here when you mark remittances as paid</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="a-box a-box-ok p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <ArrowUpRight size={16} className="a-txt-g" />
                          <p className="text-sm a-txt-g font-medium">Total Paid to National{selectedYear !== 'all' ? ` in ${selectedYear}` : ''}</p>
                        </div>
                        <p className="text-2xl font-bold a-ink">
                          ${outboundPayments.reduce((sum, b) => sum + Number(b.total_amount), 0).toFixed(2)}
                        </p>
                      </div>

                      {outboundPayments.map((batch) => (
                        <div key={batch.id} className="a-box a-box-ok p-5">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <div className="a-tile a-tile-sm">
                                  <ArrowUpRight className="w-4 h-4 a-txt-g" />
                                </div>
                                <span className="a-ink font-semibold">{batch.payment_reference}</span>
                              </div>
                              <div className="flex items-center gap-3 text-sm a-mute">
                                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{new Date(batch.payment_date).toLocaleDateString()}</span>
                                <span className="flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" />{batch.payment_method || 'Transfer'}</span>
                                {batch.member_count && (
                                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{batch.member_count} member{batch.member_count !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                            <p className="text-xl font-bold a-txt-g">${Number(batch.total_amount).toFixed(2)}</p>
                          </div>
                          {batch.notes && <p className="text-xs a-mute mt-3 pt-3 border-t border-slate-600/30">{batch.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* National Reports sub-tab */}
              {paymentHistorySubTab === 'reports' && (
                <>
                  {/* Hero prompt when no reports */}
                  {reportSubmissions.length === 0 ? (
                    <div className="text-center py-12">
                      <span className="a-tile a-tile-rim mx-auto mb-5" style={{ width: 60, height: 60 }}>
                        <FileText size={26} />
                      </span>
                      <p className="text-lg a-ink font-semibold mb-2">National Member Reports</p>
                      <p className="text-sm a-mute max-w-md mx-auto mb-6">
                        Generate and send reports of paid members to your National Association. Track which members have been reported to avoid duplicates.
                      </p>
                      <button
                        onClick={() => setShowReportModal(true)}
                        className="a-btn a-btn-p mx-auto"
                      >
                        <Send size={18} />
                        Generate First Report
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="a-box p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText size={16} className="a-txt-t" />
                            <p className="text-xs a-txt-t font-medium">Reports Sent</p>
                          </div>
                          <p className="text-2xl font-bold a-ink">{reportSubmissions.length}</p>
                        </div>
                        <div className="a-box p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Users size={16} className="a-mute" />
                            <p className="text-xs a-mute font-medium">Members Reported</p>
                          </div>
                          <p className="text-2xl font-bold a-ink">{reportSubmissions.reduce((sum, r) => sum + r.member_count, 0)}</p>
                        </div>
                        <div className="a-box p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <History size={16} className="a-mute" />
                            <p className="text-xs a-mute font-medium">Last Report</p>
                          </div>
                          <p className="text-sm font-semibold a-ink mt-1">
                            {new Date(reportSubmissions[0]?.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {/* Report History */}
                      {reportSubmissions.map((report) => (
                        <div key={report.id} className="a-box p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <span className="a-tile">
                                {report.report_type === 'email' ? <Mail size={18} /> : <Download size={18} />}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="a-ink font-semibold">
                                    {report.report_type === 'email' ? 'Emailed to National' : 'Downloaded Report'}
                                  </p>
                                  <span className={`a-lb-fmt ${report.report_scope === 'new_since_last' ? 'a-txt-a' : 'a-txt-t'}`}>
                                    {report.report_scope === 'new_since_last' ? 'Incremental' : report.report_scope === 'all' ? 'Full List' : 'Custom'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs a-mute">
                                  <span className="flex items-center gap-1"><Calendar size={12} />{new Date(report.created_at).toLocaleString()}</span>
                                  {report.recipient_email && <span className="flex items-center gap-1"><Mail size={12} />{report.recipient_email}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-lg font-bold a-ink">{report.member_count} members</p>
                                <p className="text-xs a-mute">
                                  State: ${Number(report.total_state_amount).toFixed(2)} / National: ${Number(report.total_national_amount).toFixed(2)}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  setDeleteReportTargetId(report.id);
                                  setShowDeleteReportConfirm(true);
                                }}
                                className="a-ib a-ib-d"
                                title="Delete report log"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                          {report.subject && <p className="text-xs a-mute mt-2 px-3 py-2 rounded-lg a-box">{report.subject}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {showRecordPaymentModal && (
        <RecordPaymentModal
          darkMode={darkMode}
          onClose={() => setShowRecordPaymentModal(false)}
          onSubmit={handleRecordPayment}
          clubSummaries={clubSummaries}
        />
      )}

      {/* Reconciliation Modal */}
      {showReconciliationModal && selectedPayment && (
        <AssociationPaymentReconciliationModal
          darkMode={darkMode}
          payment={selectedPayment}
          associationId={stateAssociationId}
          associationType="state"
          onClose={() => {
            setShowReconciliationModal(false);
            setSelectedPayment(null);
          }}
          onComplete={handleReconciliationComplete}
        />
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteTargetId(null);
        }}
        onConfirm={handleDeletePayment}
        title="Delete Payment Record"
        message="Are you sure you want to delete this payment record? This action cannot be undone. The associated remittance statuses will not be affected."
        confirmText={deleting ? 'Deleting...' : 'Delete Payment'}
        darkMode={darkMode}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={handleClearAllPayments}
        title="Clear All Payment Records"
        message={`Are you sure you want to delete all ${paymentBatches.length} payment record${paymentBatches.length !== 1 ? 's' : ''}${selectedYear !== 'all' ? ` for ${selectedYear}` : ''}? This action cannot be undone. The associated remittance statuses will not be affected.`}
        confirmText={deleting ? 'Clearing...' : `Clear All (${paymentBatches.length})`}
        darkMode={darkMode}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showDeleteReportConfirm}
        onClose={() => {
          setShowDeleteReportConfirm(false);
          setDeleteReportTargetId(null);
        }}
        onConfirm={handleDeleteReport}
        title="Delete Report Log"
        message="Are you sure you want to delete this report log entry? This will remove the record from your report history. Members included in this report will be treated as unreported."
        confirmText={deletingReport ? 'Deleting...' : 'Delete Report'}
        darkMode={darkMode}
        variant="danger"
      />

      {showReportModal && (
        <NationalReportModal
          darkMode={darkMode}
          stateAssociationId={stateAssociationId}
          stateAssociationName={stateAssociationName || ''}
          selectedYear={selectedYear}
          onClose={() => setShowReportModal(false)}
          onComplete={() => {
            setShowReportModal(false);
            loadData();
          }}
        />
      )}

      {showNationalPaymentModal && (
        <NationalPaymentModal
          darkMode={darkMode}
          selectedCount={selectedIds.size}
          totalAmount={remittances.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + r.national_contribution, 0)}
          selectedMembers={remittances.filter(r => selectedIds.has(r.id))}
          processing={bulkActionInProgress}
          onClose={() => setShowNationalPaymentModal(false)}
          onSubmit={processNationalPayment}
        />
      )}

      {showSendReportPrompt && (
        <div className="a-dlg">
          <div className="a-sheet max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="a-tile a-tile-rim w-16 h-16 mx-auto mb-4">
                <Send size={28} className="a-txt-t" />
              </div>
              <h3 className="text-lg font-bold a-ink mb-2">Payment Processed</h3>
              <p className="text-sm a-mute leading-relaxed">
                {lastPaidCount} member{lastPaidCount !== 1 ? 's have' : ' has'} been marked as paid to National.
                Would you like to send a report to the National Association to notify them of this payment?
              </p>
            </div>
            <div className="flex items-center gap-3 px-6 pb-6">
              <button
                onClick={() => setShowSendReportPrompt(false)}
                className="a-btn flex-1"
              >
                Not Now
              </button>
              <button
                onClick={() => {
                  setShowSendReportPrompt(false);
                  setShowReportModal(true);
                }}
                className="a-btn a-btn-p flex-1 justify-center"
              >
                <Send size={16} />
                Send Report
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={showUnpaidWarning}
        onClose={() => {
          setShowUnpaidWarning(false);
          setUnpaidTargetId(null);
          setUnpaidTargetName('');
        }}
        onConfirm={confirmUnpaidNational}
        title="Revert National Payment Status"
        message={`Are you sure you want to mark ${unpaidTargetName} as unpaid to National?\n\nThis will:\n- Remove the associated expense transaction from State finances\n- Remove the associated income transaction from National finances\n- Set the member's national payment status back to pending\n\nThis action affects your financial records.`}
        confirmText="Revert to Unpaid"
        darkMode={darkMode}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showBulkStatusUpdateWarning}
        onClose={() => {
          setShowBulkStatusUpdateWarning(false);
          setBulkStatusUpdateAction(null);
        }}
        onConfirm={confirmBulkStatusUpdate}
        title={bulkStatusUpdateAction === 'mark-paid' ? 'Mark Members as Paid to National' : 'Mark Members as Unpaid to National'}
        message={
          bulkStatusUpdateAction === 'mark-paid'
            ? `Are you sure you want to mark ${selectedIds.size} member${selectedIds.size !== 1 ? 's' : ''} as paid to National?\n\nThis will:\n- Update the national payment status to "Paid"\n- Set the payment date to today\n\nTotal amount: $${remittances.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + r.national_contribution, 0).toFixed(2)}`
            : `Are you sure you want to mark ${selectedIds.size} member${selectedIds.size !== 1 ? 's' : ''} as unpaid to National?\n\nThis will:\n- Remove associated expense transactions from State finances\n- Remove associated income transactions from National finances\n- Set the national payment status back to "Pending"\n\nThis action affects your financial records.\n\nTotal amount: $${remittances.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + r.national_contribution, 0).toFixed(2)}`
        }
        confirmText={bulkStatusUpdateAction === 'mark-paid' ? `Mark ${selectedIds.size} as Paid` : `Mark ${selectedIds.size} as Unpaid`}
        darkMode={darkMode}
        variant={bulkStatusUpdateAction === 'mark-paid' ? 'success' : 'danger'}
      />
    </div>
  );
};

// Record Payment Modal Component
interface RecordPaymentModalProps {
  darkMode: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  clubSummaries: ClubSummary[];
}

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  onClose,
  onSubmit,
  clubSummaries
}) => {
  const [formData, setFormData] = useState({
    reference: '',
    date: new Date().toISOString().split('T')[0],
    from_club_id: '',
    amount: '',
    payment_method: 'bank_transfer',
    bank_transaction_id: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount)
    });
  };

  return (
    <div className="a-dlg">
      <div className="a-sheet max-w-2xl" role="dialog" aria-modal="true" aria-label="Record payment received">
        <div className="a-dlg-head">
          <span className="a-tile"><Receipt size={18} /></span>
          <h2 className="flex-1 a-ink text-lg font-semibold m-0">Record payment received</h2>
          <button type="button" onClick={onClose} className="a-ib" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="a-dlg-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium a-mute mb-2">
                Payment Reference *
              </label>
              <input
                type="text"
                required
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                className="a-inp"
                placeholder="e.g., PAY-2025-001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium a-mute mb-2">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="a-inp"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium a-mute mb-2">
                From Club (Optional)
              </label>
              <select
                value={formData.from_club_id}
                onChange={(e) => setFormData({ ...formData, from_club_id: e.target.value })}
                className="a-inp"
              >
                <option value="">Select club...</option>
                {clubSummaries.map(club => (
                  <option key={club.club_id} value={club.club_id}>
                    {club.club_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium a-mute mb-2">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="a-inp"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium a-mute mb-2">
                Payment Method
              </label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="a-inp"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium a-mute mb-2">
                Bank Transaction ID
              </label>
              <input
                type="text"
                value={formData.bank_transaction_id}
                onChange={(e) => setFormData({ ...formData, bank_transaction_id: e.target.value })}
                className="a-inp"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium a-mute mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="a-inp"
              rows={3}
              placeholder="Add any additional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="a-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="a-btn a-btn-p"
            >
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface NationalPaymentModalProps {
  darkMode: boolean;
  selectedCount: number;
  totalAmount: number;
  selectedMembers: MembershipRemittance[];
  processing: boolean;
  onClose: () => void;
  onSubmit: (details: { reference: string; date: string; payment_method: string; notes: string }) => void;
}

const NationalPaymentModal: React.FC<NationalPaymentModalProps> = ({
  selectedCount,
  totalAmount,
  selectedMembers,
  processing,
  onClose,
  onSubmit
}) => {
  const [formData, setFormData] = useState({
    reference: `NAT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    notes: ''
  });
  const [showMembers, setShowMembers] = useState(false);

  const clubGroups = selectedMembers.reduce<Record<string, MembershipRemittance[]>>((acc, m) => {
    if (!acc[m.club_name]) acc[m.club_name] = [];
    acc[m.club_name].push(m);
    return acc;
  }, {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="a-dlg">
      <div className="a-sheet max-w-2xl" role="dialog" aria-modal="true" aria-label="Pay national association">
        <div className="a-dlg-head justify-between">
          <div className="flex items-center gap-3">
            <span className="a-tile a-txt-g">
              <ArrowUpRight size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold a-ink">Pay National Association</h2>
              <p className="text-xs a-mute mt-0.5">{selectedCount} member{selectedCount !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="a-ib" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="a-dlg-body flex-1 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="a-box a-box-ok p-4 text-center">
              <p className="text-3xl font-bold a-ink">${totalAmount.toFixed(2)}</p>
              <p className="text-xs a-txt-g mt-1 font-medium">Total Payment Amount</p>
            </div>
            <div className="a-box p-4 text-center">
              <p className="text-3xl font-bold a-ink">{selectedCount}</p>
              <p className="text-xs a-mute mt-1 font-medium">Members across {Object.keys(clubGroups).length} club{Object.keys(clubGroups).length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMembers(!showMembers)}
            className="w-full flex items-center justify-between px-4 py-3 a-box a-hov-row"
          >
            <div className="flex items-center gap-2">
              <Users size={15} className="a-mute" />
              <span className="text-sm font-medium a-mute">View Members</span>
            </div>
            <ChevronDown size={14} className={`text-slate-500 transition-transform ${showMembers ? 'rotate-180' : ''}`} />
          </button>

          {showMembers && (
            <div className="a-box overflow-hidden max-h-48 overflow-y-auto">
              {Object.entries(clubGroups).map(([clubName, members]) => (
                <div key={clubName}>
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700/40">
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="a-dim" />
                      <span className="text-xs font-semibold a-mute">{clubName}</span>
                    </div>
                    <span className="text-xs a-txt-g font-medium">
                      ${members.reduce((s, m) => s + m.national_contribution, 0).toFixed(2)}
                    </span>
                  </div>
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between px-4 py-2 pl-8 border-b border-slate-800/40 last:border-0">
                      <span className="text-sm a-mute">{m.member_name}</span>
                      <span className="text-xs a-mute">${m.national_contribution.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} id="national-payment-form" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium a-mute mb-1.5">Payment Reference *</label>
                <input
                  type="text"
                  required
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="a-inp"
                />
              </div>
              <div>
                <label className="block text-xs font-medium a-mute mb-1.5">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="a-inp"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium a-mute mb-1.5">Payment Method</label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="a-inp"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Cheque</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium a-mute mb-1.5">Notes (optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="a-inp resize-none"
                placeholder="Payment notes..."
              />
            </div>
          </form>

          <div className="a-box a-box-warn p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={15} className="a-txt-a flex-shrink-0 mt-0.5" />
              <p className="text-xs a-txt-a leading-relaxed">
                This will mark {selectedCount} member{selectedCount !== 1 ? 's' : ''} as paid to National and create
                expense/income transactions in your finance records.
              </p>
            </div>
          </div>
        </div>

        <div className="a-dlg-foot justify-between">
          <button
            onClick={onClose}
            className="a-btn a-btn-q"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="national-payment-form"
            disabled={processing}
            className="a-btn a-btn-p"
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <DollarSign size={16} />
                Process Payment - ${totalAmount.toFixed(2)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, Building2, CheckCircle, Download, RefreshCw, ArrowRight, TrendingUp, Calendar, Check, LogOut, CheckSquare, Square, Eye, Plus, Receipt, Trash2, AlertTriangle, ChevronDown, ChevronRight, Mail, FileText, Clock, Send, Users, ArrowUpRight, ArrowDownLeft, History, X } from 'lucide-react';
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
        className={`
          flex items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
          bg-slate-800/80 text-slate-200 border border-slate-700/60
          ${open ? 'ring-2 ring-blue-500/40 border-blue-500/50' : 'hover:bg-slate-700/80 hover:border-slate-600'}
          cursor-pointer
        `}
        style={{ minWidth }}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
          <span className={selected ? 'text-slate-200' : 'text-slate-500'}>
            {selected ? selected.label : placeholder}
          </span>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="rounded-xl shadow-2xl border bg-slate-800 border-slate-700 shadow-black/50"
        >
          <div className="py-1 max-h-[280px] overflow-y-auto overscroll-contain rounded-xl
            [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600/50"
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`
                  w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors text-left
                  ${value === opt.value ? 'bg-blue-500/15 text-blue-400' : 'text-slate-300 hover:bg-slate-700/80'}
                `}
              >
                <div className="flex items-center gap-2.5">
                  {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <span>{opt.label}</span>
                </div>
                {value === opt.value && <Check size={14} className="text-blue-400 flex-shrink-0" />}
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
    const eligibleRemittances = remittances.filter(
      r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending'
    );

    if (selectedIds.size === eligibleRemittances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleRemittances.map(r => r.id)));
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
      // Load all remittances that match this payment
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
        .eq('club_id', payment.from_club_id)
        .eq('club_to_state_paid_date', payment.payment_date)
        .eq('club_to_state_status', 'paid')
        .eq('bulk_payment', true);

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
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
              <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
              <DollarSign className="absolute inset-0 m-auto w-6 h-6 text-green-400" />
            </div>
            <p className="text-white font-medium mb-1">Loading Remittances</p>
            <p className="text-sm text-slate-400">Gathering club data, payments, and reconciliation status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
                  <DollarSign className="text-white" size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Remittances
                  </h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Track membership fee payments from clubs
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-orange-400" />
                <span className="text-sm font-medium text-orange-300">
                  Outstanding from Clubs
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                ${totalOutstanding.toFixed(2)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-blue-300">
                  Owed to National
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                ${nationalOwed.toFixed(2)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-purple-400" />
                <span className="text-sm font-medium text-purple-300">
                  Pending Members
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                {remittances.filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending').length}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">
                  Member Clubs
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                {clubSummaries.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action */}
      {nationalOwed > 0 && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-emerald-300">
                Ready to pay ${nationalOwed.toFixed(2)} to National Association
              </p>
              <p className="text-sm text-emerald-400/80 mt-1">
                {remittances.filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending').length} members ready for remittance
              </p>
            </div>
            <button
              onClick={() => {
                const readyIds = remittances
                  .filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending')
                  .map(r => r.id);
                setSelectedIds(new Set(readyIds));
                setSelectedTab('national-remittance');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              <ArrowRight size={18} />
              Pay National
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="border-b border-slate-700">
          <div className="flex">
            <button
              onClick={() => {
                setSelectedTab('clubs');
                setSelectedClubFilter('all');
              }}
              className={`px-6 py-4 font-medium transition-colors ${
                selectedTab === 'clubs'
                  ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Clubs ({clubSummaries.length})
            </button>
            <button
              onClick={() => {
                setSelectedTab('club-payments');
                if (selectedClubFilter !== 'all') {
                  setSelectedClubFilter('all');
                }
              }}
              className={`px-6 py-4 font-medium transition-colors ${
                selectedTab === 'club-payments'
                  ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Club Payments ({remittances.filter(r => r.club_to_state_status === 'pending').length})
            </button>
            <button
              onClick={() => setSelectedTab('national-remittance')}
              className={`px-6 py-4 font-medium transition-colors ${
                selectedTab === 'national-remittance'
                  ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              National Remittance ({remittances.filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending').length})
            </button>
            <button
              onClick={() => setSelectedTab('payments')}
              className={`px-6 py-4 font-medium transition-colors ${
                selectedTab === 'payments'
                  ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Payment History ({paymentBatches.length})
            </button>
          </div>
        </div>

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
                    { value: 'all', label: 'All Years', icon: <Calendar size={14} className="text-slate-400" /> },
                    ...availableYears.map(year => ({
                      value: String(year),
                      label: String(year),
                      icon: <Calendar size={14} className="text-blue-400" />
                    }))
                  ]}
                  minWidth={160}
                />
              </div>

              <div className="space-y-3">
                {clubSummaries.length === 0 ? (
                  <div className="text-center py-12">
                    <Building2 className="mx-auto mb-4 text-slate-600" size={48} />
                    <p className="text-lg text-slate-400">
                      No club data found
                    </p>
                  </div>
                ) : (
                  clubSummaries.map((club) => (
                    <div
                      key={club.club_id}
                      onClick={() => {
                        setSelectedClubFilter(club.club_id);
                        setSelectedTab('club-payments');
                      }}
                      className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/50 hover:border-blue-500/50 hover:bg-slate-700/50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="p-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 group-hover:bg-blue-600/20 transition-colors">
                            <Building2 size={20} className="text-blue-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-white mb-1.5 group-hover:text-blue-300 transition-colors">
                              {club.club_name}
                            </h3>
                            <div className="flex items-center gap-6 text-sm">
                              <div className="flex items-center gap-1.5">
                                <CheckCircle size={14} className="text-green-400" />
                                <span className="text-slate-400">Paid</span>
                                <span className="text-green-400 font-semibold">
                                  ${club.total_paid.toFixed(2)} ({club.paid_count})
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={14} className="text-orange-400" />
                                <span className="text-slate-400">Outstanding</span>
                                <span className="text-orange-400 font-semibold">
                                  ${club.total_outstanding.toFixed(2)} ({club.outstanding_count})
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={20} className="text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                      </div>
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
                <div className="bg-green-500/10 backdrop-blur-sm rounded-xl border border-green-500/30 p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckSquare className="w-5 h-5 text-green-400" />
                      <span className="text-white font-medium">
                        {selectedIds.size} member{selectedIds.size !== 1 ? 's' : ''} selected
                      </span>
                      <span className="text-sm text-green-300 font-semibold">
                        ${remittances.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + r.national_contribution, 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBulkMarkNationalPaid}
                        disabled={bulkActionInProgress}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-600/20 text-sm"
                      >
                        <DollarSign size={16} />
                        Process Payment to National
                      </button>
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors flex items-center gap-2 text-sm border border-slate-600"
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
                    { value: 'all', label: 'All Years', icon: <Calendar size={14} className="text-slate-400" /> },
                    ...availableYears.map(year => ({
                      value: String(year),
                      label: String(year),
                      icon: <Calendar size={14} className="text-blue-400" />
                    }))
                  ]}
                  minWidth={160}
                />
                <AppDropdown
                  value={selectedClubFilter}
                  onChange={(v) => setSelectedClubFilter(v)}
                  icon={<Building2 size={15} />}
                  options={[
                    { value: 'all', label: 'All Clubs', icon: <Building2 size={14} className="text-slate-400" /> },
                    ...uniqueClubs.map(club => ({
                      value: club.id,
                      label: club.name,
                      icon: <Building2 size={14} className="text-blue-400" />
                    }))
                  ]}
                  minWidth={200}
                />
                <button
                  onClick={toggleSelectAll}
                  className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 hover:border-slate-600 text-sm font-medium transition-all flex items-center gap-2"
                >
                  <CheckSquare size={15} className="text-slate-400" />
                  {selectedIds.size === remittances.filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending').length ? 'Deselect All' : 'Select All Ready'}
                </button>
              </div>

              {/* Members Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-300">Member</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-300">Club</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-300">State Fee</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">State Status</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-300">National Fee</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">National Status</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">
                        {(() => {
                          const eligible = remittances.filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending');
                          if (eligible.length === 0) return 'Select';
                          const allSelected = eligible.length > 0 && eligible.every(r => selectedIds.has(r.id));
                          return (
                            <button onClick={toggleSelectAll} className="p-1 mx-auto block" title={allSelected ? 'Deselect All' : 'Select All'}>
                              {allSelected ? (
                                <CheckSquare className="w-5 h-5 text-green-400" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-500 hover:text-slate-300" />
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
                          <p className="text-slate-400">No remittances found</p>
                        </td>
                      </tr>
                    ) : (
                      remittances.map((remittance) => {
                        const isEligible = remittance.club_to_state_status === 'paid' && remittance.state_to_national_status === 'pending';
                        return (
                          <tr key={remittance.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  imageUrl={remittance.member_avatar}
                                  firstName={remittance.member_name.split(' ')[0]}
                                  lastName={remittance.member_name.split(' ').slice(1).join(' ')}
                                  size="sm"
                                />
                                <span className="text-white">{remittance.member_name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-300">{remittance.club_name}</td>
                            <td className="py-3 px-4 text-right text-white">${remittance.state_contribution.toFixed(2)}</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => handleToggleClubStatus(remittance.id, remittance.club_to_state_status)}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
                                style={{
                                  backgroundColor: remittance.club_to_state_status === 'paid' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                                  color: remittance.club_to_state_status === 'paid' ? 'rgb(134, 239, 172)' : 'rgb(251, 146, 60)'
                                }}
                                title="Click to toggle status"
                              >
                                {remittance.club_to_state_status === 'paid' ? 'Paid' : 'Pending'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right text-white">${remittance.national_contribution.toFixed(2)}</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => handleToggleNationalStatus(remittance.id, remittance.state_to_national_status)}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
                                style={{
                                  backgroundColor: remittance.state_to_national_status === 'paid' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                                  color: remittance.state_to_national_status === 'paid' ? 'rgb(134, 239, 172)' : 'rgb(251, 146, 60)'
                                }}
                                title="Click to toggle status"
                              >
                                {remittance.state_to_national_status === 'paid' ? 'Paid' : 'Pending'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isEligible && (
                                <button
                                  onClick={() => toggleSelection(remittance.id)}
                                  className="p-1"
                                >
                                  {selectedIds.has(remittance.id) ? (
                                    <CheckSquare className="w-5 h-5 text-blue-400" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-500" />
                                  )}
                                </button>
                              )}
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
              <div className="flex items-center gap-1 mb-6 p-1 bg-slate-800/60 rounded-xl border border-slate-700/50 w-fit">
                <button
                  onClick={() => setPaymentHistorySubTab('from-clubs')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    paymentHistorySubTab === 'from-clubs'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <ArrowDownLeft size={16} />
                  Received from Clubs
                  <span className={`px-1.5 py-0.5 rounded-md text-xs ${paymentHistorySubTab === 'from-clubs' ? 'bg-blue-500/30' : 'bg-slate-700'}`}>
                    {paymentBatches.length}
                  </span>
                </button>
                <button
                  onClick={() => setPaymentHistorySubTab('to-national')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    paymentHistorySubTab === 'to-national'
                      ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <ArrowUpRight size={16} />
                  Paid to National
                  <span className={`px-1.5 py-0.5 rounded-md text-xs ${paymentHistorySubTab === 'to-national' ? 'bg-green-500/30' : 'bg-slate-700'}`}>
                    {outboundPayments.length}
                  </span>
                </button>
                <button
                  onClick={() => setPaymentHistorySubTab('reports')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    paymentHistorySubTab === 'reports'
                      ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <FileText size={16} />
                  National Reports
                  <span className={`px-1.5 py-0.5 rounded-md text-xs ${paymentHistorySubTab === 'reports' ? 'bg-teal-500/30' : 'bg-slate-700'}`}>
                    {reportSubmissions.length}
                  </span>
                </button>
              </div>

              {/* Filters Row */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <AppDropdown
                    value={String(selectedYear)}
                    onChange={(v) => setSelectedYear(v === 'all' ? 'all' : Number(v))}
                    icon={<Calendar size={15} />}
                    options={[
                      { value: 'all', label: 'All Years', icon: <Calendar size={14} className="text-slate-400" /> },
                      ...availableYears.map(year => ({
                        value: String(year),
                        label: String(year),
                        icon: <Calendar size={14} className="text-blue-400" />
                      }))
                    ]}
                    minWidth={160}
                  />
                </div>

                <div className="flex items-center gap-2">
                  {paymentHistorySubTab === 'from-clubs' && paymentBatches.length > 0 && (
                    <button
                      onClick={() => setShowClearAllConfirm(true)}
                      className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-medium transition-all flex items-center gap-2 text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  )}
                  {paymentHistorySubTab === 'reports' && (
                    <button
                      onClick={() => setShowReportModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-medium transition-all flex items-center gap-2 text-sm shadow-lg shadow-teal-600/20"
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
                    <div className="text-center py-12">
                      <div className="p-4 rounded-2xl bg-slate-700/30 border border-slate-600/30 w-fit mx-auto mb-4">
                        <ArrowDownLeft className="text-slate-500" size={32} />
                      </div>
                      <p className="text-lg text-slate-400 mb-1">No payments received from clubs</p>
                      <p className="text-sm text-slate-500">Payments appear here when reconciling member remittances</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowDownLeft size={16} className="text-blue-400" />
                            <p className="text-sm text-blue-300 font-medium">Total Received from Clubs</p>
                          </div>
                          <p className="text-2xl font-bold text-white">
                            ${paymentBatches.reduce((sum, b) => sum + Number(b.total_amount), 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
                          <div className="flex items-center gap-2 mb-2">
                            <Receipt size={16} className="text-slate-400" />
                            <p className="text-sm text-slate-300 font-medium">Total Transactions</p>
                          </div>
                          <p className="text-2xl font-bold text-white">{paymentBatches.length}</p>
                        </div>
                      </div>

                      {paymentBatches.map((batch) => {
                        const progressPercent = (batch.allocated_amount / batch.total_amount) * 100;
                        const isFullyReconciled = batch.reconciliation_status === 'completed';
                        const isPartial = batch.reconciliation_status === 'partial';

                        return (
                          <div
                            key={batch.id}
                            className={`p-5 rounded-xl border transition-all ${
                              isFullyReconciled
                                ? 'bg-green-500/10 border-green-500/30'
                                : isPartial
                                ? 'bg-blue-500/10 border-blue-500/30'
                                : 'bg-slate-700/30 border-slate-600/50'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className={`p-1.5 rounded-lg ${isFullyReconciled ? 'bg-green-500/20' : 'bg-blue-500/20'}`}>
                                    <Receipt className={`w-4 h-4 ${isFullyReconciled ? 'text-green-400' : 'text-blue-400'}`} />
                                  </div>
                                  <span className="text-white font-semibold text-lg">{batch.payment_reference}</span>
                                  {isFullyReconciled && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300 flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" /> Reconciled
                                    </span>
                                  )}
                                  {isPartial && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">Partial</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-400">
                                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{new Date(batch.payment_date).toLocaleDateString()}</span>
                                  {batch.clubs?.name && <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{batch.clubs.name}</span>}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-bold text-white">${Number(batch.total_amount).toFixed(2)}</p>
                                <p className="text-xs text-slate-400 mt-1">{batch.payment_method || 'Transfer'}</p>
                              </div>
                            </div>

                            {!isFullyReconciled && (
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs text-slate-400">Reconciliation Progress</span>
                                  <span className="text-xs font-medium text-white">{progressPercent.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-slate-600/50">
                              <div className="flex-1 text-xs text-slate-400">
                                {batch.bank_transaction_id && <span>Ref: {batch.bank_transaction_id}</span>}
                                {batch.notes && <span className="ml-3">{batch.notes}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {batch.from_club_id && (
                                  <button onClick={() => togglePaymentExpansion(batch.id, batch)} className="px-3 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-white text-xs font-medium transition-colors flex items-center gap-1.5">
                                    <Eye className="w-3.5 h-3.5" />
                                    {expandedPaymentId === batch.id ? 'Hide' : 'View'} Members
                                  </button>
                                )}
                                {!isFullyReconciled && (
                                  <button onClick={() => handleOpenReconciliation(batch)} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5">
                                    <CheckSquare className="w-3.5 h-3.5" /> Reconcile
                                  </button>
                                )}
                                <button onClick={() => { setDeleteTargetId(batch.id); setShowDeleteConfirm(true); }} className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {expandedPaymentId === batch.id && (
                              <div className="mt-4 pt-4 border-t border-slate-600/50">
                                <h4 className="text-sm font-medium text-white mb-3">Members in this Payment</h4>
                                {paymentMembers.length > 0 ? (
                                  <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {paymentMembers.map((member) => (
                                      <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 border border-slate-700">
                                        <div className="flex items-center gap-3">
                                          <Avatar name={member.member_name} size="sm" imageUrl={member.member_avatar} />
                                          <div>
                                            <p className="text-sm font-medium text-white">{member.member_name}</p>
                                            <p className="text-xs text-slate-400">{member.club_name}</p>
                                          </div>
                                        </div>
                                        <span className="text-sm font-medium text-green-400">${member.state_contribution.toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    <span className="ml-2 text-sm text-slate-400">Loading members...</span>
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
                    <div className="text-center py-12">
                      <div className="p-4 rounded-2xl bg-slate-700/30 border border-slate-600/30 w-fit mx-auto mb-4">
                        <ArrowUpRight className="text-slate-500" size={32} />
                      </div>
                      <p className="text-lg text-slate-400 mb-1">No payments made to National yet</p>
                      <p className="text-sm text-slate-500">Payments to National appear here when you mark remittances as paid</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <ArrowUpRight size={16} className="text-green-400" />
                          <p className="text-sm text-green-300 font-medium">Total Paid to National{selectedYear !== 'all' ? ` in ${selectedYear}` : ''}</p>
                        </div>
                        <p className="text-2xl font-bold text-white">
                          ${outboundPayments.reduce((sum, b) => sum + Number(b.total_amount), 0).toFixed(2)}
                        </p>
                      </div>

                      {outboundPayments.map((batch) => (
                        <div key={batch.id} className="p-5 rounded-xl bg-green-500/5 border border-green-500/20 transition-all">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <div className="p-1.5 rounded-lg bg-green-500/20">
                                  <ArrowUpRight className="w-4 h-4 text-green-400" />
                                </div>
                                <span className="text-white font-semibold">{batch.payment_reference}</span>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-slate-400">
                                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{new Date(batch.payment_date).toLocaleDateString()}</span>
                                <span className="flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" />{batch.payment_method || 'Transfer'}</span>
                                {batch.member_count && (
                                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{batch.member_count} member{batch.member_count !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                            <p className="text-xl font-bold text-green-400">${Number(batch.total_amount).toFixed(2)}</p>
                          </div>
                          {batch.notes && <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-600/30">{batch.notes}</p>}
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
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-500/10 to-emerald-500/10 border border-teal-500/20 w-fit mx-auto mb-5">
                        <FileText className="text-teal-400" size={36} />
                      </div>
                      <p className="text-lg text-white font-semibold mb-2">National Member Reports</p>
                      <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                        Generate and send reports of paid members to your National Association. Track which members have been reported to avoid duplicates.
                      </p>
                      <button
                        onClick={() => setShowReportModal(true)}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-medium transition-all flex items-center gap-2 mx-auto shadow-lg shadow-teal-600/20"
                      >
                        <Send size={18} />
                        Generate First Report
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText size={16} className="text-teal-400" />
                            <p className="text-xs text-teal-300 font-medium">Reports Sent</p>
                          </div>
                          <p className="text-2xl font-bold text-white">{reportSubmissions.length}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
                          <div className="flex items-center gap-2 mb-2">
                            <Users size={16} className="text-slate-400" />
                            <p className="text-xs text-slate-300 font-medium">Members Reported</p>
                          </div>
                          <p className="text-2xl font-bold text-white">{reportSubmissions.reduce((sum, r) => sum + r.member_count, 0)}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
                          <div className="flex items-center gap-2 mb-2">
                            <History size={16} className="text-slate-400" />
                            <p className="text-xs text-slate-300 font-medium">Last Report</p>
                          </div>
                          <p className="text-sm font-semibold text-white mt-1">
                            {new Date(reportSubmissions[0]?.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {/* Report History */}
                      {reportSubmissions.map((report) => (
                        <div key={report.id} className="p-5 rounded-xl bg-slate-700/20 border border-slate-600/40 hover:border-slate-500/50 transition-all">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl ${report.report_type === 'email' ? 'bg-blue-500/15' : 'bg-teal-500/15'}`}>
                                {report.report_type === 'email' ? <Mail size={18} className="text-blue-400" /> : <Download size={18} className="text-teal-400" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-white font-semibold">
                                    {report.report_type === 'email' ? 'Emailed to National' : 'Downloaded Report'}
                                  </p>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    report.report_scope === 'new_since_last' ? 'bg-orange-500/20 text-orange-300' : 'bg-teal-500/20 text-teal-300'
                                  }`}>
                                    {report.report_scope === 'new_since_last' ? 'Incremental' : report.report_scope === 'all' ? 'Full List' : 'Custom'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                  <span className="flex items-center gap-1"><Calendar size={12} />{new Date(report.created_at).toLocaleString()}</span>
                                  {report.recipient_email && <span className="flex items-center gap-1"><Mail size={12} />{report.recipient_email}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-lg font-bold text-white">{report.member_count} members</p>
                                <p className="text-xs text-slate-400">
                                  State: ${Number(report.total_state_amount).toFixed(2)} / National: ${Number(report.total_national_amount).toFixed(2)}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  setDeleteReportTargetId(report.id);
                                  setShowDeleteReportConfirm(true);
                                }}
                                className="p-2 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                                title="Delete report log"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                          {report.subject && <p className="text-xs text-slate-300 mt-2 px-3 py-2 rounded-lg bg-slate-800/50">{report.subject}</p>}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#131c31] border border-slate-700/80 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
                <Send size={28} className="text-teal-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Payment Processed</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {lastPaidCount} member{lastPaidCount !== 1 ? 's have' : ' has'} been marked as paid to National.
                Would you like to send a report to the National Association to notify them of this payment?
              </p>
            </div>
            <div className="flex items-center gap-3 px-6 pb-6">
              <button
                onClick={() => setShowSendReportPrompt(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700/60"
              >
                Not Now
              </button>
              <button
                onClick={() => {
                  setShowSendReportPrompt(false);
                  setShowReportModal(true);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20"
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
  darkMode,
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl max-w-2xl w-full`}>
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Record Payment Received</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
              <LogOut className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Reference *
              </label>
              <input
                type="text"
                required
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., PAY-2025-001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                From Club (Optional)
              </label>
              <select
                value={formData.from_club_id}
                onChange={(e) => setFormData({ ...formData, from_club_id: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Method
              </label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Bank Transaction ID
              </label>
              <input
                type="text"
                value={formData.bank_transaction_id}
                onChange={(e) => setFormData({ ...formData, bank_transaction_id: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Add any additional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#131c31] border border-slate-700/80 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20">
              <ArrowUpRight size={20} className="text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Pay National Association</h2>
              <p className="text-xs text-slate-400 mt-0.5">{selectedCount} member{selectedCount !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700/80 transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <p className="text-3xl font-bold text-white">${totalAmount.toFixed(2)}</p>
              <p className="text-xs text-green-300 mt-1 font-medium">Total Payment Amount</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/50 text-center">
              <p className="text-3xl font-bold text-white">{selectedCount}</p>
              <p className="text-xs text-slate-400 mt-1 font-medium">Members across {Object.keys(clubGroups).length} club{Object.keys(clubGroups).length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMembers(!showMembers)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users size={15} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-300">View Members</span>
            </div>
            <ChevronDown size={14} className={`text-slate-500 transition-transform ${showMembers ? 'rotate-180' : ''}`} />
          </button>

          {showMembers && (
            <div className="rounded-xl border border-slate-700/60 overflow-hidden max-h-48 overflow-y-auto">
              {Object.entries(clubGroups).map(([clubName, members]) => (
                <div key={clubName}>
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700/40">
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="text-slate-500" />
                      <span className="text-xs font-semibold text-slate-300">{clubName}</span>
                    </div>
                    <span className="text-xs text-green-400 font-medium">
                      ${members.reduce((s, m) => s + m.national_contribution, 0).toFixed(2)}
                    </span>
                  </div>
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between px-4 py-2 pl-8 border-b border-slate-800/40 last:border-0">
                      <span className="text-sm text-slate-300">{m.member_name}</span>
                      <span className="text-xs text-slate-400">${m.national_contribution.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} id="national-payment-form" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Payment Reference *</label>
                <input
                  type="text"
                  required
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Payment Method</label>
              <select
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Cheque</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes (optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 resize-none"
                placeholder="Payment notes..."
              />
            </div>
          </form>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300 leading-relaxed">
                This will mark {selectedCount} member{selectedCount !== 1 ? 's' : ''} as paid to National and create
                expense/income transactions in your finance records.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-700/60">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="national-payment-form"
            disabled={processing}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-green-600/20"
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
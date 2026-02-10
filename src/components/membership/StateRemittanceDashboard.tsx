import React, { useState, useEffect } from 'react';
import { DollarSign, Building2, CheckCircle, Download, RefreshCw, ArrowRight, TrendingUp, Calendar, Check, LogOut, CheckSquare, Square, Eye, Plus, Receipt, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';
import { AssociationPaymentReconciliationModal } from './AssociationPaymentReconciliationModal';
import { SimpleReconciliationTab } from './SimpleReconciliationTab';
import { Avatar } from '../ui/Avatar';

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
  from_club_id?: string;
  clubs?: {
    name: string;
  };
}

interface StateRemittanceDashboardProps {
  darkMode: boolean;
  stateAssociationId: string;
}

export const StateRemittanceDashboard: React.FC<StateRemittanceDashboardProps> = ({
  darkMode,
  stateAssociationId
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
        loadPaymentBatches()
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

  const handleBulkMarkNationalPaid = async () => {
    if (selectedIds.size === 0) return;

    setBulkActionInProgress(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('membership_remittances')
        .update({
          state_to_national_status: 'paid',
          state_to_national_paid_date: today
        })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      await loadData();
      setSelectedIds(new Set());
    } catch (error: any) {
      console.error('Error marking remittances as paid:', error);
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
    try {
      const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('membership_remittances')
        .update({
          state_to_national_status: newStatus,
          state_to_national_paid_date: newStatus === 'paid' ? today : null
        })
        .eq('id', remittanceId);

      if (error) throw error;

      await loadData();
    } catch (error: any) {
      console.error('Error updating national status:', error);
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
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-blue-300">
                Ready to pay ${nationalOwed.toFixed(2)} to National Association
              </p>
              <p className="text-sm text-blue-400/80 mt-1">
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
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
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Years</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
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
                      className="p-4 rounded-lg bg-slate-700/30 border border-slate-600/50 hover:border-slate-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-white mb-2">
                            {club.club_name}
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-slate-400">Paid</p>
                              <p className="text-green-400 font-semibold">
                                ${club.total_paid.toFixed(2)} ({club.paid_count} members)
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">Outstanding</p>
                              <p className="text-orange-400 font-semibold">
                                ${club.total_outstanding.toFixed(2)} ({club.outstanding_count} members)
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedClubFilter(club.club_id);
                            setSelectedTab('club-payments');
                          }}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
                        >
                          <Eye size={18} />
                          View Details
                        </button>
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
                <div className="bg-blue-500/10 backdrop-blur-sm rounded-xl border border-blue-500/30 p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckSquare className="w-5 h-5 text-blue-400" />
                      <span className="text-white font-medium">
                        {selectedIds.size} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBulkMarkNationalPaid}
                        disabled={bulkActionInProgress}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check size={18} />
                        Mark National Paid
                      </button>
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors flex items-center gap-2"
                      >
                        <LogOut size={18} />
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Club
                  </label>
                  <select
                    value={selectedClubFilter}
                    onChange={(e) => setSelectedClubFilter(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Clubs</option>
                    {uniqueClubs.map(club => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={toggleSelectAll}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                  >
                    {selectedIds.size === remittances.filter(r => r.club_to_state_status === 'paid' && r.state_to_national_status === 'pending').length ? 'Deselect All' : 'Select All Ready'}
                  </button>
                </div>
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
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">Select</th>
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
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Payment Transaction History</h3>
                <p className="text-sm text-slate-400">
                  View all remittance payments from clubs to the association
                </p>
                </div>
                {paymentBatches.length > 0 && (
                  <button
                    onClick={() => setShowClearAllConfirm(true)}
                    className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-medium transition-all flex items-center gap-2 text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear All
                  </button>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Years</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              {paymentBatches.length === 0 ? (
                <div className="text-center py-12">
                  <Receipt className="mx-auto mb-4 text-slate-600" size={48} />
                  <p className="text-lg text-slate-400 mb-2">
                    No payments recorded
                  </p>
                  <p className="text-sm text-slate-500">
                    Payments are created automatically when reconciling members in the "Payments & Reconciliation" tab
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-300">Total Paid to National{selectedYear !== 'all' ? ` in ${selectedYear}` : ''}</p>
                        <p className="text-2xl font-bold text-white mt-1">
                          ${totalPaidToNational.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-blue-300">Total Payments</p>
                        <p className="text-2xl font-bold text-white mt-1">
                          {paymentBatches.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {paymentBatches.map((batch) => {
                    const progressPercent = (batch.allocated_amount / batch.total_amount) * 100;
                    const isFullyReconciled = batch.reconciliation_status === 'completed';
                    const isPartial = batch.reconciliation_status === 'partial';

                    return (
                      <div
                        key={batch.id}
                        className={`p-6 rounded-lg border transition-all ${
                          isFullyReconciled
                            ? 'bg-green-500/10 border-green-500/30'
                            : isPartial
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-slate-700/30 border-slate-600/50'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Receipt className="w-5 h-5 text-blue-400" />
                              <span className="text-white font-semibold text-lg">
                                {batch.payment_reference}
                              </span>
                              {isFullyReconciled && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Reconciled
                                </span>
                              )}
                              {isPartial && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                                  Partial
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-400">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {new Date(batch.payment_date).toLocaleDateString()}
                              </div>
                              {batch.clubs?.name && (
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4" />
                                  {batch.clubs.name}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-2xl font-bold text-white">
                              ${Number(batch.total_amount).toFixed(2)}
                            </p>
                            <p className="text-sm text-slate-400 mt-1">
                              {batch.payment_method || 'Transfer'}
                            </p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        {!isFullyReconciled && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-slate-400">Reconciliation Progress</span>
                              <span className="text-xs font-medium text-white">{progressPercent.toFixed(0)}%</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-green-400">
                                ${batch.allocated_amount.toFixed(2)} allocated
                              </span>
                              <span className="text-xs text-orange-400">
                                ${batch.unallocated_amount.toFixed(2)} remaining
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-4 border-t border-slate-600">
                          <div className="flex-1">
                            {batch.bank_transaction_id && (
                              <p className="text-xs text-slate-400">
                                Bank Ref: <span className="text-slate-300">{batch.bank_transaction_id}</span>
                              </p>
                            )}
                            {batch.notes && (
                              <p className="text-xs text-slate-400 mt-1">{batch.notes}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {batch.from_club_id && (
                              <button
                                onClick={() => togglePaymentExpansion(batch.id, batch)}
                                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors flex items-center gap-2"
                              >
                                <Eye className="w-4 h-4" />
                                {expandedPaymentId === batch.id ? 'Hide' : 'View'} Members
                              </button>
                            )}
                            {!isFullyReconciled && (
                              <button
                                onClick={() => handleOpenReconciliation(batch)}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors flex items-center gap-2"
                              >
                                <CheckSquare className="w-4 h-4" />
                                Reconcile
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setDeleteTargetId(batch.id);
                                setShowDeleteConfirm(true);
                              }}
                              className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
                              title="Delete payment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Member List */}
                        {expandedPaymentId === batch.id && (
                          <div className="mt-4 pt-4 border-t border-slate-600">
                            <h4 className="text-sm font-medium text-white mb-3">Members in this Payment</h4>
                            {paymentMembers.length > 0 ? (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {paymentMembers.map((member) => (
                                  <div
                                    key={member.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 border border-slate-700"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Avatar
                                        name={member.member_name}
                                        size="sm"
                                        imageUrl={member.member_avatar}
                                      />
                                      <div>
                                        <p className="text-sm font-medium text-white">{member.member_name}</p>
                                        <p className="text-xs text-slate-400">{member.club_name}</p>
                                      </div>
                                    </div>
                                    <span className="text-sm font-medium text-green-400">
                                      ${member.state_contribution.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center py-8">
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
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
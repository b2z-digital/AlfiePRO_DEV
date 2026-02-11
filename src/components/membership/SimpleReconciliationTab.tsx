import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign, Users, CheckCircle, Plus, LogOut, Calendar,
  Building2, AlertCircle, Check, ChevronDown, ChevronRight, Edit, Trash2
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Avatar } from '../ui/Avatar';

interface Payment {
  id: string;
  payment_reference: string;
  payment_date: string;
  total_amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  from_club_id?: string;
  club_name?: string;
  status: 'draft' | 'pending_reconciliation' | 'reconciled';
  linked_member_ids?: string[]; // IDs of members already linked to this payment
}

interface MemberRemittance {
  id: string;
  member_id: string;
  member_name: string;
  member_avatar: string | null;
  club_id: string;
  club_name: string;
  state_contribution: number;
  national_contribution: number;
  club_to_state_status: string;
  club_to_state_payment_reference?: string | null;
}

interface ClubGroup {
  club_id: string;
  club_name: string;
  members: MemberRemittance[];
  total_amount: number;
  member_count: number;
  expanded: boolean;
}

interface SimpleReconciliationTabProps {
  darkMode: boolean;
  stateAssociationId: string;
  selectedYear: number | 'all';
  selectedClubFilter?: string;
}

export const SimpleReconciliationTab: React.FC<SimpleReconciliationTabProps> = ({
  darkMode,
  stateAssociationId,
  selectedYear,
  selectedClubFilter
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unpaidMembers, setUnpaidMembers] = useState<MemberRemittance[]>([]);
  const [clubGroups, setClubGroups] = useState<ClubGroup[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  // New payment-first reconciliation states
  const [activePayment, setActivePayment] = useState<Payment | null>(null);
  const [reconciliationMembers, setReconciliationMembers] = useState<Set<string>>(new Set());

  // Reconciliation modal state
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileOption, setReconcileOption] = useState<'existing' | 'new' | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState('');

  // New payment form
  const [newPaymentData, setNewPaymentData] = useState({
    reference: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Edit/Delete payment state
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editData, setEditData] = useState({ reference: '', amount: '', date: '' });
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);

  useEffect(() => {
    loadData();
  }, [stateAssociationId, selectedYear]);

  // Auto-expand club when selectedClubFilter is set
  useEffect(() => {
    if (selectedClubFilter && clubGroups.length > 0) {
      setClubGroups(prev => prev.map(g =>
        g.club_id === selectedClubFilter ? { ...g, expanded: true } : g
      ));
    }
  }, [selectedClubFilter, clubGroups.length]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadPayments(), loadUnpaidMembers()]);
    } catch (error: any) {
      console.error('Error loading reconciliation data:', error);
      setError(error.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async () => {
    // Load payments from association_transactions with club_remittances category
    const { data: transactions, error } = await supabase
      .from('association_transactions')
      .select(`
        id,
        description,
        amount,
        date,
        reference,
        payer,
        category_id,
        association_budget_categories!inner(system_key)
      `)
      .eq('association_id', stateAssociationId)
      .eq('association_type', 'state')
      .eq('type', 'income')
      .eq('association_budget_categories.system_key', 'club_remittances')
      .order('date', { ascending: false });

    if (error) throw error;

    // Transform to match Payment interface
    const paymentsData = (transactions || []).map(t => ({
      id: t.id,
      payment_reference: t.reference || t.description || 'N/A',
      payment_date: t.date,
      total_amount: parseFloat(t.amount as any),
      allocated_amount: 0, // Will calculate from reconciled remittances
      unallocated_amount: parseFloat(t.amount as any), // Will calculate
      club_name: t.payer,
      status: 'pending_reconciliation' as const
    }));

    // Calculate allocated amounts and get linked members
    // Only count remittances where bulk_payment is false/null (state has reconciled them)
    // bulk_payment=true means club paid but state hasn't reconciled yet
    const paymentsWithAllocations = await Promise.all(paymentsData.map(async (p) => {
      const { data: allocatedRemittances } = await supabase
        .from('membership_remittances')
        .select('id, state_contribution_amount')
        .eq('club_to_state_payment_reference', p.payment_reference)
        .eq('club_to_state_status', 'paid')
        .or('bulk_payment.is.null,bulk_payment.eq.false');

      const allocated = allocatedRemittances?.reduce((sum, r) =>
        sum + parseFloat(r.state_contribution_amount as any || '0'), 0) || 0;

      const linkedMemberIds = allocatedRemittances?.map(r => r.id) || [];

      return {
        ...p,
        allocated_amount: allocated,
        unallocated_amount: p.total_amount - allocated,
        linked_member_ids: linkedMemberIds
      };
    }));

    setPayments(paymentsWithAllocations);
  };

  const loadUnpaidMembers = async () => {
    // Load members that are either:
    // 1. Status = 'pending' (club hasn't paid yet)
    // 2. Status = 'paid' with bulk_payment = true (club paid, awaiting state reconciliation)
    const { data, error } = await supabase
      .from('membership_remittances')
      .select('*')
      .eq('state_association_id', stateAssociationId)
      .or('club_to_state_status.eq.pending,and(club_to_state_status.eq.paid,bulk_payment.eq.true)');

    if (error) {
      console.error('Error loading unpaid members:', error);
      throw error;
    }

    // Get member and club details separately
    const formattedMembers = await Promise.all((data || []).map(async (r) => {
      const { data: member } = await supabase
        .from('members')
        .select('id, first_name, last_name, avatar_url')
        .eq('id', r.member_id)
        .single();

      // Get club name from clubs table
      const { data: club } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', r.club_id)
        .single();

      return {
        id: r.id,
        member_id: r.member_id,
        member_name: member ? `${member.first_name} ${member.last_name}` : 'Unknown',
        member_avatar: member?.avatar_url || null,
        club_id: r.club_id,
        club_name: club?.name || 'Unknown Club',
        state_contribution: r.state_contribution_amount || 0,
        national_contribution: r.national_contribution_amount || 0,
        club_to_state_status: r.club_to_state_status,
        club_to_state_payment_reference: r.club_to_state_payment_reference
      };
    }));

    setUnpaidMembers(formattedMembers);
    groupMembersByClub(formattedMembers);
  };

  const groupMembersByClub = (members: MemberRemittance[]) => {
    const grouped = members.reduce((acc, member) => {
      if (!acc[member.club_id]) {
        acc[member.club_id] = {
          club_id: member.club_id,
          club_name: member.club_name,
          members: [],
          total_amount: 0,
          member_count: 0,
          expanded: false
        };
      }
      acc[member.club_id].members.push(member);
      // Ensure state_contribution is a valid number
      const contribution = Number(member.state_contribution) || 0;
      acc[member.club_id].total_amount += contribution;
      acc[member.club_id].member_count++;
      return acc;
    }, {} as Record<string, ClubGroup>);

    setClubGroups(Object.values(grouped));
  };

  const toggleClubExpansion = (clubId: string) => {
    setClubGroups(prev => prev.map(g =>
      g.club_id === clubId ? { ...g, expanded: !g.expanded } : g
    ));
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const selectAllInClub = (clubId: string) => {
    const group = clubGroups.find(g => g.club_id === clubId);
    if (!group) return;

    setSelectedMembers(prev => {
      const newSet = new Set(prev);
      group.members.forEach(m => newSet.add(m.id));
      return newSet;
    });
  };

  const openReconcileModal = () => {
    if (selectedMembers.size === 0) {
      alert('Please select members to reconcile');
      return;
    }

    // Calculate total
    const selectedMembersData = unpaidMembers.filter(m => selectedMembers.has(m.id));
    const totalAmount = selectedMembersData.reduce((sum, m) => sum + m.state_contribution, 0);

    setNewPaymentData({
      ...newPaymentData,
      amount: totalAmount.toFixed(2)
    });

    setShowReconcileModal(true);
    setReconcileOption(null);
    setSelectedPaymentId('');
  };

  // New payment-first reconciliation handlers
  const openPaymentReconciliation = (payment: Payment) => {
    setActivePayment(payment);
    setReconciliationMembers(new Set());

    // Priority 1: Match members by exact payment reference
    // These are members that the club specifically marked as paid with this reference
    const membersWithMatchingRef = unpaidMembers.filter(m =>
      m.club_to_state_payment_reference &&
      m.club_to_state_payment_reference === payment.payment_reference
    );

    if (membersWithMatchingRef.length > 0) {
      // Auto-select all members with this payment reference
      setReconciliationMembers(new Set(membersWithMatchingRef.map(m => m.id)));
      return;
    }

    // Priority 2: If payment is from a specific club, auto-select members from that club
    if (payment.from_club_id) {
      const clubMembers = unpaidMembers.filter(m => m.club_id === payment.from_club_id);
      const remaining = payment.unallocated_amount;
      const suggestions = findBestMatchFromClub(clubMembers, remaining);
      setReconciliationMembers(new Set(suggestions.map(m => m.id)));
      return;
    }

    // Priority 3: Match by club name
    if (payment.club_name) {
      const clubMembers = unpaidMembers.filter(m => m.club_name === payment.club_name);
      const remaining = payment.unallocated_amount;
      const suggestions = findBestMatchFromClub(clubMembers, remaining);
      setReconciliationMembers(new Set(suggestions.map(m => m.id)));
      return;
    }

    // Fallback: Find any members that add up to unallocated amount
    const remaining = payment.unallocated_amount;
    const suggestions = findBestMatch(remaining);
    setReconciliationMembers(new Set(suggestions.map(m => m.id)));
  };

  const findBestMatchFromClub = (clubMembers: MemberRemittance[], targetAmount: number): MemberRemittance[] => {
    // For club-specific payments, select all members from that club up to the target amount
    const sorted = [...clubMembers].sort((a, b) => a.state_contribution - b.state_contribution);
    const result: MemberRemittance[] = [];
    let currentSum = 0;

    for (const member of sorted) {
      if (currentSum + member.state_contribution <= targetAmount + 0.01) { // Allow small rounding
        result.push(member);
        currentSum += member.state_contribution;
      }
    }

    return result;
  };

  const findBestMatch = (targetAmount: number): MemberRemittance[] => {
    // Simple greedy algorithm to find members that sum close to target
    const sorted = [...unpaidMembers].sort((a, b) => b.state_contribution - a.state_contribution);
    const result: MemberRemittance[] = [];
    let currentSum = 0;

    for (const member of sorted) {
      if (currentSum + member.state_contribution <= targetAmount) {
        result.push(member);
        currentSum += member.state_contribution;
      }
      if (Math.abs(currentSum - targetAmount) < 0.01) break; // Close enough
    }

    return result;
  };

  const toggleReconciliationMember = (memberId: string) => {
    setReconciliationMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const completePaymentReconciliation = async () => {
    if (!activePayment || reconciliationMembers.size === 0) return;

    setProcessing(true);
    try {
      const membersToReconcile = unpaidMembers.filter(m => reconciliationMembers.has(m.id));

      for (const member of membersToReconcile) {
        const { error } = await supabase
          .from('membership_remittances')
          .update({
            club_to_state_status: 'paid',
            club_to_state_payment_reference: activePayment.payment_reference,
            club_to_state_paid_date: activePayment.payment_date,
            bulk_payment: false // Clear bulk_payment flag after state reconciliation
          })
          .eq('id', member.id);

        if (error) throw error;
      }

      alert(`✅ Successfully reconciled ${reconciliationMembers.size} member(s)!`);
      setActivePayment(null);
      setReconciliationMembers(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Error reconciling:', error);
      alert('Failed to reconcile: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReconcile = async () => {
    if (!reconcileOption) {
      alert('Please select an option');
      return;
    }

    setProcessing(true);
    try {
      let paymentId = selectedPaymentId;

      let paymentReference = '';

      // If creating new payment, create it first
      if (reconcileOption === 'new') {
        if (!newPaymentData.reference || !newPaymentData.amount) {
          alert('Please fill in all fields');
          setProcessing(false);
          return;
        }

        // Get the club_remittances category ID
        const { data: category } = await supabase
          .from('association_budget_categories')
          .select('id')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('system_key', 'club_remittances')
          .single();

        if (!category) throw new Error('Club remittances category not found');

        const { data: newPayment, error: createError } = await supabase
          .from('association_transactions')
          .insert({
            association_id: stateAssociationId,
            association_type: 'state',
            type: 'income',
            category_id: category.id,
            description: `Club Membership Remittance - ${newPaymentData.reference}`,
            amount: parseFloat(newPaymentData.amount),
            date: newPaymentData.date,
            reference: newPaymentData.reference,
            payer: 'Club',
            payment_method: 'bank',
            payment_status: 'completed'
          })
          .select()
          .single();

        if (createError) throw createError;
        paymentId = newPayment.id;
        paymentReference = newPaymentData.reference;
      } else {
        // Using existing payment
        if (!paymentId) {
          alert('Please select a payment');
          setProcessing(false);
          return;
        }

        // Get the payment reference
        const selectedPayment = payments.find(p => p.id === paymentId);
        paymentReference = selectedPayment?.payment_reference || '';
      }

      // Reconcile selected members to the payment
      const selectedMembersData = unpaidMembers.filter(m => selectedMembers.has(m.id));

      for (const member of selectedMembersData) {
        const { error } = await supabase
          .from('membership_remittances')
          .update({
            club_to_state_status: 'paid',
            club_to_state_payment_reference: paymentReference,
            club_to_state_paid_date: newPaymentData.date,
            bulk_payment: true
          })
          .eq('id', member.id);

        if (error) throw error;
      }

      alert(`✅ Successfully reconciled ${selectedMembersData.length} member(s)!`);

      setShowReconcileModal(false);
      setSelectedMembers(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Error reconciling:', error);
      alert('Failed to reconcile: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setEditData({
      reference: payment.payment_reference,
      amount: payment.total_amount.toString(),
      date: payment.payment_date
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPayment) return;

    try {
      const { error } = await supabase
        .from('association_transactions')
        .update({
          reference: editData.reference,
          amount: parseFloat(editData.amount),
          date: editData.date
        })
        .eq('id', editingPayment.id);

      if (error) throw error;

      await loadData();
      setEditingPayment(null);
      alert('✅ Payment updated successfully!');
    } catch (error: any) {
      console.error('Error updating payment:', error);
      alert('Failed to update payment: ' + error.message);
    }
  };

  const handleDeletePayment = async () => {
    if (!deletingPayment) return;

    try {
      if (deletingPayment.allocated_amount > 0) {
        alert('Cannot delete a payment that has been allocated to members. Please remove allocations first.');
        setDeletingPayment(null);
        return;
      }

      const { error } = await supabase
        .from('association_transactions')
        .delete()
        .eq('id', deletingPayment.id);

      if (error) throw error;

      await loadData();
      setDeletingPayment(null);
      alert('✅ Payment deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment: ' + error.message);
    }
  };

  const reconciledCount = unpaidMembers.filter(m => m.club_to_state_status === 'paid').length;
  const totalReconciled = payments
    .filter(p => p.status === 'reconciled')
    .reduce((sum, p) => sum + p.allocated_amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            <DollarSign className="absolute inset-0 m-auto w-6 h-6 text-blue-400" />
          </div>
          <p className="text-white font-medium mb-1">Loading Club Payments</p>
          <p className="text-sm text-slate-400">Fetching payment records and member data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const selectedMembersData = unpaidMembers.filter(m => selectedMembers.has(m.id));
  const selectedTotal = selectedMembersData.reduce((sum, m) => sum + m.state_contribution, 0);

  return (
    <div className="space-y-6">
      {/* Filter Indicator */}
      {selectedClubFilter && selectedClubFilter !== 'all' && (
        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 size={20} className="text-blue-400" />
              <div>
                <p className="text-sm font-medium text-white">
                  Viewing: {clubGroups.find(g => g.club_id === selectedClubFilter)?.club_name || 'Selected Club'}
                </p>
                <p className="text-xs text-slate-400">Members from this club are shown below</p>
              </div>
            </div>
            <button
              onClick={() => {
                setClubGroups(prev => prev.map(g => ({ ...g, expanded: false })));
              }}
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Collapse
            </button>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-600/20">
              <CheckCircle size={20} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Payments Received</p>
              <p className="text-xl font-bold text-white">{payments.filter(p => p.unallocated_amount > 0).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-600/20">
              <Users size={20} className="text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Members Pending</p>
              <p className="text-xl font-bold text-white">{unpaidMembers.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20">
              <DollarSign size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Total Outstanding</p>
              <p className="text-xl font-bold text-white">
                ${unpaidMembers.reduce((sum, m) => sum + m.state_contribution, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Club Payments Received */}
        <div className="bg-gradient-to-br from-green-900/10 to-transparent border-2 border-green-600/30 rounded-xl p-5">
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-green-600/20">
                <CheckCircle size={22} className="text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Club Payments Received</h3>
                <p className="text-sm text-slate-300">Payments recorded from club remittances</p>
              </div>
            </div>

            {/* Instruction Card */}
            <div className="mt-4 p-3 rounded-lg bg-blue-600/10 border border-blue-600/30">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-blue-600/20 flex-shrink-0">
                  <DollarSign className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-blue-200 font-medium mb-1">How to Reconcile</p>
                  <p className="text-xs text-blue-300/80">
                    Click any payment below to match it with pending members on the right. The system will suggest which members to reconcile.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {payments.filter(p => p.unallocated_amount > 0).length === 0 ? (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-600/50 rounded-lg bg-slate-800/20">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="mb-2 font-medium">No payments requiring reconciliation</p>
              <p className="text-sm mb-4">All payments have been fully allocated. Record a new payment in the finance system with "Club Membership Remittances" category</p>
              <button
                onClick={() => navigate('/finances/invoices?action=create&type=deposit')}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Create a Deposit
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.filter(p => p.unallocated_amount > 0).map(payment => (
                <div
                  key={payment.id}
                  onClick={() => payment.unallocated_amount > 0 && openPaymentReconciliation(payment)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    payment.unallocated_amount > 0
                      ? 'border-slate-600/70 bg-slate-800/40 cursor-pointer hover:border-green-500/70 hover:bg-slate-700/60 hover:shadow-xl'
                      : 'border-green-600/50 bg-green-900/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white text-lg">{payment.payment_reference}</p>
                        {payment.allocated_amount === payment.total_amount && (
                          <span className="px-2 py-0.5 bg-green-600/20 text-green-300 text-xs font-medium rounded-full">
                            Fully Allocated
                          </span>
                        )}
                        {payment.allocated_amount > 0 && payment.allocated_amount < payment.total_amount && (
                          <span className="px-2 py-0.5 bg-red-600/20 text-red-300 text-xs font-medium rounded-full">
                            Partially Allocated
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mt-1">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {new Date(payment.payment_date).toLocaleDateString()}
                      </p>
                      {payment.club_name && (
                        <p className="text-sm text-slate-400 mt-1">
                          <Building2 className="w-3 h-3 inline mr-1" />
                          {payment.club_name}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-sm text-slate-400">Remaining</p>
                        <p className="text-2xl font-bold text-white">
                          ${payment.unallocated_amount.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditPayment(payment)}
                          className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
                          title="Edit Payment"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingPayment(payment)}
                          className="p-1.5 rounded hover:bg-red-600/20 text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete Payment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {payment.allocated_amount > 0 && (
                    <div className="pt-3 border-t border-slate-600/50">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Allocated: ${payment.allocated_amount.toFixed(2)}</span>
                        <span>Total: ${payment.total_amount.toFixed(2)}</span>
                      </div>
                      <div className="mt-2 w-full bg-slate-600 rounded-full h-1.5">
                        <div
                          className="bg-green-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${(payment.allocated_amount / payment.total_amount) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {payment.unallocated_amount > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-600/50">
                      <p className="text-xs text-blue-400 text-center font-medium">
                        Reconcile Club Members →
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Members Requiring Payment */}
        <div className="bg-gradient-to-br from-red-900/10 to-transparent border-2 border-red-600/30 rounded-xl p-5">
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-red-600/20">
                <AlertCircle size={22} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Members Requiring Payment</h3>
                <p className="text-sm text-slate-300">Outstanding remittances to be reconciled</p>
              </div>
            </div>

            {/* Info Card */}
            <div className="mt-4 p-3 rounded-lg bg-red-600/10 border border-red-600/30">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-red-600/20 flex-shrink-0">
                  <Users className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-red-200 font-medium mb-1">Awaiting Reconciliation</p>
                  <p className="text-xs text-red-300/80">
                    These members need payment reconciliation. Click a payment on the left to match with these members.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {clubGroups.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-600/50 rounded-lg bg-slate-800/20">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-500" />
              <p className="font-medium text-white mb-1">All Caught Up!</p>
              <p className="text-sm">No pending members require payment reconciliation</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clubGroups.map(group => (
                <div
                  key={group.club_id}
                  className="rounded-lg border-2 border-slate-600/70 bg-slate-800/40 overflow-hidden hover:border-red-500/50 transition-all"
                >
                  {/* Club Header */}
                  <div
                    onClick={() => toggleClubExpansion(group.club_id)}
                    className="p-4 cursor-pointer hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button className="text-slate-400 hover:text-white transition-colors">
                          {group.expanded ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </button>
                        <div>
                          <p className="font-medium text-white">{group.club_name}</p>
                          <p className="text-sm text-slate-400">
                            {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400 mb-1">Outstanding</p>
                        <p className="text-lg font-semibold text-red-400">
                          ${group.total_amount.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Member List */}
                  {group.expanded && (
                    <div className="border-t border-slate-600/50 bg-slate-800/30">
                      {group.members.map(member => (
                        <div
                          key={member.id}
                          className="p-3 border-b border-slate-600/30 last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar
                                imageUrl={member.member_avatar}
                                firstName={member.member_name.split(' ')[0]}
                                lastName={member.member_name.split(' ').slice(1).join(' ')}
                                size="sm"
                              />
                              <div>
                                <p className="text-white text-sm font-medium">{member.member_name}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-white font-semibold">
                                ${member.state_contribution.toFixed(2)}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">State fee</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* NEW: Payment Reconciliation Sliding Panel */}
      {activePayment && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-end" onClick={() => setActivePayment(null)}>
          <div
            className="bg-slate-800 h-full w-full max-w-2xl shadow-2xl border-l border-slate-700 overflow-auto animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 z-10">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">Match Members to Payment</h2>
                  <p className="text-sm text-slate-400 mt-1">Select members to reconcile against this payment</p>
                </div>
                <button
                  onClick={() => setActivePayment(null)}
                  className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>

              {/* Payment Info Card */}
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600/50">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-white font-semibold text-lg">{activePayment.payment_reference}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                      <span>
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {new Date(activePayment.payment_date).toLocaleDateString()}
                      </span>
                      {activePayment.club_name && (
                        <span>
                          <Building2 className="w-3 h-3 inline mr-1" />
                          {activePayment.club_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Payment Amount</p>
                    <p className="text-2xl font-bold text-white">${activePayment.total_amount.toFixed(2)}</p>
                  </div>
                </div>

                {/* Balance Tracker */}
                {(() => {
                  const selectedMembersData = unpaidMembers.filter(m => reconciliationMembers.has(m.id));
                  const selectedTotal = selectedMembersData.reduce((sum, m) => sum + m.state_contribution, 0);
                  const remaining = activePayment.unallocated_amount - selectedTotal;
                  const isPerfectMatch = Math.abs(remaining) < 0.01;
                  const isOverAllocated = remaining < -0.01;

                  return (
                    <div className={`mt-3 p-3 rounded-lg border ${
                      isPerfectMatch
                        ? 'bg-green-600/10 border-green-600/30'
                        : isOverAllocated
                        ? 'bg-red-600/10 border-red-600/30'
                        : 'bg-blue-600/10 border-blue-600/30'
                    }`}>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-slate-400">Available</p>
                          <p className="text-lg font-semibold text-white">${activePayment.unallocated_amount.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Selected ({reconciliationMembers.size})</p>
                          <p className="text-lg font-semibold text-white">${selectedTotal.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Remaining</p>
                          <p className={`text-lg font-semibold ${
                            isPerfectMatch
                              ? 'text-green-400'
                              : isOverAllocated
                              ? 'text-red-400'
                              : 'text-white'
                          }`}>
                            ${Math.abs(remaining).toFixed(2)}
                            {isPerfectMatch && ' ✓'}
                            {isOverAllocated && ' !'}
                          </p>
                        </div>
                      </div>
                      {isOverAllocated && (
                        <p className="text-xs text-red-300 mt-2">⚠️ Selected amount exceeds available balance</p>
                      )}
                      {isPerfectMatch && (
                        <p className="text-xs text-green-300 mt-2">✓ Perfect match! Ready to reconcile</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Auto-selection Banner */}
              {reconciliationMembers.size > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-green-600/10 border border-green-600/30">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-green-600/20 flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-green-200 font-medium">Auto-Selected Members</p>
                      <p className="text-xs text-green-300/80 mt-1">
                        {(() => {
                          const selectedMembers = unpaidMembers.filter(m => reconciliationMembers.has(m.id));
                          const hasMatchingRef = selectedMembers.some(m =>
                            m.club_to_state_payment_reference === activePayment.payment_reference
                          );

                          if (hasMatchingRef) {
                            return `${reconciliationMembers.size} member${reconciliationMembers.size !== 1 ? 's' : ''} paid by ${activePayment.club_name || 'the club'} with this payment have been automatically selected. This matches the payment made by the club.`;
                          } else {
                            return `${reconciliationMembers.size} member${reconciliationMembers.size !== 1 ? 's' : ''} from ${activePayment.club_name || 'this club'} have been automatically selected based on the payment amount. You can adjust the selection below if needed.`;
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Members List */}
            {(() => {
              const selMembers = unpaidMembers.filter(m => reconciliationMembers.has(m.id));
              const selTotal = selMembers.reduce((sum, m) => sum + m.state_contribution, 0);
              const rem = activePayment.unallocated_amount - selTotal;
              const matched = Math.abs(rem) < 0.01 && reconciliationMembers.size > 0;

              return (
                <>
                  <div className="p-6 pt-0">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Pending Members</h3>
                      <button
                        onClick={() => setReconciliationMembers(new Set())}
                        className="text-sm text-slate-400 hover:text-white transition-colors"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="space-y-3">
                      {clubGroups.map(group => (
                        <div key={group.club_id} className="rounded-lg border border-slate-600/50 bg-slate-700/20 overflow-hidden">
                          <div className="p-3 bg-slate-700/30 border-b border-slate-600/50">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-white">{group.club_name}</p>
                                <p className="text-xs text-slate-400">{group.member_count} members - ${group.total_amount.toFixed(2)}</p>
                              </div>
                              <button
                                onClick={() => {
                                  const clubMemberIds = group.members.map(m => m.id);
                                  const allSelected = clubMemberIds.every(id => reconciliationMembers.has(id));
                                  if (allSelected) {
                                    setReconciliationMembers(prev => {
                                      const newSet = new Set(prev);
                                      clubMemberIds.forEach(id => newSet.delete(id));
                                      return newSet;
                                    });
                                  } else {
                                    setReconciliationMembers(prev => {
                                      const newSet = new Set(prev);
                                      clubMemberIds.forEach(id => newSet.add(id));
                                      return newSet;
                                    });
                                  }
                                }}
                                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                {group.members.every(m => reconciliationMembers.has(m.id)) ? 'Deselect All' : 'Select All'}
                              </button>
                            </div>
                          </div>
                          <div className="divide-y divide-slate-600/30">
                            {group.members.map(member => {
                              const isSelected = reconciliationMembers.has(member.id);
                              return (
                                <div
                                  key={member.id}
                                  onClick={() => toggleReconciliationMember(member.id)}
                                  className={`p-3 cursor-pointer transition-all flex items-center justify-between ${
                                    isSelected && matched
                                      ? 'bg-green-600/15 hover:bg-green-600/25 border-l-2 border-green-500'
                                      : isSelected
                                      ? 'bg-blue-600/15 hover:bg-blue-600/25 border-l-2 border-blue-500'
                                      : 'hover:bg-slate-700/30 border-l-2 border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                                      isSelected && matched
                                        ? 'bg-green-500 border-green-500'
                                        : isSelected
                                        ? 'bg-blue-500 border-blue-500'
                                        : 'border-slate-600 bg-slate-700'
                                    }`}>
                                      {isSelected && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <Avatar
                                      imageUrl={member.member_avatar}
                                      firstName={member.member_name.split(' ')[0]}
                                      lastName={member.member_name.split(' ').slice(1).join(' ')}
                                      size="sm"
                                    />
                                    <div>
                                      <p className={`text-sm font-medium ${isSelected && matched ? 'text-green-200' : isSelected ? 'text-blue-200' : 'text-white'}`}>
                                        {member.member_name}
                                      </p>
                                    </div>
                                  </div>
                                  <p className={`font-semibold ${isSelected && matched ? 'text-green-300' : isSelected ? 'text-blue-300' : 'text-white'}`}>
                                    ${member.state_contribution.toFixed(2)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 p-6">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setActivePayment(null)}
                        className="px-6 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={completePaymentReconciliation}
                        disabled={processing || reconciliationMembers.size === 0}
                        className={`flex-1 px-6 py-3 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          matched
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {processing ? 'Processing...' : `Reconcile ${reconciliationMembers.size} Member${reconciliationMembers.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Reconciliation Modal */}
      {showReconcileModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full border border-slate-700">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Reconcile {selectedMembers.size} Member{selectedMembers.size !== 1 ? 's' : ''}</h3>
              <p className="text-sm text-slate-400 mt-1">Total: ${selectedTotal.toFixed(2)}</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Option Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Choose reconciliation method:
                </label>

                {/* Match to Existing Payment */}
                <div
                  onClick={() => setReconcileOption('existing')}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    reconcileOption === 'existing'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={reconcileOption === 'existing'}
                      onChange={() => setReconcileOption('existing')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-white font-medium">Match to Existing Payment</p>
                      <p className="text-sm text-slate-400 mt-1">
                        Select from {payments.length} available payment{payments.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {reconcileOption === 'existing' && (
                    <div className="mt-4">
                      {payments.length === 0 ? (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                          <p className="text-sm text-red-300">
                            No payments available. Please create a new payment instead.
                          </p>
                        </div>
                      ) : (
                        <select
                          value={selectedPaymentId}
                          onChange={(e) => setSelectedPaymentId(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select payment...</option>
                          {payments.map(payment => (
                            <option key={payment.id} value={payment.id}>
                              {payment.payment_reference} - ${payment.unallocated_amount.toFixed(2)} available
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                {/* Create New Payment */}
                <div
                  onClick={() => setReconcileOption('new')}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    reconcileOption === 'new'
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={reconcileOption === 'new'}
                      onChange={() => setReconcileOption('new')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-white font-medium">Create New Payment</p>
                      <p className="text-sm text-slate-400 mt-1">
                        Record a new payment from the club
                      </p>
                    </div>
                  </div>

                  {reconcileOption === 'new' && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Payment Reference
                        </label>
                        <input
                          type="text"
                          value={newPaymentData.reference}
                          onChange={(e) => setNewPaymentData({ ...newPaymentData, reference: e.target.value })}
                          placeholder="e.g., CLUB-001"
                          className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Amount
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={newPaymentData.amount}
                            onChange={(e) => setNewPaymentData({ ...newPaymentData, amount: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Date
                          </label>
                          <input
                            type="date"
                            value={newPaymentData.date}
                            onChange={(e) => setNewPaymentData({ ...newPaymentData, date: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 flex gap-3">
              <button
                onClick={handleReconcile}
                disabled={processing || !reconcileOption || (reconcileOption === 'existing' && !selectedPaymentId)}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Complete Reconciliation'}
              </button>
              <button
                onClick={() => setShowReconcileModal(false)}
                disabled={processing}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Payment Modal */}
      {editingPayment && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-md w-full border border-slate-700">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Edit Payment</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Payment Reference
                </label>
                <input
                  type="text"
                  value={editData.reference}
                  onChange={(e) => setEditData({ ...editData, reference: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editData.amount}
                  onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={editData.date}
                  onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex gap-3">
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => setEditingPayment(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deletingPayment && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-md w-full border border-slate-700">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Delete Payment</h3>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-500/20">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white mb-2">
                    Are you sure you want to delete payment <strong>{deletingPayment.payment_reference}</strong>?
                  </p>
                  <p className="text-sm text-slate-400">
                    Amount: ${deletingPayment.total_amount.toFixed(2)}
                  </p>
                  {deletingPayment.allocated_amount > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                      <p className="text-sm text-red-300">
                        This payment has ${deletingPayment.allocated_amount.toFixed(2)} allocated.
                        You cannot delete it until you remove all allocations.
                      </p>
                    </div>
                  )}
                  {deletingPayment.allocated_amount === 0 && (
                    <p className="text-sm text-slate-400 mt-2">
                      This action cannot be undone.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex gap-3">
              <button
                onClick={handleDeletePayment}
                disabled={deletingPayment.allocated_amount > 0}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Payment
              </button>
              <button
                onClick={() => setDeletingPayment(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

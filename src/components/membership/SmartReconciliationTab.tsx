import React, { useState, useEffect } from 'react';
import {
  DollarSign, Users, CheckCircle, Sparkles, ArrowRight,
  Plus, LogOut, Calendar, Building2, AlertCircle, Zap, Check,
  ChevronDown, ChevronRight, TrendingUp, Edit, Trash2
} from 'lucide-react';
import { supabase } from '../../utils/supabase';

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
  smart_match?: SmartMatch;
}

interface SmartMatch {
  confidence: 'high' | 'medium' | 'low';
  club_id: string;
  club_name: string;
  member_count: number;
  total_amount: number;
  members: MemberRemittance[];
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
}

interface ClubGroup {
  club_id: string;
  club_name: string;
  members: MemberRemittance[];
  total_amount: number;
  member_count: number;
  expanded: boolean;
}

interface SmartReconciliationTabProps {
  darkMode: boolean;
  stateAssociationId: string;
  selectedYear: number;
}

export const SmartReconciliationTab: React.FC<SmartReconciliationTabProps> = ({
  darkMode,
  stateAssociationId,
  selectedYear
}) => {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unpaidMembers, setUnpaidMembers] = useState<MemberRemittance[]>([]);
  const [clubGroups, setClubGroups] = useState<ClubGroup[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  // Quick add payment state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({
    reference: '',
    amount: '',
    club_id: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Edit payment state
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editData, setEditData] = useState({
    reference: '',
    amount: '',
    date: ''
  });

  // Delete confirmation state
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);

  useEffect(() => {
    loadData();
  }, [stateAssociationId, selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPayments(),
        loadUnpaidMembers()
      ]);
    } catch (error) {
      console.error('Error loading reconciliation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async () => {
    const { data, error } = await supabase
      .from('remittance_payments')
      .select(`
        *,
        clubs:from_club_id(name)
      `)
      .eq('to_state_id', stateAssociationId)
      .eq('to_type', 'state')
      .gte('payment_date', `${selectedYear}-01-01`)
      .lte('payment_date', `${selectedYear}-12-31`)
      .neq('status', 'reconciled')
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('Error loading payments:', error);
      return;
    }

    const paymentsWithMatches = (data || []).map(payment => ({
      ...payment,
      club_name: payment.clubs?.name,
      smart_match: undefined // Will be calculated after loading members
    }));

    setPayments(paymentsWithMatches);
  };

  const loadUnpaidMembers = async () => {
    const { data, error } = await supabase
      .from('membership_remittances')
      .select(`
        id,
        member_id,
        state_contribution_amount,
        national_contribution_amount,
        club_to_state_status,
        members!inner(first_name, last_name, avatar_url),
        clubs!inner(id, name)
      `)
      .eq('state_association_id', stateAssociationId)
      .eq('club_to_state_status', 'pending')
      .gte('membership_start_date', `${selectedYear}-01-01`)
      .lte('membership_start_date', `${selectedYear}-12-31`)
      .order('club_id');

    if (error) {
      console.error('Error loading unpaid members:', error);
      return;
    }

    const formatted = (data || []).map((r: any) => ({
      id: r.id,
      member_id: r.member_id,
      member_name: `${r.members.first_name} ${r.members.last_name}`,
      member_avatar: r.members.avatar_url,
      club_id: r.clubs.id,
      club_name: r.clubs.name,
      state_contribution: Number(r.state_contribution_amount) || 0,
      national_contribution: Number(r.national_contribution_amount) || 0,
      club_to_state_status: r.club_to_state_status
    }));

    setUnpaidMembers(formatted);
    groupMembersByClub(formatted);
    calculateSmartMatches(formatted);
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
      acc[member.club_id].total_amount += member.state_contribution;
      acc[member.club_id].member_count++;
      return acc;
    }, {} as Record<string, ClubGroup>);

    setClubGroups(Object.values(grouped));
  };

  const calculateSmartMatches = (members: MemberRemittance[]) => {
    setPayments(prev => prev.map(payment => {
      if (!payment.from_club_id) return payment;

      // Find members from same club
      const clubMembers = members.filter(m => m.club_id === payment.from_club_id);
      if (clubMembers.length === 0) return payment;

      const totalAmount = clubMembers.reduce((sum, m) => sum + m.state_contribution, 0);

      // Calculate confidence
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (Math.abs(totalAmount - payment.unallocated_amount) < 0.01) {
        confidence = 'high'; // Exact match
      } else if (Math.abs(totalAmount - payment.unallocated_amount) < payment.unallocated_amount * 0.1) {
        confidence = 'medium'; // Within 10%
      }

      return {
        ...payment,
        smart_match: {
          confidence,
          club_id: payment.from_club_id,
          club_name: payment.club_name || '',
          member_count: clubMembers.length,
          total_amount: totalAmount,
          members: clubMembers
        }
      };
    }));
  };

  const handleQuickAddPayment = async () => {
    if (!quickAddData.reference || !quickAddData.amount) {
      alert('Please fill in reference and amount');
      return;
    }

    try {
      const { error } = await supabase
        .from('remittance_payments')
        .insert({
          payment_reference: quickAddData.reference,
          payment_date: quickAddData.date,
          from_club_id: quickAddData.club_id || null,
          from_type: 'club',
          to_state_id: stateAssociationId,
          to_type: 'state',
          total_amount: parseFloat(quickAddData.amount),
          payment_method: 'bank_transfer',
          status: 'pending_reconciliation'
        });

      if (error) throw error;

      // Reset form and reload
      setQuickAddData({
        reference: '',
        amount: '',
        club_id: '',
        date: new Date().toISOString().split('T')[0]
      });
      setShowQuickAdd(false);
      await loadData();
    } catch (error: any) {
      console.error('Error adding payment:', error);
      alert('Failed to add payment: ' + error.message);
    }
  };

  const handleAcceptSmartMatch = async (payment: Payment) => {
    if (!payment.smart_match) return;

    setProcessing(true);
    try {
      // Allocate all members in smart match
      for (const member of payment.smart_match.members) {
        const { error } = await supabase.rpc('allocate_payment_to_remittance', {
          p_payment_id: payment.id,
          p_remittance_id: member.id,
          p_amount: member.state_contribution,
          p_notes: 'Smart match'
        });

        if (error) throw error;
      }

      // Update payment status
      await supabase
        .from('remittance_payments')
        .update({ status: 'reconciled' })
        .eq('id', payment.id);

      await loadData();
      alert(`✅ Successfully reconciled ${payment.smart_match.member_count} members!`);
    } catch (error: any) {
      console.error('Error accepting smart match:', error);
      alert('Failed to reconcile: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleMatchToPayment = async (memberIds: string[], paymentId: string) => {
    setProcessing(true);
    try {
      const membersToMatch = unpaidMembers.filter(m => memberIds.includes(m.id));

      for (const member of membersToMatch) {
        const { error } = await supabase.rpc('allocate_payment_to_remittance', {
          p_payment_id: paymentId,
          p_remittance_id: member.id,
          p_amount: member.state_contribution,
          p_notes: null
        });

        if (error) throw error;
      }

      await loadData();
      setSelectedMembers(new Set());
      alert(`✅ Successfully matched ${membersToMatch.length} members to payment!`);
    } catch (error: any) {
      console.error('Error matching to payment:', error);
      alert('Failed to match: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const toggleClubExpansion = (clubId: string) => {
    setClubGroups(prev => prev.map(group =>
      group.club_id === clubId ? { ...group, expanded: !group.expanded } : group
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
        .from('remittance_payments')
        .update({
          payment_reference: editData.reference,
          total_amount: parseFloat(editData.amount),
          payment_date: editData.date
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
      // Check if payment has been allocated
      if (deletingPayment.allocated_amount > 0) {
        alert('Cannot delete a payment that has been allocated to members. Please remove allocations first.');
        setDeletingPayment(null);
        return;
      }

      const { error } = await supabase
        .from('remittance_payments')
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

  const reconciledCount = payments.filter(p => p.status === 'reconciled').length;
  const totalReconciled = payments
    .filter(p => p.status === 'reconciled')
    .reduce((sum, p) => sum + p.allocated_amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-blue-300">Unmatched Payments</span>
          </div>
          <p className="text-2xl font-bold text-white">{payments.length}</p>
        </div>

        <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-orange-300">Unpaid Members</span>
          </div>
          <p className="text-2xl font-bold text-white">{unpaidMembers.length}</p>
        </div>

        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-sm text-green-300">Reconciled</span>
          </div>
          <p className="text-2xl font-bold text-white">${totalReconciled.toFixed(2)}</p>
        </div>

        <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-purple-300">Success Rate</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {unpaidMembers.length > 0
              ? Math.round((reconciledCount / (reconciledCount + unpaidMembers.length)) * 100)
              : 0}%
          </p>
        </div>
      </div>

      {/* Main Content: Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Unmatched Payments */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Unmatched Payments
            </h3>
            <button
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Quick Add
            </button>
          </div>

          {/* Quick Add Payment */}
          {showQuickAdd && (
            <div className="mb-4 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="Reference"
                  value={quickAddData.reference}
                  onChange={(e) => setQuickAddData({ ...quickAddData, reference: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Amount"
                  value={quickAddData.amount}
                  onChange={(e) => setQuickAddData({ ...quickAddData, amount: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleQuickAddPayment}
                  className="flex-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
                >
                  Add Payment
                </button>
                <button
                  onClick={() => setShowQuickAdd(false)}
                  className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Payment Cards */}
          <div className="space-y-3">
            {payments.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-600 rounded-lg">
                <DollarSign className="mx-auto mb-3 text-slate-600" size={48} />
                <p className="text-slate-400">No unmatched payments</p>
                <p className="text-sm text-slate-500 mt-2">Add payments using Quick Add above</p>
              </div>
            ) : (
              payments.map(payment => (
                <div
                  key={payment.id}
                  className={`p-4 rounded-lg border transition-all ${
                    payment.smart_match?.confidence === 'high'
                      ? 'bg-yellow-500/10 border-yellow-500/50 shadow-lg shadow-yellow-500/20'
                      : 'bg-slate-700/30 border-slate-600/50'
                  }`}
                >
                  {/* Smart Match Badge */}
                  {payment.smart_match && payment.smart_match.confidence === 'high' && (
                    <div className="flex items-center gap-2 mb-3 text-yellow-400">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      <span className="text-sm font-medium">Smart Match Available!</span>
                    </div>
                  )}

                  {/* Payment Info */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="font-semibold text-white text-lg">{payment.payment_reference}</p>
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
                      <p className="text-2xl font-bold text-white">
                        ${payment.unallocated_amount.toFixed(2)}
                      </p>
                      <div className="flex items-center gap-2">
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

                  {/* Smart Match Details */}
                  {payment.smart_match && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-600">
                      <p className="text-sm text-slate-300 mb-2">
                        Matches {payment.smart_match.member_count} members from {payment.smart_match.club_name}
                      </p>
                      <p className="text-xs text-slate-400 mb-3">
                        Expected: ${payment.smart_match.total_amount.toFixed(2)}
                      </p>
                      <button
                        onClick={() => handleAcceptSmartMatch(payment)}
                        disabled={processing}
                        className="w-full px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Zap className="w-4 h-4" />
                        Accept & Reconcile
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Unpaid Members */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Unpaid Members
            </h3>
            {selectedMembers.size > 0 && (
              <span className="text-sm text-blue-400">
                {selectedMembers.size} selected
              </span>
            )}
          </div>

          {/* Club Groups */}
          <div className="space-y-3">
            {clubGroups.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-600 rounded-lg">
                <CheckCircle className="mx-auto mb-3 text-slate-600" size={48} />
                <p className="text-slate-400">All members are paid!</p>
                <p className="text-sm text-slate-500 mt-2">Great job!</p>
              </div>
            ) : (
              clubGroups.map(group => (
                <div
                  key={group.club_id}
                  className="rounded-lg border border-slate-600/50 bg-slate-700/30 overflow-hidden"
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
                        <p className="text-lg font-semibold text-white">
                          ${group.total_amount.toFixed(2)}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectAllInClub(group.club_id);
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Select All
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Member List */}
                  {group.expanded && (
                    <div className="border-t border-slate-600">
                      {group.members.map(member => (
                        <div
                          key={member.id}
                          className={`p-3 border-b border-slate-700 last:border-0 flex items-center gap-3 hover:bg-slate-700/30 transition-colors ${
                            selectedMembers.has(member.id) ? 'bg-blue-500/10' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedMembers.has(member.id)}
                            onChange={() => toggleMemberSelection(member.id)}
                            className="w-4 h-4 rounded border-slate-600"
                          />
                          {member.member_avatar ? (
                            <img
                              src={member.member_avatar}
                              alt={member.member_name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                              <span className="text-xs text-white font-semibold">
                                {member.member_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="text-sm text-white">{member.member_name}</p>
                          </div>
                          <p className="text-sm font-medium text-white">
                            ${member.state_contribution.toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Match to Payment Action */}
          {selectedMembers.size > 0 && payments.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-sm text-blue-300 mb-3">
                Match {selectedMembers.size} selected member{selectedMembers.size !== 1 ? 's' : ''} to payment:
              </p>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleMatchToPayment(Array.from(selectedMembers), e.target.value);
                  }
                }}
                disabled={processing}
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select payment...</option>
                {payments.map(payment => (
                  <option key={payment.id} value={payment.id}>
                    {payment.payment_reference} - ${payment.unallocated_amount.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Edit Payment Modal */}
      {editingPayment && (
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
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPayment && (
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
        </div>
      )}
    </div>
  );
};

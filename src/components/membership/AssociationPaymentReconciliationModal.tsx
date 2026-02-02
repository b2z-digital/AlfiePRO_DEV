import React, { useState, useEffect } from 'react';
import { LogOut, DollarSign, Check, AlertCircle, ArrowRight, Search, Filter, Calendar, Zap } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface RemittancePayment {
  id: string;
  payment_reference: string;
  payment_date: string;
  total_amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  reconciliation_status: string;
  payment_method: string;
  bank_transaction_id: string;
  notes: string;
  from_club_id?: string;
  clubs?: {
    name: string;
  };
}

interface MemberRemittance {
  id: string;
  member_name: string;
  member_avatar: string | null;
  club_name: string;
  state_contribution: number;
  national_contribution: number;
  club_to_state_status: string;
  state_to_national_status: string;
  membership_start_date: string;
  allocated?: number;
}

interface AssociationPaymentReconciliationModalProps {
  darkMode: boolean;
  payment: RemittancePayment;
  associationId: string;
  associationType: 'state' | 'national';
  onClose: () => void;
  onComplete: () => void;
}

export const AssociationPaymentReconciliationModal: React.FC<AssociationPaymentReconciliationModalProps> = ({
  darkMode,
  payment,
  associationId,
  associationType,
  onClose,
  onComplete
}) => {
  const [remittances, setRemittances] = useState<MemberRemittance[]>([]);
  const [filteredRemittances, setFilteredRemittances] = useState<MemberRemittance[]>([]);
  const [selectedRemittances, setSelectedRemittances] = useState<Set<string>>(new Set());
  const [allocations, setAllocations] = useState<Map<string, number>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'allocated'>('pending');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [existingAllocations, setExistingAllocations] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRemittances();
    loadExistingAllocations();
  }, [associationId, associationType]);

  useEffect(() => {
    filterRemittances();
  }, [remittances, searchTerm, filterStatus, existingAllocations]);

  const loadRemittances = async () => {
    setLoading(true);
    try {
      const statusField = associationType === 'state' ? 'club_to_state_status' : 'state_to_national_status';
      const amountField = associationType === 'state' ? 'state_contribution_amount' : 'national_contribution_amount';
      const associationIdField = associationType === 'state' ? 'state_association_id' : 'national_association_id';

      const { data, error } = await supabase
        .from('membership_remittances')
        .select(`
          id,
          ${amountField},
          state_contribution_amount,
          national_contribution_amount,
          club_to_state_status,
          state_to_national_status,
          membership_start_date,
          members!inner(first_name, last_name, avatar_url),
          clubs!inner(name)
        `)
        .eq(associationIdField, associationId)
        .gte('membership_start_date', new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
        .order('membership_start_date', { ascending: false });

      if (error) throw error;

      const formatted = data?.map((r: any) => ({
        id: r.id,
        member_name: `${r.members.first_name} ${r.members.last_name}`,
        member_avatar: r.members.avatar_url,
        club_name: r.clubs.name,
        state_contribution: Number(r.state_contribution_amount) || 0,
        national_contribution: Number(r.national_contribution_amount) || 0,
        club_to_state_status: r.club_to_state_status,
        state_to_national_status: r.state_to_national_status,
        membership_start_date: r.membership_start_date,
        allocated: 0
      })) || [];

      setRemittances(formatted);
    } catch (error: any) {
      console.error('Error loading remittances:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingAllocations = async () => {
    try {
      const { data, error } = await supabase
        .from('remittance_payment_allocations')
        .select('remittance_id')
        .eq('payment_id', payment.id);

      if (error) throw error;

      setExistingAllocations(new Set(data?.map(a => a.remittance_id) || []));
    } catch (error: any) {
      console.error('Error loading allocations:', error);
    }
  };

  const filterRemittances = () => {
    let filtered = remittances;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.member_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.club_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (filterStatus === 'pending') {
      filtered = filtered.filter(r => !existingAllocations.has(r.id));
    } else if (filterStatus === 'allocated') {
      filtered = filtered.filter(r => existingAllocations.has(r.id));
    }

    // Sort: pending first, then by date
    filtered.sort((a, b) => {
      const aAllocated = existingAllocations.has(a.id);
      const bAllocated = existingAllocations.has(b.id);
      if (aAllocated !== bAllocated) return aAllocated ? 1 : -1;
      return new Date(b.membership_start_date).getTime() - new Date(a.membership_start_date).getTime();
    });

    setFilteredRemittances(filtered);
  };

  const getExpectedAmount = (remittance: MemberRemittance): number => {
    return associationType === 'state' ? remittance.state_contribution : remittance.national_contribution;
  };

  const toggleRemittance = (remittanceId: string) => {
    const newSelected = new Set(selectedRemittances);
    const newAllocations = new Map(allocations);

    if (newSelected.has(remittanceId)) {
      newSelected.delete(remittanceId);
      newAllocations.delete(remittanceId);
    } else {
      newSelected.add(remittanceId);
      const remittance = remittances.find(r => r.id === remittanceId);
      if (remittance) {
        newAllocations.set(remittanceId, getExpectedAmount(remittance));
      }
    }

    setSelectedRemittances(newSelected);
    setAllocations(newAllocations);
  };

  const updateAllocation = (remittanceId: string, amount: number) => {
    const newAllocations = new Map(allocations);
    newAllocations.set(remittanceId, amount);
    setAllocations(newAllocations);
  };

  const getTotalAllocated = (): number => {
    return Array.from(allocations.values()).reduce((sum, amount) => sum + amount, 0);
  };

  const getRemainingAmount = (): number => {
    return payment.unallocated_amount - getTotalAllocated();
  };

  const handleAllocate = async () => {
    if (selectedRemittances.size === 0) return;

    setProcessing(true);
    try {
      for (const remittanceId of selectedRemittances) {
        const amount = allocations.get(remittanceId) || 0;

        const { data, error } = await supabase.rpc('allocate_payment_to_remittance', {
          p_payment_id: payment.id,
          p_remittance_id: remittanceId,
          p_amount: amount,
          p_notes: null
        });

        if (error) throw error;

        const result = data as { success: boolean; error?: string };
        if (!result.success) {
          throw new Error(result.error || 'Failed to allocate payment');
        }
      }

      onComplete();
    } catch (error: any) {
      console.error('Error allocating payments:', error);
      alert('Failed to allocate payments: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoMatch = () => {
    let remaining = payment.unallocated_amount;
    const newSelected = new Set<string>();
    const newAllocations = new Map<string, number>();

    // Auto-select pending remittances until payment is fully allocated
    for (const remittance of filteredRemittances) {
      if (existingAllocations.has(remittance.id)) continue;

      const amount = getExpectedAmount(remittance);
      if (amount <= remaining) {
        newSelected.add(remittance.id);
        newAllocations.set(remittance.id, amount);
        remaining -= amount;
      }

      if (remaining <= 0) break;
    }

    setSelectedRemittances(newSelected);
    setAllocations(newAllocations);
  };

  const getProgressPercentage = (): number => {
    return (payment.allocated_amount / payment.total_amount) * 100;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Reconcile Payment
              </h2>
              <p className="text-slate-400">
                Match this payment to member remittances
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Payment Summary Card */}
          <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl p-6 border border-blue-500/30">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-blue-300 mb-1">Payment Reference</p>
                <p className="text-lg font-semibold text-white">{payment.payment_reference}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(payment.payment_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-blue-300 mb-1">Total Amount</p>
                <p className="text-2xl font-bold text-white">${payment.total_amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-green-300 mb-1">Allocated</p>
                <p className="text-2xl font-bold text-green-400">${payment.allocated_amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-orange-300 mb-1">Remaining</p>
                <p className="text-2xl font-bold text-orange-400">${payment.unallocated_amount.toFixed(2)}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Reconciliation Progress</span>
                <span className="text-xs font-medium text-white">{getProgressPercentage().toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
            </div>

            {payment.notes && (
              <div className="mt-3 pt-3 border-t border-blue-500/20">
                <p className="text-xs text-slate-400">{payment.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Current Allocation Summary (if items selected) */}
        {selectedRemittances.size > 0 && (
          <div className="px-6 pt-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-300 mb-1">Current Selection</p>
                  <p className="text-lg font-semibold text-white">
                    {selectedRemittances.size} member{selectedRemittances.size !== 1 ? 's' : ''} selected
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-green-300 mb-1">To Allocate</p>
                  <p className="text-2xl font-bold text-white">${getTotalAllocated().toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400 mb-1">Remaining</p>
                  <p className={`text-2xl font-bold ${getRemainingAmount() < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    ${getRemainingAmount().toFixed(2)}
                  </p>
                </div>
              </div>

              {getRemainingAmount() < 0 && (
                <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Warning: Allocation exceeds payment amount</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters and Search */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by member or club name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Members</option>
              <option value="pending">Pending Only</option>
              <option value="allocated">Already Allocated</option>
            </select>
            <button
              onClick={handleAutoMatch}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Auto Match
            </button>
          </div>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
          ) : filteredRemittances.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto mb-4 text-slate-600" size={48} />
              <p className="text-lg text-slate-400">No members found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRemittances.map((remittance) => {
                const isAllocated = existingAllocations.has(remittance.id);
                const isSelected = selectedRemittances.has(remittance.id);
                const expectedAmount = getExpectedAmount(remittance);
                const allocationAmount = allocations.get(remittance.id) || expectedAmount;

                return (
                  <div
                    key={remittance.id}
                    className={`p-4 rounded-lg border transition-all ${
                      isAllocated
                        ? 'bg-green-500/5 border-green-500/30 opacity-50'
                        : isSelected
                        ? 'bg-blue-500/10 border-blue-500/50 shadow-lg'
                        : 'bg-slate-700/30 border-slate-600/50 hover:border-slate-500/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Checkbox */}
                      <button
                        onClick={() => !isAllocated && toggleRemittance(remittance.id)}
                        disabled={isAllocated}
                        className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                          isAllocated
                            ? 'bg-green-500 border-green-500 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-slate-500 hover:border-blue-400'
                        }`}
                      >
                        {(isAllocated || isSelected) && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>

                      {/* Avatar */}
                      {remittance.member_avatar ? (
                        <img
                          src={remittance.member_avatar}
                          alt={remittance.member_name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
                          <span className="text-white text-sm font-semibold">
                            {remittance.member_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                      )}

                      {/* Member Info */}
                      <div className="flex-1">
                        <p className="font-medium text-white">{remittance.member_name}</p>
                        <p className="text-sm text-slate-400">{remittance.club_name}</p>
                      </div>

                      {/* Amount Input */}
                      {isSelected && !isAllocated && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-400">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={allocationAmount}
                            onChange={(e) => updateAllocation(remittance.id, parseFloat(e.target.value) || 0)}
                            className="w-24 px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}

                      {/* Expected Amount */}
                      {!isSelected && (
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">${expectedAmount.toFixed(2)}</p>
                          {isAllocated && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300">
                              Allocated
                            </span>
                          )}
                        </div>
                      )}

                      {/* Arrow */}
                      {isSelected && !isAllocated && (
                        <ArrowRight className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">
                {selectedRemittances.size > 0
                  ? `${selectedRemittances.size} member${selectedRemittances.size !== 1 ? 's' : ''} selected`
                  : 'Select members to allocate this payment'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAllocate}
                disabled={selectedRemittances.size === 0 || getRemainingAmount() < 0 || processing}
                className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Allocate ${getTotalAllocated().toFixed(2)}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

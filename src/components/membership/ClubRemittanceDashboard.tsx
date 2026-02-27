import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, AlertCircle, CheckCircle, Clock, Download, RefreshCw, ArrowUpRight, Check, X, CheckSquare, Square, Wallet, AlertTriangle, ChevronDown, Calendar, Filter } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { Avatar } from '../ui/Avatar';
import {
  getClubOutstandingTotal,
  getRemittancesWithMembers,
  exportRemittancesToCSV,
  isRemittanceOverdue,
  getOverdueDays,
  MembershipRemittance,
  ClubOutstandingTotal
} from '../../utils/remittanceStorage';

interface ClubDropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

const ClubAppDropdown: React.FC<{
  value: string;
  options: ClubDropdownOption[];
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

interface ClubRemittanceDashboardProps {
  darkMode: boolean;
  onRecordPayment: () => void;
}

export const ClubRemittanceDashboard: React.FC<ClubRemittanceDashboardProps> = ({
  darkMode,
  onRecordPayment
}) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [outstanding, setOutstanding] = useState<ClubOutstandingTotal | null>(null);
  const [remittances, setRemittances] = useState<MembershipRemittance[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [showBulkPaymentModal, setShowBulkPaymentModal] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [bulkPaymentDetails, setBulkPaymentDetails] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'bank_transfer',
    reference: '',
    notes: ''
  });

  useEffect(() => {
    if (currentClub?.clubId) {
      loadData();
    }
  }, [currentClub, selectedYear, selectedStatus]);

  const loadData = async () => {
    if (!currentClub?.clubId) return;

    setLoading(true);
    try {
      const [outstandingData, remittancesData, allPendingData] = await Promise.all([
        getClubOutstandingTotal(currentClub.clubId),
        getRemittancesWithMembers(currentClub.clubId, {
          status: selectedStatus,
          year: selectedYear !== 'all' ? selectedYear : undefined
        }),
        getRemittancesWithMembers(currentClub.clubId, { status: 'pending' })
      ]);

      setOutstanding(outstandingData);
      setRemittances(remittancesData);
      setOverdueCount(allPendingData.filter(r => isRemittanceOverdue(r)).length);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error loading remittance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleExport = () => {
    exportRemittancesToCSV(
      remittances,
      `${currentClub?.name}-remittances-${selectedYear === 'all' ? 'all-years' : selectedYear}.csv`
    );
  };

  const toggleRemittanceStatus = async (remittanceId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
      const updates: any = {
        club_to_state_status: newStatus
      };

      if (newStatus === 'paid') {
        updates.club_to_state_paid_date = new Date().toISOString().split('T')[0];
      } else {
        updates.club_to_state_paid_date = null;
      }

      const { error } = await supabase
        .from('membership_remittances')
        .update(updates)
        .eq('id', remittanceId);

      if (error) {
        addNotification('error', `Failed to update remittance: ${error.message}`);
        return;
      }

      addNotification('success', `Remittance marked as ${newStatus}`);
      await loadData();
    } catch (error: any) {
      addNotification('error', 'Failed to update remittance. Please try again.');
    }
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
    if (selectedIds.size === remittances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(remittances.map(r => r.id)));
    }
  };

  const handleBulkMarkAsPaid = () => {
    if (selectedIds.size === 0) return;
    setShowBulkPaymentModal(true);
  };

  const confirmBulkPayment = async () => {
    if (selectedIds.size === 0) return;

    setBulkActionInProgress(true);
    try {
      // Calculate total amount from selected remittances
      const selectedRemittances = remittances.filter(r => selectedIds.has(r.id));
      const stateTotal = selectedRemittances.reduce((sum, r) => sum + (r.state_contribution_amount || 0), 0);
      const nationalTotal = selectedRemittances.reduce((sum, r) => sum + (r.national_contribution_amount || 0), 0);
      const totalAmount = stateTotal; // Club only pays state fee, which includes national portion
      const memberCount = selectedRemittances.length;

      // Update remittances as paid with bulk_payment flag to prevent trigger from creating individual transactions
      const { error: remittanceError } = await supabase
        .from('membership_remittances')
        .update({
          club_to_state_status: 'paid',
          club_to_state_paid_date: bulkPaymentDetails.paymentDate,
          club_to_state_payment_reference: bulkPaymentDetails.reference || `Bulk payment - ${memberCount} members`,
          bulk_payment: true
        })
        .in('id', Array.from(selectedIds));

      if (remittanceError) throw remittanceError;

      // Find or create "Association Fees" category
      let categoryId: string | null = null;

      const { data: categories } = await supabase
        .from('budget_categories')
        .select('id')
        .eq('club_id', currentClub.clubId)
        .eq('name', 'Association Fees')
        .maybeSingle();

      if (categories) {
        categoryId = categories.id;
      } else {
        // Create the category
        const { data: newCategory, error: categoryError } = await supabase
          .from('budget_categories')
          .insert({
            club_id: currentClub.clubId,
            name: 'Association Fees',
            type: 'expense',
            is_system: true,
            system_key: 'association_fees'
          })
          .select('id')
          .single();

        if (categoryError) throw categoryError;
        categoryId = newCategory.id;
      }

      // Get state association details for payee field
      const stateAssociationId = selectedRemittances[0]?.state_association_id;
      let stateAssociationName = 'State Association';

      if (stateAssociationId) {
        const { data: stateAssoc } = await supabase
          .from('state_associations')
          .select('name, short_name')
          .eq('id', stateAssociationId)
          .maybeSingle();

        if (stateAssoc) {
          stateAssociationName = stateAssoc.short_name || stateAssoc.name;
        }
      }

      // Map payment method to valid values (cash, card, cheque, bank, other)
      const paymentMethodMap: Record<string, string> = {
        'bank_transfer': 'bank',
        'credit_card': 'card',
        'check': 'cheque'
      };
      const mappedPaymentMethod = paymentMethodMap[bulkPaymentDetails.paymentMethod] || bulkPaymentDetails.paymentMethod;

      const paymentReference = bulkPaymentDetails.reference || `ASSOC-${new Date().getTime()}`;

      // Create finance transaction for the bulk payment (club expense)
      const { error: financeError } = await supabase
        .from('transactions')
        .insert({
          club_id: currentClub.clubId,
          description: `State Association fees - ${memberCount} members (includes $${nationalTotal.toFixed(2)} for National Association)`,
          amount: totalAmount,
          type: 'expense',
          category_id: categoryId,
          date: bulkPaymentDetails.paymentDate,
          payment_method: mappedPaymentMethod,
          payment_status: 'paid',
          payee: stateAssociationName,
          reference: paymentReference,
          notes: bulkPaymentDetails.notes || `Payment to State Association for ${memberCount} member fees. State will remit $${nationalTotal.toFixed(2)} to National Association.`,
          linked_entity_type: 'bulk_remittance',
          linked_entity_id: null
        });

      if (financeError) throw financeError;

      // Create corresponding deposit in state association finances
      if (stateAssociationId) {
        // Find or create "Club Remittances" income category for state association
        const { data: stateCategories } = await supabase
          .from('association_budget_categories')
          .select('id')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('system_key', 'club_remittances')
          .maybeSingle();

        let stateCategoryId = stateCategories?.id;

        if (!stateCategoryId) {
          const { data: newCategory, error: categoryError } = await supabase
            .from('association_budget_categories')
            .insert({
              association_id: stateAssociationId,
              association_type: 'state',
              name: 'Club Remittances',
              type: 'income',
              is_system: true,
              system_key: 'club_remittances',
              description: 'Membership fee remittances from clubs'
            })
            .select('id')
            .single();

          if (categoryError) throw categoryError;
          stateCategoryId = newCategory.id;
        }

        // Get club name
        const clubName = currentClub.club?.name || 'Unknown Club';

        // Create the deposit transaction in association finances
        const { error: associationFinanceError } = await supabase
          .from('association_transactions')
          .insert({
            association_id: stateAssociationId,
            association_type: 'state',
            description: `Membership Remittance from ${clubName} - ${memberCount} members`,
            amount: totalAmount,
            type: 'income',
            category_id: stateCategoryId,
            date: bulkPaymentDetails.paymentDate,
            payment_method: mappedPaymentMethod,
            payment_status: 'completed',
            payer: clubName,
            reference: paymentReference,
            notes: `Bulk remittance for ${memberCount} members (includes $${nationalTotal.toFixed(2)} for National Association)`,
            linked_entity_type: 'club',
            linked_entity_id: currentClub.clubId
          });

        if (associationFinanceError) throw associationFinanceError;

        // Create remittance_payments entry for Payment History tracking
        const { error: remittancePaymentError } = await supabase
          .from('remittance_payments')
          .insert({
            from_club_id: currentClub.clubId,
            from_type: 'club',
            to_state_id: stateAssociationId,
            to_type: 'state',
            payment_date: bulkPaymentDetails.paymentDate,
            total_amount: totalAmount,
            allocated_amount: totalAmount, // Fully allocated to the members who paid
            payment_method: mappedPaymentMethod,
            payment_reference: paymentReference,
            notes: `Bulk remittance for ${memberCount} members (includes $${nationalTotal.toFixed(2)} for National Association)`,
            reconciliation_status: 'completed'
          });

        if (remittancePaymentError) {
          console.error('Error creating remittance payment:', remittancePaymentError);
          throw remittancePaymentError;
        }
      }

      addNotification('success', `Marked ${selectedIds.size} remittances as paid and recorded in finances`);
      setSelectedIds(new Set());
      setShowBulkPaymentModal(false);
      setBulkPaymentDetails({
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        reference: '',
        notes: ''
      });
      await loadData();
    } catch (error: any) {
      addNotification('error', `Failed to process payment: ${error.message}`);
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const handleBulkMarkAsPending = async () => {
    if (selectedIds.size === 0) return;

    setBulkActionInProgress(true);
    try {
      const updates = {
        club_to_state_status: 'pending',
        club_to_state_paid_date: null
      };

      const { error } = await supabase
        .from('membership_remittances')
        .update(updates)
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      addNotification('success', `Marked ${selectedIds.size} remittances as pending`);
      await loadData();
    } catch (error: any) {
      addNotification('error', `Failed to update remittances: ${error.message}`);
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const availableYears = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - i
  );

  if (loading) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <span className="ml-3 text-slate-300">
            Loading remittance data...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outstanding Summary Card - Slate Styling */}
      <div className={`bg-slate-800/50 backdrop-blur-sm rounded-xl border ${
        outstanding && outstanding.pending_count > 0 ? 'border-orange-500/50' : 'border-green-500/50'
      } overflow-hidden`}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Outstanding to State Association
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Membership fees pending remittance
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {outstanding && outstanding.pending_count > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                  <span className="text-sm font-medium text-orange-300">
                    Pending Members
                  </span>
                </div>
                <p className="text-3xl font-bold text-white">
                  {outstanding.pending_count}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">
                    National Fee
                  </span>
                </div>
                <p className="text-3xl font-bold text-white">
                  ${outstanding.national_contribution_total?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-purple-300/60 mt-1">
                  To national association
                </p>
              </div>

              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-blue-400" />
                  <span className="text-sm font-medium text-blue-300">
                    State Fee
                  </span>
                </div>
                <p className="text-3xl font-bold text-white">
                  ${((outstanding.state_contribution_total || 0) - (outstanding.national_contribution_total || 0)).toFixed(2)}
                </p>
                <p className="text-xs text-blue-300/60 mt-1">
                  To state association
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-300">
                    Total Outstanding
                  </span>
                </div>
                <p className="text-3xl font-bold text-white">
                  ${outstanding.state_contribution_total?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-emerald-300/60 mt-1">
                  Amount to remit to state
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <div>
                  <p className="font-medium text-white">
                    All remittances up to date
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    No pending payments to state association
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overdue Warning Banner */}
      {overdueCount > 0 && (
        <div className="bg-red-500/10 backdrop-blur-sm rounded-xl border border-red-500/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="font-medium text-red-300">
                  {overdueCount} overdue remittance{overdueCount !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-red-400/70">
                  Association fees unpaid for 4+ weeks from membership start date
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedStatus('overdue')}
              className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium transition-colors text-sm"
            >
              View Overdue
            </button>
          </div>
        </div>
      )}

      {/* Filters with Export Button */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <ClubAppDropdown
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

          <ClubAppDropdown
            value={selectedStatus}
            onChange={(v) => setSelectedStatus(v)}
            icon={<Filter size={15} />}
            options={[
              { value: 'pending', label: 'Pending', icon: <Clock size={14} className="text-orange-400" /> },
              { value: 'paid', label: 'Paid', icon: <CheckCircle size={14} className="text-green-400" /> },
              { value: 'overdue', label: 'Overdue', icon: <AlertTriangle size={14} className="text-red-400" /> },
              { value: 'waived', label: 'Waived', icon: <X size={14} className="text-slate-400" /> }
            ]}
            minWidth={160}
          />

          <button
            onClick={handleExport}
            disabled={remittances.length === 0}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 border ${
              remittances.length === 0
                ? 'bg-slate-800/80 border-slate-700/60 text-slate-500 cursor-not-allowed'
                : 'bg-slate-800/80 border-slate-700/60 hover:bg-slate-700/80 hover:border-slate-600 text-slate-300 hover:text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Bulk Actions Toolbar - Only show when items are selected */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-500/10 backdrop-blur-sm rounded-xl border border-blue-500/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5 text-blue-400" />
              <span className="text-white font-medium">
                {selectedIds.size} {selectedIds.size === 1 ? 'remittance' : 'remittances'} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkMarkAsPaid}
                disabled={bulkActionInProgress}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                Mark as Paid
              </button>
              <button
                onClick={handleBulkMarkAsPending}
                disabled={bulkActionInProgress}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Clock className="w-4 h-4" />
                Mark as Pending
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white font-medium transition-colors"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remittances Table - Slate Styling */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Member
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Year
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Amount to Remit
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Paid Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Actions
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
                  >
                    {selectedIds.size === remittances.length && remittances.length > 0 ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {remittances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Clock className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm text-slate-400">
                      No remittances found for the selected filters
                    </p>
                  </td>
                </tr>
              ) : (
                remittances.map((remittance) => {
                  const overdue = isRemittanceOverdue(remittance);
                  const overdueDays = overdue ? getOverdueDays(remittance) : 0;
                  const overdueWeeks = Math.floor(overdueDays / 7);

                  return (
                  <tr
                    key={remittance.id}
                    className={`hover:bg-slate-700/30 transition-colors ${
                      selectedIds.has(remittance.id)
                        ? 'bg-blue-500/10'
                        : overdue
                        ? 'bg-red-500/5 border-l-2 border-l-red-500'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar
                            imageUrl={remittance.member?.avatar_url}
                            firstName={remittance.member?.first_name || ''}
                            lastName={remittance.member?.last_name || ''}
                            size="sm"
                          />
                          {overdue && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                              <AlertTriangle className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white">
                            {remittance.member ? `${remittance.member.first_name} ${remittance.member.last_name}` : 'Unknown'}
                          </div>
                          <div className="text-sm text-slate-400">
                            {remittance.member?.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      {remittance.membership_year}
                    </td>
                    <td className={`px-4 py-4 font-medium ${overdue ? 'text-red-400' : 'text-blue-400'}`}>
                      ${remittance.state_contribution_amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-4">
                      {overdue ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            Overdue
                          </span>
                          <span className="text-[10px] text-red-400/70">
                            {overdueWeeks} week{overdueWeeks !== 1 ? 's' : ''} overdue
                          </span>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          remittance.club_to_state_status === 'paid'
                            ? 'bg-green-900/30 text-green-400'
                            : remittance.club_to_state_status === 'waived'
                            ? 'bg-slate-700/50 text-slate-400'
                            : 'bg-orange-900/30 text-orange-400'
                        }`}>
                          {remittance.club_to_state_status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-400">
                      {remittance.club_to_state_paid_date
                        ? new Date(remittance.club_to_state_paid_date).toLocaleDateString()
                        : overdue
                        ? <span className="text-red-400">Overdue</span>
                        : 'Pending'}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleRemittanceStatus(remittance.id, remittance.club_to_state_status)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          remittance.club_to_state_status === 'paid'
                            ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                        title={remittance.club_to_state_status === 'paid' ? 'Mark as Pending' : 'Mark as Paid'}
                      >
                        {remittance.club_to_state_status === 'paid' ? (
                          <>
                            <X size={14} />
                            Pending
                          </>
                        ) : (
                          <>
                            <CheckCircle size={14} />
                            Mark Paid
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleSelection(remittance.id)}
                        className="text-slate-400 hover:text-blue-400 transition-colors"
                      >
                        {selectedIds.has(remittance.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-400" />
                        ) : (
                          <Square className="w-5 h-5" />
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

      {/* Bulk Payment Modal */}
      {showBulkPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-2xl font-bold text-white">Record Bulk Payment</h2>
              <p className="text-slate-400 mt-1">
                Recording payment for {selectedIds.size} member{selectedIds.size !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Payment Summary */}
              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Members</p>
                    <p className="text-2xl font-bold text-white">{selectedIds.size}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Total Amount</p>
                    <p className="text-2xl font-bold text-white">
                      ${remittances
                        .filter(r => selectedIds.has(r.id))
                        .reduce((sum, r) => sum + (r.state_contribution_amount || 0), 0)
                        .toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">State Association Fee:</span>
                      <span className="text-white font-medium">
                        ${remittances
                          .filter(r => selectedIds.has(r.id))
                          .reduce((sum, r) => sum + (r.state_contribution_amount || 0), 0)
                          .toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      This is the amount you pay to the State Association
                    </p>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-blue-300">Included: National Association portion</span>
                      <span className="text-blue-300 font-medium">
                        ${remittances
                          .filter(r => selectedIds.has(r.id))
                          .reduce((sum, r) => sum + (r.national_contribution_amount || 0), 0)
                          .toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-blue-400/70 mt-1">
                      The State Association will remit this to the National Association
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Details Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={bulkPaymentDetails.paymentDate}
                    onChange={(e) => setBulkPaymentDetails({...bulkPaymentDetails, paymentDate: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Payment Method
                  </label>
                  <ClubAppDropdown
                    value={bulkPaymentDetails.paymentMethod}
                    onChange={(v) => setBulkPaymentDetails({...bulkPaymentDetails, paymentMethod: v})}
                    icon={<Wallet size={15} />}
                    options={[
                      { value: 'bank_transfer', label: 'Bank Transfer', icon: <ArrowUpRight size={14} className="text-blue-400" /> },
                      { value: 'credit_card', label: 'Credit Card', icon: <Wallet size={14} className="text-green-400" /> },
                      { value: 'debit_card', label: 'Debit Card', icon: <Wallet size={14} className="text-teal-400" /> },
                      { value: 'cash', label: 'Cash', icon: <DollarSign size={14} className="text-yellow-400" /> },
                      { value: 'check', label: 'Check', icon: <CheckCircle size={14} className="text-slate-400" /> },
                      { value: 'other', label: 'Other', icon: <Clock size={14} className="text-slate-400" /> }
                    ]}
                    minWidth={220}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Payment Reference
                  </label>
                  <input
                    type="text"
                    value={bulkPaymentDetails.reference}
                    onChange={(e) => setBulkPaymentDetails({...bulkPaymentDetails, reference: e.target.value})}
                    placeholder="e.g., Transaction ID, Check number"
                    className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={bulkPaymentDetails.notes}
                    onChange={(e) => setBulkPaymentDetails({...bulkPaymentDetails, notes: e.target.value})}
                    placeholder="Any additional notes about this payment"
                    rows={3}
                    className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Finance Integration Notice */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <div className="flex gap-3">
                  <Wallet className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-300">Finance Integration</p>
                    <p className="text-sm text-blue-400/80 mt-1">
                      This payment will be automatically recorded in your finances as an expense under "Association Fees" category.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBulkPaymentModal(false);
                  setBulkPaymentDetails({
                    paymentDate: new Date().toISOString().split('T')[0],
                    paymentMethod: 'bank_transfer',
                    reference: '',
                    notes: ''
                  });
                }}
                disabled={bulkActionInProgress}
                className="px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkPayment}
                disabled={bulkActionInProgress}
                className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkActionInProgress ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirm Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

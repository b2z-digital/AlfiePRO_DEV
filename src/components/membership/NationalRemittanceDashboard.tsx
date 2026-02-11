import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Globe, TrendingUp, CheckCircle, Download, RefreshCw, BarChart3, DollarSign, Check, X, CheckSquare, Square, Plus, Receipt, ChevronDown, Calendar } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { AssociationPaymentReconciliationModal } from './AssociationPaymentReconciliationModal';
import {
  getNationalRemittances,
  getPaymentsForEntity,
  exportRemittancesToCSV,
  exportPaymentsToCSV,
  MembershipRemittance,
  AssociationPayment
} from '../../utils/remittanceStorage';

interface NationalRemittanceDashboardProps {
  darkMode: boolean;
  nationalAssociationId: string;
}

interface NatDropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

const NatAppDropdown: React.FC<{
  value: string;
  options: NatDropdownOption[];
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

interface StateStats {
  stateId: string;
  stateName: string;
  logoUrl?: string;
  totalMembers: number;
  paidMembers: number;
  pendingMembers: number;
  totalOwed: number;
  totalPaid: number;
}

export const NationalRemittanceDashboard: React.FC<NationalRemittanceDashboardProps> = ({
  darkMode,
  nationalAssociationId
}) => {
  const [loading, setLoading] = useState(true);
  const [remittances, setRemittances] = useState<MembershipRemittance[]>([]);
  const [payments, setPayments] = useState<AssociationPayment[]>([]);
  const [stateStats, setStateStats] = useState<StateStats[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedTab, setSelectedTab] = useState<'overview' | 'remittances' | 'payments'>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  useEffect(() => {
    if (nationalAssociationId) {
      loadData();
    }
  }, [nationalAssociationId, selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [remittancesData, paymentsData] = await Promise.all([
        getNationalRemittances(nationalAssociationId, { year: selectedYear !== 'all' ? selectedYear : undefined }),
        getPaymentsForEntity('national_association', nationalAssociationId)
      ]);

      // Fetch state association names and logos
      const stateIds = [...new Set(remittancesData.map(r => r.state_association_id).filter(Boolean))];
      const { data: stateAssociations } = await supabase
        .from('state_associations')
        .select('id, name, short_name, abbreviation, logo_url')
        .in('id', stateIds);

      const stateNameMap = new Map(
        stateAssociations?.map(s => [
          s.id,
          s.abbreviation || s.short_name || s.name
        ]) || []
      );

      const stateLogoMap = new Map(
        stateAssociations?.map(s => [s.id, s.logo_url]) || []
      );

      // Enrich remittances with state names
      const enrichedRemittances = remittancesData.map(r => ({
        ...r,
        state_name: stateNameMap.get(r.state_association_id) || 'Unknown State'
      }));

      setRemittances(enrichedRemittances as any);
      setPayments(paymentsData);

      // Calculate state-level statistics
      const stateMap = new Map<string, StateStats>();

      remittancesData.forEach(r => {
        if (!r.state_association_id) return;

        const existing = stateMap.get(r.state_association_id) || {
          stateId: r.state_association_id,
          stateName: stateNameMap.get(r.state_association_id) || 'Unknown State',
          logoUrl: stateLogoMap.get(r.state_association_id),
          totalMembers: 0,
          paidMembers: 0,
          pendingMembers: 0,
          totalOwed: 0,
          totalPaid: 0
        };

        existing.totalMembers++;
        existing.totalOwed += r.national_contribution_amount;

        if (r.state_to_national_status === 'paid') {
          existing.paidMembers++;
          existing.totalPaid += r.national_contribution_amount;
        } else {
          existing.pendingMembers++;
        }

        stateMap.set(r.state_association_id, existing);
      });

      setStateStats(Array.from(stateMap.values()));
    } catch (error) {
      console.error('Error loading national remittance data:', error);
    } finally {
      setLoading(false);
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
      r => r.state_to_national_status === 'pending'
    );

    if (selectedIds.size === eligibleRemittances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleRemittances.map(r => r.id)));
    }
  };

  const handleBulkMarkPaid = async () => {
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

  const handleMarkPaid = async (remittanceId: string) => {
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

      await loadData();
    } catch (error: any) {
      console.error('Error marking remittance as paid:', error);
    }
  };

  const totalRevenue = remittances
    .filter(r => r.state_to_national_status === 'paid')
    .reduce((sum, r) => sum + r.national_contribution_amount, 0);

  const totalOutstanding = remittances
    .filter(r => r.state_to_national_status === 'pending')
    .reduce((sum, r) => sum + r.national_contribution_amount, 0);

  const totalMembers = remittances.length;

  const availableYears = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - i
  );

  if (loading) {
    return (
      <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <span className={`ml-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Loading national association data...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card - Slate Styling */}
      <div className={`bg-slate-800/50 backdrop-blur-sm rounded-xl border ${
        totalOutstanding > 0 ? 'border-orange-500/50' : 'border-green-500/50'
      } overflow-hidden`}>
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
                    Track membership contributions from state associations
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
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-blue-300">
                  Total Members
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                {totalMembers}
              </p>
              <p className="text-xs text-blue-300/60 mt-1">
                Across {stateStats.length} state associations
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">
                  Total Revenue
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                ${totalRevenue.toFixed(2)}
              </p>
              <p className="text-xs text-emerald-300/60 mt-1">
                Received from states
              </p>
            </div>

            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-orange-400" />
                <span className="text-sm font-medium text-orange-300">
                  Outstanding
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                ${totalOutstanding.toFixed(2)}
              </p>
              <p className="text-xs text-orange-300/60 mt-1">
                Pending from states
              </p>
            </div>

            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                <span className="text-sm font-medium text-purple-300">
                  Collection Rate
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                {totalMembers > 0 ? ((totalRevenue / (totalRevenue + totalOutstanding)) * 100).toFixed(1) : '0'}%
              </p>
              <p className="text-xs text-purple-300/60 mt-1">
                Of total expected revenue
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="border-b border-slate-700">
          <nav className="flex -mb-px">
            <button
              onClick={() => setSelectedTab('overview')}
              className={`px-6 py-4 font-medium transition-colors ${
                selectedTab === 'overview'
                  ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              State Overview
            </button>
            <button
              onClick={() => setSelectedTab('remittances')}
              className={`px-6 py-4 font-medium transition-colors ${
                selectedTab === 'remittances'
                  ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              All Remittances ({remittances.length})
            </button>
            <button
              onClick={() => setSelectedTab('payments')}
              className={`px-6 py-4 font-medium transition-colors ${
                selectedTab === 'payments'
                  ? 'bg-slate-700/50 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Payment History ({payments.length})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* State Overview Tab */}
          {selectedTab === 'overview' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <NatAppDropdown
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

                <button
                  onClick={() => exportRemittancesToCSV(remittances, `national-remittances-${selectedYear === 'all' ? 'all-years' : selectedYear}.csv`)}
                  disabled={remittances.length === 0}
                  className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 border ${
                    remittances.length === 0
                      ? 'bg-slate-800/80 border-slate-700/60 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-800/80 border-slate-700/60 hover:bg-slate-700/80 hover:border-slate-600 text-slate-300 hover:text-white'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  Export Overview
                </button>
              </div>

              {stateStats.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className={`w-12 h-12 mx-auto mb-3 text-green-500`} />
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No state remittance data for selected year
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stateStats.map((state) => (
                    <div
                      key={state.stateId}
                      className="p-4 rounded-lg bg-slate-700/30 border border-slate-600/50 hover:border-slate-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {state.logoUrl ? (
                            <img
                              src={state.logoUrl}
                              alt={state.stateName}
                              className="w-10 h-10 rounded-lg object-cover bg-white/5"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-600/50 flex items-center justify-center">
                              <span className="text-slate-400 text-xs font-bold">
                                {state.stateName.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <h4 className="font-semibold text-white">
                            {state.stateName}
                          </h4>
                        </div>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          state.pendingMembers === 0
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-orange-500/20 text-orange-300'
                        }`}>
                          {state.pendingMembers === 0 ? 'Paid' : `${state.pendingMembers} pending`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-slate-400">
                            Total Members
                          </p>
                          <p className="text-lg font-semibold text-white">
                            {state.totalMembers}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">
                            Paid Members
                          </p>
                          <p className="text-lg font-semibold text-green-400">
                            {state.paidMembers}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">
                            Total Owed
                          </p>
                          <p className="text-lg font-semibold text-white">
                            ${state.totalOwed.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">
                            Total Paid
                          </p>
                          <p className="text-lg font-semibold text-green-400">
                            ${state.totalPaid.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="h-2 rounded-full bg-slate-600 overflow-hidden">
                          <div
                            className="h-full bg-green-500 transition-all duration-300"
                            style={{
                              width: `${state.totalOwed > 0 ? (state.totalPaid / state.totalOwed) * 100 : 0}%`
                            }}
                          />
                        </div>
                        <p className="text-xs mt-1 text-slate-400">
                          {state.totalOwed > 0 ? ((state.totalPaid / state.totalOwed) * 100).toFixed(1) : '0'}% collected
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Remittances Tab */}
          {selectedTab === 'remittances' && (
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
                        onClick={handleBulkMarkPaid}
                        disabled={bulkActionInProgress}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check size={18} />
                        Mark Paid
                      </button>
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors flex items-center gap-2"
                      >
                        <X size={18} />
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-3 mb-5">
                <NatAppDropdown
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
                <button
                  onClick={toggleSelectAll}
                  className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 hover:border-slate-600 text-sm font-medium transition-all flex items-center gap-2"
                >
                  <CheckSquare size={15} className="text-slate-400" />
                  {selectedIds.size === remittances.filter(r => r.state_to_national_status === 'pending').length ? 'Deselect All' : 'Select All Pending'}
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-300">Member</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-300">State</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">Year</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-300">National Amount</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">Status</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">Paid Date</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">Actions</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-slate-300">Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remittances.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12">
                          <p className="text-slate-400">No remittances found</p>
                        </td>
                      </tr>
                    ) : (
                      remittances.map((remittance) => {
                        const isPending = remittance.state_to_national_status === 'pending';
                        return (
                          <tr key={remittance.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                            <td className="py-3 px-4 text-white">
                              {remittance.member ? `${remittance.member.first_name} ${remittance.member.last_name}` : 'Unknown'}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              {(remittance as any).state_name || '-'}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-300">
                              {remittance.membership_year}
                            </td>
                            <td className="py-3 px-4 text-right text-white">
                              ${remittance.national_contribution_amount.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                remittance.state_to_national_status === 'paid'
                                  ? 'bg-green-500/20 text-green-300'
                                  : 'bg-orange-500/20 text-orange-300'
                              }`}>
                                {remittance.state_to_national_status === 'paid' ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center text-slate-300">
                              {remittance.state_to_national_paid_date
                                ? new Date(remittance.state_to_national_paid_date).toLocaleDateString()
                                : '-'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isPending && (
                                <button
                                  onClick={() => handleMarkPaid(remittance.id)}
                                  className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
                                >
                                  Mark Paid
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isPending && (
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

          {/* Payments Tab */}
          {selectedTab === 'payments' && (
            <div>
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => exportPaymentsToCSV(payments, `national-payments-${selectedYear === 'all' ? 'all-years' : selectedYear}.csv`)}
                  disabled={payments.length === 0}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                    darkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  } ${payments.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Download className="w-4 h-4" />
                  Export Payments
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                    <tr>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                        darkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}>
                        Date
                      </th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                        darkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}>
                        From
                      </th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                        darkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}>
                        Type
                      </th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                        darkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}>
                        Amount
                      </th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                        darkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}>
                        Reference
                      </th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                        darkMode ? 'text-gray-300' : 'text-gray-500'
                      }`}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    {payments.map((payment) => (
                      <tr key={payment.id} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                        <td className={`px-6 py-4 whitespace-nowrap ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                          {new Date(payment.payment_date).toLocaleDateString()}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                          {payment.from_entity_type}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            payment.payment_type === 'bulk'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {payment.payment_type}
                          </span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          ${payment.amount.toFixed(2)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {payment.payment_reference || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            payment.reconciliation_status === 'reconciled'
                              ? 'bg-green-100 text-green-800'
                              : payment.reconciliation_status === 'disputed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {payment.reconciliation_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

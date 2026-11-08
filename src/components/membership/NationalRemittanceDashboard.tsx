import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Globe, TrendingUp, Download, RefreshCw, ChartBar as BarChart3, DollarSign, Check, X, SquareCheck as CheckSquare, Square, Plus, Receipt, ChevronDown, Calendar } from 'lucide-react';
import { InlineLoading, KpiCard, OrgLogo, PageHead } from '../association/AssocUI';
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
      <div className="flex flex-col gap-[22px]">
        <PageHead icon={<DollarSign size={24} />} title="Remittances" sub="Membership contributions from your state associations" />
        <InlineLoading label="Loading national association data…" />
      </div>
    );
  }

  const collectionRate = totalMembers > 0 && (totalRevenue + totalOutstanding) > 0
    ? ((totalRevenue / (totalRevenue + totalOutstanding)) * 100).toFixed(1)
    : '0';
  const pendingCount = remittances.filter(r => r.state_to_national_status === 'pending').length;
  const YEAR_OPTIONS = [
                    { value: 'all', label: 'All Years', icon: <Calendar size={14} /> },
                    ...availableYears.map(year => ({
                      value: String(year),
                      label: String(year),
                      icon: <Calendar size={14} />
                    }))
                  ];
  const tabs: { id: typeof selectedTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'State overview', count: stateStats.length },
    { id: 'remittances', label: 'All remittances', count: remittances.length },
    { id: 'payments', label: 'Payment history', count: payments.length },
  ];

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHead
        icon={<DollarSign size={24} />}
        title="Remittances"
        sub="Membership contributions from your state associations"
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
        <KpiCard cap="Total members" value={totalMembers} sub={`Across ${stateStats.length} state association${stateStats.length === 1 ? '' : 's'}`} icon={<Globe size={18} />} />
        <KpiCard cap="Received" value={`$${totalRevenue.toFixed(2)}`} sub="Paid on by the states" icon={<DollarSign size={18} />} tone={totalRevenue > 0 ? 'green' : undefined} />
        <KpiCard cap="Outstanding" value={`$${totalOutstanding.toFixed(2)}`} sub="Still to come from the states" icon={<TrendingUp size={18} />} tone={totalOutstanding > 0 ? 'amber' : undefined} />
        <KpiCard cap="Collection rate" value={`${collectionRate}%`} sub="Of the total expected" icon={<BarChart3 size={18} />} />
      </div>

      {/* Tabs */}
      <div className="a-seg self-start max-w-full overflow-x-auto" role="tablist" aria-label="Remittances">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selectedTab === t.id}
            onClick={() => setSelectedTab(t.id)}
            className={`a-seg-i ${selectedTab === t.id ? 'a-seg-on' : ''}`}
          >
            {t.label}
            {t.count !== undefined && <span className="a-cnt">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="a-card overflow-hidden">
        <div className="p-4 sm:p-6">
          {/* State Overview Tab */}
          {selectedTab === 'overview' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center gap-3 flex-wrap mb-4">
                <NatAppDropdown
                  value={String(selectedYear)}
                  onChange={(v) => setSelectedYear(v === 'all' ? 'all' : Number(v))}
                  icon={<Calendar size={15} />}
                  options={YEAR_OPTIONS}
                  minWidth={160}
                />

                <button
                  type="button"
                  onClick={() => exportRemittancesToCSV(remittances, `national-remittances-${selectedYear === 'all' ? 'all-years' : selectedYear}.csv`)}
                  disabled={remittances.length === 0}
                  className="a-btn"
                >
                  <Download className="w-4 h-4" />
                  Export overview
                </button>
              </div>

              {stateStats.length === 0 ? (
                <div className="a-empty py-12">
                  <span className="a-tile" style={{ width: 56, height: 56 }}><Globe size={24} /></span>
                  <p className="a-mute text-sm m-0">No state remittance data for the selected year</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stateStats.map((state) => {
                    const pct = state.totalOwed > 0 ? (state.totalPaid / state.totalOwed) * 100 : 0;
                    return (
                      <article key={state.stateId} className="a-card a-clubcard">
                        <div className="flex items-center gap-3">
                          <OrgLogo src={state.logoUrl} name={state.stateName} />
                          <h4 className="flex-1 min-w-0 a-ink font-semibold text-[15.5px] m-0 truncate">{state.stateName}</h4>
                          <span className={`a-lb-fmt ${state.pendingMembers === 0 ? 'a-txt-g' : 'a-txt-a'}`}>
                            <span className={`a-light ${state.pendingMembers === 0 ? 'a-light-g' : 'a-light-a'}`} />
                            {state.pendingMembers === 0 ? 'Paid' : `${state.pendingMembers} pending`}
                          </span>
                        </div>

                        <div className="a-wells" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                          <div className="a-well"><span className="a-well-n">{state.totalMembers}</span><span className="a-well-l">Members</span></div>
                          <div className="a-well"><span className={`a-well-n ${state.paidMembers === 0 ? 'is-zero' : ''}`}>{state.paidMembers}</span><span className="a-well-l">Paid</span></div>
                          <div className="a-well"><span className="a-well-n" style={{ fontSize: 17 }}>${state.totalOwed.toFixed(0)}</span><span className="a-well-l">Owed</span></div>
                          <div className="a-well"><span className="a-well-n a-txt-g" style={{ fontSize: 17 }}>${state.totalPaid.toFixed(0)}</span><span className="a-well-l">Received</span></div>
                        </div>

                        <div>
                          <div className="a-progress" style={{ height: 6 }}>
                            <i style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <p className="text-xs mt-2 a-mute m-0">{pct.toFixed(1)}% collected · ${state.totalOwed.toFixed(2)} owed, ${state.totalPaid.toFixed(2)} received</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Remittances Tab */}
          {selectedTab === 'remittances' && (
            <div>
              {/* Bulk Actions Toolbar */}
              {selectedIds.size > 0 && (
                <div className="a-bulkbar mb-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <CheckSquare className="w-5 h-5 a-txt-b" />
                      <span className="a-ink font-semibold text-sm">
                        {selectedIds.size} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleBulkMarkPaid}
                        disabled={bulkActionInProgress}
                        className="a-btn a-btn-g a-btn-sm"
                      >
                        <Check size={16} />
                        Mark paid
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="a-btn a-btn-q a-btn-sm"
                      >
                        <X size={16} />
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <NatAppDropdown
                  value={String(selectedYear)}
                  onChange={(v) => setSelectedYear(v === 'all' ? 'all' : Number(v))}
                  icon={<Calendar size={15} />}
                  options={YEAR_OPTIONS}
                  minWidth={160}
                />
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="a-btn"
                  disabled={pendingCount === 0}
                >
                  <CheckSquare size={15} className="a-mute" />
                  {selectedIds.size === pendingCount && pendingCount > 0 ? 'Deselect all' : 'Select all pending'}
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full a-atable">
                  <thead>
                    <tr>
                      <th className="text-left py-3 px-4">Member</th>
                      <th className="text-left py-3 px-4">State</th>
                      <th className="text-center py-3 px-4">Year</th>
                      <th className="text-right py-3 px-4">National amount</th>
                      <th className="text-center py-3 px-4">Status</th>
                      <th className="text-center py-3 px-4">Paid date</th>
                      <th className="text-center py-3 px-4">Actions</th>
                      <th className="text-center py-3 px-4">Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remittances.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12">
                          <p className="a-mute text-sm m-0">No remittances found</p>
                        </td>
                      </tr>
                    ) : (
                      remittances.map((remittance) => {
                        const isPending = remittance.state_to_national_status === 'pending';
                        const isSel = selectedIds.has(remittance.id);
                        return (
                          <tr key={remittance.id} className={isSel ? 'is-sel' : ''}>
                            <td className="py-3 px-4 a-ink font-medium whitespace-nowrap">
                              {remittance.member ? `${remittance.member.first_name} ${remittance.member.last_name}` : 'Unknown'}
                            </td>
                            <td className="py-3 px-4 a-mute">
                              {(remittance as any).state_name || '-'}
                            </td>
                            <td className="py-3 px-4 text-center a-mute a-num">
                              {remittance.membership_year}
                            </td>
                            <td className="py-3 px-4 text-right a-ink a-num">
                              ${remittance.national_contribution_amount.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`a-lb-fmt ${remittance.state_to_national_status === 'paid' ? 'a-txt-g' : 'a-txt-a'}`}>
                                <span className={`a-light ${remittance.state_to_national_status === 'paid' ? 'a-light-g' : 'a-light-a'}`} />
                                {remittance.state_to_national_status === 'paid' ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center a-mute whitespace-nowrap">
                              {remittance.state_to_national_paid_date
                                ? new Date(remittance.state_to_national_paid_date).toLocaleDateString()
                                : '-'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isPending && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkPaid(remittance.id)}
                                  className="a-btn a-btn-g a-btn-sm"
                                >
                                  Mark paid
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isPending && (
                                <button
                                  type="button"
                                  onClick={() => toggleSelection(remittance.id)}
                                  className="p-1"
                                  aria-label={isSel ? 'Deselect' : 'Select'}
                                >
                                  {isSel ? (
                                    <CheckSquare className="w-5 h-5 a-txt-b" />
                                  ) : (
                                    <Square className="w-5 h-5 a-dim" />
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
                  type="button"
                  onClick={() => exportPaymentsToCSV(payments, `national-payments-${selectedYear === 'all' ? 'all-years' : selectedYear}.csv`)}
                  disabled={payments.length === 0}
                  className="a-btn"
                >
                  <Download className="w-4 h-4" />
                  Export payments
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full a-atable">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">From</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Reference</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12">
                          <p className="a-mute text-sm m-0">No payments recorded yet</p>
                        </td>
                      </tr>
                    )}
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3 whitespace-nowrap a-ink">
                          {new Date(payment.payment_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap a-mute capitalize">
                          {payment.from_entity_type}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`a-lb-fmt capitalize ${payment.payment_type === 'bulk' ? 'a-txt-b' : ''}`}>
                            {payment.payment_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold a-ink a-num">
                          ${payment.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap a-mute">
                          {payment.payment_reference || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`a-lb-fmt capitalize ${
                            payment.reconciliation_status === 'reconciled'
                              ? 'a-txt-g'
                              : payment.reconciliation_status === 'disputed'
                              ? 'a-txt-r'
                              : 'a-txt-a'
                          }`}>
                            <span className={`a-light ${
                              payment.reconciliation_status === 'reconciled'
                                ? 'a-light-g'
                                : payment.reconciliation_status === 'disputed'
                                ? 'a-light-r'
                                : 'a-light-a'
                            }`} />
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

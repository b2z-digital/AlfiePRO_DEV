import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck as CheckCircle, Clock, Download, RefreshCw, Check, X, Wallet, TriangleAlert as AlertTriangle, ChevronDown, Calendar } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { AAvatar, AStatus, ASwitch } from '../alfie/Kit';
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
  block?: boolean;
}> = ({ value, options, onChange, icon, placeholder = 'Select...', minWidth = 160, block = false }) => {
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
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`a-pick ${block ? 'w-full' : ''}`}
        style={{ minWidth, height: block ? 46 : undefined }}
      >
        {icon && <span className="a-mute flex">{icon}</span>}
        <span className="flex-1 text-left">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
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
                role="option"
                aria-selected={value === opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`a-pop-item ${value === opt.value ? 'a-pop-item-on' : ''}`}
              >
                {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                <span className="flex-1">{opt.label}</span>
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

interface ClubRemittanceDashboardProps {
  darkMode: boolean;
  onRecordPayment: () => void;
}

export const ClubRemittanceDashboard: React.FC<ClubRemittanceDashboardProps> = () => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [outstanding, setOutstanding] = useState<ClubOutstandingTotal | null>(null);
  const [remittances, setRemittances] = useState<MembershipRemittance[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
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
    notes: '',
    skipFinanceTransactions: false
  });

  useEffect(() => {
    if (currentClub?.clubId) {
      loadData();
    }
  }, [currentClub, selectedYear, selectedStatus]);

  useEffect(() => {
    if (!currentClub?.clubId) return;

    const channel = supabase
      .channel('club-remittances-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'membership_remittances', filter: `club_id=eq.${currentClub.clubId}` },
        () => { loadData(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'remittance_payments' },
        () => { loadData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentClub?.clubId]);

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
        getRemittancesWithMembers(currentClub.clubId, { status: 'pending', year: new Date().getFullYear() })
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

      if (!bulkPaymentDetails.skipFinanceTransactions) {
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
              allocated_amount: totalAmount,
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
      }

      const successMsg = bulkPaymentDetails.skipFinanceTransactions
        ? `Marked ${selectedIds.size} remittances as previously paid (no finance transactions created)`
        : `Marked ${selectedIds.size} remittances as paid and recorded in finances`;
      addNotification('success', successMsg);
      setSelectedIds(new Set());
      setShowBulkPaymentModal(false);
      setBulkPaymentDetails({
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        reference: '',
        notes: '',
        skipFinanceTransactions: false
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
      <div className="a-card p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-7 h-7 animate-spin a-txt-b" />
          <span className="ml-3 a-mute">Loading remittance data...</span>
        </div>
      </div>
    );
  }

  const hasPending = !!outstanding && outstanding.pending_count > 0;
  const RCOLS = '20px minmax(240px,1.6fr) 80px 120px 140px 130px 150px';
  const allSelected = selectedIds.size === remittances.length && remittances.length > 0;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const totalShown = remittances.reduce((sum, r) => sum + (r.state_contribution_amount || 0), 0);
  const statusLabel: Record<string, string> = { pending: 'pending', paid: 'paid', overdue: 'overdue', waived: 'waived' };
  const money = (n?: number | null) => `$${(n || 0).toFixed(2)}`;
  const Chk = ({ on, mixed, onClick, label }: { on: boolean; mixed?: boolean; onClick: () => void; label: string }) => (
    <button type="button" role="checkbox" aria-checked={mixed ? 'mixed' : on} aria-label={label} onClick={onClick} className={`a-chk ${on || mixed ? 'a-chk-on' : ''}`}>
      {mixed ? <span style={{ width: 9, height: 2, borderRadius: 1, background: '#fff' }} /> : on ? <Check size={13} strokeWidth={3} /> : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-[22px]">
      <div className={`a-card a-hero ${hasPending ? 'a-hero-a' : 'a-hero-g'} flex flex-wrap items-center gap-[22px]`} style={{ padding: 22 }}>
        <span className="a-tile" style={{ width: 56, height: 56 }}>{hasPending ? <Wallet size={24} /> : <CheckCircle size={24} />}</span>
        <div className="flex-1 min-w-[240px]">
          <p className="a-cap">Outstanding to State Association</p>
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 mt-1.5">
            <span className="a-num a-ink text-[40px] font-semibold leading-none">{money(outstanding?.state_contribution_total)}</span>
            {hasPending
              ? <AStatus tone="a">{outstanding!.pending_count} member{outstanding!.pending_count !== 1 ? 's' : ''} pending</AStatus>
              : <AStatus tone="g">All remittances up to date</AStatus>}
          </div>
          <p className="a-mute mt-1.5 mb-0 text-[13.5px]">
            {hasPending
              ? `Includes ${money(outstanding!.national_contribution_total)} national fee and ${money((outstanding!.state_contribution_total || 0) - (outstanding!.national_contribution_total || 0))} state fee`
              : 'No pending payments to the state association'}
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="a-ib a-ib-box" aria-label="Refresh" title="Refresh">
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {overdueCount > 0 && (
        <div className="a-card flex flex-wrap items-center gap-3.5" style={{ padding: '14px 18px' }}>
          <span className="a-tile a-tile-sm a-txt-r"><AlertTriangle size={17} /></span>
          <div className="flex-1 min-w-0">
            <div className="a-ink text-[14.5px] font-semibold">{overdueCount} overdue remittance{overdueCount !== 1 ? 's' : ''}</div>
            <div className="a-mute text-[13px] mt-0.5">Association fees unpaid for 4+ weeks from membership start date</div>
          </div>
          <button onClick={() => setSelectedStatus('overdue')} className="a-btn a-btn-d a-btn-sm">View overdue</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <ClubAppDropdown
          value={String(selectedYear)}
          onChange={(v) => setSelectedYear(v === 'all' ? 'all' : Number(v))}
          icon={<Calendar size={16} />}
          options={[
            { value: 'all', label: 'All years' },
            ...availableYears.map(year => ({ value: String(year), label: String(year) }))
          ]}
          minWidth={120}
        />
        <div className="a-seg" role="tablist" aria-label="Status">
          {(['pending', 'paid', 'overdue', 'waived'] as const).map(st => (
            <button key={st} role="tab" aria-selected={selectedStatus === st} onClick={() => setSelectedStatus(st)} className={`a-seg-i ${selectedStatus === st ? 'a-seg-on' : ''}`}>
              {st.charAt(0).toUpperCase() + st.slice(1)}
              {selectedStatus === st && remittances.length > 0 && <span className="a-cnt">{remittances.length}</span>}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={handleExport} disabled={remittances.length === 0} className="a-btn"><Download size={16} />Export CSV</button>
      </div>

      {selectedIds.size > 0 && (
        <div className="a-bulkbar flex flex-wrap items-center gap-3">
          <Chk on onClick={() => setSelectedIds(new Set())} label="Clear selection" />
          <span className="flex-1 a-ink text-[14.5px]"><b className="a-num font-semibold">{selectedIds.size}</b> {selectedIds.size === 1 ? 'remittance' : 'remittances'} selected</span>
          <button onClick={handleBulkMarkAsPaid} disabled={bulkActionInProgress} className="a-btn a-btn-g"><Check size={16} />Mark as paid</button>
          <button onClick={handleBulkMarkAsPending} disabled={bulkActionInProgress} className="a-btn a-btn-a"><Clock size={16} />Mark as pending</button>
          <button onClick={() => setSelectedIds(new Set())} className="a-btn a-btn-q">Clear</button>
        </div>
      )}

      {remittances.length === 0 ? (
        <div className="a-card a-empty" style={{ padding: '36px 24px' }}>
          <span className="a-tile" style={{ width: 56, height: 56 }}><Clock size={24} /></span>
          <div className="a-display a-ink text-lg font-semibold">No {statusLabel[selectedStatus] || ''} remittances</div>
          <p className="a-mute m-0 text-sm">Nothing matches {selectedYear === 'all' ? 'any year' : selectedYear} and this status.</p>
        </div>
      ) : (
        <div className="a-card overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid gap-4 items-center px-[18px] py-3 a-thead" style={{ gridTemplateColumns: RCOLS }}>
              <Chk on={allSelected} mixed={someSelected} onClick={toggleSelectAll} label="Select all" />
              <p className="a-cap">Member</p><p className="a-cap">Year</p><p className="a-cap">To remit</p><p className="a-cap">Status</p><p className="a-cap">Paid</p><p className="a-cap text-right">Action</p>
            </div>
            {remittances.map((remittance) => {
              const overdue = isRemittanceOverdue(remittance);
              const overdueWeeks = overdue ? Math.floor(getOverdueDays(remittance) / 7) : 0;
              const st = remittance.club_to_state_status;
              const sel = selectedIds.has(remittance.id);
              return (
                <div key={remittance.id} className={`a-row a-row-hover gap-4 ${sel ? 'a-row-sel' : ''}`} style={{ display: 'grid', gridTemplateColumns: RCOLS, paddingTop: 12, paddingBottom: 12 }}>
                  <Chk on={sel} onClick={() => toggleSelection(remittance.id)} label={`Select ${remittance.member?.first_name ?? ''} ${remittance.member?.last_name ?? ''}`} />
                  <div className="flex items-center gap-3 min-w-0">
                    <AAvatar url={remittance.member?.avatar_url} first={remittance.member?.first_name} last={remittance.member?.last_name} />
                    <div className="min-w-0">
                      <div className="a-ink text-[14.5px] font-semibold truncate">{remittance.member ? `${remittance.member.first_name} ${remittance.member.last_name}` : 'Unknown'}</div>
                      <div className="a-dim text-[12.5px] truncate">{remittance.member?.email}</div>
                    </div>
                  </div>
                  <span className="a-mute a-num text-[13.5px]" style={{ letterSpacing: 0 }}>{remittance.membership_year}</span>
                  <span className={`a-num text-base font-semibold ${overdue ? 'a-txt-r' : 'a-ink'}`}>{money(remittance.state_contribution_amount)}</span>
                  {overdue
                    ? <AStatus tone="r">Overdue · {overdueWeeks} wk{overdueWeeks !== 1 ? 's' : ''}</AStatus>
                    : st === 'paid' ? <AStatus tone="g">Paid</AStatus>
                    : st === 'waived' ? <AStatus>Waived</AStatus>
                    : <AStatus tone="a">Pending</AStatus>}
                  <span className="a-mute a-num text-[13px]" style={{ letterSpacing: 0 }}>
                    {remittance.club_to_state_paid_date
                      ? new Date(remittance.club_to_state_paid_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                  <div className="flex justify-end">
                    <button
                      onClick={() => toggleRemittanceStatus(remittance.id, st)}
                      className={`a-btn ${st === 'paid' ? 'a-btn-q' : 'a-btn-g'}`}
                      style={{ height: 34, padding: '0 12px', fontSize: 13 }}
                    >
                      {st === 'paid' ? <><Clock size={14} />Mark pending</> : <><CheckCircle size={14} />Mark paid</>}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between px-[18px] py-3.5 a-tfoot">
              <span className="a-mute text-[13.5px]">{remittances.length} {statusLabel[selectedStatus] || ''} remittance{remittances.length !== 1 ? 's' : ''}</span>
              <span className="text-[13.5px]"><span className="a-mute">{selectedStatus === 'paid' ? 'Total remitted ' : 'Total '}</span><b className="a-num a-ink font-semibold">{money(totalShown)}</b></span>
            </div>
          </div>
        </div>
      )}

      {showBulkPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="a-sheet max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="a-panel-head">
              <span className="a-tile a-tile-rim"><Wallet size={18} /></span>
              <div className="flex-1 min-w-0">
                <p className="a-cap">Record bulk payment</p>
                <h2 className="a-display a-ink text-[22px] font-semibold mt-[3px]">{selectedIds.size} member{selectedIds.size !== 1 ? 's' : ''}</h2>
              </div>
              <button onClick={() => setShowBulkPaymentModal(false)} disabled={bulkActionInProgress} className="a-ib" aria-label="Close"><X size={20} /></button>
            </div>

            <div className="p-[22px] flex flex-col gap-5">
              <div className="a-inset">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="a-cap">Members</p><p className="a-num a-ink text-2xl font-semibold mt-1">{selectedIds.size}</p></div>
                  <div><p className="a-cap">Total amount</p><p className="a-num a-ink text-2xl font-semibold mt-1">{money(remittances.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + (r.state_contribution_amount || 0), 0))}</p></div>
                </div>
                <div className="mt-4 pt-4 a-card-rule border-t border-white/[0.06] text-sm flex justify-between">
                  <span className="a-mute">Includes National Association portion</span>
                  <span className="a-num a-ink font-semibold">{money(remittances.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + (r.national_contribution_amount || 0), 0))}</span>
                </div>
                <p className="a-dim text-xs mt-1 mb-0">The State Association remits this portion to the National Association.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label>
                  <span className="a-flab">Payment date</span>
                  <input type="date" value={bulkPaymentDetails.paymentDate} onChange={(e) => setBulkPaymentDetails({ ...bulkPaymentDetails, paymentDate: e.target.value })} className="a-inp a-inp-date" />
                </label>
                <div>
                  <span className="a-flab">Payment method</span>
                  <ClubAppDropdown
                    value={bulkPaymentDetails.paymentMethod}
                    onChange={(v) => setBulkPaymentDetails({ ...bulkPaymentDetails, paymentMethod: v })}
                    icon={<Wallet size={16} />}
                    options={[
                      { value: 'bank_transfer', label: 'Bank transfer' },
                      { value: 'credit_card', label: 'Credit card' },
                      { value: 'debit_card', label: 'Debit card' },
                      { value: 'cash', label: 'Cash' },
                      { value: 'check', label: 'Cheque' },
                      { value: 'other', label: 'Other' }
                    ]}
                    minWidth={220}
                    block
                  />
                </div>
              </div>
              <label>
                <span className="a-flab">Payment reference</span>
                <input type="text" value={bulkPaymentDetails.reference} onChange={(e) => setBulkPaymentDetails({ ...bulkPaymentDetails, reference: e.target.value })} placeholder="e.g., transaction ID or cheque number" className="a-inp" />
              </label>
              <label>
                <span className="a-flab">Notes (optional)</span>
                <textarea value={bulkPaymentDetails.notes} onChange={(e) => setBulkPaymentDetails({ ...bulkPaymentDetails, notes: e.target.value })} placeholder="Any additional notes about this payment" rows={3} className="a-inp" />
              </label>

              <div className="a-well">
                <span className="a-tile a-tile-sm"><Wallet size={16} /></span>
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-[14.5px] font-semibold">Already paid externally (before import)</div>
                  <div className="a-dim text-[12.5px] mt-0.5">Marks these remittances as paid without creating finance transactions, for fees already recorded before the import.</div>
                </div>
                <ASwitch
                  checked={!!bulkPaymentDetails.skipFinanceTransactions}
                  onChange={(v) => setBulkPaymentDetails({ ...bulkPaymentDetails, skipFinanceTransactions: v })}
                  label="Already paid externally"
                />
              </div>
              {bulkPaymentDetails.skipFinanceTransactions
                ? <AStatus tone="a" className="text-[13px] whitespace-normal"><span className="a-mute">No expense or income transactions will be created.</span></AStatus>
                : <AStatus tone="b" className="text-[13px] whitespace-normal"><span className="a-mute">This payment is recorded in your finances as an expense under "Association Fees".</span></AStatus>}
            </div>

            <div className="a-panel-foot">
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
                className="a-btn"
              >
                Cancel
              </button>
              <button onClick={confirmBulkPayment} disabled={bulkActionInProgress} className="a-btn a-btn-p">
                {bulkActionInProgress ? <><RefreshCw className="w-4 h-4 animate-spin" />Processing…</> : <><Check className="w-4 h-4" />Confirm payment</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

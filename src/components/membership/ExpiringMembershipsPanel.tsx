import React, { useState, useEffect } from 'react';
import { TriangleAlert as AlertTriangle, Calendar, Mail, Clock, RefreshCw, Download, Search, ArrowRightLeft, DollarSign, CircleCheck as CheckCircle, Banknote, X, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { AAvatar, AStatus } from '../alfie/Kit';
import { sendPaymentConfirmation, sendRenewalPendingNotification } from '../../utils/membershipUtils';
import { updateMembershipTransactionStatus } from '../../utils/membershipFinanceUtils';

interface MembershipType {
  id: string;
  name: string;
  fee: number;
  renewal_period: string | null;
}

interface ExpiringMember {
  member_id: string;
  first_name: string;
  last_name: string;
  email: string;
  renewal_date: string;
  days_until_expiry: number;
  membership_level: string;
  is_financial: boolean;
  phone: string;
}

interface PendingRenewal {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  membership_level: string;
  avatar_url?: string;
  payment_amount: number;
  payment_method: string;
  payment_date: string;
  user_id: string;
}

interface ExpiringMembershipsPanelProps {
  darkMode: boolean;
}

export const ExpiringMembershipsPanel: React.FC<ExpiringMembershipsPanelProps> = () => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [expiringMembers, setExpiringMembers] = useState<ExpiringMember[]>([]);
  const [overdueMembers, setOverdueMembers] = useState<any[]>([]);
  const [pendingRenewals, setPendingRenewals] = useState<PendingRenewal[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDays, setFilterDays] = useState(90);
  const [activeTab, setActiveTab] = useState<'pending' | 'expiring' | 'overdue'>('pending');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [replacementMap, setReplacementMap] = useState<Record<string, string>>({});
  const [confirmingPayment, setConfirmingPayment] = useState<string | null>(null);
  const [renewingMember, setRenewingMember] = useState<string | null>(null);
  const [bulkRenewing, setBulkRenewing] = useState(false);
  const [bulkMarkingPaid, setBulkMarkingPaid] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewTarget, setRenewTarget] = useState<ExpiringMember | null>(null);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedMembershipType, setSelectedMembershipType] = useState<string>('');
  const [bulkRenewType, setBulkRenewType] = useState<string>('');
  const [showBulkRenewModal, setShowBulkRenewModal] = useState(false);

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchExpiringMemberships();
      fetchPendingRenewals();
    }
  }, [currentClub, filterDays]);

  useEffect(() => {
    if (!currentClub?.clubId) return;

    const channel = supabase
      .channel('renewals-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `club_id=eq.${currentClub.clubId}` },
        () => { fetchExpiringMemberships(); fetchPendingRenewals(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'membership_payments' },
        () => { fetchPendingRenewals(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentClub?.clubId]);

  const fetchExpiringMemberships = async () => {
    if (!currentClub?.clubId) return;

    try {
      setLoading(true);

      // Fetch expiring memberships using the database function
      const { data: expiringData, error: expiringError } = await supabase
        .rpc('get_expiring_memberships', {
          p_club_id: currentClub.clubId,
          p_days_ahead: filterDays
        });

      if (expiringError) throw expiringError;

      // Fetch overdue memberships
      const { data: overdueData, error: overdueError } = await supabase
        .rpc('get_overdue_memberships', {
          p_club_id: currentClub.clubId
        });

      if (overdueError) throw overdueError;

      setExpiringMembers(expiringData || []);
      setOverdueMembers(overdueData || []);

      const { data: typesData } = await supabase
        .from('membership_types')
        .select('id, name, is_active, replaces_membership_type_id, amount, renewal_period')
        .eq('club_id', currentClub.clubId);

      if (typesData) {
        const map: Record<string, string> = {};
        const inactiveTypes = typesData.filter(t => !t.is_active);
        const activeReplacements = typesData.filter(t => t.is_active && t.replaces_membership_type_id);

        for (const replacement of activeReplacements) {
          const oldType = inactiveTypes.find(t => t.id === replacement.replaces_membership_type_id);
          if (oldType) {
            map[oldType.name] = replacement.name;
          }
        }
        setReplacementMap(map);

        const activeTypes = typesData
          .filter(t => t.is_active)
          .filter(t => !t.name.toLowerCase().includes('lifetime'))
          .map(t => ({ id: t.id, name: t.name, fee: t.amount || 0, renewal_period: t.renewal_period }));
        setMembershipTypes(activeTypes);
      }
    } catch (error) {
      console.error('Error fetching expiring memberships:', error);
      addNotification('error', 'Failed to load expiring memberships');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingRenewals = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data: members, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, membership_level, user_id, avatar_url')
        .eq('club_id', currentClub.clubId)
        .eq('payment_status', 'pending')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      if (!members || members.length === 0) {
        setPendingRenewals([]);
        return;
      }

      const memberIds = members.map(m => m.id);
      const { data: payments } = await supabase
        .from('membership_payments')
        .select('member_id, amount, payment_method, created_at')
        .in('member_id', memberIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const paymentMap = new Map<string, any>();
      payments?.forEach(p => {
        if (!paymentMap.has(p.member_id)) {
          paymentMap.set(p.member_id, p);
        }
      });

      const renewals: PendingRenewal[] = members.map(m => {
        const payment = paymentMap.get(m.id);
        return {
          id: m.id,
          first_name: m.first_name,
          last_name: m.last_name,
          email: m.email,
          membership_level: m.membership_level || 'Member',
          avatar_url: m.avatar_url,
          payment_amount: payment?.amount || 0,
          payment_method: payment?.payment_method || 'bank_transfer',
          payment_date: payment?.created_at || new Date().toISOString(),
          user_id: m.user_id,
        };
      });

      setPendingRenewals(renewals);
    } catch (error) {
      console.error('Error fetching pending renewals:', error);
    }
  };

  const handleConfirmRenewalPayment = async (member: PendingRenewal) => {
    try {
      setConfirmingPayment(member.id);

      // Get club renewal settings
      const { data: clubData } = await supabase
        .from('clubs')
        .select('renewal_mode, fixed_renewal_date')
        .eq('id', currentClub?.clubId)
        .single();

      let renewalDate: Date;
      const now = new Date();

      if (clubData?.renewal_mode === 'fixed' && clubData?.fixed_renewal_date) {
        const [month, day] = clubData.fixed_renewal_date.split('-').map(Number);
        renewalDate = new Date(now.getFullYear(), month - 1, day);
        if (renewalDate <= now) {
          renewalDate = new Date(now.getFullYear() + 1, month - 1, day);
        }
      } else {
        renewalDate = new Date(now);
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      }

      const { error: memberError } = await supabase
        .from('members')
        .update({
          is_financial: true,
          payment_status: 'paid',
          membership_status: 'active',
          payment_confirmed_at: new Date().toISOString(),
          renewal_date: renewalDate.toISOString().split('T')[0],
          amount_paid: member.payment_amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.id);

      if (memberError) throw memberError;

      await supabase
        .from('membership_payments')
        .update({ status: 'completed' })
        .eq('member_id', member.id)
        .eq('status', 'pending');

      try {
        await updateMembershipTransactionStatus(member.id, 'paid');
      } catch (finErr) {
        console.error('Finance update failed:', finErr);
      }

      try {
        await supabase.rpc('ensure_renewal_financials', { p_member_id: member.id });
      } catch (remitErr) {
        console.error('Remittance/finance backfill failed:', remitErr);
      }

      if (member.email) {
        try {
          await sendPaymentConfirmation({
            email: member.email,
            first_name: member.first_name,
            last_name: member.last_name,
            club_name: currentClub?.club?.name || 'your club',
            membership_type: member.membership_level,
            renewal_date: renewalDate.toISOString().split('T')[0],
            amount: member.payment_amount,
            currency: 'AUD',
            club_id: currentClub?.clubId,
            user_id: member.user_id,
          });
        } catch (emailErr) {
          console.error('Failed to send confirmation email:', emailErr);
        }
      }

      addNotification('success', `Payment confirmed for ${member.first_name} ${member.last_name}. Confirmation email sent.`);
      await fetchPendingRenewals();
      await fetchExpiringMemberships();
    } catch (error) {
      console.error('Error confirming payment:', error);
      addNotification('error', 'Failed to confirm payment');
    } finally {
      setConfirmingPayment(null);
    }
  };

  const handleSendReminder = async (memberId: string) => {
    try {
      const { error } = await supabase.functions.invoke('send-renewal-reminder', {
        body: {
          member_id: memberId,
          club_id: currentClub?.clubId,
          force: true
        }
      });

      if (error) throw error;

      addNotification('success', 'Renewal reminder sent successfully');
    } catch (error) {
      console.error('Error sending reminder:', error);
      addNotification('error', 'Failed to send renewal reminder');
    }
  };

  const handleBulkSendReminders = async () => {
    if (selectedMembers.size === 0) {
      addNotification('error', 'Please select members to send reminders to');
      return;
    }

    try {
      const promises = Array.from(selectedMembers).map(memberId =>
        handleSendReminder(memberId)
      );

      await Promise.all(promises);
      setSelectedMembers(new Set());
      addNotification('success', `Sent ${selectedMembers.size} renewal reminders`);
    } catch (error) {
      console.error('Error sending bulk reminders:', error);
      addNotification('error', 'Failed to send some reminders');
    }
  };

  const openRenewModal = (member: ExpiringMember) => {
    setRenewTarget(member);
    setSelectedMembershipType(member.membership_level);
    setShowRenewModal(true);
  };

  const handleRenewMember = async (member: ExpiringMember, membershipTypeName?: string) => {
    if (!currentClub?.clubId) return;

    const renewAsType = membershipTypeName || member.membership_level;

    try {
      setRenewingMember(member.member_id);

      const { data: clubData } = await supabase
        .from('clubs')
        .select('renewal_mode, fixed_renewal_date, bank_name, bsb, account_number')
        .eq('id', currentClub.clubId)
        .single();

      let renewalDate: Date;
      const now = new Date();

      if (clubData?.renewal_mode === 'fixed' && clubData?.fixed_renewal_date) {
        const [month, day] = clubData.fixed_renewal_date.split('-').map(Number);
        renewalDate = new Date(now.getFullYear(), month - 1, day);
        if (renewalDate <= now) {
          renewalDate = new Date(now.getFullYear() + 1, month - 1, day);
        }
      } else {
        renewalDate = new Date(now);
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      }

      let selectedType = membershipTypes.find(t => t.name === renewAsType);
      let amount = selectedType?.fee || 0;
      let selectedTypeId = selectedType?.id;

      if (!selectedType && renewAsType) {
        const { data: typeData } = await supabase
          .from('membership_types')
          .select('id, amount, renewal_period')
          .eq('club_id', currentClub.clubId)
          .eq('name', renewAsType)
          .single();
        if (typeData) {
          amount = typeData.amount || 0;
          selectedTypeId = typeData.id;
          selectedType = { id: typeData.id, name: renewAsType, fee: typeData.amount || 0, renewal_period: typeData.renewal_period };
        }
      }

      if (clubData?.renewal_mode !== 'fixed' && selectedType?.renewal_period) {
        const periodDate = new Date(now);
        if (selectedType.renewal_period === 'quarterly') {
          periodDate.setMonth(periodDate.getMonth() + 3);
          renewalDate = periodDate;
        } else if (selectedType.renewal_period === 'monthly') {
          periodDate.setMonth(periodDate.getMonth() + 1);
          renewalDate = periodDate;
        }
      }

      const { data: updatedRows, error: memberError } = await supabase
        .from('members')
        .update({
          is_financial: false,
          payment_status: 'pending',
          renewal_date: renewalDate.toISOString().split('T')[0],
          membership_level: renewAsType,
          amount_paid: amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.member_id)
        .select('id');

      if (memberError) throw memberError;

      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Update failed - no rows affected. You may not have permission to update this member.');
      }

      // Insert a pending payment record so it shows in the pending renewals tab
      if (selectedTypeId) {
        await supabase
          .from('membership_payments')
          .insert({
            member_id: member.member_id,
            membership_type_id: selectedTypeId,
            amount,
            currency: 'AUD',
            status: 'pending',
            payment_method: 'bank_transfer',
          });
      }

      if (member.email) {
        try {
          const { data: memberData } = await supabase
            .from('members')
            .select('user_id')
            .eq('id', member.member_id)
            .single();

          await sendRenewalPendingNotification({
            email: member.email,
            first_name: member.first_name,
            last_name: member.last_name,
            club_name: currentClub?.club?.name || 'your club',
            membership_type: renewAsType,
            renewal_date: renewalDate.toISOString().split('T')[0],
            amount,
            currency: 'AUD',
            bank_name: clubData?.bank_name || '',
            bsb: clubData?.bsb || '',
            account_number: clubData?.account_number || '',
            club_id: currentClub.clubId,
            user_id: memberData?.user_id,
          });
        } catch (emailErr) {
          console.error('Failed to send renewal pending email:', emailErr);
        }
      }

      addNotification('success', `Membership renewed for ${member.first_name} ${member.last_name} as "${renewAsType}" - awaiting payment`);

      setExpiringMembers(prev => prev.filter(m => m.member_id !== member.member_id));
      setOverdueMembers(prev => prev.filter(m => m.member_id !== member.member_id));

      await fetchPendingRenewals();
      await fetchExpiringMemberships();
    } catch (error: any) {
      console.error('Error renewing member:', error);
      addNotification('error', error?.message || `Failed to renew membership for ${member.first_name} ${member.last_name}`);
    } finally {
      setRenewingMember(null);
      setShowRenewModal(false);
      setRenewTarget(null);
    }
  };

  const handleBulkRenew = async () => {
    if (selectedMembers.size === 0) {
      addNotification('error', 'Please select members to renew');
      return;
    }
    setShowBulkRenewModal(true);
  };

  const executeBulkRenew = async () => {
    try {
      setBulkRenewing(true);
      setShowBulkRenewModal(false);
      const members = activeTab === 'expiring' ? expiringMembers : overdueMembers;
      const selectedMembersList = members.filter(m => selectedMembers.has(m.member_id));

      for (const member of selectedMembersList) {
        await handleRenewMember(member, bulkRenewType || undefined);
      }

      setSelectedMembers(new Set());
      addNotification('success', `Renewed ${selectedMembersList.length} memberships`);
    } catch (error) {
      console.error('Error in bulk renewal:', error);
      addNotification('error', 'Failed to complete some renewals');
    } finally {
      setBulkRenewing(false);
      setBulkRenewType('');
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedMembers.size === 0) {
      addNotification('error', 'Please select members to mark as paid');
      return;
    }

    const selectedPending = pendingRenewals.filter(r => selectedMembers.has(r.id));
    if (selectedPending.length === 0) return;

    try {
      setBulkMarkingPaid(true);
      let succeeded = 0;

      for (const renewal of selectedPending) {
        try {
          await handleConfirmRenewalPayment(renewal);
          succeeded += 1;
        } catch (err) {
          console.error(`Failed to mark paid for ${renewal.first_name} ${renewal.last_name}:`, err);
        }
      }

      setSelectedMembers(new Set());
      if (succeeded > 0) {
        addNotification('success', `Marked ${succeeded} renewal${succeeded !== 1 ? 's' : ''} as paid`);
      }
      if (succeeded < selectedPending.length) {
        addNotification('error', `${selectedPending.length - succeeded} renewal(s) could not be confirmed`);
      }
    } finally {
      setBulkMarkingPaid(false);
    }
  };

  const handleExportCSV = () => {
    const members = activeTab === 'expiring' ? expiringMembers : overdueMembers;
    const csvContent = [
      ['Name', 'Email', 'Phone', 'Membership Level', 'Renewal Date', 'Status'],
      ...members.map(m => [
        `${m.first_name} ${m.last_name}`,
        m.email,
        m.phone || '',
        m.membership_level,
        m.renewal_date,
        activeTab === 'expiring' ? `${m.days_until_expiry} days left` : `${m.days_overdue} days overdue`
      ])
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-memberships-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const toggleSelectMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  const toggleSelectAll = () => {
    if (activeTab === 'pending') {
      if (selectedMembers.size === pendingRenewals.length && pendingRenewals.length > 0) {
        setSelectedMembers(new Set());
      } else {
        setSelectedMembers(new Set(pendingRenewals.map(r => r.id)));
      }
      return;
    }
    const members = activeTab === 'expiring' ? expiringMembers : overdueMembers;
    if (selectedMembers.size === members.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(members.map(m => m.member_id)));
    }
  };

  const filteredMembers = (activeTab === 'expiring' ? expiringMembers : overdueMembers).filter(
    (member) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        member.first_name.toLowerCase().includes(searchLower) ||
        member.last_name.toLowerCase().includes(searchLower) ||
        member.email.toLowerCase().includes(searchLower)
      );
    }
  );


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#0A84FF]"></div>
      </div>
    );
  }

  const COLS = '20px minmax(220px,1.5fr) 112px 130px minmax(180px,1.2fr) 240px';
  const PCOLS = '20px minmax(220px,1.5fr) 140px 110px 150px 130px 190px';
  const shortDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const TimeLeft = ({ days, overdue }: { days: number; overdue?: boolean }) => {
    const filled = overdue ? 10 : Math.max(0, Math.min(10, Math.round(((filterDays - days) / filterDays) * 10)));
    const tone = overdue || days <= 7 ? 'r' : 'a';
    return (
      <div>
        <div className="flex gap-[3px]" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => <span key={i} className={`a-seg-bar ${i < filled ? `a-seg-bar-${tone}` : ''}`} />)}
        </div>
        <div className={`mt-1.5 text-[12.5px] ${tone === 'r' ? 'a-txt-r' : 'a-txt-a'}`}>
          {overdue ? `${days} day${days === 1 ? '' : 's'} overdue` : days === 0 ? 'Renews today' : `Renews in ${days} day${days === 1 ? '' : 's'}`}
        </div>
      </div>
    );
  };
  const Chk = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} className={`a-chk ${on ? 'a-chk-on' : ''}`}>
      {on && <Check size={13} strokeWidth={3} />}
    </button>
  );
  const listCount = activeTab === 'pending' ? pendingRenewals.length : filteredMembers.length;
  const allSelected = selectedMembers.size === listCount && listCount > 0;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="a-display a-ink m-0 text-[22px] font-semibold">Renewals</h2>
          <p className="a-mute mt-1 text-sm">Monitor and manage upcoming membership renewals</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={fetchExpiringMemberships} className="a-btn"><RefreshCw size={16} />Refresh</button>
          <button onClick={handleExportCSV} className="a-btn"><Download size={16} />Export</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.35fr] gap-4">
        <div className="a-card flex items-center gap-3.5" style={{ padding: '16px 18px' }}>
          <span className="a-tile"><AlertTriangle size={19} /></span>
          <div className="flex-1"><p className="a-cap">Expiring soon</p><div className="a-num a-txt-a mt-1 text-[30px] font-semibold leading-none">{expiringMembers.length}</div></div>
        </div>
        <div className="a-card flex items-center gap-3.5" style={{ padding: '16px 18px' }}>
          <span className="a-tile"><Clock size={19} /></span>
          <div className="flex-1"><p className="a-cap">Overdue</p><div className="a-num a-txt-r mt-1 text-[30px] font-semibold leading-none">{overdueMembers.length}</div></div>
        </div>
        <div className="a-card flex items-center gap-3.5" style={{ padding: '16px 18px' }}>
          <span className="a-tile"><Mail size={19} /></span>
          <div className="flex-1"><p className="a-cap">Selected</p><div className="a-num a-ink mt-1 text-[30px] font-semibold leading-none">{selectedMembers.size}</div></div>
          {activeTab === 'pending' ? (
            <button onClick={handleBulkMarkPaid} disabled={bulkMarkingPaid || selectedMembers.size === 0} className="a-btn a-btn-g" style={{ height: 36, borderRadius: 11 }}>
              {bulkMarkingPaid ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle size={15} />}Mark paid
            </button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {selectedMembers.size > 0 && (
                <button onClick={handleBulkRenew} disabled={bulkRenewing} className="a-btn" style={{ height: 36, borderRadius: 11 }}>
                  <RefreshCw size={15} className={bulkRenewing ? 'animate-spin' : ''} />{bulkRenewing ? 'Renewing…' : 'Renew'}
                </button>
              )}
              <button onClick={handleBulkSendReminders} disabled={selectedMembers.size === 0} className="a-btn a-btn-p" style={{ height: 36, borderRadius: 11 }}>
                <Mail size={15} />Send reminders
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="a-card flex items-center gap-3.5" style={{ padding: '14px 18px' }}>
        <span className="a-tile a-tile-sm"><Banknote size={17} /></span>
        <div className="flex-1 min-w-0">
          <div className="a-ink text-[14.5px] font-semibold">Renewal payments to confirm</div>
          <div className="a-mute text-[13px] mt-0.5">
            {pendingRenewals.length === 0
              ? 'No pending renewal payments to confirm'
              : `${pendingRenewals.length} member${pendingRenewals.length === 1 ? ' has' : 's have'} paid and ${pendingRenewals.length === 1 ? 'is' : 'are'} waiting for you to confirm the payment`}
          </div>
        </div>
        {pendingRenewals.length === 0 ? (
          <AStatus tone="g">Up to date</AStatus>
        ) : activeTab === 'pending' ? (
          <AStatus tone="a">{pendingRenewals.length} waiting</AStatus>
        ) : (
          <button onClick={() => { setActiveTab('pending'); setSelectedMembers(new Set()); }} className="a-btn a-btn-a a-btn-sm">Review {pendingRenewals.length}</button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="a-seg" role="tablist" aria-label="Renewals">
          {pendingRenewals.length > 0 && (
            <button role="tab" aria-selected={activeTab === 'pending'} onClick={() => { setActiveTab('pending'); setSelectedMembers(new Set()); }} className={`a-seg-i ${activeTab === 'pending' ? 'a-seg-on' : ''}`}>
              <DollarSign size={16} />To confirm<span className="a-cnt a-cnt-amber">{pendingRenewals.length}</span>
            </button>
          )}
          <button role="tab" aria-selected={activeTab === 'expiring'} onClick={() => { setActiveTab('expiring'); setSelectedMembers(new Set()); }} className={`a-seg-i ${activeTab === 'expiring' ? 'a-seg-on' : ''}`}>
            <AlertTriangle size={16} />Expiring<span className="a-cnt">{expiringMembers.length}</span>
          </button>
          <button role="tab" aria-selected={activeTab === 'overdue'} onClick={() => { setActiveTab('overdue'); setSelectedMembers(new Set()); }} className={`a-seg-i ${activeTab === 'overdue' ? 'a-seg-on' : ''}`}>
            <Clock size={16} />Overdue<span className="a-cnt">{overdueMembers.length}</span>
          </button>
        </div>
        {activeTab === 'expiring' && (
          <>
            <label className="sr-only" htmlFor="renew-window">Show renewals due within</label>
            <select id="renew-window" value={filterDays} onChange={(e) => setFilterDays(parseInt(e.target.value))} className="a-pick">
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
            </select>
          </>
        )}
        <label className="a-field flex-1 min-w-[220px]">
          <Search size={17} />
          <span className="sr-only">Search members</span>
          <input type="text" placeholder="Search members" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </label>
      </div>

      {activeTab === 'pending' && (
        pendingRenewals.length === 0 ? (
          <div className="a-card a-empty" style={{ padding: '36px 24px' }}>
            <span className="a-tile" style={{ width: 56, height: 56 }}><CheckCircle size={24} /></span>
            <div className="a-display a-ink text-lg font-semibold">Nothing to confirm</div>
            <p className="a-mute m-0 text-sm">No pending renewal payments to confirm.</p>
          </div>
        ) : (
          <div className="a-card overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className="grid gap-4 items-center px-[18px] py-3 a-thead" style={{ gridTemplateColumns: PCOLS }}>
                <Chk on={allSelected} onClick={toggleSelectAll} label="Select all" />
                <p className="a-cap">Member</p><p className="a-cap">Membership</p><p className="a-cap">Amount</p><p className="a-cap">Payment</p><p className="a-cap">Submitted</p><p className="a-cap text-right">Actions</p>
              </div>
              {pendingRenewals.map((renewal) => (
                <div key={renewal.id} className={`a-row a-row-hover grid gap-4 ${selectedMembers.has(renewal.id) ? 'a-row-sel' : ''}`} style={{ display: 'grid', gridTemplateColumns: PCOLS }}>
                  <Chk on={selectedMembers.has(renewal.id)} onClick={() => toggleSelectMember(renewal.id)} label={`Select ${renewal.first_name} ${renewal.last_name}`} />
                  <div className="flex items-center gap-3 min-w-0">
                    <AAvatar url={renewal.avatar_url} first={renewal.first_name} last={renewal.last_name} />
                    <div className="min-w-0"><div className="a-ink text-[14.5px] font-semibold truncate">{renewal.first_name} {renewal.last_name}</div><div className="a-dim text-[12.5px] truncate">{renewal.email}</div></div>
                  </div>
                  <span className="a-lb-fmt justify-self-start"><span className="a-light a-light-b" style={{ boxShadow: 'none' }} />{renewal.membership_level}</span>
                  <span className="a-num a-txt-g text-[15px] font-semibold">${renewal.payment_amount.toFixed(2)}</span>
                  <span className="a-mute text-[13px]">{renewal.payment_method === 'bank_transfer' ? 'Bank transfer' : renewal.payment_method}</span>
                  <span className="a-mute a-num text-[13px]" style={{ letterSpacing: 0 }}>{shortDate(renewal.payment_date)}</span>
                  <div className="flex justify-end">
                    <button onClick={() => handleConfirmRenewalPayment(renewal)} disabled={confirmingPayment === renewal.id} className="a-btn a-btn-g" style={{ height: 36 }}>
                      {confirmingPayment === renewal.id ? <><RefreshCw size={14} className="animate-spin" />Confirming…</> : <><CheckCircle size={14} />Confirm payment</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {activeTab !== 'pending' && (
        filteredMembers.length === 0 ? (
          <div className="a-card a-empty" style={{ padding: '36px 24px' }}>
            <span className="a-tile" style={{ width: 56, height: 56 }}><Calendar size={24} /></span>
            <div className="a-display a-ink text-lg font-semibold">
              {searchQuery ? 'No members match' : activeTab === 'expiring' ? 'No renewals due' : 'Nobody is overdue'}
            </div>
            <p className="a-mute m-0 text-sm">
              {searchQuery
                ? 'Try a different name or email.'
                : activeTab === 'expiring'
                  ? `Nobody's membership expires in the next ${filterDays} days.`
                  : 'Every membership is current.'}
            </p>
          </div>
        ) : (
          <div className="a-card overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid gap-4 items-center px-[18px] py-3 a-thead" style={{ gridTemplateColumns: COLS }}>
                <Chk on={allSelected} onClick={toggleSelectAll} label="Select all" />
                <p className="a-cap">Member</p><p className="a-cap">Type</p><p className="a-cap">Renewal date</p><p className="a-cap">Time left</p><p className="a-cap text-right">Actions</p>
              </div>
              {filteredMembers.map((member) => (
                <div key={member.member_id} className={`a-row a-row-hover grid gap-4 ${selectedMembers.has(member.member_id) ? 'a-row-sel' : ''}`} style={{ display: 'grid', gridTemplateColumns: COLS }}>
                  <Chk on={selectedMembers.has(member.member_id)} onClick={() => toggleSelectMember(member.member_id)} label={`Select ${member.first_name} ${member.last_name}`} />
                  <div className="flex items-center gap-3 min-w-0">
                    <AAvatar first={member.first_name} last={member.last_name} />
                    <div className="min-w-0"><div className="a-ink text-[14.5px] font-semibold truncate">{member.first_name} {member.last_name}</div><div className="a-dim text-[12.5px] truncate">{member.email}</div></div>
                  </div>
                  <div className="flex flex-col items-start gap-1 min-w-0">
                    <span className="a-lb-fmt"><span className="a-light a-light-b" style={{ boxShadow: 'none' }} />{member.membership_level}</span>
                    {replacementMap[member.membership_level] && (
                      <span className="a-txt-a text-[11.5px] inline-flex items-center gap-1" title="Renews as"><ArrowRightLeft size={11} />{replacementMap[member.membership_level]}</span>
                    )}
                  </div>
                  <span className="a-mute a-num text-[13px]" style={{ letterSpacing: 0 }}>{shortDate(member.renewal_date)}</span>
                  {activeTab === 'expiring'
                    ? <TimeLeft days={member.days_until_expiry} />
                    : <TimeLeft days={member.days_overdue} overdue />}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleSendReminder(member.member_id)} className="a-btn" style={{ height: 36 }}><Mail size={15} />Remind</button>
                    <button onClick={() => openRenewModal(member)} disabled={renewingMember === member.member_id} className="a-btn a-btn-p" style={{ height: 36 }}>
                      <RefreshCw size={15} className={renewingMember === member.member_id ? 'animate-spin' : ''} />{renewingMember === member.member_id ? 'Renewing…' : 'Renew'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {showRenewModal && renewTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="a-sheet w-full max-w-md">
            <div className="a-panel-head">
              <span className="a-tile a-tile-rim"><RefreshCw size={18} /></span>
              <div className="flex-1 min-w-0">
                <p className="a-cap">Renew membership</p>
                <h3 className="a-display a-ink text-xl font-semibold mt-[3px] truncate">{renewTarget.first_name} {renewTarget.last_name}</h3>
              </div>
              <button onClick={() => { setShowRenewModal(false); setRenewTarget(null); }} className="a-ib" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="p-[22px] flex flex-col gap-4">
              <p className="a-mute text-sm m-0">Current type: <span className="a-ink font-medium">{renewTarget.membership_level}</span></p>
              <label>
                <span className="a-flab">Renew as membership type</span>
                <select value={selectedMembershipType} onChange={(e) => setSelectedMembershipType(e.target.value)} className="a-inp">
                  {!membershipTypes.some(t => t.name === renewTarget.membership_level) && (
                    <option value={renewTarget.membership_level}>{renewTarget.membership_level} (Current)</option>
                  )}
                  {membershipTypes.map((type) => (
                    <option key={type.id} value={type.name}>{type.name} {type.fee > 0 ? `($${type.fee.toFixed(2)})` : '(Free)'}</option>
                  ))}
                </select>
              </label>
              {selectedMembershipType !== renewTarget.membership_level && (
                <p className="a-txt-a text-[13px] m-0">Membership type will change from "{renewTarget.membership_level}" to "{selectedMembershipType}"</p>
              )}
            </div>
            <div className="a-panel-foot">
              <button onClick={() => { setShowRenewModal(false); setRenewTarget(null); }} className="a-btn">Cancel</button>
              <button onClick={() => handleRenewMember(renewTarget, selectedMembershipType)} disabled={renewingMember === renewTarget.member_id} className="a-btn a-btn-p">
                {renewingMember === renewTarget.member_id ? <><RefreshCw size={14} className="animate-spin" />Renewing…</> : <><CheckCircle size={14} />Confirm renewal</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkRenewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="a-sheet w-full max-w-md">
            <div className="a-panel-head">
              <span className="a-tile a-tile-rim"><RefreshCw size={18} /></span>
              <div className="flex-1 min-w-0">
                <p className="a-cap">Bulk renew</p>
                <h3 className="a-display a-ink text-xl font-semibold mt-[3px]">{selectedMembers.size} selected member{selectedMembers.size !== 1 ? 's' : ''}</h3>
              </div>
              <button onClick={() => { setShowBulkRenewModal(false); setBulkRenewType(''); }} className="a-ib" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="p-[22px]">
              <label>
                <span className="a-flab">Renew all as membership type (optional)</span>
                <select value={bulkRenewType} onChange={(e) => setBulkRenewType(e.target.value)} className="a-inp">
                  <option value="">Keep each member's current type</option>
                  {membershipTypes.map((type) => (
                    <option key={type.id} value={type.name}>{type.name} {type.fee > 0 ? `($${type.fee.toFixed(2)})` : '(Free)'}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="a-panel-foot">
              <button onClick={() => { setShowBulkRenewModal(false); setBulkRenewType(''); }} className="a-btn">Cancel</button>
              <button onClick={executeBulkRenew} className="a-btn a-btn-p"><CheckCircle size={14} />Renew {selectedMembers.size} member{selectedMembers.size !== 1 ? 's' : ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

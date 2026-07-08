import React, { useState, useEffect } from 'react';
import { TriangleAlert as AlertTriangle, Calendar, Mail, Phone, Clock, RefreshCw, Download, Search, ListFilter as Filter, ArrowRightLeft, DollarSign, CircleCheck as CheckCircle, Banknote, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatDate } from '../../utils/date';
import { Avatar } from '../ui/Avatar';
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

export const ExpiringMembershipsPanel: React.FC<ExpiringMembershipsPanelProps> = ({ darkMode }) => {
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

  const getUrgencyColor = (days: number) => {
    if (days <= 7) return 'text-red-400 bg-red-900/20 border-red-500/30';
    if (days <= 14) return 'text-orange-400 bg-orange-900/20 border-orange-500/30';
    return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Membership Renewals</h3>
          <p className="text-slate-400 text-sm mt-1">
            Monitor and manage upcoming membership renewals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchExpiringMemberships}
            className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {pendingRenewals.length > 0 && (
          <div
            className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-4 backdrop-blur-sm cursor-pointer hover:bg-orange-900/30 transition-colors"
            onClick={() => { setActiveTab('pending'); setSelectedMembers(new Set()); }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-400 font-medium">Pending Renewals</p>
                <p className="text-2xl font-bold text-white mt-1">{pendingRenewals.length}</p>
                <p className="text-xs text-orange-400/70 mt-1">Awaiting payment confirmation</p>
              </div>
              <div className="relative">
                <Banknote className="text-orange-400" size={32} />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-400">Expiring Soon</p>
              <p className="text-2xl font-bold text-white mt-1">{expiringMembers.length}</p>
            </div>
            <AlertTriangle className="text-yellow-400" size={32} />
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-400">Overdue</p>
              <p className="text-2xl font-bold text-white mt-1">{overdueMembers.length}</p>
            </div>
            <Clock className="text-red-400" size={32} />
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-400">Selected</p>
              <p className="text-2xl font-bold text-white mt-1">{selectedMembers.size}</p>
            </div>
            <Mail className="text-blue-400" size={32} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-700">
        {pendingRenewals.length > 0 && (
          <button
            onClick={() => {
              setActiveTab('pending');
              setSelectedMembers(new Set());
            }}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <DollarSign size={16} />
            Pending Renewals ({pendingRenewals.length})
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          </button>
        )}
        <button
          onClick={() => {
            setActiveTab('expiring');
            setSelectedMembers(new Set());
          }}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'expiring'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Expiring ({expiringMembers.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('overdue');
            setSelectedMembers(new Set());
          }}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'overdue'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Overdue ({overdueMembers.length})
        </button>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {activeTab === 'expiring' && (
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select
              value={filterDays}
              onChange={(e) => setFilterDays(parseInt(e.target.value))}
              className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
            </select>
          </div>
        )}

        {selectedMembers.size > 0 && activeTab !== 'pending' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkSendReminders}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Mail size={16} />
              Send Reminders ({selectedMembers.size})
            </button>
            <button
              onClick={handleBulkRenew}
              disabled={bulkRenewing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkRenewing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Renewing...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Renew Selected ({selectedMembers.size})
                </>
              )}
            </button>
          </div>
        )}

        {selectedMembers.size > 0 && activeTab === 'pending' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkMarkPaid}
              disabled={bulkMarkingPaid}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkMarkingPaid ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Marking Paid...
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Mark Paid ({selectedMembers.size})
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Pending Renewals List */}
      {activeTab === 'pending' && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 backdrop-blur-sm overflow-hidden">
          {pendingRenewals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-600" />
              <p className="text-slate-400">No pending renewal payments to confirm</p>
            </div>
          ) : (
            <div>
              <div className="px-4 py-3 bg-orange-900/20 border-b border-orange-500/20">
                <p className="text-sm text-orange-300">
                  These members have submitted renewal payments and are waiting for you to confirm receipt of payment.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedMembers.size === pendingRenewals.length && pendingRenewals.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Member</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Membership</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Amount</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Payment Method</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Submitted</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {pendingRenewals.map((renewal) => (
                      <tr key={renewal.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedMembers.has(renewal.id)}
                            onChange={() => toggleSelectMember(renewal.id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={`${renewal.first_name} ${renewal.last_name}`}
                              imageUrl={renewal.avatar_url}
                              size="sm"
                            />
                            <div className="flex flex-col">
                              <span className="text-white font-medium">
                                {renewal.first_name} {renewal.last_name}
                              </span>
                              <span className="text-slate-400 text-sm">{renewal.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-300">{renewal.membership_level}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-green-400 font-medium">${renewal.payment_amount.toFixed(2)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                            <Banknote size={12} />
                            {renewal.payment_method === 'bank_transfer' ? 'Bank Transfer' : renewal.payment_method}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-300 text-sm">
                            {new Date(renewal.payment_date).toLocaleDateString('en-AU', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleConfirmRenewalPayment(renewal)}
                            disabled={confirmingPayment === renewal.id}
                            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
                          >
                            {confirmingPayment === renewal.id ? (
                              <>
                                <RefreshCw size={14} className="animate-spin" />
                                Confirming...
                              </>
                            ) : (
                              <>
                                <CheckCircle size={14} />
                                Confirm Payment
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expiring/Overdue Members List */}
      {activeTab !== 'pending' && (
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 backdrop-blur-sm overflow-hidden">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-12">
            <Calendar size={48} className="mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">
              {searchQuery
                ? 'No members found matching your search'
                : activeTab === 'expiring'
                ? 'No memberships expiring in the selected period'
                : 'No overdue memberships'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedMembers.size === filteredMembers.length && filteredMembers.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Member</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Contact</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Membership</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Migration</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Renewal Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredMembers.map((member) => (
                  <tr key={member.member_id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedMembers.has(member.member_id)}
                        onChange={() => toggleSelectMember(member.member_id)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-white font-medium">
                          {member.first_name} {member.last_name}
                        </span>
                        <span className="text-slate-400 text-sm">{member.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-sm text-slate-300">
                        {member.phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={14} />
                            {member.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300">{member.membership_level}</span>
                    </td>
                    <td className="px-4 py-3">
                      {replacementMap[member.membership_level] ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                          <ArrowRightLeft size={12} />
                          {replacementMap[member.membership_level]}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300">{formatDate(member.renewal_date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {activeTab === 'expiring' ? (
                        <span className={`px-2 py-1 text-xs rounded-full border ${getUrgencyColor(member.days_until_expiry)}`}>
                          {member.days_until_expiry} days left
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full border text-red-400 bg-red-900/20 border-red-500/30">
                          {member.days_overdue} days overdue
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSendReminder(member.member_id)}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                        >
                          Send Reminder
                        </button>
                        <button
                          onClick={() => openRenewModal(member)}
                          disabled={renewingMember === member.member_id}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {renewingMember === member.member_id ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              Renewing...
                            </>
                          ) : (
                            'Renew'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Renew Member Modal */}
      {showRenewModal && renewTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Renew Membership</h3>
              <button
                onClick={() => { setShowRenewModal(false); setRenewTarget(null); }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-slate-300">
                Renewing membership for <span className="font-medium text-white">{renewTarget.first_name} {renewTarget.last_name}</span>
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Current type: {renewTarget.membership_level}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Renew as membership type
              </label>
              <select
                value={selectedMembershipType}
                onChange={(e) => setSelectedMembershipType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {!membershipTypes.some(t => t.name === renewTarget.membership_level) && (
                  <option value={renewTarget.membership_level}>
                    {renewTarget.membership_level} (Current)
                  </option>
                )}
                {membershipTypes.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name} {type.fee > 0 ? `($${type.fee.toFixed(2)})` : '(Free)'}
                  </option>
                ))}
              </select>
              {selectedMembershipType !== renewTarget.membership_level && (
                <p className="text-sm text-amber-400 mt-2">
                  Membership type will be changed from "{renewTarget.membership_level}" to "{selectedMembershipType}"
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowRenewModal(false); setRenewTarget(null); }}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRenewMember(renewTarget, selectedMembershipType)}
                disabled={renewingMember === renewTarget.member_id}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {renewingMember === renewTarget.member_id ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Renewing...
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    Confirm Renewal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Renew Modal */}
      {showBulkRenewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Bulk Renew Memberships</h3>
              <button
                onClick={() => { setShowBulkRenewModal(false); setBulkRenewType(''); }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-slate-300">
                Renewing <span className="font-medium text-white">{selectedMembers.size}</span> selected member{selectedMembers.size !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Renew all as membership type (optional)
              </label>
              <select
                value={bulkRenewType}
                onChange={(e) => setBulkRenewType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Keep each member's current type</option>
                {membershipTypes.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name} {type.fee > 0 ? `($${type.fee.toFixed(2)})` : '(Free)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowBulkRenewModal(false); setBulkRenewType(''); }}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkRenew}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <CheckCircle size={14} />
                Renew {selectedMembers.size} Member{selectedMembers.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

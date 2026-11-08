import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Users, Search, Download, Mail, Phone, Building2, CircleCheck as CheckCircle2, ArrowUpRight, ListFilter as Filter, Save, FolderOpen, Upload, Trash2, UserPlus, DollarSign, X, Pencil, Eye, Smartphone, Loader as Loader2, Hop as Home, Clock, Link } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { Avatar } from '../ui/Avatar';
import { InlineLoading, KpiCard, PageHead } from '../association/AssocUI';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import Papa from 'papaparse';
import { AdvancedMemberFilter } from './AdvancedMemberFilter';
import { MemberFilterConfig } from '../../types/memberFilters';
import { filterMembers as applyMemberFilters, getMembershipCategory } from '../../utils/memberFilters';
import { ManageFiltersModal } from './ManageFiltersModal';
import { SaveFilterModal } from './SaveFilterModal';
import AssociationMemberImportModal from './AssociationMemberImportModal';
import { MemberEditModal } from './MemberEditModal';
import { AdminAddToClubModal } from './AdminAddToClubModal';
import { useNotifications } from '../../contexts/NotificationContext';
import { activateMembers, ActivationResponse } from '../../utils/memberActivation';

interface StateAssociationMembersProps {
  darkMode: boolean;
  stateAssociationId?: string;
}

interface MemberWithClub {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  membership_level: string;
  is_financial: boolean;
  date_joined: string;
  renewal_date: string;
  club_id: string;
  club_name: string;
  membership_status?: string;
  state_association_name: string;
  avatar_url?: string;
  user_id?: string;
  activation_status?: string;
}

interface ClubMembership {
  id: string;
  club_id: string;
  club_name: string;
  membership_level: string;
  is_financial: boolean;
  date_joined: string;
  renewal_date: string;
}

interface ConsolidatedMember extends MemberWithClub {
  clubMemberships: ClubMembership[];
  memberIds: string[];
}

export const StateAssociationMembers: React.FC<StateAssociationMembersProps> = ({
  darkMode,
  stateAssociationId: propStateAssociationId
}) => {
  const { user, currentOrganization, isSuperAdmin } = useAuth();
  const { startImpersonation, isImpersonating } = useImpersonation();
  const { addNotification } = useNotifications();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberWithClub[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<MemberWithClub[]>([]);
  const [consolidatedMembers, setConsolidatedMembers] = useState<ConsolidatedMember[]>([]);
  const [isConsolidatedView, setIsConsolidatedView] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClub, setSelectedClub] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [clubs, setClubs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [memberRemittanceStatus, setMemberRemittanceStatus] = useState<Record<string, { statePaid: boolean; nationalPaid: boolean }>>({});
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [advancedFilterConfig, setAdvancedFilterConfig] = useState<MemberFilterConfig | null>(null);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [showManageFilters, setShowManageFilters] = useState(false);
  const [savedFilters, setSavedFilters] = useState<any[]>([]);
  const [boatClasses, setBoatClasses] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberClubId, setEditingMemberClubId] = useState<string>('');

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [showAddToClubModal, setShowAddToClubModal] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [membersToActivate, setMembersToActivate] = useState<MemberWithClub[]>([]);
  const [activating, setActivating] = useState(false);
  const [activationResults, setActivationResults] = useState<ActivationResponse | null>(null);
  const [showDefaultClubModal, setShowDefaultClubModal] = useState(false);
  const [defaultClubMember, setDefaultClubMember] = useState<MemberWithClub | null>(null);
  const [settingDefaultClub, setSettingDefaultClub] = useState(false);
  const [selectedDefaultClubId, setSelectedDefaultClubId] = useState('');
  const [deletingMember, setDeletingMember] = useState<MemberWithClub | null>(null);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [memberInvitations, setMemberInvitations] = useState<Record<string, any>>({});

  useEffect(() => {
    const state = location.state as { viewClubId?: string } | null;
    if (state?.viewClubId) {
      setSelectedClub(state.viewClubId);
    }
  }, [location.state]);

  useEffect(() => {
    loadStateAssociationData();
  }, [user, propStateAssociationId]);

  useEffect(() => {
    filterMembers();
  }, [members, searchTerm, selectedClub, selectedStatus, advancedFilterConfig, memberInvitations]);

  const fetchRemittanceStatuses = async (memberIds: string[]) => {
    if (memberIds.length === 0) return;
    try {
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from('membership_remittances')
        .select('member_id, club_to_state_status, state_to_national_status')
        .in('member_id', memberIds)
        .eq('membership_year', currentYear);
      if (error) throw error;
      const statusMap: Record<string, { statePaid: boolean; nationalPaid: boolean }> = {};
      data?.forEach(remittance => {
        statusMap[remittance.member_id] = {
          statePaid: remittance.club_to_state_status === 'paid',
          nationalPaid: remittance.state_to_national_status === 'paid'
        };
      });
      setMemberRemittanceStatus(statusMap);
    } catch (err) {
      console.error('Error fetching remittance statuses:', err);
    }
  };

  const fetchMemberInvitations = async (clubIds: string[]) => {
    if (clubIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('member_invitations')
        .select('id, member_id, club_id, status, created_at')
        .in('club_id', clubIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const invitationsMap: Record<string, any> = {};
      data?.forEach(inv => {
        if (!invitationsMap[inv.member_id] || new Date(inv.created_at) > new Date(invitationsMap[inv.member_id].created_at)) {
          invitationsMap[inv.member_id] = inv;
        }
      });
      setMemberInvitations(invitationsMap);
    } catch (err) {
      console.error('Error fetching member invitations:', err);
    }
  };

  const loadStateAssociationData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      let stateId = propStateAssociationId;
      if (!stateId) {
        const { data: userStateAssoc } = await supabase
          .from('user_state_associations')
          .select('state_association_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (userStateAssoc) {
          stateId = (userStateAssoc as any).state_association_id;
        }
      }
      if (!stateId) {
        throw new Error('No state association found');
      }

      const { data: clubsData, error: clubsError } = await supabase
        .from('clubs')
        .select('id, name, abbreviation')
        .eq('state_association_id', stateId)
        .order('name');
      if (clubsError) throw clubsError;
      setClubs(clubsData || []);

      const clubIds = (clubsData || []).map(c => c.id);

      let clubMembers: any[] = [];
      if (clubIds.length > 0) {
        const { data: clubMembersData } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, phone, membership_level, is_financial, date_joined, renewal_date, club_id, avatar_url, membership_status, user_id, activation_status')
          .in('club_id', clubIds)
          .or('membership_status.eq.active,membership_status.eq.expired,membership_status.is.null')
          .order('last_name');
        clubMembers = clubMembersData || [];
      }

      const { data: assocMembersData } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone, membership_level, is_financial, date_joined, renewal_date, club_id, avatar_url, membership_status, user_id, activation_status')
        .eq('state_association_id', stateId)
        .or('membership_status.eq.active,membership_status.eq.expired,membership_status.is.null')
        .order('last_name');

      const allMemberIds = new Set<string>();
      const allMembers: any[] = [];
      for (const m of [...clubMembers, ...(assocMembersData || [])]) {
        if (!allMemberIds.has(m.id)) {
          allMemberIds.add(m.id);
          allMembers.push(m);
        }
      }
      allMembers.sort((a, b) => {
        const firstNameCompare = (a.first_name || '').localeCompare(b.first_name || '');
        if (firstNameCompare !== 0) return firstNameCompare;
        return (a.last_name || '').localeCompare(b.last_name || '');
      });

      const formattedMembers = allMembers.map((m: any) => {
        const club = clubsData?.find(c => c.id === m.club_id);
        return {
          ...m,
          club_name: club?.name || (m.club_id ? 'Unknown Club' : ''),
          state_association_name: 'State Association'
        };
      });

      setMembers(formattedMembers);
      if (formattedMembers.length > 0) {
        fetchRemittanceStatuses(formattedMembers.map(m => m.id));
      }
      if (clubIds.length > 0) {
        fetchMemberInvitations(clubIds);
      }
    } catch (err: any) {
      console.error('Error loading state association data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const consolidateMembers = (membersList: MemberWithClub[]): ConsolidatedMember[] => {
    const groupMap = new Map<string, MemberWithClub[]>();

    for (const m of membersList) {
      // Group by user_id if linked, otherwise by lowercase email+name combo
      const key = m.user_id
        ? `uid:${m.user_id}`
        : m.email
          ? `email:${m.email.toLowerCase()}`
          : `id:${m.id}`;

      const group = groupMap.get(key);
      if (group) {
        group.push(m);
      } else {
        groupMap.set(key, [m]);
      }
    }

    const consolidated: ConsolidatedMember[] = [];
    for (const group of groupMap.values()) {
      // Use the first member as the "primary" record
      const primary = group[0];
      const clubMemberships: ClubMembership[] = group.map(m => ({
        id: m.id,
        club_id: m.club_id,
        club_name: m.club_name,
        membership_level: m.membership_level,
        is_financial: m.is_financial,
        date_joined: m.date_joined,
        renewal_date: m.renewal_date,
      }));

      const latestRenewal = group
        .filter(m => m.renewal_date)
        .sort((a, b) => new Date(b.renewal_date!).getTime() - new Date(a.renewal_date!).getTime())[0]?.renewal_date || primary.renewal_date;

      consolidated.push({
        ...primary,
        is_financial: group.some(m => m.is_financial),
        renewal_date: latestRenewal,
        clubMemberships,
        memberIds: group.map(m => m.id),
      });
    }

    return consolidated;
  };

  const filterMembers = () => {
    let filtered = [...members];
    if (advancedFilterConfig) {
      filtered = applyMemberFilters(filtered, advancedFilterConfig);
    }
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.first_name?.toLowerCase().includes(searchLower) ||
          m.last_name?.toLowerCase().includes(searchLower) ||
          `${m.first_name ?? ''} ${m.last_name ?? ''}`.toLowerCase().includes(searchLower) ||
          m.email?.toLowerCase().includes(searchLower) ||
          m.club_name?.toLowerCase().includes(searchLower) ||
          m.phone?.toLowerCase().includes(searchLower)
      );
    }
    if (selectedClub === 'unassigned') {
      filtered = filtered.filter((m) => !m.club_id);
    } else if (selectedClub !== 'all') {
      filtered = filtered.filter((m) => m.club_id === selectedClub);
    }
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'financial') {
        filtered = filtered.filter((m) => m.is_financial);
      } else if (selectedStatus === 'unfinancial') {
        filtered = filtered.filter((m) => !m.is_financial);
      } else if (selectedStatus === 'current') {
        filtered = filtered.filter((m) => m.is_financial && (!m.renewal_date || new Date(m.renewal_date) >= new Date()));
      } else if (selectedStatus === 'expired') {
        filtered = filtered.filter((m) => !m.is_financial || (m.renewal_date && new Date(m.renewal_date) < new Date()));
      }
    }
    setFilteredMembers(filtered);

    // Consolidate when viewing all clubs (no specific club filter)
    const showConsolidated = selectedClub === 'all' || selectedClub === 'unassigned' ? true : false;
    setIsConsolidatedView(showConsolidated && selectedClub === 'all');
    if (showConsolidated && selectedClub === 'all') {
      setConsolidatedMembers(consolidateMembers(filtered));
    } else {
      setConsolidatedMembers([]);
    }
  };

  const unassignedCount = members.filter(m => !m.club_id).length;

  const toggleMemberSelection = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = isConsolidatedView
      ? consolidatedMembers.flatMap(m => m.memberIds)
      : filteredMembers.map(m => m.id);
    if (selectedMemberIds.size === allIds.length) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(allIds));
    }
  };

  const handleAddToClubSuccess = () => {
    setSelectedMemberIds(new Set());
    setShowAddToClubModal(false);
    loadStateAssociationData();
  };

  const handleBulkSetFinancial = async (financial: boolean) => {
    if (selectedMemberIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedMemberIds);
      const { error } = await supabase
        .from('members')
        .update({ is_financial: financial })
        .in('id', ids);
      if (error) throw error;
      setSelectedMemberIds(new Set());
      loadStateAssociationData();
    } catch (err) {
      console.error('Error bulk update financial:', err);
    }
    setBulkProcessing(false);
  };

  const handleBulkDelete = async () => {
    if (selectedMemberIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedMemberIds.size} member(s)? This cannot be undone.`)) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedMemberIds);
      const { error } = await supabase
        .from('members')
        .delete()
        .in('id', ids);
      if (error) throw error;
      setSelectedMemberIds(new Set());
      loadStateAssociationData();
    } catch (err) {
      console.error('Error bulk deleting:', err);
    }
    setBulkProcessing(false);
  };

  const handleSingleDelete = async () => {
    if (!deletingMember) return;
    setDeleteProcessing(true);
    try {
      await supabase.from('membership_remittances').delete().eq('member_id', deletingMember.id);
      await supabase.from('club_memberships').delete().eq('member_id', deletingMember.id);

      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', deletingMember.id);
      if (error) throw error;
      addNotification('success', `${deletingMember.first_name} ${deletingMember.last_name} has been permanently deleted.`);
      setDeletingMember(null);
      loadStateAssociationData();
    } catch (err: any) {
      console.error('Error deleting member:', err);
      addNotification('error', `Failed to delete member: ${err.message || 'Unknown error'}`);
    }
    setDeleteProcessing(false);
  };

  const unlinkedMembersWithEmail = members.filter(m => !m.user_id && m.email);

  const handleBulkActivate = () => {
    const selected = members.filter(m => selectedMemberIds.has(m.id) && !m.user_id && m.email);
    if (selected.length > 0) {
      setMembersToActivate(selected);
    } else {
      setMembersToActivate(unlinkedMembersWithEmail);
    }
    setActivationResults(null);
    setShowActivateModal(true);
  };

  const handleActivateSingleMember = (member: MemberWithClub) => {
    setMembersToActivate([member]);
    setActivationResults(null);
    setShowActivateModal(true);
  };

  const handleConfirmActivation = async () => {
    if (membersToActivate.length === 0) return;
    setActivating(true);

    const membersByClub = new Map<string, { clubName: string; memberIds: string[] }>();
    for (const m of membersToActivate) {
      if (!m.email || !m.club_id) continue;
      const existing = membersByClub.get(m.club_id);
      if (existing) {
        existing.memberIds.push(m.id);
      } else {
        membersByClub.set(m.club_id, {
          clubName: m.club_name || 'Unknown Club',
          memberIds: [m.id],
        });
      }
    }

    let totalCreated = 0;
    let totalErrors = 0;
    let lastResult: ActivationResponse | null = null;

    for (const [clubId, info] of membersByClub) {
      const result = await activateMembers(info.memberIds, clubId, info.clubName);
      if (result.success) {
        totalCreated += result.summary.created;
        totalErrors += result.summary.errors;
      } else {
        totalErrors += info.memberIds.length;
      }
      lastResult = result;
    }

    setActivating(false);

    if (lastResult && membersByClub.size === 1) {
      setActivationResults(lastResult);
    } else {
      setActivationResults({
        success: totalCreated > 0,
        summary: {
          created: totalCreated,
          existing_linked: 0,
          errors: totalErrors,
          no_email: membersToActivate.filter(m => !m.email).length,
          total: membersToActivate.length,
        },
        results: [],
      });
    }

    if (totalCreated > 0) {
      addNotification(
        'success',
        `${totalCreated} member${totalCreated === 1 ? '' : 's'} activated and invited to AlfiePRO`
      );
      loadStateAssociationData();
    }
  };

  const handleSetDefaultClub = async () => {
    if (!defaultClubMember?.user_id || !selectedDefaultClubId) return;
    setSettingDefaultClub(true);
    try {
      await supabase
        .from('profiles')
        .update({
          default_club_id: selectedDefaultClubId,
          primary_club_id: selectedDefaultClubId,
        })
        .eq('id', defaultClubMember.user_id);

      addNotification(
        'success',
        `Default club updated for ${defaultClubMember.first_name} ${defaultClubMember.last_name}`
      );
      setShowDefaultClubModal(false);
      setDefaultClubMember(null);
      setSelectedDefaultClubId('');
    } catch (err) {
      console.error('Error setting default club:', err);
      addNotification('error', 'Failed to update default club');
    }
    setSettingDefaultClub(false);
  };

  const exportToCSV = () => {
    const csvData = filteredMembers.map((m) => ({
      'First Name': m.first_name,
      'Last Name': m.last_name,
      'Email': m.email,
      'Phone': m.phone,
      'Club': m.club_name || 'Unassigned',
      'Membership Level': m.membership_level,
      'Status': (m.is_financial && (!m.renewal_date || new Date(m.renewal_date) >= new Date())) ? 'Current' : 'Expired',
      'Financial Status': m.is_financial ? 'Financial' : 'Unfinancial',
      'Date Joined': m.date_joined ? formatDate(m.date_joined) : '',
      'Renewal Date': m.renewal_date ? formatDate(m.renewal_date) : '',
      'Invite Status': m.user_id && m.activation_status === 'activated' ? 'Active' :
                       m.user_id && m.activation_status === 'pending' ? 'Awaiting Setup' :
                       m.user_id ? 'Connected' :
                       memberInvitations[m.id]?.status === 'pending' ? 'Invite Sent' :
                       memberInvitations[m.id]?.status === 'expired' ? 'Expired' :
                       m.activation_status === 'pending' ? 'Invite Sent' :
                       m.email ? 'Not Invited' : 'No Email',
      'State Remittance': memberRemittanceStatus[m.id]?.statePaid ? 'Paid' : 'Unpaid',
      'National Remittance': memberRemittanceStatus[m.id]?.nationalPaid ? 'Paid' : 'Unpaid'
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `state-association-members-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const uniqueMemberCount = consolidateMembers(members).length;
  const memberCategoryBreakdown = consolidateMembers(members).reduce(
    (acc, m) => {
      const categories = m.clubMemberships.map(cm => getMembershipCategory(cm.membership_level));
      if (categories.includes('full') || categories.includes('life')) acc.full++;
      else if (categories.includes('associate')) acc.associateOnly++;
      return acc;
    },
    { full: 0, associateOnly: 0 }
  );
  const now = new Date();
  const currentMembers = members.filter((m) => m.is_financial && (!m.renewal_date || new Date(m.renewal_date) >= now));
  const expiredMembers = members.filter((m) => !m.is_financial || (m.renewal_date && new Date(m.renewal_date) < now));
  const stats = {
    totalMembers: members.length,
    uniqueMembers: uniqueMemberCount,
    financialMembers: members.filter((m) => m.is_financial).length,
    currentMembers: currentMembers.length,
    expiredMembers: expiredMembers.length,
    totalClubs: clubs.length,
    filteredCount: isConsolidatedView ? consolidatedMembers.length : filteredMembers.length
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="a-apage">
          <PageHead icon={<Users size={24} />} title="Members" sub="Loading members…" />
          <InlineLoading label="Loading members…" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="a-apage">
          <PageHead icon={<Users size={24} />} title="Members" />
          <div className="a-note a-note-r"><span className="text-sm">Error loading members: {error}</span></div>
        </div>
      </div>
    );
  }

  const connectedCount = members.filter(m => m.user_id).length;
  const inviteSentCount = members.filter(m => !m.user_id && (memberInvitations[m.id]?.status === 'pending' || m.activation_status === 'pending')).length;
  const notInvitedCount = members.filter(m => !m.user_id && m.email && !memberInvitations[m.id] && m.activation_status !== 'pending').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="a-apage">
        <PageHead
          icon={<Users size={24} />}
          title="Members"
          sub={<>{stats.uniqueMembers} members across {stats.totalClubs} clubs{stats.totalMembers !== stats.uniqueMembers ? ` (${stats.totalMembers} memberships)` : ''}</>}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setShowImportModal(true)} className="a-btn">
              <Upload size={17} />
              Import
            </button>
            <button type="button" onClick={exportToCSV} className="a-btn a-btn-p">
              <Download size={17} />
              Export CSV
            </button>
          </div>
        </PageHead>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="a-chip"><span className="a-light a-light-g" /><b className="a-num">{connectedCount}</b><span className="a-mute">On the app</span></span>
          {inviteSentCount > 0 && (
            <span className="a-chip"><span className="a-light a-light-a" /><b className="a-num">{inviteSentCount}</b><span className="a-mute">Invite sent</span></span>
          )}
          <span className="a-chip"><span className="a-light" /><b className="a-num">{notInvitedCount}</b><span className="a-mute">Not invited</span></span>
          {unassignedCount > 0 && (
            <button type="button" className="a-chip a-chip-rim cursor-pointer" onClick={() => setSelectedClub('unassigned')}>
              <span className="a-light a-light-a" /><b className="a-num">{unassignedCount}</b><span className="a-mute">Not in a club</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <KpiCard cap="Members" value={stats.uniqueMembers} sub={`${memberCategoryBreakdown.full} full · ${memberCategoryBreakdown.associateOnly} associate only`} icon={<Users size={18} />} />
          <KpiCard cap="Current" value={stats.currentMembers} sub={`${stats.expiredMembers} expired or unfinancial`} icon={<CheckCircle2 size={18} />} tone="green" />
          <KpiCard cap="Member clubs" value={stats.totalClubs} sub="Clubs in the association" icon={<Building2 size={18} />} />
          <KpiCard cap="Showing" value={stats.filteredCount} sub="Match your search and filters" icon={<Search size={18} />} />
        </div>

        {selectedMemberIds.size > 0 && (
          <div className="a-bulkbar">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <span className="a-ink text-sm font-semibold">
                {selectedMemberIds.size} member{selectedMemberIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const selectedMembers = members.filter(m => selectedMemberIds.has(m.id));
                  const allHaveClubs = selectedMembers.every(m => m.club_id);
                  const allHaveAccounts = selectedMembers.every(m => m.user_id);
                  const singleMemberWithAccount = selectedMembers.length === 1 && selectedMembers[0].user_id && selectedMembers[0].club_id;

                  return (
                    <>
                      {singleMemberWithAccount ? (
                        <button
                          onClick={() => {
                            setDefaultClubMember(selectedMembers[0]);
                            setSelectedDefaultClubId(selectedMembers[0].club_id || '');
                            setShowDefaultClubModal(true);
                          }}
                          disabled={bulkProcessing}
                          className="a-btn a-btn-sm"
                        >
                          <Home size={15} />
                          Set Default Club
                        </button>
                      ) : null}
                      <button
                        onClick={() => setShowAddToClubModal(true)}
                        disabled={bulkProcessing}
                        className="a-btn a-btn-sm"
                      >
                        <UserPlus size={15} />
                        Add to Club
                      </button>
                      {!allHaveAccounts && (
                        <button
                          onClick={handleBulkActivate}
                          disabled={bulkProcessing || activating}
                          className="a-btn a-btn-sm"
                        >
                          {activating ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />}
                          Activate for App
                        </button>
                      )}
                    </>
                  );
                })()}
                <button
                  onClick={() => handleBulkSetFinancial(true)}
                  disabled={bulkProcessing}
                  className="a-btn a-btn-g a-btn-sm"
                >
                  <DollarSign size={15} />
                  Set Financial
                </button>
                <button
                  onClick={() => handleBulkSetFinancial(false)}
                  disabled={bulkProcessing}
                  className="a-btn a-btn-a a-btn-sm"
                >
                  <DollarSign size={15} />
                  Set Unfinancial
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkProcessing}
                  className="a-btn a-btn-d a-btn-sm"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedMemberIds(new Set())}
                  className="a-btn a-btn-q a-btn-sm"
                >
                  <X size={15} />
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="a-field flex-1 min-w-[240px]">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search members"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search members"
            />
          </label>
          <select
            value={selectedClub}
            onChange={(e) => setSelectedClub(e.target.value)}
            className="a-pick"
            style={{ maxWidth: 300 }}
            aria-label="Club"
          >
            <option value="all">All clubs</option>
            <option value="unassigned">Not in a club ({unassignedCount})</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.abbreviation ? `${club.abbreviation} - ${club.name}` : club.name}
              </option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="a-pick"
            aria-label="Status"
          >
            <option value="all">All statuses</option>
            <option value="current">Current</option>
            <option value="expired">Expired</option>
            <option value="financial">Financial</option>
            <option value="unfinancial">Unfinancial</option>
          </select>
          <button
            type="button"
            onClick={() => setShowAdvancedFilter(true)}
            className={`a-btn ${advancedFilterConfig ? 'a-btn-p' : ''}`}
          >
            <Filter size={16} />
            {advancedFilterConfig ? 'Filter on' : 'Advanced filters'}
          </button>
          {advancedFilterConfig && (
            <>
              <button type="button" onClick={() => setShowSaveFilter(true)} className="a-btn">
                <Save size={16} />
                Save filter
              </button>
              <button type="button" onClick={() => setAdvancedFilterConfig(null)} className="a-btn a-btn-q">
                <X size={16} />
                Clear
              </button>
            </>
          )}
          <button type="button" onClick={() => setShowManageFilters(true)} className="a-btn">
            <FolderOpen size={16} />
            Saved filters
          </button>
        </div>

        <div className="a-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full a-atable">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={(() => {
                        const totalIds = isConsolidatedView
                          ? consolidatedMembers.flatMap(m => m.memberIds).length
                          : filteredMembers.length;
                        return totalIds > 0 && selectedMemberIds.size === totalIds;
                      })()}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">{isConsolidatedView ? 'Club(s)' : 'Club'}</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Membership</th>
                  <th className="px-4 py-3 text-left">Financial Status</th>
                  <th className="px-4 py-3 text-left">Invite Status</th>
                  <th className="px-4 py-3 text-left">Dates</th>
                  <th className="px-4 py-3 text-right w-16"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {(isConsolidatedView ? consolidatedMembers.length === 0 : filteredMembers.length === 0) ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center a-mute">
                      No members match your search and filters
                    </td>
                  </tr>
                ) : isConsolidatedView ? (
                  consolidatedMembers.map((member) => (
                    <tr key={member.memberIds.join('-')} className={member.memberIds.some(id => selectedMemberIds.has(id)) ? 'is-sel' : ''}>
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={member.memberIds.every(id => selectedMemberIds.has(id))}
                          onChange={() => {
                            const allSelected = member.memberIds.every(id => selectedMemberIds.has(id));
                            setSelectedMemberIds(prev => {
                              const next = new Set(prev);
                              member.memberIds.forEach(id => {
                                if (allSelected) next.delete(id);
                                else next.add(id);
                              });
                              return next;
                            });
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar firstName={member.first_name} lastName={member.last_name} src={member.avatar_url || undefined} size="md" />
                          <span className="a-ink font-semibold whitespace-nowrap">{member.first_name} {member.last_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {member.clubMemberships.length === 0 || (!member.clubMemberships[0].club_id && member.clubMemberships.length === 1) ? (
                          <span className="a-st a-txt-a"><span className="a-light a-light-a" />Not in a club</span>
                        ) : (
                          <div className="space-y-1.5">
                            {member.clubMemberships.filter(cm => cm.club_id).map((cm) => (
                              <div key={cm.id} className="flex items-center gap-2">
                                <Building2 size={14} className="a-dim flex-shrink-0" />
                                <span className="text-sm a-mute truncate max-w-[210px]" title={cm.club_name}>{cm.club_name}</span>
                                <span className={`a-st text-[11px] ${cm.is_financial ? 'a-mute' : 'a-txt-r'}`}>
                                  <span className={`a-light ${cm.is_financial ? 'a-light-g' : 'a-light-r'}`} />
                                  {cm.membership_level || 'Standard'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {member.email && (
                            <div className="flex items-center gap-2 text-sm a-mute">
                              <Mail size={14} className="a-dim" />
                              {member.email}
                            </div>
                          )}
                          {member.phone && (
                            <div className="flex items-center gap-2 text-sm a-mute">
                              <Phone size={14} className="a-dim" />
                              {member.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {member.clubMemberships.length > 1 ? (
                          <div className="space-y-1.5">
                            {member.clubMemberships.filter(cm => cm.club_id).map(cm => {
                              const club = clubs.find(c => c.id === cm.club_id);
                              const abbr = club?.abbreviation || cm.club_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 4);
                              return (
                                <div key={cm.id} className="flex items-center gap-2">
                                  <span className="a-lb-fmt">{cm.membership_level || 'Standard'}</span>
                                  <span className="a-dim text-[11px]">{abbr}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="a-lb-fmt">{member.membership_level || 'Standard'}</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {member.clubMemberships.length > 1 ? (
                          <div className="space-y-1.5">
                            {member.clubMemberships.filter(cm => cm.club_id).map(cm => {
                              const club = clubs.find(c => c.id === cm.club_id);
                              const abbr = club?.abbreviation || cm.club_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 4);
                              return (
                                <div key={cm.id} className="flex items-center gap-2">
                                  <span className={`a-st ${cm.is_financial ? 'a-ink' : 'a-txt-r'}`}><span className={`a-light ${cm.is_financial ? 'a-light-g' : 'a-light-r'}`} />
                                    {cm.is_financial ? 'Financial' : 'Unfinancial'}
                                  </span>
                                  <span className="a-dim text-[11px]">{abbr}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`a-st ${member.is_financial ? 'a-ink' : 'a-txt-r'}`}><span className={`a-light ${member.is_financial ? 'a-light-g' : 'a-light-r'}`} />
                              {member.is_financial ? 'Financial' : 'Unfinancial'}
                            </span>
                            {member.memberIds.some(id => memberRemittanceStatus[id]?.statePaid) && (
                              <div className="a-ib a-txt-b" style={{ width: 28, height: 28, cursor: 'default' }} title="Paid to the state association">
                                <CheckCircle2 size={14} />
                              </div>
                            )}
                            {member.memberIds.some(id => memberRemittanceStatus[id]?.nationalPaid) && (
                              <div className="a-ib a-txt-g" style={{ width: 28, height: 28, cursor: 'default' }} title="Paid to the national association">
                                <CheckCircle2 size={14} />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const hasUserId = !!member.user_id;
                          const activationStatus = member.activation_status;
                          const invitation = memberInvitations[member.id];

                          if (hasUserId && activationStatus === 'activated') {
                            return (
                              <span className="a-lb-fmt a-txt-g">
                                <CheckCircle2 size={12} />
                                Active
                              </span>
                            );
                          }
                          if (hasUserId && activationStatus === 'pending') {
                            return (
                              <span className="a-lb-fmt a-txt-b">
                                <Smartphone size={12} />
                                Awaiting Setup
                              </span>
                            );
                          }
                          if (hasUserId) {
                            return (
                              <span className="a-lb-fmt a-txt-g">
                                <Link size={12} />
                                Connected
                              </span>
                            );
                          }
                          if (invitation?.status === 'pending' || activationStatus === 'pending') {
                            return (
                              <span className="a-lb-fmt a-txt-a">
                                <Clock size={12} />
                                Invite Sent
                              </span>
                            );
                          }
                          if (invitation?.status === 'expired') {
                            return (
                              <span className="a-lb-fmt a-txt-r">
                                <Clock size={12} />
                                Expired
                              </span>
                            );
                          }
                          if (member.email) {
                            return (
                              <span className="a-lb-fmt a-mute">
                                <Smartphone size={12} />
                                Not Invited
                              </span>
                            );
                          }
                          return (
                            <span className="a-lb-fmt a-dim">
                              No Email
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-sm">
                          {member.date_joined && (
                            <div className="a-mute whitespace-nowrap">
                              <span className="a-dim">Joined</span> {formatDate(member.date_joined)}
                            </div>
                          )}
                          {member.renewal_date && (
                            <div className="a-mute whitespace-nowrap">
                              <span className="a-dim">Renews</span> {formatDate(member.renewal_date)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!isImpersonating && member.user_id && (
                            <button
                              onClick={() => startImpersonation(member.id)}
                              className="a-ib"
                              title={`View as ${member.first_name} ${member.last_name}`}
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingMemberId(member.id);
                              setEditingMemberClubId(member.club_id || '');
                            }}
                            className="a-ib"
                            title="Edit member"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingMember(member)}
                            className="a-ib a-ib-d"
                            title="Delete member"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className={selectedMemberIds.has(member.id) ? 'is-sel' : ''}>
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.has(member.id)}
                          onChange={() => toggleMemberSelection(member.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar firstName={member.first_name} lastName={member.last_name} src={member.avatar_url || undefined} size="md" />
                          <span className="a-ink font-semibold whitespace-nowrap">{member.first_name} {member.last_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {member.club_id ? (
                          <div className="flex items-center gap-2">
                            <Building2 size={15} className="a-dim flex-shrink-0" />
                            <span className="text-sm a-mute truncate max-w-[210px]" title={member.club_name}>{member.club_name}</span>
                          </div>
                        ) : (
                          <span className="a-st a-txt-a"><span className="a-light a-light-a" />Not in a club</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {member.email && (
                            <div className="flex items-center gap-2 text-sm a-mute">
                              <Mail size={14} className="a-dim" />
                              {member.email}
                            </div>
                          )}
                          {member.phone && (
                            <div className="flex items-center gap-2 text-sm a-mute">
                              <Phone size={14} className="a-dim" />
                              {member.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="a-lb-fmt">{member.membership_level || 'Standard'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`a-st ${member.is_financial ? 'a-ink' : 'a-txt-r'}`}><span className={`a-light ${member.is_financial ? 'a-light-g' : 'a-light-r'}`} />
                            {member.is_financial ? 'Financial' : 'Unfinancial'}
                          </span>
                          {member.is_financial && memberRemittanceStatus[member.id]?.statePaid && (
                            <div className="a-ib a-txt-b" style={{ width: 28, height: 28, cursor: 'default' }} title="Paid to the state association">
                              <CheckCircle2 size={14} />
                            </div>
                          )}
                          {member.is_financial && !memberRemittanceStatus[member.id]?.statePaid && memberRemittanceStatus[member.id] && (
                            <div className="a-ib a-txt-a" style={{ width: 28, height: 28, cursor: 'default' }} title="Payment to the state association pending">
                              <ArrowUpRight size={14} />
                            </div>
                          )}
                          {member.is_financial && memberRemittanceStatus[member.id]?.nationalPaid && (
                            <div className="a-ib a-txt-g" style={{ width: 28, height: 28, cursor: 'default' }} title="Paid to the national association">
                              <CheckCircle2 size={14} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const hasUserId = !!member.user_id;
                          const activationStatus = member.activation_status;
                          const invitation = memberInvitations[member.id];

                          if (hasUserId && activationStatus === 'activated') {
                            return (
                              <span className="a-lb-fmt a-txt-g">
                                <CheckCircle2 size={12} />
                                Active
                              </span>
                            );
                          }
                          if (hasUserId && activationStatus === 'pending') {
                            return (
                              <span className="a-lb-fmt a-txt-b">
                                <Smartphone size={12} />
                                Awaiting Setup
                              </span>
                            );
                          }
                          if (hasUserId) {
                            return (
                              <span className="a-lb-fmt a-txt-g">
                                <Link size={12} />
                                Connected
                              </span>
                            );
                          }
                          if (invitation?.status === 'pending') {
                            return (
                              <span className="a-lb-fmt a-txt-a">
                                <Clock size={12} />
                                Invite Sent
                              </span>
                            );
                          }
                          if (invitation?.status === 'expired') {
                            return (
                              <span className="a-lb-fmt a-txt-r">
                                <Clock size={12} />
                                Expired
                              </span>
                            );
                          }
                          if (activationStatus === 'pending') {
                            return (
                              <span className="a-lb-fmt a-txt-b">
                                <Smartphone size={12} />
                                Invite Sent
                              </span>
                            );
                          }
                          if (member.email) {
                            return (
                              <span className="a-lb-fmt a-mute">
                                <Smartphone size={12} />
                                Not Invited
                              </span>
                            );
                          }
                          return (
                            <span className="a-lb-fmt a-dim">
                              No Email
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-sm">
                          {member.date_joined && (
                            <div className="a-mute whitespace-nowrap">
                              <span className="a-dim">Joined</span> {formatDate(member.date_joined)}
                            </div>
                          )}
                          {member.renewal_date && (
                            <div className="a-mute whitespace-nowrap">
                              <span className="a-dim">Renews</span> {formatDate(member.renewal_date)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!isImpersonating && member.user_id && (
                            <button
                              onClick={() => startImpersonation(member.id)}
                              className="a-ib"
                              title={`View as ${member.first_name} ${member.last_name}`}
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingMemberId(member.id);
                              setEditingMemberClubId(member.club_id || '');
                            }}
                            className="a-ib"
                            title="Edit member"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingMember(member)}
                            className="a-ib a-ib-d"
                            title="Delete member"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AdvancedMemberFilter
        isOpen={showAdvancedFilter}
        onClose={() => setShowAdvancedFilter(false)}
        onApply={(config) => {
          const hasConditions = config.groups.some(g => g.conditions.length > 0);
          setAdvancedFilterConfig(hasConditions ? config : null);
        }}
        initialConfig={advancedFilterConfig || undefined}
        boatClasses={boatClasses}
        memberCount={isConsolidatedView ? consolidatedMembers.length : filteredMembers.length}
        darkMode={darkMode}
      />

      {showSaveFilter && advancedFilterConfig && (
        <SaveFilterModal
          isOpen={showSaveFilter}
          onClose={() => setShowSaveFilter(false)}
          filterConfig={advancedFilterConfig}
          darkMode={darkMode}
        />
      )}

      <ManageFiltersModal
        isOpen={showManageFilters}
        onClose={() => setShowManageFilters(false)}
        onLoadFilter={(config) => {
          setAdvancedFilterConfig(config);
          setShowManageFilters(false);
        }}
        darkMode={darkMode}
      />

      {showImportModal && currentOrganization && (
        <AssociationMemberImportModal
          isOpen={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            loadStateAssociationData();
          }}
          associationId={currentOrganization.id}
          associationType={currentOrganization.type as 'state' | 'national'}
          associationName={currentOrganization.name}
          clubs={clubs}
        />
      )}

      {editingMemberId && (
        <MemberEditModal
          isOpen={true}
          onClose={() => {
            setEditingMemberId(null);
            setEditingMemberClubId('');
          }}
          memberId={editingMemberId}
          clubId={editingMemberClubId}
          darkMode={darkMode}
          onSuccess={() => {
            setEditingMemberId(null);
            setEditingMemberClubId('');
            loadStateAssociationData();
          }}
        />
      )}

      {showAddToClubModal && (
        <AdminAddToClubModal
          isOpen={showAddToClubModal}
          onClose={() => setShowAddToClubModal(false)}
          memberIds={Array.from(selectedMemberIds)}
          availableClubs={clubs}
          darkMode={darkMode}
          onSuccess={handleAddToClubSuccess}
        />
      )}

      {showActivateModal && (
        <div className="a-dlg">
          <div className="a-sheet max-w-lg">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="a-tile">
                    <Smartphone size={20} className="text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {activationResults ? 'Activation Complete' : 'Activate for AlfiePRO App'}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {activationResults
                        ? `${activationResults.summary.created} account${activationResults.summary.created === 1 ? '' : 's'} created`
                        : `${membersToActivate.length} member${membersToActivate.length === 1 ? '' : 's'} selected`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowActivateModal(false);
                    setMembersToActivate([]);
                    setActivationResults(null);
                  }}
                  className="a-ib"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {!activationResults ? (
                <>
                  <p className="text-slate-300 mb-4">
                    {membersToActivate.length === 1
                      ? <>This will create a login account for <span className="font-semibold text-white">{membersToActivate[0].first_name} {membersToActivate[0].last_name}</span> and send them an email with a link to download the AlfiePRO app and set their password.</>
                      : <>This will create login accounts for <span className="font-semibold text-white">{membersToActivate.length} members</span> and email each of them with a link to download the AlfiePRO app and set their password.</>
                    }
                  </p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-start gap-3 p-3 bg-slate-700/50 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sky-400 text-xs font-bold">1</span>
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">Account created</p>
                        <p className="text-xs text-slate-400">Auth account pre-created with their email on file</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-700/50 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sky-400 text-xs font-bold">2</span>
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">Welcome email sent</p>
                        <p className="text-xs text-slate-400">Contains app download links and an activation button</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-700/50 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sky-400 text-xs font-bold">3</span>
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">Member sets password in app</p>
                        <p className="text-xs text-slate-400">One tap, set password, they're in -- no registration needed</p>
                      </div>
                    </div>
                  </div>

                  {membersToActivate.length <= 5 && (
                    <div className="mb-4">
                      <p className="text-xs text-slate-500 mb-2">Members to activate:</p>
                      <div className="space-y-1">
                        {membersToActivate.map(m => (
                          <div key={m.id} className="flex items-center justify-between text-sm py-1 px-2 bg-slate-700/30 rounded">
                            <span className="text-slate-300">{m.first_name} {m.last_name}</span>
                            <span className="text-slate-500 text-xs">{m.email} ({m.club_name})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {activationResults.summary.created > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-green-900/20 border border-green-900/30 rounded-lg">
                      <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
                      <p className="text-sm text-green-300">
                        {activationResults.summary.created} account{activationResults.summary.created === 1 ? '' : 's'} created and welcome email{activationResults.summary.created === 1 ? '' : 's'} sent
                      </p>
                    </div>
                  )}
                  {activationResults.summary.existing_linked > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-900/30 rounded-lg">
                      <CheckCircle2 size={18} className="text-blue-400 flex-shrink-0" />
                      <p className="text-sm text-blue-300">
                        {activationResults.summary.existing_linked} already had an account
                      </p>
                    </div>
                  )}
                  {activationResults.summary.no_email > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-amber-900/20 border border-amber-900/30 rounded-lg">
                      <Mail size={18} className="text-amber-400 flex-shrink-0" />
                      <p className="text-sm text-amber-300">
                        {activationResults.summary.no_email} skipped (no email address)
                      </p>
                    </div>
                  )}
                  {activationResults.summary.errors > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-900/30 rounded-lg">
                      <X size={18} className="text-red-400 flex-shrink-0" />
                      <p className="text-sm text-red-300">
                        {activationResults.summary.errors} failed
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              {!activationResults ? (
                <>
                  <button
                    onClick={() => {
                      setShowActivateModal(false);
                      setMembersToActivate([]);
                    }}
                    className="a-btn a-btn-q"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmActivation}
                    disabled={activating}
                    className="a-btn a-btn-p"
                  >
                    {activating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Activating...
                      </>
                    ) : (
                      <>
                        <Smartphone size={16} />
                        Activate {membersToActivate.filter(m => m.email).length} Member{membersToActivate.filter(m => m.email).length === 1 ? '' : 's'}
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowActivateModal(false);
                    setMembersToActivate([]);
                    setActivationResults(null);
                  }}
                  className="a-btn"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showDefaultClubModal && defaultClubMember && (
        <div className="a-dlg">
          <div className="a-sheet max-w-md">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="a-tile">
                    <Home size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Set Default Club</h3>
                    <p className="text-sm text-slate-400">
                      {defaultClubMember.first_name} {defaultClubMember.last_name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDefaultClubModal(false);
                    setDefaultClubMember(null);
                  }}
                  className="a-ib"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-4">
                Choose which club this member sees when they first log in to AlfiePRO:
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {clubs.map(club => (
                  <button
                    key={club.id}
                    onClick={() => setSelectedDefaultClubId(club.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all border ${
                      selectedDefaultClubId === club.id
                        ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-slate-700/30 border-slate-700/50 hover:bg-slate-700/60'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedDefaultClubId === club.id ? 'bg-blue-500' : 'bg-slate-700'
                    }`}>
                      <Building2 size={14} className={selectedDefaultClubId === club.id ? 'text-white' : 'text-slate-400'} />
                    </div>
                    <span className={`font-medium text-sm ${selectedDefaultClubId === club.id ? 'text-white' : 'text-slate-300'}`}>
                      {club.name}
                    </span>
                    {defaultClubMember.club_id === club.id && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-600 text-slate-300">Current</span>
                    )}
                    {selectedDefaultClubId === club.id && (
                      <CheckCircle2 size={16} className="text-blue-400 ml-auto flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDefaultClubModal(false);
                  setDefaultClubMember(null);
                }}
                className="a-btn a-btn-q"
              >
                Cancel
              </button>
              <button
                onClick={handleSetDefaultClub}
                disabled={!selectedDefaultClubId || settingDefaultClub}
                className="a-btn a-btn-p"
              >
                {settingDefaultClub ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Home size={16} />
                    Set as Default
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {deletingMember && (
        <div className="a-dlg">
          <div className="a-sheet max-w-md">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="a-tile">
                  <Trash2 size={20} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Delete Member</h3>
                  <p className="text-sm text-slate-400">This action cannot be undone</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-300 mb-2">
                Are you sure you want to permanently delete <span className="font-semibold text-white">{deletingMember.first_name} {deletingMember.last_name}</span>?
              </p>
              {deletingMember.club_name && (
                <p className="text-sm text-slate-400 mb-4">
                  Club: {deletingMember.club_name}
                  {deletingMember.email && <> | {deletingMember.email}</>}
                </p>
              )}
              <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg mb-4">
                <p className="text-sm text-red-300">
                  This will permanently remove this member record and all associated remittances. They will no longer appear in member lists or archive.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setDeletingMember(null)}
                disabled={deleteProcessing}
                className="a-btn a-btn-q"
              >
                Cancel
              </button>
              <button
                onClick={handleSingleDelete}
                disabled={deleteProcessing}
                className="a-btn a-btn-d"
              >
                {deleteProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Yes, Delete
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

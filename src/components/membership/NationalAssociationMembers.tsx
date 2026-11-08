import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Users, Search, Download, Mail, Phone, Building2, CircleCheck as CheckCircle2, ArrowUpRight, MapPin, Upload, Eye, UserPlus, DollarSign, Trash2, X, Pencil, Smartphone, Loader as Loader2, Hop as Home } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { Avatar } from '../ui/Avatar';
import { InlineLoading, KpiCard, PageHead } from '../association/AssocUI';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import Papa from 'papaparse';
import AssociationMemberImportModal from './AssociationMemberImportModal';
import { MemberEditModal } from './MemberEditModal';
import { AdminAddToClubModal } from './AdminAddToClubModal';
import { useNotifications } from '../../contexts/NotificationContext';
import { activateMembers, ActivationResponse } from '../../utils/memberActivation';

interface NationalAssociationMembersProps {
  darkMode: boolean;
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
  state_association_id: string;
  state_association_name: string;
  avatar_url?: string;
  user_id?: string;
}

export const NationalAssociationMembers: React.FC<NationalAssociationMembersProps> = ({ darkMode }) => {
  const { user, currentOrganization } = useAuth();
  const { startImpersonation, isImpersonating } = useImpersonation();
  const { addNotification } = useNotifications();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberWithClub[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<MemberWithClub[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedClub, setSelectedClub] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [stateAssociations, setStateAssociations] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [memberRemittanceStatus, setMemberRemittanceStatus] = useState<Record<string, { statePaid: boolean; nationalPaid: boolean }>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [showAddToClubModal, setShowAddToClubModal] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberClubId, setEditingMemberClubId] = useState<string>('');
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

  useEffect(() => {
    const state = location.state as { viewClubId?: string } | null;
    if (state?.viewClubId) {
      setSelectedClub(state.viewClubId);
    }
  }, [location.state]);

  useEffect(() => {
    loadNationalAssociationData();
  }, [user]);

  useEffect(() => {
    filterMembers();
  }, [members, searchTerm, selectedState, selectedClub, selectedStatus]);

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

  const loadNationalAssociationData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Get user's national association
      const { data: userNationalAssoc, error: userNationalError } = await supabase
        .from('user_national_associations')
        .select('national_association_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (userNationalError) throw userNationalError;

      if (!userNationalAssoc) {
        throw new Error('No national association found');
      }

      const nationalId = (userNationalAssoc as any).national_association_id;

      console.log('Loading data for national association:', nationalId);

      // Load state associations under this national association
      const { data: statesData, error: statesError } = await supabase
        .from('state_associations')
        .select('id, name, state')
        .eq('national_association_id', nationalId)
        .order('name');

      if (statesError) throw statesError;
      console.log('Loaded states:', statesData);
      setStateAssociations(statesData || []);

      // Load all clubs under these state associations
      const stateIds = (statesData || []).map(s => s.id);

      if (stateIds.length === 0) {
        console.log('No state associations found');
        setMembers([]);
        setLoading(false);
        return;
      }

      const { data: clubsData, error: clubsError } = await supabase
        .from('clubs')
        .select('id, name, state_association_id')
        .in('state_association_id', stateIds)
        .order('name');

      if (clubsError) throw clubsError;
      console.log('Loaded clubs:', clubsData);
      setClubs(clubsData || []);

      // Load all members from all clubs
      const clubIds = (clubsData || []).map(c => c.id);

      if (clubIds.length === 0) {
        console.log('No clubs found');
        setMembers([]);
        setLoading(false);
        return;
      }

      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select(`
          id,
          first_name,
          last_name,
          email,
          phone,
          membership_level,
          is_financial,
          date_joined,
          renewal_date,
          club_id,
          avatar_url,
          user_id
        `)
        .in('club_id', clubIds)
        .eq('membership_status', 'active')
        .order('last_name');

      if (membersError) throw membersError;
      console.log('Loaded members:', membersData?.length || 0);

      const formattedMembers = (membersData || []).map((m: any) => {
        const club = clubsData?.find(c => c.id === m.club_id);
        const state = statesData?.find(s => s.id === club?.state_association_id);
        return {
          ...m,
          club_name: club?.name || 'Unknown Club',
          state_association_id: club?.state_association_id || '',
          state_association_name: state?.name || 'Unknown State'
        };
      });

      setMembers(formattedMembers);

      // Fetch remittance statuses for all members
      if (formattedMembers.length > 0) {
        fetchRemittanceStatuses(formattedMembers.map(m => m.id));
      }
    } catch (err: any) {
      console.error('Error loading national association data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filterMembers = () => {
    let filtered = [...members];

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.first_name.toLowerCase().includes(searchLower) ||
          m.last_name.toLowerCase().includes(searchLower) ||
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchLower) ||
          m.email.toLowerCase().includes(searchLower) ||
          m.club_name.toLowerCase().includes(searchLower) ||
          m.state_association_name.toLowerCase().includes(searchLower)
      );
    }

    // Filter by state
    if (selectedState !== 'all') {
      filtered = filtered.filter((m) => m.state_association_id === selectedState);
    }

    // Filter by club
    if (selectedClub !== 'all') {
      filtered = filtered.filter((m) => m.club_id === selectedClub);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'financial') {
        filtered = filtered.filter((m) => m.is_financial);
      } else if (selectedStatus === 'unfinancial') {
        filtered = filtered.filter((m) => !m.is_financial);
      }
    }

    setFilteredMembers(filtered);
  };

  const exportToCSV = () => {
    const csvData = filteredMembers.map((m) => ({
      'First Name': m.first_name,
      'Last Name': m.last_name,
      'Email': m.email,
      'Phone': m.phone,
      'State': m.state_association_name,
      'Club': m.club_name,
      'Membership Level': m.membership_level,
      'Financial Status': m.is_financial ? 'Financial' : 'Unfinancial',
      'Date Joined': m.date_joined ? formatDate(m.date_joined) : '',
      'Renewal Date': m.renewal_date ? formatDate(m.renewal_date) : ''
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `national-association-members-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const toggleMemberSelection = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMemberIds.size === filteredMembers.length) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(filteredMembers.map(m => m.id)));
    }
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
      loadNationalAssociationData();
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
      loadNationalAssociationData();
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
      loadNationalAssociationData();
    } catch (err: any) {
      console.error('Error deleting member:', err);
      addNotification('error', `Failed to delete member: ${err.message || 'Unknown error'}`);
    }
    setDeleteProcessing(false);
  };

  const handleAddToClubSuccess = () => {
    setSelectedMemberIds(new Set());
    setShowAddToClubModal(false);
    loadNationalAssociationData();
  };

  const handleBulkActivate = () => {
    const selected = members.filter(m => selectedMemberIds.has(m.id) && !m.user_id && m.email);
    if (selected.length > 0) {
      setMembersToActivate(selected);
    } else {
      setMembersToActivate(members.filter(m => !m.user_id && m.email));
    }
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
        membersByClub.set(m.club_id, { clubName: m.club_name || 'Unknown Club', memberIds: [m.id] });
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
        summary: { created: totalCreated, existing_linked: 0, errors: totalErrors, no_email: membersToActivate.filter(m => !m.email).length, total: membersToActivate.length },
        results: [],
      });
    }

    if (totalCreated > 0) {
      addNotification('success', `${totalCreated} member${totalCreated === 1 ? '' : 's'} activated and invited to AlfiePRO`);
      loadNationalAssociationData();
    }
  };

  const handleSetDefaultClub = async () => {
    if (!defaultClubMember?.user_id || !selectedDefaultClubId) return;
    setSettingDefaultClub(true);
    try {
      await supabase
        .from('profiles')
        .update({ default_club_id: selectedDefaultClubId, primary_club_id: selectedDefaultClubId })
        .eq('id', defaultClubMember.user_id);
      addNotification('success', `Default club updated for ${defaultClubMember.first_name} ${defaultClubMember.last_name}`);
      setShowDefaultClubModal(false);
      setDefaultClubMember(null);
      setSelectedDefaultClubId('');
    } catch (err) {
      console.error('Error setting default club:', err);
      addNotification('error', 'Failed to update default club');
    }
    setSettingDefaultClub(false);
  };

  const availableClubs = selectedState === 'all'
    ? clubs
    : clubs.filter(c => c.state_association_id === selectedState);

  const stats = {
    totalMembers: members.length,
    financialMembers: members.filter((m) => m.is_financial).length,
    totalStates: stateAssociations.length,
    totalClubs: clubs.length,
    filteredCount: filteredMembers.length
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

  return (
    <div className="h-full overflow-y-auto">
    <div className="a-apage">
      <PageHead
        icon={<Users size={24} />}
        title="Members"
        sub={`${stats.totalMembers} members across ${stats.totalStates} state associations and ${stats.totalClubs} clubs`}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard cap="Members" value={stats.totalMembers} sub="Across all state associations" icon={<Users size={18} />} />
        <KpiCard cap="Financial" value={stats.financialMembers} sub={`${stats.totalMembers ? Math.round((stats.financialMembers / stats.totalMembers) * 100) : 0}% of members`} icon={<CheckCircle2 size={18} />} tone="green" />
        <KpiCard cap="State associations" value={stats.totalStates} sub={`${stats.totalClubs} member clubs`} icon={<MapPin size={18} />} />
        <KpiCard cap="Showing" value={stats.filteredCount} sub="Match your search and filters" icon={<Search size={18} />} />
      </div>

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
          value={selectedState}
          onChange={(e) => {
            setSelectedState(e.target.value);
            setSelectedClub('all');
          }}
          className="a-pick"
          aria-label="State association"
        >
          <option value="all">All states</option>
          {stateAssociations.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </select>
        <select
          value={selectedClub}
          onChange={(e) => setSelectedClub(e.target.value)}
          className="a-pick"
          style={{ maxWidth: 280 }}
          aria-label="Club"
        >
          <option value="all">All clubs</option>
          {availableClubs.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
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
          <option value="financial">Financial</option>
          <option value="unfinancial">Unfinancial</option>
        </select>
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
                const allHaveAccounts = selectedMembers.every(m => m.user_id);
                const singleWithAccount = selectedMembers.length === 1 && selectedMembers[0].user_id && selectedMembers[0].club_id;
                return (
                  <>
                    {singleWithAccount && (
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
                    )}
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

      {/* Members Table */}
      <div className="a-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full a-atable">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={filteredMembers.length > 0 && selectedMemberIds.size === filteredMembers.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left">
                  Member
                </th>
                <th className="px-4 py-3 text-left">
                  State
                </th>
                <th className="px-4 py-3 text-left">
                  Club
                </th>
                <th className="px-4 py-3 text-left">
                  Contact
                </th>
                <th className="px-4 py-3 text-left">
                  Financial Status
                </th>
                <th className="px-4 py-3 text-left">
                  Dates
                </th>
                <th className="px-4 py-3 text-right w-16"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center a-mute">
                    No members match your search and filters
                  </td>
                </tr>
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
                        <span className="a-ink font-semibold whitespace-nowrap">
                          {member.first_name} {member.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <MapPin size={15} className="a-dim flex-shrink-0" />
                        <span className="text-sm a-mute truncate max-w-[190px]" title={member.state_association_name}>
                          {member.state_association_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 size={15} className="a-dim flex-shrink-0" />
                        <span className="text-sm a-mute truncate max-w-[210px]" title={member.club_name}>
                          {member.club_name}
                        </span>
                      </div>
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
                      <div className="flex items-center gap-2">
                        <span className={`a-st ${member.is_financial ? 'a-ink' : 'a-txt-r'}`}>
                          <span className={`a-light ${member.is_financial ? 'a-light-g' : 'a-light-r'}`} />
                          {member.is_financial ? 'Financial' : 'Unfinancial'}
                        </span>
                        {/* State Remittance Status */}
                        {member.is_financial && memberRemittanceStatus[member.id]?.statePaid && (
                          <div
                            className="a-ib a-txt-b" style={{ width: 28, height: 28, cursor: 'default' }}
                            title="Paid to the state association"
                          >
                            <CheckCircle2 size={14} />
                          </div>
                        )}
                        {member.is_financial && !memberRemittanceStatus[member.id]?.statePaid && memberRemittanceStatus[member.id] && (
                          <div
                            className="a-ib a-txt-a" style={{ width: 28, height: 28, cursor: 'default' }}
                            title="Payment to the state association pending"
                          >
                            <ArrowUpRight size={14} />
                          </div>
                        )}
                        {/* National Remittance Status */}
                        {member.is_financial && memberRemittanceStatus[member.id]?.nationalPaid && (
                          <div
                            className="a-ib a-txt-g" style={{ width: 28, height: 28, cursor: 'default' }}
                            title="Paid to the national association"
                          >
                            <CheckCircle2 size={14} />
                          </div>
                        )}
                      </div>
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

      {showImportModal && currentOrganization && (
        <AssociationMemberImportModal
          isOpen={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            loadNationalAssociationData();
          }}
          associationId={currentOrganization.id}
          associationType={currentOrganization.type as 'state' | 'national'}
          associationName={currentOrganization.name}
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
            loadNationalAssociationData();
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
    </div>
  );
};

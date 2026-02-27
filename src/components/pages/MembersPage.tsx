import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Search, Filter, Mail, Phone, Edit2, Trash2, ChevronRight, Eye, ChevronDown, FileDown, Send, UserCheck, Clock, MailOpen, ArrowUpDown, User, Crown, Shield, Calendar, DollarSign, ArchiveRestore, ArrowUpRight, CheckCircle2, X, MapIcon, Save, Trash, Link, Zap, UserX } from 'lucide-react';
import { MemberImportExportModal } from '../MemberImportExportModal';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Member } from '../../types/member';
import { MembershipFormModal } from '../membership/MembershipFormModal';
import { MemberEditModal } from '../membership/MemberEditModal';
import { PaymentReconciliationModal } from '../membership/PaymentReconciliationModal';
import { AdminAddMemberModal } from '../AdminAddMemberModal';
import { useNotifications } from '../../contexts/NotificationContext';
import { sendMemberInvitation } from '../../utils/memberInvitations';
import { MembershipApplicationsPanel } from '../MembershipApplicationsPanel';
import { ArchiveMemberModal } from '../ArchiveMemberModal';
import { MembersMapView } from '../membership/MembersMapView';
import { AdvancedMemberFilter } from '../membership/AdvancedMemberFilter';
import { SaveFilterModal } from '../membership/SaveFilterModal';
import { ManageFiltersModal } from '../membership/ManageFiltersModal';
import { MemberFilterConfig, FilterPreset } from '../../types/memberFilters';
import { filterMembers, createEmptyFilter } from '../../utils/memberFilters';

interface MembersPageProps {
  darkMode: boolean;
  onNavigateToRemittances?: () => void;
}

export const MembersPage: React.FC<MembersPageProps> = ({ darkMode, onNavigateToRemittances }) => {
  const { currentClub } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'archived'>('all');
  const [filterBoatClass, setFilterBoatClass] = useState<string>('all');
  const [boatClasses, setBoatClasses] = useState<string[]>([]);
  const [showMembershipForm, setShowMembershipForm] = useState(false);
  const [showMemberEditModal, setShowMemberEditModal] = useState(false);
  const [showPaymentReconciliation, setShowPaymentReconciliation] = useState(false);
  const [showAdminAddMember, setShowAdminAddMember] = useState(false); // For new admin additions
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined);
  const [isRenewal, setIsRenewal] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'view'>('edit');
  const { addNotification } = useNotifications();
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [invitingMemberId, setInvitingMemberId] = useState<string | null>(null);
  const [memberInvitations, setMemberInvitations] = useState<Record<string, any>>({});
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<any>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [memberToArchive, setMemberToArchive] = useState<Member | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showInviteConfirmModal, setShowInviteConfirmModal] = useState(false);
  const [memberToInvite, setMemberToInvite] = useState<Member | null>(null);
  const [memberRemittanceStatus, setMemberRemittanceStatus] = useState<Record<string, 'paid' | 'pending' | 'none'>>({});
  const [showMapView, setShowMapView] = useState(false);
  const [emailMatches, setEmailMatches] = useState<Record<string, string>>({});
  const [autoLinking, setAutoLinking] = useState(false);
  const [linkingMemberId, setLinkingMemberId] = useState<string | null>(null);

  // Advanced filtering state
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [filterConfig, setFilterConfig] = useState<MemberFilterConfig>(createEmptyFilter());
  const [activeFilterPreset, setActiveFilterPreset] = useState<FilterPreset | null>(null);
  const [savedPresets, setSavedPresets] = useState<FilterPreset[]>([]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [showManageFiltersModal, setShowManageFiltersModal] = useState(false);
  const [hasActiveFilter, setHasActiveFilter] = useState(false);

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchMembers();
      fetchMemberInvitations();
      fetchRemittanceStatuses();
      fetchFilterPresets();
      fetchEmailMatches();
    }
  }, [currentClub, filterStatus]);

  // Subscribe to realtime changes on members table
  useEffect(() => {
    if (!currentClub?.clubId) return;

    const channel = supabase
      .channel('members-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'members',
          filter: `club_id=eq.${currentClub.clubId}`,
        },
        () => {
          // Refresh members list when any change occurs
          fetchMembers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentClub?.clubId]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };

    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterDropdown]);

  const fetchMemberInvitations = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('member_invitations')
        .select('*')
        .eq('club_id', currentClub.clubId)
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
      console.error('Error fetching invitations:', err);
    }
  };

  const fetchEmailMatches = async () => {
    if (!currentClub?.clubId) return;
    try {
      const { data, error } = await supabase.rpc('check_member_email_matches', {
        p_club_id: currentClub.clubId
      });
      if (error) throw error;
      if (data?.success && data.matches) {
        const matchMap: Record<string, string> = {};
        data.matches.forEach((m: any) => {
          matchMap[m.member_id] = m.auth_user_id;
        });
        setEmailMatches(matchMap);
      }
    } catch (err) {
      console.error('Error checking email matches:', err);
    }
  };

  const handleAutoLinkAll = async () => {
    if (!currentClub?.clubId) return;
    setAutoLinking(true);
    try {
      const { data, error } = await supabase.rpc('auto_link_all_matching_members', {
        p_club_id: currentClub.clubId
      });
      if (error) throw error;
      if (data?.success) {
        const count = data.linked_count || 0;
        addNotification(count > 0 ? `${count} member${count === 1 ? '' : 's'} linked to their accounts` : 'No new matches to link', 'success');
        if (count > 0) {
          await fetchMembers();
          setEmailMatches({});
        }
      }
    } catch (err: any) {
      addNotification(err.message || 'Failed to auto-link members', 'error');
    } finally {
      setAutoLinking(false);
    }
  };

  const handleLinkSingleMember = async (memberId: string) => {
    const authUserId = emailMatches[memberId];
    if (!authUserId) return;
    setLinkingMemberId(memberId);
    try {
      const member = members.find(m => m.id === memberId);
      const { data, error } = await supabase.rpc('admin_link_member_to_account', {
        p_member_id: memberId,
        p_email: member?.email || ''
      });
      if (error) throw error;
      if (data?.success) {
        addNotification('Member linked to their account', 'success');
        await fetchMembers();
        const newMatches = { ...emailMatches };
        delete newMatches[memberId];
        setEmailMatches(newMatches);
      } else {
        addNotification(data?.error || 'Failed to link', 'error');
      }
    } catch (err: any) {
      addNotification(err.message || 'Failed to link member', 'error');
    } finally {
      setLinkingMemberId(null);
    }
  };

  const fetchRemittanceStatuses = async () => {
    if (!currentClub?.clubId) return;

    try {
      // Fetch all remittances for the current club for the current year
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from('membership_remittances')
        .select('member_id, club_to_state_status')
        .eq('club_id', currentClub.clubId)
        .eq('membership_year', currentYear);

      if (error) throw error;

      const statusMap: Record<string, 'paid' | 'pending' | 'none'> = {};
      data?.forEach(remittance => {
        if (remittance.club_to_state_status === 'paid') {
          statusMap[remittance.member_id] = 'paid';
        } else if (remittance.club_to_state_status === 'pending') {
          statusMap[remittance.member_id] = 'pending';
        } else {
          statusMap[remittance.member_id] = 'none';
        }
      });

      setMemberRemittanceStatus(statusMap);
    } catch (err) {
      console.error('Error fetching remittance statuses:', err);
    }
  };

  const fetchFilterPresets = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('member_filter_presets')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSavedPresets(data || []);

      // Load default filter if one exists
      const defaultPreset = data?.find(p => p.is_default);
      if (defaultPreset) {
        setFilterConfig(defaultPreset.filter_config);
        setActiveFilterPreset(defaultPreset);
        setHasActiveFilter(true);
      }
    } catch (err) {
      console.error('Error fetching filter presets:', err);
    }
  };

  const handleApplyFilter = (config: MemberFilterConfig) => {
    setFilterConfig(config);
    setHasActiveFilter(config.groups.some(g => g.conditions.length > 0));
    setActiveFilterPreset(null);
    setShowAdvancedFilter(false);
  };

  const handleClearFilter = () => {
    setFilterConfig(createEmptyFilter());
    setActiveFilterPreset(null);
    setHasActiveFilter(false);
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    setFilterConfig(preset.filter_config);
    setActiveFilterPreset(preset);
    setHasActiveFilter(true);
    setShowFilterDropdown(false);
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm('Delete this filter preset?')) return;

    try {
      const { error } = await supabase
        .from('member_filter_presets')
        .delete()
        .eq('id', presetId);

      if (error) throw error;

      addNotification('Filter preset deleted', 'success');
      fetchFilterPresets();

      if (activeFilterPreset?.id === presetId) {
        handleClearFilter();
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
      addNotification('Failed to delete preset', 'error');
    }
  };

  const handleSaveFilterSuccess = () => {
    fetchFilterPresets();
    setShowSaveFilterModal(false);
    addNotification('Filter saved successfully', 'success');
  };

  const fetchMembers = async () => {
    try {
      setLoading(true);

      // Build query based on filter status
      let query = supabase
        .from('members')
        .select(`
          *,
          boats:member_boats(*)
        `)
        .eq('club_id', currentClub?.clubId);

      // Filter by membership status
      if (filterStatus === 'archived') {
        query = query.eq('membership_status', 'archived');
      } else {
        // For non-archived views, exclude archived members
        query = query.or('membership_status.eq.active,membership_status.is.null');
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch avatar URLs from profiles for members with user_id (only if member doesn't have one)
      if (data && data.length > 0) {
        const userIds = data.filter(m => m.user_id && !m.avatar_url).map(m => m.user_id);
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, avatar_url')
            .in('id', userIds);

          // Merge avatar data only for members without their own avatar
          const membersWithAvatars = data.map(member => {
            if (member.avatar_url) return member; // Keep existing member avatar
            const profile = profiles?.find(p => p.id === member.user_id);
            return {
              ...member,
              avatar_url: profile?.avatar_url || member.avatar_url
            };
          });

          setMembers(membersWithAvatars);
        } else {
          setMembers(data);
        }
      } else {
        setMembers(data || []);
      }
      
      // Extract unique boat classes
      const classes = new Set<string>();
      data?.forEach(member => {
        member.boats?.forEach((boat: any) => {
          if (boat.boat_type) {
            classes.add(boat.boat_type);
          }
        });
      });
      
      setBoatClasses(Array.from(classes));
      
    } catch (err) {
      console.error('Error fetching members:', err);
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = (() => {
    // Step 1: Apply advanced filter if active
    let filtered = hasActiveFilter ? filterMembers(members, filterConfig) : members;

    // Step 2: Apply search filter
    filtered = filtered.filter(member => {
      const matchesSearch =
        `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.email && member.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (member.phone && member.phone.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesSearch;
    });

    // Step 3: Sort by name
    return filtered.sort((a, b) => {
      const lastNameCompare = (a.last_name || '').localeCompare(b.last_name || '');
      if (lastNameCompare !== 0) {
        return sortDirection === 'asc' ? lastNameCompare : -lastNameCompare;
      }
      const firstNameCompare = (a.first_name || '').localeCompare(b.first_name || '');
      return sortDirection === 'asc' ? firstNameCompare : -firstNameCompare;
    });
  })();

  const toggleSort = () => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const getMembershipTypeConfig = (type: string | undefined) => {
    const normalizedType = (type || '').toLowerCase();

    if (normalizedType.includes('full')) {
      return { icon: Crown, label: 'Full', color: 'bg-blue-900/30 text-blue-400', iconColor: 'text-blue-400' };
    } else if (normalizedType.includes('associate')) {
      return { icon: Shield, label: 'Associate', color: 'bg-purple-900/30 text-purple-400', iconColor: 'text-purple-400' };
    } else if (normalizedType.includes('casual')) {
      return { icon: User, label: 'Casual', color: 'bg-slate-700/50 text-slate-400', iconColor: 'text-slate-400' };
    } else if (normalizedType.includes('social')) {
      return { icon: User, label: 'Social', color: 'bg-amber-900/30 text-amber-400', iconColor: 'text-amber-400' };
    } else {
      return { icon: User, label: type || 'Not set', color: 'bg-slate-700/50 text-slate-400', iconColor: 'text-slate-400' };
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleAddMember = () => {
    setShowAdminAddMember(true); // Open the new admin add member modal
  };

  const handleViewMember = (memberId: string) => {
    setSelectedMemberId(memberId);
    setIsRenewal(false);
    setViewMode('view');
    setShowMembershipForm(true);
  };

  const handleEditMember = (memberId: string) => {
    setSelectedMemberId(memberId);
    setShowMemberEditModal(true);
  };

  const handleRenewMember = (memberId: string) => {
    setSelectedMemberId(memberId);
    setIsRenewal(true);
    setViewMode('edit');
    setShowMembershipForm(true);
  };

  const handleDeleteMember = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    setMemberToArchive(member);
    setShowArchiveModal(true);
  };

  const handleRestoreMember = async (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    if (!confirm(`Restore ${member.first_name} ${member.last_name}?\n\nThis will make them an active member again.`)) {
      return;
    }

    try {
      const { restoreMember } = await import('../../utils/storage');
      const result = await restoreMember(memberId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to restore member');
      }

      addNotification(`${member.first_name} ${member.last_name} restored successfully`, 'success');
      fetchMembers();
    } catch (err) {
      console.error('Error restoring member:', err);
      addNotification(err instanceof Error ? err.message : 'Failed to restore member', 'error');
    }
  };

  const handleConfirmArchive = async (removeAuthAccess: boolean, reason?: string) => {
    if (!memberToArchive) return;

    try {
      const { archiveMember } = await import('../../utils/storage');
      const result = await archiveMember(memberToArchive.id, removeAuthAccess, reason);

      if (!result.success) {
        throw new Error(result.error || 'Failed to archive member');
      }

      const preserved = result.details?.preserved || {};
      const summary = [];
      if (preserved.boats > 0) summary.push(`${preserved.boats} boat(s)`);
      if (preserved.race_results > 0) summary.push(`${preserved.race_results} race result(s)`);
      if (preserved.payments > 0) summary.push(`${preserved.payments} payment(s)`);
      if (preserved.attendance > 0) summary.push(`${preserved.attendance} record(s)`);

      const summaryText = summary.length > 0 ? ` Preserved: ${summary.join(', ')}.` : '';
      let message = `Member archived successfully.${summaryText}`;
      if (result.details?.auth_user_deleted) {
        message += ' Authentication access removed.';
      }

      addNotification(message, 'success');

      setShowArchiveModal(false);
      setMemberToArchive(null);
      fetchMembers();

    } catch (err) {
      console.error('Error archiving member:', err);
      addNotification(err instanceof Error ? err.message : 'Failed to archive member', 'error');
      setShowArchiveModal(false);
      setMemberToArchive(null);
    }
  };

  const handleMembershipFormSuccess = () => {
    // Don't show notification here - the individual modals handle their own notifications
    fetchMembers();
  };

  const handleInviteMemberClick = (member: Member) => {
    setMemberToInvite(member);
    setShowInviteConfirmModal(true);
  };

  const handleConfirmInvite = async () => {
    if (!memberToInvite || !currentClub?.clubId) return;

    setShowInviteConfirmModal(false);
    setInvitingMemberId(memberToInvite.id);

    const result = await sendMemberInvitation(memberToInvite.id, currentClub.clubId);

    if (result.success) {
      addNotification('Invitation sent successfully!', 'success');
      await fetchMemberInvitations();
    } else {
      addNotification(result.error || 'Failed to send invitation', 'error');
    }
    setInvitingMemberId(null);
    setMemberToInvite(null);
  };

  const handleViewInvitation = (memberId: string) => {
    const invitation = memberInvitations[memberId];
    if (invitation) {
      setSelectedInvitation({
        ...invitation,
        member: members.find(m => m.id === memberId)
      });
      setShowInvitationModal(true);
    }
  };

  const handleResendInvitation = async () => {
    if (!selectedInvitation || !currentClub?.clubId) return;

    setInvitingMemberId(selectedInvitation.member_id);
    const result = await sendMemberInvitation(selectedInvitation.member_id, currentClub.clubId);

    if (result.success) {
      addNotification('Invitation resent successfully!', 'success');
      await fetchMemberInvitations();
      setShowInvitationModal(false);
      setSelectedInvitation(null);
    } else {
      addNotification(result.error || 'Failed to resend invitation', 'error');
    }
    setInvitingMemberId(null);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-300">
                {error}
              </h3>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <p className="text-slate-400 text-sm">
            {filteredMembers.filter(m => m.is_financial).length} {filteredMembers.filter(m => m.is_financial).length === 1 ? 'Member' : 'Members'} Active
          </p>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {members.filter(m => m.user_id).length} Connected
            </span>
            {Object.keys(emailMatches).length > 0 && (
              <button
                onClick={handleAutoLinkAll}
                disabled={autoLinking}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                {autoLinking ? (
                  <div className="animate-spin h-3 w-3 border-2 border-amber-400 border-t-transparent rounded-full"></div>
                ) : (
                  <Zap size={12} />
                )}
                Link {Object.keys(emailMatches).length} Match{Object.keys(emailMatches).length === 1 ? '' : 'es'}
              </button>
            )}
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-slate-500"></span>
              {members.filter(m => !m.user_id && !emailMatches[m.id]).length} Unlinked
            </span>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="flex items-center gap-2">
            {showSearch && (
              <div className="relative w-80">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-200 placeholder-slate-400 rounded-lg transition-colors"
                />
              </div>
            )}

            {!showSearch && (
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                title="Search"
              >
                <Search size={18} />
              </button>
            )}

            {/* Map View Button */}
            <button
              onClick={() => setShowMapView(true)}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              title="Map View"
            >
              <MapIcon size={18} />
            </button>

            {/* Payment Reconciliation Button */}
            <button
              onClick={() => setShowPaymentReconciliation(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white transition-all shadow-lg hover:shadow-xl font-medium"
              title="Payment Reconciliation"
            >
              <DollarSign size={18} />
              <span className="hidden sm:inline">Payments</span>
            </button>

            {/* Import/Export Button */}
            <button
              onClick={() => setShowImportExportModal(true)}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              title="Import / Export Members"
            >
              <FileDown size={18} />
            </button>

            {/* Advanced Filter Button */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={() => setShowAdvancedFilter(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  hasActiveFilter
                    ? 'bg-blue-600 border-blue-500 hover:bg-blue-700 text-white'
                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-200'
                }`}
              >
                <Filter size={16} />
                {hasActiveFilter ? 'Filter Active' : 'Advanced Filters'}
                {hasActiveFilter && activeFilterPreset && (
                  <span className="text-xs bg-blue-500/20 px-2 py-0.5 rounded">
                    {activeFilterPreset.name}
                  </span>
                )}
              </button>

              {/* Quick actions for active filter */}
              {hasActiveFilter && (
                <div className="absolute right-0 mt-2 flex gap-2 z-50">
                  {!activeFilterPreset && (
                    <button
                      onClick={() => setShowSaveFilterModal(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors shadow-xl"
                      title="Save current filter"
                    >
                      <Save size={14} />
                      Save
                    </button>
                  )}
                  <button
                    onClick={handleClearFilter}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors shadow-xl"
                  >
                    <X size={14} />
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Saved Presets Dropdown */}
            {savedPresets.length > 0 && (
              <div className="flex gap-2">
                <select
                  value={activeFilterPreset?.id || ''}
                  onChange={(e) => {
                    const preset = savedPresets.find(p => p.id === e.target.value);
                    if (preset) handleLoadPreset(preset);
                    else handleClearFilter();
                  }}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
                >
                  <option value="">Load Saved Filter...</option>
                  {savedPresets.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} {preset.is_default ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowManageFiltersModal(true)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
                  title="Manage Filters"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}

            <button
              onClick={handleAddMember}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 font-medium transition-all shadow-lg hover:shadow-xl whitespace-nowrap"
            >
              <Plus size={20} strokeWidth={2.5} />
              Add Member
            </button>
          </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  <button
                    onClick={toggleSort}
                    className="flex items-center gap-2 hover:text-white transition-colors"
                  >
                    Member
                    <ArrowUpDown size={14} className="text-slate-400" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Contact</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Boats</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Dates</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading members...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No members found
                  </td>
                </tr>
              ) : (
                filteredMembers.map(member => {
                  const isExpired = !member.is_financial || 
                    (member.renewal_date && new Date(member.renewal_date) < new Date());
                  
                  return (
                    <tr
                      key={member.id}
                      onClick={() => handleEditMember(member.id)}
                      className="hover:bg-slate-700/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {(member as any).avatar_url ? (
                              <img
                                src={(member as any).avatar_url}
                                alt={`${member.first_name} ${member.last_name}`}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                                {member.first_name?.[0]}{member.last_name?.[0]}
                              </div>
                            )}
                            <div
                              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-800 ${
                                member.user_id
                                  ? 'bg-green-500'
                                  : emailMatches[member.id]
                                    ? 'bg-amber-500'
                                    : 'bg-slate-500'
                              }`}
                              title={
                                member.user_id
                                  ? 'Connected - has login account'
                                  : emailMatches[member.id]
                                    ? 'Match found - click to link'
                                    : 'Not connected'
                              }
                            />
                          </div>
                          <span className="text-white font-medium">
                            {member.first_name} {member.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {member.email && (
                            <div className="flex items-center gap-2 text-sm text-slate-300">
                              <Mail size={14} className="text-slate-400" />
                              {member.email}
                            </div>
                          )}
                          {member.phone && (
                            <div className="flex items-center gap-2 text-sm text-slate-300">
                              <Phone size={14} className="text-slate-400" />
                              {member.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                          {member.boats?.map((boat: any, index: number) => (
                            <span
                              key={index}
                              className="px-2 py-1 text-xs rounded-full bg-blue-900/30 text-blue-400 whitespace-nowrap"
                            >
                              {boat.boat_type} {boat.sail_number && `#${boat.sail_number}`}
                            </span>
                          ))}
                          {(!member.boats || member.boats.length === 0) && (
                            <span className="text-slate-500 text-sm">No boats</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const typeConfig = getMembershipTypeConfig(member.membership_level);
                          const IconComponent = typeConfig.icon;
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${typeConfig.color}`}>
                              <IconComponent size={12} className={typeConfig.iconColor} />
                              {typeConfig.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`
                            inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                            ${member.is_financial
                              ? 'bg-green-900/30 text-green-400'
                              : 'bg-red-900/30 text-red-400'}
                          `}>
                            {member.is_financial ? 'Financial' : 'Unfinancial'}
                          </span>
                          {(member as any).payment_status === 'pending' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowPaymentReconciliation(true);
                              }}
                              className="p-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 transition-colors animate-pulse"
                              title="Payment Pending - Click to Confirm"
                            >
                              <DollarSign size={14} />
                            </button>
                          )}
                          {/* Remittance Status Indicator */}
                          {member.is_financial && memberRemittanceStatus[member.id] === 'paid' && (
                            <div
                              className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400"
                              title="Paid to Association"
                            >
                              <CheckCircle2 size={14} />
                            </div>
                          )}
                          {member.is_financial && memberRemittanceStatus[member.id] === 'pending' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigateToRemittances?.();
                              }}
                              className="p-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 animate-pulse transition-colors cursor-pointer"
                              title="Pending Payment to Association - Click to view Remittances"
                            >
                              <ArrowUpRight size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-sm">
                          {member.date_joined && (
                            <div className="text-slate-400">
                              <span className="text-slate-500">Joined</span> {formatDate(member.date_joined)}
                            </div>
                          )}
                          {member.renewal_date && (
                            <div className="text-slate-400">
                              <span className="text-slate-500">Renewal</span> {formatDate(member.renewal_date)}
                            </div>
                          )}
                          {!member.date_joined && !member.renewal_date && (
                            <span className="text-slate-500">No dates set</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewMember(member.id);
                            }}
                            className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-900/30 transition-colors"
                            title="View member details"
                          >
                            <Eye size={16} />
                          </button>
                          {!member.user_id ? (
                            emailMatches[member.id] ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLinkSingleMember(member.id);
                                }}
                                disabled={linkingMemberId === member.id}
                                className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                                title="Account found - click to link"
                              >
                                {linkingMemberId === member.id ? (
                                  <div className="animate-spin h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full"></div>
                                ) : (
                                  <Link size={16} />
                                )}
                              </button>
                            ) : memberInvitations[member.id] && memberInvitations[member.id].status === 'pending' ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewInvitation(member.id);
                                }}
                                className="p-1.5 rounded-lg text-orange-400 hover:bg-orange-900/30 transition-colors"
                                title="Invitation pending"
                              >
                                <Clock size={16} />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInviteMemberClick(member);
                                }}
                                disabled={invitingMemberId === member.id}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                                title="Invite to register"
                              >
                                {invitingMemberId === member.id ? (
                                  <div className="animate-spin h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full"></div>
                                ) : (
                                  <Send size={16} />
                                )}
                              </button>
                            )
                          ) : (
                            <div
                              className="p-1.5 rounded-lg text-green-500 bg-green-900/20"
                              title="Connected - has login account"
                            >
                              <UserCheck size={16} />
                            </div>
                          )}
                          {isExpired && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenewMember(member.id);
                              }}
                              className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-900/30 transition-colors"
                              title="Renew membership"
                            >
                              <ChevronRight size={16} />
                            </button>
                          )}
                          {filterStatus === 'archived' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestoreMember(member.id);
                              }}
                              className="p-1.5 rounded-lg text-green-400 hover:bg-green-900/30 transition-colors"
                              title="Restore member"
                            >
                              <ArchiveRestore size={16} />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditMember(member.id);
                                }}
                                className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-900/30 transition-colors"
                                title="Edit member"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMember(member.id);
                                }}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
                                title="Archive member"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Membership Form Modal (for view/edit/renew existing members) */}
      <MembershipFormModal
        isOpen={showMembershipForm}
        onClose={() => setShowMembershipForm(false)}
        clubId={currentClub?.clubId || ''}
        isRenewal={isRenewal}
        existingMemberId={selectedMemberId}
        darkMode={darkMode}
        onSuccess={handleMembershipFormSuccess}
        readOnly={viewMode === 'view'}
      />
      
      {/* Admin Add Member Modal (for adding new members) */}
      <AdminAddMemberModal
        isOpen={showAdminAddMember}
        onClose={() => setShowAdminAddMember(false)}
        clubId={currentClub?.clubId || ''}
        darkMode={darkMode}
        onSuccess={handleMembershipFormSuccess}
        members={members}
      />

      {/* Member Edit Modal */}
      {selectedMemberId && (
        <MemberEditModal
          isOpen={showMemberEditModal}
          onClose={() => {
            setShowMemberEditModal(false);
            setSelectedMemberId(undefined);
          }}
          memberId={selectedMemberId}
          clubId={currentClub?.clubId || ''}
          darkMode={darkMode}
          onSuccess={handleMembershipFormSuccess}
        />
      )}

      {/* Payment Reconciliation Modal */}
      <PaymentReconciliationModal
        isOpen={showPaymentReconciliation}
        onClose={() => setShowPaymentReconciliation(false)}
        onUpdate={fetchMembers}
        clubId={currentClub?.clubId || ''}
        darkMode={darkMode}
      />

      {/* Import/Export Modal */}
      <MemberImportExportModal
        isOpen={showImportExportModal}
        onClose={() => setShowImportExportModal(false)}
        darkMode={darkMode}
        members={members}
        onImportComplete={fetchMembers}
        currentClubId={currentClub?.clubId || ''}
      />

      {/* Archive Member Modal */}
      <ArchiveMemberModal
        isOpen={showArchiveModal}
        onClose={() => {
          setShowArchiveModal(false);
          setMemberToArchive(null);
        }}
        onConfirm={handleConfirmArchive}
        member={memberToArchive}
        darkMode={darkMode}
      />

      {/* Invitation Details Modal */}
      {showInvitationModal && selectedInvitation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-2xl w-full">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">Invitation Details</h3>
                <button
                  onClick={() => {
                    setShowInvitationModal(false);
                    setSelectedInvitation(null);
                  }}
                  className="text-slate-400 hover:text-slate-300"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="text-sm font-medium text-slate-400">Member</label>
                <p className="text-white mt-1">
                  {selectedInvitation.member?.first_name} {selectedInvitation.member?.last_name}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Email</label>
                <p className="text-white mt-1">{selectedInvitation.email}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Status</label>
                <p className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    selectedInvitation.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
                    selectedInvitation.status === 'accepted' ? 'bg-green-900/30 text-green-400' :
                    selectedInvitation.status === 'expired' ? 'bg-red-900/30 text-red-400' :
                    'bg-gray-900/30 text-gray-400'
                  }`}>
                    {selectedInvitation.status.charAt(0).toUpperCase() + selectedInvitation.status.slice(1)}
                  </span>
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Sent</label>
                <p className="text-white mt-1">
                  {new Date(selectedInvitation.created_at).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Expires</label>
                <p className="text-white mt-1">
                  {new Date(selectedInvitation.expires_at).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Invitation Link</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/invite/${selectedInvitation.token}`}
                    className="flex-1 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/invite/${selectedInvitation.token}`);
                      addNotification('Invitation link copied!', 'success');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 flex justify-between">
              <button
                onClick={() => {
                  setShowInvitationModal(false);
                  setSelectedInvitation(null);
                }}
                className="px-4 py-2 text-slate-400 hover:text-slate-300"
              >
                Close
              </button>
              {selectedInvitation.status === 'pending' && (
                <button
                  onClick={handleResendInvitation}
                  disabled={invitingMemberId === selectedInvitation.member_id}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {invitingMemberId === selectedInvitation.member_id ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <MailOpen size={16} />
                  )}
                  Resend Invitation
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Confirmation Modal */}
      {showInviteConfirmModal && memberToInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Invite Member to AlfiePRO</h3>
              <p className="text-slate-300 mb-6">
                Are you sure you wish to invite <span className="font-semibold text-white">{memberToInvite.first_name} {memberToInvite.last_name}</span> to AlfiePRO?
              </p>
              <p className="text-slate-400 text-sm mb-6">
                This will trigger an email invitation to <span className="text-white">{memberToInvite.email}</span>.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowInviteConfirmModal(false);
                    setMemberToInvite(null);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmInvite}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Send Invitation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members Map View */}
      {showMapView && (
        <MembersMapView
          members={filteredMembers}
          darkMode={darkMode}
          onClose={() => setShowMapView(false)}
          onMemberClick={(member) => {
            setShowMapView(false);
            handleViewMember(member.id);
          }}
        />
      )}

      {/* Advanced Member Filter Modal */}
      <AdvancedMemberFilter
        isOpen={showAdvancedFilter}
        onClose={() => setShowAdvancedFilter(false)}
        onApply={handleApplyFilter}
        initialConfig={filterConfig}
        members={members}
        boatClasses={boatClasses}
        darkMode={darkMode}
      />

      {/* Save Filter Modal */}
      <SaveFilterModal
        isOpen={showSaveFilterModal}
        onClose={() => setShowSaveFilterModal(false)}
        onSave={handleSaveFilterSuccess}
        filterConfig={filterConfig}
        clubId={currentClub?.clubId || ''}
        darkMode={darkMode}
      />

      {/* Manage Filters Modal */}
      <ManageFiltersModal
        isOpen={showManageFiltersModal}
        onClose={() => setShowManageFiltersModal(false)}
        presets={savedPresets}
        onPresetsChanged={fetchFilterPresets}
        onLoadPreset={handleLoadPreset}
        darkMode={darkMode}
      />
    </div>
  );
};
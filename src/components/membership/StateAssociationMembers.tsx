import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Users, Search, Download, Mail, Phone, Building2, CheckCircle2, ArrowUpRight, Filter, Save, FolderOpen, Upload, Trash2, UserPlus, DollarSign, ChevronDown, X, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import Papa from 'papaparse';
import { AdvancedMemberFilter } from './AdvancedMemberFilter';
import { MemberFilterConfig } from '../../types/memberFilters';
import { filterMembers as applyMemberFilters } from '../../utils/memberFilters';
import { ManageFiltersModal } from './ManageFiltersModal';
import { SaveFilterModal } from './SaveFilterModal';
import AssociationMemberImportModal from './AssociationMemberImportModal';
import { MemberEditModal } from './MemberEditModal';

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
}

export const StateAssociationMembers: React.FC<StateAssociationMembersProps> = ({
  darkMode,
  stateAssociationId: propStateAssociationId
}) => {
  const { user, currentOrganization } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberWithClub[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<MemberWithClub[]>([]);
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
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkClubId, setBulkClubId] = useState('');
  const [bulkMembershipTypeId, setBulkMembershipTypeId] = useState('');
  const [bulkFinancialStatus, setBulkFinancialStatus] = useState<'financial' | 'unfinancial' | ''>('');
  const [clubMembershipTypes, setClubMembershipTypes] = useState<any[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

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
  }, [members, searchTerm, selectedClub, selectedStatus, advancedFilterConfig]);

  useEffect(() => {
    if (bulkClubId) {
      loadMembershipTypesForClub(bulkClubId);
    } else {
      setClubMembershipTypes([]);
      setBulkMembershipTypeId('');
    }
  }, [bulkClubId]);

  const loadMembershipTypesForClub = async (clubId: string) => {
    const { data } = await supabase
      .from('membership_types')
      .select('id, name, amount')
      .eq('club_id', clubId)
      .order('name');
    setClubMembershipTypes(data || []);
  };

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
          .select('id, first_name, last_name, email, phone, membership_level, is_financial, date_joined, renewal_date, club_id, avatar_url, membership_status')
          .in('club_id', clubIds)
          .order('last_name');
        clubMembers = clubMembersData || [];
      }

      const { data: assocMembersData } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone, membership_level, is_financial, date_joined, renewal_date, club_id, avatar_url, membership_status')
        .eq('state_association_id', stateId)
        .order('last_name');

      const allMemberIds = new Set<string>();
      const allMembers: any[] = [];
      for (const m of [...clubMembers, ...(assocMembersData || [])]) {
        if (!allMemberIds.has(m.id)) {
          allMemberIds.add(m.id);
          allMembers.push(m);
        }
      }
      allMembers.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

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
    } catch (err: any) {
      console.error('Error loading state association data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
      }
    }
    setFilteredMembers(filtered);
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
    if (selectedMemberIds.size === filteredMembers.length) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(filteredMembers.map(m => m.id)));
    }
  };

  const handleBulkAssignClub = async () => {
    if (!bulkClubId || selectedMemberIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const selectedClubObj = clubs.find(c => c.id === bulkClubId);
      const selectedTypeObj = clubMembershipTypes.find(t => t.id === bulkMembershipTypeId);
      const updateData: Record<string, any> = {
        club_id: bulkClubId,
        club: selectedClubObj?.name || ''
      };
      if (selectedTypeObj) updateData.membership_level = selectedTypeObj.name;
      if (bulkFinancialStatus === 'financial') updateData.is_financial = true;
      else if (bulkFinancialStatus === 'unfinancial') updateData.is_financial = false;

      const ids = Array.from(selectedMemberIds);
      const { error } = await supabase
        .from('members')
        .update(updateData)
        .in('id', ids);
      if (error) throw error;

      setSelectedMemberIds(new Set());
      setShowBulkAssign(false);
      setBulkClubId('');
      setBulkMembershipTypeId('');
      setBulkFinancialStatus('');
      loadStateAssociationData();
    } catch (err) {
      console.error('Error bulk assigning:', err);
      alert('Failed to assign members. Please try again.');
    }
    setBulkProcessing(false);
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

  const exportToCSV = () => {
    const csvData = filteredMembers.map((m) => ({
      'First Name': m.first_name,
      'Last Name': m.last_name,
      'Email': m.email,
      'Phone': m.phone,
      'Club': m.club_name || 'Unassigned',
      'Membership Level': m.membership_level,
      'Financial Status': m.is_financial ? 'Financial' : 'Unfinancial',
      'Date Joined': m.date_joined ? formatDate(m.date_joined) : '',
      'Renewal Date': m.renewal_date ? formatDate(m.renewal_date) : '',
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

  const stats = {
    totalMembers: members.length,
    financialMembers: members.filter((m) => m.is_financial).length,
    totalClubs: clubs.length,
    filteredCount: filteredMembers.length
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} p-8`}>
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
          <p>Error loading members: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto`}>
      <div className="p-4 sm:p-8 lg:p-16">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <Users className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Members</h1>
              <p className="text-sm text-slate-400">
                {stats.totalMembers} total members across {stats.totalClubs} clubs
                {unassignedCount > 0 && <span className="text-amber-400 ml-2">({unassignedCount} unassigned)</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="p-6 rounded-xl border backdrop-blur-sm bg-slate-800/30 border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                <Users className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Members</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.totalMembers}</p>
              </div>
            </div>
          </div>
          <div className="p-6 rounded-xl border backdrop-blur-sm bg-slate-800/30 border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                <CheckCircle2 className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Financial Members</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.financialMembers}</p>
              </div>
            </div>
          </div>
          <div className="p-6 rounded-xl border backdrop-blur-sm bg-slate-800/30 border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600">
                <Building2 className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Member Clubs</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.totalClubs}</p>
              </div>
            </div>
          </div>
          <div className="p-6 rounded-xl border backdrop-blur-sm bg-slate-800/30 border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
                <Search className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Filtered Results</p>
                <p className="text-3xl font-bold text-white mt-1">{stats.filteredCount}</p>
              </div>
            </div>
          </div>
        </div>

        {selectedMemberIds.size > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-blue-600/10 border border-blue-500/30">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <span className="text-sm text-blue-300 font-medium">
                {selectedMemberIds.size} member{selectedMemberIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowBulkAssign(!showBulkAssign)}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  <UserPlus size={15} />
                  Assign to Club
                </button>
                <button
                  onClick={() => handleBulkSetFinancial(true)}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  <DollarSign size={15} />
                  Set Financial
                </button>
                <button
                  onClick={() => handleBulkSetFinancial(false)}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  <DollarSign size={15} />
                  Set Unfinancial
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedMemberIds(new Set())}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition"
                >
                  <X size={15} />
                  Clear
                </button>
              </div>
            </div>
            {showBulkAssign && (
              <div className="mt-4 pt-4 border-t border-blue-500/20">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Club</label>
                    <select
                      value={bulkClubId}
                      onChange={(e) => setBulkClubId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm"
                    >
                      <option value="">Select Club...</option>
                      {clubs.map(c => (
                        <option key={c.id} value={c.id}>{c.abbreviation ? `${c.abbreviation} - ${c.name}` : c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Membership Type</label>
                    <select
                      value={bulkMembershipTypeId}
                      onChange={(e) => setBulkMembershipTypeId(e.target.value)}
                      disabled={!bulkClubId}
                      className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm disabled:opacity-50"
                    >
                      <option value="">Select Type...</option>
                      {clubMembershipTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.name}{t.amount ? ` ($${t.amount})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Financial Status</label>
                    <select
                      value={bulkFinancialStatus}
                      onChange={(e) => setBulkFinancialStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm"
                    >
                      <option value="">No Change</option>
                      <option value="financial">Financial</option>
                      <option value="unfinancial">Unfinancial</option>
                    </select>
                  </div>
                  <button
                    onClick={handleBulkAssignClub}
                    disabled={!bulkClubId || bulkProcessing}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50"
                  >
                    {bulkProcessing ? 'Applying...' : 'Apply'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="p-6 rounded-xl border backdrop-blur-sm mb-6 bg-slate-800/30 border-slate-700/50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border bg-slate-700/50 border-slate-600/50 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <select
              value={selectedClub}
              onChange={(e) => setSelectedClub(e.target.value)}
              className="px-4 py-2 rounded-lg border bg-slate-700/50 border-slate-600/50 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">All Clubs</option>
              <option value="unassigned">Unassigned ({unassignedCount})</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.abbreviation ? `${club.abbreviation} - ${club.name}` : club.name}
                </option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2 rounded-lg border bg-slate-700/50 border-slate-600/50 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="all">All Status</option>
              <option value="financial">Financial</option>
              <option value="unfinancial">Unfinancial</option>
            </select>
          </div>

          <div className="flex justify-between items-center gap-3 mt-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdvancedFilter(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  advancedFilterConfig
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                } transition-colors`}
              >
                <Filter size={18} />
                Advanced Filter
                {advancedFilterConfig && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-medium">Active</span>
                )}
              </button>
              {advancedFilterConfig && (
                <>
                  <button
                    onClick={() => setShowSaveFilter(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                  >
                    <Save size={18} />
                    Save Filter
                  </button>
                  <button
                    onClick={() => setAdvancedFilterConfig(null)}
                    className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                  >
                    Clear Filter
                  </button>
                </>
              )}
              <button
                onClick={() => setShowManageFilters(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                <FolderOpen size={18} />
                Saved Filters
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                <Upload size={18} />
                Import Members
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <Download size={18} />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={filteredMembers.length > 0 && selectedMemberIds.size === filteredMembers.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Member</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Club</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Contact</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Membership</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Financial Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Dates</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-300 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      No members found
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className={`hover:bg-slate-700/30 ${selectedMemberIds.has(member.id) ? 'bg-blue-900/20' : ''}`}>
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.has(member.id)}
                          onChange={() => toggleMemberSelection(member.id)}
                          className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                              {member.first_name?.[0]}{member.last_name?.[0]}
                            </div>
                          )}
                          <span className="text-white font-medium">{member.first_name} {member.last_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {member.club_id ? (
                          <div className="flex items-center gap-2">
                            <Building2 size={16} className="text-slate-400" />
                            <span className="text-sm text-slate-300">{member.club_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                            Unassigned
                          </span>
                        )}
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
                        <span className="text-sm text-slate-300">{member.membership_level || 'Standard'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            member.is_financial ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                          }`}>
                            {member.is_financial ? 'Financial' : 'Unfinancial'}
                          </span>
                          {member.is_financial && memberRemittanceStatus[member.id]?.statePaid && (
                            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400" title="State Paid">
                              <CheckCircle2 size={14} />
                            </div>
                          )}
                          {member.is_financial && !memberRemittanceStatus[member.id]?.statePaid && memberRemittanceStatus[member.id] && (
                            <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400 animate-pulse" title="State Pending">
                              <ArrowUpRight size={14} />
                            </div>
                          )}
                          {member.is_financial && memberRemittanceStatus[member.id]?.nationalPaid && (
                            <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400" title="National Paid">
                              <CheckCircle2 size={14} />
                            </div>
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
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => {
                            setEditingMemberId(member.id);
                            setEditingMemberClubId(member.club_id || '');
                          }}
                          className="p-2 rounded-lg hover:bg-slate-600/50 text-slate-400 hover:text-white transition"
                          title="Edit member"
                        >
                          <Pencil size={16} />
                        </button>
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
        memberCount={filteredMembers.length}
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
    </div>
  );
};

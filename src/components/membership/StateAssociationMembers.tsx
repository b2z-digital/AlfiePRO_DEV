import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Users, Search, Download, Mail, Phone, Building2, Calendar, CheckCircle2, ArrowUpRight, Filter, Save, FolderOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import Papa from 'papaparse';
import { AdvancedMemberFilter } from './AdvancedMemberFilter';
import { MemberFilterConfig } from '../../types/memberFilters';
import { filterMembers as applyMemberFilters } from '../../utils/memberFilters';
import { ManageFiltersModal } from './ManageFiltersModal';
import { SaveFilterModal } from './SaveFilterModal';

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
  state_association_name: string;
  avatar_url?: string;
}

export const StateAssociationMembers: React.FC<StateAssociationMembersProps> = ({
  darkMode,
  stateAssociationId: propStateAssociationId
}) => {
  const { user } = useAuth();
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

  // Check for viewClubId in location state
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

      console.log('Loading data for state association:', stateId);

      // Load clubs under this state association
      const { data: clubsData, error: clubsError } = await supabase
        .from('clubs')
        .select('id, name')
        .eq('state_association_id', stateId)
        .order('name');

      if (clubsError) {
        console.error('Error loading clubs:', clubsError);
        throw clubsError;
      }

      console.log('Loaded clubs:', clubsData);
      setClubs(clubsData || []);

      // Load all members from clubs under this state association
      const clubIds = (clubsData || []).map(c => c.id);

      if (clubIds.length === 0) {
        console.log('No clubs found for this state association');
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
          avatar_url
        `)
        .in('club_id', clubIds)
        .eq('membership_status', 'active')
        .order('last_name');

      if (membersError) {
        console.error('Error loading members:', membersError);
        throw membersError;
      }

      console.log('Loaded members:', membersData?.length || 0);

      const formattedMembers = (membersData || []).map((m: any) => {
        const club = clubsData?.find(c => c.id === m.club_id);
        return {
          ...m,
          club_name: club?.name || 'Unknown Club',
          state_association_name: 'State Association'
        };
      });

      setMembers(formattedMembers);

      // Fetch remittance statuses for all members
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

    // Apply advanced filter first if configured
    if (advancedFilterConfig) {
      filtered = applyMemberFilters(filtered, advancedFilterConfig);
    }

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.first_name.toLowerCase().includes(searchLower) ||
          m.last_name.toLowerCase().includes(searchLower) ||
          m.email.toLowerCase().includes(searchLower) ||
          m.club_name.toLowerCase().includes(searchLower)
      );
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
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <Users className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                Members
              </h1>
              <p className="text-sm text-slate-400">
                {stats.totalMembers} total members across {stats.totalClubs} clubs
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className={`p-6 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                <Users className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Members</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stats.totalMembers}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
                <CheckCircle2 className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Financial Members</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stats.financialMembers}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600">
                <Building2 className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Member Clubs</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stats.totalClubs}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
                <Search className="text-white" size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Filtered Results</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stats.filteredCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className={`p-6 rounded-xl border backdrop-blur-sm mb-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600/50 text-white placeholder-slate-400'
                      : 'bg-white/50 border-slate-300/50 text-gray-900 placeholder-slate-400'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                />
              </div>
            </div>

            <select
              value={selectedClub}
              onChange={(e) => setSelectedClub(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700/50 border-slate-600/50 text-white'
                  : 'bg-white/50 border-slate-300/50 text-gray-900'
              } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
            >
              <option value="all">All Clubs</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700/50 border-slate-600/50 text-white'
                  : 'bg-white/50 border-slate-300/50 text-gray-900'
              } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
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
                  : darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-gray-900'
              } transition-colors`}
            >
              <Filter size={18} />
              Advanced Filter
              {advancedFilterConfig && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-medium">
                  Active
                </span>
              )}
            </button>

            {advancedFilterConfig && (
              <>
                <button
                  onClick={() => setShowSaveFilter(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-slate-200 hover:bg-slate-300 text-gray-900'
                  } transition-colors`}
                >
                  <Save size={18} />
                  Save Filter
                </button>

                <button
                  onClick={() => setAdvancedFilterConfig(null)}
                  className={`px-4 py-2 rounded-lg ${
                    darkMode
                      ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                      : 'bg-red-100 hover:bg-red-200 text-red-600'
                  } transition-colors`}
                >
                  Clear Filter
                </button>
              </>
            )}

            <button
              onClick={() => setShowManageFilters(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-gray-900'
              } transition-colors`}
            >
              <FolderOpen size={18} />
              Saved Filters
            </button>
          </div>

          <button
            onClick={exportToCSV}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              darkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            } transition-colors`}
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Member
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Club
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Membership
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Financial Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Dates
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No members found
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={`${member.first_name} ${member.last_name}`}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                            {member.first_name?.[0]}{member.last_name?.[0]}
                          </div>
                        )}
                        <span className="text-white font-medium">
                          {member.first_name} {member.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-300">
                          {member.club_name}
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
                      <span className="text-sm text-slate-300">
                        {member.membership_level || 'Standard'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          member.is_financial
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-red-900/30 text-red-400'
                        }`}>
                          {member.is_financial ? 'Financial' : 'Unfinancial'}
                        </span>
                        {/* State Remittance Status */}
                        {member.is_financial && memberRemittanceStatus[member.id]?.statePaid && (
                          <div
                            className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400"
                            title="State Paid"
                          >
                            <CheckCircle2 size={14} />
                          </div>
                        )}
                        {member.is_financial && !memberRemittanceStatus[member.id]?.statePaid && memberRemittanceStatus[member.id] && (
                          <div
                            className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400 animate-pulse"
                            title="State Pending"
                          >
                            <ArrowUpRight size={14} />
                          </div>
                        )}
                        {/* National Remittance Status */}
                        {member.is_financial && memberRemittanceStatus[member.id]?.nationalPaid && (
                          <div
                            className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400"
                            title="National Paid"
                          >
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Advanced Filter Modal */}
      <AdvancedMemberFilter
        isOpen={showAdvancedFilter}
        onClose={() => setShowAdvancedFilter(false)}
        onApply={(config) => setAdvancedFilterConfig(config)}
        initialConfig={advancedFilterConfig || undefined}
        boatClasses={boatClasses}
        memberCount={filteredMembers.length}
        darkMode={darkMode}
      />

      {/* Save Filter Modal */}
      {showSaveFilter && advancedFilterConfig && (
        <SaveFilterModal
          isOpen={showSaveFilter}
          onClose={() => setShowSaveFilter(false)}
          filterConfig={advancedFilterConfig}
          darkMode={darkMode}
        />
      )}

      {/* Manage Filters Modal */}
      <ManageFiltersModal
        isOpen={showManageFilters}
        onClose={() => setShowManageFilters(false)}
        onLoadFilter={(config) => {
          setAdvancedFilterConfig(config);
          setShowManageFilters(false);
        }}
        darkMode={darkMode}
      />
    </div>
  );
};

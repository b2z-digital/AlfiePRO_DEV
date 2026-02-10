import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Users, Search, Download, Mail, Phone, Building2, Calendar, CheckCircle2, ArrowUpRight, MapPin, Upload } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import Papa from 'papaparse';
import AssociationMemberImportModal from './AssociationMemberImportModal';

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
}

export const NationalAssociationMembers: React.FC<NationalAssociationMembersProps> = ({ darkMode }) => {
  const { user, currentOrganization } = useAuth();
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

  // Check for viewClubId in location state
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
          avatar_url
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
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} p-8`}>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className={`p-3 rounded-xl ${darkMode ? 'bg-blue-600' : 'bg-blue-500'}`}>
            <Users className="text-white" size={28} />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Members
            </h1>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {stats.totalMembers} total members across {stats.totalStates} state associations and {stats.totalClubs} clubs
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Members</p>
              <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
                {stats.totalMembers}
              </p>
            </div>
            <Users className={`${darkMode ? 'text-blue-400' : 'text-blue-500'}`} size={32} />
          </div>
        </div>

        <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Financial</p>
              <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
                {stats.financialMembers}
              </p>
            </div>
            <Users className="text-green-500" size={32} />
          </div>
        </div>

        <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>State Assocs</p>
              <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
                {stats.totalStates}
              </p>
            </div>
            <MapPin className={`${darkMode ? 'text-purple-400' : 'text-purple-500'}`} size={32} />
          </div>
        </div>

        <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Member Clubs</p>
              <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
                {stats.totalClubs}
              </p>
            </div>
            <Building2 className={`${darkMode ? 'text-indigo-400' : 'text-indigo-500'}`} size={32} />
          </div>
        </div>

        <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Filtered</p>
              <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mt-2`}>
                {stats.filteredCount}
              </p>
            </div>
            <Search className={`${darkMode ? 'text-orange-400' : 'text-orange-500'}`} size={32} />
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${darkMode ? 'border-gray-700' : 'border-gray-200'} mb-6`}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} size={20} />
              <input
                type="text"
                placeholder="Search members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>
          </div>

          <select
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedClub('all');
            }}
            className={`px-4 py-2 rounded-lg border ${
              darkMode
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          >
            <option value="all">All States</option>
            {stateAssociations.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </select>

          <select
            value={selectedClub}
            onChange={(e) => setSelectedClub(e.target.value)}
            className={`px-4 py-2 rounded-lg border ${
              darkMode
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          >
            <option value="all">All Clubs</option>
            {availableClubs.map((club) => (
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
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          >
            <option value="all">All Status</option>
            <option value="financial">Financial</option>
            <option value="unfinancial">Unfinancial</option>
          </select>
        </div>

        <div className="flex justify-end mt-4 gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              darkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-gray-900'
            } transition-colors`}
          >
            <Upload size={18} />
            Import Members
          </button>
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
                  State
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Club
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Contact
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
                        <MapPin size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-300">
                          {member.state_association_name}
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
    </div>
  );
};

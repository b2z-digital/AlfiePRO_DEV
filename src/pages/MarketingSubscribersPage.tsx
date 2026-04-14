import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Upload, Download, Search, MoreVertical, Edit, Trash2, X, Mail, MailX, UserPlus } from 'lucide-react';
import Papa from 'papaparse';
import { ImportListMembersModal } from '../components/marketing/ImportListMembersModal';
import {
  getMarketingSubscriberLists,
  createMarketingSubscriberList,
  deleteMarketingSubscriberList,
  getListMembers,
  updateListMember,
  removeListMember,
  updateMemberMarketingPreference,
  getBulkMemberMarketingPreferences,
  addListMembers,
  ensureClubMembersList
} from '../utils/marketingStorage';
import { getStoredMembers } from '../utils/storage';
import { Avatar } from '../components/ui/Avatar';
import type { MarketingSubscriberList, MarketingListMember } from '../types/marketing';
import type { Member } from '../types/member';

interface MarketingSubscribersPageProps {
  darkMode?: boolean;
}

export default function MarketingSubscribersPage({ darkMode = true }: MarketingSubscribersPageProps) {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<MarketingSubscriberList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [showViewMembersModal, setShowViewMembersModal] = useState(false);
  const [selectedList, setSelectedList] = useState<MarketingSubscriberList | null>(null);
  const [listMembers, setListMembers] = useState<MarketingListMember[]>([]);
  const [clubMembers, setClubMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showListMenu, setShowListMenu] = useState<string | null>(null);
  const [memberEmailPreferences, setMemberEmailPreferences] = useState<Record<string, boolean>>({});
  const [updatingPreference, setUpdatingPreference] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [addContactEmail, setAddContactEmail] = useState('');
  const [addContactFirstName, setAddContactFirstName] = useState('');
  const [addContactLastName, setAddContactLastName] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [addContactError, setAddContactError] = useState('');

  useEffect(() => {
    loadLists();
  }, [currentClub]);

  useEffect(() => {
    // Close dropdown when clicking outside
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.list-menu-container')) {
        setShowListMenu(null);
      }
    }

    if (showListMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showListMenu]);

  async function loadLists() {
    if (!currentClub) return;

    try {
      setLoading(true);
      await ensureClubMembersList(currentClub.clubId);
      const data = await getMarketingSubscriberLists(currentClub.clubId);
      setLists(data);
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateList() {
    if (!currentClub || !newListName.trim()) return;

    try {
      await createMarketingSubscriberList({
        name: newListName,
        description: newListDescription || null,
        club_id: currentClub.clubId,
        list_type: 'custom'
      });

      setNewListName('');
      setNewListDescription('');
      setShowCreateModal(false);
      loadLists();
    } catch (error) {
      console.error('Error creating list:', error);
      alert('Failed to create list');
    }
  }

  async function handleDeleteList(id: string, listType: string) {
    // Prevent deleting the All Members list
    if (listType === 'all_members') {
      alert('Cannot delete the Club Members list');
      return;
    }

    if (!confirm('Are you sure you want to delete this list?')) return;

    try {
      await deleteMarketingSubscriberList(id);
      setLists(lists.filter(l => l.id !== id));
      setShowListMenu(null);
    } catch (error) {
      console.error('Error deleting list:', error);
      alert('Failed to delete list');
    }
  }

  async function handleViewMembers(list: MarketingSubscriberList) {
    setSelectedList(list);
    setShowViewMembersModal(true);
    setLoadingMembers(true);

    try {
      if (list.list_type === 'all_members') {
        // Load actual club members for the All Members list
        const members = await getStoredMembers();
        setClubMembers(members);
        setListMembers([]);

        // Load email preferences for all members (non-blocking)
        try {
          const emails = members.map(m => m.email).filter(Boolean) as string[];
          if (emails.length > 0) {
            const prefs = await getBulkMemberMarketingPreferences(emails);
            setMemberEmailPreferences(prefs);
          }
        } catch (prefError) {
          console.warn('Could not load email preferences:', prefError);
          // Continue without preferences - not critical
        }
      } else {
        // Load list members for custom lists
        const members = await getListMembers(list.id);
        setListMembers(members);
        setClubMembers([]);

        // Load email preferences for list members (non-blocking)
        try {
          const emails = members.map(m => m.email).filter(Boolean) as string[];
          if (emails.length > 0) {
            const prefs = await getBulkMemberMarketingPreferences(emails);
            setMemberEmailPreferences(prefs);
          }
        } catch (prefError) {
          console.warn('Could not load email preferences:', prefError);
          // Continue without preferences - not critical
        }
      }
    } catch (error) {
      console.error('Error loading members:', error);
      alert('Failed to load members. Please try again.');
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleToggleMemberEmailNotifications(memberEmail: string, currentlyUnsubscribed: boolean) {
    if (!memberEmail) return;

    setUpdatingPreference(memberEmail);
    try {
      // Toggle the unsubscribed state
      const newUnsubscribedState = !currentlyUnsubscribed;
      await updateMemberMarketingPreference(memberEmail, newUnsubscribedState);

      // Update local state
      setMemberEmailPreferences(prev => ({
        ...prev,
        [memberEmail]: newUnsubscribedState
      }));
    } catch (error) {
      console.error('Error updating preference:', error);
      alert('Failed to update email notification preference');
    } finally {
      setUpdatingPreference(null);
    }
  }

  async function handleRemoveMemberFromList(listMemberId: string) {
    if (!confirm('Remove this member from the list?')) return;

    try {
      await removeListMember(listMemberId);
      setListMembers(listMembers.filter(m => m.id !== listMemberId));
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    }
  }

  async function handleExportList(list: MarketingSubscriberList) {
    try {
      let csvData: any[] = [];

      if (list.list_type === 'all_members') {
        const members = await getStoredMembers();
        csvData = members.map(m => ({
          'First Name': m.firstName || '',
          'Last Name': m.lastName || '',
          'Email': m.email || '',
          'Phone': m.phone || '',
          'Membership Level': m.membership_level || ''
        }));
      } else {
        const members = await getListMembers(list.id);
        csvData = members.map(m => ({
          'First Name': m.first_name || '',
          'Last Name': m.last_name || '',
          'Email': m.email,
          'Status': m.status
        }));
      }

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${getDisplayName(list)}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting list:', error);
      alert('Failed to export list');
    }
    setShowListMenu(null);
  }

  async function handleImportMembers(members: Partial<MarketingListMember>[]) {
    await addListMembers(members);
    setShowImportModal(false);
    if (selectedList) {
      await handleViewMembers(selectedList);
    }
    loadLists();
  }

  async function handleAddContact() {
    if (!addContactEmail.trim() || !selectedList) return;
    setAddingContact(true);
    setAddContactError('');
    try {
      await addListMembers([{
        list_id: selectedList.id,
        email: addContactEmail.trim().toLowerCase(),
        first_name: addContactFirstName.trim() || undefined,
        last_name: addContactLastName.trim() || undefined,
        status: 'subscribed',
        source: 'manual',
      }]);
      setAddContactEmail('');
      setAddContactFirstName('');
      setAddContactLastName('');
      setShowAddContactModal(false);
      await handleViewMembers(selectedList);
      loadLists();
    } catch (err: any) {
      setAddContactError(err?.message || 'Failed to add contact');
    } finally {
      setAddingContact(false);
    }
  }

  function getDisplayName(list: MarketingSubscriberList) {
    return list.list_type === 'all_members' ? 'Club Members' : list.name;
  }

  const filteredMembers = listMembers.filter(member =>
    member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredClubMembers = clubMembers.filter(member =>
    member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-16 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Subscriber Lists
            </h1>
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
              Manage your email subscriber lists
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            New List
          </button>
          <button
            onClick={() => navigate('/marketing')}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="Back to Marketing"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Lists Grid */}
      {lists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lists.map((list) => (
            <div
              key={list.id}
              className={`rounded-xl p-6 transition-shadow relative ${
                darkMode
                  ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 hover:bg-slate-800/70'
                  : 'bg-white shadow-sm border border-gray-200 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                    {getDisplayName(list)}
                  </h3>
                  {list.description && (
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      {list.description}
                    </p>
                  )}
                </div>
                <div className="relative list-menu-container">
                  <button
                    onClick={() => setShowListMenu(showListMenu === list.id ? null : list.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-gray-100'
                    }`}
                  >
                    <MoreVertical className={`w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {showListMenu === list.id && (
                    <div
                      className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg z-10 py-1 list-menu-container ${
                        darkMode
                          ? 'bg-slate-800 border border-slate-700'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => {
                          handleExportList(list);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                          darkMode
                            ? 'text-slate-300 hover:bg-slate-700/50'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Download className="w-4 h-4" />
                        Export to CSV
                      </button>
                      {list.list_type !== 'all_members' && (
                        <>
                          <button
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                              darkMode
                                ? 'text-slate-300 hover:bg-slate-700/50'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <Edit className="w-4 h-4" />
                            Edit List
                          </button>
                          <button
                            onClick={() => handleDeleteList(list.id, list.list_type || 'custom')}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                              darkMode
                                ? 'text-red-400 hover:bg-slate-700/50'
                                : 'text-red-600 hover:bg-gray-50'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete List
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  <span className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                    {list.total_contacts}
                  </span>
                  <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>total contacts</span>
                </div>
                <div className="flex items-center gap-2 ml-7">
                  <Mail className="w-4 h-4 text-green-500" />
                  <span className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>
                    {list.active_subscriber_count}
                  </span>
                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>active subscribers</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleViewMembers(list)}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                    darkMode
                      ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  View Members
                </button>
                <button
                  onClick={() => handleExportList(list)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                  title="Export to CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl p-12 text-center ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <Users className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
          <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
            No subscriber lists yet
          </h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            Create your first list to start building your audience
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create List
          </button>
        </div>
      )}

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl max-w-md w-full p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Create Subscriber List
            </h2>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  List Name
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Event Registrants"
                  className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Description (Optional)
                </label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="Describe this list..."
                  rows={3}
                  className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewListName('');
                  setNewListDescription('');
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Members Modal */}
      {showViewMembersModal && selectedList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              darkMode ? 'border-slate-700' : 'border-gray-200'
            }`}>
              <div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  {getDisplayName(selectedList)}
                </h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  {selectedList.list_type === 'all_members' ? clubMembers.length : listMembers.length} members
                </p>
              </div>
              <button
                onClick={() => {
                  setShowViewMembersModal(false);
                  setSelectedList(null);
                  setSearchQuery('');
                }}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Bar and Import Button */}
            <div className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${
                    darkMode ? 'text-slate-400' : 'text-gray-400'
                  }`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search members..."
                    className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>
                {selectedList && selectedList.list_type !== 'all_members' && (
                  <>
                    <button
                      onClick={() => {
                        setAddContactEmail('');
                        setAddContactFirstName('');
                        setAddContactLastName('');
                        setAddContactError('');
                        setShowAddContactModal(true);
                      }}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        darkMode
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      <UserPlus className="w-4 h-4" />
                      Add Contact
                    </button>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        darkMode
                          ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      Import
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Members List */}
            <div className="flex-1 overflow-auto px-6 pb-6">
              {loadingMembers ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : selectedList.list_type === 'all_members' ? (
                <div className="space-y-2">
                  {filteredClubMembers.map((member) => {
                    const isUnsubscribed = memberEmailPreferences[member.email || ''] || false;
                    const isUpdating = updatingPreference === member.email;

                    return (
                      <div
                        key={member.id}
                        className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                          darkMode
                            ? 'bg-slate-900/50 hover:bg-slate-900/70'
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Avatar
                            firstName={member.firstName}
                            lastName={member.lastName}
                            src={member.avatar_url}
                            size="md"
                          />
                          <div className="flex-1">
                            <div className={`font-medium ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                              {member.firstName} {member.lastName}
                            </div>
                            <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                              {member.email}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleMemberEmailNotifications(member.email || '', isUnsubscribed)}
                            disabled={isUpdating || !member.email}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 ${
                              isUnsubscribed
                                ? darkMode
                                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                                : darkMode
                                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                            title={isUnsubscribed ? 'Email notifications disabled' : 'Email notifications enabled'}
                          >
                            {isUnsubscribed ? <MailX className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                            {isUnsubscribed ? 'Disabled' : 'Enabled'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMembers.map((member) => {
                    const isUnsubscribed = memberEmailPreferences[member.email] || false;
                    const isUpdating = updatingPreference === member.email;

                    return (
                      <div
                        key={member.id}
                        className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                          darkMode
                            ? 'bg-slate-900/50 hover:bg-slate-900/70'
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Avatar
                            firstName={member.first_name}
                            lastName={member.last_name}
                            size="md"
                          />
                          <div className="flex-1">
                            <div className={`font-medium ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                              {member.first_name} {member.last_name}
                            </div>
                            <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                              {member.email}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleMemberEmailNotifications(member.email, isUnsubscribed)}
                            disabled={isUpdating}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 ${
                              isUnsubscribed
                                ? darkMode
                                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                                : darkMode
                                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                            title={isUnsubscribed ? 'Email notifications disabled' : 'Email notifications enabled'}
                          >
                            {isUnsubscribed ? <MailX className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                            {isUnsubscribed ? 'Disabled' : 'Enabled'}
                          </button>
                          <button
                            onClick={() => handleRemoveMemberFromList(member.id)}
                            className={`p-2 rounded-lg transition-colors ${
                              darkMode
                                ? 'text-red-400 hover:bg-red-500/20'
                                : 'text-red-600 hover:bg-red-50'
                            }`}
                            title="Remove from list"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showImportModal && selectedList && (
        <ImportListMembersModal
          darkMode={darkMode}
          listName={selectedList.name}
          listId={selectedList.id}
          onImport={handleImportMembers}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showAddContactModal && selectedList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className={`rounded-xl max-w-md w-full p-6 ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
          }`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Add Contact
              </h2>
              <button
                onClick={() => setShowAddContactModal(false)}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={addContactEmail}
                  onChange={(e) => setAddContactEmail(e.target.value)}
                  placeholder="contact@example.com"
                  className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={addContactFirstName}
                    onChange={(e) => setAddContactFirstName(e.target.value)}
                    placeholder="First"
                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={addContactLastName}
                    onChange={(e) => setAddContactLastName(e.target.value)}
                    placeholder="Last"
                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>
              </div>

              {addContactError && (
                <p className="text-sm text-red-400">{addContactError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddContactModal(false)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode ? 'text-slate-300 hover:bg-slate-700/50' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleAddContact}
                disabled={!addContactEmail.trim() || addingContact}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {addingContact ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

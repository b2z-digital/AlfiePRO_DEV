import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Search, UserPlus, Shield } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_id?: string;
  avatar_url?: string;
}

interface TeamMember {
  memberId: string;
  userId: string | null;
  memberName: string;
  memberEmail: string;
  positionTitle: string;
  role: 'admin' | 'editor' | 'member' | 'viewer';
  hasAccount: boolean;
}

interface AddTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  darkMode: boolean;
}

export const AddTeamMemberModal: React.FC<AddTeamMemberModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  darkMode
}) => {
  const { currentClub, currentOrganization, user } = useAuth();
  const { addNotification } = useNotifications();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && (currentClub || currentOrganization)) {
      fetchMembers();
    }
  }, [isOpen, currentClub, currentOrganization]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const fetchMembers = async () => {
    const isAssociation = !!currentOrganization && !currentClub;
    if (!currentClub && !currentOrganization) return;

    try {
      setLoading(true);

      if (isAssociation) {
        // For associations: fetch all users from profiles that are NOT already team members
        const tableName = currentOrganization.type === 'state' ? 'user_state_associations' : 'user_national_associations';
        const idColumn = currentOrganization.type === 'state' ? 'state_association_id' : 'national_association_id';

        // Get existing team members
        const { data: existingTeamMembers, error: teamError } = await supabase
          .from(tableName)
          .select('user_id')
          .eq(idColumn, currentOrganization.id);

        if (teamError) throw teamError;

        const assignedUserIds = existingTeamMembers?.map(tm => tm.user_id) || [];

        // Get all profiles (all registered users)
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .order('first_name');

        if (profilesError) throw profilesError;

        // Filter out already assigned users
        const availableProfiles = profiles?.filter(p => !assignedUserIds.includes(p.id)) || [];

        // Get emails from auth.users
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
        const emailMap = new Map();
        if (users) {
          users.forEach(u => emailMap.set(u.id, u.email));
        }

        // Map to Member format
        const membersData = availableProfiles.map(p => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: emailMap.get(p.id) || '',
          user_id: p.id,
          avatar_url: p.avatar_url
        }));

        setMembers(membersData);
      } else {
        // Original club logic
        const { data: existingTeamMembers, error: teamError } = await supabase
          .from('user_clubs')
          .select('user_id')
          .eq('club_id', currentClub!.clubId);

        if (teamError) throw teamError;

        const assignedUserIds = existingTeamMembers?.map(tm => tm.user_id) || [];

        // Get ALL members (with or without user_id)
        const { data: membersData, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, user_id, avatar_url')
          .eq('club_id', currentClub!.clubId)
          .order('first_name');

        if (error) throw error;

        // Filter: show members without accounts OR members with accounts not yet on the team
        const availableMembers = membersData?.filter(m =>
          !m.user_id || !assignedUserIds.includes(m.user_id)
        ) || [];

        // Get avatars from profiles for members with accounts
        if (availableMembers.length > 0) {
          const userIds = availableMembers.filter(m => m.user_id).map(m => m.user_id!);

          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, avatar_url')
              .in('id', userIds);

            // Merge avatar data
            const membersWithAvatars = availableMembers.map(member => {
              const profile = profiles?.find(p => p.id === member.user_id);
              return {
                ...member,
                avatar_url: member.avatar_url || profile?.avatar_url
              };
            });

            setMembers(membersWithAvatars);
          } else {
            setMembers(availableMembers);
          }
        } else {
          setMembers([]);
        }
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      addNotification('error', 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter(member => {
    const searchLower = searchQuery.toLowerCase();
    const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
    return fullName.includes(searchLower) || member.email.toLowerCase().includes(searchLower);
  });

  const handleSelectMember = (member: Member) => {
    const memberKey = member.user_id || member.id;
    const existing = selectedMembers.find(m =>
      (m.userId && m.userId === member.user_id) || m.memberId === member.id
    );

    if (existing) {
      setSelectedMembers(selectedMembers.filter(m =>
        !((m.userId && m.userId === member.user_id) || m.memberId === member.id)
      ));
    } else {
      setSelectedMembers([
        ...selectedMembers,
        {
          memberId: member.id,
          userId: member.user_id || null,
          memberName: `${member.first_name} ${member.last_name}`,
          memberEmail: member.email,
          positionTitle: '',
          role: 'member',
          hasAccount: !!member.user_id
        }
      ]);
    }
  };

  const updateTeamMember = (memberId: string, field: 'positionTitle' | 'role', value: string) => {
    setSelectedMembers(selectedMembers.map(member =>
      member.memberId === memberId ? { ...member, [field]: value } : member
    ));
  };

  const handleSubmit = async () => {
    const isAssociation = !!currentOrganization && !currentClub;
    if ((!currentClub && !currentOrganization) || selectedMembers.length === 0) return;

    try {
      setSaving(true);

      if (isAssociation) {
        // Association logic: add users to user_state_associations or user_national_associations
        const tableName = currentOrganization.type === 'state' ? 'user_state_associations' : 'user_national_associations';
        const idColumn = currentOrganization.type === 'state' ? 'state_association_id' : 'national_association_id';

        for (const teamMember of selectedMembers) {
          if (teamMember.userId) {
            // Check if already exists
            const { data: existing } = await supabase
              .from(tableName)
              .select('id')
              .eq('user_id', teamMember.userId)
              .eq(idColumn, currentOrganization.id)
              .maybeSingle();

            if (existing) {
              // Update role
              const { error: updateError } = await supabase
                .from(tableName)
                .update({ role: teamMember.role })
                .eq('user_id', teamMember.userId)
                .eq(idColumn, currentOrganization.id);

              if (updateError) throw updateError;
            } else {
              // Insert new
              const insertData: any = {
                user_id: teamMember.userId,
                role: teamMember.role
              };
              insertData[idColumn] = currentOrganization.id;

              const { error: insertError } = await supabase
                .from(tableName)
                .insert(insertData);

              if (insertError) throw insertError;
            }
          }
        }
      } else {
        // Club logic (original)
        for (const teamMember of selectedMembers) {
          // Only handle user_clubs if member has an account
          if (teamMember.userId) {
            // Check if user is already in user_clubs
            const { data: existingUserClub } = await supabase
              .from('user_clubs')
              .select('id')
              .eq('user_id', teamMember.userId)
              .eq('club_id', currentClub!.clubId)
              .maybeSingle();

            if (existingUserClub) {
              // Update existing role
              const { error: roleError } = await supabase
                .from('user_clubs')
                .update({ role: teamMember.role })
                .eq('user_id', teamMember.userId)
                .eq('club_id', currentClub!.clubId);

              if (roleError) throw roleError;
            } else {
              // Insert new user_clubs record
              const { error: insertError } = await supabase
                .from('user_clubs')
                .insert({
                  user_id: teamMember.userId,
                  club_id: currentClub!.clubId,
                  role: teamMember.role
                });

              if (insertError) throw insertError;
            }
          }

          // Add committee position if title is provided
          if (teamMember.positionTitle.trim()) {
            const positionData: any = {
              club_id: currentClub!.clubId,
              title: teamMember.positionTitle.trim(),
              position_title: teamMember.positionTitle.trim()
            };

            // Add user_id if member has an account, otherwise use member_id
            if (teamMember.userId) {
              positionData.user_id = teamMember.userId;
            } else {
              positionData.member_id = teamMember.memberId;
            }

            const { error: positionError } = await supabase
              .from('committee_positions')
              .insert(positionData);

            if (positionError) throw positionError;
          }
        }
      }

      addNotification('success', `Added ${selectedMembers.length} team member(s) successfully`);
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error adding team members:', error);
      addNotification('error', 'Failed to add team members');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedMembers([]);
    setSearchQuery('');
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Add Team Members
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Select members and assign positions & roles
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
          {/* Search */}
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-green-500`}
            />
          </div>

          {/* Selected Members */}
          {selectedMembers.length > 0 && (
            <div className={`rounded-lg border ${darkMode ? 'border-slate-700 bg-slate-700/30' : 'border-gray-200 bg-gray-50'} p-4 max-h-[40vh] flex flex-col`}>
              <h3 className={`text-sm font-medium mb-3 flex-shrink-0 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Selected Members ({selectedMembers.length})
              </h3>
              <div className="space-y-3 overflow-y-auto flex-1">
                {selectedMembers.map((teamMember) => (
                  <div
                    key={teamMember.memberId}
                    className={`p-3 rounded-lg border ${darkMode ? 'border-slate-600 bg-slate-800' : 'border-gray-200 bg-white'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-medium">
                          {teamMember.memberName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {teamMember.memberName}
                            </div>
                            {!teamMember.hasAccount && (
                              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium rounded">
                                No Account
                              </span>
                            )}
                          </div>
                          <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            {teamMember.memberEmail}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSelectMember({ id: teamMember.memberId, user_id: teamMember.userId || undefined, first_name: '', last_name: '', email: teamMember.memberEmail })}
                        className={`text-sm px-2 py-1 rounded ${darkMode ? 'text-slate-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'}`}
                      >
                        Remove
                      </button>
                    </div>
                    <div className={`grid ${teamMember.hasAccount ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          Position Title
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., President, Secretary, Treasurer"
                          value={teamMember.positionTitle}
                          onChange={(e) => updateTeamMember(teamMember.memberId, 'positionTitle', e.target.value)}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                          } focus:outline-none focus:ring-2 focus:ring-green-500`}
                        />
                      </div>
                      {teamMember.hasAccount && (
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                            Access Role
                          </label>
                          <select
                            value={teamMember.role}
                            onChange={(e) => updateTeamMember(teamMember.memberId, 'role', e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg border text-sm ${
                              darkMode
                                ? 'bg-slate-700 border-slate-600 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                            } focus:outline-none focus:ring-2 focus:ring-green-500`}
                          >
                            <option value="viewer">Viewer - View only access</option>
                            <option value="member">Member - Basic member access</option>
                            <option value="pro">PRO - Can score races and generate reports</option>
                            <option value="editor">Editor - Can manage races, members, and venues</option>
                            <option value="admin">Admin - Full access to all features</option>
                          </select>
                        </div>
                      )}
                    </div>
                    {!teamMember.hasAccount && (
                      <div className={`mt-2 text-xs ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                        Access role will be assigned when member creates an account
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Members List */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <h3 className={`text-sm font-medium mb-3 flex-shrink-0 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
              Available Members
            </h3>
            <div className={`flex-1 overflow-y-auto rounded-lg border ${darkMode ? 'border-slate-700' : 'border-gray-200'} min-h-0`}>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    Loading members...
                  </div>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    No members found
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {filteredMembers.map((member) => {
                    const isSelected = selectedMembers.some(m =>
                      m.memberId === member.id || (m.userId && m.userId === member.user_id)
                    );
                    return (
                      <button
                        key={member.id}
                        onClick={() => handleSelectMember(member)}
                        className={`w-full p-4 text-left transition-colors ${
                          isSelected
                            ? darkMode ? 'bg-green-500/20' : 'bg-green-50'
                            : darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {member.avatar_url ? (
                              <img
                                src={member.avatar_url}
                                alt={`${member.first_name} ${member.last_name}`}
                                className={`w-10 h-10 rounded-full object-cover ${
                                  isSelected ? 'ring-2 ring-green-500' : ''
                                }`}
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                                isSelected ? 'bg-green-500' : 'bg-blue-500'
                              }`}>
                                {member.first_name[0]}{member.last_name[0]}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                  {member.first_name} {member.last_name}
                                </div>
                                {!member.user_id && (
                                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium rounded">
                                    No Account
                                  </span>
                                )}
                              </div>
                              <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                {member.email}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between p-6 border-t flex-shrink-0 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-slate-700 text-white hover:bg-slate-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedMembers.length === 0 || saving}
              className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Adding...' : `Add ${selectedMembers.length > 0 ? selectedMembers.length : ''} Member${selectedMembers.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Mail, Trash2, AlertTriangle, Edit2, Crown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { AddTeamMemberModal } from './AddTeamMemberModal';
import { EditTeamMemberModal } from './EditTeamMemberModal';

interface TeamManagementSectionProps {
  darkMode: boolean;
}

interface TeamMember {
  id: string;
  user_id: string | null;
  member_id?: string;
  role: 'admin' | 'editor' | 'pro' | 'member' | 'viewer' | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string;
  positions: CommitteePosition[];
  hasAccount: boolean;
}

interface CommitteePosition {
  id: string;
  position_title: string;
}

export const TeamManagementSection: React.FC<TeamManagementSectionProps> = ({ darkMode }) => {
  const { user, currentClub, currentOrganization } = useAuth();
  const { addNotification } = useNotifications();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const isAdmin = currentClub?.role === 'admin' || currentOrganization?.role === 'state_admin' || currentOrganization?.role === 'national_admin';
  const isEditor = currentClub?.role === 'editor';
  const canManage = isAdmin || isEditor;

  useEffect(() => {
    if (currentClub || currentOrganization) {
      fetchTeamMembers();
    }
  }, [currentClub, currentOrganization]);

  const fetchTeamMembers = async () => {
    const isAssociation = !!currentOrganization && !currentClub;
    if (!currentClub && !currentOrganization) return;

    try {
      setLoading(true);

      if (isAssociation) {
        // Fetch association team members
        const tableName = currentOrganization.type === 'state' ? 'user_state_associations' : 'user_national_associations';
        const idColumn = currentOrganization.type === 'state' ? 'state_association_id' : 'national_association_id';

        const { data: userAssociations, error: userAssociationsError } = await supabase
          .from(tableName)
          .select('id, user_id, role')
          .eq(idColumn, currentOrganization.id);

        if (userAssociationsError) throw userAssociationsError;

        // Get user profiles
        const userIds = userAssociations?.map(ua => ua.user_id) || [];
        const { data: profiles, error: profilesError } = userIds.length > 0
          ? await supabase
              .from('profiles')
              .select('id, first_name, last_name, avatar_url')
              .in('id', userIds)
          : { data: [], error: null };

        if (profilesError) throw profilesError;

        // Get auth.users email addresses
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
        const emailMap = new Map();
        if (users) {
          users.forEach(u => emailMap.set(u.id, u.email));
        }

        // Map to TeamMember format
        const teamMembersData: TeamMember[] = userAssociations?.map(ua => {
          const profile = profiles?.find(p => p.id === ua.user_id);
          return {
            id: ua.id,
            user_id: ua.user_id,
            role: ua.role as 'admin' | 'editor' | 'pro' | 'member' | 'viewer',
            first_name: profile?.first_name,
            last_name: profile?.last_name,
            email: emailMap.get(ua.user_id),
            avatar_url: profile?.avatar_url,
            positions: [],
            hasAccount: true
          };
        }) || [];

        setTeamMembers(teamMembersData);
      } else {
        // Original club logic
        const { data: userClubs, error: userClubsError } = await supabase
          .from('user_clubs')
          .select('id, user_id, role')
          .eq('club_id', currentClub!.clubId);

        if (userClubsError) throw userClubsError;

      // Get committee positions (includes members with and without accounts)
      const { data: positions, error: positionsError } = await supabase
        .from('committee_positions')
        .select('id, user_id, member_id, position_title')
        .eq('club_id', currentClub.clubId);

      if (positionsError) throw positionsError;

      // Get member details for positions without user_id
      const memberIds = positions?.filter(p => p.member_id && !p.user_id).map(p => p.member_id!) || [];
      const { data: membersData, error: membersError } = memberIds.length > 0
        ? await supabase
            .from('members')
            .select('id, first_name, last_name, email, avatar_url')
            .in('id', memberIds)
        : { data: [], error: null };

      if (membersError) throw membersError;

      // Get user profiles for team members with accounts
      const userIds = userClubs?.map(uc => uc.user_id) || [];
      const { data: profiles, error: profilesError } = userIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', userIds)
        : { data: [], error: null };

      if (profilesError) throw profilesError;

      // Get auth.users email addresses
      const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

      const emailMap = new Map();
      if (users) {
        users.forEach(u => {
          emailMap.set(u.id, u.email);
        });
      }

      const members: TeamMember[] = [];
      const processedMemberIds = new Set<string>();
      const processedUserIds = new Set<string>();

      // Add members with user accounts (from user_clubs)
      userClubs?.forEach(uc => {
        const profile = profiles?.find(p => p.id === uc.user_id);
        const userPositions = positions?.filter(p => p.user_id === uc.user_id) || [];

        members.push({
          id: uc.id,
          user_id: uc.user_id,
          role: uc.role as any,
          first_name: profile?.first_name,
          last_name: profile?.last_name,
          email: emailMap.get(uc.user_id),
          avatar_url: profile?.avatar_url,
          hasAccount: true,
          positions: userPositions.map(p => ({
            id: p.id,
            position_title: p.position_title
          }))
        });
        processedUserIds.add(uc.user_id);
      });

      // Add members with committee positions but no user account
      positions?.forEach(pos => {
        if (pos.member_id && !pos.user_id && !processedMemberIds.has(pos.member_id)) {
          const memberData = membersData?.find(m => m.id === pos.member_id);
          if (memberData) {
            const memberPositions = positions.filter(p => p.member_id === pos.member_id);
            members.push({
              id: pos.member_id,
              user_id: null,
              member_id: pos.member_id,
              role: null,
              first_name: memberData.first_name,
              last_name: memberData.last_name,
              email: memberData.email,
              avatar_url: memberData.avatar_url,
              hasAccount: false,
              positions: memberPositions.map(p => ({
                id: p.id,
                position_title: p.position_title
              }))
            });
            processedMemberIds.add(pos.member_id);
          }
        }
      });

      // Sort: current user first, then members with accounts, then by role/name
      members.sort((a, b) => {
        if (a.user_id === user?.id) return -1;
        if (b.user_id === user?.id) return 1;

        // Members with accounts come before members without
        if (a.hasAccount && !b.hasAccount) return -1;
        if (!a.hasAccount && b.hasAccount) return 1;

        // Sort by role if both have accounts
        if (a.hasAccount && b.hasAccount && a.role && b.role) {
          const roleOrder = { admin: 0, editor: 1, pro: 2, member: 3, viewer: 4 };
          if (roleOrder[a.role] !== roleOrder[b.role]) {
            return roleOrder[a.role] - roleOrder[b.role];
          }
        }

        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email || '';
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email || '';
        return nameA.localeCompare(nameB);
      });

      setTeamMembers(members);
      }
    } catch (error) {
      console.error('Error fetching team members:', error);
      addNotification('error', 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const handleMemberClick = (member: TeamMember) => {
    const canEditThisMember = isAdmin || (isEditor && member.role !== 'admin');

    if (canEditThisMember) {
      setEditingMember(member);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!currentClub) return;
    if (userId === user?.id) {
      addNotification('error', 'You cannot remove yourself');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${memberName} from the team?`)) {
      return;
    }

    try {
      // Delete committee positions first
      await supabase
        .from('committee_positions')
        .delete()
        .eq('user_id', userId)
        .eq('club_id', currentClub.clubId);

      // Delete user_club relationship
      const { error } = await supabase
        .from('user_clubs')
        .delete()
        .eq('user_id', userId)
        .eq('club_id', currentClub.clubId);

      if (error) throw error;

      setTeamMembers(teamMembers.filter(member => member.user_id !== userId));
      addNotification('success', 'Member removed from team');
    } catch (error) {
      console.error('Error removing member:', error);
      addNotification('error', 'Failed to remove member');
    }
  };


  const getMemberInitials = (member: TeamMember) => {
    if (member.first_name && member.last_name) {
      return `${member.first_name[0]}${member.last_name[0]}`;
    }
    if (member.email) {
      return member.email.substring(0, 2).toUpperCase();
    }
    return 'M';
  };

  const getMemberDisplayName = (member: TeamMember) => {
    if (member.first_name && member.last_name) {
      return `${member.first_name} ${member.last_name}`;
    }
    return member.email || 'Team Member';
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'editor':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'pro':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'member':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'viewer':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const formatRole = (role: string) => {
    if (role === 'pro') return 'PRO';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Users className="w-6 h-6" />
            Team Management
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage committee positions and access roles
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors shadow-lg shadow-green-500/20"
          >
            <UserPlus className="mr-2 h-5 w-5" />
            Add Member
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-400">Loading team members...</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-slate-400 mb-4">
            {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
          </div>

          {teamMembers.map((member) => {
            const isCurrentUser = member.user_id === user?.id;
            const canEditThisMember = isAdmin || (isEditor && member.role !== 'admin');

            return (
              <div
                key={member.id}
                className={`group rounded-lg border transition-all ${
                  darkMode
                    ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                } p-4`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Avatar and Info */}
                  <div className="flex items-start gap-4 flex-1 pointer-events-none">
                    {/* Avatar */}
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={getMemberDisplayName(member)}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                        {getMemberInitials(member)}
                      </div>
                    )}

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {getMemberDisplayName(member)}
                        </h3>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                            You
                          </span>
                        )}
                        {!member.hasAccount && (
                          <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium rounded-full">
                            No Account
                          </span>
                        )}
                      </div>

                      {member.email && (
                        <div className={`text-sm mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          {member.email}
                        </div>
                      )}

                      {/* Positions */}
                      {member.positions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {member.positions.map((position) => (
                            <div
                              key={position.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium rounded-lg"
                            >
                              <Crown className="w-3 h-3" />
                              {position.position_title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role Badge and Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {member.hasAccount && member.role && (
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                        <Shield className="w-3 h-3" />
                        {formatRole(member.role)}
                      </div>
                    )}
                    {canEditThisMember && (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingMember(member);
                          }}
                          className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
                          title="Edit member"
                        >
                          <Edit2 className="w-4 h-4 text-slate-400 hover:text-white" />
                        </button>
                        {!isCurrentUser && member.user_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMember(member.user_id, getMemberDisplayName(member));
                            }}
                            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                            title="Remove from team"
                          >
                            <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Member Modal */}
      <AddTeamMemberModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchTeamMembers}
        darkMode={darkMode}
      />

      {/* Edit Member Modal */}
      <EditTeamMemberModal
        isOpen={!!editingMember}
        onClose={() => setEditingMember(null)}
        onSuccess={fetchTeamMembers}
        darkMode={darkMode}
        member={editingMember}
      />
    </div>
  );
};

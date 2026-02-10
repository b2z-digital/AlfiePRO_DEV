import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, ShieldCheck, Edit3, Trash2, Mail, Search, X, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrganizationContext } from '../../hooks/useOrganizationContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { Avatar } from '../ui/Avatar';

interface AssociationUsersManagementProps {
  darkMode: boolean;
}

interface AssociationUser {
  id: string;
  user_id: string;
  role: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  created_at: string;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', description: 'Full access to all association settings and data', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' },
  { value: 'editor', label: 'Editor', description: 'Can edit content but cannot manage users or billing', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  { value: 'member', label: 'Viewer', description: 'Read-only access to association dashboard', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
];

export const AssociationUsersManagement: React.FC<AssociationUsersManagementProps> = ({ darkMode }) => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const { addNotification } = useNotifications();

  const [users, setUsers] = useState<AssociationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AssociationUser | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [addingUser, setAddingUser] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);

  const tableName = currentOrganization?.type === 'state' ? 'user_state_associations' : 'user_national_associations';
  const idColumn = currentOrganization?.type === 'state' ? 'state_association_id' : 'national_association_id';
  const adminRole = currentOrganization?.type === 'state' ? 'state_admin' : 'national_admin';

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchUsers();
    }
  }, [currentOrganization?.id]);

  const fetchUsers = async () => {
    if (!currentOrganization?.id) return;

    try {
      setLoading(true);

      const { data: associations, error: assocError } = await supabase
        .from(tableName)
        .select('id, user_id, role, created_at')
        .eq(idColumn, currentOrganization.id);

      if (assocError) throw assocError;

      if (!associations || associations.length === 0) {
        setUsers([]);
        return;
      }

      const userIds = associations.map(a => a.user_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const mappedUsers: AssociationUser[] = associations.map(a => {
        const profile = profiles?.find(p => p.id === a.user_id);
        return {
          id: a.id,
          user_id: a.user_id,
          role: a.role,
          email: '',
          first_name: profile?.first_name || '',
          last_name: profile?.last_name || '',
          avatar_url: profile?.avatar_url || null,
          created_at: a.created_at,
        };
      });

      mappedUsers.sort((a, b) => {
        if (a.user_id === user?.id) return -1;
        if (b.user_id === user?.id) return 1;
        const roleOrder: Record<string, number> = { admin: 0, state_admin: 0, national_admin: 0, editor: 1, member: 2 };
        return (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
      });

      setUsers(mappedUsers);
    } catch (error) {
      console.error('Error fetching association users:', error);
      addNotification('error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newEmail.trim() || !currentOrganization?.id) return;

    try {
      setAddingUser(true);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('id', `%`)
        .limit(1);

      const { data: matchingAuth } = await supabase.rpc('get_user_id_by_email', { email_input: newEmail.trim().toLowerCase() });

      let targetUserId: string | null = null;

      if (matchingAuth) {
        targetUserId = matchingAuth;
      } else {
        const { data: members, error: membersError } = await supabase
          .from('members')
          .select('user_id')
          .ilike('email', newEmail.trim())
          .not('user_id', 'is', null)
          .limit(1);

        if (!membersError && members && members.length > 0) {
          targetUserId = members[0].user_id;
        }
      }

      if (!targetUserId) {
        addNotification('error', 'No user found with that email address. The user must have an account first.');
        return;
      }

      const { data: existing } = await supabase
        .from(tableName)
        .select('id')
        .eq('user_id', targetUserId)
        .eq(idColumn, currentOrganization.id)
        .maybeSingle();

      if (existing) {
        addNotification('error', 'This user already has access to this association');
        return;
      }

      const mappedRole = newRole === 'admin' ? adminRole : newRole;

      const insertData: Record<string, string> = {
        user_id: targetUserId,
        role: mappedRole,
      };
      insertData[idColumn] = currentOrganization.id;

      const { error: insertError } = await supabase
        .from(tableName)
        .insert(insertData);

      if (insertError) throw insertError;

      addNotification('success', 'User added to association');
      setNewEmail('');
      setNewRole('editor');
      setShowAddModal(false);
      fetchUsers();
    } catch (error: any) {
      console.error('Error adding user:', error);
      addNotification('error', error.message || 'Failed to add user');
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateRole = async (assocUser: AssociationUser, newRoleValue: string) => {
    if (assocUser.user_id === user?.id) {
      addNotification('error', 'You cannot change your own role');
      return;
    }

    try {
      setUpdatingRole(true);
      const mappedRole = newRoleValue === 'admin' ? adminRole : newRoleValue;

      const { error } = await supabase
        .from(tableName)
        .update({ role: mappedRole })
        .eq('id', assocUser.id);

      if (error) throw error;

      setUsers(prev => prev.map(u =>
        u.id === assocUser.id ? { ...u, role: mappedRole } : u
      ));
      setEditingUser(null);
      addNotification('success', 'Role updated');
    } catch (error) {
      console.error('Error updating role:', error);
      addNotification('error', 'Failed to update role');
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleRemoveUser = async (assocUser: AssociationUser) => {
    if (assocUser.user_id === user?.id) {
      addNotification('error', 'You cannot remove yourself');
      return;
    }

    const name = `${assocUser.first_name} ${assocUser.last_name}`.trim() || 'this user';
    if (!confirm(`Remove ${name} from this association?`)) return;

    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', assocUser.id);

      if (error) throw error;

      setUsers(prev => prev.filter(u => u.id !== assocUser.id));
      addNotification('success', 'User removed from association');
    } catch (error) {
      console.error('Error removing user:', error);
      addNotification('error', 'Failed to remove user');
    }
  };

  const getNormalizedRole = (role: string) => {
    if (role === 'state_admin' || role === 'national_admin' || role === 'admin') return 'admin';
    return role;
  };

  const getRoleBadge = (role: string) => {
    const normalized = getNormalizedRole(role);
    const config = ROLE_OPTIONS.find(r => r.value === normalized) || ROLE_OPTIONS[2];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.color}`}>
        {normalized === 'admin' ? <ShieldCheck size={12} /> : <Shield size={12} />}
        {config.label}
      </span>
    );
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/20">
            <Users size={22} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Association Users</h2>
            <p className="text-sm text-slate-400">
              Manage who has access to this {currentOrganization?.type === 'state' ? 'state' : 'national'} association dashboard
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <UserPlus size={16} />
          Add User
        </button>
      </div>

      {users.length > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12">
          <Users size={40} className="mx-auto text-slate-500 mb-3" />
          <p className="text-slate-400 text-sm">
            {searchQuery ? 'No users match your search' : 'No users have been added yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map(assocUser => (
            <div
              key={assocUser.id}
              className="flex items-center justify-between p-4 rounded-lg bg-slate-700/30 border border-slate-700/50 hover:bg-slate-700/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  src={assocUser.avatar_url || undefined}
                  name={`${assocUser.first_name} ${assocUser.last_name}`.trim()}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">
                      {assocUser.first_name} {assocUser.last_name}
                    </span>
                    {assocUser.user_id === user?.id && (
                      <span className="text-[10px] font-medium text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">YOU</span>
                    )}
                  </div>
                  {assocUser.email && (
                    <p className="text-xs text-slate-400 truncate">{assocUser.email}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {getRoleBadge(assocUser.role)}

                {assocUser.user_id !== user?.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingUser(assocUser)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600/50 transition-colors"
                      title="Edit role"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleRemoveUser(assocUser)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove user"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Add User</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">User must have an existing account</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                <div className="space-y-2">
                  {ROLE_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        newRole === option.value
                          ? 'bg-blue-500/10 border-blue-500/40'
                          : 'bg-slate-700/50 border-slate-600/50 hover:border-slate-500/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={option.value}
                        checked={newRole === option.value}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="mt-0.5"
                      />
                      <div>
                        <span className={`text-sm font-medium ${option.color}`}>{option.label}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{option.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUser}
                  disabled={!newEmail.trim() || addingUser}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {addingUser ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <>
                      <UserPlus size={16} />
                      Add User
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Edit Role</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <Avatar
                src={editingUser.avatar_url || undefined}
                name={`${editingUser.first_name} ${editingUser.last_name}`.trim()}
                size="md"
              />
              <div>
                <p className="text-white font-medium">{editingUser.first_name} {editingUser.last_name}</p>
                {editingUser.email && <p className="text-xs text-slate-400">{editingUser.email}</p>}
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {ROLE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleUpdateRole(editingUser, option.value)}
                  disabled={updatingRole}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    getNormalizedRole(editingUser.role) === option.value
                      ? 'bg-blue-500/10 border-blue-500/40'
                      : 'bg-slate-700/50 border-slate-600/50 hover:border-slate-500/50'
                  }`}
                >
                  <div className="mt-0.5">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      getNormalizedRole(editingUser.role) === option.value
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-slate-500'
                    }`}>
                      {getNormalizedRole(editingUser.role) === option.value && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={`text-sm font-medium ${option.color}`}>{option.label}</span>
                    <p className="text-xs text-slate-400 mt-0.5">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setEditingUser(null)}
              className="w-full px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

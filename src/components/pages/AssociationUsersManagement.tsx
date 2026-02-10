import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Users, UserPlus, Shield, ShieldCheck, Edit3, Trash2, Mail, Search, X, Send, CheckCircle, AlertCircle, User, Building } from 'lucide-react';
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

interface MatchedUser {
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  source: 'auth' | 'member' | 'none';
  club_name?: string;
  has_account: boolean;
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

  const getAdminCount = () => {
    return users.filter(u =>
      u.role === 'state_admin' || u.role === 'national_admin' || u.role === 'admin'
    ).length;
  };

  const isUserAdmin = (role: string) => {
    return role === 'state_admin' || role === 'national_admin' || role === 'admin';
  };

  const handleUpdateRole = async (assocUser: AssociationUser, newRoleValue: string) => {
    const mappedRole = newRoleValue === 'admin' ? adminRole : newRoleValue;

    if (isUserAdmin(assocUser.role) && !isUserAdmin(mappedRole) && getAdminCount() <= 1) {
      addNotification('error', 'Cannot change role. Every association must have at least one admin.');
      return;
    }

    if (assocUser.user_id === user?.id) {
      const name = getNormalizedRole(mappedRole);
      const label = ROLE_OPTIONS.find(r => r.value === name)?.label || name;
      if (!confirm(`Change your own role to ${label}? ${!isUserAdmin(mappedRole) ? 'You will lose admin access to this association.' : ''}`)) return;
    }

    try {
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
    }
  };

  const handleRemoveUser = async (assocUser: AssociationUser) => {
    if (isUserAdmin(assocUser.role) && getAdminCount() <= 1) {
      addNotification('error', 'Cannot remove the last admin. Every association must have at least one admin.');
      return;
    }

    const name = `${assocUser.first_name} ${assocUser.last_name}`.trim() || 'this user';
    const isSelf = assocUser.user_id === user?.id;
    const confirmMsg = isSelf
      ? 'Remove yourself from this association? You will lose all access to this dashboard.'
      : `Remove ${name} from this association?`;
    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', assocUser.id);

      if (error) throw error;

      setUsers(prev => prev.filter(u => u.id !== assocUser.id));
      addNotification('success', isSelf ? 'You have been removed from this association' : 'User removed from association');
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
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchUsers();
          }}
          tableName={tableName}
          idColumn={idColumn}
          adminRole={adminRole}
          organizationId={currentOrganization?.id || ''}
          organizationType={currentOrganization?.type || 'state'}
        />
      )}

      {editingUser && (
        <EditRoleModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdate={handleUpdateRole}
          getNormalizedRole={getNormalizedRole}
        />
      )}
    </div>
  );
};

interface AddUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
  tableName: string;
  idColumn: string;
  adminRole: string;
  organizationId: string;
  organizationType: string;
}

const AddUserModal: React.FC<AddUserModalProps> = ({
  onClose, onSuccess, tableName, idColumn, adminRole, organizationId, organizationType
}) => {
  const { addNotification } = useNotifications();
  const [emailInput, setEmailInput] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [searching, setSearching] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [matchedUser, setMatchedUser] = useState<MatchedUser | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setMatchedUser(null);
    setSearchDone(false);

    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) return;

    searchTimeoutRef.current = setTimeout(() => {
      searchForUser(email);
    }, 600);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [emailInput]);

  const searchForUser = async (email: string) => {
    try {
      setSearching(true);
      setSearchDone(false);

      const { data: authUserId } = await supabase.rpc('get_user_id_by_email', { email_input: email });

      if (authUserId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .eq('id', authUserId)
          .maybeSingle();

        let clubName: string | undefined;
        const { data: memberData } = await supabase
          .from('members')
          .select('club_id, clubs!inner(name)')
          .eq('user_id', authUserId)
          .limit(1);

        if (memberData && memberData.length > 0) {
          clubName = (memberData[0] as any).clubs?.name;
        }

        setMatchedUser({
          user_id: authUserId,
          first_name: profile?.first_name || '',
          last_name: profile?.last_name || '',
          email,
          avatar_url: profile?.avatar_url || null,
          source: 'auth',
          club_name: clubName,
          has_account: true,
        });
        setSearchDone(true);
        return;
      }

      const { data: members } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, user_id, avatar_url, club_id, clubs!inner(name)')
        .ilike('email', email)
        .limit(1);

      if (members && members.length > 0) {
        const member = members[0];
        const clubName = (member as any).clubs?.name;

        if (member.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', member.user_id)
            .maybeSingle();

          setMatchedUser({
            user_id: member.user_id,
            first_name: member.first_name,
            last_name: member.last_name,
            email: member.email,
            avatar_url: profile?.avatar_url || member.avatar_url || null,
            source: 'member',
            club_name: clubName,
            has_account: true,
          });
        } else {
          setMatchedUser({
            user_id: null,
            first_name: member.first_name,
            last_name: member.last_name,
            email: member.email,
            avatar_url: member.avatar_url || null,
            source: 'member',
            club_name: clubName,
            has_account: false,
          });
        }
        setSearchDone(true);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .or(`first_name.ilike.%${email.split('@')[0]}%`)
        .limit(1);

      setMatchedUser({
        user_id: null,
        first_name: '',
        last_name: '',
        email,
        avatar_url: null,
        source: 'none',
        has_account: false,
      });
      setSearchDone(true);
    } catch (error) {
      console.error('Error searching for user:', error);
      setSearchDone(true);
    } finally {
      setSearching(false);
    }
  };

  const handleAddExistingUser = async () => {
    if (!matchedUser?.user_id || !organizationId) return;

    try {
      setAddingUser(true);

      const { data: existing } = await supabase
        .from(tableName)
        .select('id')
        .eq('user_id', matchedUser.user_id)
        .eq(idColumn, organizationId)
        .maybeSingle();

      if (existing) {
        addNotification('error', 'This user already has access to this association');
        return;
      }

      const mappedRole = newRole === 'admin' ? adminRole : newRole;
      const insertData: Record<string, string> = {
        user_id: matchedUser.user_id,
        role: mappedRole,
      };
      insertData[idColumn] = organizationId;

      const { error: insertError } = await supabase.from(tableName).insert(insertData);
      if (insertError) throw insertError;

      addNotification('success', `${matchedUser.first_name || 'User'} added to association`);
      onSuccess();
    } catch (error: any) {
      console.error('Error adding user:', error);
      addNotification('error', error.message || 'Failed to add user');
    } finally {
      setAddingUser(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!emailInput.trim() || !organizationId) return;

    try {
      setSendingInvite(true);

      const assocType = organizationType === 'state' ? 'state_associations' : 'national_associations';
      const assocIdCol = organizationType === 'state' ? 'state_association_id' : 'national_association_id';

      let assocName = 'the association';
      try {
        const { data: assocData } = await supabase
          .from(assocType)
          .select('name')
          .eq('id', organizationId)
          .maybeSingle();
        if (assocData?.name) assocName = assocData.name;
      } catch {}

      const appUrl = window.location.origin;
      const signupUrl = `${appUrl}/register`;

      const emailBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 8px;">You've Been Invited</h1>
            <p style="color: #64748b; font-size: 16px;">Join ${assocName} on Alfie PRO</p>
          </div>
          <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              You've been invited to join the <strong>${assocName}</strong> dashboard on Alfie PRO.
              To get started, create your account using this email address.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${signupUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Create Account
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">
              After creating your account, the association admin will grant you access.
            </p>
          </div>
        </div>
      `;

      const { data: { user: currentUser } } = await supabase.auth.getUser();

      await supabase.functions.invoke('send-notification', {
        body: {
          recipients: [{ email: emailInput.trim().toLowerCase(), name: matchedUser?.first_name || '' }],
          subject: `You're invited to join ${assocName} on Alfie PRO`,
          body: emailBody,
          type: 'invitation',
          send_email: true,
          sender_name: assocName,
        },
      });

      addNotification('success', `Invitation sent to ${emailInput.trim()}`);
      onClose();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      addNotification('error', 'Failed to send invitation. Please try again.');
    } finally {
      setSendingInvite(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <UserPlus size={20} className="text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Add User</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="user@example.com"
                autoFocus
                className="w-full pl-10 pr-10 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400" />
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Search by email to find existing users or invite new ones
            </p>
          </div>

          {searchDone && matchedUser && (
            <div className="animate-in fade-in duration-200">
              {matchedUser.has_account && matchedUser.user_id ? (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle size={16} className="text-green-400" />
                    <span className="text-sm font-medium text-green-400">Account Found</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={matchedUser.avatar_url || undefined}
                      name={`${matchedUser.first_name} ${matchedUser.last_name}`.trim() || matchedUser.email}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium truncate">
                        {matchedUser.first_name} {matchedUser.last_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{matchedUser.email}</p>
                      {matchedUser.club_name && (
                        <div className="flex items-center gap-1 mt-1">
                          <Building size={11} className="text-slate-500" />
                          <span className="text-xs text-slate-500">Member of {matchedUser.club_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : matchedUser.source === 'member' && !matchedUser.has_account ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={16} className="text-amber-400" />
                    <span className="text-sm font-medium text-amber-400">Member Found - No Account</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={matchedUser.avatar_url || undefined}
                      name={`${matchedUser.first_name} ${matchedUser.last_name}`.trim()}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium truncate">
                        {matchedUser.first_name} {matchedUser.last_name}
                      </p>
                      {matchedUser.club_name && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Building size={11} className="text-slate-500" />
                          <span className="text-xs text-slate-500">Member of {matchedUser.club_name}</span>
                        </div>
                      )}
                      <p className="text-xs text-amber-400/80 mt-1">
                        This person is a club member but hasn't created an Alfie PRO account yet.
                        Send them an invitation to sign up.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-600/50 bg-slate-700/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User size={16} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-300">No Account Found</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    No Alfie PRO account exists for this email. You can send an invitation
                    to create an account, then add them once they've signed up.
                  </p>
                </div>
              )}
            </div>
          )}

          {(!searchDone || (matchedUser && matchedUser.has_account)) && (
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
          )}
        </div>

        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
          >
            Cancel
          </button>

          {searchDone && matchedUser?.has_account && matchedUser.user_id ? (
            <button
              onClick={handleAddExistingUser}
              disabled={addingUser}
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
          ) : searchDone && matchedUser && !matchedUser.has_account ? (
            <button
              onClick={handleSendInvitation}
              disabled={sendingInvite}
              className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sendingInvite ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <>
                  <Send size={16} />
                  Send Invitation
                </>
              )}
            </button>
          ) : (
            <button
              disabled
              className="flex-1 px-4 py-2.5 bg-blue-600/50 text-white/50 rounded-lg text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2"
            >
              <UserPlus size={16} />
              Add User
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

interface EditRoleModalProps {
  user: AssociationUser;
  onClose: () => void;
  onUpdate: (user: AssociationUser, newRole: string) => void;
  getNormalizedRole: (role: string) => string;
}

const EditRoleModal: React.FC<EditRoleModalProps> = ({ user: assocUser, onClose, onUpdate, getNormalizedRole }) => {
  const [updatingRole, setUpdatingRole] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleUpdate = async (newRole: string) => {
    setUpdatingRole(true);
    await onUpdate(assocUser, newRole);
    setUpdatingRole(false);
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Edit Role</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Avatar
            src={assocUser.avatar_url || undefined}
            name={`${assocUser.first_name} ${assocUser.last_name}`.trim()}
            size="md"
          />
          <div>
            <p className="text-white font-medium">{assocUser.first_name} {assocUser.last_name}</p>
            {assocUser.email && <p className="text-xs text-slate-400">{assocUser.email}</p>}
          </div>
        </div>

        <div className="space-y-2 mb-6">
          {ROLE_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => handleUpdate(option.value)}
              disabled={updatingRole}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                getNormalizedRole(assocUser.role) === option.value
                  ? 'bg-blue-500/10 border-blue-500/40'
                  : 'bg-slate-700/50 border-slate-600/50 hover:border-slate-500/50'
              }`}
            >
              <div className="mt-0.5">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  getNormalizedRole(assocUser.role) === option.value
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-slate-500'
                }`}>
                  {getNormalizedRole(assocUser.role) === option.value && (
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
          onClick={onClose}
          className="w-full px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

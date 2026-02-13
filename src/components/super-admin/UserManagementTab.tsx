import { useState, useEffect } from 'react';
import {
  Users, Shield, Plus, Edit2, Trash2, Search, Building, MapPin,
  Globe, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  Mail, Key, UserPlus, Eye, Lock, Crown, X, AlertCircle
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface UserManagementTabProps {
  darkMode: boolean;
}

interface SuperAdmin {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  access_level: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  org_name: string;
  org_type: string;
  org_id: string;
  created_at: string;
}

export function UserManagementTab({ darkMode }: UserManagementTabProps) {
  const { user } = useAuth();
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'super_admins' | 'all_users'>('super_admins');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [orgTypeFilter, setOrgTypeFilter] = useState('all');
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminLevel, setNewAdminLevel] = useState('full');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: admins } = await supabase
        .from('platform_super_admins')
        .select('*')
        .order('created_at');

      setSuperAdmins(admins || []);

      const [clubUsersRes, stateUsersRes, nationalUsersRes] = await Promise.all([
        supabase.from('user_clubs').select(`
          id, user_id, role, created_at,
          clubs:club_id (id, name)
        `),
        supabase.from('user_state_associations').select(`
          id, user_id, role, created_at,
          state_associations:state_association_id (id, name)
        `),
        supabase.from('user_national_associations').select(`
          id, user_id, role, created_at,
          national_associations:national_association_id (id, name)
        `),
      ]);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name');

      const profileMap: Record<string, string> = {};
      (profiles || []).forEach(p => {
        profileMap[p.id] = p.full_name || '';
      });

      const { data: authUsers } = await supabase.rpc('get_user_emails_for_super_admin').catch(() => ({ data: null }));
      const emailMap: Record<string, string> = {};
      if (authUsers) {
        authUsers.forEach((u: any) => { emailMap[u.id] = u.email; });
      }

      const allUsers: OrgUser[] = [];

      (clubUsersRes.data || []).forEach((uc: any) => {
        allUsers.push({
          id: uc.id,
          email: emailMap[uc.user_id] || '',
          full_name: profileMap[uc.user_id] || '',
          role: uc.role,
          org_name: uc.clubs?.name || 'Unknown Club',
          org_type: 'club',
          org_id: uc.clubs?.id || '',
          created_at: uc.created_at,
        });
      });

      (stateUsersRes.data || []).forEach((us: any) => {
        allUsers.push({
          id: us.id,
          email: emailMap[us.user_id] || '',
          full_name: profileMap[us.user_id] || '',
          role: us.role,
          org_name: us.state_associations?.name || 'Unknown State',
          org_type: 'state',
          org_id: us.state_associations?.id || '',
          created_at: us.created_at,
        });
      });

      (nationalUsersRes.data || []).forEach((un: any) => {
        allUsers.push({
          id: un.id,
          email: emailMap[un.user_id] || '',
          full_name: profileMap[un.user_id] || '',
          role: un.role,
          org_name: un.national_associations?.name || 'Unknown National',
          org_type: 'national',
          org_id: un.national_associations?.id || '',
          created_at: un.created_at,
        });
      });

      setOrgUsers(allUsers);
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const addSuperAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    setSaving(true);

    try {
      const { data: userData } = await supabase.rpc('get_user_id_by_email', { email_input: newAdminEmail.trim() });

      if (!userData) {
        alert('User not found. They must have an existing account.');
        setSaving(false);
        return;
      }

      await supabase.from('platform_super_admins').insert({
        user_id: userData,
        email: newAdminEmail.trim(),
        display_name: newAdminName.trim() || newAdminEmail.trim(),
        access_level: newAdminLevel,
        granted_by: user?.id,
      });

      setShowAddAdmin(false);
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminLevel('full');
      loadData();
    } catch (err) {
      console.error('Error adding super admin:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleAdminActive = async (admin: SuperAdmin) => {
    await supabase
      .from('platform_super_admins')
      .update({ is_active: !admin.is_active, updated_at: new Date().toISOString() })
      .eq('id', admin.id);
    loadData();
  };

  const removeAdmin = async (adminId: string) => {
    if (!confirm('Are you sure you want to remove this super admin?')) return;
    await supabase.from('platform_super_admins').delete().eq('id', adminId);
    loadData();
  };

  const updateUserRole = async (userId: string, orgType: string, orgId: string, newRole: string) => {
    const table = orgType === 'club' ? 'user_clubs' : orgType === 'state' ? 'user_state_associations' : 'user_national_associations';
    const idCol = orgType === 'club' ? 'club_id' : orgType === 'state' ? 'state_association_id' : 'national_association_id';

    await supabase
      .from(table)
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq(idCol, orgId);
    loadData();
  };

  const filteredUsers = orgUsers.filter(u => {
    if (searchTerm && !u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) && !u.email.toLowerCase().includes(searchTerm.toLowerCase()) && !u.org_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (orgTypeFilter !== 'all' && u.org_type !== orgTypeFilter) return false;
    return true;
  });

  const uniqueRoles = [...new Set(orgUsers.map(u => u.role))].sort();

  const accessLevelConfig: Record<string, { label: string; color: string; icon: typeof Shield }> = {
    full: { label: 'Full Access', color: darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700', icon: Crown },
    read_only: { label: 'Read Only', color: darkMode ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700', icon: Eye },
    billing_only: { label: 'Billing Only', color: darkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700', icon: Key },
  };

  const orgTypeIcon = (type: string) => {
    if (type === 'club') return <Building size={14} className="text-emerald-500" />;
    if (type === 'state') return <MapPin size={14} className="text-amber-500" />;
    return <Globe size={14} className="text-sky-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {(['super_admins', 'all_users'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === mode
                ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
                : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {mode === 'super_admins' ? (
              <><Shield size={14} className="inline mr-1.5" />Platform Admins</>
            ) : (
              <><Users size={14} className="inline mr-1.5" />All Organization Users</>
            )}
          </button>
        ))}
      </div>

      {viewMode === 'super_admins' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Platform Super Admins
            </h3>
            <button
              onClick={() => setShowAddAdmin(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
            >
              <UserPlus size={16} />
              Add Admin
            </button>
          </div>

          {showAddAdmin && (
            <div className={`rounded-xl border p-5 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Add Super Admin</h4>
                <button onClick={() => setShowAddAdmin(false)}>
                  <X size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Email</label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Display Name</label>
                  <input
                    type="text"
                    value={newAdminName}
                    onChange={e => setNewAdminName(e.target.value)}
                    placeholder="Full name"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Access Level</label>
                  <select
                    value={newAdminLevel}
                    onChange={e => setNewAdminLevel(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    <option value="full">Full Access</option>
                    <option value="read_only">Read Only</option>
                    <option value="billing_only">Billing Only</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddAdmin(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={addSuperAdmin}
                  disabled={!newAdminEmail.trim() || saving}
                  className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Add Admin'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {superAdmins.map(admin => {
              const level = accessLevelConfig[admin.access_level] || accessLevelConfig.full;
              const LevelIcon = level.icon;
              return (
                <div
                  key={admin.id}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    admin.is_active
                      ? darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'
                      : darkMode ? 'bg-slate-800/20 border-slate-700/30 opacity-60' : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${darkMode ? 'bg-sky-500/20' : 'bg-sky-100'}`}>
                      <span className="text-sky-500 font-bold text-sm">
                        {admin.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{admin.display_name}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${level.color}`}>
                          <LevelIcon size={10} />
                          {level.label}
                        </span>
                        {!admin.is_active && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${darkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700'}`}>
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{admin.email}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Added {new Date(admin.created_at).toLocaleDateString('en-AU')}
                        {admin.last_login_at && ` | Last login: ${new Date(admin.last_login_at).toLocaleDateString('en-AU')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAdminActive(admin)}
                      className={`p-2 rounded-lg transition-colors ${
                        admin.is_active
                          ? darkMode ? 'hover:bg-amber-500/20 text-amber-400' : 'hover:bg-amber-50 text-amber-600'
                          : darkMode ? 'hover:bg-emerald-500/20 text-emerald-400' : 'hover:bg-emerald-50 text-emerald-600'
                      }`}
                      title={admin.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {admin.is_active ? <Lock size={16} /> : <CheckCircle size={16} />}
                    </button>
                    <button
                      onClick={() => removeAdmin(admin.id)}
                      className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'all_users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or organization..."
                className={`w-full pl-8 pr-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
              />
            </div>
            <select
              value={orgTypeFilter}
              onChange={e => setOrgTypeFilter(e.target.value)}
              className={`px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
            >
              <option value="all">All Org Types</option>
              <option value="club">Clubs</option>
              <option value="state">State Associations</option>
              <option value="national">National Associations</option>
            </select>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className={`px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Showing {filteredUsers.length} of {orgUsers.length} user assignments
          </div>

          <div className={`rounded-xl border overflow-hidden ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-b border-slate-700/50' : 'text-slate-500 border-b border-slate-200'}`}>
                    <th className="p-4">User</th>
                    <th className="p-4">Organization</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Role</th>
                    <th className="p-4 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                  {filteredUsers.slice(0, 100).map((u) => (
                    <tr key={u.id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className="p-4">
                        <div>
                          <p className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{u.full_name || 'Unnamed'}</p>
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{u.email || 'No email'}</p>
                        </div>
                      </td>
                      <td className={`p-4 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{u.org_name}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5">
                          {orgTypeIcon(u.org_type)}
                          <span className={`text-xs capitalize ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.org_type}</span>
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          u.role === 'admin' || u.role === 'national_admin' || u.role === 'state_admin'
                            ? darkMode ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700'
                            : u.role === 'super_admin'
                              ? darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                              : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={`p-4 text-right text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(u.created_at).toLocaleDateString('en-AU')}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`p-12 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Users size={40} className="mx-auto mb-3 opacity-40" />
                        <p>No users match your filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredUsers.length > 100 && (
              <div className={`p-3 text-center text-xs ${darkMode ? 'text-slate-500 border-t border-slate-700/50' : 'text-slate-400 border-t border-slate-200'}`}>
                Showing first 100 of {filteredUsers.length} results. Use filters to narrow down.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

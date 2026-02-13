import { useState, useEffect, useMemo } from 'react';
import {
  Users, Shield, Trash2, Search, Building, MapPin,
  Globe, CheckCircle, XCircle,
  Mail, UserPlus, Eye, Lock, Crown, X, AlertCircle,
  ChevronDown, ArrowUpDown, RefreshCw, Download
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
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  org_name: string;
  org_type: string;
  org_id: string;
  created_at: string;
}

type SortField = 'full_name' | 'email' | 'org_name' | 'role' | 'created_at';
type SortDir = 'asc' | 'desc';

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
  const [sortField, setSortField] = useState<SortField>('full_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

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
          user_id: uc.user_id,
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
          user_id: us.user_id,
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
          user_id: un.user_id,
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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

      const existing = superAdmins.find(a => a.user_id === userData);
      if (existing) {
        alert('This user is already a platform admin.');
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
    if (admin.user_id === user?.id) {
      alert('You cannot deactivate your own admin account.');
      return;
    }
    await supabase
      .from('platform_super_admins')
      .update({ is_active: !admin.is_active, updated_at: new Date().toISOString() })
      .eq('id', admin.id);
    loadData();
  };

  const removeAdmin = async (adminId: string) => {
    const admin = superAdmins.find(a => a.id === adminId);
    if (admin?.user_id === user?.id) {
      alert('You cannot remove your own admin account.');
      return;
    }
    if (removeConfirm !== adminId) {
      setRemoveConfirm(adminId);
      return;
    }
    await supabase.from('platform_super_admins').delete().eq('id', adminId);
    setRemoveConfirm(null);
    loadData();
  };

  const updateUserRole = async (orgUser: OrgUser, newRole: string) => {
    const table = orgUser.org_type === 'club' ? 'user_clubs' : orgUser.org_type === 'state' ? 'user_state_associations' : 'user_national_associations';
    await supabase.from(table).update({ role: newRole }).eq('id', orgUser.id);
    setEditingRole(null);
    loadData();
  };

  const removeUserFromOrg = async (orgUser: OrgUser) => {
    if (removeConfirm !== orgUser.id) {
      setRemoveConfirm(orgUser.id);
      return;
    }
    const table = orgUser.org_type === 'club' ? 'user_clubs' : orgUser.org_type === 'state' ? 'user_state_associations' : 'user_national_associations';
    await supabase.from(table).delete().eq('id', orgUser.id);
    setRemoveConfirm(null);
    setSelectedUser(null);
    loadData();
  };

  const exportUsers = () => {
    const rows = filteredUsers.map(u => ({
      Name: u.full_name || 'Unnamed',
      Email: u.email || 'No email',
      Organization: u.org_name,
      Type: u.org_type,
      Role: u.role,
      Joined: new Date(u.created_at).toLocaleDateString('en-AU'),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filteredUsers = useMemo(() => {
    let result = orgUsers.filter(u => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!u.full_name.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term) && !u.org_name.toLowerCase().includes(term)) return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (orgTypeFilter !== 'all' && u.org_type !== orgTypeFilter) return false;
      return true;
    });

    result.sort((a, b) => {
      let aVal = (a as any)[sortField] || '';
      let bVal = (b as any)[sortField] || '';
      if (sortField === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [orgUsers, searchTerm, roleFilter, orgTypeFilter, sortField, sortDir]);

  const uniqueRoles = useMemo(() => [...new Set(orgUsers.map(u => u.role))].sort(), [orgUsers]);

  const userStats = useMemo(() => {
    const uniqueUserIds = new Set(orgUsers.map(u => u.user_id));
    const clubUsers = orgUsers.filter(u => u.org_type === 'club');
    const stateUsers = orgUsers.filter(u => u.org_type === 'state');
    const nationalUsers = orgUsers.filter(u => u.org_type === 'national');
    const adminCount = orgUsers.filter(u => ['admin', 'super_admin', 'state_admin', 'national_admin'].includes(u.role)).length;
    return { total: uniqueUserIds.size, assignments: orgUsers.length, clubs: clubUsers.length, state: stateUsers.length, national: nationalUsers.length, admins: adminCount };
  }, [orgUsers]);

  const accessLevelConfig: Record<string, { label: string; color: string; icon: typeof Shield }> = {
    full: { label: 'Full Access', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', icon: Crown },
    read_only: { label: 'Read Only', color: 'bg-sky-500/15 text-sky-400 border border-sky-500/20', icon: Eye },
    billing_only: { label: 'Billing Only', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', icon: Mail },
  };

  const orgTypeIcon = (type: string) => {
    if (type === 'club') return <Building size={14} className="text-emerald-500" />;
    if (type === 'state') return <MapPin size={14} className="text-amber-500" />;
    return <Globe size={14} className="text-sky-500" />;
  };

  const roleOptions: Record<string, string[]> = {
    club: ['admin', 'member', 'pro', 'scorer', 'observer'],
    state: ['state_admin', 'member'],
    national: ['national_admin', 'member'],
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="p-4 cursor-pointer select-none hover:text-slate-200 transition-colors"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortField === field ? 'text-sky-400' : 'opacity-30'} />
      </span>
    </th>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['super_admins', 'all_users'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => { setViewMode(mode); setSelectedUser(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === mode
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              {mode === 'super_admins' ? (
                <><Shield size={14} className="inline mr-1.5" />Platform Admins ({superAdmins.length})</>
              ) : (
                <><Users size={14} className="inline mr-1.5" />All Organization Users ({userStats.total})</>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/50 transition-colors"
          title="Refresh data"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {viewMode === 'super_admins' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
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
            <div className="rounded-2xl border p-5 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-white">Add Super Admin</h4>
                <button onClick={() => setShowAddAdmin(false)}>
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Email</label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={e => setNewAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Display Name</label>
                  <input
                    type="text"
                    value={newAdminName}
                    onChange={e => setNewAdminName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Access Level</label>
                  <select
                    value={newAdminLevel}
                    onChange={e => setNewAdminLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white"
                  >
                    <option value="full">Full Access</option>
                    <option value="read_only">Read Only</option>
                    <option value="billing_only">Billing Only</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                <AlertCircle size={12} className="inline mr-1" />
                The user must already have an account on the platform. They will be granted super admin access immediately.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddAdmin(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
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
            {superAdmins.length === 0 ? (
              <div className="rounded-2xl border p-12 text-center bg-slate-800/30 border-slate-700/50">
                <Shield size={40} className="mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400 font-medium">No platform admins configured</p>
                <p className="text-xs text-slate-500 mt-1">Add a super admin to get started</p>
              </div>
            ) : (
              superAdmins.map(admin => {
                const level = accessLevelConfig[admin.access_level] || accessLevelConfig.full;
                const LevelIcon = level.icon;
                const isCurrentUser = admin.user_id === user?.id;
                return (
                  <div
                    key={admin.id}
                    className={`flex items-center justify-between p-4 rounded-2xl border backdrop-blur-sm transition-all ${
                      admin.is_active
                        ? 'bg-slate-800/30 border-slate-700/50'
                        : 'bg-slate-800/20 border-slate-700/30 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-sky-500/20">
                        <span className="text-sky-400 font-bold text-sm">
                          {admin.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{admin.display_name}</p>
                          {isCurrentUser && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-400 border border-sky-500/20">
                              You
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${level.color}`}>
                            <LevelIcon size={10} />
                            {level.label}
                          </span>
                          {!admin.is_active && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500/15 text-red-400 border border-red-500/20">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400">{admin.email}</p>
                        <p className="text-xs text-slate-500">
                          Added {new Date(admin.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {admin.last_login_at && ` | Last login: ${new Date(admin.last_login_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </p>
                      </div>
                    </div>
                    {!isCurrentUser && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleAdminActive(admin)}
                          className={`p-2 rounded-lg transition-colors ${
                            admin.is_active
                              ? 'hover:bg-amber-500/20 text-amber-400'
                              : 'hover:bg-emerald-500/20 text-emerald-400'
                          }`}
                          title={admin.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {admin.is_active ? <Lock size={16} /> : <CheckCircle size={16} />}
                        </button>
                        <button
                          onClick={() => removeAdmin(admin.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            removeConfirm === admin.id
                              ? 'bg-red-500/20 text-red-400'
                              : 'hover:bg-red-500/20 text-red-400'
                          }`}
                          title={removeConfirm === admin.id ? 'Click again to confirm' : 'Remove'}
                        >
                          {removeConfirm === admin.id ? <XCircle size={16} /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {viewMode === 'all_users' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Unique Users', value: userStats.total, color: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', textColor: 'text-sky-400' },
              { label: 'Assignments', value: userStats.assignments, color: 'from-slate-600/20 to-slate-800/20', border: 'border-slate-600/30', textColor: 'text-slate-300' },
              { label: 'Club Users', value: userStats.clubs, color: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', textColor: 'text-emerald-400' },
              { label: 'State Users', value: userStats.state, color: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', textColor: 'text-amber-400' },
              { label: 'National Users', value: userStats.national, color: 'from-rose-500/20 to-rose-700/20', border: 'border-rose-500/30', textColor: 'text-rose-400' },
              { label: 'Admin Roles', value: userStats.admins, color: 'from-cyan-500/20 to-cyan-700/20', border: 'border-cyan-500/30', textColor: 'text-cyan-400' },
            ].map(stat => (
              <div key={stat.label} className={`rounded-2xl border p-4 bg-gradient-to-br ${stat.color} ${stat.border} backdrop-blur-sm`}>
                <p className={`text-2xl font-bold ${stat.textColor}`}>{stat.value}</p>
                <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or organization..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <select
              value={orgTypeFilter}
              onChange={e => setOrgTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white"
            >
              <option value="all">All Org Types</option>
              <option value="club">Clubs</option>
              <option value="state">State Associations</option>
              <option value="national">National Associations</option>
            </select>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white"
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map(role => (
                <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button
              onClick={exportUsers}
              disabled={filteredUsers.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>

          <div className="text-sm text-slate-400">
            Showing {filteredUsers.length} of {orgUsers.length} user assignments
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`${selectedUser ? 'lg:col-span-2' : 'lg:col-span-3'} rounded-2xl border overflow-hidden bg-slate-800/30 border-slate-700/50 backdrop-blur-sm`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
                      <SortHeader field="full_name" label="User" />
                      <SortHeader field="org_name" label="Organization" />
                      <th className="p-4">Type</th>
                      <SortHeader field="role" label="Role" />
                      <SortHeader field="created_at" label="Joined" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {filteredUsers.slice(0, 200).map((u) => (
                      <tr
                        key={u.id}
                        onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                        className={`cursor-pointer transition-colors ${
                          selectedUser?.id === u.id
                            ? 'bg-sky-500/10'
                            : 'hover:bg-slate-700/20'
                        }`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-700/50 text-xs font-bold text-slate-300 flex-shrink-0">
                              {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-white truncate">{u.full_name || 'Unnamed'}</p>
                              <p className="text-xs text-slate-500 truncate">{u.email || 'No email'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-slate-300">{u.org_name}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5">
                            {orgTypeIcon(u.org_type)}
                            <span className="text-xs capitalize text-slate-400">{u.org_type}</span>
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            u.role === 'admin' || u.role === 'national_admin' || u.role === 'state_admin'
                              ? 'bg-sky-500/15 text-sky-400'
                              : u.role === 'super_admin'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-slate-700 text-slate-300'
                          }`}>
                            {u.role.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right text-xs text-slate-400">
                          {new Date(u.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-slate-500">
                          <Users size={40} className="mx-auto mb-3 opacity-40" />
                          <p>No users match your filters.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredUsers.length > 200 && (
                <div className="p-3 text-center text-xs text-slate-500 border-t border-slate-700/50">
                  Showing first 200 of {filteredUsers.length} results. Use filters to narrow down.
                </div>
              )}
            </div>

            {selectedUser && (
              <div className="lg:col-span-1 rounded-2xl border bg-slate-800/30 border-slate-700/50 backdrop-blur-sm h-fit sticky top-28">
                <div className="p-4 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white text-sm">User Details</h3>
                    <button onClick={() => setSelectedUser(null)}>
                      <X size={16} className="text-slate-400" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center bg-sky-500/20 text-sky-400 font-bold text-lg">
                      {(selectedUser.full_name || selectedUser.email || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{selectedUser.full_name || 'Unnamed'}</p>
                      <p className="text-xs text-slate-400">{selectedUser.email || 'No email'}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase mb-1">Organization</p>
                      <div className="flex items-center gap-2">
                        {orgTypeIcon(selectedUser.org_type)}
                        <span className="text-sm text-slate-200">{selectedUser.org_name}</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase mb-1">Role</p>
                      {editingRole === selectedUser.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            defaultValue={selectedUser.role}
                            onChange={e => updateUserRole(selectedUser, e.target.value)}
                            className="flex-1 px-2 py-1.5 rounded-lg border text-xs bg-slate-800 border-slate-600 text-white"
                          >
                            {(roleOptions[selectedUser.org_type] || ['member', 'admin']).map(r => (
                              <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                          <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-200">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            selectedUser.role.includes('admin')
                              ? 'bg-sky-500/15 text-sky-400'
                              : 'bg-slate-700 text-slate-300'
                          }`}>
                            {selectedUser.role.replace(/_/g, ' ')}
                          </span>
                          <button
                            onClick={() => setEditingRole(selectedUser.id)}
                            className="text-xs text-sky-400 hover:text-sky-300"
                          >
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase mb-1">Joined</p>
                      <p className="text-sm text-slate-300">
                        {new Date(selectedUser.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-700/50">
                    <button
                      onClick={() => removeUserFromOrg(selectedUser)}
                      className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        removeConfirm === selectedUser.id
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'text-red-400 hover:bg-red-500/10 border border-transparent'
                      }`}
                    >
                      <Trash2 size={14} />
                      {removeConfirm === selectedUser.id ? 'Click again to confirm removal' : 'Remove from organization'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

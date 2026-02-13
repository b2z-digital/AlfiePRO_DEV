import { useState, useEffect, useMemo } from 'react';
import {
  Users, Shield, Trash2, Search, Building, MapPin,
  Globe, CheckCircle, XCircle,
  Mail, UserPlus, Eye, Lock, Crown, X, AlertCircle,
  ArrowUpDown, RefreshCw, Download
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

interface ClubUser {
  record_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  club_id: string;
  club_name: string;
  created_at: string;
}

interface AssociationUser {
  record_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  org_id: string;
  org_name: string;
  org_type: string;
  created_at: string;
}

type ViewMode = 'platform_admins' | 'associations' | 'clubs';
type SortField = 'full_name' | 'email' | 'org_name' | 'role' | 'created_at';
type SortDir = 'asc' | 'desc';

export function UserManagementTab({ darkMode }: UserManagementTabProps) {
  const { user } = useAuth();
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [clubUsers, setClubUsers] = useState<ClubUser[]>([]);
  const [associationUsers, setAssociationUsers] = useState<AssociationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('platform_admins');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [orgTypeFilter, setOrgTypeFilter] = useState('all');
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminLevel, setNewAdminLevel] = useState('full');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserOrgId, setNewUserOrgId] = useState('');
  const [newUserRole, setNewUserRole] = useState('member');
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState<SortField>('full_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedUser, setSelectedUser] = useState<ClubUser | AssociationUser | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [stateAssociations, setStateAssociations] = useState<{ id: string; name: string }[]>([]);
  const [nationalAssociations, setNationalAssociations] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError(null);
    try {
      const [adminsRes, clubUsersRes, assocUsersRes, clubsRes, stateRes, nationalRes] = await Promise.all([
        supabase.from('platform_super_admins').select('*').order('created_at'),
        supabase.rpc('get_all_club_users_for_super_admin'),
        supabase.rpc('get_all_association_users_for_super_admin'),
        supabase.from('clubs').select('id, name').order('name'),
        supabase.from('state_associations').select('id, name').order('name'),
        supabase.from('national_associations').select('id, name').order('name'),
      ]);

      setSuperAdmins(adminsRes.data || []);
      setClubUsers(clubUsersRes.data || []);
      setAssociationUsers(assocUsersRes.data || []);
      setClubs(clubsRes.data || []);
      setStateAssociations(stateRes.data || []);
      setNationalAssociations(nationalRes.data || []);

      if (clubUsersRes.error) {
        console.error('Club users error:', clubUsersRes.error);
        setError('Failed to load club users: ' + clubUsersRes.error.message);
      }
      if (assocUsersRes.error) {
        console.error('Association users error:', assocUsersRes.error);
        setError('Failed to load association users: ' + assocUsersRes.error.message);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
      setError('Failed to load data');
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
      const { data: userData, error: userErr } = await supabase.rpc('get_user_id_by_email', { email_input: newAdminEmail.trim() });
      if (userErr || !userData) {
        alert('User not found. They must have an existing account.');
        setSaving(false);
        return;
      }
      if (superAdmins.find(a => a.user_id === userData)) {
        alert('This user is already a platform admin.');
        setSaving(false);
        return;
      }
      const { error: insertErr } = await supabase.from('platform_super_admins').insert({
        user_id: userData,
        email: newAdminEmail.trim(),
        display_name: newAdminName.trim() || newAdminEmail.trim(),
        access_level: newAdminLevel,
        granted_by: user?.id,
      });
      if (insertErr) {
        alert('Error adding admin: ' + insertErr.message);
      } else {
        setShowAddAdmin(false);
        setNewAdminEmail('');
        setNewAdminName('');
        setNewAdminLevel('full');
        loadData();
      }
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

  const updateUserRole = async (u: ClubUser | AssociationUser, newRole: string) => {
    const isClub = 'club_id' in u;
    const table = isClub ? 'user_clubs' : (u as AssociationUser).org_type === 'state' ? 'user_state_associations' : 'user_national_associations';
    const { error: err } = await supabase.rpc('update_user_org_role_for_super_admin', {
      p_target_table: table,
      p_record_id: isClub ? (u as ClubUser).record_id : (u as AssociationUser).record_id,
      p_new_role: newRole,
    });
    if (err) {
      alert('Error updating role: ' + err.message);
    } else {
      setEditingRole(null);
      loadData();
    }
  };

  const removeUserFromOrg = async (u: ClubUser | AssociationUser) => {
    const recordId = 'club_id' in u ? (u as ClubUser).record_id : (u as AssociationUser).record_id;
    if (removeConfirm !== recordId) {
      setRemoveConfirm(recordId);
      return;
    }
    const isClub = 'club_id' in u;
    const table = isClub ? 'user_clubs' : (u as AssociationUser).org_type === 'state' ? 'user_state_associations' : 'user_national_associations';
    const { error: err } = await supabase.rpc('remove_user_from_org_for_super_admin', {
      p_target_table: table,
      p_record_id: recordId,
    });
    if (err) {
      alert('Error removing user: ' + err.message);
    } else {
      setRemoveConfirm(null);
      setSelectedUser(null);
      loadData();
    }
  };

  const addUserToOrg = async () => {
    if (!newUserEmail.trim() || !newUserOrgId) return;
    setSaving(true);
    try {
      const orgType = viewMode === 'clubs' ? 'club' : (
        stateAssociations.find(s => s.id === newUserOrgId) ? 'state' : 'national'
      );
      const { error: err } = await supabase.rpc('add_user_to_org_for_super_admin', {
        p_user_email: newUserEmail.trim(),
        p_org_type: orgType,
        p_org_id: newUserOrgId,
        p_role: newUserRole,
      });
      if (err) {
        alert('Error adding user: ' + err.message);
      } else {
        setShowAddUser(false);
        setNewUserEmail('');
        setNewUserOrgId('');
        setNewUserRole('member');
        loadData();
      }
    } catch (err: any) {
      alert('Error: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortData = <T extends Record<string, any>>(data: T[]): T[] => {
    return [...data].sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
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
  };

  const filteredClubUsers = useMemo(() => {
    let result = clubUsers.filter(u => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!u.full_name.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term) && !u.club_name.toLowerCase().includes(term)) return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      return true;
    });
    return sortData(result);
  }, [clubUsers, searchTerm, roleFilter, sortField, sortDir]);

  const filteredAssocUsers = useMemo(() => {
    let result = associationUsers.filter(u => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!u.full_name.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term) && !u.org_name.toLowerCase().includes(term)) return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (orgTypeFilter !== 'all' && u.org_type !== orgTypeFilter) return false;
      return true;
    });
    return sortData(result);
  }, [associationUsers, searchTerm, roleFilter, orgTypeFilter, sortField, sortDir]);

  const clubRoles = useMemo(() => [...new Set(clubUsers.map(u => u.role))].sort(), [clubUsers]);
  const assocRoles = useMemo(() => [...new Set(associationUsers.map(u => u.role))].sort(), [associationUsers]);

  const clubStats = useMemo(() => {
    const uniqueUsers = new Set(clubUsers.map(u => u.user_id));
    const uniqueClubs = new Set(clubUsers.map(u => u.club_id));
    const admins = clubUsers.filter(u => u.role === 'admin').length;
    return { users: uniqueUsers.size, assignments: clubUsers.length, clubs: uniqueClubs.size, admins };
  }, [clubUsers]);

  const assocStats = useMemo(() => {
    const uniqueUsers = new Set(associationUsers.map(u => u.user_id));
    const stateCount = associationUsers.filter(u => u.org_type === 'state').length;
    const nationalCount = associationUsers.filter(u => u.org_type === 'national').length;
    const admins = associationUsers.filter(u => u.role.includes('admin')).length;
    return { users: uniqueUsers.size, assignments: associationUsers.length, state: stateCount, national: nationalCount, admins };
  }, [associationUsers]);

  const exportUsers = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const rows = data.map((u: any) => ({
      Name: u.full_name || 'Unnamed',
      Email: u.email || 'No email',
      Organization: u.club_name || u.org_name || '',
      Type: u.org_type || 'club',
      Role: u.role,
      Joined: new Date(u.created_at).toLocaleDateString('en-AU'),
    }));
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const accessLevelConfig: Record<string, { label: string; color: string; icon: typeof Shield }> = {
    full: { label: 'Full Access', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', icon: Crown },
    read_only: { label: 'Read Only', color: 'bg-sky-500/15 text-sky-400 border border-sky-500/20', icon: Eye },
    billing_only: { label: 'Billing Only', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', icon: Mail },
  };

  const clubRoleOptions = ['admin', 'member', 'pro', 'scorer', 'observer'];
  const stateRoleOptions = ['state_admin', 'member'];
  const nationalRoleOptions = ['national_admin', 'member'];

  const getRoleOptions = (u: ClubUser | AssociationUser) => {
    if ('club_id' in u) return clubRoleOptions;
    const au = u as AssociationUser;
    return au.org_type === 'state' ? stateRoleOptions : nationalRoleOptions;
  };

  const getRecordId = (u: ClubUser | AssociationUser) => {
    return 'club_id' in u ? (u as ClubUser).record_id : (u as AssociationUser).record_id;
  };

  const getOrgName = (u: ClubUser | AssociationUser) => {
    return 'club_id' in u ? (u as ClubUser).club_name : (u as AssociationUser).org_name;
  };

  const orgTypeIcon = (type: string) => {
    if (type === 'club') return <Building size={14} className="text-emerald-400" />;
    if (type === 'state') return <MapPin size={14} className="text-amber-400" />;
    return <Globe size={14} className="text-sky-400" />;
  };

  const roleBadge = (role: string) => (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
      role === 'admin' || role === 'national_admin' || role === 'state_admin'
        ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20'
        : role === 'super_admin'
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
          : role === 'pro'
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
            : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
    }`}>
      {role.replace(/_/g, ' ')}
    </span>
  );

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-5 py-4 cursor-pointer select-none hover:text-slate-200 transition-colors"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortField === field ? 'text-sky-400' : 'opacity-30'} />
      </span>
    </th>
  );

  const UserDetailPanel = ({ u }: { u: ClubUser | AssociationUser }) => {
    const recordId = getRecordId(u);
    return (
      <div className="lg:col-span-1 rounded-2xl border bg-slate-800/30 border-slate-700/50 backdrop-blur-sm h-fit sticky top-28">
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">User Details</h3>
            <button onClick={() => setSelectedUser(null)}>
              <X size={16} className="text-slate-400 hover:text-slate-200 transition-colors" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-sky-500/20 text-sky-400 font-bold text-lg flex-shrink-0">
              {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{u.full_name || 'Unnamed'}</p>
              <p className="text-xs text-slate-400 truncate">{u.email || 'No email'}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Organization</p>
              <div className="flex items-center gap-2">
                {orgTypeIcon('club_id' in u ? 'club' : (u as AssociationUser).org_type)}
                <span className="text-sm text-slate-200">{getOrgName(u)}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Role</p>
              {editingRole === recordId ? (
                <div className="flex items-center gap-2">
                  <select
                    defaultValue={u.role}
                    onChange={e => updateUserRole(u, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border text-xs bg-slate-800 border-slate-600 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  >
                    {getRoleOptions(u).map(r => (
                      <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-200">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {roleBadge(u.role)}
                  <button
                    onClick={() => setEditingRole(recordId)}
                    className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Joined</p>
              <p className="text-sm text-slate-300">
                {new Date(u.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700/50">
            <button
              onClick={() => removeUserFromOrg(u)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                removeConfirm === recordId
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20'
              }`}
            >
              <Trash2 size={14} />
              {removeConfirm === recordId ? 'Click again to confirm removal' : 'Remove from organization'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs: { id: ViewMode; label: string; icon: typeof Shield; count: number }[] = [
    { id: 'platform_admins', label: 'Platform Admins', icon: Shield, count: superAdmins.length },
    { id: 'associations', label: 'All Associations', icon: Globe, count: assocStats.assignments },
    { id: 'clubs', label: 'Clubs', icon: Building, count: clubStats.assignments },
  ];

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => { setViewMode(tab.id); setSelectedUser(null); setSearchTerm(''); setRoleFilter('all'); setOrgTypeFilter('all'); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  viewMode === tab.id
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    : 'text-slate-400 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon size={15} />
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-800/50 transition-colors"
          title="Refresh data"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {viewMode === 'platform_admins' && (
        <PlatformAdminsView
          superAdmins={superAdmins}
          currentUserId={user?.id}
          showAddAdmin={showAddAdmin}
          setShowAddAdmin={setShowAddAdmin}
          newAdminEmail={newAdminEmail}
          setNewAdminEmail={setNewAdminEmail}
          newAdminName={newAdminName}
          setNewAdminName={setNewAdminName}
          newAdminLevel={newAdminLevel}
          setNewAdminLevel={setNewAdminLevel}
          saving={saving}
          addSuperAdmin={addSuperAdmin}
          toggleAdminActive={toggleAdminActive}
          removeAdmin={removeAdmin}
          removeConfirm={removeConfirm}
          accessLevelConfig={accessLevelConfig}
        />
      )}

      {viewMode === 'associations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Unique Users', value: assocStats.users, color: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', textColor: 'text-sky-400' },
              { label: 'Assignments', value: assocStats.assignments, color: 'from-slate-600/20 to-slate-800/20', border: 'border-slate-600/30', textColor: 'text-slate-300' },
              { label: 'State Users', value: assocStats.state, color: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', textColor: 'text-amber-400' },
              { label: 'National Users', value: assocStats.national, color: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', textColor: 'text-emerald-400' },
              { label: 'Admin Roles', value: assocStats.admins, color: 'from-cyan-500/20 to-cyan-700/20', border: 'border-cyan-500/30', textColor: 'text-cyan-400' },
            ].map(stat => (
              <div key={stat.label} className={`rounded-2xl border p-5 bg-gradient-to-br ${stat.color} ${stat.border} backdrop-blur-sm`}>
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
                placeholder="Search by name, email, or association..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <select
              value={orgTypeFilter}
              onChange={e => setOrgTypeFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white"
            >
              <option value="all">All Types</option>
              <option value="state">State Associations</option>
              <option value="national">National Associations</option>
            </select>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white"
            >
              <option value="all">All Roles</option>
              {assocRoles.map(role => (
                <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors"
            >
              <UserPlus size={15} />
              Add User
            </button>
            <button
              onClick={() => exportUsers(filteredAssocUsers, 'association-users')}
              disabled={filteredAssocUsers.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              Export
            </button>
          </div>

          {showAddUser && (
            <AddUserForm
              title="Add User to Association"
              orgOptions={[
                ...nationalAssociations.map(n => ({ id: n.id, name: n.name, type: 'national' })),
                ...stateAssociations.map(s => ({ id: s.id, name: s.name, type: 'state' })),
              ]}
              roleOptions={[...stateRoleOptions, ...nationalRoleOptions.filter(r => !stateRoleOptions.includes(r))]}
              email={newUserEmail}
              setEmail={setNewUserEmail}
              orgId={newUserOrgId}
              setOrgId={setNewUserOrgId}
              role={newUserRole}
              setRole={setNewUserRole}
              saving={saving}
              onSave={addUserToOrg}
              onCancel={() => { setShowAddUser(false); setNewUserEmail(''); setNewUserOrgId(''); setNewUserRole('member'); }}
            />
          )}

          <div className="text-sm text-slate-400">
            Showing {filteredAssocUsers.length} of {associationUsers.length} user assignments
          </div>

          <UserTable
            users={filteredAssocUsers}
            selectedUser={selectedUser}
            setSelectedUser={setSelectedUser}
            SortHeader={SortHeader}
            roleBadge={roleBadge}
            orgTypeIcon={orgTypeIcon}
            getRecordId={getRecordId}
            getOrgName={getOrgName}
            showType={true}
            getType={(u: any) => u.org_type}
          />
        </div>
      )}

      {viewMode === 'clubs' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Unique Users', value: clubStats.users, color: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', textColor: 'text-sky-400' },
              { label: 'Assignments', value: clubStats.assignments, color: 'from-slate-600/20 to-slate-800/20', border: 'border-slate-600/30', textColor: 'text-slate-300' },
              { label: 'Active Clubs', value: clubStats.clubs, color: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', textColor: 'text-emerald-400' },
              { label: 'Admin Roles', value: clubStats.admins, color: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', textColor: 'text-amber-400' },
            ].map(stat => (
              <div key={stat.label} className={`rounded-2xl border p-5 bg-gradient-to-br ${stat.color} ${stat.border} backdrop-blur-sm`}>
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
                placeholder="Search by name, email, or club..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white"
            >
              <option value="all">All Roles</option>
              {clubRoles.map(role => (
                <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors"
            >
              <UserPlus size={15} />
              Add User
            </button>
            <button
              onClick={() => exportUsers(filteredClubUsers, 'club-users')}
              disabled={filteredClubUsers.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              Export
            </button>
          </div>

          {showAddUser && (
            <AddUserForm
              title="Add User to Club"
              orgOptions={clubs.map(c => ({ id: c.id, name: c.name, type: 'club' }))}
              roleOptions={clubRoleOptions}
              email={newUserEmail}
              setEmail={setNewUserEmail}
              orgId={newUserOrgId}
              setOrgId={setNewUserOrgId}
              role={newUserRole}
              setRole={setNewUserRole}
              saving={saving}
              onSave={addUserToOrg}
              onCancel={() => { setShowAddUser(false); setNewUserEmail(''); setNewUserOrgId(''); setNewUserRole('member'); }}
            />
          )}

          <div className="text-sm text-slate-400">
            Showing {filteredClubUsers.length} of {clubUsers.length} user assignments
          </div>

          <UserTable
            users={filteredClubUsers.map(u => ({ ...u, org_name: u.club_name, org_type: 'club' }))}
            selectedUser={selectedUser}
            setSelectedUser={(u) => {
              if (!u) { setSelectedUser(null); return; }
              const original = clubUsers.find(cu => cu.record_id === (u as any).record_id);
              setSelectedUser(original || null);
            }}
            SortHeader={SortHeader}
            roleBadge={roleBadge}
            orgTypeIcon={orgTypeIcon}
            getRecordId={(u: any) => u.record_id}
            getOrgName={(u: any) => u.org_name || u.club_name}
            showType={false}
            getType={() => 'club'}
          />
        </div>
      )}

      {selectedUser && <UserDetailPanel u={selectedUser} />}
    </div>
  );
}

function PlatformAdminsView({
  superAdmins, currentUserId, showAddAdmin, setShowAddAdmin,
  newAdminEmail, setNewAdminEmail, newAdminName, setNewAdminName,
  newAdminLevel, setNewAdminLevel, saving, addSuperAdmin,
  toggleAdminActive, removeAdmin, removeConfirm, accessLevelConfig,
}: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Platform Super Admins</h3>
          <p className="text-sm text-slate-400 mt-1">Manage users with platform-level access to the management dashboard</p>
        </div>
        <button
          onClick={() => setShowAddAdmin(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors"
        >
          <UserPlus size={16} />
          Add Admin
        </button>
      </div>

      {showAddAdmin && (
        <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-5">
            <h4 className="font-semibold text-white">Add Super Admin</h4>
            <button onClick={() => setShowAddAdmin(false)}>
              <X size={16} className="text-slate-400 hover:text-slate-200 transition-colors" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Email</label>
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e: any) => setNewAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Display Name</label>
              <input
                type="text"
                value={newAdminName}
                onChange={(e: any) => setNewAdminName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Access Level</label>
              <select
                value={newAdminLevel}
                onChange={(e: any) => setNewAdminLevel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white"
              >
                <option value="full">Full Access</option>
                <option value="read_only">Read Only</option>
                <option value="billing_only">Billing Only</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-5 flex items-center gap-1.5">
            <AlertCircle size={12} />
            The user must already have an account on the platform. They will be granted super admin access immediately.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowAddAdmin(false)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addSuperAdmin}
              disabled={!newAdminEmail.trim() || saving}
              className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Admin'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {superAdmins.length === 0 ? (
          <div className="rounded-2xl border p-16 text-center bg-slate-800/30 border-slate-700/50">
            <Shield size={40} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 font-medium">No platform admins configured</p>
            <p className="text-xs text-slate-500 mt-1">Add a super admin to get started</p>
          </div>
        ) : (
          superAdmins.map((admin: any) => {
            const level = accessLevelConfig[admin.access_level] || accessLevelConfig.full;
            const LevelIcon = level.icon;
            const isCurrentUser = admin.user_id === currentUserId;
            return (
              <div
                key={admin.id}
                className={`flex items-center justify-between p-5 rounded-2xl border backdrop-blur-sm transition-all ${
                  admin.is_active
                    ? 'bg-slate-800/30 border-slate-700/50'
                    : 'bg-slate-800/20 border-slate-700/30 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-sky-500/20 flex-shrink-0">
                    <span className="text-sky-400 font-bold text-sm">
                      {admin.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{admin.display_name}</p>
                      {isCurrentUser && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-400 border border-sky-500/20">
                          You
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${level.color}`}>
                        <LevelIcon size={10} />
                        {level.label}
                      </span>
                      {!admin.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500/15 text-red-400 border border-red-500/20">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">{admin.email}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Added {new Date(admin.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {admin.last_login_at && ` | Last login: ${new Date(admin.last_login_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                </div>
                {!isCurrentUser && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAdminActive(admin)}
                      className={`p-2.5 rounded-xl transition-colors ${
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
                      className={`p-2.5 rounded-xl transition-colors ${
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
  );
}

function AddUserForm({ title, orgOptions, roleOptions, email, setEmail, orgId, setOrgId, role, setRole, saving, onSave, onCancel }: {
  title: string;
  orgOptions: { id: string; name: string; type: string }[];
  roleOptions: string[];
  email: string;
  setEmail: (v: string) => void;
  orgId: string;
  setOrgId: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-5">
        <h4 className="font-semibold text-white">{title}</h4>
        <button onClick={onCancel}>
          <X size={16} className="text-slate-400 hover:text-slate-200 transition-colors" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1.5 text-slate-300">User Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-slate-300">Organization</label>
          <select
            value={orgId}
            onChange={e => setOrgId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white"
          >
            <option value="">Select organization...</option>
            {orgOptions.map(org => (
              <option key={org.id} value={org.id}>
                {org.name} {org.type !== 'club' ? `(${org.type})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-slate-300">Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white"
          >
            {roleOptions.map(r => (
              <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-5 flex items-center gap-1.5">
        <AlertCircle size={12} />
        The user must already have an account. They will be added to the organization immediately.
      </p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!email.trim() || !orgId || saving}
          className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add User'}
        </button>
      </div>
    </div>
  );
}

function UserTable({ users, selectedUser, setSelectedUser, SortHeader, roleBadge, orgTypeIcon, getRecordId, getOrgName, showType, getType }: {
  users: any[];
  selectedUser: any;
  setSelectedUser: (u: any) => void;
  SortHeader: any;
  roleBadge: (role: string) => JSX.Element;
  orgTypeIcon: (type: string) => JSX.Element;
  getRecordId: (u: any) => string;
  getOrgName: (u: any) => string;
  showType: boolean;
  getType: (u: any) => string;
}) {
  return (
    <div className={`grid grid-cols-1 ${selectedUser ? 'lg:grid-cols-3' : ''} gap-4`}>
      <div className={`${selectedUser ? 'lg:col-span-2' : ''} rounded-2xl border overflow-hidden bg-slate-800/30 border-slate-700/50 backdrop-blur-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
                <SortHeader field="full_name" label="User" />
                <SortHeader field="org_name" label="Organization" />
                {showType && <th className="px-5 py-4">Type</th>}
                <SortHeader field="role" label="Role" />
                <SortHeader field="created_at" label="Joined" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {users.slice(0, 200).map((u: any) => {
                const recordId = getRecordId(u);
                const selectedId = selectedUser ? getRecordId(selectedUser) : null;
                return (
                  <tr
                    key={recordId}
                    onClick={() => setSelectedUser(selectedId === recordId ? null : u)}
                    className={`cursor-pointer transition-colors ${
                      selectedId === recordId
                        ? 'bg-sky-500/10'
                        : 'hover:bg-slate-700/20'
                    }`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-700/50 text-xs font-bold text-slate-300 flex-shrink-0">
                          {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-white truncate">{u.full_name || 'Unnamed'}</p>
                          <p className="text-xs text-slate-500 truncate">{u.email || 'No email'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-300">{getOrgName(u)}</td>
                    {showType && (
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5">
                          {orgTypeIcon(getType(u))}
                          <span className="text-xs capitalize text-slate-400">{getType(u)}</span>
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-4">{roleBadge(u.role)}</td>
                    <td className="px-5 py-4 text-right text-xs text-slate-400">
                      {new Date(u.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={showType ? 5 : 4} className="p-16 text-center text-slate-500">
                    <Users size={40} className="mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No users found</p>
                    <p className="text-xs mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {users.length > 200 && (
          <div className="p-4 text-center text-xs text-slate-500 border-t border-slate-700/50">
            Showing first 200 of {users.length} results. Use filters to narrow down.
          </div>
        )}
      </div>
    </div>
  );
}

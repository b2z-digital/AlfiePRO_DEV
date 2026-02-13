import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users, Shield, Trash2, Search, Building, MapPin,
  Globe, CheckCircle, XCircle,
  Mail, UserPlus, Eye, Lock, Crown, X, AlertCircle,
  RefreshCw, Download, ChevronRight, ChevronDown, ArrowLeft
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
  avatar_url: string;
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
  avatar_url: string;
  role: string;
  org_id: string;
  org_name: string;
  org_type: string;
  created_at: string;
}

interface PlatformUser {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string;
}

interface OrgDetail {
  id: string;
  name: string;
  type: 'club' | 'state' | 'national';
}

interface OrgItem {
  id: string;
  name: string;
}

type ViewMode = 'platform_admins' | 'associations' | 'clubs';

function UserAvatar({ name, email, avatarUrl, size = 'sm' }: { name: string; email: string; avatarUrl?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-14 h-14 text-lg' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-9 h-9 text-xs';
  const initials = (name?.trim() || email || '?').slice(0, 2).toUpperCase();
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`${dims} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`${dims} rounded-full flex items-center justify-center bg-slate-700/60 font-bold text-slate-300 flex-shrink-0`}>
      {initials}
    </div>
  );
}

export function UserManagementTab({ darkMode }: UserManagementTabProps) {
  const { user } = useAuth();
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [clubUsers, setClubUsers] = useState<ClubUser[]>([]);
  const [associationUsers, setAssociationUsers] = useState<AssociationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('platform_admins');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminLevel, setNewAdminLevel] = useState('full');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [clubs, setClubs] = useState<OrgItem[]>([]);
  const [stateAssociations, setStateAssociations] = useState<OrgItem[]>([]);
  const [nationalAssociations, setNationalAssociations] = useState<OrgItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null);
  const [showAddUserToOrg, setShowAddUserToOrg] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<PlatformUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedPlatformUser, setSelectedPlatformUser] = useState<PlatformUser | null>(null);
  const [addUserRole, setAddUserRole] = useState('member');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadData(); }, []);

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
      if (clubUsersRes.error) setError('Failed to load club users: ' + clubUsersRes.error.message);
      if (assocUsersRes.error) setError('Failed to load association users: ' + assocUsersRes.error.message);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const addSuperAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    setSaving(true);
    try {
      const { data: userData, error: userErr } = await supabase.rpc('get_user_id_by_email', { email_input: newAdminEmail.trim() });
      if (userErr || !userData) { alert('User not found. They must have an existing account.'); setSaving(false); return; }
      if (superAdmins.find(a => a.user_id === userData)) { alert('Already a platform admin.'); setSaving(false); return; }
      const { error: insertErr } = await supabase.from('platform_super_admins').insert({
        user_id: userData, email: newAdminEmail.trim(),
        display_name: newAdminName.trim() || newAdminEmail.trim(),
        access_level: newAdminLevel, granted_by: user?.id,
      });
      if (insertErr) alert('Error: ' + insertErr.message);
      else { setShowAddAdmin(false); setNewAdminEmail(''); setNewAdminName(''); setNewAdminLevel('full'); loadData(); }
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const toggleAdminActive = async (admin: SuperAdmin) => {
    if (admin.user_id === user?.id) { alert('You cannot deactivate your own account.'); return; }
    await supabase.from('platform_super_admins').update({ is_active: !admin.is_active, updated_at: new Date().toISOString() }).eq('id', admin.id);
    loadData();
  };

  const removeAdmin = async (adminId: string) => {
    const admin = superAdmins.find(a => a.id === adminId);
    if (admin?.user_id === user?.id) { alert('You cannot remove your own account.'); return; }
    if (removeConfirm !== adminId) { setRemoveConfirm(adminId); return; }
    await supabase.from('platform_super_admins').delete().eq('id', adminId);
    setRemoveConfirm(null); loadData();
  };

  const updateUserRole = async (u: ClubUser | AssociationUser, newRole: string) => {
    const isClub = 'club_id' in u;
    const table = isClub ? 'user_clubs' : (u as AssociationUser).org_type === 'state' ? 'user_state_associations' : 'user_national_associations';
    const { error: err } = await supabase.rpc('update_user_org_role_for_super_admin', {
      p_target_table: table, p_record_id: u.record_id, p_new_role: newRole,
    });
    if (err) alert('Error: ' + err.message);
    else { setEditingRole(null); loadData(); }
  };

  const removeUserFromOrg = async (u: ClubUser | AssociationUser) => {
    if (removeConfirm !== u.record_id) { setRemoveConfirm(u.record_id); return; }
    const isClub = 'club_id' in u;
    const table = isClub ? 'user_clubs' : (u as AssociationUser).org_type === 'state' ? 'user_state_associations' : 'user_national_associations';
    const { error: err } = await supabase.rpc('remove_user_from_org_for_super_admin', { p_target_table: table, p_record_id: u.record_id });
    if (err) alert('Error: ' + err.message);
    else { setRemoveConfirm(null); loadData(); }
  };

  const searchPlatformUsers = useCallback(async (term: string) => {
    if (!term.trim()) { setUserSearchResults([]); return; }
    setSearchingUsers(true);
    const { data, error: err } = await supabase.rpc('search_platform_users_for_super_admin', { p_search_term: term.trim() });
    if (!err && data) setUserSearchResults(data);
    setSearchingUsers(false);
  }, []);

  const handleUserSearchChange = (term: string) => {
    setUserSearchTerm(term);
    setSelectedPlatformUser(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchPlatformUsers(term), 300);
  };

  const addUserToOrgConfirm = async () => {
    if (!selectedPlatformUser || !orgDetail) return;
    setSaving(true);
    const { error: err } = await supabase.rpc('add_user_to_org_for_super_admin', {
      p_user_email: selectedPlatformUser.email, p_org_type: orgDetail.type, p_org_id: orgDetail.id, p_role: addUserRole,
    });
    if (err) alert('Error: ' + err.message);
    else {
      setShowAddUserToOrg(false); setSelectedPlatformUser(null); setUserSearchTerm(''); setUserSearchResults([]); setAddUserRole('member');
      loadData();
    }
    setSaving(false);
  };

  const toggleOrgExpanded = (orgId: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const clubsByOrg = useMemo(() => {
    const map = new Map<string, ClubUser[]>();
    clubUsers.forEach(u => {
      const list = map.get(u.club_id) || [];
      list.push(u);
      map.set(u.club_id, list);
    });
    return map;
  }, [clubUsers]);

  const assocsByOrg = useMemo(() => {
    const map = new Map<string, AssociationUser[]>();
    associationUsers.forEach(u => {
      const list = map.get(u.org_id) || [];
      list.push(u);
      map.set(u.org_id, list);
    });
    return map;
  }, [associationUsers]);

  const filteredClubs = useMemo(() => {
    if (!searchTerm) return clubs;
    const t = searchTerm.toLowerCase();
    return clubs.filter(c => {
      if (c.name.toLowerCase().includes(t)) return true;
      const users = clubsByOrg.get(c.id) || [];
      return users.some(u => u.full_name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
    });
  }, [clubs, searchTerm, clubsByOrg]);

  const filteredStateAssocs = useMemo(() => {
    if (!searchTerm) return stateAssociations;
    const t = searchTerm.toLowerCase();
    return stateAssociations.filter(a => {
      if (a.name.toLowerCase().includes(t)) return true;
      const users = assocsByOrg.get(a.id) || [];
      return users.some(u => u.full_name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
    });
  }, [stateAssociations, searchTerm, assocsByOrg]);

  const filteredNationalAssocs = useMemo(() => {
    if (!searchTerm) return nationalAssociations;
    const t = searchTerm.toLowerCase();
    return nationalAssociations.filter(a => {
      if (a.name.toLowerCase().includes(t)) return true;
      const users = assocsByOrg.get(a.id) || [];
      return users.some(u => u.full_name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
    });
  }, [nationalAssociations, searchTerm, assocsByOrg]);

  const orgDetailUsers = useMemo(() => {
    if (!orgDetail) return [];
    if (orgDetail.type === 'club') return clubUsers.filter(u => u.club_id === orgDetail.id);
    return associationUsers.filter(u => u.org_id === orgDetail.id);
  }, [orgDetail, clubUsers, associationUsers]);

  const clubStats = useMemo(() => {
    const uniqueUsers = new Set(clubUsers.map(u => u.user_id));
    return { users: uniqueUsers.size, assignments: clubUsers.length, clubs: clubs.length, admins: clubUsers.filter(u => u.role === 'admin').length };
  }, [clubUsers, clubs]);

  const assocStats = useMemo(() => {
    const uniqueUsers = new Set(associationUsers.map(u => u.user_id));
    return {
      users: uniqueUsers.size,
      totalOrgs: stateAssociations.length + nationalAssociations.length,
      stateOrgs: stateAssociations.length,
      nationalOrgs: nationalAssociations.length,
      admins: associationUsers.filter(u => u.role.includes('admin')).length,
    };
  }, [associationUsers, stateAssociations, nationalAssociations]);

  const exportUsers = (data: any[], filename: string) => {
    if (!data.length) return;
    const rows = data.map((u: any) => ({
      Name: u.full_name || 'Unnamed', Email: u.email || '', Organization: u.club_name || u.org_name || '',
      Type: u.org_type || 'club', Role: u.role, Joined: new Date(u.created_at).toLocaleDateString('en-AU'),
    }));
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
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
    return (u as AssociationUser).org_type === 'state' ? stateRoleOptions : nationalRoleOptions;
  };

  const getRoleOptionsForOrg = (org: OrgDetail) => {
    if (org.type === 'club') return clubRoleOptions;
    return org.type === 'state' ? stateRoleOptions : nationalRoleOptions;
  };

  const orgTypeIcon = (type: string, sz = 14) => {
    if (type === 'club') return <Building size={sz} className="text-emerald-400" />;
    if (type === 'state') return <MapPin size={sz} className="text-amber-400" />;
    return <Globe size={sz} className="text-sky-400" />;
  };

  const roleBadge = (role: string) => (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
      role === 'admin' || role === 'national_admin' || role === 'state_admin'
        ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20'
        : role === 'pro' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
        : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
    }`}>{role.replace(/_/g, ' ')}</span>
  );

  const handleOrgClick = (orgId: string, orgName: string, orgType: 'club' | 'state' | 'national') => {
    setOrgDetail({ id: orgId, name: orgName, type: orgType });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" /></div>;
  }

  if (orgDetail) {
    return (
      <OrgDetailView
        org={orgDetail}
        users={orgDetailUsers}
        onBack={() => { setOrgDetail(null); setShowAddUserToOrg(false); }}
        onRemoveUser={removeUserFromOrg}
        onUpdateRole={updateUserRole}
        removeConfirm={removeConfirm}
        editingRole={editingRole}
        setEditingRole={setEditingRole}
        roleBadge={roleBadge}
        getRoleOptions={getRoleOptions}
        orgTypeIcon={orgTypeIcon}
        showAddUserToOrg={showAddUserToOrg}
        setShowAddUserToOrg={setShowAddUserToOrg}
        userSearchTerm={userSearchTerm}
        handleUserSearchChange={handleUserSearchChange}
        userSearchResults={userSearchResults}
        searchingUsers={searchingUsers}
        selectedPlatformUser={selectedPlatformUser}
        setSelectedPlatformUser={setSelectedPlatformUser}
        addUserRole={addUserRole}
        setAddUserRole={setAddUserRole}
        addUserToOrgConfirm={addUserToOrgConfirm}
        saving={saving}
        getRoleOptionsForOrg={getRoleOptionsForOrg}
        existingUserIds={orgDetailUsers.map(u => u.user_id)}
      />
    );
  }

  const totalAssocs = stateAssociations.length + nationalAssociations.length;

  const tabs: { id: ViewMode; label: string; icon: typeof Shield; count: number }[] = [
    { id: 'platform_admins', label: 'Platform Admins', icon: Shield, count: superAdmins.length },
    { id: 'associations', label: 'All Associations', icon: Globe, count: totalAssocs },
    { id: 'clubs', label: 'Clubs', icon: Building, count: clubs.length },
  ];

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X size={16} /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id}
                onClick={() => { setViewMode(tab.id); setSearchTerm(''); setExpandedOrgs(new Set()); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  viewMode === tab.id ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'text-slate-400 hover:bg-slate-800/50 border border-transparent'
                }`}>
                <Icon size={15} /> {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-800/50 transition-colors" title="Refresh">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {viewMode === 'platform_admins' && (
        <PlatformAdminsView
          superAdmins={superAdmins} currentUserId={user?.id} showAddAdmin={showAddAdmin} setShowAddAdmin={setShowAddAdmin}
          newAdminEmail={newAdminEmail} setNewAdminEmail={setNewAdminEmail} newAdminName={newAdminName} setNewAdminName={setNewAdminName}
          newAdminLevel={newAdminLevel} setNewAdminLevel={setNewAdminLevel} saving={saving} addSuperAdmin={addSuperAdmin}
          toggleAdminActive={toggleAdminActive} removeAdmin={removeAdmin} removeConfirm={removeConfirm} accessLevelConfig={accessLevelConfig}
        />
      )}

      {viewMode === 'clubs' && (
        <ClubsGroupedView
          clubs={filteredClubs}
          clubsByOrg={clubsByOrg}
          expandedOrgs={expandedOrgs}
          toggleOrgExpanded={toggleOrgExpanded}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          clubStats={clubStats}
          handleOrgClick={handleOrgClick}
          roleBadge={roleBadge}
          editingRole={editingRole}
          setEditingRole={setEditingRole}
          updateUserRole={updateUserRole}
          removeUserFromOrg={removeUserFromOrg}
          removeConfirm={removeConfirm}
          getRoleOptions={getRoleOptions}
          exportUsers={() => exportUsers(clubUsers, 'club-users')}
          hasExportData={clubUsers.length > 0}
        />
      )}

      {viewMode === 'associations' && (
        <AssociationsGroupedView
          stateAssociations={filteredStateAssocs}
          nationalAssociations={filteredNationalAssocs}
          assocsByOrg={assocsByOrg}
          expandedOrgs={expandedOrgs}
          toggleOrgExpanded={toggleOrgExpanded}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          assocStats={assocStats}
          handleOrgClick={handleOrgClick}
          roleBadge={roleBadge}
          editingRole={editingRole}
          setEditingRole={setEditingRole}
          updateUserRole={updateUserRole}
          removeUserFromOrg={removeUserFromOrg}
          removeConfirm={removeConfirm}
          getRoleOptions={getRoleOptions}
          orgTypeIcon={orgTypeIcon}
          exportUsers={() => exportUsers(associationUsers, 'association-users')}
          hasExportData={associationUsers.length > 0}
        />
      )}
    </div>
  );
}

function OrgCard({ org, orgType, users, isExpanded, onToggle, onManage, roleBadge, editingRole, setEditingRole, updateUserRole, removeUserFromOrg, removeConfirm, getRoleOptions, orgTypeIcon }: {
  org: OrgItem; orgType: 'club' | 'state' | 'national'; users: (ClubUser | AssociationUser)[]; isExpanded: boolean;
  onToggle: () => void; onManage: () => void; roleBadge: (role: string) => JSX.Element;
  editingRole: string | null; setEditingRole: (id: string | null) => void;
  updateUserRole: (u: any, role: string) => void; removeUserFromOrg: (u: any) => void;
  removeConfirm: string | null; getRoleOptions: (u: any) => string[];
  orgTypeIcon?: (type: string, sz?: number) => JSX.Element;
}) {
  const userCount = users.length;
  const adminCount = users.filter(u => u.role.includes('admin')).length;

  return (
    <div className="rounded-2xl border bg-slate-800/30 border-slate-700/50 backdrop-blur-sm overflow-hidden transition-all">
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors text-left">
        <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 flex-shrink-0">
          {orgTypeIcon ? orgTypeIcon(orgType, 18) : <Building size={18} className="text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate">{org.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {userCount === 0 ? 'No users assigned' : `${userCount} user${userCount !== 1 ? 's' : ''}`}
            {adminCount > 0 && ` · ${adminCount} admin${adminCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {userCount > 0 && (
            <div className="flex -space-x-2 mr-2">
              {users.slice(0, 4).map(u => (
                <UserAvatar key={u.record_id} name={u.full_name} email={u.email} avatarUrl={u.avatar_url} size="sm" />
              ))}
              {userCount > 4 && (
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-700/80 text-xs font-medium text-slate-300 border-2 border-slate-800 flex-shrink-0">
                  +{userCount - 4}
                </div>
              )}
            </div>
          )}
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-700/50">
          {users.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Users size={28} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No users assigned yet</p>
              <button onClick={onManage}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white rounded-xl text-xs font-medium hover:bg-sky-600 transition-colors">
                <UserPlus size={14} /> Add User
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-700/30">
                {users.map(u => (
                  <div key={u.record_id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-700/15 transition-colors">
                    <UserAvatar name={u.full_name} email={u.email} avatarUrl={u.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-white truncate">{u.full_name || 'Unnamed'}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {editingRole === u.record_id ? (
                        <div className="flex items-center gap-1.5">
                          <select defaultValue={u.role} onChange={(e: any) => updateUserRole(u, e.target.value)}
                            className="px-2 py-1.5 rounded-lg border text-xs bg-slate-800 border-slate-600 text-white focus:border-sky-500 outline-none">
                            {getRoleOptions(u).map((r: string) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                          </select>
                          <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-200"><X size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingRole(u.record_id)} className="hover:opacity-80 transition-opacity">
                          {roleBadge(u.role)}
                        </button>
                      )}
                      <button onClick={() => removeUserFromOrg(u)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          removeConfirm === u.record_id ? 'bg-red-500/20 text-red-400' : 'text-slate-600 hover:text-red-400 hover:bg-red-500/10'
                        }`} title={removeConfirm === u.record_id ? 'Click again to confirm' : 'Remove'}>
                        {removeConfirm === u.record_id ? <XCircle size={15} /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-700/40 flex justify-end">
                <button onClick={onManage}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors">
                  Manage <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ClubsGroupedView({ clubs, clubsByOrg, expandedOrgs, toggleOrgExpanded, searchTerm, setSearchTerm, clubStats,
  handleOrgClick, roleBadge, editingRole, setEditingRole, updateUserRole, removeUserFromOrg, removeConfirm, getRoleOptions, exportUsers, hasExportData }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Clubs', value: clubStats.clubs, color: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', textColor: 'text-emerald-400' },
          { label: 'Unique Users', value: clubStats.users, color: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', textColor: 'text-sky-400' },
          { label: 'Total Assignments', value: clubStats.assignments, color: 'from-slate-600/20 to-slate-800/20', border: 'border-slate-600/30', textColor: 'text-slate-300' },
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
          <input type="text" value={searchTerm} onChange={(e: any) => setSearchTerm(e.target.value)} placeholder="Search clubs or users..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none" />
        </div>
        <button onClick={exportUsers} disabled={!hasExportData}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-50">
          <Download size={14} /> Export
        </button>
      </div>
      <div className="space-y-3">
        {clubs.length === 0 ? (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-16 text-center">
            <Building size={40} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 font-medium">No clubs found</p>
          </div>
        ) : (
          clubs.map((club: OrgItem) => {
            const users = clubsByOrg.get(club.id) || [];
            return (
              <OrgCard
                key={club.id}
                org={club}
                orgType="club"
                users={users}
                isExpanded={expandedOrgs.has(club.id)}
                onToggle={() => toggleOrgExpanded(club.id)}
                onManage={() => handleOrgClick(club.id, club.name, 'club')}
                roleBadge={roleBadge}
                editingRole={editingRole}
                setEditingRole={setEditingRole}
                updateUserRole={updateUserRole}
                removeUserFromOrg={removeUserFromOrg}
                removeConfirm={removeConfirm}
                getRoleOptions={getRoleOptions}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function AssociationsGroupedView({ stateAssociations, nationalAssociations, assocsByOrg, expandedOrgs, toggleOrgExpanded, searchTerm, setSearchTerm, assocStats,
  handleOrgClick, roleBadge, editingRole, setEditingRole, updateUserRole, removeUserFromOrg, removeConfirm, getRoleOptions, orgTypeIcon, exportUsers, hasExportData }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Associations', value: assocStats.totalOrgs, color: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', textColor: 'text-sky-400' },
          { label: 'State Associations', value: assocStats.stateOrgs, color: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', textColor: 'text-amber-400' },
          { label: 'National Associations', value: assocStats.nationalOrgs, color: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', textColor: 'text-emerald-400' },
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
          <input type="text" value={searchTerm} onChange={(e: any) => setSearchTerm(e.target.value)} placeholder="Search associations or users..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none" />
        </div>
        <button onClick={exportUsers} disabled={!hasExportData}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-slate-800 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-50">
          <Download size={14} /> Export
        </button>
      </div>

      {nationalAssociations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Globe size={13} className="text-sky-400" /> National Associations ({nationalAssociations.length})
          </h3>
          {nationalAssociations.map((assoc: OrgItem) => {
            const users = assocsByOrg.get(assoc.id) || [];
            return (
              <OrgCard
                key={assoc.id}
                org={assoc}
                orgType="national"
                users={users}
                isExpanded={expandedOrgs.has(assoc.id)}
                onToggle={() => toggleOrgExpanded(assoc.id)}
                onManage={() => handleOrgClick(assoc.id, assoc.name, 'national')}
                roleBadge={roleBadge}
                editingRole={editingRole}
                setEditingRole={setEditingRole}
                updateUserRole={updateUserRole}
                removeUserFromOrg={removeUserFromOrg}
                removeConfirm={removeConfirm}
                getRoleOptions={getRoleOptions}
                orgTypeIcon={orgTypeIcon}
              />
            );
          })}
        </div>
      )}

      {stateAssociations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <MapPin size={13} className="text-amber-400" /> State Associations ({stateAssociations.length})
          </h3>
          {stateAssociations.map((assoc: OrgItem) => {
            const users = assocsByOrg.get(assoc.id) || [];
            return (
              <OrgCard
                key={assoc.id}
                org={assoc}
                orgType="state"
                users={users}
                isExpanded={expandedOrgs.has(assoc.id)}
                onToggle={() => toggleOrgExpanded(assoc.id)}
                onManage={() => handleOrgClick(assoc.id, assoc.name, 'state')}
                roleBadge={roleBadge}
                editingRole={editingRole}
                setEditingRole={setEditingRole}
                updateUserRole={updateUserRole}
                removeUserFromOrg={removeUserFromOrg}
                removeConfirm={removeConfirm}
                getRoleOptions={getRoleOptions}
                orgTypeIcon={orgTypeIcon}
              />
            );
          })}
        </div>
      )}

      {stateAssociations.length === 0 && nationalAssociations.length === 0 && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-16 text-center">
          <Globe size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 font-medium">No associations found</p>
        </div>
      )}
    </div>
  );
}

function OrgDetailView({ org, users, onBack, onRemoveUser, onUpdateRole, removeConfirm, editingRole, setEditingRole, roleBadge, getRoleOptions, orgTypeIcon,
  showAddUserToOrg, setShowAddUserToOrg, userSearchTerm, handleUserSearchChange, userSearchResults, searchingUsers, selectedPlatformUser, setSelectedPlatformUser,
  addUserRole, setAddUserRole, addUserToOrgConfirm, saving, getRoleOptionsForOrg, existingUserIds }: any) {
  const typeLabel = org.type === 'club' ? 'Club' : org.type === 'state' ? 'State Association' : 'National Association';
  const roleOpts = getRoleOptionsForOrg(org);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-800/50 transition-colors text-slate-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            {orgTypeIcon(org.type, 20)}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{org.name}</h2>
            <p className="text-sm text-slate-400">{typeLabel} &middot; {users.length} user{users.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => { setShowAddUserToOrg(true); handleUserSearchChange(''); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors">
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {showAddUserToOrg && (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm overflow-hidden">
          <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
            <h3 className="font-semibold text-white">Add User to {org.name}</h3>
            <button onClick={() => { setShowAddUserToOrg(false); setSelectedPlatformUser(null); handleUserSearchChange(''); }}>
              <X size={16} className="text-slate-400 hover:text-slate-200 transition-colors" />
            </button>
          </div>
          <div className="p-5">
            {!selectedPlatformUser ? (
              <div className="space-y-4">
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input type="text" value={userSearchTerm} onChange={(e: any) => handleUserSearchChange(e.target.value)}
                    placeholder="Search users by name or email..." autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-xl border text-sm bg-slate-900/60 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none" />
                  {searchingUsers && <div className="absolute right-3.5 top-1/2 -translate-y-1/2"><div className="animate-spin w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full" /></div>}
                </div>
                {userSearchTerm && (
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-700/50 divide-y divide-slate-700/30">
                    {userSearchResults.length === 0 && !searchingUsers && (
                      <div className="p-8 text-center text-slate-500 text-sm">No users found matching "{userSearchTerm}"</div>
                    )}
                    {userSearchResults.map((pu: PlatformUser) => {
                      const alreadyAssigned = existingUserIds.includes(pu.user_id);
                      return (
                        <button key={pu.user_id} disabled={alreadyAssigned}
                          onClick={() => { if (!alreadyAssigned) setSelectedPlatformUser(pu); }}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                            alreadyAssigned ? 'opacity-40 cursor-not-allowed bg-slate-800/20' : 'hover:bg-slate-700/30 cursor-pointer'
                          }`}>
                          <UserAvatar name={pu.full_name} email={pu.email} avatarUrl={pu.avatar_url} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{pu.full_name || 'Unnamed'}</p>
                            <p className="text-xs text-slate-500 truncate">{pu.email}</p>
                          </div>
                          {alreadyAssigned ? (
                            <span className="text-xs text-slate-500 flex-shrink-0">Already assigned</span>
                          ) : (
                            <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/40 border border-slate-700/40">
                  <UserAvatar name={selectedPlatformUser.full_name} email={selectedPlatformUser.email} avatarUrl={selectedPlatformUser.avatar_url} size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">{selectedPlatformUser.full_name || 'Unnamed'}</p>
                    <p className="text-sm text-slate-400">{selectedPlatformUser.email}</p>
                  </div>
                  <button onClick={() => setSelectedPlatformUser(null)} className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Assign Role</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {roleOpts.map((r: string) => (
                      <button key={r} onClick={() => setAddUserRole(r)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium capitalize transition-all border ${
                          addUserRole === r
                            ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                            : 'bg-slate-800/40 text-slate-400 border-slate-700/40 hover:border-slate-600 hover:text-slate-200'
                        }`}>
                        {r.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => { setSelectedPlatformUser(null); handleUserSearchChange(''); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">Cancel</button>
                  <button onClick={addUserToOrgConfirm} disabled={saving}
                    className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50">
                    {saving ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
        {users.length === 0 ? (
          <div className="p-16 text-center">
            <Users size={40} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 font-medium">No users assigned</p>
            <p className="text-xs text-slate-500 mt-1">Add users to this {org.type === 'club' ? 'club' : 'association'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {users.map((u: any) => (
              <div key={u.record_id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors">
                <UserAvatar name={u.full_name} email={u.email} avatarUrl={u.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-white truncate">{u.full_name || 'Unnamed'}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {editingRole === u.record_id ? (
                    <div className="flex items-center gap-2">
                      <select defaultValue={u.role} onChange={(e: any) => onUpdateRole(u, e.target.value)}
                        className="px-3 py-1.5 rounded-lg border text-xs bg-slate-800 border-slate-600 text-white focus:border-sky-500 outline-none">
                        {getRoleOptions(u).map((r: string) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                      </select>
                      <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-200"><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingRole(u.record_id)} className="group flex items-center gap-1.5">
                      {roleBadge(u.role)}
                    </button>
                  )}
                  <button onClick={() => onRemoveUser(u)}
                    className={`p-2 rounded-lg transition-colors ${
                      removeConfirm === u.record_id ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                    }`} title={removeConfirm === u.record_id ? 'Click again to confirm' : 'Remove access'}>
                    {removeConfirm === u.record_id ? <XCircle size={16} /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlatformAdminsView({ superAdmins, currentUserId, showAddAdmin, setShowAddAdmin, newAdminEmail, setNewAdminEmail, newAdminName, setNewAdminName,
  newAdminLevel, setNewAdminLevel, saving, addSuperAdmin, toggleAdminActive, removeAdmin, removeConfirm, accessLevelConfig }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Platform Super Admins</h3>
          <p className="text-sm text-slate-400 mt-1">Manage users with platform-level access</p>
        </div>
        <button onClick={() => setShowAddAdmin(true)} className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors">
          <UserPlus size={16} /> Add Admin
        </button>
      </div>
      {showAddAdmin && (
        <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-5">
            <h4 className="font-semibold text-white">Add Super Admin</h4>
            <button onClick={() => setShowAddAdmin(false)}><X size={16} className="text-slate-400 hover:text-slate-200 transition-colors" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Email</label>
              <input type="email" value={newAdminEmail} onChange={(e: any) => setNewAdminEmail(e.target.value)} placeholder="admin@example.com"
                className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Display Name</label>
              <input type="text" value={newAdminName} onChange={(e: any) => setNewAdminName(e.target.value)} placeholder="Full name"
                className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Access Level</label>
              <select value={newAdminLevel} onChange={(e: any) => setNewAdminLevel(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white">
                <option value="full">Full Access</option><option value="read_only">Read Only</option><option value="billing_only">Billing Only</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-5 flex items-center gap-1.5"><AlertCircle size={12} /> User must already have an account.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAddAdmin(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">Cancel</button>
            <button onClick={addSuperAdmin} disabled={!newAdminEmail.trim() || saving} className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Admin'}
            </button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {superAdmins.length === 0 ? (
          <div className="rounded-2xl border p-16 text-center bg-slate-800/30 border-slate-700/50">
            <Shield size={40} className="mx-auto mb-3 text-slate-600" /><p className="text-slate-400 font-medium">No platform admins configured</p>
          </div>
        ) : (
          superAdmins.map((admin: any) => {
            const level = accessLevelConfig[admin.access_level] || accessLevelConfig.full;
            const LevelIcon = level.icon;
            const isCurrentUser = admin.user_id === currentUserId;
            return (
              <div key={admin.id} className={`flex items-center justify-between p-5 rounded-2xl border backdrop-blur-sm transition-all ${
                admin.is_active ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-800/20 border-slate-700/30 opacity-60'}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-sky-500/20 flex-shrink-0">
                    <span className="text-sky-400 font-bold text-sm">{admin.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{admin.display_name}</p>
                      {isCurrentUser && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-400 border border-sky-500/20">You</span>}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${level.color}`}><LevelIcon size={10} />{level.label}</span>
                      {!admin.is_active && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500/15 text-red-400 border border-red-500/20">Inactive</span>}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">{admin.email}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Added {new Date(admin.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
                {!isCurrentUser && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleAdminActive(admin)} className={`p-2.5 rounded-xl transition-colors ${admin.is_active ? 'hover:bg-amber-500/20 text-amber-400' : 'hover:bg-emerald-500/20 text-emerald-400'}`}
                      title={admin.is_active ? 'Deactivate' : 'Activate'}>{admin.is_active ? <Lock size={16} /> : <CheckCircle size={16} />}</button>
                    <button onClick={() => removeAdmin(admin.id)} className={`p-2.5 rounded-xl transition-colors ${removeConfirm === admin.id ? 'bg-red-500/20 text-red-400' : 'hover:bg-red-500/20 text-red-400'}`}
                      title={removeConfirm === admin.id ? 'Click again to confirm' : 'Remove'}>{removeConfirm === admin.id ? <XCircle size={16} /> : <Trash2 size={16} />}</button>
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

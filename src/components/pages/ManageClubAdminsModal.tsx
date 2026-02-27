import React, { useState, useEffect } from 'react';
import { X, Shield, ShieldCheck, UserPlus, Trash2, Search, Users, Crown } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface ManageClubAdminsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  clubName: string;
  darkMode: boolean;
}

interface ClubAdmin {
  id: string;
  user_id: string;
  role: string;
  member_name: string;
  email: string;
  member_id?: string;
}

interface ClubMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_id: string | null;
  membership_type: string | null;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  admin: { label: 'Admin', color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20', icon: Crown },
  editor: { label: 'Editor', color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', icon: ShieldCheck },
  viewer: { label: 'Viewer', color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20', icon: Shield },
};

export const ManageClubAdminsModal: React.FC<ManageClubAdminsModalProps> = ({
  isOpen, onClose, clubId, clubName, darkMode,
}) => {
  const [admins, setAdmins] = useState<ClubAdmin[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && clubId) {
      loadAdmins();
      loadMembers();
    }
  }, [isOpen, clubId]);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const { data: userClubs } = await supabase
        .from('user_clubs')
        .select('id, user_id, role')
        .eq('club_id', clubId);

      if (!userClubs || userClubs.length === 0) {
        setAdmins([]);
        setLoading(false);
        return;
      }

      const userIds = userClubs.map(uc => uc.user_id);

      const { data: membersData } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, user_id')
        .eq('club_id', clubId)
        .in('user_id', userIds);

      const memberMap = new Map<string, { name: string; email: string; memberId: string }>();
      membersData?.forEach(m => {
        if (m.user_id) {
          memberMap.set(m.user_id, {
            name: `${m.first_name} ${m.last_name}`,
            email: m.email,
            memberId: m.id,
          });
        }
      });

      const adminList: ClubAdmin[] = userClubs.map(uc => {
        const member = memberMap.get(uc.user_id);
        return {
          id: uc.id,
          user_id: uc.user_id,
          role: uc.role,
          member_name: member?.name || 'Unknown User',
          email: member?.email || '',
          member_id: member?.memberId,
        };
      });

      adminList.sort((a, b) => {
        const roleOrder: Record<string, number> = { admin: 0, editor: 1, viewer: 2 };
        return (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
      });

      setAdmins(adminList);
    } catch (err) {
      console.error('Failed to load admins:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, user_id, membership_type')
      .eq('club_id', clubId)
      .order('first_name');
    setMembers(data || []);
  };

  const handleAddAdmin = async (member: ClubMember) => {
    if (!member.user_id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_clubs')
        .upsert({
          user_id: member.user_id,
          club_id: clubId,
          role: selectedRole,
        }, { onConflict: 'user_id,club_id' });

      if (error) throw error;
      await loadAdmins();
      setShowAddPanel(false);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to add admin:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async (adminId: string, newRole: string) => {
    try {
      await supabase
        .from('user_clubs')
        .update({ role: newRole })
        .eq('id', adminId);
      await loadAdmins();
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  };

  const handleRemoveAccess = async (adminId: string) => {
    try {
      await supabase
        .from('user_clubs')
        .delete()
        .eq('id', adminId);
      await loadAdmins();
    } catch (err) {
      console.error('Failed to remove access:', err);
    }
  };

  const existingUserIds = new Set(admins.map(a => a.user_id));
  const availableMembers = members.filter(m =>
    m.user_id &&
    !existingUserIds.has(m.user_id) &&
    (!searchQuery || `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-lg rounded-xl shadow-2xl max-h-[85vh] flex flex-col ${
        darkMode ? 'bg-slate-800' : 'bg-white'
      }`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Shield className="text-amber-400" size={20} />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Manage Admins
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {clubName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Users with Access ({admins.length})
            </h3>
            <button
              onClick={() => setShowAddPanel(!showAddPanel)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <UserPlus size={14} />
              Add
            </button>
          </div>

          {showAddPanel && (
            <div className={`rounded-xl border p-4 space-y-3 ${darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Assign role:
                </span>
                <div className="flex gap-1">
                  {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                    <button
                      key={role}
                      onClick={() => setSelectedRole(role)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        selectedRole === role
                          ? `${cfg.bgColor} ${cfg.color} border`
                          : darkMode
                            ? 'border-slate-600 text-slate-400 hover:border-slate-500'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search club members..."
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1">
                {availableMembers.length === 0 ? (
                  <p className={`text-sm py-2 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {searchQuery ? 'No matching members with linked accounts' : 'No available members with linked accounts'}
                  </p>
                ) : (
                  availableMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => handleAddAdmin(member)}
                      disabled={saving}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                        darkMode
                          ? 'hover:bg-slate-600/50 text-slate-300'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium">{member.first_name} {member.last_name}</p>
                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{member.email}</p>
                      </div>
                      <UserPlus size={14} className="text-blue-400 flex-shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : admins.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <Users className={`w-10 h-10 mb-2 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>No users with access</p>
            </div>
          ) : (
            <div className="space-y-2">
              {admins.map(admin => {
                const roleCfg = ROLE_CONFIG[admin.role] || ROLE_CONFIG.viewer;
                const RoleIcon = roleCfg.icon;
                return (
                  <div
                    key={admin.id}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      darkMode ? 'bg-slate-700/30 border-slate-700' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-1.5 rounded-lg ${roleCfg.bgColor} border`}>
                        <RoleIcon size={14} className={roleCfg.color} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {admin.member_name}
                        </p>
                        <p className={`text-xs truncate ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {admin.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={admin.role}
                        onChange={e => handleChangeRole(admin.id, e.target.value)}
                        className={`px-2 py-1 rounded-lg border text-xs font-medium ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-slate-300'
                            : 'bg-white border-slate-300 text-slate-700'
                        }`}
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemoveAccess(admin.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          darkMode ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-500'
                        }`}
                        title="Remove access"
                      >
                        <Trash2 size={14} />
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
  );
};

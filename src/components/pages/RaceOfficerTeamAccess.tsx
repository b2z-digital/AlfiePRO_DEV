import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Mail, Check, X, Loader as Loader2, Shield, Eye } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer';
  status: 'pending' | 'active' | 'revoked';
  invited_at: string;
  accepted_at: string | null;
}

interface RaceOfficerTeamAccessProps {
  darkMode: boolean;
}

export function RaceOfficerTeamAccess({ darkMode }: RaceOfficerTeamAccessProps) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('admin');
  const [sending, setSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadTeamMembers();
  }, [user]);

  const loadTeamMembers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('race_officer_team_members')
        .select('*')
        .eq('owner_user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (err) {
      console.error('Error loading team members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !user) return;

    try {
      setSending(true);
      const { error } = await supabase
        .from('race_officer_team_members')
        .insert({
          owner_user_id: user.id,
          email: inviteEmail.trim().toLowerCase(),
          name: inviteName.trim() || inviteEmail.trim(),
          role: inviteRole,
          status: 'pending'
        });

      if (error) throw error;

      addNotification('success', `Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteName('');
      setShowInviteForm(false);
      loadTeamMembers();
    } catch (err: any) {
      console.error('Error inviting team member:', err);
      addNotification('error', err.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('race_officer_team_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      addNotification('success', 'Team member removed');
      setDeleteConfirm(null);
      loadTeamMembers();
    } catch (err) {
      console.error('Error removing team member:', err);
      addNotification('error', 'Failed to remove team member');
    }
  };

  const handleRoleChange = async (memberId: string, newRole: 'admin' | 'viewer') => {
    try {
      const { error } = await supabase
        .from('race_officer_team_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
      addNotification('success', 'Role updated');
      loadTeamMembers();
    } catch (err) {
      console.error('Error updating role:', err);
      addNotification('error', 'Failed to update role');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Team Access
          </h2>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            Invite other users to help manage your race management account
          </p>
        </div>
        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Invite Member
        </button>
      </div>

      {showInviteForm && (
        <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-800/70 border-slate-700' : 'bg-white border-gray-200'}`}>
          <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Invite Team Member
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  darkMode
                    ? 'bg-slate-900/50 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Name
              </label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="John Smith"
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  darkMode
                    ? 'bg-slate-900/50 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>
          </div>
          <div className="mt-4">
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
              Access Level
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setInviteRole('admin')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  inviteRole === 'admin'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : darkMode
                      ? 'border-slate-600 text-slate-300 hover:border-slate-500'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <Shield size={14} />
                Full Access
              </button>
              <button
                onClick={() => setInviteRole('viewer')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  inviteRole === 'viewer'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : darkMode
                      ? 'border-slate-600 text-slate-300 hover:border-slate-500'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <Eye size={14} />
                View Only
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={() => { setShowInviteForm(false); setInviteEmail(''); setInviteName(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || sending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Send Invitation
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      ) : teamMembers.length === 0 ? (
        <div className={`text-center py-12 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-gray-50 border-gray-200'}`}>
          <Users className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
          <p className={`font-medium ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>No team members yet</p>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
            Invite others to help manage your races and events
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {teamMembers.map((member) => (
            <div
              key={member.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                  member.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : member.status === 'pending'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                }`}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {member.name}
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {member.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  member.status === 'active'
                    ? darkMode ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700'
                    : member.status === 'pending'
                      ? darkMode ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-100 text-yellow-700'
                      : darkMode ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700'
                }`}>
                  {member.status}
                </span>
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value as 'admin' | 'viewer')}
                  className={`text-xs px-2 py-1 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-300'
                      : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  <option value="admin">Full Access</option>
                  <option value="viewer">View Only</option>
                </select>
                {deleteConfirm === member.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      title="Confirm remove"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(member.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      darkMode ? 'hover:bg-red-500/20 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'
                    }`}
                    title="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

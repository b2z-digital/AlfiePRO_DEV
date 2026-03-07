import React, { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Globe, Lock, Eye, Users, Shield, AlertTriangle, Ban, ChevronLeft, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { socialStorage, SocialGroup } from '../../utils/socialStorage';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';
import { supabase } from '../../utils/supabase';

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  darkMode?: boolean;
  onGroupsChanged?: () => void;
}

type ModalView = 'list' | 'create' | 'edit' | 'reports' | 'moderators' | 'blocked';

export default function GroupManagementModal({ isOpen, onClose, clubId, darkMode = false, onGroupsChanged }: GroupManagementModalProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const lightMode = !darkMode;
  const [view, setView] = useState<ModalView>('list');
  const [groups, setGroups] = useState<SocialGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<SocialGroup | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<SocialGroup | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formVisibility, setFormVisibility] = useState<'public' | 'private' | 'secret'>('public');
  const [formRequireApproval, setFormRequireApproval] = useState(false);
  const [formAllowMemberPosts, setFormAllowMemberPosts] = useState(true);
  const [saving, setSaving] = useState(false);

  const [reports, setReports] = useState<any[]>([]);
  const [moderators, setModerators] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [selectedGroupForMod, setSelectedGroupForMod] = useState<SocialGroup | null>(null);
  const [clubMembers, setClubMembers] = useState<any[]>([]);
  const [showAddModerator, setShowAddModerator] = useState(false);
  const [showBlockUser, setShowBlockUser] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockType, setBlockType] = useState<'muted' | 'banned'>('muted');
  const [selectedMemberId, setSelectedMemberId] = useState('');

  useEffect(() => {
    if (isOpen && clubId) {
      loadGroups();
      setView('list');
    }
  }, [isOpen, clubId]);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await socialStorage.getClubGroups(clubId);
      setGroups(data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormVisibility('public');
    setFormRequireApproval(false);
    setFormAllowMemberPosts(true);
    setEditingGroup(null);
  };

  const handleCreate = () => {
    resetForm();
    setView('create');
  };

  const handleEdit = (group: SocialGroup) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormDescription(group.description || '');
    setFormVisibility(group.visibility);
    setFormRequireApproval(group.require_approval);
    setFormAllowMemberPosts(group.allow_member_posts);
    setView('edit');
  };

  const handleDeleteClick = (group: SocialGroup) => {
    setGroupToDelete(group);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!groupToDelete) return;
    try {
      await socialStorage.deleteGroup(groupToDelete.id);
      addNotification('Group deleted', 'success');
      setShowDeleteConfirm(false);
      setGroupToDelete(null);
      loadGroups();
      onGroupsChanged?.();
    } catch (error) {
      addNotification('Failed to delete group', 'error');
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      addNotification('Group name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingGroup) {
        await socialStorage.updateGroup(editingGroup.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          visibility: formVisibility,
          require_approval: formRequireApproval,
          allow_member_posts: formAllowMemberPosts,
        });
        addNotification('Group updated', 'success');
      } else {
        await socialStorage.createGroup({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          visibility: formVisibility,
          group_type: 'custom',
          club_id: clubId,
          require_approval: formRequireApproval,
          allow_member_posts: formAllowMemberPosts,
          moderate_posts: false,
        });
        addNotification('Group created', 'success');
      }
      resetForm();
      setView('list');
      loadGroups();
      onGroupsChanged?.();
    } catch (error: any) {
      addNotification(error?.message || 'Failed to save group', 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadReports = async () => {
    try {
      if (!user) return;
      const { data: adminClubs } = await supabase
        .from('user_clubs')
        .select('club_id')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin']);

      const clubIds = adminClubs?.map(c => c.club_id) || [];
      if (clubIds.length === 0) return;

      const data = await socialStorage.getPostReports(clubIds);
      setReports(data);
    } catch (error) {
      console.error('Error loading reports:', error);
    }
  };

  const loadModerators = async (groupId: string) => {
    try {
      const data = await socialStorage.getGroupModerators(groupId);
      setModerators(data);
    } catch (error) {
      console.error('Error loading moderators:', error);
    }
  };

  const loadBlockedUsers = async () => {
    try {
      const data = await socialStorage.getBlockedUsers(undefined, clubId);
      setBlockedUsers(data);
    } catch (error) {
      console.error('Error loading blocked users:', error);
    }
  };

  const loadClubMembers = async () => {
    try {
      const { data } = await supabase
        .from('members')
        .select('id, first_name, last_name, user_id')
        .eq('club_id', clubId)
        .not('user_id', 'is', null)
        .order('first_name');
      setClubMembers(data || []);
    } catch (error) {
      console.error('Error loading members:', error);
    }
  };

  const handleReviewReport = async (reportId: string, action: 'dismissed' | 'actioned', actionTaken?: string) => {
    try {
      await socialStorage.reviewReport(reportId, action, actionTaken);
      addNotification(`Report ${action}`, 'success');
      loadReports();
    } catch (error) {
      addNotification('Failed to update report', 'error');
    }
  };

  const handleDeleteReportedPost = async (postId: string, reportId: string) => {
    try {
      await socialStorage.deletePostAsAdmin(postId);
      await socialStorage.reviewReport(reportId, 'actioned', 'Post deleted by admin');
      addNotification('Post deleted and report resolved', 'success');
      loadReports();
    } catch (error) {
      addNotification('Failed to delete post', 'error');
    }
  };

  const handleAddModerator = async () => {
    if (!selectedGroupForMod || !selectedMemberId) return;
    try {
      const member = clubMembers.find(m => m.id === selectedMemberId);
      if (!member?.user_id) {
        addNotification('This member does not have a linked user account', 'error');
        return;
      }
      await socialStorage.addGroupModerator(selectedGroupForMod.id, member.user_id);
      addNotification('Moderator added', 'success');
      setShowAddModerator(false);
      setSelectedMemberId('');
      loadModerators(selectedGroupForMod.id);
    } catch (error: any) {
      addNotification(error?.message || 'Failed to add moderator', 'error');
    }
  };

  const handleRemoveModerator = async (userId: string) => {
    if (!selectedGroupForMod) return;
    try {
      await socialStorage.removeGroupModerator(selectedGroupForMod.id, userId);
      addNotification('Moderator removed', 'success');
      loadModerators(selectedGroupForMod.id);
    } catch (error) {
      addNotification('Failed to remove moderator', 'error');
    }
  };

  const handleBlockUser = async () => {
    if (!selectedMemberId) return;
    try {
      const member = clubMembers.find(m => m.id === selectedMemberId);
      if (!member?.user_id) {
        addNotification('This member does not have a linked user account', 'error');
        return;
      }
      await socialStorage.blockUser(member.user_id, blockType, blockReason, undefined, clubId);
      addNotification(`User ${blockType === 'muted' ? 'muted' : 'banned'}`, 'success');
      setShowBlockUser(false);
      setSelectedMemberId('');
      setBlockReason('');
      setBlockType('muted');
      loadBlockedUsers();
    } catch (error: any) {
      addNotification(error?.message || 'Failed to block user', 'error');
    }
  };

  const handleUnblockUser = async (blockId: string) => {
    try {
      await socialStorage.unblockUser(blockId);
      addNotification('User unblocked', 'success');
      loadBlockedUsers();
    } catch (error) {
      addNotification('Failed to unblock user', 'error');
    }
  };

  const visibilityIcon = (v: string) => {
    if (v === 'public') return <Globe className="w-4 h-4" />;
    if (v === 'private') return <Lock className="w-4 h-4" />;
    return <Eye className="w-4 h-4" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold text-white drop-shadow-lg">
              {view === 'list' ? 'Manage Groups' : view === 'create' ? 'Create Group' : view === 'edit' ? 'Edit Group' : view === 'reports' ? 'Post Reports' : view === 'moderators' ? 'Group Moderators' : 'Blocked Users'}
            </h2>
            <p className="text-blue-100 text-sm mt-0.5">
              {view === 'list' ? 'Add, edit or remove club groups' : view === 'reports' ? 'Review reported posts' : view === 'moderators' ? `Moderators for ${selectedGroupForMod?.name || ''}` : view === 'blocked' ? 'Manage blocked users' : editingGroup ? `Editing ${editingGroup.name}` : 'Set up a new group for your club'}
            </p>
          </div>
          <button
            onClick={() => {
              if (view === 'list') { onClose(); }
              else if (view === 'moderators') { setSelectedGroupForMod(null); setView('list'); }
              else { setView('list'); }
            }}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all relative z-10"
          >
            {view === 'list' ? <X size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          {view === 'list' ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={handleCreate}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                >
                  <Plus className="w-5 h-5" />
                  Create Group
                </button>
                <button
                  onClick={() => { loadReports(); setView('reports'); }}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors font-medium"
                >
                  <AlertTriangle className="w-5 h-5" />
                  Reports
                </button>
                <button
                  onClick={() => { loadBlockedUsers(); loadClubMembers(); setView('blocked'); }}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
                >
                  <Ban className="w-5 h-5" />
                  Blocked
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : groups.length > 0 ? (
                <div className="space-y-3">
                  {groups.map(group => {
                    const isDefaultClubGroup = group.group_type === 'club';
                    return (
                      <div
                        key={group.id}
                        className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${darkMode ? 'border-slate-700 hover:bg-slate-700/30' : 'border-gray-200 hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                            {group.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{group.name}</span>
                              {isDefaultClubGroup && (
                                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${darkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                                  Default
                                </span>
                              )}
                            </div>
                            <div className={`flex items-center gap-3 text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                              <span className="flex items-center gap-1">
                                {visibilityIcon(group.visibility)}
                                {group.visibility}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {group.member_count} members
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <button
                            onClick={() => {
                              setSelectedGroupForMod(group);
                              loadModerators(group.id);
                              loadClubMembers();
                              setView('moderators');
                            }}
                            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-600 text-blue-400' : 'hover:bg-blue-100 text-blue-600'}`}
                            title="Manage moderators"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(group)}
                            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-600 text-slate-300' : 'hover:bg-gray-200 text-gray-600'}`}
                            title="Edit group"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!isDefaultClubGroup && (
                            <button
                              onClick={() => handleDeleteClick(group)}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-100 transition-colors"
                              title="Delete group"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No groups yet</p>
                </div>
              )}
            </>
          ) : view === 'reports' ? (
            <div className="space-y-3">
              {reports.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No reports to review</p>
                </div>
              ) : (
                reports.map(report => (
                  <div key={report.id} className={`p-4 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-700/30' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          report.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                          report.status === 'actioned' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {report.status === 'pending' ? 'Pending' : report.status === 'actioned' ? 'Action Taken' : 'Dismissed'}
                        </span>
                        <span className={`text-xs ml-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          Reason: {report.reason}
                        </span>
                      </div>
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        {new Date(report.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className={`text-sm mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                      Reported by: <strong>{report.reporter?.first_name} {report.reporter?.last_name}</strong>
                    </div>

                    {report.post && (
                      <div className={`text-sm p-2 rounded-lg mb-2 ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-gray-600'}`}>
                        <span className="font-medium">{report.post.author?.first_name} {report.post.author?.last_name}:</span>{' '}
                        {report.post.content?.substring(0, 120)}{report.post.content?.length > 120 ? '...' : ''}
                      </div>
                    )}

                    {report.details && (
                      <p className={`text-xs italic mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        Details: {report.details}
                      </p>
                    )}

                    {report.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => report.post && handleDeleteReportedPost(report.post.id, report.id)}
                          className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Delete Post
                        </button>
                        <button
                          onClick={() => handleReviewReport(report.id, 'actioned', 'Warning issued')}
                          className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                        >
                          Warn User
                        </button>
                        <button
                          onClick={() => handleReviewReport(report.id, 'dismissed')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${darkMode ? 'bg-slate-600 text-slate-300 hover:bg-slate-500' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

          ) : view === 'moderators' ? (
            <div className="space-y-4">
              {!showAddModerator ? (
                <button
                  onClick={() => setShowAddModerator(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                >
                  <UserPlus className="w-5 h-5" />
                  Add Moderator
                </button>
              ) : (
                <div className={`p-4 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-700/30' : 'border-gray-200 bg-gray-50'}`}>
                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Select Member</label>
                  <select
                    value={selectedMemberId}
                    onChange={e => setSelectedMemberId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border mb-3 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  >
                    <option value="">Choose a member...</option>
                    {clubMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowAddModerator(false); setSelectedMemberId(''); }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>Cancel</button>
                    <button onClick={handleAddModerator} disabled={!selectedMemberId} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Add</button>
                  </div>
                </div>
              )}

              {moderators.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No moderators assigned yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {moderators.map(mod => (
                    <div key={mod.id} className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                          {mod.user?.first_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{mod.user?.first_name} {mod.user?.last_name}</div>
                          <div className={`text-xs capitalize ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{mod.role}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveModerator(mod.user_id)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-100 transition-colors"
                        title="Remove moderator"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          ) : view === 'blocked' ? (
            <div className="space-y-4">
              {!showBlockUser ? (
                <button
                  onClick={() => setShowBlockUser(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
                >
                  <Ban className="w-5 h-5" />
                  Block / Mute User
                </button>
              ) : (
                <div className={`p-4 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-700/30' : 'border-gray-200 bg-gray-50'}`}>
                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Select Member</label>
                  <select
                    value={selectedMemberId}
                    onChange={e => setSelectedMemberId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border mb-3 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  >
                    <option value="">Choose a member...</option>
                    {clubMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                    ))}
                  </select>

                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Action</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() => setBlockType('muted')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${blockType === 'muted' ? 'border-orange-500 bg-orange-50 text-orange-700' : darkMode ? 'border-slate-600 text-slate-300' : 'border-gray-200 text-gray-600'}`}
                    >
                      Mute (cannot post)
                    </button>
                    <button
                      onClick={() => setBlockType('banned')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${blockType === 'banned' ? 'border-red-500 bg-red-50 text-red-700' : darkMode ? 'border-slate-600 text-slate-300' : 'border-gray-200 text-gray-600'}`}
                    >
                      Ban (full block)
                    </button>
                  </div>

                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Reason (optional)</label>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                    placeholder="Why is this user being blocked?"
                    className={`w-full px-3 py-2 rounded-lg border mb-3 ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  />

                  <div className="flex gap-2">
                    <button onClick={() => { setShowBlockUser(false); setSelectedMemberId(''); setBlockReason(''); }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>Cancel</button>
                    <button onClick={handleBlockUser} disabled={!selectedMemberId} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{blockType === 'muted' ? 'Mute User' : 'Ban User'}</button>
                  </div>
                </div>
              )}

              {blockedUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Ban className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No blocked or muted users</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map(blocked => (
                    <div key={blocked.id} className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ${blocked.block_type === 'banned' ? 'bg-gradient-to-br from-red-500 to-red-600' : 'bg-gradient-to-br from-orange-500 to-orange-600'}`}>
                          {blocked.user?.first_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{blocked.user?.first_name} {blocked.user?.last_name}</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${blocked.block_type === 'banned' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                              {blocked.block_type === 'banned' ? 'Banned' : 'Muted'}
                            </span>
                            {blocked.reason && <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{blocked.reason}</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnblockUser(blocked.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${darkMode ? 'bg-slate-600 text-slate-300 hover:bg-slate-500' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          ) : (
            <div className="space-y-5">
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Group Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Race Committee, Social Events"
                  className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Description</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="What is this group about?"
                  rows={3}
                  className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 resize-none ${darkMode ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Visibility</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['public', 'private', 'secret'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setFormVisibility(v)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                        formVisibility === v
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : darkMode ? 'border-slate-600 text-slate-300 hover:border-slate-500' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {visibilityIcon(v)}
                      <span className="text-xs font-medium capitalize">{v}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:border-slate-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input
                    type="checkbox"
                    checked={formRequireApproval}
                    onChange={e => setFormRequireApproval(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Require Approval</div>
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>New members must be approved before joining</div>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:border-slate-500' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input
                    type="checkbox"
                    checked={formAllowMemberPosts}
                    onChange={e => setFormAllowMemberPosts(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Allow Member Posts</div>
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Members can create posts in this group</div>
                  </div>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => { resetForm(); setView('list'); }}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingGroup ? 'Save Changes' : 'Create Group'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setGroupToDelete(null); }}
        onConfirm={handleDelete}
        title="Delete Group"
        message={`Are you sure you want to delete "${groupToDelete?.name}"? This will remove all members and posts from this group.`}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
      />
    </div>
  );
}

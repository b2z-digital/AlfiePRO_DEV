import React, { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Globe, Lock, Eye, Users, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { socialStorage, SocialGroup } from '../../utils/socialStorage';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  darkMode?: boolean;
  onGroupsChanged?: () => void;
}

type ModalView = 'list' | 'create' | 'edit';

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
              {view === 'list' ? 'Manage Groups' : view === 'create' ? 'Create Group' : 'Edit Group'}
            </h2>
            <p className="text-blue-100 text-sm mt-0.5">
              {view === 'list' ? 'Add, edit or remove club groups' : editingGroup ? `Editing ${editingGroup.name}` : 'Set up a new group for your club'}
            </p>
          </div>
          <button
            onClick={() => view === 'list' ? onClose() : setView('list')}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          {view === 'list' ? (
            <>
              <button
                onClick={handleCreate}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                Create New Group
              </button>

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

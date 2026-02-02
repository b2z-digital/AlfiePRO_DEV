import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Crown, Shield, Trash2, Plus } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface EditTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  darkMode: boolean;
  member: {
    id: string;
    user_id: string | null;
    member_id?: string;
    role: 'admin' | 'editor' | 'pro' | 'member' | 'viewer' | null;
    first_name?: string;
    last_name?: string;
    email?: string;
    avatar_url?: string;
    positions: { id: string; position_title: string; }[];
    hasAccount: boolean;
  } | null;
}

export const EditTeamMemberModal: React.FC<EditTeamMemberModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  darkMode,
  member
}) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [role, setRole] = useState<string>('member');
  const [positions, setPositions] = useState<{ id?: string; title: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role || 'member');
      setPositions(member.positions.map(p => ({ id: p.id, title: p.position_title })));
    }
  }, [member]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const handleClose = () => {
    onClose();
  };

  const addPosition = () => {
    setPositions([...positions, { title: '' }]);
  };

  const updatePosition = (index: number, title: string) => {
    const newPositions = [...positions];
    newPositions[index].title = title;
    setPositions(newPositions);
  };

  const removePosition = (index: number) => {
    setPositions(positions.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!currentClub || !member) return;

    try {
      setSaving(true);

      // Update role only if member has an account
      if (member.hasAccount && member.user_id) {
        const { error: roleError } = await supabase
          .from('user_clubs')
          .update({ role })
          .eq('user_id', member.user_id)
          .eq('club_id', currentClub.clubId);

        if (roleError) throw roleError;
      }

      // Delete removed positions (those with id but not in current list)
      const existingIds = member.positions.map(p => p.id);
      const currentIds = positions.filter(p => p.id).map(p => p.id);
      const idsToDelete = existingIds.filter(id => !currentIds.includes(id));

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('committee_positions')
          .delete()
          .in('id', idsToDelete);

        if (deleteError) throw deleteError;
      }

      // Update or insert positions
      for (const position of positions) {
        if (!position.title.trim()) continue;

        if (position.id) {
          // Update existing
          const { error: updateError } = await supabase
            .from('committee_positions')
            .update({
              title: position.title.trim(),
              position_title: position.title.trim()
            })
            .eq('id', position.id);

          if (updateError) throw updateError;
        } else {
          // Insert new
          const positionData: any = {
            club_id: currentClub.clubId,
            title: position.title.trim(),
            position_title: position.title.trim()
          };

          // Add user_id if member has account, otherwise use member_id
          if (member.hasAccount && member.user_id) {
            positionData.user_id = member.user_id;
          } else if (member.member_id) {
            positionData.member_id = member.member_id;
          }

          const { error: insertError } = await supabase
            .from('committee_positions')
            .insert(positionData);

          if (insertError) throw insertError;
        }
      }

      addNotification('success', 'Team member updated successfully');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error updating team member:', error);
      const errorMessage = error?.message || 'Failed to update team member';
      addNotification('error', `Failed to update: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !member) return null;

  const memberName = member.first_name && member.last_name
    ? `${member.first_name} ${member.last_name}`
    : member.email || 'Team Member';

  const initials = member.first_name && member.last_name
    ? `${member.first_name[0]}${member.last_name[0]}`
    : member.email?.substring(0, 2).toUpperCase() || 'M';

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-2xl w-full max-w-2xl flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-4">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={memberName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                {initials}
              </div>
            )}
            <div>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {memberName}
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Edit position & role
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!member.hasAccount && (
            <div className="px-4 py-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                This member does not have an Alfie account yet. Committee positions can be assigned, but access roles require an account.
              </p>
            </div>
          )}

          {/* Access Role - Only for members with accounts */}
          {member.hasAccount && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Access Role
                </div>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border text-base ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
              >
                <option value="viewer">Viewer - View only access</option>
                <option value="member">Member - Basic member access</option>
                <option value="pro">PRO - Can score races and generate reports</option>
                <option value="editor">Editor - Can manage races, members, and venues</option>
                <option value="admin">Admin - Full access to all features</option>
              </select>
            </div>
          )}

          {/* Committee Positions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4" />
                  Committee Positions
                </div>
              </label>
              <button
                onClick={addPosition}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Position
              </button>
            </div>

            {positions.length === 0 ? (
              <div className={`text-sm text-center py-8 rounded-lg border-2 border-dashed ${
                darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-300 text-gray-500'
              }`}>
                No positions assigned. Click "Add Position" to add one.
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((position, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="e.g., Commodore, Race Officer, Treasurer"
                      value={position.title}
                      onChange={(e) => updatePosition(index, e.target.value)}
                      className={`flex-1 px-4 py-3 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      } focus:outline-none focus:ring-2 focus:ring-green-500`}
                    />
                    <button
                      onClick={() => removePosition(index)}
                      className={`p-3 rounded-lg transition-colors ${
                        darkMode
                          ? 'hover:bg-red-500/20 text-red-400'
                          : 'hover:bg-red-50 text-red-500'
                      }`}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <button
            onClick={handleClose}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'bg-slate-700 text-white hover:bg-slate-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

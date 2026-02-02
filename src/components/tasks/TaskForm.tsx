import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Flag, Repeat, Bell, Upload, Trash2, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { Avatar } from '../ui/Avatar';
import { useNotifications } from '../../contexts/NotificationContext';

interface TaskFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: any) => void;
  darkMode: boolean;
  task?: any;
  isEditing?: boolean;
}

interface ClubMember {
  id: string;
  first_name: string;
  last_name: string;
  user_id: string;
  avatar_url?: string;
}

export const TaskForm: React.FC<TaskFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  darkMode,
  task,
  isEditing = false
}) => {
  const { currentClub, currentOrganization, user } = useAuth();
  const { addNotification } = useNotifications();
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    assignee_id: '',
    followers: [] as string[],
    repeat_type: 'none',
    repeat_end_date: '',
    send_reminder: false,
    reminder_type: 'email',
    reminder_date: '',
    attachments: [] as string[]
  });
  const [showFollowerDropdown, setShowFollowerDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  useEffect(() => {
    if (currentClub?.clubId || currentOrganization?.id) {
      fetchClubMembers();
    }
  }, [currentClub, currentOrganization]);

  useEffect(() => {
    if (task && isEditing) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        due_date: task.due_date || '',
        priority: task.priority || 'medium',
        assignee_id: task.assignee_id || '',
        followers: Array.isArray(task.followers) ? task.followers : [],
        repeat_type: task.repeat_type || 'none',
        repeat_end_date: task.repeat_end_date || '',
        send_reminder: task.send_reminder || false,
        reminder_type: task.reminder_type || 'email',
        reminder_date: task.reminder_date || '',
        attachments: Array.isArray(task.attachments) ? task.attachments : []
      });
    } else if (!isEditing) {
      // Reset form for new task
      setFormData({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        assignee_id: '',
        followers: [],
        repeat_type: 'none',
        repeat_end_date: '',
        send_reminder: false,
        reminder_type: 'email',
        reminder_date: '',
        attachments: []
      });
    }
  }, [task, isEditing, isOpen]);

  const fetchClubMembers = async () => {
    try {
      const isAssociation = !!currentOrganization && !currentClub;

      if (isAssociation && currentOrganization) {
        // Fetch association team members
        const tableName = currentOrganization.type === 'state' ? 'user_state_associations' : 'user_national_associations';
        const idColumn = currentOrganization.type === 'state' ? 'state_association_id' : 'national_association_id';

        const { data: userAssociations, error: assocError } = await supabase
          .from(tableName)
          .select('user_id')
          .eq(idColumn, currentOrganization.id);

        if (assocError) throw assocError;

        if (!userAssociations || userAssociations.length === 0) {
          setClubMembers([]);
          return;
        }

        // Fetch profiles
        const userIds = userAssociations.map(ua => ua.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds)
          .order('first_name');

        if (profilesError) throw profilesError;

        const membersWithAvatars = (profiles || []).map((profile: any) => ({
          id: profile.id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          user_id: profile.id,
          avatar_url: profile.avatar_url
        }));

        setClubMembers(membersWithAvatars);
      } else if (currentClub?.clubId) {
        // Original club logic
        const { data, error } = await supabase
          .from('members')
          .select(`
            id,
            first_name,
            last_name,
            user_id
          `)
          .eq('club_id', currentClub.clubId)
          .order('first_name');

        if (error) {
          console.error('Error fetching club members:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          console.warn('No club members found for club:', currentClub.clubId);
          setClubMembers([]);
          return;
        }

        // Fetch avatar URLs for members who have user_id set
        const memberIds = data.filter(m => m.user_id).map(m => m.user_id);

        let avatarMap: Record<string, string> = {};
        if (memberIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, avatar_url')
            .in('id', memberIds);

          if (!profilesError && profiles) {
            avatarMap = profiles.reduce((acc, p) => ({
              ...acc,
              [p.id]: p.avatar_url
            }), {});
          }
        }

        const membersWithAvatars = data.map((member: any) => ({
          id: member.id,
          first_name: member.first_name,
          last_name: member.last_name,
          user_id: member.user_id,
          avatar_url: member.user_id ? avatarMap[member.user_id] : null
        }));

        setClubMembers(membersWithAvatars);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      setClubMembers([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isAssociation = !!currentOrganization && !currentClub;
      const taskData: any = {
        ...formData,
        created_by: user?.id,
        // Convert empty strings to null for optional fields
        due_date: formData.due_date || null,
        assignee_id: formData.assignee_id || null,
        repeat_end_date: formData.repeat_end_date || null,
        reminder_date: formData.reminder_date || null,
        // Keep attachments array to be processed by TasksPage
        attachments: formData.attachments
      };

      // Set appropriate ID based on context
      if (currentClub?.clubId) {
        taskData.club_id = currentClub.clubId;
      } else if (isAssociation && currentOrganization) {
        const idColumn = currentOrganization.type === 'state' ? 'state_association_id' : 'national_association_id';
        taskData[idColumn] = currentOrganization.id;
      }

      await onSubmit(taskData);
      onClose();
    } catch (error) {
      console.error('Error submitting task:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!currentClub?.clubId) {
      addNotification('error', 'No club selected');
      return;
    }

    setUploadingFiles(true);
    try {
      const uploadedUrls: string[] = [];
      let failedCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `tasks/${currentClub.clubId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        console.log('Uploading file:', fileName);

        const { data, error } = await supabase.storage
          .from('event-media')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('Error uploading file:', error);
          failedCount++;
          continue;
        }

        console.log('Upload successful, data:', data);

        const { data: { publicUrl } } = supabase.storage
          .from('event-media')
          .getPublicUrl(data.path);

        console.log('Public URL:', publicUrl);

        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          attachments: [...prev.attachments, ...uploadedUrls]
        }));
        addNotification('success', `${uploadedUrls.length} file(s) uploaded successfully`);
      }

      if (failedCount > 0) {
        addNotification('error', `Failed to upload ${failedCount} file(s)`);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      addNotification('error', 'Failed to upload files');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-800 border-l border-slate-700 shadow-xl z-50 transform transition-transform duration-300 ease-in-out">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X size={16} />
            <span className="text-sm">Back to Tasks</span>
          </button>
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Task' : 'New Task'}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter task title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Enter task description"
            />
          </div>

          {/* Due Date and Assignee */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Due Date
              </label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => handleInputChange('due_date', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Assignee
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-blue-500 relative"
                >
                  {formData.assignee_id ? (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const assignee = clubMembers.find(m => m.user_id === formData.assignee_id);
                        return assignee ? (
                          <>
                            <Avatar
                              firstName={assignee.first_name}
                              lastName={assignee.last_name}
                              imageUrl={assignee.avatar_url}
                              size="sm"
                            />
                            <span className="text-white text-sm">
                              {assignee.first_name} {assignee.last_name}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400 text-sm">Unassigned</span>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-slate-400" />
                      <span className="text-slate-400 text-sm">Select assignee</span>
                    </div>
                  )}
                </button>

                {showAssigneeDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowAssigneeDropdown(false)}
                    />
                    <div className="absolute z-20 w-full mt-2 bg-slate-700 border border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleInputChange('assignee_id', '');
                          setShowAssigneeDropdown(false);
                        }}
                        className="w-full px-3 py-2 flex items-center gap-3 hover:bg-slate-600 transition-colors text-left"
                      >
                        <User size={16} className="text-slate-400" />
                        <span className="text-slate-400 text-sm">Unassigned</span>
                      </button>
                      {clubMembers.length > 0 ? (
                        clubMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              if (member.user_id) {
                                handleInputChange('assignee_id', member.user_id);
                                setShowAssigneeDropdown(false);
                              }
                            }}
                            className={`
                              w-full px-3 py-2 flex items-center gap-3 hover:bg-slate-600 transition-colors text-left
                              ${formData.assignee_id === member.user_id ? 'bg-slate-600' : ''}
                              ${!member.user_id ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <Avatar
                              firstName={member.first_name}
                              lastName={member.last_name}
                              imageUrl={member.avatar_url}
                              size="sm"
                            />
                            <span className="text-white text-sm">
                              {member.first_name} {member.last_name}
                              {!member.user_id && <span className="text-xs text-slate-400 ml-2">(No account)</span>}
                            </span>
                            {formData.assignee_id === member.user_id && (
                              <span className="ml-auto text-blue-400">✓</span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-slate-400 text-center">
                          Loading members...
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Supporting Members */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Supporting Members (Optional)
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFollowerDropdown(!showFollowerDropdown)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-blue-500 relative"
              >
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-slate-400" />
                  {formData.followers.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {formData.followers.slice(0, 3).map((followerId) => {
                          const member = clubMembers.find(m => m.user_id === followerId);
                          if (!member) return null;
                          return (
                            <Avatar
                              key={followerId}
                              firstName={member.first_name}
                              lastName={member.last_name}
                              imageUrl={member.avatar_url}
                              size="sm"
                              className="ring-2 ring-slate-700"
                            />
                          );
                        })}
                      </div>
                      <span className="text-white text-sm">
                        {formData.followers.length} {formData.followers.length === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400 text-sm">Select supporting members</span>
                  )}
                </div>
              </button>

              {showFollowerDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowFollowerDropdown(false)}
                  />
                  <div className="absolute z-20 w-full mt-2 bg-slate-700 border border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {clubMembers.length > 0 ? (
                      clubMembers.map((member) => {
                        const isSelected = member.user_id && formData.followers.includes(member.user_id);
                        const isAssignee = member.user_id && formData.assignee_id === member.user_id;
                        const hasNoAccount = !member.user_id;

                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isAssignee || hasNoAccount) return;

                              const newFollowers = isSelected
                                ? formData.followers.filter(id => id !== member.user_id)
                                : [...formData.followers, member.user_id];

                              handleInputChange('followers', newFollowers);
                            }}
                            disabled={isAssignee || hasNoAccount}
                            className={`
                              w-full px-3 py-2 flex items-center gap-3 hover:bg-slate-600 transition-colors text-left
                              ${isSelected ? 'bg-slate-600' : ''}
                              ${isAssignee || hasNoAccount ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <Avatar
                              firstName={member.first_name}
                              lastName={member.last_name}
                              imageUrl={member.avatar_url}
                              size="sm"
                            />
                            <span className="text-white text-sm">
                              {member.first_name} {member.last_name}
                              {isAssignee && <span className="text-slate-400 ml-2">(Assignee)</span>}
                            </span>
                            {isSelected && !isAssignee && (
                              <span className="ml-auto text-blue-400">✓</span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-400 text-center">
                        Loading members...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Priority and Repeat */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Priority
              </label>
              <div className="relative">
                <Flag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Repeat
              </label>
              <div className="relative">
                <Repeat size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={formData.repeat_type}
                  onChange={(e) => handleInputChange('repeat_type', e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                >
                  <option value="none">No repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
          </div>

          {/* Send Reminder */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="send_reminder"
              checked={formData.send_reminder}
              onChange={(e) => handleInputChange('send_reminder', e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="send_reminder" className="text-sm text-slate-300">
              Send reminder
            </label>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Attachments
            </label>
            <div
              className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-slate-500 transition-colors"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-blue-500');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-blue-500');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-blue-500');
                handleFileUpload(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <input
                id="file-upload"
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              />
              <Upload size={24} className="mx-auto mb-2 text-slate-400" />
              {uploadingFiles ? (
                <p className="text-sm text-blue-400 mb-1">Uploading...</p>
              ) : (
                <>
                  <p className="text-sm text-blue-400 mb-1">Upload a file or drag and drop</p>
                  <p className="text-xs text-slate-500">PNG, JPG, GIF, PDF up to 10MB</p>
                </>
              )}
            </div>

            {/* Display uploaded attachments */}
            {formData.attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {formData.attachments.map((url, index) => {
                  const fileName = url.split('/').pop() || 'attachment';
                  return (
                    <div key={index} className="flex items-center gap-2 p-2 bg-slate-700 rounded-lg">
                      <Upload size={16} className="text-slate-400" />
                      <span className="text-sm text-slate-300 flex-1 truncate">{fileName}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !formData.title.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <span>{isEditing ? 'Update Task' : 'Create Task'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
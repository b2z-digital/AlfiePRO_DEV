import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Flag, Repeat, Bell, Upload, Trash2, Users, SquareCheck as CheckSquare, Plus } from 'lucide-react';
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
    <>
    <section className="a-sheet a-tray fixed top-3 right-3 bottom-3 w-[calc(100%-24px)] sm:w-[500px] z-[9995] overflow-hidden" role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit task' : 'New task'}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="a-sheet-head flex items-center gap-3 border-b a-bd" style={{ padding: '18px 18px 16px 22px' }}>
          <span className="a-tile a-tile-rim"><CheckSquare size={19} /></span>
          <h2 className="a-display a-ink flex-1 text-[21px] font-semibold">
            {isEditing ? 'Edit task' : 'New task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="a-ib"
            aria-label="Back to tasks"
            title="Back to tasks"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col gap-[18px]" style={{ padding: '20px 22px' }}>
          {/* Title */}
          <div>
            <label className="a-flab">
              Title <span className="a-txt-r">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              className="a-inp"
              placeholder="What needs doing?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="a-flab">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
              className="a-inp"
              style={{ height: 88, padding: '12px 14px', resize: 'none' }}
              placeholder="Add details"
            />
          </div>

          {/* Due Date and Assignee */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="a-flab">
                Due date
              </label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 a-dim pointer-events-none" />
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => handleInputChange('due_date', e.target.value)}
                  className="a-inp a-inp-date"
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            <div>
              <label className="a-flab">
                Assignee
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                  className="a-pick w-full" style={{ height: 46 }}
                >
                  {formData.assignee_id ? (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const assignee = clubMembers.find(m => m.id === formData.assignee_id);
                        return assignee ? (
                          <>
                            <Avatar
                              firstName={assignee.first_name}
                              lastName={assignee.last_name}
                              imageUrl={assignee.avatar_url}
                              size="sm"
                            />
                            <span className="a-ink text-sm">
                              {assignee.first_name} {assignee.last_name}
                            </span>
                          </>
                        ) : (
                          <span className="a-dim text-sm">Unassigned</span>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <User size={16} className="a-dim" />
                      <span className="a-dim text-sm">Choose member</span>
                    </div>
                  )}
                </button>

                {showAssigneeDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowAssigneeDropdown(false)}
                    />
                    <div className="a-pop absolute z-20 w-full mt-2 max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleInputChange('assignee_id', '');
                          setShowAssigneeDropdown(false);
                        }}
                        className="a-pop-item w-full"
                      >
                        <User size={16} className="a-dim" />
                        <span className="a-dim text-sm">Unassigned</span>
                      </button>
                      {clubMembers.length > 0 ? (
                        clubMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              handleInputChange('assignee_id', member.id);
                              setShowAssigneeDropdown(false);
                            }}
                            className={`
                              a-pop-item w-full
                              ${formData.assignee_id === member.id ? 'a-pop-item-on' : ''}
                              ${!member.user_id ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <Avatar
                              firstName={member.first_name}
                              lastName={member.last_name}
                              imageUrl={member.avatar_url}
                              size="sm"
                            />
                            <span className="a-ink text-sm">
                              {member.first_name} {member.last_name}
                              {!member.user_id && <span className="text-xs a-dim ml-2">(No account)</span>}
                            </span>
                            {formData.assignee_id === member.id && (
                              <span className="ml-auto text-blue-400">✓</span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm a-dim text-center">
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
            <label className="a-flab">
              Supporting members <span className="a-dim font-normal">· optional</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFollowerDropdown(!showFollowerDropdown)}
                className="a-pick w-full" style={{ height: 46 }}
              >
                <div className="flex items-center gap-2">
                  <Users size={16} className="a-dim" />
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
                              className="ring-2 ring-[#111A2C]"
                            />
                          );
                        })}
                      </div>
                      <span className="a-ink text-sm">
                        {formData.followers.length} {formData.followers.length === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                  ) : (
                    <span className="a-dim text-sm">Add helpers</span>
                  )}
                </div>
              </button>

              {showFollowerDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowFollowerDropdown(false)}
                  />
                  <div className="a-pop absolute z-20 w-full mt-2 max-h-60 overflow-y-auto">
                    {clubMembers.length > 0 ? (
                      clubMembers.map((member) => {
                        const isSelected = member.user_id && formData.followers.includes(member.user_id);
                        const isAssignee = formData.assignee_id === member.id;
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
                              a-pop-item w-full
                              ${isSelected ? 'a-pop-item-on' : ''}
                              ${isAssignee || hasNoAccount ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <Avatar
                              firstName={member.first_name}
                              lastName={member.last_name}
                              imageUrl={member.avatar_url}
                              size="sm"
                            />
                            <span className="a-ink text-sm">
                              {member.first_name} {member.last_name}
                              {isAssignee && <span className="a-dim ml-2">(Assignee)</span>}
                            </span>
                            {isSelected && !isAssignee && (
                              <span className="ml-auto text-blue-400">✓</span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm a-dim text-center">
                        Loading members...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Priority */}
          <div>
            <span className="a-flab">Priority</span>
            <div className="a-seg" style={{ display: 'flex' }} role="radiogroup" aria-label="Priority">
              {([['low', 'Low', '#9AA6BD'], ['medium', 'Medium', '#FFB340'], ['high', 'High', '#FF8A2B'], ['urgent', 'Urgent', '#FF6B6B']] as const).map(([v, l, c]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={formData.priority === v}
                  onClick={() => handleInputChange('priority', v)}
                  className={`a-seg-i flex-1 justify-center ${formData.priority === v ? 'a-seg-on' : ''}`}
                  style={{ padding: '0 6px' }}
                >
                  <span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: c }} />{l}
                </button>
              ))}
            </div>
          </div>

          {/* Repeat + reminder */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="a-flab">
                Repeat
              </label>
              <div className="relative">
                <Repeat size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 a-dim pointer-events-none" />
                <select
                  value={formData.repeat_type}
                  onChange={(e) => handleInputChange('repeat_type', e.target.value)}
                  className="a-inp a-inp-sel"
                  style={{ paddingLeft: 38 }}
                >
                  <option value="none">No repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <label htmlFor="send_reminder" className="a-reminder">
              <Bell size={16} className="a-dim" />
              <span className="flex-1 text-[14px] a-ink">Send reminder</span>
              <input
                type="checkbox"
                id="send_reminder"
                checked={formData.send_reminder}
                onChange={(e) => handleInputChange('send_reminder', e.target.checked)}
                className="sr-only"
              />
              <span className="a-sw" aria-hidden="true" data-on={formData.send_reminder ? 'true' : 'false'} />
            </label>
          </div>

          {/* Attachments */}
          <div>
            <label className="a-flab">
              Attachments
            </label>
            <div
              className="a-drop"
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
              <span className="a-tile"><Upload size={18} /></span>
              {uploadingFiles ? (
                <span className="flex-1 text-[14px] a-txt-b font-semibold">Uploading…</span>
              ) : (
                <span className="flex-1 min-w-0">
                  <span className="block a-ink text-[14px] font-semibold">Drop files or <span className="a-txt-b">browse</span></span>
                  <span className="block a-dim text-[12.5px] mt-0.5">PNG, JPG, GIF or PDF · up to 10MB</span>
                </span>
              )}
            </div>

            {/* Display uploaded attachments */}
            {formData.attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {formData.attachments.map((url, index) => {
                  const fileName = url.split('/').pop() || 'attachment';
                  return (
                    <div key={index} className="a-grp a-ir" style={{ padding: '8px 10px 8px 14px' }}>
                      <Upload size={16} className="a-dim" />
                      <span className="text-sm a-mute flex-1 truncate">{fileName}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(index)}
                        className="a-ib a-ib-d"
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
        <div className="a-sheet-foot flex gap-2.5" style={{ padding: '16px 22px' }}>
          <button
            type="button"
            onClick={onClose}
            className="a-btn flex-1"
            style={{ height: 46 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !formData.title.trim()}
            className="a-btn a-btn-p disabled:opacity-45 disabled:cursor-not-allowed" style={{ flex: 1.4, height: 46 }}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <Plus size={17} /><span>{isEditing ? 'Update task' : 'Create task'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
    </>
  );
};
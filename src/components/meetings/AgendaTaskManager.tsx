import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Clock, UserPlus, LogOut, Save, Check } from 'lucide-react';
import { MemberSelect } from '../ui/MemberSelect';
import { supabase } from '../../utils/supabase';
import { Avatar } from '../ui/Avatar';

interface TaskMember {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

interface AgendaTask {
  id?: string;
  title: string;
  description: string;
  assignee_id: string | null;
  due_date: string;
  due_time: string;
  priority: 'low' | 'medium' | 'high';
  supporting_members: string[];
  isSaved?: boolean;
}

interface AgendaTaskManagerProps {
  agendaItemId: string;
  clubId: string;
  isReadOnly?: boolean;
  meetingCategory?: 'general' | 'committee';
  associationId?: string;
  associationType?: 'state' | 'national';
  onTasksChange?: (tasks: AgendaTask[]) => void;
}

export const AgendaTaskManager: React.FC<AgendaTaskManagerProps> = ({
  agendaItemId,
  clubId,
  isReadOnly = false,
  meetingCategory = 'general',
  associationId,
  associationType,
  onTasksChange
}) => {
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTaskIndex, setSavingTaskIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchMembers();
    fetchExistingTasks();
  }, [clubId, agendaItemId, associationId, associationType]);

  const fetchMembers = async () => {
    try {
      const isAssociation = !!associationId && !!associationType;

      if (isAssociation) {
        if (meetingCategory === 'committee') {
          const assocTable = associationType === 'state' ? 'user_state_associations' : 'user_national_associations';
          const assocCol = associationType === 'state' ? 'state_association_id' : 'national_association_id';

          const { data: assocUsers } = await supabase
            .from(assocTable)
            .select('user_id')
            .eq(assocCol, associationId);

          if (assocUsers && assocUsers.length > 0) {
            const userIds = assocUsers.map(au => au.user_id);
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, avatar_url')
              .in('id', userIds)
              .order('first_name', { ascending: true });

            setMembers((profiles || []).map((p: any) => ({
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              avatar_url: p.avatar_url,
            })));
          } else {
            setMembers([]);
          }
        } else if (associationType === 'state') {
          const { data: clubs } = await supabase
            .from('clubs')
            .select('id')
            .eq('state_association_id', associationId);

          const clubIds = (clubs || []).map(c => c.id);
          if (clubIds.length > 0) {
            const { data, error } = await supabase
              .from('members')
              .select('id, first_name, last_name, avatar_url')
              .in('club_id', clubIds)
              .order('first_name', { ascending: true });

            if (error) throw error;
            setMembers(data || []);
          } else {
            setMembers([]);
          }
        } else {
          const { data: assocUsers } = await supabase
            .from('user_national_associations')
            .select('user_id')
            .eq('national_association_id', associationId);

          if (assocUsers && assocUsers.length > 0) {
            const userIds = assocUsers.map(au => au.user_id);
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, avatar_url')
              .in('id', userIds)
              .order('first_name', { ascending: true });

            setMembers((profiles || []).map((p: any) => ({
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              avatar_url: p.avatar_url,
            })));
          } else {
            setMembers([]);
          }
        }
      } else if (meetingCategory === 'committee') {
        const { data: positions, error: posError } = await supabase
          .from('committee_positions')
          .select('member_id')
          .eq('club_id', clubId);

        if (posError) throw posError;

        const memberIds = (positions || []).map(p => p.member_id).filter(Boolean);
        if (memberIds.length === 0) {
          setMembers([]);
          return;
        }

        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, avatar_url')
          .eq('club_id', clubId)
          .in('id', memberIds)
          .order('first_name');

        if (error) throw error;
        setMembers(data || []);
      } else {
        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, avatar_url')
          .eq('club_id', clubId)
          .eq('membership_status', 'active')
          .order('first_name');

        if (error) throw error;
        setMembers(data || []);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchExistingTasks = async () => {
    try {
      setLoading(true);
      console.log('[AgendaTaskManager] Fetching tasks for agenda item:', agendaItemId);

      const { data, error } = await supabase
        .from('club_tasks')
        .select('*')
        .eq('meeting_agenda_id', agendaItemId);

      if (error) {
        console.error('[AgendaTaskManager] Fetch error:', error);
        throw error;
      }

      console.log('[AgendaTaskManager] Fetched tasks:', data);

      if (data && data.length > 0) {
        const existingTasks: AgendaTask[] = data.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description || '',
          assignee_id: task.assignee_id,
          due_date: task.due_date || '',
          due_time: task.due_time || '',
          priority: task.priority || 'medium',
          supporting_members: task.supporting_members || [],
          isSaved: true
        }));
        setTasks(existingTasks);
        onTasksChange?.(existingTasks);
        console.log('[AgendaTaskManager] Set tasks:', existingTasks);
      } else {
        console.log('[AgendaTaskManager] No tasks found');
        onTasksChange?.([]);
      }
    } catch (error) {
      console.error('[AgendaTaskManager] Error fetching existing tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const addNewTask = () => {
    const newTask: AgendaTask = {
      title: '',
      description: '',
      assignee_id: null,
      due_date: '',
      due_time: '',
      priority: 'medium',
      supporting_members: [],
      isSaved: false
    };
    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
  };

  const updateTask = (index: number, field: keyof AgendaTask, value: any) => {
    const updatedTasks = tasks.map((task, i) =>
      i === index ? { ...task, [field]: value, isSaved: false } : task
    );
    setTasks(updatedTasks);
  };

  const saveTask = async (index: number) => {
    const task = tasks[index];

    if (!task.title || !task.assignee_id) {
      alert('Please provide a task title and assign it to a member');
      return;
    }

    try {
      setSavingTaskIndex(index);

      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id || '';

      const taskData = {
        title: task.title,
        description: task.description || null,
        assignee_id: task.assignee_id,
        due_date: task.due_date || null,
        due_time: task.due_time || null,
        priority: task.priority,
        supporting_members: task.supporting_members || [],
        club_id: clubId,
        meeting_agenda_id: agendaItemId,
        created_by: currentUserId,
        status: 'pending'
      };

      console.log('[AgendaTaskManager] Saving task:', {
        taskData,
        isUpdate: !!task.id,
        taskId: task.id
      });

      if (task.id) {
        // Update existing task
        const { error } = await supabase
          .from('club_tasks')
          .update(taskData)
          .eq('id', task.id);

        if (error) {
          console.error('[AgendaTaskManager] Update error:', error);
          throw error;
        }
        console.log('[AgendaTaskManager] Task updated successfully');
      } else {
        // Insert new task
        const { data, error } = await supabase
          .from('club_tasks')
          .insert([taskData])
          .select()
          .single();

        if (error) {
          console.error('[AgendaTaskManager] Insert error:', error);
          throw error;
        }

        console.log('[AgendaTaskManager] Task created successfully:', data);

        // Verify the task was actually saved (RLS can silently fail)
        const { data: verifyData, error: verifyError } = await supabase
          .from('club_tasks')
          .select('id')
          .eq('id', data.id)
          .maybeSingle();

        if (verifyError) {
          console.error('[AgendaTaskManager] Verification error:', verifyError);
          throw new Error('Failed to verify task was saved');
        }

        if (!verifyData) {
          console.error('[AgendaTaskManager] Task insert blocked by RLS or foreign key constraint');
          throw new Error('Task could not be saved. Please check permissions and try again.');
        }

        console.log('[AgendaTaskManager] Task verified in database');

        // Update task with ID
        const updatedTasks = [...tasks];
        updatedTasks[index] = { ...updatedTasks[index], id: data.id, isSaved: true };
        setTasks(updatedTasks);
        onTasksChange?.(updatedTasks);
        return;
      }

      // Mark as saved
      const updatedTasks = [...tasks];
      updatedTasks[index] = { ...updatedTasks[index], isSaved: true };
      setTasks(updatedTasks);
      onTasksChange?.(updatedTasks);

    } catch (error) {
      console.error('[AgendaTaskManager] Error saving task:', error);
      alert('Failed to save task. Please try again.');
    } finally {
      setSavingTaskIndex(null);
    }
  };

  const removeTask = async (index: number) => {
    const task = tasks[index];

    if (task.id) {
      // Delete from database if it exists
      try {
        const { error } = await supabase
          .from('club_tasks')
          .delete()
          .eq('id', task.id);

        if (error) throw error;
      } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task. Please try again.');
        return;
      }
    }

    const updatedTasks = tasks.filter((_, i) => i !== index);
    setTasks(updatedTasks);
    onTasksChange?.(updatedTasks);
  };

  const addSupportingMember = (taskIndex: number, memberId: string) => {
    const task = tasks[taskIndex];
    if (!task.supporting_members.includes(memberId) && task.assignee_id !== memberId) {
      updateTask(taskIndex, 'supporting_members', [...task.supporting_members, memberId]);
    }
  };

  const removeSupportingMember = (taskIndex: number, memberId: string) => {
    const task = tasks[taskIndex];
    updateTask(
      taskIndex,
      'supporting_members',
      task.supporting_members.filter(id => id !== memberId)
    );
  };

  const getMemberById = (memberId: string) => {
    return members.find(m => m.id === memberId);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (isReadOnly && tasks.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">No tasks assigned to this agenda item</div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task, index) => (
        <div
          key={task.id || index}
          className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-3">
              {/* Task Title */}
              <div>
                <input
                  type="text"
                  value={task.title}
                  onChange={(e) => updateTask(index, 'title', e.target.value)}
                  placeholder="Task title *"
                  disabled={isReadOnly}
                  className={`w-full px-3 py-2 border rounded-lg font-medium ${
                    isReadOnly
                      ? 'bg-gray-50 border-gray-200'
                      : 'border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* Task Description */}
              <div>
                <textarea
                  value={task.description}
                  onChange={(e) => updateTask(index, 'description', e.target.value)}
                  placeholder="Task description (optional)"
                  disabled={isReadOnly}
                  rows={2}
                  className={`w-full px-3 py-2 border rounded-lg text-sm resize-none ${
                    isReadOnly
                      ? 'bg-gray-50 border-gray-200'
                      : 'border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500'
                  }`}
                />
              </div>

              {/* Assignee and Priority Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Primary Assignee */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Assigned To *
                  </label>
                  {isReadOnly && task.assignee_id ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <Avatar
                        firstName={getMemberById(task.assignee_id)?.first_name}
                        lastName={getMemberById(task.assignee_id)?.last_name}
                        imageUrl={getMemberById(task.assignee_id)?.avatar_url}
                        size="xs"
                      />
                      <span className="text-sm">
                        {getMemberById(task.assignee_id)?.first_name}{' '}
                        {getMemberById(task.assignee_id)?.last_name}
                      </span>
                    </div>
                  ) : (
                    <MemberSelect
                      members={members}
                      value={task.assignee_id || ''}
                      onChange={(memberId) => updateTask(index, 'assignee_id', memberId)}
                      disabled={isReadOnly}
                      placeholder="Select member"
                      className="w-full"
                      allowEmpty={false}
                    />
                  )}
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={task.priority}
                    onChange={(e) => updateTask(index, 'priority', e.target.value)}
                    disabled={isReadOnly}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${
                      isReadOnly
                        ? 'bg-gray-50 border-gray-200'
                        : 'border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500'
                    } ${getPriorityColor(task.priority)}`}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Due Date and Time Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    <Calendar className="inline w-3 h-3 mr-1" />
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={task.due_date}
                    onChange={(e) => updateTask(index, 'due_date', e.target.value)}
                    disabled={isReadOnly}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${
                      isReadOnly
                        ? 'bg-gray-50 border-gray-200'
                        : 'border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    <Clock className="inline w-3 h-3 mr-1" />
                    Due Time (optional)
                  </label>
                  <input
                    type="time"
                    value={task.due_time}
                    onChange={(e) => updateTask(index, 'due_time', e.target.value)}
                    disabled={isReadOnly}
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${
                      isReadOnly
                        ? 'bg-gray-50 border-gray-200'
                        : 'border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500'
                    }`}
                  />
                </div>
              </div>

              {/* Supporting Members */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  <UserPlus className="inline w-3 h-3 mr-1" />
                  Supporting Members (optional)
                </label>

                {/* Display selected supporting members */}
                {task.supporting_members.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {task.supporting_members.map(memberId => {
                      const member = getMemberById(memberId);
                      return member ? (
                        <div
                          key={memberId}
                          className="flex items-center gap-1 px-2 py-1 bg-cyan-50 border border-cyan-200 rounded-full text-xs"
                        >
                          <Avatar
                            firstName={member.first_name}
                            lastName={member.last_name}
                            imageUrl={member.avatar_url}
                            size="xs"
                          />
                          <span className="text-cyan-900">
                            {member.first_name} {member.last_name}
                          </span>
                          {!isReadOnly && (
                            <button
                              onClick={() => removeSupportingMember(index, memberId)}
                              className="text-cyan-600 hover:text-cyan-800"
                            >
                              <LogOut className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {/* Add supporting member dropdown */}
                {!isReadOnly && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addSupportingMember(index, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  >
                    <option value="">+ Add supporting member</option>
                    {members
                      .filter(m =>
                        m.id !== task.assignee_id &&
                        !task.supporting_members.includes(m.id)
                      )
                      .map(member => (
                        <option key={member.id} value={member.id}>
                          {member.first_name} {member.last_name}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* Save button for individual task */}
              {!isReadOnly && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => saveTask(index)}
                    disabled={savingTaskIndex === index || !task.title || !task.assignee_id}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                      task.isSaved
                        ? 'bg-green-100 text-green-700 border-2 border-green-300'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white hover:from-cyan-700 hover:to-blue-800 shadow-lg hover:shadow-xl'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {savingTaskIndex === index ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Saving...</span>
                      </>
                    ) : task.isSaved ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Save Task</span>
                      </>
                    )}
                  </button>
                  {task.isSaved && !task.title && !task.assignee_id && (
                    <span className="text-xs text-gray-500 italic">
                      Task title and assignee required
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Delete Button */}
            {!isReadOnly && (
              <button
                onClick={() => {
                  if (task.id) {
                    if (confirm('Are you sure you want to delete this task?')) {
                      removeTask(index);
                    }
                  } else {
                    removeTask(index);
                  }
                }}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                title="Remove task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add Task Button */}
      {!isReadOnly && (
        <button
          onClick={addNewTask}
          className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 transition-all flex items-center justify-center gap-2 font-medium"
        >
          <Plus className="w-5 h-5" />
          Add Task
        </button>
      )}

      {tasks.length === 0 && !isReadOnly && (
        <p className="text-sm text-gray-500 text-center italic">
          Click "Add Task" to create action items for this agenda item
        </p>
      )}
    </div>
  );
};

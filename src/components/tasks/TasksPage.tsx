import React, { useState, useEffect } from 'react';
import { Plus, Search, Import as SortAsc, SquareCheck as CheckSquare, X, ListFilter as Filter, ChevronLeft } from 'lucide-react';
import { TaskForm } from './TaskForm';
import { TaskDetails } from './TaskDetails';
import { TaskCategorySidebar } from './TaskCategorySidebar';
import { TaskListItem } from './TaskListItem';
import { ConfirmationModal } from '../ConfirmationModal';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { supabase } from '../../utils/supabase';
import { Task as TaskType } from '../../types/task';
import { createTask, updateTask } from '../../utils/taskStorage';
import { usePermissions } from '../../hooks/usePermissions';

interface Task extends TaskType {
  assignee?: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  clubs?: {
    name: string;
  };
  state_associations?: {
    name: string;
  };
  national_associations?: {
    name: string;
  };
}

interface TasksPageProps {
  darkMode: boolean;
}

export const TasksPage: React.FC<TasksPageProps> = ({ darkMode }) => {
  const { currentClub, currentOrganization, user } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const { can, isMember } = usePermissions();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userMemberIds, setUserMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeCategory, setActiveCategory] = useState('current');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'title'>('due_date');
  const [showSearch, setShowSearch] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showCategorySidebar, setShowCategorySidebar] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    const orgId = currentOrganization?.id || currentClub?.clubId;
    if (orgId) {
      fetchTasks();
    } else {
      setLoading(false);
    }
  }, [currentClub, currentOrganization]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryUserId = effectiveUserId || user?.id;
      if (!queryUserId) {
        throw new Error('User not authenticated');
      }

      const [clubsData, stateAssocData, nationalAssocData, memberData] = await Promise.all([
        supabase.from('user_clubs').select('club_id').eq('user_id', queryUserId),
        supabase.from('user_state_associations').select('state_association_id').eq('user_id', queryUserId),
        supabase.from('user_national_associations').select('national_association_id').eq('user_id', queryUserId),
        supabase.from('members').select('id').eq('user_id', queryUserId)
      ]);

      const userClubIds = clubsData.data?.map(c => c.club_id) || [];
      const userStateIds = stateAssocData.data?.map(s => s.state_association_id) || [];
      const userNationalIds = nationalAssocData.data?.map(n => n.national_association_id) || [];
      const userMemberIds = memberData.data?.map(m => m.id) || [];
      setUserMemberIds(userMemberIds);

      let query = supabase
        .from('club_tasks')
        .select(`
          *,
          assignee:members!assignee_id (
            first_name,
            last_name,
            avatar_url,
            user_id
          ),
          clubs!club_id (
            name
          ),
          state_associations!state_association_id (
            name
          ),
          national_associations!national_association_id (
            name
          )
        `);

      // For members, only show tasks assigned to them OR in their clubs/associations
      if (isMember) {
        const filters = [];
        if (userMemberIds.length > 0) filters.push(`assignee_id.in.(${userMemberIds.join(',')})`);
        if (userClubIds.length > 0) filters.push(`club_id.in.(${userClubIds.join(',')})`);
        if (userStateIds.length > 0) filters.push(`state_association_id.in.(${userStateIds.join(',')})`);
        if (userNationalIds.length > 0) filters.push(`national_association_id.in.(${userNationalIds.join(',')})`);

        if (filters.length > 0) {
          query = query.or(filters.join(','));
        } else {
          setTasks([]);
          setLoading(false);
          return;
        }
      } else {
        // For admins, show all tasks in their clubs/associations
        const filters = [];
        if (userClubIds.length > 0) filters.push(`club_id.in.(${userClubIds.join(',')})`);
        if (userStateIds.length > 0) filters.push(`state_association_id.in.(${userStateIds.join(',')})`);
        if (userNationalIds.length > 0) filters.push(`national_association_id.in.(${userNationalIds.join(',')})`);

        if (filters.length > 0) {
          query = query.or(filters.join(','));
        } else {
          // No memberships found
          setTasks([]);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch attachment counts and comment counts for each task
      if (data && data.length > 0) {
        const taskIds = data.map(t => t.id);

        // Fetch attachment counts
        const { data: attachmentCounts } = await supabase
          .from('task_attachments')
          .select('task_id')
          .in('task_id', taskIds);

        // Count attachments per task
        const attachmentCountMap = new Map<string, number>();
        attachmentCounts?.forEach(att => {
          attachmentCountMap.set(att.task_id, (attachmentCountMap.get(att.task_id) || 0) + 1);
        });

        // Fetch comment counts
        const { data: commentCounts } = await supabase
          .from('task_comments')
          .select('task_id')
          .in('task_id', taskIds);

        // Count comments per task
        const commentCountMap = new Map<string, number>();
        commentCounts?.forEach(comment => {
          commentCountMap.set(comment.task_id, (commentCountMap.get(comment.task_id) || 0) + 1);
        });

        // Add attachment count and comment count to each task
        const tasksWithCounts = data.map(task => ({
          ...task,
          attachment_count: attachmentCountMap.get(task.id) || 0,
          comment_count: commentCountMap.get(task.id) || 0
        }));

        setTasks(tasksWithCounts);
      } else {
        setTasks([]);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    try {
      const updates = {
        status: (completed ? 'completed' : 'pending') as 'completed' | 'pending',
        completed_at: completed ? new Date().toISOString() : null
      };

      const { error } = await supabase
        .from('club_tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;

      // Update local state
      setTasks(prev => prev.map(task =>
        task.id === taskId
          ? { ...task, status: updates.status, completed_at: updates.completed_at }
          : task
      ));
    } catch (err) {
      console.error('Error updating task:', err);
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('club_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prev => prev.filter(task => task.id !== taskId));
      addNotification('success', 'Task deleted successfully');
    } catch (err) {
      console.error('Error deleting task:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const handleDeleteClick = (task: Task) => {
    setTaskToDelete(task);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (taskToDelete) {
      await handleDeleteTask(taskToDelete.id);
      setTaskToDelete(null);
    }
    setShowDeleteConfirm(false);
  };

  const handleTaskSaved = async () => {
    await fetchTasks();
    setShowTaskForm(false);
    setEditingTask(null);
    addNotification('success', editingTask ? 'Task updated successfully' : 'Task created successfully');
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setShowTaskDetails(true);
  };

  // Filter tasks based on active category
  const getFilteredTasks = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    let filtered = tasks;

    // Apply category filter
    switch (activeCategory) {
      case 'current':
        filtered = tasks.filter(task =>
          (task.status === 'pending' || task.status === 'in_progress') &&
          (userMemberIds.length === 0 || userMemberIds.includes(task.assignee_id || ''))
        );
        break;
      case 'overdue':
        filtered = tasks.filter(task =>
          task.due_date &&
          new Date(task.due_date) < today &&
          task.status !== 'completed' &&
          userMemberIds.includes(task.assignee_id || '')
        );
        break;
      case 'dueToday':
        filtered = tasks.filter(task =>
          task.due_date &&
          new Date(task.due_date).toDateString() === today.toDateString() &&
          userMemberIds.includes(task.assignee_id || '')
        );
        break;
      case 'dueThisWeek':
        filtered = tasks.filter(task =>
          task.due_date &&
          new Date(task.due_date) >= today &&
          new Date(task.due_date) <= weekFromNow &&
          userMemberIds.includes(task.assignee_id || '')
        );
        break;
      case 'dueThisMonth':
        filtered = tasks.filter(task =>
          task.due_date &&
          new Date(task.due_date) >= today &&
          new Date(task.due_date) <= monthFromNow &&
          userMemberIds.includes(task.assignee_id || '')
        );
        break;
      case 'completed':
        filtered = tasks.filter(task => task.status === 'completed' && userMemberIds.includes(task.assignee_id || ''));
        break;
      case 'myTasks':
        filtered = tasks.filter(task => userMemberIds.includes(task.assignee_id || ''));
        break;
      case 'all':
      default:
        filtered = tasks;
        break;
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(task =>
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'due_date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case 'priority':
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return filtered;
  };

  // Calculate task counts for sidebar
  const getTaskCounts = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const myTasks = tasks.filter(task => userMemberIds.includes(task.assignee_id || ''));

    return {
      current: myTasks.filter(task =>
        task.status === 'pending' || task.status === 'in_progress'
      ).length,
      overdue: myTasks.filter(task =>
        task.due_date &&
        new Date(task.due_date) < today &&
        task.status !== 'completed'
      ).length,
      dueToday: myTasks.filter(task =>
        task.due_date &&
        new Date(task.due_date).toDateString() === today.toDateString()
      ).length,
      dueThisWeek: myTasks.filter(task =>
        task.due_date &&
        new Date(task.due_date) >= today &&
        new Date(task.due_date) <= weekFromNow
      ).length,
      dueThisMonth: myTasks.filter(task =>
        task.due_date &&
        new Date(task.due_date) >= today &&
        new Date(task.due_date) <= monthFromNow
      ).length,
      completed: myTasks.filter(task => task.status === 'completed').length,
      all: tasks.length,
      myTasks: myTasks.length
    };
  };

  const filteredTasks = getFilteredTasks();
  const taskCounts = getTaskCounts();

  const getCategoryTitle = () => {
    const categoryTitles = {
      current: 'Current Tasks',
      overdue: 'Overdue Tasks',
      dueToday: 'Due Today',
      dueThisWeek: 'Due This Week',
      dueThisMonth: 'Due This Month',
      completed: 'Completed Tasks',
      all: 'All Tasks',
      myTasks: 'My Tasks'
    };
    return categoryTitles[activeCategory] || 'Tasks';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const now0 = new Date();
  const today0 = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate());
  const groupOf = (t: typeof filteredTasks[number]) => {
    if (t.status === 'completed') return 'completed';
    if (!t.due_date) return 'nodate';
    const d = new Date(t.due_date + (t.due_date.length <= 10 ? 'T00:00:00' : ''));
    if (d < today0) return 'overdue';
    if (d.toDateString() === today0.toDateString()) return 'today';
    return 'upcoming';
  };
  const GROUPS: { id: string; label: string; light: string }[] = [
    { id: 'overdue', label: 'Overdue', light: 'a-light-r' },
    { id: 'today', label: 'Due today', light: 'a-light-a' },
    { id: 'upcoming', label: 'Upcoming', light: 'a-light-b' },
    { id: 'nodate', label: 'No due date', light: 'a-light-n' },
    { id: 'completed', label: 'Completed', light: 'a-light-g' },
  ];
  const grouped = GROUPS.map(g => ({ ...g, tasks: filteredTasks.filter(t => groupOf(t) === g.id) })).filter(g => g.tasks.length > 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px]" style={{ padding: '36px 48px 96px 36px' }}>
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><CheckSquare size={24} /></span>
          <div className="flex-1 min-w-[180px]">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">{getCategoryTitle().replace(/ Tasks$/, ' tasks')}</h1>
            <p className="a-mute mt-1 text-[14.5px]">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
            </p>
          </div>
          <label className="a-field" style={{ width: 320, maxWidth: '100%' }}>
            <Search size={17} />
            <span className="sr-only">Search tasks</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tasks"
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} className="a-dim flex" aria-label="Clear search"><X size={15} /></button>
            )}
          </label>
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="a-ib a-ib-box"
              style={{ width: 42, height: 42 }}
              title="Sort tasks"
              aria-label="Sort tasks"
            >
              <SortAsc size={18} />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="a-pop absolute right-0 top-[48px] z-50 w-52">
                  {([['due_date', 'Sort by due date'], ['priority', 'Sort by priority'], ['title', 'Sort by title']] as const).map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => {
                        setSortBy(k);
                        setShowSortMenu(false);
                      }}
                      className={`a-pop-item w-full ${sortBy === k ? 'a-pop-item-on' : ''}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {can('tasks.create') && (
            <button
              onClick={() => {
                setEditingTask(null);
                setShowTaskForm(true);
              }}
              className="a-btn a-btn-p"
              style={{ height: 42, borderRadius: 13 }}
            >
              <Plus size={17} />
              New task
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <aside className="a-card w-full lg:w-[300px] lg:flex-none lg:sticky lg:top-6" style={{ padding: 16 }} aria-label="Task lists">
            <TaskCategorySidebar
              activeCategory={activeCategory}
              onCategorySelect={(category) => {
                setActiveCategory(category);
                setShowCategorySidebar(false);
              }}
              taskCounts={taskCounts}
              darkMode={darkMode}
            />
          </aside>

          {/* Task List */}
          <div className="a-card flex-1 min-w-0 w-full overflow-hidden">
            {error && (
              <div className="a-note a-note-r m-4 text-[13.5px]">
                <p>{error}</p>
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <div className="a-empty py-16 px-6">
                <span className="a-tile" style={{ width: 48, height: 48 }}><CheckSquare size={22} /></span>
                <h3 className="a-ink text-[16px] font-semibold">
                  No tasks found
                </h3>
                <p className="a-dim text-[13.5px]">
                  {searchTerm
                    ? 'Try adjusting your search terms'
                    : 'Create your first task to get started'}
                </p>
              </div>
            ) : (
              grouped.map((g, gi) => (
                <React.Fragment key={g.id}>
                  {gi > 0 && <div className="a-hr" style={{ height: 1, marginTop: 6 }} />}
                  <div className="flex items-center gap-2.5" style={{ padding: '14px 18px 10px' }}>
                    <span className={`a-light ${g.light}`} />
                    <span className="a-display a-ink text-[15px] font-semibold">{g.label}</span>
                    <span className="a-cnt">{g.tasks.length}</span>
                  </div>
                  {g.tasks.map((task) => (
                    <TaskListItem
                      key={task.id}
                      task={task}
                      onToggleComplete={handleToggleComplete}
                      onEdit={handleEditTask}
                      onDelete={() => handleDeleteClick(task)}
                      onClick={handleTaskClick}
                      darkMode={darkMode}
                    />
                  ))}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Task Form Modal */}
      {showTaskForm && (
        <TaskForm
          isOpen={showTaskForm}
          onClose={() => {
            setShowTaskForm(false);
            setEditingTask(null);
          }}
          onSubmit={async (taskData) => {
            try {
              if (editingTask) {
                const { attachments, created_by, club_id, state_association_id, national_association_id, ...updateFields } = taskData;

                const { error } = await supabase
                  .from('club_tasks')
                  .update(updateFields)
                  .eq('id', editingTask.id);

                if (error) throw error;

                // Handle attachments if any new ones were uploaded
                if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                  // attachments are URLs (strings) from the upload handler
                  for (const url of attachments) {
                    if (typeof url === 'string') {
                      // Extract filename from URL
                      const urlParts = url.split('/');
                      const filename = urlParts[urlParts.length - 1];

                      await supabase
                        .from('task_attachments')
                        .insert({
                          task_id: editingTask.id,
                          name: filename,
                          url: url,
                          type: 'application/octet-stream',
                          size: 0
                        });
                    }
                  }
                }
              } else {
                // Create new task
                const { attachments, ...taskDataWithoutAttachments } = taskData;

                const { data: newTask, error } = await supabase
                  .from('club_tasks')
                  .insert([taskDataWithoutAttachments])
                  .select()
                  .single();

                if (error) throw error;

                // Handle attachments if any were uploaded
                if (newTask && attachments && Array.isArray(attachments) && attachments.length > 0) {
                  // attachments are URLs (strings) from the upload handler
                  for (const url of attachments) {
                    if (typeof url === 'string') {
                      // Extract filename from URL
                      const urlParts = url.split('/');
                      const filename = urlParts[urlParts.length - 1];

                      await supabase
                        .from('task_attachments')
                        .insert({
                          task_id: newTask.id,
                          name: filename,
                          url: url,
                          type: 'application/octet-stream',
                          size: 0
                        });
                    }
                  }
                }
              }

              handleTaskSaved();
            } catch (err) {
              console.error('Error saving task:', err);
              setError(err instanceof Error ? err.message : 'Failed to save task');
              throw err;
            }
          }}
          task={editingTask}
          isEditing={!!editingTask}
          darkMode={darkMode}
        />
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Task"
        message={`Are you sure you want to delete "${taskToDelete?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      {/* Task Details Modal */}
      {showTaskDetails && selectedTask && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => {
            setShowTaskDetails(false);
            setSelectedTask(null);
          }}
        >
          <div
            className={`w-full max-w-6xl rounded-xl shadow-2xl ${darkMode ? 'bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 max-h-[90vh] overflow-y-auto">
              <TaskDetails
                task={selectedTask}
                darkMode={darkMode}
                onClose={() => {
                  setShowTaskDetails(false);
                  setSelectedTask(null);
                }}
                onEdit={() => {
                  setShowTaskDetails(false);
                  handleEditTask(selectedTask);
                }}
                onComplete={async () => {
                  await handleToggleComplete(selectedTask.id, true);
                  fetchTasks();
                }}
                onDelete={async () => {
                  setShowTaskDetails(false);
                  handleDeleteClick(selectedTask);
                }}
                onUpdate={fetchTasks}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
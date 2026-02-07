import React, { useState, useEffect } from 'react';
import { Plus, Search, SortAsc, CheckSquare, X, Filter, ChevronLeft } from 'lucide-react';
import { TaskForm } from './TaskForm';
import { TaskDetails } from './TaskDetails';
import { TaskCategorySidebar } from './TaskCategorySidebar';
import { TaskListItem } from './TaskListItem';
import { ConfirmationModal } from '../ConfirmationModal';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
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
  const { can, isMember } = usePermissions();
  const [tasks, setTasks] = useState<Task[]>([]);
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

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Get all clubs and associations the user belongs to
      const [clubsData, stateAssocData, nationalAssocData, memberData] = await Promise.all([
        supabase.from('user_clubs').select('club_id').eq('user_id', user.id),
        supabase.from('user_state_associations').select('state_association_id').eq('user_id', user.id),
        supabase.from('user_national_associations').select('national_association_id').eq('user_id', user.id),
        supabase.from('members').select('id').eq('user_id', user.id)
      ]);

      const userClubIds = clubsData.data?.map(c => c.club_id) || [];
      const userStateIds = stateAssocData.data?.map(s => s.state_association_id) || [];
      const userNationalIds = nationalAssocData.data?.map(n => n.national_association_id) || [];
      const userMemberIds = memberData.data?.map(m => m.id) || [];

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

  const handleTaskSaved = () => {
    fetchTasks();
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
          task.status === 'pending' || task.status === 'in_progress'
        );
        break;
      case 'overdue':
        filtered = tasks.filter(task => 
          task.due_date && 
          new Date(task.due_date) < today && 
          task.status !== 'completed'
        );
        break;
      case 'dueToday':
        filtered = tasks.filter(task => 
          task.due_date && 
          new Date(task.due_date).toDateString() === today.toDateString()
        );
        break;
      case 'dueThisWeek':
        filtered = tasks.filter(task => 
          task.due_date && 
          new Date(task.due_date) >= today && 
          new Date(task.due_date) <= weekFromNow
        );
        break;
      case 'dueThisMonth':
        filtered = tasks.filter(task => 
          task.due_date && 
          new Date(task.due_date) >= today && 
          new Date(task.due_date) <= monthFromNow
        );
        break;
      case 'completed':
        filtered = tasks.filter(task => task.status === 'completed');
        break;
      case 'myTasks':
        filtered = tasks.filter(task => task.assignee_id === user?.id);
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

    return {
      current: tasks.filter(task => 
        task.status === 'pending' || task.status === 'in_progress'
      ).length,
      overdue: tasks.filter(task => 
        task.due_date && 
        new Date(task.due_date) < today && 
        task.status !== 'completed'
      ).length,
      dueToday: tasks.filter(task => 
        task.due_date && 
        new Date(task.due_date).toDateString() === today.toDateString()
      ).length,
      dueThisWeek: tasks.filter(task => 
        task.due_date && 
        new Date(task.due_date) >= today && 
        new Date(task.due_date) <= weekFromNow
      ).length,
      dueThisMonth: tasks.filter(task => 
        task.due_date && 
        new Date(task.due_date) >= today && 
        new Date(task.due_date) <= monthFromNow
      ).length,
      completed: tasks.filter(task => task.status === 'completed').length,
      all: tasks.length,
      myTasks: tasks.filter(task => task.assignee_id === user?.id).length
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <CheckSquare className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{getCategoryTitle()}</h1>
              <p className="text-slate-400">
                {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Expandable Search */}
            {showSearch ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-64 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchTerm('');
                  }}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title="Search tasks"
              >
                <Search size={20} />
              </button>
            )}

            {/* Sort Menu */}
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title="Sort tasks"
            >
              <SortAsc size={20} />
            </button>

            {showSortMenu && (
              <div className="fixed inset-0 z-50" onClick={() => setShowSortMenu(false)}>
                <div className="absolute right-16 top-32 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      setSortBy('due_date');
                      setShowSortMenu(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors first:rounded-t-lg ${
                      sortBy === 'due_date' ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300'
                    }`}
                  >
                    Sort by Due Date
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('priority');
                      setShowSortMenu(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors ${
                      sortBy === 'priority' ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300'
                    }`}
                  >
                    Sort by Priority
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('title');
                      setShowSortMenu(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left hover:bg-slate-700 transition-colors last:rounded-b-lg ${
                      sortBy === 'title' ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300'
                    }`}
                  >
                    Sort by Title
                  </button>
                </div>
              </div>
            )}

            {can('tasks.create') && (
              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskForm(true);
                }}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 animate-pulse"
              >
                <Plus size={18} />
                New Task
              </button>
            )}
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-3">
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="text-6xl mb-4 text-slate-600">
                📋
              </div>
              <h3 className="text-lg font-medium mb-2 text-slate-300">
                No tasks found
              </h3>
              <p className="text-slate-400">
                {searchTerm
                  ? 'Try adjusting your search terms'
                  : 'Create your first task to get started'}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditTask}
                onDelete={() => handleDeleteClick(task)}
                onClick={handleTaskClick}
                darkMode={darkMode}
              />
            ))
          )}
        </div>

        {/* Filter Button - Fixed Right Side Tab */}
        <button
          onClick={() => setShowCategorySidebar(!showCategorySidebar)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-gradient-to-l from-blue-600 to-purple-600 text-white px-3 py-6 rounded-l-xl shadow-lg hover:shadow-blue-500/20 hover:scale-105 transition-all duration-200 z-40 flex flex-col items-center gap-2"
          title="Filter Tasks"
        >
          <Filter size={20} />
          <div className="flex flex-col items-center">
            {['F', 'I', 'L', 'T', 'E', 'R', 'S'].map((letter, index) => (
              <span key={index} className="text-xs font-medium leading-tight">
                {letter}
              </span>
            ))}
          </div>
        </button>

        {/* Collapsible Sidebar Panel */}
        <div
          className={`fixed right-0 top-0 h-full w-80 bg-slate-800/95 backdrop-blur-sm border-l border-slate-700 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${
            showCategorySidebar ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Task Filters</h3>
              <button
                onClick={() => setShowCategorySidebar(false)}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <TaskCategorySidebar
                activeCategory={activeCategory}
                onCategorySelect={(category) => {
                  setActiveCategory(category);
                  setShowCategorySidebar(false);
                }}
                taskCounts={taskCounts}
                darkMode={darkMode}
              />
            </div>
          </div>
        </div>

        {/* Overlay when sidebar is open */}
        {showCategorySidebar && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setShowCategorySidebar(false)}
          />
        )}
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
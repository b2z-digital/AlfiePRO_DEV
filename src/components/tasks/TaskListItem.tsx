import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, Calendar, CalendarPlus, User, Flag, Users, Paperclip, MessageCircle, Building2 } from 'lucide-react';
import { CircularCheckbox } from '../ui/CircularCheckbox';
import { Avatar } from '../ui/Avatar';
import { formatDate } from '../../utils/date';
import { Task as TaskType } from '../../types/task';
import { exportTaskToCalendar } from '../../utils/calendarExport';

interface Task extends TaskType {
  assignee?: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  attachment_count?: number;
  comment_count?: number;
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

interface TaskListItemProps {
  task: Task;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: () => void;
  onClick: (task: Task) => void;
  darkMode: boolean;
}

export const TaskListItem: React.FC<TaskListItemProps> = ({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  onClick,
  darkMode
}) => {
  const [followerProfiles, setFollowerProfiles] = useState<any[]>([]);
  const isCompleted = task.status === 'completed';
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isCompleted;
  
  const priorityColors = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    urgent: 'bg-red-500'
  };

  const priorityLabels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent'
  };

  const assigneeName = task.assignee
    ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim()
    : 'Unassigned';

  const organizationName = task.clubs?.name || task.state_associations?.name || task.national_associations?.name;

  useEffect(() => {
    const fetchFollowers = async () => {
      if (!task.followers || task.followers.length === 0) {
        setFollowerProfiles([]);
        return;
      }

      try {
        const { supabase } = await import('../../utils/supabase');
        const { data } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', task.followers);

        setFollowerProfiles(data || []);
      } catch (err) {
        console.error('Error fetching followers:', err);
      }
    };

    fetchFollowers();
  }, [task.followers]);

  const handleExportToCalendar = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!task.due_date) {
      alert('This task does not have a due date and cannot be added to calendar');
      return;
    }

    try {
      exportTaskToCalendar(
        task.title,
        task.description,
        task.due_date,
        organizationName
      );
    } catch (error) {
      console.error('Error exporting to calendar:', error);
      alert('Failed to export task to calendar');
    }
  };

  return (
    <div className={`
      group relative p-5 rounded-lg transition-all cursor-pointer
      ${darkMode
        ? 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:shadow-lg'
        : 'bg-white border border-slate-200/80 hover:border-slate-300/80 shadow-md hover:shadow-xl'}
      ${isCompleted ? 'opacity-70' : ''}
      ${isOverdue ? darkMode ? 'border-red-500/30' : 'border-red-400/30' : ''}
    `}>

      <div className="relative flex items-start gap-4">
        {/* Circular Checkbox */}
        <div className="mt-1">
          <CircularCheckbox
            checked={isCompleted}
            onChange={(checked) => onToggleComplete(task.id, checked)}
            size="md"
          />
        </div>

        {/* Task Content */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onClick(task)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* Title */}
              <h3 className={`
                font-bold text-lg leading-tight mb-2 tracking-tight
                ${isCompleted
                  ? darkMode ? 'text-slate-500 line-through' : 'text-slate-400 line-through'
                  : darkMode ? 'text-white' : 'text-slate-900'}
              `}>
                {task.title}
              </h3>

              {/* Description */}
              {task.description && (
                <p className={`
                  text-sm mb-3 line-clamp-2
                  ${darkMode ? 'text-slate-400' : 'text-slate-600'}
                `}>
                  {task.description}
                </p>
              )}

              {/* Task Details */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {/* Organization Name */}
                {organizationName && (
                  <div className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium shadow-sm
                    ${darkMode ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 ring-1 ring-cyan-400/30' : 'bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 ring-1 ring-cyan-200/50'}
                  `}>
                    <Building2 size={14} />
                    <span>{organizationName}</span>
                  </div>
                )}

                {/* Due Date */}
                {task.due_date && (
                  <div className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium
                    ${isOverdue
                      ? darkMode ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30' : 'bg-red-50 text-red-600 ring-1 ring-red-200/50'
                      : darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600'}
                  `}>
                    <Calendar size={14} />
                    <span>{formatDate(task.due_date)}</span>
                  </div>
                )}

                {/* Assignee and Followers */}
                <div className="flex items-center gap-2">
                  {task.assignee ? (
                    <>
                      <Avatar
                        firstName={task.assignee.first_name}
                        lastName={task.assignee.last_name}
                        imageUrl={task.assignee.avatar_url}
                        size="xs"
                      />
                      {followerProfiles.length > 0 && (
                        <div className="flex -space-x-2">
                          {followerProfiles.slice(0, 3).map((follower) => (
                            <Avatar
                              key={follower.id}
                              firstName={follower.first_name}
                              lastName={follower.last_name}
                              imageUrl={follower.avatar_url}
                              size="xs"
                            />
                          ))}
                          {followerProfiles.length > 3 && (
                            <div className={`
                              w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                              ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'}
                            `}>
                              +{followerProfiles.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <User size={14} className={darkMode ? 'text-slate-400' : 'text-slate-600'} />
                    </>
                  )}
                </div>

                {/* Attachment Indicator */}
                {task.attachment_count && task.attachment_count > 0 && (
                  <div className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium shadow-sm
                    ${darkMode ? 'bg-slate-700/50 text-slate-300 ring-1 ring-slate-600/50' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/50'}
                  `}>
                    <Paperclip size={14} />
                    <span className="text-xs font-semibold">{task.attachment_count}</span>
                  </div>
                )}

                {/* Priority */}
                <div className={`
                  flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium shadow-sm
                  ${task.priority === 'urgent'
                    ? darkMode ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30' : 'bg-red-50 text-red-600 ring-1 ring-red-200/50'
                    : task.priority === 'high'
                    ? darkMode ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/30' : 'bg-orange-50 text-orange-600 ring-1 ring-orange-200/50'
                    : task.priority === 'medium'
                    ? darkMode ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-400/30' : 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200/50'
                    : darkMode ? 'bg-green-500/20 text-green-300 ring-1 ring-green-400/30' : 'bg-green-50 text-green-600 ring-1 ring-green-200/50'}
                `}>
                  <div className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`} />
                  <span>{priorityLabels[task.priority]}</span>
                </div>

                {/* Comment Indicator */}
                {task.comment_count && task.comment_count > 0 && (
                  <div className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium shadow-sm
                    ${darkMode ? 'bg-green-500/20 text-green-300 ring-1 ring-green-400/30' : 'bg-green-50 text-green-600 ring-1 ring-green-200/50'}
                  `}>
                    <MessageCircle size={14} />
                    <span className="text-xs font-semibold">{task.comment_count}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200" onClick={(e) => e.stopPropagation()}>
              {task.due_date && (
                <button
                  onClick={handleExportToCalendar}
                  className={`
                    p-2.5 rounded-xl transition-all duration-200 hover:scale-105 shadow-sm
                    ${darkMode
                      ? 'bg-slate-700/50 hover:bg-purple-500/20 text-slate-400 hover:text-purple-300 ring-1 ring-slate-600/50 hover:ring-purple-400/30'
                      : 'bg-slate-100 hover:bg-purple-50 text-slate-500 hover:text-purple-700 ring-1 ring-slate-200/50 hover:ring-purple-200/50'}
                  `}
                  title="Add to calendar (Google, Apple, Outlook)"
                >
                  <CalendarPlus size={16} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(task);
                }}
                className={`
                  p-2.5 rounded-xl transition-all duration-200 hover:scale-105 shadow-sm
                  ${darkMode
                    ? 'bg-slate-700/50 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 ring-1 ring-slate-600/50 hover:ring-cyan-400/30'
                    : 'bg-slate-100 hover:bg-cyan-50 text-slate-500 hover:text-cyan-700 ring-1 ring-slate-200/50 hover:ring-cyan-200/50'}
                `}
                title="Edit task"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className={`
                  p-2.5 rounded-xl transition-all duration-200 hover:scale-105 shadow-sm
                  ${darkMode
                    ? 'bg-slate-700/50 hover:bg-red-500/20 text-slate-400 hover:text-red-300 ring-1 ring-slate-600/50 hover:ring-red-400/30'
                    : 'bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-700 ring-1 ring-slate-200/50 hover:ring-red-200/50'}
                `}
                title="Delete task"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
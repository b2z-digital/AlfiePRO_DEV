import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, CalendarPlus, User, Flag, Users, Paperclip, MessageCircle, Building2, AlertTriangle } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
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

const getDateParts = (dateStr: string) => {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDate();
  const month = date.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase();
  const weekday = date.toLocaleDateString('en-AU', { weekday: 'short' });
  return { day, month, weekday };
};

const getDaysUntilDue = (dateStr: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

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
  const daysUntilDue = task.due_date ? getDaysUntilDue(task.due_date) : null;

  const priorityColors: Record<string, string> = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    urgent: 'bg-red-500'
  };

  const priorityLabels: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent'
  };

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

  const getDateCalloutStyle = () => {
    if (isCompleted) {
      return darkMode
        ? 'bg-slate-700/60 border-slate-600/50'
        : 'bg-slate-100 border-slate-200';
    }
    if (isOverdue) {
      return darkMode
        ? 'bg-red-500/15 border-red-500/40'
        : 'bg-red-50 border-red-300';
    }
    if (daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0) {
      return darkMode
        ? 'bg-amber-500/15 border-amber-500/40'
        : 'bg-amber-50 border-amber-300';
    }
    return darkMode
      ? 'bg-slate-700/60 border-slate-600/50'
      : 'bg-slate-50 border-slate-200';
  };

  const getDateTextColor = () => {
    if (isCompleted) {
      return darkMode ? 'text-slate-500' : 'text-slate-400';
    }
    if (isOverdue) {
      return darkMode ? 'text-red-400' : 'text-red-600';
    }
    if (daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0) {
      return darkMode ? 'text-amber-400' : 'text-amber-600';
    }
    return darkMode ? 'text-slate-300' : 'text-slate-700';
  };

  const getDueLabel = () => {
    if (isCompleted) return 'Done';
    if (daysUntilDue === null) return null;
    if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue`;
    if (daysUntilDue === 0) return 'Due today';
    if (daysUntilDue === 1) return 'Tomorrow';
    if (daysUntilDue <= 7) return `${daysUntilDue}d left`;
    return null;
  };

  const dateParts = task.due_date ? getDateParts(task.due_date) : null;
  const dueLabel = getDueLabel();

  return (
    <div className={`
      group relative rounded-xl transition-all cursor-pointer overflow-hidden
      ${darkMode
        ? 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:shadow-lg hover:shadow-black/20'
        : 'bg-white border border-slate-200/80 hover:border-slate-300/80 shadow-sm hover:shadow-lg'}
      ${isCompleted ? 'opacity-60' : ''}
      ${isOverdue ? darkMode ? 'border-red-500/40' : 'border-red-300/60' : ''}
    `}>

      <div className="relative flex">
        {/* Date Callout */}
        <div
          className={`
            flex-shrink-0 w-20 flex flex-col items-center justify-center border-r py-4
            ${getDateCalloutStyle()}
          `}
          onClick={() => onClick(task)}
        >
          {dateParts ? (
            <>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'} ${isOverdue ? (darkMode ? 'text-red-400/70' : 'text-red-500/70') : ''}`}>
                {dateParts.month}
              </span>
              <span className={`text-2xl font-bold leading-none mt-0.5 ${getDateTextColor()}`}>
                {dateParts.day}
              </span>
              <span className={`text-[10px] font-medium mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'} ${isOverdue ? (darkMode ? 'text-red-400/70' : 'text-red-500/70') : ''}`}>
                {dateParts.weekday}
              </span>
              {dueLabel && (
                <span className={`
                  text-[9px] font-bold mt-1.5 px-1.5 py-0.5 rounded-full uppercase tracking-wide
                  ${isOverdue
                    ? darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'
                    : daysUntilDue !== null && daysUntilDue <= 3
                      ? darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600'
                      : darkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'}
                `}>
                  {dueLabel}
                </span>
              )}
            </>
          ) : (
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>
              No date
            </span>
          )}
        </div>

        {/* Task Content */}
        <div className="flex-1 min-w-0 p-4">
          <div
            className="cursor-pointer"
            onClick={() => onClick(task)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {isOverdue && !isCompleted && (
                    <AlertTriangle size={14} className={darkMode ? 'text-red-400' : 'text-red-500'} />
                  )}
                  <h3 className={`
                    font-bold text-base leading-tight tracking-tight
                    ${isCompleted
                      ? darkMode ? 'text-slate-500 line-through' : 'text-slate-400 line-through'
                      : darkMode ? 'text-white' : 'text-slate-900'}
                  `}>
                    {task.title}
                  </h3>
                </div>

                {task.description && (
                  <p className={`
                    text-sm mb-3 line-clamp-1
                    ${darkMode ? 'text-slate-400' : 'text-slate-500'}
                  `}>
                    {task.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {organizationName && (
                    <div className={`
                      flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium
                      ${darkMode ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-400/20' : 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/50'}
                    `}>
                      <Building2 size={12} />
                      <span>{organizationName}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    {task.assignee ? (
                      <>
                        <Avatar
                          firstName={task.assignee.first_name}
                          lastName={task.assignee.last_name}
                          imageUrl={task.assignee.avatar_url}
                          size="xs"
                        />
                        {(() => {
                          const assigneeUserId = (task as any).assignee?.user_id;
                          const filteredFollowers = assigneeUserId ? followerProfiles.filter(f => f.id !== assigneeUserId) : followerProfiles;
                          if (filteredFollowers.length === 0) return null;
                          return (
                            <div className="flex -space-x-1.5">
                              {filteredFollowers.slice(0, 3).map((follower) => (
                                <Avatar
                                  key={follower.id}
                                  firstName={follower.first_name}
                                  lastName={follower.last_name}
                                  imageUrl={follower.avatar_url}
                                  size="xs"
                                />
                              ))}
                              {filteredFollowers.length > 3 && (
                                <div className={`
                                  w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium
                                  ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'}
                                `}>
                                  +{filteredFollowers.length - 3}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <User size={12} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                    )}
                  </div>

                  {(task.attachment_count ?? 0) > 0 && (
                    <div className={`
                      flex items-center gap-1 px-2 py-1 rounded-lg font-medium
                      ${darkMode ? 'bg-slate-700/50 text-slate-400 ring-1 ring-slate-600/50' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/50'}
                    `}>
                      <Paperclip size={12} />
                      <span className="font-semibold">{task.attachment_count}</span>
                    </div>
                  )}

                  <div className={`
                    flex items-center gap-1 px-2 py-1 rounded-lg font-medium
                    ${task.priority === 'urgent'
                      ? darkMode ? 'bg-red-500/15 text-red-400 ring-1 ring-red-400/20' : 'bg-red-50 text-red-600 ring-1 ring-red-200/50'
                      : task.priority === 'high'
                      ? darkMode ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-400/20' : 'bg-orange-50 text-orange-600 ring-1 ring-orange-200/50'
                      : task.priority === 'medium'
                      ? darkMode ? 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-400/20' : 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200/50'
                      : darkMode ? 'bg-green-500/15 text-green-400 ring-1 ring-green-400/20' : 'bg-green-50 text-green-600 ring-1 ring-green-200/50'}
                  `}>
                    <div className={`w-1.5 h-1.5 rounded-full ${priorityColors[task.priority]}`} />
                    <span>{priorityLabels[task.priority]}</span>
                  </div>

                  {(task.comment_count ?? 0) > 0 && (
                    <div className={`
                      flex items-center gap-1 px-2 py-1 rounded-lg font-medium
                      ${darkMode ? 'bg-green-500/15 text-green-400 ring-1 ring-green-400/20' : 'bg-green-50 text-green-600 ring-1 ring-green-200/50'}
                    `}>
                      <MessageCircle size={12} />
                      <span className="font-semibold">{task.comment_count}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {!isCompleted && (
                  <button
                    onClick={() => onToggleComplete(task.id, true)}
                    className={`
                      px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                      ${darkMode
                        ? 'bg-green-500/15 hover:bg-green-500/25 text-green-400 ring-1 ring-green-400/20'
                        : 'bg-green-50 hover:bg-green-100 text-green-700 ring-1 ring-green-200/50'}
                    `}
                    title="Mark complete"
                  >
                    Done
                  </button>
                )}
                {isCompleted && (
                  <button
                    onClick={() => onToggleComplete(task.id, false)}
                    className={`
                      px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                      ${darkMode
                        ? 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 ring-1 ring-slate-600/50'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-500 ring-1 ring-slate-200/50'}
                    `}
                    title="Reopen task"
                  >
                    Reopen
                  </button>
                )}
                {task.due_date && (
                  <button
                    onClick={handleExportToCalendar}
                    className={`
                      p-2 rounded-lg transition-all duration-200
                      ${darkMode
                        ? 'hover:bg-slate-700/50 text-slate-400 hover:text-slate-300'
                        : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}
                    `}
                    title="Add to calendar"
                  >
                    <CalendarPlus size={15} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  className={`
                    p-2 rounded-lg transition-all duration-200
                    ${darkMode
                      ? 'hover:bg-slate-700/50 text-slate-400 hover:text-cyan-300'
                      : 'hover:bg-slate-100 text-slate-400 hover:text-cyan-600'}
                  `}
                  title="Edit task"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className={`
                    p-2 rounded-lg transition-all duration-200
                    ${darkMode
                      ? 'hover:bg-red-500/15 text-slate-400 hover:text-red-400'
                      : 'hover:bg-red-50 text-slate-400 hover:text-red-600'}
                  `}
                  title="Delete task"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { SquarePen as Edit2, Trash2, CalendarPlus, User, Flag, Users, Paperclip, MessageCircle, Building2, TriangleAlert as AlertTriangle, Check } from 'lucide-react';
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
          .from('members')
          .select('id, first_name, last_name, avatar_url, user_id')
          .in('user_id', task.followers);

        const mapped = (data || []).map(m => ({
          id: m.user_id,
          first_name: m.first_name,
          last_name: m.last_name,
          avatar_url: m.avatar_url,
        }));

        setFollowerProfiles(mapped);
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
    return `${daysUntilDue}d left`;
  };

  const dateParts = task.due_date ? getDateParts(task.due_date) : null;
  const dueLabel = getDueLabel();

  const dbTone = isCompleted ? 'done' : daysUntilDue !== null && daysUntilDue < 0 ? 'late' : daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0 ? 'soon' : 'up';
  const priorityTone: Record<string, string> = { urgent: '#FF6B6B', high: '#FF8A2B', medium: '#FFB340', low: '#30D158' };

  return (
    <div
      className={`a-tk group ${isCompleted ? 'a-tk-done' : ''}`}
      onClick={() => onClick(task)}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={isCompleted}
        aria-label={isCompleted ? 'Reopen task' : 'Mark complete'}
        title={isCompleted ? 'Reopen task' : 'Mark complete'}
        className={`a-done-c ${isCompleted ? 'a-done-on' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id, !isCompleted); }}
      >
        {isCompleted && <Check size={13} strokeWidth={3} />}
      </button>

      {/* Date Callout */}
      <div className={`a-db a-db-${dbTone}`}>
        {dateParts ? (
          <>
            <div className="a-db-m">{dateParts.month}</div>
            <div className="a-db-d a-num">{dateParts.day}</div>
            <div className="a-db-w">{dateParts.weekday}</div>
          </>
        ) : (
          <div className="a-db-w" style={{ padding: '12px 0' }}>No date</div>
        )}
      </div>

      {/* Task Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-0.5">
        <div className={`a-tk-title ${isCompleted ? 'a-tk-strike' : ''}`}>
          {task.title}
        </div>
        {task.description && (
          <div className="a-mute text-[13.5px] truncate">
            {task.description}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-1">
          {organizationName && (
            <span className="a-org"><Building2 size={12} />{organizationName}</span>
          )}
          {task.assignee ? (
            <span className="flex items-center gap-1.5">
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
                  <span className="flex -space-x-1.5">
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
                      <span className="a-cnt">+{filteredFollowers.length - 3}</span>
                    )}
                  </span>
                );
              })()}
            </span>
          ) : (
            <span className="a-meta" title="Unassigned"><User size={13} /><span className="a-dim">Unassigned</span></span>
          )}
          <span className="a-meta" style={{ color: priorityTone[task.priority] }}>
            <Flag size={13} />{priorityLabels[task.priority]}
          </span>
          {(task.attachment_count ?? 0) > 0 && (
            <span className="a-meta"><Paperclip size={13} />{task.attachment_count}</span>
          )}
          {(task.comment_count ?? 0) > 0 && (
            <span className="a-meta"><MessageCircle size={13} />{task.comment_count}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {dueLabel && !isCompleted && (
          <span className={`a-due a-due-${dbTone}`}>
            <span className={`a-light ${dbTone === 'late' ? 'a-light-r' : dbTone === 'soon' ? 'a-light-a' : 'a-light-g'}`} />
            {dueLabel}
          </span>
        )}
        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {task.due_date && (
            <button onClick={handleExportToCalendar} className="a-ib" title="Add to calendar" aria-label="Add to calendar">
              <CalendarPlus size={16} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            className="a-ib"
            title="Edit task"
            aria-label="Edit task"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="a-ib a-ib-d"
            title="Delete task"
            aria-label="Delete task"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

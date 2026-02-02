import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Calendar,
  User,
  Clock,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  Tag,
  Link as LinkIcon,
  MessageSquare,
} from 'lucide-react';
import { EnhancedTask } from '../../types/eventCommandCenter';
import { format } from 'date-fns';

interface KanbanTaskCardProps {
  task: EnhancedTask;
  onTaskClick: (task: EnhancedTask) => void;
  darkMode: boolean;
}

export const KanbanTaskCard: React.FC<KanbanTaskCardProps> = ({ task, onTaskClick, darkMode }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityColor = () => {
    switch (task.priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityIcon = () => {
    if (task.priority === 'urgent' || task.priority === 'high') {
      return <AlertCircle className="w-3 h-3" />;
    }
    return null;
  };

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onTaskClick(task)}
      className={`
        ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
        border rounded-lg p-3 mb-2 cursor-pointer
        hover:shadow-md transition-shadow duration-200
        ${isDragging ? 'shadow-xl' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1">
            {task.is_milestone && (
              <span className="text-purple-500 text-xs font-semibold">MILESTONE</span>
            )}
            {task.priority && (
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor()}`}>
                {getPriorityIcon()}
                {task.priority.toUpperCase()}
              </div>
            )}
          </div>
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'} line-clamp-2`}>
            {task.title}
          </h4>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={`${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-2 line-clamp-2`}>
          {task.description}
        </p>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Tag className="w-3 h-3" />
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        {/* Due Date */}
        {task.due_date && (
          <div className={`flex items-center gap-1 text-xs ${
            isOverdue
              ? 'text-red-500 font-medium'
              : darkMode
              ? 'text-gray-400'
              : 'text-gray-600'
          }`}>
            <Calendar className="w-3 h-3" />
            {format(new Date(task.due_date), 'MMM d')}
          </div>
        )}

        {/* Right side info */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Effort tracking */}
          {task.estimated_hours && (
            <div className={`flex items-center gap-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <Clock className="w-3 h-3" />
              {task.estimated_hours}h
            </div>
          )}

          {/* Dependencies indicator */}
          {task.dependencies && task.dependencies.length > 0 && (
            <div className={`flex items-center gap-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <LinkIcon className="w-3 h-3" />
              {task.dependencies.length}
            </div>
          )}

          {/* Comments indicator */}
          {task.comments && task.comments.length > 0 && (
            <div className={`flex items-center gap-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <MessageSquare className="w-3 h-3" />
              {task.comments.length}
            </div>
          )}

          {/* Assignee */}
          {task.assignee ? (
            <div className="relative">
              {task.assignee.avatar_url ? (
                <img
                  src={task.assignee.avatar_url}
                  alt={`${task.assignee.first_name} ${task.assignee.last_name}`}
                  className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800"
                  title={`${task.assignee.first_name} ${task.assignee.last_name}`}
                />
              ) : (
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border-2 border-white dark:border-gray-800 ${
                    darkMode ? 'bg-gray-600 text-white' : 'bg-gray-300 text-gray-700'
                  }`}
                  title={`${task.assignee.first_name} ${task.assignee.last_name}`}
                >
                  {task.assignee.first_name?.[0]}{task.assignee.last_name?.[0]}
                </div>
              )}
            </div>
          ) : (
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center ${
                darkMode ? 'bg-gray-700' : 'bg-gray-200'
              }`}
              title="Unassigned"
            >
              <User className="w-3 h-3 text-gray-500" />
            </div>
          )}
        </div>
      </div>

      {/* Blocked indicator */}
      {task.blocked_reason && (
        <div className="mt-2 px-2 py-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Blocked: {task.blocked_reason}
        </div>
      )}

      {/* Completed indicator */}
      {task.status === 'completed' && (
        <div className="mt-2 px-2 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Completed
        </div>
      )}
    </div>
  );
};

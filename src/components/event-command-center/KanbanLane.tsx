import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, MoreVertical, AlertTriangle } from 'lucide-react';
import { EventTaskLane, EnhancedTask } from '../../types/eventCommandCenter';
import { KanbanTaskCard } from './KanbanTaskCard';

interface KanbanLaneProps {
  lane: EventTaskLane;
  tasks: EnhancedTask[];
  onTaskClick: (task: EnhancedTask) => void;
  onAddTask: (laneId: string) => void;
  onLaneSettings: (lane: EventTaskLane) => void;
  darkMode: boolean;
}

export const KanbanLane: React.FC<KanbanLaneProps> = ({
  lane,
  tasks,
  onTaskClick,
  onAddTask,
  onLaneSettings,
  darkMode,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: lane.id,
  });

  const wipLimitReached = lane.wip_limit && tasks.length >= lane.wip_limit;

  const getLaneColor = () => {
    return lane.color || '#6366f1';
  };

  const getProgressPercentage = () => {
    if (!lane.wip_limit) return 0;
    return Math.min((tasks.length / lane.wip_limit) * 100, 100);
  };

  return (
    <div
      className={`
        flex flex-col min-w-[320px] max-w-[320px] h-full
        ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}
        rounded-lg
        ${isOver ? 'ring-2 ring-blue-500' : ''}
      `}
    >
      {/* Lane Header */}
      <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getLaneColor() }}
            />
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {lane.name}
            </h3>
            <span
              className={`
                px-2 py-0.5 rounded-full text-xs font-medium
                ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700'}
              `}
            >
              {tasks.length}
            </span>
          </div>

          <button
            onClick={() => onLaneSettings(lane)}
            className={`
              p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors
              ${darkMode ? 'text-gray-400' : 'text-gray-600'}
            `}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {lane.description && (
          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
            {lane.description}
          </p>
        )}

        {/* WIP Limit Progress */}
        {lane.wip_limit && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                WIP Limit
              </span>
              <span
                className={`font-medium ${
                  wipLimitReached
                    ? 'text-red-500'
                    : darkMode
                    ? 'text-gray-300'
                    : 'text-gray-700'
                }`}
              >
                {tasks.length} / {lane.wip_limit}
              </span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <div
                className={`h-full transition-all duration-300 ${
                  wipLimitReached ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
            {wipLimitReached && (
              <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                <AlertTriangle className="w-3 h-3" />
                WIP limit reached
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tasks Area */}
      <div
        ref={setNodeRef}
        className="flex-1 p-4 overflow-y-auto min-h-[200px]"
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <div
              className={`
                flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg
                ${darkMode ? 'border-gray-700 text-gray-500' : 'border-gray-300 text-gray-400'}
              `}
            >
              <p className="text-sm">No tasks</p>
            </div>
          ) : (
            tasks.map((task) => (
              <KanbanTaskCard
                key={task.id}
                task={task}
                onTaskClick={onTaskClick}
                darkMode={darkMode}
              />
            ))
          )}
        </SortableContext>
      </div>

      {/* Add Task Button */}
      <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={() => onAddTask(lane.id)}
          disabled={wipLimitReached}
          className={`
            w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-colors duration-200
            ${
              wipLimitReached
                ? 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed'
                : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            }
          `}
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>
    </div>
  );
};

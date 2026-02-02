import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Plus, Settings, Filter, Search } from 'lucide-react';
import { EventTaskBoard, EventTaskLane, EnhancedTask } from '../../types/eventCommandCenter';
import { KanbanLane } from './KanbanLane';
import { KanbanTaskCard } from './KanbanTaskCard';
import { AddColumnModal } from './AddColumnModal';
import { EventCommandCenterStorage } from '../../utils/eventCommandCenterStorage';
import { useNotifications } from '../../contexts/NotificationContext';

interface KanbanBoardProps {
  board: EventTaskBoard;
  eventId: string;
  onTaskClick: (task: EnhancedTask) => void;
  onAddTask: (laneId: string) => void;
  onBoardSettings: () => void;
  darkMode: boolean;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  board,
  eventId,
  onTaskClick,
  onAddTask,
  onBoardSettings,
  darkMode,
}) => {
  const [lanes, setLanes] = useState<EventTaskLane[]>([]);
  const [tasks, setTasks] = useState<EnhancedTask[]>([]);
  const [activeTask, setActiveTask] = useState<EnhancedTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterAssignee, setFilterAssignee] = useState<string[]>([]);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const { addNotification } = useNotifications();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    loadBoardData();
    setupRealtime();
  }, [board.id]);

  useEffect(() => {
    if (lanes.length === 0 && !loading) {
      setShowAddColumnModal(true);
    }
  }, [lanes, loading]);

  const loadBoardData = async () => {
    try {
      setLoading(true);
      const [lanesData, tasksData] = await Promise.all([
        EventCommandCenterStorage.getLanesByBoard(board.id),
        EventCommandCenterStorage.getTasksByBoard(board.id),
      ]);

      setLanes(lanesData);
      setTasks(tasksData);
    } catch (error) {
      console.error('Error loading board data:', error);
      addNotification('Failed to load board data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const setupRealtime = () => {
    const unsubscribe = EventCommandCenterStorage.subscribeToBoard(board.id, {
      onTaskCreated: (newTask) => {
        setTasks((prev) => [...prev, newTask]);
      },
      onTaskUpdated: (updatedTask) => {
        setTasks((prev) =>
          prev.map((task) => (task.id === updatedTask.id ? updatedTask : task))
        );
      },
      onTaskDeleted: (taskId) => {
        setTasks((prev) => prev.filter((task) => task.id !== taskId));
      },
    });

    return unsubscribe;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overId = over.id as string;
    const overTask = tasks.find((t) => t.id === overId);
    const overLane = lanes.find((l) => l.id === overId);

    if (overTask) {
      const overLaneId = overTask.lane_id;
      const activeLaneId = activeTask.lane_id;

      if (overLaneId !== activeLaneId) {
        setTasks((prevTasks) => {
          const activeIndex = prevTasks.findIndex((t) => t.id === active.id);
          const overIndex = prevTasks.findIndex((t) => t.id === overId);

          const newTasks = [...prevTasks];
          newTasks[activeIndex] = {
            ...newTasks[activeIndex],
            lane_id: overLaneId,
          };

          return arrayMove(newTasks, activeIndex, overIndex);
        });
      } else {
        setTasks((prevTasks) => {
          const activeIndex = prevTasks.findIndex((t) => t.id === active.id);
          const overIndex = prevTasks.findIndex((t) => t.id === overId);
          return arrayMove(prevTasks, activeIndex, overIndex);
        });
      }
    } else if (overLane) {
      setTasks((prevTasks) => {
        const activeIndex = prevTasks.findIndex((t) => t.id === active.id);
        const newTasks = [...prevTasks];
        newTasks[activeIndex] = {
          ...newTasks[activeIndex],
          lane_id: overLane.id,
        };
        return newTasks;
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveTask(null);

    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overId = over.id as string;
    const overTask = tasks.find((t) => t.id === overId);
    const overLane = lanes.find((l) => l.id === overId);

    let targetLaneId = activeTask.lane_id;

    if (overTask) {
      targetLaneId = overTask.lane_id;
    } else if (overLane) {
      targetLaneId = overLane.id;
    }

    if (!targetLaneId) return;

    const tasksInTargetLane = tasks.filter((t) => t.lane_id === targetLaneId);
    const newPosition = overTask
      ? tasksInTargetLane.findIndex((t) => t.id === overTask.id)
      : tasksInTargetLane.length;

    try {
      await EventCommandCenterStorage.moveTask({
        taskId: activeTask.id,
        sourceLaneId: activeTask.lane_id || '',
        targetLaneId: targetLaneId,
        sourcePosition: activeTask.position,
        targetPosition: newPosition,
      });

      await loadBoardData();
    } catch (error) {
      console.error('Error moving task:', error);
      addNotification('Failed to move task', 'error');
      await loadBoardData();
    }
  };

  const handleLaneSettings = (lane: EventTaskLane) => {
    console.log('Lane settings:', lane);
  };

  const handleAddColumn = async (name: string, color: string) => {
    try {
      const newLane = await EventCommandCenterStorage.createLane({
        board_id: board.id,
        name: name,
        color: color,
        position: lanes.length,
      });

      setLanes([...lanes, newLane]);
      addNotification('Column added successfully', 'success');
    } catch (error) {
      console.error('Error creating column:', error);
      addNotification('Failed to add column', 'error');
    }
  };

  const getFilteredTasks = () => {
    return tasks.filter((task) => {
      if (searchTerm && !task.title.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      if (filterPriority.length > 0 && !filterPriority.includes(task.priority)) {
        return false;
      }

      if (filterAssignee.length > 0 && task.assignee_id && !filterAssignee.includes(task.assignee_id)) {
        return false;
      }

      return true;
    });
  };

  const getTasksForLane = (laneId: string) => {
    return getFilteredTasks().filter((task) => task.lane_id === laneId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board Header */}
      <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {board.name}
            </h2>
            {board.description && (
              <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {board.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`
                  pl-10 pr-4 py-2 rounded-lg text-sm border
                  ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                `}
              />
            </div>

            {/* Filter Button */}
            <button
              className={`
                px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2
                ${darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}
              `}
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>

            {/* Settings Button */}
            <button
              onClick={onBoardSettings}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2
                ${darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}
              `}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>

            {/* Add Column Button */}
            <button
              onClick={() => setShowAddColumnModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Column
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Lanes */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full">
            {lanes.map((lane) => (
              <KanbanLane
                key={lane.id}
                lane={lane}
                tasks={getTasksForLane(lane.id)}
                onTaskClick={onTaskClick}
                onAddTask={onAddTask}
                onLaneSettings={handleLaneSettings}
                darkMode={darkMode}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="rotate-3">
                <KanbanTaskCard task={activeTask} onTaskClick={() => {}} darkMode={darkMode} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <AddColumnModal
        isOpen={showAddColumnModal}
        onClose={() => setShowAddColumnModal(false)}
        onSubmit={handleAddColumn}
        darkMode={darkMode}
      />
    </div>
  );
};

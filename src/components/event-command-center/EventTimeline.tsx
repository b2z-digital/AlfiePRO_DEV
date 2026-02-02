import React, { useState, useEffect } from 'react';
import { Calendar, ArrowRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { EnhancedTask, TaskDependency } from '../../types/eventCommandCenter';
import { EventCommandCenterStorage } from '../../utils/eventCommandCenterStorage';
import { useNotifications } from '../../contexts/NotificationContext';
import { format, differenceInDays, addDays, startOfWeek, endOfWeek } from 'date-fns';

interface EventTimelineProps {
  boardId: string;
  eventDate?: Date;
  darkMode: boolean;
  onTaskClick: (task: EnhancedTask) => void;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  boardId,
  eventDate,
  darkMode,
  onTaskClick,
}) => {
  const [tasks, setTasks] = useState<EnhancedTask[]>([]);
  const [dependencies, setDependencies] = useState<Map<string, TaskDependency[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [timelineStart, setTimelineStart] = useState<Date>(new Date());
  const [timelineEnd, setTimelineEnd] = useState<Date>(addDays(new Date(), 90));
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadTimelineData();
  }, [boardId]);

  const loadTimelineData = async () => {
    try {
      setLoading(true);
      const tasksData = await EventCommandCenterStorage.getTasksByBoard(boardId);

      const tasksWithDates = tasksData.filter((task) => task.due_date);

      if (tasksWithDates.length > 0) {
        const dates = tasksWithDates.map((task) => new Date(task.due_date!));
        const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const latestDate = new Date(Math.max(...dates.map((d) => d.getTime())));

        setTimelineStart(addDays(earliestDate, -7));
        setTimelineEnd(addDays(latestDate, 14));
      }

      const depsMap = new Map<string, TaskDependency[]>();
      for (const task of tasksWithDates) {
        const taskDeps = await EventCommandCenterStorage.getTaskDependencies(task.id);
        if (taskDeps.length > 0) {
          depsMap.set(task.id, taskDeps);
        }
      }

      setTasks(tasksWithDates);
      setDependencies(depsMap);
    } catch (error) {
      console.error('Error loading timeline data:', error);
      addNotification('Failed to load timeline', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getTotalDays = () => {
    return differenceInDays(timelineEnd, timelineStart);
  };

  const getTaskPosition = (task: EnhancedTask) => {
    if (!task.due_date) return { left: 0, width: 0 };

    const taskDate = new Date(task.due_date);
    const daysSinceStart = differenceInDays(taskDate, timelineStart);
    const totalDays = getTotalDays();

    const left = (daysSinceStart / totalDays) * 100;
    const width = Math.max((5 / totalDays) * 100, 2);

    return { left: `${left}%`, width: `${width}%` };
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-gray-400';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const generateTimelineMarkers = () => {
    const markers: Date[] = [];
    const totalDays = getTotalDays();
    const interval = viewMode === 'week' ? 7 : 30;

    for (let i = 0; i <= totalDays; i += interval) {
      markers.push(addDays(timelineStart, i));
    }

    return markers;
  };

  const isCriticalPath = (taskId: string): boolean => {
    const taskDeps = dependencies.get(taskId);
    return taskDeps !== undefined && taskDeps.length > 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Timeline View
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Visualize task dependencies and critical path
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('week')}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium
                ${
                  viewMode === 'week'
                    ? 'bg-blue-600 text-white'
                    : darkMode
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }
              `}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium
                ${
                  viewMode === 'month'
                    ? 'bg-blue-600 text-white'
                    : darkMode
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }
              `}
            >
              Month
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Urgent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Low</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <ArrowRight className="w-4 h-4 text-purple-500" />
            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Dependencies</span>
          </div>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-auto p-6">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Calendar className={`w-12 h-12 mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
            <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              No tasks with due dates
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline Header */}
            <div className={`sticky top-0 z-10 mb-4 pb-2 border-b ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="relative h-12">
                {generateTimelineMarkers().map((date, index) => (
                  <div
                    key={index}
                    className="absolute"
                    style={{ left: `${(index / generateTimelineMarkers().length) * 100}%` }}
                  >
                    <div className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {format(date, 'MMM d')}
                    </div>
                    <div className={`w-px h-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />
                  </div>
                ))}

                {/* Event Date Marker */}
                {eventDate && (
                  <div
                    className="absolute"
                    style={{
                      left: `${(differenceInDays(eventDate, timelineStart) / getTotalDays()) * 100}%`,
                    }}
                  >
                    <div className="flex flex-col items-center">
                      <div className="text-xs font-bold text-blue-500">EVENT</div>
                      <div className="w-1 h-4 bg-blue-500 rounded-full" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tasks */}
            <div className="space-y-3">
              {tasks.map((task) => {
                const position = getTaskPosition(task);
                const hasDependencies = isCriticalPath(task.id);
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

                return (
                  <div
                    key={task.id}
                    className={`
                      relative h-12 rounded-lg border
                      ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
                      hover:shadow-md transition-shadow cursor-pointer
                      ${hasDependencies ? 'ring-2 ring-purple-500/30' : ''}
                    `}
                    onClick={() => onTaskClick(task)}
                  >
                    {/* Task Bar */}
                    <div className="flex items-center h-full px-4">
                      <div className="flex-shrink-0 w-48">
                        <div className="flex items-center gap-2">
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : isOverdue ? (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <Clock className="w-4 h-4 text-gray-400" />
                          )}
                          <span className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {task.title}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 relative h-8">
                        <div
                          className={`absolute h-full rounded-full ${getPriorityColor(task.priority)} opacity-90`}
                          style={position}
                        />
                        {task.is_milestone && (
                          <div
                            className="absolute -translate-y-1/2 top-1/2"
                            style={{ left: position.left }}
                          >
                            <div className="w-3 h-3 rotate-45 bg-purple-500 border-2 border-white dark:border-gray-800" />
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0 w-32 text-right">
                        <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {task.due_date && format(new Date(task.due_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>

                    {/* Dependencies Arrow */}
                    {hasDependencies && (
                      <div className="absolute -bottom-1 left-4">
                        <ArrowRight className="w-3 h-3 text-purple-500" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Today Marker */}
            <div
              className="absolute top-0 bottom-0 border-l-2 border-blue-500 z-20 pointer-events-none"
              style={{
                left: `${(differenceInDays(new Date(), timelineStart) / getTotalDays()) * 100}%`,
              }}
            >
              <div className="absolute -left-8 top-0 text-xs font-medium text-blue-500 bg-white dark:bg-gray-900 px-2 py-1 rounded">
                Today
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

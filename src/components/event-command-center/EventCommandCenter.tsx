import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  GanttChart,
  List,
  Activity,
  BarChart3,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
} from 'lucide-react';
import { EventTaskBoard, EnhancedTask } from '../../types/eventCommandCenter';
import { EventCommandCenterStorage } from '../../utils/eventCommandCenterStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { TableBoard } from './TableBoard';
import { EventTimeline } from './EventTimeline';
import { EventTeamChat } from './EventTeamChat';
import { EventActivityFeed } from './EventActivityFeed';
import { EventTemplateModal } from './EventTemplateModal';
import { TaskForm } from '../tasks/TaskForm';
import { TaskDetails } from '../tasks/TaskDetails';

interface EventCommandCenterProps {
  eventId: string;
  eventName: string;
  eventDate?: Date;
  darkMode: boolean;
}

export const EventCommandCenter: React.FC<EventCommandCenterProps> = ({
  eventId,
  eventName,
  eventDate,
  darkMode,
}) => {
  const [activeView, setActiveView] = useState<'board' | 'timeline' | 'activity' | 'chat'>('board');
  const [boards, setBoards] = useState<EventTaskBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<EventTaskBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const [selectedTask, setSelectedTask] = useState<EnhancedTask | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const { currentOrganization, currentClub } = useAuth();
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadBoards();
  }, [eventId]);

  const loadBoards = async () => {
    try {
      setLoading(true);
      const boardsData = await EventCommandCenterStorage.getBoardsByEvent(eventId);

      if (boardsData.length > 0) {
        setBoards(boardsData);
        setActiveBoard(boardsData[0]);
      } else {
        setShowTemplateModal(true);
      }
    } catch (error) {
      console.error('Error loading boards:', error);
      addNotification('Failed to load event boards', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBoard = async () => {
    try {
      const newBoard = await EventCommandCenterStorage.createBoard({
        event_id: eventId,
        club_id: currentClub?.clubId,
        state_association_id: currentOrganization?.type === 'state' ? currentOrganization.id : undefined,
        national_association_id: currentOrganization?.type === 'national' ? currentOrganization.id : undefined,
        name: `${eventName} - Task Board`,
        description: 'Manage all tasks and activities for this event',
        board_type: 'event',
      });

      setBoards([...boards, newBoard]);
      setActiveBoard(newBoard);
      addNotification('Board created successfully', 'success');
    } catch (error) {
      console.error('Error creating board:', error);
      addNotification('Failed to create board', 'error');
    }
  };

  const handleTaskClick = (task: EnhancedTask) => {
    setSelectedTask(task);
    setShowTaskDetails(true);
  };

  const handleAddTask = (laneId: string) => {
    setSelectedLaneId(laneId);
    setShowTaskForm(true);
  };

  const handleTemplateApplied = () => {
    loadBoards();
  };

  const handleTaskFormClose = () => {
    setShowTaskForm(false);
    setSelectedLaneId(null);
  };

  const handleTaskDetailsClose = () => {
    setShowTaskDetails(false);
    setSelectedTask(null);
  };

  const views = [
    { id: 'board', name: 'Board', icon: LayoutGrid },
    { id: 'timeline', name: 'Timeline', icon: GanttChart },
    { id: 'activity', name: 'Activity', icon: Activity },
    { id: 'chat', name: 'Team Chat', icon: MessageSquare },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {eventName}
              </h1>
              <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Event Task Manager
              </p>
            </div>

            <div className="flex items-center gap-3">
              {boards.length === 0 && (
                <button
                  onClick={() => setShowTemplateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                >
                  <Sparkles className="w-4 h-4" />
                  Use Template
                </button>
              )}

              {boards.length === 0 && (
                <button
                  onClick={handleCreateBoard}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Create Board
                </button>
              )}

              <button
                className={`
                  p-2 rounded-lg
                  ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}
                `}
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* View Switcher */}
        {boards.length > 0 && (
          <div className="px-6">
            <div className="flex items-center gap-1">
              {views.map((view) => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    onClick={() => setActiveView(view.id as any)}
                    className={`
                      flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                      ${
                        activeView === view.id
                          ? darkMode
                            ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                            : 'bg-gray-50 text-gray-900 border-b-2 border-blue-500'
                          : darkMode
                          ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    {view.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <LayoutGrid className={`w-16 h-16 mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
            <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              No Task Board Yet
            </h3>
            <p className={`text-sm mb-6 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              Get started by creating a board or using a template
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
              >
                <Sparkles className="w-5 h-5" />
                Browse Templates
              </button>
              <button
                onClick={handleCreateBoard}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                <Plus className="w-5 h-5" />
                Create From Scratch
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeView === 'board' && activeBoard && (
              <TableBoard
                board={activeBoard}
                event_id={eventId}
                darkMode={darkMode}
              />
            )}

            {activeView === 'timeline' && activeBoard && (
              <EventTimeline
                boardId={activeBoard.id}
                eventDate={eventDate}
                darkMode={darkMode}
                onTaskClick={handleTaskClick}
              />
            )}

            {activeView === 'activity' && (
              <EventActivityFeed eventId={eventId} darkMode={darkMode} />
            )}

            {activeView === 'chat' && (
              <EventTeamChat eventId={eventId} darkMode={darkMode} />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showTemplateModal && eventDate && (
        <EventTemplateModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          eventId={eventId}
          eventDate={eventDate}
          onTemplateApplied={handleTemplateApplied}
          darkMode={darkMode}
        />
      )}

      {showTaskForm && activeBoard && (
        <TaskForm
          isOpen={showTaskForm}
          onClose={handleTaskFormClose}
          onSubmit={async (taskData) => {
            try {
              await EventCommandCenterStorage.createTask({
                ...taskData,
                event_id: eventId,
                board_id: activeBoard.id,
                lane_id: selectedLaneId || undefined,
                club_id: currentClub?.clubId,
                state_association_id: currentOrganization?.type === 'state' ? currentOrganization.id : undefined,
                national_association_id: currentOrganization?.type === 'national' ? currentOrganization.id : undefined,
              });
              addNotification('Task created successfully', 'success');
              handleTaskFormClose();
            } catch (error) {
              console.error('Error creating task:', error);
              addNotification('Failed to create task', 'error');
            }
          }}
          darkMode={darkMode}
        />
      )}

      {showTaskDetails && selectedTask && (
        <TaskDetails
          task={selectedTask}
          onClose={handleTaskDetailsClose}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};

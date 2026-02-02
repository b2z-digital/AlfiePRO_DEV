import React, { useState, useEffect } from 'react';
import { Trophy, Calendar, Plus, Edit2, Trash2, MapPin, X, FileText, CalendarRange } from 'lucide-react';
import { RaceType } from '../types';
import { RaceEvent } from '../types/race';
import { storeRaceEvent, setCurrentEvent, getStoredRaceEvents, deleteRaceEvent, archiveRaceEvent } from '../utils/raceStorage';
import { formatDate } from '../utils/date';
import { CreateRaceModal } from './pages/CreateRaceModal';
import { SuperAdminEventModal } from './SuperAdminEventModal';
import { ConfirmationModal } from './ConfirmationModal';
import { useAuth } from '../contexts/AuthContext';
import { getPublicEvents } from '../utils/publicEventStorage';
import { PublicEvent } from '../types/race';

interface SingleEventManagementProps {
  darkMode: boolean;
  onEventSelect: (event: RaceEvent) => void;
  onStartScoring: () => void;
  onClose: () => void;
  editingEvent?: RaceEvent | null;
}

export const SingleEventManagement: React.FC<SingleEventManagementProps> = ({
  darkMode,
  onEventSelect,
  onStartScoring,
  onClose,
  editingEvent
}) => {
  const { currentClub } = useAuth();
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [showAddRace, setShowAddRace] = useState(false);
  const [currentEditingEvent, setCurrentEditingEvent] = useState<RaceEvent | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<RaceEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
    
    // If an editing event is passed in, show the form immediately
    if (editingEvent) {
      setCurrentEditingEvent(editingEvent);
      setShowAddRace(true);
    }
  }, [editingEvent]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const allEvents = await getStoredRaceEvents();
      // Filter out series events to only show standalone events
      const standaloneEvents = allEvents.filter(event => !event.isSeriesEvent);
      setEvents(standaloneEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (event: RaceEvent) => {
    setEventToDelete(event);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (eventToDelete) {
      try {
        await deleteRaceEvent(eventToDelete.id);
        await fetchEvents();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
    setShowDeleteConfirm(false);
    setEventToDelete(null);
  };

  const handleConfirmArchive = async () => {
    if (eventToDelete) {
      try {
        await archiveRaceEvent(eventToDelete.id);
        await fetchEvents();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
    setShowDeleteConfirm(false);
    setEventToDelete(null);
  };

  const handleEdit = (event: RaceEvent) => {
    setCurrentEditingEvent(event);
    setShowAddRace(true);
  };

  const handleAddNewRace = () => {
    setCurrentEditingEvent(null);
    setShowAddRace(true);
  };

  const handleCloseForm = async () => {
    const wasEditing = currentEditingEvent !== null;
    setShowAddRace(false);
    setCurrentEditingEvent(null);
    await fetchEvents(); // Refresh the list when closing the form

    // If we were editing an event (not creating new), close the entire modal
    if (editingEvent || wasEditing) {
      onClose();
    }
  };

  const handleRaceSetup = async (type: RaceType) => {
    await fetchEvents(); // Refresh immediately after saving
    handleCloseForm();
  };

  // Check if an event is in the past
  const isPastEvent = (date: string) => {
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
  };

  return (
    <>
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Trophy className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
            <div>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                Single Events
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {events.length} {events.length === 1 ? 'event' : 'events'} created
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAddNewRace}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              <Plus size={18} />
              Add Event
            </button>

            <button
              onClick={onClose}
              className={`
                rounded-full p-2 transition-colors
                ${darkMode 
                  ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              `}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className={`
              text-center py-12 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                : 'bg-slate-50 border-slate-200 text-slate-600'}
            `}>
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className={`
              text-center py-12 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                : 'bg-slate-50 border-slate-200 text-slate-600'}
            `}>
              <Trophy size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">No Single Events</p>
              <p className="text-sm">Create your first single event to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
              {events.map(event => (
                <div
                  key={event.id}
                  className={`
                    rounded-lg border group relative overflow-hidden cursor-pointer
                    ${darkMode 
                      ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                      : 'bg-white border-slate-200 hover:bg-slate-50'}
                  `}
                  onClick={() => onEventSelect(event)}
                >
                  <div className="p-6">
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(event);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            darkMode 
                              ? 'hover:bg-slate-600 text-slate-300' 
                              : 'hover:bg-slate-200 text-slate-600'
                          }`}
                          title="Edit event"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(event);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            darkMode 
                              ? 'hover:bg-red-900/50 text-red-400' 
                              : 'hover:bg-red-100 text-red-600'
                          }`}
                          title="Delete event"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      {event.eventName || event.clubName}
                    </h3>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <div className={`
                        px-2 py-0.5 rounded-full text-xs font-medium
                        ${event.raceFormat === 'handicap'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}
                      `}>
                        {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                      </div>
                      <div className={`
                        px-2 py-0.5 rounded-full text-xs font-medium
                        bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200
                      `}>
                        {event.raceClass}
                      </div>
                      {event.multiDay && (
                        <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          {event.numberOfDays} Days
                        </div>
                      )}
                      {event.cancelled && (
                        <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          Cancelled
                        </div>
                      )}
                      {event.completed && (
                        <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Completed
                        </div>
                      )}
                    </div>

                    <div className={`space-y-2 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} />
                        <span>
                          {formatDate(event.date)}
                          {event.multiDay && event.endDate && (
                            <> - {formatDate(event.endDate)}</>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={14} />
                        <span>{event.venue}</span>
                      </div>
                      {event.clubName && event.eventName && event.eventName !== event.clubName && (
                        <div className="flex items-center gap-2">
                          <FileText size={14} />
                          <span>{event.clubName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddRace && currentEditingEvent?.isPublicEvent ? (
        <SuperAdminEventModal
          isOpen={showAddRace}
          onClose={handleCloseForm}
          darkMode={darkMode}
          editingEvent={currentEditingEvent as any}
          onSuccess={() => handleCloseForm()}
        />
      ) : showAddRace && (
        <CreateRaceModal
          type="quick"
          darkMode={darkMode}
          onClose={handleCloseForm}
          onSuccess={() => {
            handleCloseForm();
            fetchEvents();
          }}
          editingEvent={currentEditingEvent || undefined}
        />
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Event"
        message="Are you sure you want to permanently delete this event? This action cannot be undone."
        confirmText="Delete Permanently"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
        onAlternative={handleConfirmArchive}
        alternativeText="Archive Event"
        alternativeVariant="warning"
      />
    </>
  );
};
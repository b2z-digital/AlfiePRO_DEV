import React, { useState, useEffect } from 'react';
import { Trophy, Calendar, CalendarRange, Flag, X } from 'lucide-react';
import { RaceType } from '../types';
import { RaceEvent } from '../types/race';
import { OneOffRace } from './OneOffRace';
import { RaceSeries } from './RaceSeries';
import { RaceCalendar } from './RaceCalendar';
import { EventDetails } from './EventDetails';
import { getStoredRaceEvents, setCurrentEvent, getStoredRaceSeries } from '../utils/raceStorage';
import { Header } from './Header';
import { Footer } from './Footer';
import { SingleEventManagement } from './SingleEventManagement';

interface RaceManagementProps {
  darkMode: boolean;
  onRaceTypeSelect: (type: RaceType) => void;
  onEventSelect: (event: RaceEvent) => void;
  onBack: () => void;
  initialShowModal?: 'oneoff' | 'series' | 'calendar' | null;
}

export const RaceManagement: React.FC<RaceManagementProps> = ({
  darkMode,
  onRaceTypeSelect,
  onEventSelect,
  onBack,
  initialShowModal = null
}) => {
  const [selectedRaceType, setSelectedRaceType] = useState<RaceType>('handicap');
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [showModal, setShowModal] = useState<'oneoff' | 'series' | 'calendar' | null>(initialShowModal);
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<RaceEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    if (showModal === 'calendar') {
      fetchAllEvents();
    }
  }, [showModal]);

  // Set initial modal if provided
  useEffect(() => {
    if (initialShowModal) {
      setShowModal(initialShowModal);
    }
  }, [initialShowModal]);

  // Set default view to list
  useEffect(() => {
    setView('list');
  }, []);

  const fetchAllEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both quick races and series events
      const [quickRaces, seriesEvents] = await Promise.all([
        getStoredRaceEvents(),
        getStoredRaceSeries()
      ]);
      
      // Convert series events into race events
      const seriesRaceEvents: RaceEvent[] = seriesEvents.flatMap(series => 
        series.rounds.map((round, index) => ({
          id: `${series.id}-${index}`,
          eventName: `${round.name} - ${series.seriesName}`,
          clubName: series.clubName,
          date: round.date,
          venue: round.venue,
          raceClass: series.raceClass,
          raceFormat: series.raceFormat,
          isSeriesEvent: true,
          seriesId: series.id,
          roundName: round.name,
          completed: round.completed || false,
          cancelled: round.cancelled || false,
          cancellationReason: round.cancellationReason,
          clubId: series.clubId
        }))
      );
      
      // Combine all events
      setEvents([...quickRaces, ...seriesRaceEvents]);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load calendar data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleRaceSetup = (type: RaceType) => {
    setSelectedRaceType(type);
    onRaceTypeSelect(type);
  };

  const handleEventSelect = (event: RaceEvent) => {
    setSelectedEvent(event);
  };

  const handleEditEvent = (event: RaceEvent) => {
    setEditingEvent(event);
    if (event.isSeriesEvent) {
      setShowModal('series');
    } else {
      setShowModal('oneoff');
    }
  };

  const handleStartScoring = (eventFromDetails?: RaceEvent) => {
    // If event is provided from EventDetails, it has already been saved to localStorage
    // by EventDetails.handleStartScoring, so we don't need to call setCurrentEvent again
    // (calling it would overwrite with stale data)
    const eventToUse = eventFromDetails || selectedEvent;

    if (eventToUse) {
      // Only save to localStorage if we're NOT receiving the event from EventDetails
      // (EventDetails has already saved it with the latest data)
      if (!eventFromDetails) {
        setCurrentEvent(eventToUse);
      }

      // Set the race type
      handleRaceSetup(eventToUse.raceFormat);

      // Only trigger event selection if NOT from EventDetails (to avoid overwriting with stale data)
      if (!eventFromDetails) {
        onEventSelect(eventToUse);
      }

      // Clear the selected event from local state
      setSelectedEvent(null);
    }
  };

  const dashboardActions = [
    {
      icon: <Trophy size={32} />,
      title: 'Single Event',
      description: 'Set up a single race event',
      onClick: () => setShowModal('oneoff')
    },
    {
      icon: <CalendarRange size={32} />,
      title: 'Race Series',
      description: 'Set up a multi-round series',
      onClick: () => setShowModal('series')
    },
    {
      icon: <Calendar size={32} />,
      title: 'Race Calendar',
      description: 'View upcoming races',
      onClick: () => setShowModal('calendar')
    }
  ];

  if (selectedEvent) {
    return (
      <div className="min-h-screen relative">
        <div className="container mx-auto px-4 py-12">
          <button
            onClick={() => setSelectedEvent(null)}
            className={`mb-8 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              darkMode 
                ? 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700' 
                : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <X size={16} className="inline mr-1" />
            Back to Race Calendar
          </button>
          <EventDetails
            event={selectedEvent}
            darkMode={darkMode}
            onStartScoring={handleStartScoring}
            onClose={() => setSelectedEvent(null)}
            onEdit={() => handleEditEvent(selectedEvent)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col justify-center max-w-4xl mx-auto">
        <div className={`
          relative flex flex-col items-center p-6 mb-8 rounded-xl text-center
          ${darkMode ? 'glass-bg' : 'light-glass-bg'}
        `}>
          <div className="flex items-center gap-3">
            <Flag className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
            <h2 className={`text-2xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Race Management
            </h2>
          </div>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Select an option to begin
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dashboardActions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className="animated-tile p-8 rounded-xl"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="icon-container">
                  {action.icon}
                </div>
                <div>
                  <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                    {action.title}
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {action.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {showModal === 'oneoff' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <SingleEventManagement
            darkMode={darkMode}
            onEventSelect={handleEventSelect}
            onStartScoring={handleStartScoring}
            onClose={() => {
              setShowModal(null);
              setEditingEvent(null);
            }}
            editingEvent={editingEvent}
          />
        </div>
      )}

      {showModal === 'series' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <RaceSeries
            darkMode={darkMode}
            onRaceSetup={handleRaceSetup}
            onClose={() => {
              setShowModal(null);
              setEditingEvent(null);
            }}
            editingSeries={editingEvent?.isSeriesEvent && editingEvent.seriesId ? editingEvent.seriesId : undefined}
          />
        </div>
      )}

      {showModal === 'calendar' && (
        <RaceCalendar
          events={events}
          darkMode={darkMode}
          onEventSelect={handleEventSelect}
          onStartScoring={handleStartScoring}
          onClose={() => setShowModal(null)}
        />
      )}
    </div>
  );
};
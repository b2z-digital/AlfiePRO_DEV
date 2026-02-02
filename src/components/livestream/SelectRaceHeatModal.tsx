import React, { useState, useEffect } from 'react';
import { X, Calendar, Flag } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import type { QuickRace } from '../../types/race';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamSession } from '../../types/livestream';

interface SelectRaceHeatModalProps {
  sessionId: string;
  currentEventId?: string;
  currentHeatNumber?: number;
  clubId: string;
  onClose: () => void;
  onSelect: (eventId: string, heatNumber?: number) => void;
}

export function SelectRaceHeatModal({
  sessionId,
  currentEventId,
  currentHeatNumber,
  clubId,
  onClose,
  onSelect
}: SelectRaceHeatModalProps) {
  const [events, setEvents] = useState<QuickRace[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(currentEventId || '');
  const [selectedHeatNumber, setSelectedHeatNumber] = useState<number | undefined>(currentHeatNumber);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, [clubId]);

  const loadEvents = async () => {
    try {
      setLoading(true);

      console.log('[SelectRaceModal] Loading events for club:', clubId);

      // Fetch quick_races that belong to this club
      const { data: quickRacesData, error: quickRacesError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_venue, race_class, archived, completed, heat_management')
        .eq('club_id', clubId)
        .eq('archived', false)
        .order('race_date', { ascending: false });

      if (quickRacesError) {
        console.error('[SelectRaceModal] Error fetching events:', quickRacesError);
        throw quickRacesError;
      }

      console.log('[SelectRaceModal] Found quick races:', quickRacesData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filter to recent/upcoming events (last 7 days or future events)
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const upcomingEvents = (quickRacesData || [])
        .filter(event => {
          const eventDate = new Date(event.race_date);
          // Show events from the last 7 days or future events
          return eventDate >= sevenDaysAgo;
        })
        .map(event => ({
          id: event.id,
          name: event.event_name,
          date: event.race_date,
          venue: event.race_venue || '',
          status: event.completed ? 'completed' : 'upcoming',
          scoring_method: event.heat_management ? 'heat_management_system' : 'standard',
          club_id: clubId
        }));

      console.log('[SelectRaceModal] Filtered events:', upcomingEvents);
      setEvents(upcomingEvents as QuickRace[]);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedEventId) {
      alert('Please select a race/event');
      return;
    }

    try {
      const updates: Partial<LivestreamSession> = {
        event_id: selectedEventId,
        heat_number: selectedHeatNumber
      };

      console.log('[SelectRaceModal] Linking event to session:', { sessionId, selectedEventId, selectedHeatNumber });

      await livestreamStorage.updateSession(sessionId, updates);

      console.log('[SelectRaceModal] Successfully linked event to session');

      onSelect(selectedEventId, selectedHeatNumber);
      onClose();
    } catch (error) {
      console.error('[SelectRaceModal] Error updating session:', error);
      alert('Failed to link race/heat to stream');
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const hasHeats = selectedEvent && selectedEvent.scoring_method === 'heat_management_system';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Select Race/Heat</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-400">No upcoming races available</p>
            </div>
          ) : (
            <>
              {/* Event Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Select Event
                </label>
                <div className="space-y-2">
                  {events.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => {
                        setSelectedEventId(event.id);
                        setSelectedHeatNumber(undefined);
                      }}
                      className={`w-full p-4 rounded-lg border transition-all text-left ${
                        selectedEventId === event.id
                          ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500/20'
                          : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-white mb-1">{event.name}</h4>
                          <div className="flex items-center gap-4 text-sm text-gray-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(event.date).toLocaleDateString()}
                            </span>
                            {event.venue && (
                              <span className="flex items-center gap-1">
                                <Flag className="w-4 h-4" />
                                {event.venue}
                              </span>
                            )}
                          </div>
                          {event.scoring_method === 'heat_management_system' && (
                            <span className="inline-block mt-2 px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded">
                              Heat Event
                            </span>
                          )}
                        </div>
                        {event.status === 'in_progress' && (
                          <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded font-medium">
                            In Progress
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Heat/Race Selection (if applicable) */}
              {selectedEvent && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      {hasHeats ? 'Select Heat (Optional)' : 'Select Race Number (Optional)'}
                    </label>

                    {/* Manual Input */}
                    <div className="mb-4">
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={selectedHeatNumber || ''}
                        onChange={(e) => setSelectedHeatNumber(e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder={hasHeats ? 'Enter heat number...' : 'Enter race number...'}
                        className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                    </div>

                    {/* Quick Select Buttons */}
                    <div className="grid grid-cols-5 gap-2">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                        <button
                          key={num}
                          onClick={() => setSelectedHeatNumber(num)}
                          className={`p-2 rounded-lg border transition-all text-sm ${
                            selectedHeatNumber === num
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-slate-700/50 border-slate-600 hover:border-slate-500 text-gray-300'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Current Selection Summary */}
              {selectedEventId && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-300 mb-2">Selected</h4>
                  <p className="text-white">
                    {selectedEvent?.name}
                    {selectedHeatNumber && (hasHeats ? ` - Heat ${selectedHeatNumber}` : ` - Race ${selectedHeatNumber}`)}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedEventId}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Link to Stream
          </button>
        </div>
      </div>
    </div>
  );
}

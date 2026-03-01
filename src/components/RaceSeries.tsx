import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Edit2, Trash2, MapPin, Calendar, Trophy, AlertTriangle, Upload } from 'lucide-react';
import { ImportRoundResultsModal } from './ImportRoundResultsModal';
import { RaceType, BoatType } from '../types';
import { RaceSeries as RaceSeriesType, RaceEvent } from '../types/race';
import { storeRaceSeries, getStoredRaceSeries, deleteRaceSeries, setCurrentEvent } from '../utils/raceStorage';
import { getStoredClubs } from '../utils/clubStorage';
import { getStoredVenues } from '../utils/venueStorage';
import { Club } from '../types/club';
import { Venue } from '../types/venue';
import { formatDate } from '../utils/date';
import { ConfirmationModal } from './ConfirmationModal';
import { SeriesLeaderboard } from './SeriesLeaderboard';
import { EventDetails } from './EventDetails';
import { useAuth } from '../contexts/AuthContext';

interface RaceSeriesProps {
  darkMode: boolean;
  onRaceSetup: (type: RaceType) => void;
  onClose: () => void;
  editingSeries?: string;
}

export const RaceSeries: React.FC<RaceSeriesProps> = ({
  darkMode,
  onRaceSetup,
  onClose,
  editingSeries
}) => {
  const { currentClub } = useAuth();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingSeriesData, setEditingSeriesData] = useState<RaceSeriesType | null>(null);
  const [series, setSeries] = useState<RaceSeriesType[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [seriesToDelete, setSeriesToDelete] = useState<RaceSeriesType | null>(null);
  const [showRoundDeleteConfirm, setShowRoundDeleteConfirm] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState<number | null>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<RaceSeriesType | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);
  const [importTarget, setImportTarget] = useState<{ series: RaceSeriesType; roundIndex: number } | null>(null);
  const [formData, setFormData] = useState({
    clubId: '',
    seriesName: '',
    raceClass: '' as BoatType,
    raceFormat: 'handicap' as RaceType,
    rounds: [] as {
      name: string;
      date: string;
      venue: string;
      cancelled?: boolean;
      cancellationReason?: string;
    }[]
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [storedSeries, storedClubs, storedVenues] = await Promise.all([
          getStoredRaceSeries(),
          getStoredClubs(),
          getStoredVenues()
        ]);
        
        console.log('Fetched series data:', storedSeries);
        setSeries(storedSeries);
        setClubs(storedClubs);
        setVenues(storedVenues);
        
        // If editing a series, find and set it
        if (editingSeries) {
          const seriesData = storedSeries.find(s => s.id === editingSeries);
          if (seriesData) {
            setEditingSeriesData(seriesData);
            
            // Find the club
            const club = storedClubs.find(c => 
              c.abbreviation === seriesData.clubName || c.name === seriesData.clubName
            );
            
            setFormData({
              clubId: club?.id || '',
              seriesName: seriesData.seriesName,
              raceClass: seriesData.raceClass,
              raceFormat: seriesData.raceFormat,
              rounds: seriesData.rounds
            });
            
            setView('form');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [editingSeries]);

  const hasPublishedResults = (series: RaceSeriesType) => {
    return series.rounds.some(round => round.results && round.results.length > 0);
  };

  const handleAddRound = () => {
    setFormData(prev => ({
      ...prev,
      rounds: [...prev.rounds, { name: '', date: '', venue: '' }]
    }));
  };

  const handleRemoveRound = (index: number) => {
    setRoundToDelete(index);
    setShowRoundDeleteConfirm(true);
  };

  const handleConfirmRoundDelete = () => {
    if (roundToDelete !== null) {
      setFormData(prev => ({
        ...prev,
        rounds: prev.rounds.filter((_, i) => i !== roundToDelete)
      }));
      setRoundToDelete(null);
    }
    setShowRoundDeleteConfirm(false);
  };

  const handleRoundChange = (index: number, field: keyof typeof formData.rounds[0], value: string | boolean) => {
    setFormData(prev => {
      const newRounds = [...prev.rounds];
      if (field === 'cancelled') {
        newRounds[index] = { 
          ...newRounds[index], 
          [field]: value,
          cancellationReason: value ? newRounds[index].cancellationReason || '' : undefined
        };
      } else {
        newRounds[index] = { ...newRounds[index], [field]: value };
      }
      return { ...prev, rounds: newRounds };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      if (!formData.raceFormat) {
        throw new Error('Race format must be selected');
      }

      const selectedClub = clubs.find(c => c.id === formData.clubId);
      if (!selectedClub) return;

      const newSeries: RaceSeriesType = {
        id: editingSeriesData?.id || crypto.randomUUID(),
        clubName: selectedClub.abbreviation || selectedClub.name,
        seriesName: formData.seriesName,
       raceClass: formData.raceClass,
       rounds: formData.rounds,
        raceFormat: formData.raceFormat,
        skippers: editingSeriesData?.skippers || [],
        results: editingSeriesData?.results || [],
        completed: editingSeriesData?.completed || false,
        lastCompletedRace: editingSeriesData?.lastCompletedRace || 0,
        isManualHandicaps: editingSeriesData?.isManualHandicaps || false,
        media: editingSeriesData?.media || [],
        noticeOfRaceUrl: editingSeriesData?.noticeOfRaceUrl || null,
        sailingInstructionsUrl: editingSeriesData?.sailingInstructionsUrl || null,
        clubId: currentClub?.clubId || null
      };

      console.log('Saving series:', newSeries);
      await storeRaceSeries(newSeries);
      const updatedSeries = await getStoredRaceSeries();
      setSeries(updatedSeries);
      setView('list');
      setEditingSeriesData(null);
      setFormData({
        clubId: '',
        seriesName: '',
        raceClass: '' as BoatType,
        raceFormat: 'handicap',
        rounds: []
      });
    } catch (err) {
      console.error('Error saving series:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleEdit = (series: RaceSeriesType) => {
    const club = clubs.find(c => c.abbreviation === series.clubName || c.name === series.clubName);
    
    setEditingSeriesData(series);
    setFormData({
      clubId: club?.id || '',
      seriesName: series.seriesName,
      raceClass: series.raceClass,
      raceFormat: series.raceFormat,
      rounds: series.rounds.map(round => ({
        name: round.name,
        date: round.date,
        venue: round.venue,
        cancelled: round.cancelled,
        cancellationReason: round.cancellationReason
      }))
    });
    setView('form');
  };

  const handleDeleteClick = (series: RaceSeriesType) => {
    setSeriesToDelete(series);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (seriesToDelete) {
      try {
        await deleteRaceSeries(seriesToDelete.id);
        const updatedSeries = await getStoredRaceSeries();
        setSeries(updatedSeries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
    setShowDeleteConfirm(false);
    setSeriesToDelete(null);
  };

  const handleRoundClick = (seriesItem: RaceSeriesType, roundIndex: number) => {
    const round = seriesItem.rounds[roundIndex];
    if (round.cancelled) return; // Don't open cancelled rounds

    console.log('🎯 [RaceSeries handleRoundClick] Round clicked:', {
      seriesId: seriesItem.id,
      roundIndex,
      roundName: round.name,
      'round.skippers': round.skippers?.length || 0,
      'seriesItem.skippers': seriesItem.skippers?.length || 0
    });

    // Prefer round-level skippers over series-level skippers
    // This ensures we get the correct skippers that were saved during scoring setup
    const roundSkippers = round.skippers || seriesItem.skippers || [];
    console.log('🎯 [RaceSeries] Using', roundSkippers.length, 'skippers for event');
    console.log('🎯 [RaceSeries] Full roundSkippers:', roundSkippers);

    const event: RaceEvent = {
      id: `${seriesItem.id}-${roundIndex}`,
      eventName: `${round.name} - ${seriesItem.seriesName}`,
      clubName: seriesItem.clubName,
      date: round.date,
      venue: round.venue,
      raceClass: seriesItem.raceClass,
      raceFormat: seriesItem.raceFormat,
      isSeriesEvent: true,
      seriesId: seriesItem.id,
      roundName: round.name,
      skippers: roundSkippers,
      raceResults: round.results || [],
      lastCompletedRace: round.lastCompletedRace || 0,
      hasDeterminedInitialHcaps: round.hasDeterminedInitialHcaps || false,
      isManualHandicaps: round.isManualHandicaps || false,
      completed: round.completed || false,
      cancelled: round.cancelled || false,
      cancellationReason: round.cancellationReason,
      media: seriesItem.media || [],
      livestreamUrl: seriesItem.livestreamUrl,
      clubId: seriesItem.clubId,
      heatManagement: round.heatManagement || null,
      numRaces: round.numRaces,
      dropRules: round.dropRules || [],
      enableLiveTracking: seriesItem.enableLiveTracking,
      enableLiveStream: round.enableLiveStream || seriesItem.enableLiveStream
    };

    console.log('🎯 [RaceSeries] Created event from round:', {
      eventName: event.eventName,
      skippersCount: event.skippers?.length || 0,
      isSeriesEvent: event.isSeriesEvent,
      seriesId: event.seriesId,
      roundName: event.roundName,
      enableLiveStream: event.enableLiveStream,
      'round.enableLiveStream': round.enableLiveStream,
      'seriesItem.enableLiveStream': seriesItem.enableLiveStream
    });
    setSelectedEvent(event);
  };

  // Check if a date is in the past
  const isDatePast = (dateStr: string) => {
    const eventDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
  };

  // Check if a date is today
  const isDateToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  // Find the next upcoming round in a series
  const getNextUpcomingRound = (seriesItem: RaceSeriesType): number | null => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Filter for future rounds that aren't cancelled
    const futureRounds = seriesItem.rounds
      .map((round, index) => ({ ...round, index }))
      .filter(round => {
        const roundDate = new Date(round.date);
        return roundDate >= today && !round.cancelled && !round.completed;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return futureRounds.length > 0 ? futureRounds[0].index : null;
  };

  if (selectedEvent) {
    console.log('🚀🚀🚀 [RaceSeries] RENDERING EventDetails - CODE VERSION 2.0');
    return (
      <EventDetails
        key={`${selectedEvent.id}-${Date.now()}`}
        event={selectedEvent}
        darkMode={darkMode}
        onStartScoring={(eventFromDetails?: RaceEvent) => {
          console.log('🎯🎯🎯 [RaceSeries onStartScoring] VERSION 3.0 - NOT calling setCurrentEvent');
          console.log('🎯 [RaceSeries onStartScoring] Received event with', eventFromDetails?.skippers?.length || 0, 'skippers');

          // EventDetails already saved the correct event data to localStorage via setCurrentEvent
          // We do NOT call setCurrentEvent here - that would overwrite with stale data!
          // Just proceed with navigation

          onRaceSetup(eventFromDetails?.raceFormat || selectedEvent.raceFormat);
          onClose();
        }}
        onClose={async () => {
          console.log('🔄🔄🔄 [RaceSeries] EventDetails closed - refetching series data');
          setSelectedEvent(null);
          // Refetch series data to get updated skippers/results
          try {
            const updatedSeries = await getStoredRaceSeries();
            console.log('🔄 [RaceSeries] Refetched series data');
            setSeries(updatedSeries);
          } catch (err) {
            console.error('Error refetching series:', err);
          }
        }}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className={`
          w-full max-w-6xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
          ${darkMode ? 'bg-slate-800' : 'bg-white'}
        `}>
          <div className={`
            flex items-center justify-between p-6 border-b sticky top-0 z-10
            ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}
          `}>
            <div className="flex items-center gap-3">
              <Trophy className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
              <div>
                <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                  Race Series
                </h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {series.length} {series.length === 1 ? 'series' : 'series'} registered
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('form')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Add Series</span>
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
            {view === 'form' ? (
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Club Name *
                    </label>
                    <select
                      required
                      value={formData.clubId}
                      onChange={(e) => setFormData(prev => ({ ...prev, clubId: e.target.value }))}
                      className={`
                        w-full px-3 py-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                    >
                      <option value="">Select club</option>
                      {clubs.map(club => (
                        <option key={club.id} value={club.id}>
                          {club.name} ({club.abbreviation})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Series Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.seriesName}
                      onChange={(e) => setFormData(prev => ({ ...prev, seriesName: e.target.value }))}
                      disabled={editingSeriesData && hasPublishedResults(editingSeriesData)}
                      className={`
                        w-full px-3 py-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                        ${editingSeriesData && hasPublishedResults(editingSeriesData) ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                      placeholder="Enter series name"
                    />
                    {editingSeriesData && hasPublishedResults(editingSeriesData) && (
                      <p className="mt-2 text-xs text-amber-500">
                        Series name cannot be changed after results have been published
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Race Class *
                    </label>
                    <select
                      required
                      value={formData.raceClass}
                      onChange={(e) => setFormData(prev => ({ ...prev, raceClass: e.target.value as BoatType }))}
                      disabled={editingSeriesData && hasPublishedResults(editingSeriesData)}
                      className={`
                        w-full px-3 py-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                        ${editingSeriesData && hasPublishedResults(editingSeriesData) ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <option value="">Select race class</option>
                      <option value="DF65">Dragon Force 65</option>
                      <option value="DF95">Dragon Force 95</option>
                      <option value="10R">10 Rater</option>
                      <option value="IOM">IOM</option>
                      <option value="Marblehead">Marblehead</option>
                      <option value="A Class">A Class</option>
                      <option value="RC Laser">RC Laser</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Race Format *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, raceFormat: 'handicap' }))}
                        disabled={editingSeriesData && hasPublishedResults(editingSeriesData)}
                        className={`
                          p-3 rounded-lg text-sm font-medium transition-colors
                          ${formData.raceFormat === 'handicap'
                            ? 'bg-blue-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }
                          ${editingSeriesData && hasPublishedResults(editingSeriesData) ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        Handicap Racing
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, raceFormat: 'scratch' }))}
                        disabled={editingSeriesData && hasPublishedResults(editingSeriesData)}
                        className={`
                          p-3 rounded-lg text-sm font-medium transition-colors
                          ${formData.raceFormat === 'scratch'
                            ? 'bg-blue-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }
                          ${editingSeriesData && hasPublishedResults(editingSeriesData) ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        Scratch Racing
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      Rounds
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddRound}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      <Plus size={16} />
                      Add Round
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {formData.rounds.map((round, index) => (
                      <div 
                        key={index}
                        className={`
                          relative p-4 rounded-lg border
                          ${darkMode 
                            ? 'bg-slate-700/50 border-slate-600' 
                            : 'bg-white border-slate-200'}
                        `}
                      >
                        <button
                          type="button"
                          onClick={() => handleRemoveRound(index)}
                          className={`
                            absolute top-2 right-2 p-1.5 rounded-full transition-colors
                            ${darkMode 
                              ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-600' 
                              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                          `}
                        >
                          <X size={14} />
                        </button>

                        <div className="space-y-4">
                          <div>
                            <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Round Name
                            </label>
                            <input
                              type="text"
                              required
                              value={round.name}
                              onChange={(e) => handleRoundChange(index, 'name', e.target.value)}
                              className={`
                                w-full px-3 py-2 rounded-lg transition-colors
                                ${darkMode 
                                  ? 'bg-slate-800 text-slate-200' 
                                  : 'bg-white text-slate-900 border border-slate-200'}
                              `}
                              placeholder="e.g., Round 1"
                            />
                          </div>

                          <div>
                            <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Date
                            </label>
                            <input
                              type="date"
                              required
                              value={round.date}
                              onChange={(e) => handleRoundChange(index, 'date', e.target.value)}
                              className={`
                                w-full px-3 py-2 rounded-lg transition-colors
                                ${darkMode 
                                  ? 'bg-slate-800 text-slate-200' 
                                  : 'bg-white text-slate-900 border border-slate-200'}
                              `}
                            />
                          </div>

                          <div>
                            <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Venue
                            </label>
                            <select
                              required
                              value={round.venue}
                              onChange={(e) => handleRoundChange(index, 'venue', e.target.value)}
                              className={`
                                w-full px-3 py-2 rounded-lg transition-colors
                                ${darkMode 
                                  ? 'bg-slate-800 text-slate-200' 
                                  : 'bg-white text-slate-900 border border-slate-200'}
                              `}
                            >
                              <option value="">Select venue</option>
                              {venues.map(venue => (
                                <option key={venue.id} value={venue.name}>
                                  {venue.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className={`flex items-center gap-2 cursor-pointer ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              <input
                                type="checkbox"
                                checked={round.cancelled || false}
                                onChange={(e) => handleRoundChange(index, 'cancelled', e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs font-medium">Round Cancelled</span>
                            </label>
                            {round.cancelled && (
                              <input
                                type="text"
                                value={round.cancellationReason || ''}
                                onChange={(e) => handleRoundChange(index, 'cancellationReason', e.target.value)}
                                placeholder="Reason for cancellation"
                                className={`
                                  mt-2 w-full px-3 py-2 rounded-lg transition-colors text-xs
                                  ${darkMode 
                                    ? 'bg-slate-800 text-slate-200' 
                                    : 'bg-white text-slate-900 border border-slate-200'}
                                `}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-900/10 text-red-500 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setView('list');
                      setEditingSeriesData(null);
                      setFormData({
                        clubId: '',
                        seriesName: '',
                        raceClass: '' as BoatType,
                        raceFormat: 'handicap',
                        rounds: []
                      });
                    }}
                    className={`
                      px-4 py-2 rounded-lg font-medium transition-colors
                      ${darkMode
                        ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                    `}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formData.rounds.length === 0}
                    className={`
                      px-6 py-2 rounded-lg font-medium transition-colors
                      ${formData.rounds.length > 0
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-400 text-white cursor-not-allowed'}
                    `}
                  >
                    {editingSeriesData ? 'Update Series' : 'Create Series'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-6">
                {loading ? (
                  <div className={`
                    text-center py-12 rounded-lg border
                    ${darkMode 
                      ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                      : 'bg-slate-50 border-slate-200 text-slate-600'}
                  `}>
                    Loading series...
                  </div>
                ) : series.length === 0 ? (
                  <div className={`
                    text-center py-12 rounded-lg border
                    ${darkMode 
                      ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                      : 'bg-slate-50 border-slate-200 text-slate-600'}
                  `}>
                    <Trophy size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium mb-2">No Race Series</p>
                    <p className="text-sm">Create your first race series to get started.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {series.map(s => {
                      const colors = s.raceClass ? boatTypeColors[s.raceClass] || defaultColorScheme : defaultColorScheme;
                      
                      // Sort rounds by date
                      const sortedRounds = [...s.rounds].sort((a, b) => 
                        new Date(a.date).getTime() - new Date(b.date).getTime()
                      );
                      
                      // Find the next upcoming round
                      const nextRoundIndex = getNextUpcomingRound(s);
                      
                      return (
                        <div
                          key={s.id}
                          className={`
                            rounded-xl border overflow-hidden
                            ${darkMode 
                              ? 'bg-slate-700/50 border-slate-600' 
                              : 'bg-white border-slate-200'}
                          `}
                        >
                          <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                  {s.seriesName}
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                  <div className={`
                                    px-2 py-0.5 rounded-full text-xs font-medium
                                    ${s.raceFormat === 'handicap'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}
                                  `}>
                                    {s.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                                  </div>
                                  <div className={`
                                    px-2 py-0.5 rounded-full text-xs font-medium
                                    ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}
                                  `}>
                                    {s.raceClass}
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                {hasPublishedResults(s) && (
                                  <button
                                    onClick={() => setSelectedSeries(s)}
                                    className={`p-2 rounded-lg transition-colors ${
                                      darkMode 
                                        ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' 
                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                    }`}
                                    title="View standings"
                                  >
                                    <TrendingUp size={18} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleEdit(s)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    darkMode 
                                      ? 'hover:bg-slate-600 text-slate-300' 
                                      : 'hover:bg-slate-200 text-slate-600'
                                  }`}
                                  title="Edit series"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(s)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    darkMode 
                                      ? 'hover:bg-red-900/50 text-red-400' 
                                      : 'hover:bg-red-100 text-red-600'
                                  }`}
                                  title="Delete series"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>

                            <div className={`
                              flex items-center gap-2 text-sm mb-4
                              ${darkMode ? 'text-slate-400' : 'text-slate-600'}
                            `}>
                              <Calendar size={14} />
                              <span>
                                {sortedRounds.length > 0 
                                  ? `${formatDate(sortedRounds[0].date)} - ${formatDate(sortedRounds[sortedRounds.length - 1].date)}`
                                  : 'No rounds scheduled'}
                              </span>
                            </div>

                            <div className="space-y-2">
                              {sortedRounds.map((round, index) => {
                                const isPastDate = isDatePast(round.date);
                                const isToday = isDateToday(round.date);
                                const isNextRound = index === nextRoundIndex;
                                const originalIndex = s.rounds.findIndex(r => r.name === round.name);
                                
                                return (
                                  <button
                                    key={index}
                                    onClick={() => handleRoundClick(s, originalIndex)}
                                    disabled={round.cancelled}
                                    className={`
                                      w-full flex items-center justify-between p-3 rounded-lg text-sm text-left
                                      ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}
                                      ${round.cancelled 
                                        ? 'opacity-75 cursor-not-allowed' 
                                        : darkMode 
                                          ? 'hover:bg-slate-700 cursor-pointer' 
                                          : 'hover:bg-slate-100 cursor-pointer'}
                                      ${isNextRound ? 'ring-2 ring-green-500' : ''}
                                    `}
                                  >
                                    <div className="flex items-center gap-3">
                                      {round.cancelled ? (
                                        <div 
                                          className="flex items-center gap-1 text-amber-500" 
                                          title={round.cancellationReason || 'Round cancelled'}
                                        >
                                          <AlertTriangle size={14} />
                                          <span className="font-medium">Cancelled</span>
                                        </div>
                                      ) : (
                                        <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                          {round.name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                      <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                                        {formatDate(round.date)}
                                      </span>
                                      <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                                        {round.venue}
                                      </span>
                                      {isNextRound && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                          Next
                                        </span>
                                      )}
                                      {!round.cancelled && !round.completed && !(round.results && round.results.length > 0) && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setImportTarget({ series: s, roundIndex: originalIndex });
                                          }}
                                          className={`
                                            flex items-center gap-1 px-2 py-0.5 rounded-full font-medium transition-colors
                                            ${darkMode
                                              ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}
                                          `}
                                          title="Import results from spreadsheet"
                                        >
                                          <Upload size={12} />
                                          Import
                                        </button>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Series"
        message="Are you sure you want to delete this series? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      <ConfirmationModal
        isOpen={showRoundDeleteConfirm}
        onClose={() => {
          setShowRoundDeleteConfirm(false);
          setRoundToDelete(null);
        }}
        onConfirm={handleConfirmRoundDelete}
        title="Delete Round"
        message={`Are you sure you want to delete this round?${roundToDelete !== null && editingSeriesData?.rounds[roundToDelete]?.completed ? ' This round has scores recorded. All scores will be permanently lost.' : ' This action cannot be undone.'}`}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      {selectedSeries && (
        <SeriesLeaderboard
          series={selectedSeries}
          darkMode={darkMode}
          onClose={() => setSelectedSeries(null)}
        />
      )}

      {importTarget && (
        <ImportRoundResultsModal
          isOpen={true}
          onClose={() => setImportTarget(null)}
          darkMode={darkMode}
          series={importTarget.series}
          roundIndex={importTarget.roundIndex}
          onImportComplete={async () => {
            setImportTarget(null);
            try {
              const updatedSeries = await getStoredRaceSeries();
              setSeries(updatedSeries);
            } catch (err) {
              console.error('Error refetching series after import:', err);
            }
          }}
        />
      )}
    </>
  );
};

// Import at the end to avoid circular dependencies
import { boatTypeColors, defaultColorScheme } from '../constants/colors';
import { TrendingUp } from 'lucide-react';
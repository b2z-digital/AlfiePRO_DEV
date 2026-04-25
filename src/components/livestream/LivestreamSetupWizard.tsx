import React, { useState, useEffect } from 'react';
import { X, Check, Calendar, Video, ArrowLeft, ArrowRight, ChevronDown, Radio } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { livestreamStorage } from '../../utils/livestreamStorage';
import { supabase } from '../../utils/supabase';
import type { LivestreamSession } from '../../types/livestream';
import type { QuickRace } from '../../types/race';

interface LivestreamSetupWizardProps {
  clubId: string;
  preSelectedEventId?: string;
  preSelectedEventName?: string;
  preSelectedEventDate?: string;
  onComplete: (session: LivestreamSession) => void;
  onClose: () => void;
}

type Step = 'timing' | 'event' | 'details' | 'review';

interface WizardData {
  timing: 'now' | 'later';
  scheduledTime?: string;
  title: string;
  description: string;
  eventId?: string;
  eventDay?: number;
  heatNumber?: number;
  enableChat: boolean;
  enableLeaderboard: boolean;
}

export function LivestreamSetupWizard({
  clubId,
  preSelectedEventId,
  preSelectedEventName,
  preSelectedEventDate,
  onComplete,
  onClose
}: LivestreamSetupWizardProps) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [currentStep, setCurrentStep] = useState<Step>('timing');
  const [events, setEvents] = useState<QuickRace[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  // Initialize with pre-selected event data if provided
  const getInitialWizardData = (): WizardData => {
    const baseData: WizardData = {
      timing: preSelectedEventId ? 'later' : 'now',
      title: preSelectedEventName ? `${preSelectedEventName} - Live Coverage` : '',
      description: '',
      eventId: preSelectedEventId,
      enableChat: true,
      enableLeaderboard: true,
    };

    // Pre-populate scheduled time if event date is provided
    if (preSelectedEventDate) {
      const eventDate = new Date(preSelectedEventDate);
      eventDate.setHours(10, 30, 0, 0);

      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, '0');
      const day = String(eventDate.getDate()).padStart(2, '0');
      const hours = String(eventDate.getHours()).padStart(2, '0');
      const minutes = String(eventDate.getMinutes()).padStart(2, '0');
      baseData.scheduledTime = `${year}-${month}-${day}T${hours}:${minutes}`;

      // Pre-populate description
      const dateStr = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      baseData.description = `Live coverage of ${preSelectedEventName} on ${dateStr}. Watch all the racing action as it happens!`;
    }

    return baseData;
  };

  const [wizardData, setWizardData] = useState<WizardData>(getInitialWizardData());

  const steps: Step[] = ['timing', 'event', 'details', 'review'];
  const currentStepIndex = steps.indexOf(currentStep);

  useEffect(() => {
    loadEvents();
  }, [clubId]);

  const loadEvents = async () => {
    try {
      // Show events from 7 days ago to allow livestreaming recent events
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      console.log('🔍 Loading events for club:', clubId);
      console.log('📅 Date filter: Events from', sevenDaysAgo.toLocaleDateString(), 'onwards');

      // Fetch club's own quick races
      const quickRacesResult = await supabase
        .from('quick_races')
        .select('*')
        .eq('club_id', clubId)
        .eq('archived', false)
        .is('public_event_id', null)
        .order('created_at', { ascending: false });

      console.log('📋 Quick races result:', {
        error: quickRacesResult.error,
        count: quickRacesResult.data?.length || 0,
        sample: quickRacesResult.data?.slice(0, 3)
      });

      // Fetch club's series rounds
      const seriesRoundsResult = await supabase
        .from('race_series_rounds')
        .select('*, race_series(series_name)')
        .eq('club_id', clubId)
        .order('date', { ascending: false });

      console.log('📋 Series rounds result:', {
        error: seriesRoundsResult.error,
        count: seriesRoundsResult.data?.length || 0,
        sample: seriesRoundsResult.data?.slice(0, 3)
      });

      // Fetch public events (only club's own)
      const publicEventsResult = await supabase
        .from('public_events')
        .select('*')
        .eq('club_id', clubId)
        .order('date', { ascending: false });

      console.log('📋 Public events result:', {
        error: publicEventsResult.error,
        count: publicEventsResult.data?.length || 0,
        sample: publicEventsResult.data?.slice(0, 3)
      });

      // Filter quick races - include all non-archived races
      const streamableQuickRaces = (quickRacesResult.data || []).map(race => ({
        id: race.id,
        name: race.event_name || 'Unnamed Event',
        date: race.race_date || race.created_at,
        venue: race.race_venue || race.venue_id,
        status: race.completed ? 'completed' : 'upcoming',
        scoring_method: race.race_format || 'handicap',
        club_id: race.club_id,
        cancelled: false,
        multi_day: race.multi_day || false,
        number_of_days: race.number_of_days || 1
      }));

      // Filter series rounds - include recent and upcoming rounds
      const streamableSeriesRounds = (seriesRoundsResult.data || []).filter(round => {
        if (!round.date) return false;
        const eventDate = new Date(round.date);
        const isRecent = eventDate >= sevenDaysAgo;
        const notCancelled = !round.cancelled;
        const included = isRecent && notCancelled;

        if (!included && round.round_name) {
          console.log(`⏭️ Skipping series round "${round.round_name}":`, {
            date: round.date,
            isRecent,
            notCancelled,
            completed: round.completed
          });
        }

        return included;
      }).map(round => ({
        id: round.id,
        name: round.race_series ? `${round.race_series.series_name} - ${round.round_name}` : round.round_name,
        date: round.date,
        venue: round.venue,
        status: round.completed ? 'completed' : 'upcoming',
        scoring_method: round.heat_management ? 'heat_management_system' : 'standard',
        club_id: round.club_id,
        cancelled: round.cancelled,
        multi_day: round.multi_day || false,
        number_of_days: round.number_of_days || 1
      }));

      // Filter public events - include recent and upcoming events
      const streamablePublicEvents = (publicEventsResult.data || []).filter(event => {
        if (!event.date) return false;
        const eventDate = new Date(event.date);
        const isRecent = eventDate >= sevenDaysAgo;
        const notCancelled = !event.cancelled;
        return isRecent && notCancelled;
      }).map(event => ({
        id: event.id,
        name: event.name,
        date: event.date,
        venue: event.venue,
        status: event.status,
        scoring_method: 'standard',
        club_id: event.club_id,
        cancelled: event.cancelled
      }));

      const allEvents = [...streamableQuickRaces, ...streamableSeriesRounds, ...streamablePublicEvents].sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime(); // Most recent first
      });

      console.log(`✅ Loaded ${allEvents.length} streamable events:`, {
        quickRaces: streamableQuickRaces.length,
        seriesRounds: streamableSeriesRounds.length,
        publicEvents: streamablePublicEvents.length,
        eventList: allEvents.map(e => ({
          id: e.id,
          name: e.name,
          date: e.date,
          daysFromNow: Math.ceil((new Date(e.date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        }))
      });

      setEvents(allEvents as QuickRace[]);
    } catch (error) {
      console.error('❌ Error loading events:', error);
      addNotification('error', 'Failed to load events. Please try again.');
    }
  };

  const updateWizardData = (updates: Partial<WizardData>) => {
    setWizardData(prev => ({ ...prev, ...updates }));
  };

  // Handler for event selection
  const handleEventSelection = (eventId: string) => {
    const selectedEvent = events.find(e => e.id === eventId);

    if (!selectedEvent) {
      updateWizardData({ eventId: undefined, scheduledTime: undefined, eventDay: undefined });
      return;
    }

    // Parse the event date
    const eventDate = new Date(selectedEvent.date);

    // Set to 10:30 AM on the event date
    eventDate.setHours(10, 30, 0, 0);

    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    const year = eventDate.getFullYear();
    const month = String(eventDate.getMonth() + 1).padStart(2, '0');
    const day = String(eventDate.getDate()).padStart(2, '0');
    const hours = String(eventDate.getHours()).padStart(2, '0');
    const minutes = String(eventDate.getMinutes()).padStart(2, '0');
    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

    // Update wizard data
    const updates: Partial<WizardData> = {
      eventId,
      scheduledTime: formattedDateTime,
      eventDay: 1 // Default to Day 1
    };

    // Auto-populate title if empty
    if (!wizardData.title) {
      updates.title = `${selectedEvent.name} - Live Coverage`;
    }

    // Auto-populate description if empty
    if (!wizardData.description) {
      const dateStr = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      updates.description = `Live coverage of ${selectedEvent.name} on ${dateStr}. Watch all the racing action as it happens!`;
    }

    updateWizardData(updates);
  };

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      let nextStep = steps[currentStepIndex + 1];

      // Skip event selection step if event is pre-selected
      if (nextStep === 'event' && preSelectedEventId) {
        nextStep = steps[currentStepIndex + 2];
      }

      setCurrentStep(nextStep);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      let prevStep = steps[currentStepIndex - 1];

      // Skip event selection step if event is pre-selected
      if (prevStep === 'event' && preSelectedEventId) {
        prevStep = steps[currentStepIndex - 2];
      }

      setCurrentStep(prevStep);
    }
  };

  const handleComplete = async () => {
    if (!user) {
      addNotification('error', 'You must be logged in to create a livestream');
      return;
    }

    try {
      setLoading(true);
      setLoadingMessage('Initializing livestream setup...');

      console.log('[LivestreamWizard] Creating session with full event_id:', {
        eventId: wizardData.eventId,
        note: 'Using FULL event ID including round suffix for series events'
      });

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        throw new Error('No active session found');
      }

      const headers = {
        'Authorization': `Bearer ${authSession.access_token}`,
        'Content-Type': 'application/json',
      };

      const sessionData: Partial<LivestreamSession> = {
        club_id: clubId,
        created_by: user.id,
        title: wizardData.title,
        description: wizardData.description,
        event_id: wizardData.eventId,
        event_day: wizardData.eventDay,
        heat_number: wizardData.heatNumber,
        status: wizardData.timing === 'now' ? 'draft' : 'scheduled',
        scheduled_start_time: wizardData.timing === 'later' ? wizardData.scheduledTime : undefined,
        enable_chat: wizardData.enableChat,
        enable_overlays: wizardData.enableLeaderboard,
        is_public: true,
        streaming_mode: 'cloudflare_relay',
        overlay_config: {
          showHeatNumber: true,
          showSkippers: true,
          showStandings: wizardData.enableLeaderboard,
          showWeather: true,
          showHandicaps: false,
          position: 'bottom',
          theme: 'dark',
        },
      };

      // Create Cloudflare Stream live input via platform-level account
      setLoadingMessage('Creating Cloudflare Stream input...');
      console.log('[LivestreamWizard] Creating Cloudflare Stream live input via platform account...');

      const cfResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'createLiveInput',
          clubId,
          sessionData: {
            title: wizardData.title,
            recording: true
          }
        })
      });

      const cfData = await cfResponse.json();

      if (!cfResponse.ok || !cfData.liveInput) {
        throw new Error(cfData.error || 'Failed to create Cloudflare Stream input');
      }

      console.log('[LivestreamWizard] Cloudflare live input created:', cfData.liveInput.uid);
      sessionData.cloudflare_live_input_id = cfData.liveInput.uid;
      sessionData.cloudflare_whip_url = cfData.liveInput.webRTC?.url;
      sessionData.cloudflare_whip_playback_url = cfData.liveInput.webRTCPlayback?.url;

      const playbackUrl = cfData.liveInput.webRTCPlayback?.url || cfData.liveInput.rtmpsPlayback?.url || '';
      const customerMatch = playbackUrl.match(/customer-([a-z0-9]+)\./);
      if (customerMatch) {
        sessionData.cloudflare_customer_code = customerMatch[1];
      }

      setLoadingMessage('Finalizing setup...');
      const session = await livestreamStorage.createSession(sessionData);
      addNotification('success', 'Stream created successfully', 3000);
      onComplete(session);
    } catch (error) {
      console.error('Error creating livestream session:', error);
      addNotification('error', 'Failed to create livestream. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'timing': return 'Welcome to AlfiePRO Live Control Room';
      case 'event': return 'Select Event';
      case 'details': return 'Stream Details';
      case 'review': return 'Review & Go Live';
      default: return '';
    }
  };

  return (
    <>
      {/* Loading Modal Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60]">
          <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] rounded-2xl p-8 max-w-md w-full mx-4 border border-cyan-500/30 shadow-2xl">
            <div className="flex flex-col items-center">
              {/* Animated Spinner */}
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
              </div>

              {/* Loading Message */}
              <h3 className="text-xl font-semibold text-white mb-2">Setting Up Your Stream</h3>
              <p className="text-slate-400 text-center">{loadingMessage}</p>

              {/* Progress Dots */}
              <div className="flex space-x-2 mt-6">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-700/50">
        {/* Header */}
        <div className="from-cyan-600 via-cyan-700 to-blue-800 p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20">
                <Radio className="text-white drop-shadow-lg w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">{getStepTitle()}</h2>
                {currentStep === 'timing' && (
                  <p className="text-cyan-100 text-sm mt-0.5">When do you want to go live?</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="mt-5 flex justify-center space-x-2 relative z-10">
            {steps.map((step, index) => (
              <div
                key={step}
                className={`h-1 rounded-full transition-all duration-300 ${
                  index <= currentStepIndex ? 'bg-white w-20' : 'bg-white/20 w-16'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === 'timing' && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  updateWizardData({ timing: 'now' });
                  handleNext();
                }}
                className="w-full bg-slate-800/80 hover:bg-slate-700/80 p-6 rounded-xl flex items-center justify-between group transition-all duration-200 border border-slate-700/50 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5"
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-3 rounded-xl group-hover:scale-105 transition-transform shadow-lg">
                    <Video className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-white font-semibold text-lg">Go Live Now</h3>
                    <p className="text-slate-400 text-sm">Set up your stream and start broadcasting immediately</p>
                  </div>
                </div>
                <div className="bg-white text-slate-900 px-5 py-2 rounded-xl font-semibold text-sm shadow-md group-hover:shadow-lg transition-shadow">
                  Now
                </div>
              </button>

              <button
                onClick={() => {
                  updateWizardData({ timing: 'later' });
                  handleNext();
                }}
                className="w-full bg-slate-800/80 hover:bg-slate-700/80 p-6 rounded-xl flex items-center justify-between group transition-all duration-200 border border-slate-700/50 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5"
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-gradient-to-br from-slate-600 to-slate-700 p-3 rounded-xl group-hover:scale-105 transition-transform shadow-lg">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-white font-semibold text-lg">Schedule Stream</h3>
                    <p className="text-slate-400 text-sm">Set up a stream for a later time or future event</p>
                  </div>
                </div>
                <div className="bg-white text-slate-900 px-5 py-2 rounded-xl font-semibold text-sm shadow-md group-hover:shadow-lg transition-shadow">
                  Later
                </div>
              </button>
            </div>
          )}


          {currentStep === 'event' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-2">Select Event</h3>
                <p className="text-slate-400 text-sm mb-4">Choose which race or event this livestream will cover</p>

                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Link to Race/Event <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    value={wizardData.eventId || ''}
                    onChange={(e) => handleEventSelection(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-slate-800/30 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 appearance-none backdrop-blur-sm transition-colors"
                  >
                    <option value="">No event selected</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.name} - {new Date(event.date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                </div>
                {events.length === 0 && (
                  <p className="mt-2 text-sm text-yellow-400">
                    No upcoming events found. Create an event first to link it to your livestream.
                  </p>
                )}
                {wizardData.eventId && (
                  <p className="mt-2 text-sm text-green-400">
                    ✓ Date and time automatically set to event date at 10:30 AM
                  </p>
                )}
              </div>

              {/* Multi-day event selector - only show for multi-day events */}
              {(() => {
                const selectedEvent = events.find(ev => ev.id === wizardData.eventId);
                const isMultiDay = selectedEvent && (selectedEvent.multi_day || (selectedEvent.number_of_days && selectedEvent.number_of_days > 1));

                return isMultiDay && wizardData.eventId && wizardData.timing === 'later' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Event Day
                    </label>
                    <div className="relative">
                      <select
                        value={wizardData.eventDay || 1}
                        onChange={(e) => {
                          const dayNumber = parseInt(e.target.value);
                          if (selectedEvent && wizardData.scheduledTime) {
                            // Add days to the scheduled time
                            const baseDate = new Date(wizardData.scheduledTime);
                            const newDate = new Date(baseDate);
                            newDate.setDate(baseDate.getDate() + (dayNumber - (wizardData.eventDay || 1)));

                            const year = newDate.getFullYear();
                            const month = String(newDate.getMonth() + 1).padStart(2, '0');
                            const day = String(newDate.getDate()).padStart(2, '0');
                            const hours = String(newDate.getHours()).padStart(2, '0');
                            const minutes = String(newDate.getMinutes()).padStart(2, '0');
                            const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

                            updateWizardData({
                              eventDay: dayNumber,
                              scheduledTime: formattedDateTime,
                              title: wizardData.title.includes(' - Day ')
                                ? wizardData.title.replace(/- Day \d+/, `- Day ${dayNumber}`)
                                : `${wizardData.title} - Day ${dayNumber}`
                            });
                          } else {
                            updateWizardData({ eventDay: dayNumber });
                          }
                        }}
                        className="w-full px-3 py-2 pr-10 bg-slate-800/30 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 appearance-none backdrop-blur-sm transition-colors"
                      >
                        {Array.from({ length: selectedEvent.number_of_days || 5 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>Day {day}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      This is a {selectedEvent.number_of_days || 'multi'}-day event - select which day this stream covers
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {currentStep === 'details' && (
            <div className="space-y-6">
              {wizardData.timing === 'later' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Scheduled Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={wizardData.scheduledTime || ''}
                    onChange={(e) => updateWizardData({ scheduledTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 backdrop-blur-sm transition-colors [color-scheme:dark]"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={wizardData.title}
                  onChange={(e) => updateWizardData({ title: e.target.value })}
                  placeholder="Add a title that describes your stream"
                  className="w-full px-3 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 backdrop-blur-sm transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={wizardData.description}
                  onChange={(e) => updateWizardData({ description: e.target.value })}
                  placeholder="Tell viewers more about your stream"
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 backdrop-blur-sm transition-colors"
                />
              </div>

            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-6">
              <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 backdrop-blur-sm p-6 space-y-4">
                <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Stream Summary</h3>

                <div className="space-y-0 text-sm">
                  <div className="flex justify-between py-3 border-b border-slate-700/30">
                    <span className="text-slate-400">Timing</span>
                    <span className="text-white font-medium">
                      {wizardData.timing === 'now' ? 'Go Live Now' : 'Scheduled'}
                    </span>
                  </div>

                  {wizardData.timing === 'later' && wizardData.scheduledTime && (
                    <div className="flex justify-between py-3 border-b border-slate-700/30">
                      <span className="text-slate-400">Start Time</span>
                      <span className="text-white font-medium">
                        {new Date(wizardData.scheduledTime).toLocaleString()}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between py-3 border-b border-slate-700/30">
                    <span className="text-slate-400">Title</span>
                    <span className="text-white font-medium max-w-[60%] text-right">{wizardData.title || 'Not set'}</span>
                  </div>

                  {wizardData.eventId && (
                    <div className="flex justify-between py-3 border-b border-slate-700/30">
                      <span className="text-slate-400">Linked Event</span>
                      <span className="text-white font-medium">
                        {events.find(e => e.id === wizardData.eventId)?.name || 'Selected'}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between py-3 border-b border-slate-700/30">
                    <span className="text-slate-400">Platform</span>
                    <span className="text-white font-medium">Cloudflare Stream (WHIP)</span>
                  </div>

                  <div className="flex justify-between py-3">
                    <span className="text-slate-400">Leaderboard Overlay</span>
                    <span className={`font-medium ${wizardData.enableLeaderboard ? 'text-cyan-400' : 'text-slate-500'}`}>
                      {wizardData.enableLeaderboard ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4">
                <p className="text-cyan-200 text-sm">
                  {wizardData.timing === 'now'
                    ? 'Click "Go Live" to create your stream session. You can then configure cameras and overlays before starting the broadcast.'
                    : 'Your stream will be scheduled and you can configure additional settings later.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800/30 backdrop-blur-sm px-6 py-4 flex justify-between items-center border-t border-slate-700/50">
          <button
            onClick={currentStepIndex === 0 ? onClose : handleBack}
            className="flex items-center space-x-2 px-4 py-2.5 text-slate-300 hover:text-white transition-colors rounded-xl hover:bg-slate-700/50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{currentStepIndex === 0 ? 'Cancel' : 'Back'}</span>
          </button>

          {currentStep !== 'review' ? (
            <button
              onClick={handleNext}
              disabled={currentStep === 'details' && !wizardData.title}
              className="btn-primary-green flex items-center space-x-2 px-6 py-2.5 from-cyan-600 to-blue-600 text-white rounded-xl hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={loading || !wizardData.title}
              className="btn-primary-green flex items-center space-x-2 px-6 py-2.5 text-white rounded-xl disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Creating...' : wizardData.timing === 'now' ? 'Go Live' : 'Schedule Stream'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

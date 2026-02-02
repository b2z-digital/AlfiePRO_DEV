import React, { useState, useEffect } from 'react';
import { X, Check, Calendar, Video, ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
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

type Step = 'timing' | 'event' | 'details' | 'customization' | 'visibility' | 'review';

interface WizardData {
  timing: 'now' | 'later';
  scheduledTime?: string;
  title: string;
  description: string;
  eventId?: string;
  eventDay?: number; // For multi-day events: which day (1, 2, 3, etc.)
  heatNumber?: number;
  category: string;
  thumbnailUrl?: string;
  enableChat: boolean;
  enableLeaderboard: boolean;
  chatMode: 'anyone' | 'subscribers' | 'members';
  enableReactions: boolean;
  slowMode: boolean;
  slowModeSeconds: number;
  visibility: 'public' | 'unlisted' | 'private';
  madeForKids: boolean;
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
      category: 'Sports',
      enableChat: true,
      enableLeaderboard: true,
      chatMode: 'anyone',
      enableReactions: true,
      slowMode: false,
      slowModeSeconds: 60,
      visibility: 'public',
      madeForKids: true,
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

  const steps: Step[] = ['timing', 'event', 'details', 'customization', 'visibility', 'review'];
  const currentStepIndex = steps.indexOf(currentStep);

  useEffect(() => {
    loadEvents();
    checkYouTubeIntegration();
  }, [clubId]);

  const checkYouTubeIntegration = async () => {
    try {
      console.log('🔍 Checking YouTube integration for club:', clubId);

      const { data: integration, error } = await supabase
        .from('integrations')
        .select('platform, is_active, credentials')
        .eq('club_id', clubId)
        .eq('platform', 'youtube')
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('❌ Error checking YouTube integration:', error);
        addNotification('error', 'Failed to check YouTube integration');
        return;
      }

      if (!integration) {
        console.warn('⚠️ No active YouTube integration found for this club');
        console.log('💡 To schedule streams to YouTube, you need to:');
        console.log('   1. Go to Settings → Integrations');
        console.log('   2. Connect your YouTube account');
        console.log('   3. Grant the necessary permissions');
        addNotification('warning', 'YouTube not connected. Streams will only use Cloudflare.', 5000);
        return;
      }

      const credentials = integration.credentials as any;
      console.log('✅ YouTube integration found:', {
        platform: integration.platform,
        isActive: integration.is_active,
        hasCredentials: !!credentials,
        hasAccessToken: !!credentials?.access_token,
        accessTokenLength: credentials?.access_token?.length || 0
      });

      if (!credentials?.access_token) {
        console.error('❌ YouTube integration has no access token');
        addNotification('error', 'YouTube integration is invalid. Please reconnect in Settings.');
      }
    } catch (error) {
      console.error('❌ Error checking YouTube integration:', error);
      addNotification('error', 'Failed to check YouTube integration');
    }
  };

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
        is_public: wizardData.visibility === 'public',
        streaming_mode: 'cloudflare_relay',
        overlay_config: {
          showHeatNumber: true,
          showSkippers: true,
          showStandings: wizardData.enableLeaderboard,
          showWeather: true,
          showHandicaps: false,
          position: 'bottom',
          theme: 'dark',
          chatMode: wizardData.chatMode,
          enableReactions: wizardData.enableReactions,
          slowMode: wizardData.slowMode,
          slowModeSeconds: wizardData.slowModeSeconds,
          visibility: wizardData.visibility,
        },
      };

      // Step 1: Create Cloudflare Stream live input
      setLoadingMessage('Creating Cloudflare Stream input...');
      console.log('[LivestreamWizard] Creating Cloudflare Stream live input...');
      try {
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

        if (cfResponse.ok && cfData.liveInput) {
          console.log('[LivestreamWizard] Cloudflare live input created:', cfData.liveInput.uid);
          sessionData.cloudflare_live_input_id = cfData.liveInput.uid;
          sessionData.cloudflare_whip_url = cfData.liveInput.webRTC?.url;
          sessionData.cloudflare_whip_playback_url = cfData.liveInput.webRTCPlayback?.url;

          // Step 2: Create YouTube broadcast (always if integration exists)
          try {
            setLoadingMessage('Creating YouTube broadcast...');
            console.log('[LivestreamWizard] Creating YouTube broadcast...');

            // For immediate streams, set scheduled time to now + 1 minute (YouTube requirement)
            let scheduledStartTime = wizardData.scheduledTime;
            if (wizardData.timing === 'now' || !scheduledStartTime) {
              const now = new Date();
              now.setMinutes(now.getMinutes() + 1);
              scheduledStartTime = now.toISOString();
            }

            const ytResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                action: 'createBroadcast',
                clubId,
                sessionData: {
                  title: wizardData.title,
                  description: wizardData.description,
                  scheduledStartTime: scheduledStartTime,
                  privacyStatus: wizardData.visibility === 'public' ? 'public' : 'unlisted'
                }
              })
            });

            const ytData = await ytResponse.json();

            console.log('[LivestreamWizard] YouTube broadcast response:', {
              ok: ytResponse.ok,
              status: ytResponse.status,
              data: ytData
            });

            if (ytResponse.ok && ytData.broadcast) {
              sessionData.youtube_broadcast_id = ytData.broadcast.id;
              console.log('✅ YouTube broadcast created:', ytData.broadcast.id);
              addNotification('success', 'Successfully created YouTube broadcast', 3000);

              // Step 3: Create YouTube stream and get RTMP details
              setLoadingMessage('Configuring YouTube stream...');
              const streamResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  action: 'createStream',
                  clubId,
                  sessionData: {
                    title: wizardData.title,
                    description: wizardData.description
                  }
                })
              });

              const streamData = await streamResponse.json();

              if (streamResponse.ok && streamData.stream) {
                // Get the ingestion URL from YouTube
                let rtmpUrl = streamData.stream.cdn?.ingestionInfo?.ingestionAddress;
                const streamKey = streamData.stream.cdn?.ingestionInfo?.streamName;

                // CRITICAL: Ensure we use RTMP (not RTMPS) for Cloudflare output
                // YouTube sometimes returns RTMPS URLs, but Cloudflare expects RTMP
                if (rtmpUrl && rtmpUrl.startsWith('rtmps://')) {
                  console.log('[LivestreamWizard] ⚠️ YouTube returned RTMPS URL, converting to RTMP');
                  rtmpUrl = rtmpUrl.replace('rtmps://', 'rtmp://').replace('.rtmps.', '.rtmp.');
                  console.log('[LivestreamWizard] Converted URL:', rtmpUrl);
                }

                sessionData.youtube_stream_key = streamKey;
                sessionData.youtube_stream_url = rtmpUrl;
                sessionData.youtube_rtmp_url = rtmpUrl ? `${rtmpUrl}/${streamKey}` : undefined;

                // Bind broadcast to stream
                setLoadingMessage('Connecting broadcast to stream...');
                const bindResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    action: 'bindBroadcastToStream',
                    clubId,
                    sessionData: {
                      broadcastId: ytData.broadcast.id,
                      streamId: streamData.stream.id
                    }
                  })
                });

                const bindData = await bindResponse.json();
                if (bindResponse.ok) {
                  console.log('✅ Broadcast bound to stream');

                  // YouTube will automatically transition from 'ready' to 'testing' when video is detected
                  // Do NOT manually transition - it will cause 403 error
                  console.log('[LivestreamWizard] YouTube broadcast is ready. Will auto-detect video when stream starts.');
                  addNotification('success', 'YouTube broadcast created successfully', 3000);

                  // Step 4: Add YouTube as output destination in Cloudflare
                  // Add the output immediately - YouTube will detect video when cameras connect
                  if (rtmpUrl && streamKey) {
                    setLoadingMessage('Connecting Cloudflare to YouTube...');
                    console.log('[LivestreamWizard] Adding YouTube output to Cloudflare...');
                    console.log('[LivestreamWizard] YouTube RTMP URL:', rtmpUrl);
                    console.log('[LivestreamWizard] YouTube Stream Key:', streamKey?.substring(0, 10) + '...');

                    const outputResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`, {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({
                        action: 'addOutput',
                        clubId,
                        sessionData: {
                          liveInputId: cfData.liveInput.uid,
                          streamUrl: rtmpUrl,
                          streamKey: streamKey
                        }
                      })
                    });

                    const outputData = await outputResponse.json();
                    console.log('[LivestreamWizard] Cloudflare addOutput response:', outputData);

                    if (outputResponse.ok && outputData.output) {
                      sessionData.cloudflare_output_id = outputData.output.uid;
                      console.log('✅ YouTube output added to Cloudflare');
                      addNotification('success', 'Successfully configured Cloudflare to YouTube relay', 4000);
                    } else {
                      console.error('❌ Failed to add YouTube output to Cloudflare:', outputData);
                      addNotification('warning', 'Cloudflare output setup failed. Video may not relay to YouTube.', 6000);
                    }
                  }
                } else {
                  console.error('❌ Failed to bind broadcast to stream:', bindData);
                  addNotification('error', 'Failed to bind YouTube broadcast to stream', 5000);
                }
              }
            } else {
              console.error('❌ YouTube broadcast creation failed:', {
                status: ytResponse.status,
                error: ytData.error,
                fullResponse: ytData
              });
              addNotification(
                'error',
                `YouTube broadcast failed: ${ytData.error?.message || ytData.error || 'Unknown error'}. Stream will work via Cloudflare only.`,
                8000
              );
            }
          } catch (ytError: any) {
            console.error('❌ YouTube integration error:', ytError);
            addNotification(
              'error',
              `YouTube error: ${ytError.message}. Stream will work via Cloudflare only.`,
              8000
            );
          }
        } else {
          console.warn('[LivestreamWizard] Cloudflare Stream not configured:', cfData.error);
          addNotification('warning', cfData.hint || 'Cloudflare Stream not configured. Please set it up in Settings > Integrations.', 8000);
          sessionData.streaming_mode = 'direct_youtube';
        }
      } catch (cfError: any) {
        console.error('[LivestreamWizard] Cloudflare error:', cfError);
        addNotification('warning', 'Cloudflare Stream setup failed. Please check your integration settings.', 6000);
        sessionData.streaming_mode = 'direct_youtube';
      }

      // Validate YouTube setup if enabled
      if (wizardData.youtubeEnabled && !sessionData.youtube_broadcast_id) {
        console.error('[LivestreamWizard] YouTube was enabled but no broadcast was created!');
        addNotification(
          'error',
          'Failed to create YouTube broadcast. Please check your YouTube integration in Settings or disable YouTube streaming.',
          10000
        );
        setLoading(false);
        return; // Don't save session if YouTube setup failed
      }

      setLoadingMessage('Finalizing setup...');
      addNotification('success', 'Successfully created livestream session', 3000);
      const session = await livestreamStorage.createSession(sessionData);
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
      case 'details': return 'Stream Details';
      case 'customization': return 'Customisation';
      case 'visibility': return 'Visibility';
      case 'review': return 'Review & Go Live';
      default: return '';
    }
  };

  return (
    <>
      {/* Loading Modal Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60]">
          <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full mx-4 border border-blue-500/30 shadow-2xl">
            <div className="flex flex-col items-center">
              {/* Animated Spinner */}
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
              </div>

              {/* Loading Message */}
              <h3 className="text-xl font-semibold text-white mb-2">Setting Up Your Stream</h3>
              <p className="text-gray-400 text-center">{loadingMessage}</p>

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

      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">{getStepTitle()}</h2>
            {currentStep === 'timing' && (
              <p className="text-blue-100">When do you want to go live?</p>
            )}
          </div>

          {/* Progress Indicator */}
          <div className="mt-6 flex justify-center space-x-2">
            {steps.map((step, index) => (
              <div
                key={step}
                className={`h-1 w-16 rounded-full transition-colors ${
                  index <= currentStepIndex ? 'bg-white' : 'bg-blue-400 bg-opacity-30'
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
                className="w-full bg-gray-800 hover:bg-gray-700 p-6 rounded-lg flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-gray-700 p-3 rounded-full group-hover:bg-gray-600">
                    <Video className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-white font-semibold text-lg">Go Live Now</h3>
                    <p className="text-gray-400">Set up your stream and start broadcasting immediately</p>
                  </div>
                </div>
                <div className="bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold">
                  Now
                </div>
              </button>

              <button
                onClick={() => {
                  updateWizardData({ timing: 'later' });
                  handleNext();
                }}
                className="w-full bg-gray-800 hover:bg-gray-700 p-6 rounded-lg flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-gray-700 p-3 rounded-full group-hover:bg-gray-600">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-white font-semibold text-lg">Schedule Stream</h3>
                    <p className="text-gray-400">Set up a stream for a later time or future event</p>
                  </div>
                </div>
                <div className="bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold">
                  Later
                </div>
              </button>
            </div>
          )}


          {currentStep === 'event' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-semibold text-lg mb-2">Select Event</h3>
                <p className="text-gray-400 text-sm mb-4">Choose which race or event this livestream will cover</p>

                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Link to Race/Event <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    value={wizardData.eventId || ''}
                    onChange={(e) => handleEventSelection(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="">No event selected</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.name} - {new Date(event.date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
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
                    <label className="block text-sm font-medium text-gray-300 mb-2">
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
                        className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500 appearance-none"
                      >
                        {Array.from({ length: selectedEvent.number_of_days || 5 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>Day {day}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                    </div>
                    <p className="mt-2 text-sm text-gray-400">
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Scheduled Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={wizardData.scheduledTime || ''}
                    onChange={(e) => updateWizardData({ scheduledTime: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={wizardData.title}
                  onChange={(e) => updateWizardData({ title: e.target.value })}
                  placeholder="Add a title that describes your stream"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={wizardData.description}
                  onChange={(e) => updateWizardData({ description: e.target.value })}
                  placeholder="Tell viewers more about your stream"
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Category
                </label>
                <div className="relative">
                  <select
                    value={wizardData.category}
                    onChange={(e) => updateWizardData({ category: e.target.value })}
                    className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="Sports">Sports</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Education">Education</option>
                    <option value="Gaming">Gaming</option>
                    <option value="People & Blogs">People & Blogs</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                </div>
              </div>
            </div>
          )}

          {currentStep === 'customization' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-semibold mb-4">Live Chat</h3>
                <div className="space-y-3">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={wizardData.enableChat}
                      onChange={(e) => updateWizardData({ enableChat: e.target.checked })}
                      className="w-5 h-5 bg-gray-800 border-gray-700 rounded"
                    />
                    <span className="text-gray-300">Enable live chat</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={wizardData.enableLeaderboard}
                      onChange={(e) => updateWizardData({ enableLeaderboard: e.target.checked })}
                      className="w-5 h-5 bg-gray-800 border-gray-700 rounded"
                    />
                    <span className="text-gray-300">Show live leaderboard overlay</span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-white font-semibold mb-4">Participant Modes</h3>
                <p className="text-gray-400 text-sm mb-3">Who can send messages</p>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3">
                    <input
                      type="radio"
                      checked={wizardData.chatMode === 'anyone'}
                      onChange={() => updateWizardData({ chatMode: 'anyone' })}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-300">Anyone</span>
                  </label>
                  <label className="flex items-center space-x-3">
                    <input
                      type="radio"
                      checked={wizardData.chatMode === 'subscribers'}
                      onChange={() => updateWizardData({ chatMode: 'subscribers' })}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-300">Subscribers only</span>
                  </label>
                  <label className="flex items-center space-x-3">
                    <input
                      type="radio"
                      checked={wizardData.chatMode === 'members'}
                      onChange={() => updateWizardData({ chatMode: 'members' })}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-300">Club members only</span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-white font-semibold mb-4">Reactions</h3>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={wizardData.enableReactions}
                    onChange={(e) => updateWizardData({ enableReactions: e.target.checked })}
                    className="w-5 h-5 bg-gray-800 border-gray-700 rounded"
                  />
                  <span className="text-gray-300">Enable live reactions</span>
                </label>
              </div>

              <div>
                <h3 className="text-white font-semibold mb-4">Message Delay</h3>
                <label className="flex items-center space-x-3 mb-3">
                  <input
                    type="checkbox"
                    checked={wizardData.slowMode}
                    onChange={(e) => updateWizardData({ slowMode: e.target.checked })}
                    className="w-5 h-5 bg-gray-800 border-gray-700 rounded"
                  />
                  <span className="text-gray-300">Enable slow mode</span>
                </label>
                {wizardData.slowMode && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Seconds between messages</label>
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={wizardData.slowModeSeconds}
                      onChange={(e) => updateWizardData({ slowModeSeconds: parseInt(e.target.value) || 60 })}
                      className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'visibility' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-semibold mb-4">Who can watch this stream?</h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 p-3 bg-gray-800 rounded">
                    <input
                      type="radio"
                      checked={wizardData.visibility === 'public'}
                      onChange={() => updateWizardData({ visibility: 'public' })}
                      className="w-4 h-4"
                    />
                    <div>
                      <div className="text-white font-medium">Public</div>
                      <div className="text-gray-400 text-sm">Anyone can watch your stream</div>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 p-3 bg-gray-800 rounded">
                    <input
                      type="radio"
                      checked={wizardData.visibility === 'unlisted'}
                      onChange={() => updateWizardData({ visibility: 'unlisted' })}
                      className="w-4 h-4"
                    />
                    <div>
                      <div className="text-white font-medium">Unlisted</div>
                      <div className="text-gray-400 text-sm">Only people with the link can watch</div>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 p-3 bg-gray-800 rounded">
                    <input
                      type="radio"
                      checked={wizardData.visibility === 'private'}
                      onChange={() => updateWizardData({ visibility: 'private' })}
                      className="w-4 h-4"
                    />
                    <div>
                      <div className="text-white font-medium">Private</div>
                      <div className="text-gray-400 text-sm">Only club members can watch</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="bg-gray-800 p-4 rounded">
                <h3 className="text-white font-semibold mb-2">Audience</h3>
                <p className="text-gray-400 text-sm mb-4">Is this stream made for kids?</p>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3">
                    <input
                      type="radio"
                      checked={wizardData.madeForKids === true}
                      onChange={() => updateWizardData({ madeForKids: true })}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-300">Yes, it's made for kids</span>
                  </label>
                  <label className="flex items-center space-x-3">
                    <input
                      type="radio"
                      checked={wizardData.madeForKids === false}
                      onChange={() => updateWizardData({ madeForKids: false })}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-300">No, it's not made for kids</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg space-y-4">
                <h3 className="text-white font-semibold text-lg">Review Your Stream Settings</h3>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b border-gray-700 pb-2">
                    <span className="text-gray-400">Timing:</span>
                    <span className="text-white font-medium">
                      {wizardData.timing === 'now' ? 'Go Live Now' : 'Scheduled'}
                    </span>
                  </div>

                  {wizardData.timing === 'later' && wizardData.scheduledTime && (
                    <div className="flex justify-between border-b border-gray-700 pb-2">
                      <span className="text-gray-400">Start Time:</span>
                      <span className="text-white font-medium">
                        {new Date(wizardData.scheduledTime).toLocaleString()}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between border-b border-gray-700 pb-2">
                    <span className="text-gray-400">Title:</span>
                    <span className="text-white font-medium">{wizardData.title || 'Not set'}</span>
                  </div>

                  {wizardData.eventId && (
                    <div className="flex justify-between border-b border-gray-700 pb-2">
                      <span className="text-gray-400">Linked Event:</span>
                      <span className="text-white font-medium">
                        {events.find(e => e.id === wizardData.eventId)?.name || 'Selected'}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between border-b border-gray-700 pb-2">
                    <span className="text-gray-400">Visibility:</span>
                    <span className="text-white font-medium capitalize">{wizardData.visibility}</span>
                  </div>

                  <div className="flex justify-between border-b border-gray-700 pb-2">
                    <span className="text-gray-400">Chat:</span>
                    <span className="text-white font-medium">
                      {wizardData.enableChat ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-gray-700 pb-2">
                    <span className="text-gray-400">Leaderboard:</span>
                    <span className="text-white font-medium">
                      {wizardData.enableLeaderboard ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-900 bg-opacity-30 border border-blue-700 p-4 rounded">
                <p className="text-blue-200 text-sm">
                  {wizardData.timing === 'now'
                    ? 'Click "Go Live" to create your stream session. You can then configure cameras and overlays before starting the broadcast.'
                    : 'Your stream will be scheduled and you can configure additional settings later.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-800 px-6 py-4 flex justify-between items-center border-t border-gray-700">
          <button
            onClick={currentStepIndex === 0 ? onClose : handleBack}
            className="flex items-center space-x-2 px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{currentStepIndex === 0 ? 'Cancel' : 'Back'}</span>
          </button>

          {currentStep !== 'review' ? (
            <button
              onClick={handleNext}
              disabled={currentStep === 'details' && (!wizardData.title || !wizardData.eventId)}
              className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={loading || !wizardData.title || !wizardData.eventId}
              className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
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

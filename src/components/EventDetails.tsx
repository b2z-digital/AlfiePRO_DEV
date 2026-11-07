import React, { useState, useEffect, useRef } from 'react';
import { Calendar, MapPin, Users, Trophy, FileText, X, Plus, ExternalLink, Youtube, Play, Trash2, ThumbsUp, ThumbsDown, Circle as HelpCircle, Video, DollarSign, QrCode, Info, Image, Cloud, Globe, MessageSquare, Loader as Loader2, CircleCheck as CheckCircle, Radio, Upload, TriangleAlert, ClipboardList, Gavel, Pencil, UserPlus, ChevronDown } from 'lucide-react';
import { RaceEvent } from '../types/race';
import { getBoatClassBadge, getRaceFormatBadge } from '../constants/colors';
import { ASwitch } from './alfie/Kit';
import { formatDate } from '../utils/date';
import { setCurrentEvent } from '../utils/raceStorage';
import EventResultsDisplay from './EventResultsDisplay';
import { PublishToMetaModal } from './PublishToMetaModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import { getStoredVenues } from '../utils/venueStorage';
import { MediaUploadGallery } from './MediaUploadGallery';
import { updateEventMedia } from '../utils/raceStorage';
import { EventMedia, YouTubeVideo } from '../types/media';
import { UploadVideoModal } from './UploadVideoModal';
import { getBoatClassImage } from '../utils/boatClassImages';
import { usePermissions } from '../hooks/usePermissions';
import { WindyWeatherWidget } from './WindyWeatherWidget';
import { EventRegistrationModal } from './events/EventRegistrationModal';
import LiveTrackingQRCodeModal from './live-tracking/LiveTrackingQRCodeModal';
import { getLiveTrackingEvent } from '../utils/liveTrackingStorage';
import { EventWebsiteSettingsModal } from './events/EventWebsiteSettingsModal';
import { EventLivestreamModal } from './livestream/EventLivestreamModal';
import { ImportRoundResultsModal } from './ImportRoundResultsModal';
import { getStoredRaceSeries, storeRaceSeries } from '../utils/raceStorage';
import { RaceSeries } from '../types/race';
import { RaceSignOnSheet } from './RaceSignOnSheet';
import { ProtestBoard } from './ProtestBoard';
import { createTask } from '../utils/taskStorage';
import { TaskFormData } from '../types/task';

// Helper function to extract database UUID from app event ID
function extractDbId(eventId: string): string {
  if (eventId.includes('-round-') || eventId.includes('-day-')) {
    // For series events like "uuid-round-1" or "uuid-day-2"
    const parts = eventId.split('-');
    // Take first 5 parts to reconstruct the UUID (8-4-4-4-12 format)
    return parts.slice(0, 5).join('-');
  }

  // Handle series round format: "uuid-0", "uuid-1", etc.
  // UUID format: 8-4-4-4-12 (5 parts separated by hyphens)
  const parts = eventId.split('-');
  if (parts.length > 5) {
    // If there are more than 5 parts, it's likely a UUID with a suffix (round index)
    // Extract just the UUID (first 5 parts)
    return parts.slice(0, 5).join('-');
  }

  return eventId; // Return as-is if it's already a clean UUID
}

interface EventDetailsProps {
  event: RaceEvent;
  darkMode: boolean;
  onStartScoring?: (event: RaceEvent) => void;
  onClose: () => void;
  onEdit?: () => void;
  onViewVenue?: (venueName: string) => void;
  onEventDataUpdated?: (eventId: string) => void;
}

export const EventDetails: React.FC<EventDetailsProps> = ({
  event: initialEvent,
  darkMode,
  onStartScoring,
  onClose,
  onEdit,
  onViewVenue,
  onEventDataUpdated
}) => {
  const { can, currentOrganization, isAdmin, isEditor } = usePermissions();
  const [event, setEvent] = useState<RaceEvent>(initialEvent);

  // Documents for the Documents tab: series rounds read their series; events read their own row
  const [savedDocs, setSavedDocs] = useState<{ nor?: string; si?: string; extra: Array<{ name: string; url: string; type?: string }> }>({ extra: [] });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let row: any = null;
        if (event.isSeriesEvent && event.seriesId) {
          ({ data: row } = await supabase.from('race_series').select('*').eq('id', extractDbId(event.seriesId)).maybeSingle());
        } else if (event.isPublicEvent && event.id) {
          ({ data: row } = await supabase.from('public_events').select('*').eq('id', event.id).maybeSingle());
        } else if (event.id) {
          ({ data: row } = await supabase.from('quick_races').select('*').eq('id', extractDbId(event.id)).maybeSingle());
          const publicId = row?.public_event_id || (event as any).publicEventId || (event as any).public_event_id;
          if (publicId && !row?.notice_of_race_url && !row?.sailing_instructions_url && !(row?.additional_documents || []).length) {
            const { data: pub } = await supabase.from('public_events').select('*').eq('id', publicId).maybeSingle();
            if (pub) row = pub;
          }
        }
        if (!cancelled && row) {
          setSavedDocs({
            nor: row.notice_of_race_url || undefined,
            si: row.sailing_instructions_url || undefined,
            extra: Array.isArray(row.additional_documents) ? row.additional_documents.filter((d: any) => d && d.url) : [],
          });
        }
      } catch {
        /* keep whatever the event already carries */
      }
    })();
    return () => { cancelled = true; };
  }, [event.id, event.seriesId, event.isSeriesEvent, event.isPublicEvent]);
  const eventRef = useRef<RaceEvent>(initialEvent);

  // Keep ref in sync with state
  useEffect(() => {
    eventRef.current = event;
  }, [event]);
  const [activeTab, setActiveTab] = useState<'details' | 'documents' | 'media' | 'registrations' | 'registration' | 'results' | 'weather' | 'signon' | 'protests'>('details');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaConnected, setMetaConnected] = useState(false);
  const [metaPageName, setMetaPageName] = useState('');
  const [metaPageId, setMetaPageId] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState<'yes' | 'no' | 'maybe' | null>(null);
  const [attendees, setAttendees] = useState<{id: string, name: string, status: 'yes' | 'no' | 'maybe', avatarUrl?: string}[]>([]);
  const [venueImage, setVenueImage] = useState<string | null>(null);
  const [venueDetails, setVenueDetails] = useState<any>(null);
  const [eventMedia, setEventMedia] = useState<any[]>(event.media || []);
  const [isUpdatingMedia, setIsUpdatingMedia] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeChannelId, setYoutubeChannelId] = useState('');
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [eventVideos, setEventVideos] = useState<EventMedia[]>([]);
  const [showVideoSelector, setShowVideoSelector] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [updatingAttendance, setUpdatingAttendance] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [raceReport, setRaceReport] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [skipperAvatars, setSkipperAvatars] = useState<Record<string, string>>({});
  const [showAllSkippers, setShowAllSkippers] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [showLiveTrackingQR, setShowLiveTrackingQR] = useState(false);
  const [showLivestreamModal, setShowLivestreamModal] = useState(false);
  const [hasLivestreamSession, setHasLivestreamSession] = useState(false);
  const [showImportResults, setShowImportResults] = useState(false);
  const [importSeriesData, setImportSeriesData] = useState<RaceSeries | null>(null);
  const [importRoundIndex, setImportRoundIndex] = useState<number>(0);
  const [checkingLivestream, setCheckingLivestream] = useState(true);
  const [showEventWebsiteModal, setShowEventWebsiteModal] = useState(false);
  const [hasEventWebsite, setHasEventWebsite] = useState(false);
  const [eventWebsiteId, setEventWebsiteId] = useState<string | null>(null);
  const [userRegistration, setUserRegistration] = useState<any>(null);
  const [loadingRegistration, setLoadingRegistration] = useState(false);
  const [allRegistrations, setAllRegistrations] = useState<any[]>([]);
  const [loadingAllRegistrations, setLoadingAllRegistrations] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState<{ sent: number; failed: number } | null>(null);
  const [smsAlreadySent, setSmsAlreadySent] = useState(false);
  const [loadingSkipperTracking, setLoadingSkipperTracking] = useState(false);
  const [hasLiveTrackingEvent, setHasLiveTrackingEvent] = useState(false);
  const [showEditResultsConfirm, setShowEditResultsConfirm] = useState(false);
  const [clubMembers, setClubMembers] = useState<{id: string, name: string}[]>([]);
  const [showProDropdown, setShowProDropdown] = useState(false);
  const [assigningPro, setAssigningPro] = useState(false);
  const [proSearchTerm, setProSearchTerm] = useState('');
  const [rosteredProName, setRosteredProName] = useState<string | null>(null);
  const [startingScoring, setStartingScoring] = useState(false);

  useEffect(() => {
    if (event.proMemberName || !event.clubId || !event.date) return;
    const fetchRosteredPro = async () => {
      try {
        const eventDate = event.date?.split('T')[0];
        if (!eventDate) return;
        const seriesId = event.isSeriesEvent && event.seriesId ? extractDbId(event.seriesId) : null;

        let rosterQuery = supabase
          .from('pro_rosters')
          .select('id')
          .eq('club_id', event.clubId!)
          .eq('status', 'active');
        if (seriesId) {
          rosterQuery = rosterQuery.eq('series_id', seriesId);
        }
        const { data: rosters } = await rosterQuery;
        if (!rosters || rosters.length === 0) return;

        const rosterIds = rosters.map((r: any) => r.id);
        const { data: rounds } = await supabase
          .from('pro_roster_rounds')
          .select('id, roster_id, pro_roster_assignments(member_id, status)')
          .in('roster_id', rosterIds)
          .eq('date', eventDate);
        if (!rounds || rounds.length === 0) return;

        for (const round of rounds as any[]) {
          const assignments = round.pro_roster_assignments || [];
          const active = assignments.find((a: any) => a.status === 'assigned' || a.status === 'confirmed');
          if (active) {
            const { data: member } = await supabase
              .from('members')
              .select('first_name, last_name')
              .eq('id', active.member_id)
              .maybeSingle();
            if (member) {
              const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ');
              if (fullName) {
                setRosteredProName(fullName);
                return;
              }
            }
          }
        }
      } catch {
        // Roster PRO lookup is best-effort
      }
    };
    fetchRosteredPro();
  }, [event.proMemberName, event.clubId, event.date, event.seriesId, event.isSeriesEvent]);

  useEffect(() => {
    const checkLiveTracking = async () => {
      if (!event.enableLiveTracking) {
        setHasLiveTrackingEvent(false);
        return;
      }
      try {
        const dbId = extractDbId(event.id);
        const trackingEvent = await getLiveTrackingEvent(dbId);
        setHasLiveTrackingEvent(!!(trackingEvent?.access_token || trackingEvent?.short_code));
      } catch {
        setHasLiveTrackingEvent(false);
      }
    };
    checkLiveTracking();
  }, [event.id, event.enableLiveTracking]);

  const handleJoinLiveTracking = async () => {
    setLoadingSkipperTracking(true);
    try {
      const dbId = extractDbId(event.id);
      const trackingEvent = await getLiveTrackingEvent(dbId);
      if (trackingEvent?.access_token) {
        navigate(`/live/${trackingEvent.short_code || trackingEvent.access_token}`);
      } else if (trackingEvent?.short_code) {
        navigate(`/live/${trackingEvent.short_code}`);
      } else {
        setError('Live tracking is not yet set up for this event. Ask your race officer to enable it.');
      }
    } catch {
      setError('Could not load live tracking details.');
    } finally {
      setLoadingSkipperTracking(false);
    }
  };

  // Check if event has participants or has been started
  const hasParticipants = event.skippers && event.skippers.length > 0;

  // Debug logging
  console.log('📋 [EventDetails] RENDER - Event:', event.eventName);
  console.log('📋 [EventDetails] RENDER - showLivestreamModal:', showLivestreamModal);
  console.log('📋 [EventDetails] Is series event:', event.isSeriesEvent);
  console.log('📋 [EventDetails] Round name:', event.roundName);
  console.log('📋 [EventDetails] Skippers count:', event.skippers?.length || 0);
  console.log('📋 [EventDetails] Has participants:', hasParticipants);
  console.log('📋 [EventDetails] Last completed race:', event.lastCompletedRace);

  const { currentClub, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMembers = async () => {
      if (!currentClub?.clubId || event.isSeriesEvent) return;
      const { data } = await supabase
        .from('members')
        .select('id, first_name, last_name')
        .eq('club_id', currentClub.clubId)
        .order('first_name');
      if (data) {
        setClubMembers(data.map(m => ({ id: m.id, name: `${m.first_name} ${m.last_name}`.trim() })));
      }
    };
    fetchMembers();
  }, [currentClub?.clubId, event.isSeriesEvent]);

  const handleAssignPro = async (memberId: string, memberName: string) => {
    if (!currentClub?.clubId || !user) return;
    setAssigningPro(true);
    try {
      const dbId = extractDbId(event.id);
      const { error: updateError } = await supabase
        .from('quick_races')
        .update({ pro_member_id: memberId, pro_member_name: memberName })
        .eq('id', dbId);
      if (updateError) throw updateError;

      // Delete existing PRO duty task for the previous assignee
      if (event.proMemberId) {
        const prevDate = event.date || event.startDate;
        if (prevDate) {
          const { data: existingTasks } = await supabase
            .from('club_tasks')
            .select('id')
            .eq('club_id', currentClub.clubId)
            .eq('assignee_id', event.proMemberId)
            .ilike('title', `PRO Duty:%${prevDate}%`);
          if (existingTasks?.length) {
            await supabase.from('club_tasks').delete().in('id', existingTasks.map(t => t.id));
          }
        }
      }

      setEvent(prev => ({ ...prev, proMemberId: memberId, proMemberName: memberName }));
      setShowProDropdown(false);
      setProSearchTerm('');

      const eventDate = event.date || event.startDate;
      if (eventDate) {
        const reminderDate = new Date(eventDate);
        reminderDate.setDate(reminderDate.getDate() - 3);
        const taskData: TaskFormData = {
          title: `PRO Duty: ${event.title} - ${eventDate}`,
          description: `You have been assigned as Principal Race Officer for ${event.raceClass || 'the event'} on ${eventDate}.`,
          due_date: eventDate,
          priority: 'high',
          assignee_id: memberId,
          send_reminder: true,
          reminder_type: 'both',
          reminder_date: reminderDate.toISOString().split('T')[0],
        };
        await createTask(currentClub.clubId, user.id, taskData);
      }

      onEventDataUpdated?.(event.id);
    } catch (err) {
      console.error('Failed to assign PRO:', err);
    } finally {
      setAssigningPro(false);
    }
  };

  const handleRemovePro = async () => {
    if (!currentClub?.clubId) return;
    setAssigningPro(true);
    try {
      const dbId = extractDbId(event.id);

      // Delete existing PRO duty task for the old assignee
      if (event.proMemberId) {
        const eventDate = event.date || event.startDate;
        if (eventDate) {
          const { data: existingTasks } = await supabase
            .from('club_tasks')
            .select('id')
            .eq('club_id', currentClub.clubId)
            .eq('assignee_id', event.proMemberId)
            .ilike('title', `PRO Duty:%${eventDate}%`);
          if (existingTasks?.length) {
            await supabase.from('club_tasks').delete().in('id', existingTasks.map(t => t.id));
          }
        }
      }

      await supabase
        .from('quick_races')
        .update({ pro_member_id: null, pro_member_name: null })
        .eq('id', dbId);
      setEvent(prev => ({ ...prev, proMemberId: undefined, proMemberName: undefined }));
      onEventDataUpdated?.(event.id);
    } catch (err) {
      console.error('Failed to remove PRO:', err);
    } finally {
      setAssigningPro(false);
    }
  };

  // Check if skippers have been added (this means the event is ready for scoring)
  // Once skippers are added, hide registration tab and show competing skippers
  const skippersAdded = hasParticipants;

  // Check if scoring has started (for single or multi-day events)
  const scoringStarted = event.lastCompletedRace > 0 ||
    (event.dayResults && Object.values(event.dayResults).some((day: any) => day?.lastCompletedRace > 0));

  // Refetch event data from database when modal opens to get latest skippers
  useEffect(() => {
    const refetchEventData = async () => {
      if (!currentClub?.clubId || !initialEvent.id) return;

      try {
        const dbId = extractDbId(initialEvent.id);

        console.log('🎬 [EventDetails] Initial event data:', {
          enableLiveStream: initialEvent.enableLiveStream,
          clubId: initialEvent.clubId,
          eventLevel: initialEvent.eventLevel,
          isSeriesEvent: initialEvent.isSeriesEvent
        });

        // Handle series rounds differently
        if (initialEvent.isSeriesEvent && initialEvent.seriesId && initialEvent.roundName) {
          console.log('🔄 [EventDetails] Refetching series round data from race_series_rounds table');

          // Fetch the round from race_series_rounds table
          const { data: roundData, error: roundError } = await supabase
            .from('race_series_rounds')
            .select('*')
            .eq('series_id', initialEvent.seriesId)
            .eq('round_name', initialEvent.roundName)
            .eq('club_id', currentClub.clubId)
            .maybeSingle();

          if (roundError) {
            console.error('Error refetching series round:', roundError);
            return;
          }

          if (roundData) {
            console.log('🔄 [EventDetails] Found round data with', roundData.skippers?.length || 0, 'skippers');
            console.log('🔄 [EventDetails] Round skippers from race_series_rounds:', roundData.skippers);

            // Merge round data from database with initial event
            const updatedEvent = {
              ...initialEvent,
              skippers: roundData.skippers || initialEvent.skippers || [],
              raceResults: roundData.race_results || initialEvent.raceResults || [],
              lastCompletedRace: roundData.last_completed_race || initialEvent.lastCompletedRace || 0,
              hasDeterminedInitialHcaps: roundData.has_determined_initial_hcaps || initialEvent.hasDeterminedInitialHcaps || false,
              isManualHandicaps: roundData.is_manual_handicaps || initialEvent.isManualHandicaps || false,
              heatManagement: roundData.heat_management || initialEvent.heatManagement || null,
              numRaces: roundData.num_races || initialEvent.numRaces,
              dropRules: roundData.drop_rules || initialEvent.dropRules || [4, 8, 16, 24, 32, 40],
              completed: roundData.completed || initialEvent.completed || false,
              multiDay: roundData.multi_day || initialEvent.multiDay || false,
              numberOfDays: roundData.number_of_days || initialEvent.numberOfDays || 1,
              dayResults: roundData.day_results || initialEvent.dayResults || {},
              currentDay: roundData.current_day || initialEvent.currentDay || 1,
              enableLiveStream: roundData.enable_livestream || initialEvent.enableLiveStream || false,
              enable_observers: roundData.enable_observers ?? initialEvent.enable_observers ?? false,
              observers_per_heat: roundData.observers_per_heat ?? initialEvent.observers_per_heat ?? 2
            };
            console.log('🔄 [EventDetails] Refetched event data, skippers:', updatedEvent.skippers?.length || 0);
            console.log('🔄 [EventDetails] Full updatedEvent.skippers:', updatedEvent.skippers);
            console.log('🔄 [EventDetails] Updated event enableLiveStream:', updatedEvent.enableLiveStream);
            setEvent(updatedEvent);
          } else {
            console.log('🔄 [EventDetails] Round not found in race_series_rounds, checking JSONB fallback');
            // Fall back to JSONB rounds for backward compatibility
            const { data: seriesData, error: seriesError } = await supabase
              .from('race_series')
              .select('rounds')
              .eq('id', initialEvent.seriesId)
              .eq('club_id', currentClub.clubId)
              .single();

            if (!seriesError && seriesData?.rounds) {
              const round = (seriesData.rounds as any[]).find(
                (r: any) => (r.name === initialEvent.roundName || r.roundName === initialEvent.roundName)
              );

              if (round) {
                console.log('🔄 [EventDetails] Found round in JSONB with', round.skippers?.length || 0, 'skippers');
                const updatedEvent = {
                  ...initialEvent,
                  skippers: round.skippers || initialEvent.skippers || [],
                  raceResults: round.raceResults || initialEvent.raceResults || [],
                  lastCompletedRace: round.lastCompletedRace || initialEvent.lastCompletedRace || 0,
                  hasDeterminedInitialHcaps: round.hasDeterminedInitialHcaps || initialEvent.hasDeterminedInitialHcaps || false,
                  isManualHandicaps: round.isManualHandicaps || initialEvent.isManualHandicaps || false,
                  heatManagement: round.heatManagement || initialEvent.heatManagement || null,
                  numRaces: round.numRaces || initialEvent.numRaces,
                  dropRules: round.dropRules || initialEvent.dropRules,
                  completed: round.completed || initialEvent.completed || false,
                  enableLiveStream: round.enableLiveStream || initialEvent.enableLiveStream || false,
                  enable_observers: round.enable_observers ?? initialEvent.enable_observers ?? false,
                  observers_per_heat: round.observers_per_heat ?? initialEvent.observers_per_heat ?? 2
                };
                setEvent(updatedEvent);
              }
            }
          }
        } else {
          // Handle single events - for public events, check for local copy first
          let eventIdToFetch = dbId;

          if (initialEvent.isPublicEvent) {
            console.log('🔄 [EventDetails] Public event - checking for local scoring copy');
            // Check if we have a local copy in quick_races
            const { data: localCopy } = await supabase
              .from('quick_races')
              .select('*')
              .eq('club_id', currentClub.clubId)
              .eq('event_name', initialEvent.eventName)
              .eq('race_date', initialEvent.date)
              .limit(1)
              .maybeSingle();

            if (localCopy) {
              console.log('🔄 [EventDetails] Found local scoring copy:', localCopy.id);
              // Use the local copy data
              const updatedEvent = {
                ...initialEvent,
                id: localCopy.id, // Switch to local copy ID
                skippers: localCopy.skippers || [],
                raceResults: localCopy.race_results || [],
                lastCompletedRace: localCopy.last_completed_race || 0,
                hasDeterminedInitialHcaps: localCopy.has_determined_initial_hcaps || false,
                isManualHandicaps: localCopy.is_manual_handicaps || false,
                heatManagement: localCopy.heat_management || null,
                dayResults: localCopy.day_results || {},
                currentDay: localCopy.current_day || 1,
                isPublicEvent: false, // It's now a local copy
              };
              console.log('Loaded local copy, skippers:', updatedEvent.skippers?.length || 0);
              setEvent(updatedEvent);
              return;
            } else {
              console.log('🔄 [EventDetails] No local copy found yet - public event not scored');
              // No local copy exists yet, stay with public event
              return;
            }
          }

          // For regular club events, fetch from database
          const { data, error } = await supabase
            .from('quick_races')
            .select('*')
            .eq('id', eventIdToFetch)
            .eq('club_id', currentClub.clubId)
            .single();

          if (error) {
            console.error('Error refetching event:', error);
            return;
          }

          if (data) {
            // Merge the fresh database data with the initial event
            const updatedEvent = {
              ...initialEvent,
              skippers: data.skippers || initialEvent.skippers || [],
              raceResults: data.race_results || initialEvent.raceResults || [],
              lastCompletedRace: data.last_completed_race || initialEvent.lastCompletedRace || 0,
              hasDeterminedInitialHcaps: data.has_determined_initial_hcaps || initialEvent.hasDeterminedInitialHcaps || false,
              isManualHandicaps: data.is_manual_handicaps || initialEvent.isManualHandicaps || false,
              heatManagement: data.heat_management || initialEvent.heatManagement || null,
              dayResults: data.day_results || initialEvent.dayResults || {},
              currentDay: data.current_day || initialEvent.currentDay || 1,
              enable_observers: data.enable_observers ?? initialEvent.enable_observers ?? false,
              observers_per_heat: data.observers_per_heat ?? initialEvent.observers_per_heat ?? 2,
            };
            console.log('Refetched event data, skippers:', updatedEvent.skippers?.length || 0, 'currentDay:', updatedEvent.currentDay);
            setEvent(updatedEvent);
          }
        }
      } catch (err) {
        console.error('Error refetching event data:', err);
      }
    };

    refetchEventData();
  }, [initialEvent.id, currentClub?.clubId, initialEvent.isSeriesEvent]);

  useEffect(() => {
    // Always fetch venue image regardless of club/association context
    fetchVenueImage();

    if (currentClub?.clubId) {
      checkMetaIntegration();
      checkYoutubeIntegration();
      fetchAttendance();
      fetchEventMedia();
      fetchEventVideos();
      fetchSkipperAvatars();
    }
  }, [currentClub, event.venue, event.skippers]);

  useEffect(() => {
    // Update event media when it changes
    setEventMedia(event.media || []);
  }, [event.media]);

  useEffect(() => {
    // Refresh media when media tab is opened
    console.log('📺 [EventDetails] Tab changed:', activeTab, 'Club:', currentClub?.clubId);
    if (activeTab === 'media' && currentClub?.clubId) {
      console.log('📺 [EventDetails] Fetching media for event:', event.id);
      fetchEventMedia();
      fetchEventVideos();
    }
    if (activeTab === 'registrations' && event.isPaid) {
      console.log('📝 [EventDetails] Fetching registrations for event:', event.id);
      loadAllRegistrations();
    }
  }, [activeTab]);

  useEffect(() => {
    // Load user registration for paid events
    if (event.isPaid && user?.id) {
      loadUserRegistration();
    }
  }, [event.id, event.isPaid, user?.id]);

  useEffect(() => {
    // Check if event has a website (for state/national events)
    const checkEventWebsite = async () => {
      if (!event.id || !event.isPublicEvent) return;

      const { eventWebsiteStorage } = await import('../utils/eventWebsiteStorage');
      const website = await eventWebsiteStorage.getEventWebsiteForEvent(event.id);
      setHasEventWebsite(!!website);
      setEventWebsiteId(website?.id || null);
    };

    checkEventWebsite();
  }, [event.id, event.isPublicEvent]);

  useEffect(() => {
    const checkSmsStatus = async () => {
      if (!currentClub?.clubId || !can('manage', 'events')) return;
      const { data: settings } = await supabase
        .from('sms_club_settings')
        .select('is_enabled')
        .eq('club_id', currentClub.clubId)
        .maybeSingle();
      setSmsEnabled(!!settings?.is_enabled);

      if (settings?.is_enabled) {
        const eventId = event.isSeriesEvent && event.seriesId
          ? `${extractDbId(event.seriesId)}__${event.roundName}`
          : extractDbId(event.id);
        const { data: existingLog } = await supabase
          .from('sms_event_logs')
          .select('id, total_sent, status')
          .eq('club_id', currentClub.clubId)
          .eq('event_id', eventId)
          .in('status', ['sending', 'completed'])
          .maybeSingle();
        if (existingLog) {
          setSmsAlreadySent(true);
          setSmsSent({ sent: existingLog.total_sent || 0, failed: 0 });
        }
      }
    };
    checkSmsStatus();
  }, [currentClub?.clubId, event.id]);

  // Fetch race report
  useEffect(() => {
    const fetchRaceReport = async () => {
      if (!event?.id) return;

      setLoadingReport(true);
      const eventType = event.isSeriesEvent ? 'race_series' : event.isPublicEvent ? 'public_event' : 'quick_race';

      const { data, error } = await supabase
        .from('race_reports')
        .select('*')
        .eq('event_id', event.id)
        .eq('event_type', eventType)
        .eq('is_published', true)
        .maybeSingle();

      if (!error && data) {
        setRaceReport(data);
      }
      setLoadingReport(false);
    };

    fetchRaceReport();
  }, [event?.id]);

  const fetchVenueImage = async () => {
    const defaultImage = 'https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1';
    try {
      if (event.isExternalEvent) {
        const classImage = getBoatClassImage(event.raceClass as string);
        setVenueImage(classImage || defaultImage);
        return;
      }

      if (!event.venue) return;

      try {
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('*')
          .eq('name', event.venue)
          .maybeSingle();

        if (venueData && !venueError) {
          setVenueDetails(venueData);
          if (venueData.image) {
            setVenueImage(venueData.image);
            return;
          }
        }
      } catch (venueErr) {
        console.warn('Could not fetch venue from database, trying local storage:', venueErr);
      }

      const venues = await getStoredVenues();
      const venue = venues.find(v => v.name === event.venue);

      if (venue) {
        setVenueDetails(venue);
        if (venue.image) {
          setVenueImage(venue.image);
        } else {
          setVenueImage(defaultImage);
        }
      } else {
        setVenueImage(defaultImage);
      }
    } catch (err) {
      console.error('Error fetching venue image:', err);
      setVenueImage(defaultImage);
    }
  };

  const checkMetaIntegration = async () => {
    try {
      // Check if the club has a Meta integration
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('club_id', currentClub?.clubId)
        .eq('platform', 'facebook')
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setMetaConnected(true);
        setMetaPageName(data.credentials?.page_name || '');
        setMetaPageId(data.credentials?.page_id || '');
      } else {
        setMetaConnected(false);
      }
    } catch (err) {
      console.error('Error checking Meta integration:', err);
    }
  };

  const checkYoutubeIntegration = async () => {
    try {
      // Check if the club has a YouTube integration
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('club_id', currentClub?.clubId)
        .eq('platform', 'youtube')
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setYoutubeConnected(true);
        setYoutubeChannelId(data.credentials?.channel_id || '');
      } else {
        setYoutubeConnected(false);
      }
    } catch (err) {
      console.error('Error checking YouTube integration:', err);
    }
  };

  const fetchEventMedia = async () => {
    try {
      if (!event.id || !currentClub?.clubId) return;

      // Extract the database UUID from the event ID
      const dbEventId = extractDbId(event.id);

      // Determine event type and ID for database query
      let eventRefType: string;
      let eventRefId: string = dbEventId;

      if (event.isSeriesEvent) {
        eventRefType = 'race_series';
        eventRefId = event.seriesId ? extractDbId(event.seriesId) : dbEventId;
      } else if (event.isPublicEvent) {
        eventRefType = 'public_event';
      } else {
        eventRefType = 'quick_race';
      }

      // For round events (composite IDs) or series rounds, use event_name instead of event_ref_id
      const isRoundEvent = event.id.includes('-round-') || event.isSeriesEvent;

      let query = supabase
        .from('event_media')
        .select('*')
        .eq('club_id', currentClub?.clubId)
        .eq('media_type', 'image')
        .eq('is_homepage_media', false);

      if (isRoundEvent) {
        // Match by event_name for rounds
        const eventName = event.eventName || event.clubName || event.roundName;
        console.log('🔍 [fetchEventMedia] Querying media for round:', {
          eventId: event.id,
          isSeriesEvent: event.isSeriesEvent,
          eventName,
          eventEventName: event.eventName,
          eventClubName: event.clubName,
          eventRoundName: event.roundName
        });
        if (eventName) {
          query = query.eq('event_name', eventName);
        }
      } else {
        // Match by event_ref_id for regular events
        console.log('🔍 [fetchEventMedia] Querying media for regular event:', {
          eventId: event.id,
          eventRefId
        });
        query = query.eq('event_ref_id', eventRefId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('❌ [fetchEventMedia] Error:', error);
        throw error;
      }

      console.log('✅ [fetchEventMedia] Found media:', data?.length || 0, 'items');
      if (data && data.length > 0) {
        console.log('✅ [fetchEventMedia] First item:', data[0]);
      }

      setEventMedia(data || []);
    } catch (err) {
      console.error('Error fetching event media:', err);
    }
  };

  const fetchEventVideos = async () => {
    try {
      if (!event.id || !currentClub?.clubId) return;

      // Extract the database UUID from the event ID
      const dbEventId = extractDbId(event.id);

      // Determine event type and ID for database query
      let eventRefType: string;
      let eventRefId: string = dbEventId;

      if (event.isSeriesEvent) {
        eventRefType = 'race_series';
        eventRefId = event.seriesId ? extractDbId(event.seriesId) : dbEventId;
      } else if (event.isPublicEvent) {
        eventRefType = 'public_event';
      } else {
        eventRefType = 'quick_race';
      }

      // For round events (composite IDs) or series rounds, use event_name instead of event_ref_id
      const isRoundEvent = event.id.includes('-round-') || event.isSeriesEvent;

      let query = supabase
        .from('event_media')
        .select('*')
        .eq('club_id', currentClub?.clubId)
        .eq('media_type', 'youtube_video')
        .eq('is_homepage_media', false);

      if (isRoundEvent) {
        // Match by event_name for rounds
        const eventName = event.eventName || event.clubName || event.roundName;
        if (eventName) {
          query = query.eq('event_name', eventName);
        }
      } else {
        // Match by event_ref_id for regular events
        query = query.eq('event_ref_id', eventRefId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setEventVideos(data || []);
    } catch (err) {
      console.error('Error fetching event videos:', err);
    }
  };

  const fetchYoutubeVideos = async () => {
    if (!youtubeConnected) return;
    
    try {
      setLoadingVideos(true);
      
      // Simulate fetching YouTube videos from the connected channel
      // In a real implementation, this would call the YouTube API
      const mockVideos: YouTubeVideo[] = [
        {
          id: 'dQw4w9WgXcQ',
          title: 'Summer Regatta 2024 - Race Highlights',
          description: 'Highlights from our summer regatta featuring close racing in the 10R class',
          thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
          published_at: '2024-12-01T10:00:00Z',
          duration: 'PT5M30S'
        },
        {
          id: 'jNQXAC9IVRw',
          title: 'IOM Championship Final',
          description: 'The thrilling final race of our IOM championship series',
          thumbnail_url: 'https://img.youtube.com/vi/jNQXAC9IVRw/maxresdefault.jpg',
          published_at: '2024-11-15T14:30:00Z',
          duration: 'PT8M15S'
        },
        {
          id: 'M7lc1UVf-VE',
          title: 'Club Training Session - Light Winds',
          description: 'Training session focusing on light wind sailing techniques',
          thumbnail_url: 'https://img.youtube.com/vi/M7lc1UVf-VE/maxresdefault.jpg',
          published_at: '2024-10-20T09:00:00Z',
          duration: 'PT12M45S'
        }
      ];
      
      setYoutubeVideos(mockVideos);
    } catch (err) {
      console.error('Error fetching YouTube videos:', err);
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleAddYoutubeVideo = async (video: YouTubeVideo) => {
    try {
      if (!currentClub?.clubId || !event.id) return;

      // Create event media record
      const { data, error } = await supabase
        .from('event_media')
        .insert({
          club_id: currentClub.clubId,
          media_type: 'youtube_video',
          url: video.id,
          thumbnail_url: video.thumbnail_url,
          title: video.title,
          description: video.description,
          event_ref_id: event.id,
          event_ref_type: event.isSeriesEvent ? 'race_series' : 'quick_race',
          event_name: event.eventName || event.clubName,
          race_class: event.raceClass
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh event videos
      await fetchEventVideos();
      
      // Notify parent component
      if (onEventDataUpdated) {
        onEventDataUpdated(event.id);
      }
    } catch (err) {
      console.error('Error adding YouTube video:', err);
    }
  };

  const handleRemoveVideo = async (videoId: string) => {
    try {
      const { error } = await supabase
        .from('event_media')
        .delete()
        .eq('id', videoId);

      if (error) throw error;

      // Refresh event videos
      await fetchEventVideos();
      
      // Notify parent component
      if (onEventDataUpdated) {
        onEventDataUpdated(event.id);
      }
    } catch (err) {
      console.error('Error removing video:', err);
    }
  };

  const fetchAttendance = async () => {
    if (!user?.id || !event.id) return;

    try {
      setLoadingAttendance(true);
      setError(null);

      // Extract the database UUID from the event ID
      const dbEventId = extractDbId(event.id);

      let query;

      if (event.isSeriesEvent) {
        // For series events, query by series_id
        const seriesId = event.seriesId ? extractDbId(event.seriesId) : dbEventId;

        if (event.roundName) {
          // Query for specific round attendance
          query = supabase
            .from('event_attendance')
            .select('id, status, user_id')
            .eq('series_id', seriesId)
            .eq('round_name', event.roundName);
        } else {
          // Query for general series attendance
          query = supabase
            .from('event_attendance')
            .select('id, status, user_id')
            .eq('series_id', seriesId)
            .is('round_name', null);
        }
      } else {
        // For quick races and public events, query by event_id
        query = supabase
          .from('event_attendance')
          .select('id, status, user_id')
          .eq('event_id', dbEventId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Also fetch all registrations for this event (except cancelled)
      let registrationsData: any[] = [];
      if (event.isPaid) {
        const { data: regData, error: regError } = await supabase
          .from('event_registrations')
          .select('user_id, payment_status, status, guest_first_name, guest_last_name, registration_type')
          .eq('event_id', dbEventId)
          .neq('status', 'cancelled');

        if (!regError && regData) {
          registrationsData = regData;
        }
      }

      // Get current user's attendance status
      const userAttendance = data?.find(record => record.user_id === user.id);
      if (userAttendance) {
        setAttendanceStatus(userAttendance.status);
      }

      // Combine attendance and registration user IDs (filter out nulls for guest registrations)
      const attendanceUserIds = data?.map(record => record.user_id).filter(Boolean) || [];
      const registrationUserIds = registrationsData.map(record => record.user_id).filter(Boolean);
      const allUserIds = [...new Set([...attendanceUserIds, ...registrationUserIds])];

      if (allUserIds.length > 0) {
        // Get member information and profiles for these users in a single query
        // For public events, members may be from different clubs, so don't filter by club_id
        const memberQuery = supabase
          .from('members')
          .select('user_id, first_name, last_name, avatar_url')
          .in('user_id', allUserIds);

        // Only filter by club_id for non-public events
        if (!event.isPublicEvent && currentClub?.clubId) {
          memberQuery.eq('club_id', currentClub.clubId);
        }

        const { data: memberData, error: memberError } = await memberQuery;

        if (memberError) throw memberError;

        // Get profile information for these users to get avatar URLs
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', allUserIds);

        if (profileError) throw profileError;

        // Create a map of user_id to avatar_url
        const avatarMap: Record<string, string> = {};
        if (profileData) {
          profileData.forEach(profile => {
            if (profile.id && profile.avatar_url) {
              avatarMap[profile.id] = profile.avatar_url;
            }
          });
        }

        // Create a map of user_id to member data for quick lookups
        const memberMap: Record<string, { first_name: string, last_name: string }> = {};
        if (memberData) {
          memberData.forEach(member => {
            if (member.user_id) {
              memberMap[member.user_id] = {
                first_name: member.first_name || '',
                last_name: member.last_name || ''
              };
            }
          });
        }

        // Create attendance map for quick lookup
        const attendanceMap = new Map<string, { status: string; id: string }>();
        data?.forEach(attendance => {
          attendanceMap.set(attendance.user_id, { status: attendance.status, id: attendance.id });
        });

        // Combine attendance and member data, including paid registrants
        const formattedAttendees = allUserIds.map(userId => {
          const memberInfo = memberMap[userId];
          let name = 'Unknown';

          if (memberInfo) {
            name = `${memberInfo.first_name} ${memberInfo.last_name}`.trim();
          } else if (userId === user.id) {
            // If this is the current user but we don't have member data
            name = user.user_metadata?.first_name && user.user_metadata?.last_name
              ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
              : user.email || 'You';
          }

          // Check if this user has paid registration
          const hasPaidRegistration = registrationUserIds.includes(userId);

          // If they have attendance record, use that status
          // If they have paid registration but no attendance, show as "yes"
          const attendance = attendanceMap.get(userId);
          const status = attendance ? attendance.status : (hasPaidRegistration ? 'yes' : 'no');

          return {
            id: attendance?.id || `reg-${userId}`,
            name,
            status: status as 'yes' | 'no' | 'maybe',
            avatarUrl: avatarMap[userId]
          };
        });

        // Add guest registrations (those without user_id)
        const guestRegistrations = registrationsData
          .filter(reg => reg.registration_type === 'guest' && !reg.user_id)
          .map((reg, index) => ({
            id: `guest-${index}`,
            name: `${reg.guest_first_name || ''} ${reg.guest_last_name || ''}`.trim() || 'Guest',
            status: 'yes' as 'yes' | 'no' | 'maybe',
            avatarUrl: undefined
          }));

        const allAttendees = [...formattedAttendees, ...guestRegistrations];

        setAttendees([...allAttendees, ...(await fetchEmailAnswerAttendees())]);
      } else {
        // No member user IDs, but check for guest registrations
        const guestRegistrations = registrationsData
          .filter(reg => reg.registration_type === 'guest' && !reg.user_id)
          .map((reg, index) => ({
            id: `guest-${index}`,
            name: `${reg.guest_first_name || ''} ${reg.guest_last_name || ''}`.trim() || 'Guest',
            status: 'yes' as 'yes' | 'no' | 'maybe',
            avatarUrl: undefined
          }));

        setAttendees([...guestRegistrations, ...(await fetchEmailAnswerAttendees())]);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // Answers from What's On emails by members who are not on AlfiePRO yet (they have no login,
  // so they can't be in event_attendance). Missing table or no access: nothing extra is shown.
  const fetchEmailAnswerAttendees = async (): Promise<{ id: string; name: string; status: 'yes' | 'no' | 'maybe'; avatarUrl?: string }[]> => {
    try {
      let q = supabase
        .from('whats_on_answers')
        .select('id, status, members(first_name, last_name, avatar_url)');
      if (event.isSeriesEvent) {
        const seriesId = event.seriesId ? extractDbId(event.seriesId) : extractDbId(event.id);
        q = event.roundName ? q.eq('series_id', seriesId).eq('round_name', event.roundName) : q.eq('series_id', seriesId).is('round_name', null);
      } else {
        q = q.eq('event_id', extractDbId(event.id));
      }
      const { data, error } = await q;
      if (error || !data) return [];
      return (data as any[]).map(r => ({
        id: `wo-${r.id}`,
        name: `${r.members?.first_name || ''} ${r.members?.last_name || ''}`.trim() || 'Member',
        status: r.status,
        avatarUrl: r.members?.avatar_url || undefined,
      }));
    } catch {
      return [];
    }
  };

  const fetchSkipperAvatars = async () => {
    if (!event.skippers || event.skippers.length === 0 || !currentClub?.clubId) return;

    try {
      // Get skipper names
      const skipperNames = event.skippers.map(s => s.name);

      // Fetch members who match these names (including their avatar_url from members table)
      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('first_name, last_name, user_id, avatar_url')
        .eq('club_id', currentClub.clubId);

      if (membersError) throw membersError;

      if (!membersData || membersData.length === 0) return;

      // Build avatar map from members table first
      const avatarMap: Record<string, string> = {};
      const memberUserIds: string[] = [];
      const nameToUserId: Record<string, string> = {};

      membersData.forEach(member => {
        const fullName = `${member.first_name} ${member.last_name}`.trim();
        if (skipperNames.includes(fullName)) {
          // Use avatar from members table if available
          if (member.avatar_url) {
            avatarMap[fullName] = member.avatar_url;
          }
          // Track user_id for profile lookup as fallback
          if (member.user_id) {
            memberUserIds.push(member.user_id);
            nameToUserId[fullName] = member.user_id;
          }
        }
      });

      // Fetch avatar URLs from profiles table for members that don't have one in members table
      if (memberUserIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', memberUserIds);

        if (!profilesError && profilesData) {
          profilesData.forEach(profile => {
            if (profile.avatar_url) {
              // Find the skipper name for this user_id
              const skipperName = Object.keys(nameToUserId).find(
                name => nameToUserId[name] === profile.id
              );
              // Only use profile avatar if member doesn't already have one
              if (skipperName && !avatarMap[skipperName]) {
                avatarMap[skipperName] = profile.avatar_url;
              }
            }
          });
        }
      }

      setSkipperAvatars(avatarMap);
    } catch (err) {
      console.error('Error fetching skipper avatars:', err);
    }
  };

  // Load user's registration for paid events
  const loadUserRegistration = async () => {
    if (!user?.id || !event.id || !event.isPaid) {
      return;
    }

    try {
      setLoadingRegistration(true);
      const dbEventId = extractDbId(event.id);

      const { data, error } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', dbEventId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error loading registration:', error);
        return;
      }

      setUserRegistration(data);

      // If user has a confirmed registration, ensure their attendance is set to "yes"
      if (data && (data.payment_status === 'paid' || data.payment_status === 'pay_at_event')) {
        // Update attendance to "yes" if it's not already
        await ensureAttendanceIsYes(dbEventId);
        // Reload attendees to show the registered user
        fetchAttendance();
      }
    } catch (err) {
      console.error('Error loading registration:', err);
    } finally {
      setLoadingRegistration(false);
    }
  };

  // Load all registrations for race officers (paid events)
  const loadAllRegistrations = async () => {
    if (!event.id || !event.isPaid) return;

    try {
      setLoadingAllRegistrations(true);
      const dbEventId = extractDbId(event.id);

      // First, get all registrations
      const { data: registrations, error } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', dbEventId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading all registrations:', error);
        return;
      }

      if (!registrations || registrations.length === 0) {
        setAllRegistrations([]);
        return;
      }

      // Get unique user IDs from registrations
      const userIds = [...new Set(registrations.map(r => r.user_id).filter(Boolean))];

      // Fetch member data for these users
      const { data: members } = await supabase
        .from('members')
        .select('user_id, first_name, last_name, avatar_url')
        .in('user_id', userIds);

      // Fetch profile data for avatars
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, avatar_url')
        .in('id', userIds);

      // Create lookup maps
      const memberMap = new Map(members?.map(m => [m.user_id, m]) || []);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Enhance registrations with member and profile data
      const enhancedRegistrations = registrations.map(reg => {
        const member = memberMap.get(reg.user_id);
        const profile = profileMap.get(reg.user_id);

        return {
          ...reg,
          member: member || null,
          profile: profile || null
        };
      });

      setAllRegistrations(enhancedRegistrations);
    } catch (err) {
      console.error('Error loading all registrations:', err);
    } finally {
      setLoadingAllRegistrations(false);
    }
  };

  // Subscribe to realtime updates for event registrations
  useEffect(() => {
    if (!user?.id || !event.id || !event.isPaid) return;

    const dbEventId = extractDbId(event.id);

    // Subscribe to changes in event_registrations for this user and event
    const subscription = supabase
      .channel(`event-registration-${dbEventId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'event_registrations',
          filter: `event_id=eq.${dbEventId},user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Registration updated:', payload);
          // Reload registration data when payment status changes
          loadUserRegistration();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, event.id, event.isPaid]);

  // Check if a livestream session exists for this event
  useEffect(() => {
    const checkLivestreamSession = async () => {
      if (!event.id || !event.enableLiveStream) {
        setCheckingLivestream(false);
        return;
      }

      try {
        // For series rounds, use the FULL event ID (e.g., "uuid-round-2")
        // This ensures each round has its own independent livestream session
        const eventIdToCheck = event.id;

        console.log('🔍 [EventDetails] Checking livestream session for:', {
          eventId: eventIdToCheck,
          eventName: event.eventName,
          isSeriesEvent: event.isSeriesEvent,
          roundName: event.roundName
        });

        // Check for livestream session using the full event ID
        const { data, error } = await supabase
          .from('livestream_sessions')
          .select('id')
          .eq('event_id', eventIdToCheck)
          .maybeSingle();

        console.log('🔍 [EventDetails] Livestream session check result:', {
          hasSession: !!data,
          sessionId: data?.id,
          error: error?.message
        });

        if (!error && data) {
          setHasLivestreamSession(true);
        } else {
          setHasLivestreamSession(false);
        }
      } catch (err) {
        console.error('Error checking livestream session:', err);
        setHasLivestreamSession(false);
      } finally {
        setCheckingLivestream(false);
      }
    };

    checkLivestreamSession();
  }, [event.id, event.enableLiveStream]);

  // Helper function to ensure attendance is set to "yes" for registered users
  const ensureAttendanceIsYes = async (dbEventId: string) => {
    if (!user?.id || !currentClub?.clubId) return;

    try {
      // Check if attendance record exists
      let query = supabase
        .from('event_attendance')
        .select('id, status')
        .eq('user_id', user.id);

      if (event.isSeriesEvent && event.seriesId) {
        const seriesId = extractDbId(event.seriesId);
        if (event.roundName) {
          query = query.eq('series_id', seriesId).eq('round_name', event.roundName);
        } else {
          query = query.eq('series_id', seriesId).is('round_name', null);
        }
      } else {
        query = query.eq('event_id', dbEventId);
      }

      const { data: existingAttendance } = await query.maybeSingle();

      if (existingAttendance) {
        // Update existing attendance to "yes" if it's not already
        if (existingAttendance.status !== 'yes') {
          await supabase
            .from('event_attendance')
            .update({ status: 'yes' })
            .eq('id', existingAttendance.id);

          setAttendanceStatus('yes');
          // Reload attendance list to reflect the change
          fetchAttendance();
        } else {
          setAttendanceStatus('yes');
        }
      } else {
        // Create new attendance record with "yes" status
        const attendanceData: any = {
          user_id: user.id,
          club_id: currentClub.clubId,
          status: 'yes'
        };

        if (event.isSeriesEvent && event.seriesId) {
          attendanceData.series_id = extractDbId(event.seriesId);
          if (event.roundName) {
            attendanceData.round_name = event.roundName;
          }
        } else {
          attendanceData.event_id = dbEventId;
        }

        await supabase
          .from('event_attendance')
          .insert([attendanceData]);

        setAttendanceStatus('yes');
        // Reload attendance list to reflect the change
        fetchAttendance();
      }
    } catch (err) {
      console.error('Error ensuring attendance is yes:', err);
    }
  };

  const handleSendSms = async () => {
    if (!currentClub?.clubId || smsSending) return;
    setSmsSending(true);
    setSmsSent(null);
    try {
      const eventId = event.isSeriesEvent && event.seriesId
        ? `${extractDbId(event.seriesId)}__${event.roundName}`
        : extractDbId(event.id);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-event-sms`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          club_id: currentClub.clubId,
          event_id: eventId,
          event_name: event.eventName || event.seriesName || 'Club Race',
          event_date: event.raceDate || '',
          boat_class: event.raceClass || '',
          venue: event.raceVenue || '',
          trigger_type: 'manual',
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to send SMS');
      }
      setSmsSent({ sent: result.sent || 0, failed: result.failed || 0 });
      setSmsAlreadySent(true);
    } catch (err: any) {
      setSmsSent({ sent: 0, failed: -1 });
      console.error('SMS send error:', err.message);
    } finally {
      setSmsSending(false);
    }
  };

  const updateAttendance = async (status: 'yes' | 'no' | 'maybe') => {
    if (!user?.id || !event.id) return;

    // If event is paid and user clicks "Yes", show registration modal
    if (status === 'yes' && event.isPaid && event.entryFee && event.entryFee > 0) {
      setShowRegistrationModal(true);
      return;
    }

    try {
      setUpdatingAttendance(true);
      setError(null);

      // Extract the database UUID from the event ID
      const dbEventId = extractDbId(event.id);
      
      let attendanceData: any = {
        user_id: user.id,
        status: status,
        club_id: currentClub?.clubId
      };

      if (event.isSeriesEvent) {
        const seriesId = event.seriesId ? extractDbId(event.seriesId) : dbEventId;
        attendanceData.series_id = seriesId;

        if (event.roundName) {
          attendanceData.round_name = event.roundName;
        }
      } else {
        // For quick races and public events
        attendanceData.event_id = dbEventId;
      }

      // Check if attendance record already exists
      let existingQuery;
      
      if (event.isSeriesEvent) {
        const seriesId = event.seriesId ? extractDbId(event.seriesId) : dbEventId;
        
        if (event.roundName) {
          existingQuery = supabase
            .from('event_attendance')
            .select('id')
            .eq('series_id', seriesId)
            .eq('round_name', event.roundName)
            .eq('user_id', user.id)
            .maybeSingle();
        } else {
          existingQuery = supabase
            .from('event_attendance')
            .select('id')
            .eq('series_id', seriesId)
            .is('round_name', null)
            .eq('user_id', user.id)
            .maybeSingle();
        }
      } else {
        existingQuery = supabase
          .from('event_attendance')
          .select('id')
          .eq('event_id', dbEventId)
          .eq('user_id', user.id)
          .maybeSingle();
      }

      const { data: existing, error: checkError } = await existingQuery;
      if (checkError) throw checkError;

      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('event_attendance')
          .update({ status })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('event_attendance')
          .insert(attendanceData);

        if (insertError) throw insertError;
      }

      // Update local state
      setAttendanceStatus(status);

      // Refresh attendees list
      fetchAttendance();

      // Notify parent that event data has been updated (for dashboard refresh)
      if (onEventDataUpdated) {
        onEventDataUpdated(event.id);
      }
    } catch (err) {
      console.error('Error updating attendance:', err);
    } finally {
      setUpdatingAttendance(false);
    }
  };

  const handleMediaChange = async (newMedia: any[]) => {
    try {
      setIsUpdatingMedia(true);

      // Update the event with the new media
      await updateEventMedia(event.id, newMedia);

      // Refresh media from database to ensure we have the latest
      await fetchEventMedia();

      // Notify parent component that event data has been updated
      if (onEventDataUpdated) {
        onEventDataUpdated(event.id);
      }
    } catch (error) {
      console.error('Error updating media:', error);
    } finally {
      setIsUpdatingMedia(false);
    }
  };

  const handleToggleCancelled = async (cancelled: boolean) => {
    setEvent(prev => ({ ...prev, cancelled, cancellationReason: cancelled ? prev.cancellationReason : undefined }));

    if (event.isSeriesEvent && event.seriesId) {
      try {
        const allSeries = await getStoredRaceSeries();
        const series = allSeries.find(s => s.id === event.seriesId);
        if (series) {
          const roundIdx = series.rounds.findIndex(
            r => r.name === event.roundName || r.roundName === event.roundName
          );
          if (roundIdx !== -1) {
            series.rounds[roundIdx] = {
              ...series.rounds[roundIdx],
              cancelled,
              cancellationReason: cancelled ? series.rounds[roundIdx].cancellationReason : undefined
            };
            await storeRaceSeries(series);
          }
        }
      } catch (err) {
        console.error('Error updating cancelled status:', err);
      }
    }
  };

  const handleCancellationReasonChange = async (reason: string) => {
    setEvent(prev => ({ ...prev, cancellationReason: reason }));

    if (event.isSeriesEvent && event.seriesId) {
      try {
        const allSeries = await getStoredRaceSeries();
        const series = allSeries.find(s => s.id === event.seriesId);
        if (series) {
          const roundIdx = series.rounds.findIndex(
            r => r.name === event.roundName || r.roundName === event.roundName
          );
          if (roundIdx !== -1) {
            series.rounds[roundIdx] = {
              ...series.rounds[roundIdx],
              cancellationReason: reason
            };
            await storeRaceSeries(series);
          }
        }
      } catch (err) {
        console.error('Error updating cancellation reason:', err);
      }
    }
  };

  const handleEditResults = () => {
    const reopenedEvent: RaceEvent = {
      ...event,
      completed: false,
    };
    setEvent(reopenedEvent);
    setShowEditResultsConfirm(false);
    if (onStartScoring) {
      onStartScoring(reopenedEvent);
    }
  };

  const handleStartScoring = async () => {
    if (startingScoring) return;
    setStartingScoring(true);
    try {
      await prepareAndStartScoring();
    } finally {
      setStartingScoring(false);
    }
  };

  const prepareAndStartScoring = async () => {
    let latestEvent = event;
    let dbHasSavedScoring = false;

    // The details view may still hold a stale or blank copy if its background refetch hasn't finished
    if (latestEvent.isSeriesEvent && latestEvent.seriesId && latestEvent.roundName && currentClub?.clubId) {
      const { data: freshRound, error: freshError } = await supabase
        .from('race_series_rounds')
        .select('id, skippers, race_results, last_completed_race, has_determined_initial_hcaps, is_manual_handicaps, heat_management, num_races, drop_rules, multi_day, number_of_days, day_results, current_day')
        .eq('series_id', latestEvent.seriesId)
        .eq('round_name', latestEvent.roundName)
        .eq('club_id', currentClub.clubId)
        .maybeSingle();

      if (freshError) {
        alert('Could not load the latest scoring for this round. Please check your connection and try again.');
        return;
      }

      if (freshRound) {
        const dbSkippers = Array.isArray(freshRound.skippers) ? freshRound.skippers : [];
        const dbResults = Array.isArray(freshRound.race_results) ? freshRound.race_results : [];
        const hasSavedScoring = dbSkippers.length > 0 && (dbResults.length > 0 || (freshRound.last_completed_race || 0) > 0 || !!freshRound.day_results);
        dbHasSavedScoring = hasSavedScoring;
        const localIsBlank = !latestEvent.skippers?.length;
        if (hasSavedScoring || localIsBlank) {
          latestEvent = {
            ...latestEvent,
            seriesRoundId: freshRound.id,
            skippers: dbSkippers.length > 0 ? dbSkippers : latestEvent.skippers || [],
            raceResults: dbResults,
            lastCompletedRace: freshRound.last_completed_race || 0,
            hasDeterminedInitialHcaps: freshRound.has_determined_initial_hcaps || false,
            isManualHandicaps: freshRound.is_manual_handicaps || false,
            heatManagement: freshRound.heat_management || latestEvent.heatManagement || null,
            numRaces: freshRound.num_races || latestEvent.numRaces,
            dropRules: freshRound.drop_rules || latestEvent.dropRules,
            multiDay: freshRound.multi_day ?? latestEvent.multiDay,
            numberOfDays: freshRound.number_of_days || latestEvent.numberOfDays,
            dayResults: freshRound.day_results || latestEvent.dayResults || {},
            currentDay: freshRound.current_day || latestEvent.currentDay || 1
          };
          setEvent(latestEvent);
        }
      }
    }

    console.log('🎯 [EventDetails handleStartScoring] Called with:');
    console.log('  - eventName:', latestEvent.eventName);
    console.log('  - isSeriesEvent:', latestEvent.isSeriesEvent);
    console.log('  - seriesId:', latestEvent.seriesId);
    console.log('  - roundName:', latestEvent.roundName);
    console.log('  - skippers:', latestEvent.skippers?.length || 0);
    console.log('  - nextDay:', nextDay);
    console.log('  - multiDay:', latestEvent.multiDay);
    console.log('  - Full skippers array:', latestEvent.skippers);

    // For series rounds, ensure skippers are saved to race_series_rounds table before starting scoring
    // Skip when the round already holds saved scoring: latestEvent was just loaded from it, so re-saving only adds delay
    if (!dbHasSavedScoring && latestEvent.isSeriesEvent && latestEvent.seriesId && latestEvent.roundName && latestEvent.skippers && latestEvent.skippers.length > 0 && currentClub?.clubId) {
      console.log('🎯 [handleStartScoring] Saving series round skippers to race_series_rounds table before scoring');
      try {
        // Check if round already exists
        const { data: existingRound, error: fetchError } = await supabase
          .from('race_series_rounds')
          .select('id, round_index')
          .eq('series_id', latestEvent.seriesId)
          .eq('round_name', latestEvent.roundName)
          .eq('club_id', currentClub.clubId)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching series round:', fetchError);
        } else {
          const roundData = {
            series_id: latestEvent.seriesId,
            club_id: currentClub.clubId,
            round_name: latestEvent.roundName,
            date: latestEvent.date,
            venue: latestEvent.venue,
            race_class: latestEvent.raceClass,
            race_format: latestEvent.raceFormat,
            skippers: latestEvent.skippers,
            race_results: latestEvent.raceResults || [],
            last_completed_race: latestEvent.lastCompletedRace || 0,
            has_determined_initial_hcaps: latestEvent.hasDeterminedInitialHcaps || false,
            is_manual_handicaps: latestEvent.isManualHandicaps || false,
            heat_management: latestEvent.heatManagement || null,
            num_races: latestEvent.numRaces || 12,
            drop_rules: latestEvent.dropRules || [4, 8, 16, 24, 32, 40]
          };

          if (existingRound) {
            // Update existing round
            const { error: updateError } = await supabase
              .from('race_series_rounds')
              .update(roundData)
              .eq('id', existingRound.id);

            if (updateError) {
              console.error('Error updating series round:', updateError);
            } else {
              console.log('✅ [handleStartScoring] Successfully updated skippers in race_series_rounds');
            }
          } else {
            // Create new round
            const { data: maxIndexData } = await supabase
              .from('race_series_rounds')
              .select('round_index')
              .eq('series_id', latestEvent.seriesId)
              .order('round_index', { ascending: false })
              .limit(1)
              .maybeSingle();

            const nextIndex = (maxIndexData?.round_index || 0) + 1;

            const { error: insertError } = await supabase
              .from('race_series_rounds')
              .insert({
                ...roundData,
                round_index: nextIndex
              });

            if (insertError) {
              console.error('Error inserting series round:', insertError);
            } else {
              console.log('✅ [handleStartScoring] Successfully created round in race_series_rounds with skippers');
            }
          }
        }
      } catch (err) {
        console.error('Error saving series round skippers:', err);
      }
    }

    // For multi-day events, update the currentDay to the next day that needs scoring
    const eventToStart = latestEvent.multiDay ? {
      ...latestEvent,
      currentDay: nextDay
    } : latestEvent;

    console.log('🎯 Setting currentEvent with currentDay:', eventToStart.currentDay);
    console.log('🎯 EventDetails: Saving to localStorage:', {
      eventName: eventToStart.eventName,
      skippers: eventToStart.skippers?.length || 0,
      hasSkippersArray: Array.isArray(eventToStart.skippers),
      lastCompletedRace: eventToStart.lastCompletedRace
    });

    // Save the current event to localStorage so YachtRaceManager can load it
    setCurrentEvent(eventToStart);

    // Also update the database with the new currentDay for multi-day events
    if (event.multiDay && currentClub?.clubId) {
      try {
        const dbId = extractDbId(event.id);

        // Determine the correct table based on event type
        let tableName = 'quick_races';
        if (event.isSeriesEvent) {
          tableName = 'race_series';
        } else if (event.isPublicEvent) {
          tableName = 'public_events';
        }

        console.log('🎯 Updating database table:', tableName, 'with current_day:', nextDay, 'for id:', dbId);

        const { data, error } = await supabase
          .from(tableName)
          .update({ current_day: nextDay })
          .eq('id', dbId)
          .eq('club_id', currentClub.clubId);

        if (error) {
          console.error('🎯 Database update error:', error);
        } else {
          console.log('🎯 Database updated successfully');
        }
      } catch (error) {
        console.error('Error updating current day in database:', error);
        // Continue anyway - localStorage update is sufficient for immediate use
      }
    }

    if (onStartScoring) {
      console.log('🎯 [EventDetails] Calling onStartScoring with event:', {
        eventName: eventToStart.eventName,
        skippers: eventToStart.skippers?.length || 0,
        lastCompletedRace: eventToStart.lastCompletedRace,
        fullEventToStart: eventToStart
      });
      console.log('🎯 [EventDetails] About to call onStartScoring function');
      onStartScoring(eventToStart);
      console.log('🎯 [EventDetails] onStartScoring function returned');
    }
  };

  // Helper function to extract YouTube video ID from URL
  const getYouTubeVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Determine button text based on whether skippers have been added and multi-day status
  const shouldShowContinueScoring = hasParticipants;

  // For multi-day events, determine which day to score next
  const getNextDayToScore = (): number => {
    if (!event.multiDay || !event.numberOfDays) return 1;

    const dayResults = event.dayResults || {};
    console.log('📅 getNextDayToScore: Checking dayResults:', dayResults);

    for (let day = 1; day <= event.numberOfDays; day++) {
      const dayData = dayResults[day];
      console.log(`📅 getNextDayToScore: Day ${day}, dayData:`, dayData, 'dayCompleted:', dayData?.dayCompleted);
      // Check if day is NOT completed - this is the next day to score
      if (!dayData || dayData.dayCompleted !== true) {
        console.log(`📅 getNextDayToScore: Returning day ${day} as next day to score`);
        return day;
      }
    }
    console.log('📅 getNextDayToScore: All days completed, returning last day');
    return event.numberOfDays; // All days completed, return last day
  };

  const nextDay = event.multiDay ? getNextDayToScore() : 1;
  console.log('📅 EventDetails: nextDay calculated as:', nextDay);

  const getButtonText = (): string => {
    if (!event.multiDay) {
      return shouldShowContinueScoring ? 'Continue Scoring' : 'Start Scoring';
    }

    // Multi-day event
    const dayData = event.dayResults?.[nextDay];
    if (dayData && dayData.lastCompletedRace > 0 && dayData.dayCompleted !== true) {
      return `Continue Day ${nextDay}`;
    }
    return `Score Day ${nextDay}`;
  };

  const renderAttendeeAvatars = (filteredAttendees: typeof attendees, colorScheme: { bg: string; text: string }) => (
    <div className="flex flex-wrap gap-3">
      {filteredAttendees.map(attendee => {
        const nameParts = attendee.name.split(' ');
        const initials = nameParts.map(part => part[0]).join('');
        return (
          <div key={attendee.id} className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-0.5 overflow-hidden ${colorScheme.bg}`}>
              {attendee.avatarUrl ? (
                <img src={attendee.avatarUrl} alt={attendee.name} className="w-full h-full object-cover" />
              ) : (
                <span className={`text-sm font-semibold ${colorScheme.text}`}>{initials}</span>
              )}
            </div>
            <span className={`text-[10px] leading-tight text-center max-w-[56px] truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {attendee.name.split(' ')[0]}
            </span>
          </div>
        );
      })}
    </div>
  );

  const renderDetailsTab = () => (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN - Event Information */}
        <section className="flex flex-col gap-3">
          <p className="a-cap m-0 pl-1">Event information</p>
          <div className="a-grp a-evgrp">
            <div className="a-evrow">
              <span className="a-tile flex-shrink-0" style={{ width: 38, height: 38 }}><Calendar size={17} /></span>
              <div className="flex-1">
                <p className="a-evk">Date</p>
                <p className="a-evv">
                  {new Date(event.date).toLocaleDateString('en-GB')}
                  {event.multiDay && event.endDate && event.date !== event.endDate && (
                    <> - {new Date(event.endDate).toLocaleDateString('en-GB')}</>
                  )}
                </p>
              </div>
            </div>

            <div className="a-evrow">
              <span className="a-tile flex-shrink-0" style={{ width: 38, height: 38 }}><MapPin size={17} /></span>
              <div className="flex-1">
                <p className="a-evk">Venue</p>
                <button
                  onClick={() => onViewVenue && onViewVenue(event.venue)}
                  className="a-evv hover:underline text-left"
                >
                  {event.venue}
                </button>
              </div>
            </div>

            <div className="a-evrow">
              <span className="a-tile flex-shrink-0" style={{ width: 38, height: 38 }}><Trophy size={17} /></span>
              <div className="flex-1">
                <p className="a-evk">Race Format</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {!event.isExternalEvent && (
                    <span className={getRaceFormatBadge(event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', true).className}>
                      {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                    </span>
                  )}
                  {event.raceClass && <span className={getBoatClassBadge(event.raceClass, true).className}>{event.raceClass}</span>}
                  {event.isInterclub && <span className="a-wlvl">Interclub</span>}
                  {event.multiDay && <span className="a-wlvl a-wlvl-n">{event.numberOfDays} Days</span>}
                  {event.multiDay && event.dayResults && (
                    <span className="a-wlvl a-wlvl-n">
                      {Object.keys(event.dayResults).filter(day => {
                        const dayData = event.dayResults[day];
                        return dayData && dayData.lastCompletedRace > 0;
                      }).length}/{event.numberOfDays} done
                    </span>
                  )}
                </div>
              </div>
            </div>

            {event.isPaid && (
              <div className="a-evrow">
                <span className="a-tile flex-shrink-0" style={{ width: 38, height: 38 }}><DollarSign size={17} /></span>
                <div className="flex-1">
                  <p className="a-evk">Entry Fee</p>
                  <p className="a-evv">${event.entryFee?.toFixed(2)} AUD</p>
                </div>
              </div>
            )}

            {/* PRO Assignment Section */}
            {!event.isSeriesEvent && (
              <div className="a-evrow-wrap">
                <div className="flex items-center gap-3">
                  <span className="a-tile flex-shrink-0" style={{ width: 38, height: 38 }}><ClipboardList size={17} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="a-evk">Principal Race Officer</p>
                    {(event.proMemberName || rosteredProName) ? (
                      <div className="flex items-center gap-2">
                        <p className="a-evv truncate">{event.proMemberName || rosteredProName}</p>
                        {(isAdmin || isEditor) && event.proMemberName && (
                          <button
                            onClick={handleRemovePro}
                            disabled={assigningPro}
                            className="a-txt-r text-[12px] px-1.5 py-0.5 rounded hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ) : rosteredProName ? (
                      <p className="a-evv">{rosteredProName}</p>
                    ) : (isAdmin || isEditor) ? (
                      <button
                        onClick={() => setShowProDropdown(!showProDropdown)}
                        disabled={assigningPro}
                        className="a-link inline-flex items-center gap-1 text-[14.5px] font-medium mt-0.5"
                      >
                        <UserPlus size={14} />
                        <span>Assign PRO</span>
                        <ChevronDown size={12} className={`transition-transform ${showProDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      <p className="a-evv a-evv-dim">Not assigned</p>
                    )}
                  </div>
                </div>

                {showProDropdown && (
                  <div className="a-pop mt-2 max-h-56 overflow-auto">
                    <div className="p-2">
                      <input
                        type="text"
                        value={proSearchTerm}
                        onChange={(e) => setProSearchTerm(e.target.value)}
                        placeholder="Search members..."
                        autoFocus
                        className="a-inp w-full" style={{ height: 36 }}
                      />
                    </div>
                    {clubMembers
                      .filter(m => m.name.toLowerCase().includes(proSearchTerm.toLowerCase()))
                      .map(member => (
                        <button
                          key={member.id}
                          onClick={() => handleAssignPro(member.id, member.name)}
                          className="a-pop-item"
                        >
                          {member.name}
                        </button>
                      ))}
                    {clubMembers.filter(m => m.name.toLowerCase().includes(proSearchTerm.toLowerCase())).length === 0 && (
                      <p className="a-dim px-3 py-2 text-[13px]">No members found</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {event.isSeriesEvent && (
              <div className="a-evrow">
                <span className="a-tile flex-shrink-0" style={{ width: 38, height: 38 }}><ClipboardList size={17} /></span>
                <div className="flex-1">
                  <p className="a-evk">Principal Race Officer</p>
                  {(event.proMemberName || rosteredProName) ? (
                    <p className="a-evv">{event.proMemberName || rosteredProName}</p>
                  ) : (
                    <p className="a-evv a-evv-dim">Not assigned</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN - Registration/Attendance OR Competing Skippers */}
        <section className="flex flex-col gap-3">
          {/* External Event Registration */}
          {event.isExternalEvent && event.registrationUrl && (
            <>
              <p className="a-cap m-0 pl-1">Registration</p>
              <div className="a-grp flex items-center gap-3 flex-wrap" style={{ padding: 16 }}>
              <p className="a-mute m-0 flex-1 text-[14px]">This event is managed externally.</p>
              <a
                href={event.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="a-btn a-btn-p"
              >
                <ExternalLink size={16} />
                Register for Event
              </a>
              </div>
            </>
          )}

          {/* Competing Skippers (when skippers have been added) */}
          {skippersAdded && event.skippers && event.skippers.length > 0 && (
            <>
              <div className="flex items-center justify-between px-1">
                <p className="a-cap m-0">Competing skippers</p>
                <span className="a-mute inline-flex items-center gap-2 text-[13px]"><span className="a-cnt" style={{ background: '#0A84FF', color: '#fff', boxShadow: 'none' }}>{event.skippers.length}</span>competitor{event.skippers.length === 1 ? '' : 's'}</span>
              </div>
              <div className="a-grp grid grid-cols-3 sm:grid-cols-4" style={{ padding: 18, gap: '18px 12px' }}>
                {event.skippers.slice(0, Math.min(12, event.skippers.length)).map((skipper, index) => {
                  const nameParts = skipper.name.split(' ').filter(Boolean);
                  const initials = nameParts.map(part => part[0]).join('').slice(0, 2).toUpperCase();
                  const short = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` : skipper.name;
                  const avatarUrl = skipperAvatars[skipper.name];
                  return (
                    <div key={index} className="a-evsk" title={skipper.name}>
                      <span className="a-evskf">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span>
                      <span className="truncate max-w-full">{short}</span>
                    </div>
                  );
                })}
                {event.skippers.length > 12 && (
                  <button onClick={() => setShowAllSkippers(!showAllSkippers)} className="a-evsk">
                    <span className="a-evskf a-evskf-more">+{event.skippers.length - 12}</span>
                    <span>{showAllSkippers ? 'Show less' : 'Show all'}</span>
                  </button>
                )}
              </div>
              {showAllSkippers && event.skippers.length > 12 && (
                <div className="a-grp" style={{ padding: 12 }}>
                  <div className="grid grid-cols-2 gap-1.5">
                    {event.skippers.map((skipper, index) => {
                      const nameParts = skipper.name.split(' ');
                      const initials = nameParts.map(part => part[0]).join('');
                      const avatarUrl = skipperAvatars[skipper.name];
                      return (
                        <div key={index} className="flex items-center gap-2 p-1.5 rounded-lg">
                          <div className="a-evskf flex-shrink-0" style={{ width: 28, height: 28, fontSize: 10 }}>
                            {avatarUrl ? (
                              <img src={avatarUrl} alt={skipper.name} className="w-full h-full object-cover" />
                            ) : (
                              <>{initials}</>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="a-ink text-[12.5px] font-medium truncate">{skipper.name}</div>
                            <div className="a-dim text-[11px]">#{skipper.sailNo}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setShowAllSkippers(false)}
                    className="a-btn a-btn-sm w-full justify-center mt-2"
                  >
                    Show less
                  </button>
                </div>
              )}
            </>
          )}

          {/* Event Registration (before skippers are added, non-external) */}
          {!skippersAdded && !event.isExternalEvent && (
            <>
              <p className="a-cap m-0 pl-1">Registration</p>

              <div className="a-grp">
              <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: 16 }}>
                <span className="a-ink text-[15px] font-medium">Will you attend?</span>
                <div className="a-seg" role="radiogroup" aria-label="Will you attend?" style={{ padding: 3, borderRadius: 12 }}>
                  <button
                    onClick={() => updateAttendance('yes')}
                    disabled={updatingAttendance}
                    role="radio" aria-checked={attendanceStatus === 'yes'} className={`a-seg-i a-att-yes ${attendanceStatus === 'yes' ? 'a-seg-on' : ''} ${updatingAttendance ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ height: 34, padding: '0 12px', borderRadius: 9 }}
                  >
                    <ThumbsUp size={15} />
                    <span>Yes</span>
                  </button>
                  <button
                    onClick={() => updateAttendance('maybe')}
                    disabled={updatingAttendance}
                    role="radio" aria-checked={attendanceStatus === 'maybe'} className={`a-seg-i a-att-maybe ${attendanceStatus === 'maybe' ? 'a-seg-on' : ''} ${updatingAttendance ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ height: 34, padding: '0 12px', borderRadius: 9 }}
                  >
                    <HelpCircle size={15} />
                    <span>Maybe</span>
                  </button>
                  <button
                    onClick={() => updateAttendance('no')}
                    disabled={updatingAttendance}
                    role="radio" aria-checked={attendanceStatus === 'no'} className={`a-seg-i a-att-no ${attendanceStatus === 'no' ? 'a-seg-on' : ''} ${updatingAttendance ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ height: 34, padding: '0 12px', borderRadius: 9 }}
                  >
                    <ThumbsDown size={15} />
                    <span>No</span>
                  </button>
                </div>
              </div>

              {event.isPaid && event.entryFee && event.entryFee > 0 && userRegistration && (
                <div className={`p-3 rounded-lg border-2 mb-3 ${userRegistration.payment_status === 'paid' || userRegistration.payment_status === 'pay_at_event' ? darkMode ? 'bg-green-900/20 border-green-500/50' : 'bg-green-50 border-green-400' : darkMode ? 'bg-red-900/20 border-red-500/50' : 'bg-red-50 border-red-400'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-sm font-semibold ${userRegistration.payment_status === 'paid' || userRegistration.payment_status === 'pay_at_event' ? darkMode ? 'text-green-300' : 'text-green-700' : darkMode ? 'text-red-300' : 'text-red-700'}`}>
                        {userRegistration.payment_status === 'paid' && 'Registered & Paid'}
                        {userRegistration.payment_status === 'pay_at_event' && 'Registration Confirmed'}
                        {userRegistration.payment_status === 'unpaid' && 'Pending Payment'}
                      </h4>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {userRegistration.payment_status === 'paid' && `Paid $${userRegistration.amount_paid?.toFixed(2) || event.entryFee.toFixed(2)}`}
                        {userRegistration.payment_status === 'pay_at_event' && 'Payment due at desk'}
                        {userRegistration.payment_status === 'unpaid' && 'Complete your payment'}
                      </p>
                    </div>
                    {userRegistration.payment_status === 'unpaid' && (
                      <button onClick={() => setShowRegistrationModal(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs">
                        Pay Now
                      </button>
                    )}
                  </div>
                </div>
              )}

              {event.isPaid && event.entryFee && event.entryFee > 0 && !userRegistration && !loadingRegistration && (
                <div className={`p-3 rounded-lg border mb-3 ${darkMode ? 'bg-blue-900/20 border-blue-500/50' : 'bg-blue-50 border-blue-400'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>Entry Fee Required</h4>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>${event.entryFee.toFixed(2)} AUD</p>
                    </div>
                    <button onClick={() => setShowRegistrationModal(true)} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs">
                      Register
                    </button>
                  </div>
                </div>
              )}

              <div className="a-evatt">
                <div className="flex items-center justify-between mb-2">
                  <span className="a-ink text-[14px] font-medium">Who's attending?</span>
                  <span className="a-mute inline-flex items-center gap-2 text-[13px]">
                    <span className="a-cnt">{attendees.filter(a => a.status === 'yes').length}</span>confirmed
                  </span>
                </div>

                {attendees.length > 0 ? (
                  <div className="space-y-3">
                    {attendees.filter(a => a.status === 'yes').length > 0 && (
                      <div>
                        <h5 className="a-cap mb-2 a-txt-g">Attending</h5>
                        {renderAttendeeAvatars(
                          attendees.filter(a => a.status === 'yes'),
                          { bg: darkMode ? 'bg-green-900/30' : 'bg-green-100', text: darkMode ? 'text-green-400' : 'text-green-700' }
                        )}
                      </div>
                    )}
                    {attendees.filter(a => a.status === 'maybe').length > 0 && (
                      <div>
                        <h5 className="a-cap mb-2 a-txt-a">Maybe</h5>
                        {renderAttendeeAvatars(
                          attendees.filter(a => a.status === 'maybe'),
                          { bg: darkMode ? 'bg-amber-900/30' : 'bg-amber-100', text: darkMode ? 'text-amber-400' : 'text-amber-700' }
                        )}
                      </div>
                    )}
                    {attendees.filter(a => a.status === 'no').length > 0 && (
                      <div>
                        <h5 className="a-cap mb-2 a-txt-r">Not Attending</h5>
                        {renderAttendeeAvatars(
                          attendees.filter(a => a.status === 'no'),
                          { bg: darkMode ? 'bg-red-900/30' : 'bg-red-100', text: darkMode ? 'text-red-400' : 'text-red-700' }
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3" style={{ height: 180 }}>
                    <span className="a-tile" style={{ width: 52, height: 52 }}><Users size={22} /></span>
                    <p className="a-dim m-0 text-[14px]">No responses yet</p>
                  </div>
                )}
              </div>
              </div>

              {smsEnabled && can('manage', 'events') && (
                <div className="a-grp" style={{ padding: '12px 14px' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={14} className={darkMode ? 'text-teal-400' : 'text-teal-600'} />
                      <div>
                        <h4 className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>SMS Attendance</h4>
                        <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {smsAlreadySent ? `${smsSent?.sent || 0} sent` : 'Notify members'}
                        </p>
                      </div>
                    </div>
                    {smsAlreadySent ? (
                      <div className="flex items-center gap-1 text-green-400">
                        <CheckCircle size={14} />
                        <span className="text-[10px] font-medium">Sent</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleSendSms}
                        disabled={smsSending}
                        className="a-btn a-btn-sm disabled:opacity-50"
                      >
                        {smsSending ? <><Loader2 size={12} className="animate-spin" /> Sending...</> : <><MessageSquare size={12} /> Notify</>}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state when no registration and no skippers */}
          {!skippersAdded && event.isExternalEvent && !event.registrationUrl && (
            <div className="a-grp a-dim text-center" style={{ padding: 24 }}>
              <Users size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No registration details available</p>
            </div>
          )}
        </section>
      </div>
      
      {onStartScoring && event.completed && !event.cancelled && can('races.score') && (
        <div className="flex flex-col gap-3">
          <div className="a-grp" style={{ padding: 16 }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-green-500" />
                <span className="a-ink text-[14.5px] font-medium">
                  Results Published
                </span>
              </div>
              <button
                onClick={() => setShowEditResultsConfirm(true)}
                className="a-btn a-btn-a"
              >
                <Pencil size={16} />
                Edit Results
              </button>
            </div>
          </div>

          {showEditResultsConfirm && (
            <div className="a-grp" style={{ padding: 16, borderColor: 'rgba(255,179,64,0.4)' }}>
              <p className="a-txt-a text-[13.5px] mb-3">
                This will reopen the scoring screen so you can make changes to the results. You will need to publish the results again when you are done editing.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowEditResultsConfirm(false)}
                  className="a-btn a-btn-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditResults}
                  className="a-btn a-btn-sm a-btn-a"
                >
                  Reopen for Editing
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {onStartScoring && !event.completed && !event.cancelled && can('races.score') && (
        <div className="flex flex-col gap-3">
          {event.multiDay && event.dayResults && event.numberOfDays && (
            <div className="a-grp" style={{ padding: 16 }}>
              <div className="flex items-center justify-between gap-4 mb-3">
                <h4 className="a-ink text-[14px] font-medium">
                  Day Progress
                </h4>
                <span className="a-dim text-[12.5px]">
                  {Array.from({ length: event.numberOfDays }, (_, i) => i + 1).filter(day => {
                    const dayData = event.dayResults?.[day];
                    return dayData?.dayCompleted === true;
                  }).length} of {event.numberOfDays} completed
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: event.numberOfDays }, (_, i) => i + 1).map((day) => {
                  const dayData = event.dayResults?.[day];
                  const isCompleted = dayData?.dayCompleted === true;
                  const hasProgress = dayData && dayData.lastCompletedRace > 0;

                  return (
                    <div
                      key={day}
                      className={`a-st text-[13px] ${isCompleted ? 'a-txt-g' : hasProgress ? 'a-txt-b' : 'a-dim'}`}
                    >
                      Day {day}: {isCompleted ? 'Completed' : hasProgress ? 'In Progress' : 'Not Started'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* Action Buttons */}
          <div className="a-evfoot">
            {/* Cancel Round - Left Side (series events only) */}
            {event.isSeriesEvent && (isAdmin || isEditor) ? (
              <div className="flex flex-col gap-2">
                <label className={`flex items-center gap-3 cursor-pointer select-none text-[14px] ${event.cancelled ? 'a-txt-a' : 'a-mute'}`}>
                  <ASwitch checked={!!event.cancelled} onChange={(v) => handleToggleCancelled(v)} label="Mark as cancelled" />
                  Mark as cancelled
                </label>
                {event.cancelled && (
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={event.cancellationReason || ''}
                    onChange={(e) => handleCancellationReasonChange(e.target.value)}
                    className="a-inp" style={{ height: 36 }}
                  />
                )}
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Event Website Button - Available for all events, restricted to host club or associations */}
            {(isAdmin || isEditor) &&
             (!event.isPublicEvent ||
              (event.isPublicEvent &&
               (event.clubId === currentClub?.clubId ||
                (event.eventLevel === 'state' && currentOrganization?.type === 'state' && event.state_association_id === currentOrganization.id) ||
                (event.eventLevel === 'national' && currentOrganization?.type === 'national' && event.national_association_id === currentOrganization.id)
               )
              )
             ) && (
              <button
                onClick={() => {
                  if (hasEventWebsite) {
                    // Use the website ID if we have it, otherwise use public event ID (dashboard will look it up)
                    const idToUse = eventWebsiteId || extractDbId(event.id);
                    navigate(`/event-websites/${idToUse}`);
                  } else {
                    setShowEventWebsiteModal(true);
                  }
                }}
                className="a-btn"
                title={hasEventWebsite ? 'Manage Event Website' : 'Create Event Website'}
              >
                <Globe size={16} />
                {hasEventWebsite ? 'Event Website' : 'Create Website'}
              </button>
            )}
            {event.enableLiveTracking && (event.clubId || event.eventLevel === 'state' || event.eventLevel === 'national') && (isAdmin || isEditor) && (
              <button
                onClick={() => setShowLiveTrackingQR(true)}
                className="a-btn"
                title="Live Skipper Tracking QR Code"
              >
                <QrCode size={16} />
                Live Tracking QR
              </button>
            )}
            {event.enableLiveTracking && hasLiveTrackingEvent && user && (
              <button
                onClick={handleJoinLiveTracking}
                disabled={loadingSkipperTracking}
                className="a-btn disabled:opacity-50 disabled:cursor-not-allowed"
                title="Join Live Tracking"
              >
                {loadingSkipperTracking ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}
                Live Tracking
              </button>
            )}
            {event.enableLiveStream && (event.clubId || event.eventLevel === 'state' || event.eventLevel === 'national') && !checkingLivestream && (
              <button
                onClick={() => {
                  console.log('🎬 [EventDetails] Livestream button clicked, opening modal for:', {
                    eventId: event.id,
                    eventName: event.eventName,
                    eventDate: event.date,
                    clubId: event.clubId,
                    hasSession: hasLivestreamSession
                  });
                  setShowLivestreamModal(true);
                }}
                className={`a-btn ${hasLivestreamSession ? 'a-btn-d' : ''}`}
                title={hasLivestreamSession ? "Manage YouTube Live Stream" : "Configure YouTube Live Stream"}
              >
                <Video size={16} />
                {hasLivestreamSession ? 'Go Live - Stream' : 'Configure Stream'}
              </button>
            )}
            {/* Only show scoring button if user is from the host club (for public events) or if it's a regular club event */}
            {(!event.isPublicEvent || (event.isPublicEvent && event.clubId === currentClub?.clubId)) && (
              <>
                {!shouldShowContinueScoring && (
                  <button
                    onClick={async () => {
                      if (event.isSeriesEvent && event.seriesId) {
                        const allSeries = await getStoredRaceSeries();
                        const s = allSeries.find(sr => sr.id === event.seriesId);
                        if (s) {
                          const idParts = event.id.split('-');
                          const rIdx = parseInt(idParts[idParts.length - 1], 10);
                          setImportSeriesData(s);
                          setImportRoundIndex(isNaN(rIdx) ? 0 : rIdx);
                        }
                      } else {
                        setImportSeriesData(null);
                      }
                      setShowImportResults(true);
                    }}
                    className="a-btn"
                  >
                    <Upload size={16} />
                    Import Results
                  </button>
                )}
                <button
                  onClick={handleStartScoring}
                  disabled={startingScoring}
                  className={`a-btn a-btn-p ${startingScoring ? 'opacity-75 cursor-wait' : ''}`}
                >
                  {startingScoring ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Loading latest results...
                    </>
                  ) : getButtonText()}
                </button>
              </>
            )}
            </div>
          </div>
        </div>
      )}
      
      {onEdit && (
        <div className="flex justify-end">
          <button
            onClick={onEdit}
            className="a-btn"
          >
            Edit Event
          </button>
        </div>
      )}
    </div>
  );

  const renderDocumentsTab = () => {
    const extDocs = event.externalDocuments || [];
    const hasExternalDocs = extDocs.length > 0;
    const hasNor = event.noticeOfRaceUrl || extDocs.some((d: any) => d.type === 'nor');
    const hasSi = event.sailingInstructionsUrl || extDocs.some((d: any) => d.type === 'si');

    const getDocIcon = (doc: any) => {
      const lower = (doc.name || '').toLowerCase();
      if (lower.includes('.pdf') || doc.url?.includes('.pdf')) return 'PDF';
      if (lower.includes('.doc')) return 'DOC';
      if (lower.includes('.xls')) return 'XLS';
      return 'DOC';
    };

    const getDocColor = (doc: any) => {
      const type = doc.type || '';
      if (type === 'nor') return darkMode ? 'text-red-400' : 'text-red-600';
      if (type === 'si') return darkMode ? 'text-blue-400' : 'text-blue-600';
      if (type === 'amendment') return darkMode ? 'text-amber-400' : 'text-amber-600';
      return darkMode ? 'text-slate-400' : 'text-slate-600';
    };

    if (hasExternalDocs) {
      return (
        <div className="space-y-6">
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
            <h3 className={`text-lg font-medium mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Event Documents
            </h3>
            <div className="space-y-3">
              {extDocs.map((doc: any, idx: number) => (
                <a
                  key={idx}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`
                    flex items-center justify-between p-4 rounded-lg border transition-all group
                    ${darkMode
                      ? 'bg-slate-800 border-slate-700 hover:border-blue-500/50 hover:bg-slate-800/80'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold
                      ${doc.type === 'nor'
                        ? darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-600'
                        : doc.type === 'si'
                        ? darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                        : doc.type === 'amendment'
                        ? darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600'
                        : darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-100 text-slate-600'
                      }
                    `}>
                      {getDocIcon(doc)}
                    </div>
                    <div>
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {doc.name}
                      </p>
                      <p className={`text-xs ${getDocColor(doc)}`}>
                        {doc.type === 'nor' ? 'Notice of Race' : doc.type === 'si' ? 'Sailing Instructions' : doc.type === 'amendment' ? 'Amendment' : 'Document'}
                      </p>
                    </div>
                  </div>
                  <div className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${darkMode
                      ? 'bg-blue-600/20 text-blue-400 group-hover:bg-blue-600/30'
                      : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'}
                  `}>
                    <ExternalLink size={14} />
                    View
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const norUrl = event.noticeOfRaceUrl || savedDocs.nor;
    const siUrl = event.sailingInstructionsUrl || savedDocs.si;
    const extraDocs = (event.additionalDocuments && event.additionalDocuments.length > 0 ? event.additionalDocuments : savedDocs.extra).filter(d => d && d.url);
    const docRows: Array<{ key: string; name: string; kind: string; url?: string; tone: string }> = [
      { key: 'nor', name: 'Notice of Race', kind: norUrl ? 'PDF document' : 'Not added yet', url: norUrl, tone: 'r' },
      { key: 'si', name: 'Sailing Instructions', kind: siUrl ? 'PDF document' : 'Not added yet', url: siUrl, tone: 'b' },
      ...extraDocs.map((d, i) => ({ key: `x${i}`, name: d.name || 'Document', kind: 'Additional document', url: d.url, tone: 'n' })),
    ];

    return (
      <div className="a-card a-evdocs">
        <div className="flex items-center gap-3 mb-3">
          <span className="a-tile a-tile-sm"><FileText size={16} /></span>
          <h3 className="a-display a-ink text-[16px] font-semibold flex-1">Event documents</h3>
          <span className="a-cnt">{docRows.filter(r => r.url).length}</span>
        </div>
        <div className="flex flex-col">
          {docRows.map(row => (
            row.url ? (
              <a key={row.key} href={row.url} target="_blank" rel="noopener noreferrer" className="a-evdoc">
                <span className={`a-evdoc-ic a-evdoc-${row.tone}`}>PDF</span>
                <span className="min-w-0 flex-1">
                  <span className="block a-ink text-[14.5px] font-semibold truncate">{row.name}</span>
                  <span className="block a-dim text-[12.5px]">{row.kind}</span>
                </span>
                <span className="a-btn" style={{ height: 34, padding: '0 12px', fontSize: 13 }}><ExternalLink size={14} />View</span>
              </a>
            ) : (
              <div key={row.key} className="a-evdoc a-evdoc-empty">
                <span className="a-evdoc-ic a-evdoc-n"><FileText size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block a-mute text-[14.5px] font-semibold truncate">{row.name}</span>
                  <span className="block a-dim text-[12.5px]">{row.kind}</span>
                </span>
              </div>
            )
          ))}
        </div>
      </div>
    );
  };

  const renderRegistrationsTab = () => {
    const handleMarkAsPaid = async (registrationId: string) => {
      console.log('💰 [handleMarkAsPaid] Called with:', { registrationId, clubId: currentClub?.clubId });

      if (!currentClub?.clubId) {
        console.log('⚠️ [handleMarkAsPaid] No club ID, returning');
        return;
      }

      try {
        console.log('💰 [handleMarkAsPaid] Updating registration...');
        const { error } = await supabase
          .from('event_registrations')
          .update({
            payment_status: 'paid',
            status: 'confirmed',
            updated_at: new Date().toISOString()
          })
          .eq('id', registrationId);

        if (error) {
          console.error('❌ [handleMarkAsPaid] Update error:', error);
          throw error;
        }

        console.log('✅ [handleMarkAsPaid] Successfully updated, reloading...');
        // Reload registrations
        await loadAllRegistrations();

        console.log('✅ [handleMarkAsPaid] Complete! Finance transaction created automatically by trigger.');
      } catch (err) {
        console.error('Error marking as paid:', err);
      }
    };

    return (
      <div className="space-y-6">
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Event Registrations
          </h3>

          {loadingAllRegistrations ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : allRegistrations.length === 0 ? (
            <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              No registrations yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`w-full ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                <thead>
                  <tr className={`border-b ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                    <th className="text-left py-3 px-2 font-semibold">Skipper</th>
                    <th className="text-left py-3 px-2 font-semibold">Boat</th>
                    <th className="text-left py-3 px-2 font-semibold">Amount</th>
                    <th className="text-left py-3 px-2 font-semibold">Payment Method</th>
                    <th className="text-left py-3 px-2 font-semibold">Status</th>
                    <th className="text-left py-3 px-2 font-semibold">Date</th>
                    <th className="text-center py-3 px-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allRegistrations.map((reg) => {
                    // Get name from member data, guest data, or profile data
                    let memberName = 'Unknown';
                    if (reg.member) {
                      memberName = `${reg.member.first_name} ${reg.member.last_name}`.trim();
                    } else if (reg.guest_first_name && reg.guest_last_name) {
                      memberName = `${reg.guest_first_name} ${reg.guest_last_name}`.trim();
                    } else if (reg.profile) {
                      memberName = `${reg.profile.first_name || ''} ${reg.profile.last_name || ''}`.trim();
                    }
                    const avatarUrl = reg.member?.avatar_url || reg.profile?.avatar_url;

                    return (
                      <tr
                        key={reg.id}
                        className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}
                      >
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={memberName}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
                                {memberName.charAt(0)}
                              </div>
                            )}
                            <span className="font-medium">{memberName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          {reg.boat_name && reg.sail_number ? (
                            <span>{reg.boat_name} - #{reg.sail_number}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          ${(reg.entry_fee_amount || reg.amount_paid || event.entryFee || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-2">
                          <span className="italic text-slate-300">
                            {reg.payment_method ? reg.payment_method.replace(/_/g, ' ') : '-'}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`
                            px-2 py-1 rounded-full text-xs font-semibold
                            ${reg.payment_status === 'paid'
                              ? 'bg-green-500/20 text-green-400'
                              : reg.payment_status === 'pay_at_event'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'}
                          `}>
                            {reg.payment_status === 'paid' ? 'Paid' :
                             reg.payment_status === 'pay_at_event' ? 'Pay at Event' : 'Unpaid'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-sm">
                          {new Date(reg.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {reg.payment_status !== 'paid' && can('manage', 'events') && (
                            <button
                              onClick={() => handleMarkAsPaid(reg.id)}
                              className={`
                                px-3 py-1 rounded text-xs font-semibold transition-colors
                                ${darkMode
                                  ? 'bg-green-600 hover:bg-green-700 text-white'
                                  : 'bg-green-500 hover:bg-green-600 text-white'}
                              `}
                            >
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
          <h4 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Summary
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                {allRegistrations.length}
              </div>
              <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Total Registrations
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-500">
                {allRegistrations.filter(r => r.payment_status === 'paid').length}
              </div>
              <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Paid
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">
                {allRegistrations.filter(r => r.payment_status === 'pay_at_event').length}
              </div>
              <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Pay at Event
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMediaTab = () => (
    <div className="space-y-6">
      <div className={`
        p-4 rounded-lg
        ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
      `}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Event Media
          </h3>

          {youtubeConnected && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus size={16} />
              Upload Video
            </button>
          )}
        </div>

        <MediaUploadGallery
          media={eventMedia}
          onMediaChange={handleMediaChange}
          darkMode={darkMode}
          eventId={event.id}
          clubId={event.clubId || ''}
          eventName={event.eventName}
          raceClass={event.raceClass}
          eventType={event.isSeriesEvent ? 'series_round' : 'quick_race'}
        />

        {eventVideos.length > 0 && (
          <div className="mt-6">
            <h4 className={`text-md font-medium mb-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              YouTube Videos
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eventVideos.map((video) => (
                <div
                  key={video.id}
                  className={`
                    rounded-lg overflow-hidden border
                    ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                  `}
                >
                  <div className="aspect-video bg-black">
                    {playingVideo === video.id ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${video.url.split('v=')[1]?.split('&')[0]}`}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div
                        className="relative w-full h-full cursor-pointer group"
                        onClick={() => setPlayingVideo(video.id)}
                      >
                        <img
                          src={`https://img.youtube.com/vi/${video.url.split('v=')[1]?.split('&')[0]}/maxresdefault.jpg`}
                          alt={video.title || 'Video thumbnail'}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                          <Play size={48} className="text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h5 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {video.title}
                      </h5>
                      <button
                        onClick={() => handleRemoveVideo(video.id)}
                        className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {video.description && (
                      <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {video.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderVideosTab = () => (
    <div className="space-y-6">
      <div className={`
        p-4 rounded-lg
        ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
      `}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Event Videos
          </h3>
          
          {youtubeConnected && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus size={16} />
              Upload Video
            </button>
          )}
        </div>
        
        {!youtubeConnected ? (
          <div className={`
            p-6 rounded-lg border text-center
            ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}
          `}>
            <Youtube size={48} className="mx-auto mb-4 opacity-50" />
            <p className="mb-4">YouTube integration not connected</p>
            <p className="text-sm mb-4">
              Connect your YouTube channel in {'Settings > Integrations'} to add videos to events.
            </p>
            <button
              onClick={() => navigate('/settings?tab=integrations')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Connect YouTube
            </button>
          </div>
        ) : eventVideos.length === 0 ? (
          <div className={`
            p-6 rounded-lg border text-center
            ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}
          `}>
            <Video size={48} className="mx-auto mb-4 opacity-50" />
            <p className="mb-4">No videos added to this event yet</p>
            <button
              onClick={() => {
                setShowVideoSelector(true);
                fetchYoutubeVideos();
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Add Your First Video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eventVideos.map((video) => (
              <div
                key={video.id}
                className={`
                  rounded-lg border overflow-hidden
                  ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                `}
              >
                <div className="relative aspect-video">
                  <img
                    src={video.thumbnail_url || `https://img.youtube.com/vi/${video.url}/maxresdefault.jpg`}
                    alt={video.title || 'Video thumbnail'}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <button
                      onClick={() => window.open(`https://youtube.com/watch?v=${getYouTubeVideoId(video.url)}`, '_blank')}
                      className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                    >
                      <Play size={24} className="text-white ml-1" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleRemoveVideo(video.id)}
                    className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                
                <div className="p-4">
                  <h4 className={`font-medium mb-2 line-clamp-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    {video.title}
                  </h4>
                  {video.description && (
                    <p className={`text-sm line-clamp-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {video.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* YouTube Video Selector Modal */}
      {showVideoSelector && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`
            w-full max-w-5xl rounded-xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col
            ${darkMode ? 'bg-slate-800' : 'bg-white'}
          `}>
            <div className={`
              flex items-center justify-between p-6 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Add YouTube Videos
              </h2>
              <button
                onClick={() => setShowVideoSelector(false)}
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
            
            <div className="flex-1 overflow-y-auto p-6">
              {loadingVideos ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {youtubeVideos.map((video) => (
                    <div
                      key={video.id}
                      className={`
                        group rounded-lg border overflow-hidden cursor-pointer
                        ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}
                      `}
                      onClick={() => handleAddYoutubeVideo(video)}
                    >
                      <div className="relative aspect-video">
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <button className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                            <Play size={18} className="text-white ml-1" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="p-3">
                        <h4 className={`font-medium text-sm line-clamp-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          {video.title}
                        </h4>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {new Date(video.published_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderRegistrationTab = () => (
    <div className="space-y-6">
      {event.isExternalEvent ? (
        <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
          <h3 className={`text-lg font-medium mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Event Registration
          </h3>
          <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className={`text-sm mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              This event is managed externally.{event.registrationUrl ? ' Click below to register on the event organiser\'s website.' : ''}
            </p>
            {event.registrationUrl && (
              <a
                href={event.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
              >
                <ExternalLink size={16} />
                Register for Event
              </a>
            )}
            {event.sourceUrl && (
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${event.registrationUrl ? 'ml-3' : ''} ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
              >
                <Globe size={16} />
                View Event Source
              </a>
            )}
          </div>
        </div>
      ) : (
      <div className={`
        p-4 rounded-lg
        ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
      `}>
        <h3 className={`text-lg font-medium mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
          Event Registration
        </h3>

        <div className="space-y-4">
          <div className={`
            p-4 rounded-lg border
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
          `}>
            <div className="flex items-center justify-between gap-4">
              <h4 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Will you attend?
              </h4>

              <div className="flex gap-2">
                <button
                  onClick={() => updateAttendance('yes')}
                  disabled={updatingAttendance}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium text-sm
                    ${attendanceStatus === 'yes'
                      ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                      : darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}
                    ${updatingAttendance ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <ThumbsUp size={16} />
                  <span>Yes</span>
                </button>

                <button
                  onClick={() => updateAttendance('maybe')}
                  disabled={updatingAttendance}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium text-sm
                    ${attendanceStatus === 'maybe'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                      : darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}
                    ${updatingAttendance ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <HelpCircle size={16} />
                  <span>Maybe</span>
                </button>

                <button
                  onClick={() => updateAttendance('no')}
                  disabled={updatingAttendance}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium text-sm
                    ${attendanceStatus === 'no'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                      : darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}
                    ${updatingAttendance ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <ThumbsDown size={16} />
                  <span>No</span>
                </button>
              </div>
            </div>
          </div>

          <div className={`
            p-4 rounded-lg border
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
          `}>
            <div className="flex items-center justify-between mb-3">
              <h4 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Who's attending?
              </h4>
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {attendees.filter(a => a.status === 'yes').length} confirmed
              </span>
            </div>
            
            {attendees.length > 0 ? (
              <div className="space-y-4">
                {/* Attending */}
                {attendees.filter(a => a.status === 'yes').length > 0 && (
                  <div>
                    <h5 className={`text-sm font-medium mb-2 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                      Attending
                    </h5>
                    <div className="flex flex-wrap gap-4">
                      {attendees
                        .filter(a => a.status === 'yes')
                        .map(attendee => {
                          // Get initials from name
                          const nameParts = attendee.name.split(' ');
                          const initials = nameParts.map(part => part[0]).join('');
                          
                          return (
                            <div 
                              key={attendee.id}
                              className="flex flex-col items-center"
                            >
                              <div className={`
                                w-12 h-12 rounded-full flex items-center justify-center mb-1 overflow-hidden
                                ${darkMode ? 'bg-green-900/30' : 'bg-green-100'}
                              `}>
                                {attendee.avatarUrl ? (
                                  <img 
                                    src={attendee.avatarUrl} 
                                    alt={attendee.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className={`text-lg font-semibold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                                    {initials}
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                {attendee.name}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
                
                {/* Maybe */}
                {attendees.filter(a => a.status === 'maybe').length > 0 && (
                  <div>
                    <h5 className={`text-sm font-medium mb-2 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                      Maybe
                    </h5>
                    <div className="flex flex-wrap gap-4">
                      {attendees
                        .filter(a => a.status === 'maybe')
                        .map(attendee => {
                          // Get initials from name
                          const nameParts = attendee.name.split(' ');
                          const initials = nameParts.map(part => part[0]).join('');
                          
                          return (
                            <div 
                              key={attendee.id}
                              className="flex flex-col items-center"
                            >
                              <div className={`
                                w-12 h-12 rounded-full flex items-center justify-center mb-1 overflow-hidden
                                ${darkMode ? 'bg-amber-900/30' : 'bg-amber-100'}
                              `}>
                                {attendee.avatarUrl ? (
                                  <img 
                                    src={attendee.avatarUrl} 
                                    alt={attendee.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className={`text-lg font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                                    {initials}
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                {attendee.name}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
                
                {/* Not Attending */}
                {attendees.filter(a => a.status === 'no').length > 0 && (
                  <div>
                    <h5 className={`text-sm font-medium mb-2 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                      Not Attending
                    </h5>
                    <div className="flex flex-wrap gap-4">
                      {attendees
                        .filter(a => a.status === 'no')
                        .map(attendee => {
                          // Get initials from name
                          const nameParts = attendee.name.split(' ');
                          const initials = nameParts.map(part => part[0]).join('');
                          
                          return (
                            <div 
                              key={attendee.id}
                              className="flex flex-col items-center"
                            >
                              <div className={`
                                w-12 h-12 rounded-full flex items-center justify-center mb-1 overflow-hidden
                                ${darkMode ? 'bg-red-900/30' : 'bg-red-100'}
                              `}>
                                {attendee.avatarUrl ? (
                                  <img 
                                    src={attendee.avatarUrl} 
                                    alt={attendee.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className={`text-lg font-semibold ${darkMode ? 'text-red-400' : 'text-red-700'}`}>
                                    {initials}
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                {attendee.name}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={`text-center py-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                No responses yet
              </div>
            )}
          </div>
          
          {/* Show participants in the registration tab as well */}
          {event.skippers && event.skippers.length > 0 && (
            <div className={`
              p-4 rounded-lg border
              ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
            `}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Registered Skippers
                  </h4>
                </div>
                <div>
                  <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {event.skippers.length} skippers
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                {event.skippers.map((skipper, index) => {
                  // Get initials from name
                  const nameParts = skipper.name.split(' ');
                  const initials = nameParts.map(part => part[0]).join('');
                  
                  return (
                    <div 
                      key={index}
                      className="flex flex-col items-center"
                    >
                      <div className={`
                        w-12 h-12 rounded-full flex items-center justify-center mb-1
                        ${darkMode ? 'bg-blue-900/30' : 'bg-blue-100'}
                      `}>
                        <span className={`text-lg font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                          {initials}
                        </span>
                      </div>
                      <span className={`text-xs text-center ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {skipper.name}
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        #{skipper.sailNo}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );

  const renderResultsTab = () => {
    // Check if event has results
    // For single-day events: check raceResults
    // For multi-day events: check if any day has results
    let hasResults = event.raceResults && event.raceResults.length > 0;

    if (!hasResults && event.multiDay && event.dayResults) {
      // Check if any day has results
      hasResults = Object.values(event.dayResults).some((day: any) =>
        day?.raceResults && day.raceResults.length > 0
      );
    }

    return (
      <div className="space-y-6" ref={resultsRef}>
        <div className={`
          p-4 rounded-lg
          ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
        `}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Event Results
            </h3>
          </div>

          {hasResults ? (
            <div className={`
              p-4 rounded-lg border text-center
              ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}
            `}>
              <p className="mb-2">Results are available for this event</p>
              <button
                onClick={() => {
                  onClose();
                  // For series rounds, convert ID format from "uuid-9" to "uuid-round-9"
                  let resultsId = event.id;
                  if (event.isSeriesEvent && event.seriesId) {
                    // Extract the round number from the event ID
                    const parts = event.id.split('-');
                    const lastPart = parts[parts.length - 1];
                    // Check if the last part is a number (round index)
                    if (!isNaN(parseInt(lastPart)) && !event.id.includes('-round-')) {
                      resultsId = `${event.seriesId}-round-${lastPart}`;
                    }
                  }
                  navigate(`/results/${resultsId}`);
                }}
                className="px-4 py-2 text-white rounded-lg transition-colors"
                style={{ color: '#ffffff' }}
              >
                View Results
              </button>
            </div>
          ) : (
            <div className={`
              p-4 rounded-lg border text-center
              ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}
            `}>
              No results available for this event
            </div>
          )}
        </div>

        {/* Race Report Section */}
        {raceReport && (
          <div className={`
            p-4 rounded-lg
            ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
          `}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Race Report
              </h3>
              <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {new Date(raceReport.created_at).toLocaleDateString()}
              </span>
            </div>
            <div
              className={`
                px-4 py-3 rounded-lg border whitespace-pre-wrap
                ${darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-white border-slate-200 text-slate-900'
                }
              `}
            >
              {raceReport.report_content}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderWeatherTab = () => {
    if (!venueDetails) {
      return (
        <div className={`
          p-4 rounded-lg border text-center
          ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}
        `}>
          <p>Venue information not available for weather forecast</p>
        </div>
      );
    }

    return (
      <div className="h-[600px]">
        <WindyWeatherWidget
          latitude={venueDetails.latitude}
          longitude={venueDetails.longitude}
          locationName={venueDetails.name}
          height="100%"
          showMarker={true}
          showPressure={true}
          zoom={11}
          overlay="wind"
        />
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-[rgba(2,5,12,0.55)] backdrop-blur-[6px] flex items-center justify-center z-50 p-4 animate-fadeIn">
        <div className="a-evm w-full max-w-[1120px] overflow-hidden flex flex-col max-h-[92vh] animate-slideUp" role="dialog" aria-label={event.eventName || event.clubName}>
          {/* Hero */}
          <div className="a-evm-hero">
            {(venueImage || (event.media && event.media[0]?.url)) && <img src={venueImage || (event.media && event.media[0]?.url)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
            <div aria-hidden="true" className="a-evm-ov" />
            <button onClick={onClose} className="a-gb absolute z-10" style={{ top: 18, right: 18, width: 40, height: 40 }} aria-label="Close">
              <X size={19} />
            </button>
            <div className="absolute z-10 flex items-end gap-[18px]" style={{ left: 36, right: 36, bottom: 26 }}>
              {event.date && (
                <div className="a-sp-date flex-shrink-0" style={{ position: 'relative', width: 60, height: 66, borderRadius: 16 }}>
                  <b>{new Date(event.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</b>
                  <span style={{ fontSize: 26 }}>{new Date(event.date).getDate()}</span>
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {event.raceClass && <span className={getBoatClassBadge(event.raceClass, true).className}>{event.raceClass}</span>}
                  {!event.isExternalEvent && (
                    <span className={getRaceFormatBadge(event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', true).className}>{event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}</span>
                  )}
                  <span className={`a-wlvl ${event.eventLevel === 'national' ? 'a-wlvl-n' : ''}`}>{event.eventLevel === 'national' ? 'National' : event.eventLevel === 'state' ? 'State' : 'Club'}</span>
                  {event.cancelled && <span className="a-wlvl" style={{ color: '#FF8A8A', borderColor: 'rgba(255,107,107,0.4)', background: 'rgba(255,107,107,0.08)' }}>Cancelled</span>}
                </div>
                <h2 className="a-display m-0 text-[26px] sm:text-[34px] font-semibold leading-[1.1]" style={{ color: "#fff" }}>
                  {event.eventName || event.clubName}
                </h2>
                {(event.venue || event.clubName) && (
                  <p className="m-0 mt-2 flex items-center gap-[7px] text-[15px]" style={{ color: 'rgba(241,244,250,0.82)' }}>
                    <MapPin size={15} />{event.venue || event.clubName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="overflow-x-auto flex-shrink-0" style={{ padding: '6px 36px 0' }}>
            <div className="a-seg" role="tablist" aria-label="Event sections" style={{ flexWrap: 'nowrap' }}>
              {([
                { key: 'details', label: 'Event Details', icon: <Info size={15} />, show: true },
                { key: 'registrations', label: 'Registrations', icon: <DollarSign size={15} />, show: !!(event.isPaid && event.entryFee && event.entryFee > 0) },
                { key: 'documents', label: 'Documents', icon: <FileText size={15} />, show: true },
                { key: 'media', label: 'Media', icon: <Image size={15} />, show: true },
                { key: 'results', label: 'Results', icon: <Trophy size={15} />, show: true },
                { key: 'weather', label: 'Weather', icon: <Cloud size={15} />, show: true },
                { key: 'signon', label: 'Sign On', icon: <ClipboardList size={15} />, show: true },
                { key: 'protests', label: 'Protests', icon: <Gavel size={15} />, show: !!(isAdmin || isEditor) },
              ] as { key: typeof activeTab; label: string; icon: React.ReactNode; show: boolean }[]).filter(t => t.show).map(t => (
                <button key={t.key} role="tab" aria-selected={activeTab === t.key} onClick={() => setActiveTab(t.key)} className={`a-seg-i ${activeTab === t.key ? 'a-seg-on' : ''}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ padding: '24px 36px' }}>
            {activeTab === 'details' && renderDetailsTab()}
            {activeTab === 'registrations' && renderRegistrationsTab()}
            {activeTab === 'documents' && renderDocumentsTab()}
            {activeTab === 'media' && renderMediaTab()}
            {activeTab === 'results' && renderResultsTab()}
            {activeTab === 'weather' && renderWeatherTab()}
            {activeTab === 'signon' && (
              <RaceSignOnSheet
                eventId={event.id}
                clubId={currentClub?.clubId || event.clubId || ''}
                darkMode={darkMode}
                isAdmin={isAdmin || isEditor}
                eventName={event.eventName || event.clubName}
                eventSkippers={event.skippers || []}
                eventDate={event.date}
                eventEndDate={event.endDate}
                numberOfDays={event.numberOfDays}
                multiDay={event.multiDay}
              />
            )}
            {activeTab === 'protests' && (isAdmin || isEditor) && (
              <ProtestBoard
                eventId={event.id}
                clubId={currentClub?.clubId || event.clubId || ''}
                darkMode={darkMode}
                isAdmin={isAdmin || isEditor}
                eventName={event.eventName || event.clubName}
              />
            )}
          </div>
        </div>
      </div>

      {/* Publish to Meta Modal */}
      {showPublishModal && (
        <PublishToMetaModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          darkMode={darkMode}
          pageName={metaPageName}
          pageId={metaPageId}
          eventData={{
            title: event.eventName || event.clubName,
            date: event.date,
            venue: event.venue,
            raceClass: event.raceClass,
            raceFormat: event.raceFormat,
            clubId: currentClub?.clubId || event.clubId,
            eventId: event.id,
            clubName: event.clubName
          }}
          resultsRef={resultsRef}
          eventResults={event.raceResults}
          eventSkippers={event.skippers}
          eventMedia={eventMedia}
        />
      )}

      {/* Upload Video Modal */}
      <UploadVideoModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        darkMode={darkMode}
        preselectedEventId={event.id}
        preselectedEventType={event.isSeriesEvent ? 'race_series' : event.isPublicEvent ? 'public_event' : 'quick_race'}
        onSuccess={() => {
          setShowUploadModal(false);
          fetchEventVideos(); // Refresh media
        }}
      />

      {/* Event Registration Modal */}
      {showRegistrationModal && (event.clubId || currentClub?.clubId) && (
        <EventRegistrationModal
          darkMode={darkMode}
          eventId={extractDbId(event.id)}
          clubId={event.clubId || currentClub?.clubId || ''}
          eventName={event.eventName || event.clubName}
          entryFee={event.entryFee || 0}
          currency="AUD"
          onClose={() => setShowRegistrationModal(false)}
          onSuccess={() => {
            setShowRegistrationModal(false);
            loadUserRegistration(); // Refresh registration status
            fetchAttendance(); // Refresh attendance
          }}
        />
      )}

      {/* Live Tracking QR Code Modal */}
      {showLiveTrackingQR && (event.clubId || event.eventLevel === 'state' || event.eventLevel === 'national') && (
        <LiveTrackingQRCodeModal
          eventId={extractDbId(event.id)}
          eventName={event.eventName || event.clubName}
          clubId={event.clubId || undefined}
          stateAssociationId={event.eventLevel === 'state' && currentOrganization?.type === 'state' ? currentOrganization.id : undefined}
          nationalAssociationId={event.eventLevel === 'national' && currentOrganization?.type === 'national' ? currentOrganization.id : undefined}
          onClose={() => setShowLiveTrackingQR(false)}
        />
      )}

      {/* Event Livestream Modal */}
      {(() => {
        console.log('🎬 [EventDetails] Livestream modal rendering check:', {
          showLivestreamModal,
          eventClubId: event.clubId,
          eventEventLevel: event.eventLevel,
          hasClubId: !!event.clubId,
          willRender: showLivestreamModal && (event.clubId || event.eventLevel === 'state' || event.eventLevel === 'national')
        });
        return null;
      })()}
      {showLivestreamModal && (event.clubId || event.eventLevel === 'state' || event.eventLevel === 'national') && (
        <EventLivestreamModal
          eventId={event.id}
          eventName={event.eventName || event.clubName}
          eventDate={event.date}
          clubId={event.clubId || currentOrganization?.id}
          onClose={() => setShowLivestreamModal(false)}
        />
      )}

      {/* Event Website Settings Modal */}
      {showEventWebsiteModal && (
        <EventWebsiteSettingsModal
          eventId={extractDbId(event.id)}
          eventName={event.eventName || event.clubName}
          darkMode={darkMode}
          onClose={() => setShowEventWebsiteModal(false)}
          onSaved={async () => {
            // Reload website data
            const { eventWebsiteStorage } = await import('../utils/eventWebsiteStorage');
            const website = await eventWebsiteStorage.getEventWebsiteForEvent(extractDbId(event.id));
            setHasEventWebsite(!!website);
            setEventWebsiteId(website?.id || null);
          }}
          onOpenDashboard={async () => {
            setShowEventWebsiteModal(false);
            // Get website ID and navigate
            const { eventWebsiteStorage } = await import('../utils/eventWebsiteStorage');
            const website = await eventWebsiteStorage.getEventWebsiteForEvent(extractDbId(event.id));
            if (website?.id) {
              navigate(`/event-websites/${website.id}`);
            }
          }}
        />
      )}

      {showImportResults && (
        <ImportRoundResultsModal
          isOpen={true}
          onClose={() => {
            setShowImportResults(false);
            setImportSeriesData(null);
          }}
          darkMode={darkMode}
          series={importSeriesData || undefined}
          roundIndex={importRoundIndex}
          event={!importSeriesData ? event : undefined}
          onImportComplete={() => {
            setShowImportResults(false);
            setImportSeriesData(null);
            onClose();
          }}
        />
      )}
    </>
  );
};
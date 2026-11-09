// Build: 2026-03-18-fcp-studio-redesign
import React, { useState, useEffect, useRef } from 'react';
import { Video, Square, Eye, EyeOff, Calendar, Camera, Loader as Loader2, X, Smartphone, RefreshCw, Monitor, Maximize2, Minimize2, ChartBar as BarChart3, Trash2, CircleStop as StopCircle, Copy, ExternalLink, Zap, FlaskConical, ChevronLeft, Plus, Scissors, PanelRight, Link2 } from 'lucide-react';
import { TestBroadcastLinkModal } from './TestBroadcastLinkModal';
import { LiveHome } from './LiveHome';
import { NewBroadcastSheet } from './NewBroadcastSheet';
import type { OnAirSnapshot, OnAirControls } from './onAirTypes';
import { useAuth } from '../../contexts/AuthContext';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamSession, LivestreamCamera } from '../../types/livestream';
import { supabase } from '../../utils/supabase';
import { MobileCameraQRModal } from './MobileCameraQRModal';
import { SelectRaceHeatModal } from './SelectRaceHeatModal';
import { ScheduleStreamModal } from './ScheduleStreamModal';
import { StreamAnalyticsModal } from './StreamAnalyticsModal';
import { LivestreamSetupWizard } from './LivestreamSetupWizard';
import { ConfirmationModal } from '../ConfirmationModal';
import { OverlaysManager } from './OverlaysManager';
import { CloudControlRoom } from './CloudControlRoom';
import { LivestreamOverlayRenderer } from './LivestreamOverlayRenderer';
import type { OverlayScoringSummary } from './LivestreamOverlayRenderer';
import { CameraFeedGridRef } from './CameraFeedGrid';
import { AdvancedStreamConsole } from './AdvancedStreamConsole';
import { useNotification } from '../../contexts/NotificationContext';
import { useCanvasCompositor } from '../../hooks/useCanvasCompositor';
import { subscribeToRaceStatus } from '../../utils/liveTrackingStorage';
import { getRaceStatusEventId } from '../../utils/livestreamEventIds';
import { fetchScoringRace, stripBroadcastSuffix, raceNumberFromLabel } from '../../utils/liveEventInfo';
import { saveRaceThumbnail } from './broadcastThumbnail';
import type { LivestreamRaceSegment } from '../../types/livestream';
import { getIceServers } from '../../utils/iceServers';

/** Auto director: how long each camera stays on program while racing */
const AUTO_DIRECTOR_MS = 45000;

interface AutoCreateEventInfo {
  eventId: string;
  eventName: string;
}

interface LivestreamControlPanelProps {
  clubId: string;
  sessionId?: string;
  autoCreateForEvent?: AutoCreateEventInfo;
  /** Compact on-air controls (scoring dock) listen to the studio through these */
  onSnapshot?: (snapshot: OnAirSnapshot) => void;
  controlsRef?: React.MutableRefObject<OnAirControls | null>;
}

interface SessionWithVenue extends LivestreamSession {
  venueImage?: string;
  venueName?: string;
  hostClubName?: string;
  hostClubLogo?: string;
}

export function LivestreamControlPanel({ clubId, sessionId, autoCreateForEvent, onSnapshot, controlsRef }: LivestreamControlPanelProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [activeSession, setActiveSession] = useState<LivestreamSession | null>(null);
  const [sessions, setSessions] = useState<SessionWithVenue[]>([]);
  const [cameras, setCameras] = useState<LivestreamCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<'offline' | 'connecting' | 'testing' | 'live'>('offline');
  const [viewerCount, setViewerCount] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<'settings' | 'overlays' | 'output'>('overlays');
  const [showInspector, setShowInspector] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const [activePreviewStream, setActivePreviewStream] = useState<MediaStream | null>(null);
  const cameraFeedGridRef = useRef<CameraFeedGridRef>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const signalingChannelsRef = useRef<Record<string, ReturnType<typeof supabase.channel>>>({});
  const cameraLastConnectedRef = useRef<Record<string, string>>({});
  const overlayRef = useRef<HTMLDivElement>(null);
  const [videoElReady, setVideoElReady] = useState<HTMLVideoElement | null>(null);
  const [overlayElReady, setOverlayElReady] = useState<HTMLDivElement | null>(null);
  const whipPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [whipStatus, setWhipStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [showMobileQR, setShowMobileQR] = useState(false);
  const [showSelectRace, setShowSelectRace] = useState(false);
  const [showTestLink, setShowTestLink] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<SessionWithVenue | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamDuration, setStreamDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [autoSegmentEnabled, setAutoSegmentEnabled] = useState(true);
  const [currentSegment, setCurrentSegment] = useState<LivestreamRaceSegment | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);
  // A race number the officer set by hand (no live scoring) wins until scoring moves on
  const manualRaceRef = useRef<number | null>(null);
  const [manualRace, setManualRace] = useState<number | null>(null);
  const scoringRef = useRef<OverlayScoringSummary | null>(null);
  // Venue photo + host club for the linked event. Kept apart from activeSession, which is
  // replaced by plain database rows in many places (going live, pausing…).
  const [venueInfo, setVenueInfo] = useState<{ venueImage?: string; venueName?: string; hostClubName?: string; hostClubLogo?: string }>({});
  const [segmentProcessing, setSegmentProcessing] = useState(false);
  const segmentTransitionRef = useRef(false);
  const pendingSegmentStartRef = useRef(false);
  const lastCompletedRaceRef = useRef<number | null>(null);
  const [showTitleCard, setShowTitleCard] = useState(false);
  const [titleCardTrigger, setTitleCardTrigger] = useState(0);
  const [titleCardInstant, setTitleCardInstant] = useState(false);
  const whipHealthRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sendMbps, setSendMbps] = useState<number | null>(null);
  const lastBytesSentRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (sessionId) {
      loadSpecificSession(sessionId);
    } else {
      loadSessions();
      checkActiveSession();
    }
  }, [clubId, sessionId]);

  useEffect(() => {
    if (activeSession && activeSession.engine !== 'cloud' && (streamStatus === 'testing' || streamStatus === 'live') && !mediaStream) {
      requestCameraAccess();
    }
  }, [activeSession, streamStatus]);

  const activePreviewStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const compositedStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => { activePreviewStreamRef.current = activePreviewStream; }, [activePreviewStream]);
  useEffect(() => { mediaStreamRef.current = mediaStream; }, [mediaStream]);

  const { compositedStream, isCompositing } = useCanvasCompositor({
    videoElement: videoElReady,
    overlayElement: overlayElReady,
    sourceStream: activePreviewStream || mediaStream,
    enabled: activeSession?.enable_overlays === true &&
             (streamStatus === 'testing' || streamStatus === 'live' || streamStatus === 'connecting'),
    width: 1920,
    height: 1080,
    overlayCaptureFps: 2,
    frameRate: 30,
  });

  useEffect(() => { compositedStreamRef.current = compositedStream; }, [compositedStream]);

  useEffect(() => {
    if (whipHealthRef.current) { clearInterval(whipHealthRef.current); whipHealthRef.current = null; }
    if (streamStatus !== 'live' || whipStatus !== 'connected' || isPaused) setSendMbps(null);
    if (streamStatus === 'live' && whipStatus === 'connected' && whipPeerConnectionRef.current && !isPaused) {
      whipHealthRef.current = setInterval(async () => {
        const pc = whipPeerConnectionRef.current;
        if (!pc || pc.connectionState !== 'connected') return;
        try {
          const stats = await pc.getStats();
          let currentBytesSent = 0;
          stats.forEach((report) => {
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              currentBytesSent = report.bytesSent || 0;
            }
          });
          if (lastBytesSentRef.current > 0 && currentBytesSent > lastBytesSentRef.current) {
            // Video sent over the last 10 seconds, for the control room's health chip
            setSendMbps(((currentBytesSent - lastBytesSentRef.current) * 8) / 10 / 1e6);
          }
          if (lastBytesSentRef.current > 0 && currentBytesSent <= lastBytesSentRef.current) {
            console.warn('[WHIP Health] No video bytes sent in last interval. Connection may be stale.');
            setWhipStatus('error');
            addNotification('warning', 'Stream connection stalled. Attempting reconnect...', 5000);
            if (activeSession?.cloudflare_whip_url) {
              const stream = compositedStreamRef.current || activePreviewStreamRef.current || mediaStreamRef.current;
              if (stream) {
                await stopWhipStreaming();
                await new Promise(r => setTimeout(r, 1000));
                await startWhipStreaming(activeSession.cloudflare_whip_url, stream);
              }
            }
          }
          lastBytesSentRef.current = currentBytesSent;
        } catch {}
      }, 10000);
    }
    return () => { if (whipHealthRef.current) { clearInterval(whipHealthRef.current); whipHealthRef.current = null; } };
  }, [streamStatus, whipStatus, isPaused]);

  useEffect(() => {
    if (activeSession) {
      const sessionSubscription = livestreamStorage.subscribeToSession(
        activeSession.id,
        (updatedSession) => {
          setActiveSession(updatedSession);
          updateStreamStatus(updatedSession.status);
        }
      );

      const cameraSubscription = livestreamStorage.subscribeToSessionCameras(
        activeSession.id,
        (updatedCameras) => {
          const previousCameraIds = cameras.map(c => c.id);
          const newCameras = updatedCameras.filter(c =>
            !previousCameraIds.includes(c.id) &&
            (c.status === 'connected' || c.status === 'streaming')
          );

          newCameras.forEach(camera => {
            addNotification('success', `${camera.camera_name} connected`, 5000);
          });

          setCameras(updatedCameras);
        }
      );

      const pollMs = (streamStatus === 'testing' || streamStatus === 'live') ? 5000 : 15000;
      const pollInterval = setInterval(() => {
        loadCameras(activeSession.id);
      }, pollMs);

      return () => {
        sessionSubscription.unsubscribe();
        cameraSubscription.unsubscribe();
        clearInterval(pollInterval);
      };
    }
  }, [activeSession?.id]);


  const setupMobileCameraConnection = async (camera: LivestreamCamera, retryCount = 0): Promise<void> => {
    if (camera.camera_type !== 'mobile') return;
    const existingPc = peerConnectionsRef.current[camera.id];
    if (existingPc) {
      if (existingPc.connectionState === 'connected') return;
      if (existingPc.connectionState !== 'failed' && existingPc.connectionState !== 'closed') {
        if (retryCount === 0) return;
      }
      cleanupMobileCameraConnection(camera.id);
    }

    try {
      const { data: offerSignal } = await supabase
        .from('webrtc_signaling')
        .select('*')
        .eq('camera_id', camera.id)
        .eq('signal_type', 'offer')
        .eq('from_role', 'camera')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!offerSignal?.signal_data?.sdp) {
        if (retryCount < 5) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return setupMobileCameraConnection(camera, retryCount + 1);
        }
        return;
      }

      const pc = new RTCPeerConnection({ iceServers: await getIceServers({ sessionId: camera.livestream_session_id }) });
      peerConnectionsRef.current[camera.id] = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => ({ ...prev, [camera.id]: event.streams[0] }));
          const primaryCamera = cameras.find(c => c.is_primary);
          if (primaryCamera?.id === camera.id) {
            setActivePreviewStream(event.streams[0]);
          }
        }
      };

      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          await supabase.from('webrtc_signaling').insert({
            camera_id: camera.id,
            session_id: activeSession?.id || '',
            signal_type: 'ice_candidate',
            signal_data: { candidate: e.candidate.toJSON() },
            from_role: 'viewer'
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          livestreamStorage.updateCamera(camera.id, { status: 'streaming' });
          addNotification('success', `${camera.camera_name} streaming`, 3000);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          const wasPrimary = cameras.find(c => c.id === camera.id)?.is_primary;
          addNotification('error', `${camera.camera_name} ${pc.connectionState}`, 5000);
          cleanupMobileCameraConnection(camera.id);
          livestreamStorage.updateCamera(camera.id, { status: 'disconnected' }).catch(() => {});

          if (wasPrimary && activeSession) {
            const laptopCam = cameras.find(c => c.camera_type === 'laptop');
            const anotherMobile = cameras.find(c => c.camera_type === 'mobile' && c.id !== camera.id && remoteStreams[c.id]);
            if (anotherMobile && remoteStreams[anotherMobile.id]) {
              const fallbackStream = remoteStreams[anotherMobile.id]!;
              setActivePreviewStream(fallbackStream);
              livestreamStorage.setPrimaryCamera(activeSession.id, anotherMobile.id).catch(() => {});
              if (streamStatus === 'live' && whipPeerConnectionRef.current) {
                replaceWhipTracks(fallbackStream);
              }
              addNotification('info', `Switched to ${anotherMobile.camera_name}`, 4000);
            } else if (laptopCam && mediaStream) {
              setActivePreviewStream(mediaStream);
              livestreamStorage.setPrimaryCamera(activeSession.id, laptopCam.id).catch(() => {});
              if (streamStatus === 'live' && whipPeerConnectionRef.current) {
                replaceWhipTracks(mediaStream);
              }
              addNotification('info', 'Switched to laptop camera', 4000);
            }
          }
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offerSignal.signal_data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await supabase.from('webrtc_signaling').insert({
        camera_id: camera.id,
        session_id: activeSession?.id || '',
        signal_type: 'answer',
        signal_data: { sdp: pc.localDescription },
        from_role: 'viewer'
      });

      const { data: existingCandidates } = await supabase
        .from('webrtc_signaling')
        .select('*')
        .eq('camera_id', camera.id)
        .eq('signal_type', 'ice_candidate')
        .eq('from_role', 'camera');

      if (existingCandidates) {
        for (const candidateSignal of existingCandidates) {
          if (candidateSignal.signal_data?.candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidateSignal.signal_data.candidate)); } catch {}
          }
        }
      }

      const channelName = `viewer-cam-${camera.id}-${Date.now()}`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'webrtc_signaling',
          filter: `camera_id=eq.${camera.id}`
        }, async (payload) => {
          const signal = payload.new as any;
          if (signal.from_role !== 'camera') return;
          const currentPc = peerConnectionsRef.current[camera.id];
          if (!currentPc) return;
          try {
            if (signal.signal_type === 'ice_candidate' && signal.signal_data?.candidate) {
              await currentPc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
            }
          } catch {}
        })
        .subscribe();

      signalingChannelsRef.current[camera.id] = channel;
    } catch (error) {
      console.error('Error setting up mobile camera connection:', error);
      delete peerConnectionsRef.current[camera.id];
    }
  };

  const cleanupMobileCameraConnection = (cameraId: string) => {
    if (peerConnectionsRef.current[cameraId]) {
      try { peerConnectionsRef.current[cameraId].close(); } catch {}
      delete peerConnectionsRef.current[cameraId];
    }
    if (signalingChannelsRef.current[cameraId]) {
      try { supabase.removeChannel(signalingChannelsRef.current[cameraId]); } catch {}
      delete signalingChannelsRef.current[cameraId];
    }
    setRemoteStreams(prev => { const updated = { ...prev }; delete updated[cameraId]; return updated; });
  };

  const forceReconnectMobileCameras = async () => {
    const mobileCameras = cameras.filter(c => c.camera_type === 'mobile');
    for (const camera of mobileCameras) {
      cleanupMobileCameraConnection(camera.id);
      cameraLastConnectedRef.current[camera.id] = '';
    }
    if (activeSession?.id) await loadCameras(activeSession.id);
    setTimeout(() => {
      const connectedMobiles = cameras.filter(c => c.camera_type === 'mobile' && (c.status === 'connected' || c.status === 'streaming'));
      connectedMobiles.forEach(camera => setupMobileCameraConnection(camera, 1));
    }, 500);
  };

  const cameraFingerprint = cameras.map(c => `${c.id}:${c.status}:${c.last_connected_at || ''}`).join(',');

  useEffect(() => {
    if (!activeSession) return;
    const mobileCameras = cameras.filter(c => c.camera_type === 'mobile' && (c.status === 'connected' || c.status === 'streaming'));
    if (mobileCameras.length === 0) return;
    mobileCameras.forEach(camera => {
      const lastConnected = camera.last_connected_at || '';
      const previousLastConnected = cameraLastConnectedRef.current[camera.id];
      if (previousLastConnected && lastConnected !== previousLastConnected) {
        cleanupMobileCameraConnection(camera.id);
      }
      cameraLastConnectedRef.current[camera.id] = lastConnected;
      if (!peerConnectionsRef.current[camera.id]) {
        setupMobileCameraConnection(camera);
      }
    });
  }, [activeSession?.id, cameraFingerprint]);

  useEffect(() => {
    return () => {
      Object.keys(peerConnectionsRef.current).forEach(cameraId => cleanupMobileCameraConnection(cameraId));
      Object.keys(signalingChannelsRef.current).forEach(cameraId => {
        try { supabase.removeChannel(signalingChannelsRef.current[cameraId]); } catch {}
      });
      if (whipPeerConnectionRef.current) { whipPeerConnectionRef.current.close(); whipPeerConnectionRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (streamStatus === 'live' && activeSession?.actual_start_time) {
      const interval = setInterval(() => {
        const startTime = new Date(activeSession.actual_start_time!).getTime();
        setStreamDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setStreamDuration(0);
    }
  }, [streamStatus, activeSession?.actual_start_time]);

  useEffect(() => {
    if (!activeSession?.event_id || streamStatus !== 'live' || !autoSegmentEnabled) return;

    // Series rounds linked by their round id keep race status under the series id
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const linkedEventId = activeSession.event_id;
    getRaceStatusEventId(linkedEventId).then(statusEventId => {
      if (cancelled) return;
      unsubscribe = subscribeToRaceStatus(
        statusEventId,
        async (raceStatus, notes) => {
          if (raceStatus === 'on_hold' || raceStatus === 'completed_for_day' || raceStatus === 'event_complete') {
            pendingSegmentStartRef.current = false;
            if (segmentTransitionRef.current) return;
            await handleSegmentStop(
              raceStatus === 'on_hold' ? 'on_hold' : 'race_scored',
              raceStatus === 'event_complete' || raceStatus === 'completed_for_day'
            );
          } else if (raceStatus === 'live') {
            if (segmentTransitionRef.current) {
              console.log('[Segment] Stop transition in progress, queuing segment start');
              pendingSegmentStartRef.current = true;
              return;
            }
            await handleSegmentStart();
          }
        }
      );
    });

    return () => { cancelled = true; unsubscribe?.(); };
  }, [activeSession?.event_id, streamStatus, autoSegmentEnabled]);

  // Fallback: watch quick_races.last_completed_race for race scoring events.
  // This triggers segment splits even if the race officer doesn't update live_tracking_events.
  useEffect(() => {
    if (!activeSession?.event_id || streamStatus !== 'live' || !autoSegmentEnabled) return;

    const eventId = activeSession.event_id;
    const isSeriesRound = eventId.includes('-') && eventId.split('-').length > 5;
    if (isSeriesRound) return;

    // Single events score into quick_races, series rounds into race_series_rounds
    const onScored = async (payload: any) => {
      const newCompleted = (payload.new as any)?.last_completed_race;
      if (typeof newCompleted !== 'number' || newCompleted < 1) return;
      const prev = lastCompletedRaceRef.current;
      if (prev !== null && newCompleted > prev && !segmentTransitionRef.current) {
        console.log(`[Segment] Race ${newCompleted} scored (was ${prev}). Stopping segment recording.`);
        lastCompletedRaceRef.current = newCompleted;
        manualRaceRef.current = null;
        await handleSegmentStop('race_scored', false);
      } else if (prev === null) {
        lastCompletedRaceRef.current = newCompleted;
      }
    };
    const roundChannel = supabase
      .channel(`segment-round-${eventId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'race_series_rounds', filter: `id=eq.${eventId}` }, onScored)
      .subscribe();
    supabase.from('race_series_rounds').select('last_completed_race').eq('id', eventId).maybeSingle()
      .then(({ data }) => { if (data?.last_completed_race != null) lastCompletedRaceRef.current = data.last_completed_race; });

    const channel = supabase
      .channel(`race_scoring_${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quick_races',
          filter: `id=eq.${eventId}`,
        },
        async (payload) => {
          const newData = payload.new as any;
          const newCompleted = newData.last_completed_race;
          if (typeof newCompleted !== 'number' || newCompleted < 1) return;

          const prev = lastCompletedRaceRef.current;
          if (prev !== null && newCompleted > prev && !segmentTransitionRef.current) {
            console.log(`[Segment] Race ${newCompleted} scored (was ${prev}). Stopping segment recording.`);
            lastCompletedRaceRef.current = newCompleted;
            manualRaceRef.current = null;
            await handleSegmentStop('race_scored', false);
            // Do NOT auto-start next segment -- wait for 'live' status from subscribeToRaceStatus
          } else if (prev === null) {
            lastCompletedRaceRef.current = newCompleted;
          }
        }
      )
      .subscribe();

    supabase
      .from('quick_races')
      .select('last_completed_race')
      .eq('id', eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.last_completed_race != null) {
          lastCompletedRaceRef.current = data.last_completed_race;
        } else if (lastCompletedRaceRef.current === null) {
          lastCompletedRaceRef.current = 0;
        }
      });

    return () => { supabase.removeChannel(channel); supabase.removeChannel(roundChannel); };
  }, [activeSession?.event_id, streamStatus, autoSegmentEnabled]);

  /** "<event> | Race 5" — the event title without "Live Coverage", then the race being sailed */
  const buildSegmentTitle = (raceLabel: string) => {
    const eventTitle = stripBroadcastSuffix(activeSession?.title || '') || 'Race';
    const heatNum = activeSession?.heat_number;
    // Round (in the event title) → Race → Heat
    return heatNum && !/heat/i.test(raceLabel)
      ? `${eventTitle} | ${raceLabel} · Heat ${heatNum}`
      : `${eventTitle} | ${raceLabel}`;
  };

  /**
   * Which race a new recording is: a race number the officer set by hand wins, then what scoring
   * says (same as the overlay), then the event's last scored race + 1, then simply the next number.
   */
  const resolveSegmentRace = async (): Promise<{ raceNumber: number; label: string }> => {
    if (manualRaceRef.current) return { raceNumber: manualRaceRef.current, label: `Race ${manualRaceRef.current}` };
    if (activeSession?.event_id) {
      const fromScoring = await fetchScoringRace(activeSession.event_id);
      if (fromScoring) return fromScoring;
    }
    const fromOverlay = scoringRef.current?.race;
    const overlayNumber = fromOverlay ? raceNumberFromLabel(fromOverlay) : null;
    if (fromOverlay && overlayNumber) return { raceNumber: overlayNumber, label: fromOverlay };
    const n = segmentCount + 1;
    return { raceNumber: n, label: `Race ${n}` };
  };

  /** Changes the race the current recording is filed under (and the next one, until scoring moves on) */
  const setRecordingRace = async (raceNumber: number) => {
    if (raceNumber < 1) return;
    manualRaceRef.current = raceNumber;
    setManualRace(raceNumber);
    if (currentSegment) {
      const segment_title = buildSegmentTitle(`Race ${raceNumber}`);
      try {
        await livestreamStorage.updateSegment(currentSegment.id, { race_number: raceNumber, segment_title });
        setCurrentSegment({ ...currentSegment, race_number: raceNumber, segment_title });
        if (activeSession) await livestreamStorage.updateSession(activeSession.id, { current_race_number: raceNumber });
      } catch (err) {
        console.error('[Segment] Could not rename recording:', err);
        addNotification('error', 'Could not change the race number. Try again.', 5000);
      }
    }
  };

  /** Ends this race's video and starts the next race's (for when races aren't scored in AlfiePRO) */
  const startNextRaceManually = async () => {
    if (!activeSession || segmentTransitionRef.current) return;
    const next = (currentSegment?.race_number || manualRaceRef.current || 0) + 1;
    manualRaceRef.current = next;
    setManualRace(next);
    pendingSegmentStartRef.current = true;
    if (currentSegment) {
      await handleSegmentStop('manual', false);
    } else {
      pendingSegmentStartRef.current = false;
      await handleSegmentStart();
    }
  };

  /** The race's thumbnail (intro screen with its race number), stored next to the recording */
  const saveSegmentThumbnail = async (segment: LivestreamRaceSegment): Promise<void> => {
    if (!activeSession) return;
    try {
      const full = stripBroadcastSuffix(activeSession.title || '');
      const m = full.match(/^(.*?)\s*[-–|·]\s*((?:round|rd|day)\s*\d+)\s*$/i);
      const parts = String(segment.segment_title || '').split(' | ');
      const race = parts.length > 1 ? parts[parts.length - 1] : `Race ${segment.race_number}`;
      await saveRaceThumbnail(activeSession.club_id, segment.id, {
        title: (m ? m[1] : full) || 'Race video',
        round: m ? m[2] : null,
        race,
        dateLabel: new Date(segment.segment_start_time || Date.now()).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        venueName: venueInfo.venueName,
        venueImage: venueInfo.venueImage,
        hostClubName: venueInfo.hostClubName,
        hostClubLogo: venueInfo.hostClubLogo,
      });
    } catch (err) {
      console.warn('[Thumbnail] Skipped:', err);
    }
  };

  const handleSegmentStop = async (triggerType: 'race_scored' | 'on_hold' | 'manual' | 'stream_end', isFinalSegment = false) => {
    if (!activeSession || segmentTransitionRef.current) return;
    segmentTransitionRef.current = true;
    setSegmentProcessing(true);

    try {
      const segmentToFinalize = currentSegment;
      // Stop local recording only -- WHIP live broadcast stays connected
      const recordingBlob = await stopLocalRecording();

      if (segmentToFinalize) {
        await livestreamStorage.finalizeSegment(segmentToFinalize.id, triggerType);
        addNotification('info', `Race ${segmentToFinalize.race_number} recording saved. Uploading to YouTube...`, 4000);

        // Recording and thumbnail are both in storage before the upload to YouTube starts
        const thumbnailSaved = saveSegmentThumbnail(segmentToFinalize);
        const recordingSaved = recordingBlob && recordingBlob.size > 10000
          ? uploadLocalRecording(recordingBlob, segmentToFinalize.id, activeSession.club_id)
          : Promise.resolve(null);
        Promise.all([recordingSaved, thumbnailSaved]).then(() => {
          livestreamStorage.triggerSegmentProcessing(segmentToFinalize.id).catch((err) => {
            console.error('[Segment] Background processing error:', err);
          });
        });
      }

      setCurrentSegment(null);

      if (isFinalSegment) {
        addNotification('success', 'Final race recording saved. Videos will be uploaded to YouTube.', 5000);
      } else {
        setIsPaused(true);
        await livestreamStorage.updateSession(activeSession.id, { is_paused: true });
        addNotification('info', 'Race recording paused. Live broadcast continues. Recording will resume when next race starts.', 5000);
      }
    } catch (error) {
      console.error('[Segment] Stop error:', error);
      addNotification('error', 'Failed to save segment recording.', 8000);
    } finally {
      segmentTransitionRef.current = false;
      setSegmentProcessing(false);

      if (pendingSegmentStartRef.current && !isFinalSegment) {
        pendingSegmentStartRef.current = false;
        console.log('[Segment] Processing queued segment start after stop completed');
        setTimeout(() => handleSegmentStart(), 1500);
      }
    }
  };

  const handleSegmentStart = async () => {
    if (!activeSession || segmentTransitionRef.current) return;

    segmentTransitionRef.current = true;
    setSegmentProcessing(true);

    try {
      const whipAlreadyConnected = whipPeerConnectionRef.current?.connectionState === 'connected';

      let rawStream = activePreviewStream || mediaStream;
      if (!rawStream || rawStream.getVideoTracks().filter(t => t.readyState === 'live').length === 0) {
        const freshStream = await requestCameraAccess();
        if (!freshStream) {
          addNotification('error', 'No video source available', 5000);
          return;
        }
        rawStream = freshStream;
      }

      let streamToSend = rawStream;
      const cs = compositedStreamRef.current;
      if (cs && cs.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) {
        streamToSend = cs;
      }

      if (!whipAlreadyConnected) {
        if (!activeSession.cloudflare_whip_url) {
          addNotification('error', 'No Cloudflare WHIP URL available', 5000);
          return;
        }

        if (activeSession.cloudflare_live_input_id) {
          try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            if (authSession) {
              await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authSession.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'ensureRecording',
                  clubId: activeSession.club_id,
                  sessionData: { liveInputId: activeSession.cloudflare_live_input_id },
                }),
              });
            }
          } catch (e) { console.warn('[Segment] Could not verify recording mode:', e); }
        }

        let whipSuccess = await startWhipStreaming(activeSession.cloudflare_whip_url, streamToSend);
        if (!whipSuccess) {
          console.warn('[Segment] First WHIP attempt failed, retrying after 2s...');
          await new Promise(r => setTimeout(r, 2000));
          whipSuccess = await startWhipStreaming(activeSession.cloudflare_whip_url, streamToSend);
        }

        if (!whipSuccess) {
          addNotification('error', 'Failed to start live broadcast for new race. Try resuming manually.', 8000);
          return;
        }
      } else {
        console.log('[Segment] WHIP already connected, starting local recording only');
      }

      startLocalRecording(streamToSend);

      setIsPaused(false);
      await livestreamStorage.updateSession(activeSession.id, { is_paused: false });

      setTitleCardTrigger(prev => prev + 1);

      const race = await resolveSegmentRace();
      const nextRaceNumber = race.raceNumber;
      const segmentTitle = buildSegmentTitle(race.label);

      const newSegment = await livestreamStorage.createSegment({
        session_id: activeSession.id,
        club_id: activeSession.club_id,
        event_id: activeSession.event_id || undefined,
        race_number: nextRaceNumber,
        heat_number: activeSession.heat_number || undefined,
        segment_title: segmentTitle,
        cloudflare_input_id: activeSession.cloudflare_live_input_id || undefined,
        segment_start_time: new Date().toISOString(),
        upload_status: 'pending',
        trigger_type: 'race_scored',
      });

      setCurrentSegment(newSegment);
      setSegmentCount(c => c + 1);

      await livestreamStorage.updateSession(activeSession.id, {
        current_race_number: nextRaceNumber,
        current_segment_start: new Date().toISOString(),
      });

      addNotification('success', `Now recording ${segmentTitle}`, 4000);
    } catch (error) {
      console.error('[Segment] Start error:', error);
      addNotification('error', 'Failed to start new race segment.', 8000);
    } finally {
      segmentTransitionRef.current = false;
      setSegmentProcessing(false);
    }
  };

  const startFirstSegment = async () => {
    if (!activeSession || !autoSegmentEnabled) return;

    const race = await resolveSegmentRace();
    const segmentTitle = buildSegmentTitle(race.label);

    try {
      const newSegment = await livestreamStorage.createSegment({
        session_id: activeSession.id,
        club_id: activeSession.club_id,
        event_id: activeSession.event_id || undefined,
        race_number: race.raceNumber,
        heat_number: activeSession.heat_number || undefined,
        segment_title: segmentTitle,
        cloudflare_input_id: activeSession.cloudflare_live_input_id || undefined,
        segment_start_time: new Date().toISOString(),
        upload_status: 'pending',
        trigger_type: 'race_scored',
      });

      setCurrentSegment(newSegment);
      setSegmentCount(1);

      await livestreamStorage.updateSession(activeSession.id, {
        auto_segment_enabled: true,
        current_race_number: race.raceNumber,
        current_segment_start: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Segment] Failed to create first segment:', error);
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      const streamToShow = activePreviewStream || mediaStream;
      if (streamToShow && videoRef.current.srcObject !== streamToShow) {
        videoRef.current.srcObject = streamToShow;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [activePreviewStream, mediaStream]);

  useEffect(() => {
    const primaryCamera = cameras.find(c => c.is_primary);
    if (!primaryCamera) return;
    if (primaryCamera.camera_type === 'laptop') {
      setActivePreviewStream(mediaStream);
    } else if (primaryCamera.camera_type === 'mobile') {
      const mobileStream = remoteStreams[primaryCamera.id];
      if (mobileStream) setActivePreviewStream(mobileStream);
    }
  }, [cameras, mediaStream, remoteStreams]);

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const whipResourceUrlRef = useRef<string | null>(null);

  const startWhipStreaming = async (whipUrl: string, streamToSend: MediaStream): Promise<boolean> => {
    try {
      setWhipStatus('connecting');
      if (whipPeerConnectionRef.current) { whipPeerConnectionRef.current.close(); whipPeerConnectionRef.current = null; }
      whipResourceUrlRef.current = null;

      const liveTracks = streamToSend.getTracks().filter(t => t.readyState === 'live' && t.enabled);
      const hasVideo = liveTracks.some(t => t.kind === 'video');
      const hasAudio = liveTracks.some(t => t.kind === 'audio');
      if (!hasVideo) {
        console.error('[WHIP] No live video track available');
        addNotification('error', 'No video source detected. Please check your camera.', 5000);
        setWhipStatus('error');
        return false;
      }
      console.log(`[WHIP] Sending ${liveTracks.length} tracks (video: ${hasVideo}, audio: ${hasAudio})`);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require'
      });
      whipPeerConnectionRef.current = pc;

      pc.onconnectionstatechange = () => {
        console.log('[WHIP] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') { setWhipStatus('connected'); addNotification('success', 'Connected to streaming server', 3000); }
        else if (pc.connectionState === 'failed') { setWhipStatus('error'); addNotification('error', 'Stream connection failed. Attempting reconnect...', 5000); }
        else if (pc.connectionState === 'disconnected') {
          console.warn('[WHIP] Connection disconnected, waiting for recovery...');
          setWhipStatus('connecting');
          setTimeout(() => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              console.warn('[WHIP] Connection did not recover, marking as error');
              setWhipStatus('error');
              addNotification('warning', 'Stream connection lost. Auto-reconnect will be attempted.', 5000);
            }
          }, 5000);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WHIP] ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          setWhipStatus('error');
          addNotification('error', 'ICE connection failed. Check your network.', 5000);
        }
      };

      liveTracks.forEach(track => {
        const transceiver = pc.addTransceiver(track, { direction: 'sendonly', streams: [streamToSend] });
        if (track.kind === 'video') {
          try {
            const codecs = RTCRtpSender.getCapabilities('video')?.codecs;
            if (codecs) {
              const h264Codecs = codecs.filter(c => c.mimeType === 'video/H264');
              const otherCodecs = codecs.filter(c => c.mimeType !== 'video/H264');
              if (h264Codecs.length > 0) transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
            }
          } catch {}
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); }
        else {
          const checkState = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); } };
          pc.addEventListener('icegatheringstatechange', checkState);
          setTimeout(() => { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); }, 5000);
        }
      });
      const localDescription = pc.localDescription;
      if (!localDescription) throw new Error('No local description after ICE gathering');
      console.log('[WHIP] Sending offer to:', whipUrl);
      console.log('[WHIP] SDP offer length:', localDescription.sdp?.length, 'bytes');
      const response = await fetch(whipUrl, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: localDescription.sdp });
      console.log('[WHIP] Response status:', response.status);
      console.log('[WHIP] Response headers - Location:', response.headers.get('Location'));
      console.log('[WHIP] Response headers - Content-Type:', response.headers.get('Content-Type'));
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[WHIP] Server error:', response.status, errorText);
        throw new Error(`WHIP server error: ${response.status} ${errorText}`);
      }
      const resourceUrl = response.headers.get('Location');
      if (resourceUrl) {
        whipResourceUrlRef.current = resourceUrl.startsWith('http') ? resourceUrl : new URL(resourceUrl, whipUrl).href;
        console.log('[WHIP] Resource URL for teardown:', whipResourceUrlRef.current);
      } else {
        whipResourceUrlRef.current = whipUrl;
        console.log('[WHIP] No Location header (CORS may block it), using WHIP URL as fallback:', whipUrl);
      }
      const answerSdp = await response.text();
      console.log('[WHIP] Received answer SDP length:', answerSdp.length, 'bytes');
      if (!answerSdp || answerSdp.length < 50) {
        console.error('[WHIP] Answer SDP appears invalid:', answerSdp.substring(0, 200));
        throw new Error('Invalid SDP answer from WHIP server');
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      console.log('[WHIP] Remote description set. Waiting for connection...');

      const connected = await new Promise<boolean>((resolve) => {
        if (pc.connectionState === 'connected') { resolve(true); return; }
        const timeout = setTimeout(() => {
          console.warn('[WHIP] Connection timeout after 10s. State:', pc.connectionState, 'ICE:', pc.iceConnectionState);
          resolve(pc.connectionState === 'connected');
        }, 10000);
        const handler = () => {
          if (pc.connectionState === 'connected') {
            clearTimeout(timeout);
            pc.removeEventListener('connectionstatechange', handler);
            resolve(true);
          } else if (pc.connectionState === 'failed') {
            clearTimeout(timeout);
            pc.removeEventListener('connectionstatechange', handler);
            resolve(false);
          }
        };
        pc.addEventListener('connectionstatechange', handler);
      });

      if (!connected) {
        console.error('[WHIP] Connection failed to establish. Final state:', pc.connectionState);
        pc.close();
        whipPeerConnectionRef.current = null;
        setWhipStatus('error');
        return false;
      }

      console.log('[WHIP] Connection established successfully!');
      return true;
    } catch (error) {
      console.error('[WHIP] Error:', error);
      setWhipStatus('error');
      if (whipPeerConnectionRef.current) { whipPeerConnectionRef.current.close(); whipPeerConnectionRef.current = null; }
      return false;
    }
  };

  const stopWhipStreaming = async () => {
    if (whipPeerConnectionRef.current) {
      const pc = whipPeerConnectionRef.current;
      try {
        const senders = pc.getSenders();
        for (const sender of senders) {
          const stats = await sender.getStats();
          stats.forEach((report: any) => {
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              console.log(`[WHIP] Video stats before close - bytes: ${report.bytesSent}, packets: ${report.packetsSent}, frames: ${report.framesEncoded}`);
            }
          });
        }
      } catch {}
    }
    if (whipResourceUrlRef.current) {
      try {
        console.log('[WHIP] Sending DELETE to resource URL:', whipResourceUrlRef.current);
        const deleteResp = await fetch(whipResourceUrlRef.current, { method: 'DELETE' }).catch((e) => {
          console.warn('[WHIP] DELETE request failed:', e);
          return null;
        });
        if (deleteResp) {
          console.log('[WHIP] DELETE response status:', deleteResp.status);
        }
      } catch {}
      whipResourceUrlRef.current = null;
    }
    if (whipPeerConnectionRef.current) { whipPeerConnectionRef.current.close(); whipPeerConnectionRef.current = null; }
    setWhipStatus('disconnected');
    lastBytesSentRef.current = 0;
  };

  const startLocalRecording = (stream: MediaStream) => {
    try {
      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.start(2000);
      mediaRecorderRef.current = recorder;
      console.log('[LocalRec] Started recording with', mimeType);
    } catch (e) {
      console.warn('[LocalRec] MediaRecorder not available:', e);
    }
  };

  const stopLocalRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        const chunks = recordedChunksRef.current;
        if (chunks.length > 0) {
          resolve(new Blob(chunks, { type: chunks[0].type || 'video/webm' }));
        } else {
          resolve(null);
        }
        mediaRecorderRef.current = null;
        return;
      }
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        if (chunks.length > 0) {
          resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
        } else {
          resolve(null);
        }
        mediaRecorderRef.current = null;
      };
      recorder.stop();
    });
  };

  const uploadLocalRecording = async (blob: Blob, segmentId: string, clubId: string): Promise<string | null> => {
    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const path = `${clubId}/${segmentId}.${ext}`;
      const { error } = await supabase.storage
        .from('livestream-recordings')
        .upload(path, blob, { contentType: blob.type, upsert: true });
      if (error) { console.error('[LocalRec] Upload error:', error); return null; }
      console.log(`[LocalRec] Uploaded ${(blob.size / 1024 / 1024).toFixed(1)}MB to ${path}`);
      await supabase
        .from('livestream_race_segments')
        .update({ local_recording_path: path, updated_at: new Date().toISOString() })
        .eq('id', segmentId);
      return path;
    } catch (e) {
      console.error('[LocalRec] Upload failed:', e);
      return null;
    }
  };

  const reconnectToLiveSession = async (session: LivestreamSession) => {
    try {
      const stream = await requestCameraAccess();
      if (!stream) return;
      if (session.status === 'live' && session.streaming_mode === 'cloudflare_relay' && session.cloudflare_whip_url) {
        await new Promise(r => setTimeout(r, 500));
        const reconnectStream = compositedStreamRef.current || stream;
        const whipSuccess = await startWhipStreaming(session.cloudflare_whip_url, reconnectStream);
        if (whipSuccess) {
          addNotification('success', 'Reconnected to live stream!', 4000);
        } else {
          setIsPaused(true);
          addNotification('warning', 'Reconnected locally but cloud relay is paused. Click Resume to re-enable.', 6000);
        }
      }
    } catch (error) {
      console.error('Error reconnecting to session:', error);
    }
  };

  const loadSpecificSession = async (id: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('livestream_sessions').select('*').eq('id', id).single();
      if (error) throw error;
      if (data) {
        const enriched = await enrichSessionsWithVenueData([data]);
        setActiveSession(enriched[0] || data);
        updateStreamStatus(data.status);
        loadCameras(data.id);
        loadSessions();
        if (data.status === 'live' || data.status === 'testing') {
          reconnectToLiveSession(data);
        }
      }
    } catch (error) { console.error('Error loading session:', error); }
    finally { setLoading(false); }
  };

  const loadSessions = async () => {
    try {
      const data = await livestreamStorage.getSessions(clubId);
      const sessionsWithVenues = await enrichSessionsWithVenueData(data);
      setSessions(sessionsWithVenues);
    }
    catch (error) { console.error('Error loading sessions:', error); }
    finally { setLoading(false); }
  };

  // Venue photo + host club for the title card, hold screen and race videos. State/national events
  // carry a venue_id (below); club events and series rounds name their venue, so those are looked up by name.
  const enrichSessionsWithVenueData = async (sessionList: LivestreamSession[]): Promise<SessionWithVenue[]> => {
    const withPublic = await enrichPublicEventVenues(sessionList);
    const { resolveLiveEvents } = await import('../../utils/liveEventInfo');
    const ids = withPublic.map(s => s.event_id).filter((id): id is string => !!id);
    if (ids.length === 0) return withPublic;
    const meta = await resolveLiveEvents(ids, clubId);
    return withPublic.map(s => {
      const m = s.event_id ? meta.get(s.event_id) : undefined;
      if (!m) return s;
      return {
        ...s,
        venueImage: s.venueImage || m.venueImage || undefined,
        venueName: s.venueName || m.venueName || undefined,
        hostClubName: m.clubName || undefined,
        hostClubLogo: m.clubLogo || undefined,
      };
    });
  };

  const enrichPublicEventVenues = async (sessionList: LivestreamSession[]): Promise<SessionWithVenue[]> => {
    const eventIds = sessionList
      .map(s => s.event_id)
      .filter((id): id is string => !!id && !id.includes('-round-') && !id.includes('-day-'));

    const compoundEventIds = sessionList
      .map(s => s.event_id)
      .filter((id): id is string => !!id && (id.includes('-round-') || id.includes('-day-')));
    const baseEventIds = compoundEventIds.map(id => id.replace(/-round-\d+$/, '').replace(/-day-\d+$/, ''));

    const allEventIds = [...new Set([...eventIds, ...baseEventIds])];
    if (allEventIds.length === 0) return sessionList;

    const { data: events } = await supabase
      .from('public_events')
      .select('id, venue_id')
      .in('id', allEventIds);

    if (!events || events.length === 0) return sessionList;

    const venueIds = events.map(e => e.venue_id).filter((id): id is string => !!id);
    if (venueIds.length === 0) return sessionList;

    const { data: venues } = await supabase
      .from('venues')
      .select('id, name, image')
      .in('id', [...new Set(venueIds)]);

    if (!venues || venues.length === 0) return sessionList;

    const venueMap = new Map(venues.map(v => [v.id, v]));
    const eventVenueMap = new Map(events.map(e => [e.id, e.venue_id]));

    return sessionList.map(session => {
      if (!session.event_id) return session;
      const baseId = session.event_id.replace(/-round-\d+$/, '').replace(/-day-\d+$/, '');
      const venueId = eventVenueMap.get(session.event_id) || eventVenueMap.get(baseId);
      if (!venueId) return session;
      const venue = venueMap.get(venueId);
      if (!venue) return session;
      return { ...session, venueImage: venue.image || undefined, venueName: venue.name || undefined };
    });
  };

  const checkActiveSession = async () => {
    try {
      const session = await livestreamStorage.getActiveSession(clubId);
      if (session && (session as LivestreamSession).engine === 'cloud') {
        // Cloud broadcasts run from the cloud control room: nothing to start on this device
        if (session.status === 'live') setActiveSession(session);
        return;
      }
      if (session && (session.status === 'live' || session.status === 'testing')) {
        setActiveSession(session);
        updateStreamStatus(session.status);
        loadCameras(session.id);
        reconnectToLiveSession(session);
      }
    } catch (error) { console.error('Error checking active session:', error); }
  };

  const loadCameras = async (sid: string) => {
    try { const data = await livestreamStorage.getCameras(sid); setCameras(data); }
    catch (error) { console.error('Error loading cameras:', error); }
  };

  const updateStreamStatus = (status: string) => {
    if (status === 'live') setStreamStatus('live');
    else if (status === 'testing') setStreamStatus('testing');
    else setStreamStatus('offline');
  };

  const requestCameraAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' }, audio: true
      });
      setMediaStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      return stream;
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
      return null;
    }
  };

  const createNewSession = () => {
    if (autoCreateForEvent) {
      activateStreamForEvent();
    } else {
      setShowNewSheet(true);
    }
  };

  const [activatingStream, setActivatingStream] = useState(false);
  const autoStartPreviewRef = useRef(false);

  useEffect(() => {
    if (autoStartPreviewRef.current && activeSession && streamStatus === 'offline') {
      autoStartPreviewRef.current = false;
      startTestStream();
    }
  }, [activeSession]);

  const activateStreamForEvent = async () => {
    if (!user || !autoCreateForEvent) return;
    setActivatingStream(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) throw new Error('Not authenticated');

      const headers = {
        'Authorization': `Bearer ${authSession.access_token}`,
        'Content-Type': 'application/json',
      };

      const sessionData: Partial<LivestreamSession> = {
        club_id: clubId,
        created_by: user.id,
        title: autoCreateForEvent.eventName,
        description: `Live broadcast for ${autoCreateForEvent.eventName}`,
        event_id: autoCreateForEvent.eventId,
        status: 'draft',
        enable_chat: true,
        enable_overlays: true,
        is_public: true,
        streaming_mode: 'cloudflare_relay',
        overlay_config: {
          showHeatNumber: true,
          showSkippers: true,
          showStandings: true,
          showWeather: true,
          showHandicaps: false,
          position: 'bottom',
          theme: 'dark',
        },
      };

      const cfResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'createLiveInput',
          clubId,
          sessionData: {
            title: autoCreateForEvent.eventName,
            recording: true
          }
        })
      });

      const cfData = await cfResponse.json();

      if (cfResponse.ok && cfData.liveInput) {
        sessionData.cloudflare_live_input_id = cfData.liveInput.uid;
        sessionData.cloudflare_whip_url = cfData.liveInput.webRTC?.url;
        sessionData.cloudflare_whip_playback_url = cfData.liveInput.webRTCPlayback?.url;
        const playbackUrl = cfData.liveInput.webRTCPlayback?.url || cfData.liveInput.rtmpsPlayback?.url || '';
        const customerMatch = playbackUrl.match(/customer-([a-z0-9]+)\./);
        if (customerMatch) {
          sessionData.cloudflare_customer_code = customerMatch[1];
        }
      }

      const session = await livestreamStorage.createSession(sessionData);
      addNotification('success', 'Stream activated - starting preview...', 3000);
      autoStartPreviewRef.current = true;
      setActiveSession(session);
      setSessions([session, ...sessions]);
      await loadCameras(session.id);
    } catch (error) {
      console.error('Error activating stream:', error);
      addNotification('error', 'Failed to activate stream. Please try again.');
    } finally {
      setActivatingStream(false);
    }
  };

  const handleWizardComplete = async (session: LivestreamSession) => {
    setShowSetupWizard(false);
    setActiveSession(session);
    setSessions([session, ...sessions]);
    await loadCameras(session.id);
  };

  const startTestStream = async () => {
    if (!activeSession) return;
    try {
      setStreamStatus('connecting');

      const isRtmpMode = activeSession.stream_input_mode === 'rtmp_external';

      if (isRtmpMode) {
        // RTMP mode: skip local camera - just mark as testing and wait for external signal
        await livestreamStorage.updateSessionStatus(activeSession.id, 'testing');
        setStreamStatus('testing');
        addNotification('info', 'Ready for RTMP input - start streaming from your encoder.', 4000);
        return;
      }

      // Browser mode: request local camera
      const stream = await requestCameraAccess();
      if (!stream) { setStreamStatus('offline'); return; }
      const existingCameras = await livestreamStorage.getCameras(activeSession.id);
      if (existingCameras.length === 0) {
        await livestreamStorage.createCamera({ livestream_session_id: activeSession.id, camera_name: 'Laptop Camera', camera_type: 'laptop', is_primary: true, status: 'connected', position: 0 });
      } else {
        await livestreamStorage.updateCamera(existingCameras[0].id, { status: 'connected' });
      }
      await livestreamStorage.updateSessionStatus(activeSession.id, 'testing');
      setStreamStatus('testing');
      await loadCameras(activeSession.id);
    } catch (error) { console.error('Error starting test stream:', error); setStreamStatus('offline'); alert('Failed to start test stream'); }
  };


  const goLive = async () => {
    if (!activeSession || streamStatus !== 'testing') return;
    try {
      setStreamStatus('connecting');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const actualStartTime = new Date().toISOString();

      const isRtmpMode = activeSession.stream_input_mode === 'rtmp_external';

      if (isRtmpMode) {
        // RTMP mode: OBS/ATEM handles video ingest - just mark as live and wait for signal
        if (activeSession.cloudflare_live_input_id) {
          try {
            const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`;
            await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'ensureRecording',
                clubId: activeSession.club_id,
                sessionData: { liveInputId: activeSession.cloudflare_live_input_id },
              }),
            });
          } catch (e) { console.warn('Could not verify recording mode:', e); }
        }

        const { data: updatedSession, error: updateError } = await supabase
          .from('livestream_sessions').update({ status: 'live', actual_start_time: actualStartTime }).eq('id', activeSession.id).select().single();
        if (updateError) throw updateError;
        setActiveSession(updatedSession);
        setStreamStatus('live');
        addNotification('success', 'Stream is live - waiting for RTMP signal from your encoder...', 6000);

        if (autoSegmentEnabled && updatedSession.event_id) {
          setTimeout(() => startFirstSegment(), 1000);
        }
        return;
      }

      // Browser/WHIP mode: put the intro screen up first, so the very first frame viewers see is the
      // intro (not the camera), and give the compositor a moment to capture it
      if (activeSession.enable_overlays) {
        setTitleCardInstant(true);
        setShowTitleCard(true);
        await new Promise(r => setTimeout(r, 1200));
      }

      // Browser/WHIP mode: use local camera
      let rawStream = activePreviewStream || mediaStream;
      if (!rawStream) { addNotification('error', 'No video source available.', 5000); setStreamStatus('testing'); return; }

      const videoTracks = rawStream.getVideoTracks().filter(t => t.readyState === 'live');
      if (videoTracks.length === 0) {
        console.warn('[GoLive] Active stream has no live video tracks, requesting fresh camera access');
        const freshStream = await requestCameraAccess();
        if (!freshStream || freshStream.getVideoTracks().filter(t => t.readyState === 'live').length === 0) {
          addNotification('error', 'Camera not available. Please check permissions.', 5000);
          setStreamStatus('testing');
          return;
        }
        rawStream = freshStream;
      }
      let streamToSend = rawStream;
      const cs = compositedStreamRef.current;
      if (cs && cs.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) {
        console.log('[GoLive] Using composited stream with overlays');
        streamToSend = cs;
      } else {
        console.log('[GoLive] Using raw camera stream (compositor not ready)');
      }
      if (activeSession.streaming_mode === 'cloudflare_relay' && activeSession.cloudflare_live_input_id) {
        try {
          const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`;
          await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'ensureRecording',
              clubId: activeSession.club_id,
              sessionData: { liveInputId: activeSession.cloudflare_live_input_id },
            }),
          });
        } catch (e) { console.warn('Could not verify recording mode:', e); }
      }
      if (activeSession.streaming_mode === 'cloudflare_relay' && activeSession.cloudflare_whip_url) {
        addNotification('info', 'Connecting to streaming server...', 3000);
        const whipSuccess = await startWhipStreaming(activeSession.cloudflare_whip_url, streamToSend);
        if (!whipSuccess) { addNotification('error', 'Failed to connect to streaming server.', 8000); setStreamStatus('testing'); return; }
        addNotification('success', 'Connected to Cloudflare! Live on AlfieTV.', 4000);
        startLocalRecording(streamToSend);
      }
      const { data: updatedSession, error: updateError } = await supabase
        .from('livestream_sessions').update({ status: 'live', actual_start_time: actualStartTime }).eq('id', activeSession.id).select().single();
      if (updateError) throw updateError;
      setActiveSession(updatedSession); setStreamStatus('live');
      addNotification('success', 'Stream is now live!', 5000);
      setShowTitleCard(true);
      setTimeout(() => { setShowTitleCard(false); setTitleCardInstant(false); }, 10000);
      if (autoSegmentEnabled && updatedSession.event_id) {
        setTimeout(() => startFirstSegment(), 1000);
      }
    } catch (error) { console.error('Error going live:', error); setShowTitleCard(false); setTitleCardInstant(false); setStreamStatus('testing'); await stopWhipStreaming(); alert('Failed to go live.'); }
  };

  const pauseResumeInProgressRef = useRef(false);

  const pauseBroadcast = async () => {
    if (!activeSession || streamStatus !== 'live' || pauseResumeInProgressRef.current) return;
    pauseResumeInProgressRef.current = true;
    try {
      await stopWhipStreaming();
      setIsPaused(true);
      await livestreamStorage.updateSession(activeSession.id, { is_paused: true });
      addNotification('info', 'Broadcast paused. Viewers will see a hold screen.', 4000);
    } catch (error) {
      console.error('Error pausing broadcast:', error);
      addNotification('error', 'Failed to pause broadcast.', 5000);
    } finally {
      pauseResumeInProgressRef.current = false;
    }
  };

  const resumeBroadcast = async () => {
    if (!activeSession || streamStatus !== 'live' || !isPaused || pauseResumeInProgressRef.current) return;
    pauseResumeInProgressRef.current = true;
    try {
      let rawStream = activePreviewStream || mediaStream;
      if (!rawStream || rawStream.getVideoTracks().filter(t => t.readyState === 'live').length === 0) {
        const newStream = await requestCameraAccess();
        if (!newStream) {
          addNotification('error', 'No video source available.', 5000);
          pauseResumeInProgressRef.current = false;
          return;
        }
        rawStream = newStream;
      }

      if (videoRef.current) {
        if (videoRef.current.srcObject !== rawStream) {
          videoRef.current.srcObject = rawStream;
        }
        videoRef.current.play().catch(() => {});
      }

      let streamToSend = rawStream;
      const cs = compositedStreamRef.current;
      if (cs && cs.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)) {
        streamToSend = cs;
        console.log('[Resume] Using composited stream with', cs.getVideoTracks().length, 'video tracks');
      } else {
        console.log('[Resume] Using raw camera stream (composited has no live tracks)');
      }

      if (activeSession.streaming_mode === 'cloudflare_relay' && activeSession.cloudflare_whip_url) {
        addNotification('info', 'Reconnecting to streaming server...', 3000);
        let whipSuccess = await startWhipStreaming(activeSession.cloudflare_whip_url, streamToSend);
        if (!whipSuccess) {
          console.warn('[Resume] First WHIP attempt failed, retrying...');
          await new Promise(r => setTimeout(r, 2000));
          whipSuccess = await startWhipStreaming(activeSession.cloudflare_whip_url, streamToSend);
        }
        if (!whipSuccess) {
          addNotification('error', 'Failed to reconnect to streaming server.', 8000);
          pauseResumeInProgressRef.current = false;
          return;
        }
        console.log('[Resume] WHIP connected successfully');
      }

      setIsPaused(false);
      await livestreamStorage.updateSession(activeSession.id, { is_paused: false });
      addNotification('success', 'Broadcast resumed!', 3000);
    } catch (error) {
      console.error('Error resuming broadcast:', error);
      addNotification('error', 'Failed to resume broadcast.', 5000);
    } finally {
      pauseResumeInProgressRef.current = false;
    }
  };

  // Test mode: the broadcast runs for real but stays off AlfieTV and event pages, members
  // aren't notified, and race videos go to YouTube unlisted. Watched from its own link.
  const isTestBroadcast = activeSession?.is_public === false;
  const toggleTestBroadcast = async () => {
    if (!activeSession) return;
    const makeTest = activeSession.is_public !== false;
    if (!makeTest && streamStatus === 'live' && !confirm('Make this broadcast public? It will show in AlfieTV for everyone.')) return;
    try {
      await livestreamStorage.updateSession(activeSession.id, { is_public: !makeTest });
      setActiveSession(prev => (prev ? { ...prev, is_public: !makeTest } : prev));
      addNotification(
        'success',
        makeTest
          ? 'Test mode on: hidden from AlfieTV, and race videos go to YouTube as unlisted.'
          : 'Test mode off: this broadcast shows in AlfieTV when it\'s live.',
        5000
      );
      if (makeTest) setShowTestLink(true);
    } catch (error) {
      console.error('Error changing test mode:', error);
      addNotification('error', 'Could not change test mode. Please try again.');
    }
  };

  const stopTesting = async () => {
    if (!activeSession) return;
    try {
      if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); setMediaStream(null); }
      setActivePreviewStream(null);
      await livestreamStorage.updateSession(activeSession.id, { status: 'scheduled' });
      const sessionCameras = await livestreamStorage.getCameras(activeSession.id);
      for (const camera of sessionCameras) { if (camera.camera_type === 'laptop') await livestreamStorage.updateCamera(camera.id, { status: 'disconnected' }); }
      setStreamStatus('offline');
      addNotification('info', 'Preview stopped', 3000);
      setTimeout(() => setActiveSession(null), 500);
    } catch (error) { console.error('Error stopping test:', error); }
  };

  const stopStream = async () => {
    if (!activeSession) return;
    try {
      const segmentToFinalize = currentSegment;
      const recordingBlob = await stopLocalRecording();
      let localStoragePath: string | null = null;

      if (segmentToFinalize) {
        await livestreamStorage.finalizeSegment(segmentToFinalize.id, 'stream_end');
        const thumbnailSaved = saveSegmentThumbnail(segmentToFinalize);
        if (recordingBlob && recordingBlob.size > 10000) {
          localStoragePath = await uploadLocalRecording(recordingBlob, segmentToFinalize.id, activeSession.club_id);
        }
        await thumbnailSaved;
        livestreamStorage.triggerSegmentProcessing(segmentToFinalize.id).catch(() => {});
        setCurrentSegment(null);
      } else if (recordingBlob && recordingBlob.size > 10000) {
        const fallbackId = crypto.randomUUID();
        const ext = recordingBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const path = `${activeSession.club_id}/${fallbackId}.${ext}`;
        const { error } = await supabase.storage
          .from('livestream-recordings')
          .upload(path, recordingBlob, { contentType: recordingBlob.type, upsert: true });
        if (!error) localStoragePath = path;
      }

      await stopWhipStreaming();
      if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); setMediaStream(null); }
      await livestreamStorage.updateSession(activeSession.id, { status: 'ended', end_time: new Date().toISOString(), is_paused: false });
      setStreamStatus('offline');

      // Only create a session-level archive if no segments were used.
      // When auto-segmentation is active, each race segment gets its own archive
      // via the process-race-segment edge function.
      if (segmentCount === 0) {
        try {
          const archiveData: Record<string, unknown> = {
            session_id: activeSession.id,
            club_id: activeSession.club_id,
            title: activeSession.title,
            description: activeSession.description,
            event_id: activeSession.event_id || null,
            heat_number: activeSession.heat_number || null,
            recorded_at: activeSession.actual_start_time || activeSession.created_at,
            is_public: activeSession.is_public,
          };

          if (localStoragePath) {
            archiveData.source = 'local';
            archiveData.storage_path = localStoragePath;
          } else if (activeSession.cloudflare_live_input_id && activeSession.cloudflare_customer_code) {
            archiveData.source = 'cloudflare';
            archiveData.cloudflare_video_id = activeSession.cloudflare_live_input_id;
            archiveData.cloudflare_customer_code = activeSession.cloudflare_customer_code;
            archiveData.cloudflare_playback_url = `https://customer-${activeSession.cloudflare_customer_code}.cloudflarestream.com/${activeSession.cloudflare_live_input_id}/iframe`;
          }

          await supabase.from('livestream_archives').insert(archiveData);
        } catch (archiveErr) {
          console.error('Error creating archive record:', archiveErr);
        }
      }

      addNotification('success', 'Stream ended. Recording saved to replays.', 3000);
      setTimeout(() => setActiveSession(null), 500);
    } catch (error) { console.error('Error stopping stream:', error); }
  };

  const removeCamera = async (cameraId: string) => {
    if (!activeSession) return;
    try {
      const cameraToRemove = cameras.find(c => c.id === cameraId);
      if (cameraToRemove?.is_primary && cameras.length > 1) {
        const otherCamera = cameras.find(c => c.id !== cameraId);
        if (otherCamera) await livestreamStorage.setPrimaryCamera(activeSession.id, otherCamera.id);
      }
      if (remoteStreams[cameraId]) { setRemoteStreams(prev => { const updated = { ...prev }; delete updated[cameraId]; return updated; }); }
      await livestreamStorage.deleteCamera(cameraId);
      setCameras(cameras.filter(c => c.id !== cameraId));
      addNotification('success', 'Camera removed', 2000);
    } catch (error) { console.error('Error removing camera:', error); addNotification('error', 'Failed to remove camera', 3000); }
  };

  const replaceWhipTracks = async (newStream: MediaStream) => {
    const pc = whipPeerConnectionRef.current;
    if (!pc || pc.connectionState !== 'connected') return;

    const senders = pc.getSenders();
    for (const sender of senders) {
      if (!sender.track) continue;
      const newTrack = newStream.getTracks().find(
        t => t.kind === sender.track!.kind && t.readyState === 'live'
      );
      if (newTrack) {
        try {
          await sender.replaceTrack(newTrack);
        } catch (e) {
          console.warn(`[WHIP] replaceTrack failed for ${sender.track.kind}, will reconnect`, e);
          if (activeSession?.cloudflare_whip_url) {
            await stopWhipStreaming();
            await new Promise(r => setTimeout(r, 500));
            await startWhipStreaming(activeSession.cloudflare_whip_url, newStream);
          }
          return;
        }
      }
    }
    lastBytesSentRef.current = 0;
  };

  const handleSwitchCamera = async (cameraId: string, opts?: { quiet?: boolean }) => {
    if (!activeSession) return;
    try {
      await livestreamStorage.setPrimaryCamera(activeSession.id, cameraId);
      const targetCamera = cameras.find(c => c.id === cameraId);
      let newStream: MediaStream | null = null;
      if (targetCamera) {
        if (targetCamera.camera_type === 'laptop') {
          newStream = mediaStream;
          setActivePreviewStream(mediaStream);
        } else if (targetCamera.camera_type === 'mobile') {
          const mobileStream = remoteStreams[cameraId];
          if (mobileStream) {
            newStream = mobileStream;
            setActivePreviewStream(mobileStream);
          }
        }
      }

      if (newStream && streamStatus === 'live' && whipStatus === 'connected') {
        await new Promise(r => setTimeout(r, 300));
        const whipStream = compositedStreamRef.current || newStream;
        await replaceWhipTracks(whipStream);
      }

      await loadCameras(activeSession.id);
      if (!opts?.quiet) addNotification('success', 'Camera switched', 2000);
    } catch (error) { console.error('Error switching camera:', error); addNotification('error', 'Failed to switch camera', 3000); }
  };

  const deleteSession = async (session: SessionWithVenue) => {
    try {
      await livestreamStorage.deleteSession(session.id);
      setSessions(sessions.filter(s => s.id !== session.id));
      if (activeSession?.id === session.id) { setActiveSession(null); setStreamStatus('offline'); }
      addNotification('success', 'Stream deleted', 3000);
    } catch (error) { console.error('Error deleting session:', error); addNotification('error', 'Failed to delete stream', 5000); }
  };

  const primaryCamera = cameras.find(c => c.is_primary);

  // Report to compact on-air controls (scoring dock) and let them act on the studio
  // (a cloud broadcast's control room reports and acts for itself)
  const isCloudSession = activeSession?.engine === 'cloud';
  if (controlsRef && !isCloudSession) {
    controlsRef.current = {
      hold: pauseBroadcast,
      resume: resumeBroadcast,
      cutTo: handleSwitchCamera,
      showTitle: () => setTitleCardTrigger(prev => prev + 1),
    };
  }
  useEffect(() => {
    if (!onSnapshot || isCloudSession) return;
    onSnapshot({
      sessionId: activeSession?.id ?? null,
      title: activeSession?.title ?? null,
      status: streamStatus,
      isPaused,
      isTest: activeSession?.is_public === false,
      startedAt: activeSession?.actual_start_time ?? null,
      viewerCount,
      link: whipStatus,
      programStream: (isCompositing && compositedStream) ? compositedStream : (activePreviewStream || mediaStream),
      cameras: cameras.map(c => ({
        id: c.id,
        name: c.camera_name,
        type: c.camera_type,
        status: c.status,
        isProgram: !!c.is_primary,
        stream: c.camera_type === 'laptop' ? mediaStream : (remoteStreams[c.id] ?? null),
      })),
      autoRecord: autoSegmentEnabled,
      recordingRace: currentSegment?.race_number ?? null,
      recordingSince: currentSegment?.segment_start_time ?? null,
      uploading: segmentProcessing,
    });
  }, [onSnapshot, isCloudSession, activeSession?.id, activeSession?.title, activeSession?.is_public, activeSession?.actual_start_time,
      streamStatus, isPaused, viewerCount, whipStatus, isCompositing, compositedStream, activePreviewStream, mediaStream,
      cameras, remoteStreams, autoSegmentEnabled, currentSegment, segmentProcessing]);

  // ── Control room (livestream board "Control room") ──
  const [scoring, setScoring] = useState<OverlayScoringSummary | null>(null);
  useEffect(() => { scoringRef.current = scoring; }, [scoring]);

  useEffect(() => {
    if (!activeSession?.id) { setVenueInfo({}); return; }
    let cancelled = false;
    enrichSessionsWithVenueData([activeSession]).then(([s]) => {
      if (cancelled || !s) return;
      setVenueInfo({ venueImage: s.venueImage, venueName: s.venueName, hostClubName: s.hostClubName, hostClubLogo: s.hostClubLogo });
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, activeSession?.event_id]);
  const [resultsTrigger, setResultsTrigger] = useState(0);
  const [autoDirector, setAutoDirector] = useState(false);
  const [nextCutAt, setNextCutAt] = useState<number | null>(null);
  const [raceVideos, setRaceVideos] = useState<LivestreamRaceSegment[]>([]);
  const controlRoomRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fullscreenApiRef = useRef(false);
  // Below 1200px wide (iPad, scoring console) the settings panel opens as a drawer over the program
  const [roomWidth, setRoomWidth] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setScoring(null);
    setAutoDirector(false);
    setRaceVideos([]);
  }, [activeSession?.id]);

  // Cameras with a picture right now, in list order, and the one after the program camera
  const canAir = (camera: LivestreamCamera) =>
    camera.camera_type === 'laptop' ? !!mediaStream : !!remoteStreams[camera.id];
  const airCameras = cameras.filter(canAir);
  const programIndex = airCameras.findIndex(c => c.is_primary);
  const nextCamera = airCameras.length === 0 || (airCameras.length === 1 && programIndex === 0)
    ? null
    : airCameras[(programIndex + 1) % airCameras.length];

  // Auto director: while racing, cut to the next camera every 45 seconds (opt-in, off by default)
  const racingNow = !activeSession?.event_id || !scoring || scoring.status === 'live' || scoring.status === 'in_progress';
  const autoDirectorOn = autoDirector && streamStatus === 'live' && !isPaused && racingNow && !!nextCamera;
  const switchCameraRef = useRef(handleSwitchCamera);
  switchCameraRef.current = handleSwitchCamera;
  const nextCameraRef = useRef(nextCamera);
  nextCameraRef.current = nextCamera;
  useEffect(() => {
    if (!autoDirectorOn) { setNextCutAt(null); return; }
    let due = Date.now() + AUTO_DIRECTOR_MS;
    setNextCutAt(due);
    const timer = setInterval(() => {
      if (Date.now() < due) return;
      due = Date.now() + AUTO_DIRECTOR_MS;
      setNextCutAt(due);
      const next = nextCameraRef.current;
      if (next) switchCameraRef.current(next.id, { quiet: true });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoDirectorOn, primaryCamera?.id]);

  // Race videos for this broadcast (one per race), refreshed while the room is open
  useEffect(() => {
    if (!activeSession?.id) return;
    let cancelled = false;
    const load = () => livestreamStorage.getSegments(activeSession.id)
      .then(list => { if (!cancelled) setRaceVideos(list); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeSession?.id, currentSegment?.id, segmentProcessing]);

  useEffect(() => {
    const el = controlRoomRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setRoomWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeSession?.id, loading]);

  // Number keys 1-9 cut to that camera, only while this room is on screen and nothing is being typed
  useEffect(() => {
    if (!activeSession || streamStatus === 'offline') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || !/^[1-9]$/.test(e.key)) return;
      const root = controlRoomRef.current;
      if (!root || root.closest('[inert]') || root.closest('.alv-console-hidden')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (target && target !== document.body && !root.contains(target)) return;
      const camera = cameras[Number(e.key) - 1];
      if (!camera || camera.is_primary || !canAir(camera)) return;
      e.preventDefault();
      switchCameraRef.current(camera.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSession?.id, streamStatus, cameras, mediaStream, remoteStreams]);

  // Full screen program: the browser's full screen where it has one, otherwise fill the window
  useEffect(() => {
    const onChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const el = document.fullscreenElement || doc.webkitFullscreenElement || null;
      if (fullscreenApiRef.current && !el) { fullscreenApiRef.current = false; setIsFullscreen(false); }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  const toggleFullscreen = async () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
    if (isFullscreen) {
      if (fullscreenApiRef.current && (document.fullscreenElement || doc.webkitFullscreenElement)) {
        try { if (document.exitFullscreen) await document.exitFullscreen(); else doc.webkitExitFullscreen?.(); } catch { /* already closed */ }
      }
      fullscreenApiRef.current = false;
      setIsFullscreen(false);
      return;
    }
    const el = stageRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    try {
      if (el?.requestFullscreen) { await el.requestFullscreen(); fullscreenApiRef.current = true; }
      else if (el?.webkitRequestFullscreen) { el.webkitRequestFullscreen(); fullscreenApiRef.current = true; }
    } catch { fullscreenApiRef.current = false; }
    setIsFullscreen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!activeSession) {
    const openSession = (session: SessionWithVenue) => {
      if (session.engine === 'cloud') {
        // Cloud broadcasts run from the cloud control room
        setActiveSession(session);
        return;
      }
      if (session.status === 'ended') {
        setActiveSession({ ...session, _viewOnly: true } as any);
      } else {
        setActiveSession(session);
      }
      updateStreamStatus(session.status);
      loadCameras(session.id);
    };
    return (
      <div>
        <LiveHome
          sessions={sessions}
          autoCreateForEvent={autoCreateForEvent}
          activating={activatingStream}
          onOpen={openSession}
          onNew={createNewSession}
          onDelete={(session) => { setSessionToDelete(session); setShowDeleteConfirm(true); }}
        />

        {showSetupWizard && (
          <LivestreamSetupWizard clubId={clubId} onClose={() => setShowSetupWizard(false)} onComplete={handleWizardComplete} />
        )}
        {showNewSheet && (
          <NewBroadcastSheet
            clubId={clubId}
            onClose={() => setShowNewSheet(false)}
            onCreated={(created) => {
              setShowNewSheet(false);
              if (created.engine === 'cloud') {
                // Straight into the cloud control room (add cameras, then go live)
                setSessions(prev => [created as SessionWithVenue, ...prev]);
                setActiveSession(created);
                return;
              }
              handleWizardComplete(created);
            }}
          />
        )}
        {showDeleteConfirm && sessionToDelete && (
          <ConfirmationModal
            isOpen={true}
            onClose={() => { setShowDeleteConfirm(false); setSessionToDelete(null); }}
            onConfirm={async () => { await deleteSession(sessionToDelete); setShowDeleteConfirm(false); setSessionToDelete(null); }}
            title="Delete Stream" message={`Are you sure you want to delete "${sessionToDelete.title}"?`} confirmText="Delete" confirmStyle="danger"
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTROL ROOM (active session), livestream board "Control room"
  // ═══════════════════════════════════════════════════════════════

  if (activeSession.engine === 'cloud') {
    return (
      <>
        <CloudControlRoom
          session={{ ...activeSession, ...venueInfo } as SessionWithVenue}
          clubId={clubId}
          onBack={() => setActiveSession(null)}
          onSessionChange={(updated) => {
            setActiveSession(updated);
            setSessions(prev => prev.map(x => (x.id === updated.id ? { ...x, ...updated } : x)));
          }}
          onDelete={() => { setSessionToDelete(activeSession as SessionWithVenue); setShowDeleteConfirm(true); }}
          onSnapshot={onSnapshot}
          controlsRef={controlsRef}
        />
        {showDeleteConfirm && sessionToDelete && (
          <ConfirmationModal isOpen={true} onClose={() => { setShowDeleteConfirm(false); setSessionToDelete(null); }} onConfirm={async () => { await deleteSession(sessionToDelete); setShowDeleteConfirm(false); setSessionToDelete(null); }} title="Delete Stream" message={`Are you sure you want to delete "${sessionToDelete.title}"?`} confirmText="Delete" confirmStyle="danger" />
        )}
      </>
    );
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const venueName = venueInfo.venueName || (activeSession as SessionWithVenue).venueName;
  const venueImage = venueInfo.venueImage || (activeSession as SessionWithVenue).venueImage;
  const isEnded = activeSession.status === 'ended';
  const isOn = streamStatus === 'live' || streamStatus === 'testing';
  const phoneCount = cameras.filter(c => c.camera_type === 'mobile').length;
  const hasLaptop = cameras.some(c => c.camera_type === 'laptop');
  const sourceSummary = activeSession.stream_input_mode === 'rtmp_external'
    ? 'Streaming encoder'
    : phoneCount && hasLaptop ? (phoneCount === 1 ? 'Phone and laptop' : 'Phones and laptop')
    : phoneCount ? (phoneCount === 1 ? 'Phone camera' : `${phoneCount} phone cameras`)
    : hasLaptop ? 'Laptop camera' : '';
  const subtitle = [venueName, sourceSummary, isTestBroadcast ? 'Test broadcast' : null].filter(Boolean).join(' · ');

  const relay = activeSession.streaming_mode === 'cloudflare_relay';
  const health: { tone: string; text: string } | null = streamStatus !== 'live' || !relay ? null
    : isPaused ? { tone: 'is-warn', text: 'On hold' }
    : whipStatus === 'connected' ? { tone: '', text: sendMbps ? `Stream healthy · ${sendMbps.toFixed(1)} Mb/s` : 'Stream healthy' }
    : whipStatus === 'connecting' ? { tone: 'is-warn', text: 'Connecting to AlfieTV' }
    : { tone: 'is-bad', text: 'Stream dropped, reconnecting' };

  const playlistId = raceVideos.find(v => v.youtube_playlist_id)?.youtube_playlist_id;
  const nextIndex = nextCamera ? cameras.findIndex(c => c.id === nextCamera.id) + 1 : 0;
  const nextStream = nextCamera ? (nextCamera.camera_type === 'laptop' ? mediaStream : remoteStreams[nextCamera.id]) : null;
  const cutIn = nextCutAt ? Math.max(0, Math.ceil((nextCutAt - Date.now()) / 1000)) : null;
  const overlaysOn = !!activeSession.enable_overlays;

  const drawerMode = roomWidth > 0 && roomWidth <= 1200;
  const sideOpen = drawerMode ? drawerOpen : showInspector;
  const toggleSide = () => (drawerMode ? setDrawerOpen(v => !v) : setShowInspector(v => !v));

  const leaveControlRoom = () => {
    if (streamStatus === 'live' || streamStatus === 'testing') {
      if (confirm('Stream is active. Close this view? The stream will continue.')) setActiveSession(null);
    } else setActiveSession(null);
  };
  const endBroadcast = () => {
    if (confirm('End the broadcast? It stops for everyone watching.')) stopStream();
  };

  return (
    <div ref={controlRoomRef} className="alv alv-crq">
    <div className="alv-cr">
      {/* ── Top bar: title, on-air state, health, viewers, scoring, actions ── */}
      <header className="alv-cr-top">
        <button type="button" className="alv-cr-back" onClick={leaveControlRoom} aria-label="Back to broadcasts" title="Back to broadcasts">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="alv-cr-title">
          <h2 className="alv-disp" title={activeSession.title}>{activeSession.title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>

        <div className="alv-cr-state">
          {streamStatus === 'live' ? (
            <span className="alv-cr-onair"><span className="pulse" aria-hidden="true" />{isTestBroadcast ? 'LIVE · TEST' : 'LIVE'}<span className="alv-mono">{formatDuration(streamDuration)}</span></span>
          ) : streamStatus === 'testing' ? (
            <span className="alv-cr-onair is-preview">PREVIEW</span>
          ) : streamStatus === 'connecting' ? (
            <span className="alv-cr-onair is-connecting"><Loader2 className="w-3.5 h-3.5 animate-spin" />CONNECTING</span>
          ) : (
            <span className="alv-cr-onair is-idle">{isEnded ? 'ENDED' : 'STANDBY'}</span>
          )}
          {health && <span className={`alv-cr-chip ${health.tone}`} title={isCompositing ? 'Overlays are on the stream' : undefined}><span className="dot" />{health.text}</span>}
          {streamStatus === 'live' && <span className="alv-cr-chip"><Eye className="w-4 h-4" aria-hidden="true" />{viewerCount} watching</span>}
          {activeSession.event_id && scoring && (
            <span className="alv-cr-chip is-scoring">Scoring: {scoring.race}{scoring.label ? ` · ${scoring.label.toLowerCase()}` : ''}</span>
          )}
        </div>

        <div className="alv-cr-actions">
          {!isEnded && streamStatus !== 'connecting' && (
            <button
              type="button"
              onClick={toggleTestBroadcast}
              aria-pressed={isTestBroadcast}
              title={isTestBroadcast
                ? 'Test mode is on: hidden from AlfieTV and events, members not notified, race videos unlisted on YouTube. Click to make it public.'
                : 'Run this broadcast as a test: hidden from AlfieTV and events, watched from its own link.'}
              className={`alv-btn is-small ${isTestBroadcast ? 'is-test' : ''}`}
            >
              <FlaskConical className="w-4 h-4" aria-hidden="true" />
              {isTestBroadcast ? 'Test on' : 'Test'}
            </button>
          )}
          {!isEnded && isTestBroadcast && (
            <button type="button" onClick={() => setShowTestLink(true)} title="Link and QR code to watch this test in AlfieTV" className="alv-btn is-small">
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Watch
            </button>
          )}
          {streamStatus === 'live' && (
            <span className="alv-cr-auto" title={airCameras.length < 2 ? 'Needs two cameras with a picture' : 'While racing, cut to the next camera every 45 seconds'}>
              <span id="alv-auto-director">Auto<br />director</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoDirector}
                aria-labelledby="alv-auto-director"
                className="alv-sw"
                disabled={airCameras.length < 2 && !autoDirector}
                onClick={() => setAutoDirector(v => !v)}
              />
            </span>
          )}
          {streamStatus === 'offline' && !isEnded && (
            <button type="button" onClick={startTestStream} className="alv-btn is-small alv-btn-p">
              <Camera className="w-4 h-4" aria-hidden="true" />
              Start preview
            </button>
          )}
          {streamStatus === 'testing' && (
            <>
              <button type="button" onClick={stopTesting} className="alv-btn is-small">
                <StopCircle className="w-4 h-4" aria-hidden="true" />
                Stop preview
              </button>
              <button type="button" onClick={goLive} className="alv-btn is-small alv-btn-live">
                <Zap className="w-4 h-4" aria-hidden="true" />
                Go live
              </button>
            </>
          )}
          {streamStatus === 'live' && (
            <button type="button" onClick={endBroadcast} className="alv-btn is-small alv-btn-end">
              <Square className="w-3.5 h-3.5" aria-hidden="true" />
              End broadcast
            </button>
          )}
          {streamStatus === 'offline' && (
            <button type="button" className="alv-ib" onClick={() => { setSessionToDelete(activeSession); setShowDeleteConfirm(true); }} aria-label="Delete broadcast" title="Delete broadcast">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="button" className="alv-ib" onClick={() => setShowAnalytics(true)} aria-label="Analytics" title="Analytics">
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={`alv-ib ${sideOpen ? 'is-on' : ''}`}
            onClick={toggleSide}
            aria-pressed={sideOpen}
            aria-label="Overlays, output and details panel"
            title="Overlays, output and details"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className={`alv-cr-body ${sideOpen ? '' : 'no-side'}`}>
        {/* ── Cameras ── */}
        <aside className="alv-cr-panel alv-cr-cams" aria-label="Cameras">
          <div className="alv-cr-head">
            <span className="alv-eyebrow">Cameras · {cameras.length}</span>
            <div className="flex items-center gap-1">
              <button type="button" className="alv-ib is-xs" onClick={forceReconnectMobileCameras} aria-label="Reconnect phone cameras" title="Reconnect phone cameras">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {!isEnded && <button
                type="button"
                className="alv-btn is-xs"
                onClick={() => setShowMobileQR(true)}
                disabled={streamStatus === 'offline'}
                title={streamStatus === 'offline' ? 'Start the preview first, then add phones' : 'Add a phone or iPad as a camera'}
                aria-label="Add a camera"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="lbl">Add</span>
              </button>}
            </div>
          </div>
          <div className="alv-cr-camlist">
            {cameras.map((camera, index) => {
              const isProgram = !!camera.is_primary;
              const ready = canAir(camera);
              const connected = camera.status === 'connected' || camera.status === 'streaming';
              const isNext = isOn && !isProgram && nextCamera?.id === camera.id;
              const isLaptop = camera.camera_type === 'laptop';
              const stream = isLaptop ? mediaStream : remoteStreams[camera.id];
              const bars = ready ? 4 : connected ? 2 : 0;
              return (
                <div key={camera.id} className={`alv-cr-cam ${isProgram ? 'is-program' : ''} ${isNext ? 'is-next' : ''} ${ready ? '' : 'is-off'}`}>
                  <button
                    type="button"
                    className="th"
                    onClick={() => ready && !isProgram && handleSwitchCamera(camera.id)}
                    disabled={!ready || isProgram}
                    aria-label={isProgram ? `${camera.camera_name} is on program` : ready ? `Cut to ${camera.camera_name}` : `${camera.camera_name} has no picture yet`}
                  >
                    {stream ? (
                      <VideoThumbnail stream={stream} muted={isLaptop} />
                    ) : (
                      <span className="empty">{isLaptop ? <Monitor className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}</span>
                    )}
                    <span className="n">{index + 1}</span>
                    {isProgram ? <span className="alv-tally is-pgm">{streamStatus === 'live' ? 'PROGRAM' : 'ON'}</span>
                      : isNext ? <span className="alv-tally is-next">NEXT</span>
                      : !ready ? <span className="alv-tally is-off">{connected ? 'JOINING' : 'OFFLINE'}</span>
                      : null}
                  </button>
                  <div className="meta">
                    <span className="name" title={camera.camera_name}>{camera.camera_name}</span>
                    <span className={`alv-bars ${bars === 2 ? 'is-weak' : ''}`} aria-label={ready ? 'Picture coming in' : connected ? 'Joining' : 'Offline'} role="img">
                      {[0, 1, 2, 3].map(b => <i key={b} className={b < bars ? 'on' : ''} style={{ height: 4 + b * 2.7 }} />)}
                    </span>
                    <button
                      type="button"
                      className="alv-ib is-xs"
                      onClick={() => { if (confirm(`Remove "${camera.camera_name}" from this broadcast?`)) removeCamera(camera.id); }}
                      aria-label={`Remove ${camera.camera_name}`}
                      title="Remove camera"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {isOn && cameras.length > 0 && airCameras.length < 2 && (
              <div className="alv-cr-empty">
                Add a phone or iPad as a second camera to cut between shots.
              </div>
            )}
            {cameras.length === 0 && (
              <div className="alv-cr-empty">
                {isEnded
                  ? 'No cameras on this broadcast.'
                  : streamStatus === 'offline'
                  ? 'Start the preview to bring in this device\'s camera, then add phones or iPads.'
                  : 'No cameras yet. Add a phone or iPad with the QR code.'}
              </div>
            )}
          </div>
        </aside>

        {/* ── Program, scenes, next shot, race videos ── */}
        <div className="alv-cr-center">
          <div ref={stageRef} className={`alv-cr-stage ${isFullscreen && !fullscreenApiRef.current ? 'is-full' : ''}`}>
            <div className={`alv-cr-pgm ${streamStatus === 'live' ? 'is-live' : streamStatus === 'testing' ? 'is-preview' : ''}`}>
              {isOn && (
                <span className="alv-cr-pgm-tag">
                  {streamStatus === 'live' ? 'PROGRAM' : 'PREVIEW'}
                  {primaryCamera && <span className="cam">{primaryCamera.camera_name}</span>}
                </span>
              )}
              <video ref={(el) => { (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el; setVideoElReady(el); }} autoPlay muted playsInline />

              {overlaysOn && streamStatus !== 'offline' && (
                <LivestreamOverlayRenderer
                  ref={(el: HTMLDivElement | null) => { (overlayRef as React.MutableRefObject<HTMLDivElement | null>).current = el; setOverlayElReady(el); }}
                  session={activeSession}
                  showTitleCard={showTitleCard}
                  titleCardTrigger={titleCardTrigger}
                  resultsTrigger={resultsTrigger}
                  onScoring={setScoring}
                  venueImage={venueImage}
                  venueName={venueName}
                  hostClubName={venueInfo.hostClubName}
                  hostClubLogo={venueInfo.hostClubLogo}
                  titleCardInstant={titleCardInstant}
                />
              )}

              {isPaused && streamStatus === 'live' && (
                <div className="alv-cr-card">
                  {venueImage && <img src={venueImage} alt="" />}
                  <div>
                    <span className="chip">ON HOLD</span>
                    <h3>Racing will resume shortly</h3>
                    {venueName && <p>{venueName}</p>}
                    <p>Viewers see the hold screen. Press Racing to go back on air.</p>
                  </div>
                </div>
              )}

              {streamStatus === 'offline' && isEnded && (
                <div className="alv-cr-card">
                  {venueImage && <img src={venueImage} alt="" />}
                  <div>
                    <span className="ic"><Square className="w-6 h-6" /></span>
                    <h3>Broadcast ended</h3>
                    {venueName && <p>{venueName}</p>}
                    <p>
                      {activeSession.actual_start_time
                        ? `Streamed on ${new Date(activeSession.actual_start_time).toLocaleDateString()}`
                        : 'This broadcast has ended'}
                      {activeSession.end_time && activeSession.actual_start_time
                        ? ` · ${formatDuration(Math.floor((new Date(activeSession.end_time).getTime() - new Date(activeSession.actual_start_time).getTime()) / 1000))}`
                        : ''}
                    </p>
                  </div>
                </div>
              )}

              {streamStatus === 'offline' && !isEnded && (
                <div className="alv-cr-card">
                  {venueImage && <img src={venueImage} alt="" />}
                  <div>
                    <span className="ic"><Video className="w-6 h-6" /></span>
                    <h3>No picture yet</h3>
                    {venueName && <p>{venueName}</p>}
                    <p>Start the preview to check cameras and overlays before going live.</p>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="alv-cr-full"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Scenes */}
          {!isEnded && (
          <div className="alv-cr-scenes" role="group" aria-label="Scenes">
            <button
              type="button"
              className="alv-scene"
              onClick={() => setTitleCardTrigger(prev => prev + 1)}
              disabled={!isOn || !overlaysOn}
            >
              Title card<small>8 seconds</small>
            </button>
            <button
              type="button"
              className={`alv-scene ${streamStatus === 'live' && !isPaused ? 'is-on' : ''}`}
              aria-pressed={streamStatus === 'live' && !isPaused}
              onClick={resumeBroadcast}
              disabled={streamStatus !== 'live'}
            >
              Racing<small>{autoDirectorOn ? 'Auto director' : activeSession.event_id ? 'Scoring linked' : 'On air'}</small>
            </button>
            <button
              type="button"
              className="alv-scene"
              onClick={() => setResultsTrigger(prev => prev + 1)}
              disabled={!isOn || !overlaysOn || !scoring?.hasResults || activeSession.overlay_config?.showStandings === false}
              title={scoring?.hasResults ? 'Show the last race\'s results for 20 seconds' : 'Available once a race is scored'}
            >
              Results<small>{scoring?.hasResults ? '20 seconds' : 'After a race'}</small>
            </button>
            <button
              type="button"
              className={`alv-scene is-hold ${isPaused ? 'is-on' : ''}`}
              aria-pressed={isPaused}
              onClick={() => (isPaused ? resumeBroadcast() : pauseBroadcast())}
              disabled={streamStatus !== 'live'}
            >
              Hold<small>{isPaused ? 'On · tap to resume' : 'Hold screen'}</small>
            </button>
          </div>
          )}

          {/* Next shot */}
          {isOn && nextCamera && (
            <div className="alv-cr-panel alv-cr-next">
              <div className="th">
                {nextStream && <VideoThumbnail stream={nextStream} muted />}
                <span className="alv-tally is-next">NEXT</span>
              </div>
              <div className="txt">
                <b>{nextCamera.camera_name} is next</b>
                <span>
                  {autoDirectorOn && cutIn !== null ? `Auto director cuts in ${cutIn} s. ` : ''}
                  Press {nextIndex} or Cut. Tap any camera to cut to it.
                </span>
              </div>
              <button type="button" className="alv-btn alv-btn-live" onClick={() => handleSwitchCamera(nextCamera.id)}>
                <Scissors className="w-4 h-4" aria-hidden="true" />
                Cut
              </button>
            </div>
          )}

          {/* Race videos */}
          <div className="alv-cr-panel alv-cr-videos">
            <div className="alv-cr-head">
              <span className="alv-eyebrow">Race videos · {isTestBroadcast ? 'Unlisted on YouTube (test)' : 'Alfie YouTube playlist'}</span>
              {playlistId && !isTestBroadcast && (
                <a className="alv-btn is-xs" href={`https://www.youtube.com/playlist?list=${playlistId}`} target="_blank" rel="noopener noreferrer">Open playlist</a>
              )}
            </div>
            {streamStatus === 'live' && autoSegmentEnabled && (
              <div className="alv-cr-racectl" role="group" aria-label="Race being recorded">
                <span className="lbl">{currentSegment ? 'Recording' : 'Next video'}</span>
                <button type="button" className="alv-btn is-xs" aria-label="Previous race number"
                  disabled={segmentProcessing || (currentSegment?.race_number ?? manualRace ?? 1) <= 1}
                  onClick={() => setRecordingRace((currentSegment?.race_number ?? manualRace ?? 1) - 1)}>−</button>
                <span className="num alv-mono">Race {currentSegment?.race_number ?? manualRace ?? '–'}</span>
                <button type="button" className="alv-btn is-xs" aria-label="Next race number"
                  disabled={segmentProcessing}
                  onClick={() => setRecordingRace((currentSegment?.race_number ?? manualRace ?? 0) + 1)}>+</button>
                <button type="button" className="alv-btn is-xs" disabled={segmentProcessing}
                  title="Save this race's video and start recording the next race (use when races aren't scored in AlfiePRO)"
                  onClick={startNextRaceManually}>Start next race</button>
              </div>
            )}
            {raceVideos.length > 0 ? (
              <div className="alv-cr-vlist">
                {raceVideos.map(video => <RaceVideoChip key={video.id} video={video} />)}
              </div>
            ) : (
              <p className="alv-cr-hint">
                {activeSession.event_id
                  ? 'Each race records as its own video when scoring starts it, and goes to YouTube when it\'s scored.'
                  : <>Link a race so each one records as its own YouTube video. <button type="button" className="alv-link" onClick={() => setShowSelectRace(true)}>Link a race</button></>}
              </p>
            )}
          </div>
        </div>

        {/* ── Overlays · Output · Details ── */}
        {sideOpen && (
          <aside className="alv-cr-panel alv-cr-side" aria-label="Broadcast settings">
            <div className="alv-cr-sidehead">
            <div className="alv-tabs" role="tablist" aria-label="Broadcast settings">
              {(['overlays', 'output', 'settings'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === tab}
                  onClick={() => setInspectorTab(tab)}
                >
                  {tab === 'overlays' ? 'Overlays' : tab === 'output' ? 'Output' : 'Details'}
                </button>
              ))}
            </div>
            {drawerMode && (
              <button type="button" className="alv-ib" onClick={() => setDrawerOpen(false)} aria-label="Close panel" title="Close">
                <X className="w-4 h-4" />
              </button>
            )}
            </div>

            <div className="alv-cr-sidebody" role="tabpanel">
              {inspectorTab === 'overlays' && (
                <OverlaysManager
                  session={activeSession}
                  onUpdate={(updates) => {
                    setActiveSession({ ...activeSession, ...updates });
                    livestreamStorage.updateSession(activeSession.id, updates);
                  }}
                />
              )}

              {inspectorTab === 'output' && (
                <div className="alv-cr-legacy">
                  <AdvancedStreamConsole
                    session={activeSession}
                    streamStatus={streamStatus}
                    whipStatus={whipStatus}
                    onUpdateSession={async (updates) => {
                      setActiveSession({ ...activeSession, ...updates });
                      await livestreamStorage.updateSession(activeSession.id, updates);
                    }}
                  />
                </div>
              )}

              {inspectorTab === 'settings' && (
                <div className="alv-cr-form">
                  <label className="alv-field">
                    <span>Title</span>
                    <input
                      type="text"
                      className="alv-input"
                      value={activeSession.title}
                      onChange={async (e) => {
                        const newTitle = e.target.value;
                        setActiveSession({ ...activeSession, title: newTitle });
                        await livestreamStorage.updateSession(activeSession.id, { title: newTitle });
                      }}
                    />
                  </label>
                  <label className="alv-field">
                    <span>Description</span>
                    <textarea
                      className="alv-input"
                      rows={3}
                      value={activeSession.description || ''}
                      onChange={async (e) => {
                        const newDesc = e.target.value;
                        setActiveSession({ ...activeSession, description: newDesc });
                        await livestreamStorage.updateSession(activeSession.id, { description: newDesc });
                      }}
                    />
                  </label>
                  <div>
                    <SwitchRow
                      label="Overlays"
                      hint="Fleet list, race bar and cards on the picture"
                      checked={overlaysOn}
                      onChange={async (enabled) => {
                        setActiveSession({ ...activeSession, enable_overlays: enabled });
                        await livestreamStorage.updateSession(activeSession.id, { enable_overlays: enabled });
                      }}
                    />
                    <SwitchRow
                      label="Live chat"
                      checked={!!activeSession.enable_chat}
                      onChange={async (enabled) => {
                        setActiveSession({ ...activeSession, enable_chat: enabled });
                        await livestreamStorage.updateSession(activeSession.id, { enable_chat: enabled });
                      }}
                    />
                  </div>
                  <button type="button" onClick={() => setShowSelectRace(true)} className="alv-btn is-small">
                    <Link2 className="w-4 h-4" aria-hidden="true" />
                    {activeSession.event_id ? 'Change linked race or heat' : 'Link race or heat'}
                  </button>
                  <button type="button" onClick={() => setShowSchedule(true)} className="alv-btn is-small">
                    <Calendar className="w-4 h-4" aria-hidden="true" />
                    Schedule broadcast
                  </button>
                </div>
              )}
            </div>

            {activeSession.event_id && (
              <div className="alv-cr-scorecard">
                <b>Scoring runs the broadcast</b>
                <p>
                  Each race records as its own video when scoring starts it, and the hold card shows when racing is on hold.
                  {scoring ? ` Now: ${scoring.race}${scoring.label ? ` · ${scoring.label.toLowerCase()}` : ''}.` : ''}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Modals ── */}
      {showMobileQR && activeSession && <MobileCameraQRModal sessionId={activeSession.id} onClose={() => setShowMobileQR(false)} />}
      {showTestLink && activeSession && (
        <TestBroadcastLinkModal
          sessionId={activeSession.id}
          isLive={streamStatus === 'live'}
          onClose={() => setShowTestLink(false)}
        />
      )}
      {showSelectRace && activeSession && (
        <SelectRaceHeatModal
          sessionId={activeSession.id}
          clubId={clubId}
          currentEventId={activeSession.event_id || undefined}
          currentHeatNumber={activeSession.heat_number || undefined}
          onSelect={(eventId, heatNumber) => {
            // The modal saves the link; keep the open studio (and its overlays) in step
            setActiveSession(prev => (prev ? { ...prev, event_id: eventId, heat_number: heatNumber } : prev));
            setShowSelectRace(false);
          }}
          onClose={() => setShowSelectRace(false)}
        />
      )}
      {showSchedule && activeSession && (
        <ScheduleStreamModal
          sessionId={activeSession.id}
          currentScheduledTime={activeSession.scheduled_start_time || undefined}
          onSchedule={(scheduledTime) => {
            // The modal saves the time (and scheduled/draft status) itself
            setActiveSession(prev => (prev ? { ...prev, scheduled_start_time: scheduledTime || undefined, status: scheduledTime ? 'scheduled' : 'draft' } : prev));
            setShowSchedule(false);
          }}
          onClose={() => setShowSchedule(false)}
        />
      )}
      {showAnalytics && activeSession && <StreamAnalyticsModal sessionId={activeSession.id} clubId={clubId} onClose={() => setShowAnalytics(false)} />}
      {showSetupWizard && <LivestreamSetupWizard clubId={clubId} onClose={() => setShowSetupWizard(false)} onComplete={handleWizardComplete} />}
      {showDeleteConfirm && sessionToDelete && (
        <ConfirmationModal isOpen={true} onClose={() => { setShowDeleteConfirm(false); setSessionToDelete(null); }} onConfirm={async () => { await deleteSession(sessionToDelete); setShowDeleteConfirm(false); setSessionToDelete(null); }} title="Delete Stream" message={`Are you sure you want to delete "${sessionToDelete.title}"?`} confirmText="Delete" confirmStyle="danger" />
      )}
    </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

/** One race video: start time, race, and where it is on its way to YouTube */
function RaceVideoChip({ video }: { video: LivestreamRaceSegment }) {
  const time = video.segment_start_time
    ? new Date(video.segment_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : '';
  const label = video.race_number
    ? `Race ${video.race_number}${video.heat_number ? ` · Heat ${video.heat_number}` : ''}`
    : video.segment_title || 'Race video';
  const done = video.upload_status === 'uploaded' || video.upload_status === 'cleanup_complete';
  const recording = video.upload_status === 'pending' && !video.segment_end_time;
  const [tone, status] =
    recording ? ['rec', '● recording'] :
    video.upload_status === 'pending' ? ['up', 'waiting to upload'] :
    video.upload_status === 'uploading' ? ['up', 'uploading'] :
    done ? ['ok', video.youtube_video_id ? '✓ YouTube' : '✓ saved'] :
    ['bad', 'upload failed'];
  const body = (
    <>
      {time && <span className="t">{time}</span>}
      <span>{label}</span>
      <span className={`st ${tone}`}>{status}</span>
    </>
  );
  const cls = `alv-mk ${recording ? 'is-rec' : tone === 'up' ? 'is-up' : ''}`;
  if (done && video.youtube_video_id) {
    return (
      <a className={cls} href={`https://youtu.be/${video.youtube_video_id}`} target="_blank" rel="noopener noreferrer" title="Watch on YouTube">
        {body}
      </a>
    );
  }
  return <span className={cls} title={tone === 'bad' ? video.upload_error || 'The upload failed' : undefined}>{body}</span>;
}

function VideoThumbnail({ stream, muted = false }: { stream: MediaStream; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);
  return <video ref={videoRef} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />;
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `alv-sw-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div className="alv-tg">
      <div className="min-w-0">
        <b id={id}>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="alv-sw" onClick={() => onChange(!checked)} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-2.5 bg-slate-900 border border-slate-700/50 rounded-lg">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-xs text-white font-medium">{value}</span>
    </div>
  );
}

function CredentialField({ label, value, field, copiedField, onCopy, isSecret, showSecret, onToggleSecret }: {
  label: string; value: string; field: string; copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  isSecret?: boolean; showSecret?: boolean; onToggleSecret?: () => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-slate-600 mb-1 block">{label}</label>
      <div className="flex items-center gap-1">
        <div className="flex-1 bg-slate-900 border border-slate-700/50 rounded px-2 py-1.5 text-[10px] text-slate-400 font-mono truncate">
          {isSecret && !showSecret ? '••••••••••••' : value}
        </div>
        {isSecret && onToggleSecret && (
          <button onClick={onToggleSecret} className="p-1.5 bg-slate-900 border border-slate-700/50 hover:bg-slate-700/50 rounded transition-colors">
            {showSecret ? <EyeOff className="w-3 h-3 text-slate-500" /> : <Eye className="w-3 h-3 text-slate-500" />}
          </button>
        )}
        <button onClick={() => onCopy(value, field)} className="p-1.5 bg-slate-900 border border-slate-700/50 hover:bg-slate-700/50 rounded transition-colors">
          {copiedField === field ? <span className="text-[9px] text-green-400 font-medium px-0.5">OK</span> : <Copy className="w-3 h-3 text-slate-500" />}
        </button>
      </div>
    </div>
  );
}

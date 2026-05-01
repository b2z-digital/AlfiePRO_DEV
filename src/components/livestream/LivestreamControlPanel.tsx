// Build: 2026-03-18-fcp-studio-redesign
import React, { useState, useEffect, useRef } from 'react';
import { Video, Play, Square, Settings, Eye, EyeOff, Calendar, Camera, Layers, Loader as Loader2, X, Smartphone, RefreshCw, ChevronDown, ChevronRight, Monitor, Radio, Maximize2, Minimize2, ChartBar as BarChart3, Clock, Wifi, Users, MessageSquare, Plus, Trash2, CircleStop as StopCircle, Cloud, CloudOff, Copy, ExternalLink, Signal, Zap, Activity, CircleDot, Disc, Pause } from 'lucide-react';
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
import { LivestreamOverlayRenderer } from './LivestreamOverlayRenderer';
import { CameraFeedGridRef } from './CameraFeedGrid';
import { useNotification } from '../../contexts/NotificationContext';
import { useCanvasCompositor } from '../../hooks/useCanvasCompositor';
import { subscribeToRaceStatus } from '../../utils/liveTrackingStorage';
import type { LivestreamRaceSegment } from '../../types/livestream';

interface AutoCreateEventInfo {
  eventId: string;
  eventName: string;
}

interface LivestreamControlPanelProps {
  clubId: string;
  sessionId?: string;
  autoCreateForEvent?: AutoCreateEventInfo;
}

interface SessionWithVenue extends LivestreamSession {
  venueImage?: string;
  venueName?: string;
}

export function LivestreamControlPanel({ clubId, sessionId, autoCreateForEvent }: LivestreamControlPanelProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [activeSession, setActiveSession] = useState<LivestreamSession | null>(null);
  const [sessions, setSessions] = useState<SessionWithVenue[]>([]);
  const [cameras, setCameras] = useState<LivestreamCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<'offline' | 'connecting' | 'testing' | 'live'>('offline');
  const [viewerCount, setViewerCount] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<'settings' | 'overlays' | 'output'>('settings');
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
  const [segmentProcessing, setSegmentProcessing] = useState(false);
  const segmentTransitionRef = useRef(false);
  const pendingSegmentStartRef = useRef(false);
  const lastCompletedRaceRef = useRef<number | null>(null);
  const [showTitleCard, setShowTitleCard] = useState(false);
  const [titleCardTrigger, setTitleCardTrigger] = useState(0);
  const whipHealthRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    if (activeSession && (streamStatus === 'testing' || streamStatus === 'live') && !mediaStream) {
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

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ];

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

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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

    const unsubscribe = subscribeToRaceStatus(
      activeSession.event_id,
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

    return unsubscribe;
  }, [activeSession?.event_id, streamStatus, autoSegmentEnabled]);

  // Fallback: watch quick_races.last_completed_race for race scoring events.
  // This triggers segment splits even if the race officer doesn't update live_tracking_events.
  useEffect(() => {
    if (!activeSession?.event_id || streamStatus !== 'live' || !autoSegmentEnabled) return;

    const eventId = activeSession.event_id;
    const isSeriesRound = eventId.includes('-') && eventId.split('-').length > 5;
    if (isSeriesRound) return;

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
        } else {
          lastCompletedRaceRef.current = 0;
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [activeSession?.event_id, streamStatus, autoSegmentEnabled]);

  const buildSegmentTitle = (raceNumber: number) => {
    const eventTitle = activeSession?.title || 'Race';
    const heatNum = activeSession?.heat_number;
    if (heatNum) {
      return `Heat ${heatNum} - Race ${raceNumber} | ${eventTitle}`;
    }
    return `Race ${raceNumber} | ${eventTitle}`;
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

        if (recordingBlob && recordingBlob.size > 10000) {
          uploadLocalRecording(recordingBlob, segmentToFinalize.id, activeSession.club_id).then(() => {
            livestreamStorage.triggerSegmentProcessing(segmentToFinalize.id).catch((err) => {
              console.error('[Segment] Background processing error:', err);
            });
          });
        } else {
          livestreamStorage.triggerSegmentProcessing(segmentToFinalize.id).catch((err) => {
            console.error('[Segment] Background processing error:', err);
          });
        }
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

      const nextRaceNumber = segmentCount + 1;
      const segmentTitle = buildSegmentTitle(nextRaceNumber);

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
      setSegmentCount(nextRaceNumber);

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

    const segmentTitle = buildSegmentTitle(1);

    try {
      const newSegment = await livestreamStorage.createSegment({
        session_id: activeSession.id,
        club_id: activeSession.club_id,
        event_id: activeSession.event_id || undefined,
        race_number: 1,
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
        current_race_number: 1,
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

  const enrichSessionsWithVenueData = async (sessionList: LivestreamSession[]): Promise<SessionWithVenue[]> => {
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
      setShowSetupWizard(true);
    }
  };

  const [activatingStream, setActivatingStream] = useState(false);

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
      addNotification('success', 'Stream activated successfully', 3000);
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
      setTimeout(() => setShowTitleCard(false), 12000);
      if (autoSegmentEnabled && updatedSession.event_id) {
        setTimeout(() => startFirstSegment(), 1000);
      }
    } catch (error) { console.error('Error going live:', error); setStreamStatus('testing'); await stopWhipStreaming(); alert('Failed to go live.'); }
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
        if (recordingBlob && recordingBlob.size > 10000) {
          localStoragePath = await uploadLocalRecording(recordingBlob, segmentToFinalize.id, activeSession.club_id);
          livestreamStorage.triggerSegmentProcessing(segmentToFinalize.id).catch(() => {});
        } else {
          livestreamStorage.triggerSegmentProcessing(segmentToFinalize.id).catch(() => {});
        }
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

  const handleSwitchCamera = async (cameraId: string) => {
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
      addNotification('success', 'Camera switched', 2000);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl p-10 text-center border border-slate-700/40">
          <div className="w-16 h-16 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-500/20">
            <Video className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Start Broadcasting</h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto text-sm">
            {autoCreateForEvent
              ? `Activate a livestream for ${autoCreateForEvent.eventName}`
              : 'Create a new livestream session to broadcast your races live'}
          </p>
          <button
            onClick={createNewSession}
            disabled={activatingStream}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-wait text-white rounded-xl font-semibold inline-flex items-center gap-2.5 transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/30"
          >
            {activatingStream ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {autoCreateForEvent ? 'Activate Stream' : 'New Stream'}
              </>
            )}
          </button>
        </div>

        {sessions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Previous Streams</h3>
            <div className="grid gap-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-slate-800/40 hover:bg-slate-800/60 rounded-xl border border-slate-700/40 hover:border-slate-600/50 transition-all group"
                >
                  <div className="flex items-center justify-between p-4">
                    <div
                      className="flex-1 cursor-pointer flex items-center gap-4"
                      onClick={() => {
                        if (session.status === 'ended') {
                          setActiveSession({ ...session, _viewOnly: true } as any);
                        } else {
                          setActiveSession(session);
                        }
                        updateStreamStatus(session.status);
                        loadCameras(session.id);
                      }}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        session.status === 'live' ? 'bg-red-500/20 border border-red-500/30' :
                        session.status === 'testing' ? 'bg-amber-500/20 border border-amber-500/30' :
                        session.status === 'ended' ? 'bg-slate-700/50 border border-slate-600/30' :
                        'bg-blue-500/20 border border-blue-500/30'
                      }`}>
                        {session.status === 'live' ? <Radio className="w-4 h-4 text-red-400" /> :
                         session.status === 'ended' ? <Square className="w-4 h-4 text-slate-400" /> :
                         <Video className="w-4 h-4 text-blue-400" />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-white font-medium text-sm truncate">{session.title}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                            session.status === 'live' ? 'bg-red-500/20 text-red-400' :
                            session.status === 'ended' ? 'bg-slate-600/30 text-slate-500' :
                            session.status === 'testing' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {session.status}
                          </span>
                          {session.scheduled_start_time && (
                            <span className="text-[10px] text-slate-500">{new Date(session.scheduled_start_time).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          if (session.status === 'ended') {
                            setActiveSession({ ...session, _viewOnly: true } as any);
                          } else {
                            setActiveSession(session);
                          }
                          updateStreamStatus(session.status);
                          loadCameras(session.id);
                        }}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setSessionToDelete(session); setShowDeleteConfirm(true); }}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSetupWizard && (
          <LivestreamSetupWizard clubId={clubId} onClose={() => setShowSetupWizard(false)} onComplete={handleWizardComplete} />
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
  // STUDIO VIEW (active session) - Final Cut Pro Inspired
  // ═══════════════════════════════════════════════════════════════

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] min-h-[500px] bg-slate-900 p-3 gap-2">
      {/* ── Top Transport Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border border-slate-700/50 rounded-xl flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Back Button */}
          <button
            onClick={() => {
              if (streamStatus === 'live' || streamStatus === 'testing') {
                if (confirm('Stream is active. Close this view? The stream will continue.')) setActiveSession(null);
              } else setActiveSession(null);
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Back to sessions"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-700" />

          {/* Status Indicator */}
          {streamStatus === 'live' ? (
            <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 px-3 py-1.5 rounded-lg">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
              <span className="text-red-400 font-bold text-xs tracking-widest">LIVE</span>
            </div>
          ) : streamStatus === 'testing' ? (
            <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-lg">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              <span className="text-amber-400 font-bold text-xs tracking-widest">PREVIEW</span>
            </div>
          ) : streamStatus === 'connecting' ? (
            <div className="flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 rounded-lg">
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              <span className="text-blue-400 font-bold text-xs tracking-widest">CONNECTING</span>
            </div>
          ) : activeSession?.status === 'ended' ? (
            <div className="flex items-center gap-2 bg-slate-700/50 border border-slate-600/30 px-3 py-1.5 rounded-lg">
              <Square className="w-3 h-3 text-slate-500" />
              <span className="text-slate-500 font-bold text-xs tracking-widest">ENDED</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-700/50 border border-slate-700/50 px-3 py-1.5 rounded-lg">
              <div className="w-2 h-2 bg-slate-500 rounded-full" />
              <span className="text-slate-500 font-bold text-xs tracking-widest">STANDBY</span>
            </div>
          )}

          {/* Live Stats */}
          {(streamStatus === 'live' || streamStatus === 'testing') && (
            <div className="flex items-center gap-4 text-slate-500 text-xs">
              <div className="flex items-center gap-1.5 font-mono">
                <Clock className="w-3 h-3" />
                <span className="tabular-nums">{formatDuration(streamDuration)}</span>
              </div>
              {streamStatus === 'live' && (
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3 h-3" />
                  <span>{viewerCount}</span>
                </div>
              )}
              {activeSession?.streaming_mode === 'cloudflare_relay' && streamStatus === 'live' && (
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                  isPaused ? 'bg-amber-500/10 text-amber-400' :
                  whipStatus === 'connected' ? 'bg-green-500/10 text-green-400' :
                  whipStatus === 'connecting' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {isPaused ? <Pause className="w-3 h-3" /> :
                   whipStatus === 'connected' ? <Signal className="w-3 h-3" /> :
                   whipStatus === 'connecting' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   <CloudOff className="w-3 h-3" />}
                  {isPaused ? 'PAUSED' : whipStatus === 'connected' ? 'CLOUD' : whipStatus === 'connecting' ? 'SYNC' : 'OFFLINE'}
                </div>
              )}
              {isCompositing && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-400">
                  <Layers className="w-3 h-3" />
                  OVERLAY
                </div>
              )}
              {autoSegmentEnabled && currentSegment && streamStatus === 'live' && (
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                  segmentProcessing ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {segmentProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Disc className="w-3 h-3" />}
                  {segmentProcessing ? 'SEGMENTING' : `RACE ${currentSegment.race_number}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transport Controls */}
        <div className="flex items-center gap-2">
          {streamStatus === 'offline' && activeSession?.status === 'ended' && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 border border-slate-600/30 rounded-lg">
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-400">Stream Ended</span>
              </div>
              <button
                onClick={() => { setSessionToDelete(activeSession); setShowDeleteConfirm(true); }}
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {streamStatus === 'offline' && activeSession?.status !== 'ended' && (
            <>
              <button onClick={startTestStream} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-all">
                <Camera className="w-3.5 h-3.5" />
                Start Preview
              </button>
              <button
                onClick={() => { setSessionToDelete(activeSession); setShowDeleteConfirm(true); }}
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {streamStatus === 'testing' && (
            <>
              <button onClick={stopTesting} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors">
                <StopCircle className="w-3.5 h-3.5" />
                Stop
              </button>
              <button onClick={goLive} className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-500/20">
                <Zap className="w-3.5 h-3.5" />
                GO LIVE
              </button>
            </>
          )}
          {streamStatus === 'live' && (
            <>
              {isPaused ? (
                <button onClick={resumeBroadcast} className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-green-500/20 animate-pulse">
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </button>
              ) : (
                <button onClick={pauseBroadcast} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors">
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              )}
              <button onClick={stopStream} className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
                <Square className="w-3 h-3" />
                End Stream
              </button>
            </>
          )}

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <button onClick={() => setShowAnalytics(true)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Analytics">
            <BarChart3 className="w-4 h-4" />
          </button>
          <button onClick={() => setShowInspector(!showInspector)} className={`p-1.5 rounded-lg transition-colors ${showInspector ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-white hover:bg-slate-700'}`} title="Toggle Inspector">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Studio Area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/30">
        {/* Program Monitor + Source Strip */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Program Monitor */}
          <div className="flex-1 p-4 min-h-0 overflow-hidden flex items-center justify-center">
            <div className={`relative w-full bg-black rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'aspect-video max-h-full'}`}>
              <video ref={(el) => { (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el; setVideoElReady(el); }} autoPlay muted playsInline className="w-full h-full object-cover bg-black" />

              {activeSession.enable_overlays && streamStatus !== 'offline' && (
                <LivestreamOverlayRenderer ref={(el: HTMLDivElement | null) => { (overlayRef as React.MutableRefObject<HTMLDivElement | null>).current = el; setOverlayElReady(el); }} session={activeSession} showTitleCard={showTitleCard} titleCardTrigger={titleCardTrigger} venueImage={(activeSession as SessionWithVenue).venueImage} venueName={(activeSession as SessionWithVenue).venueName} />
              )}

              {isPaused && streamStatus === 'live' && (
                <div className="absolute inset-0 bg-slate-900/95 flex items-center justify-center z-20">
                  {(activeSession as SessionWithVenue).venueImage && (
                    <img
                      src={(activeSession as SessionWithVenue).venueImage}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-15"
                    />
                  )}
                  <div className="text-center relative z-10">
                    <div className="w-20 h-20 bg-slate-800/80 border-2 border-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm">
                      <Pause className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-white text-xl font-bold mb-2">Event Pending</h3>
                    {(activeSession as SessionWithVenue).venueName && (
                      <p className="text-slate-300 text-sm mb-1">{(activeSession as SessionWithVenue).venueName}</p>
                    )}
                    <p className="text-slate-400 text-sm max-w-sm">
                      The broadcast is temporarily paused. Racing will resume shortly.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-amber-400 text-xs font-medium">
                      <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                      <span>Stream Paused</span>
                    </div>
                  </div>
                </div>
              )}

              {streamStatus === 'offline' && activeSession?.status === 'ended' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  {(activeSession as SessionWithVenue).venueImage && (
                    <img
                      src={(activeSession as SessionWithVenue).venueImage}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-20"
                    />
                  )}
                  <div className="text-center relative z-10">
                    <div className="w-16 h-16 bg-slate-800/80 border border-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                      <Square className="w-7 h-7 text-slate-500" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Stream Completed</p>
                    {(activeSession as SessionWithVenue).venueName && (
                      <p className="text-slate-500 text-xs mt-1">{(activeSession as SessionWithVenue).venueName}</p>
                    )}
                    <p className="text-slate-600 text-xs mt-1">
                      {activeSession.actual_start_time
                        ? `Streamed on ${new Date(activeSession.actual_start_time).toLocaleDateString()}`
                        : 'This stream has ended'}
                    </p>
                    {activeSession.end_time && activeSession.actual_start_time && (
                      <p className="text-slate-600 text-xs mt-0.5">
                        Duration: {formatDuration(Math.floor((new Date(activeSession.end_time).getTime() - new Date(activeSession.actual_start_time).getTime()) / 1000))}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {streamStatus === 'offline' && activeSession?.status !== 'ended' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  {(activeSession as SessionWithVenue).venueImage && (
                    <img
                      src={(activeSession as SessionWithVenue).venueImage}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-30"
                    />
                  )}
                  <div className="text-center relative z-10">
                    <div className="w-16 h-16 border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-black/50 backdrop-blur-sm">
                      <Video className="w-7 h-7 text-slate-600" />
                    </div>
                    <p className="text-slate-600 text-sm font-medium">No Signal</p>
                    {(activeSession as SessionWithVenue).venueName && (
                      <p className="text-slate-500 text-xs mt-1">{(activeSession as SessionWithVenue).venueName}</p>
                    )}
                    <p className="text-slate-700 text-xs mt-1">Click "Start Preview" to begin</p>
                  </div>
                </div>
              )}

              {/* Monitor HUD */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                {streamStatus === 'live' && (
                  <div className="bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold text-white tracking-wider flex items-center gap-1.5 shadow-lg">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    REC
                  </div>
                )}
                {streamStatus === 'testing' && (
                  <div className="bg-amber-600/80 px-2 py-0.5 rounded text-[10px] font-bold text-white tracking-wider">
                    PREVIEW
                  </div>
                )}
                {primaryCamera && (
                  <div className="bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-slate-300 font-medium">
                    {primaryCamera.camera_name}
                  </div>
                )}
              </div>

              {/* Monitor Info Bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="flex items-end justify-between">
                  <div className="min-w-0">
                    <h3 className="text-white font-medium text-sm truncate">{activeSession.title}</h3>
                    {activeSession?.streaming_mode === 'cloudflare_relay' && (
                      <p className="text-slate-500 text-[10px] mt-0.5">Cloud Relay Mode</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(streamStatus === 'testing' || streamStatus === 'live') && (
                      <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-mono">
                        <Activity className="w-3 h-3" />
                        720p 30fps
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="absolute top-3 right-3 p-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* ── Source Strip (Timeline-style) ── */}
          <div className="flex-shrink-0 bg-slate-900/80 border-t border-slate-700/50">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sources</span>
                <span className="text-[10px] text-slate-600 bg-slate-700/50 px-1.5 py-0.5 rounded">{cameras.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={forceReconnectMobileCameras} className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Reconnect">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                {streamStatus !== 'offline' && (
                  <button onClick={() => setShowMobileQR(true)} className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-md text-[10px] font-semibold flex items-center gap-1.5 transition-colors">
                    <Smartphone className="w-3 h-3" />
                    Add Phone
                  </button>
                )}
              </div>
            </div>

            <div className="px-3 pb-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {cameras.map((camera) => {
                  const isActive = camera.is_primary;
                  const isLaptop = camera.camera_type === 'laptop';
                  const isMobile = camera.camera_type === 'mobile';
                  const remoteStream = remoteStreams[camera.id];
                  const isConnected = camera.status === 'connected' || camera.status === 'streaming';
                  const hasVideo = (isLaptop && mediaStream) || (isMobile && remoteStream);

                  return (
                    <div
                      key={camera.id}
                      onClick={() => isConnected && !isActive && handleSwitchCamera(camera.id)}
                      className={`flex-shrink-0 w-36 rounded-lg overflow-hidden transition-all group ${
                        isActive
                          ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-900'
                          : isConnected
                            ? 'hover:ring-1 hover:ring-slate-500 cursor-pointer'
                            : 'opacity-40'
                      }`}
                    >
                      <div className="aspect-video bg-slate-950 relative">
                        {isLaptop && mediaStream ? (
                          <VideoThumbnail stream={mediaStream} muted />
                        ) : isMobile && remoteStream ? (
                          <VideoThumbnail stream={remoteStream} />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Camera className={`w-5 h-5 ${isConnected ? 'text-green-500/60' : 'text-slate-700'}`} />
                          </div>
                        )}

                        {isActive && (
                          <div className="absolute top-1 left-1 bg-blue-600 px-1.5 py-0.5 rounded text-[8px] font-bold text-white tracking-wider flex items-center gap-1">
                            <CircleDot className="w-2 h-2" />
                            PGM
                          </div>
                        )}

                        {!isActive && hasVideo && (
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full shadow-lg" />
                        )}
                      </div>

                      <div className="bg-slate-800 px-2 py-1.5 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isLaptop ? <Monitor className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" /> : <Smartphone className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" />}
                          <span className="text-[10px] text-slate-400 truncate">{camera.camera_name}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCamera(camera.id); }}
                          className="p-0.5 text-slate-600 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {cameras.length === 0 && (
                  <div className="flex items-center justify-center w-full py-4 text-slate-600">
                    <div className="text-center">
                      <Camera className="w-5 h-5 mx-auto mb-1" />
                      <p className="text-[10px]">No sources connected</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Inspector Panel ── */}
        {showInspector && (
          <div className="w-72 xl:w-80 flex-shrink-0 bg-slate-800 border-l border-slate-700/50 flex flex-col overflow-hidden">
            {/* Inspector Tab Bar */}
            <div className="flex items-center border-b border-slate-700/50 bg-slate-800/80">
              {(['settings', 'overlays', 'output'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInspectorTab(tab)}
                  className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors relative ${
                    inspectorTab === tab ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab === 'settings' ? 'Settings' : tab === 'overlays' ? 'Overlays' : 'Output'}
                  {inspectorTab === tab && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full" />}
                </button>
              ))}
            </div>

            {/* Inspector Content */}
            <div className="flex-1 overflow-y-auto">
              {inspectorTab === 'settings' && (
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">Title</label>
                    <input
                      type="text"
                      value={activeSession.title}
                      onChange={async (e) => {
                        const newTitle = e.target.value;
                        setActiveSession({ ...activeSession, title: newTitle });
                        await livestreamStorage.updateSession(activeSession.id, { title: newTitle });
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">Description</label>
                    <textarea
                      value={activeSession.description || ''}
                      onChange={async (e) => {
                        const newDesc = e.target.value;
                        setActiveSession({ ...activeSession, description: newDesc });
                        await livestreamStorage.updateSession(activeSession.id, { description: newDesc });
                      }}
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <ToggleRow
                      icon={<Layers className="w-3.5 h-3.5" />}
                      label="Overlays"
                      checked={activeSession.enable_overlays}
                      onChange={async (enabled) => {
                        setActiveSession({ ...activeSession, enable_overlays: enabled });
                        await livestreamStorage.updateSession(activeSession.id, { enable_overlays: enabled });
                      }}
                    />
                    <ToggleRow
                      icon={<MessageSquare className="w-3.5 h-3.5" />}
                      label="Live Chat"
                      checked={activeSession.enable_chat}
                      onChange={async (enabled) => {
                        setActiveSession({ ...activeSession, enable_chat: enabled });
                        await livestreamStorage.updateSession(activeSession.id, { enable_chat: enabled });
                      }}
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <button onClick={() => setShowSelectRace(true)} className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-colors">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      Link Race/Heat
                    </button>
                    <button onClick={() => setShowSchedule(true)} className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-colors">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      Schedule Stream
                    </button>
                  </div>
                </div>
              )}

              {inspectorTab === 'overlays' && (
                <div className="p-4">
                  <OverlaysManager
                    session={activeSession}
                    onUpdate={(updates) => {
                      setActiveSession({ ...activeSession, ...updates });
                      livestreamStorage.updateSession(activeSession.id, updates);
                    }}
                  />
                </div>
              )}

              {inspectorTab === 'output' && (
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Stream Info</h4>
                    <div className="space-y-1.5">
                      <InfoRow label="Mode" value={activeSession?.streaming_mode === 'cloudflare_relay' ? 'Cloud Relay' : 'Direct'} />
                      <InfoRow label="Quality" value="720p HD" />
                      <InfoRow label="Est. Data/Hour" value="~1.1 GB" />
                    </div>
                  </div>

                  {/* Connection Status */}
                  <div>
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</h4>
                    <div className="space-y-1.5">
                      {streamStatus === 'live' && activeSession?.streaming_mode === 'cloudflare_relay' && (
                        <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
                          whipStatus === 'connected' ? 'bg-green-500/5 border-green-500/20 text-green-400' :
                          whipStatus === 'connecting' ? 'bg-amber-500/5 border-amber-500/20 text-amber-400' :
                          'bg-red-500/5 border-red-500/20 text-red-400'
                        }`}>
                          {whipStatus === 'connected' ? <Cloud className="w-3.5 h-3.5" /> :
                           whipStatus === 'connecting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                           <CloudOff className="w-3.5 h-3.5" />}
                          {whipStatus === 'connected' ? 'Streaming to Cloud' : whipStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                        </div>
                      )}
                      {streamStatus !== 'live' && (
                        <div className="flex items-center gap-2 p-2.5 bg-slate-900 border border-slate-700/50 rounded-lg text-xs text-slate-500">
                          <Wifi className="w-3.5 h-3.5" />
                          Ready to stream
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Streaming Destinations */}
                  <div>
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Destinations</h4>
                    <div className="space-y-1.5">
                      {/* AlfieTV - Primary Destination */}
                      <div className="flex items-center gap-2.5 p-2.5 bg-slate-900 border border-sky-500/30 rounded-lg">
                        <Radio className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs text-white font-medium block">AlfieTV</span>
                          <span className="text-[10px] text-slate-500">
                            {whipStatus === 'connected' ? 'Live on AlfieTV' :
                             whipStatus === 'connecting' ? 'Connecting...' :
                             streamStatus === 'live' ? 'Streaming via Cloudflare' : 'Ready'}
                          </span>
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          (whipStatus === 'connected' || streamStatus === 'live') ? 'bg-green-400' :
                          whipStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
                        }`} />
                      </div>

                      {/* Cloudflare Stream relay */}
                      {activeSession?.streaming_mode === 'cloudflare_relay' && (
                        <div className="flex items-center gap-2.5 p-2.5 bg-slate-900 border border-slate-700/50 rounded-lg">
                          <Cloud className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs text-white font-medium block">Cloudflare Stream</span>
                            <span className="text-[10px] text-slate-500">Cloud relay active</span>
                          </div>
                          <div className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            whipStatus === 'connected' ? 'bg-green-400' :
                            whipStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
                          }`} />
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Advanced: RTMP Credentials (collapsible) */}
                  {(activeSession as any)?.cloudflare_rtmps_url && (
                    <div>
                      <button
                        onClick={() => setShowStreamKey(!showStreamKey)}
                        className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 hover:text-slate-400 transition-colors"
                      >
                        {showStreamKey ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Advanced Credentials
                      </button>
                      {showStreamKey && (
                        <div className="space-y-3 pl-1">
                          <div className="space-y-2">
                            <span className="text-[10px] text-slate-500 font-medium">Cloudflare RTMPS (for OBS)</span>
                            <CredentialField label="RTMP URL" value={(activeSession as any).cloudflare_rtmps_url} field="cf-url" copiedField={copiedField} onCopy={copyToClipboard} />
                            {(activeSession as any)?.cloudflare_rtmps_stream_key && (
                              <CredentialField label="Stream Key" value={(activeSession as any).cloudflare_rtmps_stream_key} field="cf-key" copiedField={copiedField} onCopy={copyToClipboard} isSecret showSecret={true} onToggleSecret={() => {}} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showMobileQR && activeSession && <MobileCameraQRModal sessionId={activeSession.id} onClose={() => setShowMobileQR(false)} />}
      {showSelectRace && <SelectRaceHeatModal clubId={clubId} onSelect={(eventId, heatId) => { if (activeSession) livestreamStorage.updateSession(activeSession.id, { event_id: eventId, heat_id: heatId }); setShowSelectRace(false); }} onClose={() => setShowSelectRace(false)} />}
      {showSchedule && activeSession && <ScheduleStreamModal session={activeSession} onSave={async (scheduledTime) => { await livestreamStorage.updateSession(activeSession.id, { scheduled_start_time: scheduledTime.toISOString(), status: 'scheduled' }); setShowSchedule(false); }} onClose={() => setShowSchedule(false)} />}
      {showAnalytics && activeSession && <StreamAnalyticsModal sessionId={activeSession.id} clubId={clubId} onClose={() => setShowAnalytics(false)} />}
      {showSetupWizard && <LivestreamSetupWizard clubId={clubId} onClose={() => setShowSetupWizard(false)} onComplete={handleWizardComplete} />}
      {showDeleteConfirm && sessionToDelete && (
        <ConfirmationModal isOpen={true} onClose={() => { setShowDeleteConfirm(false); setSessionToDelete(null); }} onConfirm={async () => { await deleteSession(sessionToDelete); setShowDeleteConfirm(false); setSessionToDelete(null); }} title="Delete Stream" message={`Are you sure you want to delete "${sessionToDelete.title}"?`} confirmText="Delete" confirmStyle="danger" />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

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

function ToggleRow({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-700/50 rounded-lg">
      <div className="flex items-center gap-2.5">
        <span className="text-slate-500">{icon}</span>
        <span className="text-xs text-slate-300">{label}</span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
        <div className="w-8 h-4 bg-slate-700 peer-focus:ring-1 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
      </label>
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

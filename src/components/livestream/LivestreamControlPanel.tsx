// Build: 2026-03-18-fcp-studio-redesign
import React, { useState, useEffect, useRef } from 'react';
import { Video, Play, Square, Settings, Eye, EyeOff, Calendar, Camera, Layers, Loader as Loader2, X, Smartphone, RefreshCw, ChevronDown, ChevronRight, Monitor, Radio, Maximize2, Minimize2, ChartBar as BarChart3, Clock, Wifi, Users, MessageSquare, Plus, Trash2, CircleStop as StopCircle, Cloud, CloudOff, Copy, ExternalLink, Signal, Zap, Activity, CircleDot, Disc } from 'lucide-react';
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

interface LivestreamControlPanelProps {
  clubId: string;
  sessionId?: string;
}

interface SessionWithVenue extends LivestreamSession {
  venueImage?: string;
  venueName?: string;
}

export function LivestreamControlPanel({ clubId, sessionId }: LivestreamControlPanelProps) {
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
  const whipPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const youtubeMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<string>('');
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
        if (youtubeMonitorRef.current) {
          clearInterval(youtubeMonitorRef.current);
          youtubeMonitorRef.current = null;
        }
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
        } else if (pc.connectionState === 'failed') {
          addNotification('error', `${camera.camera_name} connection failed`, 5000);
          cleanupMobileCameraConnection(camera.id);
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

  const startWhipStreaming = async (whipUrl: string, streamToSend: MediaStream): Promise<boolean> => {
    try {
      setWhipStatus('connecting');
      if (whipPeerConnectionRef.current) { whipPeerConnectionRef.current.close(); whipPeerConnectionRef.current = null; }
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require'
      });
      whipPeerConnectionRef.current = pc;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { setWhipStatus('connected'); addNotification('success', 'Connected to streaming server', 3000); }
        else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') { setWhipStatus('error'); addNotification('error', 'Lost connection to streaming server', 5000); }
      };
      streamToSend.getTracks().forEach(track => pc.addTrack(track, streamToSend));
      try {
        const transceivers = pc.getTransceivers();
        for (const transceiver of transceivers) {
          if (transceiver.sender.track?.kind === 'video') {
            const codecs = RTCRtpSender.getCapabilities('video')?.codecs;
            if (codecs) {
              const h264Codecs = codecs.filter(c => c.mimeType === 'video/H264');
              const otherCodecs = codecs.filter(c => c.mimeType !== 'video/H264');
              if (h264Codecs.length > 0) transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
            }
          }
        }
      } catch {}
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); }
        else {
          const checkState = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); } };
          pc.addEventListener('icegatheringstatechange', checkState);
          setTimeout(() => { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); }, 3000);
        }
      });
      const localDescription = pc.localDescription;
      if (!localDescription) throw new Error('No local description after ICE gathering');
      const response = await fetch(whipUrl, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: localDescription.sdp });
      if (!response.ok) throw new Error(`WHIP server error: ${response.status}`);
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      return true;
    } catch (error) {
      console.error('[WHIP] Error:', error);
      setWhipStatus('error');
      if (whipPeerConnectionRef.current) { whipPeerConnectionRef.current.close(); whipPeerConnectionRef.current = null; }
      return false;
    }
  };

  const stopWhipStreaming = () => {
    if (whipPeerConnectionRef.current) { whipPeerConnectionRef.current.close(); whipPeerConnectionRef.current = null; }
    setWhipStatus('disconnected');
  };

  const loadSpecificSession = async (id: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('livestream_sessions').select('*').eq('id', id).single();
      if (error) throw error;
      if (data) { setActiveSession(data); updateStreamStatus(data.status); loadCameras(data.id); loadSessions(); }
    } catch (error) { console.error('Error loading session:', error); }
    finally { setLoading(false); }
  };

  const loadSessions = async () => {
    try { const data = await livestreamStorage.getSessions(clubId); setSessions(data); }
    catch (error) { console.error('Error loading sessions:', error); }
    finally { setLoading(false); }
  };

  const checkActiveSession = async () => {
    try {
      const session = await livestreamStorage.getActiveSession(clubId);
      if (session && session.status === 'live') { setActiveSession(session); updateStreamStatus(session.status); loadCameras(session.id); }
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

  const createNewSession = () => setShowSetupWizard(true);

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

  const stopYouTubeMonitor = () => { if (youtubeMonitorRef.current) { clearInterval(youtubeMonitorRef.current); youtubeMonitorRef.current = null; } };

  const startYouTubeMonitor = (broadcastId: string, monitorClubId: string, accessToken: string) => {
    stopYouTubeMonitor();
    let ytLiveTransitioned = false;
    let hasAttemptedTestingTransition = false;
    const checkYouTube = async () => {
      if (ytLiveTransitioned) { stopYouTubeMonitor(); return; }
      try {
        const statusResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getBroadcastStatus', clubId: monitorClubId, sessionData: { broadcastId } }),
        });
        const statusData = await statusResponse.json();
        if (!statusData?.items?.length) { setYoutubeStatus('not_found'); return; }
        const broadcast = statusData.items[0];
        const lifecycleStatus = broadcast?.status?.lifeCycleStatus;
        const boundStreamId = broadcast?.contentDetails?.boundStreamId;
        setYoutubeStatus(lifecycleStatus || 'unknown');
        if (lifecycleStatus === 'live') {
          addNotification('success', 'Now streaming live on YouTube!', 5000);
          ytLiveTransitioned = true; stopYouTubeMonitor(); return;
        }
        if (boundStreamId) {
          const streamResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getStreamStatus', clubId: monitorClubId, sessionData: { streamId: boundStreamId } }),
          });
          const streamData = await streamResponse.json();
          if (streamData?.items?.length) {
            const streamStatus = streamData.items[0]?.status?.streamStatus;
            const health = streamData.items[0]?.status?.healthStatus?.status;

            if (streamStatus === 'active' && !hasAttemptedTestingTransition && lifecycleStatus === 'ready') {
              hasAttemptedTestingTransition = true;
              try {
                await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
                  method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'transitionBroadcast', clubId: monitorClubId, sessionData: { broadcastId, broadcastStatus: 'testing' } }),
                });
                setYoutubeStatus('testing');
                addNotification('info', 'YouTube is testing the stream...', 5000);
              } catch {}
            }

            if ((health === 'good' || health === 'ok' || streamStatus === 'active') && lifecycleStatus === 'testing') {
              try {
                const transResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
                  method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'transitionBroadcast', clubId: monitorClubId, sessionData: { broadcastId, broadcastStatus: 'live' } }),
                });
                if (transResponse.ok) {
                  addNotification('success', 'Now streaming live on YouTube!', 5000);
                  ytLiveTransitioned = true; setYoutubeStatus('live'); stopYouTubeMonitor();
                }
              } catch {}
            }
          }
        }
      } catch (err) { console.error('[YouTube Monitor] Error:', err); }
    };
    setTimeout(checkYouTube, 8000);
    youtubeMonitorRef.current = setInterval(checkYouTube, 15000);
  };

  const goLive = async () => {
    if (!activeSession || streamStatus !== 'testing') return;
    try {
      setStreamStatus('connecting');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const actualStartTime = new Date().toISOString();
      const streamToSend = activePreviewStream || mediaStream;
      if (!streamToSend) { addNotification('error', 'No video source available.', 5000); setStreamStatus('testing'); return; }
      if (activeSession.streaming_mode === 'cloudflare_relay' && activeSession.cloudflare_whip_url) {
        addNotification('info', 'Connecting to streaming server...', 3000);
        const whipSuccess = await startWhipStreaming(activeSession.cloudflare_whip_url, streamToSend);
        if (!whipSuccess) { addNotification('error', 'Failed to connect to streaming server.', 8000); setStreamStatus('testing'); return; }
        addNotification('success', 'Connected to Cloudflare!', 4000);
        if (activeSession.youtube_broadcast_id) {
          addNotification('info', 'YouTube broadcast will go live automatically when it detects the stream.', 8000);
          startYouTubeMonitor(activeSession.youtube_broadcast_id, clubId, session.access_token);
        }
      } else if (activeSession.youtube_broadcast_id) {
        addNotification('info', 'YouTube broadcast will go live when it detects stream data.', 8000);
        startYouTubeMonitor(activeSession.youtube_broadcast_id, clubId, session.access_token);
      }
      const { data: updatedSession, error: updateError } = await supabase
        .from('livestream_sessions').update({ status: 'live', actual_start_time: actualStartTime }).eq('id', activeSession.id).select().single();
      if (updateError) throw updateError;
      setActiveSession(updatedSession); setStreamStatus('live');
      addNotification('success', 'Stream is now live!', 5000);
    } catch (error) { console.error('Error going live:', error); setStreamStatus('testing'); stopWhipStreaming(); alert('Failed to go live.'); }
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
      stopYouTubeMonitor(); stopWhipStreaming();
      if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); setMediaStream(null); }
      await livestreamStorage.updateSession(activeSession.id, { status: 'ended', actual_end_time: new Date().toISOString() });
      setStreamStatus('offline');
      addNotification('success', 'Stream ended successfully', 3000);
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

  const handleSwitchCamera = async (cameraId: string) => {
    if (!activeSession) return;
    try {
      await livestreamStorage.setPrimaryCamera(activeSession.id, cameraId);
      const targetCamera = cameras.find(c => c.id === cameraId);
      if (targetCamera) {
        if (targetCamera.camera_type === 'laptop') setActivePreviewStream(mediaStream);
        else if (targetCamera.camera_type === 'mobile') { const mobileStream = remoteStreams[cameraId]; if (mobileStream) setActivePreviewStream(mobileStream); }
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
          <p className="text-slate-400 mb-6 max-w-md mx-auto text-sm">Create a new livestream session to broadcast your races live</p>
          <button
            onClick={createNewSession}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold inline-flex items-center gap-2.5 transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/30"
          >
            <Plus className="w-4 h-4" />
            New Stream
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
                      onClick={() => { setActiveSession(session); updateStreamStatus(session.status); loadCameras(session.id); }}
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
                        onClick={() => { setActiveSession(session); updateStreamStatus(session.status); loadCameras(session.id); }}
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
    <div className="flex flex-col h-[calc(100vh-7rem)] min-h-[500px] bg-[#1a1a1e]">
      {/* ── Top Transport Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#232328] border-b border-[#3a3a40] flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Back Button */}
          <button
            onClick={() => {
              if (streamStatus === 'live' || streamStatus === 'testing') {
                if (confirm('Stream is active. Close this view? The stream will continue.')) setActiveSession(null);
              } else setActiveSession(null);
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#3a3a40] rounded-lg transition-colors"
            title="Back to sessions"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-[#3a3a40]" />

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
          ) : (
            <div className="flex items-center gap-2 bg-[#2a2a30] border border-[#3a3a40] px-3 py-1.5 rounded-lg">
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
                  whipStatus === 'connected' ? 'bg-green-500/10 text-green-400' :
                  whipStatus === 'connecting' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {whipStatus === 'connected' ? <Signal className="w-3 h-3" /> :
                   whipStatus === 'connecting' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                   <CloudOff className="w-3 h-3" />}
                  {whipStatus === 'connected' ? 'CLOUD' : whipStatus === 'connecting' ? 'SYNC' : 'OFFLINE'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transport Controls */}
        <div className="flex items-center gap-2">
          {streamStatus === 'offline' && (
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
              <button onClick={stopTesting} className="px-3 py-1.5 bg-[#3a3a40] hover:bg-[#4a4a50] text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors">
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
            <button onClick={stopStream} className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
              <Square className="w-3 h-3" />
              End Stream
            </button>
          )}

          <div className="w-px h-5 bg-[#3a3a40] mx-1" />

          <button onClick={() => setShowAnalytics(true)} className="p-1.5 text-slate-500 hover:text-white hover:bg-[#3a3a40] rounded-lg transition-colors" title="Analytics">
            <BarChart3 className="w-4 h-4" />
          </button>
          <button onClick={() => setShowInspector(!showInspector)} className={`p-1.5 rounded-lg transition-colors ${showInspector ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-white hover:bg-[#3a3a40]'}`} title="Toggle Inspector">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Studio Area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Program Monitor + Source Strip */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Program Monitor */}
          <div className="flex-1 p-3 min-h-0 overflow-hidden">
            <div className={`relative w-full h-full bg-black rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain bg-black" />

              {activeSession.enable_overlays && (streamStatus === 'testing' || streamStatus === 'live') && (
                <LivestreamOverlayRenderer session={activeSession} />
              )}

              {streamStatus === 'offline' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-center">
                    <div className="w-16 h-16 border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Video className="w-7 h-7 text-slate-600" />
                    </div>
                    <p className="text-slate-600 text-sm font-medium">No Signal</p>
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
          <div className="flex-shrink-0 bg-[#1e1e22] border-t border-[#3a3a40]">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sources</span>
                <span className="text-[10px] text-slate-600 bg-[#2a2a30] px-1.5 py-0.5 rounded">{cameras.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={forceReconnectMobileCameras} className="p-1 text-slate-500 hover:text-white hover:bg-[#3a3a40] rounded transition-colors" title="Reconnect">
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
                          ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#1e1e22]'
                          : isConnected
                            ? 'hover:ring-1 hover:ring-slate-500 cursor-pointer'
                            : 'opacity-40'
                      }`}
                    >
                      <div className="aspect-video bg-[#0a0a0c] relative">
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
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-400 rounded-full shadow-lg shadow-green-400/50" />
                        )}
                      </div>

                      <div className="bg-[#232328] px-2 py-1.5 flex items-center justify-between gap-1">
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
          <div className="w-72 xl:w-80 flex-shrink-0 bg-[#232328] border-l border-[#3a3a40] flex flex-col overflow-hidden">
            {/* Inspector Tab Bar */}
            <div className="flex items-center border-b border-[#3a3a40] bg-[#28282e]">
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
                      className="w-full px-3 py-2 bg-[#1a1a1e] border border-[#3a3a40] rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
                      className="w-full px-3 py-2 bg-[#1a1a1e] border border-[#3a3a40] rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all"
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
                    <button onClick={() => setShowSelectRace(true)} className="w-full px-3 py-2 bg-[#1a1a1e] hover:bg-[#2a2a30] border border-[#3a3a40] text-slate-300 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-colors">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      Link Race/Heat
                    </button>
                    <button onClick={() => setShowSchedule(true)} className="w-full px-3 py-2 bg-[#1a1a1e] hover:bg-[#2a2a30] border border-[#3a3a40] text-slate-300 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-colors">
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
                        <div className="flex items-center gap-2 p-2.5 bg-[#1a1a1e] border border-[#3a3a40] rounded-lg text-xs text-slate-500">
                          <Wifi className="w-3.5 h-3.5" />
                          Ready to stream
                        </div>
                      )}
                      {activeSession?.youtube_broadcast_id && (
                        <div className="flex items-center gap-2 p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium">
                          <Video className="w-3.5 h-3.5" />
                          YouTube Connected
                          {youtubeStatus && (
                            <span className="ml-auto text-[10px] opacity-70">
                              {youtubeStatus === 'live' ? 'Live' : youtubeStatus === 'testing' ? 'Testing' : youtubeStatus === 'ready' ? 'Waiting...' : youtubeStatus}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Streaming Destinations */}
                  {activeSession?.youtube_broadcast_id && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Destinations</h4>
                      <div className="space-y-1.5">
                        {activeSession.streaming_mode === 'cloudflare_relay' && (
                          <div className="flex items-center gap-2.5 p-2.5 bg-[#1a1a1e] border border-[#3a3a40] rounded-lg">
                            <Cloud className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs text-white font-medium block">Cloudflare Stream</span>
                              <span className="text-[10px] text-slate-500">WebRTC relay to YouTube</span>
                            </div>
                            <div className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              whipStatus === 'connected' ? 'bg-green-400' :
                              whipStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
                            }`} />
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 p-2.5 bg-[#1a1a1e] border border-[#3a3a40] rounded-lg">
                          <Video className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs text-white font-medium block">YouTube Live</span>
                            <span className="text-[10px] text-slate-500">
                              {youtubeStatus === 'live' ? 'Broadcasting' :
                               youtubeStatus === 'testing' ? 'Receiving stream' :
                               youtubeStatus === 'ready' ? 'Waiting for stream' :
                               'Auto-start enabled'}
                            </span>
                          </div>
                          <div className={`ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            youtubeStatus === 'live' ? 'bg-red-400' :
                            youtubeStatus === 'testing' ? 'bg-amber-400 animate-pulse' :
                            'bg-slate-600'
                          }`} />
                        </div>
                        <a href="https://studio.youtube.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-300 transition-colors pt-1 pl-1">
                          <ExternalLink className="w-3 h-3" />
                          Open YouTube Studio
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Advanced: RTMP Credentials (collapsible) */}
                  {(activeSession?.youtube_stream_key || (activeSession as any)?.cloudflare_rtmps_url) && (
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
                          {activeSession?.youtube_stream_key && (
                            <div className="space-y-2">
                              <span className="text-[10px] text-slate-500 font-medium">YouTube RTMP</span>
                              <CredentialField label="Server URL" value={activeSession.youtube_stream_url || 'rtmps://a.rtmps.youtube.com/live2'} field="url" copiedField={copiedField} onCopy={copyToClipboard} />
                              <CredentialField label="Stream Key" value={activeSession.youtube_stream_key} field="key" copiedField={copiedField} onCopy={copyToClipboard} isSecret showSecret={true} onToggleSecret={() => {}} />
                            </div>
                          )}
                          {(activeSession as any)?.cloudflare_rtmps_url && (
                            <div className="space-y-2">
                              <span className="text-[10px] text-slate-500 font-medium">Cloudflare RTMPS</span>
                              <CredentialField label="RTMP URL" value={(activeSession as any).cloudflare_rtmps_url} field="cf-url" copiedField={copiedField} onCopy={copyToClipboard} />
                              {(activeSession as any)?.cloudflare_rtmps_stream_key && (
                                <CredentialField label="Stream Key" value={(activeSession as any).cloudflare_rtmps_stream_key} field="cf-key" copiedField={copiedField} onCopy={copyToClipboard} isSecret showSecret={true} onToggleSecret={() => {}} />
                              )}
                            </div>
                          )}
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
    <div className="flex items-center justify-between p-2.5 bg-[#1a1a1e] border border-[#3a3a40] rounded-lg">
      <div className="flex items-center gap-2.5">
        <span className="text-slate-500">{icon}</span>
        <span className="text-xs text-slate-300">{label}</span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
        <div className="w-8 h-4 bg-[#3a3a40] peer-focus:ring-1 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
      </label>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-2.5 bg-[#1a1a1e] border border-[#3a3a40] rounded-lg">
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
        <div className="flex-1 bg-[#1a1a1e] border border-[#3a3a40] rounded px-2 py-1.5 text-[10px] text-slate-400 font-mono truncate">
          {isSecret && !showSecret ? '••••••••••••' : value}
        </div>
        {isSecret && onToggleSecret && (
          <button onClick={onToggleSecret} className="p-1.5 bg-[#1a1a1e] border border-[#3a3a40] hover:bg-[#2a2a30] rounded transition-colors">
            {showSecret ? <EyeOff className="w-3 h-3 text-slate-500" /> : <Eye className="w-3 h-3 text-slate-500" />}
          </button>
        )}
        <button onClick={() => onCopy(value, field)} className="p-1.5 bg-[#1a1a1e] border border-[#3a3a40] hover:bg-[#2a2a30] rounded transition-colors">
          {copiedField === field ? <span className="text-[9px] text-green-400 font-medium px-0.5">OK</span> : <Copy className="w-3 h-3 text-slate-500" />}
        </button>
      </div>
    </div>
  );
}

// Build: 2026-02-08-deferred-output-creation
import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Play,
  Square,
  Settings,
  Eye,
  EyeOff,
  Calendar,
  Camera,
  Layers,
  Loader2,
  X,
  Smartphone,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Monitor,
  Radio,
  Maximize2,
  Minimize2,
  BarChart3,
  Clock,
  Wifi,
  Users,
  MessageSquare,
  Plus,
  Trash2,
  StopCircle,
  Cloud,
  CloudOff,
  Copy,
  ExternalLink
} from 'lucide-react';
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
  const [expandedPanel, setExpandedPanel] = useState<'settings' | 'overlays' | null>('settings');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const [activePreviewStream, setActivePreviewStream] = useState<MediaStream | null>(null);
  const cameraFeedGridRef = useRef<CameraFeedGridRef>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const signalingChannelsRef = useRef<Record<string, ReturnType<typeof supabase.channel>>>({});
  const cameraLastConnectedRef = useRef<Record<string, string>>({});
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
          console.log('[ControlPanel] Camera subscription fired, received:', updatedCameras.length, 'cameras');
          updatedCameras.forEach(c => console.log(`  - ${c.camera_name} (${c.camera_type}): ${c.status}`));

          const previousCameraIds = cameras.map(c => c.id);
          const newCameras = updatedCameras.filter(c =>
            !previousCameraIds.includes(c.id) &&
            (c.status === 'connected' || c.status === 'streaming')
          );

          newCameras.forEach(camera => {
            console.log('[ControlPanel] NEW camera detected:', camera.camera_name);
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
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  const setupMobileCameraConnection = async (camera: LivestreamCamera, retryCount = 0): Promise<void> => {
    console.log('[ControlPanel] setupMobileCameraConnection called for:', camera.camera_name, 'retry:', retryCount);

    if (camera.camera_type !== 'mobile') return;

    const existingPc = peerConnectionsRef.current[camera.id];
    if (existingPc) {
      console.log('[ControlPanel] Existing PC found, state:', existingPc.connectionState);
      if (existingPc.connectionState === 'connected') return;
      if (existingPc.connectionState !== 'failed' && existingPc.connectionState !== 'closed') {
        if (retryCount === 0) return;
      }
      cleanupMobileCameraConnection(camera.id);
    }

    try {
      console.log('[ControlPanel] Looking for offer from camera:', camera.id);
      const { data: offerSignal, error: offerError } = await supabase
        .from('webrtc_signaling')
        .select('*')
        .eq('camera_id', camera.id)
        .eq('signal_type', 'offer')
        .eq('from_role', 'camera')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('[ControlPanel] Offer query result:', offerSignal ? 'found' : 'not found', 'error:', offerError?.message);

      if (!offerSignal?.signal_data?.sdp) {
        if (retryCount < 5) {
          console.log('[ControlPanel] No offer yet, retrying in 1s...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return setupMobileCameraConnection(camera, retryCount + 1);
        }
        console.log('[ControlPanel] No offer found for camera after retries:', camera.id);
        return;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current[camera.id] = pc;

      pc.ontrack = (event) => {
        console.log('Received track from mobile camera:', camera.id);
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => ({ ...prev, [camera.id]: event.streams[0] }));
          const primaryCamera = cameras.find(c => c.is_primary);
          if (primaryCamera?.id === camera.id) {
            setActivePreviewStream(event.streams[0]);
          }
        }
      };

      let sentCandidateCount = 0;
      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          sentCandidateCount++;
          const candidateType = e.candidate.candidate.includes('relay') ? 'relay/TURN' :
                               e.candidate.candidate.includes('srflx') ? 'srflx/STUN' : 'host';
          console.log(`[ControlPanel] Sending ICE #${sentCandidateCount} (${candidateType}) to camera ${camera.id.slice(0,8)}`);

          const { error } = await supabase.from('webrtc_signaling').insert({
            camera_id: camera.id,
            session_id: activeSession?.id || '',
            signal_type: 'ice_candidate',
            signal_data: { candidate: e.candidate.toJSON() },
            from_role: 'viewer'
          });

          if (error) {
            console.error(`[ControlPanel] Failed to send ICE candidate:`, error);
          }
        } else {
          console.log(`[ControlPanel] ICE gathering complete - sent ${sentCandidateCount} candidates to camera ${camera.id.slice(0,8)}`);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log('[ControlPanel] ICE gathering state:', pc.iceGatheringState, 'for camera:', camera.id);
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[ControlPanel] ICE connection state:', pc.iceConnectionState, 'for camera:', camera.id);
      };

      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState, 'for camera:', camera.id);
        if (pc.connectionState === 'connected') {
          livestreamStorage.updateCamera(camera.id, { status: 'streaming' });
          addNotification('success', `${camera.camera_name} streaming`, 3000);
        } else if (pc.connectionState === 'failed') {
          addNotification('error', `${camera.camera_name} connection failed`, 5000);
          cleanupMobileCameraConnection(camera.id);
        }
      };

      console.log('[ControlPanel] Setting remote description (offer) for camera:', camera.id.slice(0, 8));
      await pc.setRemoteDescription(new RTCSessionDescription(offerSignal.signal_data.sdp));
      console.log('[ControlPanel] Remote description set. ICE gathering state:', pc.iceGatheringState);

      console.log('[ControlPanel] Creating answer...');
      const answer = await pc.createAnswer();
      console.log('[ControlPanel] Answer created. Setting local description...');
      await pc.setLocalDescription(answer);
      console.log('[ControlPanel] Local description set. ICE gathering should start. State:', pc.iceGatheringState);

      console.log('[ControlPanel] Sending answer to camera:', camera.id.slice(0, 8));
      const { error: answerError } = await supabase.from('webrtc_signaling').insert({
        camera_id: camera.id,
        session_id: activeSession?.id || '',
        signal_type: 'answer',
        signal_data: { sdp: pc.localDescription },
        from_role: 'viewer'
      });

      if (answerError) {
        console.error('[ControlPanel] FAILED to send answer:', answerError);
      } else {
        console.log('[ControlPanel] Answer sent successfully! ICE gathering:', pc.iceGatheringState);
      }

      const { data: existingCandidates } = await supabase
        .from('webrtc_signaling')
        .select('*')
        .eq('camera_id', camera.id)
        .eq('signal_type', 'ice_candidate')
        .eq('from_role', 'camera');

      if (existingCandidates) {
        for (const candidateSignal of existingCandidates) {
          if (candidateSignal.signal_data?.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidateSignal.signal_data.candidate));
            } catch (err) {
              console.log('Error adding existing ICE candidate:', err);
            }
          }
        }
      }

      const channelName = `viewer-cam-${camera.id}-${Date.now()}`;
      let receivedCandidateCount = 0;
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
          if (!currentPc) {
            console.log('[ControlPanel] Received signal but no PC:', signal.signal_type);
            return;
          }

          try {
            if (signal.signal_type === 'ice_candidate' && signal.signal_data?.candidate) {
              receivedCandidateCount++;
              if (receivedCandidateCount <= 3) {
                console.log(`[ControlPanel] Received ICE candidate #${receivedCandidateCount} from camera via realtime`);
              }
              await currentPc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
            }
          } catch (err) {
            console.error('[ControlPanel] Error adding ICE candidate:', err);
          }
        })
        .subscribe((status) => {
          console.log(`[ControlPanel] Signaling channel status for ${camera.camera_name}:`, status);
        });

      signalingChannelsRef.current[camera.id] = channel;
      console.log('WebRTC setup complete for camera:', camera.id);

    } catch (error) {
      console.error('Error setting up mobile camera connection:', error);
      delete peerConnectionsRef.current[camera.id];
    }
  };

  const cleanupMobileCameraConnection = (cameraId: string) => {
    if (peerConnectionsRef.current[cameraId]) {
      try {
        peerConnectionsRef.current[cameraId].close();
      } catch (e) {}
      delete peerConnectionsRef.current[cameraId];
    }

    if (signalingChannelsRef.current[cameraId]) {
      try {
        supabase.removeChannel(signalingChannelsRef.current[cameraId]);
      } catch (e) {}
      delete signalingChannelsRef.current[cameraId];
    }

    setRemoteStreams(prev => {
      const updated = { ...prev };
      delete updated[cameraId];
      return updated;
    });
  };

  const forceReconnectMobileCameras = async () => {
    const mobileCameras = cameras.filter(c => c.camera_type === 'mobile');
    for (const camera of mobileCameras) {
      cleanupMobileCameraConnection(camera.id);
      cameraLastConnectedRef.current[camera.id] = '';
    }
    if (activeSession?.id) {
      await loadCameras(activeSession.id);
    }
    setTimeout(() => {
      const connectedMobiles = cameras.filter(c =>
        c.camera_type === 'mobile' &&
        (c.status === 'connected' || c.status === 'streaming')
      );
      connectedMobiles.forEach(camera => {
        setupMobileCameraConnection(camera, 1);
      });
    }, 500);
  };

  const cameraFingerprint = cameras.map(c => `${c.id}:${c.status}:${c.last_connected_at || ''}`).join(',');

  useEffect(() => {
    if (!activeSession) return;

    const mobileCameras = cameras.filter(c =>
      c.camera_type === 'mobile' &&
      (c.status === 'connected' || c.status === 'streaming')
    );

    if (mobileCameras.length === 0) return;

    console.log('[ControlPanel] Mobile cameras found:', mobileCameras.length);
    mobileCameras.forEach(c => console.log(`  - ${c.camera_name}: ${c.status}, hasPc: ${!!peerConnectionsRef.current[c.id]}`));

    mobileCameras.forEach(camera => {
      const lastConnected = camera.last_connected_at || '';
      const previousLastConnected = cameraLastConnectedRef.current[camera.id];

      if (previousLastConnected && lastConnected !== previousLastConnected) {
        console.log('[ControlPanel] Camera reconnected, cleaning up old connection:', camera.id);
        cleanupMobileCameraConnection(camera.id);
      }

      cameraLastConnectedRef.current[camera.id] = lastConnected;

      if (!peerConnectionsRef.current[camera.id]) {
        console.log('[ControlPanel] Setting up connection for:', camera.camera_name);
        setupMobileCameraConnection(camera);
      }
    });
  }, [activeSession?.id, cameraFingerprint]);

  useEffect(() => {
    return () => {
      Object.keys(peerConnectionsRef.current).forEach(cameraId => {
        cleanupMobileCameraConnection(cameraId);
      });
      Object.keys(signalingChannelsRef.current).forEach(cameraId => {
        try {
          supabase.removeChannel(signalingChannelsRef.current[cameraId]);
        } catch (e) {}
      });
      if (whipPeerConnectionRef.current) {
        whipPeerConnectionRef.current.close();
        whipPeerConnectionRef.current = null;
      }
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
      if (mobileStream) {
        setActivePreviewStream(mobileStream);
      }
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
      console.log('[WHIP] Starting WHIP connection to:', whipUrl);
      setWhipStatus('connecting');

      if (whipPeerConnectionRef.current) {
        whipPeerConnectionRef.current.close();
        whipPeerConnectionRef.current = null;
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' }
        ],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      whipPeerConnectionRef.current = pc;

      pc.onconnectionstatechange = () => {
        console.log('[WHIP] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setWhipStatus('connected');
          addNotification('success', 'Connected to streaming server', 3000);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setWhipStatus('error');
          addNotification('error', 'Lost connection to streaming server', 5000);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WHIP] ICE connection state:', pc.iceConnectionState);
      };

      streamToSend.getTracks().forEach(track => {
        console.log('[WHIP] Adding track:', track.kind, track.label);
        pc.addTrack(track, streamToSend);
      });

      try {
        const transceivers = pc.getTransceivers();
        for (const transceiver of transceivers) {
          if (transceiver.sender.track?.kind === 'video') {
            const codecs = RTCRtpSender.getCapabilities('video')?.codecs;
            if (codecs) {
              const h264Codecs = codecs.filter(c => c.mimeType === 'video/H264');
              const otherCodecs = codecs.filter(c => c.mimeType !== 'video/H264');
              if (h264Codecs.length > 0) {
                transceiver.setCodecPreferences([...h264Codecs, ...otherCodecs]);
                console.log('[WHIP] Set H.264 as preferred codec for RTMP compatibility');
              }
            }
          }
        }
      } catch (e) {
        console.warn('[WHIP] Could not set H.264 preference:', e);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }, 3000);
        }
      });

      const localDescription = pc.localDescription;
      if (!localDescription) {
        throw new Error('No local description after ICE gathering');
      }

      console.log('[WHIP] Sending offer to WHIP endpoint...');
      const response = await fetch(whipUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp'
        },
        body: localDescription.sdp
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WHIP] Server error:', response.status, errorText);
        throw new Error(`WHIP server error: ${response.status}`);
      }

      const answerSdp = await response.text();
      console.log('[WHIP] Received answer from server');

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      });

      console.log('[WHIP] Connection established successfully');
      return true;
    } catch (error) {
      console.error('[WHIP] Error starting WHIP streaming:', error);
      setWhipStatus('error');
      if (whipPeerConnectionRef.current) {
        whipPeerConnectionRef.current.close();
        whipPeerConnectionRef.current = null;
      }
      return false;
    }
  };

  const stopWhipStreaming = () => {
    console.log('[WHIP] Stopping WHIP connection');
    if (whipPeerConnectionRef.current) {
      whipPeerConnectionRef.current.close();
      whipPeerConnectionRef.current = null;
    }
    setWhipStatus('disconnected');
  };

  const loadSpecificSession = async (id: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('livestream_sessions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setActiveSession(data);
        updateStreamStatus(data.status);
        loadCameras(data.id);
        loadSessions();
      }
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await livestreamStorage.getSessions(clubId);
      setSessions(data);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkActiveSession = async () => {
    try {
      const session = await livestreamStorage.getActiveSession(clubId);
      if (session && session.status === 'live') {
        setActiveSession(session);
        updateStreamStatus(session.status);
        loadCameras(session.id);
      }
    } catch (error) {
      console.error('Error checking active session:', error);
    }
  };

  const loadCameras = async (sessionId: string) => {
    try {
      const data = await livestreamStorage.getCameras(sessionId);
      setCameras(data);
    } catch (error) {
      console.error('Error loading cameras:', error);
    }
  };

  const updateStreamStatus = (status: string) => {
    if (status === 'live') setStreamStatus('live');
    else if (status === 'testing') setStreamStatus('testing');
    else setStreamStatus('offline');
  };

  const requestCameraAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' },
        audio: true
      });
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
      return null;
    }
  };

  const createNewSession = () => {
    setShowSetupWizard(true);
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

      if (!stream) {
        setStreamStatus('offline');
        return;
      }

      const existingCameras = await livestreamStorage.getCameras(activeSession.id);
      if (existingCameras.length === 0) {
        await livestreamStorage.createCamera({
          livestream_session_id: activeSession.id,
          camera_name: 'Laptop Camera',
          camera_type: 'laptop',
          is_primary: true,
          status: 'connected',
          position: 0
        });
      } else {
        await livestreamStorage.updateCamera(existingCameras[0].id, { status: 'connected' });
      }

      await livestreamStorage.updateSessionStatus(activeSession.id, 'testing');
      setStreamStatus('testing');
      await loadCameras(activeSession.id);
    } catch (error) {
      console.error('Error starting test stream:', error);
      setStreamStatus('offline');
      alert('Failed to start test stream');
    }
  };

  const goLive = async () => {
    if (!activeSession || streamStatus !== 'testing') return;

    try {
      setStreamStatus('connecting');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const actualStartTime = new Date().toISOString();

      const streamToSend = activePreviewStream || mediaStream;
      if (!streamToSend) {
        addNotification('error', 'No video source available. Please connect a camera first.', 5000);
        setStreamStatus('testing');
        return;
      }

      if (activeSession.streaming_mode === 'cloudflare_relay' && activeSession.cloudflare_whip_url) {
        console.log('[GoLive] Starting WHIP streaming to Cloudflare...');
        console.log('[GoLive] Session configuration:', {
          whipUrl: activeSession.cloudflare_whip_url,
          liveInputId: activeSession.cloudflare_live_input_id,
          outputId: activeSession.cloudflare_output_id,
          youtubeStreamUrl: activeSession.youtube_stream_url,
          youtubeStreamKeyLength: activeSession.youtube_stream_key?.length,
          youtubeBroadcastId: activeSession.youtube_broadcast_id
        });

        console.log('[GoLive] Session configuration verified. Starting stream...');

        addNotification('info', 'Connecting to streaming server...', 3000);

        const whipSuccess = await startWhipStreaming(activeSession.cloudflare_whip_url, streamToSend);

        if (!whipSuccess) {
          addNotification('error', 'Failed to connect to streaming server. Please check your Cloudflare Stream configuration.', 8000);
          setStreamStatus('testing');
          return;
        }

        console.log('[GoLive] WHIP streaming started successfully');

        // Check Cloudflare Live Input status to verify video is being received
        console.log('[GoLive] Checking Cloudflare Live Input status...');
        try {
          const liveInputResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'getLiveInput',
              clubId: clubId,
              sessionData: {
                liveInputId: activeSession.cloudflare_live_input_id
              }
            })
          });

          const liveInputData = await liveInputResponse.json();
          console.log('[GoLive] Cloudflare Live Input status:', JSON.stringify(liveInputData, null, 2));

          if (liveInputData.liveInput) {
            console.log('[GoLive] Live Input UID:', liveInputData.liveInput.uid);
            console.log('[GoLive] Live Input status:', liveInputData.liveInput.status);
            console.log('[GoLive] Live Input created:', liveInputData.liveInput.created);

            // Check if output exists on the live input
            if (liveInputData.liveInput.outputs) {
              console.log('[GoLive] Outputs configured on Live Input:', liveInputData.liveInput.outputs.length);
              liveInputData.liveInput.outputs.forEach((output: any, i: number) => {
                console.log(`[GoLive] Output ${i + 1}:`, {
                  uid: output.uid,
                  url: output.url,
                  enabled: output.enabled,
                  status: output.status
                });
              });

              const youtubeOutput = liveInputData.liveInput.outputs.find(
                (o: any) => o.url?.includes('youtube.com') || o.url?.includes('rtmp://a.rtmp') || o.url?.includes('rtmps://a.rtmps')
              );

              if (youtubeOutput) {
                console.log('[GoLive] YouTube output exists:', {
                  uid: youtubeOutput.uid,
                  enabled: youtubeOutput.enabled,
                  status: youtubeOutput.status,
                  note: 'null status is normal for newly created outputs'
                });

                // Don't recreate if status is null - that's normal for new outputs!
                // The output will be recreated later if YouTube continues reporting noData
              } else {
                console.warn('[GoLive] No YouTube output found on Live Input!');
              }
            } else {
              console.warn('[GoLive] No outputs configured on Live Input!');
            }
          }
        } catch (cfError) {
          console.error('[GoLive] Error checking Cloudflare Live Input:', cfError);
        }

        // Cloudflare Stream WebRTC/WHIP beta does NOT support output restreaming (simulcasting).
        // Outputs only work with RTMP or SRT ingest protocols.
        // YouTube streaming requires an external RTMP encoder (OBS, Streamlabs, etc.)
        if (activeSession.youtube_broadcast_id && activeSession.youtube_stream_url) {
          console.log('[GoLive] YouTube broadcast configured. RTMP URL:', activeSession.youtube_stream_url);
          console.log('[GoLive] Cloudflare WebRTC does not support simulcasting. External RTMP encoder required.');
          addNotification('info',
            'Cloudflare preview is live. To stream on YouTube, connect an RTMP encoder (e.g., OBS) using the credentials in Stream Settings.',
            12000
          );
        }

        if (activeSession.youtube_broadcast_id) {
          console.log('[GoLive] Checking YouTube broadcast status...');
          try {
            const initialStatusResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'getBroadcastStatus',
                clubId: clubId,
                sessionData: {
                  broadcastId: activeSession.youtube_broadcast_id
                }
              }),
            });

            const initialStatusData = await initialStatusResponse.json();
            if (initialStatusData?.items && initialStatusData.items.length > 0) {
              const broadcast = initialStatusData.items[0];
              const currentStatus = broadcast?.status?.lifeCycleStatus;
              console.log('[GoLive] Initial broadcast status:', currentStatus);

              // YouTube automatically transitions from 'ready' to 'testing' when video is detected
              // We cannot manually transition from 'ready' to 'testing' - it will cause 403 error
              if (currentStatus === 'ready') {
                console.log('[GoLive] Broadcast is in READY state. YouTube will auto-detect video and transition to TESTING.');
                addNotification('info', 'Starting stream. YouTube will detect video automatically...', 5000);
              } else if (currentStatus === 'testing') {
                console.log('[GoLive] ✅ Broadcast already in TESTING state - YouTube has detected video');
                addNotification('info', 'YouTube has detected video. Ready to go live!', 3000);
              } else if (currentStatus === 'live') {
                console.log('[GoLive] ⚠️ Broadcast is already LIVE');
                addNotification('warning', 'Broadcast is already live on YouTube', 3000);
              } else {
                console.log('[GoLive] Broadcast status:', currentStatus);
              }
            }
          } catch (error) {
            console.error('[GoLive] Error checking initial broadcast status:', error);
          }

          // Function to attempt YouTube transition with retries
          const attemptYouTubeTransition = async (attemptNumber = 1, maxAttempts = 3) => {
            try {
              console.log(`[GoLive] Attempt ${attemptNumber}/${maxAttempts}: Checking YouTube broadcast status...`);

              // Check the broadcast status
              const statusResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'getBroadcastStatus',
                  clubId: clubId,
                  sessionData: {
                    broadcastId: activeSession.youtube_broadcast_id
                  }
                }),
              });

              const statusData = await statusResponse.json();
              console.log('[GoLive] YouTube broadcast full status:', JSON.stringify(statusData, null, 2));

              // Check if broadcast exists
              if (!statusData?.items || statusData.items.length === 0) {
                console.error('[GoLive] YouTube broadcast not found!');
                console.error('[GoLive] Broadcast ID:', activeSession.youtube_broadcast_id);
                console.error('[GoLive] This broadcast may have been deleted from YouTube Studio');

                // IMPORTANT: Don't auto-recreate! That would break shared URLs
                addNotification('error',
                  'YouTube broadcast not found. The broadcast may have been deleted from YouTube Studio. Please delete this livestream and create a new one.',
                  15000
                );

                setStreamStatus('testing');

                // Stop WHIP streaming since we can't go live
                if (whipPeerConnection) {
                  console.log('[WHIP] Stopping WHIP connection');
                  whipPeerConnection.close();
                  setWhipPeerConnection(null);
                }

                return;
              }

              const broadcast = statusData.items[0];
              const currentStatus = broadcast?.status?.lifeCycleStatus;
              const streamStatus = broadcast?.status?.streamStatus;
              const recordingStatus = broadcast?.status?.recordingStatus;
              const boundStreamId = broadcast?.contentDetails?.boundStreamId;

              console.log('[GoLive] Broadcast lifecycle status:', currentStatus);
              console.log('[GoLive] Stream status:', streamStatus);
              console.log('[GoLive] Recording status:', recordingStatus);
              console.log('[GoLive] Bound stream ID:', boundStreamId);
              console.log('[GoLive] Full broadcast.status object:', broadcast?.status);

              if (boundStreamId) {
                try {
                  console.log('[GoLive] Checking YouTube stream health status...');
                  const streamStatusResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      action: 'getStreamStatus',
                      clubId: clubId,
                      sessionData: {
                        streamId: boundStreamId
                      }
                    }),
                  });

                  const streamStatusData = await streamStatusResponse.json();
                  console.log('[GoLive] YouTube stream status:', JSON.stringify(streamStatusData, null, 2));

                  if (streamStatusData?.items && streamStatusData.items.length > 0) {
                    const stream = streamStatusData.items[0];
                    const healthStatus = stream?.status?.healthStatus?.status;
                    const streamHealthDetails = stream?.status?.healthStatus?.configurationIssues;

                    console.log('[GoLive] Stream health status:', healthStatus);
                    console.log('[GoLive] Stream RTMP URL:', stream?.cdn?.ingestionInfo?.ingestionAddress);
                    console.log('[GoLive] Stream key exists:', !!stream?.cdn?.ingestionInfo?.streamName);

                    if (healthStatus === 'noData') {
                      console.log('[GoLive] YouTube stream health: noData - waiting for external RTMP encoder to connect');
                      if (attemptNumber === 1) {
                        addNotification('info', 'Waiting for RTMP encoder to connect to YouTube... Start streaming in OBS or your encoder software.', 8000);
                      }
                    } else if (healthStatus === 'good' || healthStatus === 'ok') {
                      console.log('[GoLive] YouTube is receiving video data!');
                    }

                    if (streamHealthDetails && streamHealthDetails.length > 0) {
                      console.warn('[GoLive] Stream configuration issues:', streamHealthDetails);
                    }
                  }
                } catch (streamError) {
                  console.error('[GoLive] Error checking stream status:', streamError);
                }
              }

              // YouTube may not populate streamStatus immediately
              // If streamStatus is undefined but lifecycle is 'testing' or 'live', stream is likely active
              const isStreamActive = streamStatus === 'active' ||
                                     (streamStatus === undefined && (currentStatus === 'testing' || currentStatus === 'live'));

              if (!isStreamActive) {
                console.log('[GoLive] YouTube stream not active. Waiting for external RTMP encoder connection...');

                if (attemptNumber < maxAttempts) {
                  const msg = attemptNumber === 1
                    ? 'Waiting for RTMP encoder to connect to YouTube. Start streaming in OBS or your encoder software.'
                    : `Still waiting for YouTube stream... (${attemptNumber}/${maxAttempts}). Ensure your RTMP encoder is streaming to the YouTube RTMP URL.`;
                  addNotification('info', msg, 8000);
                  setTimeout(() => attemptYouTubeTransition(attemptNumber + 1, maxAttempts), 15000);
                  return;
                } else {
                  addNotification('warning',
                    'YouTube stream not detected. Ensure your RTMP encoder (OBS, Streamlabs, etc.) is connected and streaming. Check the RTMP URL and Stream Key in Stream Settings.',
                    15000
                  );
                  return;
                }
              }

              // Stream is active, now check lifecycle status
              if (currentStatus === 'testing') {
                console.log('[GoLive] Stream is active and in testing mode. Transitioning to live...');
                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    action: 'transitionBroadcast',
                    clubId: clubId,
                    sessionData: {
                      broadcastId: activeSession.youtube_broadcast_id,
                      broadcastStatus: 'live'
                    }
                  }),
                });

                if (!response.ok) {
                  const errorData = await response.json();
                  console.error('[GoLive] YouTube transition error:', errorData);
                  addNotification('error',
                    `Failed to go live: ${errorData.error || 'Unknown error'}`,
                    10000
                  );
                } else {
                  console.log('✅ YouTube broadcast transitioned to live successfully!');
                  addNotification('success', 'Now streaming live on YouTube!', 5000);
                }
              } else if (currentStatus === 'ready') {
                // YouTube automatically transitions to 'testing' when video is detected
                // We cannot manually transition from 'ready' to 'testing'
                // Wait for YouTube to detect video and auto-transition
                console.log('[GoLive] Video is streaming but broadcast still in ready state. Waiting for YouTube to auto-detect and transition to testing...');

                if (attemptNumber < maxAttempts) {
                  addNotification('info', `Video detected. Waiting for YouTube to start testing... (${attemptNumber}/${maxAttempts})`, 5000);
                  setTimeout(() => attemptYouTubeTransition(attemptNumber + 1, maxAttempts), 15000);
                } else {
                  addNotification('warning',
                    'Video is streaming but YouTube has not started testing mode yet. This usually takes 30-60 seconds. Check YouTube Studio.',
                    15000
                  );
                }
              } else {
                console.warn('[GoLive] Unexpected broadcast state:', { currentStatus, streamStatus, isStreamActive });

                if (attemptNumber < maxAttempts) {
                  addNotification('info', `Broadcast status: ${currentStatus}. Checking again... (${attemptNumber}/${maxAttempts})`, 5000);
                  setTimeout(() => attemptYouTubeTransition(attemptNumber + 1, maxAttempts), 15000);
                } else {
                  addNotification('warning',
                    `Unable to go live. Status: ${currentStatus}, Stream: ${streamStatus || 'undefined'}. Check YouTube Studio for more details.`,
                    10000
                  );
                }
              }
            } catch (ytError: any) {
              console.error('[GoLive] YouTube API error:', ytError);
              addNotification('error', `YouTube error: ${ytError.message}`, 8000);
            }
          };

          setTimeout(() => attemptYouTubeTransition(1, 8), 15000);
        }
      } else if (activeSession.youtube_broadcast_id) {
        try {
          console.log('[GoLive] Transitioning YouTube broadcast to live (direct mode)...');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'transitionBroadcast',
              clubId: clubId,
              sessionData: {
                broadcastId: activeSession.youtube_broadcast_id,
                broadcastStatus: 'live'
              }
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.warn('[GoLive] YouTube transition warning:', errorData);
            addNotification('warning', 'YouTube transition failed - video requires external encoder (OBS) in direct mode.', 8000);
          } else {
            console.log('[GoLive] YouTube broadcast transitioned to live');
          }
        } catch (ytError) {
          console.error('[GoLive] YouTube API error:', ytError);
          addNotification('warning', 'Could not transition YouTube broadcast.', 5000);
        }
      }

      const { data: updatedSession, error: updateError } = await supabase
        .from('livestream_sessions')
        .update({
          status: 'live',
          actual_start_time: actualStartTime
        })
        .eq('id', activeSession.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setActiveSession(updatedSession);
      setStreamStatus('live');
      addNotification('success', 'Stream is now live!', 5000);
    } catch (error) {
      console.error('Error going live:', error);
      setStreamStatus('testing');
      stopWhipStreaming();
      alert('Failed to go live. Please try again.');
    }
  };

  const stopTesting = async () => {
    if (!activeSession) return;

    try {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }

      setActivePreviewStream(null);

      await livestreamStorage.updateSession(activeSession.id, {
        status: 'scheduled'
      });

      const sessionCameras = await livestreamStorage.getCameras(activeSession.id);
      for (const camera of sessionCameras) {
        if (camera.camera_type === 'laptop') {
          await livestreamStorage.updateCamera(camera.id, { status: 'disconnected' });
        }
      }

      setStreamStatus('offline');
      addNotification('info', 'Preview stopped', 3000);

      // Close the stream view and return to session list
      setTimeout(() => {
        setActiveSession(null);
      }, 500);
    } catch (error) {
      console.error('Error stopping test:', error);
    }
  };

  const stopStream = async () => {
    if (!activeSession) return;

    try {
      stopWhipStreaming();

      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }

      await livestreamStorage.updateSession(activeSession.id, {
        status: 'ended',
        actual_end_time: new Date().toISOString()
      });

      setStreamStatus('offline');
      addNotification('success', 'Stream ended successfully', 3000);

      // Close the stream view and return to session list
      setTimeout(() => {
        setActiveSession(null);
      }, 500);
    } catch (error) {
      console.error('Error stopping stream:', error);
    }
  };

  const removeCamera = async (cameraId: string) => {
    if (!activeSession) return;

    try {
      const cameraToRemove = cameras.find(c => c.id === cameraId);
      if (cameraToRemove?.is_primary && cameras.length > 1) {
        const otherCamera = cameras.find(c => c.id !== cameraId);
        if (otherCamera) {
          await livestreamStorage.setPrimaryCamera(activeSession.id, otherCamera.id);
        }
      }

      if (remoteStreams[cameraId]) {
        setRemoteStreams(prev => {
          const updated = { ...prev };
          delete updated[cameraId];
          return updated;
        });
      }

      await livestreamStorage.deleteCamera(cameraId);
      setCameras(cameras.filter(c => c.id !== cameraId));
      addNotification('success', 'Camera removed', 2000);
    } catch (error) {
      console.error('Error removing camera:', error);
      addNotification('error', 'Failed to remove camera', 3000);
    }
  };

  const handleSwitchCamera = async (cameraId: string) => {
    if (!activeSession) return;
    try {
      await livestreamStorage.setPrimaryCamera(activeSession.id, cameraId);

      const targetCamera = cameras.find(c => c.id === cameraId);
      if (targetCamera) {
        if (targetCamera.camera_type === 'laptop') {
          setActivePreviewStream(mediaStream);
        } else if (targetCamera.camera_type === 'mobile') {
          const mobileStream = remoteStreams[cameraId];
          if (mobileStream) {
            setActivePreviewStream(mobileStream);
          }
        }
      }

      await loadCameras(activeSession.id);
      addNotification('success', 'Camera switched', 2000);
    } catch (error) {
      console.error('Error switching camera:', error);
      addNotification('error', 'Failed to switch camera', 3000);
    }
  };

  const handleRemoteStreamAvailable = (cameraId: string, stream: MediaStream | null) => {
    setRemoteStreams(prev => ({ ...prev, [cameraId]: stream }));
    const primaryCamera = cameras.find(c => c.is_primary);
    if (primaryCamera?.id === cameraId && stream) {
      setActivePreviewStream(stream);
    }
  };

  const deleteSession = async (session: SessionWithVenue) => {
    try {
      await livestreamStorage.deleteSession(session.id);
      setSessions(sessions.filter(s => s.id !== session.id));
      if (activeSession?.id === session.id) {
        setActiveSession(null);
        setStreamStatus('offline');
      }
      addNotification('success', 'Stream deleted', 3000);
    } catch (error) {
      console.error('Error deleting session:', error);
      addNotification('error', 'Failed to delete stream', 5000);
    }
  };

  const primaryCamera = cameras.find(c => c.is_primary);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="space-y-6">
        {/* Create New Stream Card */}
        <div className="bg-slate-800/30 rounded-2xl p-12 text-center border border-slate-700/50">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Video className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">Start Broadcasting</h3>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">Create a new livestream session to broadcast your races live to YouTube</p>
          <button
            onClick={createNewSession}
            className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold inline-flex items-center gap-3 transition-all shadow-lg shadow-red-500/25 hover:shadow-red-500/40 animate-pulse"
          >
            <Video className="w-5 h-5" />
            Create Stream
          </button>
        </div>

        {/* Existing Sessions List */}
        {sessions.length > 0 && (
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-white">Previous Streams</h3>
              <p className="text-sm text-slate-400">Click to open or manage existing stream sessions</p>
            </div>
            <div className="divide-y divide-slate-700/50">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-slate-700/20 transition-colors"
                >
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => {
                      setActiveSession(session);
                      updateStreamStatus(session.status);
                      loadCameras(session.id);
                    }}
                  >
                    <h4 className="text-white font-medium">{session.title}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        session.status === 'live'
                          ? 'bg-red-500/20 text-red-400'
                          : session.status === 'ended'
                            ? 'bg-slate-500/20 text-slate-400'
                            : session.status === 'testing'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {session.status === 'live' ? 'LIVE' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                      </span>
                      {session.scheduled_start_time && (
                        <span className="text-xs text-slate-500">
                          {new Date(session.scheduled_start_time).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActiveSession(session);
                        updateStreamStatus(session.status);
                        loadCameras(session.id);
                      }}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                      title="Open stream"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setSessionToDelete(session);
                        setShowDeleteConfirm(true);
                      }}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete stream"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSetupWizard && (
          <LivestreamSetupWizard
            clubId={clubId}
            onClose={() => setShowSetupWizard(false)}
            onComplete={handleWizardComplete}
          />
        )}

        {showDeleteConfirm && sessionToDelete && (
          <ConfirmationModal
            isOpen={true}
            onClose={() => {
              setShowDeleteConfirm(false);
              setSessionToDelete(null);
            }}
            onConfirm={async () => {
              await deleteSession(sessionToDelete);
              setShowDeleteConfirm(false);
              setSessionToDelete(null);
            }}
            title="Delete Stream"
            message={`Are you sure you want to delete "${sessionToDelete.title}"? This action cannot be undone.`}
            confirmText="Delete"
            confirmStyle="danger"
          />
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/30 rounded-2xl overflow-hidden border border-slate-700/50">
      {/* Top Control Bar */}
      <div className="bg-slate-800/50 border-b border-slate-700/50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            {/* Status Badge */}
            {streamStatus === 'live' ? (
              <div className="flex items-center gap-2.5 bg-red-500/20 border border-red-500/30 px-4 py-2 rounded-full">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
                <span className="text-red-400 font-bold text-sm tracking-wide">LIVE</span>
              </div>
            ) : streamStatus === 'testing' ? (
              <div className="flex items-center gap-2.5 bg-amber-500/20 border border-amber-500/30 px-4 py-2 rounded-full">
                <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-amber-400 font-bold text-sm tracking-wide">TESTING</span>
              </div>
            ) : streamStatus === 'connecting' ? (
              <div className="flex items-center gap-2.5 bg-blue-500/20 border border-blue-500/30 px-4 py-2 rounded-full">
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                <span className="text-blue-400 font-bold text-sm tracking-wide">CONNECTING</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-slate-700/50 border border-slate-600/30 px-4 py-2 rounded-full">
                <div className="w-2.5 h-2.5 bg-slate-500 rounded-full" />
                <span className="text-slate-400 font-bold text-sm tracking-wide">OFFLINE</span>
              </div>
            )}

            {/* Stream Stats */}
            {streamStatus === 'live' && (
              <div className="flex items-center gap-5 text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono text-sm">{formatDuration(streamDuration)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span className="text-sm">{viewerCount} watching</span>
                </div>
                {activeSession?.streaming_mode === 'cloudflare_relay' && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
                    whipStatus === 'connected'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : whipStatus === 'connecting'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {whipStatus === 'connected' ? (
                      <Cloud className="w-3.5 h-3.5" />
                    ) : whipStatus === 'connecting' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudOff className="w-3.5 h-3.5" />
                    )}
                    <span>{whipStatus === 'connected' ? 'Streaming' : whipStatus === 'connecting' ? 'Connecting' : 'Disconnected'}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {streamStatus === 'offline' && (
              <>
                <button
                  onClick={startTestStream}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20"
                >
                  <Camera className="w-4 h-4" />
                  Start Preview
                </button>
                <button
                  onClick={() => {
                    setSessionToDelete(activeSession);
                    setShowDeleteConfirm(true);
                  }}
                  className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                  title="Delete this stream"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}

            {streamStatus === 'testing' && (
              <>
                <button
                  onClick={goLive}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-red-500/25"
                >
                  <Play className="w-4 h-4" />
                  Go Live
                </button>
                <button
                  onClick={stopTesting}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <StopCircle className="w-4 h-4" />
                  Stop
                </button>
              </>
            )}

            {streamStatus === 'live' && (
              <button
                onClick={stopStream}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                <Square className="w-4 h-4" />
                End Stream
              </button>
            )}

            <button
              onClick={() => setShowAnalytics(true)}
              className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              title="Analytics"
            >
              <BarChart3 className="w-5 h-5" />
            </button>

            {/* Always show close button */}
            <button
              onClick={() => {
                if (streamStatus === 'live' || streamStatus === 'testing') {
                  if (confirm('Stream is currently active. Are you sure you want to close this view? The stream will continue running.')) {
                    setActiveSession(null);
                  }
                } else {
                  setActiveSession(null);
                }
              }}
              className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              title="Close stream view"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Main Content Area */}
        <div className="flex-1 p-5">
          {/* Main Preview Monitor */}
          <div className={`bg-slate-900 rounded-2xl overflow-hidden relative ${isFullscreen ? 'fixed inset-4 z-50' : 'aspect-video'} shadow-2xl border border-slate-700/50`}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain bg-slate-900"
            />

            {activeSession.enable_overlays && (streamStatus === 'testing' || streamStatus === 'live') && (
              <LivestreamOverlayRenderer session={activeSession} />
            )}

            {streamStatus === 'offline' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <div className="text-center">
                  <div className="w-24 h-24 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Video className="w-12 h-12 text-slate-500" />
                  </div>
                  <p className="text-slate-400 text-lg">Click "Start Preview" to begin</p>
                </div>
              </div>
            )}

            {/* Preview Info Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5">
              <h3 className="text-white font-semibold text-lg truncate">{activeSession.title}</h3>
              {primaryCamera && (
                <p className="text-slate-400 text-sm flex items-center gap-2 mt-1">
                  {primaryCamera.camera_type === 'laptop' ? (
                    <Monitor className="w-4 h-4" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                  {primaryCamera.camera_name}
                  <span className="text-slate-600">|</span>
                  <span className="text-green-400 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                    Active Source
                  </span>
                </p>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="absolute top-4 right-4 p-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-xl text-white transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>

          {/* Camera Sources Strip */}
          <div className="mt-5 bg-slate-800/30 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-white font-semibold flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-slate-400" />
                Camera Sources
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => forceReconnectMobileCameras()}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Refresh and reconnect cameras"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                {streamStatus !== 'offline' && (
                  <button
                    onClick={() => setShowMobileQR(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Phone
                  </button>
                )}
              </div>
            </div>

            {/* Horizontal Camera Grid */}
            <div className="flex flex-wrap gap-4">
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
                    className={`w-48 rounded-xl overflow-hidden transition-all flex-shrink-0 ${
                      isActive
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800'
                        : isConnected
                          ? 'hover:ring-2 hover:ring-slate-500 hover:ring-offset-2 hover:ring-offset-slate-800 cursor-pointer'
                          : 'opacity-50'
                    }`}
                  >
                    <div className="aspect-video bg-slate-700/50 relative">
                      {isLaptop && mediaStream ? (
                        <VideoThumbnail stream={mediaStream} muted />
                      ) : isMobile && remoteStream ? (
                        <VideoThumbnail stream={remoteStream} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-700/50">
                          {isConnected ? (
                            <div className="text-center">
                              <Camera className="w-8 h-8 text-green-500 mx-auto mb-1" />
                              <span className="text-xs text-green-400">Ready</span>
                            </div>
                          ) : (
                            <Camera className="w-8 h-8 text-slate-500" />
                          )}
                        </div>
                      )}

                      {/* Active Badge */}
                      {isActive && (
                        <div className="absolute top-2 left-2 bg-blue-600 px-2 py-1 rounded-lg text-xs font-bold text-white flex items-center gap-1 shadow-lg">
                          <Radio className="w-3 h-3" />
                          ACTIVE
                        </div>
                      )}

                      {/* Live Indicator */}
                      {!isActive && hasVideo && (
                        <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
                      )}
                    </div>

                    <div className="bg-slate-700/50 backdrop-blur-sm px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isLaptop ? (
                            <Monitor className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          ) : (
                            <Smartphone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          )}
                          <span className="text-xs text-slate-300 truncate font-medium">{camera.camera_name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCamera(camera.id);
                          }}
                          className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                          title="Remove camera"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {cameras.length === 0 && (
                <div className="w-full text-center py-8 text-slate-400">
                  <Camera className="w-10 h-10 mx-auto mb-2 text-slate-500" />
                  <p>No cameras connected</p>
                  <p className="text-xs text-slate-500 mt-1">Start preview to connect your camera</p>
                </div>
              )}
            </div>

            {cameras.length > 0 && (
              <p className="text-center text-xs text-slate-500 mt-4">Click a camera to make it the active broadcast source</p>
            )}
          </div>
        </div>

        {/* Right Sidebar Panel */}
        <div className="w-80 border-l border-slate-700/50 bg-slate-800/20">
          {/* Settings Accordion */}
          <div className="border-b border-slate-700/50">
            <button
              onClick={() => setExpandedPanel(expandedPanel === 'settings' ? null : 'settings')}
              className="w-full px-5 py-4 flex items-center justify-between text-white hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                  <Settings className="w-4 h-4 text-slate-400" />
                </div>
                <span className="font-semibold text-sm">Stream Settings</span>
              </div>
              {expandedPanel === 'settings' ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {expandedPanel === 'settings' && (
              <div className="px-5 pb-5 space-y-5">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-2">Stream Title</label>
                  <input
                    type="text"
                    value={activeSession.title}
                    onChange={async (e) => {
                      const newTitle = e.target.value;
                      setActiveSession({ ...activeSession, title: newTitle });
                      await livestreamStorage.updateSession(activeSession.id, { title: newTitle });
                    }}
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-2">Description</label>
                  <textarea
                    value={activeSession.description || ''}
                    onChange={async (e) => {
                      const newDesc = e.target.value;
                      setActiveSession({ ...activeSession, description: newDesc });
                      await livestreamStorage.updateSession(activeSession.id, { description: newDesc });
                    }}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                  />
                </div>

                {/* Toggle Options */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Layers className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-300">Show Overlays</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeSession.enable_overlays}
                        onChange={async (e) => {
                          const enabled = e.target.checked;
                          setActiveSession({ ...activeSession, enable_overlays: enabled });
                          await livestreamStorage.updateSession(activeSession.id, { enable_overlays: enabled });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-600 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-300">Live Chat</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeSession.enable_chat}
                        onChange={async (e) => {
                          const enabled = e.target.checked;
                          setActiveSession({ ...activeSession, enable_chat: enabled });
                          await livestreamStorage.updateSession(activeSession.id, { enable_chat: enabled });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-600 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => setShowSelectRace(true)}
                    className="w-full px-4 py-2.5 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-xl text-sm font-medium flex items-center gap-3 transition-colors"
                  >
                    <Users className="w-4 h-4 text-slate-400" />
                    Link Race/Heat
                  </button>
                  <button
                    onClick={() => setShowSchedule(true)}
                    className="w-full px-4 py-2.5 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-xl text-sm font-medium flex items-center gap-3 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-slate-400" />
                    Schedule Stream
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Overlays Accordion */}
          <div className="border-b border-slate-700/50">
            <button
              onClick={() => setExpandedPanel(expandedPanel === 'overlays' ? null : 'overlays')}
              className="w-full px-5 py-4 flex items-center justify-between text-white hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center">
                  <Layers className="w-4 h-4 text-slate-400" />
                </div>
                <span className="font-semibold text-sm">Overlay Design</span>
              </div>
              {expandedPanel === 'overlays' ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {expandedPanel === 'overlays' && (
              <div className="px-5 pb-5">
                <OverlaysManager
                  session={activeSession}
                  onUpdate={(updates) => {
                    setActiveSession({ ...activeSession, ...updates });
                    livestreamStorage.updateSession(activeSession.id, updates);
                  }}
                />
              </div>
            )}
          </div>

          {/* Stream Info Panel */}
          <div className="p-5">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Stream Info</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                <span className="text-sm text-slate-400">Mode</span>
                <span className="text-sm text-white font-medium">
                  {activeSession?.streaming_mode === 'cloudflare_relay' ? 'Cloud Relay' : 'Direct'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                <span className="text-sm text-slate-400">Quality</span>
                <span className="text-sm text-white font-medium">720p HD</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                <span className="text-sm text-slate-400">Est. Data/Hour</span>
                <span className="text-sm text-white font-medium">~1.1 GB</span>
              </div>
              {streamStatus === 'live' && activeSession?.streaming_mode === 'cloudflare_relay' && (
                <div className={`flex items-center gap-3 p-3 rounded-xl ${
                  whipStatus === 'connected'
                    ? 'bg-green-500/10 border border-green-500/20'
                    : whipStatus === 'connecting'
                      ? 'bg-amber-500/10 border border-amber-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                }`}>
                  {whipStatus === 'connected' ? (
                    <>
                      <Cloud className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-400 font-medium">Streaming to Cloud</span>
                    </>
                  ) : whipStatus === 'connecting' ? (
                    <>
                      <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                      <span className="text-sm text-amber-400 font-medium">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <CloudOff className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-400 font-medium">Disconnected</span>
                    </>
                  )}
                </div>
              )}
              {streamStatus !== 'live' && (
                <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-xl">
                  <Wifi className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-400 font-medium">Ready to stream</span>
                </div>
              )}
              {activeSession?.youtube_broadcast_id && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <Video className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-400 font-medium">YouTube Connected</span>
                </div>
              )}
            </div>
          </div>

          {activeSession?.youtube_broadcast_id && activeSession?.youtube_stream_key && (
            <div className="p-5 border-t border-slate-700/50">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">YouTube RTMP Credentials</h4>
              <p className="text-xs text-slate-400 mb-3">
                Use these in OBS, Streamlabs, or any RTMP encoder to stream to YouTube.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Server URL</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono truncate">
                      {activeSession.youtube_stream_url || 'rtmp://a.rtmp.youtube.com/live2'}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeSession.youtube_stream_url || 'rtmp://a.rtmp.youtube.com/live2');
                        setCopiedField('url');
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                      className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors"
                      title="Copy URL"
                    >
                      {copiedField === 'url' ? (
                        <span className="text-xs text-green-400">Copied</span>
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Stream Key</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono truncate">
                      {showStreamKey ? activeSession.youtube_stream_key : '••••••••••••••••'}
                    </div>
                    <button
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors"
                      title={showStreamKey ? 'Hide key' : 'Show key'}
                    >
                      {showStreamKey ? (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeSession.youtube_stream_key || '');
                        setCopiedField('key');
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                      className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors"
                      title="Copy key"
                    >
                      {copiedField === 'key' ? (
                        <span className="text-xs text-green-400">Copied</span>
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
                <a
                  href="https://studio.youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors mt-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open YouTube Studio
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showMobileQR && activeSession && (
        <MobileCameraQRModal
          sessionId={activeSession.id}
          onClose={() => setShowMobileQR(false)}
        />
      )}

      {showSelectRace && (
        <SelectRaceHeatModal
          clubId={clubId}
          onSelect={(eventId, heatId) => {
            if (activeSession) {
              livestreamStorage.updateSession(activeSession.id, {
                event_id: eventId,
                heat_id: heatId
              });
            }
            setShowSelectRace(false);
          }}
          onClose={() => setShowSelectRace(false)}
        />
      )}

      {showSchedule && activeSession && (
        <ScheduleStreamModal
          session={activeSession}
          onSave={async (scheduledTime) => {
            await livestreamStorage.updateSession(activeSession.id, {
              scheduled_start_time: scheduledTime.toISOString(),
              status: 'scheduled'
            });
            setShowSchedule(false);
          }}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {showAnalytics && activeSession && (
        <StreamAnalyticsModal
          sessionId={activeSession.id}
          clubId={clubId}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showSetupWizard && (
        <LivestreamSetupWizard
          clubId={clubId}
          onClose={() => setShowSetupWizard(false)}
          onComplete={handleWizardComplete}
        />
      )}

      {showDeleteConfirm && sessionToDelete && (
        <ConfirmationModal
          isOpen={true}
          onClose={() => {
            setShowDeleteConfirm(false);
            setSessionToDelete(null);
          }}
          onConfirm={async () => {
            await deleteSession(sessionToDelete);
            setShowDeleteConfirm(false);
            setSessionToDelete(null);
          }}
          title="Delete Stream"
          message={`Are you sure you want to delete "${sessionToDelete.title}"? This action cannot be undone.`}
          confirmText="Delete"
          confirmStyle="danger"
        />
      )}
    </div>
  );
}

function VideoThumbnail({ stream, muted = false }: { stream: MediaStream; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className="w-full h-full object-cover"
    />
  );
}

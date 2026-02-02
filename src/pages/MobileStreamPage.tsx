import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Video, AlertCircle, Loader2, RefreshCw, Signal, Square, ZoomIn, ZoomOut, RotateCcw, Bug } from 'lucide-react';
import { supabase } from '../utils/supabase';

const BUILD_VERSION = '20260122-v4';

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

type Phase = 'init' | 'camera' | 'connected' | 'error';

export default function MobileStreamPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [phase, setPhase] = useState<Phase>('init');
  const [statusText, setStatusText] = useState('Starting camera...');
  const [sessionTitle, setSessionTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const addDebugLog = (msg: string) => {
    console.log('[Mobile Debug]', msg);
    setDebugLog(prev => [...prev.slice(-20), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cameraIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mountedRef = useRef(true);
  const initRef = useRef(false);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  const zoomIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (e) {}
      channelRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }

    videoTrackRef.current = null;

    if (cameraIdRef.current && sessionId) {
      supabase.from('livestream_camera_sources')
        .update({ status: 'disconnected' })
        .eq('id', cameraIdRef.current)
        .then(() => {});
    }
  }, [sessionId]);

  const applyZoom = useCallback(async (newZoom: number) => {
    const track = videoTrackRef.current;
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as any;
      if (!capabilities.zoom) return;

      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
      await track.applyConstraints({ advanced: [{ zoom: clampedZoom } as any] });
      setZoomLevel(clampedZoom);

      setShowZoomIndicator(true);
      if (zoomIndicatorTimeoutRef.current) {
        clearTimeout(zoomIndicatorTimeoutRef.current);
      }
      zoomIndicatorTimeoutRef.current = setTimeout(() => {
        setShowZoomIndicator(false);
      }, 1500);
    } catch (err) {
      console.log('[Mobile] Zoom error:', err);
    }
  }, [minZoom, maxZoom]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistanceRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const delta = currentDistance - lastTouchDistanceRef.current;
      const zoomSensitivity = 0.01;
      const newZoom = zoomLevel + delta * zoomSensitivity;
      applyZoom(newZoom);
      lastTouchDistanceRef.current = currentDistance;
    }
  }, [zoomLevel, applyZoom]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistanceRef.current = null;
  }, []);

  const handleVideoTap = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (phase === 'connected') {
        setShowControls(false);
      }
    }, 4000);
  }, [phase]);

  const initialize = useCallback(async () => {
    if (!sessionId || !mountedRef.current) return;

    addDebugLog(`BUILD: ${BUILD_VERSION} - Starting init for session: ${sessionId}`);

    try {
      addDebugLog('Fetching session...');
      const { data: session, error: sessionErr } = await supabase
        .from('livestream_sessions')
        .select('id, title, status')
        .eq('id', sessionId)
        .maybeSingle();

      if (!mountedRef.current) return;

      if (sessionErr) {
        addDebugLog(`Session fetch error: ${sessionErr.message}`);
        setPhase('error');
        setErrorMsg(`Failed to load session: ${sessionErr.message}`);
        return;
      }

      if (!session) {
        addDebugLog('Session not found');
        setPhase('error');
        setErrorMsg('Session not found');
        return;
      }

      addDebugLog(`Session found: ${session.title}, status: ${session.status}`);

      if (session.status === 'ended') {
        setPhase('error');
        setErrorMsg('This stream has ended');
        return;
      }

      setSessionTitle(session.title);
      setStatusText('Requesting camera...');
      addDebugLog('Requesting camera permission...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      videoTrackRef.current = videoTrack;

      if (videoTrack) {
        try {
          const capabilities = videoTrack.getCapabilities() as any;
          if (capabilities.zoom) {
            setMinZoom(capabilities.zoom.min || 1);
            setMaxZoom(capabilities.zoom.max || 1);
            const settings = videoTrack.getSettings() as any;
            setZoomLevel(settings.zoom || 1);
          }
        } catch (e) {}
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {}
      }

      addDebugLog('Camera stream obtained');
      setPhase('camera');
      setStatusText('Registering camera...');

      const deviceName = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iPhone' :
                        /Android/.test(navigator.userAgent) ? 'Android' : 'Mobile';

      const getDeviceFingerprint = () => {
        let fingerprint = localStorage.getItem('alfie_device_fp');
        if (!fingerprint) {
          fingerprint = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          localStorage.setItem('alfie_device_fp', fingerprint);
        }
        return fingerprint;
      };

      const deviceFingerprint = getDeviceFingerprint();
      addDebugLog(`Device fingerprint: ${deviceFingerprint.substring(0, 10)}...`);

      addDebugLog('Checking for existing cameras...');
      const { data: existingCameras, error: existingCamerasErr } = await supabase
        .from('livestream_camera_sources')
        .select('id, camera_name')
        .eq('livestream_session_id', sessionId)
        .eq('camera_type', 'mobile');

      if (existingCamerasErr) {
        addDebugLog(`Error fetching existing cameras: ${existingCamerasErr.message}`);
      }

      const { data: existingForDevice, error: existingForDeviceErr } = await supabase
        .from('livestream_camera_sources')
        .select('id')
        .eq('livestream_session_id', sessionId)
        .eq('camera_type', 'mobile')
        .eq('device_fingerprint', deviceFingerprint)
        .maybeSingle();

      if (existingForDeviceErr) {
        addDebugLog(`Error checking device fingerprint: ${existingForDeviceErr.message}`);
      }

      addDebugLog(`Existing cameras: ${existingCameras?.length || 0}, This device: ${existingForDevice ? 'found' : 'new'}`);

      let camId: string;
      const mobileCount = (existingCameras?.length || 0) + 1;
      let shouldCreateNew = !existingForDevice;

      if (existingForDevice) {
        addDebugLog(`Found existing camera for device: ${existingForDevice.id}`);

        const { data: verifyCamera } = await supabase
          .from('livestream_camera_sources')
          .select('id')
          .eq('id', existingForDevice.id)
          .maybeSingle();

        if (!verifyCamera) {
          addDebugLog(`Camera no longer exists, clearing fingerprint and creating new`);
          localStorage.removeItem('alfie_device_fp');
          shouldCreateNew = true;
        } else {
          await supabase.from('webrtc_signaling')
            .delete()
            .eq('camera_id', existingForDevice.id);

          const { data: updatedData, error: updateError } = await supabase.from('livestream_camera_sources')
            .update({ status: 'connected', last_connected_at: new Date().toISOString() })
            .eq('id', existingForDevice.id)
            .select('id');

          if (updateError || !updatedData?.length) {
            addDebugLog(`Camera update failed or no rows affected: ${updateError?.message || 'Camera not found'}`);
            localStorage.removeItem('alfie_device_fp');
            shouldCreateNew = true;
          } else {
            camId = existingForDevice.id;
            addDebugLog(`Camera updated: ${camId}`);
          }
        }
      }

      if (shouldCreateNew) {
        const cameraNameWithNumber = mobileCount > 1 ? `Mobile ${mobileCount} - ${deviceName}` : `Mobile - ${deviceName}`;
        addDebugLog(`Creating new camera: ${cameraNameWithNumber}`);

        const { data: newCam, error: insertError } = await supabase.from('livestream_camera_sources')
          .insert({
            livestream_session_id: sessionId,
            camera_name: cameraNameWithNumber,
            camera_type: 'mobile',
            status: 'connected',
            is_primary: false,
            position: mobileCount,
            device_fingerprint: deviceFingerprint
          })
          .select('id')
          .single();

        if (insertError) {
          addDebugLog(`Camera insert FAILED: ${insertError.message} (code: ${insertError.code})`);
          setPhase('error');
          setErrorMsg(`Failed to register camera: ${insertError.message}`);
          return;
        }
        addDebugLog(`Camera created successfully: ${newCam.id}`);
        camId = newCam.id;
      }

      if (!mountedRef.current) return;

      cameraIdRef.current = camId;
      setStatusText('Setting up connection...');
      addDebugLog('Creating peer connection...');

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      let iceCandidateCount = 0;
      pc.onicecandidate = (e) => {
        if (e.candidate && cameraIdRef.current) {
          iceCandidateCount++;
          if (iceCandidateCount <= 3) {
            addDebugLog(`Sending ICE candidate #${iceCandidateCount}: ${e.candidate.candidate.substring(0, 50)}...`);
          } else if (iceCandidateCount === 4) {
            addDebugLog(`Sending more ICE candidates...`);
          }
          supabase.from('webrtc_signaling').insert({
            camera_id: cameraIdRef.current,
            session_id: sessionId,
            signal_type: 'ice_candidate',
            signal_data: { candidate: e.candidate.toJSON() },
            from_role: 'camera'
          });
        } else if (!e.candidate) {
          addDebugLog(`ICE gathering complete - sent ${iceCandidateCount} candidates`);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!mountedRef.current) return;
        addDebugLog(`ICE connection state: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'checking') {
          setStatusText('Checking connectivity...');
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setStatusText('Connected!');
        } else if (pc.iceConnectionState === 'failed') {
          setStatusText('Connection failed');
          addDebugLog('ICE FAILED - may need TURN relay or different network');
        }
      };

      pc.onicegatheringstatechange = () => {
        if (!mountedRef.current) return;
        addDebugLog(`ICE gathering state: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'gathering') {
          setStatusText('Gathering candidates...');
        }
      };

      pc.onsignalingstatechange = () => {
        if (!mountedRef.current) return;
        addDebugLog(`Signaling state: ${pc.signalingState}`);
      };

      pc.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        addDebugLog(`Connection state: ${pc.connectionState} (ICE: ${pc.iceConnectionState}, sig: ${pc.signalingState})`);

        if (pc.connectionState === 'connected') {
          addDebugLog('SUCCESS! Connected to control panel');
          setPhase('connected');
          setStatusText('Streaming');
          if (cameraIdRef.current) {
            supabase.from('livestream_camera_sources')
              .update({ status: 'streaming' })
              .eq('id', cameraIdRef.current);
          }
          controlsTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
          }, 3000);
        } else if (pc.connectionState === 'failed') {
          addDebugLog('Connection FAILED - ICE may have failed to find a path');
          setStatusText('Connection failed');
        } else if (pc.connectionState === 'disconnected') {
          addDebugLog('Disconnected - attempting reconnect');
          setStatusText('Reconnecting...');
        }
      };

      const channelName = `mobile-cam-${camId}-${Date.now()}`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'webrtc_signaling',
          filter: `camera_id=eq.${camId}`
        }, async (payload) => {
          const signal = payload.new as any;
          if (signal.from_role !== 'viewer') return;

          const currentPc = pcRef.current;
          if (!currentPc) {
            addDebugLog(`[Realtime] Signal received but no PC: ${signal.signal_type}`);
            return;
          }

          try {
            if (signal.signal_type === 'answer' && signal.signal_data?.sdp) {
              addDebugLog(`[Realtime] Answer received! Setting remote description...`);
              await currentPc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.sdp));
              addDebugLog(`[Realtime] Remote description set via realtime`);
            } else if (signal.signal_type === 'ice_candidate' && signal.signal_data?.candidate) {
              addDebugLog(`[Realtime] ICE candidate from viewer received`);
              await currentPc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
            }
          } catch (err: any) {
            addDebugLog(`[Realtime] Error handling signal: ${err.message}`);
          }
        })
        .subscribe();

      channelRef.current = channel;

      addDebugLog(`PC event handlers attached. Initial states - ICE: ${pc.iceGatheringState}, conn: ${pc.connectionState}, sig: ${pc.signalingState}`);

      addDebugLog('Creating WebRTC offer...');
      const offer = await pc.createOffer();
      addDebugLog(`Offer created. Setting local description...`);
      await pc.setLocalDescription(offer);
      addDebugLog(`Local description set. ICE gathering should start now. State: ${pc.iceGatheringState}`);

      addDebugLog(`Sending offer for camera: ${camId}`);
      const { error: offerError } = await supabase.from('webrtc_signaling').insert({
        camera_id: camId,
        session_id: sessionId,
        signal_type: 'offer',
        signal_data: { sdp: pc.localDescription },
        from_role: 'camera'
      });

      if (offerError) {
        addDebugLog(`OFFER INSERT FAILED: ${offerError.message} (code: ${offerError.code})`);
        setPhase('error');
        setErrorMsg(`Failed to establish connection: ${offerError.message}`);
        return;
      }

      addDebugLog('Offer sent successfully! Waiting for viewer...');
      setStatusText('Waiting for viewer...');

      const pollForAnswer = async (attempts = 0) => {
        if (!mountedRef.current) {
          addDebugLog(`Poll stopped: component unmounted`);
          return;
        }
        if (attempts > 60) {
          addDebugLog(`Poll stopped: max attempts reached`);
          return;
        }
        if (pc.connectionState === 'connected') {
          addDebugLog(`Poll stopped: already connected`);
          return;
        }

        addDebugLog(`Poll ${attempts + 1}: conn=${pc.connectionState}, ice=${pc.iceConnectionState}, remDesc=${!!pc.remoteDescription}`);

        if (!pc.remoteDescription) {
          const { data: answerSignal, error: answerError } = await supabase
            .from('webrtc_signaling')
            .select('*')
            .eq('camera_id', camId)
            .eq('signal_type', 'answer')
            .eq('from_role', 'viewer')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (answerError) {
            addDebugLog(`Answer query error: ${answerError.message}`);
          }

          if (attempts === 5) {
            const { data: allSignals } = await supabase
              .from('webrtc_signaling')
              .select('camera_id, signal_type, from_role')
              .eq('session_id', sessionId);
            addDebugLog(`All signals in session: ${JSON.stringify(allSignals?.map(s => ({ cam: s.camera_id?.slice(0,8), type: s.signal_type, from: s.from_role })))}`);
          }

          if (answerSignal?.signal_data?.sdp) {
            addDebugLog(`Answer received! Setting remote description...`);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(answerSignal.signal_data.sdp));
              addDebugLog(`Remote description set. ICE state: ${pc.iceConnectionState}`);
            } catch (e: any) {
              addDebugLog(`Error setting answer: ${e.message}`);
            }
          } else {
            addDebugLog(`No answer found yet`);
          }
        }

        if (pc.remoteDescription && pc.connectionState !== 'connected') {
          const { data: iceCandidates, error: iceError } = await supabase
            .from('webrtc_signaling')
            .select('*')
            .eq('camera_id', camId)
            .eq('signal_type', 'ice_candidate')
            .eq('from_role', 'viewer')
            .order('created_at', { ascending: true });

          if (iceError) {
            addDebugLog(`ICE fetch error: ${iceError.message}`);
          }

          if (iceCandidates && iceCandidates.length > 0) {
            let addedCount = 0;
            for (const c of iceCandidates) {
              if (c.signal_data?.candidate) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(c.signal_data.candidate));
                  addedCount++;
                } catch (e: any) {
                  // Ignore duplicate candidate errors
                }
              }
            }
            if (addedCount > 0) {
              addDebugLog(`Added ${addedCount}/${iceCandidates.length} viewer ICE. ice=${pc.iceConnectionState}`);
            }
          }
        }

        setTimeout(() => pollForAnswer(attempts + 1), 1000);
      };

      addDebugLog('Starting answer polling in 2s...');
      setTimeout(() => pollForAnswer(), 2000);
    } catch (err: any) {
      if (!mountedRef.current) return;

      if (err.name === 'NotAllowedError') {
        setPhase('error');
        setErrorMsg('Camera permission denied. Please allow camera access and reload.');
      } else {
        setPhase('error');
        setErrorMsg(err.message || 'Failed to start camera');
      }
    }
  }, [sessionId, cameraFacing]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    mountedRef.current = true;

    initialize();

    return () => {
      mountedRef.current = false;
      cleanup();
      if (zoomIndicatorTimeoutRef.current) {
        clearTimeout(zoomIndicatorTimeoutRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [initialize, cleanup]);

  const stopStream = () => {
    cleanup();
    setPhase('init');
    setStatusText('Stopped');
  };

  const flipCamera = () => {
    const newFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    cleanup();
    initRef.current = false;
    setCameraFacing(newFacing);
    setZoomLevel(1);
    setPhase('init');
    setStatusText('Switching camera...');

    setTimeout(() => {
      initialize();
    }, 100);
  };

  const resetZoom = () => {
    applyZoom(1);
  };

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Connection Error</h2>
          <p className="text-slate-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg w-full font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isConnected = phase === 'connected';
  const hasCamera = phase === 'camera' || phase === 'connected';
  const hasZoom = maxZoom > minZoom;
  const zoomPercentage = hasZoom ? Math.round(((zoomLevel - minZoom) / (maxZoom - minZoom)) * 100) : 0;

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden"
      onClick={handleVideoTap}
    >
      {/* Full-screen Video */}
      <div
        className="absolute inset-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${hasCamera ? '' : 'hidden'}`}
        />

        {!hasCamera && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-slate-400">{statusText}</p>
            </div>
          </div>
        )}
      </div>

      {/* Zoom Indicator (center popup) */}
      {showZoomIndicator && hasZoom && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 flex items-center gap-3 z-30 pointer-events-none">
          <ZoomIn className="w-6 h-6 text-white" />
          <span className="text-2xl font-bold text-white">{zoomLevel.toFixed(1)}x</span>
        </div>
      )}

      {/* Top Bar - Title & Status */}
      <div className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 safe-area-inset-top">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Video className="w-4 h-4 text-red-500 shrink-0" />
              <h1 className="text-white font-medium text-sm truncate">{sessionTitle || 'Mobile Camera'}</h1>
            </div>
            <div className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 ${
              isConnected ? 'bg-green-600' : 'bg-yellow-600/90'
            }`}>
              {isConnected ? (
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              ) : (
                <Loader2 className="w-3 h-3 text-white animate-spin" />
              )}
              <span className="text-xs font-bold text-white">{isConnected ? 'LIVE' : 'CONNECTING'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Zoom Controls - Right Side (always visible when has zoom) */}
      {hasCamera && hasZoom && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-20">
          <button
            onClick={(e) => { e.stopPropagation(); applyZoom(zoomLevel + 0.5); }}
            disabled={zoomLevel >= maxZoom}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white disabled:opacity-30 active:bg-white/20"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <div className="h-28 w-1 bg-white/20 rounded-full relative my-1">
            <div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-full transition-all"
              style={{ height: `${zoomPercentage}%` }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg transition-all"
              style={{ bottom: `calc(${zoomPercentage}% - 6px)` }}
            />
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); applyZoom(zoomLevel - 0.5); }}
            disabled={zoomLevel <= minZoom}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white disabled:opacity-30 active:bg-white/20"
          >
            <ZoomOut className="w-5 h-5" />
          </button>

          {zoomLevel > 1.1 && (
            <button
              onClick={(e) => { e.stopPropagation(); resetZoom(); }}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white active:bg-white/20 mt-1"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Bottom Controls - Compact floating buttons */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 safe-area-inset-bottom">
          {/* Status indicator */}
          {isConnected && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <Signal className="w-4 h-4 text-green-400" />
              <span className="text-xs font-medium text-green-400">Streaming to control panel</span>
            </div>
          )}
          {hasCamera && !isConnected && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
              <span className="text-xs font-medium text-yellow-400">{statusText}</span>
            </div>
          )}

          {/* Action Buttons */}
          {hasCamera && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={(e) => { e.stopPropagation(); flipCamera(); }}
                className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:bg-white/20 transition-colors"
              >
                <RefreshCw className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); stopStream(); }}
                className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-white active:bg-red-700 transition-colors shadow-lg shadow-red-500/30"
              >
                <Square className="w-7 h-7" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowDebug(!showDebug); }}
                className={`w-14 h-14 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
                  showDebug ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/60'
                }`}
              >
                <Bug className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tap hint when controls are hidden */}
      {!showControls && isConnected && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-black/40 backdrop-blur-sm rounded-full px-4 py-1.5 animate-pulse">
            <span className="text-xs text-white/60">Tap for controls</span>
          </div>
        </div>
      )}

      {/* Debug Panel - Slide up from bottom */}
      {showDebug && (
        <div
          className="absolute bottom-32 left-3 right-16 z-30 max-h-48 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{debugLog.length} logs</span>
              <button
                onClick={() => setDebugLog([])}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>
            <div className="p-2 max-h-36 overflow-y-auto text-xs font-mono">
              {debugLog.length === 0 ? (
                <p className="text-slate-500">No logs yet...</p>
              ) : (
                debugLog.slice(-10).map((log, i) => (
                  <p key={i} className="text-green-400/80 mb-0.5 leading-tight">{log}</p>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

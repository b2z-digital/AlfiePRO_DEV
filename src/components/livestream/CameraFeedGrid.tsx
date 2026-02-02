import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Camera, Radio, Loader2, Smartphone, Monitor } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import type { LivestreamCamera } from '../../types/livestream';

export interface CameraFeedGridRef {
  getRemoteStream: (cameraId: string) => MediaStream | null;
}

interface CameraFeedGridProps {
  cameras: LivestreamCamera[];
  primaryCamera: LivestreamCamera | null;
  localMediaStream: MediaStream | null;
  sessionId: string;
  onSwitchCamera: (cameraId: string) => void;
  onRemoteStreamAvailable?: (cameraId: string, stream: MediaStream | null) => void;
}

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

export const CameraFeedGrid = forwardRef<CameraFeedGridRef, CameraFeedGridProps>(({
  cameras,
  primaryCamera,
  localMediaStream,
  sessionId,
  onSwitchCamera,
  onRemoteStreamAvailable
}, ref) => {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream | null>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, string>>({});
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const channelsRef = useRef<Record<string, ReturnType<typeof supabase.channel>>>({});
  const connectingRef = useRef<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({
    getRemoteStream: (cameraId: string) => remoteStreams[cameraId] || null
  }), [remoteStreams]);

  const connectToMobileCamera = useCallback(async (camera: LivestreamCamera) => {
    if (camera.camera_type !== 'mobile') return;
    if (peerConnectionsRef.current[camera.id]) return;
    if (connectingRef.current.has(camera.id)) return;

    connectingRef.current.add(camera.id);
    console.log('[CameraGrid] Connecting to mobile camera:', camera.id);

    setConnectionStatus(prev => ({ ...prev, [camera.id]: 'connecting' }));

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current[camera.id] = pc;

      pc.ontrack = (event) => {
        console.log('[CameraGrid] Received track from:', camera.id);
        if (event.streams?.[0]) {
          const stream = event.streams[0];
          setRemoteStreams(prev => ({ ...prev, [camera.id]: stream }));
          setConnectionStatus(prev => ({ ...prev, [camera.id]: 'connected' }));
          onRemoteStreamAvailable?.(camera.id, stream);
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await supabase.from('webrtc_signaling').insert({
            camera_id: camera.id,
            session_id: sessionId,
            signal_type: 'ice_candidate',
            signal_data: { candidate: event.candidate.toJSON() },
            from_role: 'viewer'
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[CameraGrid] Connection state:', camera.id, pc.connectionState);
        if (pc.connectionState === 'connected') {
          setConnectionStatus(prev => ({ ...prev, [camera.id]: 'connected' }));
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setConnectionStatus(prev => ({ ...prev, [camera.id]: 'disconnected' }));
          onRemoteStreamAvailable?.(camera.id, null);
        }
      };

      const channelName = `viewer-${camera.id}-${Date.now()}`;
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
            if (signal.signal_type === 'offer' && signal.signal_data?.sdp) {
              console.log('[CameraGrid] Received offer from:', camera.id);
              await currentPc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.sdp));
              const answer = await currentPc.createAnswer();
              await currentPc.setLocalDescription(answer);
              await supabase.from('webrtc_signaling').insert({
                camera_id: camera.id,
                session_id: sessionId,
                signal_type: 'answer',
                signal_data: { sdp: currentPc.localDescription },
                from_role: 'viewer'
              });
              console.log('[CameraGrid] Sent answer to:', camera.id);
            } else if (signal.signal_type === 'ice_candidate' && signal.signal_data?.candidate) {
              await currentPc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
            }
          } catch (err) {
            console.error('[CameraGrid] Signal processing error:', err);
          }
        })
        .subscribe();

      channelsRef.current[camera.id] = channel;

      const { data: offers } = await supabase
        .from('webrtc_signaling')
        .select('*')
        .eq('camera_id', camera.id)
        .eq('signal_type', 'offer')
        .eq('from_role', 'camera')
        .order('created_at', { ascending: false })
        .limit(1);

      if (offers?.[0]?.signal_data?.sdp) {
        console.log('[CameraGrid] Processing existing offer for:', camera.id);
        await pc.setRemoteDescription(new RTCSessionDescription(offers[0].signal_data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await supabase.from('webrtc_signaling').insert({
          camera_id: camera.id,
          session_id: sessionId,
          signal_type: 'answer',
          signal_data: { sdp: pc.localDescription },
          from_role: 'viewer'
        });
        console.log('[CameraGrid] Sent answer for existing offer:', camera.id);
      }
    } catch (err) {
      console.error('[CameraGrid] Connect error:', err);
      setConnectionStatus(prev => ({ ...prev, [camera.id]: 'error' }));
    } finally {
      connectingRef.current.delete(camera.id);
    }
  }, [sessionId, onRemoteStreamAvailable]);

  const disconnectCamera = useCallback((cameraId: string) => {
    if (peerConnectionsRef.current[cameraId]) {
      peerConnectionsRef.current[cameraId].close();
      delete peerConnectionsRef.current[cameraId];
    }
    if (channelsRef.current[cameraId]) {
      supabase.removeChannel(channelsRef.current[cameraId]);
      delete channelsRef.current[cameraId];
    }
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[cameraId];
      return next;
    });
    setConnectionStatus(prev => {
      const next = { ...prev };
      delete next[cameraId];
      return next;
    });
    onRemoteStreamAvailable?.(cameraId, null);
  }, [onRemoteStreamAvailable]);

  useEffect(() => {
    cameras.forEach(cam => {
      if (cam.camera_type === 'mobile' && (cam.status === 'connected' || cam.status === 'streaming')) {
        connectToMobileCamera(cam);
      } else if (cam.camera_type === 'mobile' && cam.status === 'disconnected') {
        disconnectCamera(cam.id);
      }
    });
  }, [cameras, connectToMobileCamera, disconnectCamera]);

  useEffect(() => {
    return () => {
      Object.keys(peerConnectionsRef.current).forEach(id => {
        peerConnectionsRef.current[id]?.close();
      });
      Object.keys(channelsRef.current).forEach(id => {
        supabase.removeChannel(channelsRef.current[id]);
      });
    };
  }, []);

  if (cameras.length === 0) {
    return (
      <div className="text-center py-8">
        <Camera className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">No cameras connected</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Available Cameras ({cameras.length})
      </p>

      {cameras.map((camera) => {
        const isActive = camera.is_primary || camera.id === primaryCamera?.id;
        const isLaptop = camera.camera_type === 'laptop';
        const isMobile = camera.camera_type === 'mobile';
        const remoteStream = remoteStreams[camera.id];
        const connStatus = connectionStatus[camera.id];
        const isConnected = camera.status === 'connected' || camera.status === 'streaming';
        const hasVideo = (isLaptop && localMediaStream) || (isMobile && remoteStream);

        return (
          <div
            key={camera.id}
            onClick={() => {
              if (isConnected && !isActive) {
                onSwitchCamera(camera.id);
              }
            }}
            className={`rounded-lg border overflow-hidden transition-all ${
              isActive
                ? 'ring-2 ring-blue-500 border-blue-500'
                : isConnected
                  ? 'border-slate-600 hover:border-blue-400 cursor-pointer'
                  : 'border-slate-700 opacity-60'
            }`}
          >
            <div className="aspect-video bg-slate-900 relative">
              {isLaptop && localMediaStream ? (
                <VideoElement stream={localMediaStream} muted />
              ) : isMobile && remoteStream ? (
                <VideoElement stream={remoteStream} />
              ) : connStatus === 'connecting' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : isConnected ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="w-10 h-10 text-green-500" />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera className="w-10 h-10 text-slate-600" />
                </div>
              )}

              <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-bold ${
                isActive ? 'bg-blue-600 text-white' :
                hasVideo ? 'bg-green-600 text-white' :
                isConnected ? 'bg-yellow-600 text-white' :
                'bg-slate-700 text-slate-400'
              }`}>
                {isActive ? 'Active' : hasVideo ? 'Live' : isConnected ? 'Ready' : 'Offline'}
              </div>

              {isActive && (
                <div className="absolute top-2 left-2">
                  <Radio className="w-4 h-4 text-blue-400" />
                </div>
              )}
            </div>

            <div className="bg-slate-800 px-3 py-2">
              <div className="flex items-center gap-2">
                {isLaptop ? (
                  <Monitor className="w-4 h-4 text-slate-400" />
                ) : (
                  <Smartphone className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-sm font-medium text-white truncate flex-1">
                  {camera.camera_name}
                </span>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  hasVideo ? 'bg-green-500 animate-pulse' :
                  isConnected ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-slate-500 text-center pt-2">
        Click a camera to switch the broadcast source
      </p>
    </div>
  );
});

CameraFeedGrid.displayName = 'CameraFeedGrid';

function VideoElement({ stream, muted = false }: { stream: MediaStream; muted?: boolean }) {
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

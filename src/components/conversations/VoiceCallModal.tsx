import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import { useVoiceCall } from '../../contexts/VoiceCallContext';

export function VoiceCallModal() {
  const { callState, acceptCall, declineCall, endCall, toggleMute, toggleVideo, isMuted } = useVoiceCall();
  const [pulseAnimation, setPulseAnimation] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setPulseAnimation(callState?.status === 'ringing');
  }, [callState?.status]);

  useEffect(() => {
    if (localVideoRef.current && callState?.localStream) {
      localVideoRef.current.srcObject = callState.localStream;
    }
  }, [callState?.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && callState?.remoteStream) {
      remoteVideoRef.current.srcObject = callState.remoteStream;
    }
  }, [callState?.remoteStream]);

  if (!callState) return null;

  const isVideoCall = callState.isVideo;
  const hasRemoteVideo = callState.remoteStream?.getVideoTracks().some(t => t.enabled);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (callState.status) {
      case 'ringing':
        return callState.direction === 'incoming'
          ? `Incoming ${isVideoCall ? 'video' : 'voice'} call...`
          : 'Calling...';
      case 'connecting':
        return 'Connecting...';
      case 'active':
        return formatDuration(callState.duration);
      case 'ended':
        return 'Call ended';
      default:
        return '';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-gray-900 rounded-2xl shadow-2xl overflow-hidden ${isVideoCall && callState.status === 'active' ? 'w-full max-w-2xl mx-4' : 'w-full max-w-sm mx-4'}`}>
        {/* Video view for active video calls */}
        {isVideoCall && callState.status === 'active' ? (
          <div className="relative aspect-video bg-black">
            {/* Remote video (full size) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {!hasRemoteVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                {callState.peerAvatar ? (
                  <img src={callState.peerAvatar} alt={callState.peerName} className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-semibold">
                    {getInitials(callState.peerName)}
                  </div>
                )}
              </div>
            )}

            {/* Local video (picture-in-picture) */}
            <div className="absolute top-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/20 bg-gray-800 shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!callState.isVideoEnabled ? 'hidden' : ''}`}
              />
              {!callState.isVideoEnabled && (
                <div className="w-full h-full flex items-center justify-center">
                  <VideoOff className="w-6 h-6 text-gray-400" />
                </div>
              )}
            </div>

            {/* Overlay info */}
            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <p className="text-white text-sm font-medium">{callState.peerName}</p>
              <p className="text-gray-300 text-xs">{formatDuration(callState.duration)}</p>
            </div>

            {/* Controls overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={toggleMute}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    isMuted ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleVideo}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    !callState.isVideoEnabled ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {callState.isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={endCall}
                  className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
                >
                  <PhoneOff className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Standard audio call UI / pre-connection UI */}
            <div className="bg-gradient-to-b from-blue-600/30 to-transparent pt-8 pb-4 px-6 text-center">
              <div className="relative inline-block mb-4">
                {callState.peerAvatar ? (
                  <img
                    src={callState.peerAvatar}
                    alt={callState.peerName}
                    className={`w-20 h-20 rounded-full object-cover border-2 border-white/20 ${pulseAnimation ? 'animate-pulse' : ''}`}
                  />
                ) : (
                  <div className={`w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-semibold border-2 border-white/20 ${pulseAnimation ? 'animate-pulse' : ''}`}>
                    {getInitials(callState.peerName)}
                  </div>
                )}
                {callState.status === 'active' && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-gray-900" />
                )}
              </div>

              <h3 className="text-white text-xl font-semibold mb-1">{callState.peerName}</h3>
              <p className="text-gray-300 text-sm">{getStatusText()}</p>
              {isVideoCall && callState.status === 'ringing' && (
                <div className="flex items-center justify-center gap-1 mt-1 text-blue-300 text-xs">
                  <Video className="w-3.5 h-3.5" />
                  <span>Video Call</span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="px-6 pb-8 pt-6">
              {callState.status === 'ringing' && callState.direction === 'incoming' && (
                <div className="flex items-center justify-center gap-8">
                  <button
                    onClick={declineCall}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </button>
                  <button
                    onClick={acceptCall}
                    className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors shadow-lg shadow-green-600/30 animate-bounce"
                  >
                    {isVideoCall ? <Video className="w-7 h-7 text-white" /> : <Phone className="w-7 h-7 text-white" />}
                  </button>
                </div>
              )}

              {callState.status === 'ringing' && callState.direction === 'outgoing' && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={endCall}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </button>
                </div>
              )}

              {callState.status === 'connecting' && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={endCall}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </button>
                </div>
              )}

              {callState.status === 'active' && !isVideoCall && (
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={toggleMute}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                      isMuted
                        ? 'bg-white/20 text-red-400 hover:bg-white/30'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={endCall}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </button>
                </div>
              )}

              {callState.status === 'ended' && (
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-4">
                    {callState.duration > 0 ? `Duration: ${formatDuration(callState.duration)}` : 'No answer'}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

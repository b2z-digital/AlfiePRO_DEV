import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, X } from 'lucide-react';
import { useVoiceCall } from '../../contexts/VoiceCallContext';

export function VoiceCallModal() {
  const { callState, acceptCall, declineCall, endCall, toggleMute, isMuted } = useVoiceCall();
  const [pulseAnimation, setPulseAnimation] = useState(true);

  useEffect(() => {
    if (callState?.status === 'ringing') {
      setPulseAnimation(true);
    } else {
      setPulseAnimation(false);
    }
  }, [callState?.status]);

  if (!callState) return null;

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (callState.status) {
      case 'ringing':
        return callState.direction === 'incoming' ? 'Incoming call...' : 'Calling...';
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
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-b from-blue-600/30 to-transparent pt-8 pb-4 px-6 text-center">
          {/* Avatar */}
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

          {/* Name and status */}
          <h3 className="text-white text-xl font-semibold mb-1">{callState.peerName}</h3>
          <p className="text-gray-300 text-sm">{getStatusText()}</p>
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
                <Phone className="w-7 h-7 text-white" />
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

          {callState.status === 'active' && (
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
      </div>
    </div>
  );
}

import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, UserPlus, Users, Monitor } from 'lucide-react';
import { useVoiceCall } from '../../contexts/VoiceCallContext';
import { useAuth } from '../../contexts/AuthContext';
import { GroupCallState } from '../../utils/voiceCallEngine';
import { AddParticipantModal } from './AddParticipantModal';
import { SupportSessionRequestButton, IncomingSupportRequest } from './SupportSessionRequest';
import { supabase } from '../../utils/supabase';

export function VoiceCallModal() {
  const { callState, groupCallState, acceptCall, declineCall, endCall, toggleMute, toggleVideo, isMuted } = useVoiceCall();
  const [pulseAnimation, setPulseAnimation] = useState(true);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
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

  // Render group call UI if it's a group call
  if (callState.isGroupCall && groupCallState) {
    return (
      <>
        <GroupCallUI
          groupCallState={groupCallState}
          callState={callState}
          isMuted={isMuted}
          onAccept={acceptCall}
          onDecline={declineCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onAddParticipant={() => setShowAddParticipant(true)}
        />
        {showAddParticipant && (
          <AddParticipantModal
            groupCallState={groupCallState}
            onClose={() => setShowAddParticipant(false)}
          />
        )}
      </>
    );
  }

  // 1:1 call UI (unchanged)
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
        {isVideoCall && callState.status === 'active' ? (
          <div className="relative aspect-video bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
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
            <div className="absolute top-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/20 bg-gray-800 shadow-lg">
              <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!callState.isVideoEnabled ? 'hidden' : ''}`} />
              {!callState.isVideoEnabled && (
                <div className="w-full h-full flex items-center justify-center">
                  <VideoOff className="w-6 h-6 text-gray-400" />
                </div>
              )}
            </div>
            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <p className="text-white text-sm font-medium">{callState.peerName}</p>
              <p className="text-gray-300 text-xs">{formatDuration(callState.duration)}</p>
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <div className="flex items-center justify-center gap-4">
                <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button onClick={toggleVideo} className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${!callState.isVideoEnabled ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                  {callState.isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
                <button onClick={endCall} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30">
                  <PhoneOff className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-b from-blue-600/30 to-transparent pt-8 pb-4 px-6 text-center">
              <div className="relative inline-block mb-4">
                {callState.peerAvatar ? (
                  <img src={callState.peerAvatar} alt={callState.peerName} className={`w-20 h-20 rounded-full object-cover border-2 border-white/20 ${pulseAnimation ? 'animate-pulse' : ''}`} />
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
            <div className="px-6 pb-8 pt-6">
              {callState.status === 'ringing' && callState.direction === 'incoming' && (
                <div className="flex items-center justify-center gap-8">
                  <button onClick={declineCall} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30">
                    <PhoneOff className="w-7 h-7 text-white" />
                  </button>
                  <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors shadow-lg shadow-green-600/30 animate-bounce">
                    {isVideoCall ? <Video className="w-7 h-7 text-white" /> : <Phone className="w-7 h-7 text-white" />}
                  </button>
                </div>
              )}
              {callState.status === 'ringing' && callState.direction === 'outgoing' && (
                <div className="flex items-center justify-center">
                  <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30">
                    <PhoneOff className="w-7 h-7 text-white" />
                  </button>
                </div>
              )}
              {callState.status === 'connecting' && (
                <div className="flex items-center justify-center">
                  <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30">
                    <PhoneOff className="w-7 h-7 text-white" />
                  </button>
                </div>
              )}
              {callState.status === 'active' && !isVideoCall && (
                <div className="flex items-center justify-center gap-6">
                  <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-white/20 text-red-400 hover:bg-white/30' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>
                  <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30">
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

// FaceTime-style Group Call UI
function GroupCallUI({
  groupCallState,
  callState,
  isMuted,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleVideo,
  onAddParticipant,
}: {
  groupCallState: GroupCallState;
  callState: any;
  isMuted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onAddParticipant: () => void;
}) {
  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [supportTarget, setSupportTarget] = useState<{ userId: string; name: string } | null>(null);
  const [incomingSupportRequest, setIncomingSupportRequest] = useState<{ id: string; requesterName: string } | null>(null);

  useEffect(() => {
    if (localVideoRef.current && groupCallState.localStream) {
      localVideoRef.current.srcObject = groupCallState.localStream;
    }
  }, [groupCallState.localStream]);

  // Check if user is admin
  useEffect(() => {
    if (!user) return;
    const checkAdmin = async () => {
      const { data } = await supabase
        .from('user_clubs')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'owner'])
        .limit(1);
      setIsAdmin((data || []).length > 0);
    };
    checkAdmin();
  }, [user?.id]);

  // Listen for incoming support requests (for non-admin members)
  useEffect(() => {
    if (!user || isAdmin) return;
    const channel = supabase.channel(`support-incoming-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_session_requests',
        filter: `target_user_id=eq.${user.id}`,
      }, async (payload) => {
        const req = payload.new as any;
        if (req.status !== 'pending') return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', req.requester_id)
          .maybeSingle();
        setIncomingSupportRequest({ id: req.id, requesterName: profile?.full_name || 'Admin' });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin]);

  const activeParticipants = groupCallState.participants.filter(
    p => p.status === 'active' || p.status === 'connecting'
  );
  const ringingParticipants = groupCallState.participants.filter(p => p.status === 'ringing');
  const totalActive = activeParticipants.length + 1; // +1 for self

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Adaptive grid layout like FaceTime
  const getGridClass = () => {
    if (totalActive <= 2) return 'grid-cols-1';
    if (totalActive <= 4) return 'grid-cols-2';
    return 'grid-cols-3'; // 5-6 participants
  };

  const getParticipantSize = () => {
    if (totalActive <= 2) return 'aspect-[4/3]';
    if (totalActive <= 4) return 'aspect-square';
    return 'aspect-square';
  };

  // Incoming group call - ringing state
  if (groupCallState.status === 'ringing' && groupCallState.direction === 'incoming') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <div className="bg-gradient-to-b from-green-600/20 to-transparent pt-8 pb-4 px-6 text-center">
            <div className="flex items-center justify-center gap-1 mb-4">
              <Users className="w-5 h-5 text-green-400" />
              <span className="text-green-400 text-sm font-medium">Group Call</span>
            </div>
            <div className="flex justify-center -space-x-3 mb-4">
              {groupCallState.participants.slice(0, 4).map((p) => (
                <div key={p.userId} className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold border-2 border-gray-900 animate-pulse">
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    getInitials(p.name)
                  )}
                </div>
              ))}
              {groupCallState.participants.length > 4 && (
                <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm border-2 border-gray-900">
                  +{groupCallState.participants.length - 4}
                </div>
              )}
            </div>
            <h3 className="text-white text-lg font-semibold mb-1">
              {groupCallState.initiatorName}
            </h3>
            <p className="text-gray-300 text-sm">
              {groupCallState.isVideo ? 'Group Video Call' : 'Group Voice Call'} - {groupCallState.participants.length + 1} participants
            </p>
          </div>
          <div className="px-6 pb-8 pt-6">
            <div className="flex items-center justify-center gap-8">
              <button onClick={onDecline} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30">
                <PhoneOff className="w-7 h-7 text-white" />
              </button>
              <button onClick={onAccept} className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors shadow-lg shadow-green-600/30 animate-bounce">
                {groupCallState.isVideo ? <Video className="w-7 h-7 text-white" /> : <Phone className="w-7 h-7 text-white" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active group call - FaceTime-style grid
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-white text-sm font-medium">
              Group Call ({totalActive})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {groupCallState.status === 'active' && (
              <span className="text-green-400 text-sm">{formatDuration(groupCallState.duration)}</span>
            )}
            {ringingParticipants.length > 0 && (
              <span className="text-yellow-400 text-xs">{ringingParticipants.length} ringing...</span>
            )}
          </div>
        </div>

        {/* Participant Grid - FaceTime style */}
        <div className={`grid ${getGridClass()} gap-2 p-3 flex-1 overflow-auto`}>
          {/* Local user tile */}
          <ParticipantTile
            name="You"
            isMuted={groupCallState.isLocalMuted}
            isVideoEnabled={groupCallState.isLocalVideoEnabled}
            isLocal
            localStream={groupCallState.localStream}
            sizeClass={getParticipantSize()}
          />

          {/* Remote participants */}
          {activeParticipants.map((participant) => (
            <ParticipantTile
              key={participant.userId}
              name={participant.name}
              avatar={participant.avatar}
              isMuted={participant.isMuted}
              isVideoEnabled={participant.isVideoEnabled}
              stream={participant.stream}
              sizeClass={getParticipantSize()}
            />
          ))}

          {/* Ringing participants shown as smaller tiles */}
          {ringingParticipants.map((participant) => (
            <div key={participant.userId} className={`${getParticipantSize()} bg-gray-800 rounded-xl flex flex-col items-center justify-center relative opacity-60`}>
              {participant.avatar ? (
                <img src={participant.avatar} alt={participant.name} className="w-12 h-12 rounded-full object-cover animate-pulse" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold animate-pulse">
                  {getInitials(participant.name)}
                </div>
              )}
              <span className="text-gray-400 text-xs mt-2">{participant.name}</span>
              <span className="text-yellow-400 text-xs">Ringing...</span>
            </div>
          ))}
        </div>

        {/* Controls bar */}
        <div className="bg-gray-800/80 border-t border-gray-700/50 px-6 py-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={onToggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isMuted ? 'bg-red-500/80 text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {groupCallState.isVideo && (
              <button
                onClick={onToggleVideo}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  !groupCallState.isLocalVideoEnabled ? 'bg-red-500/80 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title={groupCallState.isLocalVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {groupCallState.isLocalVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            )}

            <button
              onClick={onAddParticipant}
              className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
              title="Add participant"
            >
              <UserPlus className="w-5 h-5" />
            </button>

            {/* Admin support - View as Member button */}
            {isAdmin && activeParticipants.length > 0 && !supportTarget && (
              <button
                onClick={() => setSupportTarget({ userId: activeParticipants[0].userId, name: activeParticipants[0].name })}
                className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
                title="View as member (support)"
              >
                <Monitor className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={onEnd}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
              title="Leave call"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Admin support request status */}
          {supportTarget && (
            <div className="mt-3 flex justify-center">
              <SupportSessionRequestButton
                targetUserId={supportTarget.userId}
                targetName={supportTarget.name}
                callId={groupCallState.groupCallId}
                onClose={() => setSupportTarget(null)}
              />
            </div>
          )}
        </div>

        {/* Incoming support request overlay for members */}
        {incomingSupportRequest && (
          <IncomingSupportRequest
            requestId={incomingSupportRequest.id}
            requesterName={incomingSupportRequest.requesterName}
            onRespond={() => setIncomingSupportRequest(null)}
          />
        )}
      </div>
    </div>
  );
}

// Individual participant tile in the grid
function ParticipantTile({
  name,
  avatar,
  isMuted,
  isVideoEnabled,
  isLocal,
  localStream,
  stream,
  sizeClass,
}: {
  name: string;
  avatar?: string;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isLocal?: boolean;
  localStream?: MediaStream;
  stream?: MediaStream;
  sizeClass: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      const mediaStream = isLocal ? localStream : stream;
      if (mediaStream) {
        videoRef.current.srcObject = mediaStream;
      }
    }
  }, [isLocal, localStream, stream]);

  const getInitials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const showVideo = isVideoEnabled && (isLocal ? localStream : stream);

  return (
    <div className={`${sizeClass} bg-gray-800 rounded-xl overflow-hidden relative`}>
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
          {avatar ? (
            <img src={avatar} alt={name} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-semibold">
              {getInitials(name)}
            </div>
          )}
        </div>
      )}

      {/* Name and status overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-white text-xs font-medium truncate">{name}</span>
          {isMuted && <MicOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0 ml-1" />}
        </div>
      </div>

      {isLocal && (
        <div className="absolute top-2 left-2 bg-blue-600/80 rounded px-1.5 py-0.5">
          <span className="text-white text-[10px] font-medium">You</span>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Monitor, Check, X, Loader as Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface SupportSessionRequestProps {
  targetUserId: string;
  targetName: string;
  callId: string;
  onClose: () => void;
}

export function SupportSessionRequestButton({
  targetUserId,
  targetName,
  callId,
  onClose,
}: SupportSessionRequestProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<'idle' | 'pending' | 'accepted' | 'declined'>('idle');

  const requestViewAs = async () => {
    if (!user) return;
    setStatus('pending');

    const { error } = await supabase.from('support_session_requests').insert({
      requester_id: user.id,
      target_user_id: targetUserId,
      call_id: callId,
      status: 'pending',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    if (error) {
      console.error('Failed to create support request:', error);
      setStatus('idle');
      return;
    }
  };

  useEffect(() => {
    if (status !== 'pending') return;

    const channel = supabase.channel(`support-request-${callId}-${targetUserId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_session_requests',
        filter: `call_id=eq.${callId}`,
      }, (payload) => {
        const req = payload.new as any;
        if (req.target_user_id === targetUserId && req.requester_id === user?.id) {
          if (req.status === 'accepted') setStatus('accepted');
          if (req.status === 'declined') setStatus('declined');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [status, callId, targetUserId, user?.id]);

  if (status === 'accepted') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-900/30 rounded-lg">
        <Check className="w-4 h-4 text-green-400" />
        <span className="text-green-300 text-xs">{targetName} approved view access</span>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 rounded-lg">
        <X className="w-4 h-4 text-red-400" />
        <span className="text-red-300 text-xs">{targetName} declined view access</span>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-yellow-900/20 rounded-lg">
        <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
        <span className="text-yellow-300 text-xs">Waiting for {targetName} to respond...</span>
      </div>
    );
  }

  return (
    <button
      onClick={requestViewAs}
      className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
      title={`Request to view ${targetName}'s dashboard`}
    >
      <Monitor className="w-4 h-4 text-blue-300" />
      <span className="text-white text-xs">View as {targetName}</span>
    </button>
  );
}

interface IncomingSupportRequestProps {
  requestId: string;
  requesterName: string;
  onRespond: (accepted: boolean) => void;
}

export function IncomingSupportRequest({ requestId, requesterName, onRespond }: IncomingSupportRequestProps) {
  const handleRespond = async (accepted: boolean) => {
    await supabase
      .from('support_session_requests')
      .update({ status: accepted ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
      .eq('id', requestId);
    onRespond(accepted);
  };

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 rounded-xl p-4 shadow-2xl z-50 w-72">
      <div className="flex items-center gap-2 mb-3">
        <Monitor className="w-5 h-5 text-blue-400" />
        <span className="text-white text-sm font-medium">Support Request</span>
      </div>
      <p className="text-gray-300 text-xs mb-4">
        {requesterName} would like to view your dashboard to help you. Allow access?
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => handleRespond(false)}
          className="flex-1 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors"
        >
          Decline
        </button>
        <button
          onClick={() => handleRespond(true)}
          className="flex-1 py-2 bg-green-600/80 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors"
        >
          Allow
        </button>
      </div>
      <p className="text-gray-500 text-[10px] mt-2 text-center">Expires in 5 minutes</p>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { X, MessageCircle, UserPlus, UserCheck, Clock, MapPin, Sailboat } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { socialStorage } from '../../utils/socialStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';

interface MemberProfileCardProps {
  userId: string;
  name: string;
  avatar?: string;
  darkMode?: boolean;
  onClose: () => void;
  onMessage?: (target: { id: string; name: string; avatar?: string }) => void;
  onViewProfile?: (target: { id: string; name: string; avatar?: string }) => void;
}

interface MemberInfo {
  clubs: { name: string; role?: string }[];
  boatClasses: string[];
  location?: string;
  memberSince?: string;
  postCount: number;
}

type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'connected';

export default function MemberProfileCard({
  userId,
  name,
  avatar,
  darkMode = false,
  onClose,
  onMessage,
  onViewProfile,
}: MemberProfileCardProps) {
  const lightMode = !darkMode;
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  const isOwnProfile = user?.id === userId;

  useEffect(() => {
    loadMemberInfo();
    if (!isOwnProfile) {
      checkConnectionStatus();
    }
  }, [userId]);

  const loadMemberInfo = async () => {
    setIsLoading(true);
    try {
      const [membershipsResult, postsResult] = await Promise.all([
        supabase
          .from('members')
          .select('club_id, clubs(name), membership_type_name, created_at')
          .eq('user_id', userId)
          .not('membership_status', 'eq', 'archived'),
        supabase
          .from('social_posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', userId)
          .eq('is_moderated', false),
      ]);

      const clubs = (membershipsResult.data || []).map((m: any) => ({
        name: (m.clubs as any)?.name || 'Unknown Club',
        role: m.membership_type_name || undefined,
      }));

      const boatClasses: string[] = [];
      if (membershipsResult.data && membershipsResult.data.length > 0) {
        const { data: boats } = await supabase
          .from('member_boats')
          .select('boat_class')
          .eq('user_id', userId);
        if (boats) {
          const uniqueClasses = new Set(boats.map(b => b.boat_class).filter(Boolean));
          boatClasses.push(...uniqueClasses);
        }
      }

      const earliestMembership = (membershipsResult.data || [])
        .map((m: any) => m.created_at)
        .filter(Boolean)
        .sort()[0];

      setMemberInfo({
        clubs,
        boatClasses,
        memberSince: earliestMembership,
        postCount: postsResult.count || 0,
      });
    } catch (error) {
      console.error('Error loading member info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkConnectionStatus = async () => {
    if (!user) return;
    try {
      const { data: sent } = await supabase
        .from('social_connections')
        .select('status')
        .eq('user_id', user.id)
        .eq('connected_user_id', userId)
        .maybeSingle();

      if (sent) {
        setConnectionStatus(sent.status === 'accepted' ? 'connected' : 'pending_sent');
        return;
      }

      const { data: received } = await supabase
        .from('social_connections')
        .select('status')
        .eq('user_id', userId)
        .eq('connected_user_id', user.id)
        .maybeSingle();

      if (received) {
        setConnectionStatus(received.status === 'accepted' ? 'connected' : 'pending_received');
        return;
      }

      setConnectionStatus('none');
    } catch (error) {
      console.error('Error checking connection status:', error);
    }
  };

  const handleConnect = async () => {
    if (isSendingRequest) return;
    setIsSendingRequest(true);
    try {
      await socialStorage.sendConnectionRequest(userId);
      setConnectionStatus('pending_sent');
      addNotification('Connection request sent!', 'success');
    } catch (error: any) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        addNotification('Connection request already exists', 'info');
      } else {
        addNotification('Failed to send connection request', 'error');
      }
    } finally {
      setIsSendingRequest(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border ${lightMode ? 'bg-white border-gray-200' : 'bg-slate-800 border-slate-700'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header gradient */}
        <div className="h-24 bg-gradient-to-br from-blue-500 to-teal-500 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex justify-center -mt-12 relative z-10">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className={`w-24 h-24 rounded-full object-cover border-4 shadow-lg ${lightMode ? 'border-white' : 'border-slate-800'}`}
            />
          ) : (
            <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-3xl font-bold border-4 shadow-lg ${lightMode ? 'border-white' : 'border-slate-800'}`}>
              {name.charAt(0)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-6 pt-3 pb-6">
          <div className="text-center mb-4">
            <h3 className={`text-xl font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{name}</h3>
            {isLoading ? (
              <div className={`h-4 w-32 mx-auto mt-2 rounded animate-pulse ${lightMode ? 'bg-gray-200' : 'bg-slate-700'}`} />
            ) : memberInfo && memberInfo.clubs.length > 0 ? (
              <p className={`text-sm mt-1 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>
                {memberInfo.clubs.map(c => c.name).join(', ')}
              </p>
            ) : null}
          </div>

          {/* Stats / Info */}
          {!isLoading && memberInfo && (
            <div className="space-y-3 mb-5">
              {memberInfo.boatClasses.length > 0 && (
                <div className="flex items-center gap-2">
                  <Sailboat className={`w-4 h-4 flex-shrink-0 ${lightMode ? 'text-gray-400' : 'text-slate-500'}`} />
                  <span className={`text-sm ${lightMode ? 'text-gray-600' : 'text-slate-300'}`}>
                    {memberInfo.boatClasses.join(', ')}
                  </span>
                </div>
              )}
              {memberInfo.memberSince && (
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 flex-shrink-0 ${lightMode ? 'text-gray-400' : 'text-slate-500'}`} />
                  <span className={`text-sm ${lightMode ? 'text-gray-600' : 'text-slate-300'}`}>
                    Member since {formatDate(memberInfo.memberSince)}
                  </span>
                </div>
              )}
              <div className={`flex items-center justify-center gap-6 pt-2 border-t ${lightMode ? 'border-gray-100' : 'border-slate-700'}`}>
                <div className="text-center">
                  <div className={`text-lg font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{memberInfo.postCount}</div>
                  <div className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>Posts</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{memberInfo.clubs.length}</div>
                  <div className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>{memberInfo.clubs.length === 1 ? 'Club' : 'Clubs'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {!isOwnProfile && (
            <div className="flex gap-2">
              {connectionStatus === 'none' && (
                <button
                  onClick={handleConnect}
                  disabled={isSendingRequest}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  Connect
                </button>
              )}
              {connectionStatus === 'pending_sent' && (
                <button
                  disabled
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${lightMode ? 'bg-gray-100 text-gray-500' : 'bg-slate-700 text-slate-400'}`}
                >
                  <Clock className="w-4 h-4" />
                  Request Sent
                </button>
              )}
              {connectionStatus === 'connected' && (
                <button
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600/20 text-green-600 rounded-xl text-sm font-medium"
                >
                  <UserCheck className="w-4 h-4" />
                  Connected
                </button>
              )}
              {onMessage && (
                <button
                  onClick={() => {
                    onMessage({ id: userId, name, avatar });
                    onClose();
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${lightMode ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                >
                  <MessageCircle className="w-4 h-4" />
                  Message
                </button>
              )}
            </div>
          )}

          {/* View Full Profile */}
          {onViewProfile && (
            <button
              onClick={() => {
                onViewProfile({ id: userId, name, avatar });
                onClose();
              }}
              className={`w-full mt-3 py-2 text-sm font-medium rounded-xl transition-colors ${lightMode ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-slate-700/50'}`}
            >
              View Posts
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

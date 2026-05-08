import React, { useState, useEffect } from 'react';
import { X, Search, MessageSquare, UserPlus, Users, Clock, Check, UserX, Bell } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';

interface Connection {
  id: string;
  name: string;
  avatar?: string;
  isConnection?: boolean;
}

interface DiscoverUser {
  id: string;
  name: string;
  avatar?: string;
}

type ModalTab = 'chat' | 'connect' | 'requests';

interface PendingRequest {
  id: string;
  user_id: string;
  name: string;
  avatar?: string;
  created_at: string;
}

interface NewChatModalProps {
  onClose: () => void;
  onSelectUser: (userId: string, name: string, avatar?: string) => void;
  darkMode: boolean;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ onClose, onSelectUser, darkMode }) => {
  const { user, currentClub, currentOrganization } = useAuth();
  const { isImpersonating, effectiveUserId } = useImpersonation();
  const currentUserId = isImpersonating && effectiveUserId ? effectiveUserId : user?.id;
  const contextId = currentOrganization?.id || currentClub?.clubId;

  const [activeTab, setActiveTab] = useState<ModalTab>('chat');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<DiscoverUser[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [pendingSentIds, setPendingSentIds] = useState<Set<string>>(new Set());
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    if (currentUserId) {
      fetchPeople();
      fetchPendingRequests();
    }
  }, [currentUserId]);

  useEffect(() => {
    if (activeTab === 'connect' && currentUserId && discoverUsers.length === 0) {
      fetchDiscoverUsers();
    }
  }, [activeTab, currentUserId]);

  const fetchPeople = async () => {
    if (!currentUserId) return;
    try {
      const connectionUserIds = new Set<string>();

      const { data: accepted } = await supabase
        .from('social_connections')
        .select('user_id, connected_user_id')
        .or(`user_id.eq.${currentUserId},connected_user_id.eq.${currentUserId}`)
        .eq('status', 'accepted');

      if (accepted) {
        accepted.forEach(c => {
          const otherId = c.user_id === currentUserId ? c.connected_user_id : c.user_id;
          connectionUserIds.add(otherId);
        });
      }

      setConnectedIds(connectionUserIds);

      const allUserIds = new Set<string>(connectionUserIds);

      if (contextId) {
        const { data: clubMembers } = await supabase
          .from('members')
          .select('user_id')
          .eq('club_id', contextId)
          .not('user_id', 'is', null)
          .neq('user_id', currentUserId);

        if (clubMembers) {
          clubMembers.forEach(m => {
            if (m.user_id) allUserIds.add(m.user_id);
          });
        }
      }

      if (allUserIds.size === 0) {
        setConnections([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', Array.from(allUserIds));

      setConnections(
        (profiles || []).map(p => ({
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
          avatar: p.avatar_url || undefined,
          isConnection: connectionUserIds.has(p.id),
        })).sort((a, b) => {
          if (a.isConnection && !b.isConnection) return -1;
          if (!a.isConnection && b.isConnection) return 1;
          return a.name.localeCompare(b.name);
        })
      );
    } catch (err) {
      console.error('Error fetching people:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiscoverUsers = async () => {
    if (!currentUserId) return;
    setLoadingDiscover(true);
    try {
      const { data: pendingSent } = await supabase
        .from('social_connections')
        .select('connected_user_id')
        .eq('user_id', currentUserId)
        .eq('status', 'pending');

      setPendingSentIds(new Set(pendingSent?.map(p => p.connected_user_id) || []));

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, avatar_url')
        .neq('id', currentUserId)
        .limit(200);

      const users = (profiles || [])
        .map(p => ({
          id: p.id,
          name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
          avatar: p.avatar_url || undefined,
        }))
        .filter(u => u.name && u.name.trim().length > 0 && u.name !== 'Unknown');

      setDiscoverUsers(users);
    } catch (err) {
      console.error('Error fetching discover users:', err);
    } finally {
      setLoadingDiscover(false);
    }
  };

  const handleConnect = async (userId: string) => {
    if (!currentUserId) return;
    setConnectingId(userId);
    try {
      await supabase
        .from('social_connections')
        .insert({
          user_id: currentUserId,
          connected_user_id: userId,
          connection_type: 'friend',
          status: 'pending',
        });
      setPendingSentIds(prev => new Set([...prev, userId]));
    } catch (err) {
      console.error('Error sending connection request:', err);
    } finally {
      setConnectingId(null);
    }
  };

  const fetchPendingRequests = async () => {
    if (!currentUserId) return;
    try {
      const { data } = await supabase
        .from('social_connections')
        .select(`
          id, user_id, created_at,
          requester:profiles!social_connections_user_id_profiles_fkey(id, full_name, avatar_url)
        `)
        .eq('connected_user_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      setPendingRequests(
        (data || []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          name: r.requester?.full_name || 'Unknown',
          avatar: r.requester?.avatar_url || undefined,
          created_at: r.created_at,
        }))
      );
    } catch (err) {
      console.error('Error fetching pending requests:', err);
    }
  };

  const handleAcceptRequest = async (connectionId: string, requesterId: string) => {
    setRespondingId(connectionId);
    try {
      await supabase
        .from('social_connections')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', connectionId);

      setPendingRequests(prev => prev.filter(r => r.id !== connectionId));
      setConnectedIds(prev => new Set([...prev, requesterId]));
      fetchPeople();
    } catch (err) {
      console.error('Error accepting request:', err);
    } finally {
      setRespondingId(null);
    }
  };

  const handleRejectRequest = async (connectionId: string) => {
    setRespondingId(connectionId);
    try {
      await supabase
        .from('social_connections')
        .delete()
        .eq('id', connectionId);

      setPendingRequests(prev => prev.filter(r => r.id !== connectionId));
    } catch (err) {
      console.error('Error rejecting request:', err);
    } finally {
      setRespondingId(null);
    }
  };

  const filtered = connections.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDiscover = discoverUsers.filter(u =>
    !connectedIds.has(u.id) &&
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
        darkMode ? 'bg-slate-800 border border-slate-700/50' : 'bg-white'
      }`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${
          darkMode ? 'border-slate-700/50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <MessageSquare size={20} className="text-blue-500" />
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              New Chat
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        <div className={`flex border-b ${darkMode ? 'border-slate-700/50' : 'border-gray-200'}`}>
          <button
            onClick={() => { setActiveTab('chat'); setSearchTerm(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={16} />
            People
          </button>
          <button
            onClick={() => { setActiveTab('connect'); setSearchTerm(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === 'connect'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <UserPlus size={16} />
            Find
          </button>
          <button
            onClick={() => { setActiveTab('requests'); setSearchTerm(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'requests'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bell size={16} />
            Requests
            {pendingRequests.length > 0 && (
              <span className="absolute top-2 right-3 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        <div className="p-4">
          {activeTab !== 'requests' && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder={activeTab === 'chat' ? 'Search connections...' : 'Search people to connect...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all ${
                  darkMode
                    ? 'bg-slate-700/60 border border-slate-600/50 text-white placeholder-slate-500'
                    : 'bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>
          )}

          <div className="max-h-[360px] overflow-y-auto -mx-1 px-1">
            {activeTab === 'chat' && (
              loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {searchTerm ? 'No matching people' : 'No people found'}
                  </p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>
                    {searchTerm ? 'Try a different search' : 'Use "Find" to connect with other members'}
                  </p>
                  {!searchTerm && (
                    <button
                      onClick={() => setActiveTab('connect')}
                      className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
                    >
                      <UserPlus size={14} />
                      Find People
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filtered.map(conn => (
                    <button
                      key={conn.id}
                      onClick={() => {
                        onSelectUser(conn.id, conn.name, conn.avatar);
                        onClose();
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                        darkMode ? 'hover:bg-slate-700/60' : 'hover:bg-gray-100'
                      }`}
                    >
                      {conn.avatar ? (
                        <img src={conn.avatar} alt={conn.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                          {conn.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {conn.name}
                        </p>
                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                          {conn.isConnection ? 'Connection' : 'Club Member'}
                        </p>
                      </div>
                      <MessageSquare size={16} className={darkMode ? 'text-slate-600' : 'text-gray-300'} />
                    </button>
                  ))}
                </div>
              )
            )}

            {activeTab === 'connect' && (
              loadingDiscover ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : filteredDiscover.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {searchTerm ? 'No matching people' : 'No new people to connect with'}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredDiscover.map(person => {
                    const isPending = pendingSentIds.has(person.id);
                    const isConnecting = connectingId === person.id;
                    return (
                      <div
                        key={person.id}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl ${
                          darkMode ? 'hover:bg-slate-700/60' : 'hover:bg-gray-100'
                        }`}
                      >
                        {person.avatar ? (
                          <img src={person.avatar} alt={person.name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                            {person.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 text-left min-w-0">
                          <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {person.name}
                          </p>
                        </div>
                        {isPending ? (
                          <span className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                            darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <Clock size={12} />
                            Pending
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConnect(person.id)}
                            disabled={isConnecting}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                          >
                            <UserPlus size={12} />
                            {isConnecting ? '...' : 'Connect'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {activeTab === 'requests' && (
              pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell size={32} className={darkMode ? 'text-slate-600' : 'text-gray-300'} />
                  <p className={`text-sm mt-3 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    No pending connection requests
                  </p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>
                    When someone sends you a connection request, it will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {pendingRequests.map(request => {
                    const isResponding = respondingId === request.id;
                    return (
                      <div
                        key={request.id}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl ${
                          darkMode ? 'bg-slate-700/30' : 'bg-gray-50'
                        }`}
                      >
                        {request.avatar ? (
                          <img src={request.avatar} alt={request.name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                            {request.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 text-left min-w-0">
                          <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {request.name}
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                            Wants to connect
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAcceptRequest(request.id, request.user_id)}
                            disabled={isResponding}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50"
                          >
                            <Check size={12} />
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectRequest(request.id)}
                            disabled={isResponding}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              darkMode
                                ? 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            <UserX size={12} />
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;

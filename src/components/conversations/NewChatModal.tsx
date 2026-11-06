import React, { useState, useEffect } from 'react';
import { X, Search, MessageSquare, UserPlus, Users, Clock, Check, UserX, Bell } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { AAvatar } from '../alfie/Kit';

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

  const av = (name: string, url?: string, size = 40) => {
    const [first, ...rest] = (name || '?').split(' ');
    return <AAvatar url={url} first={first} last={rest.join(' ')} size={size} />;
  };
  const spinner = (
    <div className="flex items-center justify-center py-12">
      <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
  const empty = (icon: React.ReactNode, title: string, sub?: string, action?: React.ReactNode) => (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <span className="a-tile mb-3" style={{ width: 48, height: 48 }}>{icon}</span>
      <p className="a-ink text-[14px] font-semibold">{title}</p>
      {sub && <p className="a-dim text-[12.5px] mt-1">{sub}</p>}
      {action}
    </div>
  );
  const personRow = (conn: Connection) => (
    <button
      key={conn.id}
      onClick={() => {
        onSelectUser(conn.id, conn.name, conn.avatar);
        onClose();
      }}
      className="a-pr"
      aria-label={`Chat with ${conn.name}`}
    >
      {av(conn.name, conn.avatar)}
      <div className="flex-1 min-w-0 text-left">
        <div className={`a-ink text-[14.5px] truncate ${conn.isConnection ? 'font-semibold' : 'font-medium'}`}>{conn.name}</div>
        <div className="a-dim text-[12px] mt-0.5">{conn.isConnection ? 'Connection' : 'Club member'}</div>
      </div>
      <span className={`a-ib ${conn.isConnection ? 'a-ib-call-b' : ''}`} aria-hidden="true"><MessageSquare size={17} /></span>
    </button>
  );
  const conns = filtered.filter(c => c.isConnection);
  const others = filtered.filter(c => !c.isConnection);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <section className="a-sheet relative w-full max-w-[420px] max-h-[85vh] flex flex-col" role="dialog" aria-label="New chat">
        <div className="flex items-center gap-3" style={{ padding: '20px 18px 12px 22px' }}>
          <span className="a-tile a-tile-rim" style={{ width: 40, height: 40 }}><MessageSquare size={18} /></span>
          <h2 className="a-display a-ink flex-1 m-0 text-[20px] font-semibold">New chat</h2>
          <button onClick={onClose} className="a-ib" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5" style={{ padding: '0 18px 10px' }}>
          <div className="a-seg" style={{ display: 'flex' }} role="tablist">
            <button onClick={() => { setActiveTab('chat'); setSearchTerm(''); }} className={`a-seg-i flex-1 justify-center ${activeTab === 'chat' ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeTab === 'chat'}>
              <Users size={16} />People
            </button>
            <button onClick={() => { setActiveTab('connect'); setSearchTerm(''); }} className={`a-seg-i flex-1 justify-center ${activeTab === 'connect' ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeTab === 'connect'}>
              <UserPlus size={16} />Find
            </button>
            <button onClick={() => { setActiveTab('requests'); setSearchTerm(''); }} className={`a-seg-i flex-1 justify-center ${activeTab === 'requests' ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeTab === 'requests'}>
              <Bell size={16} />Requests
              {pendingRequests.length > 0 && <span className="a-cnt">{pendingRequests.length}</span>}
            </button>
          </div>
          {activeTab !== 'requests' && (
            <label className="a-field">
              <Search size={16} />
              <input
                type="text"
                placeholder={activeTab === 'chat' ? 'Search connections' : 'Search people to connect'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </label>
          )}
        </div>

        <div className="flex-1 min-h-[200px] overflow-y-auto" style={{ padding: '0 8px 14px' }}>
          {activeTab === 'chat' && (
            loading ? spinner : filtered.length === 0 ? empty(
              <Users size={22} />,
              searchTerm ? 'No matching people' : 'No people found',
              searchTerm ? 'Try a different search' : 'Use Find to connect with other members',
              !searchTerm && (
                <button onClick={() => setActiveTab('connect')} className="a-btn a-btn-p mt-4">
                  <UserPlus size={16} />
                  Find people
                </button>
              ),
            ) : (
              <>
                {conns.length > 0 && <div className="a-ghd" style={{ padding: '8px 10px 4px' }}>Connections</div>}
                {conns.map(personRow)}
                {others.length > 0 && <div className="a-ghd" style={{ padding: conns.length ? '12px 10px 4px' : '8px 10px 4px' }}>Club members</div>}
                {others.map(personRow)}
              </>
            )
          )}

          {activeTab === 'connect' && (
            loadingDiscover ? spinner : filteredDiscover.length === 0 ? empty(
              <UserPlus size={22} />,
              searchTerm ? 'No matching people' : 'No new people to connect with',
            ) : (
              <>
                <div className="a-ghd" style={{ padding: '8px 10px 4px' }}>People you may know</div>
                {filteredDiscover.map(person => {
                  const isPending = pendingSentIds.has(person.id);
                  const isConnecting = connectingId === person.id;
                  return (
                    <div key={person.id} className="a-pr" style={{ cursor: 'default' }}>
                      {av(person.name, person.avatar)}
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[14.5px] font-medium truncate">{person.name}</div>
                      </div>
                      {isPending ? (
                        <span className="a-lb-fmt" style={{ height: 28 }}><Clock size={13} />Pending</span>
                      ) : (
                        <button
                          onClick={() => handleConnect(person.id)}
                          disabled={isConnecting}
                          className="a-btn a-btn-p disabled:opacity-50"
                          style={{ height: 32, padding: '0 12px', fontSize: 13 }}
                        >
                          <UserPlus size={14} />
                          {isConnecting ? '…' : 'Connect'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )
          )}

          {activeTab === 'requests' && (
            pendingRequests.length === 0 ? empty(
              <Bell size={22} />,
              'No pending connection requests',
              'When someone sends you a connection request, it will appear here',
            ) : (
              <>
                <div className="a-ghd" style={{ padding: '8px 10px 4px' }}>Requests</div>
                {pendingRequests.map(request => {
                  const isResponding = respondingId === request.id;
                  return (
                    <div key={request.id} className="a-pr" style={{ cursor: 'default' }}>
                      {av(request.name, request.avatar)}
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[14.5px] font-medium truncate">{request.name}</div>
                        <div className="a-dim text-[12px] mt-0.5">Wants to connect</div>
                      </div>
                      <button
                        onClick={() => handleRejectRequest(request.id)}
                        disabled={isResponding}
                        className="a-ib disabled:opacity-50"
                        aria-label={`Decline ${request.name}`}
                        title="Decline"
                      >
                        <UserX size={17} />
                      </button>
                      <button
                        onClick={() => handleAcceptRequest(request.id, request.user_id)}
                        disabled={isResponding}
                        className="a-btn a-btn-g disabled:opacity-50"
                        style={{ height: 32, padding: '0 12px', fontSize: 13 }}
                      >
                        <Check size={14} />
                        Accept
                      </button>
                    </div>
                  );
                })}
              </>
            )
          )}
        </div>
      </section>
    </div>
  );
};

export default NewChatModal;

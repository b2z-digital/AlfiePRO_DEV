import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, Search, Check, XCircle, Users, Clock, UserCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { socialStorage } from '../../utils/socialStorage';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';

interface ConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode?: boolean;
}

type TabType = 'connections' | 'requests' | 'find';

export default function ConnectionsModal({ isOpen, onClose, darkMode = false }: ConnectionsModalProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const lightMode = !darkMode;
  const [activeTab, setActiveTab] = useState<TabType>('connections');
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [myConnections, setMyConnections] = useState<any[]>([]);
  const [pendingReceived, setPendingReceived] = useState<any[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [pendingSentIds, setPendingSentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [userToDisconnect, setUserToDisconnect] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [usersRes, connectionsAccepted, connectionsReverse, pendingRes, pendingSent] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .neq('id', user.id)
          .order('full_name', { ascending: true })
          .limit(200),
        supabase
          .from('social_connections')
          .select(`*, connected_user:profiles!social_connections_connected_user_id_profiles_fkey(id, full_name, avatar_url)`)
          .eq('user_id', user.id)
          .eq('status', 'accepted'),
        supabase
          .from('social_connections')
          .select(`*, connected_user:profiles!social_connections_user_id_profiles_fkey(id, full_name, avatar_url)`)
          .eq('connected_user_id', user.id)
          .eq('status', 'accepted'),
        socialStorage.getPendingConnectionRequests(),
        supabase
          .from('social_connections')
          .select('connected_user_id')
          .eq('user_id', user.id)
          .eq('status', 'pending'),
      ]);

      const validUsers = (usersRes.data || []).filter(u => u.full_name && u.full_name.trim().length > 0);
      setAllUsers(validUsers);

      const allConnections = [
        ...(connectionsAccepted.data || []),
        ...(connectionsReverse.data || []).map(c => ({
          ...c,
          connected_user: c.connected_user
        }))
      ];
      setMyConnections(allConnections);

      const ids = new Set<string>();
      connectionsAccepted.data?.forEach(c => ids.add(c.connected_user_id));
      connectionsReverse.data?.forEach(c => ids.add(c.user_id));
      setConnectedIds(ids);

      setPendingReceived(pendingRes || []);
      setPendingSentIds(new Set(pendingSent.data?.map(p => p.connected_user_id) || []));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (userId: string) => {
    try {
      await socialStorage.sendConnectionRequest(userId, 'friend');
      setPendingSentIds(prev => new Set([...prev, userId]));
      addNotification('Connection request sent', 'success');
    } catch (error: any) {
      addNotification(error?.message || 'Failed to send connection request', 'error');
    }
  };

  const handleAccept = async (connectionId: string, requesterId: string) => {
    try {
      await socialStorage.acceptConnectionRequest(connectionId);
      setPendingReceived(prev => prev.filter(r => r.id !== connectionId));
      setConnectedIds(prev => new Set([...prev, requesterId]));
      addNotification('Connection accepted', 'success');
      loadData();
    } catch (error) {
      addNotification('Failed to accept request', 'error');
    }
  };

  const handleReject = async (connectionId: string) => {
    try {
      await socialStorage.rejectConnectionRequest(connectionId);
      setPendingReceived(prev => prev.filter(r => r.id !== connectionId));
      addNotification('Connection request declined', 'success');
    } catch (error) {
      addNotification('Failed to decline request', 'error');
    }
  };

  const handleDisconnectClick = (userId: string) => {
    setUserToDisconnect(userId);
    setShowDeleteConfirmation(true);
  };

  const handleDisconnect = async () => {
    if (!userToDisconnect || !user) return;
    try {
      const { data: conns } = await supabase
        .from('social_connections')
        .select('id')
        .or(`and(user_id.eq.${user.id},connected_user_id.eq.${userToDisconnect}),and(user_id.eq.${userToDisconnect},connected_user_id.eq.${user.id})`);

      if (conns && conns.length > 0) {
        for (const conn of conns) {
          await supabase.from('social_connections').delete().eq('id', conn.id);
        }
        setConnectedIds(prev => {
          const s = new Set(prev);
          s.delete(userToDisconnect);
          return s;
        });
        setMyConnections(prev => prev.filter(c =>
          c.connected_user_id !== userToDisconnect && c.user_id !== userToDisconnect
        ));
        addNotification('Connection removed', 'success');
      }
      setShowDeleteConfirmation(false);
      setUserToDisconnect(null);
    } catch (error) {
      addNotification('Failed to remove connection', 'error');
    }
  };

  const filteredUsers = allUsers.filter(u =>
    (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredConnections = myConnections.filter(c =>
    (c.connected_user?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'connections', label: 'My Connections', icon: <Users className="w-4 h-4" />, count: myConnections.length },
    { key: 'requests', label: 'Requests', icon: <Clock className="w-4 h-4" />, count: pendingReceived.length },
    { key: 'find', label: 'Find People', icon: <UserPlus className="w-4 h-4" /> },
  ];

  const renderAvatar = (avatarUrl?: string, name?: string, size = 'w-12 h-12') => (
    avatarUrl ? (
      <img src={avatarUrl} alt={name || ''} className={`${size} rounded-full object-cover`} />
    ) : (
      <div className={`${size} rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg`}>
        {(name || 'U').charAt(0)}
      </div>
    )
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold text-white drop-shadow-lg">Connections</h2>
            <p className="text-blue-100 text-sm mt-0.5">Manage your network</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all relative z-10">
            <X size={20} />
          </button>
        </div>

        <div className={`flex border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearchTerm(''); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? darkMode ? 'text-blue-400 border-b-2 border-blue-400' : 'text-blue-600 border-b-2 border-blue-600'
                  : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  tab.key === 'requests' && tab.count > 0
                    ? 'bg-red-500 text-white'
                    : darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab !== 'requests' && (
          <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'connections' ? 'Search connections...' : 'Search users...'}
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'}`}
              />
            </div>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-4 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : activeTab === 'connections' ? (
            filteredConnections.length > 0 ? (
              <div className="space-y-2">
                {filteredConnections.map(conn => {
                  const connUser = conn.connected_user;
                  return (
                    <div key={conn.id} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        {renderAvatar(connUser?.avatar_url, connUser?.full_name)}
                        <div>
                          <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{connUser?.full_name || 'User'}</div>
                          <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            <UserCheck className="w-3 h-3 inline mr-1" />Connected
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDisconnectClick(connUser?.id || conn.connected_user_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                      >
                        <UserMinus className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  {searchTerm ? 'No connections match your search' : 'No connections yet'}
                </p>
                {!searchTerm && (
                  <button onClick={() => setActiveTab('find')} className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium">
                    Find People
                  </button>
                )}
              </div>
            )
          ) : activeTab === 'requests' ? (
            pendingReceived.length > 0 ? (
              <div className="space-y-2">
                {pendingReceived.map(req => {
                  const reqUser = req.requester;
                  return (
                    <div key={req.id} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        {renderAvatar(reqUser?.avatar_url, reqUser?.full_name)}
                        <div>
                          <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{reqUser?.full_name || 'User'}</div>
                          <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Wants to connect</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAccept(req.id, req.user_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          <XCircle className="w-4 h-4" />
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No pending requests</p>
              </div>
            )
          ) : (
            filteredUsers.length > 0 ? (
              <div className="space-y-2">
                {filteredUsers.map(userProfile => {
                  const isConnected = connectedIds.has(userProfile.id);
                  const isPending = pendingSentIds.has(userProfile.id);
                  const hasIncoming = pendingReceived.some(r => r.user_id === userProfile.id);

                  return (
                    <div key={userProfile.id} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        {renderAvatar(userProfile.avatar_url, userProfile.full_name)}
                        <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userProfile.full_name}</div>
                      </div>
                      {isConnected ? (
                        <button onClick={() => handleDisconnectClick(userProfile.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-600 hover:bg-red-200 transition-colors">
                          <UserMinus className="w-4 h-4" />Remove
                        </button>
                      ) : hasIncoming ? (
                        <button onClick={() => setActiveTab('requests')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors">
                          <Clock className="w-4 h-4" />Respond
                        </button>
                      ) : isPending ? (
                        <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-500'}`}>
                          Pending
                        </div>
                      ) : (
                        <button onClick={() => handleConnect(userProfile.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                          <UserPlus className="w-4 h-4" />Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>No users found</p>
              </div>
            )
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => { setShowDeleteConfirmation(false); setUserToDisconnect(null); }}
        onConfirm={handleDisconnect}
        title="Remove Connection"
        message="Are you sure you want to remove this connection?"
        confirmText="Remove"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
      />
    </div>
  );
}

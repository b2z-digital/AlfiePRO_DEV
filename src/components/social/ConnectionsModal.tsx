import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, Search } from 'lucide-react';
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

export default function ConnectionsModal({ isOpen, onClose, darkMode = false }: ConnectionsModalProps) {
  const { user, currentClub } = useAuth();
  const { addNotification } = useNotification();
  const lightMode = !darkMode;
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [connections, setConnections] = useState<Set<string>>(new Set());
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());
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
      // Load all users with profiles (excluding current user)
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .neq('id', user.id)
        .order('full_name', { ascending: true })
        .limit(100);

      // Filter out users without valid names (null, empty, or whitespace-only)
      const validUsers = (users || []).filter(u =>
        u.full_name && u.full_name.trim().length > 0
      );

      setAllUsers(validUsers);

      // Load existing connections (both directions)
      const { data: myConnections } = await supabase
        .from('social_connections')
        .select('user_id, connected_user_id, status')
        .or(`user_id.eq.${user.id},connected_user_id.eq.${user.id}`)
        .eq('status', 'accepted');

      const connectionIds = new Set(
        myConnections?.map(conn =>
          conn.user_id === user.id ? conn.connected_user_id : conn.user_id
        ) || []
      );
      setConnections(connectionIds);

      // Load pending requests I've sent
      const { data: pending } = await supabase
        .from('social_connections')
        .select('connected_user_id')
        .eq('user_id', user.id)
        .eq('status', 'pending');

      setPendingRequests(new Set(pending?.map(p => p.connected_user_id) || []));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (userId: string) => {
    try {
      await socialStorage.sendConnectionRequest(userId, 'friend');
      setPendingRequests(prev => new Set([...prev, userId]));
      addNotification('Connection request sent', 'success');
    } catch (error: any) {
      console.error('Error creating connection:', error);
      const errorMessage = error?.message || 'Failed to send connection request';
      addNotification(errorMessage, 'error');
    }
  };

  const handleDisconnectClick = (userId: string) => {
    setUserToDisconnect(userId);
    setShowDeleteConfirmation(true);
  };

  const handleDisconnect = async () => {
    if (!userToDisconnect) return;

    try {
      // Find and delete the connection (check both directions)
      const { data: connections } = await supabase
        .from('social_connections')
        .select('id')
        .or(`and(user_id.eq.${user?.id},connected_user_id.eq.${userToDisconnect}),and(user_id.eq.${userToDisconnect},connected_user_id.eq.${user?.id})`);

      if (connections && connections.length > 0) {
        await supabase
          .from('social_connections')
          .delete()
          .eq('id', connections[0].id);

        setConnections(prev => {
          const newSet = new Set(prev);
          newSet.delete(userToDisconnect);
          return newSet;
        });
        addNotification('Connection removed', 'success');
      }
      setShowDeleteConfirmation(false);
      setUserToDisconnect(null);
    } catch (error) {
      console.error('Error removing connection:', error);
      addNotification('Failed to remove connection', 'error');
    }
  };

  const filteredUsers = allUsers.filter(user =>
    (user.full_name || '')
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold text-white drop-shadow-lg">
              Find Connections
            </h2>
            <p className="text-blue-100 text-sm mt-0.5">Connect with other users</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users..."
              className={`w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500'}`}
            />
          </div>
        </div>

        {/* Users List */}
        <div className={`flex-1 overflow-y-auto p-4 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredUsers.length > 0 ? (
            <div className="space-y-2">
              {filteredUsers.map(userProfile => {
                const isConnected = connections.has(userProfile.id);
                const isPending = pendingRequests.has(userProfile.id);

                return (
                  <div
                    key={userProfile.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center space-x-3">
                      {userProfile.avatar_url ? (
                        <img
                          src={userProfile.avatar_url}
                          alt={userProfile.full_name || 'User'}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                          {userProfile.full_name?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div>
                        <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {userProfile.full_name || 'Anonymous User'}
                        </div>
                      </div>
                    </div>

                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnectClick(userProfile.id)}
                        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                      >
                        <UserMinus className="w-4 h-4" />
                        <span className="text-sm font-medium">Remove</span>
                      </button>
                    ) : isPending ? (
                      <div className={`px-4 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                        Pending
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnect(userProfile.id)}
                        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span className="text-sm font-medium">Connect</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                No users found
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => {
          setShowDeleteConfirmation(false);
          setUserToDisconnect(null);
        }}
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

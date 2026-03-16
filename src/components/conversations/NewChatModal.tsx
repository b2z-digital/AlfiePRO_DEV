import React, { useState, useEffect } from 'react';
import { X, Search, MessageSquare } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';

interface Connection {
  id: string;
  name: string;
  avatar?: string;
}

interface NewChatModalProps {
  onClose: () => void;
  onSelectUser: (userId: string, name: string, avatar?: string) => void;
  darkMode: boolean;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ onClose, onSelectUser, darkMode }) => {
  const { user } = useAuth();
  const { isImpersonating, effectiveUserId } = useImpersonation();
  const currentUserId = isImpersonating && effectiveUserId ? effectiveUserId : user?.id;

  const [connections, setConnections] = useState<Connection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUserId) fetchConnections();
  }, [currentUserId]);

  const fetchConnections = async () => {
    if (!currentUserId) return;
    try {
      const { data: accepted } = await supabase
        .from('social_connections')
        .select('sender_id, recipient_id')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .eq('status', 'accepted');

      if (!accepted || accepted.length === 0) {
        setConnections([]);
        setLoading(false);
        return;
      }

      const otherIds = accepted.map(c =>
        c.sender_id === currentUserId ? c.recipient_id : c.sender_id
      );

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', otherIds);

      setConnections(
        (profiles || []).map(p => ({
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
          avatar: p.avatar_url || undefined,
        })).sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (err) {
      console.error('Error fetching connections:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = connections.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
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

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search connections..."
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

          <div className="max-h-[360px] overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  {searchTerm ? 'No matching connections' : 'No connections yet'}
                </p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>
                  {searchTerm ? 'Try a different search' : 'Connect with people in the Community page'}
                </p>
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
                        Connection
                      </p>
                    </div>
                    <MessageSquare size={16} className={darkMode ? 'text-slate-600' : 'text-gray-300'} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewChatModal;

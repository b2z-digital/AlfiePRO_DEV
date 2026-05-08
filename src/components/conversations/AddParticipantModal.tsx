import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useVoiceCall } from '../../contexts/VoiceCallContext';
import { GroupCallState } from '../../utils/voiceCallEngine';

interface AddParticipantModalProps {
  groupCallState: GroupCallState;
  onClose: () => void;
}

export function AddParticipantModal({ groupCallState, onClose }: AddParticipantModalProps) {
  const { user } = useAuth();
  const { addParticipant } = useVoiceCall();
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .neq('id', user.id)
        .order('full_name');

      setMembers(
        (data || []).map(p => ({ id: p.id, name: p.full_name || 'Unknown', avatar: p.avatar_url || undefined }))
      );
    } catch (e) {
      console.error('Error fetching members:', e);
    }
    setLoading(false);
  };

  const alreadyInCall = new Set([
    ...groupCallState.participants
      .filter(p => p.status !== 'left' && p.status !== 'declined')
      .map(p => p.userId),
    groupCallState.initiatorId,
  ]);

  const filteredMembers = members.filter(m => {
    if (alreadyInCall.has(m.id)) return false;
    if (!search) return true;
    return m.name.toLowerCase().includes(search.toLowerCase());
  });

  const handleAdd = async (member: { id: string; name: string; avatar?: string }) => {
    const success = await addParticipant(member.id, member.name, member.avatar);
    if (success) {
      onClose();
    }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const activeCount = groupCallState.participants.filter(
    p => p.status === 'active' || p.status === 'ringing' || p.status === 'connecting'
  ).length + 1;
  const canAdd = activeCount < 6;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add to Call</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!canAdd && (
          <div className="px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
            <p className="text-yellow-700 dark:text-yellow-400 text-sm">Maximum 6 participants reached.</p>
          </div>
        )}

        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {loading ? (
              <p className="text-center text-gray-500 py-4 text-sm">Loading...</p>
            ) : filteredMembers.length === 0 ? (
              <p className="text-center text-gray-500 py-4 text-sm">No members found</p>
            ) : (
              filteredMembers.slice(0, 20).map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center gap-3">
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.name} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-medium">
                        {getInitials(member.name)}
                      </div>
                    )}
                    <span className="text-sm text-gray-900 dark:text-white font-medium">{member.name}</span>
                  </div>
                  <button
                    onClick={() => handleAdd(member)}
                    disabled={!canAdd}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { X, Search, Check } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface Member {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

interface MemberSelectionModalProps {
  clubId?: string;
  stateAssociationId?: string;
  nationalAssociationId?: string;
  eventName: string;
  trackingUrl: string;
  onClose: () => void;
  onSend: (selectedMembers: Member[]) => Promise<void>;
}

export default function MemberSelectionModal({
  clubId,
  stateAssociationId,
  nationalAssociationId,
  eventName,
  trackingUrl,
  onClose,
  onSend,
}: MemberSelectionModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [clubId, stateAssociationId, nationalAssociationId]);

  const loadMembers = async () => {
    try {
      let data: Member[] | null = null;
      let error: any = null;

      if (clubId) {
        // Load club members
        const result = await supabase
          .from('members')
          .select('id, user_id, first_name, last_name, email')
          .eq('club_id', clubId)
          .not('user_id', 'is', null)
          .order('first_name');
        data = result.data;
        error = result.error;
      } else if (stateAssociationId) {
        // Load state association members through clubs
        const result = await supabase
          .from('members')
          .select('id, user_id, first_name, last_name, email, clubs!inner(state_association_id)')
          .eq('clubs.state_association_id', stateAssociationId)
          .not('user_id', 'is', null)
          .order('first_name');
        data = result.data;
        error = result.error;
      } else if (nationalAssociationId) {
        // Load national association members through clubs
        const result = await supabase
          .from('members')
          .select('id, user_id, first_name, last_name, email, clubs!inner(national_association_id)')
          .eq('clubs.national_association_id', nationalAssociationId)
          .not('user_id', 'is', null)
          .order('first_name');
        data = result.data;
        error = result.error;
      }

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  const toggleAll = () => {
    if (selectedMembers.size === filteredMembers.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(filteredMembers.map(m => m.id)));
    }
  };

  const handleSend = async () => {
    if (selectedMembers.size === 0) return;

    setSending(true);
    try {
      const membersToNotify = members.filter(m => selectedMembers.has(m.id));
      await onSend(membersToNotify);
      onClose();
    } catch (error) {
      console.error('Error sending notifications:', error);
    } finally {
      setSending(false);
    }
  };

  const filteredMembers = members.filter(member => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      member.first_name.toLowerCase().includes(query) ||
      member.last_name.toLowerCase().includes(query) ||
      member.email?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Notify Members
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Select members to notify about live tracking
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={toggleAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {selectedMembers.size === filteredMembers.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-sm text-gray-600">
              {selectedMembers.size} selected
            </span>
          </div>
        </div>

        {/* Member List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">
                {searchQuery ? 'No members found' : 'No members with accounts found'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                    selectedMembers.has(member.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedMembers.has(member.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedMembers.has(member.id) && (
                      <Check size={14} className="text-white" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900">
                      {member.first_name} {member.last_name}
                    </div>
                    {member.email && (
                      <div className="text-sm text-gray-600">{member.email}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={selectedMembers.size === 0 || sending}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {sending ? (
              <>
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                Sending...
              </>
            ) : (
              `Send to ${selectedMembers.size} member${selectedMembers.size !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

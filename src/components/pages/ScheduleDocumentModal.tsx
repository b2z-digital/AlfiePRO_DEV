import React, { useState, useEffect } from 'react';
import { X, Calendar, Users, UserPlus } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../ui/Avatar';

interface ScheduleDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  documentType: 'nor' | 'si';
  eventDate: string;
  eventName: string;
  onSchedule: (contacts: string[], contactEmails: string[]) => void;
  isLinked?: boolean;
}

interface ClubMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_id: string | null;
  avatar_url: string | null;
}

export const ScheduleDocumentModal: React.FC<ScheduleDocumentModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  documentType,
  eventDate,
  eventName,
  onSchedule,
  isLinked = false
}) => {
  const { currentClub } = useAuth();
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [manualEmails, setManualEmails] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (isOpen && eventDate) {
      // Calculate due date (2 months before event)
      const eventDateObj = new Date(eventDate);
      const dueDateObj = new Date(eventDateObj);
      dueDateObj.setDate(dueDateObj.getDate() - 60);
      setDueDate(dueDateObj.toISOString().split('T')[0]);

      fetchMembers();
    }
  }, [isOpen, eventDate, currentClub]);

  const fetchMembers = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, user_id, avatar_url')
        .eq('club_id', currentClub.clubId)
        .eq('membership_status', 'active')
        .order('last_name');

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    const selectedContacts = selectedMembers.map(id => {
      const member = members.find(m => m.id === id);
      return member?.user_id || member?.email || '';
    }).filter(Boolean);

    const emails = manualEmails
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    onSchedule([...selectedContacts, ...emails], emails);
    onClose();
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  if (!isOpen) return null;

  const documentLabel = documentType === 'nor' ? 'Notice of Race (NOR)' : 'Sailing Instructions (SI)';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Calendar className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Schedule {isLinked ? 'NOR & SI' : documentLabel} Creation
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {eventName} {isLinked && '(Linked Schedules)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg hover:bg-slate-700/50 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Due Date Display */}
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-700/30' : 'bg-blue-50 border border-blue-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="text-blue-600" size={16} />
              <span className={`text-sm font-medium ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                Document Due Date
              </span>
            </div>
            <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {new Date(dueDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              2 months before event (required for State/National events)
            </p>
          </div>

          {/* Select Responsible Members */}
          <div>
            <label className={`block text-sm font-medium mb-3 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <Users size={16} />
              Select Responsible Members
            </label>
            <div className={`max-h-48 overflow-y-auto rounded-lg border ${darkMode ? 'bg-slate-900/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              {loading ? (
                <div className="p-4 text-center text-slate-400">Loading members...</div>
              ) : members.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No members found</div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {members.map(member => (
                    <label
                      key={member.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/30 transition-colors ${
                        selectedMembers.includes(member.id) ? (darkMode ? 'bg-blue-900/20' : 'bg-blue-50') : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(member.id)}
                        onChange={() => toggleMember(member.id)}
                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-600 focus:ring-offset-slate-800"
                      />
                      <Avatar
                        src={member.avatar_url}
                        alt={`${member.first_name} ${member.last_name}`}
                        size="sm"
                      />
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {member.first_name} {member.last_name}
                        </div>
                        <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {member.email}
                          {member.user_id && (
                            <span className="ml-2 text-green-500">(In Alfie)</span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Manual Email Entry */}
          <div>
            <label className={`block text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <UserPlus size={16} />
              Add External Contacts (Optional)
            </label>
            <input
              type="text"
              value={manualEmails}
              onChange={(e) => setManualEmails(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              className={`w-full px-4 py-2 rounded-lg ${
                darkMode
                  ? 'bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Separate multiple emails with commas. These contacts will receive task notifications via email.
            </p>
          </div>

          {/* Info Box */}
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-900/30 border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
            <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {isLinked
                ? 'High-priority tasks will be created for BOTH Notice of Race and Sailing Instructions and assigned to the selected members.'
                : 'A high-priority task will be created and assigned to the selected members.'
              }
              {' '}The task{isLinked ? 's' : ''} will be due 2 months before the event date.
              You will automatically be added as a contributor to track progress.
            </p>
            <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <strong>Email Reminders:</strong> Selected members will receive initial task notification and reminder emails as the due date approaches. Follow-up reminders will be sent if the task remains incomplete.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedMembers.length === 0 && !manualEmails.trim()}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              selectedMembers.length === 0 && !manualEmails.trim()
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30'
            }`}
          >
            Schedule Task
          </button>
        </div>
      </div>
    </div>
  );
};

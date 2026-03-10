import React, { useState, useEffect } from 'react';
import { X, Mail, Search, Users, Check, AlertTriangle, Send } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Member } from '../../types/member';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface MeetingInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  meetingName: string;
  clubId: string;
  darkMode: boolean;
  meetingCategory?: 'general' | 'committee';
}

export const MeetingInviteModal: React.FC<MeetingInviteModalProps> = ({
  isOpen,
  onClose,
  meetingId,
  meetingName,
  clubId,
  darkMode,
  meetingCategory = 'general'
}) => {
  const { user, currentClub } = useAuth();
  const { addNotification } = useNotifications();

  const [recipientType, setRecipientType] = useState<'all' | 'selected' | 'individual'>('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [individualRecipient, setIndividualRecipient] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [subject, setSubject] = useState(`Invitation: ${meetingName}`);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      // Generate default message
      const defaultMessage = `
You are invited to attend the following meeting:

Meeting: ${meetingName}
Date: [Meeting Date]
Time: [Meeting Time]
Location: [Meeting Location]

Please confirm your attendance by responding to this email.

Thank you.
      `.trim();
      
      setMessage(defaultMessage);
    }
  }, [isOpen, meetingName]);

  const fetchMembers = async () => {
    try {
      setLoading(true);

      if (meetingCategory === 'committee') {
        const { data: positions, error: posError } = await supabase
          .from('committee_positions')
          .select('member_id')
          .eq('club_id', clubId);

        if (posError) throw posError;

        const memberIds = (positions || []).map(p => p.member_id).filter(Boolean);
        if (memberIds.length === 0) {
          setMembers([]);
          return;
        }

        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, avatar_url, user_id')
          .eq('club_id', clubId)
          .in('id', memberIds)
          .order('first_name', { ascending: true });

        if (error) throw error;
        const membersWithEmail = (data || []).filter(member => member.email);
        setMembers(membersWithEmail);
      } else {
        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, avatar_url, user_id')
          .eq('club_id', clubId)
          .order('first_name', { ascending: true });

        if (error) throw error;
        const membersWithEmail = (data || []).filter(member => member.email);
        setMembers(membersWithEmail);
      }
    } catch (err) {
      console.error('Error fetching members:', err);
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvites = async () => {
    try {
      setSending(true);
      setError(null);

      // Determine recipients based on selection
      let recipientIds: string[] = [];

      if (recipientType === 'all') {
        recipientIds = members.map(member => member.id);
      } else if (recipientType === 'selected') {
        recipientIds = selectedMembers;
      } else if (recipientType === 'individual') {
        recipientIds = [individualRecipient];
      }

      if (recipientIds.length === 0) {
        setError('Please select at least one recipient');
        setSending(false);
        return;
      }

      // Get full member details for selected recipients
      const recipientMembers = members.filter(m => recipientIds.includes(m.id));

      // Get meeting details
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single();

      if (meetingError) {
        console.error('Error fetching meeting:', meetingError);
        throw new Error('Failed to fetch meeting details');
      }

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      console.log('Meeting data:', meeting);

      // Get current user's profile for sender info
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('Fetching profile for user:', user.id);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        throw new Error(`Failed to fetch sender profile: ${profileError.message}`);
      }

      if (!profile) {
        throw new Error('Sender profile not found');
      }

      console.log('Profile data:', profile);

      const senderName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

      if (!senderName) {
        throw new Error('Sender name is empty');
      }

      console.log('Sender name:', senderName);

      // Replace merge fields in the message with actual meeting data
      const meetingDate = meeting.date
        ? new Date(meeting.date).toLocaleDateString('en-AU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        : '[Meeting Date]';

      // Format start_time if it exists
      const meetingTime = meeting.start_time
        ? new Date(`2000-01-01T${meeting.start_time}`).toLocaleTimeString('en-AU', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })
        : '[Meeting Time]';

      const meetingLocation = meeting.location || '[Meeting Location]';

      console.log('Meeting details for replacement:', {
        date: meetingDate,
        time: meetingTime,
        location: meetingLocation
      });

      const processedMessage = message
        .replace(/\[Meeting Date\]/g, meetingDate)
        .replace(/\[Meeting Time\]/g, meetingTime)
        .replace(/\[Meeting Location\]/g, meetingLocation);

      console.log('Original message:', message);
      console.log('Processed message:', processedMessage);

      // Create attendance records for each recipient
      const attendanceRecords = recipientMembers.map(member => ({
        meeting_id: meetingId,
        member_id: member.id,
        user_id: member.user_id,
        status: 'maybe' // Default status until they respond
      }));

      // Insert attendance records and get response tokens
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('meeting_attendance')
        .upsert(attendanceRecords, {
          onConflict: 'meeting_id,member_id',
          ignoreDuplicates: false
        })
        .select('member_id, response_token');

      if (attendanceError) {
        console.error('Error creating attendance records:', attendanceError);
        throw new Error('Failed to create attendance records');
      }

      console.log('Created attendance records:', attendanceData);

      // Create a map of member_id to response_token
      const tokenMap = new Map(
        attendanceData?.map(a => [a.member_id, a.response_token]) || []
      );

      // Prepare recipients for the notification function
      const recipients = recipientMembers.map(member => ({
        user_id: member.user_id,
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        name: `${member.first_name} ${member.last_name}`,
        response_token: tokenMap.get(member.id)
      }));

      // Get club details including logo
      const { data: clubData } = await supabase
        .from('clubs')
        .select('name, logo')
        .eq('id', clubId)
        .single();

      // Call the send-notification edge function
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          recipients,
          subject,
          body: processedMessage,
          type: 'meeting_invite',
          club_id: clubId,
          send_email: true,
          sender_name: senderName,
          sender_avatar: profile?.avatar_url || null,
          club_name: clubData?.name || currentClub?.name || 'Your Club',
          club_logo: clubData?.logo || null,
          meeting_id: meetingId,
          meeting_name: meeting.name,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          meeting_location: meetingLocation
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invitations');
      }

      const result = await response.json();

      addNotification('success', `Meeting invitations sent to ${recipients.length} member${recipients.length !== 1 ? 's' : ''}!`);
      setSuccess(`Invitations sent to ${recipients.length} member${recipients.length !== 1 ? 's' : ''}`);

      // Reset form after successful send
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error sending invites:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to send invitations';
      setError(errorMessage);
      addNotification('error', errorMessage);
    } finally {
      setSending(false);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    if (selectedMembers.includes(memberId)) {
      setSelectedMembers(selectedMembers.filter(id => id !== memberId));
    } else {
      setSelectedMembers([...selectedMembers, memberId]);
    }
  };

  // Filter members based on search term
  const filteredMembers = members.filter(member => {
    const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) || 
           (member.email && member.email.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <Mail className="text-white drop-shadow-lg" size={24} />
            </div>
            <h2 className="text-2xl font-bold text-white drop-shadow-lg">Send Meeting Invites</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          {error && (
            <div className={`mb-6 p-4 rounded-lg border ${darkMode ? 'bg-red-900/20 border-red-900/30' : 'bg-red-50 border-red-200'}`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className={`h-5 w-5 ${darkMode ? 'text-red-400' : 'text-red-600'}`} aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className={`mb-6 p-4 rounded-lg border ${darkMode ? 'bg-green-900/20 border-green-900/30' : 'bg-green-50 border-green-200'}`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  <Check className={`h-5 w-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <p className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>{success}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            <div>
              <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Recipients
              </label>
              <div className="space-y-3">
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    id="all-members"
                    checked={recipientType === 'all'}
                    onChange={() => setRecipientType('all')}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                  />
                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                    All Club Members ({members.length})
                  </span>
                </label>

                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    id="selected-members"
                    checked={recipientType === 'selected'}
                    onChange={() => setRecipientType('selected')}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                  />
                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                    Selected Members ({selectedMembers.length})
                  </span>
                </label>

                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    id="individual-member"
                    checked={recipientType === 'individual'}
                    onChange={() => setRecipientType('individual')}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                  />
                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                    Individual Member
                  </span>
                </label>
                
                {recipientType === 'individual' && (
                  <div className="mt-3 pl-3">
                    <div className="mb-3">
                      <div className="relative">
                        <Search
                          size={18}
                          className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}
                        />
                        <input
                          type="text"
                          placeholder="Search members..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className={`w-full pl-10 pr-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${darkMode ? 'bg-slate-700 text-slate-200 placeholder-slate-400 border-slate-600' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-300'}`}
                        />
                      </div>
                    </div>

                    <div className={`max-h-64 overflow-y-auto border rounded-lg ${darkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-200 bg-white'}`}>
                      {loading ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mx-auto"></div>
                          <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Loading members...</p>
                        </div>
                      ) : filteredMembers.length === 0 ? (
                        <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          <Users size={24} className={`mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                          <p>No members found</p>
                        </div>
                      ) : (
                        <div className={`divide-y ${darkMode ? 'divide-slate-600' : 'divide-gray-100'}`}>
                          {filteredMembers.map(member => (
                            <label
                              key={member.id}
                              className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${darkMode ? 'hover:bg-slate-600/50' : 'hover:bg-gray-50'}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Avatar
                                  firstName={member.first_name}
                                  lastName={member.last_name}
                                  imageUrl={member.avatar_url}
                                  size="sm"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className={`font-medium truncate ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                                    {member.first_name} {member.last_name}
                                  </div>
                                  {member.email && (
                                    <div className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                      {member.email}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <input
                                type="radio"
                                name="individual-member"
                                checked={individualRecipient === member.id}
                                onChange={() => setIndividualRecipient(member.id)}
                                className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600 ml-3 flex-shrink-0"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {recipientType === 'selected' && (
                  <div className="mt-3 pl-3">
                    <div className="mb-3">
                      <div className="relative">
                        <Search
                          size={18}
                          className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}
                        />
                        <input
                          type="text"
                          placeholder="Search members..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className={`w-full pl-10 pr-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${darkMode ? 'bg-slate-700 text-slate-200 placeholder-slate-400 border-slate-600' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-300'}`}
                        />
                      </div>
                    </div>

                    <div className={`max-h-64 overflow-y-auto border rounded-lg ${darkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-200 bg-white'}`}>
                      {loading ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mx-auto"></div>
                          <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Loading members...</p>
                        </div>
                      ) : filteredMembers.length === 0 ? (
                        <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                          <Users size={24} className={`mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                          <p>No members found</p>
                        </div>
                      ) : (
                        <div className={`divide-y ${darkMode ? 'divide-slate-600' : 'divide-gray-100'}`}>
                          {filteredMembers.map(member => (
                            <label
                              key={member.id}
                              className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${darkMode ? 'hover:bg-slate-600/50' : 'hover:bg-gray-50'}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Avatar
                                  firstName={member.first_name}
                                  lastName={member.last_name}
                                  imageUrl={member.avatar_url}
                                  size="sm"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className={`font-medium truncate ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                                    {member.first_name} {member.last_name}
                                  </div>
                                  {member.email && (
                                    <div className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                      {member.email}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={selectedMembers.includes(member.id)}
                                onChange={() => toggleMemberSelection(member.id)}
                                className="h-4 w-4 rounded border-slate-600 text-cyan-600 focus:ring-cyan-500 ml-3 flex-shrink-0"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedMembers.length > 0 && (
                      <div className={`mt-2 px-1 text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                        {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${darkMode ? 'bg-slate-700 text-slate-200 border-slate-600 placeholder-slate-400' : 'bg-white text-gray-900 border-gray-300 placeholder-gray-400'}`}
                placeholder="Enter email subject"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={10}
                className={`w-full px-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none ${darkMode ? 'bg-slate-700 text-slate-200 border-slate-600 placeholder-slate-400' : 'bg-white text-gray-900 border-gray-300 placeholder-gray-400'}`}
                placeholder="Enter your message"
              />
            </div>
          </div>
        </div>

        <div className={`flex justify-end gap-3 p-6 border-t ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
          <button
            onClick={onClose}
            disabled={sending}
            className={`px-4 py-2.5 border rounded-lg transition-colors font-medium disabled:opacity-50 ${darkMode ? 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSendInvites}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg transition-all disabled:opacity-50 font-medium shadow-sm"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>Send Invites</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
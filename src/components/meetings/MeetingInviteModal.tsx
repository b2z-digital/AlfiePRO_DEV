import React, { useState, useEffect } from 'react';
import { X, Mail, Search, Users, Check, AlertTriangle, Send, Shield, Building2 } from 'lucide-react';
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
  clubId?: string;
  darkMode: boolean;
  meetingCategory?: 'general' | 'committee';
  associationId?: string;
  associationType?: 'state' | 'national';
}

interface ClubWithMembers {
  id: string;
  name: string;
  members: Member[];
}

type RecipientType = 'all' | 'committee' | 'selected' | 'individual' | 'club';

export const MeetingInviteModal: React.FC<MeetingInviteModalProps> = ({
  isOpen,
  onClose,
  meetingId,
  meetingName,
  clubId,
  darkMode,
  meetingCategory = 'general',
  associationId,
  associationType
}) => {
  const { user, currentClub } = useAuth();
  const { addNotification } = useNotifications();

  const isCommitteeMeeting = meetingCategory === 'committee';
  const isAssociation = !!associationId && !!associationType;

  const [recipientType, setRecipientType] = useState<RecipientType>(isCommitteeMeeting ? 'committee' : 'all');
  const [members, setMembers] = useState<Member[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<Member[]>([]);
  const [clubs, setClubs] = useState<ClubWithMembers[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
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
      setRecipientType(isCommitteeMeeting ? 'committee' : 'all');
      fetchMembers();
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

      if (isAssociation) {
        if (associationType === 'state') {
          const { data: clubsData, error: clubsError } = await supabase
            .from('clubs')
            .select('id, name')
            .eq('state_association_id', associationId)
            .order('name');

          if (clubsError) throw clubsError;

          const clubsList = clubsData || [];
          const clubIds = clubsList.map(c => c.id);

          if (clubIds.length > 0) {
            const { data, error } = await supabase
              .from('members')
              .select('id, first_name, last_name, email, avatar_url, user_id, club_id, club')
              .in('club_id', clubIds)
              .order('first_name', { ascending: true });

            if (error) throw error;
            const allMembers = (data || []).filter(m => m.email) as Member[];
            setMembers(allMembers);

            const clubsWithMembers: ClubWithMembers[] = clubsList.map(c => ({
              id: c.id,
              name: c.name,
              members: allMembers.filter(m => m.club_id === c.id)
            }));
            setClubs(clubsWithMembers);
          } else {
            setMembers([]);
            setClubs([]);
          }
        } else {
          const { data: userAssociations, error: assocError } = await supabase
            .from('user_national_associations')
            .select('user_id')
            .eq('national_association_id', associationId);

          if (assocError) throw assocError;

          const userIds = (userAssociations || []).map(ua => ua.user_id);
          if (userIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, email')
              .in('id', userIds)
              .order('first_name', { ascending: true });

            if (profilesError) throw profilesError;

            setMembers((profiles || []).filter(p => p.email).map((p: any) => ({
              ...p,
              user_id: p.id,
              club_id: '',
              club: '',
            })) as Member[]);
          } else {
            setMembers([]);
          }
        }

        const assocTable = associationType === 'state' ? 'user_state_associations' : 'user_national_associations';
        const assocCol = associationType === 'state' ? 'state_association_id' : 'national_association_id';

        const { data: assocUsers } = await supabase
          .from(assocTable)
          .select('user_id')
          .eq(assocCol, associationId);

        if (assocUsers && assocUsers.length > 0) {
          const userIds = assocUsers.map(au => au.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', userIds)
            .order('first_name', { ascending: true });

          if (profiles) {
            setCommitteeMembers((profiles || []).filter(p => p.email).map((p: any) => ({
              ...p,
              user_id: p.id,
              club_id: '',
              club: '',
            })) as Member[]);
          }
        }
      } else {
        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, avatar_url, user_id')
          .eq('club_id', clubId)
          .order('first_name', { ascending: true });

        if (error) throw error;
        const membersWithEmail = (data || []).filter(member => member.email);
        setMembers(membersWithEmail as Member[]);

        const { data: positions } = await supabase
          .from('committee_positions')
          .select('member_id')
          .eq('club_id', clubId);

        if (positions) {
          const committeeMemberIds = positions.map(p => p.member_id).filter(Boolean);
          if (committeeMemberIds.length > 0) {
            setCommitteeMembers(membersWithEmail.filter(m => committeeMemberIds.includes(m.id)) as Member[]);
          }
        }
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

      let recipientIds: string[] = [];

      if (recipientType === 'all') {
        recipientIds = members.map(member => member.id);
      } else if (recipientType === 'committee') {
        recipientIds = committeeMembers.map(member => member.id);
      } else if (recipientType === 'club') {
        const selectedClub = clubs.find(c => c.id === selectedClubId);
        if (selectedClub) {
          recipientIds = selectedClub.members.map(m => m.id);
        }
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

      const allKnownMembers = [...members, ...committeeMembers.filter(cm => !members.some(m => m.id === cm.id))];
      const recipientMembers = allKnownMembers.filter(m => recipientIds.includes(m.id));

      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single();

      if (meetingError) {
        throw new Error('Failed to fetch meeting details');
      }

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw new Error(`Failed to fetch sender profile: ${profileError.message}`);
      }

      if (!profile) {
        throw new Error('Sender profile not found');
      }

      const senderName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

      if (!senderName) {
        throw new Error('Sender name is empty');
      }

      const meetingDate = meeting.date
        ? new Date(meeting.date).toLocaleDateString('en-AU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        : '[Meeting Date]';

      const meetingTime = meeting.start_time
        ? new Date(`2000-01-01T${meeting.start_time}`).toLocaleTimeString('en-AU', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })
        : '[Meeting Time]';

      const meetingLocation = meeting.location || '[Meeting Location]';

      const processedMessage = message
        .replace(/\[Meeting Date\]/g, meetingDate)
        .replace(/\[Meeting Time\]/g, meetingTime)
        .replace(/\[Meeting Location\]/g, meetingLocation);

      const seenUserIds = new Set<string>();
      const deduplicatedRecipients = recipientMembers.filter(member => {
        if (member.user_id) {
          if (seenUserIds.has(member.user_id)) return false;
          seenUserIds.add(member.user_id);
        }
        return true;
      });

      const attendanceRecords = deduplicatedRecipients.map(member => ({
        meeting_id: meetingId,
        member_id: member.id,
        user_id: member.user_id,
        status: 'maybe'
      }));

      const { data: attendanceData, error: attendanceError } = await supabase
        .from('meeting_attendance')
        .upsert(attendanceRecords, {
          onConflict: 'meeting_id,member_id',
          ignoreDuplicates: false
        })
        .select('member_id, response_token');

      if (attendanceError) {
        console.error('Attendance upsert error:', attendanceError);
        throw new Error(`Cannot create attendance records: ${attendanceError.message}`);
      }

      const tokenMap = new Map(
        attendanceData?.map(a => [a.member_id, a.response_token]) || []
      );

      const recipients = deduplicatedRecipients.map(member => ({
        user_id: member.user_id,
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        name: `${member.first_name} ${member.last_name}`,
        response_token: tokenMap.get(member.id)
      }));

      const { data: clubData } = clubId
        ? await supabase.from('clubs').select('name, logo').eq('id', clubId).maybeSingle()
        : { data: null };

      let orgName = clubData?.name || currentClub?.name || 'Your Organisation';
      if (isAssociation) {
        const assocTable = associationType === 'state' ? 'state_associations' : 'national_associations';
        const { data: assocData } = await supabase.from(assocTable).select('name').eq('id', associationId).maybeSingle();
        if (assocData?.name) orgName = assocData.name;
      }

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
          club_id: clubId || null,
          send_email: true,
          sender_name: senderName,
          sender_avatar: profile?.avatar_url || null,
          club_name: orgName,
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

      addNotification('success', `Meeting invitations sent to ${recipients.length} member${recipients.length !== 1 ? 's' : ''}!`);
      setSuccess(`Invitations sent to ${recipients.length} member${recipients.length !== 1 ? 's' : ''}`);

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

  const displayMembers = isCommitteeMeeting ? committeeMembers : members;

  const filteredMembers = displayMembers.filter(member => {
    const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) ||
           (member.email && member.email.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  if (!isOpen) return null;

  const renderMemberList = (membersList: Member[], selectionMode: 'radio' | 'checkbox') => (
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
        ) : membersList.length === 0 ? (
          <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            <Users size={24} className={`mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
            <p>No members found</p>
          </div>
        ) : (
          <div className={`divide-y ${darkMode ? 'divide-slate-600' : 'divide-gray-100'}`}>
            {membersList.map(member => (
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
                {selectionMode === 'radio' ? (
                  <input
                    type="radio"
                    name="individual-member"
                    checked={individualRecipient === member.id}
                    onChange={() => setIndividualRecipient(member.id)}
                    className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600 ml-3 flex-shrink-0"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(member.id)}
                    onChange={() => toggleMemberSelection(member.id)}
                    className="h-4 w-4 rounded border-slate-600 text-cyan-600 focus:ring-cyan-500 ml-3 flex-shrink-0"
                  />
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {selectionMode === 'checkbox' && selectedMembers.length > 0 && (
        <div className={`mt-2 px-1 text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
          {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <Mail className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Send Meeting Invites</h2>
              {isCommitteeMeeting && (
                <p className="text-cyan-100 text-sm mt-0.5">Committee Meeting - invites restricted to committee members</p>
              )}
            </div>
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
                  <AlertTriangle className={`h-5 w-5 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
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
                  <Check className={`h-5 w-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
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
                {isCommitteeMeeting ? (
                  <>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        checked={recipientType === 'committee'}
                        onChange={() => setRecipientType('committee')}
                        className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                      />
                      <Shield size={18} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
                      <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        All Committee Members ({committeeMembers.length})
                      </span>
                    </label>

                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        checked={recipientType === 'selected'}
                        onChange={() => setRecipientType('selected')}
                        className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                      />
                      <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        Selected Committee Members ({selectedMembers.length})
                      </span>
                    </label>
                    {recipientType === 'selected' && renderMemberList(
                      committeeMembers.filter(m => {
                        const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
                        return fullName.includes(searchTerm.toLowerCase()) ||
                               (m.email && m.email.toLowerCase().includes(searchTerm.toLowerCase()));
                      }),
                      'checkbox'
                    )}

                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        checked={recipientType === 'individual'}
                        onChange={() => setRecipientType('individual')}
                        className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                      />
                      <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        Individual Committee Member
                      </span>
                    </label>
                    {recipientType === 'individual' && renderMemberList(
                      committeeMembers.filter(m => {
                        const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
                        return fullName.includes(searchTerm.toLowerCase()) ||
                               (m.email && m.email.toLowerCase().includes(searchTerm.toLowerCase()));
                      }),
                      'radio'
                    )}
                  </>
                ) : (
                  <>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        checked={recipientType === 'all'}
                        onChange={() => setRecipientType('all')}
                        className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                      />
                      <Users size={18} className={darkMode ? 'text-slate-400' : 'text-gray-500'} />
                      <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        {isAssociation ? 'All Association Members' : 'All Club Members'} ({members.length})
                      </span>
                    </label>

                    {committeeMembers.length > 0 && (
                      <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          checked={recipientType === 'committee'}
                          onChange={() => setRecipientType('committee')}
                          className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                        />
                        <Shield size={18} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
                        <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                          Committee Members ({committeeMembers.length})
                        </span>
                      </label>
                    )}

                    {isAssociation && clubs.length > 0 && (
                      <>
                        <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input
                            type="radio"
                            checked={recipientType === 'club'}
                            onChange={() => setRecipientType('club')}
                            className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                          />
                          <Building2 size={18} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                          <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                            Individual Club & Their Members
                          </span>
                        </label>
                        {recipientType === 'club' && (
                          <div className="mt-3 pl-3">
                            <select
                              value={selectedClubId}
                              onChange={(e) => setSelectedClubId(e.target.value)}
                              className={`w-full px-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-gray-900 border-gray-300'}`}
                            >
                              <option value="">Select a club...</option>
                              {clubs.map(club => (
                                <option key={club.id} value={club.id}>
                                  {club.name} ({club.members.length} members)
                                </option>
                              ))}
                            </select>
                            {selectedClubId && (
                              <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                                {clubs.find(c => c.id === selectedClubId)?.members.length || 0} members will receive invites
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        checked={recipientType === 'selected'}
                        onChange={() => setRecipientType('selected')}
                        className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                      />
                      <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        Selected Members ({selectedMembers.length})
                      </span>
                    </label>
                    {recipientType === 'selected' && renderMemberList(filteredMembers, 'checkbox')}

                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        checked={recipientType === 'individual'}
                        onChange={() => setRecipientType('individual')}
                        className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-600"
                      />
                      <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        Individual Member
                      </span>
                    </label>
                    {recipientType === 'individual' && renderMemberList(filteredMembers, 'radio')}
                  </>
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

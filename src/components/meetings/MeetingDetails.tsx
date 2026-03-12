import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, Video, FileText, User, ArrowLeft, Edit2, Mail, Check, X, AlertTriangle, Play, Lock, Share, Shield, Users, Repeat, Navigation, ExternalLink } from 'lucide-react';
import { Meeting, MeetingAgendaItem } from '../../types/meeting';
import { getMeetingAgenda, lockMeetingMinutes } from '../../utils/meetingStorage';
import { formatDate } from '../../utils/date';
import { useNavigate } from 'react-router-dom';
import { MeetingInviteModal } from './MeetingInviteModal';
import { ShareMinutesModal } from './ShareMinutesModal';
import { Avatar } from '../ui/Avatar';
import { supabase } from '../../utils/supabase';

interface MeetingDetailsProps {
  meeting: Meeting;
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
  onClose: () => void;
  onEdit: () => void;
  onMarkAsCompleted: () => void;
  onMarkAsCancelled: () => void;
}

export const MeetingDetails: React.FC<MeetingDetailsProps> = ({
  meeting,
  darkMode,
  associationId,
  associationType,
  onClose,
  onEdit,
  onMarkAsCompleted,
  onMarkAsCancelled
}) => {
  const navigate = useNavigate();
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showStatusConfirm, setShowStatusConfirm] = useState<'complete' | 'cancel' | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [attendance, setAttendance] = useState<{member: any, status: string}[]>([]);

  useEffect(() => {
    fetchAgendaItems();
    fetchAttendance();
  }, [meeting.id]);

  const fetchAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('meeting_attendance')
        .select(`
          status,
          member:members(id, first_name, last_name, avatar_url)
        `)
        .eq('meeting_id', meeting.id);

      if (error) throw error;

      setAttendance((data || [])
        .filter((a: any) => a.member)
        .map((a: any) => ({
          member: a.member,
          status: a.status
        })));
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const fetchAgendaItems = async () => {
    try {
      setLoading(true);
      const items = await getMeetingAgenda(meeting.id);
      setAgendaItems(items);
    } catch (err) {
      console.error('Error fetching agenda items:', err);
      setError('Failed to load agenda items');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmStatusChange = () => {
    if (showStatusConfirm === 'complete') {
      onMarkAsCompleted();
    } else if (showStatusConfirm === 'cancel') {
      onMarkAsCancelled();
    }
    setShowStatusConfirm(null);
  };

  const handleStartMeeting = async () => {
    // Store the attending members in session storage for the minute taking page to pre-select
    const attendingMemberIds = attendance
      .filter(a => a.status === 'attending' && a.member)
      .map(a => a.member.id);

    if (attendingMemberIds.length > 0) {
      sessionStorage.setItem(`meeting_${meeting.id}_attendees`, JSON.stringify(attendingMemberIds));
    }

    navigate(`/meetings/${meeting.id}/minutes`);
  };

  const handleLockMinutes = async () => {
    try {
      await lockMeetingMinutes(meeting.id);
      setSuccess('Minutes have been locked and can no longer be edited');
      setTimeout(() => {
        setSuccess(null);
        setShowLockConfirm(false);
      }, 2000);
    } catch (err) {
      console.error('Error locking minutes:', err);
      setError('Failed to lock minutes');
    }
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  const getAgendaItemTypeLabel = (type: string) => {
    switch (type) {
      case 'for_noting':
        return 'For Noting';
      case 'for_action':
        return 'For Action';
      case 'for_discussion':
        return 'For Discussion';
      default:
        return type;
    }
  };

  const getAgendaItemTypeClass = (type: string) => {
    switch (type) {
      case 'for_noting':
        return 'bg-blue-900/30 text-blue-400';
      case 'for_action':
        return 'bg-green-900/30 text-green-400';
      case 'for_discussion':
        return 'bg-purple-900/30 text-purple-400';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-700/70 border border-slate-700/50 hover:border-slate-600"
        >
          <ArrowLeft size={16} />
          Back to Meetings
        </button>

        <div className="flex flex-wrap gap-2 justify-end">
          {meeting.status === 'upcoming' && (
            <>
              {meeting.minutes_status !== 'in_progress' && (
                <button
                  onClick={onEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-all hover:scale-105"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
              )}

              {meeting.minutes_status !== 'in_progress' && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
                >
                  <Mail size={16} />
                  Send Invites
                </button>
              )}

              {meeting.minutes_status === 'in_progress' ? (
                <button
                  onClick={handleStartMeeting}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20"
                >
                  <Edit2 size={16} />
                  Continue Minutes
                </button>
              ) : (
                <button
                  onClick={handleStartMeeting}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20"
                >
                  <Play size={16} />
                  Start Meeting
                </button>
              )}

              <button
                onClick={() => setShowStatusConfirm('cancel')}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all hover:scale-105 hover:shadow-lg hover:shadow-red-500/20"
              >
                <X size={16} />
                Cancel
              </button>
            </>
          )}

          {meeting.status !== 'upcoming' && meeting.minutes_status === 'in_progress' && (
            <button
              onClick={handleStartMeeting}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20"
            >
              <Edit2 size={16} />
              Continue Minutes
            </button>
          )}

          {meeting.minutes_status === 'completed' && (
            <>
              <button
                onClick={handleStartMeeting}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
              >
                <FileText size={16} />
                View Minutes
              </button>

              {!meeting.minutes_locked && (
                <button
                  onClick={() => setShowLockConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-lg hover:from-amber-700 hover:to-amber-800 transition-all hover:scale-105 hover:shadow-lg hover:shadow-amber-500/20"
                >
                  <Lock size={16} />
                  Confirm & Lock
                </button>
              )}

              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20"
              >
                <Share size={16} />
                Share Minutes
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-300">{success}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
        <div className="relative p-8 bg-gradient-to-r from-blue-600/10 via-transparent to-emerald-600/10 border-b border-slate-700/50">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-emerald-500/5"></div>
          <div className="relative">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-white mb-3 leading-tight">{meeting.name}</h1>

                  {meeting.status !== 'upcoming' && (
                    <div className={`
                      inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-3
                      ${meeting.status === 'completed'
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'}
                    `}>
                      {meeting.status === 'completed' ? <Check size={14} /> : <X size={14} />}
                      {meeting.status === 'completed' ? 'Completed' : 'Cancelled'}
                    </div>
                  )}
                </div>

                {meeting.status === 'upcoming' && (
                  <div className="flex items-center gap-4">
                    {/* Attendance Avatars */}
                    {attendance.filter(a => a.status === 'attending' && a.member).length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {attendance
                            .filter(a => a.status === 'attending' && a.member)
                            .slice(0, 5)
                            .map((att, idx) => (
                              <div
                                key={idx}
                                className="relative w-9 h-9 rounded-full border-2 border-slate-800 bg-slate-700 overflow-hidden"
                                title={`${att.member?.first_name || ''} ${att.member?.last_name || ''}`}
                              >
                                {att.member?.avatar_url ? (
                                  <img
                                    src={att.member.avatar_url}
                                    alt={`${att.member.first_name} ${att.member.last_name}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-slate-300">
                                    {att.member?.first_name?.[0]}{att.member?.last_name?.[0]}
                                  </div>
                                )}
                              </div>
                            ))}
                          {attendance.filter(a => a.status === 'attending' && a.member).length > 5 && (
                            <div className="relative w-9 h-9 rounded-full border-2 border-slate-800 bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
                              +{attendance.filter(a => a.status === 'attending' && a.member).length - 5}
                            </div>
                          )}
                        </div>
                        <span className="text-sm text-slate-400 font-medium">
                          {attendance.filter(a => a.status === 'attending' && a.member).length} attending
                        </span>
                      </div>
                    )}

                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600/50">
                  <Calendar size={16} className="text-blue-400" />
                  <span className="text-slate-200 font-medium">{formatDate(meeting.date)}</span>
                </div>

                {meeting.start_time && meeting.end_time && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600/50">
                    <Clock size={16} className="text-emerald-400" />
                    <span className="text-slate-200 font-medium">{formatTime(meeting.start_time)} - {formatTime(meeting.end_time)}</span>
                  </div>
                )}

                {(meeting as any).meeting_type && (
                  <div className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border font-medium
                    ${(meeting as any).meeting_type === 'online' ? 'bg-blue-500/20 border-blue-400/50 text-blue-300' :
                      (meeting as any).meeting_type === 'hybrid' ? 'bg-purple-500/20 border-purple-400/50 text-purple-300' :
                      'bg-slate-700/50 border-slate-600/50 text-slate-200'}
                  `}>
                    {(meeting as any).meeting_type === 'online' ? (
                      <>
                        <Video size={16} />
                        <span>Online Meeting</span>
                      </>
                    ) : (meeting as any).meeting_type === 'hybrid' ? (
                      <>
                        <MapPin size={14} />
                        <Video size={14} />
                        <span>Hybrid Meeting</span>
                      </>
                    ) : (
                      <>
                        <MapPin size={16} />
                        <span>In Person</span>
                      </>
                    )}
                  </div>
                )}

                {meeting.location && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded-lg border border-slate-600/50">
                    <MapPin size={16} className="text-amber-400 flex-shrink-0" />
                    <span className="text-slate-200 font-medium">{meeting.location}</span>
                    {(meeting as any).location_lat && (meeting as any).location_lng && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${(meeting as any).location_lat},${(meeting as any).location_lng}${(meeting as any).location_place_id ? `&destination_place_id=${(meeting as any).location_place_id}` : ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-xs font-medium transition-colors flex-shrink-0"
                      >
                        <Navigation size={12} />
                        Directions
                      </a>
                    )}
                  </div>
                )}

                {meeting.meeting_category && (
                  <div className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border font-medium
                    ${meeting.meeting_category === 'committee'
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                      : 'bg-blue-500/20 border-blue-400/50 text-blue-300'}
                  `}>
                    {meeting.meeting_category === 'committee' ? <Shield size={16} /> : <Users size={16} />}
                    <span>{meeting.meeting_category === 'committee' ? 'Committee Meeting' : 'General Meeting'}</span>
                  </div>
                )}

                {meeting.recurrence_type && meeting.recurrence_type !== 'none' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-teal-500/20 rounded-lg border border-teal-400/50 text-teal-300 font-medium">
                    <Repeat size={16} />
                    <span>{meeting.recurrence_type.charAt(0).toUpperCase() + meeting.recurrence_type.slice(1)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {meeting.description && (
              <div className="p-5 rounded-xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 border border-slate-600/50 hover:border-slate-500/50 transition-all hover:shadow-lg col-span-full">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/20">
                    <FileText size={16} className="text-blue-400" />
                  </div>
                  Description
                </h3>
                <p className="text-slate-200 whitespace-pre-line leading-relaxed">{meeting.description}</p>
              </div>
            )}

            {meeting.chairperson && (
              <div className="p-5 rounded-xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 border border-slate-600/50 hover:border-slate-500/50 transition-all hover:shadow-lg">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20">
                    <User size={16} className="text-emerald-400" />
                  </div>
                  Chairperson
                </h3>
                <div className="flex items-center gap-3">
                  <Avatar
                    firstName={meeting.chairperson.first_name}
                    lastName={meeting.chairperson.last_name}
                    imageUrl={meeting.chairperson.avatar_url}
                    size="lg"
                  />
                  <p className="text-white font-medium text-lg">
                    {meeting.chairperson.first_name} {meeting.chairperson.last_name}
                  </p>
                </div>
              </div>
            )}

            {meeting.minute_taker && (
              <div className="p-5 rounded-xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 border border-slate-600/50 hover:border-slate-500/50 transition-all hover:shadow-lg">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20">
                    <User size={16} className="text-amber-400" />
                  </div>
                  Minute Taker
                </h3>
                <div className="flex items-center gap-3">
                  <Avatar
                    firstName={meeting.minute_taker.first_name}
                    lastName={meeting.minute_taker.last_name}
                    imageUrl={meeting.minute_taker.avatar_url}
                    size="lg"
                  />
                  <p className="text-white font-medium text-lg">
                    {meeting.minute_taker.first_name} {meeting.minute_taker.last_name}
                  </p>
                </div>
              </div>
            )}

            {meeting.conferencing_url && (
              <div className="p-5 rounded-xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 border border-slate-600/50 hover:border-slate-500/50 transition-all hover:shadow-lg col-span-full">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/20">
                    <Video size={16} className="text-blue-400" />
                  </div>
                  Video Conference
                </h3>
                <a
                  href={meeting.conferencing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 hover:text-blue-200 font-medium transition-colors"
                >
                  <Video size={16} />
                  Join Meeting
                  <ExternalLink size={14} />
                </a>
                <p className="mt-2 text-xs text-slate-400 break-all">{meeting.conferencing_url}</p>
              </div>
            )}

            {(meeting as any).location_lat && (meeting as any).location_lng && (
              <div className="p-5 rounded-xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 border border-slate-600/50 hover:border-slate-500/50 transition-all hover:shadow-lg col-span-full">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20">
                    <MapPin size={16} className="text-emerald-400" />
                  </div>
                  Venue Location
                </h3>
                <div className="rounded-lg overflow-hidden border border-slate-600/50 mb-3">
                  <iframe
                    src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${(meeting as any).location_lat},${(meeting as any).location_lng}&zoom=15`}
                    width="100%"
                    height="250"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${(meeting as any).location_lat},${(meeting as any).location_lng}${(meeting as any).location_place_id ? `&destination_place_id=${(meeting as any).location_place_id}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 hover:text-emerald-200 font-medium transition-colors"
                >
                  <Navigation size={16} />
                  Get Directions
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>
          
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-emerald-500 rounded-full"></div>
              Agenda
            </h3>

            {loading ? (
              <div className="text-center py-12 bg-slate-700/20 rounded-xl border border-slate-600/30">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                <p className="text-slate-400 font-medium">Loading agenda...</p>
              </div>
            ) : agendaItems.length === 0 ? (
              <div className="text-center py-12 bg-slate-700/20 rounded-xl border border-slate-600/30">
                <FileText size={48} className="mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400 font-medium">No agenda items added yet</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-600/50 shadow-lg">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-700/80 to-slate-800/80 border-b border-slate-600/50">
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-20">No.</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Item</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Owner</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-300 uppercase tracking-wider">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="bg-slate-800/40 divide-y divide-slate-700/50">
                    {agendaItems.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-700/50 text-slate-200 font-semibold text-sm">
                            {item.item_number}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-white font-medium">{item.item_name}</td>
                        <td className="px-6 py-4">
                          {item.owner ? (
                            <div className="flex items-center gap-2">
                              <Avatar
                                firstName={item.owner.first_name}
                                lastName={item.owner.last_name}
                                imageUrl={item.owner.avatar_url}
                                size="sm"
                              />
                              <span className="text-slate-300">
                                {item.owner.first_name} {item.owner.last_name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${getAgendaItemTypeClass(item.type)} border border-current/20`}>
                            {getAgendaItemTypeLabel(item.type)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-300 font-medium">
                          {item.duration ? `${item.duration} min` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          {meeting.minutes_status === 'completed' && (
            <div className="mt-8">
              <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <div className="w-1 h-8 bg-gradient-to-b from-emerald-500 to-blue-500 rounded-full"></div>
                Meeting Minutes
              </h3>

              <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-900/20 to-blue-900/20 border border-emerald-500/30">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                    <FileText size={24} className="text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-200 font-medium mb-2">
                      Minutes have been recorded for this meeting. Click the button above to view the full minutes.
                    </p>
                    {meeting.minutes_locked && (
                      <div className="mt-3 flex items-center gap-2 text-amber-400 bg-amber-900/20 px-4 py-2 rounded-lg border border-amber-500/30">
                        <Lock size={16} />
                        <span className="font-medium">These minutes have been locked and can no longer be edited.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Change Confirmation Modal */}
      {showStatusConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              {showStatusConfirm === 'complete' ? 'Mark as Completed' : 'Mark as Cancelled'}
            </h3>
            <p className="text-slate-300 mb-6">
              {showStatusConfirm === 'complete'
                ? 'Are you sure you want to mark this meeting as completed?'
                : 'Are you sure you want to mark this meeting as cancelled?'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowStatusConfirm(null)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStatusChange}
                className={`px-4 py-2 rounded-lg text-white transition-colors ${
                  showStatusConfirm === 'complete' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock Minutes Confirmation Modal */}
      {showLockConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              Confirm & Lock Minutes
            </h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to lock these minutes? Once locked, they can no longer be edited.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLockConfirm(false)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLockMinutes}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                Lock Minutes
              </button>
            </div>
          </div>
        </div>
      )}

      <MeetingInviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        meetingId={meeting.id}
        meetingName={meeting.name}
        clubId={meeting.club_id || undefined}
        darkMode={darkMode}
        meetingCategory={meeting.meeting_category}
        associationId={meeting.state_association_id || meeting.national_association_id || associationId}
        associationType={meeting.state_association_id ? 'state' : meeting.national_association_id ? 'national' : associationType}
      />

      <ShareMinutesModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        meeting={meeting}
        associationId={meeting.state_association_id || meeting.national_association_id || associationId || undefined}
        associationType={meeting.state_association_id ? 'state' : meeting.national_association_id ? 'national' : associationType}
        agendaItems={agendaItems}
        clubId={meeting.club_id || undefined}
        darkMode={darkMode}
        meetingCategory={meeting.meeting_category}
      />
    </div>
  );
};
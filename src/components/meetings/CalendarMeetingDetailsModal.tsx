import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Users, Shield, ThumbsUp, ThumbsDown, HelpCircle, Video, FileText, Lock, CheckCircle, Building2, Globe2, Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Meeting, MeetingAgendaItem } from '../../types/meeting';
import { CalendarMeeting } from '../../utils/calendarMeetingStorage';
import { getMeetingAgenda, updateMeetingRsvp, getMeetingRsvpStatus, getMeetingAttendees } from '../../utils/meetingStorage';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../ui/Avatar';

interface CalendarMeetingDetailsModalProps {
  meeting: CalendarMeeting;
  darkMode: boolean;
  onClose: () => void;
}

const organizationLevelConfig = {
  club: { label: 'Club Meeting', icon: Building2, color: 'blue' },
  state_association: { label: 'State Association', icon: Globe2, color: 'emerald' },
  national_association: { label: 'National Association', icon: Globe2, color: 'amber' },
};

const categoryConfig = {
  general: { label: 'General Meeting', icon: Users, color: 'blue' },
  committee: { label: 'Committee Meeting', icon: Shield, color: 'amber' },
};

export const CalendarMeetingDetailsModal: React.FC<CalendarMeetingDetailsModalProps> = ({
  meeting,
  darkMode,
  onClose
}) => {
  const { user } = useAuth();
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaItem[]>([]);
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<{ user_id: string; status: string; name: string; avatar_url?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingRsvp, setUpdatingRsvp] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [showMinutes, setShowMinutes] = useState(false);
  const [showAttendees, setShowAttendees] = useState(false);

  useEffect(() => {
    loadData();
  }, [meeting.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [agenda, status, attendeesList] = await Promise.all([
        getMeetingAgenda(meeting.id),
        user?.id ? getMeetingRsvpStatus(meeting.id, user.id) : Promise.resolve(null),
        getMeetingAttendees(meeting.id),
      ]);
      setAgendaItems(agenda);
      setRsvpStatus(status);
      setAttendees(attendeesList);
    } catch (err) {
      console.error('Error loading meeting data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRsvp = async (status: 'attending' | 'not_attending' | 'pending') => {
    if (!user?.id || updatingRsvp) return;
    try {
      setUpdatingRsvp(true);
      await updateMeetingRsvp(meeting.id, user.id, status);
      setRsvpStatus(status);
      const updatedAttendees = await getMeetingAttendees(meeting.id);
      setAttendees(updatedAttendees);
    } catch (err) {
      console.error('Error updating RSVP:', err);
    } finally {
      setUpdatingRsvp(false);
    }
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    try {
      const [h, m] = time.split(':');
      const date = new Date(2000, 0, 1, parseInt(h), parseInt(m));
      return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return time;
    }
  };

  const formatMeetingDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const orgConfig = organizationLevelConfig[meeting.organizationLevel];
  const catConfig = categoryConfig[meeting.meeting_category || 'general'];
  const OrgIcon = orgConfig.icon;
  const CatIcon = catConfig.icon;
  const attendingCount = attendees.filter(a => a.status === 'attending').length;
  const isUpcoming = meeting.status === 'upcoming';
  const hasMinutes = meeting.minutes_status === 'completed';
  const minutesLocked = meeting.minutes_locked;

  const agendaItemTypeColors: Record<string, { bg: string; text: string }> = {
    for_noting: { bg: 'bg-sky-500/20', text: 'text-sky-300' },
    for_action: { bg: 'bg-rose-500/20', text: 'text-rose-300' },
    for_discussion: { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  };

  const agendaItemTypeLabels: Record<string, string> = {
    for_noting: 'Noting',
    for_action: 'Action',
    for_discussion: 'Discussion',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-700/50"
        onClick={e => e.stopPropagation()}
      >
        <div className={`relative overflow-hidden`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${
            meeting.organizationLevel === 'national_association'
              ? 'from-amber-600/30 to-amber-800/20'
              : meeting.organizationLevel === 'state_association'
                ? 'from-emerald-600/30 to-emerald-800/20'
                : 'from-blue-600/30 to-blue-800/20'
          }`} />
          <div className="relative px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    meeting.organizationLevel === 'national_association'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : meeting.organizationLevel === 'state_association'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}>
                    <OrgIcon size={12} />
                    {meeting.organization_name || orgConfig.label}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    meeting.meeting_category === 'committee'
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                  }`}>
                    <CatIcon size={12} />
                    {catConfig.label}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white truncate">{meeting.name}</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all flex-shrink-0 ml-2"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-400" size={24} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Calendar size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Date</p>
                    <p className="text-sm font-medium text-white">{formatMeetingDate(meeting.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Clock size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Time</p>
                    <p className="text-sm font-medium text-white">
                      {formatTime(meeting.start_time)}
                      {meeting.end_time && ` - ${formatTime(meeting.end_time)}`}
                    </p>
                  </div>
                </div>
                {meeting.location && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <MapPin size={16} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Location</p>
                      <p className="text-sm font-medium text-white">{meeting.location}</p>
                    </div>
                  </div>
                )}
                {meeting.meeting_type && meeting.meeting_type !== 'in_person' && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Video size={16} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Format</p>
                      <p className="text-sm font-medium text-white capitalize">{meeting.meeting_type.replace('_', ' ')}</p>
                    </div>
                  </div>
                )}
              </div>

              {meeting.conferencing_url && (
                <a
                  href={meeting.conferencing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-all text-sm font-medium"
                >
                  <Video size={16} />
                  Join Online Meeting
                  <ExternalLink size={14} className="ml-auto" />
                </a>
              )}

              {meeting.description && (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <p className="text-sm text-slate-300 leading-relaxed">{meeting.description}</p>
                </div>
              )}

              {(meeting.chairperson || meeting.minute_taker) && (
                <div className="flex flex-wrap gap-4">
                  {meeting.chairperson && (
                    <div className="flex items-center gap-2">
                      <Avatar
                        firstName={meeting.chairperson.first_name}
                        lastName={meeting.chairperson.last_name}
                        imageUrl={meeting.chairperson.avatar_url}
                        size="sm"
                      />
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Chair</p>
                        <p className="text-xs font-medium text-white">{meeting.chairperson.first_name} {meeting.chairperson.last_name}</p>
                      </div>
                    </div>
                  )}
                  {meeting.minute_taker && (
                    <div className="flex items-center gap-2">
                      <Avatar
                        firstName={meeting.minute_taker.first_name}
                        lastName={meeting.minute_taker.last_name}
                        imageUrl={meeting.minute_taker.avatar_url}
                        size="sm"
                      />
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Minute Taker</p>
                        <p className="text-xs font-medium text-white">{meeting.minute_taker.first_name} {meeting.minute_taker.last_name}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isUpcoming && (
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <p className="text-sm font-medium text-slate-300 mb-3">Will you attend?</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleRsvp('attending')}
                      disabled={updatingRsvp}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        rsvpStatus === 'attending'
                          ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                          : 'bg-slate-700 text-slate-300 hover:bg-green-600/20 hover:text-green-300 border border-slate-600'
                      }`}
                    >
                      <ThumbsUp size={16} />
                      Attending
                    </button>
                    <button
                      onClick={() => handleRsvp('pending')}
                      disabled={updatingRsvp}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        rsvpStatus === 'pending'
                          ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                          : 'bg-slate-700 text-slate-300 hover:bg-amber-600/20 hover:text-amber-300 border border-slate-600'
                      }`}
                    >
                      <HelpCircle size={16} />
                      Maybe
                    </button>
                    <button
                      onClick={() => handleRsvp('not_attending')}
                      disabled={updatingRsvp}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        rsvpStatus === 'not_attending'
                          ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                          : 'bg-slate-700 text-slate-300 hover:bg-red-600/20 hover:text-red-300 border border-slate-600'
                      }`}
                    >
                      <ThumbsDown size={16} />
                      Not Going
                    </button>
                  </div>
                  {updatingRsvp && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                      <Loader2 size={12} className="animate-spin" />
                      Updating...
                    </div>
                  )}
                </div>
              )}

              {attendees.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowAttendees(!showAttendees)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full"
                  >
                    <Users size={16} className="text-blue-400" />
                    <span>{attendingCount} attending</span>
                    <span className="text-slate-500">/ {attendees.length} responded</span>
                    {showAttendees ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                  </button>
                  {showAttendees && (
                    <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                      {attendees.map(att => (
                        <div key={att.user_id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/40">
                          <Avatar
                            firstName={att.name.split(' ')[0] || ''}
                            lastName={att.name.split(' ').slice(1).join(' ') || ''}
                            imageUrl={att.avatar_url}
                            size="sm"
                          />
                          <span className="text-sm text-white flex-1">{att.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            att.status === 'attending'
                              ? 'bg-green-500/20 text-green-300'
                              : att.status === 'not_attending'
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {att.status === 'attending' ? 'Going' : att.status === 'not_attending' ? 'Not Going' : 'Maybe'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {agendaItems.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowAgenda(!showAgenda)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full"
                  >
                    <FileText size={16} className="text-blue-400" />
                    <span>Agenda ({agendaItems.length} items)</span>
                    {showAgenda ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                  </button>
                  {showAgenda && (
                    <div className="mt-2 space-y-2">
                      {agendaItems.map(item => {
                        const typeStyle = agendaItemTypeColors[item.type] || agendaItemTypeColors.for_discussion;
                        return (
                          <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                              {item.item_number}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white">{item.item_name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
                                  {agendaItemTypeLabels[item.type] || item.type}
                                </span>
                                {item.owner && (
                                  <span className="text-xs text-slate-400">
                                    {item.owner.first_name} {item.owner.last_name}
                                  </span>
                                )}
                                {item.duration && (
                                  <span className="text-xs text-slate-500">{item.duration}min</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {hasMinutes && (
                <div>
                  <button
                    onClick={() => setShowMinutes(!showMinutes)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors w-full"
                  >
                    <FileText size={16} className="text-emerald-400" />
                    <span>Meeting Minutes</span>
                    {minutesLocked && <Lock size={12} className="text-amber-400" />}
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle size={12} />
                      Published
                    </span>
                    {showMinutes ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                  </button>
                  {showMinutes && (
                    <div className="mt-2 space-y-3">
                      {meeting.members_present && meeting.members_present.length > 0 && (
                        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                          <p className="text-xs font-medium text-slate-400 mb-1">Members Present</p>
                          <p className="text-sm text-slate-300">{meeting.members_present.map(m => m.name).join(', ')}</p>
                        </div>
                      )}
                      {agendaItems.filter(item => item.minutes_content).map(item => (
                        <div key={item.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                          <p className="text-xs font-medium text-slate-400 mb-1">
                            {item.item_number}. {item.item_name}
                          </p>
                          <div
                            className="text-sm text-slate-300 prose prose-sm prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: item.minutes_content || '' }}
                          />
                          {item.minutes_decision && (
                            <div className="mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                              <p className="text-[10px] font-medium text-blue-400 uppercase">Decision</p>
                              <p className="text-sm text-blue-200">{item.minutes_decision}</p>
                            </div>
                          )}
                          {item.minutes_tasks && (
                            <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                              <p className="text-[10px] font-medium text-amber-400 uppercase">Action Items</p>
                              <p className="text-sm text-amber-200">{item.minutes_tasks}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!isUpcoming && !hasMinutes && (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 text-center">
                  <p className="text-sm text-slate-400">Minutes have not yet been published for this meeting.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-medium text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

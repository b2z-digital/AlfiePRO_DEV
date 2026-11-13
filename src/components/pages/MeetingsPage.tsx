import React, { useState, useEffect } from 'react';
import { Calendar, CalendarCheck, CalendarClock, CalendarPlus, Plus, Search, MapPin, Clock, Users, SquarePen as Edit2, Trash2, ChevronRight, TriangleAlert as AlertTriangle, Check, Shield, Repeat, Video, FileText, X } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
import { useAuth } from '../../contexts/AuthContext';
import { Meeting } from '../../types/meeting';
import { getMeetings, deleteMeeting, updateMeetingStatus, duplicateMeeting } from '../../utils/meetingStorage';
import { MeetingForm } from '../meetings/MeetingForm';
import { MeetingDetails } from '../meetings/MeetingDetails';
import { useNotifications } from '../../contexts/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../utils/supabase';

interface MeetingsPageProps {
  darkMode: boolean;
}

export const MeetingsPage: React.FC<MeetingsPageProps> = ({ darkMode }) => {
  const { currentClub, currentOrganization } = useAuth();
  const { can } = usePermissions();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'upcoming' | 'past'>('overview');
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { addNotification } = useNotifications();
  const [showSearch, setShowSearch] = useState(false);
  const [meetingAttendance, setMeetingAttendance] = useState<Record<string, {member: any, status: string}[]>>({});

  useEffect(() => {
    const orgId = currentOrganization?.id || currentClub?.clubId;
    if (orgId) {
      fetchMeetings();
    } else {
      setLoading(false);
    }
  }, [currentClub, currentOrganization]);

  const fetchAttendanceForMeetings = async (meetingsToFetch: Meeting[]) => {
    try {
      const meetingIds = meetingsToFetch.map(m => m.id);

      const { data, error } = await supabase
        .from('meeting_attendance')
        .select(`
          meeting_id,
          status,
          member:members(id, first_name, last_name, avatar_url)
        `)
        .in('meeting_id', meetingIds);

      if (error) throw error;

      // Group attendance by meeting_id
      const attendanceByMeeting: Record<string, {member: any, status: string}[]> = {};
      data?.forEach((attendance: any) => {
        if (!attendance.member) return;
        if (!attendanceByMeeting[attendance.meeting_id]) {
          attendanceByMeeting[attendance.meeting_id] = [];
        }
        attendanceByMeeting[attendance.meeting_id].push({
          member: attendance.member,
          status: attendance.status
        });
      });

      setMeetingAttendance(attendanceByMeeting);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      setError(null);

      const isAssociation = !!currentOrganization;
      const clubId = isAssociation ? undefined : currentClub?.clubId;
      const associationId = currentOrganization?.id;
      const associationType = currentOrganization?.type;

      // Add timeout to detect stuck requests
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 10000); // 10 second timeout
      });

      const fetchPromise = getMeetings(
        clubId,
        isAssociation ? associationId : undefined,
        isAssociation ? associationType : undefined
      );

      const fetchedMeetings = await Promise.race([fetchPromise, timeoutPromise]) as Meeting[];
      setMeetings(fetchedMeetings);

      // Fetch attendance for all meetings
      if (fetchedMeetings.length > 0) {
        await fetchAttendanceForMeetings(fetchedMeetings);
      }
      return fetchedMeetings;
    } catch (err) {
      console.error('Error fetching meetings:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load meetings';

      // If timeout or connection error, offer to reload
      if (errorMessage.includes('timeout') || errorMessage.includes('Failed to fetch')) {
        setError('Connection issue detected. The page will reload automatically...');
        // Auto-reload after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMeeting = () => {
    setEditingMeeting(null);
    setShowForm(true);
  };

  const handleEditMeeting = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setShowForm(true);
  };

  const handleViewMeeting = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
  };

  const handleDeleteClick = (meeting: Meeting) => {
    setMeetingToDelete(meeting);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!meetingToDelete) return;
    
    try {
      setDeleting(true);
      await deleteMeeting(meetingToDelete.id);
      // Deleting the first meeting of a repeating series removes the rest of the series with it
      setMeetings(meetings.filter(m => m.id !== meetingToDelete.id && m.recurrence_parent_id !== meetingToDelete.id));
      if (selectedMeeting?.id === meetingToDelete.id) setSelectedMeeting(null);
      setShowDeleteConfirm(false);
      setMeetingToDelete(null);
      addNotification('success', 'Meeting deleted');
    } catch (err) {
      console.error('Error deleting meeting:', err);
      setShowDeleteConfirm(false);
      addNotification('error', err instanceof Error ? err.message : 'Failed to delete meeting');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSuccess = async () => {
    const editedId = editingMeeting?.id;
    addNotification('success', editedId ? 'Meeting updated successfully' : 'Meeting created successfully');
    const fresh = await fetchMeetings();
    const updated = editedId ? fresh?.find(m => m.id === editedId) : undefined;
    setSelectedMeeting(updated || null);
    setDetailsVersion(v => v + 1);
    setEditingMeeting(null);
    setShowForm(false);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingMeeting(null);
  };

  const handleCloseDetails = () => {
    setSelectedMeeting(null);
  };

  const handleMarkAsCompleted = async (meetingId: string) => {
    try {
      await updateMeetingStatus(meetingId, 'completed');
      await fetchMeetings();
      setSuccess('Meeting marked as completed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating meeting status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update meeting status');
    }
  };

  const handleMarkAsCancelled = async (meetingId: string) => {
    try {
      await updateMeetingStatus(meetingId, 'cancelled');
      await fetchMeetings();
      setSuccess('Meeting marked as cancelled');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating meeting status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update meeting status');
    }
  };

  const handleDuplicateMeeting = async (meetingId: string) => {
    try {
      const newMeeting = await duplicateMeeting(meetingId);
      await fetchMeetings();
      setSelectedMeeting(null);
      setEditingMeeting(newMeeting);
      setShowForm(true);
      addNotification('success', 'Meeting duplicated! Edit the details below to finalise.');
    } catch (err) {
      console.error('Error duplicating meeting:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to duplicate meeting');
    }
  };

  const todayStart = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const dayOf = (m: Meeting) => { const d = new Date(m.date); d.setHours(0, 0, 0, 0); return d; };
  const isPastMeeting = (m: Meeting) => dayOf(m) < todayStart || m.status === 'completed' || m.status === 'cancelled';
  const byDateAsc = (a: Meeting, b: Meeting) => dayOf(a).getTime() - dayOf(b).getTime() || (a.start_time || '').localeCompare(b.start_time || '');
  const term = searchTerm.trim().toLowerCase();
  const matches = (m: Meeting) => !term ||
    m.name.toLowerCase().includes(term) ||
    (m.location || '').toLowerCase().includes(term) ||
    (m.description || '').toLowerCase().includes(term);

  const upcomingMeetings = meetings.filter(m => !isPastMeeting(m)).sort(byDateAsc);
  const pastMeetings = meetings.filter(m => isPastMeeting(m)).sort((a, b) => byDateAsc(b, a));

  // The list shown on the Upcoming / Past tabs (search looks across everything)
  const filteredMeetings = term
    ? meetings.filter(matches).sort((a, b) => byDateAsc(b, a))
    : activeView === 'past' ? pastMeetings : upcomingMeetings;

  // Group meetings by month and year (keeps the list's order)
  const groupedMeetings = filteredMeetings.reduce((acc, meeting) => {
    const date = new Date(meeting.date);
    const monthYear = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(meeting);
    return acc;
  }, {} as Record<string, Meeting[]>);

  // If showing form or meeting details, render those instead
  if (showForm) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
          <MeetingForm
          clubId={currentOrganization ? undefined : currentClub?.clubId}
          associationId={currentOrganization?.id}
          associationType={currentOrganization?.type}
          meeting={editingMeeting}
          darkMode={darkMode}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
        </div>
      </div>
    );
  }

  const deleteModal = showDeleteConfirm && meetingToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="a-sheet max-w-md w-full" style={{ padding: 24 }}>
              <h3 className="a-display a-ink text-[20px] font-semibold mb-2 flex items-center gap-2"><AlertTriangle size={20} style={{ color: '#FF8A8A' }} />Delete this meeting?</h3>
              <p className="a-mute text-[14px] mb-3">
                “{meetingToDelete.name}” will be deleted for everyone, along with its agenda{meetingToDelete.minutes_status && meetingToDelete.minutes_status !== 'not_started' ? ', the minutes that were taken' : ''} and who attended. This can’t be undone.
              </p>
              {(() => {
                const rest = meetings.filter(m => m.recurrence_parent_id === meetingToDelete.id).length;
                return rest > 0 ? (
                  <p className="text-[14px] mb-3" style={{ color: '#FF8A8A' }}>
                    This is the first meeting of a repeating series. The {rest} other meeting{rest === 1 ? '' : 's'} in the series will be deleted too.
                  </p>
                ) : null;
              })()}
              <p className="a-dim text-[13px] mb-6">Tasks created from this meeting are kept.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="a-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="a-btn a-btn-d"
                >
                  <Trash2 size={16} />{deleting ? 'Deleting…' : 'Delete meeting'}
                </button>
              </div>
            </div>
          </div>
        );

  if (selectedMeeting) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
          <MeetingDetails
          key={`${selectedMeeting.id}-${detailsVersion}`}
          meeting={selectedMeeting}
          darkMode={darkMode}
          associationId={currentOrganization?.id}
          associationType={currentOrganization?.type as 'state' | 'national' | undefined}
          onClose={handleCloseDetails}
          onEdit={() => handleEditMeeting(selectedMeeting)}
          onDuplicate={() => handleDuplicateMeeting(selectedMeeting.id)}
          onDelete={can('meetings.create') ? () => handleDeleteClick(selectedMeeting) : undefined}
          onMarkAsCompleted={() => handleMarkAsCompleted(selectedMeeting.id)}
          onMarkAsCancelled={() => handleMarkAsCancelled(selectedMeeting.id)}
        />
        </div>
        {deleteModal}
      </div>
    );
  }

  const upcomingCount = upcomingMeetings.length;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // rim: the Alfie outline (only on the last-meeting card); otherwise teal for upcoming, plain for past
  const dateChip = (m: Meeting, big?: boolean, rim?: boolean) => {
    const d = new Date(m.date);
    return (
      <div className={`a-dc ${rim ? '' : isPastMeeting(m) ? 'a-dc-past' : 'a-dc-meet'}`} style={big ? { width: 64, padding: '9px 0' } : undefined}>
        <b>{MON[d.getMonth()]}</b>
        <span style={big ? { fontSize: 26 } : undefined}>{d.getDate()}</span>
        <i>{DOW[d.getDay()]}</i>
      </div>
    );
  };
  const timeOf = (m: Meeting) => (m.start_time && m.end_time ? `${m.start_time.substring(0, 5)} – ${m.end_time.substring(0, 5)}` : m.start_time ? m.start_time.substring(0, 5) : 'Time not set');
  const catChip = (m: Meeting) => m.meeting_category && (
    <span className="a-lb-fmt"><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: m.meeting_category === 'committee' ? '#FFB340' : '#2E7BFF' }} />{m.meeting_category === 'committee' ? 'Committee' : 'General'}</span>
  );
  const recurLabel = (r?: string) => r === 'monthly_nth' ? 'Repeats monthly' : r === 'fortnightly' ? 'Repeats fortnightly' : `Repeats ${r}`;
  const attendingOf = (id: string) => (meetingAttendance[id] || []).filter(a => a.status === 'attending');
  const daysFrom = (m: Meeting) => Math.round((dayOf(m).getTime() - todayStart.getTime()) / 86400000);
  const whenLabel = (m: Meeting) => {
    const n = daysFrom(m);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
  };
  // Status shown on a meeting row: cancelled, or for held meetings where the minutes are up to
  const statusChip = (m: Meeting) => {
    if (m.status === 'cancelled') return <span className="a-st text-[12.5px]"><span className="a-light a-light-r" />Cancelled</span>;
    if (!isPastMeeting(m)) return null;
    if (m.minutes_status === 'completed') return <span className="a-st a-txt-g text-[12.5px]"><span className="a-light a-light-g" />Minutes done</span>;
    if (m.minutes_status === 'in_progress') return <span className="a-st a-txt-a text-[12.5px]"><span className="a-light a-light-a" />Minutes in progress</span>;
    return <span className="a-st a-txt-a text-[12.5px]"><span className="a-ring-dot a-ring-dot-a" />Minutes to write</span>;
  };
  const faces = (id: string, size = 28) => {
    const att = attendingOf(id);
    if (!att.length) return null;
    return (
      <div className="max-md:hidden flex items-center gap-2" title={`${att.length} attending`}>
        <span className="inline-flex">
          {att.slice(0, 4).map((a, idx) => (
            <span key={idx} style={{ marginLeft: idx ? -8 : 0 }} className="a-av-ring inline-flex rounded-full">
              <AAvatar url={a.member?.avatar_url} first={a.member?.first_name} last={a.member?.last_name} size={size} />
            </span>
          ))}
        </span>
        <span className="a-dim text-[12px]">{att.length} attending</span>
      </div>
    );
  };
  const meetingRow = (meeting: Meeting, compact = false) => {
    const editable = !isPastMeeting(meeting) && meeting.status === 'upcoming';
    return (
      <div key={meeting.id} onClick={() => handleViewMeeting(meeting)} className="a-mr group" role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleViewMeeting(meeting); }}>
        {dateChip(meeting)}
        {!compact && <span className="a-tile a-tile-plain" style={{ width: 40, height: 40 }}>{meeting.meeting_category === 'committee' ? <Shield size={18} /> : <Users size={18} />}</span>}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="a-ink text-[15px] font-semibold truncate">{meeting.name}</div>
          <div className="flex gap-x-3.5 gap-y-1 items-center flex-wrap">
            <span className="a-meta" style={{ fontSize: 13 }}><Clock size={14} />{timeOf(meeting)}</span>
            {!compact && meeting.location && <span className="a-meta" style={{ fontSize: 13 }}><MapPin size={14} />{meeting.location}</span>}
            {catChip(meeting)}
            {!compact && meeting.recurrence_type && meeting.recurrence_type !== 'none' && (
              <span className="a-lb-fmt"><Repeat size={12} />{recurLabel(meeting.recurrence_type)}</span>
            )}
            {statusChip(meeting)}
          </div>
        </div>
        {!compact && faces(meeting.id)}
        {!compact && can('meetings.create') && (
          <>
            {editable && (
              <button onClick={(e) => { e.stopPropagation(); handleEditMeeting(meeting); }} className="a-ib" aria-label="Edit meeting" title="Edit meeting">
                <Edit2 size={17} />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(meeting); }} className="a-ib a-ib-d" aria-label="Delete meeting" title="Delete meeting">
              <Trash2 size={17} />
            </button>
          </>
        )}
        <ChevronRight size={17} className="a-dim flex-shrink-0" />
      </div>
    );
  };

  // Overview figures
  const year = new Date().getFullYear();
  const heldThisYear = pastMeetings.filter(m => m.status !== 'cancelled' && dayOf(m).getFullYear() === year);
  const minutesOutstanding = pastMeetings.filter(m => m.status !== 'cancelled' && m.minutes_status !== 'completed');
  const nextMeeting = upcomingMeetings[0];
  const lastHeld = pastMeetings.find(m => m.status !== 'cancelled');
  // Minutes card: the most recent held meeting still needing minutes (last 90 days), otherwise the last meeting
  const minutesDue = minutesOutstanding.find(m => daysFrom(m) >= -90);
  const followUp = minutesDue || lastHeld;
  const showOverview = activeView === 'overview' && !term;

  const sectionHead = (title: string, sub: string, view: 'upcoming' | 'past', count: number) => (
    <div className="flex items-center gap-3" style={{ padding: '16px 16px 10px' }}>
      <div className="flex-1 min-w-0">
        <h2 className="a-display a-ink m-0 text-[18px] font-semibold">{title}</h2>
        <p className="a-dim m-0 mt-0.5 text-[12.5px]">{sub}</p>
      </div>
      {count > 0 && <button className="a-btn a-btn-sm a-btn-q" onClick={() => setActiveView(view)}>View all<ChevronRight size={14} /></button>}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex flex-wrap items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Calendar size={24} /></span>
          <div className="flex-1 min-w-[220px]">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">{currentOrganization ? 'Association meetings' : 'Club meetings'}</h1>
            <p className="a-mute mt-1 text-[14.5px]">
              {loading ? 'Committee meetings, agendas and minutes' : `${upcomingCount} upcoming · ${heldThisYear.length} held in ${year}`}
            </p>
          </div>
          <div className="a-tbar">
            {showSearch || term ? (
              <div className="a-field" style={{ height: 36, width: 230 }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search all meetings"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => !searchTerm && setShowSearch(false)}
                  autoFocus
                />
                {searchTerm && <button onClick={() => { setSearchTerm(''); setShowSearch(false); }} className="a-dim flex" aria-label="Clear search"><X size={14} /></button>}
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="a-tb-btn" style={{ width: 36, padding: 0, justifyContent: 'center' }} title="Search meetings" aria-label="Search meetings">
                <Search size={17} />
              </button>
            )}
            <span className="a-tb-sep" />
            <div className="a-seg" role="tablist" style={{ padding: 2, borderRadius: 10 }}>
              {([['overview', 'Overview'], ['upcoming', 'Upcoming'], ['past', 'Past']] as const).map(([v, label]) => (
                <button key={v} onClick={() => { setActiveView(v); setSearchTerm(''); }} className={`a-seg-i ${activeView === v && !term ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeView === v && !term} style={{ height: 30, borderRadius: 8 }}>
                  {label}{v === 'upcoming' && upcomingCount > 0 && <span className="a-cnt">{upcomingCount}</span>}
                </button>
              ))}
            </div>
          </div>
          {can('meetings.create') && (
            <button onClick={handleCreateMeeting} className="a-btn a-btn-p" style={{ height: 44, borderRadius: 13 }}>
              <Plus size={17} />
              New meeting
            </button>
          )}
        </div>

        {error && (
          <div className="a-note a-note-r flex items-center gap-2.5">
            <AlertTriangle size={17} />
            <p className="m-0 text-[13.5px]">{error}</p>
          </div>
        )}

        {success && (
          <div className="a-note flex items-center gap-2.5">
            <Check size={17} className="a-txt-g" />
            <p className="m-0 text-[13.5px]">{success}</p>
          </div>
        )}

        {loading ? (
          <div className="a-card a-empty text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
            <p className="a-dim text-[13.5px]">Loading meetings…</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="a-card a-empty text-center py-14">
            <span className="a-tile a-tile-plain mx-auto mb-3" style={{ width: 52, height: 52 }}><Calendar size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">No meetings yet</h3>
            <p className="a-dim text-[13.5px] mb-5">Schedule committee and general meetings, share agendas and keep the minutes here.</p>
            {can('meetings.create') && (
              <button onClick={handleCreateMeeting} className="a-btn a-btn-p mx-auto"><Plus size={16} />Schedule a meeting</button>
            )}
          </div>
        ) : showOverview ? (
          <>
            {(nextMeeting || followUp) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {nextMeeting ? (
                  <div className="a-card a-spec-card flex items-center gap-4 cursor-pointer" style={{ padding: '16px 18px' }} onClick={() => handleViewMeeting(nextMeeting)}>
                    {dateChip(nextMeeting, true)}
                    <div className="flex-1 min-w-0">
                      <p className="a-cap a-txt-b m-0">Next meeting · {whenLabel(nextMeeting)}</p>
                      <p className="a-ink m-0 mt-1 text-[16px] font-semibold truncate">{nextMeeting.name}</p>
                      <p className="a-dim m-0 mt-0.5 text-[12.5px] truncate">{timeOf(nextMeeting)}{nextMeeting.location ? ` · ${nextMeeting.location}` : ''}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {nextMeeting.conferencing_url && (
                        <a href={nextMeeting.conferencing_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="a-btn"><Video size={16} />Join</a>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); handleViewMeeting(nextMeeting); }} className="a-btn a-btn-p"><FileText size={16} />Agenda</button>
                    </div>
                  </div>
                ) : (
                  <div className="a-card flex items-center gap-4" style={{ padding: '16px 18px' }}>
                    <span className="a-tile a-tile-plain" style={{ width: 52, height: 52 }}><CalendarPlus size={22} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="a-cap m-0">Next meeting</p>
                      <p className="a-ink m-0 mt-1 text-[15px] font-semibold">Nothing scheduled yet</p>
                    </div>
                    {can('meetings.create') && <button onClick={handleCreateMeeting} className="a-btn a-btn-p"><Plus size={16} />Schedule</button>}
                  </div>
                )}
                {followUp && (
                  <div className="a-card flex items-center gap-4 cursor-pointer" style={{ padding: '16px 18px', ...(minutesDue ? { borderColor: 'rgba(255,179,64,0.3)' } : {}) }} onClick={() => handleViewMeeting(followUp)}>
                    {dateChip(followUp, true, true)}
                    <div className="flex-1 min-w-0">
                      <p className={`a-cap m-0 ${minutesDue ? 'a-txt-a' : 'a-txt-g'}`}>
                        {minutesDue ? `Minutes to ${minutesDue.minutes_status === 'in_progress' ? 'finish' : 'write'} · held ${whenLabel(followUp)}` : `Last meeting · ${whenLabel(followUp)}`}
                      </p>
                      <p className="a-ink m-0 mt-1 text-[16px] font-semibold truncate">{followUp.name}</p>
                      <p className="a-dim m-0 mt-0.5 text-[12.5px] truncate">
                        {followUp.minute_taker ? `Minutes · ${followUp.minute_taker.first_name} ${followUp.minute_taker.last_name}` : timeOf(followUp)}
                      </p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleViewMeeting(followUp); }} className={`a-btn flex-shrink-0 ${minutesDue ? 'a-btn-p' : ''}`}>
                      <FileText size={16} />{minutesDue ? 'Open minutes' : 'View minutes'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              {[
                { icon: <CalendarClock size={18} />, label: 'Upcoming', value: upcomingCount, sub: nextMeeting ? `Next ${whenLabel(nextMeeting)}` : 'None scheduled' },
                { icon: <CalendarCheck size={18} />, label: `Held in ${year}`, value: heldThisYear.length, sub: lastHeld ? `Last ${whenLabel(lastHeld)}` : 'None yet' },
                { icon: <FileText size={18} />, label: 'Minutes outstanding', value: minutesOutstanding.length, sub: minutesOutstanding.length ? 'Held, minutes not finished' : 'All up to date' },
                { icon: <Users size={18} />, label: 'Going to the next one', value: nextMeeting ? attendingOf(nextMeeting.id).length : 0, sub: nextMeeting ? nextMeeting.name : 'No meeting scheduled' },
              ].map(s => (
                <div key={s.label} className="a-card flex items-center gap-3.5" style={{ padding: '14px 16px' }}>
                  <span className="a-tile a-tile-plain" style={{ width: 44, height: 44 }}>{s.icon}</span>
                  <div className="min-w-0">
                    <div className="a-mute text-[12.5px]">{s.label}</div>
                    <div className="a-display a-num a-ink text-[24px] font-semibold leading-[1.15]">{s.value}</div>
                    <div className="a-dim text-[12px] truncate">{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              <section className="a-card overflow-hidden">
                {sectionHead('Coming up', upcomingCount ? `${upcomingCount} scheduled` : 'Nothing scheduled', 'upcoming', upcomingCount)}
                {upcomingMeetings.length ? upcomingMeetings.slice(0, 5).map(m => meetingRow(m, true)) : (
                  <div className="a-dim text-[13.5px] text-center" style={{ padding: '18px 16px 26px' }}>
                    No upcoming meetings.{can('meetings.create') && <> <button className="a-txt-b font-semibold" onClick={handleCreateMeeting}>Schedule one</button></>}
                  </div>
                )}
              </section>
              <section className="a-card overflow-hidden">
                {sectionHead('Recently held', pastMeetings.length ? 'Agendas, attendance and minutes' : 'No meetings held yet', 'past', pastMeetings.length)}
                {pastMeetings.length ? pastMeetings.slice(0, 5).map(m => meetingRow(m, true)) : (
                  <div className="a-dim text-[13.5px] text-center" style={{ padding: '18px 16px 26px' }}>Meetings appear here once they’ve been held.</div>
                )}
              </section>
            </div>
          </>
        ) : Object.keys(groupedMeetings).length === 0 ? (
          <div className="a-card a-empty text-center py-14">
            <span className="a-tile a-tile-plain mx-auto mb-3" style={{ width: 52, height: 52 }}><Calendar size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">No meetings found</h3>
            <p className="a-dim text-[13.5px] mb-5">
              {term ? 'No meetings match your search' : activeView === 'upcoming' ? 'No upcoming meetings scheduled' : 'No past meetings yet'}
            </p>
            {can('meetings.create') && activeView === 'upcoming' && !term && (
              <button onClick={handleCreateMeeting} className="a-btn a-btn-p mx-auto"><Plus size={16} />Schedule a meeting</button>
            )}
          </div>
        ) : (
          <>
            {term && <div className="a-dim text-[13px] -mb-2">{filteredMeetings.length} {filteredMeetings.length === 1 ? 'meeting matches' : 'meetings match'} “{searchTerm.trim()}”</div>}
            <div className="a-card overflow-hidden">
              {Object.entries(groupedMeetings).map(([monthYear, monthMeetings]) => {
                const [mName, mYear] = monthYear.split(' ');
                return (
                  <React.Fragment key={monthYear}>
                    <div className="flex items-baseline gap-2" style={{ padding: '16px 16px 6px' }}>
                      <span className="a-display a-ink text-[16px] font-semibold">{mName}</span>
                      <span className="a-dim text-[13px]">{mYear}</span>
                    </div>
                    {monthMeetings.map(m => meetingRow(m))}
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}

        {deleteModal}
      </div>
    </div>
  );
};
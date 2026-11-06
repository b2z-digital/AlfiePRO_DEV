import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Search, MapPin, Clock, Users, SquarePen as Edit2, Trash2, ChevronRight, TriangleAlert as AlertTriangle, Check, Shield, Repeat, Video, FileText } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
import { useAuth } from '../../contexts/AuthContext';
import { Meeting } from '../../types/meeting';
import { getMeetings, deleteMeeting, updateMeetingStatus, duplicateMeeting } from '../../utils/meetingStorage';
import { formatDate } from '../../utils/date';
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
  const [activeView, setActiveView] = useState<'upcoming' | 'past'>('upcoming');
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
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
      await deleteMeeting(meetingToDelete.id);
      setMeetings(meetings.filter(m => m.id !== meetingToDelete.id));
      setShowDeleteConfirm(false);
      setMeetingToDelete(null);
      addNotification('success', 'Meeting deleted successfully');
    } catch (err) {
      console.error('Error deleting meeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete meeting');
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

  // Filter meetings based on search term and active view
  const filteredMeetings = meetings.filter(meeting => {
    const matchesSearch = 
      meeting.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (meeting.location && meeting.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (meeting.description && meeting.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const meetingDate = new Date(meeting.date);
    meetingDate.setHours(0, 0, 0, 0);
    
    const isPast = meetingDate < today || meeting.status === 'completed' || meeting.status === 'cancelled';
    
    return matchesSearch && (
      (activeView === 'upcoming' && !isPast) ||
      (activeView === 'past' && isPast)
    );
  });

  // Group meetings by month and year
  const groupedMeetings = filteredMeetings.reduce((acc, meeting) => {
    const date = new Date(meeting.date);
    const monthYear = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
    
    if (!acc[monthYear]) {
      acc[monthYear] = [];
    }
    
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
          onMarkAsCompleted={() => handleMarkAsCompleted(selectedMeeting.id)}
          onMarkAsCancelled={() => handleMarkAsCancelled(selectedMeeting.id)}
        />
        </div>
      </div>
    );
  }

  const upcomingCount = meetings.filter(m => {
    const d = new Date(m.date); d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return !(d < t || m.status === 'completed' || m.status === 'cancelled');
  }).length;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dateChip = (m: Meeting, big?: boolean) => {
    const d = new Date(m.date);
    const tone = m.status === 'cancelled' ? 'a-dc-past' : m.status === 'completed' || activeView === 'past' ? 'a-dc-past' : 'a-dc-meet';
    return (
      <div className={`a-dc ${tone}`} style={big ? { width: 72, padding: '10px 0' } : undefined}>
        <b>{MON[d.getMonth()]}</b>
        <span style={big ? { fontSize: 30 } : undefined}>{d.getDate()}</span>
        <i>{DOW[d.getDay()]}</i>
      </div>
    );
  };
  const timeOf = (m: Meeting) => (m.start_time && m.end_time ? `${m.start_time.substring(0, 5)} – ${m.end_time.substring(0, 5)}` : 'Time not set');
  const catChip = (m: Meeting) => m.meeting_category && (
    <span className="a-lb-fmt"><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: m.meeting_category === 'committee' ? '#FFB340' : '#2E7BFF' }} />{m.meeting_category === 'committee' ? 'Committee' : 'General'}</span>
  );
  const recurLabel = (r?: string) => r === 'monthly_nth' ? 'Repeats monthly' : r === 'fortnightly' ? 'Repeats fortnightly' : `Repeats ${r}`;
  const person = (p?: { first_name: string; last_name: string; avatar_url?: string | null }) => p && <AAvatar url={p.avatar_url} first={p.first_name} last={p.last_name} size={32} />;
  const heroMeeting = activeView === 'upcoming' && !searchTerm ? filteredMeetings[0] : undefined;
  const daysUntil = heroMeeting ? Math.round((new Date(new Date(heroMeeting.date).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : 0;
  const attendingOf = (id: string) => (meetingAttendance[id] || []).filter(a => a.status === 'attending');

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex flex-wrap items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Calendar size={24} /></span>
          <div className="flex-1 min-w-[220px]">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">{currentOrganization ? 'Association meetings' : 'Club meetings'}</h1>
            <p className="a-mute mt-1 text-[14.5px]">Committee meetings, agendas and minutes</p>
          </div>
          <label className="a-field" style={{ width: 240 }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search meetings"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <div className="a-seg" role="tablist">
            <button onClick={() => setActiveView('upcoming')} className={`a-seg-i ${activeView === 'upcoming' ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeView === 'upcoming'}>
              Upcoming{upcomingCount > 0 && <span className="a-cnt">{upcomingCount}</span>}
            </button>
            <button onClick={() => setActiveView('past')} className={`a-seg-i ${activeView === 'past' ? 'a-seg-on' : ''}`} role="tab" aria-selected={activeView === 'past'}>
              Past
            </button>
          </div>
          {can('meetings.create') && (
            <button onClick={handleCreateMeeting} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}>
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
        ) : Object.keys(groupedMeetings).length === 0 ? (
          <div className="a-card a-empty text-center py-14">
            <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Calendar size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">No meetings found</h3>
            <p className="a-dim text-[13.5px] mb-5">
              {activeView === 'upcoming' ? 'No upcoming meetings scheduled' : 'No past meetings found'}
            </p>
            {can('meetings.create') && (
              <button onClick={handleCreateMeeting} className="a-btn a-btn-p mx-auto">
                <Plus size={16} />
                Schedule a meeting
              </button>
            )}
          </div>
        ) : (
          <>
            {heroMeeting && (
              <div className="a-card a-spec-card flex flex-wrap items-center gap-5 cursor-pointer" style={{ padding: 22 }} onClick={() => handleViewMeeting(heroMeeting)}>
                {dateChip(heroMeeting, true)}
                <div className="flex-1 min-w-[220px] flex flex-col gap-2">
                  <span className="a-st a-txt-g text-[12.5px]"><span className="a-light a-light-g" />Next meeting · {daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}</span>
                  <div className="a-display a-ink text-[23px] font-semibold">{heroMeeting.name}</div>
                  <div className="flex gap-4 flex-wrap items-center">
                    <span className="a-meta" style={{ fontSize: 13 }}><Clock size={14} />{timeOf(heroMeeting)}</span>
                    {heroMeeting.location && <span className="a-meta" style={{ fontSize: 13 }}><MapPin size={14} />{heroMeeting.location}</span>}
                    {catChip(heroMeeting)}
                  </div>
                </div>
                {(heroMeeting.chairperson || heroMeeting.minute_taker) && (
                  <div className="a-hero-people flex items-center gap-2.5">
                    <span className="inline-flex">
                      {person(heroMeeting.chairperson)}
                      {heroMeeting.minute_taker && <span style={{ marginLeft: heroMeeting.chairperson ? -8 : 0 }}>{person(heroMeeting.minute_taker)}</span>}
                    </span>
                    <div className="text-[12.5px]">
                      {heroMeeting.chairperson && <div className="a-ink">Chair · {heroMeeting.chairperson.first_name} {heroMeeting.chairperson.last_name}</div>}
                      {heroMeeting.minute_taker && <div className="a-dim">Minutes · {heroMeeting.minute_taker.first_name} {heroMeeting.minute_taker.last_name}</div>}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {heroMeeting.conferencing_url && (
                    <a href={heroMeeting.conferencing_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="a-btn a-btn-p">
                      <Video size={16} />Join
                    </a>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); handleViewMeeting(heroMeeting); }} className="a-btn">
                    <FileText size={16} />Agenda
                  </button>
                </div>
              </div>
            )}

            <div className="a-card overflow-hidden">
              {Object.entries(groupedMeetings).map(([monthYear, monthMeetings]) => {
                const [mName, mYear] = monthYear.split(' ');
                return (
                  <React.Fragment key={monthYear}>
                    <div className="flex items-baseline gap-2" style={{ padding: '16px 16px 6px' }}>
                      <span className="a-display a-ink text-[16px] font-semibold">{mName}</span>
                      <span className="a-dim text-[13px]">{mYear}</span>
                    </div>
                    {monthMeetings.map((meeting) => {
                      const att = attendingOf(meeting.id);
                      return (
                        <div key={meeting.id} onClick={() => handleViewMeeting(meeting)} className="a-mr group">
                          {dateChip(meeting)}
                          <span className="a-tile" style={{ width: 40, height: 40 }}>{meeting.meeting_category === 'committee' ? <Shield size={18} /> : <Users size={18} />}</span>
                          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                            <div className="a-ink text-[15.5px] font-semibold truncate">{meeting.name}</div>
                            <div className="flex gap-3.5 items-center flex-wrap">
                              <span className="a-meta" style={{ fontSize: 13 }}><Clock size={14} />{timeOf(meeting)}</span>
                              {meeting.location && <span className="a-meta" style={{ fontSize: 13 }}><MapPin size={14} />{meeting.location}</span>}
                              {catChip(meeting)}
                              {meeting.recurrence_type && meeting.recurrence_type !== 'none' && (
                                <span className="a-lb-fmt"><Repeat size={12} />{recurLabel(meeting.recurrence_type)}</span>
                              )}
                              {meeting.status !== 'upcoming' && (
                                <span className="a-st text-[12.5px]"><span className={`a-light ${meeting.status === 'completed' ? 'a-light-g' : 'a-light-r'}`} />{meeting.status === 'completed' ? 'Completed' : 'Cancelled'}</span>
                              )}
                            </div>
                          </div>
                          {att.length > 0 && (
                            <div className="max-md:hidden flex items-center gap-2" title={`${att.length} attending`}>
                              <span className="inline-flex">
                                {att.slice(0, 4).map((a, idx) => (
                                  <span key={idx} style={{ marginLeft: idx ? -8 : 0 }} className="a-av-ring inline-flex rounded-full">
                                    <AAvatar url={a.member?.avatar_url} first={a.member?.first_name} last={a.member?.last_name} size={28} />
                                  </span>
                                ))}
                              </span>
                              <span className="a-dim text-[12px]">{att.length} attending</span>
                            </div>
                          )}
                          {meeting.status === 'upcoming' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditMeeting(meeting); }}
                                className="a-ib"
                                aria-label="Edit meeting"
                                title="Edit meeting"
                              >
                                <Edit2 size={17} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(meeting); }}
                                className="a-ib a-ib-d"
                                aria-label="Delete meeting"
                                title="Delete meeting"
                              >
                                <Trash2 size={17} />
                              </button>
                            </>
                          )}
                          <ChevronRight size={17} className="a-dim flex-shrink-0" />
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && meetingToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="a-sheet max-w-md w-full" style={{ padding: 24 }}>
              <h3 className="a-display a-ink text-[20px] font-semibold mb-2">Delete meeting</h3>
              <p className="a-mute text-[14px] mb-6">
                Are you sure you want to delete the meeting "{meetingToDelete.name}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="a-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="a-btn a-btn-d"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
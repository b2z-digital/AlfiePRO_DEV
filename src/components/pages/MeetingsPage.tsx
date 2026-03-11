import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Search, Filter, MapPin, Clock, Users, Edit2, Trash2, ChevronRight, AlertTriangle, Check, Shield, Repeat } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Meeting } from '../../types/meeting';
import { getMeetings, deleteMeeting, updateMeetingStatus } from '../../utils/meetingStorage';
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

  const handleFormSuccess = () => {
    fetchMeetings();
    setShowForm(false);
    addNotification('success', editingMeeting ? 'Meeting updated successfully' : 'Meeting created successfully');
    setEditingMeeting(null);
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
        <div className="p-16">
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
        <div className="p-16">
          <MeetingDetails
          meeting={selectedMeeting}
          darkMode={darkMode}
          associationId={currentOrganization?.id}
          associationType={currentOrganization?.type as 'state' | 'national' | undefined}
          onClose={handleCloseDetails}
          onEdit={() => handleEditMeeting(selectedMeeting)}
          onMarkAsCompleted={() => handleMarkAsCompleted(selectedMeeting.id)}
          onMarkAsCancelled={() => handleMarkAsCancelled(selectedMeeting.id)}
        />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Calendar className="text-white" size={28} />
          </div>
          <h2 className="text-3xl font-bold text-white">{currentOrganization ? 'Association Meetings' : 'Club Meetings'}</h2>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30 mb-6">
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
          <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30 mb-6">
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

        <div className="flex items-center justify-end gap-2 mb-6">
          {showSearch && (
            <div className="relative w-80">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search meetings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-200 placeholder-slate-400 rounded-lg transition-colors"
              />
            </div>
          )}

          {!showSearch && (
            <button
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              title="Search"
            >
              <Search size={18} />
            </button>
          )}

          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            <button
              onClick={() => setActiveView('upcoming')}
              className={`
                px-4 py-2 text-sm font-medium transition-colors
                ${activeView === 'upcoming'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'}
              `}
            >
              Upcoming Meetings
            </button>
            <button
              onClick={() => setActiveView('past')}
              className={`
                px-4 py-2 text-sm font-medium transition-colors
                ${activeView === 'past'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'}
              `}
            >
              Past Meetings
            </button>
          </div>

          {can('meetings.create') && (
            <button
              onClick={handleCreateMeeting}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 font-medium transition-all duration-200 animate-pulse"
            >
              <Plus size={18} />
              Create a New Meeting
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Loading meetings...</p>
          </div>
        ) : Object.keys(groupedMeetings).length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <Calendar size={48} className="mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">No Meetings Found</h3>
            <p className="text-slate-400 mb-6">
              {activeView === 'upcoming' 
                ? 'No upcoming meetings scheduled' 
                : 'No past meetings found'}
            </p>
            <button
              onClick={handleCreateMeeting}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200"
            >
              Schedule a Meeting
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedMeetings).map(([monthYear, monthMeetings]) => (
              <div key={monthYear}>
                <h3 className="text-xl font-semibold mb-4 text-white">{monthYear}</h3>
                <div className="space-y-4">
                  {monthMeetings.map((meeting) => {
                    const meetingDate = new Date(meeting.date);
                    const formattedDate = `${meetingDate.getDate().toString().padStart(2, '0')}-${(meetingDate.getMonth() + 1).toString().padStart(2, '0')}-${meetingDate.getFullYear()}`;
                    const formattedTime = meeting.start_time && meeting.end_time 
                      ? `${meeting.start_time.substring(0, 5)} - ${meeting.end_time.substring(0, 5)}`
                      : 'Time not specified';
                    
                    return (
                      <div
                        key={meeting.id}
                        className={`
                          rounded-lg border transition-all overflow-hidden
                          ${meeting.status === 'cancelled'
                            ? 'bg-red-900/10 border-red-900/30'
                            : meeting.status === 'completed'
                              ? 'bg-green-900/10 border-green-900/30'
                              : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:shadow-lg'}
                        `}
                      >
                        <div className="flex">
                          {/* Calendar Date Badge */}
                          <div className={`
                            flex-shrink-0 w-20 flex flex-col items-center justify-center text-center
                            ${meeting.status === 'cancelled'
                              ? 'bg-red-600/20 border-r border-red-900/30'
                              : meeting.status === 'completed'
                                ? 'bg-green-600/20 border-r border-green-900/30'
                                : 'bg-gradient-to-br from-blue-600/30 to-purple-600/30 border-r border-slate-700/50'}
                          `}>
                            <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                              {meetingDate.toLocaleString('default', { month: 'short' })}
                            </div>
                            <div className="text-3xl font-bold text-white leading-none my-1">
                              {meetingDate.getDate()}
                            </div>
                            <div className="text-xs text-slate-400">
                              {meetingDate.getFullYear()}
                            </div>
                          </div>

                          {/* Meeting Content */}
                          <div className="flex-1 p-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-xl font-semibold text-white">{meeting.name}</h4>

                                  {/* Attendance Avatars */}
                                  {meetingAttendance[meeting.id] && meetingAttendance[meeting.id].filter(a => a.status === 'attending').length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <div className="flex -space-x-2">
                                        {meetingAttendance[meeting.id]
                                          .filter(a => a.status === 'attending')
                                          .slice(0, 5)
                                          .map((attendance, idx) => (
                                            <div
                                              key={idx}
                                              className="relative w-8 h-8 rounded-full border-2 border-slate-800 bg-slate-700 overflow-hidden"
                                              title={`${attendance.member.first_name} ${attendance.member.last_name}`}
                                            >
                                              {attendance.member.avatar_url ? (
                                                <img
                                                  src={attendance.member.avatar_url}
                                                  alt={`${attendance.member.first_name} ${attendance.member.last_name}`}
                                                  className="w-full h-full object-cover"
                                                />
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-slate-300">
                                                  {attendance.member.first_name?.[0]}{attendance.member.last_name?.[0]}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        {meetingAttendance[meeting.id].filter(a => a.status === 'attending').length > 5 && (
                                          <div className="relative w-8 h-8 rounded-full border-2 border-slate-800 bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
                                            +{meetingAttendance[meeting.id].filter(a => a.status === 'attending').length - 5}
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-xs text-slate-400">
                                        {meetingAttendance[meeting.id].filter(a => a.status === 'attending').length} attending
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                                  <div className="flex items-center gap-1">
                                    <Clock size={14} />
                                    <span>{formattedTime}</span>
                                  </div>
                                  {meeting.location && (
                                    <div className="flex items-center gap-1">
                                      <MapPin size={14} />
                                      <span>{meeting.location}</span>
                                    </div>
                                  )}
                                  {meeting.meeting_category && (
                                    <div className={`
                                      flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                      ${meeting.meeting_category === 'committee'
                                        ? 'bg-amber-900/30 text-amber-400'
                                        : 'bg-blue-900/30 text-blue-400'}
                                    `}>
                                      {meeting.meeting_category === 'committee' ? <Shield size={12} /> : <Users size={12} />}
                                      {meeting.meeting_category === 'committee' ? 'Committee' : 'General'}
                                    </div>
                                  )}
                                  {meeting.recurrence_type && meeting.recurrence_type !== 'none' && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-900/30 text-teal-400">
                                      <Repeat size={12} />
                                      {meeting.recurrence_type.charAt(0).toUpperCase() + meeting.recurrence_type.slice(1)}
                                    </div>
                                  )}
                                  {meeting.status !== 'upcoming' && (
                                    <div className={`
                                      px-2 py-0.5 rounded-full text-xs font-medium
                                      ${meeting.status === 'completed'
                                        ? 'bg-green-900/30 text-green-400'
                                        : 'bg-red-900/30 text-red-400'}
                                    `}>
                                      {meeting.status === 'completed' ? 'Completed' : 'Cancelled'}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 flex-shrink-0">
                                <button
                                  onClick={() => handleViewMeeting(meeting)}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors"
                                >
                                  View Details
                                </button>

                                {meeting.status === 'upcoming' && (
                                  <>
                                    <button
                                      onClick={() => handleEditMeeting(meeting)}
                                      className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
                                      title="Edit meeting"
                                    >
                                      <Edit2 size={18} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteClick(meeting)}
                                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
                                      title="Delete meeting"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && meetingToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Delete Meeting</h3>
              <p className="text-slate-300 mb-6">
                Are you sure you want to delete the meeting "{meetingToDelete.name}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
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
import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Clock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getMeetings } from '../../../utils/meetingStorage';
import { Meeting } from '../../../types/meeting';
import { useNavigate } from 'react-router-dom';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { WidgetColorTheme } from '../../../types/dashboard';

interface UpcomingMeetingsWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: WidgetColorTheme;
}

export const UpcomingMeetingsWidget: React.FC<UpcomingMeetingsWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    if (currentClub?.clubId) {
      loadMeetings();
    }
  }, [currentClub]);

  const loadMeetings = async () => {
    if (!currentClub?.clubId) return;

    try {
      const allMeetings = await getMeetings(currentClub.clubId);

      const now = new Date();
      const upcomingMeetings = allMeetings
        .filter(m => {
          const meetingDate = new Date(m.date);
          return meetingDate >= now && m.status === 'upcoming';
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);

      setMeetings(upcomingMeetings);
    } catch (error) {
      console.error('Error loading meetings:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return '';
    try {
      const [hours, minutes] = timeString.split(':');
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return timeString;
    }
  };

  const handleMeetingClick = (meetingId: string) => {
    if (!isEditMode) {
      navigate(`/meetings?meeting=${meetingId}`);
    }
  };

  const handleViewAll = () => {
    if (!isEditMode) {
      navigate('/meetings');
    }
  };

  return (
    <ThemedWidgetWrapper
      title="Upcoming Meetings"
      icon={Calendar}
      colorTheme={colorTheme}
      isEditMode={isEditMode}
      onRemove={onRemove}
    >
      <div className="min-h-[16rem]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : meetings.length > 0 ? (
          <div className="flex flex-col gap-3">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                onClick={() => handleMeetingClick(meeting.id)}
                className={`p-4 rounded-lg border bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50 transition-colors ${
                  isEditMode ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-sm font-semibold text-white line-clamp-2 flex-1">
                    {meeting.name}
                  </h4>
                  <div className="flex-shrink-0 px-2 py-1 rounded bg-blue-500/20 border border-blue-500/30">
                    <span className="text-xs font-medium text-blue-400">
                      {formatDate(meeting.date)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-slate-400">
                  {meeting.start_time && (
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="flex-shrink-0" />
                      <span>
                        {formatTime(meeting.start_time)}
                        {meeting.end_time && ` - ${formatTime(meeting.end_time)}`}
                      </span>
                    </div>
                  )}

                  {meeting.location && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="flex-shrink-0" />
                      <span className="line-clamp-1">{meeting.location}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={handleViewAll}
              className={`mt-2 w-full py-2 px-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/50 text-sm font-medium text-slate-300 hover:text-white transition-colors ${
                isEditMode ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              View All Meetings
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Calendar size={40} className="text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 mb-3">No upcoming meetings</p>
            <button
              onClick={() => !isEditMode && navigate('/meetings')}
              className={`px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors ${
                isEditMode ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              Schedule a Meeting
            </button>
          </div>
        )}
      </div>
    </ThemedWidgetWrapper>
  );
};

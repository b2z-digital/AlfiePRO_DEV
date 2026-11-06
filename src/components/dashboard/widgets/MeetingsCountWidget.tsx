import React, { useState, useEffect } from 'react';
import { Calendar, X, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { getMeetings } from '../../../utils/meetingStorage';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const MeetingsCountWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [meetingCount, setMeetingCount] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchMeetingData();
  }, [currentClub]);

  const fetchMeetingData = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const allMeetings = await getMeetings(currentClub.clubId);

      const now = new Date();
      const upcomingMeetings = allMeetings.filter(m => {
        const meetingDate = new Date(m.date);
        return meetingDate >= now && m.status === 'upcoming';
      });

      setMeetingCount(allMeetings.length);
      setUpcomingCount(upcomingMeetings.length);
    } catch (err) {
      console.error('Error fetching meeting data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full">
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}
      <button
        onClick={() => !isEditMode && navigate('/meetings')}
        disabled={isEditMode}
        className={`a-wstat relative rounded-2xl text-left transition-all w-full h-full flex items-center border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer'}`}
      >
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><Calendar size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">Club Meetings</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading ? '...' : upcomingCount}
          </p>
          <p className="a-mute text-[12.5px]">
            {upcomingCount === 1 ? '1 upcoming' : upcomingCount === 0 ? 'No upcoming' : `${upcomingCount} upcoming`}
          </p>
        </div>
      </button>
    </div>
  );
};

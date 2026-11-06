import React, { useState, useEffect } from 'react';
import { Calendar, X, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const EventCountWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const [eventCount, setEventCount] = useState(0);
  const [nextEventDays, setNextEventDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchEventData();
  }, [currentClub, currentOrganization]);

  const fetchEventData = async () => {
    if (!currentClub?.clubId && !currentOrganization?.id) {
      setLoading(false);
      return;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      let allEvents: Array<{ date: string; name: string }> = [];

      // For associations, fetch approved public events
      if (currentOrganization) {
        const { data: publicEvents, error: publicError } = await supabase
          .from('public_events')
          .select('id, date, event_name')
          .gte('date', todayISO)
          .eq('approval_status', 'approved')
          .order('date', { ascending: true });

        if (publicError) throw publicError;

        allEvents = (publicEvents || []).map(e => ({ date: e.date, name: e.event_name }));
      } else {
        // For clubs, fetch all event types
        // Fetch single races (quick_races)
        const { data: singleRaces, error: singleError } = await supabase
          .from('quick_races')
          .select('id, race_date, event_name')
          .eq('club_id', currentClub.clubId)
          .neq('is_simulated', true)
          .gte('race_date', todayISO)
          .order('race_date', { ascending: true });

        if (singleError) throw singleError;

        // Fetch series rounds (race_series_rounds)
        const { data: seriesRounds, error: seriesError } = await supabase
          .from('race_series_rounds')
          .select('id, date, round_name')
          .eq('club_id', currentClub.clubId)
          .gte('date', todayISO)
          .eq('cancelled', false)
          .order('date', { ascending: true });

        if (seriesError) throw seriesError;

        // Fetch public events (state/national level events)
        const { data: publicEvents, error: publicError } = await supabase
          .from('public_events')
          .select('id, date, event_name, approval_status')
          .or(`club_id.eq.${currentClub.clubId},state_association_id.eq.${currentClub.clubId},national_association_id.eq.${currentClub.clubId}`)
          .gte('date', todayISO)
          .eq('approval_status', 'approved')
          .order('date', { ascending: true });

        if (publicError) throw publicError;

        // Combine all events
        allEvents = [
          ...(singleRaces || []).map(e => ({ date: e.race_date, name: e.event_name })),
          ...(seriesRounds || []).map(e => ({ date: e.date, name: e.round_name })),
          ...(publicEvents || []).map(e => ({ date: e.date, name: e.event_name }))
        ];

        // Sort by date
        allEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      setEventCount(allEvents.length);

      // Calculate days to next event
      if (allEvents.length > 0) {
        const nextDate = new Date(allEvents[0].date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const diffTime = nextDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setNextEventDays(diffDays);
      }
    } catch (err) {
      console.error('Error fetching event data:', err);
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
        onClick={() => !isEditMode && navigate('/race-management')}
        disabled={isEditMode}
        className={`a-wstat relative rounded-2xl text-left transition-all w-full h-full flex items-center border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer'}`}
      >
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><Calendar size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">Upcoming Events</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading ? '...' : eventCount}
          </p>
          <p className="a-mute text-[12.5px]">
            {nextEventDays > 0
              ? `Next event in ${nextEventDays} day${nextEventDays !== 1 ? 's' : ''}`
              : eventCount > 0
              ? 'Event today!'
              : 'No events scheduled'}
          </p>
        </div>
      </button>
    </div>
  );
};

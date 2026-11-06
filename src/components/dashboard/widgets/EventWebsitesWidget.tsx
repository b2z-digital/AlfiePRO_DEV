import React, { useState, useEffect } from 'react';
import { Globe, X, ChartBar as BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const EventWebsitesWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [websiteCount, setWebsiteCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    loadWebsiteStats();
  }, [currentClub]);

  const loadWebsiteStats = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      // Get all event websites
      const { data: websites, error } = await supabase
        .from('event_websites')
        .select('id, event_id, published_at');

      if (error) throw error;

      if (!websites || websites.length === 0) {
        setWebsiteCount(0);
        setPublishedCount(0);
        return;
      }

      // Get event IDs and fetch events to filter by club
      const eventIds = websites.map(w => w.event_id).filter(id => id !== null);

      if (eventIds.length === 0) {
        setWebsiteCount(0);
        setPublishedCount(0);
        return;
      }

      const { data: events } = await supabase
        .from('public_events')
        .select('id')
        .eq('club_id', currentClub.clubId)
        .in('id', eventIds);

      const clubEventIds = new Set(events?.map(e => e.id) || []);
      const clubWebsites = websites.filter(w => clubEventIds.has(w.event_id));

      const total = clubWebsites.length;
      const published = clubWebsites.filter(w => w.published_at !== null).length;

      setWebsiteCount(total);
      setPublishedCount(published);
    } catch (error) {
      console.error('Error loading event websites:', error);
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
        onClick={() => !isEditMode && navigate('/event-websites')}
        disabled={isEditMode}
        className={`a-wstat relative rounded-2xl text-left transition-all w-full h-full flex items-center border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer'}`}
      >
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><Globe size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">Event Websites</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading ? '...' : websiteCount}
          </p>
          <p className="a-mute text-[12.5px]">
            {loading ? 'Loading...' : `${publishedCount} published`}
          </p>
        </div>
      </button>
    </div>
  );
};

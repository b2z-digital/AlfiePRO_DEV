import React, { useState, useEffect } from 'react';
import { Wind, CloudRain, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const WeatherWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchVenueCoordinates();
  }, [currentClub]);

  const fetchVenueCoordinates = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data: venue } = await supabase
        .from('venues')
        .select('latitude, longitude')
        .eq('club_id', currentClub.clubId)
        .limit(1)
        .maybeSingle();

      if (venue?.latitude && venue?.longitude) {
        setCoordinates({ lat: venue.latitude, lon: venue.longitude });
      }
    } catch (err) {
      console.error('Error fetching venue coordinates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      navigate('/weather');
    }
  };

  return (
    <div
      className={`
        relative rounded-2xl overflow-hidden text-left transition-all w-full border backdrop-blur-sm
        ${themeColors.background}
        ${isEditMode ? 'animate-wiggle' : ''}
      `}
    >
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

      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <Wind className={darkMode ? "text-cyan-400" : "text-cyan-500"} size={20} />
          <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-700'}`}>Weather Forecast</h2>
        </div>
        {!isEditMode && (
          <button
            onClick={handleClick}
            className="text-slate-400 hover:text-slate-300 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      ) : coordinates ? (
        <div
          className="relative cursor-pointer"
          onClick={handleClick}
          style={{ height: '240px' }}
        >
          <iframe
            width="100%"
            height="100%"
            src={`https://embed.windy.com/embed.html?type=forecast&location=coordinates&detail=true&detailLat=${coordinates.lat}&detailLon=${coordinates.lon}&metricTemp=°C&metricRain=mm&metricWind=kt`}
            frameBorder="0"
            className="rounded-b-2xl pointer-events-none"
          />
          <div className="absolute inset-0 cursor-pointer" onClick={handleClick} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64">
          <CloudRain className="mb-2 text-slate-500" size={32} />
          <p className="text-sm text-slate-400">No venue coordinates available</p>
        </div>
      )}
    </div>
  );
};

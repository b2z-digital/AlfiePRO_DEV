import React, { useState, useEffect, useMemo } from 'react';
import { Image, Video, Upload, Eye, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { getWidgetThemeColors } from '../../../utils/widgetThemes';

interface MediaStats {
  totalImages: number;
  totalVideos: number;
  recentCount: number;
}

export const MediaCenterWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [stats, setStats] = useState<MediaStats>({
    totalImages: 0,
    totalVideos: 0,
    recentCount: 0
  });
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useMemo(() => getWidgetThemeColors(colorTheme), [colorTheme]);

  useEffect(() => {
    loadMediaStats();
  }, [currentClub]);

  const loadMediaStats = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('event_media')
        .select('media_type, created_at')
        .eq('club_id', currentClub.clubId);

      if (error) throw error;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      const images = data?.filter(m => m.media_type === 'image').length || 0;
      const videos = data?.filter(m => m.media_type === 'youtube_video').length || 0;
      const recent = data?.filter(m => new Date(m.created_at) > thirtyDaysAgo).length || 0;

      setStats({
        totalImages: images,
        totalVideos: videos,
        recentCount: recent
      });
    } catch (error) {
      console.error('Error loading media stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!isEditMode) navigate('/media');
  };

  return (
    <div className={`relative rounded-2xl p-6 w-full h-full flex flex-col border backdrop-blur-sm ${themeColors.background} ${isEditMode ? 'animate-wiggle cursor-move' : ''}`}>
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

      <div className="flex items-center gap-2 mb-4">
        <Image className="text-emerald-400" size={20} />
        <h2 className="text-lg font-semibold text-white">Media Center</h2>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          Loading...
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-4 border ${themeColors.accentBg} ${themeColors.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <Image size={16} className="text-emerald-400" />
                <span className="text-xs text-slate-400">Images</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalImages}</div>
            </div>

            <div className={`rounded-xl p-4 border ${themeColors.accentBg} ${themeColors.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <Video size={16} className="text-emerald-400" />
                <span className="text-xs text-slate-400">Videos</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalVideos}</div>
            </div>
          </div>

          <div className={`rounded-xl p-4 border ${themeColors.accentBg} ${themeColors.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Recent uploads</div>
                <div className="text-lg font-semibold text-white mt-1">
                  {stats.recentCount} this month
                </div>
              </div>
              <Eye size={24} className="text-emerald-400 opacity-50" />
            </div>
          </div>

          <button
            onClick={handleNavigate}
            disabled={isEditMode}
            className={`mt-auto w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors font-medium ${isEditMode ? 'pointer-events-none opacity-50' : ''}`}
          >
            Manage Media
          </button>
        </div>
      )}
    </div>
  );
};

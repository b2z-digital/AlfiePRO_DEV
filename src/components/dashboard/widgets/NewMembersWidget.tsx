import React, { useState, useEffect } from 'react';
import { UserPlus, X, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const NewMembersWidget: React.FC<WidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  colorTheme = 'default'
}) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    if (currentClub) {
      fetchNewMembers();
    }
  }, [currentClub]);

  const fetchNewMembers = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', currentClub.clubId)
        .gte('created_at', firstDayOfMonth.toISOString());

      if (error) throw error;
      setCount(count || 0);
    } catch (error) {
      console.error('Error fetching new members:', error);
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
        onClick={() => !isEditMode && navigate('/membership-dashboard?tab=members')}
        disabled={isEditMode}
        className={`relative rounded-2xl p-4 text-left transition-all w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer transform hover:scale-[1.02]'}`}
      >
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-purple-500/20">
            <UserPlus className="text-purple-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">New This Month</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading ? '...' : count}
          </p>
          <p className="text-xs text-slate-400">
            {count > 0 ? 'Joined this month' : 'No new members'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <TrendingUp className="text-purple-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};

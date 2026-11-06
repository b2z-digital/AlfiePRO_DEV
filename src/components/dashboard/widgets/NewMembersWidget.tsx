import React, { useState, useEffect } from 'react';
import { UserPlus, X, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';

export const NewMembersWidget: React.FC<WidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  colorTheme = 'default'
}) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const orgContext = useOrganizationContext();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    if (!orgContext.isLoading) {
      fetchNewMembers();
    }
  }, [orgContext.clubIds, orgContext.isLoading]);

  const fetchNewMembers = async () => {
    if (orgContext.clubIds.length === 0) {
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
        .in('club_id', orgContext.clubIds)
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
        className={`a-wstat relative rounded-2xl text-left transition-all w-full h-full flex items-center border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer'}`}
      >
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><UserPlus size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">New This Month</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading || orgContext.isLoading ? '...' : count}
          </p>
          <p className="a-mute text-[12.5px]">
            {count > 0 ? 'Joined this month' : 'No new members'}
          </p>
        </div>
      </button>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Calendar, X, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const PendingRenewalsWidget: React.FC<WidgetProps> = ({
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
      fetchPendingRenewals();
    }
  }, [currentClub]);

  const fetchPendingRenewals = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { count, error } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', currentClub.clubId)
        .eq('membership_status', 'active')
        .lt('membership_expiry', thirtyDaysFromNow.toISOString());

      if (error) throw error;
      setCount(count || 0);
    } catch (error) {
      console.error('Error fetching pending renewals:', error);
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
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><Calendar size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">Pending Renewals</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading ? '...' : count}
          </p>
          <p className="a-mute text-[12.5px]">
            {count > 0 ? 'Expiring within 30 days' : 'No pending renewals'}
          </p>
        </div>
      </button>
    </div>
  );
};

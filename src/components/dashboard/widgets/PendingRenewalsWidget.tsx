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
        className={`relative rounded-2xl p-4 text-left transition-all w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer transform hover:scale-[1.02]'}`}
      >
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-yellow-500/20">
            <Calendar className="text-yellow-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Pending Renewals</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading ? '...' : count}
          </p>
          <p className="text-xs text-slate-400">
            {count > 0 ? 'Expiring within 30 days' : 'No pending renewals'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <AlertCircle className="text-yellow-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};

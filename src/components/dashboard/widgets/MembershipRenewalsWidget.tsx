import React, { useState, useEffect } from 'react';
import { AlertCircle, X, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const MembershipRenewalsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [renewalsCount, setRenewalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchRenewalsDue();
  }, [currentClub]);

  const fetchRenewalsDue = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      // Get members whose renewal date is within the next 60 days
      const today = new Date();
      const sixtyDaysFromNow = new Date(today);
      sixtyDaysFromNow.setDate(today.getDate() + 60);

      const { count, error } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', currentClub.clubId)
        .eq('membership_status', 'active')
        .lte('renewal_date', sixtyDaysFromNow.toISOString().split('T')[0])
        .gte('renewal_date', today.toISOString().split('T')[0]);

      if (error) throw error;

      setRenewalsCount(count || 0);
    } catch (err) {
      console.error('Error fetching renewals due:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      navigate('/membership', { state: { activeTab: 'renewals' } });
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
        onClick={handleClick}
        disabled={isEditMode}
        className={`a-wstat relative rounded-2xl text-left transition-all w-full h-full flex items-center border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer'}`}
      >
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><AlertCircle size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">Renewals Due</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading ? '...' : renewalsCount}
          </p>
          <p className="a-mute text-[12.5px]">
            {renewalsCount > 0
              ? `${renewalsCount === 1 ? '1 member' : `${renewalsCount} members`} due in 60 days`
              : 'No renewals due soon'}
          </p>
        </div>
      </button>
    </div>
  );
};

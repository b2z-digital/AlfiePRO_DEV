import React, { useState, useEffect } from 'react';
import { Users, X, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const MembersCountWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [memberCount, setMemberCount] = useState(0);
  const [participationRate, setParticipationRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchMemberData();
  }, [currentClub]);

  const fetchMemberData = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      // Fetch all members with active membership status
      const { data, error } = await supabase
        .from('members')
        .select('id, membership_status, payment_status')
        .eq('club_id', currentClub.clubId)
        .in('membership_status', ['active', 'pending', 'expired']);

      if (error) throw error;

      // Count active members only
      const activeMembers = data?.filter(m => m.membership_status === 'active') || [];
      const count = activeMembers.length;
      setMemberCount(count);

      // Calculate participation rate (active vs all non-archived members)
      if (data && data.length > 0) {
        const rate = Math.round((count / data.length) * 100);
        setParticipationRate(rate);
      } else {
        setParticipationRate(0);
      }
    } catch (err) {
      console.error('Error fetching member data:', err);
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
          <div className="p-3 rounded-xl bg-blue-500/20">
            <Users className="text-blue-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Club Members</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading ? '...' : memberCount}
          </p>
          <p className="text-xs text-slate-400">
            {memberCount > 0 ? `${participationRate}% participation rate` : 'No members yet'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <BarChart2 className="text-blue-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};

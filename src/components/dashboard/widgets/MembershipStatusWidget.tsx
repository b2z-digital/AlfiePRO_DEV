import React, { useState, useEffect } from 'react';
import { Users, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const MembershipStatusWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [membershipData, setMembershipData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchMembershipData();
  }, [currentClub]);

  const fetchMembershipData = async () => {
    if (!currentClub?.clubId || !navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const [membersResult, applicationsResult] = await Promise.all([
        supabase
          .from('members')
          .select('id, membership_status')
          .eq('club_id', currentClub.clubId)
          .eq('membership_status', 'active'),
        supabase
          .from('membership_applications')
          .select('id, status')
          .eq('club_id', currentClub.clubId)
          .eq('status', 'pending')
      ]);

      const pending = applicationsResult.data?.length || 0;

      setMembershipData({
        expiringCount: 0,
        unpaidCount: 0,
        pendingApplications: pending,
        totalMembers: membersResult.data?.length || 0
      });
    } catch (err) {
      console.error('Error fetching membership data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      navigate('/membership-dashboard');
    }
  };

  return (
    <div
      onClick={!isEditMode ? handleClick : undefined}
      className={`
        relative rounded-2xl p-4 text-left transition-all w-full h-full
        ${isEditMode ? 'cursor-auto' : 'cursor-pointer transform hover:scale-105'}
        ${darkMode
          ? `border backdrop-blur-sm ${themeColors.background} ${!isEditMode ? 'hover:bg-slate-700/40' : ''}`
          : `bg-white shadow-xl ${!isEditMode ? 'hover:shadow-2xl' : ''}`}
        ${isEditMode ? 'animate-wiggle' : ''}
      `}
    >
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Remove button clicked for widget');
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className={darkMode ? "text-purple-400" : "text-purple-500"} size={18} />
          <h2 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-700'}`}>Membership Status</h2>
        </div>
        {!isEditMode && <ChevronRight size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />}
      </div>

      {loading ? (
        <div className="text-center py-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto"></div>
        </div>
      ) : membershipData ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className={`text-xl font-bold ${darkMode ? 'text-amber-400' : 'text-amber-500'}`}>{membershipData.expiringCount}</div>
              <div className="text-[10px] text-slate-400">Expiring</div>
            </div>
            <div>
              <div className={`text-xl font-bold ${darkMode ? 'text-red-400' : 'text-red-500'}`}>{membershipData.unpaidCount}</div>
              <div className="text-[10px] text-slate-400">Unpaid</div>
            </div>
            <div>
              <div className={`text-xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-500'}`}>{membershipData.pendingApplications}</div>
              <div className="text-[10px] text-slate-400">Pending</div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-700/30">
            <div className="flex items-center justify-between text-xs">
              <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Total Active Members</span>
              <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{membershipData.totalMembers}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-3">
          <Users className="mx-auto mb-2 text-slate-500" size={24} />
          <p className="text-sm text-slate-400">No membership data</p>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Users, X, ChartBar as BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { useOrganizationContext, getContextLabel } from '../../../hooks/useOrganizationContext';

export const MembersCountWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const orgContext = useOrganizationContext();
  const [memberCount, setMemberCount] = useState(0);
  const [participationRate, setParticipationRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    if (!orgContext.isLoading) {
      fetchMemberData();
    }
  }, [orgContext.clubIds, orgContext.isLoading]);

  const fetchMemberData = async () => {
    if (orgContext.clubIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      // Fetch all non-archived/non-cancelled members across all clubs
      const { data, error } = await supabase
        .from('members')
        .select('id, membership_status, is_financial')
        .in('club_id', orgContext.clubIds)
        .or('membership_status.eq.active,membership_status.eq.expired,membership_status.is.null');

      if (error) throw error;

      const allMembers = data || [];
      const count = allMembers.length;
      setMemberCount(count);

      // Participation rate = financial members / total members
      const financialCount = allMembers.filter(m => m.is_financial).length;
      if (count > 0) {
        setParticipationRate(Math.round((financialCount / count) * 100));
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
        onClick={() => {
          if (!isEditMode) {
            // Navigate to association members page for state/national, or club members for individual clubs
            if (orgContext.type === 'state' || orgContext.type === 'national') {
              navigate('/association-members');
            } else {
              navigate('/membership-dashboard?tab=members');
            }
          }
        }}
        disabled={isEditMode}
        className={`a-wstat relative rounded-2xl text-left transition-all w-full h-full flex items-center border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer'}`}
      >
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><Users size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">{orgContext.type === 'club' ? 'Club' : 'Association'} Members</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading || orgContext.isLoading ? '...' : memberCount}
          </p>
          <p className="a-mute text-[12.5px]">
            {memberCount > 0 ? `${participationRate}% participation rate` : 'No members yet'}
          </p>
        </div>
      </button>
    </div>
  );
};

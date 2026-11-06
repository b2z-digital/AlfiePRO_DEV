import React, { useState, useEffect } from 'react';
import { Building2, X, ChartBar as BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { useOrganizationContext, getContextLabel } from '../../../hooks/useOrganizationContext';

export const ClubsCountWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const orgContext = useOrganizationContext();
  const [clubCount, setClubCount] = useState(0);
  const [activeRate, setActiveRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    if (!orgContext.isLoading) {
      fetchClubData();
    }
  }, [orgContext.clubIds, orgContext.isLoading]);

  const fetchClubData = async () => {
    try {
      console.log('📊 Fetching club count for:', {
        type: orgContext.type,
        orgId: orgContext.currentOrganization?.id,
        clubIds: orgContext.clubIds,
        clubIdsLength: orgContext.clubIds.length
      });

      // Only show this widget for state or national associations
      if (orgContext.type === 'club' || orgContext.clubIds.length === 0) {
        console.log('⚠️ Widget not applicable for club view or no clubs found');
        setLoading(false);
        return;
      }

      // Use the clubIds from the organization context (same approach as MembersCountWidget)
      const { data, error } = await supabase
        .from('clubs')
        .select('id, subscription_tier, onboarding_completed, created_at')
        .in('id', orgContext.clubIds)
        .neq('is_test', true);

      if (error) {
        console.error('❌ Error fetching clubs:', error);
        throw error;
      }

      const totalClubs = data?.length || 0;
      setClubCount(totalClubs);

      console.log(`🏢 Found ${totalClubs} clubs from clubIds:`, orgContext.clubIds);
      console.log('📋 Club details:', data?.map(c => ({
        id: c.id,
        tier: c.subscription_tier,
        onboarded: c.onboarding_completed
      })));

      // Calculate active rate
      // For associations: all member clubs are considered "active" (100%)
      // They're in the association's member list, so they're active by definition
      if (data && data.length > 0) {
        setActiveRate(100);
        console.log(`📊 All ${data.length} member clubs are active`);
      } else {
        setActiveRate(0);
      }
    } catch (err) {
      console.error('❌ Error fetching club data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!isEditMode) {
      // Both state and national associations use the same /clubs route
      navigate('/clubs');
    }
  };

  // Don't render this widget for individual clubs
  if (orgContext.type === 'club') {
    return null;
  }

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
        onClick={handleNavigate}
        disabled={isEditMode}
        className={`a-wstat relative rounded-2xl text-left transition-all w-full h-full flex items-center border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer'}`}
      >
        <span className="a-tile flex-shrink-0" style={{ width: 48, height: 48 }}><Building2 size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="a-mute text-[12.5px]">Association Clubs</p>
          <p className="a-num a-ink text-[28px] font-semibold leading-[1.1]">
            {loading || orgContext.isLoading ? '...' : clubCount}
          </p>
          <p className="a-mute text-[12.5px]">
            {clubCount > 0 ? `${clubCount} active member ${clubCount === 1 ? 'club' : 'clubs'}` : 'No clubs yet'}
          </p>
        </div>
      </button>
    </div>
  );
};

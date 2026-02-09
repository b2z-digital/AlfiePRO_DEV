import React, { useState, useEffect } from 'react';
import { Building2, X, BarChart2 } from 'lucide-react';
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
        .select('id, subscription_tier')
        .in('id', orgContext.clubIds);

      if (error) {
        console.error('❌ Error fetching clubs:', error);
        throw error;
      }

      const totalClubs = data?.length || 0;
      setClubCount(totalClubs);

      console.log(`🏢 Found ${totalClubs} clubs from clubIds:`, orgContext.clubIds);

      // Calculate active rate (clubs with active subscriptions)
      if (data && data.length > 0) {
        const activeClubs = data.filter(c => c.subscription_tier && c.subscription_tier !== 'trial').length;
        const rate = Math.round((activeClubs / data.length) * 100);
        setActiveRate(rate);
        console.log(`📊 Active rate: ${activeClubs}/${data.length} = ${rate}%`);
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
        className={`relative rounded-2xl p-4 text-left transition-all w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer transform hover:scale-[1.02]'}`}
      >
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-purple-500/20">
            <Building2 className="text-purple-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Member Clubs</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading || orgContext.isLoading ? '...' : clubCount}
          </p>
          <p className="text-xs text-slate-400">
            {clubCount > 0 ? `${activeRate}% active subscriptions` : 'No clubs yet'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <BarChart2 className="text-purple-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};

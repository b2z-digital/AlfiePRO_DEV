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
  }, [orgContext.currentOrganization, orgContext.isLoading]);

  const fetchClubData = async () => {
    try {
      console.log('📊 Fetching club count for:', orgContext.currentOrganization);

      // Only show this widget for state or national associations
      if (!orgContext.currentOrganization) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('clubs')
        .select('id, subscription_status', { count: 'exact' });

      // Filter based on organization type
      if (orgContext.type === 'state') {
        query = query.eq('state_association_id', orgContext.currentOrganization.id);
      } else if (orgContext.type === 'national') {
        query = query.eq('national_association_id', orgContext.currentOrganization.id);
      } else {
        // This widget is only for associations, not individual clubs
        setLoading(false);
        return;
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const totalClubs = count || 0;
      setClubCount(totalClubs);

      // Calculate active rate (clubs with active subscriptions)
      if (data && data.length > 0) {
        const activeClubs = data.filter(c => c.subscription_status === 'active').length;
        const rate = Math.round((activeClubs / data.length) * 100);
        setActiveRate(rate);
      } else {
        setActiveRate(0);
      }

      console.log(`🏢 Found ${totalClubs} clubs, ${activeRate}% active`);
    } catch (err) {
      console.error('Error fetching club data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!isEditMode) {
      if (orgContext.type === 'state') {
        navigate('/state-dashboard/clubs');
      } else if (orgContext.type === 'national') {
        navigate('/national-dashboard/clubs');
      }
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

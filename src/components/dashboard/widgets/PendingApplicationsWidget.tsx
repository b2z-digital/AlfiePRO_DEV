import React, { useState, useEffect } from 'react';
import { UserCheck, X, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';

export const PendingApplicationsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const orgContext = useOrganizationContext();
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    if (!orgContext.isLoading) {
      fetchPendingApplications();
    }
  }, [orgContext.clubIds, orgContext.isLoading]);

  const fetchPendingApplications = async () => {
    if (orgContext.clubIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      console.log('📊 Fetching pending applications for:', {
        type: orgContext.type,
        orgId: orgContext.currentOrganization?.id,
        clubIds: orgContext.clubIds,
        clubIdsLength: orgContext.clubIds.length
      });

      const { count, error } = await supabase
        .from('membership_applications')
        .select('id', { count: 'exact', head: true })
        .in('club_id', orgContext.clubIds)
        .eq('status', 'pending')
        .eq('is_draft', false);

      if (error) throw error;

      console.log(`📋 Found ${count || 0} pending applications across ${orgContext.clubIds.length} clubs`);
      setPendingCount(count || 0);
    } catch (err) {
      console.error('Error fetching pending applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      // Navigate to association members page for state/national, or club membership for individual clubs
      if (orgContext.type === 'state' || orgContext.type === 'national') {
        navigate('/association-members', { state: { activeTab: 'applications', filterStatus: 'pending' } });
      } else {
        navigate('/membership', { state: { activeTab: 'applications', filterStatus: 'pending' } });
      }
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
        className={`relative rounded-2xl p-4 text-left transition-all w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer transform hover:scale-[1.02]'}`}
      >
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-amber-500/20">
            <UserCheck className="text-amber-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">{orgContext.type === 'club' ? 'Pending Applications' : 'Pending Club Memberships'}</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading || orgContext.isLoading ? '...' : pendingCount}
          </p>
          <p className="text-xs text-slate-400">
            {pendingCount > 0
              ? `${pendingCount} pending ${pendingCount === 1 ? 'application' : 'applications'}`
              : 'No pending applications'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <Activity className="text-amber-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};

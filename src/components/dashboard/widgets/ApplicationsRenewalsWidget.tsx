import React, { useState, useEffect } from 'react';
import { UserPlus, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { useNavigate } from 'react-router-dom';

interface ApplicationsRenewalsWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

interface Stats {
  pendingApplications: number;
  upcomingRenewals: number;
}

export const ApplicationsRenewalsWidget: React.FC<ApplicationsRenewalsWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    pendingApplications: 0,
    upcomingRenewals: 0
  });

  useEffect(() => {
    if (currentClub?.clubId) {
      loadStats();
    }
  }, [currentClub]);

  const loadStats = async () => {
    if (!currentClub?.clubId) return;

    try {
      // Get pending applications
      const { data: applications } = await supabase
        .from('membership_applications')
        .select('id')
        .eq('club_id', currentClub.clubId)
        .eq('status', 'pending');

      // Get members with upcoming renewals (within 30 days)
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { data: renewals } = await supabase
        .from('members')
        .select('id, membership_expiry')
        .eq('club_id', currentClub.clubId)
        .eq('membership_status', 'active')
        .not('membership_expiry', 'is', null)
        .lte('membership_expiry', thirtyDaysFromNow.toISOString())
        .gte('membership_expiry', now.toISOString());

      setStats({
        pendingApplications: applications?.length || 0,
        upcomingRenewals: renewals?.length || 0
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (tab: string) => {
    if (!isEditMode) {
      navigate(`/membership?tab=${tab}`);
    }
  };

  const hasAlerts = stats.pendingApplications > 0 || stats.upcomingRenewals > 0;

  return (
    <div className="h-full rounded-xl border backdrop-blur-sm p-6 bg-slate-800/30 border-slate-700/50 relative">
      {isEditMode && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors z-10"
          title="Remove widget"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-orange-600/20">
          <AlertCircle className="text-orange-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Applications & Renewals</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Pending Applications */}
          <div
            onClick={() => handleNavigate('applications')}
            className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
              stats.pendingApplications > 0
                ? 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20 cursor-pointer'
                : 'bg-slate-800/50 border-slate-700/30'
            } ${isEditMode ? 'cursor-default' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-600/20">
                <UserPlus className="text-orange-400" size={20} />
              </div>
              <div>
                <div className="text-sm font-medium text-white">Pending Applications</div>
                <div className="text-xs text-slate-400">Awaiting review</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${
                stats.pendingApplications > 0 ? 'text-orange-400' : 'text-slate-400'
              }`}>
                {stats.pendingApplications}
              </span>
              {stats.pendingApplications > 0 && (
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
              )}
            </div>
          </div>

          {/* Upcoming Renewals */}
          <div
            onClick={() => handleNavigate('renewals')}
            className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
              stats.upcomingRenewals > 0
                ? 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 cursor-pointer'
                : 'bg-slate-800/50 border-slate-700/30'
            } ${isEditMode ? 'cursor-default' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-600/20">
                <Calendar className="text-yellow-400" size={20} />
              </div>
              <div>
                <div className="text-sm font-medium text-white">Upcoming Renewals</div>
                <div className="text-xs text-slate-400">Due within 30 days</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${
                stats.upcomingRenewals > 0 ? 'text-yellow-400' : 'text-slate-400'
              }`}>
                {stats.upcomingRenewals}
              </span>
              {stats.upcomingRenewals > 0 && (
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
              )}
            </div>
          </div>

          {!hasAlerts && (
            <div className="text-center py-4 text-sm text-slate-400">
              All caught up! No pending items.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

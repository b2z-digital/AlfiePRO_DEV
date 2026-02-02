import React, { useState, useEffect } from 'react';
import { Users, UserCheck, Calendar, UserPlus, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';

interface MembershipOverviewWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

interface MembershipStats {
  total: number;
  active: number;
  pendingRenewals: number;
  newThisMonth: number;
}

export const MembershipOverviewWidget: React.FC<MembershipOverviewWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MembershipStats>({
    total: 0,
    active: 0,
    pendingRenewals: 0,
    newThisMonth: 0
  });

  useEffect(() => {
    console.log('[MembershipOverviewWidget] MOUNT/UPDATE - Timestamp:', new Date().toISOString());
    console.log('[MembershipOverviewWidget] currentClub:', currentClub);
    console.log('[MembershipOverviewWidget] clubId:', currentClub?.clubId);
    if (currentClub?.clubId) {
      console.log('[MembershipOverviewWidget] Calling loadMembershipStats...');
      loadMembershipStats();
    } else {
      console.log('[MembershipOverviewWidget] No valid clubId, setting loading to false');
      setLoading(false);
    }
  }, [currentClub]);

  const loadMembershipStats = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      console.log('[MembershipOverviewWidget] Fetching members for clubId:', currentClub.clubId);

      // Note: RLS policy allows viewing 'active' members or NULL status
      const { data: members, error } = await supabase
        .from('members')
        .select('id, membership_status, created_at, is_financial, renewal_date')
        .eq('club_id', currentClub.clubId)
        .or('membership_status.eq.active,membership_status.is.null');

      console.log('[MembershipOverviewWidget] Query result:', {
        members,
        error,
        count: members?.length,
        firstMember: members?.[0]
      });

      if (error) {
        console.error('MembershipOverviewWidget - Error fetching members:', error);
        setLoading(false);
        return;
      }

      if (members) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        const total = members.length;
        const active = members.filter(m => m.is_financial).length;
        const newThisMonth = members.filter(m =>
          new Date(m.created_at) >= startOfMonth
        ).length;

        // Members with renewal dates in the next 30 days
        const pendingRenewals = members.filter(m => {
          if (!m.renewal_date) return false;
          const renewalDate = new Date(m.renewal_date);
          return renewalDate > now && renewalDate <= thirtyDaysFromNow;
        }).length;

        const calculatedStats = {
          total,
          active,
          pendingRenewals,
          newThisMonth
        };

        console.log('[MembershipOverviewWidget] ✅ Calculated stats:', calculatedStats);
        setStats(calculatedStats);
      }
    } catch (error) {
      console.error('[MembershipOverviewWidget] ❌ Error loading membership stats:', error);
    } finally {
      console.log('[MembershipOverviewWidget] Setting loading to false');
      setLoading(false);
    }
  };

  const statCards = [
    {
      label: 'Total Members',
      value: stats.total,
      icon: Users,
      color: 'blue'
    },
    {
      label: 'Active Members',
      value: stats.active,
      icon: UserCheck,
      color: 'green'
    },
    {
      label: 'Pending Renewals',
      value: stats.pendingRenewals,
      icon: Calendar,
      color: 'yellow'
    },
    {
      label: 'New This Month',
      value: stats.newThisMonth,
      icon: UserPlus,
      color: 'purple'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-600/20 text-blue-400',
      green: 'bg-green-600/20 text-green-400',
      yellow: 'bg-yellow-600/20 text-yellow-400',
      purple: 'bg-purple-600/20 text-purple-400'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="h-full rounded-xl border backdrop-blur-sm p-6 bg-slate-800/30 border-slate-700/50 relative">
      {isEditMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors"
          title="Remove widget"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-blue-600/20">
          <Users className="text-blue-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Membership Overview</h3>
        {!currentClub?.clubId && (
          <span className="text-xs text-red-400">(No Club)</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="flex flex-col gap-2 p-4 rounded-lg bg-slate-800/50 border border-slate-700/30"
              >
                <div className={`p-2 rounded-lg w-fit ${getColorClasses(stat.color)}`}>
                  <Icon size={20} />
                </div>
                <div className="text-2xl font-bold text-white">
                  {stat.value}
                </div>
                <div className="text-sm text-slate-400">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

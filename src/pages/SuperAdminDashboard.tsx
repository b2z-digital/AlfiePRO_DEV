import { useState, useEffect } from 'react';
import {
  Shield, Globe, Building, MapPin, Activity, Users, TrendingUp
} from 'lucide-react';
import { supabase } from '../utils/supabase';

interface PlatformStats {
  totalClubs: number;
  totalMembers: number;
  totalStateAssociations: number;
  totalNationalAssociations: number;
  totalEvents: number;
  totalRaces: number;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>({
    totalClubs: 0,
    totalMembers: 0,
    totalStateAssociations: 0,
    totalNationalAssociations: 0,
    totalEvents: 0,
    totalRaces: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlatformStats();
  }, []);

  const loadPlatformStats = async () => {
    try {
      const [clubsRes, membersRes, stateRes, nationalRes, eventsRes, racesRes] = await Promise.allSettled([
        supabase.from('clubs').select('id', { count: 'exact', head: true }),
        supabase.from('members').select('id', { count: 'exact', head: true }),
        supabase.from('state_associations').select('id', { count: 'exact', head: true }),
        supabase.from('national_associations').select('id', { count: 'exact', head: true }),
        supabase.from('public_events').select('id', { count: 'exact', head: true }),
        supabase.from('quick_races').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalClubs: clubsRes.status === 'fulfilled' ? (clubsRes.value.count || 0) : 0,
        totalMembers: membersRes.status === 'fulfilled' ? (membersRes.value.count || 0) : 0,
        totalStateAssociations: stateRes.status === 'fulfilled' ? (stateRes.value.count || 0) : 0,
        totalNationalAssociations: nationalRes.status === 'fulfilled' ? (nationalRes.value.count || 0) : 0,
        totalEvents: eventsRes.status === 'fulfilled' ? (eventsRes.value.count || 0) : 0,
        totalRaces: racesRes.status === 'fulfilled' ? (racesRes.value.count || 0) : 0,
      });
    } catch (err) {
      console.error('Error loading platform stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Clubs', value: stats.totalClubs, icon: Building, gradient: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', iconColor: 'text-emerald-400', iconBg: 'from-emerald-500/20 to-emerald-600/20' },
    { label: 'Members', value: stats.totalMembers, icon: Users, gradient: 'from-blue-500/20 to-blue-700/20', border: 'border-blue-500/30', iconColor: 'text-blue-400', iconBg: 'from-blue-500/20 to-blue-600/20' },
    { label: 'State Associations', value: stats.totalStateAssociations, icon: MapPin, gradient: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', iconColor: 'text-amber-400', iconBg: 'from-amber-500/20 to-amber-600/20' },
    { label: 'National Associations', value: stats.totalNationalAssociations, icon: Globe, gradient: 'from-rose-500/20 to-rose-700/20', border: 'border-rose-500/30', iconColor: 'text-rose-400', iconBg: 'from-rose-500/20 to-rose-600/20' },
    { label: 'Events', value: stats.totalEvents, icon: Activity, gradient: 'from-cyan-500/20 to-cyan-700/20', border: 'border-cyan-500/30', iconColor: 'text-cyan-400', iconBg: 'from-cyan-500/20 to-cyan-600/20' },
    { label: 'Races', value: stats.totalRaces, icon: TrendingUp, gradient: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', iconColor: 'text-sky-400', iconBg: 'from-sky-500/20 to-sky-600/20' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500/20 to-cyan-500/20 border border-sky-500/30">
            <Shield className="text-sky-400" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              AlfiePRO Management
            </h1>
            <p className="text-sm text-slate-400">
              Platform administration and control center
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {statCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-2xl border p-5 backdrop-blur-sm bg-gradient-to-br ${card.gradient} ${card.border} transition-all hover:scale-[1.02]`}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${card.iconBg} border ${card.border}`}>
                  <card.icon size={16} className={card.iconColor} />
                </div>
              </div>
              <p className="text-3xl font-bold text-white mb-1">
                {loading ? '...' : card.value.toLocaleString()}
              </p>
              <p className="text-xs font-medium text-slate-400">
                {card.label}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Welcome to AlfiePRO Management</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Use the navigation on the left to access platform management tools including usage analytics,
              billing configuration, feature access controls, database backups, and user management.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Platform Health</h3>
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Database Status</span>
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Active Organizations</span>
                <span className="text-sm font-medium text-white">{loading ? '...' : stats.totalClubs + stats.totalStateAssociations + stats.totalNationalAssociations}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total Users</span>
                <span className="text-sm font-medium text-white">{loading ? '...' : stats.totalMembers}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

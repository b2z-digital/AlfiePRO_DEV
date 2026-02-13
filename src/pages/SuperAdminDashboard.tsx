import { useState, useEffect } from 'react';
import {
  BarChart3, DollarSign, ToggleLeft, Database, Users, Shield,
  TrendingUp, Globe, Building, MapPin, ChevronRight, Activity
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { UsageStatisticsTab } from '../components/super-admin/UsageStatisticsTab';
import { PlatformBillingTab } from '../components/super-admin/PlatformBillingTab';
import { FeatureAccessTab } from '../components/super-admin/FeatureAccessTab';
import { BackupManagementTab } from '../components/super-admin/BackupManagementTab';
import { UserManagementTab } from '../components/super-admin/UserManagementTab';

interface PlatformStats {
  totalClubs: number;
  totalMembers: number;
  totalStateAssociations: number;
  totalNationalAssociations: number;
  totalEvents: number;
  totalRaces: number;
  activeUsers30d: number;
}

const tabs = [
  { id: 'usage', label: 'Usage Statistics', icon: BarChart3, shortLabel: 'Usage' },
  { id: 'billing', label: 'Platform Billing', icon: DollarSign, shortLabel: 'Billing' },
  { id: 'features', label: 'Feature Access', icon: ToggleLeft, shortLabel: 'Features' },
  { id: 'backups', label: 'Backup Management', icon: Database, shortLabel: 'Backups' },
  { id: 'users', label: 'User Management', icon: Users, shortLabel: 'Users' },
] as const;

type TabId = typeof tabs[number]['id'];

interface SuperAdminDashboardProps {
  darkMode: boolean;
}

export default function SuperAdminDashboard({ darkMode }: SuperAdminDashboardProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('usage');
  const [stats, setStats] = useState<PlatformStats>({
    totalClubs: 0,
    totalMembers: 0,
    totalStateAssociations: 0,
    totalNationalAssociations: 0,
    totalEvents: 0,
    totalRaces: 0,
    activeUsers30d: 0,
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
        activeUsers30d: 0,
      });
    } catch (err) {
      console.error('Error loading platform stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Clubs', value: stats.totalClubs, icon: Building, color: 'emerald' },
    { label: 'Members', value: stats.totalMembers, icon: Users, color: 'sky' },
    { label: 'State Assoc.', value: stats.totalStateAssociations, icon: MapPin, color: 'amber' },
    { label: 'National Assoc.', value: stats.totalNationalAssociations, icon: Globe, color: 'rose' },
    { label: 'Events', value: stats.totalEvents, icon: Activity, color: 'cyan' },
  ];

  const colorMap: Record<string, { bg: string; text: string; border: string; darkBg: string }> = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20', darkBg: 'bg-emerald-500/20' },
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-500', border: 'border-sky-500/20', darkBg: 'bg-sky-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20', darkBg: 'bg-amber-500/20' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-500', border: 'border-rose-500/20', darkBg: 'bg-rose-500/20' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-500', border: 'border-cyan-500/20', darkBg: 'bg-cyan-500/20' },
  };

  return (
    <div className="min-h-screen">
      <div className={`border-b ${darkMode ? 'border-slate-700/50 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 py-6">
            <div className={`p-2.5 rounded-xl ${darkMode ? 'bg-gradient-to-br from-sky-500/20 to-cyan-500/20 border border-sky-500/30' : 'bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-200'}`}>
              <Shield className={`${darkMode ? 'text-sky-400' : 'text-sky-600'}`} size={28} />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                AlfiePRO Management
              </h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Platform administration and control center
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pb-6">
            {statCards.map((card) => {
              const colors = colorMap[card.color];
              return (
                <div
                  key={card.label}
                  className={`rounded-xl border p-4 transition-all ${
                    darkMode
                      ? `${colors.darkBg} ${colors.border} border-opacity-30`
                      : `${colors.bg} ${colors.border}`
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <card.icon size={16} className={colors.text} />
                    <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {card.label}
                    </span>
                  </div>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {loading ? '...' : card.value.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`sticky top-0 z-20 border-b ${darkMode ? 'border-slate-700/50 bg-slate-900/95 backdrop-blur-xl' : 'border-slate-200 bg-white/95 backdrop-blur-xl'}`}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide py-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? darkMode
                        ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                        : 'bg-sky-50 text-sky-700 border border-sky-200'
                      : darkMode
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <tab.icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'usage' && <UsageStatisticsTab darkMode={darkMode} stats={stats} loading={loading} />}
        {activeTab === 'billing' && <PlatformBillingTab darkMode={darkMode} />}
        {activeTab === 'features' && <FeatureAccessTab darkMode={darkMode} />}
        {activeTab === 'backups' && <BackupManagementTab darkMode={darkMode} />}
        {activeTab === 'users' && <UserManagementTab darkMode={darkMode} />}
      </div>
    </div>
  );
}

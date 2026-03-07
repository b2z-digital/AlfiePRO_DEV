import { useState, useEffect, useCallback } from 'react';
import {
  Users, Clock, Eye, Activity, ChevronDown, ChevronUp,
  Calendar, RefreshCw, Search, ArrowUpDown, Zap, LogIn
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { supabase } from '../../utils/supabase';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

interface UserActivityViewProps {
  darkMode: boolean;
}

interface UserEngagement {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  total_sessions: number;
  total_page_views: number;
  active_days: number;
  last_active: string | null;
  first_seen: string | null;
  last_sign_in: string | null;
  sections_used: number;
  top_sections: { section: string; views: number }[];
  clubs: { club_id: string; club_name: string; role: string }[];
  daily_activity: { day: string; sessions: number; page_views: number }[];
}

type DateRange = '7d' | '30d' | '90d' | 'year';
type SortField = 'sessions' | 'page_views' | 'active_days' | 'last_active' | 'name';

const SECTION_LABELS: Record<string, string> = {
  races: 'Races', membership: 'Membership', finances: 'Finances', events: 'Events',
  settings: 'Settings', media: 'Media', comms: 'Comms', community: 'Community',
  website: 'Website', meetings: 'Meetings', tasks: 'Tasks', documents: 'Documents',
  classifieds: 'Classifieds', weather: 'Weather', livestream: 'Livestream',
  tracking: 'Tracking', alfietv: 'AlfieTV', marketing: 'Marketing', news: 'News',
  garage: 'Garage', results: 'Results', calendar: 'Calendar', dashboard: 'Dashboard',
  admin: 'Admin', other: 'Other',
};

const SECTION_COLORS: Record<string, string> = {
  races: '#0ea5e9', membership: '#10b981', finances: '#f59e0b', events: '#ef4444',
  settings: '#64748b', media: '#06b6d4', comms: '#ec4899', community: '#84cc16',
  website: '#f97316', meetings: '#14b8a6', tasks: '#e11d48', documents: '#0284c7',
  dashboard: '#0ea5e9', admin: '#64748b', other: '#94a3b8',
};

function getDateRange(range: DateRange): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  switch (range) {
    case '7d': start.setDate(end.getDate() - 7); break;
    case '30d': start.setDate(end.getDate() - 30); break;
    case '90d': start.setDate(end.getDate() - 90); break;
    case 'year': start.setFullYear(end.getFullYear() - 1); break;
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function getEngagementLevel(sessions: number, pageViews: number, activeDays: number): { label: string; color: string; score: number } {
  const score = Math.min(100, Math.round(
    (Math.min(sessions, 50) / 50) * 30 +
    (Math.min(pageViews, 500) / 500) * 40 +
    (Math.min(activeDays, 30) / 30) * 30
  ));
  if (score >= 70) return { label: 'Power User', color: 'emerald', score };
  if (score >= 40) return { label: 'Active', color: 'sky', score };
  if (score >= 15) return { label: 'Moderate', color: 'amber', score };
  return { label: 'Low', color: 'slate', score };
}

export function UserActivityView({ darkMode }: UserActivityViewProps) {
  const [users, setUsers] = useState<UserEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [sortField, setSortField] = useState<SortField>('sessions');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const loadUserActivity = useCallback(async () => {
    try {
      const { start, end } = getDateRange(dateRange);

      const { data, error } = await supabase.rpc('get_user_engagement_details', {
        period_start: start,
        period_end: end,
      });

      if (error) {
        console.error('RPC error, falling back to direct queries:', error);
        await loadFallbackData(start, end);
        return;
      }

      if (Array.isArray(data)) {
        setUsers(data as UserEngagement[]);
      } else {
        setUsers([]);
      }
    } catch (err) {
      console.error('Error loading user activity:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  const loadFallbackData = async (startDate: string, endDate: string) => {
    try {
      const [sessionsRes, pageViewsRes] = await Promise.all([
        supabase
          .from('platform_sessions')
          .select('id, user_id, started_at, last_active_at')
          .gte('started_at', startDate)
          .lt('started_at', endDate),
        supabase
          .from('platform_page_views')
          .select('id, user_id, page_section, viewed_at')
          .gte('viewed_at', startDate)
          .lt('viewed_at', endDate),
      ]);

      const sessions = sessionsRes.data || [];
      const pageViews = pageViewsRes.data || [];

      const userMap: Record<string, {
        sessions: number;
        pageViews: number;
        activeDays: Set<string>;
        lastActive: string;
        firstSeen: string;
        sections: Record<string, number>;
      }> = {};

      sessions.forEach((s: any) => {
        if (!userMap[s.user_id]) {
          userMap[s.user_id] = {
            sessions: 0, pageViews: 0, activeDays: new Set(),
            lastActive: s.started_at, firstSeen: s.started_at, sections: {},
          };
        }
        userMap[s.user_id].sessions++;
        userMap[s.user_id].activeDays.add(new Date(s.started_at).toISOString().split('T')[0]);
        if (s.started_at > userMap[s.user_id].lastActive) userMap[s.user_id].lastActive = s.started_at;
        if (s.started_at < userMap[s.user_id].firstSeen) userMap[s.user_id].firstSeen = s.started_at;
      });

      pageViews.forEach((pv: any) => {
        if (!userMap[pv.user_id]) {
          userMap[pv.user_id] = {
            sessions: 0, pageViews: 0, activeDays: new Set(),
            lastActive: pv.viewed_at, firstSeen: pv.viewed_at, sections: {},
          };
        }
        userMap[pv.user_id].pageViews++;
        userMap[pv.user_id].activeDays.add(new Date(pv.viewed_at).toISOString().split('T')[0]);
        const sec = pv.page_section || 'other';
        userMap[pv.user_id].sections[sec] = (userMap[pv.user_id].sections[sec] || 0) + 1;
        if (pv.viewed_at > userMap[pv.user_id].lastActive) userMap[pv.user_id].lastActive = pv.viewed_at;
      });

      const userIds = Object.keys(userMap);
      let profiles: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);
        (profileData || []).forEach((p: any) => { profiles[p.id] = p; });
      }

      const fallbackUsers: UserEngagement[] = userIds.map(uid => {
        const u = userMap[uid];
        const topSections = Object.entries(u.sections)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([section, views]) => ({ section, views }));

        return {
          user_id: uid,
          full_name: profiles[uid]?.full_name || null,
          email: null,
          avatar_url: profiles[uid]?.avatar_url || null,
          total_sessions: u.sessions,
          total_page_views: u.pageViews,
          active_days: u.activeDays.size,
          last_active: u.lastActive,
          first_seen: u.firstSeen,
          last_sign_in: null,
          sections_used: Object.keys(u.sections).length,
          top_sections: topSections,
          clubs: [],
          daily_activity: [],
        };
      });

      setUsers(fallbackUsers.sort((a, b) => b.total_sessions - a.total_sessions));
    } catch (err) {
      console.error('Fallback loading error:', err);
      setUsers([]);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadUserActivity();
  }, [loadUserActivity]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadUserActivity();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.full_name?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q)) ||
      (u.clubs?.some(c => c.club_name.toLowerCase().includes(q)))
    );
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    switch (sortField) {
      case 'sessions': return (a.total_sessions - b.total_sessions) * dir;
      case 'page_views': return (a.total_page_views - b.total_page_views) * dir;
      case 'active_days': return (a.active_days - b.active_days) * dir;
      case 'last_active':
        return ((new Date(a.last_active || 0).getTime()) - (new Date(b.last_active || 0).getTime())) * dir;
      case 'name':
        return ((a.full_name || '').localeCompare(b.full_name || '')) * dir;
      default: return 0;
    }
  });

  const totalSessions = users.reduce((sum, u) => sum + u.total_sessions, 0);
  const totalPageViews = users.reduce((sum, u) => sum + u.total_page_views, 0);
  const avgSessionsPerUser = users.length > 0 ? (totalSessions / users.length).toFixed(1) : '0';

  const dateRangeLabels: Record<DateRange, string> = {
    '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last 90 Days', 'year': 'Last 12 Months',
  };

  const cardClass = `rounded-2xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`;

  const chartColors = {
    grid: darkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.15)',
    text: darkMode ? '#94a3b8' : '#64748b',
    tooltipBg: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: darkMode ? '#e2e8f0' : '#334155',
    tooltipBorder: darkMode ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 lg:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search users, emails, clubs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-lg text-sm border transition-all ${
                darkMode
                  ? 'bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500 focus:border-sky-500/50'
                  : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-sky-500'
              } outline-none`}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '30d', '90d', 'year'] as DateRange[]).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateRange === range
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {dateRangeLabels[range]}
            </button>
          ))}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`p-2 rounded-lg transition-all ${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Users', value: users.length, icon: Users, color: 'emerald' },
          { label: 'Total Sessions', value: totalSessions, icon: LogIn, color: 'sky' },
          { label: 'Total Page Views', value: totalPageViews, icon: Eye, color: 'amber' },
          { label: 'Avg Sessions/User', value: avgSessionsPerUser, icon: Zap, color: 'cyan' },
        ].map(card => (
          <div
            key={card.label}
            className={`rounded-2xl border p-4 backdrop-blur-sm transition-all hover:scale-[1.02] ${
              darkMode
                ? `bg-gradient-to-br from-${card.color}-500/20 to-${card.color}-700/20 border-${card.color}-500/30`
                : `bg-${card.color}-50 border-${card.color}-200`
            }`}
            style={{
              background: darkMode
                ? `linear-gradient(135deg, rgba(${card.color === 'emerald' ? '16,185,129' : card.color === 'sky' ? '14,165,233' : card.color === 'amber' ? '245,158,11' : '6,182,212'}, 0.15), rgba(${card.color === 'emerald' ? '16,185,129' : card.color === 'sky' ? '14,165,233' : card.color === 'amber' ? '245,158,11' : '6,182,212'}, 0.05))`
                : undefined,
              borderColor: darkMode
                ? `rgba(${card.color === 'emerald' ? '16,185,129' : card.color === 'sky' ? '14,165,233' : card.color === 'amber' ? '245,158,11' : '6,182,212'}, 0.3)`
                : undefined,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <card.icon size={18} className={`text-${card.color}-400`} style={{
                color: card.color === 'emerald' ? '#34d399' : card.color === 'sky' ? '#38bdf8' : card.color === 'amber' ? '#fbbf24' : '#22d3ee',
              }} />
            </div>
            <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </p>
            <p className="text-xs font-medium text-slate-400 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      <div className={cardClass}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-b border-slate-700/50' : 'text-slate-500 border-b border-slate-200'}`}>
                <th className="p-4">User</th>
                <th className="p-4 hidden lg:table-cell">Club(s)</th>
                <th className="p-4 text-right cursor-pointer select-none" onClick={() => handleSort('sessions')}>
                  <span className="inline-flex items-center gap-1">
                    Sessions <ArrowUpDown size={12} className={sortField === 'sessions' ? 'text-sky-400' : ''} />
                  </span>
                </th>
                <th className="p-4 text-right cursor-pointer select-none" onClick={() => handleSort('page_views')}>
                  <span className="inline-flex items-center gap-1">
                    Page Views <ArrowUpDown size={12} className={sortField === 'page_views' ? 'text-sky-400' : ''} />
                  </span>
                </th>
                <th className="p-4 text-right cursor-pointer select-none hidden sm:table-cell" onClick={() => handleSort('active_days')}>
                  <span className="inline-flex items-center gap-1">
                    Active Days <ArrowUpDown size={12} className={sortField === 'active_days' ? 'text-sky-400' : ''} />
                  </span>
                </th>
                <th className="p-4 text-right cursor-pointer select-none" onClick={() => handleSort('last_active')}>
                  <span className="inline-flex items-center gap-1">
                    Last Active <ArrowUpDown size={12} className={sortField === 'last_active' ? 'text-sky-400' : ''} />
                  </span>
                </th>
                <th className="p-4 text-right hidden md:table-cell">Engagement</th>
                <th className="p-4 w-10"></th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
              {sortedUsers.map((user) => {
                const engagement = getEngagementLevel(user.total_sessions, user.total_page_views, user.active_days);
                const isExpanded = expandedUserId === user.user_id;
                const displayName = user.full_name || user.email || 'Unknown User';
                const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                return (
                  <tr key={user.user_id} className="group">
                    <td colSpan={8} className="p-0">
                      <div
                        className={`flex items-center cursor-pointer transition-colors ${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'}`}
                        onClick={() => setExpandedUserId(isExpanded ? null : user.user_id)}
                      >
                        <div className="p-4 flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                                darkMode ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-700'
                              }`}>
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className={`font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{displayName}</p>
                              {user.email && user.email !== user.full_name && (
                                <p className="text-xs text-slate-500 truncate">{user.email}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="p-4 hidden lg:block">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(user.clubs || []).slice(0, 2).map(c => (
                              <span key={c.club_id} className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium truncate max-w-[180px] ${
                                darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {c.club_name}
                              </span>
                            ))}
                            {(user.clubs || []).length > 2 && (
                              <span className="text-xs text-slate-500">+{user.clubs.length - 2}</span>
                            )}
                            {(!user.clubs || user.clubs.length === 0) && (
                              <span className="text-xs text-slate-500">No club</span>
                            )}
                          </div>
                        </div>
                        <div className={`p-4 text-right tabular-nums ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          {user.total_sessions.toLocaleString()}
                        </div>
                        <div className={`p-4 text-right tabular-nums ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          {user.total_page_views.toLocaleString()}
                        </div>
                        <div className={`p-4 text-right tabular-nums hidden sm:block ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          {user.active_days}
                        </div>
                        <div className="p-4 text-right">
                          <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {timeAgo(user.last_active)}
                          </span>
                        </div>
                        <div className="p-4 text-right hidden md:block">
                          <div className="flex items-center justify-end gap-2">
                            <div className={`w-16 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${engagement.score}%`,
                                  backgroundColor: engagement.color === 'emerald' ? '#10b981' : engagement.color === 'sky' ? '#0ea5e9' : engagement.color === 'amber' ? '#f59e0b' : '#64748b',
                                }}
                              />
                            </div>
                            <span className={`text-xs w-16 text-right ${
                              engagement.color === 'emerald' ? 'text-emerald-400' : engagement.color === 'sky' ? 'text-sky-400' : engagement.color === 'amber' ? 'text-amber-400' : 'text-slate-400'
                            }`}>
                              {engagement.label}
                            </span>
                          </div>
                        </div>
                        <div className="p-4 w-10">
                          {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={`px-4 pb-4 border-t ${darkMode ? 'border-slate-700/30 bg-slate-800/20' : 'border-slate-100 bg-slate-50/50'}`}>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">
                            <div className={`rounded-xl border p-4 ${darkMode ? 'bg-slate-800/40 border-slate-700/40' : 'bg-white border-slate-200'}`}>
                              <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                <Activity size={14} className="text-sky-400" />
                                User Details
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Email</span>
                                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                    {user.email || 'N/A'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">First Seen</span>
                                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                    {user.first_seen ? new Date(user.first_seen).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Last Sign In</span>
                                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                    {user.last_sign_in ? new Date(user.last_sign_in).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Sections Used</span>
                                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                    {user.sections_used} / {Object.keys(SECTION_LABELS).length - 1}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Pages/Session</span>
                                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                    {user.total_sessions > 0 ? (user.total_page_views / user.total_sessions).toFixed(1) : '0'}
                                  </span>
                                </div>
                                {user.clubs && user.clubs.length > 0 && (
                                  <div className="pt-2 border-t border-slate-700/20">
                                    <span className="text-slate-400 text-xs block mb-1">Clubs</span>
                                    <div className="flex flex-wrap gap-1">
                                      {user.clubs.map(c => (
                                        <span key={c.club_id} className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${
                                          darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {c.club_name}
                                          <span className="ml-1 text-slate-500">({c.role})</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className={`rounded-xl border p-4 ${darkMode ? 'bg-slate-800/40 border-slate-700/40' : 'bg-white border-slate-200'}`}>
                              <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                <Eye size={14} className="text-amber-400" />
                                Top Sections
                              </h4>
                              {user.top_sections && user.top_sections.length > 0 ? (
                                <div className="space-y-2">
                                  {user.top_sections.map((sec, i) => {
                                    const maxViews = user.top_sections[0]?.views || 1;
                                    const pct = Math.round((sec.views / maxViews) * 100);
                                    return (
                                      <div key={i} className="flex items-center gap-2">
                                        <span className={`text-xs w-20 truncate ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                          {SECTION_LABELS[sec.section] || sec.section}
                                        </span>
                                        <div className={`flex-1 h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                                          <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                              width: `${pct}%`,
                                              backgroundColor: SECTION_COLORS[sec.section] || '#64748b',
                                            }}
                                          />
                                        </div>
                                        <span className="text-xs text-slate-400 w-10 text-right tabular-nums">{sec.views}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-500">No section data available</p>
                              )}
                            </div>

                            <div className={`rounded-xl border p-4 ${darkMode ? 'bg-slate-800/40 border-slate-700/40' : 'bg-white border-slate-200'}`}>
                              <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                <Calendar size={14} className="text-emerald-400" />
                                Daily Activity
                              </h4>
                              {user.daily_activity && user.daily_activity.length > 0 ? (
                                <div className="h-[140px]">
                                  <Bar
                                    data={{
                                      labels: user.daily_activity.map(d => {
                                        const date = new Date(d.day);
                                        return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
                                      }),
                                      datasets: [{
                                        label: 'Page Views',
                                        data: user.daily_activity.map(d => d.page_views),
                                        backgroundColor: '#0ea5e9',
                                        borderRadius: 4,
                                      }],
                                    }}
                                    options={{
                                      responsive: true,
                                      maintainAspectRatio: false,
                                      plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                          backgroundColor: chartColors.tooltipBg,
                                          titleColor: chartColors.tooltipText,
                                          bodyColor: chartColors.tooltipText,
                                          borderColor: chartColors.tooltipBorder,
                                          borderWidth: 1,
                                          padding: 8,
                                          cornerRadius: 6,
                                        },
                                      },
                                      scales: {
                                        x: {
                                          grid: { display: false },
                                          ticks: { color: chartColors.text, font: { size: 9 }, maxRotation: 45 },
                                        },
                                        y: {
                                          grid: { color: chartColors.grid },
                                          ticks: { color: chartColors.text, font: { size: 9 } },
                                          beginAtZero: true,
                                        },
                                      },
                                    }}
                                  />
                                </div>
                              ) : (
                                <p className="text-sm text-slate-500">No daily activity data available</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className={`p-8 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {searchQuery ? 'No users match your search.' : 'No user activity data yet. Data will appear as users log in and interact with the platform.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

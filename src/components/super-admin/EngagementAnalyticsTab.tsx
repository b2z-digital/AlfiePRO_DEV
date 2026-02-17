import { useState, useEffect, useCallback } from 'react';
import {
  Users, Activity, Eye, Clock, Building, Globe2, TrendingUp,
  Calendar, RefreshCw, ChevronDown, ChevronUp, Monitor, Smartphone,
  BarChart3, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import { supabase } from '../../utils/supabase';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, Filler);

interface EngagementAnalyticsTabProps {
  darkMode: boolean;
}

interface AnalyticsSummary {
  total_sessions: number;
  unique_users: number;
  total_page_views: number;
  page_sections: { page_section: string; views: number }[];
  daily_sessions: { day: string; sessions: number; users: number }[];
  top_clubs: { club_id: string; club_name: string; sessions: number; unique_users: number; page_views: number }[];
  top_associations: { association_id: string; association_type: string; name: string; sessions: number; unique_users: number; page_views: number }[];
}

type ViewScope = 'platform' | 'clubs' | 'associations';
type DateRange = '7d' | '30d' | '90d' | 'year';

const SECTION_LABELS: Record<string, string> = {
  races: 'Race Management',
  membership: 'Membership',
  finances: 'Finances',
  events: 'Events',
  settings: 'Settings',
  media: 'Media',
  comms: 'Communications',
  community: 'Community',
  website: 'Website Builder',
  meetings: 'Meetings',
  tasks: 'Tasks',
  documents: 'Documents',
  classifieds: 'Classifieds',
  weather: 'Weather',
  livestream: 'Livestream',
  tracking: 'Live Tracking',
  alfietv: 'AlfieTV',
  marketing: 'Marketing',
  news: 'News',
  garage: 'My Garage',
  results: 'Results',
  calendar: 'Race Calendar',
  dashboard: 'Dashboard',
  other: 'Other',
};

const SECTION_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#ec4899', '#84cc16', '#f97316', '#8b5cf6', '#14b8a6',
  '#e11d48', '#0284c7', '#65a30d', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#15803d', '#b91c1c', '#1d4ed8',
];

export function EngagementAnalyticsTab({ darkMode }: EngagementAnalyticsTabProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewScope, setViewScope] = useState<ViewScope>('platform');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<AnalyticsSummary | null>(null);
  const [expandedClub, setExpandedClub] = useState<string | null>(null);

  const getDateRange = useCallback((range: DateRange): { start: Date; end: Date } => {
    const end = new Date();
    const start = new Date();
    switch (range) {
      case '7d': start.setDate(end.getDate() - 7); break;
      case '30d': start.setDate(end.getDate() - 30); break;
      case '90d': start.setDate(end.getDate() - 90); break;
      case 'year': start.setFullYear(end.getFullYear() - 1); break;
    }
    return { start, end };
  }, []);

  const getPrevDateRange = useCallback((range: DateRange): { start: Date; end: Date } => {
    const { start: curStart, end: curEnd } = getDateRange(range);
    const diff = curEnd.getTime() - curStart.getTime();
    return { start: new Date(curStart.getTime() - diff), end: curStart };
  }, [getDateRange]);

  const loadAnalytics = useCallback(async () => {
    try {
      const { start, end } = getDateRange(dateRange);
      const { start: prevStart, end: prevEnd } = getPrevDateRange(dateRange);

      const [currentRes, prevRes] = await Promise.all([
        supabase.rpc('get_platform_analytics_summary', {
          period_start: start.toISOString(),
          period_end: end.toISOString(),
        }),
        supabase.rpc('get_platform_analytics_summary', {
          period_start: prevStart.toISOString(),
          period_end: prevEnd.toISOString(),
        }),
      ]);

      if (currentRes.data) setAnalytics(currentRes.data as AnalyticsSummary);
      if (prevRes.data) setPrevAnalytics(prevRes.data as AnalyticsSummary);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, getDateRange, getPrevDateRange]);

  useEffect(() => {
    setLoading(true);
    loadAnalytics();
  }, [loadAnalytics]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  const chartColors = {
    grid: darkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.15)',
    text: darkMode ? '#94a3b8' : '#64748b',
    tooltipBg: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: darkMode ? '#e2e8f0' : '#334155',
    tooltipBorder: darkMode ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
  };

  const pctChange = (current: number, previous: number): { value: number; direction: 'up' | 'down' | 'flat' } => {
    if (previous === 0) return { value: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat' };
    const change = ((current - previous) / previous) * 100;
    return { value: Math.abs(Math.round(change)), direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' };
  };

  const avgSessionDuration = analytics?.total_sessions
    ? Math.round((analytics.total_page_views / analytics.total_sessions) * 2.5)
    : 0;

  const pagesPerSession = analytics?.total_sessions
    ? (analytics.total_page_views / analytics.total_sessions).toFixed(1)
    : '0';

  const sessionsChange = pctChange(analytics?.total_sessions || 0, prevAnalytics?.total_sessions || 0);
  const usersChange = pctChange(analytics?.unique_users || 0, prevAnalytics?.unique_users || 0);
  const viewsChange = pctChange(analytics?.total_page_views || 0, prevAnalytics?.total_page_views || 0);

  const summaryCards = [
    { label: 'Total Sessions', value: analytics?.total_sessions || 0, change: sessionsChange, icon: Activity, color: 'sky' },
    { label: 'Unique Users', value: analytics?.unique_users || 0, change: usersChange, icon: Users, color: 'emerald' },
    { label: 'Page Views', value: analytics?.total_page_views || 0, change: viewsChange, icon: Eye, color: 'amber' },
    { label: 'Avg Session (min)', value: avgSessionDuration, change: { value: 0, direction: 'flat' as const }, icon: Clock, color: 'cyan' },
    { label: 'Pages/Session', value: pagesPerSession, change: { value: 0, direction: 'flat' as const }, icon: Monitor, color: 'rose' },
  ];

  const colorMap: Record<string, { gradient: string; border: string; iconBg: string; iconColor: string }> = {
    sky: { gradient: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', iconBg: 'from-sky-500/20 to-sky-600/20', iconColor: 'text-sky-400' },
    emerald: { gradient: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', iconBg: 'from-emerald-500/20 to-emerald-600/20', iconColor: 'text-emerald-400' },
    amber: { gradient: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', iconBg: 'from-amber-500/20 to-amber-600/20', iconColor: 'text-amber-400' },
    cyan: { gradient: 'from-cyan-500/20 to-cyan-700/20', border: 'border-cyan-500/30', iconBg: 'from-cyan-500/20 to-cyan-600/20', iconColor: 'text-cyan-400' },
    rose: { gradient: 'from-rose-500/20 to-rose-700/20', border: 'border-rose-500/30', iconBg: 'from-rose-500/20 to-rose-600/20', iconColor: 'text-rose-400' },
  };

  const dailyChartData = {
    labels: (analytics?.daily_sessions || []).map(d => {
      const date = new Date(d.day);
      return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    }),
    datasets: [
      {
        label: 'Sessions',
        data: (analytics?.daily_sessions || []).map(d => d.sessions),
        borderColor: '#0ea5e9',
        backgroundColor: darkMode ? 'rgba(14, 165, 233, 0.1)' : 'rgba(14, 165, 233, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#0ea5e9',
      },
      {
        label: 'Unique Users',
        data: (analytics?.daily_sessions || []).map(d => d.users),
        borderColor: '#10b981',
        backgroundColor: darkMode ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#10b981',
      },
    ],
  };

  const sections = analytics?.page_sections || [];
  const sectionChartData = {
    labels: sections.map(s => SECTION_LABELS[s.page_section] || s.page_section),
    datasets: [{
      data: sections.map(s => s.views),
      backgroundColor: sections.map((_, i) => SECTION_COLORS[i % SECTION_COLORS.length]),
      borderWidth: 0,
    }],
  };

  const topSections = [...sections].sort((a, b) => b.views - a.views).slice(0, 10);
  const sectionBarData = {
    labels: topSections.map(s => SECTION_LABELS[s.page_section] || s.page_section),
    datasets: [{
      label: 'Page Views',
      data: topSections.map(s => s.views),
      backgroundColor: topSections.map((_, i) => SECTION_COLORS[i % SECTION_COLORS.length]),
      borderRadius: 6,
    }],
  };

  const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { color: chartColors.text, padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: chartColors.tooltipBg,
        titleColor: chartColors.tooltipText,
        bodyColor: chartColors.tooltipText,
        borderColor: chartColors.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: { grid: { color: chartColors.grid }, ticks: { color: chartColors.text, font: { size: 11 } } },
      y: { grid: { color: chartColors.grid }, ticks: { color: chartColors.text, font: { size: 11 } }, beginAtZero: true },
    },
  };

  const renderChangeIndicator = (change: { value: number; direction: string }) => {
    if (change.direction === 'flat' || change.value === 0) {
      return <span className="inline-flex items-center gap-0.5 text-xs text-slate-400"><Minus size={12} /> --</span>;
    }
    if (change.direction === 'up') {
      return <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400"><ArrowUpRight size={12} /> {change.value}%</span>;
    }
    return <span className="inline-flex items-center gap-0.5 text-xs text-rose-400"><ArrowDownRight size={12} /> {change.value}%</span>;
  };

  const dateRangeLabel: Record<DateRange, string> = { '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last 90 Days', 'year': 'Last 12 Months' };

  const cardClass = `rounded-2xl border p-6 backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`;
  const headingClass = `text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`;

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
        <div className="flex items-center gap-2 flex-wrap">
          {(['platform', 'clubs', 'associations'] as ViewScope[]).map(scope => (
            <button
              key={scope}
              onClick={() => setViewScope(scope)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewScope === scope
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              {scope === 'platform' && <BarChart3 size={14} className="inline mr-1.5" />}
              {scope === 'clubs' && <Building size={14} className="inline mr-1.5" />}
              {scope === 'associations' && <Globe2 size={14} className="inline mr-1.5" />}
              {scope === 'platform' ? 'Platform Overview' : scope === 'clubs' ? 'Clubs' : 'Associations'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '30d', '90d', 'year'] as DateRange[]).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateRange === range
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              {dateRangeLabel[range]}
            </button>
          ))}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/50 transition-all"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {viewScope === 'platform' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {summaryCards.map((card) => {
              const colors = colorMap[card.color];
              return (
                <div
                  key={card.label}
                  className={`rounded-2xl border p-4 backdrop-blur-sm bg-gradient-to-br ${colors.gradient} ${colors.border} transition-all hover:scale-[1.02]`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={`p-1.5 rounded-lg bg-gradient-to-br ${colors.iconBg} border ${colors.border}`}>
                      <card.icon size={14} className={colors.iconColor} />
                    </div>
                    {renderChangeIndicator(card.change)}
                  </div>
                  <p className="text-2xl font-bold text-white">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</p>
                  <p className="text-xs font-medium text-slate-400 mt-0.5">{card.label}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 ${cardClass}`}>
              <h3 className={headingClass}>
                <TrendingUp size={18} className="inline mr-2 text-sky-500" />
                Daily Sessions & Users
              </h3>
              <div className="h-[300px]">
                <Line data={dailyChartData} options={commonChartOptions} />
              </div>
            </div>

            <div className={cardClass}>
              <h3 className={headingClass}>
                <Eye size={18} className="inline mr-2 text-amber-500" />
                Section Usage
              </h3>
              <div className="h-[300px]">
                {sections.length > 0 ? (
                  <Doughnut
                    data={sectionChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: '55%',
                      plugins: {
                        legend: { display: true, position: 'bottom', labels: { color: chartColors.text, padding: 8, usePointStyle: true, font: { size: 10 } } },
                        tooltip: { backgroundColor: chartColors.tooltipBg, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText, borderColor: chartColors.tooltipBorder, borderWidth: 1, padding: 12, cornerRadius: 8 },
                      },
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data yet</div>
                )}
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className={headingClass}>
              <BarChart3 size={18} className="inline mr-2 text-cyan-500" />
              Most Visited Sections
            </h3>
            <div className="h-[280px]">
              {topSections.length > 0 ? (
                <Bar
                  data={sectionBarData}
                  options={{
                    ...commonChartOptions,
                    indexAxis: 'y' as const,
                    plugins: { ...commonChartOptions.plugins, legend: { display: false } },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data yet</div>
              )}
            </div>
          </div>
        </>
      )}

      {viewScope === 'clubs' && (
        <div className={`rounded-2xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="p-4 border-b border-slate-700/50">
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <Building size={18} className="inline mr-2 text-emerald-500" />
              Club Engagement ({analytics?.top_clubs?.length || 0} active)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
                  <th className="p-4">Club</th>
                  <th className="p-4 text-right">Sessions</th>
                  <th className="p-4 text-right">Unique Users</th>
                  <th className="p-4 text-right">Page Views</th>
                  <th className="p-4 text-right">Pages/Session</th>
                  <th className="p-4 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {(analytics?.top_clubs || []).map((club) => {
                  const pps = club.sessions > 0 ? (club.page_views / club.sessions).toFixed(1) : '0';
                  const engagementScore = club.sessions > 0
                    ? Math.min(100, Math.round((club.page_views / club.sessions) * 15))
                    : 0;
                  return (
                    <tr key={club.club_id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="p-4 font-medium text-white">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-sky-500/20 text-sky-400">
                            {(club.club_name || '').slice(0, 2).toUpperCase()}
                          </div>
                          <span>{club.club_name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right text-slate-300">{club.sessions.toLocaleString()}</td>
                      <td className="p-4 text-right text-slate-300">{club.unique_users.toLocaleString()}</td>
                      <td className="p-4 text-right text-slate-300">{club.page_views.toLocaleString()}</td>
                      <td className="p-4 text-right text-slate-300">{pps}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${engagementScore >= 70 ? 'bg-emerald-500' : engagementScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${engagementScore}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-8 text-right">{engagementScore}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!analytics?.top_clubs || analytics.top_clubs.length === 0) && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">No club engagement data yet. Data will appear as users interact with the platform.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewScope === 'associations' && (
        <div className={`rounded-2xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="p-4 border-b border-slate-700/50">
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <Globe2 size={18} className="inline mr-2 text-amber-500" />
              Association Engagement ({analytics?.top_associations?.length || 0} active)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
                  <th className="p-4">Association</th>
                  <th className="p-4">Type</th>
                  <th className="p-4 text-right">Sessions</th>
                  <th className="p-4 text-right">Unique Users</th>
                  <th className="p-4 text-right">Page Views</th>
                  <th className="p-4 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {(analytics?.top_associations || []).map((assoc) => {
                  const engagementScore = assoc.sessions > 0
                    ? Math.min(100, Math.round((assoc.page_views / assoc.sessions) * 15))
                    : 0;
                  return (
                    <tr key={assoc.association_id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="p-4 font-medium text-white">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            assoc.association_type === 'national' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {(assoc.name || '').slice(0, 2).toUpperCase()}
                          </div>
                          <span>{assoc.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${
                          assoc.association_type === 'national'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {assoc.association_type === 'national' ? 'National' : 'State'}
                        </span>
                      </td>
                      <td className="p-4 text-right text-slate-300">{assoc.sessions.toLocaleString()}</td>
                      <td className="p-4 text-right text-slate-300">{assoc.unique_users.toLocaleString()}</td>
                      <td className="p-4 text-right text-slate-300">{assoc.page_views.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${engagementScore >= 70 ? 'bg-emerald-500' : engagementScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${engagementScore}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-8 text-right">{engagementScore}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!analytics?.top_associations || analytics.top_associations.length === 0) && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">No association engagement data yet. Data will appear as users interact with the platform.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Activity, Eye, Clock, Building, Globe2, TrendingUp,
  RefreshCw, Monitor, BarChart3, ArrowUpRight, ArrowDownRight, Minus
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
  admin: 'Admin',
  other: 'Other',
};

const SECTION_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
  '#ec4899', '#84cc16', '#f97316', '#8b5cf6', '#14b8a6',
  '#e11d48', '#0284c7', '#65a30d', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#15803d', '#b91c1c', '#1d4ed8',
];

function getDateRangeValues(range: DateRange): { start: string; end: string } {
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

function getPrevDateRangeValues(range: DateRange): { start: string; end: string } {
  const { start: curStart } = getDateRangeValues(range);
  const curStartDate = new Date(curStart);
  const endDate = new Date();
  const diff = endDate.getTime() - curStartDate.getTime();
  const prevStart = new Date(curStartDate.getTime() - diff);
  return { start: prevStart.toISOString(), end: curStart };
}

async function fetchAnalytics(startDate: string, endDate: string): Promise<AnalyticsSummary> {
  const empty: AnalyticsSummary = {
    total_sessions: 0,
    unique_users: 0,
    total_page_views: 0,
    page_sections: [],
    daily_sessions: [],
    top_clubs: [],
    top_associations: [],
  };

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_platform_analytics_summary', {
      period_start: startDate,
      period_end: endDate,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      const d = rpcData as any;
      if ((d.total_sessions || 0) > 0 || (d.total_page_views || 0) > 0) {
        return {
          total_sessions: d.total_sessions || 0,
          unique_users: d.unique_users || 0,
          total_page_views: d.total_page_views || 0,
          page_sections: Array.isArray(d.page_sections) ? d.page_sections : [],
          daily_sessions: Array.isArray(d.daily_sessions) ? d.daily_sessions : [],
          top_clubs: Array.isArray(d.top_clubs) ? d.top_clubs : [],
          top_associations: Array.isArray(d.top_associations) ? d.top_associations : [],
        };
      }
    }

    const [sessionsRes, pageViewsRes] = await Promise.all([
      supabase
        .from('platform_sessions')
        .select('id, user_id, club_id, association_id, association_type, started_at')
        .gte('started_at', startDate)
        .lt('started_at', endDate),
      supabase
        .from('platform_page_views')
        .select('id, user_id, club_id, association_id, page_path, page_section, viewed_at, session_id')
        .gte('viewed_at', startDate)
        .lt('viewed_at', endDate),
    ]);

    const sessions = sessionsRes.data || [];
    const pageViews = pageViewsRes.data || [];

    const uniqueSessionUsers = new Set(sessions.map((s: any) => s.user_id));
    const uniquePageViewUsers = new Set(pageViews.map((pv: any) => pv.user_id));
    const allUniqueUsers = new Set([...uniqueSessionUsers, ...uniquePageViewUsers]);

    const sectionMap: Record<string, number> = {};
    pageViews.forEach((pv: any) => {
      const sec = pv.page_section || 'other';
      sectionMap[sec] = (sectionMap[sec] || 0) + 1;
    });
    const pageSections = Object.entries(sectionMap)
      .map(([page_section, views]) => ({ page_section, views }))
      .sort((a, b) => b.views - a.views);

    const dayMap: Record<string, { sessions: Set<string>; users: Set<string> }> = {};
    sessions.forEach((s: any) => {
      const day = new Date(s.started_at).toISOString().split('T')[0];
      if (!dayMap[day]) dayMap[day] = { sessions: new Set(), users: new Set() };
      dayMap[day].sessions.add(s.id);
      dayMap[day].users.add(s.user_id);
    });
    pageViews.forEach((pv: any) => {
      const day = new Date(pv.viewed_at).toISOString().split('T')[0];
      if (!dayMap[day]) dayMap[day] = { sessions: new Set(), users: new Set() };
      dayMap[day].users.add(pv.user_id);
      if (!dayMap[day].sessions.size) {
        dayMap[day].sessions.add('pv-' + day);
      }
    });
    const dailySessions = Object.entries(dayMap)
      .map(([day, data]) => ({ day, sessions: data.sessions.size, users: data.users.size }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const clubMap: Record<string, { sessions: Set<string>; users: Set<string>; pageViews: number }> = {};
    const allRecords = [
      ...sessions.map((s: any) => ({ ...s, type: 'session' })),
      ...pageViews.map((pv: any) => ({ ...pv, type: 'pageview' })),
    ];
    allRecords.forEach((r: any) => {
      if (!r.club_id) return;
      if (!clubMap[r.club_id]) clubMap[r.club_id] = { sessions: new Set(), users: new Set(), pageViews: 0 };
      clubMap[r.club_id].users.add(r.user_id);
      if (r.type === 'session') clubMap[r.club_id].sessions.add(r.id);
      if (r.type === 'pageview') clubMap[r.club_id].pageViews++;
    });

    let clubNames: Record<string, string> = {};
    const clubIds = Object.keys(clubMap);
    if (clubIds.length > 0) {
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, name')
        .in('id', clubIds);
      (clubs || []).forEach((c: any) => { clubNames[c.id] = c.name; });
    }

    const topClubs = Object.entries(clubMap)
      .map(([club_id, data]) => ({
        club_id,
        club_name: clubNames[club_id] || 'Unknown',
        sessions: Math.max(data.sessions.size, 1),
        unique_users: data.users.size,
        page_views: data.pageViews,
      }))
      .sort((a, b) => b.page_views - a.page_views);

    const assocMap: Record<string, { type: string; sessions: Set<string>; users: Set<string>; pageViews: number }> = {};
    allRecords.forEach((r: any) => {
      if (!r.association_id) return;
      if (!assocMap[r.association_id]) assocMap[r.association_id] = { type: r.association_type || 'state', sessions: new Set(), users: new Set(), pageViews: 0 };
      assocMap[r.association_id].users.add(r.user_id);
      if (r.type === 'session') assocMap[r.association_id].sessions.add(r.id);
      if (r.type === 'pageview') assocMap[r.association_id].pageViews++;
    });

    let assocNames: Record<string, string> = {};
    const assocIds = Object.keys(assocMap);
    for (const assocId of assocIds) {
      const aType = assocMap[assocId].type;
      const table = aType === 'national' ? 'national_associations' : 'state_associations';
      const { data } = await supabase.from(table).select('name').eq('id', assocId).maybeSingle();
      if (data) assocNames[assocId] = data.name;
    }

    const topAssociations = Object.entries(assocMap)
      .map(([association_id, data]) => ({
        association_id,
        association_type: data.type,
        name: assocNames[association_id] || 'Unknown',
        sessions: Math.max(data.sessions.size, 1),
        unique_users: data.users.size,
        page_views: data.pageViews,
      }))
      .sort((a, b) => b.page_views - a.page_views);

    const totalSessions = Math.max(sessions.length, dailySessions.reduce((s, d) => s + d.sessions, 0));

    return {
      total_sessions: totalSessions || allUniqueUsers.size,
      unique_users: allUniqueUsers.size,
      total_page_views: pageViews.length,
      page_sections: pageSections,
      daily_sessions: dailySessions,
      top_clubs: topClubs,
      top_associations: topAssociations,
    };
  } catch (err) {
    console.error('Error fetching analytics:', err);
    return empty;
  }
}

export function EngagementAnalyticsTab({ darkMode }: EngagementAnalyticsTabProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewScope, setViewScope] = useState<ViewScope>('platform');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<AnalyticsSummary | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      const { start, end } = getDateRangeValues(dateRange);
      const { start: prevStart, end: prevEnd } = getPrevDateRangeValues(dateRange);

      const [current, prev] = await Promise.all([
        fetchAnalytics(start, end),
        fetchAnalytics(prevStart, prevEnd),
      ]);

      setAnalytics(current);
      setPrevAnalytics(prev);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

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
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#0ea5e9',
      },
      {
        label: 'Unique Users',
        data: (analytics?.daily_sessions || []).map(d => d.users),
        borderColor: '#10b981',
        backgroundColor: darkMode ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
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
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`
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
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`
              }`}
            >
              {dateRangeLabel[range]}
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
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</p>
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
                {(analytics?.daily_sessions?.length || 0) > 0 ? (
                  <Line data={dailyChartData} options={commonChartOptions} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                    <Activity size={32} className="text-slate-600" />
                    <p>Session data will appear as users interact with the platform.</p>
                    <p className="text-xs text-slate-600">Tracking is now active.</p>
                  </div>
                )}
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
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                    <Eye size={32} className="text-slate-600" />
                    <p>Section usage will populate as pages are visited.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {topSections.length > 0 && (
            <div className={cardClass}>
              <h3 className={headingClass}>
                <BarChart3 size={18} className="inline mr-2 text-cyan-500" />
                Most Visited Sections
              </h3>
              <div className="h-[280px]">
                <Bar
                  data={sectionBarData}
                  options={{
                    ...commonChartOptions,
                    indexAxis: 'y' as const,
                    plugins: { ...commonChartOptions.plugins, legend: { display: false } },
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {viewScope === 'clubs' && (
        <div className={`rounded-2xl border backdrop-blur-sm ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className={`p-4 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <Building size={18} className="inline mr-2 text-emerald-500" />
              Club Engagement ({analytics?.top_clubs?.length || 0} active)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                  <th className="p-4">Club</th>
                  <th className="p-4 text-right">Sessions</th>
                  <th className="p-4 text-right">Unique Users</th>
                  <th className="p-4 text-right">Page Views</th>
                  <th className="p-4 text-right">Pages/Session</th>
                  <th className="p-4 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {(analytics?.top_clubs || []).map((club) => {
                  const pps = club.sessions > 0 ? (club.page_views / club.sessions).toFixed(1) : '0';
                  const engagementScore = club.sessions > 0
                    ? Math.min(100, Math.round((club.page_views / club.sessions) * 15))
                    : 0;
                  return (
                    <tr key={club.club_id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className={`p-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-sky-500/20 text-sky-400">
                            {(club.club_name || '').slice(0, 2).toUpperCase()}
                          </div>
                          <span>{club.club_name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{club.sessions.toLocaleString()}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{club.unique_users.toLocaleString()}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{club.page_views.toLocaleString()}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{pps}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`w-16 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
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
          <div className={`p-4 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <Globe2 size={18} className="inline mr-2 text-amber-500" />
              Association Engagement ({analytics?.top_associations?.length || 0} active)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                  <th className="p-4">Association</th>
                  <th className="p-4">Type</th>
                  <th className="p-4 text-right">Sessions</th>
                  <th className="p-4 text-right">Unique Users</th>
                  <th className="p-4 text-right">Page Views</th>
                  <th className="p-4 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {(analytics?.top_associations || []).map((assoc) => {
                  const engagementScore = assoc.sessions > 0
                    ? Math.min(100, Math.round((assoc.page_views / assoc.sessions) * 15))
                    : 0;
                  return (
                    <tr key={assoc.association_id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className={`p-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
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
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{assoc.sessions.toLocaleString()}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{assoc.unique_users.toLocaleString()}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{assoc.page_views.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`w-16 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
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

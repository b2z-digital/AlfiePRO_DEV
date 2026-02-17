import { useState, useEffect, useCallback } from 'react';
import {
  Database, Cloud, DollarSign, HardDrive, Server, TrendingUp,
  RefreshCw, Plus, Calendar, Building,
  Globe2, AlertTriangle, CheckCircle, Zap, BarChart3, Cpu, Wifi,
  Save
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import { supabase } from '../../utils/supabase';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, Filler);

interface ResourceCostsTabProps {
  darkMode: boolean;
}

interface CostEntry {
  id: string;
  snapshot_date: string;
  source: string;
  metric_name: string;
  metric_value: number;
  unit: string;
  cost_usd: number | null;
  metadata: any;
  created_at: string;
}

interface MonthlyCostSummary {
  month: string;
  aws: number;
  supabase: number;
  other: number;
  total: number;
}

interface ClubCostEstimate {
  id: string;
  name: string;
  abbreviation: string;
  members: number;
  dbEstimateMb: number;
  costShare: number;
}

interface DbMetrics {
  totalRows: number;
  totalSizeMb: number;
  tableCount: number;
  storageBuckets: number;
  sessionsThisMonth: number;
  pageViewsThisMonth: number;
}

type ViewMode = 'overview' | 'breakdown' | 'forecast' | 'entry';

const SOURCE_LABELS: Record<string, string> = {
  aws: 'AWS Amplify',
  supabase: 'Supabase',
  manual: 'Manual Entry',
  platform: 'Platform',
  domain: 'Domain & DNS',
  email: 'Email Services',
  cdn: 'CDN / Cloudflare',
  other: 'Other',
};

const COST_CATEGORIES = [
  { key: 'aws_hosting', label: 'AWS Amplify Hosting', source: 'aws' },
  { key: 'aws_build', label: 'AWS Build Minutes', source: 'aws' },
  { key: 'aws_bandwidth', label: 'AWS Bandwidth', source: 'aws' },
  { key: 'supabase_database', label: 'Supabase Database', source: 'supabase' },
  { key: 'supabase_storage', label: 'Supabase Storage', source: 'supabase' },
  { key: 'supabase_auth', label: 'Supabase Auth MAUs', source: 'supabase' },
  { key: 'supabase_edge_functions', label: 'Edge Functions', source: 'supabase' },
  { key: 'supabase_realtime', label: 'Realtime Connections', source: 'supabase' },
  { key: 'domain_dns', label: 'Domain & DNS', source: 'domain' },
  { key: 'email_services', label: 'Email Services', source: 'email' },
  { key: 'cdn_cloudflare', label: 'CDN / Cloudflare', source: 'cdn' },
  { key: 'other', label: 'Other Services', source: 'other' },
];

async function fetchDbMetrics(): Promise<DbMetrics> {
  const defaults: DbMetrics = { totalRows: 0, totalSizeMb: 0, tableCount: 0, storageBuckets: 0, sessionsThisMonth: 0, pageViewsThisMonth: 0 };

  try {
    const { data: tableStats } = await supabase.rpc('get_public_table_stats');

    if (tableStats && Array.isArray(tableStats)) {
      let totalRows = 0;
      let totalSizeMb = 0;
      for (const t of tableStats) {
        totalRows += parseInt(t.row_count || '0', 10);
        const sizeStr = t.total_size || '0 bytes';
        const mbMatch = sizeStr.match(/([\d.]+)\s*(MB|GB|kB|bytes)/i);
        if (mbMatch) {
          const val = parseFloat(mbMatch[1]);
          const unit = mbMatch[2].toLowerCase();
          if (unit === 'gb') totalSizeMb += val * 1024;
          else if (unit === 'mb') totalSizeMb += val;
          else if (unit === 'kb') totalSizeMb += val / 1024;
          else totalSizeMb += val / (1024 * 1024);
        }
      }
      defaults.totalRows = totalRows;
      defaults.totalSizeMb = Math.round(totalSizeMb * 100) / 100;
      defaults.tableCount = tableStats.length;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [sessionsRes, viewsRes] = await Promise.all([
      supabase.from('platform_sessions').select('id', { count: 'exact', head: true }).gte('started_at', monthStart),
      supabase.from('platform_page_views').select('id', { count: 'exact', head: true }).gte('viewed_at', monthStart),
    ]);

    defaults.sessionsThisMonth = sessionsRes.count || 0;
    defaults.pageViewsThisMonth = viewsRes.count || 0;

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-platform-resources`;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'get_db_size' }),
        });
        if (res.ok) {
          const stats = await res.json();
          const dbMetrics = stats?.database || [];
          const storageMetrics = stats?.storage || [];

          const edgeSizeMb = dbMetrics.find((m: any) => m.metric_name === 'db_total_size_mb')?.metric_value;
          const edgeRows = dbMetrics.find((m: any) => m.metric_name === 'db_total_rows')?.metric_value;
          const edgeTables = dbMetrics.find((m: any) => m.metric_name === 'db_table_count')?.metric_value;
          const edgeBuckets = storageMetrics.find((m: any) => m.metric_name === 'storage_bucket_count')?.metric_value;

          if (edgeSizeMb && edgeSizeMb > defaults.totalSizeMb) defaults.totalSizeMb = edgeSizeMb;
          if (edgeRows && edgeRows > defaults.totalRows) defaults.totalRows = edgeRows;
          if (edgeTables && edgeTables > defaults.tableCount) defaults.tableCount = edgeTables;
          if (edgeBuckets) defaults.storageBuckets = edgeBuckets;
        }
      }
    } catch (_e) {
      // Edge function may not respond - that's OK, we have direct data
    }
  } catch (err) {
    console.error('Error fetching DB metrics:', err);
  }

  return defaults;
}

export function ResourceCostsTab({ darkMode }: ResourceCostsTabProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyCostSummary[]>([]);
  const [clubEstimates, setClubEstimates] = useState<ClubCostEstimate[]>([]);
  const [dbMetrics, setDbMetrics] = useState<DbMetrics>({ totalRows: 0, totalSizeMb: 0, tableCount: 0, storageBuckets: 0, sessionsThisMonth: 0, pageViewsThisMonth: 0 });
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    metric_name: '',
    cost_usd: '',
    source: 'aws',
    snapshot_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [metrics, snapshotsRes] = await Promise.all([
        fetchDbMetrics(),
        supabase
          .from('platform_resource_snapshots')
          .select('*')
          .order('snapshot_date', { ascending: false })
          .limit(500),
      ]);

      setDbMetrics(metrics);

      const snapshots = snapshotsRes.data || [];
      setCostEntries(snapshots);

      const monthMap: Record<string, MonthlyCostSummary> = {};
      snapshots.forEach((s: CostEntry) => {
        const month = s.snapshot_date?.slice(0, 7) || 'unknown';
        if (!monthMap[month]) monthMap[month] = { month, aws: 0, supabase: 0, other: 0, total: 0 };
        const cost = s.cost_usd || 0;
        if (s.source === 'aws') monthMap[month].aws += cost;
        else if (s.source === 'supabase') monthMap[month].supabase += cost;
        else monthMap[month].other += cost;
        monthMap[month].total += cost;
      });

      const sorted = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
      setMonthlySummary(sorted.slice(-12));

      const { data: clubs } = await supabase.from('clubs').select('id, name, abbreviation');
      const { data: members } = await supabase.from('members').select('club_id');

      const membersByClub: Record<string, number> = {};
      (members || []).forEach((m: any) => {
        membersByClub[m.club_id] = (membersByClub[m.club_id] || 0) + 1;
      });

      const totalMembers = Object.values(membersByClub).reduce((a, b) => a + b, 0);
      const currentMonthTotal = sorted.length > 0 ? sorted[sorted.length - 1].total : 0;

      const estimates: ClubCostEstimate[] = (clubs || []).map((c: any) => {
        const memberCount = membersByClub[c.id] || 0;
        const share = totalMembers > 0 ? (memberCount / totalMembers) : 0;
        return {
          id: c.id,
          name: c.name,
          abbreviation: c.abbreviation || '',
          members: memberCount,
          dbEstimateMb: Math.round(memberCount * 0.05 * 100) / 100,
          costShare: Math.round(share * currentMonthTotal * 100) / 100,
        };
      }).sort((a: ClubCostEstimate, b: ClubCostEstimate) => b.costShare - a.costShare);

      setClubEstimates(estimates);
    } catch (err) {
      console.error('Error loading resource data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveEntry = async () => {
    if (!newEntry.metric_name || !newEntry.cost_usd) return;
    setSaving(true);
    try {
      const catInfo = COST_CATEGORIES.find(c => c.key === newEntry.metric_name);
      const source = catInfo?.source || newEntry.source;

      await supabase.from('platform_resource_snapshots').insert({
        snapshot_date: newEntry.snapshot_date,
        source,
        metric_name: newEntry.metric_name,
        metric_value: parseFloat(newEntry.cost_usd) || 0,
        unit: 'USD',
        cost_usd: parseFloat(newEntry.cost_usd) || 0,
        metadata: newEntry.notes ? { notes: newEntry.notes } : null,
      });
      setShowAddEntry(false);
      setNewEntry({ metric_name: '', cost_usd: '', source: 'aws', snapshot_date: new Date().toISOString().split('T')[0], notes: '' });
      loadData();
    } catch (err) {
      console.error('Error saving entry:', err);
    } finally {
      setSaving(false);
    }
  };

  const chartColors = {
    grid: darkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.15)',
    text: darkMode ? '#94a3b8' : '#64748b',
    tooltipBg: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: darkMode ? '#e2e8f0' : '#334155',
    tooltipBorder: darkMode ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
  };

  const currentMonth = monthlySummary.length > 0 ? monthlySummary[monthlySummary.length - 1] : null;
  const totalAllTime = costEntries.reduce((sum, e) => sum + (e.cost_usd || 0), 0);

  const monthlyTrendData = {
    labels: monthlySummary.map(m => {
      const [y, mo] = m.month.split('-');
      return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
    }),
    datasets: [
      { label: 'AWS Amplify', data: monthlySummary.map(m => m.aws), backgroundColor: '#f59e0b', borderRadius: 4, stack: 'stack1' },
      { label: 'Supabase', data: monthlySummary.map(m => m.supabase), backgroundColor: '#10b981', borderRadius: 4, stack: 'stack1' },
      { label: 'Other', data: monthlySummary.map(m => m.other), backgroundColor: '#0ea5e9', borderRadius: 4, stack: 'stack1' },
    ],
  };

  const costBreakdownData = {
    labels: currentMonth ? ['AWS Amplify', 'Supabase', 'Other'] : [],
    datasets: [{ data: currentMonth ? [currentMonth.aws, currentMonth.supabase, currentMonth.other] : [], backgroundColor: ['#f59e0b', '#10b981', '#0ea5e9'], borderWidth: 0 }],
  };

  const forecastMonths = 6;
  const avgMonthly = monthlySummary.length > 0 ? monthlySummary.reduce((s, m) => s + m.total, 0) / monthlySummary.length : 0;
  const growthRate = monthlySummary.length >= 2 ? (monthlySummary[monthlySummary.length - 1].total - monthlySummary[0].total) / (monthlySummary.length - 1) : 0;

  const forecastLabels: string[] = [];
  const forecastActual: (number | null)[] = [];
  const forecastProjected: (number | null)[] = [];

  monthlySummary.forEach(m => {
    const [y, mo] = m.month.split('-');
    forecastLabels.push(new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }));
    forecastActual.push(m.total);
    forecastProjected.push(null);
  });

  const lastTotal = monthlySummary.length > 0 ? monthlySummary[monthlySummary.length - 1].total : 0;
  for (let i = 1; i <= forecastMonths; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    forecastLabels.push(d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }));
    forecastActual.push(null);
    forecastProjected.push(Math.max(0, lastTotal + growthRate * i));
  }

  const forecastChartData = {
    labels: forecastLabels,
    datasets: [
      { label: 'Actual', data: forecastActual, borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.08)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#0ea5e9', spanGaps: false },
      { label: 'Forecast', data: forecastProjected, borderColor: '#f59e0b', borderDash: [6, 4], backgroundColor: 'rgba(245, 158, 11, 0.05)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#f59e0b', spanGaps: false },
    ],
  };

  const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' as const, labels: { color: chartColors.text, padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } },
      tooltip: {
        backgroundColor: chartColors.tooltipBg, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText, borderColor: chartColors.tooltipBorder, borderWidth: 1, padding: 12, cornerRadius: 8,
        callbacks: { label: (ctx: any) => `${ctx.dataset.label}: $${(ctx.raw || 0).toFixed(2)} USD` },
      },
    },
    scales: {
      x: { grid: { color: chartColors.grid }, ticks: { color: chartColors.text, font: { size: 11 } } },
      y: { grid: { color: chartColors.grid }, ticks: { color: chartColors.text, font: { size: 11 }, callback: (v: any) => `$${v}` }, beginAtZero: true, stacked: true },
    },
  };

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
          {(['overview', 'breakdown', 'forecast', 'entry'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === mode
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`
              }`}
            >
              {mode === 'overview' && <><BarChart3 size={14} className="inline mr-1.5" />Overview</>}
              {mode === 'breakdown' && <><Building size={14} className="inline mr-1.5" />Cost Breakdown</>}
              {mode === 'forecast' && <><TrendingUp size={14} className="inline mr-1.5" />Forecast</>}
              {mode === 'entry' && <><Plus size={14} className="inline mr-1.5" />Record Costs</>}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setRefreshing(true); loadData(); }}
          disabled={refreshing}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {viewMode === 'overview' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'This Month', value: currentMonth?.total || 0, prefix: '$', color: 'sky', icon: DollarSign, sub: currentMonth?.month || 'No data' },
              { label: 'AWS Cost', value: currentMonth?.aws || 0, prefix: '$', color: 'amber', icon: Cloud, sub: 'Amplify' },
              { label: 'Supabase Cost', value: currentMonth?.supabase || 0, prefix: '$', color: 'emerald', icon: Database, sub: 'Database + Storage' },
              { label: 'DB Size', value: dbMetrics.totalSizeMb, suffix: ' MB', color: 'cyan', icon: HardDrive, sub: `${dbMetrics.tableCount} tables` },
              { label: 'Total Rows', value: dbMetrics.totalRows, color: 'rose', icon: Server, sub: 'All tables' },
              { label: 'Total Spend', value: totalAllTime, prefix: '$', color: 'slate', icon: DollarSign, sub: 'All time' },
            ].map(card => {
              const cMap: Record<string, string> = {
                sky: 'from-sky-500/20 to-sky-700/20 border-sky-500/30',
                amber: 'from-amber-500/20 to-amber-700/20 border-amber-500/30',
                emerald: 'from-emerald-500/20 to-emerald-700/20 border-emerald-500/30',
                cyan: 'from-cyan-500/20 to-cyan-700/20 border-cyan-500/30',
                rose: 'from-rose-500/20 to-rose-700/20 border-rose-500/30',
                slate: 'from-slate-600/20 to-slate-800/20 border-slate-500/30',
              };
              const iMap: Record<string, string> = {
                sky: 'text-sky-400', amber: 'text-amber-400', emerald: 'text-emerald-400',
                cyan: 'text-cyan-400', rose: 'text-rose-400', slate: 'text-slate-300',
              };
              return (
                <div key={card.label} className={`rounded-2xl border p-4 backdrop-blur-sm bg-gradient-to-br ${cMap[card.color]} transition-all hover:scale-[1.02]`}>
                  <div className="flex items-center gap-2 mb-2">
                    <card.icon size={14} className={iMap[card.color]} />
                  </div>
                  <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {card.prefix || ''}{typeof card.value === 'number' ? card.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : card.value}{card.suffix || ''}
                  </p>
                  <p className="text-xs font-medium text-slate-400">{card.label}</p>
                  {card.sub && <p className="text-[10px] text-slate-500 mt-0.5">{card.sub}</p>}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 ${cardClass}`}>
              <h3 className={headingClass}>
                <TrendingUp size={18} className="inline mr-2 text-sky-500" />
                Monthly Cost Trend
              </h3>
              <div className="h-[300px]">
                {monthlySummary.length > 0 ? (
                  <Bar data={monthlyTrendData} options={{ ...commonChartOptions, scales: { ...commonChartOptions.scales, x: { ...commonChartOptions.scales.x, stacked: true } } }} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                    <DollarSign size={32} className="text-slate-600" />
                    <p>No cost data recorded yet.</p>
                    <p className="text-xs text-slate-600">Use "Record Costs" tab to add monthly expenses.</p>
                  </div>
                )}
              </div>
            </div>

            <div className={cardClass}>
              <h3 className={headingClass}>
                <DollarSign size={18} className="inline mr-2 text-amber-500" />
                Current Month Split
              </h3>
              <div className="h-[300px]">
                {currentMonth && currentMonth.total > 0 ? (
                  <Doughnut
                    data={costBreakdownData}
                    options={{
                      responsive: true, maintainAspectRatio: false, cutout: '60%',
                      plugins: {
                        legend: { display: true, position: 'bottom', labels: { color: chartColors.text, padding: 12, usePointStyle: true, font: { size: 11 } } },
                        tooltip: { backgroundColor: chartColors.tooltipBg, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText, borderColor: chartColors.tooltipBorder, borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: (ctx: any) => `${ctx.label}: $${(ctx.raw || 0).toFixed(2)}` } },
                      },
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                    <BarChart3 size={32} className="text-slate-600" />
                    <p>No cost data for current month</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className={headingClass}>
              <Database size={18} className="inline mr-2 text-emerald-500" />
              Live Database Metrics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Database Size', value: `${dbMetrics.totalSizeMb} MB`, icon: HardDrive, health: dbMetrics.totalSizeMb < 500 ? 'good' : dbMetrics.totalSizeMb < 4000 ? 'warn' : 'critical' },
                { label: 'Total Rows', value: dbMetrics.totalRows.toLocaleString(), icon: Server, health: 'good' as const },
                { label: 'Tables', value: dbMetrics.tableCount.toString(), icon: Database, health: 'good' as const },
                { label: 'Storage Buckets', value: dbMetrics.storageBuckets.toString(), icon: HardDrive, health: 'good' as const },
                { label: 'Sessions (Month)', value: dbMetrics.sessionsThisMonth.toLocaleString(), icon: Zap, health: 'good' as const },
                { label: 'Page Views (Month)', value: dbMetrics.pageViewsThisMonth.toLocaleString(), icon: Globe2, health: 'good' as const },
              ].map(metric => (
                <div key={metric.label} className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <metric.icon size={16} className="text-slate-400" />
                    {metric.health === 'good' && <CheckCircle size={14} className="text-emerald-400" />}
                    {metric.health === 'warn' && <AlertTriangle size={14} className="text-amber-400" />}
                    {metric.health === 'critical' && <AlertTriangle size={14} className="text-rose-400" />}
                  </div>
                  <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{metric.value}</p>
                  <p className="text-xs text-slate-400">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === 'breakdown' && (
        <div className={cardClass}>
          <h3 className={headingClass}>
            <Building size={18} className="inline mr-2 text-sky-500" />
            Estimated Cost per Club (Based on Member Count)
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Costs are allocated proportionally based on each club's member count relative to total platform members.
            Current month total: ${(currentMonth?.total || 0).toFixed(2)} USD
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                  <th className="pb-3 pr-4">Club</th>
                  <th className="pb-3 pr-4 text-right">Members</th>
                  <th className="pb-3 pr-4 text-right">Est. DB (MB)</th>
                  <th className="pb-3 pr-4 text-right">Cost Share</th>
                  <th className="pb-3 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {clubEstimates.map(club => {
                  const totalMembers = clubEstimates.reduce((s, c) => s + c.members, 0);
                  const pct = totalMembers > 0 ? ((club.members / totalMembers) * 100).toFixed(1) : '0';
                  return (
                    <tr key={club.id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className={`py-3 pr-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold bg-sky-500/20 text-sky-400">
                            {club.abbreviation?.slice(0, 2) || club.name.slice(0, 2)}
                          </div>
                          <span className="text-sm">{club.name}</span>
                        </div>
                      </td>
                      <td className={`py-3 pr-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{club.members}</td>
                      <td className={`py-3 pr-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{club.dbEstimateMb}</td>
                      <td className="py-3 pr-4 text-right font-medium text-emerald-400">${club.costShare.toFixed(2)}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`w-12 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, parseFloat(pct))}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {clubEstimates.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">No clubs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'forecast' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Avg Monthly Cost', value: avgMonthly, icon: DollarSign },
              { label: '6-Month Forecast', value: avgMonthly * 6 + (growthRate * 21), icon: TrendingUp },
              { label: '12-Month Forecast', value: avgMonthly * 12 + (growthRate * 78), icon: Calendar },
            ].map(card => (
              <div key={card.label} className="rounded-2xl border p-5 backdrop-blur-sm bg-gradient-to-br from-sky-500/15 to-cyan-600/15 border-sky-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <card.icon size={16} className="text-sky-400" />
                  <span className="text-xs text-slate-400">{card.label}</span>
                </div>
                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>${card.value.toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div className={cardClass}>
            <h3 className={headingClass}>
              <TrendingUp size={18} className="inline mr-2 text-sky-500" />
              Cost Forecast (6 Months)
            </h3>
            <div className="h-[350px]">
              {monthlySummary.length > 0 ? (
                <Line data={forecastChartData} options={{ ...commonChartOptions, scales: { ...commonChartOptions.scales, y: { ...commonChartOptions.scales.y, stacked: false } } }} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                  <TrendingUp size={32} className="text-slate-600" />
                  <p>Record at least 2 months of cost data to see forecasts.</p>
                </div>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <h3 className={headingClass}>
              <AlertTriangle size={18} className="inline mr-2 text-amber-500" />
              Cost Alerts & Thresholds
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Supabase Database', current: dbMetrics.totalSizeMb, limit: 8000, unit: 'MB', threshold: 0.75 },
                { label: 'Monthly Spend', current: currentMonth?.total || 0, limit: 500, unit: 'USD', threshold: 0.8 },
              ].map(alert => {
                const usage = alert.limit > 0 ? alert.current / alert.limit : 0;
                const status = usage >= 0.9 ? 'critical' : usage >= alert.threshold ? 'warn' : 'ok';
                return (
                  <div key={alert.label} className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{alert.label}</p>
                      <p className="text-xs text-slate-400">
                        {alert.current.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {alert.limit.toLocaleString()} {alert.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-24 h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                        <div
                          className={`h-full rounded-full transition-all ${status === 'ok' ? 'bg-emerald-500' : status === 'warn' ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(100, usage * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-10 text-right">{(usage * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {viewMode === 'entry' && (
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={headingClass.replace(' mb-4', '')}>
              <Plus size={18} className="inline mr-2 text-emerald-500" />
              Record Monthly Costs
            </h3>
            <button
              onClick={() => setShowAddEntry(!showAddEntry)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25 transition-all"
            >
              <Plus size={14} />
              Add Entry
            </button>
          </div>

          {showAddEntry && (
            <div className="mb-6 p-4 rounded-xl border border-sky-500/20 bg-sky-500/5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Cost Category</label>
                  <select
                    value={newEntry.metric_name}
                    onChange={e => setNewEntry({ ...newEntry, metric_name: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    <option value="">Select category...</option>
                    {COST_CATEGORIES.map(cat => (
                      <option key={cat.key} value={cat.key}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newEntry.cost_usd}
                    onChange={e => setNewEntry({ ...newEntry, cost_usd: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Source</label>
                  <select
                    value={newEntry.source}
                    onChange={e => setNewEntry({ ...newEntry, source: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={newEntry.snapshot_date}
                    onChange={e => setNewEntry({ ...newEntry, snapshot_date: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. February invoice from AWS"
                  value={newEntry.notes}
                  onChange={e => setNewEntry({ ...newEntry, notes: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddEntry(false)} className={`px-4 py-2 rounded-lg text-sm transition-all ${darkMode ? 'text-slate-400 hover:bg-slate-700/50' : 'text-slate-500 hover:bg-slate-100'}`}>
                  Cancel
                </button>
                <button
                  onClick={handleSaveEntry}
                  disabled={saving || !newEntry.metric_name || !newEntry.cost_usd}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-all"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Entry
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Source</th>
                  <th className="pb-3 pr-4 text-right">Amount</th>
                  <th className="pb-3 text-right">Notes</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {costEntries.filter(e => e.cost_usd && e.cost_usd > 0).slice(0, 50).map(entry => {
                  const cat = COST_CATEGORIES.find(c => c.key === entry.metric_name);
                  return (
                    <tr key={entry.id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className={`py-3 pr-4 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {new Date(entry.snapshot_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className={`py-3 pr-4 text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{cat?.label || entry.metric_name}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${
                          entry.source === 'aws' ? 'bg-amber-500/20 text-amber-400' :
                          entry.source === 'supabase' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-sky-500/20 text-sky-400'
                        }`}>
                          {SOURCE_LABELS[entry.source] || entry.source}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-medium text-emerald-400">${(entry.cost_usd || 0).toFixed(2)}</td>
                      <td className="py-3 text-right text-xs text-slate-500">{entry.metadata?.notes || ''}</td>
                    </tr>
                  );
                })}
                {costEntries.filter(e => e.cost_usd && e.cost_usd > 0).length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">No cost entries recorded yet. Click "Add Entry" to start tracking costs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

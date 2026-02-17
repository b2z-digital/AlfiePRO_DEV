import { useState, useEffect, useCallback } from 'react';
import {
  Database, Cloud, DollarSign, HardDrive, Server, TrendingUp,
  RefreshCw, Plus, Calendar, Building,
  Globe2, AlertTriangle, CheckCircle, Zap, BarChart3,
  Save, Archive, FolderOpen, Loader2, CloudOff
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
  storageFiles: number;
  storageSizeMb: number;
  sessionsThisMonth: number;
  pageViewsThisMonth: number;
}

interface StorageBucketInfo {
  id: string;
  name: string;
  public: boolean;
  file_count: number;
  total_bytes: number;
}

interface AwsCostData {
  monthly: { month: string; total: number }[];
  total: number;
  topServices: { name: string; cost: number }[];
  period: { start: string; end: string };
}

interface AmplifyInfo {
  name: string;
  appId: string;
  platform: string;
  defaultDomain: string;
  productionBranch: string;
  branches: { branchName: string; stage: string; lastDeployTime: string; status: string }[];
}

type ViewMode = 'overview' | 'breakdown' | 'storage' | 'aws' | 'forecast' | 'entry';

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

async function fetchDbMetrics(): Promise<{ metrics: DbMetrics; buckets: StorageBucketInfo[] }> {
  const defaults: DbMetrics = {
    totalRows: 0, totalSizeMb: 0, tableCount: 0,
    storageBuckets: 0, storageFiles: 0, storageSizeMb: 0,
    sessionsThisMonth: 0, pageViewsThisMonth: 0,
  };
  let bucketList: StorageBucketInfo[] = [];

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

    const { data: storageData } = await supabase.rpc('get_storage_stats');
    if (storageData && !storageData.error) {
      defaults.storageBuckets = storageData.bucket_count || 0;
      defaults.storageFiles = storageData.total_files || 0;
      defaults.storageSizeMb = Math.round((storageData.total_bytes || 0) / (1024 * 1024) * 100) / 100;
      bucketList = (storageData.buckets || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        public: b.public,
        file_count: b.file_count || 0,
        total_bytes: b.total_bytes || 0,
      }));
    }
  } catch (err) {
    console.error('Error fetching DB metrics:', err);
  }

  return { metrics: defaults, buckets: bucketList };
}

async function fetchAwsData(): Promise<{ costs: AwsCostData | null; amplify: AmplifyInfo | null; error: string | null }> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-platform-resources`;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { costs: null, amplify: null, error: 'Not authenticated' };

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get_aws_costs', months: 6 }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { costs: null, amplify: null, error: errBody.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    const costs = data.costs?.error ? null : data.costs;
    const amplify = data.amplify?.error ? null : data.amplify;

    return { costs, amplify, error: data.costs?.error || data.amplify?.error || null };
  } catch (err: any) {
    return { costs: null, amplify: null, error: err.message };
  }
}

export function ResourceCostsTab({ darkMode }: ResourceCostsTabProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyCostSummary[]>([]);
  const [clubEstimates, setClubEstimates] = useState<ClubCostEstimate[]>([]);
  const [dbMetrics, setDbMetrics] = useState<DbMetrics>({
    totalRows: 0, totalSizeMb: 0, tableCount: 0,
    storageBuckets: 0, storageFiles: 0, storageSizeMb: 0,
    sessionsThisMonth: 0, pageViewsThisMonth: 0,
  });
  const [storageBuckets, setStorageBuckets] = useState<StorageBucketInfo[]>([]);
  const [awsCosts, setAwsCosts] = useState<AwsCostData | null>(null);
  const [amplifyInfo, setAmplifyInfo] = useState<AmplifyInfo | null>(null);
  const [awsLoading, setAwsLoading] = useState(false);
  const [awsError, setAwsError] = useState<string | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    metric_name: '',
    cost_usd: '',
    source: 'aws',
    snapshot_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [compressionPreview, setCompressionPreview] = useState<any>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressionResult, setCompressionResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const runCompressionPreview = async () => {
    setPreviewLoading(true);
    setCompressionPreview(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compress-existing-images`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      });
      const data = await res.json();
      setCompressionPreview(data);
    } catch (err) {
      console.error('Compression preview error:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runCompression = async (maxFiles = 50) => {
    setCompressing(true);
    setCompressionResult(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compress-existing-images`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compress', maxFiles }),
      });
      const data = await res.json();
      setCompressionResult(data);
    } catch (err) {
      console.error('Compression error:', err);
    } finally {
      setCompressing(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [{ metrics, buckets }, snapshotsRes] = await Promise.all([
        fetchDbMetrics(),
        supabase
          .from('platform_resource_snapshots')
          .select('*')
          .order('snapshot_date', { ascending: false })
          .limit(500),
      ]);

      setDbMetrics(metrics);
      setStorageBuckets(buckets);

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

  const loadAwsData = useCallback(async () => {
    setAwsLoading(true);
    setAwsError(null);
    const { costs, amplify, error } = await fetchAwsData();
    setAwsCosts(costs);
    setAmplifyInfo(amplify);
    if (error && !costs && !amplify) setAwsError(error);
    setAwsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadAwsData();
  }, [loadAwsData]);

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

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
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

  const awsMonthlyTotal = awsCosts?.monthly?.length
    ? awsCosts.monthly[awsCosts.monthly.length - 1].total
    : 0;

  const combinedMonthlyData = (() => {
    const labels: string[] = [];
    const awsData: number[] = [];
    const supabaseData: number[] = [];
    const otherData: number[] = [];

    if (awsCosts?.monthly?.length) {
      const awsMap = new Map(awsCosts.monthly.map(m => [m.month, m.total]));
      const manualMap = new Map<string, MonthlyCostSummary>();
      monthlySummary.forEach(m => manualMap.set(m.month, m));

      const allMonths = new Set([...awsMap.keys(), ...manualMap.keys()]);
      const sortedMonths = [...allMonths].sort();

      sortedMonths.forEach(month => {
        const [y, mo] = month.split('-');
        labels.push(new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }));
        awsData.push(awsMap.get(month) || 0);
        supabaseData.push(manualMap.get(month)?.supabase || 0);
        otherData.push(manualMap.get(month)?.other || 0);
      });
    } else {
      monthlySummary.forEach(m => {
        const [y, mo] = m.month.split('-');
        labels.push(new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }));
        awsData.push(m.aws);
        supabaseData.push(m.supabase);
        otherData.push(m.other);
      });
    }

    return {
      labels,
      datasets: [
        { label: 'AWS', data: awsData, backgroundColor: '#f59e0b', borderRadius: 4, stack: 'stack1' },
        { label: 'Supabase', data: supabaseData, backgroundColor: '#10b981', borderRadius: 4, stack: 'stack1' },
        { label: 'Other', data: otherData, backgroundColor: '#0ea5e9', borderRadius: 4, stack: 'stack1' },
      ],
    };
  })();

  const costBreakdownData = (() => {
    const awsTotal = awsCosts?.total || currentMonth?.aws || 0;
    const supTotal = currentMonth?.supabase || 0;
    const othTotal = currentMonth?.other || 0;
    if (awsTotal + supTotal + othTotal === 0) return { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }] };
    return {
      labels: ['AWS', 'Supabase', 'Other'],
      datasets: [{ data: [awsTotal, supTotal, othTotal], backgroundColor: ['#f59e0b', '#10b981', '#0ea5e9'], borderWidth: 0 }],
    };
  })();

  const forecastMonths = 6;
  const avgMonthly = monthlySummary.length > 0 ? monthlySummary.reduce((s, m) => s + m.total, 0) / monthlySummary.length : 0;
  const effectiveAvg = awsCosts ? avgMonthly + (awsCosts.total / Math.max(awsCosts.monthly.length, 1)) : avgMonthly;
  const growthRate = monthlySummary.length >= 2 ? (monthlySummary[monthlySummary.length - 1].total - monthlySummary[0].total) / (monthlySummary.length - 1) : 0;

  const forecastLabels: string[] = [];
  const forecastActual: (number | null)[] = [];
  const forecastProjected: (number | null)[] = [];

  monthlySummary.forEach(m => {
    const [y, mo] = m.month.split('-');
    forecastLabels.push(new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }));
    forecastActual.push(m.total + (awsCosts?.monthly?.find(a => a.month === m.month)?.total || 0));
    forecastProjected.push(null);
  });

  const lastTotal = forecastActual.length > 0 ? (forecastActual[forecastActual.length - 1] || 0) : 0;
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
          {(['overview', 'storage', 'aws', 'breakdown', 'forecast', 'entry'] as ViewMode[]).map(mode => (
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
              {mode === 'storage' && <><Archive size={14} className="inline mr-1.5" />Storage</>}
              {mode === 'aws' && <><Cloud size={14} className="inline mr-1.5" />AWS</>}
              {mode === 'breakdown' && <><Building size={14} className="inline mr-1.5" />Club Costs</>}
              {mode === 'forecast' && <><TrendingUp size={14} className="inline mr-1.5" />Forecast</>}
              {mode === 'entry' && <><Plus size={14} className="inline mr-1.5" />Record Costs</>}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setRefreshing(true); loadData(); loadAwsData(); }}
          disabled={refreshing}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {viewMode === 'overview' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {[
              { label: 'This Month', value: (currentMonth?.total || 0) + awsMonthlyTotal, prefix: '$', color: 'sky', icon: DollarSign, sub: currentMonth?.month || 'Current' },
              { label: 'AWS Cost', value: awsMonthlyTotal || currentMonth?.aws || 0, prefix: '$', color: 'amber', icon: Cloud, sub: 'Live from AWS' },
              { label: 'Supabase Cost', value: currentMonth?.supabase || 0, prefix: '$', color: 'emerald', icon: Database, sub: 'Database + Storage' },
              { label: 'DB Size', value: dbMetrics.totalSizeMb, suffix: ' MB', color: 'cyan', icon: HardDrive, sub: `${dbMetrics.tableCount} tables` },
              { label: 'Total Rows', value: dbMetrics.totalRows, color: 'rose', icon: Server, sub: 'All tables' },
              { label: 'Storage', value: dbMetrics.storageSizeMb, suffix: ' MB', color: 'teal', icon: Archive, sub: `${dbMetrics.storageBuckets} buckets` },
              { label: 'Files Stored', value: dbMetrics.storageFiles, color: 'blue', icon: FolderOpen, sub: `${dbMetrics.storageBuckets} buckets` },
              { label: 'Total Spend', value: totalAllTime + (awsCosts?.total || 0), prefix: '$', color: 'slate', icon: DollarSign, sub: 'All time' },
            ].map(card => {
              const cMap: Record<string, string> = {
                sky: 'from-sky-500/20 to-sky-700/20 border-sky-500/30',
                amber: 'from-amber-500/20 to-amber-700/20 border-amber-500/30',
                emerald: 'from-emerald-500/20 to-emerald-700/20 border-emerald-500/30',
                cyan: 'from-cyan-500/20 to-cyan-700/20 border-cyan-500/30',
                rose: 'from-rose-500/20 to-rose-700/20 border-rose-500/30',
                teal: 'from-teal-500/20 to-teal-700/20 border-teal-500/30',
                blue: 'from-blue-500/20 to-blue-700/20 border-blue-500/30',
                slate: 'from-slate-600/20 to-slate-800/20 border-slate-500/30',
              };
              const iMap: Record<string, string> = {
                sky: 'text-sky-400', amber: 'text-amber-400', emerald: 'text-emerald-400',
                cyan: 'text-cyan-400', rose: 'text-rose-400', teal: 'text-teal-400',
                blue: 'text-blue-400', slate: 'text-slate-300',
              };
              return (
                <div key={card.label} className={`rounded-2xl border p-4 backdrop-blur-sm bg-gradient-to-br ${cMap[card.color]} transition-all hover:scale-[1.02]`}>
                  <div className="flex items-center gap-2 mb-2">
                    <card.icon size={14} className={iMap[card.color]} />
                  </div>
                  <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
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
                {awsCosts && <span className="text-xs font-normal text-emerald-400 ml-2">(includes live AWS data)</span>}
              </h3>
              <div className="h-[300px]">
                {combinedMonthlyData.labels.length > 0 ? (
                  <Bar data={combinedMonthlyData} options={{ ...commonChartOptions, scales: { ...commonChartOptions.scales, x: { ...commonChartOptions.scales.x, stacked: true } } }} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                    <DollarSign size={32} className="text-slate-600" />
                    <p>No cost data recorded yet.</p>
                  </div>
                )}
              </div>
            </div>

            <div className={cardClass}>
              <h3 className={headingClass}>
                <DollarSign size={18} className="inline mr-2 text-amber-500" />
                Cost Split
              </h3>
              <div className="h-[300px]">
                {costBreakdownData.labels.length > 0 ? (
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
              Live Platform Metrics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: 'Database Size', value: `${dbMetrics.totalSizeMb} MB`, icon: HardDrive, health: dbMetrics.totalSizeMb < 500 ? 'good' : dbMetrics.totalSizeMb < 4000 ? 'warn' : 'critical' },
                { label: 'Total Rows', value: dbMetrics.totalRows.toLocaleString(), icon: Server, health: 'good' as const },
                { label: 'Tables', value: dbMetrics.tableCount.toString(), icon: Database, health: 'good' as const },
                { label: 'Storage Buckets', value: dbMetrics.storageBuckets.toString(), icon: Archive, health: 'good' as const },
                { label: 'Files Stored', value: dbMetrics.storageFiles.toLocaleString(), icon: FolderOpen, health: 'good' as const },
                { label: 'Storage Size', value: `${dbMetrics.storageSizeMb} MB`, icon: HardDrive, health: dbMetrics.storageSizeMb < 1000 ? 'good' : 'warn' },
                { label: 'Sessions/Mo', value: dbMetrics.sessionsThisMonth.toLocaleString(), icon: Zap, health: 'good' as const },
                { label: 'Views/Mo', value: dbMetrics.pageViewsThisMonth.toLocaleString(), icon: Globe2, health: 'good' as const },
              ].map(metric => (
                <div key={metric.label} className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <metric.icon size={14} className="text-slate-400" />
                    {metric.health === 'good' && <CheckCircle size={12} className="text-emerald-400" />}
                    {metric.health === 'warn' && <AlertTriangle size={12} className="text-amber-400" />}
                    {metric.health === 'critical' && <AlertTriangle size={12} className="text-rose-400" />}
                  </div>
                  <p className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{metric.value}</p>
                  <p className="text-[10px] text-slate-400">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === 'storage' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { label: 'Storage Buckets', value: dbMetrics.storageBuckets, icon: Archive, color: 'teal' },
              { label: 'Total Files', value: dbMetrics.storageFiles.toLocaleString(), icon: FolderOpen, color: 'blue' },
              { label: 'Total Size', value: `${dbMetrics.storageSizeMb} MB`, icon: HardDrive, color: 'cyan' },
              { label: 'Avg per Bucket', value: dbMetrics.storageBuckets > 0 ? `${Math.round(dbMetrics.storageFiles / dbMetrics.storageBuckets)} files` : '0', icon: Database, color: 'emerald' },
            ].map(card => {
              const cMap: Record<string, string> = {
                teal: 'from-teal-500/20 to-teal-700/20 border-teal-500/30',
                blue: 'from-blue-500/20 to-blue-700/20 border-blue-500/30',
                cyan: 'from-cyan-500/20 to-cyan-700/20 border-cyan-500/30',
                emerald: 'from-emerald-500/20 to-emerald-700/20 border-emerald-500/30',
              };
              return (
                <div key={card.label} className={`rounded-2xl border p-5 bg-gradient-to-br ${cMap[card.color]} transition-all`}>
                  <card.icon size={16} className="text-slate-400 mb-2" />
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{card.value}</p>
                  <p className="text-xs text-slate-400">{card.label}</p>
                </div>
              );
            })}
          </div>

          <div className={cardClass}>
            <h3 className={headingClass}>
              <Archive size={18} className="inline mr-2 text-teal-500" />
              Storage Bucket Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                    <th className="pb-3 pr-4">Bucket</th>
                    <th className="pb-3 pr-4 text-center">Public</th>
                    <th className="pb-3 pr-4 text-right">Files</th>
                    <th className="pb-3 pr-4 text-right">Size</th>
                    <th className="pb-3 text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                  {storageBuckets.map(bucket => {
                    const totalBytes = storageBuckets.reduce((s, b) => s + b.total_bytes, 0);
                    const pct = totalBytes > 0 ? ((bucket.total_bytes / totalBytes) * 100) : 0;
                    return (
                      <tr key={bucket.id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                        <td className={`py-3 pr-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] ${bucket.public ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              <Archive size={12} />
                            </div>
                            <span className="text-sm font-medium">{bucket.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${bucket.public ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {bucket.public ? 'Public' : 'Private'}
                          </span>
                        </td>
                        <td className={`py-3 pr-4 text-right text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{bucket.file_count.toLocaleString()}</td>
                        <td className={`py-3 pr-4 text-right text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{formatBytes(bucket.total_bytes)}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className={`w-16 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                              <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                            <span className="text-xs text-slate-400 w-12 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {storageBuckets.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">No storage buckets found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={headingClass + ' !mb-0'}>
                <Zap size={18} className="inline mr-2 text-amber-500" />
                Image Compression
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={runCompressionPreview}
                  disabled={previewLoading}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />}
                  Scan Buckets
                </button>
                <button
                  onClick={() => runCompression(50)}
                  disabled={compressing}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {compressing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                  {compressing ? 'Compressing...' : 'Compress (50 files)'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              All new image uploads are automatically compressed. Use this tool to compress existing images already stored in your buckets.
            </p>

            {compressionPreview && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-4 text-sm">
                  <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Total image storage: <strong>{compressionPreview.totalOriginalMB} MB</strong></span>
                  <span className="text-amber-400">Compressible images: <strong>{compressionPreview.compressibleImages}</strong></span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {compressionPreview.buckets?.map((b: any) => (
                    <div key={b.bucket} className={`p-2 rounded-lg text-xs ${darkMode ? 'bg-slate-700/40' : 'bg-slate-100'}`}>
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{b.bucket}</div>
                      <div className="text-slate-400">{b.totalImages} images / {b.totalSizeMB} MB</div>
                      <div className="text-amber-400">{b.compressibleImages} to compress</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {compressionResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-emerald-400">Saved: <strong>{compressionResult.totalSavedMB} MB</strong></span>
                  <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Processed: {compressionResult.processed}</span>
                  <span className="text-slate-400">Skipped: {compressionResult.skipped}</span>
                  {compressionResult.errors > 0 && <span className="text-red-400">Errors: {compressionResult.errors}</span>}
                </div>
                {compressionResult.errorDetails?.length > 0 && (
                  <div className={`text-xs p-3 rounded-lg max-h-32 overflow-y-auto ${darkMode ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    {compressionResult.errorDetails.map((err: string, i: number) => (
                      <div key={i} className="py-0.5">{err}</div>
                    ))}
                  </div>
                )}
                {compressionResult.files?.length > 0 && (
                  <div className={`max-h-48 overflow-y-auto rounded-lg border ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className={`text-left uppercase tracking-wider text-slate-400 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                          <th className="p-2">File</th>
                          <th className="p-2 text-right">Original</th>
                          <th className="p-2 text-right">Compressed</th>
                          <th className="p-2 text-right">Saved</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                        {compressionResult.files.map((f: any, i: number) => (
                          <tr key={i}>
                            <td className={`p-2 truncate max-w-[200px] ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{f.file}</td>
                            <td className="p-2 text-right text-slate-400">{f.originalKB} KB</td>
                            <td className="p-2 text-right text-slate-400">{f.compressedKB} KB</td>
                            <td className="p-2 text-right text-emerald-400">-{f.reductionPercent}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {storageBuckets.length > 0 && (
            <div className={cardClass}>
              <h3 className={headingClass}>
                <BarChart3 size={18} className="inline mr-2 text-blue-500" />
                Storage Distribution
              </h3>
              <div className="h-[300px]">
                <Doughnut
                  data={{
                    labels: storageBuckets.filter(b => b.total_bytes > 0).map(b => b.name),
                    datasets: [{
                      data: storageBuckets.filter(b => b.total_bytes > 0).map(b => Math.round(b.total_bytes / 1024)),
                      backgroundColor: ['#14b8a6', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#10b981', '#f97316', '#06b6d4', '#6366f1', '#84cc16', '#d946ef', '#fb923c', '#22d3ee'],
                      borderWidth: 0,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false, cutout: '55%',
                    plugins: {
                      legend: { display: true, position: 'right', labels: { color: chartColors.text, padding: 8, usePointStyle: true, font: { size: 10 } } },
                      tooltip: {
                        backgroundColor: chartColors.tooltipBg, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText,
                        callbacks: { label: (ctx: any) => `${ctx.label}: ${formatBytes((ctx.raw || 0) * 1024)}` },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === 'aws' && (
        <>
          {awsLoading && (
            <div className="flex items-center justify-center h-48 gap-3">
              <Loader2 size={24} className="animate-spin text-amber-500" />
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Fetching live data from AWS...</span>
            </div>
          )}

          {!awsLoading && awsError && !awsCosts && (
            <div className={`${cardClass} text-center py-12`}>
              <CloudOff size={48} className="mx-auto text-amber-500 mb-4" />
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>AWS Connection</h3>
              <p className="text-sm text-slate-400 mb-2">{awsError}</p>
              <p className="text-xs text-slate-500">AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) must be set as Supabase Edge Function secrets with Cost Explorer read access (ce:GetCostAndUsage).</p>
            </div>
          )}

          {!awsLoading && awsCosts && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[
                  { label: 'AWS Total (Period)', value: awsCosts.total, prefix: '$', icon: Cloud, color: 'amber' },
                  { label: 'Latest Month', value: awsCosts.monthly.length > 0 ? awsCosts.monthly[awsCosts.monthly.length - 1].total : 0, prefix: '$', icon: DollarSign, color: 'sky' },
                  { label: 'AWS Services', value: awsCosts.topServices.length, icon: Server, color: 'emerald' },
                  { label: 'Period', value: `${awsCosts.period.start.slice(0, 7)} to ${awsCosts.period.end.slice(0, 7)}`, icon: Calendar, color: 'cyan' },
                ].map(card => {
                  const cMap: Record<string, string> = {
                    amber: 'from-amber-500/20 to-amber-700/20 border-amber-500/30',
                    sky: 'from-sky-500/20 to-sky-700/20 border-sky-500/30',
                    emerald: 'from-emerald-500/20 to-emerald-700/20 border-emerald-500/30',
                    cyan: 'from-cyan-500/20 to-cyan-700/20 border-cyan-500/30',
                  };
                  return (
                    <div key={card.label} className={`rounded-2xl border p-5 bg-gradient-to-br ${cMap[card.color]} transition-all`}>
                      <card.icon size={16} className="text-slate-400 mb-2" />
                      <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {card.prefix || ''}{typeof card.value === 'number' ? card.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : card.value}
                      </p>
                      <p className="text-xs text-slate-400">{card.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={cardClass}>
                  <h3 className={headingClass}>
                    <Cloud size={18} className="inline mr-2 text-amber-500" />
                    AWS Monthly Costs (Live)
                  </h3>
                  <div className="h-[280px]">
                    <Bar
                      data={{
                        labels: awsCosts.monthly.map(m => {
                          const [y, mo] = m.month.split('-');
                          return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
                        }),
                        datasets: [{
                          label: 'AWS Cost',
                          data: awsCosts.monthly.map(m => m.total),
                          backgroundColor: '#f59e0b',
                          borderRadius: 6,
                        }],
                      }}
                      options={{
                        ...commonChartOptions,
                        scales: { ...commonChartOptions.scales, y: { ...commonChartOptions.scales.y, stacked: false } },
                      }}
                    />
                  </div>
                </div>

                <div className={cardClass}>
                  <h3 className={headingClass}>
                    <Server size={18} className="inline mr-2 text-emerald-500" />
                    AWS Service Breakdown
                  </h3>
                  <div className="space-y-3 max-h-[280px] overflow-y-auto">
                    {awsCosts.topServices.map((svc, idx) => {
                      const pct = awsCosts.total > 0 ? (svc.cost / awsCosts.total) * 100 : 0;
                      return (
                        <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                          <div className="flex-1 min-w-0 mr-4">
                            <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{svc.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-400 w-10 text-right">{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-amber-400">${svc.cost.toFixed(2)}</span>
                        </div>
                      );
                    })}
                    {awsCosts.topServices.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-8">No AWS service costs found</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {!awsLoading && amplifyInfo && (
            <div className={cardClass}>
              <h3 className={headingClass}>
                <Cloud size={18} className="inline mr-2 text-amber-500" />
                AWS Amplify App Info
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[10px] text-slate-400 uppercase">App Name</p>
                  <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{amplifyInfo.name || 'N/A'}</p>
                </div>
                <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[10px] text-slate-400 uppercase">App ID</p>
                  <p className={`text-sm font-mono ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{amplifyInfo.appId || 'N/A'}</p>
                </div>
                <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[10px] text-slate-400 uppercase">Production Branch</p>
                  <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{amplifyInfo.productionBranch || 'N/A'}</p>
                </div>
                <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[10px] text-slate-400 uppercase">Default Domain</p>
                  <p className={`text-sm font-mono truncate ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{amplifyInfo.defaultDomain || 'N/A'}</p>
                </div>
              </div>
              {amplifyInfo.branches.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={`text-left text-xs font-medium uppercase tracking-wider text-slate-400 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                        <th className="pb-3 pr-4">Branch</th>
                        <th className="pb-3 pr-4">Stage</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3 text-right">Last Deploy</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                      {amplifyInfo.branches.map((b, i) => (
                        <tr key={i} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                          <td className={`py-2.5 pr-4 text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{b.branchName}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${b.stage === 'PRODUCTION' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'}`}>
                              {b.stage}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className={`inline-flex items-center gap-1 text-xs ${b.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${b.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                              {b.status}
                            </span>
                          </td>
                          <td className={`py-2.5 text-right text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {b.lastDeployTime ? new Date(b.lastDeployTime).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
            Current month total: ${((currentMonth?.total || 0) + awsMonthlyTotal).toFixed(2)} USD
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
              { label: 'Avg Monthly Cost', value: effectiveAvg, icon: DollarSign },
              { label: '6-Month Forecast', value: effectiveAvg * 6 + (growthRate * 21), icon: TrendingUp },
              { label: '12-Month Forecast', value: effectiveAvg * 12 + (growthRate * 78), icon: Calendar },
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
                { label: 'Supabase Storage', current: dbMetrics.storageSizeMb, limit: 1000, unit: 'MB', threshold: 0.75 },
                { label: 'Monthly Spend', current: (currentMonth?.total || 0) + awsMonthlyTotal, limit: 500, unit: 'USD', threshold: 0.8 },
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

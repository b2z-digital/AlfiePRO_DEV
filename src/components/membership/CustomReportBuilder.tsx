import React, { useState } from 'react';
import { X, Plus, Trash2, Download, Eye, Save, Loader2, AlertCircle, Table, BarChart3 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Bar, Pie, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend
);

interface CustomReportBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  stateAssociationId?: string;
  nationalAssociationId?: string;
}

interface ReportMetric {
  id: string;
  field: string;
  aggregation: 'count' | 'sum' | 'average' | 'min' | 'max';
  label: string;
}

interface ReportFilter {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface ReportGroupBy {
  field: string;
  label: string;
}

interface ReportRow {
  [key: string]: string | number;
}

const AVAILABLE_METRICS = [
  { value: 'total_members', label: 'Total Members' },
  { value: 'financial_members', label: 'Financial Members' },
  { value: 'membership_level', label: 'Membership Type' },
  { value: 'club', label: 'Club' },
  { value: 'date_joined', label: 'Join Date' },
  { value: 'renewal_date', label: 'Renewal Date' },
  { value: 'boat_class', label: 'Boat Class' },
];

const GROUP_BY_OPTIONS = [
  { value: 'club', label: 'Club' },
  { value: 'membership_level', label: 'Membership Type' },
  { value: 'boat_class', label: 'Boat Class' },
  { value: 'month_joined', label: 'Month Joined' },
  { value: 'year_joined', label: 'Year Joined' },
  { value: 'financial_status', label: 'Financial Status' },
];

const CHART_TYPES = [
  { value: 'table', label: 'Table' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'line', label: 'Line Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'doughnut', label: 'Doughnut Chart' },
];

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const CustomReportBuilder: React.FC<CustomReportBuilderProps> = ({
  isOpen,
  onClose,
  darkMode,
  stateAssociationId,
  nationalAssociationId
}) => {
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [metrics, setMetrics] = useState<ReportMetric[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState<ReportGroupBy | null>(null);
  const [chartType, setChartType] = useState('table');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportData, setReportData] = useState<ReportRow[] | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const addMetric = () => {
    setMetrics([...metrics, {
      id: `metric-${Date.now()}`,
      field: 'total_members',
      aggregation: 'count',
      label: 'Total Members'
    }]);
  };

  const removeMetric = (id: string) => setMetrics(metrics.filter(m => m.id !== id));

  const updateMetric = (id: string, updates: Partial<ReportMetric>) =>
    setMetrics(metrics.map(m => m.id === id ? { ...m, ...updates } : m));

  const addFilter = () => {
    setFilters([...filters, {
      id: `filter-${Date.now()}`,
      field: 'membership_level',
      operator: 'equals',
      value: ''
    }]);
  };

  const removeFilter = (id: string) => setFilters(filters.filter(f => f.id !== id));

  const updateFilter = (id: string, updates: Partial<ReportFilter>) =>
    setFilters(filters.map(f => f.id === id ? { ...f, ...updates } : f));

  const fetchMembersData = async () => {
    let clubIds: string[] = [];

    if (stateAssociationId) {
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id')
        .eq('state_association_id', stateAssociationId);
      clubIds = (clubs || []).map((c: any) => c.id);
    } else if (nationalAssociationId) {
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id')
        .eq('national_association_id', nationalAssociationId);
      clubIds = (clubs || []).map((c: any) => c.id);
    }

    if (clubIds.length === 0) {
      return { members: [], clubs: [] };
    }

    const { data: clubDetails } = await supabase
      .from('clubs')
      .select('id, name')
      .in('id', clubIds);

    let query = supabase
      .from('members')
      .select('id, first_name, last_name, membership_level, club_id, club, date_joined, renewal_date, is_financial, membership_status, boat_class')
      .in('club_id', clubIds);

    if (dateRange.from) query = query.gte('date_joined', dateRange.from);
    if (dateRange.to) query = query.lte('date_joined', dateRange.to);

    // Apply filters
    for (const f of filters) {
      if (!f.value) continue;
      const col = fieldToColumn(f.field);
      if (!col) continue;
      if (f.operator === 'equals') query = query.eq(col, f.value);
      else if (f.operator === 'not_equals') query = query.neq(col, f.value);
      else if (f.operator === 'contains') query = query.ilike(col, `%${f.value}%`);
    }

    const { data: members, error } = await query;
    if (error) throw error;

    return { members: members || [], clubs: clubDetails || [] };
  };

  const fieldToColumn = (field: string): string | null => {
    const map: Record<string, string> = {
      total_members: 'membership_status',
      financial_members: 'is_financial',
      membership_level: 'membership_level',
      club: 'club_id',
      date_joined: 'date_joined',
      renewal_date: 'renewal_date',
      boat_class: 'boat_class',
    };
    return map[field] || null;
  };

  const groupMembers = (members: any[], clubs: any[]): ReportRow[] => {
    const clubMap = new Map(clubs.map((c: any) => [c.id, c.name]));

    if (!groupBy) {
      // Summary row
      const total = members.filter(m => m.membership_status === 'active').length;
      const financial = members.filter(m => m.is_financial).length;
      return [{ 'Group': 'All Members', 'Total Members': total, 'Financial Members': financial }];
    }

    const groups = new Map<string, any[]>();

    for (const m of members) {
      let key = '';
      if (groupBy.field === 'club') key = clubMap.get(m.club_id) || m.club || 'Unknown';
      else if (groupBy.field === 'membership_level') key = m.membership_level || 'Unknown';
      else if (groupBy.field === 'boat_class') key = m.boat_class || 'Unspecified';
      else if (groupBy.field === 'month_joined') {
        if (m.date_joined) {
          const d = new Date(m.date_joined);
          key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
        } else key = 'Unknown';
      } else if (groupBy.field === 'year_joined') {
        key = m.date_joined ? String(new Date(m.date_joined).getFullYear()) : 'Unknown';
      } else if (groupBy.field === 'financial_status') {
        key = m.is_financial ? 'Financial' : 'Non-Financial';
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    const rows: ReportRow[] = [];
    for (const [label, groupMembers] of groups) {
      const row: ReportRow = { [groupBy.label]: label };
      for (const metric of metrics) {
        if (metric.field === 'total_members') row['Total Members'] = groupMembers.filter(m => m.membership_status === 'active').length;
        else if (metric.field === 'financial_members') row['Financial Members'] = groupMembers.filter(m => m.is_financial).length;
        else row[metric.label] = groupMembers.length;
      }
      rows.push(row);
    }

    return rows.sort((a, b) => {
      const aVal = a[groupBy.label] as string;
      const bVal = b[groupBy.label] as string;
      return aVal.localeCompare(bVal);
    });
  };

  const handleRunReport = async () => {
    if (metrics.length === 0) return;
    setRunning(true);
    setReportError(null);
    setReportData(null);

    try {
      const { members, clubs } = await fetchMembersData();
      const rows = groupMembers(members, clubs);
      setReportData(rows);
    } catch (err: any) {
      setReportError(err.message || 'Failed to run report');
    } finally {
      setRunning(false);
    }
  };

  const handleSaveReport = async () => {
    if (!reportName || metrics.length === 0) return;
    setSaving(true);
    try {
      const report = {
        name: reportName,
        description: reportDescription,
        metrics,
        filters,
        groupBy,
        chartType,
        dateRange,
        createdAt: new Date().toISOString()
      };
      const saved = JSON.parse(localStorage.getItem('customReports') || '[]');
      saved.push(report);
      localStorage.setItem('customReports', JSON.stringify(saved));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (!reportData || reportData.length === 0) return;
    const headers = Object.keys(reportData[0]);
    const rows = reportData.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportName || 'report'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildChartData = () => {
    if (!reportData || reportData.length === 0) return null;
    const labelKey = groupBy ? groupBy.label : 'Group';
    const valueKey = metrics[0]?.label || 'Total Members';
    const labels = reportData.map(r => String(r[labelKey] ?? ''));
    const values = reportData.map(r => Number(r[valueKey] ?? 0));

    return {
      labels,
      datasets: [{
        label: valueKey,
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 1,
        fill: chartType === 'line' ? false : undefined,
        tension: 0.4,
      }]
    };
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: darkMode ? '#cbd5e1' : '#475569' } },
      title: { display: false }
    },
    scales: chartType === 'bar' || chartType === 'line' ? {
      x: { ticks: { color: darkMode ? '#94a3b8' : '#64748b' }, grid: { color: darkMode ? '#334155' : '#e2e8f0' } },
      y: { ticks: { color: darkMode ? '#94a3b8' : '#64748b' }, grid: { color: darkMode ? '#334155' : '#e2e8f0' } }
    } : {}
  };

  if (!isOpen) return null;

  const chartData = buildChartData();
  const tableHeaders = reportData && reportData.length > 0 ? Object.keys(reportData[0]) : [];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl border flex flex-col ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-700 p-6 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white">Custom Report Builder</h2>
            <p className="text-blue-100 text-sm mt-1">Create custom reports with specific metrics and visualizations</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Report Name & Description */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Report Name
              </label>
              <input
                type="text"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g., Monthly Growth Report"
                className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Description (Optional)
              </label>
              <input
                type="text"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="What this report shows..."
                className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                }`}
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="mb-6">
            <h3 className={`text-sm font-semibold mb-3 uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Date Range (Join Date)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>From</label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>To</label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Metrics */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Metrics
                </h3>
                <button
                  onClick={addMetric}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {metrics.map((metric) => (
                  <div key={metric.id} className={`p-3 rounded-lg flex items-center gap-2 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                    <select
                      value={metric.field}
                      onChange={(e) => {
                        const selected = AVAILABLE_METRICS.find(m => m.value === e.target.value);
                        updateMetric(metric.id, { field: e.target.value, label: selected?.label || '' });
                      }}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        darkMode ? 'bg-slate-600 text-slate-200 border-slate-500' : 'bg-white text-slate-900 border-slate-300'
                      }`}
                    >
                      {AVAILABLE_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <button
                      onClick={() => removeMetric(metric.id)}
                      className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {metrics.length === 0 && (
                  <div className={`p-6 rounded-lg border-2 border-dashed text-center text-sm ${
                    darkMode ? 'border-slate-700 text-slate-500' : 'border-slate-300 text-slate-400'
                  }`}>
                    Click "Add" to add a metric
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Filters
                </h3>
                <button
                  onClick={addFilter}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium transition-colors"
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {filters.map((filter) => (
                  <div key={filter.id} className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        value={filter.field}
                        onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                        className={`flex-1 px-2 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                          darkMode ? 'bg-slate-600 text-slate-200 border-slate-500' : 'bg-white text-slate-900 border-slate-300'
                        }`}
                      >
                        {AVAILABLE_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <button
                        onClick={() => removeFilter(filter.id)}
                        className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={filter.operator}
                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                        className={`w-32 px-2 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                          darkMode ? 'bg-slate-600 text-slate-200 border-slate-500' : 'bg-white text-slate-900 border-slate-300'
                        }`}
                      >
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not Equals</option>
                        <option value="contains">Contains</option>
                      </select>
                      <input
                        type="text"
                        value={filter.value}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        placeholder="Value..."
                        className={`flex-1 px-2 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                          darkMode ? 'bg-slate-600 text-slate-200 border-slate-500' : 'bg-white text-slate-900 border-slate-300'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Group By & Chart Type */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Group By (Optional)
              </label>
              <select
                value={groupBy?.field || ''}
                onChange={(e) => {
                  const selected = GROUP_BY_OPTIONS.find(opt => opt.value === e.target.value);
                  setGroupBy(selected ? { field: selected.value, label: selected.label } : null);
                }}
                className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                }`}
              >
                <option value="">No Grouping</option>
                {GROUP_BY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Visualization Type
              </label>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                }`}
              >
                {CHART_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
          </div>

          {/* Results */}
          {running && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <span className={`ml-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Running report...</span>
            </div>
          )}

          {reportError && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 mb-4">
              <AlertCircle size={18} />
              <span className="text-sm">{reportError}</span>
            </div>
          )}

          {reportData && !running && (
            <div className={`rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-900/30' : 'border-slate-200 bg-slate-50'}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2">
                  {chartType === 'table' ? <Table size={16} className="text-blue-400" /> : <BarChart3 size={16} className="text-blue-400" />}
                  <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    {reportData.length} {reportData.length === 1 ? 'row' : 'rows'}
                  </span>
                </div>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
                >
                  <Download size={13} />
                  Export CSV
                </button>
              </div>

              {chartType === 'table' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={darkMode ? 'bg-slate-800' : 'bg-slate-100'}>
                        {tableHeaders.map(h => (
                          <th key={h} className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row, i) => (
                        <tr key={i} className={`border-t ${darkMode ? 'border-slate-700 hover:bg-slate-800/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                          {tableHeaders.map(h => (
                            <td key={h} className={`px-4 py-2.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                              {String(row[h] ?? '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : chartData ? (
                <div className="p-4" style={{ maxHeight: 320 }}>
                  {chartType === 'bar' && <Bar data={chartData} options={{ ...chartOptions, maintainAspectRatio: false } as any} height={280} />}
                  {chartType === 'line' && <Line data={chartData} options={{ ...chartOptions, maintainAspectRatio: false } as any} height={280} />}
                  {chartType === 'pie' && <Pie data={chartData} options={{ ...chartOptions, maintainAspectRatio: false } as any} height={280} />}
                  {chartType === 'doughnut' && <Doughnut data={chartData} options={{ ...chartOptions, maintainAspectRatio: false } as any} height={280} />}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-5 border-t flex-shrink-0 flex items-center justify-between ${
          darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            onClick={onClose}
            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
              darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
            }`}
          >
            Cancel
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleRunReport}
              disabled={metrics.length === 0 || running}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              {running ? 'Running...' : 'Run Report'}
            </button>

            <button
              onClick={handleSaveReport}
              disabled={!reportName || metrics.length === 0 || saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

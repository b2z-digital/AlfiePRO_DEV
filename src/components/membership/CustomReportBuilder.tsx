import React, { useState } from 'react';
import { X, Plus, Trash2, Download, Eye, Save } from 'lucide-react';

interface CustomReportBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
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

const AVAILABLE_METRICS = [
  { value: 'total_members', label: 'Total Members', aggregation: 'count' },
  { value: 'financial_members', label: 'Financial Members', aggregation: 'count' },
  { value: 'membership_level', label: 'Membership Type', aggregation: 'count' },
  { value: 'club', label: 'Club', aggregation: 'count' },
  { value: 'date_joined', label: 'Join Date', aggregation: 'count' },
  { value: 'renewal_date', label: 'Renewal Date', aggregation: 'count' },
  { value: 'boat_class', label: 'Boat Class', aggregation: 'count' },
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

export const CustomReportBuilder: React.FC<CustomReportBuilderProps> = ({
  isOpen,
  onClose,
  darkMode
}) => {
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [metrics, setMetrics] = useState<ReportMetric[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState<ReportGroupBy | null>(null);
  const [chartType, setChartType] = useState('table');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: ''
  });

  const addMetric = () => {
    setMetrics([
      ...metrics,
      {
        id: `metric-${Date.now()}`,
        field: 'total_members',
        aggregation: 'count',
        label: 'Total Members'
      }
    ]);
  };

  const removeMetric = (id: string) => {
    setMetrics(metrics.filter(m => m.id !== id));
  };

  const updateMetric = (id: string, updates: Partial<ReportMetric>) => {
    setMetrics(metrics.map(m => (m.id === id ? { ...m, ...updates } : m)));
  };

  const addFilter = () => {
    setFilters([
      ...filters,
      {
        id: `filter-${Date.now()}`,
        field: 'membership_level',
        operator: 'equals',
        value: ''
      }
    ]);
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<ReportFilter>) => {
    setFilters(filters.map(f => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleSaveReport = () => {
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

    // Save to local storage for now
    const savedReports = JSON.parse(localStorage.getItem('customReports') || '[]');
    savedReports.push(report);
    localStorage.setItem('customReports', JSON.stringify(savedReports));

    alert('Report saved successfully!');
    onClose();
  };

  const handleRunReport = () => {
    alert('Report execution would run here - this would generate the actual data and visualizations');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl border ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-purple-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Custom Report Builder</h2>
            <p className="text-purple-100 text-sm mt-1">
              Create custom reports with specific metrics and visualizations
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Report Name & Description */}
          <div className="space-y-4 mb-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Report Name
              </label>
              <input
                type="text"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g., Monthly Growth Report"
                className={`w-full px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 border-slate-600'
                    : 'bg-white text-slate-900 border-slate-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Description (Optional)
              </label>
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Describe what this report will show..."
                rows={2}
                className={`w-full px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 border-slate-600'
                    : 'bg-white text-slate-900 border-slate-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="mb-6">
            <h3 className={`text-lg font-semibold mb-3 ${
              darkMode ? 'text-white' : 'text-slate-900'
            }`}>
              Date Range
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  From
                </label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className={`w-full px-4 py-2 rounded-lg ${
                    darkMode
                      ? 'bg-slate-700 text-slate-200 border-slate-600'
                      : 'bg-white text-slate-900 border-slate-300'
                  } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  To
                </label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className={`w-full px-4 py-2 rounded-lg ${
                    darkMode
                      ? 'bg-slate-700 text-slate-200 border-slate-600'
                      : 'bg-white text-slate-900 border-slate-300'
                  } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
                />
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-semibold ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                Metrics
              </h3>
              <button
                onClick={addMetric}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm transition-colors"
              >
                <Plus size={16} />
                Add Metric
              </button>
            </div>

            <div className="space-y-3">
              {metrics.map((metric) => (
                <div key={metric.id} className={`p-4 rounded-lg ${
                  darkMode ? 'bg-slate-700/50' : 'bg-slate-50'
                }`}>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Metric
                      </label>
                      <select
                        value={metric.field}
                        onChange={(e) => {
                          const selected = AVAILABLE_METRICS.find(m => m.value === e.target.value);
                          updateMetric(metric.id, {
                            field: e.target.value,
                            label: selected?.label || ''
                          });
                        }}
                        className={`w-full px-3 py-2 rounded-lg ${
                          darkMode
                            ? 'bg-slate-600 text-slate-200 border-slate-500'
                            : 'bg-white text-slate-900 border-slate-300'
                        } border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500`}
                      >
                        {AVAILABLE_METRICS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Aggregation
                      </label>
                      <select
                        value={metric.aggregation}
                        onChange={(e) => updateMetric(metric.id, { aggregation: e.target.value as any })}
                        className={`w-full px-3 py-2 rounded-lg ${
                          darkMode
                            ? 'bg-slate-600 text-slate-200 border-slate-500'
                            : 'bg-white text-slate-900 border-slate-300'
                        } border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500`}
                      >
                        <option value="count">Count</option>
                        <option value="sum">Sum</option>
                        <option value="average">Average</option>
                        <option value="min">Min</option>
                        <option value="max">Max</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={() => removeMetric(metric.id)}
                        className="w-full px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm transition-colors"
                      >
                        <Trash2 size={16} className="mx-auto" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {metrics.length === 0 && (
                <div className={`p-8 rounded-lg border-2 border-dashed text-center ${
                  darkMode ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'
                }`}>
                  <p>No metrics added yet. Click "Add Metric" to get started.</p>
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-semibold ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                Filters (Optional)
              </h3>
              <button
                onClick={addFilter}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
              >
                <Plus size={16} />
                Add Filter
              </button>
            </div>

            <div className="space-y-3">
              {filters.map((filter) => (
                <div key={filter.id} className={`p-4 rounded-lg ${
                  darkMode ? 'bg-slate-700/50' : 'bg-slate-50'
                }`}>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Field
                      </label>
                      <select
                        value={filter.field}
                        onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg ${
                          darkMode
                            ? 'bg-slate-600 text-slate-200 border-slate-500'
                            : 'bg-white text-slate-900 border-slate-300'
                        } border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      >
                        {AVAILABLE_METRICS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Operator
                      </label>
                      <select
                        value={filter.operator}
                        onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg ${
                          darkMode
                            ? 'bg-slate-600 text-slate-200 border-slate-500'
                            : 'bg-white text-slate-900 border-slate-300'
                        } border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      >
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not Equals</option>
                        <option value="contains">Contains</option>
                        <option value="greater_than">Greater Than</option>
                        <option value="less_than">Less Than</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Value
                      </label>
                      <input
                        type="text"
                        value={filter.value}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        placeholder="Enter value"
                        className={`w-full px-3 py-2 rounded-lg ${
                          darkMode
                            ? 'bg-slate-600 text-slate-200 border-slate-500'
                            : 'bg-white text-slate-900 border-slate-300'
                        } border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={() => removeFilter(filter.id)}
                        className="w-full px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm transition-colors"
                      >
                        <Trash2 size={16} className="mx-auto" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Group By & Visualization */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Group By (Optional)
              </label>
              <select
                value={groupBy?.field || ''}
                onChange={(e) => {
                  const selected = GROUP_BY_OPTIONS.find(opt => opt.value === e.target.value);
                  setGroupBy(selected ? { field: selected.value, label: selected.label } : null);
                }}
                className={`w-full px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 border-slate-600'
                    : 'bg-white text-slate-900 border-slate-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
              >
                <option value="">No Grouping</option>
                {GROUP_BY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Visualization Type
              </label>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 border-slate-600'
                    : 'bg-white text-slate-900 border-slate-300'
                } border focus:outline-none focus:ring-2 focus:ring-purple-500`}
              >
                {CHART_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-6 border-t ${
          darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
        } flex justify-between`}>
          <button
            onClick={onClose}
            className={`px-6 py-2.5 rounded-lg font-medium ${
              darkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
            } transition-colors`}
          >
            Cancel
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleRunReport}
              disabled={metrics.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Eye size={18} />
              Run Report
            </button>

            <button
              onClick={handleSaveReport}
              disabled={!reportName || metrics.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={18} />
              Save Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

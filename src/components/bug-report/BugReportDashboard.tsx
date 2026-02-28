import React, { useState, useEffect } from 'react';
import { Bug, Lightbulb, Clock, CheckCircle2, CircleDot, XCircle, AlertTriangle, Search, MessageSquare, Trash2, ArrowUpDown, ArrowLeft, Send, Globe, Copy, Eye, Zap, Layers, Database, Monitor, Navigation, Sparkles, ChevronDown, Pencil } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface BugReportDashboardProps {
  darkMode: boolean;
}

interface BugReport {
  id: string;
  report_type: string;
  title: string;
  description: string;
  steps_to_reproduce: string;
  severity: string;
  status: string;
  category: string;
  page_url: string;
  browser_info: string;
  reporter_name: string;
  reporter_email: string;
  reporter_club: string;
  admin_notes: string;
  resolution_notes: string;
  votes: number;
  priority: number;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  commenter_name: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  open: { icon: CircleDot, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', label: 'Open' },
  in_progress: { icon: Clock, color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20', label: 'In Progress' },
  resolved: { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', label: 'Resolved' },
  fixed: { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', label: 'Fixed' },
  closed: { icon: CheckCircle2, color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20', label: 'Closed' },
  wont_fix: { icon: XCircle, color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20', label: "Won't Fix" },
  duplicate: { icon: Copy, color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20', label: 'Duplicate' },
};

const SEVERITY_CONFIG: Record<string, { badge: string }> = {
  critical: { badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  high: { badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  medium: { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  low: { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  ui: Eye,
  functionality: Zap,
  performance: Layers,
  data: Database,
  navigation: Navigation,
  feature: Sparkles,
  other: Monitor,
};

export const BugReportDashboard: React.FC<BugReportDashboardProps> = ({ darkMode }) => {
  const { user, isSuperAdmin } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all_active');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'severity' | 'oldest'>('newest');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bugs' | 'requests'>('overview');

  const [stats, setStats] = useState({
    totalBugs: 0, openBugs: 0, inProgressBugs: 0, resolvedBugs: 0,
    totalRequests: 0, openRequests: 0, inProgressRequests: 0, resolvedRequests: 0,
    criticalBugs: 0, highBugs: 0,
    categoryBreakdown: {} as Record<string, number>,
  });

  useEffect(() => {
    loadReports();
    loadStats();
  }, [statusFilter, severityFilter, sortBy, typeFilter, categoryFilter, activeTab]);

  useEffect(() => {
    const channel = supabase
      .channel('bug_reports_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_reports' }, () => {
        loadReports();
        loadStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, severityFilter, sortBy, typeFilter, categoryFilter, activeTab]);

  const loadStats = async () => {
    const { data } = await supabase.from('bug_reports').select('status, severity, report_type, category');
    if (data) {
      const bugs = data.filter(r => r.report_type === 'bug');
      const requests = data.filter(r => r.report_type === 'feature_request');
      const catBreakdown: Record<string, number> = {};
      data.forEach(r => { catBreakdown[r.category] = (catBreakdown[r.category] || 0) + 1; });

      setStats({
        totalBugs: bugs.length,
        openBugs: bugs.filter(r => r.status === 'open').length,
        inProgressBugs: bugs.filter(r => r.status === 'in_progress').length,
        resolvedBugs: bugs.filter(r => ['resolved', 'fixed', 'closed'].includes(r.status)).length,
        totalRequests: requests.length,
        openRequests: requests.filter(r => r.status === 'open').length,
        inProgressRequests: requests.filter(r => r.status === 'in_progress').length,
        resolvedRequests: requests.filter(r => ['resolved', 'fixed', 'closed'].includes(r.status)).length,
        criticalBugs: bugs.filter(r => r.severity === 'critical' && r.status !== 'resolved' && r.status !== 'fixed' && r.status !== 'closed').length,
        highBugs: bugs.filter(r => r.severity === 'high' && r.status !== 'resolved' && r.status !== 'fixed' && r.status !== 'closed').length,
        categoryBreakdown: catBreakdown,
      });
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      let query = supabase.from('bug_reports').select('*');

      const effectiveTypeFilter = activeTab === 'bugs' ? 'bug' : activeTab === 'requests' ? 'feature_request' : typeFilter;
      if (effectiveTypeFilter !== 'all') {
        query = query.eq('report_type', effectiveTypeFilter);
      }

      if (statusFilter === 'all_active') {
        query = query.in('status', ['open', 'in_progress']);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      if (sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async (reportId: string) => {
    const { data } = await supabase
      .from('bug_report_comments')
      .select('*')
      .eq('bug_report_id', reportId)
      .order('created_at', { ascending: true });
    setComments(data || []);
  };

  const handleSelectReport = (report: BugReport) => {
    setSelectedReport(report);
    setResolutionNotes(report.resolution_notes || '');
    setAdminNotes(report.admin_notes || '');
    loadComments(report.id);
  };

  const handleStatusChange = async (reportId: string, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (['resolved', 'fixed', 'closed'].includes(newStatus)) {
      updates.resolved_at = new Date().toISOString();
    }
    await supabase.from('bug_reports').update(updates).eq('id', reportId);
    if (selectedReport?.id === reportId) {
      setSelectedReport({ ...selectedReport, status: newStatus });
    }
    loadReports();
    loadStats();
  };

  const handleSaveNotes = async () => {
    if (!selectedReport) return;
    setSaving(true);
    await supabase.from('bug_reports').update({
      resolution_notes: resolutionNotes,
      admin_notes: adminNotes,
    }).eq('id', selectedReport.id);
    setSelectedReport({ ...selectedReport, resolution_notes: resolutionNotes, admin_notes: adminNotes });
    setSaving(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user || !selectedReport) return;
    setSendingComment(true);
    const profile = user.user_metadata;
    await supabase.from('bug_report_comments').insert({
      bug_report_id: selectedReport.id,
      user_id: user.id,
      commenter_name: profile?.full_name || profile?.first_name || user.email || '',
      comment: newComment.trim(),
      is_internal: false,
    });
    setNewComment('');
    await loadComments(selectedReport.id);
    setSendingComment(false);
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('Delete this report permanently?')) return;
    await supabase.from('bug_reports').delete().eq('id', reportId);
    if (selectedReport?.id === reportId) setSelectedReport(null);
    loadReports();
    loadStats();
  };

  const filteredReports = reports.filter(r =>
    !searchQuery ||
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.reporter_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.reporter_club.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const notesChanged = selectedReport && (
    resolutionNotes !== (selectedReport.resolution_notes || '') ||
    adminNotes !== (selectedReport.admin_notes || '')
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-orange-600">
            <Bug size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Feedback Hub</h1>
            <p className="text-sm text-slate-400">Bug reports and feature requests from beta testers</p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex gap-1 mb-5">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'bugs', label: `Bugs (${stats.totalBugs})`, icon: Bug },
            { key: 'requests', label: `Requests (${stats.totalRequests})`, icon: Lightbulb },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key as any); setSelectedReport(null); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? darkMode
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-200 text-slate-900'
                  : darkMode
                    ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.icon && <tab.icon className="w-4 h-4" />}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Open Bugs', value: stats.openBugs, color: 'text-blue-400', accent: 'bg-blue-500' },
              { label: 'In Progress', value: stats.inProgressBugs, color: 'text-amber-400', accent: 'bg-amber-500' },
              { label: 'Resolved', value: stats.resolvedBugs, color: 'text-green-400', accent: 'bg-green-500' },
              { label: 'Critical', value: stats.criticalBugs, color: 'text-red-400', accent: 'bg-red-500' },
              { label: 'Open Requests', value: stats.openRequests, color: 'text-teal-400', accent: 'bg-teal-500' },
              { label: 'Total', value: stats.totalBugs + stats.totalRequests, color: 'text-slate-400', accent: 'bg-slate-500' },
            ].map(s => (
              <div key={s.label} className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${s.accent}`} />
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</div>
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab !== 'overview' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className={`w-full pl-10 pr-4 py-2 rounded-xl border text-sm ${
                  darkMode
                    ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={`px-3 py-2 rounded-xl border text-sm ${
                darkMode ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="all_active">Active</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="fixed">Fixed</option>
              <option value="closed">Closed</option>
              <option value="wont_fix">Won't Fix</option>
              <option value="all">All</option>
            </select>
            {activeTab === 'bugs' && (
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className={`px-3 py-2 rounded-xl border text-sm ${
                  darkMode ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option value="all">All Severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            )}
            <button
              onClick={() => setSortBy(sortBy === 'newest' ? 'oldest' : 'newest')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors ${
                darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ArrowUpDown className="w-4 h-4" />
              {sortBy === 'newest' ? 'Newest' : 'Oldest'}
            </button>
          </div>
        )}
      </div>

      {activeTab === 'overview' ? (
        <div className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`rounded-xl border p-5 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Bug className="w-5 h-5 text-red-400" />
                <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Bug Breakdown</h3>
              </div>
              <div className="space-y-3">
                {['critical', 'high', 'medium', 'low'].map(sev => {
                  const count = reports.filter(r => r.report_type === 'bug' && r.severity === sev).length || 0;
                  const total = stats.totalBugs || 1;
                  const pct = Math.round((count / total) * 100);
                  const colors: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-500', low: 'bg-blue-500' };
                  return (
                    <div key={sev}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium capitalize ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{sev}</span>
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{count}</span>
                      </div>
                      <div className={`h-2 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                        <div className={`h-2 rounded-full transition-all ${colors[sev]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`rounded-xl border p-5 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-teal-400" />
                <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Category Breakdown</h3>
              </div>
              <div className="space-y-2.5">
                {Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
                  const CatIcon = CATEGORY_ICONS[cat] || Monitor;
                  return (
                    <div key={cat} className={`flex items-center justify-between p-2.5 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-2">
                        <CatIcon className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                        <span className={`text-sm capitalize ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{cat}</span>
                      </div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{count}</span>
                    </div>
                  );
                })}
                {Object.keys(stats.categoryBreakdown).length === 0 && (
                  <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>No reports yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex mt-6 rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-white'}`} style={{ minHeight: '500px' }}>
          <div className={`overflow-y-auto ${
            selectedReport ? `hidden lg:block lg:w-[45%] border-r ${darkMode ? 'border-slate-700' : 'border-slate-200'}` : 'w-full'
          }`}>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                {activeTab === 'bugs'
                  ? <Bug className={`w-12 h-12 mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                  : <Lightbulb className={`w-12 h-12 mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                }
                <p className={`font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No {activeTab === 'bugs' ? 'bug reports' : 'feature requests'} found
                </p>
              </div>
            ) : (
              <div>
                {filteredReports.map(report => {
                  const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;
                  const severityCfg = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.medium;
                  const StatusIcon = statusCfg.icon;
                  const isSelected = selectedReport?.id === report.id;
                  const isBug = report.report_type === 'bug';
                  return (
                    <button
                      key={report.id}
                      onClick={() => handleSelectReport(report)}
                      className={`w-full text-left px-5 py-4 border-b transition-colors group ${
                        isSelected
                          ? darkMode ? 'bg-slate-700/70 border-slate-600' : 'bg-blue-50 border-blue-100'
                          : darkMode ? 'border-slate-700/50 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isBug ? 'bg-red-500/10' : 'bg-teal-500/10'
                        }`}>
                          {isBug
                            ? <Bug className="w-4 h-4 text-red-400" />
                            : <Lightbulb className="w-4 h-4 text-teal-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {report.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {isBug && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${severityCfg.badge}`}>
                                {report.severity}
                              </span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusCfg.bgColor} ${statusCfg.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusCfg.label}
                            </span>
                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {getTimeAgo(report.created_at)}
                            </span>
                          </div>
                          {report.reporter_name && (
                            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {report.reporter_name}{report.reporter_club ? ` - ${report.reporter_club}` : ''}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(report.id); }}
                          className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${
                            darkMode ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-500'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedReport && (
            <div className={`flex w-full lg:w-[55%] flex-col overflow-hidden`}>
              <div className={`px-5 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <button
                    onClick={() => setSelectedReport(null)}
                    className={`lg:hidden p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {selectedReport.report_type === 'bug'
                        ? <Bug className="w-4 h-4 text-red-400 flex-shrink-0" />
                        : <Lightbulb className="w-4 h-4 text-teal-400 flex-shrink-0" />
                      }
                      <h2 className={`text-lg font-bold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {selectedReport.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {selectedReport.report_type === 'bug' ? 'Bug' : 'Feature Request'}
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {new Date(selectedReport.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(selectedReport.id)}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className={`grid grid-cols-2 gap-3 p-3.5 rounded-xl ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                  <div>
                    <p className={`text-xs mb-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Reporter</p>
                    <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {selectedReport.reporter_name || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs mb-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Email</p>
                    <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {selectedReport.reporter_email || '-'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs mb-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Club</p>
                    <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {selectedReport.reporter_club || '-'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs mb-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Page</p>
                    <p className={`text-sm truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {selectedReport.page_url ? selectedReport.page_url.replace(window.location.origin, '') : '-'}
                    </p>
                  </div>
                </div>

                {selectedReport.description && (
                  <div>
                    <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Description</p>
                    <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {selectedReport.description}
                    </p>
                  </div>
                )}

                {selectedReport.steps_to_reproduce && (
                  <div>
                    <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Steps to Reproduce</p>
                    <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {selectedReport.steps_to_reproduce}
                    </p>
                  </div>
                )}

                <div>
                  <p className={`text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(STATUS_CONFIG).map(([value, cfg]) => {
                      const Icon = cfg.icon;
                      const isActive = selectedReport.status === value;
                      return (
                        <button
                          key={value}
                          onClick={() => handleStatusChange(selectedReport.id, value)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                            isActive
                              ? `${cfg.bgColor} ${cfg.color}`
                              : darkMode
                                ? 'border-slate-700 text-slate-400 hover:border-slate-600'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className={`text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Admin Notes (internal)</p>
                  <textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    placeholder="Internal notes about this report..."
                    rows={2}
                    className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${
                      darkMode
                        ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    } focus:outline-none focus:ring-1 focus:ring-blue-500/30`}
                  />
                </div>

                <div>
                  <p className={`text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Resolution Notes (visible to reporter)</p>
                  <textarea
                    value={resolutionNotes}
                    onChange={e => setResolutionNotes(e.target.value)}
                    placeholder="What was done to address this..."
                    rows={2}
                    className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${
                      darkMode
                        ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    } focus:outline-none focus:ring-1 focus:ring-green-500/30`}
                  />
                </div>

                {notesChanged && (
                  <button
                    onClick={handleSaveNotes}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Notes'}
                  </button>
                )}

                <div className={`border-t pt-4 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                    <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Comments ({comments.length})
                    </p>
                  </div>
                  {comments.map(c => (
                    <div
                      key={c.id}
                      className={`p-3 rounded-xl mb-2 ${
                        c.is_internal
                          ? darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
                          : darkMode ? 'bg-slate-700/50' : 'bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${
                          c.is_internal ? 'text-red-400' : darkMode ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          {c.commenter_name}{c.is_internal ? ' (Admin)' : ''}
                        </span>
                        <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {getTimeAgo(c.created_at)}
                        </span>
                      </div>
                      <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {c.comment}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`flex items-center gap-2 px-5 py-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <input
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Add admin comment..."
                  className={`flex-1 px-3 py-2 rounded-xl border text-sm ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || sendingComment}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Reply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

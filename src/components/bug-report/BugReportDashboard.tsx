import React, { useState, useEffect } from 'react';
import { Bug, Clock, CheckCircle2, CircleDot, XCircle, AlertTriangle, Search, ChevronDown, MessageSquare, Globe, Trash2, Filter, BarChart3, ArrowUpDown } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface BugReportDashboardProps {
  darkMode: boolean;
}

interface BugReport {
  id: string;
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
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  user_name: string;
  comment: string;
  is_admin_reply: boolean;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  open: { icon: CircleDot, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', label: 'Open' },
  in_progress: { icon: Clock, color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20', label: 'In Progress' },
  resolved: { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', label: 'Resolved' },
  closed: { icon: CheckCircle2, color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20', label: 'Closed' },
  wont_fix: { icon: XCircle, color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20', label: "Won't Fix" },
};

const SEVERITY_CONFIG: Record<string, { color: string; badge: string }> = {
  critical: { color: 'text-red-400', badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  high: { color: 'text-orange-400', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  medium: { color: 'text-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  low: { color: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
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
  const [statusFilter, setStatusFilter] = useState<string>('all_active');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'severity'>('newest');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [stats, setStats] = useState({ open: 0, in_progress: 0, resolved: 0, total: 0 });

  useEffect(() => {
    loadReports();
    loadStats();
  }, [statusFilter, severityFilter, sortBy]);

  const loadStats = async () => {
    const { data } = await supabase.from('bug_reports').select('status');
    if (data) {
      setStats({
        open: data.filter(r => r.status === 'open').length,
        in_progress: data.filter(r => r.status === 'in_progress').length,
        resolved: data.filter(r => r.status === 'resolved' || r.status === 'closed').length,
        total: data.length,
      });
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      let query = supabase.from('bug_reports').select('*');

      if (statusFilter === 'all_active') {
        query = query.in('status', ['open', 'in_progress']);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }

      if (sortBy === 'severity') {
        query = query.order('severity', { ascending: true }).order('created_at', { ascending: false });
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
    loadComments(report.id);
  };

  const handleStatusChange = async (reportId: string, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'resolved' || newStatus === 'closed') {
      updates.resolved_at = new Date().toISOString();
    }
    await supabase.from('bug_reports').update(updates).eq('id', reportId);
    if (selectedReport?.id === reportId) {
      setSelectedReport({ ...selectedReport, status: newStatus });
    }
    loadReports();
    loadStats();
  };

  const handleSaveResolution = async () => {
    if (!selectedReport) return;
    setSaving(true);
    await supabase.from('bug_reports').update({ resolution_notes: resolutionNotes }).eq('id', selectedReport.id);
    setSelectedReport({ ...selectedReport, resolution_notes: resolutionNotes });
    setSaving(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user || !selectedReport) return;
    setSendingComment(true);
    const profile = user.user_metadata;
    await supabase.from('bug_report_comments').insert({
      bug_report_id: selectedReport.id,
      user_id: user.id,
      user_name: profile?.full_name || profile?.first_name || user.email || '',
      comment: newComment.trim(),
      is_admin_reply: isSuperAdmin,
    });
    setNewComment('');
    await loadComments(selectedReport.id);
    setSendingComment(false);
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('Delete this bug report permanently?')) return;
    await supabase.from('bug_reports').delete().eq('id', reportId);
    if (selectedReport?.id === reportId) setSelectedReport(null);
    loadReports();
    loadStats();
  };

  const filteredReports = reports.filter(r =>
    !searchQuery || r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.reporter_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.reporter_club.toLowerCase().includes(searchQuery.toLowerCase())
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
    return `${diffDays}d ago`;
  };

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  return (
    <div className="h-full flex flex-col">
      <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Bug className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Bug Reports
              </h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Manage and track bug reports from beta testers
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Open', value: stats.open, color: 'bg-blue-500', textColor: 'text-blue-400' },
            { label: 'In Progress', value: stats.in_progress, color: 'bg-amber-500', textColor: 'text-amber-400' },
            { label: 'Resolved', value: stats.resolved, color: 'bg-green-500', textColor: 'text-green-400' },
            { label: 'Total', value: stats.total, color: 'bg-slate-500', textColor: 'text-slate-400' },
          ].map(s => (
            <div key={s.label} className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`text-2xl font-bold ${s.textColor}`}>{s.value}</div>
              <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search bugs..."
              className={`w-full pl-10 pr-4 py-2 rounded-xl border text-sm ${
                darkMode
                  ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-red-500/20`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-sm ${
              darkMode
                ? 'bg-slate-700/50 border-slate-600 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } focus:outline-none`}
          >
            <option value="all_active">Active</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="wont_fix">Won't Fix</option>
            <option value="all">All</option>
          </select>
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-sm ${
              darkMode
                ? 'bg-slate-700/50 border-slate-600 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } focus:outline-none`}
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            onClick={() => setSortBy(sortBy === 'newest' ? 'severity' : 'newest')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors ${
              darkMode
                ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortBy === 'newest' ? 'Newest' : 'Severity'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className={`w-full ${selectedReport ? 'lg:w-1/2' : ''} overflow-y-auto border-r ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Bug className={`w-12 h-12 mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
              <p className={`font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No bug reports found</p>
            </div>
          ) : (
            <div>
              {filteredReports.map(report => {
                const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;
                const severityCfg = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.medium;
                const StatusIcon = statusCfg.icon;
                const isSelected = selectedReport?.id === report.id;
                return (
                  <button
                    key={report.id}
                    onClick={() => handleSelectReport(report)}
                    className={`w-full text-left px-5 py-4 border-b transition-colors ${
                      isSelected
                        ? darkMode ? 'bg-slate-700/70 border-slate-600' : 'bg-blue-50 border-blue-100'
                        : darkMode ? 'border-slate-700/50 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {report.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${severityCfg.badge}`}>
                            {report.severity}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusCfg.bgColor}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </span>
                          <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {getTimeAgo(report.created_at)}
                          </span>
                        </div>
                        {report.reporter_name && (
                          <p className={`text-xs mt-1.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {report.reporter_name} {report.reporter_club ? `- ${report.reporter_club}` : ''}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(report.id); }}
                        className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                          darkMode ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-500'
                        }`}
                        title="Delete"
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
          <div className={`hidden lg:flex lg:w-1/2 flex-col overflow-hidden ${darkMode ? 'bg-slate-800/50' : 'bg-white'}`}>
            <div className={`px-5 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {selectedReport.title}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                  SEVERITY_CONFIG[selectedReport.severity]?.badge
                }`}>
                  {selectedReport.severity}
                </span>
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {selectedReport.category}
                </span>
                <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {new Date(selectedReport.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className={`grid grid-cols-2 gap-3 p-3 rounded-xl ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                <div>
                  <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Reporter</p>
                  <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {selectedReport.reporter_name || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Email</p>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {selectedReport.reporter_email || '-'}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Club</p>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {selectedReport.reporter_club || '-'}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Page</p>
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
                <p className={`text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Resolution Notes</p>
                <textarea
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  placeholder="Describe what was done to fix this bug..."
                  rows={3}
                  className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:outline-none focus:ring-2 focus:ring-red-500/20`}
                />
                {resolutionNotes !== (selectedReport.resolution_notes || '') && (
                  <button
                    onClick={handleSaveResolution}
                    disabled={saving}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Resolution'}
                  </button>
                )}
              </div>

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
                      c.is_admin_reply
                        ? darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
                        : darkMode ? 'bg-slate-700/50' : 'bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${
                        c.is_admin_reply ? 'text-red-400' : darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        {c.user_name}{c.is_admin_reply ? ' (Admin)' : ''}
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
                } focus:outline-none focus:ring-2 focus:ring-red-500/20`}
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
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

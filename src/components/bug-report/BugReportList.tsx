import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Bug, Lightbulb, Clock, CheckCircle2, ArrowRight, CircleDot, XCircle, Copy } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BugReportDetail } from './BugReportDetail';

interface BugReportListProps {
  darkMode: boolean;
  onClose: () => void;
  onNewReport: () => void;
  onRefresh: () => void;
}

interface BugReport {
  id: string;
  report_type: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  category: string;
  page_url: string;
  reporter_name: string;
  reporter_club: string;
  admin_notes: string;
  resolution_notes: string;
  steps_to_reproduce: string;
  reporter_email: string;
  browser_info: string;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  open: { icon: CircleDot, color: 'text-blue-400', label: 'Open' },
  in_progress: { icon: Clock, color: 'text-amber-400', label: 'In Progress' },
  resolved: { icon: CheckCircle2, color: 'text-green-400', label: 'Resolved' },
  fixed: { icon: CheckCircle2, color: 'text-green-400', label: 'Fixed' },
  closed: { icon: CheckCircle2, color: 'text-slate-400', label: 'Closed' },
  wont_fix: { icon: XCircle, color: 'text-slate-400', label: "Won't Fix" },
  duplicate: { icon: Copy, color: 'text-slate-400', label: 'Duplicate' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-blue-500',
};

export const BugReportList: React.FC<BugReportListProps> = ({ darkMode, onClose, onNewReport, onRefresh }) => {
  const { user, isSuperAdmin } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const loadReports = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('bug_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isSuperAdmin) {
        query = query.eq('reported_by', user.id);
      }

      if (statusFilter === 'active') {
        query = query.in('status', ['open', 'in_progress']);
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error('Failed to load bug reports:', err);
    } finally {
      setLoading(false);
    }
  };

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
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (selectedReport) {
    return (
      <BugReportDetail
        darkMode={darkMode}
        report={selectedReport}
        onBack={() => {
          setSelectedReport(null);
          loadReports();
          onRefresh();
        }}
        onClose={onClose}
      />
    );
  }

  return createPortal(
    <div
      className={`fixed bottom-24 right-6 z-[9991] w-[380px] max-h-[70vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        darkMode ? 'border-slate-700' : 'border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-red-500" />
          <h3 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Feedback
          </h3>
        </div>
        <button
          onClick={onNewReport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      <div className={`flex items-center gap-1 px-3 py-2 border-b overflow-x-auto ${
        darkMode ? 'border-slate-700' : 'border-slate-200'
      }`}>
        {[
          { key: 'active', label: 'Active' },
          { key: 'resolved', label: 'Resolved' },
          { key: 'closed', label: 'Closed' },
          { key: 'all', label: 'All' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              statusFilter === f.key
                ? 'bg-red-500/10 text-red-500'
                : darkMode
                  ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
              darkMode ? 'bg-slate-700' : 'bg-slate-100'
            }`}>
              <Bug className={`w-6 h-6 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            </div>
            <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              No reports
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {statusFilter === 'active' ? 'No active items' : 'Nothing to show'}
            </p>
          </div>
        ) : (
          <div className={`divide-y ${darkMode ? 'divide-slate-700/50' : 'divide-slate-100'}`}>
            {reports.map(report => {
              const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;
              const StatusIcon = statusCfg.icon;
              const isBug = report.report_type === 'bug';
              return (
                <button
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className={`w-full text-left px-4 py-3 transition-colors group ${
                    darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      isBug ? (SEVERITY_COLORS[report.severity] || 'bg-slate-500') : 'bg-teal-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!isBug && <Lightbulb className="w-3 h-3 text-teal-400 flex-shrink-0" />}
                        <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {report.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusIcon className={`w-3.5 h-3.5 ${statusCfg.color}`} />
                        <span className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</span>
                        <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {getTimeAgo(report.created_at)}
                        </span>
                        {isSuperAdmin && report.reporter_name && (
                          <span className={`text-xs truncate ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            by {report.reporter_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className={`w-4 h-4 mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                      darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

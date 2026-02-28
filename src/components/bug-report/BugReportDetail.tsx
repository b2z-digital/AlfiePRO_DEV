import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Bug, Lightbulb, Clock, CheckCircle2, CircleDot, XCircle, Send, MessageSquare, Globe, Trash2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface BugReportDetailProps {
  darkMode: boolean;
  report: {
    id: string;
    report_type?: string;
    title: string;
    description: string;
    steps_to_reproduce?: string;
    severity: string;
    status: string;
    category: string;
    page_url: string;
    browser_info?: string;
    reporter_name: string;
    reporter_email: string;
    reporter_club: string;
    admin_notes: string;
    resolution_notes: string;
    created_at: string;
    updated_at: string;
  };
  onBack: () => void;
  onClose: () => void;
}

interface Comment {
  id: string;
  commenter_name: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', icon: CircleDot, color: 'text-blue-400 bg-blue-500/10' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-amber-400 bg-amber-500/10' },
  { value: 'resolved', label: 'Resolved', icon: CheckCircle2, color: 'text-green-400 bg-green-500/10' },
  { value: 'closed', label: 'Closed', icon: CheckCircle2, color: 'text-slate-400 bg-slate-500/10' },
  { value: 'wont_fix', label: "Won't Fix", icon: XCircle, color: 'text-slate-400 bg-slate-500/10' },
];

const SEVERITY_BADGES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export const BugReportDetail: React.FC<BugReportDetailProps> = ({ darkMode, report, onBack, onClose }) => {
  const { user, isSuperAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [status, setStatus] = useState(report.status);
  const [resolutionNotes, setResolutionNotes] = useState(report.resolution_notes || '');
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const isBug = report.report_type !== 'feature_request';
  const accentColor = isBug ? 'red' : 'teal';

  useEffect(() => {
    loadComments();
  }, []);

  const loadComments = async () => {
    const { data } = await supabase
      .from('bug_report_comments')
      .select('*')
      .eq('bug_report_id', report.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
  };

  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    setStatus(newStatus);
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'resolved' || newStatus === 'closed') {
      updates.resolved_at = new Date().toISOString();
    }
    await supabase.from('bug_reports').update(updates).eq('id', report.id);
    setSaving(false);
  };

  const handleSaveResolution = async () => {
    setSaving(true);
    await supabase.from('bug_reports').update({ resolution_notes: resolutionNotes }).eq('id', report.id);
    setSaving(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user) return;
    setSendingComment(true);
    const profile = user.user_metadata;
    const { error } = await supabase.from('bug_report_comments').insert({
      bug_report_id: report.id,
      user_id: user.id,
      commenter_name: profile?.full_name || profile?.first_name || user.email || '',
      comment: newComment.trim(),
      is_internal: false,
    });
    if (!error) {
      setNewComment('');
      await loadComments();
    }
    setSendingComment(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this bug report permanently?')) return;
    await supabase.from('bug_reports').delete().eq('id', report.id);
    onBack();
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

  return createPortal(
    <div
      className={`fixed bottom-24 right-6 z-[9991] w-[380px] max-h-[70vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}
    >
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${
        darkMode ? 'border-slate-700' : 'border-slate-200'
      }`}>
        <button
          onClick={onBack}
          className={`p-1.5 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {isBug
          ? <Bug className="w-4 h-4 text-red-500 flex-shrink-0" />
          : <Lightbulb className="w-4 h-4 text-teal-500 flex-shrink-0" />
        }
        <h3 className={`font-semibold text-sm truncate flex-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          {report.title}
        </h3>
        {isSuperAdmin && (
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete report"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!isBug && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Feature Request
              </span>
            )}
            {isBug && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                SEVERITY_BADGES[report.severity] || SEVERITY_BADGES.medium
              }`}>
                {report.severity}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
            }`}>
              {report.category}
            </span>
            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {getTimeAgo(report.created_at)}
            </span>
          </div>

          {isSuperAdmin && (report.reporter_name || report.reporter_email) && (
            <div className={`text-xs space-y-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {report.reporter_name && <p>Reporter: {report.reporter_name}</p>}
              {report.reporter_email && <p>Email: {report.reporter_email}</p>}
              {report.reporter_club && <p>Club: {report.reporter_club}</p>}
            </div>
          )}

          {report.description && (
            <div>
              <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Description
              </p>
              <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {report.description}
              </p>
            </div>
          )}

          {report.steps_to_reproduce && (
            <div>
              <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Steps to Reproduce
              </p>
              <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {report.steps_to_reproduce}
              </p>
            </div>
          )}

          {report.page_url && (
            <div className="flex items-center gap-2">
              <Globe className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              <span className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {report.page_url.replace(window.location.origin, '')}
              </span>
            </div>
          )}

          {isSuperAdmin && (
            <>
              <div className={`border-t pt-4 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <p className={`text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Update Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isActive = status === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleStatusChange(opt.value)}
                        disabled={saving}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          isActive
                            ? `${opt.color} border-current`
                            : darkMode
                              ? 'border-slate-700 text-slate-400 hover:border-slate-600'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className={`text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Resolution Notes
                </p>
                <textarea
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  placeholder="What was done to fix this..."
                  rows={2}
                  className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:outline-none focus:ring-1 focus:ring-${accentColor}-500/30`}
                />
                {resolutionNotes !== (report.resolution_notes || '') && (
                  <button
                    onClick={handleSaveResolution}
                    disabled={saving}
                    className="mt-1.5 px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Notes'}
                  </button>
                )}
              </div>
            </>
          )}

          {!isSuperAdmin && report.resolution_notes && (
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
              <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                Resolution
              </p>
              <p className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                {report.resolution_notes}
              </p>
            </div>
          )}

          <div className={`border-t pt-4 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Comments ({comments.length})
              </p>
            </div>

            {comments.length > 0 && (
              <div className="space-y-2.5 mb-3">
                {comments.map(c => (
                  <div
                    key={c.id}
                    className={`p-2.5 rounded-xl ${
                      c.is_internal
                        ? isBug
                          ? darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
                          : darkMode ? 'bg-teal-500/10 border border-teal-500/20' : 'bg-teal-50 border border-teal-200'
                        : darkMode ? 'bg-slate-700/50' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-xs font-medium ${
                        c.is_internal
                          ? isBug
                            ? darkMode ? 'text-red-400' : 'text-red-600'
                            : darkMode ? 'text-teal-400' : 'text-teal-600'
                          : darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        {c.commenter_name || 'User'}
                        {c.is_internal && ' (Admin)'}
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
            )}
          </div>
        </div>
      </div>

      <div className={`flex items-center gap-2 px-4 py-3 border-t ${
        darkMode ? 'border-slate-700' : 'border-slate-200'
      }`}>
        <input
          type="text"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className={`flex-1 px-3 py-2 rounded-xl border text-sm ${
            darkMode
              ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
              : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
          } focus:outline-none focus:ring-1 focus:ring-${accentColor}-500/30`}
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
          className={`p-2 rounded-xl text-white transition-colors disabled:opacity-50 ${
            isBug ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600'
          }`}
        >
          {sendingComment ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>,
    document.body
  );
};

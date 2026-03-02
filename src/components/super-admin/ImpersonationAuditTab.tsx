import React, { useState, useEffect } from 'react';
import { Eye, Search, Clock, User, Shield, ArrowRight, RefreshCw } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { formatDistanceToNow, format } from 'date-fns';

interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  target_user_id: string | null;
  target_member_id: string;
  admin_email: string;
  target_email: string;
  target_name: string;
  admin_role: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  club_id: string | null;
  club_name: string;
  created_at: string;
}

interface ImpersonationAuditTabProps {
  darkMode: boolean;
}

export const ImpersonationAuditTab: React.FC<ImpersonationAuditTabProps> = ({ darkMode }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('impersonation_audit_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.admin_email.toLowerCase().includes(term) ||
      log.target_email.toLowerCase().includes(term) ||
      log.target_name.toLowerCase().includes(term) ||
      log.club_name.toLowerCase().includes(term)
    );
  });

  const getDuration = (log: AuditLogEntry) => {
    if (!log.ended_at) return 'Active';
    const start = new Date(log.started_at).getTime();
    const end = new Date(log.ended_at).getTime();
    const diffMs = end - start;
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 ring-1 ring-red-500/20">
            <Shield size={10} />
            Super Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20">
            <User size={10} />
            Association Admin
          </span>
        );
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30">
          <Eye className="text-amber-400" size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Impersonation Audit Log</h2>
          <p className="text-sm text-slate-400">Track all admin impersonation sessions across the platform</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by admin, user, or club..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 text-sm"
          />
        </div>
        <button
          onClick={loadAuditLogs}
          className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition"
        >
          <RefreshCw size={16} />
        </button>
        <div className="text-sm text-slate-400">
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Eye size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 text-lg font-medium">No impersonation sessions found</p>
          <p className="text-slate-500 text-sm mt-1">Sessions will appear here when admins use the "View as" feature</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(log => (
            <div
              key={log.id}
              className={`rounded-xl border p-4 transition-all ${
                !log.ended_at
                  ? 'bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/10'
                  : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex-shrink-0 p-2 rounded-lg ${!log.ended_at ? 'bg-amber-500/20' : 'bg-slate-700/50'}`}>
                    <Eye size={16} className={!log.ended_at ? 'text-amber-400' : 'text-slate-400'} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-300 truncate">{log.admin_email}</span>
                      <ArrowRight size={12} className="text-slate-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-white truncate">{log.target_name}</span>
                      {log.target_email && (
                        <span className="text-xs text-slate-500 truncate">({log.target_email})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {getRoleBadge(log.admin_role)}
                      {log.club_name && (
                        <span className="text-xs text-slate-500">
                          Club: {log.club_name}
                        </span>
                      )}
                      {log.reason && (
                        <span className="text-xs text-slate-400 italic">
                          "{log.reason}"
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock size={12} />
                    <span>{formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {format(new Date(log.started_at), 'dd MMM yyyy, HH:mm')}
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                    !log.ended_at
                      ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20 animate-pulse'
                      : 'bg-slate-700/50 text-slate-400'
                  }`}>
                    {!log.ended_at ? 'Active' : `Duration: ${getDuration(log)}`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

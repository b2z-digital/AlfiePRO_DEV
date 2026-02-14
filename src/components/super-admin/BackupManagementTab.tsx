import { useState, useEffect } from 'react';
import {
  Database, Plus, Download, RotateCcw, Clock, CheckCircle,
  XCircle, HardDrive, Server, Loader2, Archive, Trash2,
  ChevronDown, RefreshCw, AlertTriangle, FileJson, Eye,
  BarChart3, Table2
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface BackupManagementTabProps {
  darkMode: boolean;
}

interface Backup {
  id: string;
  backup_type: string;
  status: string;
  tables_count: number;
  rows_count: number;
  size_bytes: number;
  storage_location: string | null;
  storage_path: string | null;
  table_details: any[] | null;
  notes: string | null;
  triggered_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface TableStat {
  table_name: string;
  row_count: number;
  size_bytes: number;
  total_size: string;
}

export function BackupManagementTab({ darkMode }: BackupManagementTabProps) {
  const { user } = useAuth();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [tableStats, setTableStats] = useState<TableStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedBackup, setExpandedBackup] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'history' | 'tables'>('history');
  const [createProgress, setCreateProgress] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const getBackupApiUrl = () => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database-backup`;
  };

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const loadData = async () => {
    try {
      const [backupsRes, headers] = await Promise.all([
        supabase.from('platform_backups').select('*').order('created_at', { ascending: false }),
        getAuthHeaders(),
      ]);

      setBackups(backupsRes.data || []);

      const statsRes = await fetch(`${getBackupApiUrl()}?action=stats`, { headers });
      if (statsRes.ok) {
        const { stats } = await statsRes.json();
        setTableStats(stats || []);
      } else {
        const { data } = await supabase.rpc('get_public_table_stats');
        if (data) setTableStats(data);
      }
    } catch (err) {
      console.error('Error loading backup data:', err);
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setCreating(true);
    setCreateProgress('Exporting database tables...');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${getBackupApiUrl()}?action=create`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Backup failed');
      }

      setCreateProgress('Backup completed successfully');
      const { backup } = await res.json();
      if (backup) {
        setBackups(prev => [backup, ...prev]);
      }
    } catch (err: any) {
      console.error('Backup error:', err);
      setCreateProgress(`Error: ${err.message}`);
    } finally {
      setCreating(false);
      setTimeout(() => setCreateProgress(''), 4000);
    }
  };

  const downloadBackup = async (backup: Backup) => {
    if (!backup.storage_path) return;
    setDownloading(backup.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${getBackupApiUrl()}?action=download&path=${encodeURIComponent(backup.storage_path)}`,
        { headers }
      );

      if (!res.ok) throw new Error('Failed to get download URL');

      const { url } = await res.json();
      const link = document.createElement('a');
      link.href = url;
      link.download = backup.storage_path;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(null);
    }
  };

  const deleteBackup = async (backup: Backup) => {
    if (!confirm('Are you sure you want to delete this backup? This cannot be undone.')) return;
    setDeleting(backup.id);
    try {
      const headers = await getAuthHeaders();
      await fetch(`${getBackupApiUrl()}?action=delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ backupId: backup.id, storagePath: backup.storage_path }),
      });
      setBackups(prev => prev.filter(b => b.id !== backup.id));
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeleting(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
    completed: { icon: CheckCircle, color: 'text-emerald-500', bg: darkMode ? 'bg-emerald-500/15' : 'bg-emerald-50', label: 'Completed' },
    in_progress: { icon: Loader2, color: 'text-sky-500', bg: darkMode ? 'bg-sky-500/15' : 'bg-sky-50', label: 'In Progress' },
    failed: { icon: XCircle, color: 'text-red-500', bg: darkMode ? 'bg-red-500/15' : 'bg-red-50', label: 'Failed' },
  };

  const totalDbSize = tableStats.reduce((sum, t) => sum + (t.size_bytes || 0), 0);
  const totalRows = tableStats.reduce((sum, t) => sum + (t.row_count || 0), 0);
  const lastBackup = backups.find(b => b.status === 'completed');

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600">
            <Database className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Backup Management</h1>
            <p className="text-sm text-slate-400">Database backups, exports, and restore points</p>
          </div>
        </div>
        <button
          onClick={createBackup}
          disabled={creating}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-all disabled:opacity-50 shadow-lg shadow-sky-500/20"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? 'Creating Backup...' : 'Create Backup'}
        </button>
      </div>

      {createProgress && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          createProgress.startsWith('Error')
            ? darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'
            : creating
              ? darkMode ? 'bg-sky-500/10 border-sky-500/30' : 'bg-sky-50 border-sky-200'
              : darkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
        }`}>
          {creating ? (
            <Loader2 size={18} className="animate-spin text-sky-500" />
          ) : createProgress.startsWith('Error') ? (
            <AlertTriangle size={18} className="text-red-500" />
          ) : (
            <CheckCircle size={18} className="text-emerald-500" />
          )}
          <span className={`text-sm font-medium ${
            createProgress.startsWith('Error')
              ? 'text-red-400'
              : creating ? 'text-sky-400' : 'text-emerald-400'
          }`}>
            {createProgress}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Database Size</span>
            <HardDrive size={16} className="text-sky-500" />
          </div>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatBytes(totalDbSize)}</p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {tableStats.length} tables, {totalRows.toLocaleString()} rows
          </p>
        </div>

        <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Backups</span>
            <Archive size={16} className="text-emerald-500" />
          </div>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{backups.length}</p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {backups.filter(b => b.status === 'completed').length} successful
          </p>
        </div>

        <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Last Backup</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {lastBackup ? formatRelativeTime(lastBackup.created_at) : 'None'}
          </p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {lastBackup ? `${lastBackup.tables_count} tables, ${lastBackup.rows_count.toLocaleString()} rows` : 'No backups recorded'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveView('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'history'
              ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
              : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Archive size={14} className="inline mr-1.5" />
          Backup History
        </button>
        <button
          onClick={() => setActiveView('tables')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'tables'
              ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
              : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Table2 size={14} className="inline mr-1.5" />
          Database Tables
        </button>
        <div className="flex-1" />
        <button
          onClick={loadData}
          className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {activeView === 'history' && (
        <div className="space-y-3">
          {backups.map((backup) => {
            const status = statusConfig[backup.status] || statusConfig.completed;
            const StatusIcon = status.icon;
            const isExpanded = expandedBackup === backup.id;

            return (
              <div
                key={backup.id}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'
                } ${isExpanded ? darkMode ? 'border-sky-500/30' : 'border-sky-300' : ''}`}
              >
                <div
                  className={`flex items-center justify-between p-4 cursor-pointer ${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}
                  onClick={() => setExpandedBackup(isExpanded ? null : backup.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${status.bg}`}>
                      <StatusIcon size={18} className={`${status.color} ${backup.status === 'in_progress' ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {new Date(backup.created_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          backup.backup_type === 'manual'
                            ? darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                            : darkMode ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700'
                        }`}>
                          {backup.backup_type}
                        </span>
                      </div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(backup.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        {' '}&middot;{' '}
                        {formatRelativeTime(backup.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-6">
                      <div className="text-center">
                        <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{backup.tables_count}</p>
                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Tables</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{backup.rows_count.toLocaleString()}</p>
                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Rows</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatBytes(backup.size_bytes)}</p>
                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Size</p>
                      </div>
                    </div>
                    <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                  </div>
                </div>

                {isExpanded && (
                  <div className={`border-t px-4 py-4 ${darkMode ? 'border-slate-700/50 bg-slate-800/20' : 'border-slate-200 bg-slate-50/50'}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Status</p>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                          <StatusIcon size={12} />
                          {status.label}
                        </span>
                      </div>
                      <div>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Storage</p>
                        <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {backup.storage_path ? 'Supabase Storage' : backup.storage_location || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>File</p>
                        <p className={`text-sm font-mono truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {backup.storage_path || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Completed</p>
                        <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {backup.completed_at ? new Date(backup.completed_at).toLocaleString('en-AU') : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {backup.table_details && backup.table_details.length > 0 && (
                      <div className={`rounded-lg overflow-hidden mb-4 ${darkMode ? 'bg-slate-700/30' : 'bg-white border border-slate-200'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wider px-3 pt-3 pb-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          Tables Included ({backup.table_details.length})
                        </p>
                        <div className="max-h-48 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={darkMode ? 'text-slate-500' : 'text-slate-400'}>
                                <th className="text-left px-3 py-1.5 font-medium">Table</th>
                                <th className="text-right px-3 py-1.5 font-medium">Rows</th>
                                <th className="text-right px-3 py-1.5 font-medium">Size</th>
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                              {backup.table_details
                                .sort((a: any, b: any) => (b.rows || 0) - (a.rows || 0))
                                .map((t: any) => (
                                  <tr key={t.name} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'}`}>
                                    <td className={`px-3 py-1.5 font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{t.name}</td>
                                    <td className={`px-3 py-1.5 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{(t.rows || 0).toLocaleString()}</td>
                                    <td className={`px-3 py-1.5 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{formatBytes(t.size_bytes || 0)}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {backup.notes && (
                      <div className={`p-3 rounded-lg mb-4 ${darkMode ? 'bg-slate-700/30' : 'bg-white border border-slate-200'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Notes</p>
                        <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{backup.notes}</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {backup.storage_path && (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadBackup(backup); }}
                          disabled={downloading === backup.id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            darkMode ? 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/25' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                          } disabled:opacity-50`}
                        >
                          {downloading === backup.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          {downloading === backup.id ? 'Downloading...' : 'Download JSON'}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBackup(backup); }}
                        disabled={deleting === backup.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          darkMode ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-red-50 text-red-700 hover:bg-red-100'
                        } disabled:opacity-50`}
                      >
                        {deleting === backup.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {backups.length === 0 && !loading && (
            <div className={`rounded-2xl border p-12 text-center ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
              <Database size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
              <p className={`text-lg font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No Backups Yet</p>
              <p className={`text-sm mt-1 mb-6 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Create your first backup to export a full JSON snapshot of your database.
              </p>
              <button
                onClick={createBackup}
                disabled={creating}
                className="px-6 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20"
              >
                Create First Backup
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-sky-500" />
            </div>
          )}
        </div>
      )}

      {activeView === 'tables' && (
        <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="p-4 flex items-center justify-between">
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <Server size={16} className="inline mr-2 text-sky-500" />
              Database Tables ({tableStats.length})
            </h3>
            <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Total: {formatBytes(totalDbSize)} / {totalRows.toLocaleString()} rows
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-y border-slate-700/50 bg-slate-800/40' : 'text-slate-500 border-y border-slate-200 bg-slate-50'}`}>
                  <th className="px-4 py-3">Table Name</th>
                  <th className="px-4 py-3 text-right">Rows</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3 text-right">% of DB</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {tableStats.map(table => {
                  const pct = totalDbSize > 0 ? ((table.size_bytes / totalDbSize) * 100) : 0;
                  return (
                    <tr key={table.table_name} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className={`px-4 py-3 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        <div className="flex items-center gap-2">
                          <FileJson size={14} className="text-sky-500 flex-shrink-0" />
                          <span className="font-mono text-xs">{table.table_name}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {(table.row_count || 0).toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {table.total_size || formatBytes(table.size_bytes)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`w-16 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${Math.max(pct, 0.5)}%` }}
                            />
                          </div>
                          <span className={`text-xs w-12 text-right ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

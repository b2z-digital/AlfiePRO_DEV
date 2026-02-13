import { useState, useEffect } from 'react';
import {
  Database, Plus, Download, RotateCcw, Clock, CheckCircle,
  AlertCircle, XCircle, HardDrive, Server, Calendar, FileText,
  ChevronDown, MoreVertical, Loader2, Shield, Archive
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
  notes: string | null;
  triggered_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface TableInfo {
  table_name: string;
  row_count: number;
}

export function BackupManagementTab({ darkMode }: BackupManagementTabProps) {
  const { user } = useAuth();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedBackup, setExpandedBackup] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [backupsRes, tablesRes] = await Promise.all([
        supabase.from('platform_backups').select('*').order('created_at', { ascending: false }),
        supabase.rpc('get_public_table_stats').catch(() => ({ data: null })),
      ]);

      setBackups(backupsRes.data || []);

      if (tablesRes.data) {
        setTableInfo(tablesRes.data);
      } else {
        const { data: tables } = await supabase
          .from('information_schema.tables' as any)
          .select('table_name')
          .eq('table_schema', 'public')
          .eq('table_type', 'BASE TABLE');

        if (tables) {
          setTableInfo(tables.map((t: any) => ({ table_name: t.table_name, row_count: 0 })));
        }
      }
    } catch (err) {
      console.error('Error loading backup data:', err);
    } finally {
      setLoading(false);
    }
  };

  const createManualBackup = async () => {
    setCreating(true);
    try {
      const totalRows = tableInfo.reduce((sum, t) => sum + t.row_count, 0);
      const estimatedSize = totalRows * 512;

      const { data } = await supabase.from('platform_backups').insert({
        backup_type: 'manual',
        status: 'completed',
        tables_count: tableInfo.length,
        rows_count: totalRows,
        size_bytes: estimatedSize,
        storage_location: 'supabase-managed',
        notes: `Manual backup triggered by super admin`,
        triggered_by: user?.id,
        completed_at: new Date().toISOString(),
      }).select().maybeSingle();

      if (data) {
        setBackups(prev => [data, ...prev]);
      }
    } catch (err) {
      console.error('Error creating backup:', err);
    } finally {
      setCreating(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
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
    restored: { icon: RotateCcw, color: 'text-amber-500', bg: darkMode ? 'bg-amber-500/15' : 'bg-amber-50', label: 'Restored' },
  };

  const typeConfig: Record<string, { label: string; color: string }> = {
    automatic: { label: 'Automatic', color: darkMode ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700' },
    manual: { label: 'Manual', color: darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' },
    pre_migration: { label: 'Pre-Migration', color: darkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700' },
  };

  const totalDbSize = tableInfo.reduce((sum, t) => sum + (t.row_count * 512), 0);
  const totalRows = tableInfo.reduce((sum, t) => sum + t.row_count, 0);
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
            <p className="text-sm text-slate-400">Database backups and restore points</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Database Size</span>
            <HardDrive size={16} className="text-sky-500" />
          </div>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatBytes(totalDbSize)}</p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{tableInfo.length} tables, {totalRows.toLocaleString()} rows</p>
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

      <div className="flex items-center justify-between">
        <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Backup History</h3>
        <button
          onClick={createManualBackup}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? 'Creating...' : 'Create Backup'}
        </button>
      </div>

      <div className="space-y-3">
        {backups.map((backup) => {
          const status = statusConfig[backup.status] || statusConfig.completed;
          const type = typeConfig[backup.backup_type] || typeConfig.manual;
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
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${type.color}`}>
                        {type.label}
                      </span>
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {new Date(backup.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} UTC
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
                      <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Type</p>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{type.label}</p>
                    </div>
                    <div>
                      <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Storage</p>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{backup.storage_location || 'Supabase Managed'}</p>
                    </div>
                    <div>
                      <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Completed</p>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {backup.completed_at ? new Date(backup.completed_at).toLocaleString('en-AU') : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {backup.notes && (
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-white'}`}>
                      <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Notes</p>
                      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{backup.notes}</p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'} transition-colors`}>
                      <Download size={14} />
                      Download
                    </button>
                    {backup.status === 'completed' && (
                      <button className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${darkMode ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'} transition-colors`}>
                        <RotateCcw size={14} />
                        Restore
                      </button>
                    )}
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
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Create your first backup to start tracking database snapshots.
            </p>
            <button
              onClick={createManualBackup}
              disabled={creating}
              className="mt-4 px-6 py-2.5 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
            >
              Create First Backup
            </button>
          </div>
        )}
      </div>

      {tableInfo.length > 0 && (
        <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            <Server size={18} className="inline mr-2 text-sky-500" />
            Current Database Tables
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {tableInfo
              .sort((a, b) => b.row_count - a.row_count)
              .map(table => (
                <div
                  key={table.table_name}
                  className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}
                >
                  <span className={`text-xs font-mono truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{table.table_name}</span>
                  <span className={`text-xs font-semibold ml-2 flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {table.row_count.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

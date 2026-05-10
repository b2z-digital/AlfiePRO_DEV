import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, TriangleAlert as AlertTriangle } from 'lucide-react';
import { scoringSyncEngine } from '../../utils/scoringSyncEngine';

interface SyncStatusIndicatorProps {
  darkMode?: boolean;
  compact?: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  darkMode = false,
  compact = false,
}) => {
  const [syncState, setSyncState] = useState(scoringSyncEngine.getSyncState());

  useEffect(() => {
    return scoringSyncEngine.onSyncStatusChange(setSyncState);
  }, []);

  const getStatusConfig = () => {
    switch (syncState.status) {
      case 'synced':
        return {
          icon: <Check className="w-3.5 h-3.5" />,
          color: 'text-emerald-500',
          bgColor: darkMode ? 'bg-emerald-500/10' : 'bg-emerald-50',
          borderColor: 'border-emerald-200',
          label: 'Synced',
        };
      case 'syncing':
        return {
          icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
          color: 'text-blue-500',
          bgColor: darkMode ? 'bg-blue-500/10' : 'bg-blue-50',
          borderColor: 'border-blue-200',
          label: `Syncing ${syncState.pendingChanges}`,
        };
      case 'offline':
        return {
          icon: <CloudOff className="w-3.5 h-3.5" />,
          color: 'text-amber-500',
          bgColor: darkMode ? 'bg-amber-500/10' : 'bg-amber-50',
          borderColor: 'border-amber-200',
          label: 'Offline',
        };
      case 'error':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          color: 'text-red-500',
          bgColor: darkMode ? 'bg-red-500/10' : 'bg-red-50',
          borderColor: 'border-red-200',
          label: 'Sync Error',
        };
    }
  };

  const config = getStatusConfig();

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}
        title={`${config.label}${syncState.pendingChanges > 0 ? ` (${syncState.pendingChanges} pending)` : ''}`}
      >
        {config.icon}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color} ${config.bgColor} ${config.borderColor}`}
    >
      {config.icon}
      <span>{config.label}</span>
      {syncState.pendingChanges > 0 && syncState.status !== 'syncing' && (
        <span className="opacity-70">({syncState.pendingChanges})</span>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, CloudOff, Cloud, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { offlineStorage } from '../utils/offlineStorage';

interface OfflineIndicatorProps {
  darkMode?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ darkMode = true }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Subscribe to connection status changes
    const unsubscribe = offlineStorage.onConnectionChange((online) => {
      setIsOnline(online);

      if (online) {
        // When connection is restored, trigger sync
        syncData();
      }
    });

    // Initial check for pending sync count
    updatePendingSyncCount();

    // Check pending sync count every 10 seconds
    const interval = setInterval(updatePendingSyncCount, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const updatePendingSyncCount = async () => {
    const count = await offlineStorage.getPendingSyncCount();
    setPendingSyncCount(count);
  };

  const syncData = async () => {
    setIsSyncing(true);
    try {
      await offlineStorage.processSyncQueue();
      setLastSyncTime(new Date());
      await updatePendingSyncCount();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return darkMode ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' : 'bg-yellow-50 border-yellow-200 text-yellow-700';
    if (isSyncing) return darkMode ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700';
    if (pendingSyncCount > 0) return darkMode ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-700';
    return darkMode ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-green-50 border-green-200 text-green-700';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <CloudOff size={16} />;
    if (isSyncing) return <RefreshCw size={16} className="animate-spin" />;
    if (pendingSyncCount > 0) return <AlertCircle size={16} />;
    return <CheckCircle size={16} />;
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline Mode';
    if (isSyncing) return 'Syncing...';
    if (pendingSyncCount > 0) return `${pendingSyncCount} pending`;
    return 'Online & Synced';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          border transition-all
          ${getStatusColor()}
          hover:opacity-80
        `}
      >
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </button>

      {showDetails && (
        <div className={`
          absolute right-0 top-full mt-2 w-72 rounded-lg shadow-xl border z-50
          ${darkMode
            ? 'bg-slate-800 border-slate-700 text-slate-200'
            : 'bg-white border-slate-200 text-slate-700'}
        `}>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Connection Status</span>
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <>
                    <Wifi size={16} className="text-green-500" />
                    <span className="text-xs text-green-500">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={16} className="text-yellow-500" />
                    <span className="text-xs text-yellow-500">Offline</span>
                  </>
                )}
              </div>
            </div>

            <div className={`
              border-t pt-3
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <div className="text-xs space-y-2">
                <div className="flex justify-between">
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Pending Changes:</span>
                  <span className="font-medium">{pendingSyncCount}</span>
                </div>

                {lastSyncTime && (
                  <div className="flex justify-between">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Last Sync:</span>
                    <span className="font-medium">{lastSyncTime.toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            </div>

            {isOnline && pendingSyncCount > 0 && (
              <button
                onClick={syncData}
                disabled={isSyncing}
                className={`
                  w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
                  transition-colors
                  ${darkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            )}

            {!isOnline && (
              <div className={`
                text-xs p-2 rounded-lg
                ${darkMode ? 'bg-yellow-500/10 text-yellow-400' : 'bg-yellow-50 text-yellow-700'}
              `}>
                <p className="font-medium mb-1">Working Offline</p>
                <p className={darkMode ? 'text-yellow-300/70' : 'text-yellow-600'}>
                  Your changes are saved locally and will sync automatically when connection is restored.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

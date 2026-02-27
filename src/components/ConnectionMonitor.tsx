import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, CloudOff, RefreshCw, Loader } from 'lucide-react';
import { offlineStorage } from '../utils/offlineStorage';
import { supabase, forceConnectionRecovery } from '../utils/supabase';

export const ConnectionMonitor: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [wasOffline, setWasOffline] = useState(false);
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const lastActivityRef = React.useRef(Date.now());
  const [connectionTested, setConnectionTested] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [connectionSlow, setConnectionSlow] = useState(false);

  useEffect(() => {
    let reconnectTimeout: number;

    const handleOnline = async () => {
      const previouslyOffline = !isOnline;
      setIsOnline(true);

      // Only show reconnected message if we were actually offline
      if (previouslyOffline && wasOffline) {
        setShowReconnected(true);

        // Trigger background sync
        console.log('Connection restored - triggering sync');
        await offlineStorage.processSyncQueue();

        // Update pending count
        const count = await offlineStorage.getPendingSyncCount();
        setPendingSync(count);

        // Hide the reconnected message after 3 seconds
        reconnectTimeout = window.setTimeout(() => {
          setShowReconnected(false);
        }, 3000);
      }

      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
      setWasOffline(true);
    };

    // Listen to browser online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to connection changes from offline storage
    const unsubscribe = offlineStorage.onConnectionChange(async (online) => {
      // Update pending sync count
      const count = await offlineStorage.getPendingSyncCount();
      setPendingSync(count);
    });

    // Set initial state
    setIsOnline(navigator.onLine);
    offlineStorage.getPendingSyncCount().then(setPendingSync);

    // Test Supabase connection health
    const testConnection = async () => {
      try {
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const { error } = await supabase
          .from('profiles')
          .select('count')
          .limit(1)
          .abortSignal(controller.signal);

        clearTimeout(timeoutId);
        const elapsed = Date.now() - startTime;

        if (error) {
          console.warn('Supabase connection test failed:', error);
          setShowStaleWarning(true);
          setConnectionSlow(false);
        } else {
          setConnectionTested(true);
          setShowStaleWarning(false);

          if (elapsed > 3000) {
            console.warn('Connection is slow:', elapsed, 'ms');
            setConnectionSlow(true);
          } else {
            setConnectionSlow(false);
          }
        }
      } catch (err) {
        console.error('Connection test error:', err);
        setShowStaleWarning(true);
        setConnectionSlow(false);
      }
    };

    // Check for stale session (no activity for 10+ minutes or after returning from background)
    const staleCheckInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      const tenMinutes = 10 * 60 * 1000;

      if (timeSinceActivity > tenMinutes && isOnline) {
        console.warn('Session appears stale, testing connection...');
        testConnection();
      }
    }, 30000); // Check every 30 seconds

    // Detect when page becomes visible again (user returns to tab)
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        const timeSinceActivity = Date.now() - lastActivityRef.current;
        const fiveMinutes = 5 * 60 * 1000;

        // If user was away for 5+ minutes, test connection immediately
        if (timeSinceActivity > fiveMinutes) {
          console.log('User returned after being away, testing connection...');
          await testConnection();
        }
      }
    };

    const activityHandler = () => {
      lastActivityRef.current = Date.now();
      setShowStaleWarning(false);
    };

    window.addEventListener('click', activityHandler, { passive: true });
    window.addEventListener('keydown', activityHandler, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    setTimeout(testConnection, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('click', activityHandler);
      window.removeEventListener('keydown', activityHandler);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
      clearInterval(staleCheckInterval);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [isOnline, wasOffline]);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleRecover = async () => {
    setIsRecovering(true);
    const success = await forceConnectionRecovery();

    if (success) {
      setShowStaleWarning(false);
      setConnectionSlow(false);
      setConnectionTested(true);
    } else {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }

    setIsRecovering(false);
  };

  if (isOnline && !showReconnected && !showStaleWarning && !connectionSlow) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      {!isOnline ? (
        <div className="bg-yellow-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <CloudOff className="w-5 h-5" />
          <div>
            <div className="font-semibold">Working Offline</div>
            <div className="text-sm opacity-90">Changes will sync when reconnected</div>
          </div>
        </div>
      ) : showStaleWarning ? (
        <div className="bg-orange-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
          <WifiOff className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Connection Issue Detected</div>
            <div className="text-sm opacity-90">Database connection lost. Try recovering or refresh.</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRecover}
              disabled={isRecovering}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1 font-medium"
              title="Try to recover connection"
            >
              {isRecovering ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              Recover
            </button>
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-1 font-medium"
              title="Refresh page"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      ) : connectionSlow ? (
        <div className="bg-blue-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
          <Loader className="w-5 h-5 flex-shrink-0 animate-spin" />
          <div className="flex-1">
            <div className="font-semibold">Slow Connection</div>
            <div className="text-sm opacity-90">Using cached data. Updates may be delayed.</div>
          </div>
        </div>
      ) : showReconnected ? (
        <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <Wifi className="w-5 h-5" />
          <div>
            <div className="font-semibold">Connection Restored</div>
            <div className="text-sm opacity-90">
              {pendingSync > 0 ? `Syncing ${pendingSync} changes...` : 'All changes synced'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

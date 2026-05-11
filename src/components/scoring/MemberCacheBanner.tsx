import React, { useState, useEffect, useRef } from 'react';
import { Users, RefreshCw, WifiOff } from 'lucide-react';
import { memberPreloader } from '../../utils/memberPreloader';

interface MemberCacheBannerProps {
  darkMode?: boolean;
  onRefresh?: () => void;
}

export const MemberCacheBanner: React.FC<MemberCacheBannerProps> = ({
  darkMode = false,
  onRefresh,
}) => {
  const [state, setState] = useState(memberPreloader.getState());
  const [visible, setVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return memberPreloader.onStateChange(setState);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOffline) {
      setVisible(true);
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    } else {
      // When online, briefly show then auto-dismiss
      setVisible(true);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        setVisible(false);
      }, 4000);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [isOffline, state.memberCount]);

  if (!visible || state.memberCount === 0) return null;

  const handleRefresh = async () => {
    await memberPreloader.forceRefresh();
    onRefresh?.();
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-opacity duration-500 ${
        isOffline
          ? darkMode
            ? 'bg-amber-900/20 border-amber-800/30'
            : 'bg-amber-50 border-amber-100'
          : darkMode
            ? 'bg-emerald-900/20 border-emerald-800/30'
            : 'bg-emerald-50 border-emerald-100'
      }`}
    >
      <div className={`flex items-center gap-1.5 ${isOffline ? (darkMode ? 'text-amber-300' : 'text-amber-700') : (darkMode ? 'text-emerald-300' : 'text-emerald-700')}`}>
        {isOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
        <span className="font-medium">
          {isOffline
            ? `Offline - ${state.memberCount} members cached locally`
            : `${state.memberCount} members cached`}
        </span>
        {!isOffline && (
          <span className="opacity-70">({state.syncAge})</span>
        )}
      </div>

      {state.isLoading ? (
        <RefreshCw className={`w-3.5 h-3.5 animate-spin ${isOffline ? 'text-amber-500' : 'text-emerald-500'}`} />
      ) : isOffline ? null : (
        <button
          onClick={handleRefresh}
          className={`p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}
          title="Refresh member list"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

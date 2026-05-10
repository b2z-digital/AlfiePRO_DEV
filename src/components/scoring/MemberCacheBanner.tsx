import React, { useState, useEffect } from 'react';
import { Users, RefreshCw, Wifi, WifiOff } from 'lucide-react';
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

  useEffect(() => {
    return memberPreloader.onStateChange(setState);
  }, []);

  const getFreshnessConfig = () => {
    switch (state.freshness) {
      case 'fresh':
        return {
          dotColor: 'bg-emerald-400',
          textColor: darkMode ? 'text-emerald-300' : 'text-emerald-700',
          bgColor: darkMode ? 'bg-emerald-900/20' : 'bg-emerald-50',
          borderColor: darkMode ? 'border-emerald-800/30' : 'border-emerald-100',
          icon: <Wifi className="w-3.5 h-3.5" />,
        };
      case 'recent':
        return {
          dotColor: 'bg-blue-400',
          textColor: darkMode ? 'text-blue-300' : 'text-blue-700',
          bgColor: darkMode ? 'bg-blue-900/20' : 'bg-blue-50',
          borderColor: darkMode ? 'border-blue-800/30' : 'border-blue-100',
          icon: <Users className="w-3.5 h-3.5" />,
        };
      case 'stale':
        return {
          dotColor: 'bg-amber-400',
          textColor: darkMode ? 'text-amber-300' : 'text-amber-700',
          bgColor: darkMode ? 'bg-amber-900/20' : 'bg-amber-50',
          borderColor: darkMode ? 'border-amber-800/30' : 'border-amber-100',
          icon: <WifiOff className="w-3.5 h-3.5" />,
        };
      case 'none':
        return {
          dotColor: 'bg-red-400',
          textColor: darkMode ? 'text-red-300' : 'text-red-700',
          bgColor: darkMode ? 'bg-red-900/20' : 'bg-red-50',
          borderColor: darkMode ? 'border-red-800/30' : 'border-red-100',
          icon: <WifiOff className="w-3.5 h-3.5" />,
        };
    }
  };

  const config = getFreshnessConfig();

  const handleRefresh = async () => {
    await memberPreloader.forceRefresh();
    onRefresh?.();
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${config.bgColor} ${config.borderColor}`}>
      <div className={`flex items-center gap-1.5 ${config.textColor}`}>
        {config.icon}
        <span className="font-medium">
          {state.memberCount > 0
            ? `${state.memberCount} members cached`
            : 'No member data cached'}
        </span>
        <span className="opacity-70">
          ({state.syncAge})
        </span>
      </div>

      {state.isLoading ? (
        <RefreshCw className={`w-3.5 h-3.5 animate-spin ${config.textColor}`} />
      ) : (
        <button
          onClick={handleRefresh}
          className={`p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 ${config.textColor}`}
          title="Refresh member list"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

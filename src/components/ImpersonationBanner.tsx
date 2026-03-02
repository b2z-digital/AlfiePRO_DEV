import React from 'react';
import { Eye, X, Shield } from 'lucide-react';
import { useImpersonation } from '../contexts/ImpersonationContext';

export const ImpersonationBanner: React.FC = () => {
  const { isImpersonating, session, stopImpersonation } = useImpersonation();

  if (!isImpersonating || !session) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500 shadow-lg">
      <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
            <Eye size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/80 text-sm font-medium">Viewing as</span>
              <div className="flex items-center gap-2">
                {session.targetAvatarUrl ? (
                  <img
                    src={session.targetAvatarUrl}
                    alt={session.targetName}
                    className="w-6 h-6 rounded-full object-cover ring-2 ring-white/40"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white/40">
                    {session.targetName.charAt(0)}
                  </div>
                )}
                <span className="text-white font-bold text-sm truncate">
                  {session.targetName}
                </span>
                {session.targetEmail && (
                  <span className="text-white/70 text-xs hidden sm:inline">
                    ({session.targetEmail})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-white/15 rounded-full backdrop-blur-sm">
            <Shield size={12} className="text-white/80" />
            <span className="text-white/80 text-xs font-medium">Admin View Mode</span>
          </div>
          <button
            onClick={stopImpersonation}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-amber-700 rounded-lg font-semibold text-sm hover:bg-white/90 transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <X size={14} />
            <span>Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
};

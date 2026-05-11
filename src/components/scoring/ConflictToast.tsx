import React, { useState, useEffect } from 'react';
import { TriangleAlert as AlertTriangle, X } from 'lucide-react';
import { scoringSyncEngine, ScoringConflict } from '../../utils/scoringSyncEngine';

interface ConflictToastProps {
  darkMode?: boolean;
}

export const ConflictToast: React.FC<ConflictToastProps> = ({ darkMode = false }) => {
  const [conflicts, setConflicts] = useState<ScoringConflict[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    return scoringSyncEngine.onConflict((conflict) => {
      setConflicts(prev => [...prev, conflict]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setDismissed(prev => new Set([...prev, conflict.id]));
      }, 5000);
    });
  }, []);

  const visibleConflicts = conflicts.filter(c => !dismissed.has(c.id));

  if (visibleConflicts.length === 0) return null;

  const dismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  const latestConflict = visibleConflicts[visibleConflicts.length - 1];

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div
        className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg shadow-lg border ${
          darkMode
            ? 'bg-slate-800 border-amber-700/50 text-slate-200'
            : 'bg-white border-amber-200 text-slate-800'
        }`}
      >
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">
            Conflict auto-resolved
          </p>
          <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Race {latestConflict.change.race}, Skipper #{latestConflict.change.skipperIndex + 1}:
            {' '}{latestConflict.change.field} updated to {String(latestConflict.resolvedValue)}
          </p>
          {visibleConflicts.length > 1 && (
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              +{visibleConflicts.length - 1} more
            </p>
          )}
        </div>
        <button
          onClick={() => {
            visibleConflicts.forEach(c => dismiss(c.id));
          }}
          className={`p-0.5 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

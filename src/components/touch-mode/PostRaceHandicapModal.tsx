import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Award } from 'lucide-react';
import { Skipper, RaceResult } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

interface PostRaceHandicapModalProps {
  isOpen: boolean;
  onClose: () => void;
  skippers: Skipper[];
  raceNumber: number;
  raceResults: RaceResult[];
  darkMode: boolean;
}

interface HandicapChange {
  skipperIndex: number;
  skipperName: string;
  sailNumber: string;
  avatarUrl?: string;
  before: number;
  after: number;
  change: number;
  position: number | null;
  letterScore?: string;
}

export const PostRaceHandicapModal: React.FC<PostRaceHandicapModalProps> = ({
  isOpen,
  onClose,
  skippers,
  raceNumber,
  raceResults,
  darkMode
}) => {
  const [changes, setChanges] = useState<HandicapChange[]>([]);
  const [stats, setStats] = useState({ increased: 0, decreased: 0, unchanged: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const currentRaceResults = raceResults.filter(r => r.race === raceNumber);
    const previousRaceResults = raceResults.filter(r => r.race === raceNumber - 1);

    const handicapChanges: HandicapChange[] = skippers.map((skipper, index) => {
      const currentResult = currentRaceResults.find(r => r.skipperIndex === index);
      const previousResult = previousRaceResults.find(r => r.skipperIndex === index);

      const before = currentResult?.handicap ?? (previousResult?.adjustedHcap ?? skipper.startHcap);
      const after = currentResult?.adjustedHcap ?? before;
      const change = after - before;

      return {
        skipperIndex: index,
        skipperName: skipper.name,
        sailNumber: skipper.sailNumber || skipper.sailNo,
        avatarUrl: skipper.avatarUrl,
        before,
        after,
        change,
        position: currentResult?.position ?? null,
        letterScore: currentResult?.letterScore
      };
    });

    // Sort by position (completed races first, then by position)
    handicapChanges.sort((a, b) => {
      if (a.position !== null && b.position === null) return -1;
      if (a.position === null && b.position !== null) return 1;
      if (a.position !== null && b.position !== null) return a.position - b.position;
      return 0;
    });

    setChanges(handicapChanges);

    // Calculate stats
    const increased = handicapChanges.filter(c => c.change > 0).length;
    const decreased = handicapChanges.filter(c => c.change < 0).length;
    const unchanged = handicapChanges.filter(c => c.change === 0).length;
    setStats({ increased, decreased, unchanged });
  }, [isOpen, skippers, raceNumber, raceResults]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className={`relative w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden ${
            darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
          }`}
        >
          {/* Header */}
          <div className={`px-6 py-4 border-b flex items-center justify-between ${
            darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Award className="text-yellow-500" size={28} />
                Race {raceNumber} Handicaps Updated
              </h2>
              <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {stats.increased} increased • {stats.decreased} decreased • {stats.unchanged} unchanged
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
              }`}
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(85vh-140px)] p-6">
            <div className="grid gap-3">
              {changes.map((change, index) => {
                const initials = change.skipperName
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <motion.div
                    key={change.skipperIndex}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`rounded-xl p-4 border transition-all ${
                      darkMode
                        ? 'bg-slate-900/30 border-slate-700/50 hover:bg-slate-900/50'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Position Badge */}
                      {change.position !== null && (
                        <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                          {change.letterScore || change.position}
                        </div>
                      )}

                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold border-2 overflow-hidden flex-shrink-0 ${
                        darkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {change.avatarUrl ? (
                          <img
                            src={change.avatarUrl}
                            alt={change.skipperName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>

                      {/* Skipper Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-lg">{change.skipperName}</div>
                        <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Sail {change.sailNumber}
                        </div>
                      </div>

                      {/* Handicap Change Animation */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Before */}
                        <div className="text-right">
                          <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            Before
                          </div>
                          <div className={`text-2xl font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {change.before}
                          </div>
                        </div>

                        {/* Arrow/Icon */}
                        <div className="flex flex-col items-center">
                          {change.change > 0 ? (
                            <motion.div
                              initial={{ y: -10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ delay: index * 0.03 + 0.2 }}
                            >
                              <TrendingUp className="text-red-500" size={24} />
                            </motion.div>
                          ) : change.change < 0 ? (
                            <motion.div
                              initial={{ y: 10, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ delay: index * 0.03 + 0.2 }}
                            >
                              <TrendingDown className="text-green-500" size={24} />
                            </motion.div>
                          ) : (
                            <Minus className={darkMode ? 'text-slate-600' : 'text-slate-400'} size={24} />
                          )}
                          {change.change !== 0 && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: index * 0.03 + 0.3 }}
                              className={`text-xs font-bold mt-1 px-2 py-0.5 rounded-full ${
                                change.change > 0
                                  ? 'bg-red-500/20 text-red-500'
                                  : 'bg-green-500/20 text-green-500'
                              }`}
                            >
                              {change.change > 0 ? '+' : ''}{change.change}
                            </motion.div>
                          )}
                        </div>

                        {/* After */}
                        <div className="text-left">
                          <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            After
                          </div>
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: index * 0.03 + 0.4 }}
                            className="text-2xl font-bold text-yellow-500"
                          >
                            {change.after}
                          </motion.div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className={`px-6 py-4 border-t ${
            darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Continue Scoring
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

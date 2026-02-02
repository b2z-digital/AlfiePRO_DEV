import React, { useState, useEffect, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Award, Info } from 'lucide-react';
import { Skipper, RaceResult } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

interface HandicapProgressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  skipper: Skipper;
  skipperIndex: number;
  raceResults: RaceResult[];
  numRaces: number;
  darkMode: boolean;
}

interface HandicapDataPoint {
  race: number;
  handicap: number;
  position: number | null;
  letterScore?: string;
}

export const HandicapProgressionModal: React.FC<HandicapProgressionModalProps> = ({
  isOpen,
  onClose,
  skipper,
  skipperIndex,
  raceResults,
  numRaces,
  darkMode
}) => {
  const [dataPoints, setDataPoints] = useState<HandicapDataPoint[]>([]);

  const progression = useMemo(() => {
    const points: HandicapDataPoint[] = [];

    for (let race = 1; race <= numRaces; race++) {
      const result = raceResults.find(r => r.race === race && r.skipperIndex === skipperIndex);

      if (result) {
        points.push({
          race,
          handicap: result.adjustedHcap ?? result.handicap ?? skipper.startHcap,
          position: result.position,
          letterScore: result.letterScore
        });
      } else {
        // Use previous handicap or start handicap
        const previousPoint = points[points.length - 1];
        points.push({
          race,
          handicap: previousPoint?.handicap ?? skipper.startHcap,
          position: null
        });
      }
    }

    return points;
  }, [raceResults, skipperIndex, skipper.startHcap, numRaces]);

  useEffect(() => {
    if (isOpen) {
      setDataPoints(progression);
    }
  }, [isOpen, progression]);

  if (!isOpen) return null;

  const minHandicap = Math.min(...dataPoints.map(d => d.handicap), skipper.startHcap);
  const maxHandicap = Math.max(...dataPoints.map(d => d.handicap), skipper.startHcap);
  const range = maxHandicap - minHandicap || 1;

  const currentHandicap = dataPoints[dataPoints.length - 1]?.handicap ?? skipper.startHcap;
  const handicapChange = currentHandicap - skipper.startHcap;
  const trend = handicapChange > 0 ? 'up' : handicapChange < 0 ? 'down' : 'stable';

  const initials = skipper.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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
          className={`relative w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden ${
            darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
          }`}
        >
          {/* Header */}
          <div className={`px-6 py-4 border-b ${
            darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center font-semibold border-2 overflow-hidden ${
                  darkMode ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-200 text-slate-600 border-slate-300'
                }`}>
                  {skipper.avatarUrl ? (
                    <img
                      src={skipper.avatarUrl}
                      alt={skipper.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-bold">{skipper.name}</h2>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Sail {skipper.sailNumber || skipper.sailNo}
                  </p>
                </div>
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
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(85vh-200px)] p-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className={`rounded-xl p-4 border ${
                darkMode ? 'bg-slate-900/30 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Start H'cap
                </div>
                <div className="text-2xl font-bold">{skipper.startHcap}</div>
              </div>

              <div className={`rounded-xl p-4 border ${
                darkMode ? 'bg-slate-900/30 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Current H'cap
                </div>
                <div className="text-2xl font-bold text-yellow-500">{currentHandicap}</div>
              </div>

              <div className={`rounded-xl p-4 border ${
                darkMode ? 'bg-slate-900/30 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Change
                </div>
                <div className={`text-2xl font-bold flex items-center gap-1 ${
                  trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : ''
                }`}>
                  {trend === 'up' && <TrendingUp size={20} />}
                  {trend === 'down' && <TrendingDown size={20} />}
                  {handicapChange > 0 ? '+' : ''}{handicapChange}
                </div>
              </div>
            </div>

            {/* Timeline Graph */}
            <div className={`rounded-xl p-6 border ${
              darkMode ? 'bg-slate-900/30 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <Award className="text-yellow-500" size={20} />
                <h3 className="font-semibold">Handicap Progression</h3>
              </div>

              {/* Graph */}
              <div className="relative h-48 mb-4">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs">
                  <span>{maxHandicap}</span>
                  <span>{Math.round((maxHandicap + minHandicap) / 2)}</span>
                  <span>{minHandicap}</span>
                </div>

                {/* Graph area */}
                <div className="ml-12 h-full relative border-l border-b border-slate-300 dark:border-slate-600">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-slate-200 dark:border-slate-700"
                      style={{ top: `${i * 25}%` }}
                    />
                  ))}

                  {/* Data line */}
                  <svg className="absolute inset-0 w-full h-full">
                    <motion.polyline
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1, ease: 'easeInOut' }}
                      fill="none"
                      stroke={darkMode ? '#3b82f6' : '#2563eb'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={dataPoints
                        .map((point, index) => {
                          const x = (index / (dataPoints.length - 1 || 1)) * 100;
                          const y = ((maxHandicap - point.handicap) / range) * 100;
                          return `${x}%,${y}%`;
                        })
                        .join(' ')}
                    />
                  </svg>

                  {/* Data points */}
                  {dataPoints.map((point, index) => {
                    const x = (index / (dataPoints.length - 1 || 1)) * 100;
                    const y = ((maxHandicap - point.handicap) / range) * 100;

                    return (
                      <motion.div
                        key={point.race}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 border-2 border-white dark:border-slate-800 cursor-pointer hover:scale-150 transition-transform group"
                        style={{ left: `${x}%`, top: `${y}%` }}
                        title={`Race ${point.race}: ${point.handicap}`}
                      >
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-slate-900 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          Race {point.race}: {point.handicap}
                          {point.position && ` (P${point.position})`}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* X-axis labels */}
                <div className="absolute bottom-0 left-12 right-0 h-6 flex justify-between text-xs mt-2">
                  {dataPoints.map((point, index) => {
                    if (index % Math.ceil(dataPoints.length / 6) === 0 || index === dataPoints.length - 1) {
                      return <span key={point.race}>R{point.race}</span>;
                    }
                    return null;
                  })}
                </div>
              </div>

              {/* Race-by-race breakdown */}
              <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Info size={16} className={darkMode ? 'text-slate-400' : 'text-slate-600'} />
                  <span className="text-sm font-semibold">Race-by-Race</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {dataPoints.map((point) => (
                    <div
                      key={point.race}
                      className={`text-xs p-2 rounded ${
                        darkMode ? 'bg-slate-800/50' : 'bg-white'
                      }`}
                    >
                      <div className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                        Race {point.race}
                      </div>
                      <div className="font-semibold">
                        H'cap: {point.handicap}
                        {point.position && ` • P${point.position}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

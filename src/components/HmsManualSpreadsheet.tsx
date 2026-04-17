import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Skipper } from '../types';
import { HeatDesignation, HeatManagement } from '../types/heat';
import { RaceEvent } from '../types/race';
import { LetterScore } from '../types/letterScores';
import { LetterScoreSelector } from './LetterScoreSelector';
import { Settings, RotateCcw } from 'lucide-react';

const HEAT_COLORS: Record<HeatDesignation, { bg: string; header: string; text: string }> = {
  'A': { bg: 'bg-yellow-500', header: 'bg-yellow-600', text: 'text-yellow-900' },
  'B': { bg: 'bg-red-500', header: 'bg-red-600', text: 'text-white' },
  'C': { bg: 'bg-red-500', header: 'bg-red-600', text: 'text-white' },
  'D': { bg: 'bg-green-500', header: 'bg-green-600', text: 'text-white' },
  'E': { bg: 'bg-blue-500', header: 'bg-blue-600', text: 'text-white' },
  'F': { bg: 'bg-teal-500', header: 'bg-teal-600', text: 'text-white' },
};

const HEAT_LABELS: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];

const TOTAL_RACES = 41;

const getOrdinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

interface CellData {
  sailNumber: string;
  points: string;
  letterScore?: LetterScore | null;
}

interface HmsManualSpreadsheetProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  raceResults: any[];
  currentEvent: RaceEvent | null;
  onConfigureHeats: () => void;
  updateRaceResults: (race: number, skipperIndex: number, position: number | null, letterScore?: any, customPoints?: number) => void;
  deleteRaceResult: (race: number, skipperIndex: number) => void;
  isFullscreen?: boolean;
}

export const HmsManualSpreadsheet: React.FC<HmsManualSpreadsheetProps> = ({
  skippers,
  heatManagement,
  darkMode,
  raceResults,
  currentEvent,
  onConfigureHeats,
  updateRaceResults,
  deleteRaceResult,
  isFullscreen = false,
}) => {
  const numberOfHeats = heatManagement.configuration.numberOfHeats;
  const promotionCount = heatManagement.configuration.promotionCount;
  const heats = HEAT_LABELS.slice(0, numberOfHeats);
  const maxPositions = Math.max(24, Math.ceil(skippers.length / numberOfHeats) + 4);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLetterScoreModal, setShowLetterScoreModal] = useState(false);
  const [letterScoreTarget, setLetterScoreTarget] = useState<{
    heat: HeatDesignation;
    position: number;
    race: number;
  } | null>(null);

  const [cells, setCells] = useState<Record<string, CellData>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sailNumberMap = useMemo(() => {
    const map: Record<string, number> = {};
    skippers.forEach((s, idx) => {
      if (s.sailNumber) {
        map[s.sailNumber.toLowerCase()] = idx;
      }
    });
    return map;
  }, [skippers]);

  const getCellKey = (heat: HeatDesignation, position: number, race: number) =>
    `${heat}-${position}-${race}`;

  useEffect(() => {
    const newCells: Record<string, CellData> = {};
    raceResults.forEach((result: any) => {
      if (result.hmsHeat && result.hmsPosition && result.race) {
        const key = getCellKey(result.hmsHeat, result.hmsPosition, result.race);
        const skipper = skippers[result.skipperIndex];
        newCells[key] = {
          sailNumber: skipper?.sailNumber || '',
          points: result.letterScore ? '' : (result.position?.toString() || ''),
          letterScore: result.letterScore || null,
        };
      }
    });
    setCells(prev => {
      const merged = { ...prev };
      Object.entries(newCells).forEach(([k, v]) => {
        if (!merged[k] || !merged[k].sailNumber) {
          merged[k] = v;
        }
      });
      return merged;
    });
  }, [raceResults, skippers]);

  const handleSailNumberChange = useCallback((heat: HeatDesignation, position: number, race: number, value: string) => {
    const key = getCellKey(heat, position, race);
    setCells(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        sailNumber: value,
        points: prev[key]?.points || '',
      }
    }));
  }, []);

  const handlePointsChange = useCallback((heat: HeatDesignation, position: number, race: number, value: string) => {
    const key = getCellKey(heat, position, race);
    setCells(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        sailNumber: prev[key]?.sailNumber || '',
        points: value,
      }
    }));
  }, []);

  const handleSailNumberBlur = useCallback((heat: HeatDesignation, position: number, race: number) => {
    const key = getCellKey(heat, position, race);
    const cell = cells[key];
    if (!cell?.sailNumber) return;

    const skipperIdx = sailNumberMap[cell.sailNumber.toLowerCase()];
    if (skipperIdx !== undefined) {
      const points = cell.points ? parseInt(cell.points) : position;
      updateRaceResults(race, skipperIdx, points, cell.letterScore || undefined, undefined);
    }
  }, [cells, sailNumberMap, updateRaceResults]);

  const handleLetterScoreSelect = useCallback((score: LetterScore | null, customPoints?: number) => {
    if (!letterScoreTarget || !score) return;
    const { heat, position, race } = letterScoreTarget;
    const key = getCellKey(heat, position, race);
    const cell = cells[key];

    setCells(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        sailNumber: prev[key]?.sailNumber || '',
        points: '',
        letterScore: score,
      }
    }));

    if (cell?.sailNumber) {
      const skipperIdx = sailNumberMap[cell.sailNumber.toLowerCase()];
      if (skipperIdx !== undefined) {
        updateRaceResults(race, skipperIdx, null, score, customPoints);
      }
    }

    setShowLetterScoreModal(false);
    setLetterScoreTarget(null);
  }, [letterScoreTarget, cells, sailNumberMap, updateRaceResults]);

  const handleResetAll = useCallback(() => {
    if (!confirm('Reset all entries in the spreadsheet? This cannot be undone.')) return;
    setCells({});
  }, []);

  const isPromotionRow = (position: number, race: number) => {
    return race > 1 && position <= promotionCount;
  };

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'text-white' : 'text-slate-900'}`}>
      <div className={`flex items-center justify-between px-4 py-2 border-b ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <h3 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            HMS Manual Spreadsheet
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            darkMode ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-100 text-amber-700'
          }`}>
            {numberOfHeats} Heats | {promotionCount} Promotion
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetAll}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              darkMode
                ? 'bg-red-900/30 text-red-300 hover:bg-red-900/50'
                : 'bg-red-50 text-red-600 hover:bg-red-100'
            }`}
          >
            <RotateCcw size={12} />
            Reset All
          </button>
          <button
            onClick={onConfigureHeats}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              darkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Settings size={12} />
            Settings
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
      >
        <table className={`border-collapse text-xs ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className={`sticky left-0 z-30 px-1 py-1 min-w-[60px] border ${
                darkMode ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'
              }`}>
              </th>
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                <th
                  key={race}
                  colSpan={2}
                  className={`px-1 py-1.5 text-center font-bold border whitespace-nowrap ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-slate-200'
                      : 'bg-slate-200 border-slate-300 text-slate-800'
                  }`}
                >
                  R{race}
                </th>
              ))}
            </tr>
            <tr>
              <th className={`sticky left-0 z-30 px-1 py-1 border text-[10px] ${
                darkMode ? 'bg-slate-800 border-slate-600 text-slate-400' : 'bg-slate-100 border-slate-300 text-slate-500'
              }`}>
              </th>
              {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                <React.Fragment key={race}>
                  <th className={`px-1 py-0.5 text-center text-[10px] font-medium border min-w-[52px] ${
                    darkMode
                      ? 'bg-slate-750 border-slate-600 text-slate-400'
                      : 'bg-slate-100 border-slate-300 text-slate-500'
                  }`}>
                    Sail No
                  </th>
                  <th className={`px-1 py-0.5 text-center text-[10px] font-medium border min-w-[36px] ${
                    darkMode
                      ? 'bg-slate-750 border-slate-600 text-slate-400'
                      : 'bg-slate-100 border-slate-300 text-slate-500'
                  }`}>
                    Points
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {heats.map((heat, heatIdx) => (
              <React.Fragment key={heat}>
                <tr>
                  <td
                    className={`sticky left-0 z-10 px-2 py-1.5 font-bold text-sm border text-white ${
                      HEAT_COLORS[heat].header
                    }`}
                  >
                    Heat {heat}
                  </td>
                  {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => (
                    <React.Fragment key={race}>
                      <td className={`px-1 py-1 border text-center font-bold text-white ${
                        HEAT_COLORS[heat].header
                      }`}>
                      </td>
                      <td className={`px-1 py-1 border text-center font-bold text-white ${
                        HEAT_COLORS[heat].header
                      }`}>
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
                {Array.from({ length: maxPositions }, (_, posIdx) => posIdx + 1).map(position => {
                  const isPromotion = isPromotionRow(position, 2);
                  return (
                    <tr key={`${heat}-${position}`}>
                      <td className={`sticky left-0 z-10 px-2 py-0.5 text-[11px] font-medium border whitespace-nowrap ${
                        darkMode
                          ? 'bg-slate-800 border-slate-700 text-slate-300'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}>
                        {getOrdinal(position)}
                      </td>
                      {Array.from({ length: TOTAL_RACES }, (_, i) => i + 1).map(race => {
                        const key = getCellKey(heat, position, race);
                        const cell = cells[key];
                        const showPromotion = isPromotionRow(position, race);

                        const promotionBg = showPromotion
                          ? darkMode
                            ? 'bg-green-900/40'
                            : 'bg-green-200'
                          : darkMode
                            ? 'bg-slate-900'
                            : 'bg-white';

                        const cellBorder = darkMode ? 'border-slate-700' : 'border-slate-200';

                        return (
                          <React.Fragment key={race}>
                            <td className={`px-0 py-0 border ${cellBorder} ${promotionBg}`}>
                              <input
                                ref={el => { inputRefs.current[`${key}-sail`] = el; }}
                                type="text"
                                value={cell?.sailNumber || ''}
                                onChange={e => handleSailNumberChange(heat, position, race, e.target.value)}
                                onBlur={() => handleSailNumberBlur(heat, position, race)}
                                className={`w-full px-1 py-0.5 text-[11px] text-center border-0 outline-none focus:ring-1 focus:ring-blue-400 ${
                                  promotionBg
                                } ${darkMode ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-300'}`}
                                placeholder=""
                                tabIndex={0}
                              />
                            </td>
                            <td
                              className={`px-0 py-0 border ${cellBorder} ${promotionBg} cursor-pointer`}
                              onDoubleClick={() => {
                                if (cell?.sailNumber) {
                                  setLetterScoreTarget({ heat, position, race });
                                  setShowLetterScoreModal(true);
                                }
                              }}
                            >
                              {cell?.letterScore ? (
                                <div className={`w-full px-1 py-0.5 text-[11px] text-center font-medium ${
                                  darkMode ? 'text-amber-400' : 'text-amber-700'
                                }`}>
                                  {cell.letterScore}
                                </div>
                              ) : (
                                <input
                                  ref={el => { inputRefs.current[`${key}-pts`] = el; }}
                                  type="text"
                                  value={cell?.points || ''}
                                  onChange={e => handlePointsChange(heat, position, race, e.target.value)}
                                  onBlur={() => handleSailNumberBlur(heat, position, race)}
                                  className={`w-full px-1 py-0.5 text-[11px] text-center border-0 outline-none focus:ring-1 focus:ring-blue-400 ${
                                    promotionBg
                                  } ${darkMode ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-300'}`}
                                  placeholder=""
                                  tabIndex={0}
                                />
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {showLetterScoreModal && letterScoreTarget && (
        <LetterScoreSelector
          isOpen={showLetterScoreModal}
          onClose={() => {
            setShowLetterScoreModal(false);
            setLetterScoreTarget(null);
          }}
          onSelect={handleLetterScoreSelect}
          darkMode={darkMode}
          raceNumber={letterScoreTarget.race}
          skipperName={(() => {
            const key = getCellKey(letterScoreTarget.heat, letterScoreTarget.position, letterScoreTarget.race);
            const cell = cells[key];
            if (cell?.sailNumber) {
              const idx = sailNumberMap[cell.sailNumber.toLowerCase()];
              return idx !== undefined ? skippers[idx]?.name || cell.sailNumber : cell.sailNumber;
            }
            return '';
          })()}
          isHeatRacing={true}
        />
      )}
    </div>
  );
};

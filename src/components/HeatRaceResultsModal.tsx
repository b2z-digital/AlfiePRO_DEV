import React, { useMemo, useRef, useState, useEffect } from 'react';
import { X, Trophy, Download, ChevronDown, Eye } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation } from '../types/heat';
import { getObserverAssignments, ObserverAssignment } from '../utils/observerUtils';

interface HeatRaceResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  currentEvent?: { id: string } | null;
}

export const HeatRaceResultsModal: React.FC<HeatRaceResultsModalProps> = ({
  isOpen,
  onClose,
  skippers,
  heatManagement,
  darkMode,
  currentEvent
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [observersByHeatRound, setObserversByHeatRound] = useState<Map<string, ObserverAssignment[]>>(new Map());

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showExportMenu && !(event.target as Element).closest('.export-menu-container')) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  // Fetch observers for all heats and rounds
  useEffect(() => {
    const fetchObservers = async () => {
      if (!isOpen || !currentEvent?.id) return;

      const observersMap = new Map<string, ObserverAssignment[]>();

      // Get all completed rounds
      const completedRounds = heatManagement.rounds.filter(r => r.completed);

      // For each completed round, fetch observers for each heat
      for (const round of completedRounds) {
        for (const assignment of round.heatAssignments) {
          const heat = assignment.heatDesignation;
          // Heat numbers: A=1, B=2, C=3, etc.
          const heatNumber = heat.charCodeAt(0) - 'A'.charCodeAt(0) + 1;

          try {
            const observers = await getObserverAssignments(
              currentEvent.id,
              heatNumber,
              round.round
            );

            if (observers && observers.length > 0) {
              const key = `${heat}-${round.round}`;
              observersMap.set(key, observers);
            }
          } catch (error) {
            console.error(`Error fetching observers for heat ${heat}, round ${round.round}:`, error);
          }
        }
      }

      setObserversByHeatRound(observersMap);
    };

    fetchObservers();
  }, [isOpen, currentEvent, heatManagement]);

  const processedData = useMemo(() => {
    const completedRounds = heatManagement.rounds
      .filter(r => r.completed)
      .sort((a, b) => a.round - b.round);

    const allHeats = new Set<HeatDesignation>();
    completedRounds.forEach(round => {
      round.heatAssignments.forEach(assignment => {
        allHeats.add(assignment.heatDesignation);
      });
    });
    const heats = Array.from(allHeats).sort();
    const promotionCount = heatManagement.configuration.promotionCount || 6;

    // Build heat-position-round structure
    // For each heat/position, we may have different skippers in different rounds
    // Include letter scores in the count
    const maxPositionsByHeat = new Map<HeatDesignation, number>();

    completedRounds.forEach(round => {
      round.heatAssignments.forEach(assignment => {
        const heat = assignment.heatDesignation;
        // Count both position results and letter score results
        const resultsInHeat = round.results.filter(r => r.heatDesignation === heat);
        const heatSize = resultsInHeat.length;
        const currentMax = maxPositionsByHeat.get(heat) || 0;
        if (heatSize > currentMax) {
          maxPositionsByHeat.set(heat, heatSize);
        }
      });
    });

    return { completedRounds, heats, promotionCount, maxPositionsByHeat };
  }, [heatManagement]);

  const { completedRounds, heats, promotionCount, maxPositionsByHeat } = processedData;

  const getHeatColor = (heat: HeatDesignation) => {
    const colors = {
      'A': darkMode ? 'bg-slate-700/50' : 'bg-slate-100',
      'B': darkMode ? 'bg-slate-700/50' : 'bg-slate-100',
      'C': darkMode ? 'bg-slate-700/50' : 'bg-slate-100',
      'D': darkMode ? 'bg-slate-700/50' : 'bg-slate-100',
      'E': darkMode ? 'bg-slate-700/50' : 'bg-slate-100',
      'F': darkMode ? 'bg-slate-700/50' : 'bg-slate-100',
    };
    return colors[heat] || (darkMode ? 'bg-slate-700/50' : 'bg-slate-100');
  };

  const getHeatBorderColor = (heat: HeatDesignation) => {
    const colors = {
      'A': 'border-l-4 border-orange-500',
      'B': 'border-l-4 border-blue-500',
      'C': 'border-l-4 border-emerald-500',
      'D': 'border-l-4 border-purple-500',
      'E': 'border-l-4 border-pink-500',
      'F': 'border-l-4 border-cyan-500',
    };
    return colors[heat] || 'border-l-4 border-slate-500';
  };

  const isPromotionZone = (heat: HeatDesignation, position: number) => {
    const heatIndex = heats.indexOf(heat);
    return heatIndex > 0 && position <= promotionCount;
  };

  const isRelegationZone = (heat: HeatDesignation, position: number, maxPos: number) => {
    const heatIndex = heats.indexOf(heat);
    return heatIndex < heats.length - 1 && position > (maxPos - promotionCount);
  };

  // Export functions
  const exportAsJPG = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
        scale: 2
      });

      const link = document.createElement('a');
      link.download = `heat-race-results-${new Date().toISOString().split('T')[0]}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (error) {
      console.error('Error exporting as JPG:', error);
    }
  };

  const exportAsPDF = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
        scale: 2
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`heat-race-results-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exporting as PDF:', error);
    }
  };

  const exportAsCSV = () => {
    // Build CSV data
    const rows: string[][] = [];

    // Header row 1
    const header1 = ['Heat', 'Pos'];
    completedRounds.forEach(round => {
      header1.push(`Round ${round.round}`, '', '');
    });
    rows.push(header1);

    // Header row 2
    const header2 = ['', ''];
    completedRounds.forEach(() => {
      header2.push('Sail No', 'Skipper', 'Pts');
    });
    rows.push(header2);

    // Data rows
    heats.forEach(heat => {
      const maxPos = maxPositionsByHeat.get(heat) || 0;
      const positions = Array.from({ length: maxPos }, (_, i) => i + 1);

      positions.forEach((position, posIdx) => {
        const row: string[] = [];

        // Heat column (only on first row)
        if (posIdx === 0) {
          row.push(`Heat ${heat}`);
        } else {
          row.push('');
        }

        // Position column
        row.push(String(position));

        // Round data
        completedRounds.forEach(round => {
          const heatResults = round.results
            .filter(r => r.heatDesignation === heat)
            .sort((a, b) => {
              if (a.position === null && !a.letterScore) return 1;
              if (b.position === null && !b.letterScore) return -1;
              if (a.letterScore && !b.letterScore) return 1;
              if (!a.letterScore && b.letterScore) return -1;
              if (a.letterScore && b.letterScore) return 0;
              if (a.position === null) return 1;
              if (b.position === null) return -1;
              return a.position - b.position;
            });

          const result = heatResults[position - 1];
          const skipper = result ? skippers[result.skipperIndex] : null;

          // Calculate points
          const totalCompetitorsInRound = round.results.length;
          let points = '';
          if (result) {
            if (result.letterScore) {
              points = String(totalCompetitorsInRound + 1);
            } else if (result.position !== null) {
              if (round.round === 1) {
                points = String(result.position);
              } else {
                let overallPoints = 0;
                const heatsArray: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];
                const currentHeatIndex = heatsArray.indexOf(heat);

                for (let i = 0; i < currentHeatIndex; i++) {
                  const higherHeat = heatsArray[i];
                  const higherHeatResults = round.results.filter(
                    r => r.heatDesignation === higherHeat && r.position !== null
                  );
                  overallPoints += higherHeatResults.length;
                }

                overallPoints += position;
                points = String(overallPoints);
              }
            }
          }

          row.push(
            skipper?.sailNo || '',
            skipper?.name || '',
            points
          );
        });

        rows.push(row);
      });
    });

    // Convert to CSV string
    const csvContent = rows.map(row =>
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `heat-race-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-7xl max-h-[90vh] rounded-xl shadow-xl overflow-hidden flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Trophy className="text-emerald-500" size={28} />
            <div>
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                Heat Race Results
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Detailed heat performance by round • {completedRounds.length} round{completedRounds.length !== 1 ? 's' : ''} completed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Export Button */}
            <div className="relative export-menu-container">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}
                `}
              >
                <Download size={18} />
                Export
                <ChevronDown size={16} />
              </button>
              {showExportMenu && (
                <div className={`
                  absolute right-0 mt-2 w-40 rounded-lg shadow-lg overflow-hidden z-50
                  ${darkMode ? 'bg-slate-700' : 'bg-white'}
                `}>
                  <button
                    onClick={() => {
                      exportAsJPG();
                      setShowExportMenu(false);
                    }}
                    className={`
                      w-full px-4 py-2.5 text-left text-sm transition-colors
                      ${darkMode ? 'text-slate-200 hover:bg-slate-600' : 'text-slate-700 hover:bg-slate-50'}
                    `}
                  >
                    Export as JPG
                  </button>
                  <button
                    onClick={() => {
                      exportAsPDF();
                      setShowExportMenu(false);
                    }}
                    className={`
                      w-full px-4 py-2.5 text-left text-sm transition-colors border-t
                      ${darkMode ? 'text-slate-200 hover:bg-slate-600 border-slate-600' : 'text-slate-700 hover:bg-slate-50 border-slate-200'}
                    `}
                  >
                    Export as PDF
                  </button>
                  <button
                    onClick={() => {
                      exportAsCSV();
                      setShowExportMenu(false);
                    }}
                    className={`
                      w-full px-4 py-2.5 text-left text-sm transition-colors border-t
                      ${darkMode ? 'text-slate-200 hover:bg-slate-600 border-slate-600' : 'text-slate-700 hover:bg-slate-50 border-slate-200'}
                    `}
                  >
                    Export as CSV
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className={`
                rounded-full p-2 transition-colors
                ${darkMode
                  ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              `}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className={`px-6 py-3 border-b ${darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex flex-wrap gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded ${darkMode ? 'bg-emerald-500/20 border-2 border-emerald-500' : 'bg-emerald-50 border-2 border-emerald-400'}`} />
              <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>Promotion Zone (Top {promotionCount})</span>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-auto">
          {completedRounds.length === 0 ? (
            <div className={`text-center py-12 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <Trophy size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No completed races yet</p>
              <p className="text-sm mt-2">Start scoring heats to see race results</p>
            </div>
          ) : (
            <div ref={tableRef} className="overflow-x-auto relative">
              <table className="w-full border-collapse">
                <thead className={`sticky top-0 z-20 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                  <tr className={`border-b-2 ${darkMode ? 'border-slate-700' : 'border-slate-300'}`}>
                    <th className={`px-4 py-3 text-left text-sm font-bold sticky left-0 z-30 ${darkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'}`}>
                      Heat
                    </th>
                    <th className={`px-3 py-3 text-center text-sm font-bold sticky left-[80px] z-30 ${darkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-white'}`}>
                      Pos
                    </th>
                    {completedRounds.map(round => (
                      <th
                        key={round.round}
                        colSpan={3}
                        className={`px-4 py-3 text-center text-sm font-bold border-l-4 ${darkMode ? 'text-slate-300 border-slate-600' : 'text-slate-700 border-slate-400'}`}
                      >
                        Round {round.round}
                      </th>
                    ))}
                  </tr>
                  <tr className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <th className={`sticky left-0 z-30 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}></th>
                    <th className={`sticky left-[80px] z-30 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}></th>
                    {completedRounds.map(round => (
                      <React.Fragment key={round.round}>
                        <th className={`px-2 py-2 text-center text-xs font-medium border-l-4 ${darkMode ? 'text-slate-400 border-slate-600' : 'text-slate-600 border-slate-400'}`}>
                          Sail No
                        </th>
                        <th className={`px-2 py-2 text-center text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Skipper
                        </th>
                        <th className={`px-2 py-2 text-center text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Pts
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heats.map(heat => {
                    const maxPos = maxPositionsByHeat.get(heat) || 0;
                    const positions = Array.from({ length: maxPos }, (_, i) => i + 1);

                    const positionRows = positions.map((position, posIdx) => {
                      const isPromo = isPromotionZone(heat, position);
                      const isRelegate = isRelegationZone(heat, position, maxPos);

                      return (
                        <tr
                          key={`${heat}-${position}`}
                          className={`
                            border-b transition-colors
                            ${position % 2 === 0 ? (darkMode ? 'bg-slate-800/30' : 'bg-slate-50/50') : ''}
                            ${darkMode ? 'border-slate-700/50 hover:bg-slate-700/30' : 'border-slate-200 hover:bg-slate-50'}
                          `}
                        >
                          {/* Heat Label */}
                          {posIdx === 0 ? (
                            <td
                              rowSpan={positions.length}
                              className={`
                                px-4 py-3 text-center font-bold text-base align-top sticky left-0 z-20
                                ${getHeatColor(heat)} ${getHeatBorderColor(heat)}
                              `}
                            >
                              <div className="sticky top-20 pt-2">
                                <span className={darkMode ? 'text-slate-200' : 'text-slate-900'}>
                                  Heat {heat}
                                </span>
                              </div>
                            </td>
                          ) : null}

                          {/* Position */}
                          <td className={`
                            px-3 py-2 text-center font-semibold text-sm sticky left-[80px] z-20
                            ${position % 2 === 0 ? (darkMode ? 'bg-slate-800/30' : 'bg-slate-50/50') : (darkMode ? 'bg-slate-800' : 'bg-white')}
                            ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                          `}>
                            {position}
                          </td>

                          {/* Round Results */}
                          {completedRounds.map(round => {
                            // Find the result for this heat/position/round
                            const heatResults = round.results
                              .filter(r => r.heatDesignation === heat)
                              .sort((a, b) => {
                                // Sort by position, with letter scores at the end
                                if (a.position === null && !a.letterScore) return 1;
                                if (b.position === null && !b.letterScore) return -1;
                                if (a.letterScore && !b.letterScore) return 1;
                                if (!a.letterScore && b.letterScore) return -1;
                                if (a.letterScore && b.letterScore) return 0;
                                if (a.position === null) return 1;
                                if (b.position === null) return -1;
                                return a.position - b.position;
                              });

                            // Include letter scores in the position count
                            const result = heatResults[position - 1];
                            const skipper = result ? skippers[result.skipperIndex] : null;

                            // Check if skipper moved
                            let moved = false;
                            let promoted = false;
                            let relegated = false;

                            if (result) {
                              const nextRound = heatManagement.rounds.find(r => r.round === round.round + 1);
                              if (nextRound) {
                                const nextAssignment = nextRound.heatAssignments.find(
                                  a => a.skipperIndices.includes(result.skipperIndex)
                                );
                                if (nextAssignment && nextAssignment.heatDesignation !== heat) {
                                  moved = true;
                                  promoted = nextAssignment.heatDesignation < heat;
                                  relegated = nextAssignment.heatDesignation > heat;
                                }
                              }
                            }

                            // Only show promotion zone for rounds after the first (seeding) round
                            const showZones = round.round > 1;
                            const cellZoneClass = showZones && isPromo
                              ? (darkMode ? 'bg-emerald-500/10' : 'bg-emerald-50/50')
                              : '';

                            // Calculate points for this result
                            const totalCompetitorsInRound = round.results.length;
                            let points = '—';
                            if (result) {
                              if (result.letterScore) {
                                points = String(totalCompetitorsInRound + 1);
                              } else if (result.position !== null) {
                                // For rounds after seeding, calculate overall position
                                if (round.round === 1) {
                                  // Seeded round: use position within heat
                                  points = String(result.position);
                                } else {
                                  // Later rounds: calculate overall position based on heat hierarchy
                                  // Count all finishers from higher heats
                                  let overallPoints = 0;
                                  const heats: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E', 'F'];
                                  const currentHeatIndex = heats.indexOf(heat);

                                  for (let i = 0; i < currentHeatIndex; i++) {
                                    const higherHeat = heats[i];
                                    const higherHeatResults = round.results.filter(
                                      r => r.heatDesignation === higherHeat && r.position !== null
                                    );
                                    overallPoints += higherHeatResults.length;
                                  }

                                  overallPoints += position;
                                  points = String(overallPoints);
                                }
                              }
                            }

                            return (
                              <React.Fragment key={round.round}>
                                {/* Sail Number */}
                                <td className={`
                                  px-2 py-2 text-center text-xs border-l-4
                                  ${darkMode ? 'text-slate-400 border-slate-600' : 'text-slate-600 border-slate-400'}
                                  ${cellZoneClass}
                                `}>
                                  {skipper?.sailNo || '—'}
                                </td>

                                {/* Skipper Name */}
                                <td className={`
                                  px-2 py-2 text-sm
                                  ${darkMode ? 'text-slate-200' : 'text-slate-900'}
                                  ${cellZoneClass}
                                `}>
                                  {skipper ? (
                                    <div className="flex items-center gap-1.5">
                                      {skipper.avatarUrl ? (
                                        <img
                                          src={skipper.avatarUrl}
                                          alt={skipper.name}
                                          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                        />
                                      ) : (
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${
                                          darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                                        }`}>
                                          {skipper.name.split(' ').map(n => n[0]).join('')}
                                        </div>
                                      )}
                                      <span className="font-medium truncate">
                                        {skipper.name}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>—</span>
                                  )}
                                </td>

                                {/* Points */}
                                <td className={`
                                  px-2 py-2 text-center text-xs font-semibold
                                  ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                                  ${cellZoneClass}
                                `}>
                                  {points}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    });

                    // Add observer row for this heat
                    const observerRow = (
                      <tr key={`${heat}-observers`} className={`
                        border-b-4 ${darkMode ? 'border-slate-700' : 'border-slate-300'}
                        ${darkMode ? 'bg-purple-900/20' : 'bg-purple-50'}
                      `}>
                        {/* Empty cell for Heat column */}
                        <td className={`sticky left-0 z-20 ${darkMode ? 'bg-purple-900/20' : 'bg-purple-50'}`}></td>
                        {/* Observer label */}
                        <td colSpan={1} className={`
                          px-3 py-2 text-xs font-semibold sticky left-[80px] z-20
                          ${darkMode ? 'text-purple-300 bg-purple-900/20' : 'text-purple-700 bg-purple-50'}
                        `}>
                          <div className="flex items-center gap-1.5">
                            <Eye size={14} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
                            <span>Observers</span>
                          </div>
                        </td>
                        {/* Observer names for each round */}
                        {completedRounds.map(round => {
                          const key = `${heat}-${round.round}`;
                          const observers = observersByHeatRound.get(key) || [];

                          return (
                            <td
                              key={round.round}
                              colSpan={3}
                              className={`
                                px-3 py-2 text-xs border-l-4
                                ${darkMode ? 'text-slate-300 border-slate-600' : 'text-slate-700 border-slate-400'}
                              `}
                            >
                              {observers.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {observers.map((obs, idx) => (
                                    <div
                                      key={idx}
                                      className={`
                                        inline-flex items-center gap-1.5 px-2 py-1 rounded
                                        ${darkMode ? 'bg-purple-900/40 text-purple-200' : 'bg-purple-100 text-purple-800'}
                                      `}
                                    >
                                      <Eye size={12} />
                                      <span className="font-medium">{obs.skipper_name}</span>
                                      <span className={`text-[10px] ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                                        #{obs.skipper_sail_number}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className={`text-[10px] italic ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                  No observers recorded
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );

                    // Return all rows for this heat (positions + observers)
                    return [...positionRows, observerRow];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <button
            onClick={onClose}
            className={`
              w-full py-2.5 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}
            `}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

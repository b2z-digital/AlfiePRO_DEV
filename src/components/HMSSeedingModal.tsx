import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Users, RefreshCw, Hash, Trophy, Loader2 } from 'lucide-react';
import type { Skipper } from '../types';
import type { HeatDesignation } from '../types/heat';
import type { RaceEvent } from '../types/race';
import type { SkipperWithRanking } from '../utils/hmsSeeding';
import { assignSkippersUsingHMSSeeding, previewHMSSeeding, validateHMSSeeding } from '../utils/hmsSeeding';
import { getRankingsForMembers } from '../utils/rankingsStorage';
import { getCountryFlag, getIOCCode } from '../utils/countryFlags';

interface HeatAssignment {
  heatDesignation: HeatDesignation;
  skipperIndices: number[];
}

interface HMSSeedingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (assignments: HeatAssignment[], rankedSkipperIndices?: number[]) => void;
  skippers: Skipper[];
  numHeats: number;
  darkMode: boolean;
  currentEvent?: RaceEvent | null;
  nationalAssociationId?: string;
  yachtClassName?: string;
}

export const HMSSeedingModal: React.FC<HMSSeedingModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  skippers,
  numHeats,
  darkMode,
  currentEvent,
  nationalAssociationId,
  yachtClassName
}) => {
  const [loading, setLoading] = useState(false);
  const [skippersWithRankings, setSkippersWithRankings] = useState<SkipperWithRanking[]>([]);
  const [preview, setPreview] = useState<ReturnType<typeof previewHMSSeeding> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRankings();
    }
  }, [isOpen, skippers, nationalAssociationId, yachtClassName]);

  async function loadRankings() {
    console.log('HMS Seeding: Loading rankings', {
      nationalAssociationId,
      yachtClassName,
      skipperCount: skippers.length,
      firstSkipperSample: skippers[0]
    });

    if (!nationalAssociationId || !yachtClassName) {
      console.warn('HMS Seeding: Missing nationalAssociationId or yachtClassName');
      // No rankings available - just use skippers without rankings
      const skippersData: SkipperWithRanking[] = skippers.map((s, index) => ({
        ...s,
        rank: undefined,
        ranking: undefined,
        originalIndex: index  // Store the original index for later lookup
      }));
      setSkippersWithRankings(skippersData);
      generatePreview(skippersData);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get member IDs from skippers
      const memberIds = skippers
        .map(s => s.memberId)
        .filter(id => id) as string[];

      // Fetch rankings for these members
      const rankingsMap = await getRankingsForMembers(
        memberIds,
        nationalAssociationId,
        yachtClassName
      );

      console.log(`Found ${rankingsMap.size} rankings via memberId lookup`);

      // Always try fuzzy matching for skippers that don't have rankings yet
      console.log('Attempting fuzzy matching for unmatched skippers...');

      // Import required functions dynamically
      const { getRankingsByClass } = await import('../utils/rankingsStorage');

      // Get all rankings for this class
      const allRankings = await getRankingsByClass(nationalAssociationId, yachtClassName);

      console.log('Fuzzy matching data:', {
        skipperNames: skippers.map(s => s.name),
        rankingNames: allRankings.map(r => r.skipper_name),
        totalSkippers: skippers.length,
        totalRankings: allRankings.length
      });

      // Try to match skippers to rankings by name
      for (const skipper of skippers) {
        const key = skipper.memberId || skipper.name;

        // Skip if already matched via memberId
        if (rankingsMap.has(key)) {
          console.log(`⊙ Skipper "${skipper.name}" already matched via memberId`);
          continue;
        }

        const skipperFullName = skipper.name.toLowerCase().trim();

        // Find matching ranking by name
        const matchedRanking = allRankings.find(ranking => {
          const rankingName = ranking.skipper_name.toLowerCase().trim();

          // Try exact match first
          if (rankingName === skipperFullName) return true;

          // Try partial match (handles "Steve" vs "Stephen", etc.)
          const rankingParts = rankingName.split(' ');
          const skipperParts = skipperFullName.split(' ');

          // Check if both first and last names are similar
          if (rankingParts.length >= 2 && skipperParts.length >= 2) {
            const firstMatch = rankingParts[0].includes(skipperParts[0]) || skipperParts[0].includes(rankingParts[0]);
            const lastMatch = rankingParts[rankingParts.length - 1] === skipperParts[skipperParts.length - 1];

            if (firstMatch && lastMatch) return true;
          }

          return false;
        });

        if (matchedRanking) {
          console.log(`✓ Matched "${skipper.name}" to "${matchedRanking.skipper_name}" (rank #${matchedRanking.rank})`);
          rankingsMap.set(key, matchedRanking);
        } else {
          console.log(`✗ No match for "${skipper.name}"`);
        }
      }

      if (rankingsMap.size > 0) {
        console.log(`Total matched ${rankingsMap.size} skippers to rankings`);
      } else {
        console.warn('No fuzzy matches found. Sample data:', {
          firstSkipperName: skippers[0]?.name,
          firstRankingName: allRankings[0]?.skipper_name,
          totalSkippers: skippers.length,
          totalRankings: allRankings.length
        });
      }

      console.log('Final rankings map size:', rankingsMap.size);

      // Merge rankings with skippers AND add the original index
      const skippersData: SkipperWithRanking[] = skippers.map((skipper, index) => {
        const key = skipper.memberId || skipper.name;
        const ranking = rankingsMap.get(key);
        return {
          ...skipper,
          rank: ranking?.rank,
          ranking,
          originalIndex: index  // Store the original index for later lookup
        };
      });

      setSkippersWithRankings(skippersData);
      generatePreview(skippersData);
    } catch (err: any) {
      console.error('Error loading rankings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function generatePreview(skippersData: SkipperWithRanking[]) {
    try {
      const validation = validateHMSSeeding(skippersData, numHeats);

      if (!validation.valid) {
        setError(validation.errors.join(', '));
        return;
      }

      const previewResult = previewHMSSeeding(skippersData, numHeats);
      setPreview(previewResult);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleConfirm() {
    if (!preview) return;

    console.log('🟢 HMS Seeding - Starting conversion to heat assignments');
    console.log('Preview heats:', preview.heats.length);
    console.log('Total skippers in props:', skippers.length);

    // Convert HMS seeding format to HeatAssignment format
    const assignments: HeatAssignment[] = preview.heats.map((heat, heatIndex) => {
      const heatDesignation = String.fromCharCode(65 + heatIndex) as HeatDesignation; // A, B, C, etc.

      console.log(`\n🟢 Processing Heat ${heatDesignation}:`);
      console.log('  Skippers in heat:', heat.skippers.length);

      const skipperIndices = heat.skippers.map(heatSkipper => {
        // Use originalIndex if available, otherwise fall back to ID matching
        if (heatSkipper.originalIndex !== undefined) {
          console.log(`  - Using originalIndex for ${heatSkipper.name}: ${heatSkipper.originalIndex}`);
          return heatSkipper.originalIndex;
        }

        const foundIndex = skippers.findIndex(s => s.id === heatSkipper.id);
        console.log(`  - Searching for ${heatSkipper.name} (ID: ${heatSkipper.id}): found at index ${foundIndex}`);
        return foundIndex;
      }).filter(index => index !== -1 && index !== undefined);

      console.log(`  Final indices for Heat ${heatDesignation}:`, skipperIndices);

      return {
        heatDesignation,
        skipperIndices
      };
    });

    const rankedIndices = preview.heats.flatMap(heat =>
      heat.skippers
        .filter(s => s.rank)
        .map(s => s.originalIndex !== undefined ? s.originalIndex : skippers.findIndex(sk => sk.id === s.id))
        .filter(i => i !== -1)
    );

    console.log('\n🟢 Final assignments:', JSON.stringify(assignments, null, 2));
    console.log('🟢 Ranked skipper indices:', rankedIndices);
    onConfirm(assignments, rankedIndices);
    onClose();
  }

  if (!isOpen) return null;

  const validation = skippersWithRankings.length > 0
    ? validateHMSSeeding(skippersWithRankings, numHeats)
    : null;

  const rankedCount = preview?.summary.rankedSkippers ?? 0;
  const unrankedCount = preview?.summary.unrankedSkippers ?? 0;
  const totalCount = preview?.summary.totalSkippers ?? skippers.length;
  const rankedPercent = totalCount > 0 ? Math.round((rankedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden ${
        darkMode ? 'bg-slate-900 border border-slate-700/50' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-5 border-b ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-gray-50/50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                darkMode ? 'bg-blue-500/10' : 'bg-blue-50'
              }`}>
                <Trophy className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Ranking Allocation
                </h2>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Seed heats based on national rankings
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                darkMode
                  ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-5">
            {error && (
              <div className={`p-3.5 rounded-xl flex items-start gap-3 ${
                darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-100'
              }`}>
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />
                <div>
                  <p className={`text-sm font-medium ${darkMode ? 'text-red-300' : 'text-red-800'}`}>Error</p>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-red-400/80' : 'text-red-600'}`}>{error}</p>
                </div>
              </div>
            )}

            {validation && validation.warnings.length > 0 && (
              <div className={`p-3.5 rounded-xl flex items-start gap-3 ${
                darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-100'
              }`}>
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${darkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                <div>
                  <p className={`text-sm font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>Warnings</p>
                  <ul className={`text-xs mt-1 space-y-0.5 ${darkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>
                    {validation.warnings.map((warning, index) => (
                      <li key={index} className="flex items-start gap-1.5">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-16">
                <Loader2 className={`w-6 h-6 animate-spin mx-auto mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                  Loading rankings...
                </p>
              </div>
            ) : preview ? (
              <>
                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className={`p-4 rounded-xl ${
                    darkMode ? 'bg-slate-800/80 border border-slate-700/50' : 'bg-gray-50 border border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        Total
                      </span>
                      <Users className={`w-4 h-4 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                    </div>
                    <p className={`text-3xl font-bold tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {totalCount}
                    </p>
                  </div>

                  <div className={`p-4 rounded-xl ${
                    darkMode ? 'bg-slate-800/80 border border-slate-700/50' : 'bg-gray-50 border border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        Ranked
                      </span>
                      <CheckCircle className={`w-4 h-4 ${darkMode ? 'text-emerald-500/60' : 'text-emerald-400'}`} />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className={`text-3xl font-bold tabular-nums ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        {rankedCount}
                      </p>
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        {rankedPercent}%
                      </span>
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl ${
                    darkMode ? 'bg-slate-800/80 border border-slate-700/50' : 'bg-gray-50 border border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        Unranked
                      </span>
                      {unrankedCount > 0 ? (
                        <AlertTriangle className={`w-4 h-4 ${darkMode ? 'text-amber-500/60' : 'text-amber-400'}`} />
                      ) : (
                        <CheckCircle className={`w-4 h-4 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                      )}
                    </div>
                    <p className={`text-3xl font-bold tabular-nums ${
                      unrankedCount > 0
                        ? darkMode ? 'text-amber-400' : 'text-amber-600'
                        : darkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {unrankedCount}
                    </p>
                  </div>
                </div>

                {/* Heat Preview */}
                <div className="space-y-3">
                  {preview.heats.map((heat, index) => (
                    <div
                      key={heat.heatName}
                      className={`rounded-xl overflow-hidden ${
                        darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-gray-100 shadow-sm'
                      }`}
                    >
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        darkMode ? 'bg-slate-800' : 'bg-gray-50'
                      }`}>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                            darkMode ? 'bg-slate-700 text-white' : 'bg-white text-gray-700 shadow-sm border border-gray-200'
                          }`}>
                            {heat.heatName}
                          </div>
                          <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            Heat {heat.heatName}
                          </span>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                          darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {heat.skippers.length} skippers
                        </span>
                      </div>

                      <div className="divide-y divide-slate-800/50">
                        {heat.skippers.map((skipper, skipperIndex) => (
                          <div
                            key={skipperIndex}
                            className={`flex items-center justify-between px-4 py-2.5 transition-colors ${
                              darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {skipper.rank ? (
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                                  darkMode ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                }`}>
                                  {skipper.rank}
                                </div>
                              ) : (
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                                  darkMode ? 'bg-slate-700/50 text-slate-500' : 'bg-gray-100 text-gray-400'
                                }`}>
                                  -
                                </div>
                              )}

                              <div>
                                <p className={`text-sm font-medium leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                  {skipper.name}
                                </p>
                                <p className={`text-xs leading-tight ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                                  Sail #{skipper.sailNumber}
                                </p>
                              </div>
                            </div>

                            {skipper.rank && (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                                darkMode
                                  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              }`}>
                                #{skipper.rank}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-gray-50/50'
        }`}>
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors ${
              darkMode
                ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={!preview || loading || (validation && !validation.valid)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              darkMode
                ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
            }`}
          >
            Apply Rankings
          </button>
        </div>
      </div>
    </div>
  );
};

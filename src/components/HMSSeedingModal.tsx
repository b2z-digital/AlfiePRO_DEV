import React, { useState, useEffect } from 'react';
import { X, Award, AlertTriangle, CheckCircle, Users, RefreshCw } from 'lucide-react';
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
  onConfirm: (assignments: HeatAssignment[]) => void;
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
    if (!nationalAssociationId || !yachtClassName) {
      // No rankings available - just use skippers without rankings
      const skippersData: SkipperWithRanking[] = skippers.map(s => ({
        ...s,
        rank: undefined,
        ranking: undefined
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

      // Merge rankings with skippers
      const skippersData: SkipperWithRanking[] = skippers.map(skipper => {
        const ranking = skipper.memberId ? rankingsMap.get(skipper.memberId) : undefined;
        return {
          ...skipper,
          rank: ranking?.rank,
          ranking
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

    // Convert HMS seeding format to HeatAssignment format
    const assignments: HeatAssignment[] = preview.heats.map((heat, heatIndex) => {
      const heatDesignation = String.fromCharCode(65 + heatIndex) as HeatDesignation; // A, B, C, etc.

      const skipperIndices = heat.skippers.map(heatSkipper => {
        return skippers.findIndex(s => s.id === heatSkipper.id);
      }).filter(index => index !== -1);

      return {
        heatDesignation,
        skipperIndices
      };
    });

    onConfirm(assignments);
    onClose();
  }

  if (!isOpen) return null;

  const validation = skippersWithRankings.length > 0
    ? validateHMSSeeding(skippersWithRankings, numHeats)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className={`relative w-full max-w-6xl max-h-[90vh] rounded-lg shadow-xl overflow-hidden ${
        darkMode ? 'bg-slate-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Award className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                HMS Seeding Assignment
              </h2>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Assign skippers based on national rankings
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-700 text-gray-400 hover:text-white'
                : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {validation && validation.warnings.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">Warnings</p>
                  <ul className="text-sm text-yellow-700 mt-1 list-disc list-inside">
                    {validation.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
              <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                Loading rankings...
              </p>
            </div>
          ) : preview ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Total Skippers
                      </p>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {preview.summary.totalSkippers}
                      </p>
                    </div>
                    <Users className={`w-8 h-8 ${darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Ranked Skippers
                      </p>
                      <p className={`text-2xl font-bold text-green-600`}>
                        {preview.summary.rankedSkippers}
                      </p>
                    </div>
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Unranked Skippers
                      </p>
                      <p className={`text-2xl font-bold ${preview.summary.unrankedSkippers > 0 ? 'text-yellow-600' : darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {preview.summary.unrankedSkippers}
                      </p>
                    </div>
                    <AlertTriangle className={`w-8 h-8 ${preview.summary.unrankedSkippers > 0 ? 'text-yellow-600' : darkMode ? 'text-slate-600' : 'text-gray-300'}`} />
                  </div>
                </div>
              </div>

              {/* Heat Preview */}
              <div className="space-y-4">
                {preview.heats.map((heat, index) => (
                  <div
                    key={heat.heatName}
                    className={`p-4 rounded-lg border ${
                      darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Heat {heat.heatName}
                      </h3>
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {heat.skippers.length} skippers
                      </span>
                    </div>

                    <div className="space-y-2">
                      {heat.skippers.map((skipper, skipperIndex) => (
                        <div
                          key={skipperIndex}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            darkMode ? 'bg-slate-800' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {skipper.rank ? (
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-sm">
                                {skipper.rank}
                              </div>
                            ) : (
                              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                                darkMode ? 'bg-slate-600 text-gray-400' : 'bg-gray-200 text-gray-500'
                              }`}>
                                -
                              </div>
                            )}

                            <div>
                              <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {skipper.name}
                              </p>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                Sail #{skipper.sailNumber}
                              </p>
                            </div>
                          </div>

                          {skipper.rank && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Ranked #{skipper.rank}
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

        {/* Footer */}
        <div className={`flex items-center justify-between p-6 border-t ${
          darkMode ? 'border-slate-700' : 'border-gray-200'
        }`}>
          <button
            onClick={onClose}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'bg-slate-700 text-white hover:bg-slate-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={!preview || loading || (validation && !validation.valid)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            Apply HMS Seeding
          </button>
        </div>
      </div>
    </div>
  );
};

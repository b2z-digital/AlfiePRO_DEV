import React from 'react';
import { CircleCheck as CheckCircle, Users, Trophy, ArrowRight, ArrowLeft, Layers } from 'lucide-react';
import { ParsedHMSData } from '../../types/hmsValidator';

interface HMSDataPreviewProps {
  data: ParsedHMSData;
  onConfirm: () => void;
  onBack: () => void;
}

export const HMSDataPreview: React.FC<HMSDataPreviewProps> = ({ data, onConfirm, onBack }) => {
  const raceHeatBreakdown = data.hasHeats ? (() => {
    const breakdown: { raceNumber: number; heats: string[] }[] = [];
    for (let r = 1; r <= data.numRaces; r++) {
      const heatsForRace = [...new Set(
        data.results.filter(res => res.raceNumber === r && res.heat).map(res => res.heat!)
      )].sort();
      breakdown.push({ raceNumber: r, heats: heatsForRace });
    }
    return breakdown;
  })() : null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Preview Imported Data</h2>
        <p className="text-slate-300">
          Review the detected skippers and race results before proceeding
        </p>
      </div>

      {/* Summary Cards */}
      <div className={`grid grid-cols-1 ${data.hasHeats ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 rounded-lg p-6 border border-blue-500/50">
          <div className="flex items-center gap-3 mb-2">
            <Users size={24} className="text-blue-400" />
            <h3 className="font-semibold text-blue-300">Skippers</h3>
          </div>
          <p className="text-3xl font-bold text-blue-400">{data.skippers.length}</p>
          <p className="text-sm text-blue-300 mt-1">Detected competitors</p>
        </div>

        <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 rounded-lg p-6 border border-green-500/50">
          <div className="flex items-center gap-3 mb-2">
            <Trophy size={24} className="text-green-400" />
            <h3 className="font-semibold text-green-300">Races</h3>
          </div>
          <p className="text-3xl font-bold text-green-400">{data.numRaces}</p>
          <p className="text-sm text-green-300 mt-1">
            {data.hasHeats ? 'Heat-based scoring' : 'Single fleet'}
          </p>
        </div>

        {data.hasHeats && (
          <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/30 rounded-lg p-6 border border-amber-500/50">
            <div className="flex items-center gap-3 mb-2">
              <Layers size={24} className="text-amber-400" />
              <h3 className="font-semibold text-amber-300">Heats</h3>
            </div>
            <p className="text-3xl font-bold text-amber-400">{data.heats?.length || 0}</p>
            <p className="text-sm text-amber-300 mt-1">
              {data.heats?.join(', ')}
            </p>
          </div>
        )}

        <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/30 rounded-lg p-6 border border-cyan-500/50">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle size={24} className="text-cyan-400" />
            <h3 className="font-semibold text-cyan-300">Results</h3>
          </div>
          <p className="text-3xl font-bold text-cyan-400">{data.results.length}</p>
          <p className="text-sm text-cyan-300 mt-1">Individual race results</p>
        </div>
      </div>

      {/* Heat Breakdown */}
      {raceHeatBreakdown && raceHeatBreakdown.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
          <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700/50">
            <h3 className="font-semibold text-white">Race / Heat Structure</h3>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {raceHeatBreakdown.map(({ raceNumber, heats }) => (
              <div key={raceNumber} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <p className="text-sm font-medium text-white mb-1">Race {raceNumber}</p>
                <div className="flex flex-wrap gap-1">
                  {heats.map(heat => {
                    const count = data.results.filter(r => r.raceNumber === raceNumber && r.heat === heat).length;
                    return (
                      <span key={heat} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded text-xs font-medium">
                        Heat {heat} <span className="text-amber-500/70">({count})</span>
                      </span>
                    );
                  })}
                  {heats.length === 0 && (
                    <span className="text-xs text-slate-500">No heat data</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skippers Table Preview */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700/50">
          <h3 className="font-semibold text-white">Skippers (First 10)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Pos</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Sail #</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Club</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Total Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data.skippers.slice(0, 10).map((skipper, index) => (
                <tr key={index} className="hover:bg-slate-800/30">
                  <td className="px-6 py-3 text-sm text-white">{skipper.position}</td>
                  <td className="px-6 py-3 text-sm font-medium text-white">{skipper.sailNumber}</td>
                  <td className="px-6 py-3 text-sm text-slate-300">{skipper.name}</td>
                  <td className="px-6 py-3 text-sm text-slate-400">{skipper.club || '-'}</td>
                  <td className="px-6 py-3 text-sm text-white">{skipper.totalScore?.toFixed(1) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.skippers.length > 10 && (
          <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-700/50 text-sm text-slate-400">
            ... and {data.skippers.length - 10} more skippers
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors font-medium flex items-center gap-2"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
        >
          Continue to Validation
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

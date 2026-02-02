import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { ParsedHMSData } from '../../types/hmsValidator';

interface HMSFieldMapperProps {
  data: ParsedHMSData;
  onComplete: () => void;
  onBack: () => void;
}

export const HMSFieldMapper: React.FC<HMSFieldMapperProps> = ({ data, onComplete, onBack }) => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Field Mapping</h2>
        <p className="text-slate-300">
          All fields have been automatically detected and mapped
        </p>
      </div>

      {/* Auto-mapped confirmation */}
      <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <CheckCircle size={24} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-green-300 mb-2">Auto-Detection Complete</h3>
            <div className="space-y-1 text-sm text-green-300">
              <p>✓ Skipper names detected</p>
              <p>✓ Sail numbers identified</p>
              <p>✓ Race results extracted</p>
              <p>✓ Letter scores (DNF, DNS, etc.) recognized</p>
              {data.hasHeats && <p>✓ Heat structure detected ({data.heats?.join(', ')})</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Mapping Summary */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700/50">
          <h3 className="font-semibold text-white">Field Mappings</h3>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-300">Skipper Name</span>
            <span className="flex items-center gap-2 text-green-400 font-medium">
              <CheckCircle size={16} />
              Mapped
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-300">Sail Number</span>
            <span className="flex items-center gap-2 text-green-400 font-medium">
              <CheckCircle size={16} />
              Mapped
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-300">Club/Organization</span>
            <span className="flex items-center gap-2 text-green-400 font-medium">
              <CheckCircle size={16} />
              Mapped
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-300">Race Results</span>
            <span className="flex items-center gap-2 text-green-400 font-medium">
              <CheckCircle size={16} />
              {data.numRaces} races detected
            </span>
          </div>
        </div>
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
          onClick={onComplete}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
        >
          Run Validation
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

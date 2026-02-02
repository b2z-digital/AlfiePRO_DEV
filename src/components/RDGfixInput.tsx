import React, { useState, useEffect, useRef } from 'react';
import { Flag, FileText } from 'lucide-react';
import { LetterScoreSelector, LetterScore } from './LetterScoreSelector';

interface RDGfixInputProps {
  onSubmit: (score: number) => void;
  onCancel: () => void;
  numCompetitors: number;
  darkMode: boolean;
}

export const RDGfixInput: React.FC<RDGfixInputProps> = ({
  onSubmit,
  onCancel,
  numCompetitors,
  darkMode
}) => {
  const [score, setScore] = useState<string>('');

  const handleSubmit = () => {
    const value = parseInt(score);
    if (!isNaN(value) && value >= 1 && value <= numCompetitors) {
      onSubmit(value);
    }
  };

  return (
    <div className={`
      absolute z-50 mt-1 p-4 rounded-lg shadow-lg border
      ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
    `}>
      <div className={`text-sm mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
        Enter redress score (1-{numCompetitors})
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          onFocus={(e) => e.target.select()}
          min={1}
          max={numCompetitors}
          className={`
            w-20 px-2 py-1 rounded border text-center
            ${darkMode
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
          autoFocus
        />
        <button
          onClick={handleSubmit}
          disabled={!score}
          className={`
            px-3 py-1 rounded text-sm font-medium
            ${score 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-slate-400 text-white cursor-not-allowed'}
          `}
        >
          OK
        </button>
        <button
          onClick={onCancel}
          className={`
            px-3 py-1 rounded text-sm font-medium
            ${darkMode 
              ? 'text-slate-300 hover:text-slate-100' 
              : 'text-slate-600 hover:text-slate-800'}
          `}
        >
          Cancel
        </button>
      </div>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => setShowLetterScoreSelector(true)}
          className={`p-3 rounded-lg transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'}`}
          title="Letter scores (DNF, DNS, etc.)"
        >
          <FileText size={20} className={darkMode ? 'text-slate-300' : 'text-slate-600'} />
        </button>
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { Timer, ChevronDown, Play, Square } from 'lucide-react';
import type { StartSequence } from '../../types/startBox';
import { getSequences } from '../../utils/startBoxStorage';
import { getStartBoxEngine } from '../../utils/startBoxAudio';

interface StartBoxSequenceSelectorProps {
  darkMode: boolean;
  clubId: string | null;
  value: string | null;
  onChange: (sequenceId: string | null) => void;
}

export const StartBoxSequenceSelector: React.FC<StartBoxSequenceSelectorProps> = ({
  darkMode,
  clubId,
  value,
  onChange,
}) => {
  const [sequences, setSequences] = useState<StartSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    loadSequences();
  }, [clubId]);

  const loadSequences = async () => {
    setLoading(true);
    const data = await getSequences(clubId);
    setSequences(data);
    setLoading(false);
  };

  const handlePreview = async () => {
    if (previewing) {
      const engine = getStartBoxEngine();
      engine.stop();
      setPreviewing(false);
      return;
    }

    if (!value) return;
    const seq = sequences.find(s => s.id === value);
    if (!seq) return;

    const engine = getStartBoxEngine();
    await engine.initialize();
    await engine.preloadSequence(seq);
    engine.arm(seq);
    engine.start();
    setPreviewing(true);

    const unsub = engine.onStateChange((state) => {
      if (state === 'completed' || state === 'idle') {
        setPreviewing(false);
        unsub();
      }
    });
  };

  const grouped = {
    standard: sequences.filter(s => s.sequence_type === 'standard'),
    handicap: sequences.filter(s => s.sequence_type === 'handicap'),
    botw: sequences.filter(s => s.sequence_type === 'botw'),
    special: sequences.filter(s => s.sequence_type === 'special'),
  };

  const inputClass = `w-full px-3 py-2 rounded-lg text-sm border ${
    darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
  }`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Timer size={18} className="text-green-400" />
        <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Start System
        </h4>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value || null)}
          disabled={loading}
          className={inputClass}
        >
          <option value="">No Start Sequence</option>
          {grouped.standard.length > 0 && (
            <optgroup label="Standard">
              {grouped.standard.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({Math.floor(s.total_duration_seconds / 60)}:{(s.total_duration_seconds % 60).toString().padStart(2, '0')})
                </option>
              ))}
            </optgroup>
          )}
          {grouped.handicap.length > 0 && (
            <optgroup label="Handicap">
              {grouped.handicap.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({Math.floor(s.total_duration_seconds / 60)}:{(s.total_duration_seconds % 60).toString().padStart(2, '0')})
                </option>
              ))}
            </optgroup>
          )}
          {grouped.botw.length > 0 && (
            <optgroup label="BOTW">
              {grouped.botw.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({Math.floor(s.total_duration_seconds / 60)}:{(s.total_duration_seconds % 60).toString().padStart(2, '0')})
                </option>
              ))}
            </optgroup>
          )}
          {grouped.special.length > 0 && (
            <optgroup label="Special">
              {grouped.special.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({Math.floor(s.total_duration_seconds / 60)}:{(s.total_duration_seconds % 60).toString().padStart(2, '0')})
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {value && (
          <button
            onClick={handlePreview}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors ${
              previewing
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {previewing ? <Square size={14} /> : <Play size={14} />}
            {previewing ? 'Stop' : 'Test'}
          </button>
        )}
      </div>

      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
        Select a start sequence to enable the digital StartBox in Touch Mode scoring.
        Configure custom sequences in Settings &gt; Start System.
      </p>
    </div>
  );
};

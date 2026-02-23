import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Timer, Volume2, VolumeX, Settings } from 'lucide-react';
import type { StartSequence, StartBoxState } from '../../types/startBox';
import type { TimerTickData } from '../../utils/startBoxAudio';
import { getStartBoxEngine, destroyStartBoxEngine } from '../../utils/startBoxAudio';
import { getSequence, getSequences } from '../../utils/startBoxStorage';
import { StartBoxCountdown } from './StartBoxCountdown';
import { StartBoxControls } from './StartBoxControls';

interface StartBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSequenceComplete: () => void;
  sequenceId?: string | null;
  clubId?: string | null;
  darkMode?: boolean;
}

const WHISTLE_SOUND_ID = 'a0000001-0000-0000-0000-000000000003';
const BELL_SOUND_ID = 'a0000001-0000-0000-0000-000000000004';

export const StartBoxModal: React.FC<StartBoxModalProps> = ({
  isOpen,
  onClose,
  onSequenceComplete,
  sequenceId,
  clubId,
  darkMode = true,
}) => {
  const [currentSequence, setCurrentSequence] = useState<StartSequence | null>(null);
  const [availableSequences, setAvailableSequences] = useState<StartSequence[]>([]);
  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(sequenceId || null);
  const [timerState, setTimerState] = useState<StartBoxState>('idle');
  const [remainingMs, setRemainingMs] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('startbox-volume');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [lastFiredLabel, setLastFiredLabel] = useState<string | null>(null);
  const [showSequenceSelector, setShowSequenceSelector] = useState(false);
  const [autoCloseTimer, setAutoCloseTimer] = useState<number | null>(null);
  const [botwSequences, setBotwSequences] = useState<StartSequence[]>([]);

  const engineRef = useRef(getStartBoxEngine());
  const cleanupRef = useRef<(() => void)[]>([]);
  const completedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      completedRef.current = false;
      loadSequences();
    }
  }, [isOpen, clubId]);

  useEffect(() => {
    const id = selectedSeqId || sequenceId;
    if (id && isOpen) loadSequence(id);
  }, [selectedSeqId, sequenceId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const engine = engineRef.current;
    engine.setVolume(volume);

    const unsub1 = engine.onStateChange((state) => {
      setTimerState(state);
      if (state === 'completed' && !completedRef.current) {
        completedRef.current = true;
        const timer = window.setTimeout(() => {
          onSequenceComplete();
          onClose();
        }, 2000);
        setAutoCloseTimer(timer);
      }
    });

    const unsub2 = engine.onTick((data: TimerTickData) => {
      setRemainingMs(data.remainingMs);
      setTotalDuration(data.totalDurationSeconds);
      setTimerState(data.state);
    });

    const unsub3 = engine.onSoundFired((ss) => {
      if (ss.label) {
        setLastFiredLabel(ss.label);
        setTimeout(() => setLastFiredLabel(null), 2000);
      }
    });

    cleanupRef.current = [unsub1, unsub2, unsub3];

    return () => {
      cleanupRef.current.forEach(fn => fn());
    };
  }, [isOpen, volume, onSequenceComplete, onClose]);

  useEffect(() => {
    return () => {
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
    };
  }, [autoCloseTimer]);

  useEffect(() => {
    return () => {
      destroyStartBoxEngine();
    };
  }, []);

  const loadSequences = async () => {
    const seqs = await getSequences(clubId || null);
    setAvailableSequences(seqs);
    setBotwSequences(seqs.filter(s => s.sequence_type === 'botw'));
  };

  const loadSequence = async (id: string) => {
    const seq = await getSequence(id);
    if (seq) {
      setCurrentSequence(seq);
      setTotalDuration(seq.total_duration_seconds);
      setRemainingMs(seq.total_duration_seconds * 1000);
      const engine = engineRef.current;
      await engine.initialize();
      engine.arm(seq);
    }
  };

  const handleStart = useCallback(async () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    completedRef.current = false;
    const engine = engineRef.current;
    await engine.initialize();
    if (currentSequence && engine.getState() === 'idle') {
      engine.arm(currentSequence);
    }
    engine.start();
  }, [currentSequence, autoCloseTimer]);

  const handleStop = useCallback(() => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    engineRef.current.stop();
  }, [autoCloseTimer]);

  const handlePause = useCallback(() => engineRef.current.pause(), []);
  const handleResume = useCallback(() => engineRef.current.resume(), []);

  const handleReset = useCallback(() => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    completedRef.current = false;
    if (currentSequence) {
      engineRef.current.arm(currentSequence);
    } else {
      engineRef.current.reset();
    }
  }, [currentSequence, autoCloseTimer]);

  const handleWhistle = useCallback(async () => {
    const engine = engineRef.current;
    await engine.initialize();
    const whistleSound = currentSequence?.sounds?.find(s => s.sound_id === WHISTLE_SOUND_ID)?.sound;
    if (whistleSound?.file_url) {
      engine.playSound(whistleSound.file_url);
    } else {
      engine.playSynthBeep(1200, 300);
    }
  }, [currentSequence]);

  const handleBell = useCallback(async () => {
    const engine = engineRef.current;
    await engine.initialize();
    const bellSound = currentSequence?.sounds?.find(s => s.sound_id === BELL_SOUND_ID)?.sound;
    if (bellSound?.file_url) {
      engine.playSound(bellSound.file_url);
    } else {
      engine.playSynthBeep(660, 500);
    }
  }, [currentSequence]);

  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol);
    engineRef.current.setVolume(vol);
    localStorage.setItem('startbox-volume', vol.toString());
  }, []);

  const handlePlayBotw = useCallback(async (seqId: string) => {
    const seq = await getSequence(seqId);
    if (!seq) return;
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    completedRef.current = false;
    setCurrentSequence(seq);
    setSelectedSeqId(seqId);
    setTotalDuration(seq.total_duration_seconds);
    setRemainingMs(seq.total_duration_seconds * 1000);
    const engine = engineRef.current;
    await engine.initialize();
    engine.arm(seq);
    engine.start();
  }, [autoCloseTimer]);

  const handleSelectSequence = (id: string) => {
    setSelectedSeqId(id);
    setShowSequenceSelector(false);
  };

  const handleCloseModal = () => {
    if (timerState === 'running') return;
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    onClose();
  };

  if (!isOpen) return null;

  const stateColor =
    timerState === 'running' ? 'bg-green-500' :
    timerState === 'paused' ? 'bg-amber-500' :
    timerState === 'armed' ? 'bg-cyan-500' :
    timerState === 'completed' ? 'bg-red-500' :
    'bg-slate-600';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleCloseModal}
      />

      <div className={`relative w-full max-w-2xl mx-4 rounded-2xl border shadow-2xl overflow-hidden ${
        darkMode ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'
      }`}>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${
          darkMode ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${stateColor} ${timerState === 'running' ? 'animate-pulse' : ''}`} />
            <Timer size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
            <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Digital StartBox
            </span>
            {lastFiredLabel && (
              <span className="text-xs text-amber-400 animate-pulse font-medium bg-amber-500/10 px-2 py-0.5 rounded-full">
                {lastFiredLabel}
              </span>
            )}
          </div>
          <button
            onClick={handleCloseModal}
            disabled={timerState === 'running'}
            className={`p-1.5 rounded-lg transition-colors ${
              timerState === 'running'
                ? 'opacity-30 cursor-not-allowed'
                : darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <StartBoxCountdown
            remainingMs={remainingMs}
            totalDurationSeconds={totalDuration}
            state={timerState}
          />

          <StartBoxControls
            state={timerState}
            volume={volume}
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
            onReset={handleReset}
            onWhistle={handleWhistle}
            onBell={handleBell}
            onVolumeChange={handleVolumeChange}
            botwSequences={botwSequences}
            onPlayBotw={handlePlayBotw}
          />

          <div className={`flex items-center gap-3 pt-2 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <div className="relative flex-1">
              <button
                onClick={() => setShowSequenceSelector(!showSequenceSelector)}
                disabled={timerState === 'running'}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50'
                    : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 disabled:opacity-50'
                }`}
              >
                <span className="truncate">{currentSequence?.name || 'Select Sequence...'}</span>
                <Settings size={14} className="flex-shrink-0" />
              </button>

              {showSequenceSelector && (
                <div className={`absolute bottom-full left-0 right-0 mb-1 z-50 rounded-lg border shadow-xl max-h-60 overflow-y-auto ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  {availableSequences.map(seq => (
                    <button
                      key={seq.id}
                      onClick={() => handleSelectSequence(seq.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        seq.id === selectedSeqId
                          ? darkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                          : darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-medium">{seq.name}</div>
                      <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {Math.floor(seq.total_duration_seconds / 60)}:{(seq.total_duration_seconds % 60).toString().padStart(2, '0')} - {seq.sequence_type}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {currentSequence?.sounds && currentSequence.sounds.length > 0 && (
              <div className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {currentSequence.sounds.length} events
              </div>
            )}
          </div>

          {timerState === 'completed' && (
            <div className={`text-center py-2 rounded-lg text-sm font-medium animate-pulse ${
              darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'
            }`}>
              Race started - closing automatically...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

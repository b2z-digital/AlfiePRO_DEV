import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Timer, Settings, Music } from 'lucide-react';
import type { StartSequence, StartBoxState } from '../../types/startBox';
import type { TimerTickData } from '../../utils/startBoxAudio';
import { getStartBoxEngine, destroyStartBoxEngine } from '../../utils/startBoxAudio';
import { getSequence, getSequences } from '../../utils/startBoxStorage';
import { StartBoxCountdown } from './StartBoxCountdown';
import { StartBoxControls } from './StartBoxControls';

interface StartBoxPanelProps {
  sequenceId?: string | null;
  clubId?: string | null;
  darkMode?: boolean;
}

const WHISTLE_SOUND_ID = 'a0000001-0000-0000-0000-000000000003';
const BELL_SOUND_ID = 'a0000001-0000-0000-0000-000000000004';

export const StartBoxPanel: React.FC<StartBoxPanelProps> = ({
  sequenceId,
  clubId,
  darkMode = true,
}) => {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('startbox-collapsed');
    return saved === 'true';
  });
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
  const [botwSequences, setBotwSequences] = useState<StartSequence[]>([]);
  const [botwPhase, setBotwPhase] = useState(false);

  const engineRef = useRef(getStartBoxEngine());
  const cleanupRef = useRef<(() => void)[]>([]);
  const botwPhaseRef = useRef(false);
  const startSequenceRef = useRef<StartSequence | null>(null);

  useEffect(() => {
    loadSequences();
  }, [clubId]);

  useEffect(() => {
    const id = selectedSeqId || sequenceId;
    if (id) loadSequence(id);
  }, [selectedSeqId, sequenceId]);

  useEffect(() => {
    const engine = engineRef.current;
    engine.setVolume(volume);

    const unsub1 = engine.onStateChange((state) => {
      setTimerState(state);
      if (state === 'completed' && botwPhaseRef.current && startSequenceRef.current) {
        botwPhaseRef.current = false;
        setBotwPhase(false);
        const seq = startSequenceRef.current;
        setCurrentSequence(seq);
        setTotalDuration(seq.total_duration_seconds);
        setRemainingMs(seq.total_duration_seconds * 1000);
        (async () => {
          await engine.initialize();
          engine.arm(seq);
          engine.start();
        })();
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
  }, [volume]);

  useEffect(() => {
    return () => {
      destroyStartBoxEngine();
    };
  }, []);

  const loadSequences = async () => {
    const seqs = await getSequences(clubId || null);
    setAvailableSequences(seqs.filter(s => s.sequence_type !== 'botw'));
    setBotwSequences(seqs.filter(s => s.sequence_type === 'botw'));
  };

  const loadSequence = async (id: string) => {
    const seq = await getSequence(id);
    if (seq) {
      setCurrentSequence(seq);
      const effectiveDuration = seq.use_audio_only && seq.countdown_start_seconds
        ? seq.countdown_start_seconds
        : seq.total_duration_seconds;
      setTotalDuration(effectiveDuration);
      setRemainingMs(effectiveDuration * 1000);

      const engine = engineRef.current;
      await engine.initialize();
      engine.arm(seq);
    }
  };

  const handleStart = useCallback(async () => {
    const engine = engineRef.current;
    await engine.initialize();
    if (currentSequence && engine.getState() === 'idle') {
      engine.arm(currentSequence);
    }
    engine.start();
  }, [currentSequence]);

  const handleStop = useCallback(() => engineRef.current.stop(), []);
  const handlePause = useCallback(() => engineRef.current.pause(), []);
  const handleResume = useCallback(() => engineRef.current.resume(), []);
  const handleReset = useCallback(() => {
    if (currentSequence) {
      engineRef.current.arm(currentSequence);
    } else {
      engineRef.current.reset();
    }
  }, [currentSequence]);

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

    startSequenceRef.current = currentSequence;
    botwPhaseRef.current = true;
    setBotwPhase(true);

    setCurrentSequence(seq);
    setTotalDuration(seq.total_duration_seconds);
    setRemainingMs(seq.total_duration_seconds * 1000);
    const engine = engineRef.current;
    await engine.initialize();
    engine.arm(seq);
  }, [currentSequence]);

  const handleSelectSequence = (id: string) => {
    setSelectedSeqId(id);
    setShowSequenceSelector(false);
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('startbox-collapsed', next.toString());
  };

  const stateIndicatorColor =
    timerState === 'running' ? 'bg-green-500' :
    timerState === 'paused' ? 'bg-amber-500' :
    timerState === 'armed' ? 'bg-cyan-500' :
    timerState === 'completed' ? 'bg-red-500' :
    'bg-slate-600';

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
      darkMode ? 'bg-slate-900/95 border-slate-700/50' : 'bg-white border-slate-200'
    }`}>
      <button
        onClick={toggleCollapsed}
        className={`w-full flex items-center justify-between px-4 py-2 transition-colors ${
          darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stateIndicatorColor} ${timerState === 'running' ? 'animate-pulse' : ''}`} />
            <Timer size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
            <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              StartBox
            </span>
          </div>
          {currentSequence && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
            }`}>
              {currentSequence.name}
            </span>
          )}
          {collapsed && timerState !== 'idle' && (
            <StartBoxCountdown
              remainingMs={remainingMs}
              totalDurationSeconds={totalDuration}
              state={timerState}
              compact
            />
          )}
          {lastFiredLabel && (
            <span className="text-xs text-amber-400 animate-pulse font-medium">
              {lastFiredLabel}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronUp size={16} className="text-slate-500" />}
      </button>

      {!collapsed && (
        <div className={`px-4 pb-4 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 mt-3">
            <div>
              <StartBoxCountdown
                remainingMs={remainingMs}
                totalDurationSeconds={totalDuration}
                state={timerState}
              />

              <div className="mt-3">
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
              </div>
            </div>

            <div className={`flex flex-col gap-2 min-w-[180px] ${darkMode ? '' : ''}`}>
              <div className="relative">
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
                  <div className={`absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border shadow-xl max-h-60 overflow-y-auto ${
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

              {botwPhase && startSequenceRef.current && (timerState === 'armed' || timerState === 'running') && (
                <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  timerState === 'armed'
                    ? darkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-50 text-cyan-600'
                    : darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {timerState === 'armed' ? 'BOTW ready' : 'BOTW in progress'} — {startSequenceRef.current.name} will start automatically
                </div>
              )}

              {currentSequence?.use_audio_only && currentSequence.audio_file_url && (
                <div className={`rounded-lg p-2.5 text-xs ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                  <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    Audio Only Mode
                  </div>
                  <div className={`flex items-center gap-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Music size={12} />
                    <span className="truncate">{currentSequence.audio_file_path?.split('/').pop() || 'Audio file'}</span>
                  </div>
                </div>
              )}

              {currentSequence && !currentSequence.use_audio_only && currentSequence.sounds && currentSequence.sounds.length > 0 && (
                <div className={`rounded-lg p-2 space-y-0.5 text-xs max-h-40 overflow-y-auto ${
                  darkMode ? 'bg-slate-800/50' : 'bg-slate-50'
                }`}>
                  <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    Sequence Timeline
                  </div>
                  {currentSequence.sounds.map(ss => {
                    const isFired = timerState === 'running' && remainingMs / 1000 < ss.trigger_time_seconds;
                    return (
                      <div
                        key={ss.id}
                        className={`flex items-center gap-2 py-0.5 px-1 rounded transition-colors ${
                          isFired
                            ? 'opacity-40'
                            : ''
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          ss.trigger_time_seconds === 0 ? 'bg-red-500' : 'bg-blue-500'
                        }`} />
                        <span className={`font-mono w-10 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          T-{Math.floor(ss.trigger_time_seconds / 60)}:{(ss.trigger_time_seconds % 60).toString().padStart(2, '0')}
                        </span>
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                          {ss.label || ss.sound?.name || '--'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

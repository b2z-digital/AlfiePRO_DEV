import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Minus, Play, Square, Megaphone } from 'lucide-react';
import type { StartSequence, StartBoxState } from '../../types/startBox';
import type { TimerTickData } from '../../utils/startBoxAudio';
import { getStartBoxEngine, destroyStartBoxEngine } from '../../utils/startBoxAudio';
import { getSequence, getSequences, getSoundById } from '../../utils/startBoxStorage';
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

const AlfieLogo: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size * 1.56} viewBox="0 0 129.43 201.4" xmlns="http://www.w3.org/2000/svg">
    <path fill="#0066b4" d="M92.63.1s-33.4,35.9-46.9,76.9-18,123-18,123c53.9-26.1,87.1-5.1,101.7,1.4C76.03,145.2,92.63,0,92.63,0v.1Z"/>
    <path fill="#0078d3" d="M45.43,35.4s-23.9,31.1-37.4,61.2-5.9,88.2-5.9,88.2c22.2-23.9,68.8-19.1,68.8-19.1C33.83,122.7,45.33,35.4,45.33,35.4h.1Z"/>
  </svg>
);

const BellIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

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
  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(() => {
    if (sequenceId) return sequenceId;
    const saved = localStorage.getItem('startbox-last-sequence');
    return saved || null;
  });
  const [timerState, setTimerState] = useState<StartBoxState>('idle');
  const [remainingMs, setRemainingMs] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('startbox-volume');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [lastFiredLabel, setLastFiredLabel] = useState<string | null>(null);
  const [autoCloseTimer, setAutoCloseTimer] = useState<number | null>(null);
  const [botwSequences, setBotwSequences] = useState<StartSequence[]>([]);
  const [botwPhase, setBotwPhase] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRaceActive, setIsRaceActive] = useState(false);

  const engineRef = useRef(getStartBoxEngine());
  const cleanupRef = useRef<(() => void)[]>([]);
  const completedRef = useRef(false);
  const botwPhaseRef = useRef(false);
  const startSequenceRef = useRef<StartSequence | null>(null);
  const whistleSoundUrlRef = useRef<string | null>(null);
  const bellSoundUrlRef = useRef<string | null>(null);
  const raceStartedAtRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      completedRef.current = false;
      loadSequences();
      (async () => {
        const [whistle, bell] = await Promise.all([
          getSoundById(WHISTLE_SOUND_ID),
          getSoundById(BELL_SOUND_ID),
        ]);
        whistleSoundUrlRef.current = whistle?.file_url || null;
        bellSoundUrlRef.current = bell?.file_url || null;
      })();
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
        if (botwPhaseRef.current && startSequenceRef.current) {
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
        } else {
          completedRef.current = true;
          // Start elapsed timer for race duration tracking
          raceStartedAtRef.current = Date.now();
          setIsRaceActive(true);
          setElapsedMs(0);

          if (isMinimized) {
            // When minimized, don't auto-close - keep bar visible with count-up
            onSequenceComplete();
          } else if (!engine.isCountdownAudioPlaying()) {
            const timer = window.setTimeout(() => {
              onSequenceComplete();
              onClose();
            }, 2000);
            setAutoCloseTimer(timer);
          }
        }
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

    const unsub4 = engine.onAudioEnded(() => {
      if (completedRef.current) {
        if (isMinimized) {
          onSequenceComplete();
        } else {
          const timer = window.setTimeout(() => {
            onSequenceComplete();
            onClose();
          }, 1000);
          setAutoCloseTimer(timer);
        }
      }
    });

    cleanupRef.current = [unsub1, unsub2, unsub3, unsub4];

    return () => {
      cleanupRef.current.forEach(fn => fn());
    };
  }, [isOpen, volume, onSequenceComplete, onClose, isMinimized]);

  // Elapsed time counter when race is active
  useEffect(() => {
    if (isRaceActive && raceStartedAtRef.current) {
      elapsedIntervalRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - raceStartedAtRef.current!);
      }, 100);
    }
    return () => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
    };
  }, [isRaceActive]);

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
    const nonBotw = seqs.filter(s => s.sequence_type !== 'botw');
    setAvailableSequences(nonBotw);
    setBotwSequences(seqs.filter(s => s.sequence_type === 'botw'));

    const currentId = selectedSeqId || sequenceId;
    const hasValidSelection = currentId && nonBotw.some(s => s.id === currentId);
    if (!hasValidSelection && nonBotw.length > 0) {
      const twoMinScratch = nonBotw.find(s =>
        s.name.toLowerCase().includes('2 minute') && s.name.toLowerCase().includes('scratch')
      );
      const defaultId = twoMinScratch?.id || nonBotw[0].id;
      setSelectedSeqId(defaultId);
    }
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
    setIsRaceActive(false);
    raceStartedAtRef.current = null;
    setElapsedMs(0);
    const engine = engineRef.current;
    await engine.initialize();
    if (currentSequence && engine.getState() === 'idle') {
      engine.arm(currentSequence);
    }
    engine.start();
    if (currentSequence && !botwPhaseRef.current) {
      localStorage.setItem('startbox-last-sequence', currentSequence.id);
    }
  }, [currentSequence, autoCloseTimer]);

  const handleStop = useCallback(() => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    engineRef.current.stop();
  }, [autoCloseTimer]);

  const handleStopRace = useCallback(() => {
    setIsRaceActive(false);
    raceStartedAtRef.current = null;
    setElapsedMs(0);
    // Re-arm the sequence for next race
    if (currentSequence) {
      engineRef.current.arm(currentSequence);
    }
    completedRef.current = false;
    setTimerState('armed');
  }, [currentSequence]);

  const handlePause = useCallback(() => engineRef.current.pause(), []);
  const handleResume = useCallback(() => engineRef.current.resume(), []);

  const handleReset = useCallback(() => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    completedRef.current = false;
    setIsRaceActive(false);
    raceStartedAtRef.current = null;
    setElapsedMs(0);
    if (currentSequence) {
      engineRef.current.arm(currentSequence);
    } else {
      engineRef.current.reset();
    }
  }, [currentSequence, autoCloseTimer]);

  const handleWhistle = useCallback(async () => {
    const engine = engineRef.current;
    await engine.initialize();
    const url = whistleSoundUrlRef.current;
    if (url) {
      engine.playSound(url);
    } else {
      engine.playSynthBeep(1200, 300);
    }
  }, []);

  const handleBell = useCallback(async () => {
    const engine = engineRef.current;
    await engine.initialize();
    const url = bellSoundUrlRef.current;
    if (url) {
      engine.playSound(url);
    } else {
      engine.playSynthBeep(660, 500);
    }
  }, []);

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
    setIsRaceActive(false);
    raceStartedAtRef.current = null;
    setElapsedMs(0);

    if (seq.follow_on_sequence_id) {
      const followOn = await getSequence(seq.follow_on_sequence_id);
      startSequenceRef.current = followOn || currentSequence;
    } else {
      startSequenceRef.current = currentSequence;
    }
    botwPhaseRef.current = true;
    setBotwPhase(true);

    setCurrentSequence(seq);
    setTotalDuration(seq.total_duration_seconds);
    setRemainingMs(seq.total_duration_seconds * 1000);
    const engine = engineRef.current;
    await engine.initialize();
    engine.arm(seq);
  }, [autoCloseTimer, currentSequence]);

  const handleCancelBotw = useCallback(async () => {
    botwPhaseRef.current = false;
    setBotwPhase(false);
    engineRef.current.stop();

    const restoreSeq = startSequenceRef.current;
    startSequenceRef.current = null;
    if (restoreSeq) {
      setCurrentSequence(restoreSeq);
      setTotalDuration(restoreSeq.total_duration_seconds);
      setRemainingMs(restoreSeq.total_duration_seconds * 1000);
      const engine = engineRef.current;
      await engine.initialize();
      engine.arm(restoreSeq);
    } else if (selectedSeqId) {
      await loadSequence(selectedSeqId);
    }
  }, [selectedSeqId]);

  const handleSelectSequence = (id: string) => {
    setSelectedSeqId(id);
    localStorage.setItem('startbox-last-sequence', id);
  };

  const handleCloseModal = () => {
    if (timerState === 'running') return;
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      setAutoCloseTimer(null);
    }
    setIsRaceActive(false);
    raceStartedAtRef.current = null;
    onClose();
  };

  // Start next race from minimized bar
  const handleMinimizedStart = useCallback(async () => {
    completedRef.current = false;
    setIsRaceActive(false);
    raceStartedAtRef.current = null;
    setElapsedMs(0);

    const id = selectedSeqId || sequenceId;
    if (id) {
      const seq = await getSequence(id);
      if (seq) {
        setCurrentSequence(seq);
        setTotalDuration(seq.total_duration_seconds);
        setRemainingMs(seq.total_duration_seconds * 1000);
        const engine = engineRef.current;
        await engine.initialize();
        engine.arm(seq);
        engine.start();
        localStorage.setItem('startbox-last-sequence', seq.id);
      }
    }
  }, [selectedSeqId, sequenceId]);

  if (!isOpen) return null;

  const stateColor =
    timerState === 'running' ? 'bg-green-500' :
    timerState === 'paused' ? 'bg-amber-500' :
    timerState === 'armed' ? 'bg-cyan-500' :
    timerState === 'completed' ? 'bg-red-500' :
    'bg-slate-600';

  const remainingSec = Math.ceil(Math.max(0, remainingMs) / 1000);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);
  const elapsedSecRemainder = elapsedSec % 60;

  // Minimized floating bar view
  if (isMinimized) {
    const showElapsed = isRaceActive && (timerState === 'completed' || completedRef.current);
    const isIdleOrArmed = timerState === 'idle' || timerState === 'armed';
    const showQuickControls = showElapsed || isIdleOrArmed;

    return (
      <div className="fixed bottom-4 left-0 right-0 z-[100] flex justify-center pointer-events-none">
        <div
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-2xl animate-slideUp ${
            darkMode
              ? 'bg-slate-900 border-slate-700/60'
              : 'bg-white border-slate-200'
          }`}
        >
          {/* Status dot */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            showElapsed ? 'bg-green-500 animate-pulse' : stateColor
          } ${timerState === 'running' ? 'animate-pulse' : ''}`} />

          {/* Logo - click to expand */}
          <button
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="Expand StartBox"
          >
            <AlfieLogo size={13} />
          </button>

          {/* Timer display - click to expand */}
          <button
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="Expand StartBox"
          >
            <span className={`font-bold tabular-nums text-lg ${
              showElapsed ? 'text-green-400' :
              timerState === 'running' && remainingSec <= 5 ? 'text-red-500' :
              timerState === 'running' && remainingSec <= 10 ? 'text-orange-500' :
              timerState === 'running' && remainingSec <= 30 ? 'text-amber-400' :
              timerState === 'running' ? 'text-cyan-400' :
              timerState === 'paused' ? 'text-amber-400' :
              darkMode ? 'text-white' : 'text-slate-900'
            }`}>
              {showElapsed
                ? `+${elapsedMin}:${elapsedSecRemainder.toString().padStart(2, '0')}`
                : timerState === 'completed'
                  ? 'GO!'
                  : `${Math.floor(remainingSec / 60)}:${(remainingSec % 60).toString().padStart(2, '0')}`
              }
            </span>
            <span className={`text-xs uppercase tracking-wider font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {showElapsed ? 'RACING' : botwPhase ? 'BOTW' : currentSequence?.name || 'StartBox'}
            </span>
          </button>

          {/* Quick controls */}
          {showQuickControls && (
            <>
              <div className={`w-px h-5 mx-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />

              {showElapsed ? (
                <>
                  {/* During race: Stop race, Whistle, Bell */}
                  <button
                    onClick={handleStopRace}
                    className="p-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                    title="Stop Race Timer"
                  >
                    <Square size={14} />
                  </button>
                  <button
                    onClick={handleWhistle}
                    className={`p-1.5 rounded-lg transition-colors ${
                      darkMode ? 'text-amber-400/70 hover:bg-slate-800 hover:text-amber-400' : 'text-amber-600 hover:bg-slate-100'
                    }`}
                    title="Whistle"
                  >
                    <Megaphone size={14} />
                  </button>
                  <button
                    onClick={handleBell}
                    className={`p-1.5 rounded-lg transition-colors ${
                      darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                    title="Bell"
                  >
                    <BellIcon size={14} />
                  </button>
                </>
              ) : (
                <>
                  {/* Idle/Armed: Start, Whistle, Bell */}
                  <button
                    onClick={handleMinimizedStart}
                    className="p-1.5 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                    title="Start Sequence"
                  >
                    <Play size={14} className="ml-0.5" />
                  </button>
                  <button
                    onClick={handleWhistle}
                    className={`p-1.5 rounded-lg transition-colors ${
                      darkMode ? 'text-amber-400/70 hover:bg-slate-800 hover:text-amber-400' : 'text-amber-600 hover:bg-slate-100'
                    }`}
                    title="Whistle"
                  >
                    <Megaphone size={14} />
                  </button>
                  <button
                    onClick={handleBell}
                    className={`p-1.5 rounded-lg transition-colors ${
                      darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                    title="Bell"
                  >
                    <BellIcon size={14} />
                  </button>
                </>
              )}
            </>
          )}

          {/* Running state: show stop button */}
          {timerState === 'running' && !showElapsed && (
            <>
              <div className={`w-px h-5 mx-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
              <button
                onClick={handleStop}
                className="p-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                title="Stop"
              >
                <Square size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Full modal view
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleCloseModal}
      />

      <div className={`relative w-full max-w-2xl mx-4 rounded-2xl border shadow-2xl overflow-hidden animate-slideDown ${
        darkMode ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'
      }`}>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${
          darkMode ? 'bg-slate-800/80 border-slate-700/50' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${stateColor} ${timerState === 'running' ? 'animate-pulse' : ''}`} />
            <AlfieLogo size={16} />
            <span className={darkMode ? 'text-white' : 'text-slate-900'}>
              <span className="font-extrabold">Start</span><span className="font-thin">Box</span>
            </span>
            {lastFiredLabel && (
              <span className="text-xs text-amber-400 animate-pulse font-medium bg-amber-500/10 px-2 py-0.5 rounded-full">
                {lastFiredLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className={`p-1.5 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
              }`}
              title="Minimize"
            >
              <Minus size={18} />
            </button>
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
        </div>

        <div className="p-5 space-y-5">
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
            availableSequences={availableSequences}
            currentSequenceName={currentSequence?.name}
            selectedSeqId={selectedSeqId}
            onSelectSequence={handleSelectSequence}
          />

          {botwPhase && startSequenceRef.current && (timerState === 'armed' || timerState === 'running') && (
            <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium ${
              timerState === 'armed'
                ? darkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-50 text-cyan-600'
                : darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <span>
                {timerState === 'armed' ? 'BOTW ready' : 'BOTW in progress'} — {startSequenceRef.current.name} will start automatically
              </span>
              <button
                onClick={handleCancelBotw}
                className={`ml-3 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
              >
                Cancel
              </button>
            </div>
          )}

          {timerState === 'completed' && !botwPhase && (
            <div className={`text-center py-2 rounded-lg text-sm font-medium animate-pulse ${
              darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'
            }`}>
              Race started - will close when audio finishes...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

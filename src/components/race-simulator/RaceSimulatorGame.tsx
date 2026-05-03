import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Scenario } from './types';
import { GameCanvas } from './GameCanvas';
import { GameHUD } from './GameHUD';
import { updateBoatPosition, getWindAtTime, normalizeAngle, normalizeDeg, hasPassedLine, hasRoundedMark, distance } from './physics';
import { updateAIBoat, resetAIStates } from './ai';
import { checkRules, checkMarkRounding } from './rules';
import { Pause, Play, RotateCcw, ArrowLeft, Keyboard, Volume2, VolumeX } from 'lucide-react';

import { getStartBoxEngine } from '../../utils/startBoxAudio';
import { getDefaultSequenceForRaceType } from '../../utils/startBoxStorage';

interface RaceSimulatorGameProps {
  scenario: Scenario;
  darkMode: boolean;
  onBack: () => void;
}

export function RaceSimulatorGame({ scenario, darkMode, onBack }: RaceSimulatorGameProps) {
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 700 });
  const [gameState, setGameState] = useState<GameState>(() => scenario.setup(800, 700));
  const [showControls, setShowControls] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const gameRef = useRef<GameState>(gameState);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const startBoxInitialized = useRef(false);
  const initializedSize = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);

  // Keep ref in sync
  useEffect(() => {
    gameRef.current = gameState;
  }, [gameState]);

  // Canvas sizing - recreate game state when size is first measured
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newSize = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
        if (newSize.width > 100 && newSize.height > 100) {
          setCanvasSize(newSize);
          if (!initializedSize.current) {
            initializedSize.current = true;
            resetAIStates();
            setGameState(scenario.setup(newSize.width, newSize.height));
          }
        }
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [scenario]);

  // Initialize StartBox audio engine with real sequence from database
  const startBoxReady = useRef(false);
  useEffect(() => {
    if (startBoxInitialized.current) return;
    startBoxInitialized.current = true;
    const engine = getStartBoxEngine();

    (async () => {
      try {
        await engine.initialize();
        const seq = await getDefaultSequenceForRaceType(null, 'scratch');
        if (seq) {
          await engine.preloadSequence(seq);
          engine.arm(seq);
          engine.start();
          startBoxReady.current = true;
        }
      } catch {
        // Audio may fail on first interaction - will retry on restart
      }
    })();

    return () => {
      engine.stop();
    };
  }, []);

  // Sync sound toggle with StartBox engine volume
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    const engine = getStartBoxEngine();
    engine.setVolume(soundEnabled ? 0.8 : 0);
  }, [soundEnabled]);

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (e.key === ' ') {
        e.preventDefault();
        setGameState(prev => ({ ...prev, paused: !prev.paused }));
      }
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleTack();
      }
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        handleGybe();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleTack = useCallback(() => {
    setGameState(prev => {
      const boats = [...prev.boats];
      const player = boats.find(b => b.isPlayer);
      if (!player || player.isTacking || player.isGybing || player.penaltyTurns > 0) return prev;

      const currentWind = getWindAtTime(prev.wind, prev.time);
      const twa = normalizeDeg(currentWind.direction - player.heading + 180);

      if (Math.abs(twa) < 90) {
        // Tacking (going through head to wind)
        player.isTacking = true;
        player.tackTimer = 1.5;
        // Set new heading on opposite tack
        player.heading = normalizeAngle(player.heading + (twa > 0 ? -90 : 90));
      }
      return { ...prev, boats };
    });
  }, []);

  const handleGybe = useCallback(() => {
    setGameState(prev => {
      const boats = [...prev.boats];
      const player = boats.find(b => b.isPlayer);
      if (!player || player.isTacking || player.isGybing || player.penaltyTurns > 0) return prev;

      const currentWind = getWindAtTime(prev.wind, prev.time);
      const twa = normalizeDeg(currentWind.direction - player.heading + 180);

      if (Math.abs(twa) > 90) {
        // Gybing (going through dead downwind)
        player.isGybing = true;
        player.tackTimer = 1.0;
        player.heading = normalizeAngle(player.heading + (twa > 0 ? 90 : -90));
      }
      return { ...prev, boats };
    });
  }, []);

  // Game loop
  useEffect(() => {
    const gameLoop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      const state = gameRef.current;
      if (state.paused || state.currentViolation) {
        animFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      setGameState(prev => {
        const next = { ...prev, boats: prev.boats.map(b => ({ ...b, position: { ...b.position } })) };
        const currentWind = getWindAtTime(next.wind, next.time);

        // Update countdown/time - sync with StartBox engine when available
        if (next.phase === 'countdown') {
          if (startBoxReady.current) {
            const engine = getStartBoxEngine();
            const remainingMs = engine.getRemainingMs();
            next.countdown = remainingMs / 1000;
          } else {
            next.countdown -= dt;
          }

          if (next.countdown <= 0) {
            next.phase = 'racing';
            next.countdown = 0;
            next.time = 0;
            next.boats.forEach(b => {
              if (b.rounding === 0) b.rounding = 1;
            });
          }
        } else if (next.phase === 'racing') {
          next.time += dt;
        }

        // Handle player steering (allowed during countdown for positioning)
        const player = next.boats.find(b => b.isPlayer);
        if (player && !player.isTacking && !player.isGybing && player.penaltyTurns === 0) {
          const turnRate = 80 * dt;
          if (keysRef.current.has('arrowleft') || keysRef.current.has('a')) {
            player.heading = normalizeAngle(player.heading - turnRate);
          }
          if (keysRef.current.has('arrowright') || keysRef.current.has('d')) {
            player.heading = normalizeAngle(player.heading + turnRate);
          }
        }

        // Update AI headings first, then move all boats
        // Use a monotonically increasing time for AI (total elapsed since game started)
        const totalElapsed = next.phase === 'countdown'
          ? (60 - next.countdown) // seconds elapsed since game began
          : (60 + next.time);     // countdown duration + racing time
        for (const boat of next.boats) {
          if (!boat.isPlayer) {
            updateAIBoat(boat, next.course, currentWind, totalElapsed, next.boats);
          }
        }

        // Update boat physics - during countdown boats move at 70% speed (maneuvering into position)
        const speedMultiplier = next.phase === 'countdown' ? 0.7 : 1.0;
        for (const boat of next.boats) {
          updateBoatPosition(boat, dt * speedMultiplier, currentWind, next.boats);
        }

        // Keep boats within canvas bounds
        for (const boat of next.boats) {
          boat.position.x = Math.max(20, Math.min(canvasSize.width - 20, boat.position.x));
          boat.position.y = Math.max(20, Math.min(canvasSize.height - 20, boat.position.y));
        }

        // Check mark roundings during racing
        if (next.phase === 'racing') {
          const windwardMark = next.course.marks.find(m => m.type === 'windward');
          const offsetMark = next.course.marks.find(m => m.label === 'Offset Mark');
          const gatePort = next.course.marks.find(m => m.type === 'gate-port');
          const gateStbd = next.course.marks.find(m => m.type === 'gate-starboard');
          const totalLaps = next.course.legs;

          for (const boat of next.boats) {
            if (boat.finished) continue;

            const roundingRadius = 30;

            // Rounding progression:
            // 1 = heading to windward, 2 = heading to offset, 3 = heading to gate
            // 4 = windward (lap 2), 5 = offset (lap 2), 6 = gate (lap 2)
            // 7 = heading to finish

            // Windward mark (lap 1)
            if (boat.rounding === 1 && windwardMark) {
              if (hasRoundedMark(boat, windwardMark.position, roundingRadius)) {
                boat.rounding = 2;
              }
            }

            // Offset mark (lap 1)
            if (boat.rounding === 2 && offsetMark) {
              if (hasRoundedMark(boat, offsetMark.position, roundingRadius)) {
                boat.rounding = 3;
              }
            }

            // Gate (lap 1)
            if (boat.rounding === 3 && (gatePort || gateStbd)) {
              const gateTarget = gatePort || gateStbd;
              const gateOther = gateStbd || gatePort;
              if (hasRoundedMark(boat, gateTarget!.position, roundingRadius) ||
                  hasRoundedMark(boat, gateOther!.position, roundingRadius)) {
                boat.laps++;
                if (boat.laps >= totalLaps) {
                  boat.rounding = 7; // head to finish
                } else {
                  boat.rounding = 4; // lap 2 - back upwind
                }
              }
            }

            // Windward mark (lap 2)
            if (boat.rounding === 4 && windwardMark) {
              if (hasRoundedMark(boat, windwardMark.position, roundingRadius)) {
                boat.rounding = 5;
              }
            }

            // Offset mark (lap 2)
            if (boat.rounding === 5 && offsetMark) {
              if (hasRoundedMark(boat, offsetMark.position, roundingRadius)) {
                boat.rounding = 6;
              }
            }

            // Gate (lap 2)
            if (boat.rounding === 6 && (gatePort || gateStbd)) {
              const gateTarget = gatePort || gateStbd;
              const gateOther = gateStbd || gatePort;
              if (hasRoundedMark(boat, gateTarget!.position, roundingRadius) ||
                  hasRoundedMark(boat, gateOther!.position, roundingRadius)) {
                boat.laps++;
                boat.rounding = 7;
              }
            }

            // Finish
            if (boat.rounding === 7) {
              if (hasPassedLine(boat, next.course.finishLine.port, next.course.finishLine.starboard, 'upward')) {
                boat.finished = true;
                boat.finishTime = next.time;
                if (boat.isPlayer && soundEnabledRef.current) {
                  getStartBoxEngine().playSynthBeep(440, 1500);
                }
              }
            }
          }

          // All finished?
          if (next.boats.every(b => b.finished)) {
            next.phase = 'finished';
          }

          // Check rules (throttled) - only after boats have spread out (15 seconds in)
          if (next.time > 15 && Math.floor(next.time * 2) !== Math.floor((next.time - dt) * 2)) {
            const violation = checkRules(next.boats, currentWind.direction, next.time);
            if (violation) {
              next.violations = [...next.violations, violation];
              const playerBoat = next.boats.find(b => b.isPlayer);
              if (violation.offendingBoat === playerBoat?.id || violation.rightOfWayBoat === playerBoat?.id) {
                next.currentViolation = violation;
              }
              // AI boats do NOT get penalty turns - they just avoid (no spinning)
            }

            if (windwardMark) {
              const markViolation = checkMarkRounding(next.boats, windwardMark.position, windwardMark.radius, currentWind.direction, next.time);
              if (markViolation && !next.currentViolation) {
                next.violations = [...next.violations, markViolation];
                const playerBoat = next.boats.find(b => b.isPlayer);
                if (markViolation.offendingBoat === playerBoat?.id || markViolation.rightOfWayBoat === playerBoat?.id) {
                  next.currentViolation = markViolation;
                }
              }
            }
          }
        }

        return next;
      });

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [canvasSize]);

  const handleDismissViolation = () => {
    setGameState(prev => {
      const player = prev.boats.find(b => b.isPlayer);
      if (player && prev.currentViolation?.offendingBoat === player.id) {
        player.penaltyTurns = 2;
      }
      return { ...prev, currentViolation: null };
    });
  };

  const handleRestart = () => {
    resetAIStates();
    setGameState(scenario.setup(canvasSize.width, canvasSize.height));
    lastTimeRef.current = 0;
    startBoxReady.current = false;
    // Restart the start box audio
    const engine = getStartBoxEngine();
    engine.stop();
    (async () => {
      try {
        const seq = await getDefaultSequenceForRaceType(null, 'scratch');
        if (seq) {
          await engine.preloadSequence(seq);
          engine.arm(seq);
          engine.start();
          startBoxReady.current = true;
        }
      } catch {
        // Ignore audio errors
      }
    })();
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Top toolbar */}
      <div className={`flex items-center justify-between px-4 py-2 ${darkMode ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-b border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className={`h-5 w-px ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{scenario.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowControls(!showControls)}
            className={`p-2 rounded-lg text-sm ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
            title="Show controls"
          >
            <Keyboard size={16} />
          </button>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={() => setGameState(prev => ({ ...prev, paused: !prev.paused }))}
            className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            {gameState.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            onClick={handleRestart}
            className={`p-2 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Game area */}
      <div className="relative flex-1 overflow-hidden" ref={containerRef}>
        <GameCanvas
          gameState={gameState}
          width={canvasSize.width}
          height={canvasSize.height}
          darkMode={darkMode}
        />
        <GameHUD
          gameState={gameState}
          darkMode={darkMode}
          onDismissViolation={handleDismissViolation}
        />

        {/* Controls help overlay */}
        {showControls && gameState.phase === 'countdown' && gameState.countdown > 5 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`pointer-events-auto p-5 rounded-xl ${darkMode ? 'bg-slate-900/95 border border-slate-700' : 'bg-white/95 border border-gray-200'} backdrop-blur-md shadow-xl max-w-sm`}>
              <h3 className={`text-lg font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Controls</h3>
              <div className="space-y-2">
                <ControlRow keys={['←', '→']} label="Steer left / right" alt="A / D" darkMode={darkMode} />
                <ControlRow keys={['T']} label="Tack (turn through wind)" darkMode={darkMode} />
                <ControlRow keys={['G']} label="Gybe (turn downwind)" darkMode={darkMode} />
                <ControlRow keys={['Space']} label="Pause / Resume" darkMode={darkMode} />
              </div>
              <button
                onClick={() => setShowControls(false)}
                className={`mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
              >
                Start Racing
              </button>
            </div>
          </div>
        )}

        {/* Paused overlay */}
        {gameState.paused && !gameState.currentViolation && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
            <div className={`px-6 py-3 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-xl`}>
              <span className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>PAUSED</span>
            </div>
          </div>
        )}

        {/* Mobile touch controls */}
        <div className="absolute bottom-16 right-3 flex flex-col gap-2 md:hidden">
          <button
            onTouchStart={() => keysRef.current.add('arrowleft')}
            onTouchEnd={() => keysRef.current.delete('arrowleft')}
            className="w-14 h-14 rounded-full bg-blue-500/80 text-white flex items-center justify-center text-xl font-bold active:bg-blue-600"
          >
            ←
          </button>
          <button
            onTouchStart={() => keysRef.current.add('arrowright')}
            onTouchEnd={() => keysRef.current.delete('arrowright')}
            className="w-14 h-14 rounded-full bg-blue-500/80 text-white flex items-center justify-center text-xl font-bold active:bg-blue-600"
          >
            →
          </button>
          <button
            onClick={handleTack}
            className="w-14 h-14 rounded-full bg-amber-500/80 text-white flex items-center justify-center text-xs font-bold active:bg-amber-600"
          >
            TACK
          </button>
          <button
            onClick={handleGybe}
            className="w-14 h-14 rounded-full bg-emerald-500/80 text-white flex items-center justify-center text-xs font-bold active:bg-emerald-600"
          >
            GYBE
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlRow({ keys, label, alt, darkMode }: { keys: string[]; label: string; alt?: string; darkMode: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {keys.map(k => (
          <kbd key={k} className={`px-2 py-1 rounded text-xs font-mono ${darkMode ? 'bg-slate-800 border border-slate-600 text-slate-200' : 'bg-gray-100 border border-gray-300 text-gray-700'}`}>
            {k}
          </kbd>
        ))}
        {alt && (
          <>
            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>/</span>
            <kbd className={`px-2 py-1 rounded text-xs font-mono ${darkMode ? 'bg-slate-800 border border-slate-600 text-slate-200' : 'bg-gray-100 border border-gray-300 text-gray-700'}`}>
              {alt}
            </kbd>
          </>
        )}
      </div>
      <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{label}</span>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Scenario } from './types';
import { GameCanvas } from './GameCanvas';
import { GameHUD } from './GameHUD';
import { TransmitterSticks } from './TransmitterSticks';
import { updateBoatPosition, getWindAtTime, getOptimalSheet, getTrueWindAngle, normalizeAngle, normalizeDeg, hasPassedLine, hasRoundedMark, distance } from './physics';
import { updateAIBoat, resetAIStates } from './ai';
import { checkRules, checkMarkRounding, checkMarkTouching, checkOCS, resetPenaltyTracking } from './rules';
import { Pause, Play, RotateCcw, ArrowLeft, Keyboard, Volume2, VolumeX, Gamepad2 } from 'lucide-react';

import { getStartBoxEngine } from '../../utils/startBoxAudio';
import { getDefaultSequenceForRaceType } from '../../utils/startBoxStorage';

interface RaceSimulatorGameProps {
  scenario: Scenario;
  darkMode: boolean;
  onBack: () => void;
}

interface GamepadMapping {
  rudderAxis: number;
  sheetAxis: number;
  rudderInverted: boolean;
  sheetInverted: boolean;
  deadzone: number;
}

const DEFAULT_GAMEPAD_MAPPING: GamepadMapping = {
  rudderAxis: 0, // Right stick X
  sheetAxis: 3,  // Left stick Y
  rudderInverted: false,
  sheetInverted: false,
  deadzone: 0.08,
};

function loadGamepadMapping(): GamepadMapping {
  try {
    const saved = localStorage.getItem('race-sim-gamepad-mapping');
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_GAMEPAD_MAPPING;
}

function saveGamepadMapping(mapping: GamepadMapping): void {
  localStorage.setItem('race-sim-gamepad-mapping', JSON.stringify(mapping));
}

export function RaceSimulatorGame({ scenario, darkMode, onBack }: RaceSimulatorGameProps) {
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 700 });
  const [gameState, setGameState] = useState<GameState>(() => scenario.setup(800, 700));
  const [showControls, setShowControls] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sheetAngle, setSheetAngle] = useState(0.7);
  const [rudderInput, setRudderInput] = useState(0);
  const [showGamepadSettings, setShowGamepadSettings] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadMapping, setGamepadMapping] = useState<GamepadMapping>(loadGamepadMapping);
  const gameRef = useRef<GameState>(gameState);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const startBoxInitialized = useRef(false);
  const initializedSize = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  const sheetAngleRef = useRef(sheetAngle);
  const rudderInputRef = useRef(rudderInput);
  const gamepadMappingRef = useRef(gamepadMapping);

  // Keep refs in sync
  useEffect(() => { gameRef.current = gameState; }, [gameState]);
  useEffect(() => { sheetAngleRef.current = sheetAngle; }, [sheetAngle]);
  useEffect(() => { rudderInputRef.current = rudderInput; }, [rudderInput]);
  useEffect(() => { gamepadMappingRef.current = gamepadMapping; }, [gamepadMapping]);

  // Gamepad connection listeners
  useEffect(() => {
    const onConnect = () => setGamepadConnected(true);
    const onDisconnect = () => {
      const gamepads = navigator.getGamepads();
      const hasGamepad = Array.from(gamepads).some(gp => gp !== null);
      setGamepadConnected(hasGamepad);
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    // Check if already connected
    const gamepads = navigator.getGamepads();
    if (Array.from(gamepads).some(gp => gp !== null)) setGamepadConnected(true);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

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
            resetPenaltyTracking();
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
      // Sync rudder stick visual with keyboard
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        setRudderInput(-0.7);
      }
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        setRudderInput(0.7);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
      // Spring rudder back to center when steering keys released
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a' || e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        // Only reset if the OTHER direction isn't still held
        const leftStillHeld = keysRef.current.has('arrowleft') || keysRef.current.has('a');
        const rightStillHeld = keysRef.current.has('arrowright') || keysRef.current.has('d');
        if (!leftStillHeld && !rightStillHeld) {
          setRudderInput(0);
        }
      }
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
      const twa = getTrueWindAngle(player.heading, currentWind.direction);

      if (Math.abs(twa) < 90) {
        // Tacking (going through head to wind)
        player.isTacking = true;
        player.tackTimer = 1.5;
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
      const twa = getTrueWindAngle(player.heading, currentWind.direction);

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

            // Check OCS - any boat over the line at the gun
            const ocsViolation = checkOCS(next.boats, next.course, 0);
            if (ocsViolation) {
              const playerBoat = next.boats.find(b => b.isPlayer);
              if (ocsViolation.offendingBoat === playerBoat?.id) {
                next.currentViolation = ocsViolation;
                next.violations = [...next.violations, ocsViolation];
              }
              // OCS boats: push them back below the line
              const ocsBoat = next.boats.find(b => b.id === ocsViolation.offendingBoat);
              if (ocsBoat && !ocsBoat.isPlayer) {
                ocsBoat.position.y = next.course.startLine.port.y + 30;
                ocsBoat.heading = normalizeAngle(180);
              }
            }

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
          // Keyboard rudder
          const leftHeld = keysRef.current.has('arrowleft') || keysRef.current.has('a');
          const rightHeld = keysRef.current.has('arrowright') || keysRef.current.has('d');
          if (leftHeld) {
            player.heading = normalizeAngle(player.heading - turnRate);
          } else if (rightHeld) {
            player.heading = normalizeAngle(player.heading + turnRate);
          }
          // Transmitter stick rudder (from touch/mouse drag)
          if (!leftHeld && !rightHeld && Math.abs(rudderInputRef.current) > 0.05) {
            player.heading = normalizeAngle(player.heading + rudderInputRef.current * turnRate);
          }
          // Keyboard sheeting (UP = ease out, DOWN = sheet in)
          if (keysRef.current.has('arrowup') || keysRef.current.has('w')) {
            setSheetAngle(prev => Math.max(0, prev - 1.5 * dt));
          }
          if (keysRef.current.has('arrowdown') || keysRef.current.has('s')) {
            setSheetAngle(prev => Math.min(1, prev + 1.5 * dt));
          }

          // Gamepad / USB transmitter input
          const gamepads = navigator.getGamepads();
          const gp = Array.from(gamepads).find(g => g !== null);
          if (gp) {
            const mapping = gamepadMappingRef.current;
            const dz = mapping.deadzone;

            // Rudder axis
            if (mapping.rudderAxis < gp.axes.length) {
              let rudderVal = gp.axes[mapping.rudderAxis];
              if (mapping.rudderInverted) rudderVal = -rudderVal;
              if (Math.abs(rudderVal) > dz) {
                player.heading = normalizeAngle(player.heading + rudderVal * turnRate);
              }
            }

            // Sheet axis
            if (mapping.sheetAxis < gp.axes.length) {
              let sheetVal = gp.axes[mapping.sheetAxis];
              if (mapping.sheetInverted) sheetVal = -sheetVal;
              if (Math.abs(sheetVal) > dz) {
                // Positive axis value = sheet in (increase), negative = ease out (decrease)
                setSheetAngle(prev => Math.max(0, Math.min(1, prev + sheetVal * 1.5 * dt)));
              }
            }
          }
        }

        // Update AI headings first, then move all boats
        // Use a monotonically increasing time for AI (total elapsed since game started)
        const totalElapsed = next.phase === 'countdown'
          ? (60 - next.countdown) // seconds elapsed since game began
          : (60 + next.time);     // countdown duration + racing time
        for (const boat of next.boats) {
          if (!boat.isPlayer) {
            updateAIBoat(boat, next.course, currentWind, totalElapsed, next.boats, next.phase === 'countdown' ? next.countdown : undefined);
          }
        }

        // Update boat physics - during countdown boats move at reduced speed (maneuvering into position)
        const speedMultiplier = next.phase === 'countdown' ? 0.5 : 1.0;
        for (const boat of next.boats) {
          if (boat.isPlayer) {
            updateBoatPosition(boat, dt * speedMultiplier, currentWind, next.boats, sheetAngleRef.current);
          } else {
            updateBoatPosition(boat, dt * speedMultiplier, currentWind, next.boats);
          }
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

            const roundingRadius = 50;

            // Port rounding: boat must pass to the RIGHT of the mark and exit on the far side.
            // For windward marks (approaching from below/south):
            //   "rounded" = boat is above the mark (passed it going north) and near it
            const hasRoundedWindward = (boatPos: { x: number; y: number }, markPos: { x: number; y: number }): boolean => {
              const dist = distance(boatPos, markPos);
              // Port rounding: boat passes to the RIGHT then above the mark.
              // Rounded = near the mark AND above it (y < mark.y in screen coords).
              return dist < roundingRadius && boatPos.y < markPos.y;
            };

            // Offset mark: approaching from above (coming from windward mark), rounding to the right,
            // exiting below. "rounded" = boat is below the mark and near it.
            const hasRoundedOffset = (boatPos: { x: number; y: number }, markPos: { x: number; y: number }): boolean => {
              const dist = distance(boatPos, markPos);
              return dist < roundingRadius && boatPos.y > markPos.y + 5;
            };

            // Gate rounding: boat sails down past one gate mark and rounds it.
            // "passed" = boat is near either gate mark AND below the gate line.
            const hasPassedGate = (boatPos: { x: number; y: number }, gP: { x: number; y: number }, gS: { x: number; y: number }): boolean => {
              const dist1 = distance(boatPos, gP);
              const dist2 = distance(boatPos, gS);
              const nearGate = dist1 < roundingRadius || dist2 < roundingRadius;
              const belowGate = boatPos.y > gP.y + 5;
              return nearGate && belowGate;
            };

            // Rounding progression:
            // 1 = heading to windward, 2 = heading to offset, 3 = heading to gate
            // 4 = windward (lap 2), 5 = offset (lap 2), 6 = gate (lap 2)
            // 7 = heading to finish

            if (boat.rounding === 1 && windwardMark) {
              if (hasRoundedWindward(boat.position, windwardMark.position)) {
                boat.rounding = 2;
              }
            } else if (boat.rounding === 2 && offsetMark) {
              if (hasRoundedOffset(boat.position, offsetMark.position)) {
                boat.rounding = 3;
              }
            } else if (boat.rounding === 3 && gatePort && gateStbd) {
              if (hasPassedGate(boat.position, gatePort.position, gateStbd.position)) {
                boat.laps++;
                if (boat.laps >= totalLaps) {
                  boat.rounding = 7;
                } else {
                  boat.rounding = 4;
                }
              }
            } else if (boat.rounding === 4 && windwardMark) {
              if (hasRoundedWindward(boat.position, windwardMark.position)) {
                boat.rounding = 5;
              }
            } else if (boat.rounding === 5 && offsetMark) {
              if (hasRoundedOffset(boat.position, offsetMark.position)) {
                boat.rounding = 6;
              }
            } else if (boat.rounding === 6 && gatePort && gateStbd) {
              if (hasPassedGate(boat.position, gatePort.position, gateStbd.position)) {
                boat.laps++;
                boat.rounding = 7;
              }
            } else if (boat.rounding === 7) {
              if (hasPassedLine(boat, next.course.finishLine.port, next.course.finishLine.starboard, 'upward')) {
                boat.finished = true;
                boat.finishTime = next.time;
                if (boat.isPlayer && soundEnabledRef.current) {
                  getStartBoxEngine().playSynthBeep(440, 1500);
                }
              }
            }
          }

          // Clean up expired mark hit animations
          if (next.markHits && next.markHits.length > 0) {
            next.markHits = next.markHits.filter(h => next.time - h.startTime < 2);
          }

          // All finished?
          if (next.boats.every(b => b.finished)) {
            next.phase = 'finished';
          }

          // Check rules every few frames (throttled to ~4 Hz)
          if (!next.currentViolation && Math.floor(next.time * 4) !== Math.floor((next.time - dt) * 4)) {
            // 1. Check mark touching (RRS 31) - any boat touching any mark
            const markViolation = checkMarkTouching(next.boats, next.course, next.time);
            if (markViolation) {
              next.violations = [...next.violations, markViolation];
              // Find which mark was hit and add spin animation
              const hitMarkIdx = next.course.marks.findIndex(m =>
                m.type !== 'start-port' && m.type !== 'start-starboard' &&
                Math.abs(m.position.x - markViolation.position.x) < 20 &&
                Math.abs(m.position.y - markViolation.position.y) < 20
              );
              if (hitMarkIdx >= 0) {
                next.markHits = [...(next.markHits || []).filter(h => next.time - h.startTime < 2), { markIndex: hitMarkIdx, startTime: next.time }];
              }
              const playerBoat = next.boats.find(b => b.isPlayer);
              if (markViolation.offendingBoat === playerBoat?.id) {
                next.currentViolation = markViolation;
              } else {
                // AI boat touched a mark - give them a penalty turn
                const aiBoat = next.boats.find(b => b.id === markViolation.offendingBoat);
                if (aiBoat) aiBoat.penaltyTurns = 1.5;
              }
            }

            // 2. Check boat-to-boat contact (RRS 10, 11, 12)
            if (!next.currentViolation) {
              const contactViolation = checkRules(next.boats, currentWind.direction, next.time);
              if (contactViolation) {
                next.violations = [...next.violations, contactViolation];
                const playerBoat = next.boats.find(b => b.isPlayer);
                if (contactViolation.offendingBoat === playerBoat?.id || contactViolation.rightOfWayBoat === playerBoat?.id) {
                  next.currentViolation = contactViolation;
                } else {
                  // AI boat collision - offender gets penalty
                  const aiBoat = next.boats.find(b => b.id === contactViolation.offendingBoat);
                  if (aiBoat) aiBoat.penaltyTurns = 2;
                }
              }
            }

            // 3. Check mark room (RRS 18) at windward mark
            if (!next.currentViolation && windwardMark) {
              const markRoomViolation = checkMarkRounding(next.boats, windwardMark.position, windwardMark.radius, currentWind.direction, next.time);
              if (markRoomViolation) {
                next.violations = [...next.violations, markRoomViolation];
                const playerBoat = next.boats.find(b => b.isPlayer);
                if (markRoomViolation.offendingBoat === playerBoat?.id || markRoomViolation.rightOfWayBoat === playerBoat?.id) {
                  next.currentViolation = markRoomViolation;
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
        if (prev.currentViolation.ruleNumber === 'RRS 29.1') {
          // OCS: push player back below the line
          player.position.y = prev.course.startLine.port.y + 40;
          player.heading = normalizeAngle(0);
        } else if (prev.currentViolation.ruleNumber === 'RRS 31') {
          // Mark touching: one-turn penalty (shorter)
          player.penaltyTurns = 1.5;
        } else {
          // Contact / other: two-turn penalty (360 degree)
          player.penaltyTurns = 2;
        }
      }
      return { ...prev, currentViolation: null };
    });
  };

  const handleRestart = () => {
    resetAIStates();
    resetPenaltyTracking();
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
            onClick={() => setShowGamepadSettings(true)}
            className={`p-2 rounded-lg ${gamepadConnected ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-slate-300' : 'text-gray-600')} ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
            title={gamepadConnected ? 'Transmitter connected - Settings' : 'Transmitter settings (no device detected)'}
          >
            <Gamepad2 size={16} />
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
          sheetAngle={sheetAngle}
        />

        {/* Controls help overlay */}
        {showControls && gameState.phase === 'countdown' && gameState.countdown > 5 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`pointer-events-auto p-5 rounded-xl ${darkMode ? 'bg-slate-900/95 border border-slate-700' : 'bg-white/95 border border-gray-200'} backdrop-blur-md shadow-xl max-w-sm`}>
              <h3 className={`text-lg font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Controls</h3>
              <div className="space-y-2">
                <ControlRow keys={['←', '→']} label="Rudder (steer)" alt="A / D" darkMode={darkMode} />
                <ControlRow keys={['↑', '↓']} label="Ease out / Sheet in" alt="W / S" darkMode={darkMode} />
                <ControlRow keys={['T']} label="Tack (turn through wind)" darkMode={darkMode} />
                <ControlRow keys={['G']} label="Gybe (turn downwind)" darkMode={darkMode} />
                <ControlRow keys={['Space']} label="Pause / Resume" darkMode={darkMode} />
              </div>
              <p className={`mt-3 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Use the transmitter sticks below the race area, or keyboard controls. The green line on the sail stick shows optimal trim.
              </p>
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

        {/* Transmitter stick controls */}
        <TransmitterSticks
          rudderInput={rudderInput}
          sheetAngle={sheetAngle}
          onRudderChange={setRudderInput}
          onSheetChange={setSheetAngle}
          darkMode={darkMode}
          optimalSheet={(() => {
            const p = gameState.boats.find(b => b.isPlayer);
            if (!p) return 0.5;
            const w = getWindAtTime(gameState.wind, gameState.time);
            const twa = getTrueWindAngle(p.heading, w.direction);
            return getOptimalSheet(twa);
          })()}
        />

        {/* Gamepad / Transmitter settings modal */}
        {showGamepadSettings && (
          <GamepadSettingsModal
            darkMode={darkMode}
            mapping={gamepadMapping}
            connected={gamepadConnected}
            onSave={(m) => { setGamepadMapping(m); saveGamepadMapping(m); }}
            onClose={() => setShowGamepadSettings(false)}
          />
        )}
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

function GamepadSettingsModal({
  darkMode,
  mapping,
  connected,
  onSave,
  onClose,
}: {
  darkMode: boolean;
  mapping: GamepadMapping;
  connected: boolean;
  onSave: (m: GamepadMapping) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<GamepadMapping>({ ...mapping });
  const [liveAxes, setLiveAxes] = useState<number[]>([]);
  const [gamepadName, setGamepadName] = useState('');
  const pollRef = useRef<number>(0);

  useEffect(() => {
    const poll = () => {
      const gamepads = navigator.getGamepads();
      const gp = Array.from(gamepads).find(g => g !== null);
      if (gp) {
        setLiveAxes([...gp.axes]);
        setGamepadName(gp.id);
      } else {
        setLiveAxes([]);
        setGamepadName('');
      }
      pollRef.current = requestAnimationFrame(poll);
    };
    pollRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(pollRef.current);
  }, []);

  const bg = darkMode ? 'bg-slate-900/95 border-slate-700' : 'bg-white/95 border-gray-200';
  const text = darkMode ? 'text-white' : 'text-gray-900';
  const subtext = darkMode ? 'text-slate-400' : 'text-gray-500';
  const inputBg = darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900';

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative ${bg} border rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 backdrop-blur-md`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-bold ${text}`}>Transmitter Settings</h3>
          <button onClick={onClose} className={`p-1 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>
            <span className={`text-xl leading-none ${subtext}`}>&times;</span>
          </button>
        </div>

        {/* Connection status */}
        <div className={`flex items-center gap-2 mb-4 p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
          <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-400'}`} />
          <div>
            <p className={`text-sm font-medium ${text}`}>
              {connected ? 'Transmitter Connected' : 'No Transmitter Detected'}
            </p>
            {gamepadName && (
              <p className={`text-xs ${subtext} truncate max-w-[280px]`}>{gamepadName}</p>
            )}
            {!connected && (
              <p className={`text-xs ${subtext}`}>Connect a USB transmitter and set it to joystick mode</p>
            )}
          </div>
        </div>

        {/* Live axis readout */}
        {liveAxes.length > 0 && (
          <div className={`mb-4 p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
            <p className={`text-xs font-medium mb-2 ${subtext}`}>Live Axis Values</p>
            <div className="grid grid-cols-4 gap-1.5">
              {liveAxes.slice(0, 8).map((val, i) => (
                <div key={i} className="text-center">
                  <div className={`text-[10px] ${subtext}`}>Axis {i}</div>
                  <div className={`text-xs font-mono ${Math.abs(val) > 0.1 ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : text}`}>
                    {val.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Axis mapping */}
        <div className="space-y-3">
          <div>
            <label className={`text-sm font-medium ${text}`}>Rudder Axis (Right Stick)</label>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={local.rudderAxis}
                onChange={e => setLocal({ ...local, rudderAxis: Number(e.target.value) })}
                className={`flex-1 px-3 py-1.5 rounded-lg border text-sm ${inputBg}`}
              >
                {Array.from({ length: Math.max(liveAxes.length, 4) }, (_, i) => (
                  <option key={i} value={i}>Axis {i}</option>
                ))}
              </select>
              <label className={`flex items-center gap-1.5 text-xs ${subtext}`}>
                <input
                  type="checkbox"
                  checked={local.rudderInverted}
                  onChange={e => setLocal({ ...local, rudderInverted: e.target.checked })}
                  className="rounded"
                />
                Invert
              </label>
            </div>
          </div>

          <div>
            <label className={`text-sm font-medium ${text}`}>Sail Axis (Left Stick)</label>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={local.sheetAxis}
                onChange={e => setLocal({ ...local, sheetAxis: Number(e.target.value) })}
                className={`flex-1 px-3 py-1.5 rounded-lg border text-sm ${inputBg}`}
              >
                {Array.from({ length: Math.max(liveAxes.length, 4) }, (_, i) => (
                  <option key={i} value={i}>Axis {i}</option>
                ))}
              </select>
              <label className={`flex items-center gap-1.5 text-xs ${subtext}`}>
                <input
                  type="checkbox"
                  checked={local.sheetInverted}
                  onChange={e => setLocal({ ...local, sheetInverted: e.target.checked })}
                  className="rounded"
                />
                Invert
              </label>
            </div>
          </div>

          <div>
            <label className={`text-sm font-medium ${text}`}>Deadzone</label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.01}
                value={local.deadzone}
                onChange={e => setLocal({ ...local, deadzone: Number(e.target.value) })}
                className="flex-1"
              />
              <span className={`text-xs font-mono w-10 ${subtext}`}>{local.deadzone.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border ${darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(local); onClose(); }}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Mapping
          </button>
        </div>
      </div>
    </div>
  );
}

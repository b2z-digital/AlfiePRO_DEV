import React from 'react';
import { GameState, Boat, RuleViolation } from './types';
import { getWindAtTime, getTack, getTrueWindAngle } from './physics';
import { Wind, Compass, Timer, TriangleAlert as AlertTriangle, Trophy, Gauge, Navigation } from 'lucide-react';

interface GameHUDProps {
  gameState: GameState;
  darkMode: boolean;
  onDismissViolation: () => void;
}

export function GameHUD({ gameState, darkMode, onDismissViolation }: GameHUDProps) {
  const player = gameState.boats.find(b => b.isPlayer);
  if (!player) return null;

  const currentWind = getWindAtTime(gameState.wind, gameState.time);
  const tack = getTack(player.heading, currentWind.direction);
  const twa = Math.abs(getTrueWindAngle(player.heading, currentWind.direction));

  const pointOfSail = getPointOfSail(twa);
  const position = getPlayerPosition(gameState.boats);

  return (
    <>
      {/* Top bar - Wind & Timer */}
      <div className={`absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none`}>
        {/* Wind info */}
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${darkMode ? 'bg-slate-900/90 border border-slate-700' : 'bg-white/90 border border-gray-200'} backdrop-blur-sm pointer-events-auto`}>
          <div className="flex items-center gap-1.5">
            <Wind size={14} className={darkMode ? 'text-cyan-400' : 'text-cyan-600'} />
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              {currentWind.speed.toFixed(0)} kts
            </span>
          </div>
          <div className={`w-px h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className="flex items-center gap-1.5">
            <Compass size={14} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              {((currentWind.direction + 180) % 360).toFixed(0)}°
            </span>
          </div>
        </div>

        {/* Timer / Countdown */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          gameState.phase === 'countdown' && gameState.countdown <= 10
            ? 'bg-red-900/90 border border-red-700'
            : darkMode ? 'bg-slate-900/90 border border-slate-700' : 'bg-white/90 border border-gray-200'
        } backdrop-blur-sm`}>
          <Timer size={14} className={
            gameState.phase === 'countdown' && gameState.countdown <= 10
              ? 'text-red-400'
              : darkMode ? 'text-emerald-400' : 'text-emerald-600'
          } />
          <span className={`text-sm font-mono font-bold ${
            gameState.phase === 'countdown' && gameState.countdown <= 10
              ? 'text-red-300'
              : darkMode ? 'text-white' : 'text-gray-900'
          }`}>
            {gameState.phase === 'countdown'
              ? `-${formatTime(gameState.countdown)}`
              : formatTime(gameState.time)
            }
          </span>
        </div>

        {/* Position */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode ? 'bg-slate-900/90 border border-slate-700' : 'bg-white/90 border border-gray-200'} backdrop-blur-sm`}>
          <Trophy size={14} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
          <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {position}/{gameState.boats.length}
          </span>
        </div>
      </div>

      {/* Bottom bar - Boat status */}
      <div className={`absolute bottom-3 left-3 flex items-center gap-3 px-3 py-2 rounded-lg ${darkMode ? 'bg-slate-900/90 border border-slate-700' : 'bg-white/90 border border-gray-200'} backdrop-blur-sm`}>
        <div className="flex items-center gap-1.5">
          <Gauge size={14} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
          <span className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
            {player.speed.toFixed(1)} kts
          </span>
        </div>
        <div className={`w-px h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
        <div className="flex items-center gap-1.5">
          <Navigation size={14} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
          <span className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
            {player.heading.toFixed(0)}°
          </span>
        </div>
        <div className={`w-px h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
        <div className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          tack === 'starboard'
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          {tack === 'starboard' ? 'STBD' : 'PORT'}
        </div>
        <div className={`w-px h-4 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
        <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          {pointOfSail}
        </span>
      </div>

      {/* Rule violation overlay */}
      {gameState.currentViolation && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`mx-4 max-w-md pointer-events-auto p-4 rounded-xl border-2 border-red-500 ${
            darkMode ? 'bg-slate-900/95' : 'bg-white/95'
          } backdrop-blur-md shadow-2xl shadow-red-500/20`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={20} className="text-red-500" />
              <span className="font-bold text-red-500">{gameState.currentViolation.rule}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                {gameState.currentViolation.ruleNumber}
              </span>
            </div>
            <p className={`text-sm mb-3 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              {gameState.currentViolation.description}
            </p>
            <button
              onClick={onDismissViolation}
              className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Got it - Continue Racing
            </button>
          </div>
        </div>
      )}

      {/* Finished overlay */}
      {gameState.phase === 'finished' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`mx-4 text-center pointer-events-auto p-6 rounded-xl ${
            darkMode ? 'bg-slate-900/95 border border-slate-700' : 'bg-white/95 border border-gray-200'
          } backdrop-blur-md shadow-2xl`}>
            <Trophy size={48} className="mx-auto mb-3 text-amber-500" />
            <h3 className={`text-2xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Race Finished!
            </h3>
            <p className={`text-lg mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              You finished in position <span className="font-bold text-amber-500">{position}</span> of {gameState.boats.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(Math.abs(seconds) / 60);
  const secs = Math.floor(Math.abs(seconds) % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getPointOfSail(twa: number): string {
  if (twa < 35) return 'In Irons';
  if (twa < 50) return 'Close Hauled';
  if (twa < 70) return 'Close Reach';
  if (twa < 110) return 'Beam Reach';
  if (twa < 140) return 'Broad Reach';
  if (twa < 170) return 'Running';
  return 'Dead Run';
}

function getPlayerPosition(boats: Boat[]): number {
  const player = boats.find(b => b.isPlayer);
  if (!player) return boats.length;

  // Sort by progress (rounding + distance to next mark)
  const sorted = [...boats].sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.rounding !== b.rounding) return b.rounding - a.rounding;
    // Further up the course (lower Y in our coordinate system = more upwind)
    return a.position.y - b.position.y;
  });

  return sorted.findIndex(b => b.isPlayer) + 1;
}

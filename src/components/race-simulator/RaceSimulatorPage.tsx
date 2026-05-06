import React, { useState } from 'react';
import { Scenario } from './types';
import { scenarios } from './scenarios';
import { RaceSimulatorGame } from './RaceSimulatorGame';
import { Wind, Flag, ArrowDown, RotateCw, Shuffle, Trophy, Gamepad2, Target, Zap, Brain } from 'lucide-react';

interface RaceSimulatorPageProps {
  darkMode: boolean;
}

const categoryIcons: Record<string, React.ReactNode> = {
  start: <Flag size={20} />,
  upwind: <Wind size={20} />,
  downwind: <ArrowDown size={20} />,
  'mark-rounding': <RotateCw size={20} />,
  rules: <Shuffle size={20} />,
  'full-race': <Trophy size={20} />,
};

const difficultyColors: Record<string, { bg: string; text: string; border: string }> = {
  beginner: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
  intermediate: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' },
  advanced: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/30' },
};

export default function RaceSimulatorPage({ darkMode }: RaceSimulatorPageProps) {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);

  if (selectedScenario) {
    return (
      <div className="h-[calc(100vh-64px)]">
        <RaceSimulatorGame
          scenario={selectedScenario}
          darkMode={darkMode}
          onBack={() => setSelectedScenario(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
              <Gamepad2 className="text-white" size={32} />
            </div>
            <div>
              <h1 className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Race Simulator
              </h1>
              <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Learn racing rules and tactics through interactive simulation
              </p>
            </div>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl flex items-start gap-4 ${
              darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'
            }`}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 flex-shrink-0">
                <Target className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Learn By Doing</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Practice starts, mark roundings, and tactical situations in a safe environment</p>
              </div>
            </div>
            <div className={`p-4 rounded-xl flex items-start gap-4 ${
              darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'
            }`}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 flex-shrink-0">
                <Brain className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Rules Explained</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>When rules apply, the game pauses and explains the relevant racing rule</p>
              </div>
            </div>
            <div className={`p-4 rounded-xl flex items-start gap-4 ${
              darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'
            }`}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 flex-shrink-0">
                <Zap className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Real Variables</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Wind shifts, gusts, dirty air, and AI opponents that race tactically</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scenarios */}
        <div className="mb-8">
          <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Choose a Scenario
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map(scenario => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                darkMode={darkMode}
                onClick={() => setSelectedScenario(scenario)}
              />
            ))}
          </div>
        </div>

        {/* Tips section */}
        <div className={`p-6 rounded-xl ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
          <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Quick Tips
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TipItem
              title="Sail close-hauled upwind"
              description="You can't sail directly into the wind. Sail at about 45 degrees to the wind and tack back and forth."
              darkMode={darkMode}
            />
            <TipItem
              title="Play the wind shifts"
              description="When the wind shifts toward you (header), tack. When it shifts away (lift), keep sailing - you're gaining ground."
              darkMode={darkMode}
            />
            <TipItem
              title="Starboard has right of way"
              description="On starboard tack (wind from the right), you have right of way over port-tack boats."
              darkMode={darkMode}
            />
            <TipItem
              title="Avoid dirty air"
              description="Sailing in the wind shadow of boats ahead slows you down significantly. Find clear air."
              darkMode={darkMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, darkMode, onClick }: { scenario: Scenario; darkMode: boolean; onClick: () => void }) {
  const difficulty = difficultyColors[scenario.difficulty];

  return (
    <button
      onClick={onClick}
      className={`text-left p-5 rounded-xl border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
        darkMode
          ? 'bg-slate-800/50 border-slate-700/50 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10'
          : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
          <span className={darkMode ? 'text-blue-400' : 'text-blue-600'}>
            {categoryIcons[scenario.category]}
          </span>
        </div>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${difficulty.bg} ${difficulty.text} ${difficulty.border}`}>
          {scenario.difficulty}
        </span>
      </div>
      <h3 className={`text-sm font-bold mb-1.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
        {scenario.name}
      </h3>
      <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
        {scenario.description}
      </p>
    </button>
  );
}

function TipItem({ title, description, darkMode }: { title: string; description: string; darkMode: boolean }) {
  return (
    <div className="flex gap-3">
      <div className={`w-1.5 rounded-full flex-shrink-0 ${darkMode ? 'bg-blue-500' : 'bg-blue-400'}`} />
      <div>
        <h4 className={`text-sm font-semibold mb-0.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{title}</h4>
        <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p>
      </div>
    </div>
  );
}

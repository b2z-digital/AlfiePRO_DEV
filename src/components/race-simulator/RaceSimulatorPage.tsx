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
    <div className={`min-h-full ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Hero section */}
      <div className={`relative overflow-hidden ${darkMode ? 'bg-gradient-to-br from-slate-800 via-slate-900 to-blue-900' : 'bg-gradient-to-br from-blue-50 via-white to-cyan-50'}`}>
        <div className="absolute inset-0 overflow-hidden">
          <div className={`absolute -top-1/2 -right-1/4 w-[600px] h-[600px] rounded-full blur-3xl ${darkMode ? 'bg-blue-900/20' : 'bg-blue-200/30'}`} />
          <div className={`absolute -bottom-1/2 -left-1/4 w-[400px] h-[400px] rounded-full blur-3xl ${darkMode ? 'bg-cyan-900/20' : 'bg-cyan-200/30'}`} />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
              <Gamepad2 size={28} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Race Simulator
              </h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Learn racing rules and tactics through interactive simulation
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <FeatureCard
              icon={<Target size={20} />}
              title="Learn By Doing"
              description="Practice starts, mark roundings, and tactical situations in a safe environment"
              darkMode={darkMode}
            />
            <FeatureCard
              icon={<Brain size={20} />}
              title="Rules Explained"
              description="When rules apply, the game pauses and explains the relevant racing rule"
              darkMode={darkMode}
            />
            <FeatureCard
              icon={<Zap size={20} />}
              title="Real Variables"
              description="Wind shifts, gusts, dirty air, and AI opponents that race tactically"
              darkMode={darkMode}
            />
          </div>
        </div>
      </div>

      {/* Scenarios */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className={`text-xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
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

        {/* Tips section */}
        <div className={`mt-10 p-6 rounded-xl ${darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white border border-gray-200'}`}>
          <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
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

function FeatureCard({ icon, title, description, darkMode }: { icon: React.ReactNode; title: string; description: string; darkMode: boolean }) {
  return (
    <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white/80 border border-gray-200'}`}>
      <div className={`mb-2 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{icon}</div>
      <h3 className={`text-sm font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{description}</p>
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
          ? 'bg-slate-800 border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10'
          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
          <span className={darkMode ? 'text-blue-400' : 'text-blue-600'}>
            {categoryIcons[scenario.category]}
          </span>
        </div>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${difficulty.bg} ${difficulty.text} ${difficulty.border}`}>
          {scenario.difficulty}
        </span>
      </div>
      <h3 className={`text-sm font-bold mb-1.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
        {scenario.name}
      </h3>
      <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
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
        <h4 className={`text-sm font-semibold mb-0.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h4>
        <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{description}</p>
      </div>
    </div>
  );
}

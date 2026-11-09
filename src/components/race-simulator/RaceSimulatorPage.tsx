// Race Simulator: home (set up a race, practise starts, your profile) → race → debrief.
// The racing itself runs on the engine in src/sim; this file only moves between the screens.
import { useCallback, useState } from 'react';
import type { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';
import SimHome, { DEFAULT_SETUP, Setup } from './SimHome';
import SimRace from './SimRace';
import SimDebrief from './SimDebrief';
import type { RaceSummary } from './stats';
import { Profile, loadProfile, saveRace } from './profile';

interface RaceSimulatorPageProps {
  darkMode: boolean;
}

const SETUP_KEY = 'alfie-race-sim-setup-v1';

function loadSetup(): Setup {
  try {
    const s = localStorage.getItem(SETUP_KEY);
    if (s) return { ...DEFAULT_SETUP, ...JSON.parse(s) };
  } catch { /* storage unavailable */ }
  return DEFAULT_SETUP;
}

function storeSetup(s: Setup) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

function toSettings(s: Setup, mode: 'race' | 'start'): RaceSettings {
  return {
    classId: s.classId, fleetSize: s.fleetSize, level: s.level,
    windStrength: s.windStrength, windCharacter: s.windCharacter,
    laps: mode === 'start' ? 1 : s.laps, length: s.length,
    sequenceSeconds: s.sequenceSeconds, coach: s.coach, autoTrim: s.autoTrim,
    forgetfulSkippers: s.forgetfulSkippers,
    seed: Math.floor(Math.random() * 1e9),
  };
}

export default function RaceSimulatorPage({ darkMode }: RaceSimulatorPageProps) {
  void darkMode; // the simulator is always on the water: one dark look
  const [view, setView] = useState<'home' | 'race' | 'debrief'>('home');
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [run, setRun] = useState<{ settings: RaceSettings; mode: 'race' | 'start'; key: number } | null>(null);
  const [debrief, setDebrief] = useState<{ race: Race; sum: RaceSummary } | null>(null);
  const [profile, setProfile] = useState<Profile>(loadProfile);

  const changeSetup = useCallback((s: Setup) => { setSetup(s); storeSetup(s); }, []);

  const start = useCallback((mode: 'race' | 'start', s: Setup) => {
    setRun({ settings: toSettings(s, mode), mode, key: Date.now() });
    setView('race');
  }, []);

  const again = useCallback(() => {
    if (run) start(run.mode, setup);
  }, [run, setup, start]);

  const toDebrief = useCallback((race: Race, sum: RaceSummary) => {
    setProfile(saveRace(sum));
    setDebrief({ race, sum });
    setView('debrief');
  }, []);

  if (view === 'race' && run) {
    return (
      <div className="h-[calc(100vh-64px)]">
        <SimRace
          key={run.key}
          settings={run.settings}
          mode={run.mode}
          coach={setup.coach}
          onCoachChange={m => changeSetup({ ...setup, coach: m })}
          onHome={() => setView('home')}
          onDebrief={toDebrief}
          onAgain={again}
        />
      </div>
    );
  }

  if (view === 'debrief' && debrief) {
    return (
      <div className="h-full overflow-y-auto">
        <SimDebrief race={debrief.race} sum={debrief.sum} onHome={() => setView('home')} onAgain={again} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <SimHome setup={setup} onSetup={changeSetup} onStart={start} profile={profile} onProfileCleared={() => setProfile(loadProfile())} />
    </div>
  );
}

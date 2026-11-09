// Race Simulator: home (set up a race, the Start Trainer, Rules Academy and Scenario Lab, your
// profile) → race or training scene → debrief. Racing fills the whole window, above the app's
// navigation; "Main Menu" brings you back. The racing itself runs on the engine in src/sim; this
// file only moves between the screens and keeps your settings and progress.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Race } from '@/sim/engine';
import type { RaceSettings } from '@/sim/types';
import type { Outcome, SceneSpec } from '@/sim/training';
import { DRILLS, LAB, MODULES, findDrill, findMoment, findScene } from '@/sim/training';
import SimHome, { DEFAULT_SETUP, Setup } from './SimHome';
import SimRace, { ActiveScene, SimView } from './SimRace';
import SimDebrief, { TrainLink } from './SimDebrief';
import SimTrainer from './SimTrainer';
import SimAcademy from './SimAcademy';
import SimLab from './SimLab';
import type { RaceSummary } from './stats';
import { Profile, loadProfile, saveRace } from './profile';
import { TrainingProgress, loadTraining, recordAnswer, recordScene } from './progress';
import { C } from './ui';

interface RaceSimulatorPageProps {
  darkMode: boolean;
}

// v2: the new defaults (sails on your stick, choppy water, the bank view). Old v1 settings are
// carried over except auto-trim, which now starts off.
const SETUP_KEY = 'alfie-race-sim-setup-v2';
const SETUP_KEY_V1 = 'alfie-race-sim-setup-v1';

function loadSetup(): Setup {
  try {
    const s = localStorage.getItem(SETUP_KEY);
    if (s) return { ...DEFAULT_SETUP, ...JSON.parse(s) };
    const v1 = localStorage.getItem(SETUP_KEY_V1);
    if (v1) { const o = JSON.parse(v1); delete o.autoTrim; return { ...DEFAULT_SETUP, ...o }; }
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
    forgetfulSkippers: s.forgetfulSkippers, seaState: s.seaState,
    seed: Math.floor(Math.random() * 1e9),
  };
}

type Where = 'home' | 'trainer' | 'academy' | 'lab' | 'race' | 'debrief';
type Group = ActiveScene['group'];

const GROUP_PAGE: Record<Group, Where> = { 'Start Trainer': 'trainer', 'Rules Academy': 'academy', 'Scenario Lab': 'lab' };

/** The next thing to try after a scene: the next drill, situation you can sail, or lab moment. */
function nextAfter(spec: SceneSpec): { spec: SceneSpec; label: string } | null {
  if (spec.kind === 'drill') {
    const i = DRILLS.findIndex(d => d.id === spec.id);
    const n = DRILLS[i + 1];
    return n ? { spec: n, label: `Next drill: ${n.title}` } : null;
  }
  if (spec.kind === 'lab') {
    const i = LAB.findIndex(m => m.id === spec.id);
    const n = LAB[i + 1];
    return n ? { spec: n, label: `Next: ${n.title}` } : null;
  }
  const ids = MODULES.flatMap(m => m.situations.filter(s => s.play).map(s => `${m.id}/${s.id}`));
  const i = ids.indexOf(spec.id);
  const n = ids[i + 1] ? findScene('lesson', ids[i + 1]) : null;
  return n ? { spec: n, label: `Next: ${n.title}` } : null;
}

export default function RaceSimulatorPage({ darkMode }: RaceSimulatorPageProps) {
  void darkMode; // the simulator is always on the water: one dark look
  const [where, setWhere] = useState<Where>('home');
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [run, setRun] = useState<{ settings?: RaceSettings; scene?: ActiveScene; mode: 'race' | 'start' | 'scene'; key: number } | null>(null);
  const [debrief, setDebrief] = useState<{ race: Race; sum: RaceSummary } | null>(null);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [training, setTraining] = useState<TrainingProgress>(loadTraining);
  const [academyAt, setAcademyAt] = useState<string | null>(null);
  // The view for this race or scene: your saved choice, but lessons open from above, where the
  // situation reads like the diagram. Switching with V in a lesson doesn't change your saved view.
  const [runView, setRunView] = useState<SimView>(setup.view);

  const changeSetup = useCallback((s: Setup) => { setSetup(s); storeSetup(s); }, []);
  const changeView = useCallback((v: SimView) => {
    setRunView(v);
    if (run?.scene?.spec.kind === 'lesson') return;
    setSetup(s => { const n = { ...s, view: v }; storeSetup(n); return n; });
  }, [run]);

  const start = useCallback((mode: 'race' | 'start', s: Setup) => {
    setRun({ settings: toSettings(s, mode), mode, key: Date.now() });
    setRunView(s.view);
    setWhere('race');
  }, []);

  const playScene = useCallback((spec: SceneSpec, group: Group, watch: boolean) => {
    const drill = spec.kind === 'drill' ? findDrill(spec.id) : null;
    const rec = drill ? training.drills[drill.id] : null;
    const next = nextAfter(spec);
    // Watching plays a seed the demo is known to win on; trying it yourself gets a fresh one.
    const seed = watch && spec.demoSeeds?.length ? spec.demoSeeds[0] : Math.floor(Math.random() * 1e6) + 1;
    const scene: ActiveScene = {
      spec, seed, watch, group,
      higherIsBetter: drill?.higherIsBetter, scoreText: drill?.scoreText,
      best: drill && rec?.best != null ? drill.scoreText(rec.best) : null,
      nextLabel: next?.label, autoTrim: setup.autoTrim,
    };
    if (spec.kind === 'lesson') setAcademyAt(spec.id);
    setRun({ scene, mode: 'scene', key: Date.now() });
    setRunView(spec.kind === 'lesson' ? 'top' : setup.view);
    setWhere('race');
  }, [training, setup]);

  const again = useCallback(() => {
    if (!run) return;
    if (run.scene) playScene(run.scene.spec, run.scene.group, false);
    else start(run.mode === 'start' ? 'start' : 'race', setup);
  }, [run, setup, start, playScene]);

  const toDebrief = useCallback((race: Race, sum: RaceSummary) => {
    setProfile(saveRace(sum));
    setDebrief({ race, sum });
    setWhere('debrief');
  }, []);

  const sceneResult = useCallback((o: Outcome) => {
    if (!run?.scene) return;
    setTraining(recordScene(run.scene.spec, o, run.scene.higherIsBetter));
  }, [run]);

  const openLink = useCallback((l: TrainLink) => {
    if (l.kind === 'lesson') { setAcademyAt(l.id); setWhere('academy'); return; }
    const spec = l.kind === 'drill' ? findDrill(l.id) : findMoment(l.id);
    if (spec) playScene(spec, l.kind === 'drill' ? 'Start Trainer' : 'Scenario Lab', false);
  }, [playScene]);

  const leaveRace = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setWhere(run?.scene ? GROUP_PAGE[run.scene.group] : 'home');
  }, [run]);

  // Racing fills the window: no page scrolling underneath it.
  useEffect(() => {
    if (where !== 'race') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [where]);

  if (where === 'race' && run) {
    const scene = run.scene;
    return createPortal(
      <div className="fixed inset-0 z-[9990]" style={{ background: C.bg }} role="dialog" aria-modal="true" aria-label={scene ? scene.spec.title : 'Race'}>
        <SimRace
          key={run.key}
          settings={run.settings}
          scene={scene}
          mode={run.mode}
          coach={setup.coach}
          onCoachChange={m => changeSetup({ ...setup, coach: m })}
          view={runView}
          onViewChange={changeView}
          onHome={leaveRace}
          onDebrief={toDebrief}
          onAgain={again}
          onSceneResult={sceneResult}
          onSceneWatch={scene?.spec.solution ? () => playScene(scene.spec, scene.group, true) : undefined}
          onSceneNext={scene ? () => { const n = nextAfter(scene.spec); if (n) playScene(n.spec, scene.group, false); else leaveRace(); } : undefined}
        />
      </div>,
      document.body,
    );
  }

  if (where === 'debrief' && debrief) {
    return (
      <div className="h-full overflow-y-auto">
        <SimDebrief race={debrief.race} sum={debrief.sum} onHome={() => setWhere('home')} onAgain={again} onLink={openLink} />
      </div>
    );
  }

  if (where === 'trainer') {
    return (
      <div className="h-full overflow-y-auto">
        <SimTrainer progress={training} onPlay={d => playScene(d, 'Start Trainer', false)} onFullStart={() => start('start', setup)} onBack={() => setWhere('home')} />
      </div>
    );
  }

  if (where === 'academy') {
    return (
      <div className="h-full overflow-y-auto">
        <SimAcademy progress={training} initial={academyAt}
          onAnswer={(id, ok) => setTraining(recordAnswer(id, ok))}
          onPlay={(id, watch) => { const spec = findScene('lesson', id); if (spec) playScene(spec, 'Rules Academy', watch); }}
          onBack={() => setWhere('home')} />
      </div>
    );
  }

  if (where === 'lab') {
    return (
      <div className="h-full overflow-y-auto">
        <SimLab progress={training} onPlay={(id, watch) => { const m = findMoment(id); if (m) playScene(m, 'Scenario Lab', watch); }} onBack={() => setWhere('home')} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <SimHome setup={setup} onSetup={changeSetup} onStart={start} profile={profile} onProfileCleared={() => setProfile(loadProfile())}
        training={training} onOpen={w => setWhere(w)} />
    </div>
  );
}

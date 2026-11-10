// Race Simulator: home (set up a race, the Start Trainer, Rules Academy and Scenario Lab, your
// profile) → race or training scene → debrief. Racing fills the whole window, above the app's
// navigation; "Main Menu" brings you back. The racing itself runs on the engine in src/sim; this
// file only moves between the screens and keeps your settings and progress.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Race, RaceLog } from '@/sim/engine';
import { DT } from '@/sim/physics';
import type { Moment } from './moments';
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
import { Profile, loadProfile, mergeRaces, saveRace } from './profile';
import { TrainingProgress, loadTraining, recordAnswer, recordScene, saveTraining } from './progress';
import { Account, clearRaces, pullRaces, pushRace, syncTraining } from './sync';
import { SimIdentity, loadIdentity } from './identity';
import { C, ordinal } from './ui';
import { VENUES } from '@/sim/venues';
import { VenueWind, fetchVenueWind } from './venueWind';
import { Challenge, ChallengeEntry, createChallenge, entryLog, listChallenges, submitEntry } from './challenges';
import SimChallenge from './SimChallenge';
import { raceFacts, writeUp } from './writeup';
import { SimSequence, chosenSequence, loadClubSequences } from './startbox';

interface RaceSimulatorPageProps {
  darkMode: boolean;
  /** The signed-in member, to sail under their own name and sail number and keep progress in their
   *  account; `admin` when they can set challenges for their club, `superAdmin` for every club. */
  account?: (Account & { admin?: boolean; superAdmin?: boolean }) | null;
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

function toSettings(s: Setup, mode: 'race' | 'start', today: VenueWind | null, me: SimIdentity | null, seq: SimSequence | null = null): RaceSettings {
  // At a venue: its usual breeze, today's wind there (direction and strength), or any direction.
  const def = s.venue !== 'pond' ? VENUES[s.venue] : undefined;
  const live = def && s.windDir === 'today' && today ? today : null;
  const windFrom = !def ? undefined : live ? live.from : s.windDir === 'any' ? Math.floor(Math.random() * 360) : def.usualWind;
  return {
    venue: def?.id, windFrom, windKnots: live ? live.kn : undefined,
    // Your own name, and your sail number when you have a boat in this class.
    player: me ? { name: me.name, sail: me.sails[s.classId] ?? '01' } : undefined,
    classId: s.classId, fleetSize: s.fleetSize, level: s.level,
    windStrength: s.windStrength, windCharacter: s.windCharacter,
    laps: mode === 'start' ? 1 : s.laps, length: s.length,
    sequenceSeconds: seq ? seq.seconds : s.sequenceSeconds, coach: s.coach, autoTrim: s.autoTrim,
    forgetfulSkippers: s.forgetfulSkippers, seaState: s.seaState,
    seed: Math.floor(Math.random() * 1e9),
  };
}

type Where = 'home' | 'trainer' | 'academy' | 'lab' | 'race' | 'debrief' | 'challenge';

/** The race of a challenge, sailed by you: the same race as everyone's, under your own name and number. */
function challengeSettings(c: Challenge, me: SimIdentity | null, autoTrim: boolean): RaceSettings {
  return { ...c.settings, autoTrim, player: me ? { name: me.short, sail: me.sails[c.settings.classId] ?? '01' } : undefined };
}
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

export default function RaceSimulatorPage({ darkMode, account = null }: RaceSimulatorPageProps) {
  void darkMode; // the simulator is always on the water: one dark look
  const [where, setWhere] = useState<Where>('home');
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [run, setRun] = useState<{
    settings?: RaceSettings; scene?: ActiveScene; mode: 'race' | 'start' | 'scene'; key: number; resume?: { log: RaceLog; step: number };
    challenge?: Challenge; ghost?: { log: RaceLog; settings: RaceSettings; label: string };
    /** The StartBox sequence to play with the countdown. */
    sequence?: SimSequence | null;
  } | null>(null);
  const [debrief, setDebrief] = useState<{ race: Race; sum: RaceSummary; moments: Moment[]; challenge?: Challenge } | null>(null);
  // Challenges you can see, the one open, and how your last go at one went.
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [openCh, setOpenCh] = useState<Challenge | null>(null);
  const [chNote, setChNote] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [training, setTraining] = useState<TrainingProgress>(loadTraining);
  const [academyAt, setAcademyAt] = useState<string | null>(null);
  // The view for this race or scene: your saved choice, but lessons open from above, where the
  // situation reads like the diagram. Switching with V in a lesson doesn't change your saved view.
  const [runView, setRunView] = useState<SimView>(setup.view);
  // Today's wind at the venue, fetched when you choose it.
  const [today, setToday] = useState<VenueWind | 'loading' | 'failed' | null>(null);
  useEffect(() => {
    const def = setup.venue !== 'pond' ? VENUES[setup.venue] : undefined;
    if (!def || setup.windDir !== 'today') return;
    let live = true;
    setToday(t => (t && t !== 'failed' ? t : 'loading'));
    void fetchVenueWind(def).then(r => { if (live) setToday(r ?? 'failed'); });
    return () => { live = false; };
  }, [setup.venue, setup.windDir]);
  const todayWind = today && today !== 'loading' && today !== 'failed' ? today : null;

  // Signed in: who you are (name and sail numbers), and your races and training from your account.
  const [me, setMe] = useState<SimIdentity | null>(null);
  const [synced, setSynced] = useState(false);
  const userId = account?.userId ?? null, clubId = account?.clubId ?? null;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const a = { userId, clubId };
    void loadIdentity(userId, clubId).then(id => { if (live) setMe(id); });
    void pullRaces(a).then(rs => { if (live && rs) { setProfile(mergeRaces(rs)); setSynced(true); } });
    void syncTraining(a, loadTraining()).then(t => { if (live && t) setTraining(saveTraining(t)); });
    return () => { live = false; };
  }, [userId, clubId]);
  // The club's StartBox sequences: the race starts with the club's own unless you choose otherwise.
  const [sequences, setSequences] = useState<SimSequence[]>([]);
  useEffect(() => {
    let live = true;
    void loadClubSequences(clubId).then(q => { if (live) setSequences(q); });
    return () => { live = false; };
  }, [clubId]);
  const startSeq = chosenSequence(sequences, setup.startSeq);
  const refreshChallenges = useCallback(() => {
    if (!userId) return;
    void listChallenges().then(cs => setChallenges(cs));
  }, [userId]);
  useEffect(() => { refreshChallenges(); }, [refreshChallenges]);
  const trainingChanged = useCallback((t: TrainingProgress) => {
    setTraining(t);
    if (userId) void syncTraining({ userId, clubId }, t);
  }, [userId, clubId]);

  const changeSetup = useCallback((s: Setup) => { setSetup(s); storeSetup(s); }, []);
  const changeView = useCallback((v: SimView) => {
    setRunView(v);
    if (run?.scene?.spec.kind === 'lesson') return;
    setSetup(s => { const n = { ...s, view: v }; storeSetup(n); return n; });
  }, [run]);

  const start = useCallback((mode: 'race' | 'start', s: Setup) => {
    const seq = chosenSequence(sequences, s.startSeq);
    setRun({ settings: toSettings(s, mode, todayWind, me, seq), mode, key: Date.now(), sequence: seq });
    setRunView(s.view);
    setWhere('race');
  }, [todayWind, me, sequences]);

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

  const toDebrief = useCallback((race: Race, sum: RaceSummary, moments: Moment[]) => {
    setProfile(saveRace(sum));
    const ch = run?.challenge;
    if (userId) {
      const a = { userId, clubId };
      void pushRace(a, sum, race.settings);
      // A challenge: your best goes on the leaderboard, with your race log for your ghost.
      // (Not when you took over part way through: that's practice.)
      if (ch && !run?.resume) {
        setChNote('Putting your result on the leaderboard…');
        void submitEntry(a, ch, { name: me?.short ?? 'AlfiePRO sailor', sail: race.player?.sail ?? null }, sum, race.log, race.settings).then(r => {
          if (!r) setChNote("Couldn't save to the leaderboard just now.");
          else if (r.rank === null) setChNote(r.saved ? 'Saved to the leaderboard.' : 'Your best result stays on the leaderboard.');
          else setChNote(`${r.saved ? 'On the leaderboard' : 'Your best stays'}: ${r.rank === 1 ? 'top' : ordinal(r.rank)} of ${r.of}.`);
        });
      } else setChNote(ch ? 'Taken over part way through, so this one is practice: it doesn\'t go on the leaderboard.' : null);
    }
    setDebrief({ race, sum, moments, challenge: ch });
    setWhere('debrief');
  }, [userId, clubId, run, me]);

  // Sail a challenge, against nobody or against an entry's ghost.
  const sailChallenge = useCallback(async (c: Challenge, ghostOf: ChallengeEntry | null) => {
    let ghost: { log: RaceLog; settings: RaceSettings; label: string } | undefined;
    if (ghostOf) {
      const g = await entryLog(ghostOf.id);
      if (g) ghost = { log: g, settings: g.settings, label: `Ghost · ${ghostOf.display_name}` };
    }
    // The club's sequence plays along if it's the challenge's length; otherwise the simulator calls it.
    const seq = startSeq && startSeq.seconds === c.settings.sequenceSeconds ? startSeq : null;
    setRun({ settings: challengeSettings(c, me, setup.autoTrim), mode: 'race', key: Date.now(), challenge: c, ghost, sequence: seq });
    setRunView(setup.view);
    setWhere('race');
  }, [me, setup.autoTrim, setup.view, startSeq]);

  const again = useCallback(() => {
    if (!run) return;
    if (run.scene) playScene(run.scene.spec, run.scene.group, false);
    else if (run.challenge) void sailChallenge(run.challenge, null);
    else start(run.mode === 'start' ? 'start' : 'race', setup);
  }, [run, setup, start, playScene, sailChallenge]);

  const setChallenge = useCallback(async (c: { title: string; description: string; days: number | null; everyone: boolean }): Promise<string | null> => {
    if (!userId) return 'Sign in to set a challenge.';
    const settings = toSettings(setup, 'race', todayWind, null, startSeq);
    const r = await createChallenge({ userId, clubId }, {
      clubId: c.everyone ? null : clubId, title: c.title, description: c.description, settings,
      closesAt: c.days ? new Date(Date.now() + c.days * 864e5) : null,
    });
    if (typeof r === 'string') return /row-level security/i.test(r) ? "Only the club's admins can set its challenges." : r;
    refreshChallenges();
    setOpenCh(r); setWhere('challenge');
    return null;
  }, [userId, clubId, setup, todayWind, refreshChallenges, startSeq]);

  // Sail a finished race again from a moment: the same settings (and seed) and your log up to
  // there, then you have the helm.
  const takeOver = useCallback((t: number) => {
    if (!debrief) return;
    const r = debrief.race;
    setRun({ settings: r.settings, mode: debrief.sum.mode, key: Date.now(), resume: { log: r.log, step: Math.max(0, Math.round(t / DT)) }, challenge: debrief.challenge, sequence: startSeq && startSeq.seconds === r.settings.sequenceSeconds ? startSeq : null });
    setRunView(setup.view);
    setWhere('race');
  }, [debrief, setup.view, startSeq]);

  const sceneResult = useCallback((o: Outcome) => {
    if (!run?.scene) return;
    trainingChanged(recordScene(run.scene.spec, o, run.scene.higherIsBetter));
  }, [run, trainingChanged]);

  const openLink = useCallback((l: TrainLink) => {
    if (l.kind === 'lesson') { setAcademyAt(l.id); setWhere('academy'); return; }
    const spec = l.kind === 'drill' ? findDrill(l.id) : findMoment(l.id);
    if (spec) playScene(spec, l.kind === 'drill' ? 'Start Trainer' : 'Scenario Lab', false);
  }, [playScene]);

  const leaveRace = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setWhere(run?.scene ? GROUP_PAGE[run.scene.group] : run?.challenge ? 'challenge' : 'home');
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
          resume={run.resume}
          ghost={run.ghost}
          sequence={run.sequence ?? null}
        />
      </div>,
      document.body,
    );
  }

  if (where === 'debrief' && debrief) {
    return (
      <div className="h-full overflow-y-auto">
        <SimDebrief race={debrief.race} sum={debrief.sum} moments={debrief.moments} onHome={() => setWhere('home')} onAgain={again} onLink={openLink} onTakeOver={takeOver}
          challenge={debrief.challenge ? { title: debrief.challenge.title, note: chNote, onOpen: () => { setOpenCh(debrief.challenge!); setWhere('challenge'); } } : null}
          onWriteUp={userId ? () => writeUp(raceFacts(debrief.sum, debrief.moments, debrief.race.gunT, debrief.race.venue ? `${debrief.race.venue.def.name}, ${debrief.race.venue.def.place}` : 'the practice pond'), clubId) : undefined} />
      </div>
    );
  }

  if (where === 'challenge' && openCh) {
    return (
      <div className="h-full overflow-y-auto">
        <SimChallenge challenge={openCh} me={userId} onSail={e => void sailChallenge(openCh, e)} onBack={() => { refreshChallenges(); setWhere('home'); }} />
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
          onAnswer={(id, ok) => trainingChanged(recordAnswer(id, ok))}
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
      <SimHome setup={setup} onSetup={changeSetup} onStart={start} profile={profile}
        onProfileCleared={() => { setProfile(loadProfile()); if (userId) void clearRaces({ userId, clubId }); }}
        training={training} onOpen={w => setWhere(w)} today={setup.windDir === 'today' ? today : null} me={me} synced={synced}
        challenges={userId ? challenges : null} onChallenge={c => { setOpenCh(c); setWhere('challenge'); }}
        canSet={account?.admin || account?.superAdmin ? { everyone: !!account.superAdmin } : null} onCreateChallenge={setChallenge}
        sequences={sequences} startSeq={startSeq} />
    </div>
  );
}

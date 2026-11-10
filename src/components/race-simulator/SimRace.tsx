// The race screen: runs the engine at a fixed 20 Hz, draws the water every frame, and floats the
// HUD over it (wind, clock, line or course, fleet, coach, boat strip, sticks). Rules moments pause
// the race in full-coach mode. Keyboard, transmitter and on-screen sticks all steer.
// The same screen runs drills, rules lessons and lab moments: a scene with a goal and a result.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Race, RaceLog } from '@/sim/engine';
import { LEVELS, PERSONAS, Skipper } from '@/sim/ai';
import { Rng } from '@/sim/math';
import type { Boat, Incident, RaceSettings } from '@/sim/types';
import { DT } from '@/sim/physics';
import { dir, dist, n180 } from '@/sim/math';
import { GoalCtx, Outcome, WorldOverlay, buildScene, goalCtx } from '@/sim/scene';
import type { SceneSpec } from '@/sim/training';
import { CoachMode, Cue, LineInfo, WindMemory, coachCue, lineInfo, pointOfSail, trimAdvice } from './coach';
import { Camera, drawRace } from './render';
import { BankCam, drawBank, followCam, newBankCam } from './bank';
import { Controls, GamepadMapping, loadMapping, saveMapping } from './input';
import { RaceAudio } from './audio';
import { PlayerLog, RaceSummary, fmt, summarize } from './stats';
import { SequencePlayer, SimSequence } from './startbox';
import { Moment, findMoments } from './moments';
import {
  BoatStrip, ClockCard, CoachCard, ControlsCard, CourseCard, FleetCard, FleetRow, GoalCard, HintBanner, LineCard, PenaltyProgress, ReplayBar,
  ResultRowView, ResultsOverlay, RuleSheet, RulesMomentPanel, SceneResult, Toast, Toasts, WindCard,
} from './hud';
import GamepadModal from './GamepadModal';
import CourseMap from './CourseMap';
import { AlfieOrb, Btn, C, Chip, Hud, Seg, clock, compassName, cx, ordinal } from './ui';

export type SimView = 'bank' | 'top';

const NO_OVERLAYS: WorldOverlay[] = [];

/** A drill, lesson or lab moment to play. */
export interface ActiveScene {
  spec: SceneSpec;
  seed: number;
  /** Your boat is sailed the right way, for you to watch. */
  watch: boolean;
  group: 'Start Trainer' | 'Rules Academy' | 'Scenario Lab';
  higherIsBetter?: boolean;
  scoreText?: (v: number) => string;
  best?: string | null;
  nextLabel?: string;
  /** Your auto-trim setting from the home screen (scenes are set up with it on). */
  autoTrim?: boolean;
}

export interface SimRaceProps {
  settings?: RaceSettings;
  scene?: ActiveScene;
  mode: 'race' | 'start' | 'scene';
  coach: CoachMode;
  onCoachChange: (m: CoachMode) => void;
  /** From the bank, the way you see a race from the control area, or from above. */
  view: SimView;
  onViewChange: (v: SimView) => void;
  onHome: () => void;
  onDebrief?: (race: Race, sum: RaceSummary, moments: Moment[]) => void;
  /** Sail a race again from its log up to a step, then take over from there. */
  resume?: { log: RaceLog; step: number };
  /** Race another member's ghost: their race sails again alongside yours, and their boat is drawn faint in yours. */
  ghost?: { log: RaceLog; settings: RaceSettings; label: string };
  /** The club's StartBox sequence, played in step with the countdown instead of the simulator's own calls. */
  sequence?: SimSequence | null;
  onAgain: () => void;
  /** Scenes: a result to record, watch the right way, the next one. */
  onSceneResult?: (o: Outcome) => void;
  onSceneWatch?: () => void;
  onSceneNext?: () => void;
}

interface HudState {
  T: number; raceT: number; preStart: boolean;
  wind: { kn: number; from: number; spark: number[]; swing: number };
  line: LineInfo | null;
  course: { leg: string; legNo: number; legs: number; next: string; distL: number | null; place: number; of: number; status: string | null };
  fleet: FleetRow[];
  boat: { tack: 'Starboard' | 'Port'; pos: string; spdPct: number; kn: number; trim: string };
  rudder: number; sheet: number; twa: number;
  /** The penalty turn you owe, and how far round you are (null when you owe none). */
  penalty: PenaltyProgress | null; finished: boolean;
  goal: { progress: string | null; timeLeft: number | null } | null;
}

const KN = 0.514444;
const REPLAY_MAX = 200; // steps of history kept for the instant replay (10 s)

function legLabel(race: Race, idx: number): string {
  const leg = race.course.legs[idx];
  if (!leg) return 'Finished';
  return leg.name;
}

function nextTarget(race: Race, p: Boat): { x: number; y: number; name: string; upwind: boolean; isMark: boolean } | null {
  const c = race.course;
  const legIdx = p.started ? p.legIndex : 0;
  const leg = c.legs[legIdx];
  if (!leg) return null;
  if (leg.kind === 'mark') { const m = c.byId[leg.rounding.markId]; return { x: m.p.x, y: m.p.y, name: m.name, upwind: leg.upwind, isMark: true }; }
  if (leg.kind === 'gate') {
    const a = c.byId[leg.options[0].markId], b = c.byId[leg.options[1].markId];
    const m = dist(a.p, p) <= dist(b.p, p) ? a : b;
    return { x: m.p.x, y: m.p.y, name: 'the gate', upwind: false, isMark: true };
  }
  return { x: (c.finish.pin.x + c.finish.stbd.x) / 2, y: (c.finish.pin.y + c.finish.stbd.y) / 2, name: 'the finish', upwind: true, isMark: false };
}

/** How urgent a coaching line is: rule risks first, then start timing near the gun, then the rest. */
function urgency(c: Cue, T: number): number {
  if (c.tone === 'warn' || c.topic === 'Rules') return 3;
  if (c.topic === 'The start' && T < 30) return 2;
  return 1;
}

export default function SimRace({ settings, scene, mode, coach, onCoachChange, view, onViewChange, onHome, onDebrief, onAgain, onSceneResult, onSceneWatch, onSceneNext, resume, ghost, sequence = null }: SimRaceProps) {
  const built = useMemo(() => {
    if (!scene) return null;
    const b = buildScene(scene.spec.scene(scene.seed), scene.seed, scene.watch ? scene.spec.solution : undefined);
    // Sail it your way: the sails follow your stick unless you've turned auto-trim on.
    if (!scene.watch && scene.autoTrim !== undefined) b.race.settings.autoTrim = scene.autoTrim;
    return b;
  }, [scene]);
  const race = useMemo(() => {
    if (built) return built.race;
    const r = new Race(settings!);
    // Taking over from a moment: the race sails itself again exactly as it went, up to there.
    if (resume) r.followLog(resume.log, resume.step);
    return r;
  }, [built, settings, resume]);
  // The club's start sequence, playing against the race clock.
  const seqPlayer = useMemo(() => (sequence && !scene ? new SequencePlayer(sequence) : null), [sequence, scene]);
  useEffect(() => () => seqPlayer?.stop(), [seqPlayer]);
  // The ghost's own race, a step behind nobody: it steps with yours.
  const ghostRace = useMemo(() => {
    if (!ghost) return null;
    const g = new Race(ghost.settings);
    g.followLog(ghost.log);
    return g;
  }, [ghost]);
  // While it catches up, how far it has to go; then a word before you take the helm.
  const [catchUp, setCatchUp] = useState<{ to: number; at: number } | null>(() => (resume ? { to: resume.step, at: 0 } : null));
  const [tookOver, setTookOver] = useState<number | null>(null);
  // Stable when there are none: a new [] each render would restart the race loop every frame.
  const overlays: WorldOverlay[] = built?.overlays ?? NO_OVERLAYS;
  useEffect(() => {
    // Development only: let a test or the console reach the race, and hand the player's boat to an AI helm.
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __simRace?: Race; __simAutopilot?: () => void };
    w.__simRace = race;
    w.__simAutopilot = () => {
      const p = race.player; if (!p) return;
      const i = race.boats.indexOf(p);
      p.persona = { ...PERSONAS[2] };
      (race.skippers as (Skipper | null)[])[i] = new Skipper(p, LEVELS[race.settings.level], p.persona, new Rng(race.settings.seed + 7), i);
      race.autopilot = true;
    };
  }, [race]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctl = useRef(new Controls()).current;
  const audio = useRef(new RaceAudio()).current;
  const mem = useRef(new WindMemory()).current;
  const log = useRef(new PlayerLog()).current;
  const cam = useRef<Camera>({ x: 0, y: -4, scale: 30 }).current;
  const bcam = useRef<BankCam>(newBankCam()).current;
  // The canvas: its size in CSS pixels, and its resolution (lowered on a device that can't keep up).
  const size = useRef<{ w: number; h: number; dpr: number; maxDpr: number; refit?: () => void }>({ w: 800, h: 600, dpr: 1, maxDpr: 2 }).current;
  const flashes = useRef<{ x: number; y: number; t: number }[]>([]).current;
  const goalMemo = useRef<GoalCtx['memo']>({}).current;

  const [hud, setHud] = useState<HudState | null>(null);
  const [cue, setCue] = useState<Cue | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (!paused) setTookOver(null); }, [paused]);
  const [moment, setMoment] = useState<Incident | null>(null);
  const [banner, setBanner] = useState<Incident | null>(null);
  const [replay, setReplay] = useState<{ back: number; playing: boolean } | null>(null);
  const [results, setResults] = useState<{ rows: ResultRowView[]; live: boolean; title: string } | null>(null);
  const [sceneOut, setSceneOut] = useState<Outcome | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [padOpen, setPadOpen] = useState(false);
  const [mapping, setMapping] = useState<GamepadMapping>(loadMapping);
  const [ruleSheet, setRuleSheet] = useState<string | null>(null);
  const [coachHidden, setCoachHidden] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fast, setFast] = useState(false);
  const [laylines, setLaylines] = useState(true);
  const [follow, setFollow] = useState(true);
  const [zoom, setZoom] = useState(scene ? 1.25 : 1);
  const [glance, setGlance] = useState(false);
  const [full, setFull] = useState(false);

  // Mirrors of state for the animation loop.
  const R = useRef({ paused, replay, coach, mapping, fast, laylines, follow, zoom, view, glance, ended: false, playerDoneAt: -1, evIdx: 0, toastId: 0, cueAt: -9, cueChangedAt: -99, resultsAt: -9, cue: null as Cue | null });
  R.current.paused = paused; R.current.replay = replay; R.current.coach = coach; R.current.mapping = mapping;
  R.current.fast = fast; R.current.laylines = laylines; R.current.follow = follow; R.current.zoom = zoom;
  R.current.view = view; R.current.glance = glance;
  useEffect(() => { audio.muted = muted; if (muted) audio.stop(); }, [muted, audio]);
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(b => (b === banner ? null : b)), 9000);
    return () => window.clearTimeout(id);
  }, [banner]);
  useEffect(() => () => audio.stop(), [audio]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'plain') => {
    const id = ++R.current.toastId;
    setToasts(ts => [...ts.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 3600);
  }, []);

  const resultRows = useCallback((): ResultRowView[] => {
    if (mode === 'start') {
      const starts = race.events.filter(e => e.type === 'started') as { boat: string; late: number }[];
      const rows = race.boats.map(b => {
        const s = starts.find(x => x.boat === b.id);
        return { b, late: s ? s.late : null };
      }).sort((a, z) => (a.late ?? 999) - (z.late ?? 999));
      return rows.map((r, i) => ({ id: r.b.id, place: i + 1, sail: r.b.sail, name: r.b.isPlayer ? 'You' : r.b.persona?.name ?? '', color: r.b.color, isPlayer: r.b.isPlayer, time: r.late === null ? (r.b.ocs ? 'OCS' : 'not started') : `+${r.late.toFixed(1)} s` }));
    }
    return race.results().map(r => ({
      id: r.boat.id, place: r.place, sail: r.boat.sail, name: r.boat.isPlayer ? 'You' : r.boat.persona?.name ?? '', color: r.boat.color, isPlayer: r.boat.isPlayer,
      time: r.status === 'finished' ? clock(r.time ?? 0) : r.status === 'racing' ? 'racing' : r.status.toUpperCase(),
    }));
  }, [race, mode]);

  // ── Events from the engine ──
  const onIncident = useCallback((inc: Incident) => {
    flashes.push({ x: inc.at.x, y: inc.at.y, t: race.t });
    const p = race.player;
    const mine = !!p && inc.offender === p.id;
    const against = !!p && inc.victim === p.id;
    if (!mine && !against) {
      if (p && inc.kind !== 'ocs' && dist(inc.at, p) < 10 * p.cls.loa) toast(`Rule ${inc.rule}: ${race.boatById(inc.offender).sail} owes a penalty`);
      return;
    }
    // The race never stops for an incident: it shows as a banner (Alfie explains it if you ask),
    // and a penalty is yours to sail, or a recall yours to go back for.
    if (R.current.coach !== 'off' || mode === 'scene') setBanner(inc);
    else toast(inc.kind === 'ocs' ? 'Recall: go back below the line and start again' : mine ? `Rule ${inc.rule}: you owe a One-Turn Penalty` : `Rule ${inc.rule}: ${race.boatById(inc.offender).sail} owes you a penalty`, 'warn');
  }, [race, toast, flashes, mode]);

  const handleEvents = useCallback(() => {
    const p = race.player;
    const evs = race.events;
    for (; R.current.evIdx < evs.length; R.current.evIdx++) {
      const e = evs[R.current.evIdx];
      switch (e.type) {
        // The club's recording calls the sequence and fires the gun when it's playing.
        case 'signal': if (!seqPlayer?.working) audio.signal(e.remaining); break;
        case 'gun': if (!seqPlayer?.working) audio.gun(); break;
        case 'recall': {
          const sails = e.boats.map(id => race.boatById(id).sail);
          audio.recall(sails);
          toast(`Recall: ${sails.join(', ')}`, 'warn');
          break;
        }
        case 'hail': {
          const b = race.boatById(e.boat);
          if (p && b !== p && dist(b, p) < 8 * p.cls.loa) audio.say(e.text, true);
          break;
        }
        case 'room-to-tack':
          if (p && e.to === p.id) toast(`${race.boatById(e.from).sail} hails for room to tack: tack now (T), or reply "You tack" (H)`, 'warn');
          break;
        case 'you-tack':
          if (p && e.to === p.id) toast(`${race.boatById(e.from).sail} replied "You tack": tack as soon as you can (T)`, 'warn');
          break;
        case 'incident': onIncident(e.incident); break;
        case 'penalty-done': if (p && e.boat === p.id) toast('Penalty done. Back to racing.', 'good'); break;
        case 'rounded': if (p && e.boat === p.id) toast(`${legLabel(race, e.leg)} done · ${ordinal(e.place)}`); break;
        case 'finish': if (p && e.boat === p.id) { toast(`Finished ${ordinal(e.place)}`, 'good'); audio.beep(1200, 300); R.current.playerDoneAt = race.t; } break;
        case 'started': if (p && e.boat === p.id) toast(e.late < 0.3 ? 'Started right on the gun' : `Started ${e.late.toFixed(1)} s after the gun`, e.late < 2 ? 'good' : 'plain'); break;
        default: break;
      }
    }
  }, [race, audio, toast, onIncident, seqPlayer]);

  // ── Snapshot for the HUD ──
  const makeHud = useCallback((): HudState | null => {
    const p = race.player;
    if (!p) return null;
    const T = race.gunT - race.t;
    const ws = race.wind.sample(p.x, p.y, race.t);
    const n = mem.samples.length;
    const base = n ? mem.samples.reduce((a, s) => a + n180(s.twd - mem.samples[0].twd), 0) / n + mem.samples[0].twd : ws.twd;
    const spark = mem.samples.map(s => n180(s.twd - base));
    const pre = T > 0;
    const line = pre || !p.started ? lineInfo(race, p) : null;
    const nx = nextTarget(race, p);
    const legs = race.course.legs.length;
    const place = race.livePlace(p);
    const status = p.ocs && !p.started && race.t >= race.gunT ? 'Recall' : p.penalty.owed > 0 ? 'Penalty' : null;
    const fleet: FleetRow[] = race.boats.map((b, i) => ({
      id: b.id, sail: b.sail, color: b.color, isPlayer: b.isPlayer,
      name: b.isPlayer ? 'You' : scene ? b.name : b.persona?.name ?? '',
      intent: b.isPlayer ? (pre ? 'Your start' : b.finished ? 'Finished' : legLabel(race, b.legIndex)) : b.disabled ? 'Out of control' : race.skippers[i]?.intent ?? '',
      place: race.livePlace(b),
      flag: b.ocs && !b.started && race.t >= race.gunT ? 'OCS' : b.penalty.owed > 0 ? 'P' : b.finished ? '✓' : null,
    }));
    fleet.sort((a, z) => (pre ? (a.isPlayer ? -1 : z.isPlayer ? 1 : a.sail.localeCompare(z.sail)) : a.place - z.place));
    let goal: HudState['goal'] = null;
    if (scene && built) {
      const g = goalCtx(race, built.t0, goalMemo);
      goal = { progress: scene.spec.goal.progress?.(g) ?? null, timeLeft: scene.spec.goal.seconds - g.t };
    }
    return {
      T, raceT: Math.max(0, -T), preStart: pre,
      // At a venue the race frame turns with the wind: show the real compass direction.
      wind: { kn: ws.tws / KN, from: (ws.twd + race.course.rot) % 360, spark, swing: mem.swing(40) },
      line,
      course: { leg: p.finished ? 'Finished' : legLabel(race, p.started ? p.legIndex : 0), legNo: (p.started ? p.legIndex : 0) + 1, legs, next: nx ? `To ${nx.name}` : '', distL: nx && !p.finished ? Math.round(dist(nx, p) / p.cls.loa) : null, place, of: race.boats.length, status },
      fleet,
      boat: { tack: p.tack === 'stbd' ? 'Starboard' : 'Port', pos: pointOfSail(p), spdPct: p.targetSpd > 0.05 * p.cls.hullSpeed ? Math.min(1.25, p.spd / p.targetSpd) : 0, kn: p.spd / KN, trim: trimAdvice(p) },
      rudder: ctl.rudder, sheet: ctl.sheet, twa: p.twa,
      penalty: p.penalty.owed > 0 ? { owed: p.penalty.owed, deg: Math.abs(p.penalty.rot), tack: p.penalty.passedHtw, gybe: p.penalty.passedDdw } : null, finished: p.finished,
      goal,
    };
  }, [race, mem, ctl, scene, built, goalMemo]);

  // ── The loop ──
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0, hudAt = 0;
    const L = race.course.L;
    const fitCourse = () => {
      const B = race.course.bounds;
      const s = Math.min(size.h / (B.alongMax - B.alongMin) * 0.95, size.w / (B.across * 1.6));
      const mid = (B.alongMin + B.alongMax) / 2;
      return { x: race.course.origin.x + race.course.up.x * mid, y: race.course.origin.y + race.course.up.y * mid, scale: s };
    };
    // How much detail the water gets: full, unless frames come too slowly on this device. It only
    // ever steps down (never back up and down again, which would make the water flicker and the
    // frame rate swing), and only after a steady run of slow frames.
    const perf = { detail: 2, ft: 1 / 60, slow: 0 };
    const frame = (now: number) => {
      // The frame's timestamp can be a little before the moment the loop started: never negative.
      // A slow frame still moves the race on in real time (up to a quarter of a second at once).
      const raw = Math.max(0, (now - last) / 1000);
      const dtReal = Math.min(0.25, raw);
      last = now;
      // Development only: hold the water at one level of detail (for screenshots on a slow machine).
      const lock = import.meta.env.DEV ? (window as unknown as { __simDetail?: number }).__simDetail : undefined;
      if (typeof lock === 'number') perf.detail = lock;
      else if (raw > 0 && raw < 0.5 && !document.hidden) {
        perf.ft += (raw - perf.ft) * 0.05;
        perf.slow = perf.ft > 1 / 40 ? perf.slow + raw : 0;
        if (perf.slow > 1.5 && perf.detail > 0) {
          // Less detail on the water, and fewer pixels to fill: a big, sharp screen is the costly part.
          perf.detail--; perf.slow = 0; perf.ft = 1 / 50;
          size.maxDpr = perf.detail === 1 ? 1.5 : 1;
          size.refit?.();
        }
      }
      const st = R.current;
      ctl.update(dtReal, st.mapping);
      const p = race.player;
      if (race.replaying) {
        // Sailing back to the moment you chose: as fast as the frame allows, quietly. The old
        // events are history, but the wind graph and your log keep up.
        const until = performance.now() + 22;
        while (race.replaying && performance.now() < until) {
          race.step();
          if (ghostRace && !ghostRace.ended) ghostRace.step();
          if (p) { mem.update(race.t, race.wind.sample(p.x, p.y, race.t).twd); log.sample(race, p, mem.mean); }
        }
        st.evIdx = race.events.length;
        acc = 0;
        if (race.replaying) setCatchUp({ to: resume?.step ?? 0, at: race.step_ });
        else { setCatchUp(null); setTookOver(race.t); st.paused = true; setPaused(true); }
      } else if (!st.paused && !st.replay && !st.ended) {
        acc += dtReal * (st.fast ? 2.5 : 1);
        let n = 0;
        while (acc >= DT && n < 14) {
          race.input = { rudder: ctl.rudder, sheet: ctl.sheet, autoTrim: race.settings.autoTrim };
          race.step();
          if (ghostRace && !ghostRace.ended) ghostRace.step();
          handleEvents();
          if (p) { mem.update(race.t, race.wind.sample(p.x, p.y, race.t).twd); log.sample(race, p, mem.mean); }
          acc -= DT; n++;
          // A drill, lesson or lab moment: has the goal been met, or missed?
          if (scene && built && p) {
            const g = goalCtx(race, built.t0, goalMemo);
            const o = scene.spec.goal.check?.(g) ?? (g.t >= scene.spec.goal.seconds || race.ended ? scene.spec.goal.final(g) : null);
            if (o) { st.ended = true; setSceneOut(o); setBanner(null); if (!scene.watch) onSceneResult?.(o); break; }
          }
          if (st.paused) { acc = 0; break; }
        }
        if (n >= 14) acc = 0;
        // The end of a race or start practice.
        if (!scene) {
          const startDone = mode === 'start' && race.t > race.gunT + 12;
          const playerDone = mode === 'race' && st.playerDoneAt > 0 && race.t > st.playerDoneAt + 3;
          if ((race.ended || startDone || playerDone) && race.t - st.resultsAt > 0.5) {
            st.resultsAt = race.t;
            const mine = p ? race.results().find(r => r.boat === p) : null;
            const title = mode === 'start' ? 'Start report' : mine && mine.status === 'finished' ? `You finished ${ordinal(mine.place)}` : 'Results';
            setResults({ rows: resultRows(), live: !race.ended && mode === 'race', title });
            if (race.ended || startDone) st.ended = true;
          }
        }
      }
      // The club's start sequence keeps time with the race clock.
      seqPlayer?.update(race.gunT - race.t, !st.paused && !st.replay && !st.ended && !race.replaying, st.fast ? 2.5 : 1, audio.muted);
      // Instant replay playback.
      if (st.replay && st.replay.playing) {
        const back = Math.max(0, st.replay.back - dtReal * 20);
        st.replay = { back, playing: back > 0 };
        setReplay(st.replay);
      }
      // Camera: follow the player (or her replay position), or fit the course.
      if (p) {
        const H = race.hist[race.boats.indexOf(p)];
        const back = st.replay ? Math.round(st.replay.back) : 0;
        const k = H.x.length - 1 - back;
        const px = back && k >= 0 ? H.x[k] : p.x, py = back && k >= 0 ? H.y[k] : p.y;
        const lead = dir(p.hdg);
        let tgt = fitCourse();
        if (st.follow) {
          let scale = (Math.min(size.w, size.h * 1.5) / (30 * L)) * st.zoom;
          let cx = px + lead.x * p.spd * 1.2, cy = py + lead.y * p.spd * 1.2;
          // Keep what you're sailing to in view: the start line before you've started, then the next
          // mark. Zoom out as far as that needs (to the whole course at most), leaving room for the panels.
          const c = race.course;
          const pts = !p.started ? [c.start.pin, c.start.stbd] : (() => { const nx = nextTarget(race, p); return nx ? [nx] : []; })();
          if (pts.length && !back) {
            const pad = 3.5 * L;
            let minX = px, maxX = px, minY = py, maxY = py;
            for (const q of pts) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
            minX -= pad; maxX += pad; minY -= pad; maxY += pad;
            const need = Math.min((size.w * (size.w > 1024 ? 0.6 : 0.9)) / (maxX - minX), (size.h * 0.72) / (maxY - minY));
            if (need < scale) {
              scale = Math.max(need, tgt.scale);
              cx += ((minX + maxX) / 2 - cx) * 0.8; cy += ((minY + maxY) / 2 - cy) * 0.8;
            }
          }
          tgt = { x: cx, y: cy, scale };
        }
        const k1 = Math.min(1, dtReal * 2.6), k2 = Math.min(1, dtReal * 4);
        cam.x += (tgt.x - cam.x) * k1; cam.y += (tgt.y - cam.y) * k1; cam.scale += (tgt.scale - cam.scale) * k2;
        // From the bank: walk the control area with her and turn to keep her in view, glancing
        // towards the next mark (or the line before the start). Holding M looks straight at the mark.
        if (st.view === 'bank') {
          const c = race.course;
          const nx = nextTarget(race, p);
          const look = !p.started ? { x: (c.start.pin.x + c.start.stbd.x) / 2, y: (c.start.pin.y + c.start.stbd.y) / 2 } : nx ? { x: nx.x, y: nx.y } : null;
          const aim = st.glance && look ? look : { x: px, y: py };
          followCam(bcam, race, aim, dtReal, st.zoom, st.glance ? null : look, size.w);
        }
      }
      // Draw.
      const cv = canvasRef.current;
      const ctx = cv?.getContext('2d');
      if (ctx && p) {
        const T = race.gunT - race.t;
        const li = T > 0 ? lineInfo(race, p) : null;
        const nx = nextTarget(race, p);
        if (st.view === 'bank') {
          drawBank(ctx, race, {
            w: size.w, h: size.h, dpr: size.dpr, cam: bcam,
            next: nx ? { x: nx.x, y: nx.y, name: nx.name } : null,
            showZones: T <= 0 && !!nx?.isMark, preStart: T > 0, flashes, overlays, names: !!scene,
            back: st.replay ? Math.round(st.replay.back) : 0,
            ghost: ghostRace?.player ? { race: ghostRace, b: ghostRace.player, label: ghost!.label } : null,
            detail: perf.detail,
          });
        } else {
          drawRace(ctx, race, {
            w: size.w, h: size.h, dpr: size.dpr, cam,
            showLaylines: st.laylines && T <= 0, showZones: T <= 0 && !!nx?.isMark,
            back: st.replay ? Math.round(st.replay.back) : 0,
            ttl: li && li.ttl !== null && li.to ? { s: li.ttl, to: li.to } : null,
            flashes, preStart: T > 0,
            next: nx ? { x: nx.x, y: nx.y, name: nx.name, upwind: nx.upwind } : null,
            overlays, names: !!scene,
            ghost: ghostRace?.player ? { b: ghostRace.player, label: ghost!.label } : null,
            detail: perf.detail,
          });
        }
      }
      // HUD at 10 Hz. The coach line changes at most every 6 s unless something more urgent comes up
      // (a rule risk, or start timing near the gun, which updates every 1.5 s); the rule watch keeps up.
      if (now - hudAt > 100) {
        hudAt = now;
        const hs = makeHud();
        if (hs) setHud(hs);
        if (p && race.t - st.cueAt > 0.5) {
          st.cueAt = race.t;
          const T = race.gunT - race.t;
          const next = coachCue(race, p, mem, lineInfo(race, p));
          const cur = st.cue;
          const since = race.t - st.cueChangedAt;
          const u = urgency(next, T);
          if (!cur || u > urgency(cur, T) || since >= 6 || (u >= 2 && since >= 1.5) || (cur.topic !== next.topic && since >= 2.5)) {
            if (!cur || cur.text !== next.text) st.cueChangedAt = race.t;
            st.cue = next; setCue(next);
          } else if (next.watch !== cur.watch) {
            st.cue = { ...cur, watch: next.watch }; setCue(st.cue);
          }
        }
        if (st.resultsAt > 0 && !st.ended && mode === 'race') setResults(r => (r ? { ...r, rows: resultRows(), live: !race.ended } : r));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [race, ctl, mem, log, cam, bcam, size, flashes, handleEvents, makeHud, resultRows, mode, scene, built, goalMemo, overlays, onSceneResult, ghostRace, ghost, resume, seqPlayer, audio]);

  // ── Canvas size ──
  useEffect(() => {
    const el = wrapRef.current, cv = canvasRef.current;
    if (!el || !cv) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      size.w = Math.max(320, r.width); size.h = Math.max(240, r.height);
      // Sharp on a high-resolution screen, but no more than about 6 million pixels to draw.
      const dpr = Math.max(1, Math.min(size.maxDpr, window.devicePixelRatio || 1, Math.sqrt(6e6 / (size.w * size.h))));
      size.dpr = dpr;
      cv.width = Math.round(size.w * dpr); cv.height = Math.round(size.h * dpr);
      cv.style.width = `${size.w}px`; cv.style.height = `${size.h}px`;
    };
    fit();
    size.refit = fit;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  // ── Full screen (the browser's own, on top of the simulator filling the window) ──
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const canFull = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  // ── Actions ──
  const togglePause = useCallback(() => {
    if (moment || results || sceneOut) return;
    setPaused(v => { R.current.paused = !v; return !v; });
  }, [moment, results, sceneOut]);

  const doTack = useCallback(() => {
    const p = race.player; if (!p) return;
    race.act(Math.abs(p.twa) < 90 ? 'tack' : 'gybe');
  }, [race]);

  // Hails: the race works out what she calls (answer a room-to-tack hail, protest, room to tack at
  // the bank, mark-room, right of way), so a replay calls the same; here we say it and show it.
  const doHail = useCallback(() => {
    const r = race.act('hail');
    if (!r) return;
    if (r.text) audio.say(r.text.replace(/!/g, ''), true);
    if (r.note) toast(r.note, r.noteTone ?? 'plain');
  }, [race, audio, toast]);

  const closeMoment = useCallback(() => {
    setMoment(null); setReplay(null); R.current.replay = null;
    setPaused(false); R.current.paused = false;
  }, []);

  const startReplay = useCallback(() => {
    const back = Math.min(REPLAY_MAX, (race.hist[0]?.x.length ?? 1) - 1);
    const r = { back, playing: true };
    R.current.replay = r; setReplay(r);
  }, [race]);

  const exitReplay = useCallback(() => {
    R.current.replay = null; setReplay(null);
    if (!moment) { setPaused(false); R.current.paused = false; }
  }, [moment]);

  const finish = useCallback(() => {
    const sum = summarize(race, log, mode === 'start' ? 'start' : 'race');
    onDebrief?.(race, sum, findMoments(race, log, sum));
  }, [race, log, mode, onDebrief]);

  // ── Keyboard ──
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    const down = (e: KeyboardEvent) => {
      if (isField(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      let used = true;
      if (k === 'arrowleft' || k === 'a') ctl.left = true;
      else if (k === 'arrowright' || k === 'd') ctl.right = true;
      else if (k === 'arrowup' || k === 'w') ctl.down = true;     // stick up = sail out
      else if (k === 'arrowdown' || k === 's') ctl.up = true;     // stick down = sail in
      else if (k === 't' || k === 'g') { if (!e.repeat) doTack(); }
      else if (k === 'h') { if (!e.repeat) doHail(); }
      else if (k === ' ' || k === 'escape') { if (!e.repeat) togglePause(); }
      else if (k === 'l') { if (!e.repeat) setLaylines(v => !v); }
      else if (k === 'v') { if (!e.repeat) onViewChange(R.current.view === 'bank' ? 'top' : 'bank'); }
      else if (k === 'm') { if (!e.repeat) setGlance(true); }
      else if (k === 'c') { if (!e.repeat) setFollow(v => !v); }
      else if (k === 'f') { if (!e.repeat) setFast(v => !v); }
      else if (k === '+' || k === '=') setZoom(z => Math.min(3, z * 1.15));
      else if (k === '-' || k === '_') setZoom(z => Math.max(0.35, z / 1.15));
      else used = false;
      if (used) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') ctl.left = false;
      else if (k === 'arrowright' || k === 'd') ctl.right = false;
      else if (k === 'arrowup' || k === 'w') ctl.down = false;
      else if (k === 'arrowdown' || k === 's') ctl.up = false;
      else if (k === 'm') setGlance(false);
    };
    const blur = () => { ctl.left = ctl.right = ctl.up = ctl.down = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [ctl, doTack, doHail, togglePause, onViewChange]);

  const s = race.settings;
  const windText = s.windKnots != null ? `${Math.round(s.windKnots)} kn` : `${s.windStrength[0].toUpperCase()}${s.windStrength.slice(1)} wind`;
  const sub = scene
    ? `${scene.group} · ${scene.spec.brief}`
    : race.venue
      ? `${race.venue.def.short} · ${race.boats[0].cls.name} · ${s.fleetSize} boats · ${s.level[0].toUpperCase()}${s.level.slice(1)} skippers · ${windText} from the ${compassName(race.course.rot)}, ${s.windCharacter}`
      : `${race.boats[0].cls.name} · ${s.fleetSize} boats · ${s.level[0].toUpperCase()}${s.level.slice(1)} skippers · ${windText}, ${s.windCharacter}`;
  const title = scene ? scene.spec.title : mode === 'start' ? 'Start practice' : 'Quick race';
  const p = race.player;
  const otherSail = moment ? (() => { const id = moment.offender === p?.id ? moment.victim : moment.offender; return id ? race.boatById(id).sail : null; })() : null;
  const showCoach = coach !== 'off' && !coachHidden && !moment && !results && !sceneOut;
  const watching = !!scene?.watch;
  const outRule = sceneOut?.incident?.rule;
  const backLabel = scene ? `Back to the ${scene.group}` : 'Simulator home';

  return (
    <div className="flex h-full min-h-[560px] flex-col text-[14px] text-[#F1F4FA]" style={{ background: C.bg, fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header className="flex min-h-[60px] shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 sm:px-5" style={{ background: C.head }}>
        <Btn onClick={onHome} aria-label={scene ? `Back to the ${scene.group}` : 'Main Menu'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          <span className="hidden sm:inline">{scene ? scene.group : 'Main Menu'}</span>
        </Btn>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[15px] font-semibold">{title}{paused && !moment && <Chip tone="warn" className="ml-2">Paused</Chip>}{watching && <Chip tone="blue" className="ml-2">Watching</Chip>}</p>
          <p className="m-0 mt-0.5 hidden truncate text-[12.5px] sm:block" style={{ color: C.mute }} title={sub}>{sub}</p>
        </div>
        <span className="ml-auto hidden text-[12.5px] 2xl:inline" style={{ color: C.mute }}>← → steer · ↑ ↓ sail out / in · T tack · H hail · Space pause</span>
        <div className="ml-auto flex items-center gap-2 2xl:ml-0">
          <Seg size="sm" label="View" value={view} onChange={onViewChange} options={[{ value: 'bank', label: 'Bank view', title: 'From the control area on the bank (V)' }, { value: 'top', label: 'Top view', title: 'From above (V)' }]} />
          <span className="hidden h-[22px] min-w-[22px] items-center justify-center rounded-[7px] border border-white/10 bg-white/[0.08] px-1.5 text-[11.5px] font-bold text-white/85 lg:inline-flex" title="Switch view">V</span>
        </div>
        <div className="hidden items-center gap-1.5 rounded-xl bg-black/30 py-[3px] pl-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] md:flex" title="Alfie's coaching">
          <AlfieOrb size={20} />
          <span className="pr-0.5 text-[13px] font-semibold">Alfie</span>
          <Seg size="sm" label="Alfie's coaching" value={coach} onChange={m => { onCoachChange(m); setCoachHidden(false); }} options={[{ value: 'full', label: 'Full' }, { value: 'hints', label: 'Hints' }, { value: 'off', label: 'Off' }]} className="!bg-transparent !shadow-none" />
        </div>
        <Btn icon aria-label={fast ? 'Normal speed' : 'Speed up'} aria-pressed={fast} onClick={() => setFast(v => !v)} title="Speed up (F)"><span className="text-[12px] font-bold">{fast ? '2.5×' : '1×'}</span></Btn>
        <Btn icon aria-label={muted ? 'Sound on' : 'Mute'} onClick={() => { audio.unlock(); setMuted(v => !v); }}>
          {muted
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" /></svg>}
        </Btn>
        <Btn icon aria-label="Transmitter set-up" onClick={() => setPadOpen(true)} title="Transmitter">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="3" /><path d="M8 11v4M6 13h4M15.5 12h.01M18 14h.01M12 7V3" /></svg>
        </Btn>
        {canFull && (
          <Btn icon aria-label={full ? 'Leave full screen' : 'Full screen'} aria-pressed={full} onClick={toggleFull} className={full ? '!bg-white/[0.12]' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>
          </Btn>
        )}
        <Btn icon aria-label={paused ? 'Resume' : 'Pause'} onClick={togglePause}>
          {paused
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
        </Btn>
        <Btn icon aria-label="Restart" onClick={onAgain}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        </Btn>
      </header>

      <main ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden" onPointerDown={() => audio.unlock()}
        onWheel={e => setZoom(z => Math.max(0.35, Math.min(3, z * Math.exp(-e.deltaY * 0.0012))))}>
        <canvas ref={canvasRef} className="absolute inset-0 block" role="img" aria-label={view === 'bank' ? 'The race seen from the control area on the bank, turning to follow your boat' : 'The race course, seen from above, with your boat in the middle'} />

        {hud && (
          <>
            {/* Top row */}
            <div className="absolute left-6 top-5 hidden flex-col gap-4 md:flex">
              {scene ? <GoalCard group={scene.group} title={scene.spec.title} goal={scene.spec.goal.text} progress={hud.goal?.progress ?? null} timeLeft={hud.preStart ? null : hud.goal?.timeLeft ?? null} watching={watching} /> : <WindCard {...hud.wind} />}
            </div>
            <div className="absolute left-3 top-3 hidden sm:block md:hidden">{scene ? <div className="w-[240px]"><GoalCard compact group={scene.group} title={scene.spec.title} goal={scene.spec.goal.text} progress={hud.goal?.progress ?? null} timeLeft={null} watching={watching} /></div> : <WindCard {...hud.wind} compact />}</div>
            <div className="absolute left-1/2 top-3 hidden -translate-x-1/2 sm:block sm:top-4">
              <ClockCard preStart={hud.preStart} T={hud.T} seq={race.settings.sequenceSeconds} raceT={hud.raceT}
                sub={hud.finished ? 'Finished' : scene ? (hud.goal?.progress ?? scene.spec.goal.text) : `${ordinal(hud.course.place)} of ${hud.course.of} · leg ${Math.min(hud.course.legNo, hud.course.legs)} of ${hud.course.legs}`} />
            </div>
            <div className="absolute left-3 top-3 flex items-start gap-2 sm:hidden">
              <ClockCard compact preStart={hud.preStart} T={hud.T} seq={race.settings.sequenceSeconds} raceT={hud.raceT}
                sub={hud.finished ? 'Finished' : scene ? (hud.goal?.progress ?? '') : `${ordinal(hud.course.place)} of ${hud.course.of}`} />
              <Hud className="flex flex-col items-center gap-1 px-3 py-2.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CCBFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${hud.wind.from + 180}deg)` }}><path d="M12 4v16M6 10l6-6 6 6" /></svg>
                <span className="font-display text-[18px] font-bold tabular-nums">{hud.wind.kn.toFixed(1)}</span>
                <span className="text-[11px]" style={{ color: C.mute }}>kn</span>
              </Hud>
            </div>
            <div className={cx('absolute right-6 top-5 hidden flex-col gap-4 lg:flex', hud.penalty ? 'bottom-[290px]' : 'bottom-[236px]')}>
              {hud.line ? <LineCard line={hud.line} map={<CourseMap race={race} width={240} height={150} cam={view === 'bank' ? bcam : null} />} /> : <CourseCard {...hud.course} map={<CourseMap race={race} width={240} height={150} cam={view === 'bank' ? bcam : null} />} />}
              <FleetCard rows={hud.fleet} preStart={hud.preStart} />
            </div>

            {/* View tools */}
            <Hud className="absolute left-3 top-1/2 hidden -translate-y-1/2 flex-col gap-1.5 p-1.5 sm:left-6 md:flex">
              <Btn icon small aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z * 1.25))}>+</Btn>
              <Btn icon small aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.35, z / 1.25))}>−</Btn>
              {view === 'bank' ? (
                <Btn icon small aria-label="Glance at the next mark" aria-pressed={glance} title="Glance at the next mark (hold M)"
                  onPointerDown={() => setGlance(true)} onPointerUp={() => setGlance(false)} onPointerLeave={() => setGlance(false)} className={glance ? '!bg-white/[0.12]' : ''}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                </Btn>
              ) : (
                <>
                  <Btn icon small aria-label={follow ? 'Show the whole course' : 'Follow my boat'} aria-pressed={!follow} onClick={() => setFollow(v => !v)} title="Course view (C)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
                  </Btn>
                  <Btn icon small aria-label="Laylines" aria-pressed={laylines} onClick={() => setLaylines(v => !v)} title="Laylines (L)" className={laylines ? '!bg-white/[0.12]' : ''}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray="3 3" aria-hidden="true"><path d="M12 4L4 20M12 4l8 16" /></svg>
                  </Btn>
                </>
              )}
            </Hud>

            {/* Bottom row */}
            {showCoach && (
              <>
                <div className="absolute bottom-6 left-6 hidden lg:block"><CoachCard cue={cue} mode={coach} onHide={() => setCoachHidden(true)} /></div>
                <div className="absolute left-3 right-3 top-[124px] sm:top-[168px] lg:hidden"><CoachCard cue={cue} mode={coach} onHide={() => setCoachHidden(true)} compact /></div>
              </>
            )}
            {!replay && !moment && (
              <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 xl:block">
                <BoatStrip {...hud.boat} auto={race.settings.autoTrim} />
              </div>
            )}
            {!watching && (
              <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6">
                <ControlsCard
                  rudder={hud.rudder} sheet={hud.sheet}
                  onRudder={v => { ctl.touchRudder = v; }} onRudderEnd={() => { ctl.touchRudder = null; }}
                  onSheet={v => { ctl.sheet = v; }}
                  onTack={doTack} onHail={doHail} tackLabel={Math.abs(hud.twa) < 90 ? 'Tack' : 'Gybe'}
                  penalty={hud.penalty}
                />
              </div>
            )}
          </>
        )}

        {/* Toasts */}
        <div className="pointer-events-none absolute left-1/2 top-[168px] -translate-x-1/2"><Toasts items={toasts} /></div>

        {/* Hints-mode banner (and every incident in a drill or lesson) */}
        {banner && !moment && !sceneOut && (
          <div className="absolute left-1/2 top-[168px] -translate-x-1/2">
            <HintBanner inc={banner} mine={banner.offender === p?.id} onOpen={() => { setMoment(banner); setBanner(null); setPaused(true); R.current.paused = true; }} onClose={() => setBanner(null)} />
          </div>
        )}

        {/* Rules moment */}
        {moment && (
          <div className="absolute bottom-4 right-4 top-4 flex sm:right-6 sm:top-5">
            <RulesMomentPanel inc={moment} mine={moment.offender === p?.id} otherSail={otherSail}
              onContinue={closeMoment} onReplay={startReplay} onLearn={() => setRuleSheet(moment.rule)} />
          </div>
        )}
        {replay && (
          <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6">
            <ReplayBar back={replay.back} max={REPLAY_MAX} playing={replay.playing}
              onStep={d => { const r = { back: Math.max(0, Math.min(REPLAY_MAX, replay.back + d)), playing: false }; R.current.replay = r; setReplay(r); }}
              onToggle={() => { const r = { back: replay.back <= 0 ? Math.min(REPLAY_MAX, race.hist[0].x.length - 1) : replay.back, playing: !replay.playing }; R.current.replay = r; setReplay(r); }}
              onScrub={b => { const r = { back: b, playing: false }; R.current.replay = r; setReplay(r); }}
              onExit={exitReplay} />
          </div>
        )}

        {/* Paused (not for a rules moment) */}
        {catchUp && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Hud className="flex w-[320px] flex-col items-center gap-3 px-7 py-6 text-center">
              <p className="m-0 font-display text-[20px] font-bold">Sailing back to your moment</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#4DA3FF]" style={{ width: `${Math.round((100 * catchUp.at) / Math.max(1, catchUp.to))}%` }} /></div>
              <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>The same race, the same wind, every boat sailing it again</p>
            </Hud>
          </div>
        )}
        {paused && !moment && !results && !replay && !sceneOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Hud className="flex flex-col items-center gap-3 px-8 py-6 text-center">
              {tookOver !== null ? (
                <>
                  <div className="flex items-center gap-2.5"><AlfieOrb size={30} /><p className="m-0 font-display text-[24px] font-bold">Back at {tookOver < race.gunT ? `${fmt(race.gunT - tookOver)} to the start` : fmt(tookOver - race.gunT)}</p></div>
                  <p className="m-0 max-w-[360px] text-[13.5px] leading-normal" style={{ color: C.mute }}>Every boat is where it was, in the same wind. From here she's yours: sail it the better way.</p>
                  <div className="flex gap-2.5"><Btn primary onClick={() => { setTookOver(null); togglePause(); }}>Take the helm</Btn></div>
                </>
              ) : (
                <>
                  <p className="m-0 font-display text-[26px] font-bold">Paused</p>
                  <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>Press Space to carry on</p>
                  <div className="flex gap-2.5"><Btn primary onClick={togglePause}>Resume</Btn><Btn onClick={startReplay}>Replay the last 10 s</Btn></div>
                </>
              )}
            </Hud>
          </div>
        )}

        {results && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-4">
            <ResultsOverlay rows={results.rows} title={results.title} live={results.live} onDebrief={finish} onAgain={onAgain} onHome={onHome} />
          </div>
        )}

        {sceneOut && scene && !replay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-4">
            <SceneResult pass={sceneOut.pass} title={sceneOut.title} text={sceneOut.text} stars={sceneOut.pass ? sceneOut.stars : undefined}
              best={scene.best} watching={watching}
              onAgain={onAgain} onWatch={scene.spec.solution && onSceneWatch ? onSceneWatch : undefined}
              onNext={onSceneNext} nextLabel={scene.nextLabel} onBack={onHome} backLabel={backLabel}
              rule={outRule} onRule={outRule ? () => setRuleSheet(outRule) : undefined} />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2"><Btn small onClick={startReplay}>Replay the last 10 s</Btn></div>
          </div>
        )}

        {ruleSheet && <RuleSheet rule={ruleSheet} onClose={() => setRuleSheet(null)} />}
        {padOpen && <GamepadModal mapping={mapping} onSave={m => { setMapping(m); saveMapping(m); }} onClose={() => setPadOpen(false)} />}
      </main>
    </div>
  );
}

// Race Simulator: home (set up a race, the Start Trainer, Rules Academy and Scenario Lab, your
// profile) → race or training scene → debrief. Racing fills the whole window, above the app's
// navigation; "Main Menu" brings you back. The racing itself runs on the engine in src/sim; this
// file only moves between the screens and keeps your settings and progress.
import type { SkipperLevel } from '@/sim/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Race, RaceLog } from '@/sim/engine';
import { DT } from '@/sim/physics';
import type { Moment } from './moments';
import type { BoatLook, RaceSettings } from '@/sim/types';
import { CLASSES, type ClassId } from '@/sim/classes';
import type { Outcome, SceneSpec } from '@/sim/training';
import { DRILLS, FIRST, LAB, LAB_GROUPS, MODULES, findDrill, findMoment, findScene } from '@/sim/training';
import SimHome, { DEFAULT_SETUP, Setup } from './SimHome';
import type { Door } from './SimDoors';
import SimCareer from './SimCareer';
import SimBench from './SimBench';
import SimWorld from './SimWorld';
import { alpha2 } from './flags';
import { standing } from './rating';
import { clubName, isWorld, listWorld, myResults, mySkipper, saveSkipper, skippersOf, stopAppearing, syncSkipperStats, worldNow, worldTable, type Skipper, type WorldEvent, type WorldResult } from './world';
import { FLEET_NAME } from './heats';
import { levelLicence } from './programme';
import { ME, TIERS, abandonRace, wonPaints, careerRace, heatNow, prepareRace, dayStandings, dayState, newCareer, raceRows, recordRace, type Career } from './career';
import SimRace, { ActiveScene, SimView } from './SimRace';
import SimDebrief, { TrainLink } from './SimDebrief';
import SimTrainer from './SimTrainer';
import SimAcademy from './SimAcademy';
import SimPlaybook from './SimPlaybook';
import SimPassport from './SimPassport';
import SimJudge from './SimJudge';
import SimLab from './SimLab';
import type { RaceSummary } from './stats';
import { Profile, clearProfile, loadProfile, mergeRaces, saveRace } from './profile';
import { focusResult, raceFocus, type Focus } from './focus';
import { loadBlownOut, loadNextRace, type NextRace } from './rehearse';
import { TrainingProgress, chooseWay, dismissCard, resetTraining, saveCareer, loadTraining, recordAnswer, recordScene, saveTraining, recordJudge } from './progress';
import { Account, clearRaces, pullRaces, pushRace, syncTraining } from './sync';
import { SimIdentity, loadIdentity } from './identity';
import SimYacht from './SimYacht';
import { cleanYard, loadYard, lookFor, sailFor, saveYard, type Yard } from './yacht';
import { C, ordinal } from './ui';
import { VENUES, venueForClub } from '@/sim/venues';
import { windAt } from '@/sim/venue';
import { currentId, ensureVenue, loadWaters, type Water } from './waters';
import { VenueWind, fetchVenueWind } from './venueWind';
import { Challenge, ChallengeEntry, createChallenge, entryLog, isOpen, listChallenges, submitEntry } from './challenges';
import SimChallenge from './SimChallenge';
import { EventRace, STANDARD_DROPS, SimEvent, blownOutEvent, createEvent, deleteEvent, eventEntries, eventRaceSettings, listEvents, raceWindows, seriesRaces, startTry } from './events';
import SimEventPage from './SimEvent';
import type { EventChoice } from './EventForm';
import { standings } from './series';
import { raceFacts, writeUp } from './writeup';
import { SimSequence, chosenSequence, keepSequences, keptSequences, loadClubSequences, warmSequence } from './startbox';
import { ChannelTransport, ClubRooms, LiveRace, LiveRoom, OpenRoom, RoomSettings, cleanCode, newCode, roomChannel } from './live';
import SimLive, { roomTitle } from './SimLive';
import GamepadModal from './GamepadModal';
import { activePad, loadMapping, saveMapping } from './input';
import { usePads } from './transmitter';

interface RaceSimulatorPageProps {
  darkMode: boolean;
  /** The signed-in member, to sail under their own name and sail number and keep progress in their
   *  account; `admin` when they can set challenges for their club, `superAdmin` for every club. */
  account?: (Account & { admin?: boolean; superAdmin?: boolean }) | null;
  /** Leave the Sailing Academy (it fills the window, with no menu: this is the way out). */
  onExit?: () => void;
}

// v2: the new defaults (sails on your stick, choppy water, the bank view). Old v1 settings are
// carried over except auto-trim, which now starts off.
const SETUP_KEY = 'alfie-race-sim-setup-v2';
/** "Not now" to appearing on the world's boards, on this device. */
const WORLD_ASKED = 'alfie-race-sim-world-asked-v1';
const SETUP_KEY_V1 = 'alfie-race-sim-setup-v1';

/** Has a set-up been saved on this device? (If not, a member starts at their own club's water.) */
function hasSetup(): boolean {
  try { return !!(localStorage.getItem(SETUP_KEY) ?? localStorage.getItem(SETUP_KEY_V1)); } catch { return true; }
}

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

function toSettings(s: Setup, mode: 'race' | 'start', today: VenueWind | null, me: SimIdentity | null, seq: SimSequence | null = null, yard: Yard | null = null): RaceSettings {
  // At a venue: its usual breeze, today's wind there (direction and strength), or any direction.
  const def = s.venue !== 'pond' ? VENUES[s.venue] : undefined;
  const live = def && s.windDir === 'today' && today ? today : null;
  const windFrom = !def ? undefined : live ? live.from : s.windDir === 'any' ? Math.floor(Math.random() * 360) : windAt(def, s.windPick).from;
  // Today's strength too, unless a strength was picked to sail in from today's direction.
  const knots = live && s.todayStrength !== false ? live.kn : undefined;
  return {
    venue: def?.id, windFrom, windKnots: knots,
    // Where on the venue's water you've chosen to sail (the club's own spot when you haven't).
    venueSpot: def ? s.spots?.[def.id] : undefined,
    // Your own name, your sail number (the one you've given her, or your boat's in Alfie) and how you've finished her.
    player: playerOf(me, 'name', s.classId, yard),
    classId: s.classId, fleetSize: s.fleetSize, level: s.level,
    // (Races set up from here on use the second tuning of the computer's skippers: the levels further apart.)
    tune: 2,
    windStrength: s.windStrength, windCharacter: s.windCharacter,
    laps: mode === 'start' ? 1 : s.laps, length: s.length,
    sequenceSeconds: seq ? seq.seconds : s.sequenceSeconds, coach: s.coach, autoTrim: s.autoTrim,
    forgetfulSkippers: s.forgetfulSkippers, seaState: s.seaState,
    // (Your own rig is for a race you set up: an IOM, and never a start drill.)
    rig: s.classId === 'IOM' && s.rig ? s.rig : undefined,
    seed: Math.floor(Math.random() * 1e9),
  };
}

/** You, on the water: your name, the number on your sail and how you've finished your boat in this class. */
function playerOf(me: SimIdentity | null, as: 'name' | 'short', cls: ClassId, yard: Yard | null): RaceSettings['player'] {
  if (!me && !yard) return undefined;
  const y: Yard = yard ?? { yachts: [], racing: {}, at: 0 };
  return { name: me?.[as] ?? 'You', sail: sailFor(y, cls, me).sail, look: lookFor(y, cls) };
}

/** A short notice over the page (a race's water couldn't be loaded). */
function PageNote({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div role="alert" className="fixed inset-x-0 bottom-5 z-[9990] mx-auto flex w-[min(560px,calc(100vw-24px))] items-center gap-3 rounded-2xl border border-[rgba(255,159,67,0.45)] bg-[#1B1408] px-4 py-3 text-[13.5px] text-[#FFE1BD] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
      <span className="min-w-0 flex-1 leading-snug">{text}</span>
      <button type="button" onClick={onClose} className="h-8 shrink-0 cursor-pointer rounded-lg border border-white/20 bg-transparent px-3 text-[13px] font-semibold text-[#FFE1BD]">OK</button>
    </div>
  );
}

type Where = 'home' | 'career' | 'bench' | 'world' | 'trainer' | 'academy' | 'lab' | 'playbook' | 'passport' | 'judge' | 'yacht' | 'race' | 'debrief' | 'challenge' | 'live' | 'event';

/** The race of a challenge, sailed by you: the same race as everyone's, under your own name and number. */
function challengeSettings(c: Challenge, me: SimIdentity | null, autoTrim: boolean, yard: Yard | null): RaceSettings {
  return { ...c.settings, autoTrim, player: playerOf(me, 'short', c.settings.classId, yard) };
}
type Group = ActiveScene['group'];

const GROUP_PAGE: Record<Group, Where> = { 'Start Trainer': 'trainer', 'Rules Academy': 'academy', 'Scenario Lab': 'lab', 'First sail': 'home' };

/** The next thing to try after a scene: the next drill, situation you can sail, or lab moment. */
function nextAfter(spec: SceneSpec): { spec: SceneSpec; label: string } | null {
  if (spec.kind === 'drill') {
    const i = DRILLS.findIndex(d => d.id === spec.id);
    const n = DRILLS[i + 1];
    return n ? { spec: n, label: `Next drill: ${n.title}` } : null;
  }
  if (spec.kind === 'lab' && FIRST.some(m => m.id === spec.id)) {
    const n = FIRST[FIRST.findIndex(m => m.id === spec.id) + 1];
    return n ? { spec: n, label: `Next step: ${n.title}` } : null;
  }
  if (spec.kind === 'lab') {
    // In the order the lab shows them: section by section.
    const order = LAB_GROUPS.flatMap(g => LAB.filter(m => m.group === g.id));
    const i = order.findIndex(m => m.id === spec.id);
    const n = order[i + 1];
    return n ? { spec: n, label: `Next: ${n.title}` } : null;
  }
  const ids = MODULES.flatMap(m => m.situations.filter(s => s.play).map(s => `${m.id}/${s.id}`));
  const i = ids.indexOf(spec.id);
  const n = ids[i + 1] ? findScene('lesson', ids[i + 1]) : null;
  return n ? { spec: n, label: `Next: ${n.title}` } : null;
}

export default function RaceSimulatorPage({ darkMode, account = null, onExit }: RaceSimulatorPageProps) {
  void darkMode; // the simulator is always on the water: one dark look
  const [where, setWhere] = useState<Where>('home');
  // Which of the Academy's doors is open (it's kept while you're off in a race or a drill).
  const [door, setDoor] = useState<Door>('home');
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [run, setRun] = useState<{
    /** The one thing this race is for (a race you set up yourself, once you have a ledger to pick it from). */
    focus?: Focus | null;
    /** A rehearsal of the club's next race day: racing again rehearses it again. */
    rehearsal?: boolean;
    settings?: RaceSettings; scene?: ActiveScene; mode: 'race' | 'start' | 'scene'; key: number; resume?: { log: RaceLog; step: number };
    challenge?: Challenge; ghost?: { log: RaceLog; settings: RaceSettings; label: string };
    /** A race of a virtual race event (the challenge is the race), and whether it's only practice
     *  (your first try is used, or the race has closed). */
    event?: SimEvent; practice?: boolean;
    /** The StartBox sequence to play with the countdown. */
    sequence?: SimSequence | null;
    /** A live race against other members, and its room code. */
    live?: LiveRace; liveCode?: string;
    /** A race of your race day on the Circuit, and what it's called. */
    career?: boolean; title?: string;
  } | null>(null);
  const [debrief, setDebrief] = useState<{ race: Race; sum: RaceSummary; moments: Moment[]; challenge?: Challenge; event?: SimEvent; career?: { title: string; left: number } } | null>(null);
  // Virtual race events you can see, and the one open.
  const [events, setEvents] = useState<SimEvent[] | null>(null);
  // The world: its events (null until loaded, or not there), how you appear, your results, and the
  // flags of the skippers on the event you've opened from it.
  const [world, setWorld] = useState<WorldEvent[] | null>(null);
  const [skipper, setSkipper] = useState<Skipper | null | undefined>(undefined);
  const [worldResults, setWorldResults] = useState<WorldResult[] | null>(null);
  const [worldClub, setWorldClub] = useState<string | null>(null);
  const [worldFlags, setWorldFlags] = useState<Map<string, Skipper>>(new Map());
  const [evFrom, setEvFrom] = useState<'home' | 'world'>('home');
  const [declined, setDeclined] = useState(() => { try { return localStorage.getItem(WORLD_ASKED) === 'no'; } catch { return false; } });
  const [openEv, setOpenEv] = useState<SimEvent | null>(null);
  // Challenges you can see, the one open, and how your last go at one went.
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [openCh, setOpenCh] = useState<Challenge | null>(null);
  const [chNote, setChNote] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [training, setTraining] = useState<TrainingProgress>(loadTraining);
  // The boats you've designed: on this device, and (riding with your training progress) in your account.
  const [yard, setYard] = useState<Yard>(loadYard);
  // (Read when a race is set up, so the race always carries the boat as she is now.)
  const yardNow = useRef(yard);
  yardNow.current = yard;
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
    // (Training first: a reset made on another device is known before the races are merged.)
    void syncTraining(a, { ...loadTraining(), yard: loadYard() }).then(t => {
      void pullRaces(a).then(rs => {
        if (!live || !rs) return;
        const since = (t ?? loadTraining()).resetAt ?? 0;
        // Started again on another device: the races from before it go from this one too.
        if (since) { const p = loadProfile(); if (p.races.some(r => r.at < since)) { clearProfile(); for (const r of p.races.filter(x => x.at >= since).reverse()) saveRace(r); } }
        setProfile(mergeRaces(rs, since)); setSynced(true);
      });
      if (!live || !t) return;
      setTraining(saveTraining(t));
      // The newer of this device's boats and the account's.
      if (t.yard && t.yard.at > loadYard().at) setYard(saveYard(cleanYard(t.yard)));
    });
    return () => { live = false; };
  }, [userId, clubId]);
  // The club's StartBox sequences: the race starts with the club's own unless you choose otherwise.
  // They start from the ones found last time on this device, so a race opened before StartBox has
  // answered (or when it can't be reached) still starts with the club's own sequence.
  const [sequences, setSequences] = useState<SimSequence[]>(() => keptSequences(clubId));
  const seqNow = useRef(sequences);
  seqNow.current = sequences;
  const seqLoad = useRef<Promise<SimSequence[] | null> | null>(null);
  const seqLoaded = useRef(false);
  /** StartBox hasn't answered yet (the home screen says so, so it never shows the simulator's own calls by mistake). */
  const [seqBusy, setSeqBusy] = useState(true);
  /** Start was pressed before StartBox answered: the race opens as soon as it does. */
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    let live = true;
    seqLoaded.current = false;
    setSeqBusy(true);
    setSequences(keptSequences(clubId));
    // (Couldn't be read: one more try, then carry on with the ones kept from last time.)
    const load = (async () => {
      const first = await loadClubSequences(clubId);
      if (first || !live) return first;
      await new Promise(r => window.setTimeout(r, 1500));
      return live ? loadClubSequences(clubId) : null;
    })();
    seqLoad.current = load;
    void load.then(q => { if (!live) return; seqLoaded.current = true; setSeqBusy(false); if (q) { setSequences(q); keepSequences(clubId, q); } });
    return () => { live = false; };
  }, [clubId]);
  /** The club's sequences. Still on their way with none kept from before? The race waits for them (up to 8 seconds), so it's StartBox that calls the start and not the simulator's own calls because you were quick. */
  const withSequences = useCallback((go: (list: SimSequence[]) => void) => {
    if (seqLoaded.current || !seqLoad.current || seqNow.current.length) { go(seqNow.current); return; }
    let done = false;
    setOpening(true);
    const once = (list: SimSequence[] | null) => { if (!done) { done = true; setOpening(false); go(list ?? seqNow.current); } };
    void seqLoad.current.then(once);
    window.setTimeout(() => once(null), 8000);
  }, []);
  const startSeq = chosenSequence(sequences, setup.startSeq, setup.sequenceSeconds);
  // Its recording starts loading now, so it's ready the moment a race opens.
  const startSeqId = startSeq?.id;
  useEffect(() => { warmSequence(startSeq); }, [startSeqId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live races: the room you're in, and your club's open rooms.
  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [clubRooms, setClubRooms] = useState<ClubRooms | null>(null);
  useEffect(() => {
    if (!userId || !clubId) return;
    const c = new ClubRooms(clubId);
    const off = c.subscribe(() => setOpenRooms(c.rooms));
    setClubRooms(c);
    return () => { off(); c.close(); setClubRooms(null); };
  }, [userId, clubId]);
  const liveMe = useCallback(() => {
    // In a live race everyone sees your boat as you've finished her, under the number you've given her.
    const sails: Partial<Record<ClassId, string>> = { ...(me?.sails ?? {}) }, looks: Partial<Record<ClassId, BoatLook>> = {};
    for (const c of Object.keys(CLASSES) as ClassId[]) { const n = sailFor(yard, c, me); if (n.from !== 'none') sails[c] = n.sail; looks[c] = lookFor(yard, c); }
    return { id: userId ?? 'guest', name: me?.short ?? me?.name ?? 'Sailor', sails, looks, autoTrim: setup.autoTrim };
  }, [userId, me, setup.autoTrim, yard]);
  const openLive = useCallback(() => {
    const seq = chosenSequence(sequences, setup.startSeq, setup.sequenceSeconds);
    const full = toSettings(setup, 'race', todayWind, null, seq);
    const { seed: _seed, player: _player, ...rs } = full;
    void _seed; void _player;
    const code = newCode();
    setRoom(new LiveRoom(code, liveMe(), true, rs as RoomSettings, new ChannelTransport(roomChannel(code))));
    setWhere('live');
  }, [sequences, setup, todayWind, liveMe]);
  const joinLive = useCallback((code: string) => {
    const c = cleanCode(code);
    if (c.length !== 6) return;
    setRoom(new LiveRoom(c, liveMe(), false, null, new ChannelTransport(roomChannel(c))));
    setWhere('live');
  }, [liveMe]);
  const leaveRoom = useCallback(() => {
    room?.leave();
    clubRooms?.advertise(null);
    setRoom(null);
  }, [room, clubRooms]);
  // In the room: the race's water has to be on this device before you can be ready (a club's own
  // water is fetched when the host's race arrives).
  const [roomWater, setRoomWater] = useState<'ok' | 'loading' | 'missing'>('ok');
  // In the room: advertise it at the club while it waits (the host), and go to the race together
  // the moment the host starts it.
  useEffect(() => {
    if (!room) return;
    let asked: string | undefined;
    const sync = () => {
      const v = room.settings?.venue;
      if (v !== asked) {
        asked = v;
        if (!v || VENUES[v]) setRoomWater('ok');
        else { setRoomWater('loading'); void ensureVenue(v).then(ok => { if (asked === v) setRoomWater(ok ? 'ok' : 'missing'); }); }
      }
      if (room.race && where === 'live') {
        clubRooms?.advertise(null);
        const settings = room.race.race.settings;
        setRun({ settings, mode: 'race', key: Date.now(), live: room.race, liveCode: room.code, sequence: startSeq && startSeq.seconds === settings.sequenceSeconds ? startSeq : null });
        setRunView(setup.view);
        setWhere('race');
        return;
      }
      if (room.isHost && room.settings && !room.race) {
        clubRooms?.advertise({ code: room.code, host: me?.short ?? 'A member', title: roomTitle(room.settings), people: room.people.length, at: Date.now() });
      }
    };
    sync();
    return room.subscribe(sync);
  }, [room, where, clubRooms, me, startSeq, setup.view]);
  // Your transmitter, set up from the home page as well as from a race.
  const pads = usePads();
  const [padOpen, setPadOpen] = useState(false);
  const refreshChallenges = useCallback(() => {
    if (!userId) return;
    void listChallenges().then(cs => setChallenges(cs));
  }, [userId]);
  useEffect(() => { refreshChallenges(); }, [refreshChallenges]);
  const refreshEvents = useCallback(() => {
    if (!userId) return;
    void listEvents().then(es => {
      setEvents(es);
      // Keep the open one up to date (a race may have opened or closed since).
      if (es) setOpenEv(o => (o ? es.find(e => e.id === o.id) ?? o : o));
    });
  }, [userId]);
  useEffect(() => { refreshEvents(); }, [refreshEvents]);
  const refreshWorld = useCallback(() => {
    if (!userId) return;
    const a = { userId, clubId };
    void listWorld().then(setWorld);
    void mySkipper(a).then(setSkipper);
    void myResults(a).then(setWorldResults);
  }, [userId, clubId]);
  useEffect(() => { refreshWorld(); }, [refreshWorld]);
  useEffect(() => { if (clubId && userId) void clubName(clubId).then(setWorldClub); }, [clubId, userId]);
  const trainingChanged = useCallback((t: TrainingProgress) => {
    setTraining(t);
    if (userId) void syncTraining({ userId, clubId }, t);
  }, [userId, clubId]);

  /** Start again: races, training and the Circuit cleared here and in the account; the yachts kept or not. */
  const startAgain = useCallback((keepYachts: boolean) => {
    const t = resetTraining(keepYachts);
    clearProfile();
    setProfile(loadProfile());
    if (!keepYachts) { const empty = saveYard({ yachts: [], racing: {}, at: t.resetAt ?? Date.now() }); setYard(empty); }
    setDebrief(null); setDoor('home');
    trainingChanged(t);
    if (userId) void clearRaces({ userId, clubId });
  }, [trainingChanged, userId, clubId]);
  // A boat redesigned: kept here at once, and sent to the account a moment after the last change
  // (a colour tried and passed over isn't worth a trip).
  const yardSend = useRef(0);
  const yardChanged = useCallback((y: Yard) => {
    setYard(saveYard(y));
    window.clearTimeout(yardSend.current);
    yardSend.current = window.setTimeout(() => {
      const t = saveTraining({ ...loadTraining(), yard: y, updatedAt: Date.now() });
      setTraining(t);
      if (userId) void syncTraining({ userId, clubId }, t);
    }, 1500);
  }, [userId, clubId]);

  // Was there a saved set-up when the page opened, and has one been chosen since?
  const startedFresh = useRef(!hasSetup()), touched = useRef(false);
  const changeSetup = useCallback((s: Setup) => { touched.current = true; setSetup(s); storeSetup(s); }, []);
  // Clubs' own water, from the database: loaded once you're signed in, and kept in step with the
  // set-up (a water that has changed has a new id; a club's own version stands in for the one that
  // came with the app).
  const [waters, setWaters] = useState<Water[]>([]);
  const [waterNote, setWaterNote] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void loadWaters().then(w => { if (live && w) setWaters(w); });
    return () => { live = false; };
  }, [userId]);
  useEffect(() => {
    if (!waters.length) return;
    setSetup(s => {
      let venue = s.venue;
      // First time here, and nothing chosen yet: your own club's water.
      const home = startedFresh.current && !touched.current && clubId ? waters.find(w => w.published && w.clubId === clubId) : null;
      if (home) venue = home.def.id;
      if (!VENUES[venue] || venue.startsWith('db-')) venue = currentId(waters, venue) ?? venue;
      const built = VENUES[venue];
      const own = built && !venue.startsWith('db-') ? waters.find(w => w.published && w.venueId && w.venueId === built.venueId) : null;
      if (own) venue = own.def.id;
      if (venue === s.venue) return s;
      const n = { ...s, venue };
      storeSetup(n);
      return n;
    });
  }, [waters, clubId]);
  /** Before a race that isn't from the home set-up: make sure its water is here. */
  const waterFor = useCallback(async (settings: RaceSettings): Promise<boolean> => {
    const ok = await ensureVenue(settings.venue);
    setWaterNote(ok ? null : "This race's water couldn't be loaded, so it can't be sailed right now. Check your connection and try again.");
    return ok;
  }, []);

  // First time here: start at your own club's water, when it's one of the venues.
  const fresh = useRef(!hasSetup());
  useEffect(() => {
    if (!fresh.current || !clubId) return;
    fresh.current = false;
    const mine = venueForClub(clubId);
    if (mine) setSetup(s => (s.venue === mine.id ? s : { ...s, venue: mine.id, windDir: 'usual', windPick: 0 }));
  }, [clubId]);
  const changeView = useCallback((v: SimView) => {
    setRunView(v);
    if (run?.scene?.spec.kind === 'lesson') return;
    setSetup(s => { const n = { ...s, view: v }; storeSetup(n); return n; });
  }, [run]);

  const start = useCallback((mode: 'race' | 'start', s: Setup) => {
    withSequences(list => {
      const seq = chosenSequence(list, s.startSeq, s.sequenceSeconds);
      setRun({ settings: toSettings(s, mode, todayWind, me, seq, yardNow.current), mode, key: Date.now(), sequence: seq, focus: mode === 'race' ? raceFocus(loadProfile()) : null });
      setRunView(s.view);
      setWhere('race');
    });
  }, [todayWind, me, withSequences]);

  // The club's next race day and its forecast, to rehearse (signed in, with a club).
  const [nextRace, setNextRace] = useState<NextRace | null>(null);
  // Where it's rehearsed: your club's water, or failing that the venue you've set up (null on the practice pond).
  // What the world's tables show beside your name: your level and rating once placed, and your medals.
  const worldStats = useMemo(() => {
    const st = standing(profile, !!training.newcomer);
    const medals = training.career?.medals ?? [];
    return { rating: st.placed ? st.rating : null, level: st.placed ? st.level : null, medals: medals.length, titles: medals.filter(m => m.trophy).length };
  }, [profile, training.newcomer, training.career]);
  useEffect(() => { if (userId && skipper) void syncSkipperStats({ userId, clubId }, skipper, worldStats); }, [userId, clubId, skipper, worldStats]);
  // The world's card in the Race door: shown once the world has races (they open only when it's switched on).
  const worldCard = useMemo(() => {
    if (!userId || !world || !world.length) return null;
    const w = worldNow(world, setup.classId);
    const line = [w.daily ? "Today's daily race is open" : null, w.major ? `${w.major.title} is under way` : w.regatta ? "this week's World Regatta is open" : null].filter(Boolean).join('; ');
    return { line: line ? `${line[0].toUpperCase()}${line.slice(1)}.` : 'The daily race, the World Regatta and the Majors.', onOpen: () => { refreshWorld(); setWhere('world'); } };
  }, [userId, world, setup.classId, refreshWorld]);
  const rehearseAt = useMemo(() => venueForClub(clubId) ?? (setup.venue !== 'pond' ? VENUES[setup.venue] ?? null : null), [clubId, setup.venue, waters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userId || !clubId) { setNextRace(null); return; }
    let live = true;
    void loadNextRace(rehearseAt).then(n => { if (live) setNextRace(n); });
    return () => { live = false; };
  }, [userId, clubId, rehearseAt]);
  // "Blown out? Race it here": the club's race day the weather took, for its admins to race here.
  const clubAdmin = !!clubId && (!!account?.admin || !!account?.superAdmin);
  const [blownOut, setBlownOut] = useState<(NextRace & { cancelled: boolean }) | null>(null);
  useEffect(() => {
    if (!userId || !clubAdmin) { setBlownOut(null); return; }
    let live = true;
    void loadBlownOut(rehearseAt).then(n => { if (live) setBlownOut(n); });
    return () => { live = false; };
  }, [userId, clubAdmin, rehearseAt]);
  // A virtual event of your club's still to sail (one of the last few days': a race day raced here,
  // say): Next up puts it in front of you until you've had your try at each open race.
  const [clubCall, setClubCall] = useState<{ event: SimEvent; left: number; hours: number } | null>(null);
  useEffect(() => {
    if (!userId || !clubId || !events) { setClubCall(null); return; }
    const now = Date.now();
    const recent = events
      .filter(e => e.club_id === clubId && now - Date.parse(e.created_at) < 4 * 86400000 && e.races.some(r => isOpen(r, now)))
      .sort((a, z) => z.created_at.localeCompare(a.created_at))[0];
    if (!recent) { setClubCall(null); return; }
    let live = true;
    void eventEntries(recent).then(es => {
      if (!live || !es) return;
      const open = recent.races.filter(r => isOpen(r, now));
      const left = open.filter(r => !es.some(e => e.challenge_id === r.id && e.user_id === userId)).length;
      const closes = Math.min(...open.map(r => (r.closes_at ? Date.parse(r.closes_at) : Infinity)));
      setClubCall(left > 0 ? { event: recent, left, hours: Number.isFinite(closes) ? Math.max(1, Math.round((closes - now) / 3600000)) : 0 } : null);
    });
    return () => { live = false; };
  }, [userId, clubId, events]);
  /** Sail the next race day: the club's water (or the one set up), the day's class, the forecast wind. */
  const rehearse = useCallback(() => {
    if (!nextRace) return;
    const at = rehearseAt;
    const w = nextRace.wind;
    const s: Setup = {
      ...setup, venue: at ? at.id : setup.venue, classId: nextRace.classId ?? setup.classId, windPick: 0,
      windDir: w && at ? 'today' : 'usual', todayStrength: true,
      windStrength: w ? (w.kn < 7 ? 'light' : w.kn <= 12 ? 'medium' : 'fresh') : setup.windStrength,
    };
    withSequences(list => {
      const seq = chosenSequence(list, s.startSeq, s.sequenceSeconds);
      setRun({ settings: toSettings(s, 'race', w && at ? { from: w.from, kn: w.kn, at: nextRace.date } : null, me, seq, yardNow.current), mode: 'race', key: Date.now(), sequence: seq, focus: raceFocus(loadProfile()), rehearsal: true });
      setRunView(s.view);
      setWhere('race');
    });
  }, [nextRace, rehearseAt, setup, me, withSequences]);

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
      dress: cls => ({ sail: sailFor(yardNow.current, cls, me).sail, look: lookFor(yardNow.current, cls) }),
    };
    if (spec.kind === 'lesson') setAcademyAt(spec.id);
    // (A drill with a countdown is called by the club's StartBox sequence too, when it's long enough.)
    setRun({ scene, mode: 'scene', key: Date.now(), sequence: startSeq });
    setRunView(spec.kind === 'lesson' ? 'top' : setup.view);
    setWhere('race');
  }, [training, setup, startSeq, me]);

  /** You, on the Circuit's sheets: your name and your number in the season's class. */
  const careerMe = useCallback((c: Career | null) => ({ name: me?.short ?? 'You', sail: sailFor(yardNow.current, c?.cls ?? setup.classId, me).sail }), [me, setup.classId]);
  /** Sail the next race of your race day on the Circuit (with the day done, back to its screen). */
  const sailCareer = useCallback(() => {
    const was = loadTraining().career ?? newCareer(setup.classId, Date.now());
    if (dayState(was).left <= 0) { setWhere('career'); return; }
    // (A heat event: the heats before yours in the round are sailed first, so the next one is yours.)
    const career = prepareRace(was, Date.now());
    if (career !== loadTraining().career) trainingChanged(saveCareer(career));
    withSequences(list => {
      const seq = chosenSequence(list, setup.startSeq, setup.sequenceSeconds);
      const base = toSettings({ ...setup, classId: career.cls }, 'race', null, me, seq, yardNow.current);
      const day = dayState(career), hn = heatNow(career);
      setRun({ settings: careerRace(career, base), mode: 'race', key: Date.now(), sequence: seq, focus: raceFocus(loadProfile()), career: true, title: hn ? `${day.event.name} · Round ${hn.round} of ${hn.rounds}, ${hn.finals ? `${FLEET_NAME[hn.heat as 'A'] ?? hn.heat} fleet` : `heat ${hn.heat}`}` : `${day.event.name} · Race ${day.raced + 1} of ${day.event.races}` });
      setRunView(setup.view);
      setWhere('race');
    });
  }, [setup, me, withSequences, trainingChanged]);

  // A race of your race day on the Circuit goes on the day's sheet once: when you finish it, or, if
  // you leave it (or start it again) after the gun, as a DNF. Leaving before the gun doesn't count.
  const careerDone = useRef<number | null>(null);
  const careerGun = useRef<number | null>(null);
  const careerNoteRef = useRef<{ title: string; left: number } | undefined>(undefined);
  const recordCareer = useCallback((race: Race) => {
    if (!run?.career || run.resume || careerDone.current === run.key) return;
    careerDone.current = run.key;
    const before = loadTraining().career ?? newCareer(race.settings.classId, Date.now());
    const rows = raceRows(before, race.results().map(r => ({ boat: race.boats.indexOf(r.boat), isPlayer: r.boat.isPlayer, status: r.status, place: r.place })), race.settings.cast?.map(c => c.id));
    const hnBefore = heatNow(before);
    const after = recordRace(before, rows, Date.now());
    trainingChanged(saveCareer(after));
    const st = dayState(after), mine = dayStandings(after, careerMe(after)).find(r => r.userId === ME);
    const my = rows.find(r => r.id === ME);
    const hnAfter = heatNow(after);
    // HMS: finish high enough in your heat and you're promoted into the one above, to sail it in the same round.
    const promoted = !!hnBefore?.heat && !!hnAfter && hnAfter.round === hnBefore.round && hnAfter.heat !== hnBefore.heat && hnAfter.ids.includes(ME);
    careerNoteRef.current = hnBefore ? { title: `${st.event.name} · Round ${hnBefore.round}, ${hnBefore.finals ? `${FLEET_NAME[hnBefore.heat as 'A'] ?? hnBefore.heat} fleet` : `heat ${hnBefore.heat}`}`, left: st.left } : { title: `${st.event.name} · Race ${st.raced} of ${st.event.races}`, left: st.left };
    setChNote(`${hnBefore ? `Heat ${hnBefore.heat}` : 'This race'}: ${my?.place ? `${ordinal(my.place)} of ${rows.length}` : my?.code ?? 'not finished'}.${promoted ? ` Promoted: you sail heat ${hnAfter!.heat} next, in this round.` : ''}${mine ? ` On the day so far: ${ordinal(mine.rank)} of ${rows.length}, ${mine.net} point${mine.net === 1 ? '' : 's'} net.` : ''}${st.canSimulate ? ' You can simulate the rest of the day from here, or sail on.' : st.left ? '' : ' That was the last race of the day.'}`);
  }, [run, trainingChanged, careerMe]);
  /** Left (or started again) after the gun without finishing: a DNF on the day's sheet. True when it was put there. */
  const leaveCareerRace = useCallback((): boolean => {
    if (!run?.career || run.resume || careerDone.current === run.key || careerGun.current !== run.key) return false;
    careerDone.current = run.key;
    const before = loadTraining().career;
    if (!before) return false;
    trainingChanged(saveCareer(abandonRace(before, (run.settings?.cast ?? []).map(c => c.id ?? '').filter(Boolean), Date.now())));
    setWaterNote("You left after the gun, so the race counts: a DNF on the day's sheet.");
    return true;
  }, [run, trainingChanged]);

  const toDebrief = useCallback((race: Race, sum: RaceSummary, moments: Moment[]) => {
    if (run?.focus && sum.ledger && sum.status !== 'dnf') sum.focus = focusResult(run.focus, sum.ledger);
    setProfile(saveRace(sum));
    // A live race: done with the room (once your boat has finished, the others don't wait for you).
    if (run?.live) leaveRoom();
    const ch = run?.challenge;
    const ev = run?.event;
    if (userId) {
      const a = { userId, clubId };
      void pushRace(a, sum, race.settings);
      if (ev && ch && (run?.practice || run?.resume)) {
        setChNote(run?.resume ? "Taken over part way through, so this one is practice: it doesn't count in the event." : 'Practice: it doesn\'t count in the event.');
      } else if (ev && ch) {
        // A race of an event: your result (the try you started at the gun, or your best), then
        // where that puts you in the race and in the event.
        setChNote('Putting your result in the event…');
        void submitEntry(a, ch, { name: me?.short ?? 'AlfiePRO sailor', sail: race.player?.sail ?? null }, sum, race.log, race.settings, ev.tries === 'first').then(async r => {
          if (!r) { setChNote("Couldn't save your result just now."); return; }
          const es = await eventEntries(ev);
          const row = es ? standings(seriesRaces(ev, es), ev.drops) : [];
          const k = row.findIndex(x => x.userId === userId);
          const inRace = r.rank !== null ? `This race: ${ordinal(r.rank)} of ${r.of}.` : '';
          const overall = k >= 0 ? ` Overall: ${ordinal(row[k].rank)} of ${row.length}${row.some(x => x.scores.some(sc => sc?.pending)) ? ' so far' : ''}.` : '';
          setChNote(`${r.saved ? '' : ev.tries === 'first' ? 'Your first try stands. ' : 'Your best result stands. '}${inRace}${overall}`.trim() || 'Saved.');
        });
      } else if (ch && !run?.resume) {
        setChNote('Putting your result on the leaderboard…');
        void submitEntry(a, ch, { name: me?.short ?? 'AlfiePRO sailor', sail: race.player?.sail ?? null }, sum, race.log, race.settings).then(r => {
          if (!r) setChNote("Couldn't save to the leaderboard just now.");
          else if (r.rank === null) setChNote(r.saved ? 'Saved to the leaderboard.' : 'Your best result stays on the leaderboard.');
          else setChNote(`${r.saved ? 'On the leaderboard' : 'Your best stays'}: ${r.rank === 1 ? 'top' : ordinal(r.rank)} of ${r.of}.`);
        });
      } else setChNote(ch ? 'Taken over part way through, so this one is practice: it doesn\'t go on the leaderboard.' : null);
    }
    // A race of your race day on the Circuit: on the day's sheet, as it finished (put there when the
    // results came up, so it counts whether or not you came on to the debrief).
    let careerNote: { title: string; left: number } | undefined;
    if (run?.career && !run.resume) {
      recordCareer(race);
      careerNote = careerNoteRef.current;
    } else if (run?.career) setChNote("Taken over part way through, so this one is practice: it isn't on the day's sheet.");
    setDebrief({ race, sum, moments, challenge: ch, event: ev, career: careerNote });
    setWhere('debrief');
  }, [userId, clubId, run, me, leaveRoom, recordCareer]);

  // Sail a challenge, against nobody or against an entry's ghost.
  const sailChallenge = useCallback(async (c: Challenge, ghostOf: ChallengeEntry | null) => {
    let ghost: { log: RaceLog; settings: RaceSettings; label: string } | undefined;
    if (ghostOf) {
      const g = await entryLog(ghostOf.id);
      if (g) ghost = { log: g, settings: g.settings, label: `Ghost · ${ghostOf.display_name}` };
    }
    if (!(await waterFor(c.settings))) return;
    // The club's sequence calls it if it's long enough for the challenge's countdown (it joins part-way through); otherwise the simulator does.
    const seq = startSeq && startSeq.seconds >= c.settings.sequenceSeconds ? startSeq : null;
    setRun({ settings: challengeSettings(c, me, setup.autoTrim, yardNow.current), mode: 'race', key: Date.now(), challenge: c, ghost, sequence: seq });
    setRunView(setup.view);
    setWhere('race');
  }, [me, setup.autoTrim, setup.view, startSeq, waterFor]);

  // Sail a race of an event: for real (your first try starts at the gun) or for practice, against
  // nobody or a ghost (an entry's own race, once the race has closed).
  const sailEventRace = useCallback(async (ev: SimEvent, race: EventRace, o: { practice: boolean; ghost: ChallengeEntry | null }) => {
    let ghost: { log: RaceLog; settings: RaceSettings; label: string } | undefined;
    if (o.ghost) {
      const g = await entryLog(o.ghost.id);
      if (g) ghost = { log: g, settings: g.settings, label: `Ghost · ${o.ghost.display_name}` };
    }
    if (!(await waterFor(race.settings))) return;
    const seq = startSeq && startSeq.seconds >= race.settings.sequenceSeconds ? startSeq : null;
    // A race that has closed can only be sailed for practice.
    // A world race counts only for those who appear on its boards: until then it's practice.
    const unseen = isWorld(ev) && !skipper;
    if (unseen && !o.practice) setWaterNote("Sailing for practice: choose how you appear (in The world) and your first try at a race will count.");
    setRun({ settings: challengeSettings(race, me, setup.autoTrim, yardNow.current), mode: 'race', key: Date.now(), challenge: race, event: ev, practice: o.practice || !isOpen(race) || unseen, ghost, sequence: seq });
    setRunView(setup.view);
    setWhere('race');
  }, [me, setup.autoTrim, setup.view, startSeq, waterFor, skipper]);

  const again = useCallback(() => {
    if (!run) return;
    if (run.scene) playScene(run.scene.spec, run.scene.group, false);
    // Again in a first-try event: your try is used, so it's practice.
    else if (run.event && run.challenge) void sailEventRace(run.event, run.challenge as EventRace, { practice: run.practice || run.event.tries === 'first', ghost: null });
    else if (run.challenge) void sailChallenge(run.challenge, null);
    else if (run.rehearsal) rehearse();
    else if (run.career) { leaveCareerRace(); sailCareer(); }
    else start(run.mode === 'start' ? 'start' : 'race', setup);
  }, [run, setup, start, playScene, sailChallenge, sailEventRace, rehearse, sailCareer, leaveCareerRace]);

  // Set up an event: every race is the race set up on the home page, with its own shifts (and, for
  // a mix, its own breeze), opening on the schedule chosen.
  // Race the blown-out race day here: its class, on the club's water, in the day's breeze (no stronger than a fresh day).
  const raceBlownOut = useCallback(async (races: number, days: number): Promise<string | null> => {
    if (!userId || !clubId || !blownOut) return 'Open the Academy from your club to do this.';
    const at = rehearseAt;
    const w = blownOut.wind;
    const kn = w ? Math.min(18, w.kn) : null;
    const s: Setup = {
      ...setup, venue: at ? at.id : setup.venue, classId: blownOut.classId ?? setup.classId, windPick: 0,
      windDir: w && at ? 'today' : 'usual', todayStrength: true,
      windStrength: kn === null ? setup.windStrength : kn < 7 ? 'light' : kn <= 12 ? 'medium' : 'fresh',
    };
    const base = toSettings(s, 'race', w && at && kn !== null ? { from: w.from, kn, at: blownOut.date } : null, null, startSeq);
    const ev = blownOutEvent(blownOut, base, races, days, new Date(), () => Math.floor(Math.random() * 1e9));
    const r = await createEvent({ userId, clubId }, { ...ev, clubId });
    if (typeof r === 'string') return /row-level security/i.test(r) ? "Only the club's admins can race a day here." : r;
    refreshEvents();
    setOpenEv(r); setEvFrom('home'); setWhere('event');
    return null;
  }, [userId, clubId, blownOut, rehearseAt, setup, startSeq, refreshEvents]);

  const setEvent = useCallback(async (c: EventChoice): Promise<string | null> => {
    if (!userId) return 'Sign in to set up an event.';
    const base = toSettings(setup, 'race', todayWind, null, startSeq);
    const settings = eventRaceSettings(base, c.races, c.mixed, () => Math.floor(Math.random() * 1e9));
    const windows = raceWindows(c.races, c.schedule, c.start);
    const r = await createEvent({ userId, clubId }, {
      clubId: c.everyone ? null : clubId, title: c.title, description: c.description, tries: c.tries,
      drops: c.drops ? STANDARD_DROPS : [], races: settings.map((s, k) => ({ settings: s, opens: windows[k].opens, closes: windows[k].closes })),
    });
    if (typeof r === 'string') return /row-level security/i.test(r) ? "Only the club's admins can set up its events." : r;
    refreshEvents();
    setOpenEv(r); setWhere('event');
    return null;
  }, [userId, clubId, setup, todayWind, startSeq, refreshEvents]);

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
    setRun({ settings: r.settings, mode: debrief.sum.mode, key: Date.now(), resume: { log: r.log, step: Math.max(0, Math.round(t / DT)) }, challenge: debrief.challenge, event: debrief.event, practice: !!debrief.event, sequence: startSeq && startSeq.seconds === r.settings.sequenceSeconds ? startSeq : null });
    setRunView(setup.view);
    setWhere('race');
  }, [debrief, setup.view, startSeq]);

  const sceneResult = useCallback((o: Outcome) => {
    if (!run?.scene) return;
    trainingChanged(recordScene(run.scene.spec, o, run.scene.higherIsBetter));
  }, [run, trainingChanged]);

  // The Playbook, opened at a play (from the debrief's ledger) or at the top.
  const [playAt, setPlayAt] = useState<string | null>(null);
  const openLink = useCallback((l: TrainLink) => {
    if (l.kind === 'lesson') { setAcademyAt(l.id); setWhere('academy'); return; }
    const spec = l.kind === 'drill' ? findDrill(l.id) : findMoment(l.id);
    if (spec) playScene(spec, l.kind === 'drill' ? 'Start Trainer' : FIRST.some(m => m.id === l.id) ? 'First sail' : 'Scenario Lab', false);
  }, [playScene]);

  const leaveRace = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    if (run?.live) leaveRoom();
    leaveCareerRace();
    setWhere(run?.scene ? GROUP_PAGE[run.scene.group] : run?.event ? 'event' : run?.challenge ? 'challenge' : run?.career ? 'career' : 'home');
    if (run?.event) refreshEvents();
  }, [run, leaveRoom, refreshEvents, leaveCareerRace]);

  // Racing fills the window, and so does the yacht designer: no page scrolling underneath them.
  useEffect(() => {
    if (where !== 'race' && where !== 'yacht') return;
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
          focus={run.focus ?? null}
          live={run.live}
          liveCode={run.liveCode}
          raceTitle={run.title}
          onGun={run.event?.tries === 'first' && !run.practice && !run.resume && userId && run.challenge
            ? () => { void startTry({ userId, clubId }, run.challenge as EventRace, { name: me?.short ?? 'AlfiePRO sailor', sail: run.settings?.player?.sail ?? null }); }
            : run.career && !run.resume ? () => { careerGun.current = run.key; } : undefined}
          onResult={run.career && !run.resume ? recordCareer : undefined}
        />
      </div>,
      document.body,
    );
  }

  if (where === 'debrief' && debrief) {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimDebrief race={debrief.race} sum={debrief.sum} moments={debrief.moments} onHome={() => setWhere('home')} onAgain={again} onLink={openLink} onPlay={id => { setPlayAt(id); setWhere('playbook'); }} onTakeOver={debrief.race.live ? undefined : takeOver}
          challenge={debrief.event && debrief.challenge
            ? {
              title: `${debrief.event.title} · Race ${(debrief.challenge as EventRace).race_no}`, note: chNote, event: true,
              againLabel: debrief.event.tries === 'first' ? 'Sail it again for practice' : undefined,
              onOpen: () => { refreshEvents(); setOpenEv(debrief.event!); setWhere('event'); },
            }
            : debrief.challenge ? { title: debrief.challenge.title, note: chNote, onOpen: () => { setOpenCh(debrief.challenge!); setWhere('challenge'); } }
              : debrief.career ? { title: debrief.career.title, note: chNote, event: true, againLabel: debrief.career.left ? 'Sail the next race' : 'Back to the race day', onOpen: () => setWhere('career') } : null}
          onWriteUp={userId ? () => writeUp(raceFacts(debrief.sum, debrief.moments, debrief.race.gunT, debrief.race.venue ? `${debrief.race.venue.def.name}, ${debrief.race.venue.def.place}` : 'the practice pond'), clubId) : undefined} />
      </div>
    );
  }

  if (where === 'live' && room) {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimLive room={room} myId={userId ?? ''} water={roomWater} onLeave={() => { leaveRoom(); setWhere('home'); }} />
      </div>
    );
  }

  if (where === 'event' && openEv) {
    const admin = !!account?.superAdmin || (!!account?.admin && openEv.club_id !== null && openEv.club_id === clubId);
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimEventPage key={openEv.id} event={openEv} me={userId} admin={admin}
          onSail={(race, o) => void sailEventRace(openEv, race, o)}
          countryOf={isWorld(openEv) ? (id => worldFlags.get(id)?.country ?? null) : undefined}
          onBack={() => { refreshEvents(); if (evFrom === 'world') refreshWorld(); setWhere(evFrom); }}
          onDelete={admin ? () => { void deleteEvent(openEv.id).then(ok => { if (ok) { setOpenEv(null); refreshEvents(); setWhere('home'); } }); } : undefined} />
        {waterNote && <PageNote text={waterNote} onClose={() => setWaterNote(null)} />}
      </div>
    );
  }

  if (where === 'challenge' && openCh) {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimChallenge challenge={openCh} me={userId} onSail={e => void sailChallenge(openCh, e)} onBack={() => { refreshChallenges(); setWhere('home'); }} />
        {waterNote && <PageNote text={waterNote} onClose={() => setWaterNote(null)} />}
      </div>
    );
  }

  if (where === 'world') {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimWorld setup={setup} cls={setup.classId} events={world ?? []} skipper={userId ? skipper : undefined} signedIn={!!userId}
          ownName={me?.name ?? null} club={clubId ? { id: clubId, name: worldClub } : null} country={alpha2(lookFor(yard, setup.classId).country)}
          results={worldResults} loadTable={worldTable} loadFlags={skippersOf}
          onAppear={async a => {
            if (!userId) return 'Sign in to AlfiePRO first.';
            const r = await saveSkipper({ userId, clubId }, a, worldStats);
            if (typeof r === 'string') return r;
            setSkipper(r);
            return null;
          }}
          onStopAppearing={async () => {
            if (!userId) return false;
            const ok = await stopAppearing({ userId, clubId });
            if (ok) setSkipper(null);
            return ok;
          }}
          declined={declined} onDecline={() => { setDeclined(true); try { localStorage.setItem(WORLD_ASKED, 'no'); } catch { /* this device only */ } }}
          onOpen={ev => {
            setOpenEv(ev); setEvFrom('world'); setWhere('event');
            void eventEntries(ev).then(es => skippersOf((es ?? []).map(e => e.user_id))).then(setWorldFlags);
          }}
          onBack={() => setWhere('home')} />
      </div>
    );
  }

  if (where === 'bench') {
    return <div key={where} className="h-full overflow-y-auto"><SimBench setup={setup} onBack={() => setWhere('home')} /></div>;
  }

  if (where === 'career') {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimCareer career={training.career ?? null} me={careerMe(training.career ?? null)} setup={setup} classLabel={c => CLASSES[c]?.name ?? c}
          licence={training.career?.ticket ? levelLicence(TIERS[TIERS.indexOf(training.career.ticket) - 1] as SkipperLevel, profile, training) : null} onLicence={g => { if (g === 'race') { setDoor('race'); setWhere('home'); } else setWhere(g); }}
          onChange={c => trainingChanged(saveCareer(c))} onSail={sailCareer} onBack={() => setWhere('home')} />
        {waterNote && <PageNote text={waterNote} onClose={() => setWaterNote(null)} />}
      </div>
    );
  }

  if (where === 'trainer') {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimTrainer progress={training} onPlay={d => playScene(d, 'Start Trainer', false)} onFullStart={() => start('start', setup)} onBack={() => setWhere('home')} />
      </div>
    );
  }

  if (where === 'academy') {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimAcademy progress={training} initial={academyAt}
          onAnswer={(id, ok) => trainingChanged(recordAnswer(id, ok))}
          onPlay={(id, watch) => { const spec = findScene('lesson', id); if (spec) playScene(spec, 'Rules Academy', watch); }}
          onBack={() => setWhere('home')} />
      </div>
    );
  }

  if (where === 'playbook') {
    return <div key={where} className="h-full overflow-y-auto"><SimPlaybook onBack={() => { setPlayAt(null); setWhere('home'); }} onLink={openLink} focus={playAt} /></div>;
  }
  // You be the judge.
  if (where === 'yacht') {
    // A screen of her own, over the whole window, as a race is. (She is laid out to fill her box,
    // so she can't sit in the page: the app's page has no height of its own, and there she came
    // out as nothing at all.)
    return createPortal(
      <div className="fixed inset-0 z-[9990]" style={{ background: '#060B1C' }} role="dialog" aria-modal="true" aria-label="Design your yacht">
        <SimYacht yard={yard} me={me} classId={setup.classId} signedIn={!!userId} onChange={yardChanged} unlocked={training.career?.owned ?? []} won={wonPaints(training.career)} onCircuit={() => setWhere('career')} onBack={cls => { if (cls && cls !== setup.classId) changeSetup({ ...setup, classId: cls }); setWhere('home'); }}
          onRace={cls => { if (cls !== setup.classId) changeSetup({ ...setup, classId: cls }); setWhere('home'); }} />
      </div>,
      document.body,
    );
  }
  if (where === 'judge') {
    return <div key={where} className="h-full overflow-y-auto"><SimJudge training={training} onBack={() => setWhere('home')} onLink={openLink} onCall={(id, points) => trainingChanged(recordJudge(id, points))} /></div>;
  }
  // The skill passport.
  if (where === 'passport') {
    return <div key={where} className="h-full overflow-y-auto"><SimPassport profile={profile} onBack={() => setWhere('home')} onLink={openLink} onPlay={id => { setPlayAt(id); setWhere('playbook'); }} /></div>;
  }
  if (where === 'lab') {
    return (
      <div key={where} className="h-full overflow-y-auto">
        <SimLab progress={training} onPlay={(id, watch) => { const m = findMoment(id); if (m) playScene(m, 'Scenario Lab', watch); }} onBack={() => setWhere('home')} />
      </div>
    );
  }

  return (
    <div key="home" className="sim-home h-full overflow-y-auto">
      {padOpen && <GamepadModal mapping={loadMapping(activePad(loadMapping())?.id)} onSave={saveMapping} onClose={() => setPadOpen(false)} />}
      {opening && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,12,24,0.55)]">
          <div role="status" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#101B2E] px-5 py-3.5 shadow-xl">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-[#4DA3FF]" />
            <p className="m-0 text-[14.5px] font-semibold text-[#F1F4FA]">Getting your club's StartBox sequence…</p>
          </div>
        </div>
      )}
      <SimHome setup={setup} onSetup={changeSetup} onStart={start} profile={profile}
        onProfileCleared={() => { setProfile(loadProfile()); if (userId) void clearRaces({ userId, clubId }); }}
        training={training} yard={yard} onOpen={w => { setPlayAt(null); setWhere(w); }} onDismiss={card => trainingChanged(dismissCard(card))} door={door} onDoor={setDoor} career={training.career ?? null} onCareer={() => setWhere('career')} onBench={account?.admin || account?.superAdmin ? () => setWhere('bench') : undefined} world={worldCard} onExit={onExit} onWay={(w, n) => trainingChanged(chooseWay(w, n))} onReset={startAgain} onPlay={id => { setPlayAt(id); setWhere('playbook'); }} onLink={openLink} today={setup.windDir === 'today' ? today : null} me={me} clubId={clubId} synced={synced}
        waters={waters} waterAdmin={!!clubId && (!!account?.admin || !!account?.superAdmin)} onWaters={setWaters}
        challenges={userId ? challenges : null} onChallenge={c => { setOpenCh(c); setWhere('challenge'); }}
        events={userId ? events : null} onEvent={e => { setOpenEv(e); setEvFrom('home'); setWhere('event'); }} onCreateEvent={setEvent}
        canSet={account?.admin || account?.superAdmin ? { everyone: !!account.superAdmin } : null} onCreateChallenge={setChallenge}
        sequences={sequences} startSeq={startSeq} startFinding={seqBusy && !sequences.length}
        live={userId ? { rooms: openRooms, onOpen: openLive, onJoin: joinLive } : null}
        transmitter={{ pads, onSetUp: () => setPadOpen(true) }}
        next={nextRace ? { race: nextRace, at: rehearseAt, onRehearse: rehearse } : null}
        blownOut={blownOut && !(events ?? []).some(e => e.club_id === clubId && e.title === `${blownOut.name}: raced here`.slice(0, 120)) ? { day: blownOut, at: rehearseAt, onRace: raceBlownOut } : null}
        clubEvent={clubCall} />
    </div>
  );
}

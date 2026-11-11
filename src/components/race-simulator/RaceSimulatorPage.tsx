// Race Simulator: home (set up a race, the Start Trainer, Rules Academy and Scenario Lab, your
// profile) → race or training scene → debrief. Racing fills the whole window, above the app's
// navigation; "Main Menu" brings you back. The racing itself runs on the engine in src/sim; this
// file only moves between the screens and keeps your settings and progress.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Race, RaceLog } from '@/sim/engine';
import { DT } from '@/sim/physics';
import type { Moment } from './moments';
import type { RaceSettings } from '@/sim/types';
import type { Outcome, SceneSpec } from '@/sim/training';
import { DRILLS, FIRST, LAB, LAB_GROUPS, MODULES, findDrill, findMoment, findScene } from '@/sim/training';
import SimHome, { DEFAULT_SETUP, Setup } from './SimHome';
import SimRace, { ActiveScene, SimView } from './SimRace';
import SimDebrief, { TrainLink } from './SimDebrief';
import SimTrainer from './SimTrainer';
import SimAcademy from './SimAcademy';
import SimPlaybook from './SimPlaybook';
import SimPassport from './SimPassport';
import SimLab from './SimLab';
import type { RaceSummary } from './stats';
import { Profile, loadProfile, mergeRaces, saveRace } from './profile';
import { focusResult, raceFocus, type Focus } from './focus';
import { loadNextRace, type NextRace } from './rehearse';
import { TrainingProgress, loadTraining, recordAnswer, recordScene, saveTraining } from './progress';
import { Account, clearRaces, pullRaces, pushRace, syncTraining } from './sync';
import { SimIdentity, loadIdentity } from './identity';
import { C, ordinal } from './ui';
import { VENUES, venueForClub } from '@/sim/venues';
import { windAt } from '@/sim/venue';
import { currentId, ensureVenue, loadWaters, type Water } from './waters';
import { VenueWind, fetchVenueWind } from './venueWind';
import { Challenge, ChallengeEntry, createChallenge, entryLog, isOpen, listChallenges, submitEntry } from './challenges';
import SimChallenge from './SimChallenge';
import { EventRace, STANDARD_DROPS, SimEvent, createEvent, deleteEvent, eventEntries, eventRaceSettings, listEvents, raceWindows, seriesRaces, startTry } from './events';
import SimEventPage from './SimEvent';
import type { EventChoice } from './EventForm';
import { standings } from './series';
import { raceFacts, writeUp } from './writeup';
import { SimSequence, chosenSequence, loadClubSequences, warmSequence } from './startbox';
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
}

// v2: the new defaults (sails on your stick, choppy water, the bank view). Old v1 settings are
// carried over except auto-trim, which now starts off.
const SETUP_KEY = 'alfie-race-sim-setup-v2';
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

function toSettings(s: Setup, mode: 'race' | 'start', today: VenueWind | null, me: SimIdentity | null, seq: SimSequence | null = null): RaceSettings {
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

/** A short notice over the page (a race's water couldn't be loaded). */
function PageNote({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div role="alert" className="fixed inset-x-0 bottom-5 z-[9990] mx-auto flex w-[min(560px,calc(100vw-24px))] items-center gap-3 rounded-2xl border border-[rgba(255,159,67,0.45)] bg-[#1B1408] px-4 py-3 text-[13.5px] text-[#FFE1BD] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
      <span className="min-w-0 flex-1 leading-snug">{text}</span>
      <button type="button" onClick={onClose} className="h-8 shrink-0 cursor-pointer rounded-lg border border-white/20 bg-transparent px-3 text-[13px] font-semibold text-[#FFE1BD]">OK</button>
    </div>
  );
}

type Where = 'home' | 'trainer' | 'academy' | 'lab' | 'playbook' | 'passport' | 'race' | 'debrief' | 'challenge' | 'live' | 'event';

/** The race of a challenge, sailed by you: the same race as everyone's, under your own name and number. */
function challengeSettings(c: Challenge, me: SimIdentity | null, autoTrim: boolean): RaceSettings {
  return { ...c.settings, autoTrim, player: me ? { name: me.short, sail: me.sails[c.settings.classId] ?? '01' } : undefined };
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

export default function RaceSimulatorPage({ darkMode, account = null }: RaceSimulatorPageProps) {
  void darkMode; // the simulator is always on the water: one dark look
  const [where, setWhere] = useState<Where>('home');
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
  } | null>(null);
  const [debrief, setDebrief] = useState<{ race: Race; sum: RaceSummary; moments: Moment[]; challenge?: Challenge; event?: SimEvent } | null>(null);
  // Virtual race events you can see, and the one open.
  const [events, setEvents] = useState<SimEvent[] | null>(null);
  const [openEv, setOpenEv] = useState<SimEvent | null>(null);
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
  // (Still loading when you press Start? The race waits a moment for them, so it's the club's own
  // start that calls it and not the simulator's because you were quick.)
  const seqLoad = useRef<Promise<SimSequence[]> | null>(null);
  const seqLoaded = useRef(false);
  useEffect(() => {
    let live = true;
    seqLoaded.current = false;
    const load = loadClubSequences(clubId);
    seqLoad.current = load;
    void load.then(q => { if (live) { seqLoaded.current = true; setSequences(q); } });
    return () => { live = false; };
  }, [clubId]);
  /** The club's sequences, waiting up to 2½ seconds if they're still on their way. */
  const withSequences = useCallback((go: (list: SimSequence[]) => void) => {
    if (seqLoaded.current || !seqLoad.current) { go(sequences); return; }
    let done = false;
    const once = (list: SimSequence[]) => { if (!done) { done = true; go(list); } };
    void seqLoad.current.then(once);
    window.setTimeout(() => once(sequences), 2500);
  }, [sequences]);
  const startSeq = chosenSequence(sequences, setup.startSeq);
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
  const liveMe = useCallback(() => ({ id: userId ?? 'guest', name: me?.short ?? me?.name ?? 'Sailor', sails: me?.sails ?? {}, autoTrim: setup.autoTrim }), [userId, me, setup.autoTrim]);
  const openLive = useCallback(() => {
    const seq = chosenSequence(sequences, setup.startSeq);
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
  const trainingChanged = useCallback((t: TrainingProgress) => {
    setTraining(t);
    if (userId) void syncTraining({ userId, clubId }, t);
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
      const seq = chosenSequence(list, s.startSeq);
      setRun({ settings: toSettings(s, mode, todayWind, me, seq), mode, key: Date.now(), sequence: seq, focus: mode === 'race' ? raceFocus(loadProfile()) : null });
      setRunView(s.view);
      setWhere('race');
    });
  }, [todayWind, me, withSequences]);

  // The club's next race day and its forecast, to rehearse (signed in, with a club).
  const [nextRace, setNextRace] = useState<NextRace | null>(null);
  // Where it's rehearsed: your club's water, or failing that the venue you've set up (null on the practice pond).
  const rehearseAt = useMemo(() => venueForClub(clubId) ?? (setup.venue !== 'pond' ? VENUES[setup.venue] ?? null : null), [clubId, setup.venue, waters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userId || !clubId) { setNextRace(null); return; }
    let live = true;
    void loadNextRace(rehearseAt).then(n => { if (live) setNextRace(n); });
    return () => { live = false; };
  }, [userId, clubId, rehearseAt]);
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
      const seq = chosenSequence(list, s.startSeq);
      setRun({ settings: toSettings(s, 'race', w && at ? { from: w.from, kn: w.kn, at: nextRace.date } : null, me, seq), mode: 'race', key: Date.now(), sequence: seq, focus: raceFocus(loadProfile()), rehearsal: true });
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
    };
    if (spec.kind === 'lesson') setAcademyAt(spec.id);
    // (A drill with a countdown is called by the club's StartBox sequence too, when it's long enough.)
    setRun({ scene, mode: 'scene', key: Date.now(), sequence: startSeq });
    setRunView(spec.kind === 'lesson' ? 'top' : setup.view);
    setWhere('race');
  }, [training, setup, startSeq]);

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
    setDebrief({ race, sum, moments, challenge: ch, event: ev });
    setWhere('debrief');
  }, [userId, clubId, run, me, leaveRoom]);

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
    setRun({ settings: challengeSettings(c, me, setup.autoTrim), mode: 'race', key: Date.now(), challenge: c, ghost, sequence: seq });
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
    setRun({ settings: challengeSettings(race, me, setup.autoTrim), mode: 'race', key: Date.now(), challenge: race, event: ev, practice: o.practice || !isOpen(race), ghost, sequence: seq });
    setRunView(setup.view);
    setWhere('race');
  }, [me, setup.autoTrim, setup.view, startSeq, waterFor]);

  const again = useCallback(() => {
    if (!run) return;
    if (run.scene) playScene(run.scene.spec, run.scene.group, false);
    // Again in a first-try event: your try is used, so it's practice.
    else if (run.event && run.challenge) void sailEventRace(run.event, run.challenge as EventRace, { practice: run.practice || run.event.tries === 'first', ghost: null });
    else if (run.challenge) void sailChallenge(run.challenge, null);
    else if (run.rehearsal) rehearse();
    else start(run.mode === 'start' ? 'start' : 'race', setup);
  }, [run, setup, start, playScene, sailChallenge, sailEventRace, rehearse]);

  // Set up an event: every race is the race set up on the home page, with its own shifts (and, for
  // a mix, its own breeze), opening on the schedule chosen.
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
    setWhere(run?.scene ? GROUP_PAGE[run.scene.group] : run?.event ? 'event' : run?.challenge ? 'challenge' : 'home');
    if (run?.event) refreshEvents();
  }, [run, leaveRoom, refreshEvents]);

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
          focus={run.focus ?? null}
          live={run.live}
          liveCode={run.liveCode}
          onGun={run.event?.tries === 'first' && !run.practice && !run.resume && userId && run.challenge
            ? () => { void startTry({ userId, clubId }, run.challenge as EventRace, { name: me?.short ?? 'AlfiePRO sailor', sail: run.settings?.player?.sail ?? null }); }
            : undefined}
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
            : debrief.challenge ? { title: debrief.challenge.title, note: chNote, onOpen: () => { setOpenCh(debrief.challenge!); setWhere('challenge'); } } : null}
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
          onBack={() => { refreshEvents(); setWhere('home'); }}
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
      <SimHome setup={setup} onSetup={changeSetup} onStart={start} profile={profile}
        onProfileCleared={() => { setProfile(loadProfile()); if (userId) void clearRaces({ userId, clubId }); }}
        training={training} onOpen={w => { setPlayAt(null); setWhere(w); }} onLink={openLink} today={setup.windDir === 'today' ? today : null} me={me} clubId={clubId} synced={synced}
        waters={waters} waterAdmin={!!clubId && (!!account?.admin || !!account?.superAdmin)} onWaters={setWaters}
        challenges={userId ? challenges : null} onChallenge={c => { setOpenCh(c); setWhere('challenge'); }}
        events={userId ? events : null} onEvent={e => { setOpenEv(e); setWhere('event'); }} onCreateEvent={setEvent}
        canSet={account?.admin || account?.superAdmin ? { everyone: !!account.superAdmin } : null} onCreateChallenge={setChallenge}
        sequences={sequences} startSeq={startSeq}
        live={userId ? { rooms: openRooms, onOpen: openLive, onJoin: joinLive } : null}
        transmitter={{ pads, onSetUp: () => setPadOpen(true) }}
        next={nextRace ? { race: nextRace, at: rehearseAt, onRehearse: rehearse } : null} />
    </div>
  );
}

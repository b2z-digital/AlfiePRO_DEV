import type { ClassDef, ClassId } from './classes';
import type { CourseLength } from './course';
import type { WindCharacter, WindStrength } from './wind';

export type Tack = 'port' | 'stbd';
export type SkipperLevel = 'club' | 'state' | 'national' | 'world';
export type CoachLevel = 'full' | 'hints' | 'off';

export interface RaceSettings {
  classId: ClassId;
  fleetSize: number;          // boats including the player
  level: SkipperLevel;
  windStrength: WindStrength;
  windCharacter: WindCharacter;
  windKnots?: number;         // venue practice
  /** Compass degrees the wind comes from. On the practice pond it's the course axis (default 0, so the
   *  course runs up the screen); at a venue it's the real direction (default the venue's usual breeze). */
  windFrom?: number;
  /** A real venue (see src/sim/venues): the course is laid on its water for the day's wind. */
  venue?: string;
  /** Who's sailing: the member's name and their sail number in this class (from their boats). */
  player?: { name: string; sail: string };
  /** A live race: everyone racing from their own device, in seat order. Each sails one of the boats. */
  crew?: CrewMember[];
  /** Which seat in the crew is sailing on this device. */
  seat?: number;
  laps: number;
  length: CourseLength;
  sequenceSeconds: number;    // start sequence length
  coach: CoachLevel;
  autoTrim: boolean;
  seed: number;
  /** Some AI skippers forget to take their penalty, so you can protest them. */
  forgetfulSkippers?: boolean;
  /** No player: every boat is AI (tests and replays). */
  noPlayer?: boolean;
  /** Start line bias in degrees (+ = the pin end set upwind, so favoured); random within ±3.5° when not set. */
  lineBias?: number;
  /** Scripted shifts: at race time t (s) the wind turns `deg` degrees (+ = clockwise) over `over` seconds. */
  windShifts?: { t: number; deg: number; over: number }[];
  /** A perfectly steady breeze with no puffs (rules lessons). */
  flatWind?: boolean;
  /** Flat water (default), chop or rough water. */
  seaState?: 'flat' | 'chop' | 'rough';
}

/** Someone in a live race, sailing their boat from their own device. */
export interface CrewMember {
  /** Their user id. */
  id: string;
  name: string;
  /** Their sail number in this class. */
  sail: string;
  /** Their sail trims itself (each person's own choice, the same on every device). */
  autoTrim?: boolean;
}

export interface Persona {
  key: string;
  name: string;        // shown on screen, e.g. "Pin hunter"
  aggression: number;  // 0..1
  risk: number;        // 0..1
  startEnd: number;    // 0 = pin, 1 = starboard end
  startEarly: number;  // seconds of margin they leave at the start (negative = gambles)
  consistency: number; // 0..1
  shiftSense: number;  // multiplier on the shift threshold (lower = tacks on smaller shifts)
  sidePref: number;    // -1 left, 0 none, +1 right
}

export interface PenaltyState {
  owed: number;                // turns owed
  active: boolean;             // turning now
  rot: number;                 // signed degrees turned since the turn began
  passedHtw: boolean;          // passed head to wind during the turn
  passedDdw: boolean;          // passed dead downwind during the turn
  reason?: string;             // rule
  since?: number;              // time the penalty became owed
  taken: number;               // completed turns this race
}

export interface Boat {
  id: string;
  sail: string;          // sail number, two digits
  name: string;
  color: string;
  isPlayer: boolean;
  /** A person sails her (the player, or anyone in a live race's crew), not an AI skipper. */
  human?: boolean;
  cls: ClassDef;
  persona?: Persona;

  // dynamics
  x: number; y: number;
  hdg: number;           // deg
  spd: number;           // m/s, through the water
  rot: number;           // deg/s, current turn rate
  rudder: number;        // -1..1, positive turns clockwise (to starboard)
  sheet: number;         // 0..1, 1 = fully sheeted in
  heel: number;          // deg, + = heeled to port (the starboard-tack lean)
  heelRate: number;      // deg/s
  luffUp: number;        // deg a gust has rounded her up (weather helm), easing back as she comes upright
  rigPower: number;      // the rig's heeling power, 1 = the class's A rig

  // wind at the boat this step (after shadows)
  twd: number; tws: number; twa: number;
  tack: Tack;
  targetSpd: number;     // polar speed at this angle with perfect trim
  shadow: number;        // fraction of wind lost to other boats' sails, 0..1

  // manoeuvres and rule state
  tackingSince: number | null;   // time she passed head to wind; null when not tacking (Rule 13)
  lastHtwT: number;              // last time she passed head to wind
  lastTackFrom: Tack | null;     // tack before the last head to wind
  lastGybeT: number;

  // race state
  started: boolean;
  ocs: boolean;                  // over early and must return
  returning: boolean;            // has dipped back below the line after being over early
  legIndex: number;
  progress: number;              // degrees round the current mark (or gate option 0)
  progress2: number;             // gate option 1
  lastBearing: number;           // to the current mark (or gate option 0)
  lastBearing2: number;
  finished: boolean;
  finishTime: number;
  dsq: boolean;
  retired: boolean;
  /** Lost control and drifting (Appendix E: unable to continue in the heat). Others must avoid her (Rule 22). */
  disabled?: boolean;
  penalty: PenaltyState;
  contactWith: Record<string, number>; // other id -> time contact started
  roundedAt: number[];           // time each leg was completed
  placeAtLeg: number[];          // place when each leg was completed
  distSailed: number;

  // display
  hail: { text: string; t: number } | null;
}

export type IncidentKind = 'contact' | 'forced' | 'mark-touch' | 'ocs' | 'mark-room' | 'zone-tack' | 'room-to-tack';

export interface Incident {
  id: number;
  t: number;
  kind: IncidentKind;
  rule: string;               // "10", "11", "18.2(a)", "31", "29.1" ...
  title: string;              // short headline
  offender: string;           // boat id
  victim: string | null;      // boat id
  explanation: string;        // plain English, in the second person when the player is involved
  nextTime?: string;          // how to avoid it
  at: { x: number; y: number };
  markId?: string;
  resolved: 'pending' | 'penalty-taken' | 'protested' | 'dsq' | 'cleared' | 'returned';
}

export interface Hail { t: number; from: string; text: string }

export type SimEvent =
  | { type: 'signal'; t: number; remaining: number }
  | { type: 'gun'; t: number }
  | { type: 'recall'; t: number; boats: string[] }
  | { type: 'incident'; t: number; incident: Incident }
  | { type: 'penalty-done'; t: number; boat: string }
  | { type: 'rounded'; t: number; boat: string; leg: number; place: number }
  | { type: 'finish'; t: number; boat: string; place: number }
  | { type: 'hail'; t: number; boat: string; text: string }
  | { type: 'started'; t: number; boat: string; late: number }
  | { type: 'bank'; t: number; boat: string }
  | { type: 'room-to-tack'; t: number; from: string; to: string }
  | { type: 'you-tack'; t: number; from: string; to: string };

export interface Snapshot { t: number; b: Float32Array } // x,y,hdg,spd,leg per boat, recorded at 5 Hz

export interface PlayerInput {
  rudder: number;   // -1..1
  sheet: number;    // 0..1
  autoTrim: boolean;
  /** Ask the helm assist to tack or gybe now. */
  tack?: boolean;
  gybe?: boolean;
}

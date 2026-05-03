export interface Vec2 {
  x: number;
  y: number;
}

export interface Wind {
  direction: number; // degrees, 0 = north, 90 = east
  speed: number; // knots
  gustFactor: number;
  shiftAmplitude: number; // degrees of oscillation
  shiftPeriod: number; // seconds per full oscillation cycle
}

export interface Boat {
  id: string;
  name: string;
  sailNumber: string;
  position: Vec2;
  heading: number; // degrees
  speed: number;
  isPlayer: boolean;
  isTacking: boolean;
  isGybing: boolean;
  tackTimer: number;
  color: string;
  trail: Vec2[];
  penaltyTurns: number;
  finished: boolean;
  finishTime: number;
  rounding: number; // which mark they're heading to next (0 = start, 1 = windward, 2 = leeward, 3 = finish)
  laps: number;
  skillLevel: number; // 0.7 to 1.0 - affects speed and tactics (1.0 = expert)
}

export interface Mark {
  position: Vec2;
  radius: number;
  type: 'windward' | 'leeward' | 'start-port' | 'start-starboard' | 'gate-port' | 'gate-starboard';
  label: string;
}

export interface Course {
  marks: Mark[];
  startLine: { port: Vec2; starboard: Vec2 };
  finishLine: { port: Vec2; starboard: Vec2 };
  legs: number; // number of upwind/downwind legs
}

export interface RuleViolation {
  rule: string;
  ruleNumber: string;
  description: string;
  offendingBoat: string;
  rightOfWayBoat: string;
  timestamp: number;
  position: Vec2;
}

export interface GameState {
  boats: Boat[];
  wind: Wind;
  course: Course;
  time: number;
  countdown: number;
  phase: 'countdown' | 'racing' | 'finished';
  violations: RuleViolation[];
  currentViolation: RuleViolation | null;
  paused: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: 'start' | 'upwind' | 'downwind' | 'mark-rounding' | 'rules' | 'full-race';
  icon: string;
  setup: (canvasWidth?: number, canvasHeight?: number) => GameState;
}

export type Tack = 'port' | 'starboard';

export interface BoatPolar {
  twa: number; // true wind angle
  speed: number; // boat speed as fraction of wind speed
}

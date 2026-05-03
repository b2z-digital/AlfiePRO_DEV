import { GameState, Boat, Course, Scenario } from './types';
import { normalizeAngle } from './physics';

const COLORS = [
  '#3b82f6', // player - blue
  '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16',
  '#6366f1', '#14b8a6', '#e11d48',
];

const AI_NAMES = [
  'Thunder', 'Sea Hawk', 'Storm Rider', 'Wind Chaser',
  'Blue Water', 'Star Blazer', 'Wave Runner', 'Ocean Spirit',
  'Aquila', 'Tempest', 'Zephyr',
];

function createBoat(id: string, name: string, sailNumber: string, position: { x: number; y: number }, heading: number, isPlayer: boolean, color: string, skillLevel = 1.0): Boat {
  return {
    id,
    name,
    sailNumber,
    position: { ...position },
    heading,
    speed: isPlayer ? 3 : 2 + Math.random() * 2,
    isPlayer,
    isTacking: false,
    isGybing: false,
    tackTimer: 0,
    color,
    trail: [],
    penaltyTurns: 0,
    finished: false,
    finishTime: 0,
    rounding: 0,
    laps: 0,
    skillLevel,
  };
}

function createFleet(numBoats: number, linePortX: number, lineStbdX: number, lineY: number, heading: number): Boat[] {
  const boats: Boat[] = [];
  const lineWidth = lineStbdX - linePortX;

  // Player starts near the middle of the line, slightly below
  const playerX = linePortX + lineWidth * 0.5;
  const playerY = lineY + 40;
  boats.push(createBoat('player', 'You', '01', { x: playerX, y: playerY }, heading, true, COLORS[0]));

  // AI boats spread along the line below it, maneuvering into position
  for (let i = 0; i < numBoats - 1; i++) {
    const fraction = (i + 0.5) / (numBoats - 1);
    const x = linePortX + fraction * lineWidth;
    const y = lineY + 30 + Math.random() * 60;

    // Alternate between port and starboard tack approaches
    const boatHeading = i % 2 === 0
      ? heading + (Math.random() - 0.5) * 20
      : normalizeAngle(360 - heading + (Math.random() - 0.5) * 20);

    // Assign decreasing skill levels: first boats are strongest competitors
    const skillLevel = Math.max(0.7, 0.97 - i * 0.03 + (Math.random() - 0.5) * 0.04);

    boats.push(createBoat(
      `ai-${i}`,
      AI_NAMES[i % AI_NAMES.length],
      String(i + 2).padStart(2, '0'),
      { x, y },
      boatHeading,
      false,
      COLORS[(i + 1) % COLORS.length],
      skillLevel
    ));
  }

  return boats;
}

// Course fills the canvas vertically with margins.
// Wind blows TO 180 (south) so upwind = north (top of screen).
// Layout (from top to bottom):
//   - Windward mark (~8% from top)
//   - Offset mark (~18% from top)
//   - Start/Finish line (~48%)
//   - Leeward gate (~90%)
function createStandardCourse(canvasWidth: number, canvasHeight: number): Course {
  const centerX = canvasWidth / 2;
  const topMargin = canvasHeight * 0.06;
  const bottomMargin = canvasHeight * 0.06;
  const courseHeight = canvasHeight - topMargin - bottomMargin;

  const windwardY = topMargin + courseHeight * 0.05;
  const offsetY = topMargin + courseHeight * 0.15;
  const startY = topMargin + courseHeight * 0.48;
  const gateY = topMargin + courseHeight * 0.92;

  const lineWidth = Math.min(canvasWidth * 0.15, 160);
  const gateWidth = Math.min(canvasWidth * 0.08, 80);
  const offsetX = Math.min(canvasWidth * 0.06, 60);

  return {
    marks: [
      { position: { x: centerX, y: windwardY }, radius: 10, type: 'windward', label: 'Windward Mark' },
      { position: { x: centerX - offsetX, y: offsetY }, radius: 7, type: 'leeward', label: 'Offset Mark' },
      { position: { x: centerX - gateWidth, y: gateY }, radius: 8, type: 'gate-port', label: 'Gate (Port)' },
      { position: { x: centerX + gateWidth, y: gateY }, radius: 8, type: 'gate-starboard', label: 'Gate (Stbd)' },
      { position: { x: centerX - lineWidth, y: startY }, radius: 6, type: 'start-port', label: 'Pin End' },
      { position: { x: centerX + lineWidth, y: startY }, radius: 6, type: 'start-starboard', label: 'Committee' },
    ],
    startLine: { port: { x: centerX - lineWidth, y: startY }, starboard: { x: centerX + lineWidth, y: startY } },
    finishLine: { port: { x: centerX - lineWidth, y: startY }, starboard: { x: centerX + lineWidth, y: startY } },
    legs: 2,
  };
}

export const scenarios: Scenario[] = [
  {
    id: 'start-practice',
    name: 'Start Line Practice',
    description: 'Master your start timing and positioning. Hit the line at full speed when the gun goes. Learn to find clear air and avoid being squeezed at the pin.',
    difficulty: 'beginner',
    category: 'start',
    icon: 'flag',
    setup: (w = 800, h = 700): GameState => {
      const course = createStandardCourse(w, h);
      const boats = createFleet(8, course.startLine.port.x, course.startLine.starboard.x, course.startLine.port.y, 315);
      boats.forEach(b => { b.rounding = 0; });

      return {
        boats,
        wind: { direction: 180, speed: 12, gustFactor: 0.1, shiftAmplitude: 5, shiftPeriod: 30 },
        course,
        time: 0,
        countdown: 60,
        phase: 'countdown',
        violations: [],
        currentViolation: null,
        paused: false,
      };
    },
  },
  {
    id: 'upwind-tactics',
    name: 'Upwind Tactics',
    description: 'Beat to the windward mark in a shifting breeze. Learn when to tack on headers, play the shifts, and sail the lifted tack. Avoid dirty air from boats ahead.',
    difficulty: 'intermediate',
    category: 'upwind',
    icon: 'wind',
    setup: (w = 800, h = 700): GameState => {
      const course = createStandardCourse(w, h);
      const boats = createFleet(6, course.startLine.port.x, course.startLine.starboard.x, course.startLine.port.y, 315);
      boats.forEach(b => { b.rounding = 1; });

      return {
        boats,
        wind: { direction: 180, speed: 14, gustFactor: 0.15, shiftAmplitude: 12, shiftPeriod: 25 },
        course,
        time: 0,
        countdown: 5,
        phase: 'countdown',
        violations: [],
        currentViolation: null,
        paused: false,
      };
    },
  },
  {
    id: 'downwind-strategy',
    name: 'Downwind Strategy',
    description: 'Sail downwind from the offset mark to the leeward gate. Master the art of gybing angles, riding gusts, and choosing the fast lane downwind.',
    difficulty: 'intermediate',
    category: 'downwind',
    icon: 'arrow-down',
    setup: (w = 800, h = 700): GameState => {
      const course = createStandardCourse(w, h);
      const offsetMark = course.marks.find(m => m.label === 'Offset Mark')!;
      const boats = createFleet(6, offsetMark.position.x - 80, offsetMark.position.x + 80, offsetMark.position.y, 160);
      boats.forEach(b => { b.rounding = 3; });

      return {
        boats,
        wind: { direction: 180, speed: 14, gustFactor: 0.2, shiftAmplitude: 8, shiftPeriod: 20 },
        course,
        time: 0,
        countdown: 5,
        phase: 'countdown',
        violations: [],
        currentViolation: null,
        paused: false,
      };
    },
  },
  {
    id: 'mark-rounding',
    name: 'Mark Rounding',
    description: 'Round the windward mark in close quarters. Understand Rule 18 (mark room), zone entries, and how to protect your position through the rounding.',
    difficulty: 'intermediate',
    category: 'mark-rounding',
    icon: 'rotate-cw',
    setup: (w = 800, h = 700): GameState => {
      const course = createStandardCourse(w, h);
      const windwardMark = course.marks.find(m => m.type === 'windward')!;
      const cx = windwardMark.position.x;
      const cy = windwardMark.position.y + 120;
      const boats = createFleet(5, cx - 60, cx + 60, cy, 315);
      boats.forEach(b => { b.rounding = 1; });

      return {
        boats,
        wind: { direction: 180, speed: 12, gustFactor: 0.1, shiftAmplitude: 3, shiftPeriod: 40 },
        course,
        time: 0,
        countdown: 5,
        phase: 'countdown',
        violations: [],
        currentViolation: null,
        paused: false,
      };
    },
  },
  {
    id: 'port-starboard',
    name: 'Port/Starboard Encounters',
    description: 'Navigate through crossing situations. Learn when you have right of way on starboard tack, when to duck, and when to lee-bow a port-tacker.',
    difficulty: 'beginner',
    category: 'rules',
    icon: 'shuffle',
    setup: (w = 800, h = 700): GameState => {
      const course = createStandardCourse(w, h);
      const cx = w / 2;
      const cy = h * 0.5;
      const boats: Boat[] = [
        createBoat('player', 'You', '01', { x: cx - 80, y: cy + 40 }, 340, true, COLORS[0]),
        createBoat('ai-0', 'Crosser 1', '02', { x: cx + 100, y: cy - 20 }, 280, false, COLORS[1]),
        createBoat('ai-1', 'Crosser 2', '03', { x: cx + 120, y: cy - 80 }, 270, false, COLORS[2]),
        createBoat('ai-2', 'Crosser 3', '04', { x: cx + 80, y: cy - 120 }, 285, false, COLORS[3]),
      ];
      boats.forEach(b => { b.rounding = 1; });

      return {
        boats,
        wind: { direction: 180, speed: 12, gustFactor: 0.05, shiftAmplitude: 3, shiftPeriod: 60 },
        course,
        time: 0,
        countdown: 3,
        phase: 'countdown',
        violations: [],
        currentViolation: null,
        paused: false,
      };
    },
  },
  {
    id: 'full-race',
    name: 'Full Race',
    description: 'Race a complete 2-lap windward-leeward course. Start, beat to the windward mark, round the offset, run to the gate, and repeat. Use all your tactical knowledge to win.',
    difficulty: 'advanced',
    category: 'full-race',
    icon: 'trophy',
    setup: (w = 800, h = 700): GameState => {
      const course = createStandardCourse(w, h);
      const boats = createFleet(10, course.startLine.port.x, course.startLine.starboard.x, course.startLine.port.y, 315);
      boats.forEach(b => { b.rounding = 0; });

      return {
        boats,
        wind: { direction: 180, speed: 13, gustFactor: 0.15, shiftAmplitude: 10, shiftPeriod: 35 },
        course,
        time: 0,
        countdown: 60,
        phase: 'countdown',
        violations: [],
        currentViolation: null,
        paused: false,
      };
    },
  },
];

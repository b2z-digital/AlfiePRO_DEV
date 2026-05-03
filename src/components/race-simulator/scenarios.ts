import { GameState, Boat, Course, Wind, Mark, Scenario } from './types';

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

function createBoat(id: string, name: string, sailNumber: string, position: { x: number; y: number }, heading: number, isPlayer: boolean, color: string): Boat {
  return {
    id,
    name,
    sailNumber,
    position: { ...position },
    heading,
    speed: 0,
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
  };
}

function createFleet(numBoats: number, startX: number, startY: number, heading: number, spread: number): Boat[] {
  const boats: Boat[] = [];

  // Player boat
  boats.push(createBoat('player', 'You', '01', { x: startX, y: startY }, heading, true, COLORS[0]));

  // AI boats
  for (let i = 0; i < numBoats - 1; i++) {
    const offsetX = (Math.random() - 0.5) * spread;
    const offsetY = (Math.random() - 0.5) * spread * 0.5;
    boats.push(createBoat(
      `ai-${i}`,
      AI_NAMES[i % AI_NAMES.length],
      String(i + 2).padStart(2, '0'),
      { x: startX + offsetX, y: startY + offsetY },
      heading + (Math.random() - 0.5) * 20,
      false,
      COLORS[(i + 1) % COLORS.length]
    ));
  }

  return boats;
}

function createStandardCourse(canvasWidth: number, canvasHeight: number): Course {
  const centerX = canvasWidth / 2;
  const startY = canvasHeight * 0.8;
  const windwardY = canvasHeight * 0.15;
  const lineWidth = 80;

  return {
    marks: [
      { position: { x: centerX, y: windwardY }, radius: 8, type: 'windward', label: 'Windward Mark' },
      { position: { x: centerX - 30, y: startY - 20 }, radius: 8, type: 'leeward', label: 'Leeward Mark' },
      { position: { x: centerX - lineWidth, y: startY }, radius: 6, type: 'start-port', label: 'Port End' },
      { position: { x: centerX + lineWidth, y: startY }, radius: 6, type: 'start-starboard', label: 'Starboard End' },
    ],
    startLine: { port: { x: centerX - lineWidth, y: startY }, starboard: { x: centerX + lineWidth, y: startY } },
    finishLine: { port: { x: centerX - lineWidth, y: startY - 30 }, starboard: { x: centerX + lineWidth, y: startY - 30 } },
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
    setup: (): GameState => {
      const course = createStandardCourse(800, 700);
      const startY = course.startLine.port.y + 50;
      const boats = createFleet(8, 400, startY, 0, 120);
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
    setup: (): GameState => {
      const course = createStandardCourse(800, 700);
      const boats = createFleet(6, 400, course.startLine.port.y - 10, 340, 100);
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
    description: 'Sail downwind from the windward mark to the leeward gate. Master the art of gybing angles, riding gusts, and choosing the fast lane downwind.',
    difficulty: 'intermediate',
    category: 'downwind',
    icon: 'arrow-down',
    setup: (): GameState => {
      const course = createStandardCourse(800, 700);
      const windwardMark = course.marks.find(m => m.type === 'windward')!;
      const boats = createFleet(6, windwardMark.position.x, windwardMark.position.y + 40, 180, 80);
      boats.forEach(b => { b.rounding = 2; });

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
    setup: (): GameState => {
      const course = createStandardCourse(800, 700);
      const windwardMark = course.marks.find(m => m.type === 'windward')!;
      // Position boats approaching the mark on starboard tack
      const boats = createFleet(5, windwardMark.position.x - 60, windwardMark.position.y + 80, 350, 40);
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
    setup: (): GameState => {
      const course = createStandardCourse(800, 700);
      const boats: Boat[] = [
        createBoat('player', 'You', '01', { x: 350, y: 450 }, 340, true, COLORS[0]),
        createBoat('ai-0', 'Crosser 1', '02', { x: 500, y: 400 }, 280, false, COLORS[1]),
        createBoat('ai-1', 'Crosser 2', '03', { x: 520, y: 350 }, 270, false, COLORS[2]),
        createBoat('ai-2', 'Crosser 3', '04', { x: 480, y: 320 }, 285, false, COLORS[3]),
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
    description: 'Race a complete windward-leeward course. Start, beat to the windward mark, run downwind, and finish. Use all your tactical knowledge to win.',
    difficulty: 'advanced',
    category: 'full-race',
    icon: 'trophy',
    setup: (): GameState => {
      const course = createStandardCourse(800, 700);
      const startY = course.startLine.port.y + 60;
      const boats = createFleet(10, 400, startY, 0, 140);
      boats.forEach(b => { b.rounding = 0; });

      return {
        boats,
        wind: { direction: 180, speed: 13, gustFactor: 0.15, shiftAmplitude: 10, shiftPeriod: 35 },
        course,
        time: 0,
        countdown: 120,
        phase: 'countdown',
        violations: [],
        currentViolation: null,
        paused: false,
      };
    },
  },
];

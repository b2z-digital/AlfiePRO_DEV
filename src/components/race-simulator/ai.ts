import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TACK_ANGLE = 45;
const MIN_TACK_INTERVAL = 2.0;
const ROUNDING_RADIUS = 50; // matches game detection radius

// ---------------------------------------------------------------------------
// Per-boat AI memory
// ---------------------------------------------------------------------------

interface AIState {
  lastTackTime: number;
  preferredSide: 1 | -1;
  initialized: boolean;
  gateChoice: 'port' | 'starboard';
  startSlot: number;
}

const aiStates = new Map<string, AIState>();
let slotCounter = 0;

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      lastTackTime: -10,
      preferredSide: Math.random() > 0.5 ? 1 : -1,
      initialized: false,
      gateChoice: Math.random() > 0.5 ? 'port' : 'starboard',
      startSlot: slotCounter++,
    });
  }
  return aiStates.get(boat.id)!;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function resetAIStates(): void {
  aiStates.clear();
  slotCounter = 0;
}

export function getTargetForRounding(
  rounding: number,
  course: Course,
  boat?: Boat,
): Vec2 | null {
  const windward = course.marks.find(m => m.type === 'windward');
  const offset = course.marks.find(m => m.label === 'Offset Mark');
  const gatePort = course.marks.find(m => m.type === 'gate-port');
  const gateStbd = course.marks.find(m => m.type === 'gate-starboard');

  switch (rounding) {
    case 0:
      return {
        x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
        y: course.startLine.port.y - 5,
      };
    case 1:
    case 4:
      return windward?.position ?? null;
    case 2:
    case 5:
      return offset?.position ?? null;
    case 3:
    case 6: {
      if (!boat) {
        if (gatePort && gateStbd) {
          return { x: (gatePort.position.x + gateStbd.position.x) / 2, y: gatePort.position.y };
        }
        return gatePort?.position ?? null;
      }
      const state = getAIState(boat);
      if (state.gateChoice === 'port' && gatePort) return gatePort.position;
      if (state.gateChoice === 'starboard' && gateStbd) return gateStbd.position;
      return gatePort?.position ?? gateStbd?.position ?? null;
    }
    case 7:
      return {
        x: (course.finishLine.port.x + course.finishLine.starboard.x) / 2,
        y: course.finishLine.port.y,
      };
    default:
      return null;
  }
}

export function isHeadingUpwind(rounding: number): boolean {
  return rounding === 1 || rounding === 4 || rounding === 7;
}

export function isHeadingDownwind(rounding: number): boolean {
  return rounding === 3 || rounding === 6;
}

// ---------------------------------------------------------------------------
// Heading utilities
// ---------------------------------------------------------------------------

function stbdCloseHauled(windDir: number): number {
  return normalizeAngle(windDir - TACK_ANGLE);
}

function portCloseHauled(windDir: number): number {
  return normalizeAngle(windDir + TACK_ANGLE);
}

function bestTackToward(boatPos: Vec2, target: Vec2, windDir: number): number {
  const bearing = angleBetween(boatPos, target);
  const stbd = stbdCloseHauled(windDir);
  const port = portCloseHauled(windDir);
  const stbdDiff = Math.abs(normalizeDeg(bearing - stbd));
  const portDiff = Math.abs(normalizeDeg(bearing - port));
  return stbdDiff <= portDiff ? stbd : port;
}

function isSaileable(bearing: number, windDir: number): boolean {
  const twa = Math.abs(normalizeDeg(windDir - bearing));
  return twa >= TACK_ANGLE - 5;
}

function saileableHeadingToward(boatPos: Vec2, target: Vec2, windDir: number): number {
  const bearing = angleBetween(boatPos, target);
  if (isSaileable(bearing, windDir)) return bearing;
  return bestTackToward(boatPos, target, windDir);
}

function smoothTurn(currentHeading: number, desiredHeading: number, dt: number): number {
  const diff = normalizeDeg(desiredHeading - currentHeading);
  const maxTurn = 180 * dt;
  if (Math.abs(diff) <= maxTurn) return normalizeAngle(desiredHeading);
  return normalizeAngle(currentHeading + Math.sign(diff) * maxTurn);
}

// ---------------------------------------------------------------------------
// Main AI entry point
// ---------------------------------------------------------------------------

export function updateAIBoat(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  time: number,
  allBoats: Boat[],
  countdownRemaining?: number,
): void {
  if (boat.isPlayer || boat.finished) return;
  if (boat.penaltyTurns > 0) return;
  if (boat.isTacking || boat.isGybing) return;

  const state = getAIState(boat);
  if (!state.initialized) {
    state.initialized = true;
  }

  const dt = 0.016;

  if (boat.rounding === 0) {
    handlePreStart(boat, course, wind, state, allBoats, countdownRemaining ?? 60, dt);
  } else if (isHeadingUpwind(boat.rounding)) {
    handleUpwind(boat, course, wind, time, state, dt);
  } else if (isHeadingDownwind(boat.rounding)) {
    handleDownwind(boat, course, wind, state, dt);
  } else {
    handleOffset(boat, course, wind, state, dt);
  }

  applyCollisionAvoidance(boat, allBoats);
}

// ---------------------------------------------------------------------------
// PRE-START: Hold position below line, then accelerate to cross at gun
//
// Real yacht behavior before a start:
// - Boats spread across the start line at their chosen positions
// - They sail on beam reaches (sideways) to hold their lateral position
// - In the final seconds they accelerate toward the line to cross at full speed
// ---------------------------------------------------------------------------

function handlePreStart(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  state: AIState,
  allBoats: Boat[],
  countdownRemaining: number,
  dt: number,
): void {
  const lineY = course.startLine.port.y;
  const linePortX = course.startLine.port.x;
  const lineStbdX = course.startLine.starboard.x;
  const lineWidth = lineStbdX - linePortX;

  // Assign each boat a slot position across the start line
  const aiBoats = allBoats.filter(b => !b.isPlayer && !b.finished);
  const totalSlots = Math.max(aiBoats.length, 1);
  const slotWidth = lineWidth / (totalSlots + 1);
  const mySlotX = linePortX + (state.startSlot + 1) * slotWidth;

  // dy > 0 means boat is BELOW the line (correct position during countdown)
  const dy = boat.position.y - lineY;

  // --- FINAL APPROACH (last 8 seconds): sail toward our slot on the line ---
  if (countdownRemaining <= 8) {
    const targetOnLine: Vec2 = { x: mySlotX, y: lineY };
    const heading = saileableHeadingToward(boat.position, targetOnLine, wind.direction);
    boat.heading = smoothTurn(boat.heading, heading, dt);
    return;
  }

  // --- SAFETY: If somehow above the line, get back below ---
  if (dy < 0) {
    // Sail dead downwind (heading 180 with wind from 0) to get back below
    const downwindHeading = normalizeAngle(wind.direction + 180);
    boat.heading = smoothTurn(boat.heading, downwindHeading, dt);
    return;
  }

  // --- HOLDING PATTERN: beam reach back and forth near our slot ---
  // Target depth: 50-80px below the line (staggered by slot)
  const holdDepth = 50 + (state.startSlot % 4) * 10;

  // Too close to line (< 25px below): bear away on broad reach
  if (dy < 25) {
    const awayHeading = state.preferredSide > 0
      ? normalizeAngle(wind.direction + 130) // broad reach moving right + down
      : normalizeAngle(wind.direction - 130); // broad reach moving left + down
    boat.heading = smoothTurn(boat.heading, awayHeading, dt);
    return;
  }

  // Too far below the line: sail toward our slot at proper depth
  if (dy > holdDepth + 40) {
    const slotTarget: Vec2 = { x: mySlotX, y: lineY + holdDepth };
    const heading = saileableHeadingToward(boat.position, slotTarget, wind.direction);
    boat.heading = smoothTurn(boat.heading, heading, dt);
    return;
  }

  // At correct depth: sail beam reaches (east/west) to hold lateral position
  const dxFromSlot = boat.position.x - mySlotX;

  // Switch direction when too far from slot
  if (dxFromSlot > slotWidth) {
    state.preferredSide = -1; // sail left (west)
  } else if (dxFromSlot < -slotWidth) {
    state.preferredSide = 1; // sail right (east)
  }

  // Beam reach: heading 90 (east) or 270 (west) with wind from 0
  // These headings have TWA = 90, giving near-maximum speed with lateral movement
  const beamHeading = state.preferredSide > 0
    ? normalizeAngle(wind.direction + 90)
    : normalizeAngle(wind.direction - 90);

  boat.heading = smoothTurn(boat.heading, beamHeading, dt);
}

// ---------------------------------------------------------------------------
// UPWIND: Tack toward windward mark, then port-round it
//
// Port rounding means: the mark is left to PORT (on your left side).
// So the boat passes to the RIGHT of the mark.
// With wind from north (0), the mark is upwind.
// Approach on PORT TACK (heading 45, moving RIGHT and UP) to reach the right side.
// Then continue past the mark and bear away once above it.
// ---------------------------------------------------------------------------

function handleUpwind(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  time: number,
  state: AIState,
  dt: number,
): void {
  const target = getTargetForRounding(boat.rounding, course, boat);
  if (!target) return;

  const dist = distance(boat.position, target);
  const boatAboveMark = boat.position.y < target.y;

  // --- NEAR THE MARK: Execute the port rounding ---
  if (dist < ROUNDING_RADIUS + 40) {

    // Already above the mark: detection should have triggered.
    // Bear away on broad reach toward the offset mark.
    if (boatAboveMark) {
      const bearAwayHeading = normalizeAngle(wind.direction + 140);
      boat.heading = smoothTurn(boat.heading, bearAwayHeading, dt);
      return;
    }

    // Below the mark: need to sail to a point RIGHT of the mark and just above it.
    // With wind from 0:
    //   - PORT tack (heading 45) moves boat RIGHT and UP
    //   - This naturally brings us to the RIGHT side of the mark
    //
    // Aim at (mark.x + 25, mark.y - 10) - a point to the right and slightly above
    const approachPoint: Vec2 = { x: target.x + 25, y: target.y - 10 };
    const bearing = angleBetween(boat.position, approachPoint);

    // If bearing is saileable, aim directly. Otherwise use port tack.
    if (isSaileable(bearing, wind.direction)) {
      boat.heading = smoothTurn(boat.heading, bearing, dt);
    } else {
      // Port tack (heading 45 with wind 0) moves RIGHT + UP = toward right of mark
      boat.heading = smoothTurn(boat.heading, portCloseHauled(wind.direction), dt);
    }
    return;
  }

  // --- OPEN WATER: Tack toward the mark ---
  const bearing = angleBetween(boat.position, target);

  // Check if current heading is taking us away from mark
  const headingToTargetDiff = Math.abs(normalizeDeg(bearing - boat.heading));
  const timeSinceTack = time - state.lastTackTime;

  if (timeSinceTack > MIN_TACK_INTERVAL && headingToTargetDiff > 85) {
    // We're sailing away from the mark - tack
    state.lastTackTime = time;
    const newHeading = bestTackToward(boat.position, target, wind.direction);
    boat.heading = newHeading;
    boat.isTacking = true;
    boat.tackTimer = 0.5;
    return;
  }

  // Continue on best tack toward the mark
  const desiredHeading = bestTackToward(boat.position, target, wind.direction);
  boat.heading = smoothTurn(boat.heading, desiredHeading, dt);
}

// ---------------------------------------------------------------------------
// DOWNWIND: Sail to gate, pass BETWEEN the marks, round chosen mark
//
// The gate has two marks (port and starboard). The boat must:
// 1. Sail downwind toward the gate
// 2. Pass BETWEEN the two marks (not outside)
// 3. Pass within 50px of their chosen mark AND be below it (y > gate.y + 5)
// 4. After rounding, curve OUTWARD (away from center) and head back upwind
// ---------------------------------------------------------------------------

function handleDownwind(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  state: AIState,
  dt: number,
): void {
  const gatePort = course.marks.find(m => m.type === 'gate-port');
  const gateStbd = course.marks.find(m => m.type === 'gate-starboard');
  if (!gatePort || !gateStbd) return;

  const portMarkPos = gatePort.position;
  const stbdMarkPos = gateStbd.position;
  const gateY = portMarkPos.y;
  const gateCenterX = (portMarkPos.x + stbdMarkPos.x) / 2;
  const chosenMark = state.gateChoice === 'port' ? portMarkPos : stbdMarkPos;
  const distToChosenMark = distance(boat.position, chosenMark);
  const boatBelowGate = boat.position.y > gateY;

  // PHASE 3: Below gate AND close to chosen mark - curve outward and up
  if (boatBelowGate && distToChosenMark < ROUNDING_RADIUS + 30) {
    const outwardX = state.gateChoice === 'port'
      ? chosenMark.x - 80
      : chosenMark.x + 80;
    const exitTarget: Vec2 = { x: outwardX, y: gateY - 80 };
    const heading = saileableHeadingToward(boat.position, exitTarget, wind.direction);
    boat.heading = smoothTurn(boat.heading, heading, dt);
    return;
  }

  // PHASE 2: Below gate but far from chosen mark - sail toward it for detection
  if (boatBelowGate) {
    const heading = saileableHeadingToward(boat.position, chosenMark, wind.direction);
    boat.heading = smoothTurn(boat.heading, heading, dt);
    return;
  }

  // PHASE 1: Above the gate - sail downwind between the marks
  // Bias 75% toward chosen mark to ensure we pass within 50px for detection
  const biasedX = gateCenterX + (chosenMark.x - gateCenterX) * 0.75;
  const gateTarget: Vec2 = { x: biasedX, y: gateY + 15 };

  const bearing = angleBetween(boat.position, gateTarget);
  if (isSaileable(bearing, wind.direction)) {
    boat.heading = smoothTurn(boat.heading, bearing, dt);
  } else {
    // Can't sail directly (would be too close to dead downwind for the no-go zone)
    // Use a broad reach angle that's closest to the target
    const broadReachPort = normalizeAngle(wind.direction + 135);
    const broadReachStbd = normalizeAngle(wind.direction - 135);
    const portDiff = Math.abs(normalizeDeg(bearing - broadReachPort));
    const stbdDiff = Math.abs(normalizeDeg(bearing - broadReachStbd));
    boat.heading = smoothTurn(boat.heading, portDiff < stbdDiff ? broadReachPort : broadReachStbd, dt);
  }
}

// ---------------------------------------------------------------------------
// OFFSET: Reaching from windward mark to offset mark, then continue downwind
// ---------------------------------------------------------------------------

function handleOffset(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  _state: AIState,
  dt: number,
): void {
  const target = getTargetForRounding(boat.rounding, course, boat);
  if (!target) return;

  const dist = distance(boat.position, target);

  // Near offset mark: pass to the right, exit below
  if (dist < ROUNDING_RADIUS + 20) {
    const boatBelowMark = boat.position.y > target.y + 5;

    if (boatBelowMark) {
      // Already below - head toward gate area (downwind)
      const downTarget: Vec2 = { x: target.x, y: target.y + 100 };
      const heading = saileableHeadingToward(boat.position, downTarget, wind.direction);
      boat.heading = smoothTurn(boat.heading, heading, dt);
      return;
    }

    // Aim right and below the mark
    const roundTarget: Vec2 = { x: target.x + 25, y: target.y + 15 };
    const bearing = angleBetween(boat.position, roundTarget);
    if (isSaileable(bearing, wind.direction)) {
      boat.heading = smoothTurn(boat.heading, bearing, dt);
    } else {
      boat.heading = smoothTurn(boat.heading, normalizeAngle(wind.direction + 135), dt);
    }
    return;
  }

  // Far from offset: sail directly toward it
  const bearing = angleBetween(boat.position, target);
  if (isSaileable(bearing, wind.direction)) {
    boat.heading = smoothTurn(boat.heading, bearing, dt);
  } else {
    const heading = saileableHeadingToward(boat.position, target, wind.direction);
    boat.heading = smoothTurn(boat.heading, heading, dt);
  }
}

// ---------------------------------------------------------------------------
// Collision avoidance: gentle nudge away from nearby boats
// ---------------------------------------------------------------------------

function applyCollisionAvoidance(boat: Boat, allBoats: Boat[]): void {
  const avoidRadius = 25;
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < avoidRadius && dist > 1) {
      const awayBearing = angleBetween(other.position, boat.position);
      const diff = normalizeDeg(awayBearing - boat.heading);
      const proximity = (avoidRadius - dist) / avoidRadius;
      const nudge = diff * proximity * 0.04;
      boat.heading = normalizeAngle(boat.heading + nudge);
    }
  }
}

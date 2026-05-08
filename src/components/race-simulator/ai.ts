import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

// ---------------------------------------------------------------------------
// Constants - tuned for realistic RC yacht behavior
// ---------------------------------------------------------------------------

const TACK_ANGLE = 45; // degrees off wind for close-hauled
const GYBE_ANGLE = 150; // degrees off wind for deepest downwind angle
const MIN_TACK_INTERVAL = 2.5; // seconds between tacks (time to build speed)
const ROUNDING_RADIUS = 50; // matches game detection radius
const BOAT_SEPARATION = 35; // minimum pixels between boats

// ---------------------------------------------------------------------------
// Per-boat AI memory
// ---------------------------------------------------------------------------

interface AIState {
  lastTackTime: number;
  preferredSide: 1 | -1;
  initialized: boolean;
  gateChoice: 'port' | 'starboard';
  startSlot: number;
  preStartPhase: 'holding' | 'approaching' | 'accelerating';
  preStartTarget: Vec2 | null;
  tackCount: number;
  lastHeading: number;
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
      preStartPhase: 'holding',
      preStartTarget: null,
      tackCount: 0,
      lastHeading: 0,
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

function smoothTurn(currentHeading: number, desiredHeading: number, dt: number, turnRate = 160): number {
  const diff = normalizeDeg(desiredHeading - currentHeading);
  const maxTurn = turnRate * dt;
  if (Math.abs(diff) <= maxTurn) return normalizeAngle(desiredHeading);
  return normalizeAngle(currentHeading + Math.sign(diff) * maxTurn);
}

/** Check if the boat has overstood the layline to the mark */
function isOverstood(boatPos: Vec2, target: Vec2, windDir: number, tack: 'port' | 'starboard'): boolean {
  const bearing = angleBetween(boatPos, target);
  const layline = tack === 'starboard' ? stbdCloseHauled(windDir) : portCloseHauled(windDir);
  const diff = normalizeDeg(bearing - layline);
  // If on starboard tack and bearing to mark is MORE to port than our layline, we've overstood
  if (tack === 'starboard') return diff > 5;
  return diff < -5;
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
    state.lastHeading = boat.heading;
  }

  const dt = 0.016;

  if (boat.rounding === 0) {
    handlePreStart(boat, course, wind, state, allBoats, countdownRemaining ?? 60, dt, time);
  } else if (isHeadingUpwind(boat.rounding)) {
    handleUpwind(boat, course, wind, time, state, allBoats, dt);
  } else if (isHeadingDownwind(boat.rounding)) {
    handleDownwind(boat, course, wind, state, dt);
  } else {
    handleOffset(boat, course, wind, state, dt);
  }

  applyCollisionAvoidance(boat, allBoats);
  state.lastHeading = boat.heading;
}

// ---------------------------------------------------------------------------
// PRE-START: Realistic yacht pre-start maneuvers
//
// Real yacht behavior before a start:
// 1. EARLY (>20s): Boats sail upwind and back in a holding pattern well below
//    the line (2-4 boat lengths back). They maintain separation and stay in
//    their general area of the line.
// 2. SETUP (20-10s): Boats position themselves on the line, establishing their
//    slot. They slow down by heading slightly upwind or luffing.
// 3. ACCELERATION (final 8s): Boats bear away to a close-hauled course and
//    accelerate toward the line to cross at maximum speed.
// ---------------------------------------------------------------------------

function handlePreStart(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  state: AIState,
  allBoats: Boat[],
  countdownRemaining: number,
  dt: number,
  time: number,
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

  // --- SAFETY: If somehow above the line, get back below immediately ---
  if (dy < -5) {
    const downwindHeading = normalizeAngle(wind.direction + 180);
    boat.heading = smoothTurn(boat.heading, downwindHeading, dt);
    return;
  }

  // --- PHASE 3: ACCELERATION (last 6 seconds) ---
  // Full commitment to the line - sail close-hauled toward the start
  if (countdownRemaining <= 6) {
    state.preStartPhase = 'accelerating';
    // Aim at a point on the line at our slot
    const targetOnLine: Vec2 = { x: mySlotX, y: lineY };
    const heading = saileableHeadingToward(boat.position, targetOnLine, wind.direction);
    boat.heading = smoothTurn(boat.heading, heading, dt, 200);
    return;
  }

  // --- PHASE 2: SETUP (20-6 seconds) ---
  // Position ourselves 30-50px below line in our slot area, mostly stationary
  if (countdownRemaining <= 20) {
    state.preStartPhase = 'approaching';
    const holdDepth = 40 + (state.startSlot % 3) * 10; // 40-60px below line

    // If too close to line, head away (bear off downwind)
    if (dy < 15) {
      const awayHeading = normalizeAngle(wind.direction + 160 + (state.preferredSide > 0 ? 20 : -20));
      boat.heading = smoothTurn(boat.heading, awayHeading, dt);
      return;
    }

    // If too far from line, sail toward our slot position at proper depth
    if (dy > holdDepth + 30) {
      const slotTarget: Vec2 = { x: mySlotX, y: lineY + holdDepth };
      const heading = saileableHeadingToward(boat.position, slotTarget, wind.direction);
      boat.heading = smoothTurn(boat.heading, heading, dt);
      return;
    }

    // At correct depth - slow maneuver: point high into wind to stall
    // This is like "killing speed" before the start - pointing closer to wind
    // than close-hauled to drift slowly and hold position
    const dxFromSlot = boat.position.x - mySlotX;

    if (Math.abs(dxFromSlot) > slotWidth * 0.6) {
      // Too far from slot laterally - reach back toward it slowly
      const reachTarget: Vec2 = { x: mySlotX, y: boat.position.y };
      const heading = saileableHeadingToward(boat.position, reachTarget, wind.direction);
      boat.heading = smoothTurn(boat.heading, heading, dt, 100);
    } else {
      // In our slot - point high to slow down (head up 25-30 degrees from wind)
      // This puts us in the "pinching" zone where we barely move
      const highHeading = normalizeAngle(wind.direction + (state.preferredSide > 0 ? 25 : -25));
      boat.heading = smoothTurn(boat.heading, highHeading, dt, 60);
    }
    return;
  }

  // --- PHASE 1: HOLDING PATTERN (>20 seconds to start) ---
  // Sail a figure-8 pattern well below the line. Tack/gybe back and forth
  // staying 60-120px below the line near our assigned slot area.
  state.preStartPhase = 'holding';

  const holdingDepth = 80 + (state.startSlot % 4) * 15; // 80-125px below line
  const halfPatternWidth = slotWidth * 1.2;

  // If too close to line during holding, bear away strongly
  if (dy < 40) {
    const broadReach = normalizeAngle(wind.direction + 150 * state.preferredSide);
    boat.heading = smoothTurn(boat.heading, broadReach, dt);
    return;
  }

  // If too far below, sail upwind toward holding depth
  if (dy > holdingDepth + 50) {
    const upTarget: Vec2 = { x: mySlotX, y: lineY + holdingDepth };
    const heading = bestTackToward(boat.position, upTarget, wind.direction);
    boat.heading = smoothTurn(boat.heading, heading, dt);
    return;
  }

  // Figure-8: sail on port or starboard tack, switch when reaching pattern edge
  const dxFromSlot = boat.position.x - mySlotX;

  if (dxFromSlot > halfPatternWidth) {
    // Gone too far right - tack to port (heading to the left)
    if (state.preferredSide !== -1 && time - state.lastTackTime > MIN_TACK_INTERVAL) {
      state.preferredSide = -1;
      state.lastTackTime = time;
    }
  } else if (dxFromSlot < -halfPatternWidth) {
    // Gone too far left - tack to starboard (heading to the right)
    if (state.preferredSide !== 1 && time - state.lastTackTime > MIN_TACK_INTERVAL) {
      state.preferredSide = 1;
      state.lastTackTime = time;
    }
  }

  // Sail close-hauled on chosen tack - this gives a realistic upwind zigzag
  const tackHeading = state.preferredSide > 0
    ? stbdCloseHauled(wind.direction) // heading ~ 315 with wind from 0 (NW, moving right+up)
    : portCloseHauled(wind.direction); // heading ~ 45 with wind from 0 (NE, moving left+up)

  // Periodically dip below to maintain depth
  const currentTwa = Math.abs(normalizeDeg(wind.direction - boat.heading));
  if (dy < holdingDepth - 20 && currentTwa < 90) {
    // Getting too high, bear away to a beam reach briefly
    const beamReach = normalizeAngle(wind.direction + 90 * state.preferredSide);
    boat.heading = smoothTurn(boat.heading, beamReach, dt);
    return;
  }

  boat.heading = smoothTurn(boat.heading, tackHeading, dt);
}

// ---------------------------------------------------------------------------
// UPWIND: Tack toward windward mark with proper layline awareness
//
// Real upwind sailing:
// 1. Sail close-hauled on the lifted tack (the tack closer to the mark bearing)
// 2. Tack when headers push bearing away, or when reaching the layline
// 3. Once on the layline, maintain tack to fetch the mark
// 4. Approach mark with slight overshoot to account for rounding (port rounding)
//
// Port rounding: leave mark to PORT - boat passes to STARBOARD (right) of mark
// With wind from north: approach on starboard tack, sail past mark to the right,
// then bear away once above it.
// ---------------------------------------------------------------------------

function handleUpwind(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  time: number,
  state: AIState,
  allBoats: Boat[],
  dt: number,
): void {
  const target = getTargetForRounding(boat.rounding, course, boat);
  if (!target) return;

  const dist = distance(boat.position, target);
  const bearing = angleBetween(boat.position, target);
  const boatAboveMark = boat.position.y < target.y;

  // --- ALREADY ROUNDED (above mark): Bear away to offset ---
  if (boatAboveMark && dist < ROUNDING_RADIUS + 20) {
    const bearAwayHeading = normalizeAngle(wind.direction + 140);
    boat.heading = smoothTurn(boat.heading, bearAwayHeading, dt);
    return;
  }

  // --- NEAR THE MARK (within 80px): Execute final approach ---
  if (dist < ROUNDING_RADIUS + 60 && !boatAboveMark) {
    // For port rounding, we need to pass to the RIGHT of the mark.
    // Approach on STARBOARD tack (wind from 0 => heading ~315, moving right+up)
    // This naturally brings us to the right side of the mark.
    //
    // Aim at a point offset to the right of and slightly above the mark.
    // The overshoot ensures we trigger the rounding detection (y < mark.y).
    const approachPoint: Vec2 = {
      x: target.x + 35,
      y: target.y - 25,
    };

    const approachBearing = angleBetween(boat.position, approachPoint);
    if (isSaileable(approachBearing, wind.direction)) {
      boat.heading = smoothTurn(boat.heading, approachBearing, dt, 200);
    } else {
      // Use starboard tack to reach the right side of the mark
      boat.heading = smoothTurn(boat.heading, stbdCloseHauled(wind.direction), dt, 200);
    }
    return;
  }

  // --- OPEN WATER: Layline-aware tacking ---
  const currentTack: 'port' | 'starboard' =
    normalizeDeg(wind.direction - boat.heading) > 0 ? 'starboard' : 'port';
  const timeSinceTack = time - state.lastTackTime;

  // Check if we can fetch the mark on the current tack (layline check)
  const canFetchOnCurrentTack = (() => {
    const laylineHeading = currentTack === 'starboard'
      ? stbdCloseHauled(wind.direction)
      : portCloseHauled(wind.direction);
    // Project where we'd end up sailing this tack
    const bearingDiff = Math.abs(normalizeDeg(bearing - laylineHeading));
    // If the mark is within 15 degrees of our close-hauled course, we can fetch it
    return bearingDiff < 15;
  })();

  // Tack if:
  // 1. We've overstood the layline, OR
  // 2. We're sailing significantly away from the mark (header), OR
  // 3. There's dirty air from a boat ahead on this tack
  const headingToTargetDiff = Math.abs(normalizeDeg(bearing - boat.heading));
  const overstood = isOverstood(boat.position, target, wind.direction, currentTack);

  const shouldTack = timeSinceTack > MIN_TACK_INTERVAL && (
    overstood ||
    (headingToTargetDiff > 80 && !canFetchOnCurrentTack)
  );

  if (shouldTack) {
    state.lastTackTime = time;
    state.tackCount++;
    const newHeading = bestTackToward(boat.position, target, wind.direction);
    boat.heading = newHeading;
    boat.isTacking = true;
    boat.tackTimer = 0.6;
    return;
  }

  // If we can fetch the mark, just maintain current close-hauled heading
  if (canFetchOnCurrentTack) {
    const maintainHeading = currentTack === 'starboard'
      ? stbdCloseHauled(wind.direction)
      : portCloseHauled(wind.direction);
    boat.heading = smoothTurn(boat.heading, maintainHeading, dt);
  } else {
    // Sail the tack that takes us closer to the mark
    const desiredHeading = bestTackToward(boat.position, target, wind.direction);
    boat.heading = smoothTurn(boat.heading, desiredHeading, dt);
  }
}

// ---------------------------------------------------------------------------
// DOWNWIND: Sail to gate on broad reach angles, gybe as needed
//
// Real downwind sailing:
// 1. Don't sail dead downwind (slow in the polar) - use broad reach angles
// 2. Gybe to stay on the favorable angle toward the gate
// 3. Pass between the gate marks and round the chosen one
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

  // PHASE 1: Above the gate - sail downwind on optimal VMG angles
  // Use broad reach angles (~140-150 TWA) and gybe to stay aimed at the gate
  const biasedX = gateCenterX + (chosenMark.x - gateCenterX) * 0.7;
  const gateTarget: Vec2 = { x: biasedX, y: gateY + 15 };

  const bearing = angleBetween(boat.position, gateTarget);
  const currentTwa = Math.abs(normalizeDeg(wind.direction - boat.heading));

  // Optimal downwind VMG angle is around 140-155 TWA
  const optimalDownwindAngle = GYBE_ANGLE;

  if (isSaileable(bearing, wind.direction)) {
    // If we can sail directly and it's a reasonable downwind angle, do it
    const targetTwa = Math.abs(normalizeDeg(wind.direction - bearing));
    if (targetTwa >= 120) {
      boat.heading = smoothTurn(boat.heading, bearing, dt);
    } else {
      // Target is too high - use a broad reach angle biased toward it
      const portGybe = normalizeAngle(wind.direction + optimalDownwindAngle);
      const stbdGybe = normalizeAngle(wind.direction - optimalDownwindAngle);
      const portDiff = Math.abs(normalizeDeg(bearing - portGybe));
      const stbdDiff = Math.abs(normalizeDeg(bearing - stbdGybe));
      boat.heading = smoothTurn(boat.heading, portDiff < stbdDiff ? portGybe : stbdGybe, dt);
    }
  } else {
    // Can't sail directly - use best broad reach angle
    const portGybe = normalizeAngle(wind.direction + optimalDownwindAngle);
    const stbdGybe = normalizeAngle(wind.direction - optimalDownwindAngle);
    const portDiff = Math.abs(normalizeDeg(bearing - portGybe));
    const stbdDiff = Math.abs(normalizeDeg(bearing - stbdGybe));
    boat.heading = smoothTurn(boat.heading, portDiff < stbdDiff ? portGybe : stbdGybe, dt);
  }
}

// ---------------------------------------------------------------------------
// OFFSET: Reaching from windward mark to offset mark
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
      const downTarget: Vec2 = { x: target.x, y: target.y + 100 };
      const heading = saileableHeadingToward(boat.position, downTarget, wind.direction);
      boat.heading = smoothTurn(boat.heading, heading, dt);
      return;
    }

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
// Collision avoidance: strong repulsion to prevent overlapping
//
// Uses a graduated response:
// - Far (25-40px): gentle nudge to open space
// - Close (15-25px): moderate course change
// - Very close (<15px): emergency avoidance
// ---------------------------------------------------------------------------

function applyCollisionAvoidance(boat: Boat, allBoats: Boat[]): void {
  let totalNudgeX = 0;
  let totalNudgeY = 0;
  let nearbyCount = 0;

  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dx = boat.position.x - other.position.x;
    const dy = boat.position.y - other.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < BOAT_SEPARATION && dist > 0.5) {
      // Strength increases as boats get closer
      const overlap = (BOAT_SEPARATION - dist) / BOAT_SEPARATION;
      const strength = overlap * overlap; // quadratic - much stronger when very close
      totalNudgeX += (dx / dist) * strength;
      totalNudgeY += (dy / dist) * strength;
      nearbyCount++;
    }
  }

  if (nearbyCount > 0) {
    // Convert repulsion vector to heading adjustment
    const nudgeAngle = normalizeAngle(
      Math.atan2(totalNudgeX, -totalNudgeY) * (180 / Math.PI)
    );
    const diff = normalizeDeg(nudgeAngle - boat.heading);
    // Apply proportional heading change - stronger when more boats nearby
    const nudgeStrength = Math.min(0.15, 0.06 * nearbyCount);
    boat.heading = normalizeAngle(boat.heading + diff * nudgeStrength);
  }
}

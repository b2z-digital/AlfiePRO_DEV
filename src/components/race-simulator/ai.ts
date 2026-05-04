import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Close-hauled angle off the true wind (degrees). */
const TACK_ANGLE = 45;

/** Minimum seconds between tacks to avoid thrashing. */
const MIN_TACK_INTERVAL = 2.5;

/** Distance (px) at which we switch to mark-approach steering. */
const MARK_APPROACH_DIST = 35;

/** Lateral offset (px) to the RIGHT of a mark for port rounding waypoint. */
const MARK_ROUNDING_OFFSET = 25;

// ---------------------------------------------------------------------------
// Per-boat AI memory
// ---------------------------------------------------------------------------

interface AIState {
  lastTackTime: number;
  preferredSide: 1 | -1;
  initialized: boolean;
  gateChoice: 'port' | 'starboard';
  /** Tracks the last wind direction we saw on the previous tick. */
  prevWindDir: number;
}

const aiStates = new Map<string, AIState>();

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      lastTackTime: -10,
      preferredSide: Math.random() > 0.5 ? 1 : -1,
      initialized: false,
      gateChoice: Math.random() > 0.5 ? 'port' : 'starboard',
      prevWindDir: 0,
    });
  }
  return aiStates.get(boat.id)!;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Clear all AI memory (call on game reset). */
export function resetAIStates(): void {
  aiStates.clear();
}

/**
 * Return the Vec2 target a boat should aim for given its current rounding
 * number.
 *
 * Rounding map:
 *   0 = pre-start (target = line centre, just below)
 *   1,4 = windward mark (top of screen)
 *   2,5 = offset mark
 *   3,6 = leeward gate
 *   7   = finish line
 */
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
      // Always target the CENTER of the gate - boats must pass THROUGH
      if (gatePort && gateStbd) {
        return {
          x: (gatePort.position.x + gateStbd.position.x) / 2,
          y: gatePort.position.y,
        };
      }
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

/** Roundings where the boat is heading upwind (toward top of screen). */
export function isHeadingUpwind(rounding: number): boolean {
  return rounding === 1 || rounding === 4 || rounding === 7;
}

/** Roundings where the boat is heading downwind (toward bottom of screen). */
export function isHeadingDownwind(rounding: number): boolean {
  return rounding === 3 || rounding === 6;
}

// ---------------------------------------------------------------------------
// Heading utilities
// ---------------------------------------------------------------------------

/**
 * Compute a close-hauled heading for a given tack relative to the wind.
 *
 * Wind direction = direction wind comes FROM (compass heading of wind source).
 * Upwind heading = windDir (sailing toward the source).
 *   - Starboard tack (wind from starboard/right): heading = windDir - TACK_ANGLE
 *   - Port tack (wind from port/left): heading = windDir + TACK_ANGLE
 */
function getCloseHauledHeading(windDir: number, tack: 'starboard' | 'port'): number {
  if (tack === 'starboard') return normalizeAngle(windDir - TACK_ANGLE);
  return normalizeAngle(windDir + TACK_ANGLE);
}

/**
 * Determine which tack the boat is currently on based on its heading and wind.
 * Positive TWA = starboard tack, negative = port tack.
 */
function currentTack(boatHeading: number, windDir: number): 'starboard' | 'port' {
  return getTrueWindAngle(boatHeading, windDir) > 0 ? 'starboard' : 'port';
}

/** Smoothly steer the boat toward a desired heading at a human-like turn rate. */
function smoothTurnToward(boat: Boat, desiredHeading: number, dt: number = 0.016): void {
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 200; // degrees per second
  const maxTurn = turnRate * dt;
  if (Math.abs(headingDiff) > maxTurn) {
    boat.heading = normalizeAngle(boat.heading + Math.sign(headingDiff) * maxTurn);
  } else {
    boat.heading = normalizeAngle(desiredHeading);
  }
}

/** Instantly snap the boat heading (used for emergency containment during pre-start). */
function snapHeading(boat: Boat, heading: number): void {
  boat.heading = normalizeAngle(heading);
}

/** Execute a tack manoeuvre: set heading to opposite close-hauled and trigger the tack timer. */
function doTack(boat: Boat, windDir: number, newTack: 'starboard' | 'port'): void {
  boat.heading = getCloseHauledHeading(windDir, newTack);
  boat.isTacking = true;
  boat.tackTimer = 0.6;
}

/** Execute a gybe manoeuvre. */
function doGybe(boat: Boat, windDir: number): void {
  // Mirror heading through dead downwind
  const twa = getTrueWindAngle(boat.heading, windDir);
  boat.heading = normalizeAngle(boat.heading + 2 * -twa + 360);
  boat.isGybing = true;
  boat.tackTimer = 0.5;
}

// ---------------------------------------------------------------------------
// Main AI entry point
// ---------------------------------------------------------------------------

/**
 * Update a single AI boat's heading for the current frame.
 *
 * Called once per frame from the game loop BEFORE physics / position update.
 */
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
    state.prevWindDir = wind.direction;
  }

  // --- Pre-start behaviour ---
  if (boat.rounding === 0) {
    updatePreStart(boat, course, wind, time, state, allBoats, countdownRemaining ?? 60);
    state.prevWindDir = wind.direction;
    return;
  }

  // --- Racing behaviour ---
  const target = getTargetForRounding(boat.rounding, course, boat);
  if (!target) return;

  const upwind = isHeadingUpwind(boat.rounding);
  const downwind = isHeadingDownwind(boat.rounding);

  if (upwind) {
    updateUpwind(boat, course, wind, time, state, target);
  } else if (downwind) {
    updateDownwind(boat, wind, state, target);
  } else {
    // Reaching legs (rounding 2 or 5 = heading to offset mark)
    updateReaching(boat, wind, state, target);
  }

  // --- Collision avoidance nudge ---
  avoidCollisions(boat, allBoats);

  // Remember wind direction for shift detection next tick
  state.prevWindDir = wind.direction;
}

// ---------------------------------------------------------------------------
// Pre-start: mill around just below the start line
// ---------------------------------------------------------------------------

function updatePreStart(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  time: number,
  state: AIState,
  allBoats: Boat[],
  countdownRemaining: number,
): void {
  const lineCenter: Vec2 = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const halfLineWidth =
    Math.abs(course.startLine.starboard.x - course.startLine.port.x) / 2;

  const maxXFromCenter = halfLineWidth * 0.7;

  // Target distance below line depends on time remaining.
  // Early: 40-70px below. Final 15s: gradually approach. Final 3s: rush the line.
  const skillFactor = boat.skillLevel || 0.85;
  let targetYBelow: number;
  if (countdownRemaining > 30) {
    targetYBelow = 50 + (1 - skillFactor) * 30; // better boats slightly closer
  } else if (countdownRemaining > 15) {
    // Gradually close from 50 to 30
    const t = (30 - countdownRemaining) / 15;
    targetYBelow = 50 - t * 25 + (1 - skillFactor) * 15;
  } else if (countdownRemaining > 3) {
    // Final approach: 30 down to 10
    const t = (15 - countdownRemaining) / 12;
    targetYBelow = 30 - t * 22 + (1 - skillFactor) * 8;
  } else {
    // Final 3 seconds: charge for the line
    targetYBelow = Math.max(0, countdownRemaining * 2);
  }

  const dx = boat.position.x - lineCenter.x;
  const dy = boat.position.y - lineCenter.y; // positive = below line

  // --- Hard boundary: never cross the line early ---
  if (dy < 3) {
    snapHeading(boat, 180);
    return;
  }

  // --- Hard boundary: don't go too far off laterally ---
  if (dx > maxXFromCenter) {
    snapHeading(boat, 270);
    return;
  }
  if (dx < -maxXFromCenter) {
    snapHeading(boat, 90);
    return;
  }

  // --- Collision avoidance: steer away from nearby boats ---
  let avoidX = 0;
  let avoidY = 0;
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 30 && dist > 0) {
      const awayX = boat.position.x - other.position.x;
      const awayY = boat.position.y - other.position.y;
      const strength = (30 - dist) / 30;
      avoidX += (awayX / dist) * strength * 40;
      avoidY += (awayY / dist) * strength * 20;
    }
  }

  // --- Determine desired heading ---
  let desiredHeading: number;

  if (countdownRemaining <= 3) {
    // Final rush: head north (toward line) with slight lateral adjustment
    desiredHeading = 0;
    // Add lateral correction if too far from preferred position
    if (Math.abs(dx) > halfLineWidth * 0.4) {
      desiredHeading = dx > 0 ? 340 : 20;
    }
  } else {
    // Normal maneuvering: sail laterally with vertical corrections
    const timeSinceTack = time - state.lastTackTime;
    const tackInterval = 3.0 + Math.random() * 2.0;

    if (timeSinceTack > tackInterval) {
      state.lastTackTime = time;
      state.preferredSide = (state.preferredSide * -1) as 1 | -1;
    }

    // Vertical correction: steer toward target distance below line
    const yError = dy - targetYBelow; // positive = too far below target, negative = too close to line

    if (yError < -5) {
      // Too close to line: head south-east or south-west
      desiredHeading = state.preferredSide > 0 ? 140 : 220;
    } else if (yError > 10) {
      // Too far below target: head north-east or north-west
      desiredHeading = state.preferredSide > 0 ? 40 : 320;
    } else {
      // In the target zone: sail mostly lateral
      desiredHeading = state.preferredSide > 0 ? 80 : 280;
    }
  }

  // Apply collision avoidance as heading adjustment
  if (Math.abs(avoidX) > 5 || Math.abs(avoidY) > 5) {
    const avoidAngle = angleBetween(boat.position, {
      x: boat.position.x + avoidX,
      y: boat.position.y + avoidY,
    });
    // Blend avoidance with desired heading
    const avoidWeight = Math.min(0.6, (Math.abs(avoidX) + Math.abs(avoidY)) / 60);
    const desiredRad = desiredHeading * Math.PI / 180;
    const avoidRad = avoidAngle * Math.PI / 180;
    const blendedRad = desiredRad * (1 - avoidWeight) + avoidRad * avoidWeight;
    desiredHeading = normalizeAngle(blendedRad * 180 / Math.PI);
  }

  smoothTurnToward(boat, desiredHeading);
}

// ---------------------------------------------------------------------------
// Upwind sailing with tacking and wind-shift awareness
// ---------------------------------------------------------------------------

function updateUpwind(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  time: number,
  state: AIState,
  target: Vec2,
): void {
  const distToTarget = distance(boat.position, target);
  const angleToTarget = angleBetween(boat.position, target);

  // ------ Mark approach: port rounding ------
  // Port rounding means mark is left to PORT side, boat passes to the RIGHT of the mark.
  // Approaching from below (upwind), boat must:
  // 1. Sail up to the mark
  // 2. Pass to the RIGHT side of it
  // 3. Bear away downwind after passing
  if (distToTarget < MARK_APPROACH_DIST) {
    const boatAboveMark = boat.position.y < target.y;
    const boatRightOfMark = boat.position.x > target.x;

    let waypoint: Vec2;
    if (!boatAboveMark && !boatRightOfMark) {
      // Below and left: aim for a point to the RIGHT of the mark, slightly above
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y - 5 };
    } else if (!boatAboveMark && boatRightOfMark) {
      // Below and right: sail past the mark on its right side
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y - 10 };
    } else if (boatAboveMark && !boatRightOfMark) {
      // Above but left: swing to the right to clear the mark
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET + 15, y: target.y };
    } else {
      // Above and to the right: we've cleared the mark, bear away southward
      waypoint = { x: target.x, y: target.y + 50 };
    }

    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // ------ Wind-shift tacking logic ------
  // A "lift" is when the wind shifts so our current tack now points more
  // directly at the target. A "header" is the opposite -- we are pushed
  // further from the target. Smart sailors tack on headers.

  const tack = currentTack(boat.heading, wind.direction);
  const desiredHeading = getCloseHauledHeading(wind.direction, tack);

  // Angle the close-hauled heading makes with the direct line to target.
  // Small = we are being lifted (good). Large = we are being headed (bad).
  const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - desiredHeading));

  // Detect a wind shift since last tick
  const windShift = normalizeDeg(wind.direction - state.prevWindDir);

  // Decide whether to tack
  const timeSinceTack = time - state.lastTackTime;
  let shouldTack = false;

  if (timeSinceTack > MIN_TACK_INTERVAL) {
    // 1) Classic geometry tack: current tack is heading away from target
    if (headingDiffToTarget > 80) {
      shouldTack = true;
    }

    // 2) Wind-shift tack: a header just occurred (wind shifted to push us
    //    further from target on this tack). We detect this by seeing if the
    //    shift INCREASED our angle to target. A shift > 5 deg that makes
    //    the other tack more favourable triggers a tack.
    if (Math.abs(windShift) > 3 && timeSinceTack > MIN_TACK_INTERVAL + 0.5) {
      const otherTack: 'starboard' | 'port' = tack === 'starboard' ? 'port' : 'starboard';
      const otherHeading = getCloseHauledHeading(wind.direction, otherTack);
      const otherDiffToTarget = Math.abs(normalizeDeg(angleToTarget - otherHeading));
      // If the other tack points significantly more toward the target, tack.
      if (otherDiffToTarget < headingDiffToTarget - 10) {
        shouldTack = true;
      }
    }

    // 3) Layline awareness: if we can fetch the mark on the other tack,
    //    and we are beyond a reasonable layline, tack now.
    if (timeSinceTack > MIN_TACK_INTERVAL + 1) {
      const otherTack: 'starboard' | 'port' = tack === 'starboard' ? 'port' : 'starboard';
      const otherHeading = getCloseHauledHeading(wind.direction, otherTack);
      const otherDiff = Math.abs(normalizeDeg(angleToTarget - otherHeading));
      // If other tack can nearly lay the mark (angle < TACK_ANGLE + small margin)
      if (otherDiff < TACK_ANGLE + 5 && headingDiffToTarget > TACK_ANGLE + 15) {
        shouldTack = true;
      }
    }
  }

  if (shouldTack) {
    const newTack: 'starboard' | 'port' = tack === 'starboard' ? 'port' : 'starboard';
    state.lastTackTime = time;
    doTack(boat, wind.direction, newTack);
    return;
  }

  // ------ Sail close-hauled on current tack ------
  // If we can fetch the target without tacking (angle is within our close-hauled
  // cone), aim directly at it.
  const twaToTarget = Math.abs(getTrueWindAngle(angleToTarget, wind.direction));
  if (twaToTarget >= TACK_ANGLE - 5) {
    smoothTurnToward(boat, angleToTarget);
  } else {
    smoothTurnToward(boat, desiredHeading);
  }
}

// ---------------------------------------------------------------------------
// Downwind sailing -- RC boats run straight downwind (heading 180)
// ---------------------------------------------------------------------------

function updateDownwind(
  boat: Boat,
  wind: { direction: number; speed: number },
  state: AIState,
  target: Vec2,
  course?: Course,
): void {
  const distToTarget = distance(boat.position, target);
  const angleToTarget = angleBetween(boat.position, target);

  // The target is the CENTER of the gate. Boats must sail THROUGH (between the two marks).
  // Gate approach distance is larger than regular marks since we need to line up properly.
  const GATE_APPROACH_DIST = 50;

  if (distToTarget < GATE_APPROACH_DIST) {
    const boatBelowGate = boat.position.y > target.y;

    if (!boatBelowGate) {
      // Still above the gate: aim directly at the center point to pass through
      smoothTurnToward(boat, angleToTarget);
    } else {
      // Below the gate: we've passed through, now round up and head upwind
      const waypoint: Vec2 = { x: target.x, y: target.y - 50 };
      smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    }
    return;
  }

  // RC boats sail straight downwind. Aim directly at the gate center which
  // naturally produces a heading near 180 (south) with lateral corrections.
  smoothTurnToward(boat, angleToTarget);
}

// ---------------------------------------------------------------------------
// Reaching legs (to offset mark, roundings 2 and 5)
// ---------------------------------------------------------------------------

function updateReaching(
  boat: Boat,
  wind: { direction: number; speed: number },
  state: AIState,
  target: Vec2,
): void {
  const distToTarget = distance(boat.position, target);

  // Offset mark: port rounding (pass to RIGHT of mark).
  // Approaching from above (coming from windward mark), boat sails down and
  // to the right of the offset mark, then continues downwind.
  if (distToTarget < MARK_APPROACH_DIST) {
    const boatBelowMark = boat.position.y > target.y;
    const boatRightOfMark = boat.position.x > target.x;

    let waypoint: Vec2;
    if (!boatBelowMark && !boatRightOfMark) {
      // Above and left: aim for a point to the RIGHT of the mark, slightly below
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y + 5 };
    } else if (!boatBelowMark && boatRightOfMark) {
      // Above and right: sail past the mark on its right side heading down
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y + 15 };
    } else if (boatBelowMark && !boatRightOfMark) {
      // Below but left: swing right to clear the mark
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET + 10, y: target.y + 10 };
    } else {
      // Below and right: we've cleared the mark, continue downwind
      waypoint = { x: target.x, y: target.y + 60 };
    }
    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // Otherwise aim at the target
  const angleToTarget = angleBetween(boat.position, target);
  smoothTurnToward(boat, angleToTarget);
}

// ---------------------------------------------------------------------------
// Collision avoidance
// ---------------------------------------------------------------------------

function avoidCollisions(boat: Boat, allBoats: Boat[]): void {
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 20 && dist > 0) {
      const away = angleBetween(other.position, boat.position);
      const nudge = normalizeDeg(away - boat.heading) * 0.06;
      boat.heading = normalizeAngle(boat.heading + nudge);
    }
  }
}

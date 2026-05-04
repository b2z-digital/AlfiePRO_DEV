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
const MARK_APPROACH_DIST = 45;

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
      if (!boat) {
        if (gatePort && gateStbd) {
          return {
            x: (gatePort.position.x + gateStbd.position.x) / 2,
            y: gatePort.position.y,
          };
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
    updatePreStart(boat, course, wind, time, state);
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
): void {
  const lineCenter: Vec2 = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const halfLineWidth =
    Math.abs(course.startLine.starboard.x - course.startLine.port.x) / 2;

  // Containment box: boats must stay within a tight region near the line.
  // They should mill around 10-30px below the line during countdown.
  const maxXFromCenter = halfLineWidth * 0.6;
  const maxYBelow = 40; // max pixels below the line
  const lineThreshold = 2; // don't go above the line

  const dx = boat.position.x - lineCenter.x;
  const dy = boat.position.y - lineCenter.y; // positive = below line (correct in screen coords)

  // ------ Hard boundary corrections ------

  // CRITICAL: If boat is above or at the line, immediately head downwind (south)
  if (dy < lineThreshold) {
    // Above the line -- head directly downwind to get back below
    snapHeading(boat, normalizeAngle(wind.direction + 180));
    return;
  }

  if (dx > maxXFromCenter) {
    // Too far right -- turn to head left (port tack goes NE→ just steer left/south-ish)
    snapHeading(boat, normalizeAngle(wind.direction + 180 - 30));
    return;
  }
  if (dx < -maxXFromCenter) {
    // Too far left -- turn to head right
    snapHeading(boat, normalizeAngle(wind.direction + 180 + 30));
    return;
  }

  if (dy > maxYBelow) {
    // Too far below line -- head upwind toward the line
    snapHeading(
      boat,
      getCloseHauledHeading(wind.direction, state.preferredSide > 0 ? 'starboard' : 'port'),
    );
    return;
  }

  // ------ Within bounds: sail on a beam reach (across the line) to hold position ------
  // During pre-start, boats reach back and forth laterally rather than
  // sailing upwind (which would take them above the line).

  const timeSinceTack = time - state.lastTackTime;
  const tackInterval = 2.0 + Math.random() * 1.5;

  if (timeSinceTack > tackInterval) {
    state.lastTackTime = time;
    state.preferredSide = (state.preferredSide * -1) as 1 | -1;
  }

  // Sail on a beam reach (perpendicular to wind) to stay laterally moving
  // without going upwind. Wind from 0 (north): beam reach headings are 90 (east) or 270 (west).
  // Add a slight downwind bias to keep them from creeping above line.
  const beamReachAngle = 100; // slightly south of pure beam reach
  const desiredHeading = state.preferredSide > 0
    ? normalizeAngle(wind.direction + beamReachAngle)  // heading ESE
    : normalizeAngle(wind.direction - beamReachAngle); // heading WSW

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

  // ------ Mark approach: steer through a rounding arc ------
  // Port rounding: pass to the RIGHT of the mark. We use different waypoints
  // based on where the boat is relative to the mark.
  if (distToTarget < MARK_APPROACH_DIST) {
    const boatAboveMark = boat.position.y < target.y;
    const boatRightOfMark = boat.position.x > target.x;

    let waypoint: Vec2;
    if (!boatAboveMark) {
      // Still below the mark: steer to a point to the RIGHT and slightly ABOVE the mark
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y - 15 };
    } else if (!boatRightOfMark) {
      // Above the mark but on the left side: steer right past it
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y };
    } else {
      // Above and to the right: we've rounded, head toward next target (down and right)
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET + 20, y: target.y + 30 };
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
): void {
  const distToTarget = distance(boat.position, target);
  const angleToTarget = angleBetween(boat.position, target);

  // Near the gate mark, steer to pass through/around it
  if (distToTarget < MARK_APPROACH_DIST) {
    const boatBelowMark = boat.position.y > target.y;
    const boatRightOfMark = boat.position.x > target.x;

    let waypoint: Vec2;
    if (!boatBelowMark) {
      // Still above the gate: steer toward the mark, slightly to its right
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y + 10 };
    } else {
      // Below the gate: round up and head upwind
      waypoint = { x: target.x, y: target.y - 30 };
    }
    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // RC boats sail straight downwind. Aim directly at the target which
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

  // Near the offset mark: port rounding means pass to the RIGHT.
  // Approaching from above (coming from windward), we need to pass right then exit below.
  if (distToTarget < MARK_APPROACH_DIST) {
    const boatBelowMark = boat.position.y > target.y;
    const boatRightOfMark = boat.position.x > target.x;

    let waypoint: Vec2;
    if (!boatBelowMark) {
      // Still above: steer to the right side of the mark and below it
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y + 15 };
    } else if (!boatRightOfMark) {
      // Below but to the left: swing right past the mark
      waypoint = { x: target.x + MARK_ROUNDING_OFFSET, y: target.y + 10 };
    } else {
      // Below and right: we've rounded, head toward gate (further down)
      waypoint = { x: target.x, y: target.y + 50 };
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

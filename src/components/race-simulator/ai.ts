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
const MARK_APPROACH_DIST = 40;

/** Lateral offset (px) to the RIGHT of a mark for port rounding waypoint. */
const MARK_ROUNDING_OFFSET = 30;

/** Outer approach zone for windward mark (px). Boats start sequencing here. */
const WINDWARD_OUTER_APPROACH = 120;

/** Gate approach distance (px). */
const GATE_APPROACH_DIST = 80;

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
  /** Per-boat random offset for mark rounding to prevent clustering. */
  markOffset: number;
  /** Slot index assigned during pre-start for spacing. */
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
      prevWindDir: 0,
      markOffset: (Math.random() - 0.5) * 20,
      startSlot: slotCounter++,
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
  slotCounter = 0;
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
      // Gate rounding: boat picks one gate mark and rounds it.
      // Target the chosen gate mark - boat will sail DOWN past it then round up.
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

  // Each boat gets a unique "slot" along the line for spacing
  const aiBoats = allBoats.filter(b => !b.isPlayer && !b.finished);
  const totalSlots = aiBoats.length;
  const slotWidth = (halfLineWidth * 1.4) / Math.max(totalSlots, 1);
  const mySlotX = lineCenter.x - halfLineWidth * 0.7 + state.startSlot * slotWidth + slotWidth * 0.5;

  const dx = boat.position.x - lineCenter.x;
  const dy = boat.position.y - lineCenter.y; // positive = below line

  // --- Hard boundary: never cross the line early ---
  if (dy < 3) {
    snapHeading(boat, 180);
    return;
  }

  // --- Hard boundary: don't go too far off laterally ---
  const maxXFromCenter = halfLineWidth * 0.85;
  if (dx > maxXFromCenter) {
    // At right edge: tack to port (head back left)
    smoothTurnToward(boat, 315);
    return;
  }
  if (dx < -maxXFromCenter) {
    // At left edge: tack to starboard (head back right)
    smoothTurnToward(boat, 45);
    return;
  }

  // --- Pre-start strategy ---
  // Phase 1 (>20s remaining): Sail on STARBOARD TACK (heading ~315, NW direction)
  //   with proper spacing. Boats sail back and forth on close-hauled courses below the line.
  //   Starboard tack has right-of-way over port tack (racing rule).
  //
  // Phase 2 (20-5s): Begin positioning for the start. Sail toward assigned slot.
  //
  // Phase 3 (<5s): Final approach on starboard tack (close-hauled toward the line).

  const skillFactor = boat.skillLevel || 0.85;

  if (countdownRemaining > 20) {
    // Phase 1: sail on starboard tack with occasional port tack dips
    // Starboard tack close-hauled heading (wind from 0/north): ~315 degrees (NW)
    const stbdHeading = getCloseHauledHeading(wind.direction, 'starboard');
    const portHeading = getCloseHauledHeading(wind.direction, 'port');

    // Determine which tack to be on based on position relative to slot
    const slotDx = boat.position.x - mySlotX;

    // Maintain distance below line: 40-70px
    const targetYBelow = 50 + (1 - skillFactor) * 20;
    const yError = dy - targetYBelow;

    const timeSinceTack = time - state.lastTackTime;

    if (yError < -10 && timeSinceTack > MIN_TACK_INTERVAL) {
      // Too close to the line: bear away south
      smoothTurnToward(boat, 180);
      return;
    }

    if (timeSinceTack > MIN_TACK_INTERVAL) {
      // Prefer starboard tack (heading ~315, going right-ish and up)
      // Only go port tack briefly if we've sailed too far to the right of our slot
      if (slotDx > slotWidth * 0.8) {
        state.lastTackTime = time;
        state.preferredSide = -1;
      } else if (slotDx < -slotWidth * 0.8) {
        state.lastTackTime = time;
        state.preferredSide = 1;
      }
    }

    // Sail on preferred tack (1 = starboard, -1 = port)
    let desiredHeading = state.preferredSide > 0 ? stbdHeading : portHeading;

    // Blend with vertical correction
    if (yError > 15) {
      // Too far below: angle more upwind
      desiredHeading = normalizeAngle(desiredHeading - 10 * state.preferredSide);
    }

    smoothTurnToward(boat, desiredHeading);

  } else if (countdownRemaining > 5) {
    // Phase 2: Position for start. Sail toward assigned slot position.
    // Target: at slot X, about 25px below line.
    const targetYBelow = 25 + (1 - skillFactor) * 10;
    const targetPos: Vec2 = { x: mySlotX, y: lineCenter.y + targetYBelow };
    const angleToSlot = angleBetween(boat.position, targetPos);

    // Sail close-hauled toward target on starboard tack (preferred for right-of-way)
    const stbdHeading = getCloseHauledHeading(wind.direction, 'starboard');
    const portHeading = getCloseHauledHeading(wind.direction, 'port');

    // Pick the tack that gets us closer to our slot
    const stbdDiff = Math.abs(normalizeDeg(angleToSlot - stbdHeading));
    const portDiff = Math.abs(normalizeDeg(angleToSlot - portHeading));

    let desiredHeading: number;
    if (stbdDiff < portDiff + 20) {
      desiredHeading = stbdHeading;
    } else {
      desiredHeading = portHeading;
    }

    // If we can reach the target directly (not too close to the wind), aim straight
    const twaToTarget = Math.abs(getTrueWindAngle(angleToSlot, wind.direction));
    if (twaToTarget >= TACK_ANGLE - 5) {
      desiredHeading = angleToSlot;
    }

    // Don't get too close to the line yet
    if (dy < 15) {
      desiredHeading = normalizeAngle(180 + (boat.position.x > mySlotX ? -30 : 30));
    }

    smoothTurnToward(boat, desiredHeading);

  } else {
    // Phase 3: Final approach. Charge the line on starboard tack close-hauled.
    const stbdHeading = getCloseHauledHeading(wind.direction, 'starboard');

    // Head pretty much straight at the line
    let desiredHeading: number;
    if (countdownRemaining <= 2) {
      // Last 2 seconds: aim directly at the line
      desiredHeading = 0;
      const slotDx = boat.position.x - mySlotX;
      if (Math.abs(slotDx) > 20) {
        desiredHeading = slotDx > 0 ? 350 : 10;
      }
    } else {
      // 5-2s: close-hauled starboard toward the line
      desiredHeading = stbdHeading;
      // Bias toward our slot
      const slotDx = boat.position.x - mySlotX;
      if (slotDx > 30) desiredHeading = normalizeAngle(desiredHeading + 15);
      if (slotDx < -30) desiredHeading = normalizeAngle(desiredHeading - 15);
    }

    smoothTurnToward(boat, desiredHeading);
  }
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

  // ------ Windward mark approach: port rounding ------
  // Port rounding = mark stays to port (LEFT) side of boat = boat passes to the RIGHT of the mark.
  // Strategy: approach on STARBOARD tack from below-right, pass to the RIGHT of the mark,
  // then once above the mark bear away to port (heading south-west toward offset mark).
  //
  // Per-boat offset prevents clustering: each boat aims at a slightly different waypoint.
  const boatOffset = state.markOffset;
  const rightOffset = MARK_ROUNDING_OFFSET + Math.abs(boatOffset);

  if (distToTarget < WINDWARD_OUTER_APPROACH) {
    const boatAboveMark = boat.position.y < target.y - 5;
    const boatRightOfMark = boat.position.x > target.x + 5;

    // Phase 1 (120-40px): Ensure boat is approaching from the RIGHT side.
    // If boat is to the LEFT of the mark, sail toward a waypoint to the lower-right of the mark.
    if (distToTarget > MARK_APPROACH_DIST) {
      if (!boatRightOfMark && !boatAboveMark) {
        // Force starboard tack approach: aim for a point well to the RIGHT and slightly below
        const waypoint: Vec2 = {
          x: target.x + rightOffset + 20,
          y: target.y + 30 + boatOffset,
        };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      }
      // Already to the right: aim slightly above-right of the mark
      if (boatRightOfMark && !boatAboveMark) {
        const waypoint: Vec2 = {
          x: target.x + rightOffset,
          y: target.y - 10,
        };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      }
    }

    // Phase 2 (within 40px): close rounding
    if (distToTarget < MARK_APPROACH_DIST) {
      if (!boatAboveMark) {
        // Still below/beside: aim to pass RIGHT of the mark at close quarters
        const waypoint: Vec2 = { x: target.x + rightOffset, y: target.y - 20 };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      } else {
        // Above the mark: bear away to the LEFT and downward (toward offset mark)
        const waypoint: Vec2 = { x: target.x - 30, y: target.y + 70 };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      }
    }

    // In between zone: already right/above, just aim at the mark
    if (boatAboveMark) {
      const waypoint: Vec2 = { x: target.x - 20, y: target.y + 60 };
      smoothTurnToward(boat, angleBetween(boat.position, waypoint));
      return;
    }
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
  const isPortGate = state.gateChoice === 'port';

  // Gate rounding: target is the chosen gate mark (port or starboard).
  // Boat sails DOWN past the gate mark on the OUTWARD side, then rounds back up.
  //   Port gate mark: boat passes to the LEFT of the mark (outward), rounds LEFT/upward.
  //   Starboard gate mark: boat passes to the RIGHT of the mark (outward), rounds RIGHT/upward.
  // "Outward" = AWAY from the center of the gate.

  if (distToTarget < GATE_APPROACH_DIST) {
    const boatBelowMark = boat.position.y > target.y + 15;
    // Outward offset: port mark = negative X (to the LEFT), stbd mark = positive X (to the RIGHT)
    const outwardOffset = isPortGate ? -30 : 30;

    if (!boatBelowMark) {
      // Above the gate mark: aim for a point BELOW the mark on the OUTWARD side
      const waypoint: Vec2 = { x: target.x + outwardOffset, y: target.y + 25 };
      smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    } else {
      // Below the mark on the outward side: now round back up, curving around the mark
      // Aim for a point ABOVE the mark, slightly outward then back toward center
      const waypoint: Vec2 = { x: target.x + outwardOffset * 0.5, y: target.y - 60 };
      smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    }
    return;
  }

  // Approaching the gate: aim slightly to the outward side of the chosen mark
  // so the boat naturally arrives on the correct side for rounding.
  if (distToTarget < GATE_APPROACH_DIST * 2) {
    const outwardBias = isPortGate ? -15 : 15;
    const biasedTarget: Vec2 = { x: target.x + outwardBias, y: target.y };
    smoothTurnToward(boat, angleBetween(boat.position, biasedTarget));
    return;
  }

  // RC boats sail straight downwind. Aim directly at the gate mark.
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
    if (dist < 25 && dist > 0) {
      const away = angleBetween(other.position, boat.position);
      const headingDiff = normalizeDeg(away - boat.heading);
      // Stronger avoidance when closer
      const strength = 0.04 + (25 - dist) / 25 * 0.12;
      boat.heading = normalizeAngle(boat.heading + headingDiff * strength);
    }
  }
}

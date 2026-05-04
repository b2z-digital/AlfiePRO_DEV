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
      // Gate rounding: boat sails BETWEEN the two gate marks, then rounds outward.
      // Target = midpoint between the two gate marks (the gate entrance).
      // The AI updateDownwind function handles steering through the gate and around the mark.
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
    updateDownwind(boat, wind, state, target, course);
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
// Pre-start: mill around below the start line, approach as countdown nears 0
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
  const totalSlots = Math.max(aiBoats.length, 1);
  const lineSpread = halfLineWidth * 1.6;
  const slotWidth = lineSpread / totalSlots;
  const mySlotX = lineCenter.x - lineSpread * 0.5 + state.startSlot * slotWidth + slotWidth * 0.5;

  const dy = boat.position.y - lineCenter.y; // positive = below line (good)

  // --- Hard boundary: never cross the line early ---
  if (dy < 5) {
    snapHeading(boat, 180);
    return;
  }

  // --- Hard boundary: don't sail out of bounds laterally ---
  const dx = boat.position.x - lineCenter.x;
  const maxX = halfLineWidth * 1.1;
  if (dx > maxX) {
    smoothTurnToward(boat, 250); // head back left/down
    return;
  }
  if (dx < -maxX) {
    smoothTurnToward(boat, 110); // head back right/down
    return;
  }

  const skillFactor = boat.skillLevel || 0.85;

  // --- Pre-start phases ---
  // Phase 1 (>15s): Hold position 80-120px below line, sailing slow reaches
  // Phase 2 (15-6s): Move toward slot position, ~50px below line
  // Phase 3 (<6s): Final approach - accelerate toward the line to arrive at 0

  if (countdownRemaining > 15) {
    // Phase 1: Hold well below the line on broad reaches.
    // Boats sail slowly east/west to stay spread out and avoid bunching.
    const holdDistance = 90 + (1 - skillFactor) * 40 + state.markOffset * 0.5;
    const yError = dy - holdDistance;

    if (yError < -20) {
      // Too close to line: sail away (south)
      smoothTurnToward(boat, 180);
      return;
    }
    if (yError > 30) {
      // Too far below: angle slightly upwind
      smoothTurnToward(boat, boat.position.x > mySlotX ? 330 : 30);
      return;
    }

    // Sail east or west on beam reach to hold position and drift toward slot
    const slotDx = boat.position.x - mySlotX;
    if (slotDx > slotWidth * 0.5) {
      // Right of slot: sail west (left)
      smoothTurnToward(boat, 270);
    } else if (slotDx < -slotWidth * 0.5) {
      // Left of slot: sail east (right)
      smoothTurnToward(boat, 90);
    } else {
      // Near slot: slowly drift on starboard beam reach
      smoothTurnToward(boat, state.preferredSide > 0 ? 90 : 270);
    }

  } else if (countdownRemaining > 6) {
    // Phase 2: Move toward starting position. Target: slot X, ~40-50px below line.
    const targetYBelow = 40 + (1 - skillFactor) * 15;
    const targetPos: Vec2 = { x: mySlotX, y: lineCenter.y + targetYBelow };
    const angleToTarget = angleBetween(boat.position, targetPos);
    const distToTarget = distance(boat.position, targetPos);

    if (distToTarget < 15) {
      // Close enough to holding position: just hold heading roughly north
      smoothTurnToward(boat, 350 + (state.startSlot % 3 - 1) * 5);
    } else {
      // Sail toward the target position
      smoothTurnToward(boat, angleToTarget);
    }

    // Safety: don't get within 20px of line yet
    if (dy < 20) {
      smoothTurnToward(boat, 160 + (state.startSlot % 2 === 0 ? 20 : -20));
    }

  } else {
    // Phase 3: Final approach. Accelerate toward the line to cross at countdown = 0.
    // With ~6 seconds left, boats should be ~40-50px below. At typical speeds (~60-80 px/s)
    // they want to start their run. Close-hauled on starboard tack aiming at the line.

    const stbdHeading = getCloseHauledHeading(wind.direction, 'starboard');

    // Calculate ideal heading to reach line at the right time
    let desiredHeading: number;

    if (countdownRemaining <= 2) {
      // Last 2 seconds: point straight at the line
      desiredHeading = 0;
      // Small correction toward slot
      const slotDx = boat.position.x - mySlotX;
      if (Math.abs(slotDx) > 15) {
        desiredHeading = slotDx > 0 ? 355 : 5;
      }
    } else {
      // 6-2s: close-hauled starboard tack, biased toward slot position
      desiredHeading = stbdHeading;
      const slotDx = boat.position.x - mySlotX;
      if (slotDx > 25) desiredHeading = normalizeAngle(desiredHeading + 20);
      if (slotDx < -25) desiredHeading = normalizeAngle(desiredHeading - 20);

      // If very far below, aim more upwind
      if (dy > 60) desiredHeading = normalizeAngle((desiredHeading + 0) / 2);
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
  // Port rounding = mark stays to port (LEFT) = boat passes to the RIGHT of the mark.
  // Each boat gets a unique offset so they don't all converge on the same point.
  const boatOffset = state.markOffset + state.startSlot * 5;
  const rightOffset = MARK_ROUNDING_OFFSET + 10 + Math.abs(boatOffset);

  if (distToTarget < WINDWARD_OUTER_APPROACH) {
    const boatAboveMark = boat.position.y < target.y - 5;
    const boatRightOfMark = boat.position.x > target.x + 5;

    // Phase 1 (120-40px): Approach from below-right on starboard tack.
    // Use per-boat staggered waypoints to prevent clustering.
    if (distToTarget > MARK_APPROACH_DIST) {
      if (!boatRightOfMark && !boatAboveMark) {
        // Not yet right of mark: sail toward a point below-right of the mark
        const waypoint: Vec2 = {
          x: target.x + rightOffset + 30,
          y: target.y + 40 + Math.abs(boatOffset),
        };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      }
      if (boatRightOfMark && !boatAboveMark) {
        // Right of mark, below it: aim to pass close on the right side
        const waypoint: Vec2 = {
          x: target.x + rightOffset * 0.6,
          y: target.y - 15,
        };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      }
    }

    // Phase 2 (within 40px): tight rounding
    if (distToTarget < MARK_APPROACH_DIST) {
      if (!boatAboveMark) {
        // Still below: aim to pass just to the right
        const waypoint: Vec2 = { x: target.x + 20, y: target.y - 25 };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      } else {
        // Above the mark: bear away to port (left and downward toward offset mark)
        const waypoint: Vec2 = { x: target.x - 40, y: target.y + 80 };
        smoothTurnToward(boat, angleBetween(boat.position, waypoint));
        return;
      }
    }

    // Already above: continue bearing away
    if (boatAboveMark) {
      const waypoint: Vec2 = { x: target.x - 40, y: target.y + 80 };
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

  // Gate rounding (correct flow per racing rules):
  //   1. Boat sails DOWNWIND toward the CENTER of the gate (between the two marks)
  //   2. Boat passes BETWEEN the two gate marks
  //   3. After passing through, boat curves OUTWARD around their chosen mark:
  //      - Port mark: curve LEFT (west) around the port mark, then head upwind
  //      - Starboard mark: curve RIGHT (east) around the starboard mark, then head upwind
  //
  // "target" = midpoint between the two gate marks (gate center)

  // Get actual gate mark positions from course
  const gatePort = course?.marks.find(m => m.type === 'gate-port');
  const gateStbd = course?.marks.find(m => m.type === 'gate-starboard');
  const portMarkX = gatePort?.position.x ?? (target.x - 80);
  const stbdMarkX = gateStbd?.position.x ?? (target.x + 80);
  const gateY = gatePort?.position.y ?? target.y;

  // Chosen mark position
  const chosenMarkX = isPortGate ? portMarkX : stbdMarkX;
  const chosenMark: Vec2 = { x: chosenMarkX, y: gateY };
  const distToChosenMark = distance(boat.position, chosenMark);

  const boatBelowGate = boat.position.y > gateY + 10;
  const boatNearGateLevel = Math.abs(boat.position.y - gateY) < 25;

  // Phase 3: Already below gate and near chosen mark - round outward and up
  if (boatBelowGate && distToChosenMark < 50) {
    // Curve outward and then upward around the mark
    // Port mark: aim to a point LEFT of and ABOVE the mark
    // Stbd mark: aim to a point RIGHT of and ABOVE the mark
    const outwardX = isPortGate ? chosenMarkX - 50 : chosenMarkX + 50;
    const waypoint: Vec2 = { x: outwardX, y: gateY - 60 };
    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // Phase 2: Near gate level, passing between the marks - curve toward chosen mark side
  if (boatNearGateLevel && distToTarget < GATE_APPROACH_DIST) {
    // Aim slightly toward the chosen mark's side then below it
    const biasX = isPortGate ? target.x - 20 : target.x + 20;
    const waypoint: Vec2 = { x: biasX, y: gateY + 30 };
    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // Phase 1: Approaching the gate from above - aim for the center/slightly toward chosen side
  if (distToTarget < GATE_APPROACH_DIST * 1.5) {
    // Aim between the marks with a slight bias toward our chosen mark
    const biasX = isPortGate ? target.x - 15 : target.x + 15;
    const waypoint: Vec2 = { x: biasX, y: gateY + 5 };
    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // Far from gate: sail straight downwind toward the gate center
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
  const avoidRadius = 35;
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < avoidRadius && dist > 0) {
      const away = angleBetween(other.position, boat.position);
      const headingDiff = normalizeDeg(away - boat.heading);
      // Progressively stronger avoidance as boats get closer
      const proximity = (avoidRadius - dist) / avoidRadius;
      const strength = 0.05 + proximity * 0.2;
      boat.heading = normalizeAngle(boat.heading + headingDiff * strength);
    }
  }
}

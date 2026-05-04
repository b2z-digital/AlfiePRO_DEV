import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Close-hauled angle off the true wind (degrees). */
const TACK_ANGLE = 45;

/** Minimum seconds between tacks to avoid thrashing. */
const MIN_TACK_INTERVAL = 2.5;

/** Outer approach zone for windward mark (px). */
const WINDWARD_APPROACH_DIST = 100;

/** Gate approach distance (px). */
const GATE_APPROACH_DIST = 120;

/** Rounding clearance - how far outside the mark boats should pass. */
const ROUNDING_CLEARANCE = 25;

// ---------------------------------------------------------------------------
// Per-boat AI memory
// ---------------------------------------------------------------------------

interface AIState {
  lastTackTime: number;
  preferredSide: 1 | -1;
  initialized: boolean;
  gateChoice: 'port' | 'starboard';
  prevWindDir: number;
  markOffset: number;
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
      markOffset: (Math.random() - 0.5) * 10,
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

/**
 * Return the Vec2 target for the current rounding.
 * 0=pre-start, 1/4=windward, 2/5=offset, 3/6=gate, 7=finish
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
      // Target the chosen gate mark directly so the AI steers toward it.
      // The updateDownwind logic ensures proper through-the-gate-then-around flow.
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

function getCloseHauledHeading(windDir: number, tack: 'starboard' | 'port'): number {
  if (tack === 'starboard') return normalizeAngle(windDir - TACK_ANGLE);
  return normalizeAngle(windDir + TACK_ANGLE);
}

function currentTack(boatHeading: number, windDir: number): 'starboard' | 'port' {
  return getTrueWindAngle(boatHeading, windDir) > 0 ? 'starboard' : 'port';
}

function smoothTurnToward(boat: Boat, desiredHeading: number, _dt: number = 0.016): void {
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 200;
  const maxTurn = turnRate * _dt;
  if (Math.abs(headingDiff) > maxTurn) {
    boat.heading = normalizeAngle(boat.heading + Math.sign(headingDiff) * maxTurn);
  } else {
    boat.heading = normalizeAngle(desiredHeading);
  }
}

function snapHeading(boat: Boat, heading: number): void {
  boat.heading = normalizeAngle(heading);
}

function doTack(boat: Boat, windDir: number, newTack: 'starboard' | 'port'): void {
  boat.heading = getCloseHauledHeading(windDir, newTack);
  boat.isTacking = true;
  boat.tackTimer = 0.6;
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
    state.prevWindDir = wind.direction;
  }

  if (boat.rounding === 0) {
    updatePreStart(boat, course, wind, time, state, allBoats, countdownRemaining ?? 60);
    state.prevWindDir = wind.direction;
    return;
  }

  const target = getTargetForRounding(boat.rounding, course, boat);
  if (!target) return;

  const upwind = isHeadingUpwind(boat.rounding);
  const downwind = isHeadingDownwind(boat.rounding);

  if (upwind) {
    updateUpwind(boat, course, wind, time, state, target);
  } else if (downwind) {
    updateDownwind(boat, course, wind, state, target);
  } else {
    updateReaching(boat, wind, state, target);
  }

  avoidCollisions(boat, allBoats);
  state.prevWindDir = wind.direction;
}

// ---------------------------------------------------------------------------
// Pre-start
// ---------------------------------------------------------------------------

function updatePreStart(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  time: number,
  state: AIState,
  _allBoats: Boat[],
  countdownRemaining: number,
): void {
  const lineCenter: Vec2 = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const halfLineWidth =
    Math.abs(course.startLine.starboard.x - course.startLine.port.x) / 2;

  const aiBoats = _allBoats.filter(b => !b.isPlayer && !b.finished);
  const totalSlots = Math.max(aiBoats.length, 1);
  const lineSpread = halfLineWidth * 1.8;
  const slotWidth = lineSpread / totalSlots;
  const mySlotX = lineCenter.x - lineSpread * 0.5 + state.startSlot * slotWidth + slotWidth * 0.5;

  const dy = boat.position.y - lineCenter.y; // positive = below line
  const dx = boat.position.x - lineCenter.x;

  // Hard boundary: never cross early
  if (dy < 5) {
    snapHeading(boat, 180);
    return;
  }

  // Hard boundary: lateral limits
  if (dx > halfLineWidth * 1.3) {
    smoothTurnToward(boat, 225);
    return;
  }
  if (dx < -halfLineWidth * 1.3) {
    smoothTurnToward(boat, 135);
    return;
  }

  // FINAL 5 SECONDS: Charge the line!
  // Aim at our slot on the line with close-hauled starboard tack.
  if (countdownRemaining <= 5) {
    const targetOnLine: Vec2 = { x: mySlotX, y: lineCenter.y };
    const angleToLine = angleBetween(boat.position, targetOnLine);
    // Use close-hauled heading that's closest to the target direction
    const stbdH = getCloseHauledHeading(wind.direction, 'starboard');
    const portH = getCloseHauledHeading(wind.direction, 'port');
    const stbdDiff = Math.abs(normalizeDeg(angleToLine - stbdH));
    const portDiff = Math.abs(normalizeDeg(angleToLine - portH));

    // If we can point directly at the line (reaching angle), do so
    const twaToLine = Math.abs(getTrueWindAngle(angleToLine, wind.direction));
    if (twaToLine >= TACK_ANGLE - 5) {
      smoothTurnToward(boat, angleToLine);
    } else {
      smoothTurnToward(boat, stbdDiff < portDiff ? stbdH : portH);
    }
    return;
  }

  // PRE-START MANEUVERING: Sail close-hauled patterns below the line.
  // Keep 30-55px below, tacking back and forth near our slot.
  const targetYBelow = 40 + (1 - (boat.skillLevel || 0.85)) * 15;

  // Too close to line: bear away on a reaching course (not dead downwind - too slow)
  if (dy < 20) {
    smoothTurnToward(boat, dx > 0 ? 150 : 210);
    return;
  }

  // Too far below: sail toward our slot position
  if (dy > targetYBelow + 30) {
    const stbdH = getCloseHauledHeading(wind.direction, 'starboard');
    const portH = getCloseHauledHeading(wind.direction, 'port');
    const slotDx = boat.position.x - mySlotX;
    // Pick tack that moves toward slot
    smoothTurnToward(boat, slotDx > 0 ? portH : stbdH);
    return;
  }

  // Normal pattern: tack back and forth near our slot
  const slotDx = boat.position.x - mySlotX;
  const timeSinceTack = time - state.lastTackTime;

  if (timeSinceTack > MIN_TACK_INTERVAL) {
    if (slotDx > slotWidth * 0.6 && state.preferredSide > 0) {
      state.preferredSide = -1;
      state.lastTackTime = time;
    } else if (slotDx < -slotWidth * 0.6 && state.preferredSide < 0) {
      state.preferredSide = 1;
      state.lastTackTime = time;
    }
  }

  const stbdH = getCloseHauledHeading(wind.direction, 'starboard');
  const portH = getCloseHauledHeading(wind.direction, 'port');
  smoothTurnToward(boat, state.preferredSide > 0 ? stbdH : portH);
}

// ---------------------------------------------------------------------------
// Upwind sailing + windward mark rounding
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

  // --- Windward mark port rounding ---
  // Approach from below on starboard tack, pass to the RIGHT of the mark,
  // then bear away once above.
  // Key: waypoints must be at SAILEABLE angles (not dead upwind).

  if (distToTarget < WINDWARD_APPROACH_DIST) {
    const boatAboveMark = boat.position.y < target.y - 3;
    const boatRightOfMark = boat.position.x > target.x;

    // Already above the mark: bear away to port (south-west toward offset)
    if (boatAboveMark) {
      // Head on a broad reach away from the mark toward the offset
      const bearAwayHeading = normalizeAngle(wind.direction + 140);
      smoothTurnToward(boat, bearAwayHeading);
      return;
    }

    // Within 35px: tight rounding - aim just right and above the mark
    // Use a SAILEABLE heading - close-hauled starboard tack passes right of a mark
    // when the mark is upwind-left of the boat.
    if (distToTarget < 35) {
      // We're very close. Sail close-hauled starboard to pass right of the mark.
      const stbdH = getCloseHauledHeading(wind.direction, 'starboard');
      smoothTurnToward(boat, stbdH);
      return;
    }

    // 35-100px: Approach on starboard tack to set up rounding from the right side.
    // If we're to the LEFT of the mark, we need to get to the RIGHT first.
    if (!boatRightOfMark) {
      // Sail starboard tack (heading ~315 with wind from 0) which moves boat right and up
      const stbdH = getCloseHauledHeading(wind.direction, 'starboard');
      smoothTurnToward(boat, stbdH);
      return;
    }

    // Right of mark, approaching: sail close-hauled toward the mark
    // Port tack from the right side will bring us up and left toward the mark
    const portH = getCloseHauledHeading(wind.direction, 'port');
    smoothTurnToward(boat, portH);
    return;
  }

  // --- Open water upwind tacking logic ---
  const tack = currentTack(boat.heading, wind.direction);
  const desiredHeading = getCloseHauledHeading(wind.direction, tack);
  const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - desiredHeading));
  const windShift = normalizeDeg(wind.direction - state.prevWindDir);
  const timeSinceTack = time - state.lastTackTime;
  let shouldTack = false;

  if (timeSinceTack > MIN_TACK_INTERVAL) {
    if (headingDiffToTarget > 80) {
      shouldTack = true;
    }

    if (Math.abs(windShift) > 3 && timeSinceTack > MIN_TACK_INTERVAL + 0.5) {
      const otherTack: 'starboard' | 'port' = tack === 'starboard' ? 'port' : 'starboard';
      const otherHeading = getCloseHauledHeading(wind.direction, otherTack);
      const otherDiffToTarget = Math.abs(normalizeDeg(angleToTarget - otherHeading));
      if (otherDiffToTarget < headingDiffToTarget - 10) {
        shouldTack = true;
      }
    }

    if (timeSinceTack > MIN_TACK_INTERVAL + 1) {
      const otherTack: 'starboard' | 'port' = tack === 'starboard' ? 'port' : 'starboard';
      const otherHeading = getCloseHauledHeading(wind.direction, otherTack);
      const otherDiff = Math.abs(normalizeDeg(angleToTarget - otherHeading));
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

  // Sail close-hauled, or aim directly if target is reachable
  const twaToTarget = Math.abs(getTrueWindAngle(angleToTarget, wind.direction));
  if (twaToTarget >= TACK_ANGLE - 5) {
    smoothTurnToward(boat, angleToTarget);
  } else {
    smoothTurnToward(boat, desiredHeading);
  }
}

// ---------------------------------------------------------------------------
// Downwind sailing + gate rounding
// ---------------------------------------------------------------------------

function updateDownwind(
  boat: Boat,
  course: Course,
  wind: { direction: number; speed: number },
  state: AIState,
  target: Vec2,
): void {
  const isPortGate = state.gateChoice === 'port';

  // Get actual gate mark positions
  const gatePort = course.marks.find(m => m.type === 'gate-port');
  const gateStbd = course.marks.find(m => m.type === 'gate-starboard');
  const portMarkPos = gatePort?.position ?? { x: target.x - 64, y: target.y };
  const stbdMarkPos = gateStbd?.position ?? { x: target.x + 64, y: target.y };
  const gateY = portMarkPos.y;
  const gateCenterX = (portMarkPos.x + stbdMarkPos.x) / 2;

  // Chosen mark the boat will round
  const chosenMark = isPortGate ? portMarkPos : stbdMarkPos;
  const distToChosenMark = distance(boat.position, chosenMark);

  const boatBelowGate = boat.position.y > gateY + 5;

  // PHASE 3: Below gate and near chosen mark - curve OUTWARD and head back up.
  // The boat has passed through the gate and now rounds the mark with clearance.
  if (boatBelowGate && distToChosenMark < 70) {
    // Aim for a point well OUTSIDE and ABOVE the chosen mark
    const outwardX = isPortGate
      ? chosenMark.x - ROUNDING_CLEARANCE * 3
      : chosenMark.x + ROUNDING_CLEARANCE * 3;
    const waypoint: Vec2 = { x: outwardX, y: gateY - 100 };
    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // PHASE 2: Below gate but far from chosen mark - sail toward it to trigger detection
  if (boatBelowGate) {
    const waypoint: Vec2 = { x: chosenMark.x, y: gateY + 20 };
    smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    return;
  }

  // PHASE 1: Above the gate - sail DOWN BETWEEN the marks, biased toward chosen mark.
  // Must pass BETWEEN the marks (not outside), close enough to chosen mark for detection.
  // Aim for a point that is between the marks but 60-70% toward the chosen mark.
  const approachX = gateCenterX + (chosenMark.x - gateCenterX) * 0.6;
  const waypoint: Vec2 = { x: approachX, y: gateY + 20 };
  smoothTurnToward(boat, angleBetween(boat.position, waypoint));
}

// ---------------------------------------------------------------------------
// Reaching legs (to offset mark, roundings 2 and 5)
// ---------------------------------------------------------------------------

function updateReaching(
  boat: Boat,
  wind: { direction: number; speed: number },
  _state: AIState,
  target: Vec2,
): void {
  const distToTarget = distance(boat.position, target);

  // Offset mark: port rounding (pass to RIGHT of mark).
  if (distToTarget < 45) {
    const boatBelowMark = boat.position.y > target.y;

    if (boatBelowMark) {
      // Already below: continue downwind toward gate
      const waypoint: Vec2 = { x: target.x, y: target.y + 80 };
      smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    } else {
      // Above: aim to pass right of the mark, then below
      const waypoint: Vec2 = { x: target.x + ROUNDING_CLEARANCE, y: target.y + 20 };
      smoothTurnToward(boat, angleBetween(boat.position, waypoint));
    }
    return;
  }

  // Aim straight at the offset mark
  smoothTurnToward(boat, angleBetween(boat.position, target));
}

// ---------------------------------------------------------------------------
// Collision avoidance
// ---------------------------------------------------------------------------

function avoidCollisions(boat: Boat, allBoats: Boat[]): void {
  const avoidRadius = 30;
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < avoidRadius && dist > 0) {
      const away = angleBetween(other.position, boat.position);
      const headingDiff = normalizeDeg(away - boat.heading);
      const proximity = (avoidRadius - dist) / avoidRadius;
      const strength = 0.03 + proximity * 0.1;
      boat.heading = normalizeAngle(boat.heading + headingDiff * strength);
    }
  }
}

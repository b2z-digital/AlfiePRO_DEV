import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle, degToRad } from './physics';

const TACK_ANGLE = 45;

interface AIState {
  lastTackTime: number;
  preferredSide: number;
  initialized: boolean;
  gateChoice: 'port' | 'starboard';
  roundingPhase: 'approach' | 'arc' | 'depart';
  roundingWaypoint: Vec2 | null;
  preStartAnchor: Vec2;
}

const aiStates = new Map<string, AIState>();

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      lastTackTime: -10,
      preferredSide: Math.random() > 0.5 ? 1 : -1,
      initialized: false,
      gateChoice: Math.random() > 0.5 ? 'port' : 'starboard',
      roundingPhase: 'approach',
      roundingWaypoint: null,
      preStartAnchor: { ...boat.position },
    });
  }
  return aiStates.get(boat.id)!;
}

export function resetAIStates(): void {
  aiStates.clear();
}

export function getTargetForRounding(rounding: number, course: Course, boat?: Boat): Vec2 | null {
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
      return windward?.position || null;
    case 2:
    case 5:
      return offset?.position || null;
    case 3:
    case 6: {
      if (!boat) {
        if (gatePort && gateStbd) {
          return { x: (gatePort.position.x + gateStbd.position.x) / 2, y: gatePort.position.y };
        }
        return gatePort?.position || null;
      }
      const state = getAIState(boat);
      if (state.gateChoice === 'port' && gatePort) return gatePort.position;
      if (state.gateChoice === 'starboard' && gateStbd) return gateStbd.position;
      return gatePort?.position || gateStbd?.position || null;
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

function getCloseHauledHeading(windDir: number, tack: 'starboard' | 'port'): number {
  const upwindDir = normalizeAngle(windDir + 180);
  if (tack === 'starboard') return normalizeAngle(upwindDir - TACK_ANGLE);
  return normalizeAngle(upwindDir + TACK_ANGLE);
}

function smoothTurnToward(boat: Boat, desiredHeading: number, dt = 0.016): void {
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 180;
  const maxTurn = turnRate * dt;
  if (Math.abs(headingDiff) > maxTurn) {
    boat.heading = normalizeAngle(boat.heading + Math.sign(headingDiff) * maxTurn);
  } else {
    boat.heading = normalizeAngle(desiredHeading);
  }
}

function doTack(boat: Boat, windDir: number, newTack: 'starboard' | 'port'): void {
  boat.heading = getCloseHauledHeading(windDir, newTack);
  boat.isTacking = true;
  boat.tackTimer = 0.6;
}

export function updateAIBoat(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, allBoats: Boat[]): void {
  if (boat.isPlayer || boat.finished) return;
  if (boat.penaltyTurns > 0) return;
  if (boat.isTacking || boat.isGybing) return;

  const state = getAIState(boat);

  if (!state.initialized) {
    state.initialized = true;
    state.preStartAnchor = { ...boat.position };
  }

  // Pre-start behavior: stay near the line
  if (boat.rounding === 0) {
    updatePreStart(boat, course, wind, time, state);
    return;
  }

  const target = getTargetForRounding(boat.rounding, course, boat);
  if (!target) return;

  const headingUpwind = isHeadingUpwind(boat.rounding);
  const headingDownwind = isHeadingDownwind(boat.rounding);

  // Port rounding: when approaching a mark, steer to pass to the RIGHT of it
  // then arc around leaving it on the port (left) side
  if (headingUpwind || boat.rounding === 2 || boat.rounding === 5) {
    updateUpwindOrReaching(boat, course, wind, time, state, target, headingUpwind);
  } else if (headingDownwind) {
    updateDownwind(boat, target, wind);
  } else {
    // Finish leg - aim directly
    smoothTurnToward(boat, angleBetween(boat.position, target));
  }

  // Collision avoidance
  avoidCollisions(boat, allBoats);
}

function updateUpwindOrReaching(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, state: AIState, target: Vec2, isUpwind: boolean): void {
  const distToTarget = distance(boat.position, target);
  const angleToTarget = angleBetween(boat.position, target);

  // Port rounding logic: when close to the mark, steer to pass to the RIGHT
  // then arc around it (leaving mark on port/left side)
  if (distToTarget < 80 && state.roundingPhase === 'approach') {
    // Create a waypoint to the RIGHT of the mark (port rounding)
    // "Right of mark" means: looking from boat toward mark, go to the starboard side
    // For windward mark (top of course), passing to the right means going to the mark's right (higher X)
    const offsetDist = 35;
    // Waypoint: to the right of the mark relative to the wind direction
    // Wind blows TO 180 (south), so upwind is 0 (north). Right of the mark = east = +X
    state.roundingWaypoint = {
      x: target.x + offsetDist,
      y: target.y,
    };
    state.roundingPhase = 'arc';
  }

  if (state.roundingPhase === 'arc' && state.roundingWaypoint) {
    const distToWaypoint = distance(boat.position, state.roundingWaypoint);
    if (distToWaypoint < 25) {
      // Reached the waypoint, now depart - aim for next target
      state.roundingPhase = 'depart';
      state.roundingWaypoint = null;
    } else {
      // Steer toward the waypoint
      smoothTurnToward(boat, angleBetween(boat.position, state.roundingWaypoint));
      return;
    }
  }

  if (state.roundingPhase === 'depart') {
    // Head toward the mark center (which we should now be passing)
    // Once rounding is detected by game loop, this will advance to next target
    smoothTurnToward(boat, angleBetween(boat.position, target));
    // Reset for next mark
    if (distToTarget < 30) {
      state.roundingPhase = 'approach';
    }
    return;
  }

  // Normal upwind tacking logic
  if (isUpwind) {
    const twaToTarget = Math.abs(getTrueWindAngle(angleToTarget, wind.direction));

    if (twaToTarget >= TACK_ANGLE - 5 || distToTarget < 60) {
      smoothTurnToward(boat, angleToTarget);
    } else {
      const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
      const currentTack: 'starboard' | 'port' = currentTwa > 0 ? 'starboard' : 'port';
      const desiredHeading = getCloseHauledHeading(wind.direction, currentTack);
      smoothTurnToward(boat, desiredHeading);

      const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
      if (headingDiffToTarget > 85 && time - state.lastTackTime > 3 + Math.random() * 2) {
        const newTack = currentTack === 'starboard' ? 'port' : 'starboard';
        state.lastTackTime = time;
        doTack(boat, wind.direction, newTack);
      }
    }
  } else {
    // Reaching leg (to offset mark) - aim directly
    smoothTurnToward(boat, angleToTarget);
  }
}

function updateDownwind(boat: Boat, target: Vec2, wind: { direction: number; speed: number }): void {
  // RC boats sail STRAIGHT DOWNWIND - aim directly at target
  const angleToTarget = angleBetween(boat.position, target);
  smoothTurnToward(boat, angleToTarget);
}

function avoidCollisions(boat: Boat, allBoats: Boat[]): void {
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 20 && dist > 0) {
      const away = angleBetween(other.position, boat.position);
      const nudge = normalizeDeg(away - boat.heading) * 0.08;
      boat.heading = normalizeAngle(boat.heading + nudge);
    }
  }
}

function updatePreStart(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, state: AIState): void {
  const lineCenter = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const halfLineWidth = (course.startLine.starboard.x - course.startLine.port.x) / 2;

  // KEY FIX: During pre-start, AI boats sail on REACHING courses (perpendicular to wind)
  // which moves them LATERALLY along the line rather than away from it.
  // Wind is 180 (blows south), so beam reach headings are ~90 (east) or ~270 (west).

  // Containment: keep boats within the start area
  const maxXFromCenter = halfLineWidth * 0.6;
  const maxYBelowLine = 70;
  const minYAboveLine = -10;

  const dx = boat.position.x - lineCenter.x;
  const dy = boat.position.y - lineCenter.y;

  // If too far right, head left (west = ~270)
  if (dx > maxXFromCenter) {
    smoothTurnToward(boat, 270);
    return;
  }
  // If too far left, head right (east = ~90)
  if (dx < -maxXFromCenter) {
    smoothTurnToward(boat, 90);
    return;
  }
  // If above the start line, head down (south = 180)
  if (dy < minYAboveLine) {
    smoothTurnToward(boat, 160 + Math.random() * 40);
    return;
  }
  // If too far below line, head up (north-ish)
  if (dy > maxYBelowLine) {
    smoothTurnToward(boat, 340 + (Math.random() - 0.5) * 40);
    return;
  }

  // Normal pre-start maneuvering: sail on beam reach back and forth
  // Change direction periodically
  const timeSinceTack = time - state.lastTackTime;
  if (timeSinceTack > 2 + Math.random() * 2) {
    state.lastTackTime = time;
    state.preferredSide *= -1;
  }

  // Beam reach: heading 90 (east) or 270 (west) - moves laterally along line
  const targetHeading = state.preferredSide > 0 ? 90 : 270;
  // Add slight upwind bias to keep them drifting toward the line
  const biasedHeading = normalizeAngle(targetHeading + (dy > 30 ? -20 : 10));
  smoothTurnToward(boat, biasedHeading);
}

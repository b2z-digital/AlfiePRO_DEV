import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle, degToRad } from './physics';

const TACK_ANGLE = 45;

interface AIState {
  lastTackTime: number;
  preferredSide: number;
  initialized: boolean;
  gateChoice: 'port' | 'starboard';
  passedMarkRight: boolean;
}

const aiStates = new Map<string, AIState>();

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      lastTackTime: -10,
      preferredSide: Math.random() > 0.5 ? 1 : -1,
      initialized: false,
      gateChoice: Math.random() > 0.5 ? 'port' : 'starboard',
      passedMarkRight: false,
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

function smoothTurnToward(boat: Boat, desiredHeading: number): void {
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 200;
  const maxTurn = turnRate * 0.016;
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

  if (headingUpwind) {
    updateUpwind(boat, course, wind, time, state, target);
  } else if (headingDownwind) {
    // RC boats sail STRAIGHT DOWNWIND - aim directly at gate mark
    smoothTurnToward(boat, angleBetween(boat.position, target));
  } else {
    // Reaching (offset mark leg, rounding 2/5) - aim directly at target
    smoothTurnToward(boat, angleBetween(boat.position, target));
  }

  // Collision avoidance
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

function updateUpwind(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, state: AIState, target: Vec2): void {
  const distToTarget = distance(boat.position, target);
  const angleToTarget = angleBetween(boat.position, target);
  const twaToTarget = Math.abs(getTrueWindAngle(angleToTarget, wind.direction));

  // When close to the mark, steer to pass to the RIGHT of it (port rounding)
  // This means aiming for a point to the right (east) of the mark
  if (distToTarget < 70) {
    // Aim for a waypoint to the RIGHT of the mark
    const waypointX = target.x + 30;
    const waypointY = target.y;
    const angleToWaypoint = angleBetween(boat.position, { x: waypointX, y: waypointY });
    smoothTurnToward(boat, angleToWaypoint);
    state.passedMarkRight = false;
    return;
  }

  // Normal upwind tacking
  if (twaToTarget >= TACK_ANGLE - 5 || distToTarget < 80) {
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
}

function updatePreStart(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, state: AIState): void {
  const lineCenter = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const halfLineWidth = (course.startLine.starboard.x - course.startLine.port.x) / 2;

  // TIGHT containment: boats must stay within a small box near the start line
  const maxXFromCenter = halfLineWidth * 0.55;
  const maxYBelow = 35; // maximum distance below the line
  const minYAbove = -5; // don't go above the line

  const dx = boat.position.x - lineCenter.x;
  const dy = boat.position.y - lineCenter.y;

  // Hard boundaries: if boat is outside, forcibly point it back
  if (dx > maxXFromCenter) {
    // Too far right - aim left-ish (port tack = NE = heading 45 for wind 180)
    boat.heading = normalizeAngle(getCloseHauledHeading(wind.direction, 'port'));
    return;
  }
  if (dx < -maxXFromCenter) {
    // Too far left - aim right-ish (starboard tack = NW = heading 315 for wind 180)
    boat.heading = normalizeAngle(getCloseHauledHeading(wind.direction, 'starboard'));
    return;
  }
  if (dy < minYAbove) {
    // Above the line - head downwind to get back below
    boat.heading = normalizeAngle(wind.direction + (Math.random() - 0.5) * 30);
    return;
  }
  if (dy > maxYBelow) {
    // Too far below - head upwind
    boat.heading = getCloseHauledHeading(wind.direction, state.preferredSide > 0 ? 'starboard' : 'port');
    return;
  }

  // Within bounds: sail close-hauled, tacking frequently to stay contained
  const timeSinceTack = time - state.lastTackTime;
  const tackInterval = 1.5 + Math.random() * 1.5;

  if (timeSinceTack > tackInterval) {
    state.lastTackTime = time;
    state.preferredSide *= -1;
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
    const onStarboard = currentTwa > 0;
    const newTack: 'starboard' | 'port' = onStarboard ? 'port' : 'starboard';
    doTack(boat, wind.direction, newTack);
    return;
  }

  // Sail close-hauled on current tack
  const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
  const onStarboard = currentTwa > 0;
  const desiredHeading = getCloseHauledHeading(wind.direction, onStarboard ? 'starboard' : 'port');
  smoothTurnToward(boat, desiredHeading);
}

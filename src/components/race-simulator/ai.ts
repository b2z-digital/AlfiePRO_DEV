import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

const TACK_ANGLE = 45;
const GYBE_ANGLE = 145;

interface AIState {
  lastTackTime: number;
  preferredSide: number;
  initialized: boolean;
}

const aiStates = new Map<string, AIState>();

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      lastTackTime: -10,
      preferredSide: Math.random() > 0.5 ? 1 : -1,
      initialized: false,
    });
  }
  return aiStates.get(boat.id)!;
}

export function resetAIStates(): void {
  aiStates.clear();
}

export function getTargetForRounding(rounding: number, course: Course): Vec2 | null {
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
    case 6:
      if (gatePort && gateStbd) {
        return { x: (gatePort.position.x + gateStbd.position.x) / 2, y: gatePort.position.y };
      }
      return gatePort?.position || null;
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
  if (tack === 'starboard') {
    return normalizeAngle(upwindDir + TACK_ANGLE);
  }
  return normalizeAngle(upwindDir - TACK_ANGLE);
}

function getDownwindHeading(windDir: number, gybe: 'starboard' | 'port'): number {
  if (gybe === 'starboard') {
    return normalizeAngle(windDir + GYBE_ANGLE);
  }
  return normalizeAngle(windDir - GYBE_ANGLE);
}

function smoothTurnToward(boat: Boat, desiredHeading: number): void {
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 120;
  const maxTurn = turnRate * 0.016;
  if (Math.abs(headingDiff) > maxTurn) {
    boat.heading = normalizeAngle(boat.heading + Math.sign(headingDiff) * maxTurn);
  } else {
    boat.heading = normalizeAngle(desiredHeading);
  }
}

export function updateAIBoat(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, allBoats: Boat[]): void {
  if (boat.isPlayer || boat.finished || boat.isTacking || boat.isGybing) return;

  // Never let AI spin with penalty turns
  if (boat.penaltyTurns > 0) {
    boat.penaltyTurns = 0;
  }

  const state = getAIState(boat);

  // On first update, ensure boat is on a valid heading (not in irons)
  if (!state.initialized) {
    state.initialized = true;
    const currentTwa = Math.abs(getTrueWindAngle(boat.heading, wind.direction));
    if (currentTwa < TACK_ANGLE - 5) {
      boat.heading = getCloseHauledHeading(wind.direction, state.preferredSide > 0 ? 'starboard' : 'port');
    }
  }

  // Pre-start behavior: sail back and forth near the start line
  if (boat.rounding === 0) {
    updatePreStart(boat, course, wind, time, state);
    return;
  }

  const target = getTargetForRounding(boat.rounding, course);
  if (!target) return;

  const angleToTarget = angleBetween(boat.position, target);
  const distToTarget = distance(boat.position, target);
  const twaToTarget = getTrueWindAngle(angleToTarget, wind.direction);
  const absTwaToTarget = Math.abs(twaToTarget);

  const headingUpwind = isHeadingUpwind(boat.rounding);
  const headingDownwind = isHeadingDownwind(boat.rounding);

  let desiredHeading: number;

  if (headingUpwind && absTwaToTarget < 55) {
    // Beat upwind - sail close-hauled and tack toward the mark
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
    const currentTack: 'starboard' | 'port' = currentTwa > 0 ? 'starboard' : 'port';

    const stbdHeading = getCloseHauledHeading(wind.direction, 'starboard');
    const portHeading = getCloseHauledHeading(wind.direction, 'port');

    // Check if on layline (can fetch the mark directly)
    const onLayline = absTwaToTarget >= TACK_ANGLE - 8 && distToTarget < 100;

    if (onLayline || distToTarget < 25) {
      desiredHeading = angleToTarget;
      const dTwa = Math.abs(getTrueWindAngle(desiredHeading, wind.direction));
      if (dTwa < TACK_ANGLE - 3) {
        desiredHeading = currentTack === 'starboard' ? stbdHeading : portHeading;
      }
    } else {
      desiredHeading = currentTack === 'starboard' ? stbdHeading : portHeading;

      // Should we tack? (sailing too far away from the mark bearing)
      const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
      const minTackInterval = 4 + Math.random() * 2;
      if (headingDiffToTarget > 80 && time - state.lastTackTime > minTackInterval) {
        desiredHeading = currentTack === 'starboard' ? portHeading : stbdHeading;
        state.lastTackTime = time;
        boat.isTacking = true;
        boat.tackTimer = 1.2;
        return;
      }
    }
  } else if (headingDownwind && absTwaToTarget > 130) {
    // Run downwind with gybing angles
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
    const currentGybe: 'starboard' | 'port' = currentTwa > 0 ? 'starboard' : 'port';

    const stbdHeading = getDownwindHeading(wind.direction, 'starboard');
    const portHeading = getDownwindHeading(wind.direction, 'port');

    desiredHeading = currentGybe === 'starboard' ? stbdHeading : portHeading;

    // Should we gybe?
    const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
    if (headingDiffToTarget > 55 && time - state.lastTackTime > 3.5 + Math.random() * 2) {
      desiredHeading = currentGybe === 'starboard' ? portHeading : stbdHeading;
      state.lastTackTime = time;
      boat.isGybing = true;
      boat.tackTimer = 0.8;
      return;
    }
  } else {
    // Reaching - aim directly at target
    desiredHeading = angleToTarget;
    const dTwa = Math.abs(getTrueWindAngle(desiredHeading, wind.direction));
    if (dTwa < TACK_ANGLE - 3) {
      const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
      desiredHeading = currentTwa > 0
        ? getCloseHauledHeading(wind.direction, 'starboard')
        : getCloseHauledHeading(wind.direction, 'port');
    }
  }

  smoothTurnToward(boat, desiredHeading);

  // Minimal collision avoidance (only very close)
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 12) {
      const away = angleBetween(other.position, boat.position);
      boat.heading = normalizeAngle(boat.heading + normalizeDeg(away - boat.heading) * 0.02);
    }
  }
}

function updatePreStart(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, state: AIState): void {
  const lineCenter = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const lineWidth = course.startLine.starboard.x - course.startLine.port.x;

  // If boat drifted above the start line, turn back down
  if (boat.position.y < lineCenter.y - 5) {
    const downwindHeading = normalizeAngle(wind.direction + 30 * state.preferredSide);
    smoothTurnToward(boat, downwindHeading);
    return;
  }

  // If too far below the line area, head back up
  if (boat.position.y > lineCenter.y + 120) {
    const upwindHeading = getCloseHauledHeading(wind.direction, state.preferredSide > 0 ? 'starboard' : 'port');
    smoothTurnToward(boat, upwindHeading);
    return;
  }

  // If too far from center laterally, turn back
  const distFromCenter = boat.position.x - lineCenter.x;
  if (Math.abs(distFromCenter) > lineWidth * 0.55) {
    const targetHeading = distFromCenter > 0
      ? getCloseHauledHeading(wind.direction, 'port')
      : getCloseHauledHeading(wind.direction, 'starboard');
    smoothTurnToward(boat, targetHeading);

    if (time - state.lastTackTime > 3) {
      state.lastTackTime = time;
      boat.isTacking = true;
      boat.tackTimer = 1.0;
    }
    return;
  }

  // Normal pre-start: sail close-hauled on current tack, periodically tack
  const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
  const onStarboard = currentTwa > 0;

  const timeSinceTack = time - state.lastTackTime;
  if (timeSinceTack > 5 + Math.random() * 4) {
    state.lastTackTime = time;
    state.preferredSide *= -1;
    boat.isTacking = true;
    boat.tackTimer = 1.0;
    return;
  }

  const desiredHeading = getCloseHauledHeading(wind.direction, onStarboard ? 'starboard' : 'port');
  smoothTurnToward(boat, desiredHeading);
}

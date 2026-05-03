import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

const TACK_ANGLE = 45;

interface AIState {
  lastTackTime: number;
  preferredSide: number;
  initialized: boolean;
  gateChoice: 'port' | 'starboard';
  roundingPhase: 'approach' | 'rounding' | 'depart';
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
      if (state.gateChoice === 'port' && gatePort) {
        return gatePort.position;
      }
      if (state.gateChoice === 'starboard' && gateStbd) {
        return gateStbd.position;
      }
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
  if (tack === 'starboard') {
    return normalizeAngle(upwindDir - TACK_ANGLE);
  }
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

  if (boat.penaltyTurns > 0) {
    boat.penaltyTurns = 0;
  }

  if (boat.isTacking || boat.isGybing) return;

  const state = getAIState(boat);

  if (!state.initialized) {
    state.initialized = true;
    const currentTwa = Math.abs(getTrueWindAngle(boat.heading, wind.direction));
    if (currentTwa < TACK_ANGLE - 5) {
      boat.heading = getCloseHauledHeading(wind.direction, state.preferredSide > 0 ? 'starboard' : 'port');
    }
  }

  // Pre-start behavior
  if (boat.rounding === 0) {
    updatePreStart(boat, course, wind, time, state);
    return;
  }

  const target = getTargetForRounding(boat.rounding, course, boat);
  if (!target) return;

  const angleToTarget = angleBetween(boat.position, target);
  const distToTarget = distance(boat.position, target);

  const headingUpwind = isHeadingUpwind(boat.rounding);
  const headingDownwind = isHeadingDownwind(boat.rounding);

  let desiredHeading: number;

  if (headingUpwind) {
    // Upwind: tack toward the mark
    const twaToTarget = Math.abs(getTrueWindAngle(angleToTarget, wind.direction));

    if (twaToTarget >= TACK_ANGLE - 5 || distToTarget < 50) {
      // Can lay the mark or very close - aim directly
      desiredHeading = angleToTarget;
    } else {
      // Need to tack - sail close-hauled
      const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
      const currentTack: 'starboard' | 'port' = currentTwa > 0 ? 'starboard' : 'port';
      desiredHeading = getCloseHauledHeading(wind.direction, currentTack);

      // Tack when sailing too far from mark bearing
      const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
      if (headingDiffToTarget > 85 && time - state.lastTackTime > 3 + Math.random() * 2) {
        const newTack = currentTack === 'starboard' ? 'port' : 'starboard';
        state.lastTackTime = time;
        doTack(boat, wind.direction, newTack);
        return;
      }
    }
  } else if (headingDownwind) {
    // Downwind: RC boats sail STRAIGHT at the target (dead downwind or near it)
    // Aim directly at the gate mark they chose
    desiredHeading = angleToTarget;
  } else {
    // Reaching (offset mark leg) - aim directly at target
    desiredHeading = angleToTarget;
  }

  smoothTurnToward(boat, desiredHeading);

  // Collision avoidance
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 15) {
      const away = angleBetween(other.position, boat.position);
      boat.heading = normalizeAngle(boat.heading + normalizeDeg(away - boat.heading) * 0.05);
    }
  }
}

function updatePreStart(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, state: AIState): void {
  const lineCenter = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const halfLineWidth = (course.startLine.starboard.x - course.startLine.port.x) / 2;

  // HARD boundary: if boat goes past the start line endpoints laterally, force turn back
  const distFromCenter = boat.position.x - lineCenter.x;
  if (distFromCenter > halfLineWidth * 0.7) {
    // Too far right - head port tack (NE heading points left)
    smoothTurnToward(boat, getCloseHauledHeading(wind.direction, 'port'));
    if (time - state.lastTackTime > 1) {
      state.lastTackTime = time;
    }
    return;
  }
  if (distFromCenter < -halfLineWidth * 0.7) {
    // Too far left - head starboard tack (NW heading points right)
    smoothTurnToward(boat, getCloseHauledHeading(wind.direction, 'starboard'));
    if (time - state.lastTackTime > 1) {
      state.lastTackTime = time;
    }
    return;
  }

  // If above the start line, bear away
  if (boat.position.y < lineCenter.y - 5) {
    smoothTurnToward(boat, wind.direction);
    return;
  }

  // If too far below line, head upwind
  if (boat.position.y > lineCenter.y + 80) {
    smoothTurnToward(boat, getCloseHauledHeading(wind.direction, state.preferredSide > 0 ? 'starboard' : 'port'));
    return;
  }

  // Normal pre-start: short tacks near the line
  const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
  const onStarboard = currentTwa > 0;

  const timeSinceTack = time - state.lastTackTime;
  // Very short tack intervals to keep boats contained
  if (timeSinceTack > 1.5 + Math.random() * 1.5) {
    state.lastTackTime = time;
    state.preferredSide *= -1;
    const newTack: 'starboard' | 'port' = onStarboard ? 'port' : 'starboard';
    doTack(boat, wind.direction, newTack);
    return;
  }

  const desiredHeading = getCloseHauledHeading(wind.direction, onStarboard ? 'starboard' : 'port');
  smoothTurnToward(boat, desiredHeading);
}

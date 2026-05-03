import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

const TACK_ANGLE = 45;
const GYBE_ANGLE = 145;

interface AIState {
  lastTackTime: number;
  preferredSide: number; // -1 left, 1 right
}

const aiStates = new Map<string, AIState>();

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      lastTackTime: -10,
      preferredSide: Math.random() > 0.5 ? 1 : -1,
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
    case 0: // pre-start, hold position near start line
      return {
        x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
        y: course.startLine.port.y + 10,
      };
    case 1: // windward mark (lap 1)
    case 4: // windward mark (lap 2)
      return windward?.position || null;
    case 2: // offset mark (lap 1)
    case 5: // offset mark (lap 2)
      return offset?.position || null;
    case 3: // gate (lap 1)
    case 6: // gate (lap 2)
      // Aim between gate marks
      if (gatePort && gateStbd) {
        return { x: (gatePort.position.x + gateStbd.position.x) / 2, y: gatePort.position.y };
      }
      return gatePort?.position || null;
    case 7: // finish line
      return {
        x: (course.finishLine.port.x + course.finishLine.starboard.x) / 2,
        y: course.finishLine.port.y,
      };
    default:
      return null;
  }
}

export function isHeadingUpwind(rounding: number): boolean {
  return rounding === 1 || rounding === 4;
}

export function isHeadingDownwind(rounding: number): boolean {
  return rounding === 3 || rounding === 6;
}

export function updateAIBoat(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, allBoats: Boat[]): void {
  if (boat.isPlayer || boat.finished || boat.isTacking || boat.isGybing) return;
  if (boat.penaltyTurns > 0) return;

  const state = getAIState(boat);
  const target = getTargetForRounding(boat.rounding, course);
  if (!target) return;

  const angleToTarget = angleBetween(boat.position, target);
  const twa = getTrueWindAngle(angleToTarget, wind.direction);
  const absTwa = Math.abs(twa);
  const distToTarget = distance(boat.position, target);

  const headingUpwind = isHeadingUpwind(boat.rounding);
  const headingDownwind = isHeadingDownwind(boat.rounding);

  let desiredHeading: number;

  if (headingUpwind && absTwa < 55) {
    // Beating - need to tack
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);

    // Are we on the layline?
    const bearingToMark = angleBetween(boat.position, target);
    const twaToMark = Math.abs(getTrueWindAngle(bearingToMark, wind.direction));
    const onLayline = twaToMark >= TACK_ANGLE - 5 && distToTarget < 120;

    if (onLayline || distToTarget < 40) {
      // Point at the mark (clamped to close-hauled)
      desiredHeading = angleToTarget;
      const dTwa = Math.abs(getTrueWindAngle(desiredHeading, wind.direction));
      if (dTwa < TACK_ANGLE) {
        if (currentTwa > 0) {
          desiredHeading = normalizeAngle(wind.direction + 180 + TACK_ANGLE);
        } else {
          desiredHeading = normalizeAngle(wind.direction + 180 - TACK_ANGLE);
        }
      }
    } else {
      // Sail close-hauled
      if (currentTwa > 0) {
        desiredHeading = normalizeAngle(wind.direction + 180 + TACK_ANGLE);
      } else {
        desiredHeading = normalizeAngle(wind.direction + 180 - TACK_ANGLE);
      }

      // Decide to tack if we're heading away from the mark
      const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
      const minTackInterval = 6 + Math.random() * 4;
      if (headingDiffToTarget > 100 && time - state.lastTackTime > minTackInterval) {
        // Tack
        if (currentTwa > 0) {
          desiredHeading = normalizeAngle(wind.direction + 180 - TACK_ANGLE);
        } else {
          desiredHeading = normalizeAngle(wind.direction + 180 + TACK_ANGLE);
        }
        state.lastTackTime = time;
        boat.isTacking = true;
        boat.tackTimer = 1.5;
        return;
      }
    }
  } else if (headingDownwind && absTwa > 120) {
    // Running - need to gybe
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);

    if (currentTwa > 0) {
      desiredHeading = normalizeAngle(wind.direction + GYBE_ANGLE);
    } else {
      desiredHeading = normalizeAngle(wind.direction - GYBE_ANGLE);
    }

    // Gybe toward target if heading away
    const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
    if (headingDiffToTarget > 70 && time - state.lastTackTime > 5 + Math.random() * 3) {
      if (currentTwa > 0) {
        desiredHeading = normalizeAngle(wind.direction - GYBE_ANGLE);
      } else {
        desiredHeading = normalizeAngle(wind.direction + GYBE_ANGLE);
      }
      state.lastTackTime = time;
      boat.isGybing = true;
      boat.tackTimer = 1.0;
      return;
    }
  } else {
    // Reaching or close enough to target - just aim at it
    desiredHeading = angleToTarget;

    // Clamp to not sail in no-go zone
    const dTwa = Math.abs(getTrueWindAngle(desiredHeading, wind.direction));
    if (dTwa < TACK_ANGLE) {
      const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
      if (currentTwa > 0) {
        desiredHeading = normalizeAngle(wind.direction + 180 + TACK_ANGLE);
      } else {
        desiredHeading = normalizeAngle(wind.direction + 180 - TACK_ANGLE);
      }
    }
  }

  // Smooth heading change
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 60;
  const maxTurn = turnRate * 0.016;
  if (Math.abs(headingDiff) > maxTurn) {
    boat.heading = normalizeAngle(boat.heading + Math.sign(headingDiff) * maxTurn);
  } else {
    boat.heading = desiredHeading;
  }

  // Small random variation for natural movement
  boat.heading = normalizeAngle(boat.heading + (Math.random() - 0.5) * 0.3);

  // Collision avoidance
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 18) {
      const away = angleBetween(other.position, boat.position);
      boat.heading = normalizeAngle(boat.heading + normalizeDeg(away - boat.heading) * 0.08);
    }
  }
}

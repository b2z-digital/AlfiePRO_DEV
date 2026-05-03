import { Boat, Course, Wind, Mark } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle, getBoatSpeed, degToRad, getTack } from './physics';

const TACK_ANGLE = 45; // degrees off the wind for close-hauled
const GYBE_ANGLE = 150; // degrees off the wind for running

interface AIState {
  targetMark: number;
  laylineReached: boolean;
  tackCount: number;
  lastTackTime: number;
}

const aiStates = new Map<string, AIState>();

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      targetMark: 1,
      laylineReached: false,
      tackCount: 0,
      lastTackTime: 0,
    });
  }
  return aiStates.get(boat.id)!;
}

export function resetAIStates(): void {
  aiStates.clear();
}

function getTargetPosition(boat: Boat, course: Course): { x: number; y: number } | null {
  const state = getAIState(boat);

  if (boat.rounding === 0) {
    // Heading to start - aim for middle of start line
    return {
      x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
      y: (course.startLine.port.y + course.startLine.starboard.y) / 2,
    };
  }

  if (boat.rounding === 1) {
    // Heading to windward mark
    return course.marks.find(m => m.type === 'windward')?.position || null;
  }

  if (boat.rounding === 2) {
    // Heading to leeward mark/gate
    const leewardMark = course.marks.find(m => m.type === 'leeward' || m.type === 'gate-port');
    return leewardMark?.position || null;
  }

  if (boat.rounding >= 3) {
    // Heading to finish
    return {
      x: (course.finishLine.port.x + course.finishLine.starboard.x) / 2,
      y: (course.finishLine.port.y + course.finishLine.starboard.y) / 2,
    };
  }

  return null;
}

export function updateAIBoat(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, allBoats: Boat[]): void {
  if (boat.isPlayer || boat.finished || boat.isTacking || boat.isGybing) return;
  if (boat.penaltyTurns > 0) return;

  const state = getAIState(boat);
  const target = getTargetPosition(boat, course);
  if (!target) return;

  const angleToTarget = angleBetween(boat.position, target);
  const twa = getTrueWindAngle(angleToTarget, wind.direction);
  const absTwa = Math.abs(twa);

  // Determine if we're beating or running
  const isBeating = absTwa < 60;
  const isRunning = absTwa > 130;

  let desiredHeading: number;

  if (isBeating) {
    // Sail close-hauled and tack toward the mark
    const distToTarget = distance(boat.position, target);
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);

    // Calculate laylines
    const laylineAnglePort = normalizeAngle(wind.direction + 180 - TACK_ANGLE);
    const laylineAngleStbd = normalizeAngle(wind.direction + 180 + TACK_ANGLE);

    // Check if we're on the layline (close enough to fetch the mark)
    const bearingToMark = angleBetween(boat.position, target);
    const diffPort = Math.abs(normalizeDeg(bearingToMark - laylineAnglePort));
    const diffStbd = Math.abs(normalizeDeg(bearingToMark - laylineAngleStbd));

    const onLayline = diffPort < 10 || diffStbd < 10;

    if (onLayline || distToTarget < 50) {
      // On layline or close to mark - point at it
      desiredHeading = angleToTarget;
      // But still can't sail directly into wind
      const desiredTwa = Math.abs(getTrueWindAngle(desiredHeading, wind.direction));
      if (desiredTwa < TACK_ANGLE) {
        // Round up to close-hauled on the correct tack
        if (twa > 0) {
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

      // Decide if we should tack
      const headingDiff = Math.abs(normalizeDeg(angleToTarget - boat.heading));
      const shouldTack = headingDiff > 100 && time - state.lastTackTime > 8 + Math.random() * 5;

      if (shouldTack) {
        // Tack
        if (currentTwa > 0) {
          desiredHeading = normalizeAngle(wind.direction + 180 - TACK_ANGLE);
        } else {
          desiredHeading = normalizeAngle(wind.direction + 180 + TACK_ANGLE);
        }
        state.lastTackTime = time;
        state.tackCount++;
        boat.isTacking = true;
        boat.tackTimer = 1.5;
        return;
      }
    }
  } else if (isRunning) {
    // Sail at optimal downwind angle and gybe
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);

    if (currentTwa > 0) {
      desiredHeading = normalizeAngle(wind.direction + GYBE_ANGLE);
    } else {
      desiredHeading = normalizeAngle(wind.direction - GYBE_ANGLE);
    }

    // Check if we should gybe to get closer to target
    const headingDiff = Math.abs(normalizeDeg(angleToTarget - boat.heading));
    if (headingDiff > 80 && time - state.lastTackTime > 6 + Math.random() * 4) {
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
    // Reaching - sail directly at target (adjusted for no-go zone)
    desiredHeading = angleToTarget;
  }

  // Smooth heading change
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 45; // degrees per second
  const maxTurn = turnRate * 0.016; // per frame
  if (Math.abs(headingDiff) > maxTurn) {
    boat.heading = normalizeAngle(boat.heading + Math.sign(headingDiff) * maxTurn);
  } else {
    boat.heading = desiredHeading;
  }

  // Add some randomness for variety
  boat.heading = normalizeAngle(boat.heading + (Math.random() - 0.5) * 0.5);

  // Avoid collisions with other boats
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 20) {
      const away = angleBetween(other.position, boat.position);
      boat.heading = normalizeAngle(boat.heading + normalizeDeg(away - boat.heading) * 0.1);
    }
  }
}

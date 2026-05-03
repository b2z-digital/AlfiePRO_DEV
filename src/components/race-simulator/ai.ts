import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

const TACK_ANGLE = 45;
const GYBE_ANGLE = 145;

interface AIState {
  lastTackTime: number;
  preferredSide: number; // -1 left, 1 right
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
    case 0: // pre-start: hold near start line
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
  return rounding === 1 || rounding === 4 || rounding === 7;
}

export function isHeadingDownwind(rounding: number): boolean {
  return rounding === 3 || rounding === 6;
}

function getCloseHauledHeading(wind: { direction: number }, tack: 'starboard' | 'port'): number {
  // wind.direction = direction wind blows TO
  // upwind = opposite of wind direction
  const upwindDir = normalizeAngle(wind.direction + 180);
  if (tack === 'starboard') {
    return normalizeAngle(upwindDir + TACK_ANGLE);
  }
  return normalizeAngle(upwindDir - TACK_ANGLE);
}

function getDownwindHeading(wind: { direction: number }, gybe: 'starboard' | 'port'): number {
  if (gybe === 'starboard') {
    return normalizeAngle(wind.direction + GYBE_ANGLE);
  }
  return normalizeAngle(wind.direction - GYBE_ANGLE);
}

export function updateAIBoat(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, allBoats: Boat[]): void {
  if (boat.isPlayer || boat.finished || boat.isTacking || boat.isGybing) return;
  if (boat.penaltyTurns > 0) return;

  const state = getAIState(boat);
  const target = getTargetForRounding(boat.rounding, course);
  if (!target) return;

  // On first update, immediately set a valid heading so boats don't start in irons
  if (!state.initialized) {
    state.initialized = true;
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
    const absTwa = Math.abs(currentTwa);
    if (absTwa < TACK_ANGLE - 5) {
      // Boat is in irons - set to close-hauled immediately
      boat.heading = getCloseHauledHeading(wind, state.preferredSide > 0 ? 'starboard' : 'port');
    }
  }

  const angleToTarget = angleBetween(boat.position, target);
  const distToTarget = distance(boat.position, target);

  // What would TWA be if we could point directly at the target?
  const twaToTarget = getTrueWindAngle(angleToTarget, wind.direction);
  const absTwaToTarget = Math.abs(twaToTarget);

  const headingUpwind = isHeadingUpwind(boat.rounding);
  const headingDownwind = isHeadingDownwind(boat.rounding);

  let desiredHeading: number;

  if (headingUpwind && absTwaToTarget < 55) {
    // Target is upwind - need to beat/tack
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
    const currentTack: 'starboard' | 'port' = currentTwa > 0 ? 'starboard' : 'port';

    const stbdHeading = getCloseHauledHeading(wind, 'starboard');
    const portHeading = getCloseHauledHeading(wind, 'port');

    // Check if we're on the layline (can fetch the mark)
    const onLayline = absTwaToTarget >= TACK_ANGLE - 8 && distToTarget < 100;

    if (onLayline || distToTarget < 25) {
      // Try to point at the mark directly
      desiredHeading = angleToTarget;
      const dTwa = Math.abs(getTrueWindAngle(desiredHeading, wind.direction));
      if (dTwa < TACK_ANGLE - 3) {
        desiredHeading = currentTack === 'starboard' ? stbdHeading : portHeading;
      }
    } else {
      // Sail close-hauled on current tack
      desiredHeading = currentTack === 'starboard' ? stbdHeading : portHeading;

      // Check if we should tack (sailing too far from the mark bearing)
      const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
      const minTackInterval = 5 + Math.random() * 3;
      if (headingDiffToTarget > 85 && time - state.lastTackTime > minTackInterval) {
        // Tack to the other side
        desiredHeading = currentTack === 'starboard' ? portHeading : stbdHeading;
        state.lastTackTime = time;
        boat.isTacking = true;
        boat.tackTimer = 1.5;
        return;
      }
    }
  } else if (headingDownwind && absTwaToTarget > 130) {
    // Target is downwind - need to run/gybe
    const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
    const currentGybe: 'starboard' | 'port' = currentTwa > 0 ? 'starboard' : 'port';

    const stbdHeading = getDownwindHeading(wind, 'starboard');
    const portHeading = getDownwindHeading(wind, 'port');

    desiredHeading = currentGybe === 'starboard' ? stbdHeading : portHeading;

    // Check if we should gybe
    const headingDiffToTarget = Math.abs(normalizeDeg(angleToTarget - boat.heading));
    if (headingDiffToTarget > 60 && time - state.lastTackTime > 4 + Math.random() * 3) {
      desiredHeading = currentGybe === 'starboard' ? portHeading : stbdHeading;
      state.lastTackTime = time;
      boat.isGybing = true;
      boat.tackTimer = 1.0;
      return;
    }
  } else {
    // Reaching or target is reachable directly - just aim at it
    desiredHeading = angleToTarget;

    // Clamp to avoid no-go zone
    const dTwa = Math.abs(getTrueWindAngle(desiredHeading, wind.direction));
    if (dTwa < TACK_ANGLE - 3) {
      const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
      desiredHeading = currentTwa > 0
        ? getCloseHauledHeading(wind, 'starboard')
        : getCloseHauledHeading(wind, 'port');
    }
  }

  // Smooth heading change - faster turn rate for responsiveness
  const headingDiff = normalizeDeg(desiredHeading - boat.heading);
  const turnRate = 90;
  const maxTurn = turnRate * 0.016;
  if (Math.abs(headingDiff) > maxTurn) {
    boat.heading = normalizeAngle(boat.heading + Math.sign(headingDiff) * maxTurn);
  } else {
    boat.heading = desiredHeading;
  }

  // Minimal random variation
  boat.heading = normalizeAngle(boat.heading + (Math.random() - 0.5) * 0.1);

  // Gentle collision avoidance (only very close boats)
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 10) {
      const away = angleBetween(other.position, boat.position);
      boat.heading = normalizeAngle(boat.heading + normalizeDeg(away - boat.heading) * 0.03);
    }
  }
}

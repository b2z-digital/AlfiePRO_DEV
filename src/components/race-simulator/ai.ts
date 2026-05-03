import { Boat, Course, Vec2 } from './types';
import { normalizeAngle, normalizeDeg, distance, angleBetween, getTrueWindAngle } from './physics';

const TACK_ANGLE = 45;

interface AIState {
  lastTackTime: number;
  preferredSide: number; // -1 or 1
  initialized: boolean;
  gateChoice: 'port' | 'starboard'; // which gate mark to round
}

const aiStates = new Map<string, AIState>();

function getAIState(boat: Boat): AIState {
  if (!aiStates.has(boat.id)) {
    aiStates.set(boat.id, {
      lastTackTime: 0,
      preferredSide: Math.random() > 0.5 ? 1 : -1,
      initialized: false,
      gateChoice: Math.random() > 0.5 ? 'port' : 'starboard',
    });
  }
  return aiStates.get(boat.id)!;
}

export function resetAIStates(): void {
  aiStates.clear();
}

// For port rounding, the boat must pass to the RIGHT of the mark (mark on port/left side).
// We create an offset waypoint that routes the boat around the mark properly.
function getPortRoundingWaypoint(markPos: Vec2, approachFrom: 'below' | 'above', course: Course): Vec2 {
  const roundingOffset = 30;
  if (approachFrom === 'below') {
    // Approaching from below (going upwind), go to the RIGHT side of the mark, then turn left after
    return { x: markPos.x + roundingOffset, y: markPos.y };
  }
  // Approaching from above (going downwind), go to the RIGHT side of the mark, then turn left after
  return { x: markPos.x + roundingOffset, y: markPos.y };
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
      // Windward mark - port rounding means leave mark to port (pass on RIGHT side)
      if (windward && boat) {
        const dist = distance(boat.position, windward.position);
        if (dist < 60) {
          // Close to mark - aim for the rounding waypoint (right side of mark)
          return { x: windward.position.x + 25, y: windward.position.y + 10 };
        }
      }
      return windward?.position || null;
    case 2:
    case 5:
      // Offset mark - port rounding (leave mark to port, pass on right)
      if (offset && boat) {
        const dist = distance(boat.position, offset.position);
        if (dist < 50) {
          return { x: offset.position.x + 20, y: offset.position.y + 10 };
        }
      }
      return offset?.position || null;
    case 3:
    case 6: {
      // Gate - choose one mark and round it to port
      if (!boat) {
        if (gatePort && gateStbd) {
          return { x: (gatePort.position.x + gateStbd.position.x) / 2, y: gatePort.position.y };
        }
        return gatePort?.position || null;
      }
      const state = getAIState(boat);
      // Port gate mark: round it by passing on its right side (boat goes between the marks)
      // Starboard gate mark: round it by passing on its right side (boat goes between the marks)
      if (state.gateChoice === 'port' && gatePort) {
        const dist = distance(boat.position, gatePort.position);
        if (dist < 50) {
          // Rounding waypoint - pass between the gate marks then turn up
          return { x: gatePort.position.x + 20, y: gatePort.position.y + 15 };
        }
        return gatePort.position;
      }
      if (state.gateChoice === 'starboard' && gateStbd) {
        const dist = distance(boat.position, gateStbd.position);
        if (dist < 50) {
          return { x: gateStbd.position.x - 20, y: gateStbd.position.y + 15 };
        }
        return gateStbd.position;
      }
      if (gatePort && gateStbd) {
        return { x: (gatePort.position.x + gateStbd.position.x) / 2, y: gatePort.position.y };
      }
      return gatePort?.position || null;
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
  const turnRate = 180;
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
  boat.tackTimer = 0.8;
}

export function updateAIBoat(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, allBoats: Boat[]): void {
  if (boat.isPlayer || boat.finished) return;

  // Never let AI spin with penalty turns
  if (boat.penaltyTurns > 0) {
    boat.penaltyTurns = 0;
  }

  // Skip AI heading control while tacking/gybing (heading was already set)
  if (boat.isTacking || boat.isGybing) return;

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

  const target = getTargetForRounding(boat.rounding, course, boat);
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
    const onLayline = absTwaToTarget >= TACK_ANGLE - 8 && distToTarget < 80;

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
      const minTackInterval = 3 + Math.random() * 2;
      if (headingDiffToTarget > 80 && time - state.lastTackTime > minTackInterval) {
        const newTack = currentTack === 'starboard' ? 'port' : 'starboard';
        state.lastTackTime = time;
        doTack(boat, wind.direction, newTack);
        return;
      }
    }
  } else if (headingDownwind) {
    // RC boats sail DEAD DOWNWIND - heading matches wind direction (straight down)
    desiredHeading = wind.direction; // wind=180 means heading=180 = straight south/down
  } else {
    // Reaching or offset leg - aim directly at target
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

  // Minimal collision avoidance
  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dist = distance(boat.position, other.position);
    if (dist < 12) {
      const away = angleBetween(other.position, boat.position);
      boat.heading = normalizeAngle(boat.heading + normalizeDeg(away - boat.heading) * 0.03);
    }
  }
}

function updatePreStart(boat: Boat, course: Course, wind: { direction: number; speed: number }, time: number, state: AIState): void {
  const lineCenter = {
    x: (course.startLine.port.x + course.startLine.starboard.x) / 2,
    y: course.startLine.port.y,
  };
  const lineWidth = course.startLine.starboard.x - course.startLine.port.x;

  // If boat drifted above the start line (OCS), bear away immediately
  if (boat.position.y < lineCenter.y - 5) {
    smoothTurnToward(boat, wind.direction); // head downwind to get back below line
    return;
  }

  // If too far below the line area, head back up on close-hauled
  if (boat.position.y > lineCenter.y + 100) {
    const upwindHeading = getCloseHauledHeading(wind.direction, state.preferredSide > 0 ? 'starboard' : 'port');
    smoothTurnToward(boat, upwindHeading);
    return;
  }

  // If too far from center laterally, tack back immediately
  // Use tight bounds - 40% of line width from center
  const distFromCenter = boat.position.x - lineCenter.x;
  if (Math.abs(distFromCenter) > lineWidth * 0.4) {
    const newTack: 'starboard' | 'port' = distFromCenter > 0 ? 'port' : 'starboard';
    if (time - state.lastTackTime > 1.5) {
      state.lastTackTime = time;
      doTack(boat, wind.direction, newTack);
    }
    return;
  }

  // Normal pre-start: sail close-hauled, tack frequently to stay near line
  const currentTwa = getTrueWindAngle(boat.heading, wind.direction);
  const onStarboard = currentTwa > 0;

  // Short tack intervals to keep boats maneuvering near the line
  const timeSinceTack = time - state.lastTackTime;
  if (timeSinceTack > 2.5 + Math.random() * 2) {
    state.lastTackTime = time;
    state.preferredSide *= -1;
    const newTack: 'starboard' | 'port' = onStarboard ? 'port' : 'starboard';
    doTack(boat, wind.direction, newTack);
    return;
  }

  const desiredHeading = getCloseHauledHeading(wind.direction, onStarboard ? 'starboard' : 'port');
  smoothTurnToward(boat, desiredHeading);
}

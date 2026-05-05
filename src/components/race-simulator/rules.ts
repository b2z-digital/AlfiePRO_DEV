import { Boat, RuleViolation, Vec2, Course } from './types';
import { distance, getTack, getTrueWindAngle, normalizeDeg, angleBetween } from './physics';

const BOAT_RADIUS = 8;
const CONTACT_DISTANCE = 14;

// Grace period: track when each boat last received a mark-touch penalty
const lastMarkPenaltyTime = new Map<string, number>();
const MARK_PENALTY_GRACE_SECONDS = 4;

export function resetPenaltyTracking(): void {
  lastMarkPenaltyTime.clear();
}

interface BoatPair {
  boat1: Boat;
  boat2: Boat;
  distance: number;
}

function getClosePairs(boats: Boat[], threshold: number): BoatPair[] {
  const pairs: BoatPair[] = [];
  for (let i = 0; i < boats.length; i++) {
    for (let j = i + 1; j < boats.length; j++) {
      if (boats[i].finished || boats[j].finished) continue;
      const dist = distance(boats[i].position, boats[j].position);
      if (dist < threshold) {
        pairs.push({ boat1: boats[i], boat2: boats[j], distance: dist });
      }
    }
  }
  return pairs;
}

function isOverlapped(boat1: Boat, boat2: Boat): boolean {
  return distance(boat1.position, boat2.position) < 25;
}

function isWindward(boat: Boat, other: Boat, windDirection: number): boolean {
  const angleFromOther = angleBetween(other.position, boat.position);
  const relAngle = normalizeDeg(angleFromOther - windDirection);
  return Math.abs(relAngle) < 90;
}

export function checkBoatContact(boats: Boat[], windDirection: number, time: number): RuleViolation | null {
  const contactPairs = getClosePairs(boats, CONTACT_DISTANCE);

  for (const pair of contactPairs) {
    const { boat1, boat2 } = pair;
    if (boat1.penaltyTurns > 0 || boat2.penaltyTurns > 0) continue;
    if (boat1.isTacking || boat2.isTacking) continue;

    // Boats are in contact - determine who is at fault using RRS
    const tack1 = getTack(boat1.heading, windDirection);
    const tack2 = getTack(boat2.heading, windDirection);

    let offender: Boat;
    let rightOfWay: Boat;
    let rule: string;
    let ruleNumber: string;
    let description: string;

    if (tack1 !== tack2) {
      // RRS 10: Port/Starboard - port tack boat must keep clear
      const portBoat = tack1 === 'port' ? boat1 : boat2;
      const stbdBoat = tack1 === 'starboard' ? boat1 : boat2;
      offender = portBoat;
      rightOfWay = stbdBoat;
      rule = 'Contact - Port/Starboard';
      ruleNumber = 'RRS 10';
      description = `CONTACT! When boats are on opposite tacks, the port-tack boat shall keep clear. ${portBoat.name} (port) hit ${stbdBoat.name} (starboard). Penalty turn required.`;
    } else if (isOverlapped(boat1, boat2)) {
      // RRS 11: Windward/Leeward
      const windwardBoat = isWindward(boat1, boat2, windDirection) ? boat1 : boat2;
      const leewardBoat = windwardBoat === boat1 ? boat2 : boat1;
      offender = windwardBoat;
      rightOfWay = leewardBoat;
      rule = 'Contact - Windward/Leeward';
      ruleNumber = 'RRS 11';
      description = `CONTACT! When overlapped on the same tack, the windward boat shall keep clear. ${windwardBoat.name} (windward) hit ${leewardBoat.name} (leeward). Penalty turn required.`;
    } else {
      // RRS 12: Clear astern keeps clear
      const ahead = boat1.position.y < boat2.position.y ? boat1 : boat2;
      const astern = ahead === boat1 ? boat2 : boat1;
      offender = astern;
      rightOfWay = ahead;
      rule = 'Contact - Clear Astern';
      ruleNumber = 'RRS 12';
      description = `CONTACT! A boat clear astern shall keep clear of a boat clear ahead. ${astern.name} hit ${ahead.name} from behind. Penalty turn required.`;
    }

    return {
      rule,
      ruleNumber,
      description,
      offendingBoat: offender.id,
      rightOfWayBoat: rightOfWay.id,
      timestamp: time,
      position: { x: (boat1.position.x + boat2.position.x) / 2, y: (boat1.position.y + boat2.position.y) / 2 },
    };
  }

  return null;
}

export function checkMarkTouching(boats: Boat[], course: Course, time: number): RuleViolation | null {
  // RRS 31: Touching a Mark - a boat that touches a mark shall take a penalty
  // Only check marks that are currently relevant (not start line marks during racing)
  const racingMarks = course.marks.filter(m => m.type !== 'start-port' && m.type !== 'start-starboard');

  for (const boat of boats) {
    if (boat.finished || boat.penaltyTurns > 0) continue;

    // Grace period: skip if this boat was recently penalized for mark touch
    const lastPenalty = lastMarkPenaltyTime.get(boat.id) ?? -999;
    if (time - lastPenalty < MARK_PENALTY_GRACE_SECONDS) continue;

    for (const mark of racingMarks) {
      const dist = distance(boat.position, mark.position);
      const touchThreshold = mark.radius + 4;

      if (dist < touchThreshold) {
        lastMarkPenaltyTime.set(boat.id, time);
        return {
          rule: 'Touching a Mark',
          ruleNumber: 'RRS 31',
          description: `${boat.name} touched ${mark.label}! A boat that touches a mark while racing shall take a One-Turn Penalty (one tack and one gybe, RRS 44.2).`,
          offendingBoat: boat.id,
          rightOfWayBoat: '',
          timestamp: time,
          position: mark.position,
        };
      }
    }
  }

  return null;
}

export function checkOCS(boats: Boat[], course: Course, time: number): RuleViolation | null {
  // RRS 30.1 (I Flag Rule) / Rule 29.1: Over the start line early
  // Only check boats whose rounding just changed to 1 (they crossed the line at the gun)
  // Actually check if any boat is above the start line while phase is still countdown
  // This is called from the game loop during the transition moment

  const lineY = course.startLine.port.y;

  for (const boat of boats) {
    if (boat.finished || boat.penaltyTurns > 0) continue;

    // Boat is OCS if it's above (north of) the start line when the gun fires
    if (boat.position.y < lineY - 5) {
      return {
        rule: 'Over the Line (OCS)',
        ruleNumber: 'RRS 29.1',
        description: `${boat.name} was over the start line at the starting signal! You must return to the pre-start side of the line and restart.`,
        offendingBoat: boat.id,
        rightOfWayBoat: '',
        timestamp: time,
        position: { x: boat.position.x, y: lineY },
      };
    }
  }

  return null;
}

export function checkRules(boats: Boat[], windDirection: number, time: number): RuleViolation | null {
  // Check boat-to-boat contact (highest priority)
  const contactViolation = checkBoatContact(boats, windDirection, time);
  if (contactViolation) return contactViolation;

  return null;
}

export function checkMarkRounding(boats: Boat[], markPosition: Vec2, markRadius: number, windDirection: number, time: number): RuleViolation | null {
  const boatsNearMark = boats.filter(b => !b.finished && distance(b.position, markPosition) < markRadius + 40);
  if (boatsNearMark.length < 2) return null;

  // Rule 18 - Mark Room
  for (let i = 0; i < boatsNearMark.length; i++) {
    for (let j = i + 1; j < boatsNearMark.length; j++) {
      const b1 = boatsNearMark[i];
      const b2 = boatsNearMark[j];
      if (b1.penaltyTurns > 0 || b2.penaltyTurns > 0) continue;
      const dist = distance(b1.position, b2.position);

      if (dist < 20) {
        const distToMark1 = distance(b1.position, markPosition);
        const distToMark2 = distance(b2.position, markPosition);
        const insideBoat = distToMark1 < distToMark2 ? b1 : b2;
        const outsideBoat = insideBoat === b1 ? b2 : b1;

        if (dist < 12) {
          return {
            rule: 'Mark Room',
            ruleNumber: 'RRS 18',
            description: `When boats are overlapped at the zone (3 boat lengths from the mark), the outside boat shall give the inside boat room to round the mark. ${outsideBoat.name} must give ${insideBoat.name} room at the mark.`,
            offendingBoat: outsideBoat.id,
            rightOfWayBoat: insideBoat.id,
            timestamp: time,
            position: markPosition,
          };
        }
      }
    }
  }

  return null;
}

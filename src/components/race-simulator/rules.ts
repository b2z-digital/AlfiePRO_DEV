import { Boat, RuleViolation, Vec2, Wind } from './types';
import { distance, getTack, getTrueWindAngle, normalizeDeg, angleBetween } from './physics';

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
  // Simplified overlap: boats are overlapped if the trailing boat's bow
  // is forward of the leading boat's stern
  const dist = distance(boat1.position, boat2.position);
  return dist < 25; // roughly 2 boat lengths
}

function isWindward(boat: Boat, other: Boat, windDirection: number): boolean {
  const angleFromOther = angleBetween(other.position, boat.position);
  const relAngle = normalizeDeg(angleFromOther - windDirection);
  return Math.abs(relAngle) < 90;
}

function isClear(boat1: Boat, boat2: Boat): boolean {
  return distance(boat1.position, boat2.position) > 30;
}

export function checkRules(boats: Boat[], windDirection: number, time: number): RuleViolation | null {
  const closePairs = getClosePairs(boats, 25);

  for (const pair of closePairs) {
    const { boat1, boat2 } = pair;

    // Don't check rules for boats doing penalty turns
    if (boat1.penaltyTurns > 0 || boat2.penaltyTurns > 0) continue;

    const tack1 = getTack(boat1.heading, windDirection);
    const tack2 = getTack(boat2.heading, windDirection);

    // Rule 10 - Port/Starboard
    if (tack1 !== tack2) {
      const portBoat = tack1 === 'port' ? boat1 : boat2;
      const stbdBoat = tack1 === 'starboard' ? boat1 : boat2;

      // Check if port boat is converging on starboard boat
      const relAngle = angleBetween(portBoat.position, stbdBoat.position);
      const convergence = Math.abs(normalizeDeg(portBoat.heading - relAngle));

      if (convergence < 60 && pair.distance < 18) {
        return {
          rule: 'Port/Starboard',
          ruleNumber: 'RRS 10',
          description: `When boats are on opposite tacks, the port-tack boat shall keep clear of the starboard-tack boat. ${portBoat.name} (port) must give way to ${stbdBoat.name} (starboard).`,
          offendingBoat: portBoat.id,
          rightOfWayBoat: stbdBoat.id,
          timestamp: time,
          position: { x: (boat1.position.x + boat2.position.x) / 2, y: (boat1.position.y + boat2.position.y) / 2 },
        };
      }
    }

    // Rule 11 - Windward/Leeward (same tack, overlapped)
    if (tack1 === tack2 && isOverlapped(boat1, boat2)) {
      const windwardBoat = isWindward(boat1, boat2, windDirection) ? boat1 : boat2;
      const leewardBoat = windwardBoat === boat1 ? boat2 : boat1;

      // Check if windward boat is too close
      if (pair.distance < 15) {
        return {
          rule: 'Windward/Leeward',
          ruleNumber: 'RRS 11',
          description: `When boats are on the same tack and overlapped, the windward boat shall keep clear of the leeward boat. ${windwardBoat.name} (windward) must keep clear of ${leewardBoat.name} (leeward).`,
          offendingBoat: windwardBoat.id,
          rightOfWayBoat: leewardBoat.id,
          timestamp: time,
          position: { x: (boat1.position.x + boat2.position.x) / 2, y: (boat1.position.y + boat2.position.y) / 2 },
        };
      }
    }

    // Rule 12 - Same tack, not overlapped (clear astern keeps clear)
    if (tack1 === tack2 && !isOverlapped(boat1, boat2)) {
      // Determine which is ahead based on progress toward wind
      const angleToWind1 = Math.abs(normalizeDeg(angleBetween({ x: 0, y: 0 }, boat1.position) - windDirection));
      const angleToWind2 = Math.abs(normalizeDeg(angleBetween({ x: 0, y: 0 }, boat2.position) - windDirection));

      // The boat further from start (more upwind in beating) or further along course
      const ahead = boat1.position.y < boat2.position.y ? boat1 : boat2;
      const astern = ahead === boat1 ? boat2 : boat1;

      if (pair.distance < 12) {
        return {
          rule: 'Clear Astern/Clear Ahead',
          ruleNumber: 'RRS 12',
          description: `When boats are on the same tack and not overlapped, the boat clear astern shall keep clear of the boat clear ahead. ${astern.name} must keep clear of ${ahead.name}.`,
          offendingBoat: astern.id,
          rightOfWayBoat: ahead.id,
          timestamp: time,
          position: { x: (boat1.position.x + boat2.position.x) / 2, y: (boat1.position.y + boat2.position.y) / 2 },
        };
      }
    }

    // Rule 13 - While tacking
    if (boat1.isTacking || boat2.isTacking) {
      const tackingBoat = boat1.isTacking ? boat1 : boat2;
      const otherBoat = tackingBoat === boat1 ? boat2 : boat1;

      if (pair.distance < 15) {
        return {
          rule: 'While Tacking',
          ruleNumber: 'RRS 13',
          description: `After passing head to wind, a boat shall keep clear of other boats until she is on a close-hauled course. ${tackingBoat.name} is tacking and must keep clear of ${otherBoat.name}.`,
          offendingBoat: tackingBoat.id,
          rightOfWayBoat: otherBoat.id,
          timestamp: time,
          position: { x: (boat1.position.x + boat2.position.x) / 2, y: (boat1.position.y + boat2.position.y) / 2 },
        };
      }
    }
  }

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
      const dist = distance(b1.position, b2.position);

      if (dist < 20) {
        // Inside boat has right to room
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

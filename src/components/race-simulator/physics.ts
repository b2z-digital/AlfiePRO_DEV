import { Vec2, Boat, Wind, Course, GameState, Tack, BoatPolar } from './types';

// Boat speed polar - speed as fraction of wind speed at various angles to wind
const POLAR_DATA: BoatPolar[] = [
  { twa: 0, speed: 0 },
  { twa: 10, speed: 0.05 },
  { twa: 20, speed: 0.15 },
  { twa: 30, speed: 0.35 },
  { twa: 40, speed: 0.55 },
  { twa: 45, speed: 0.62 },
  { twa: 50, speed: 0.68 },
  { twa: 60, speed: 0.75 },
  { twa: 70, speed: 0.80 },
  { twa: 80, speed: 0.85 },
  { twa: 90, speed: 0.88 },
  { twa: 100, speed: 0.90 },
  { twa: 110, speed: 0.88 },
  { twa: 120, speed: 0.82 },
  { twa: 130, speed: 0.75 },
  { twa: 140, speed: 0.68 },
  { twa: 150, speed: 0.60 },
  { twa: 160, speed: 0.50 },
  { twa: 170, speed: 0.40 },
  { twa: 180, speed: 0.35 },
];

export function getBoatSpeed(twa: number, windSpeed: number): number {
  const absTwa = Math.abs(normalizeDeg(twa));
  let lower = POLAR_DATA[0];
  let upper = POLAR_DATA[POLAR_DATA.length - 1];
  for (let i = 0; i < POLAR_DATA.length - 1; i++) {
    if (absTwa >= POLAR_DATA[i].twa && absTwa <= POLAR_DATA[i + 1].twa) {
      lower = POLAR_DATA[i];
      upper = POLAR_DATA[i + 1];
      break;
    }
  }
  const t = upper.twa === lower.twa ? 0 : (absTwa - lower.twa) / (upper.twa - lower.twa);
  const speedFraction = lower.speed + t * (upper.speed - lower.speed);
  return speedFraction * windSpeed * 0.8; // scale factor for gameplay feel
}

export function normalizeDeg(deg: number): number {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

export function normalizeAngle(deg: number): number {
  while (deg >= 360) deg -= 360;
  while (deg < 0) deg += 360;
  return deg;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function angleBetween(from: Vec2, to: Vec2): number {
  return normalizeAngle(radToDeg(Math.atan2(to.x - from.x, -(to.y - from.y))));
}

export function getTrueWindAngle(boatHeading: number, windDirection: number): number {
  return normalizeDeg(windDirection - boatHeading + 180);
}

export function getTack(boatHeading: number, windDirection: number): Tack {
  const twa = getTrueWindAngle(boatHeading, windDirection);
  return twa > 0 ? 'starboard' : 'port';
}

export function getWindAtTime(baseWind: Wind, time: number): { direction: number; speed: number } {
  const shiftPhase = (time / baseWind.shiftPeriod) * Math.PI * 2;
  const shift = Math.sin(shiftPhase) * baseWind.shiftAmplitude;
  const gustPhase = (time / (baseWind.shiftPeriod * 0.7)) * Math.PI * 2;
  const gust = 1 + Math.sin(gustPhase) * baseWind.gustFactor * 0.3;
  return {
    direction: normalizeAngle(baseWind.direction + shift),
    speed: baseWind.speed * gust,
  };
}

export function getDirtyAirFactor(boat: Boat, allBoats: Boat[], windDirection: number): number {
  let factor = 1.0;
  const windRad = degToRad(windDirection);
  const upwindX = -Math.sin(windRad);
  const upwindY = Math.cos(windRad);

  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;
    const dx = other.position.x - boat.position.x;
    const dy = other.position.y - boat.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 80) continue;

    // Check if other boat is upwind of us
    const dotUpwind = dx * upwindX + dy * upwindY;
    if (dotUpwind < 0) continue; // other boat is downwind

    // Check if we're in the wind shadow cone (about 30 degrees wide)
    const crosswind = Math.abs(dx * upwindY - dy * (-upwindX));
    const shadowWidth = dotUpwind * 0.5; // shadow cone widens with distance

    if (crosswind < shadowWidth) {
      const shadowStrength = Math.max(0, 1 - dist / 80) * 0.4;
      factor -= shadowStrength;
    }
  }
  return Math.max(0.5, factor);
}

export function updateBoatPosition(boat: Boat, dt: number, wind: { direction: number; speed: number }, allBoats: Boat[]): void {
  if (boat.finished) return;

  // Handle tacking/gybing animation - boat still moves but at reduced speed
  if (boat.isTacking || boat.isGybing) {
    boat.tackTimer -= dt;
    if (boat.tackTimer <= 0) {
      boat.isTacking = false;
      boat.isGybing = false;
      boat.tackTimer = 0;
    }
    // Move at 40% speed during maneuver (don't compound - use flat multiplier)
    const headingRad = degToRad(boat.heading);
    const maneuverSpeed = Math.max(boat.speed * 0.4, 2);
    boat.position.x += Math.sin(headingRad) * maneuverSpeed * dt * 6;
    boat.position.y -= Math.cos(headingRad) * maneuverSpeed * dt * 6;
    return;
  }

  // Handle penalty turns
  if (boat.penaltyTurns > 0) {
    boat.heading = normalizeAngle(boat.heading + 360 * dt);
    boat.penaltyTurns -= dt;
    if (boat.penaltyTurns <= 0) boat.penaltyTurns = 0;
    boat.speed = 1;
    return;
  }

  const twa = getTrueWindAngle(boat.heading, wind.direction);
  const baseSpeed = getBoatSpeed(twa, wind.speed);
  const dirtyAir = getDirtyAirFactor(boat, allBoats, wind.direction);
  const targetSpeed = baseSpeed * dirtyAir * (boat.skillLevel || 1.0);

  // Smooth speed changes
  boat.speed += (targetSpeed - boat.speed) * dt * 2;

  // Update position
  const headingRad = degToRad(boat.heading);
  boat.position.x += Math.sin(headingRad) * boat.speed * dt * 6;
  boat.position.y -= Math.cos(headingRad) * boat.speed * dt * 6;

  // Add trail point periodically
  if (boat.trail.length === 0 || distance(boat.position, boat.trail[boat.trail.length - 1]) > 8) {
    boat.trail.push({ ...boat.position });
    if (boat.trail.length > 200) boat.trail.shift();
  }
}

export function hasPassedLine(boat: Boat, lineStart: Vec2, lineEnd: Vec2, direction: 'upward' | 'downward'): boolean {
  // Check if boat is within reasonable distance of the line
  const midX = (lineStart.x + lineEnd.x) / 2;
  const midY = (lineStart.y + lineEnd.y) / 2;
  const lineLen = distance(lineStart, lineEnd);
  if (distance(boat.position, { x: midX, y: midY }) > lineLen) return false;

  // Check if boat is between the two endpoints (project onto line)
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const t = ((boat.position.x - lineStart.x) * dx + (boat.position.y - lineStart.y) * dy) / (dx * dx + dy * dy);
  if (t < -0.1 || t > 1.1) return false;

  // Check which side of line the boat is on
  const cross = (boat.position.x - lineStart.x) * (lineEnd.y - lineStart.y) -
                (boat.position.y - lineStart.y) * (lineEnd.x - lineStart.x);

  if (direction === 'upward') return cross > 0;
  return cross < 0;
}

export function hasRoundedMark(boat: Boat, markPos: Vec2, markRadius: number): boolean {
  return distance(boat.position, markPos) < markRadius + 10;
}

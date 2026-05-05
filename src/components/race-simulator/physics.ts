import { Vec2, Boat, Wind, Course, GameState, Tack, BoatPolar } from './types';

// ---------------------------------------------------------------------------
// Boat speed polar -- speed as fraction of wind speed at each true-wind-angle
// ---------------------------------------------------------------------------
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
  { twa: 140, speed: 0.72 },
  { twa: 150, speed: 0.70 },
  { twa: 160, speed: 0.68 },
  { twa: 170, speed: 0.66 },
  { twa: 180, speed: 0.65 },
];

// ---------------------------------------------------------------------------
// Angle / math helpers
// ---------------------------------------------------------------------------

/** Normalize an angle into the range -180 .. +180. */
export function normalizeDeg(deg: number): number {
  deg = deg % 360;
  if (deg > 180) deg -= 360;
  if (deg < -180) deg += 360;
  return deg;
}

/** Normalize an angle into the range 0 .. 360. */
export function normalizeAngle(deg: number): number {
  deg = deg % 360;
  if (deg < 0) deg += 360;
  return deg;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Euclidean distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Compass bearing FROM `from` TO `to`.
 *
 * Canvas coordinate system: +X right, +Y down.
 * Heading convention: 0 = north (up), 90 = east, 180 = south, 270 = west.
 */
export function angleBetween(from: Vec2, to: Vec2): number {
  return normalizeAngle(radToDeg(Math.atan2(to.x - from.x, -(to.y - from.y))));
}

// ---------------------------------------------------------------------------
// True wind angle & tack
// ---------------------------------------------------------------------------

/**
 * Signed true-wind-angle.
 *
 * `windDirection` is the compass direction wind blows FROM.
 * Result is in -180..+180.  Positive = wind comes from starboard side.
 *
 * TWA = 0  means heading directly into the wind.
 * TWA = 180/-180 means running dead downwind.
 */
export function getTrueWindAngle(boatHeading: number, windDirection: number): number {
  return normalizeDeg(windDirection - boatHeading);
}

/**
 * Which tack the boat is on.
 * Starboard tack: wind comes from the starboard (right) side -- positive TWA.
 * Port tack: wind comes from the port (left) side -- negative TWA.
 */
export function getTack(boatHeading: number, windDirection: number): Tack {
  const twa = getTrueWindAngle(boatHeading, windDirection);
  return twa > 0 ? 'starboard' : 'port';
}

// ---------------------------------------------------------------------------
// Sail sheeting model
// ---------------------------------------------------------------------------

/**
 * Return the optimal sheet angle (0-1) for a given absolute TWA.
 *   0 = fully eased, 1 = fully sheeted in.
 *
 * Close-hauled (~45)  -> ~0.9
 * Beam reach  (~90)   -> ~0.5
 * Broad reach (~135)  -> ~0.3
 * Running     (~170+) -> ~0.2
 */
export function getOptimalSheet(twa: number): number {
  const absTwa = Math.min(Math.abs(normalizeDeg(twa)), 180);

  if (absTwa <= 45) {
    // Close-hauled zone: 0.85 - 0.95 (tighter as closer to wind)
    return 0.95 - (absTwa / 45) * 0.1; // 0.95 at 0 -> 0.85 at 45
  }
  if (absTwa <= 90) {
    // Close reach -> beam reach: 0.85 down to 0.50
    const t = (absTwa - 45) / 45;
    return 0.85 - t * 0.35;
  }
  if (absTwa <= 135) {
    // Beam reach -> broad reach: 0.50 down to 0.30
    const t = (absTwa - 90) / 45;
    return 0.50 - t * 0.20;
  }
  // Broad reach -> running: 0.30 down to 0.20
  const t = (absTwa - 135) / 45;
  return 0.30 - t * 0.10;
}

/**
 * Sheeting efficiency multiplier (0..1).
 *
 * If the sheet angle matches the optimal for this TWA the multiplier is 1.
 * Deviation in either direction (too tight or too loose) penalises speed.
 * The penalty curve is quadratic so small errors are forgiving but large
 * mis-sheets are punishing.
 */
function getSheetEfficiency(twa: number, sheetAngle: number): number {
  const optimal = getOptimalSheet(twa);
  const error = Math.abs(sheetAngle - optimal);
  // Quadratic falloff -- 0.3 error => ~0.64 efficiency, 0.5 => ~0.38
  const efficiency = Math.max(0.15, 1 - error * error * 2.8);
  return efficiency;
}

// ---------------------------------------------------------------------------
// Boat speed (polar + sheet efficiency)
// ---------------------------------------------------------------------------

/**
 * Compute boat speed from the polar curve, wind speed, and sheet angle.
 *
 * @param twa       Signed or unsigned true-wind-angle (degrees).
 * @param windSpeed Current wind speed.
 * @param sheetAngle 0 (fully eased) to 1 (fully sheeted in).
 *                   If omitted the optimal sheet for this TWA is assumed.
 * @returns Speed in game units (scaled for gameplay feel).
 */
export function getBoatSpeed(twa: number, windSpeed: number, sheetAngle?: number): number {
  const absTwa = Math.min(Math.abs(normalizeDeg(twa)), 180);

  // Interpolate the polar curve
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

  // Apply sheet efficiency
  const sheet = sheetAngle !== undefined ? sheetAngle : getOptimalSheet(twa);
  const efficiency = getSheetEfficiency(twa, sheet);

  return speedFraction * windSpeed * efficiency * 0.8; // 0.8 gameplay scale
}

// ---------------------------------------------------------------------------
// Wind model -- shifts & gusts over time
// ---------------------------------------------------------------------------

/**
 * Compute the effective wind at a given time.
 *
 * Shifts are deliberately MORE pronounced than typical -- 15-20 degree swings
 * with an overlaid harmonic to make them less predictable.  Gusts are also
 * larger and slightly offset in phase from the shifts so that a shift and a
 * gust can coincide for dramatic effect.
 */
export function getWindAtTime(
  baseWind: Wind,
  time: number,
): { direction: number; speed: number } {
  // Primary shift oscillation
  const primaryPhase = (time / baseWind.shiftPeriod) * Math.PI * 2;
  const primaryShift = Math.sin(primaryPhase) * baseWind.shiftAmplitude;

  // Secondary harmonic -- ~40% of period, ~45% of amplitude.
  // This makes the shift pattern less sinusoidal and more "noisy".
  const secondaryPhase = (time / (baseWind.shiftPeriod * 0.4)) * Math.PI * 2;
  const secondaryShift = Math.sin(secondaryPhase) * baseWind.shiftAmplitude * 0.45;

  // Slow long-period drift to prevent perfectly repeating pattern
  const driftPhase = (time / (baseWind.shiftPeriod * 3.7)) * Math.PI * 2;
  const driftShift = Math.sin(driftPhase) * baseWind.shiftAmplitude * 0.3;

  const totalShift = primaryShift + secondaryShift + driftShift;

  // Gust model -- offset from shift so they sometimes coincide
  const gustPhase = (time / (baseWind.shiftPeriod * 0.6)) * Math.PI * 2;
  const gustMultiplier =
    1 +
    Math.sin(gustPhase) * baseWind.gustFactor * 0.35 +
    Math.sin(gustPhase * 1.7) * baseWind.gustFactor * 0.15;

  return {
    direction: normalizeAngle(baseWind.direction + totalShift),
    speed: Math.max(1, baseWind.speed * gustMultiplier),
  };
}

// ---------------------------------------------------------------------------
// Dirty air (wind shadow)
// ---------------------------------------------------------------------------

/**
 * Returns a multiplier (0.5 .. 1.0) representing how much wind the boat
 * actually receives.  Boats directly downwind of another boat within ~80 px
 * receive reduced wind.
 *
 * `windDirection` is the compass direction wind blows FROM.
 */
export function getDirtyAirFactor(
  boat: Boat,
  allBoats: Boat[],
  windDirection: number,
): number {
  let factor = 1.0;

  // Unit vector pointing INTO the wind (toward the source).
  // Heading convention: 0=N,90=E.  Canvas +Y = down.
  const windRad = degToRad(windDirection);
  const upwindX = -Math.sin(windRad); // direction toward wind source
  const upwindY = Math.cos(windRad);  // (canvas Y is inverted)

  for (const other of allBoats) {
    if (other.id === boat.id || other.finished) continue;

    const dx = other.position.x - boat.position.x;
    const dy = other.position.y - boat.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 100) continue; // shadow fades beyond 100 px

    // Is `other` upwind of us?  Dot product of (other - us) with upwind vector.
    const dotUpwind = dx * upwindX + dy * upwindY;
    if (dotUpwind <= 0) continue; // other boat is downwind, no shadow

    // Cross-wind distance (how far off the wind axis the other boat is)
    const crosswind = Math.abs(dx * upwindY - dy * (-upwindX));

    // Shadow cone widens with distance downwind
    const shadowWidth = dotUpwind * 0.55;

    if (crosswind < shadowWidth) {
      // Strength tapers linearly with distance; max 45% reduction at point-blank
      const shadowStrength = Math.max(0, 1 - dist / 100) * 0.45;
      factor -= shadowStrength;
    }
  }

  return Math.max(0.5, factor);
}

// ---------------------------------------------------------------------------
// Position update (main physics tick)
// ---------------------------------------------------------------------------

// In-irons lateral drift accumulator keyed by boat id, so drift is smooth
// across frames rather than jerky per-frame randomness.
const _ironsDriftState: Map<string, { lateral: number; timer: number }> = new Map();

/**
 * Update a single boat's position for one simulation tick.
 *
 * @param boat       The boat to update (mutated in place).
 * @param dt         Time step in seconds.
 * @param wind       Current wind (already time-shifted).
 * @param allBoats   All boats (for dirty-air calculation).
 * @param sheetAngle Optional sheet angle 0-1.  Defaults to the optimal for
 *                   the current TWA (good enough for AI boats).
 */
export function updateBoatPosition(
  boat: Boat,
  dt: number,
  wind: { direction: number; speed: number },
  allBoats: Boat[],
  sheetAngle?: number,
): void {
  if (boat.finished) return;

  const SPEED_SCALE = 6; // gameplay position multiplier

  // ----- Tacking / Gybing animation -----
  if (boat.isTacking || boat.isGybing) {
    boat.tackTimer -= dt;
    if (boat.tackTimer <= 0) {
      boat.isTacking = false;
      boat.isGybing = false;
      boat.tackTimer = 0;
    }
    // Move at 40% speed during manoeuvre
    const headingRad = degToRad(boat.heading);
    const maneuverSpeed = Math.max(boat.speed * 0.4, 2);
    boat.position.x += Math.sin(headingRad) * maneuverSpeed * dt * SPEED_SCALE;
    boat.position.y -= Math.cos(headingRad) * maneuverSpeed * dt * SPEED_SCALE;
    addTrailPoint(boat);
    return;
  }

  // ----- Penalty turns -----
  if (boat.penaltyTurns > 0) {
    boat.heading = normalizeAngle(boat.heading + 360 * dt);
    boat.penaltyTurns -= dt;
    if (boat.penaltyTurns <= 0) boat.penaltyTurns = 0;
    boat.speed = 1;
    addTrailPoint(boat);
    return;
  }

  // ----- Normal sailing -----
  const twa = getTrueWindAngle(boat.heading, wind.direction);
  const absTwa = Math.abs(twa);

  // Resolve sheet angle -- default to optimal for AI
  const sheet = sheetAngle !== undefined ? sheetAngle : getOptimalSheet(twa);

  // In-irons detection: TWA < 20 degrees (heading nearly into the wind)
  if (absTwa < 20) {
    // Boat stalls and drifts backward slowly with random lateral drift.
    // The closer to 0 TWA, the stronger the backward drift.
    const ironsStrength = 1 - absTwa / 20; // 1 at TWA=0, 0 at TWA=20

    // Backward drift speed -- negative, quite slow
    const backwardSpeed = -wind.speed * 0.08 * ironsStrength;

    // Smooth lateral drift using per-boat state
    let driftState = _ironsDriftState.get(boat.id);
    if (!driftState) {
      driftState = { lateral: 0, timer: 0 };
      _ironsDriftState.set(boat.id, driftState);
    }
    driftState.timer -= dt;
    if (driftState.timer <= 0) {
      // Pick a new random lateral drift target every 0.4-1.0 seconds
      driftState.lateral = (Math.random() - 0.5) * 2; // -1..+1
      driftState.timer = 0.4 + Math.random() * 0.6;
    }
    const lateralSpeed = wind.speed * 0.04 * ironsStrength * driftState.lateral;

    // Apply movement in the wind's downwind direction (backward = downwind)
    const windRad = degToRad(wind.direction);
    // Downwind direction on canvas: wind blows FROM windDirection, so downwind
    // movement is in the direction of windDirection (heading away from source).
    const downwindX = Math.sin(windRad);
    const downwindY = -Math.cos(windRad);
    // Perpendicular (to the right of downwind)
    const perpX = -downwindY;
    const perpY = downwindX;

    boat.position.x +=
      (downwindX * backwardSpeed + perpX * lateralSpeed) * dt * SPEED_SCALE;
    boat.position.y +=
      (downwindY * backwardSpeed + perpY * lateralSpeed) * dt * SPEED_SCALE;

    // Speed display -- show a small negative value so HUD can indicate stall
    boat.speed += (backwardSpeed - boat.speed) * dt * 3;

    addTrailPoint(boat);
    return;
  }

  // Clean up irons state when no longer in irons
  _ironsDriftState.delete(boat.id);

  // Base speed from polar + sheet efficiency
  const baseSpeed = getBoatSpeed(twa, wind.speed, sheet);

  // Dirty air penalty
  const dirtyAir = getDirtyAirFactor(boat, allBoats, wind.direction);

  // Skill level modifier (default 1.0 for player / unset)
  const skill = boat.skillLevel || 1.0;

  const targetSpeed = baseSpeed * dirtyAir * skill;

  // Smooth speed changes (acceleration / deceleration)
  boat.speed += (targetSpeed - boat.speed) * dt * 2;

  // Update position
  const headingRad = degToRad(boat.heading);
  boat.position.x += Math.sin(headingRad) * boat.speed * dt * SPEED_SCALE;
  boat.position.y -= Math.cos(headingRad) * boat.speed * dt * SPEED_SCALE;

  addTrailPoint(boat);
}

/** Append a trail point if the boat has moved far enough from the last one. */
function addTrailPoint(boat: Boat): void {
  if (
    boat.trail.length === 0 ||
    distance(boat.position, boat.trail[boat.trail.length - 1]) > 8
  ) {
    boat.trail.push({ x: boat.position.x, y: boat.position.y });
    if (boat.trail.length > 60) boat.trail.shift();
  }
}

// ---------------------------------------------------------------------------
// Line / mark crossing helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a boat has crossed a line defined by two endpoints.
 *
 * `direction` determines which way counts as "crossing":
 *   - 'upward'   = the boat is now above (north of) the line
 *   - 'downward' = the boat is now below (south of) the line
 *
 * Uses the cross-product sign of (lineEnd - lineStart) x (boat - lineStart).
 */
export function hasPassedLine(
  boat: Boat,
  lineStart: Vec2,
  lineEnd: Vec2,
  direction: 'upward' | 'downward',
): boolean {
  // Quick reject -- too far from the line's midpoint
  const midX = (lineStart.x + lineEnd.x) / 2;
  const midY = (lineStart.y + lineEnd.y) / 2;
  const lineLen = distance(lineStart, lineEnd);
  if (distance(boat.position, { x: midX, y: midY }) > lineLen) return false;

  // Project boat onto the line segment to check it's between the endpoints
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const t =
    ((boat.position.x - lineStart.x) * dx + (boat.position.y - lineStart.y) * dy) /
    (dx * dx + dy * dy);
  if (t < -0.1 || t > 1.1) return false;

  // Cross product determines which side of the line the boat is on
  const cross =
    (boat.position.x - lineStart.x) * (lineEnd.y - lineStart.y) -
    (boat.position.y - lineStart.y) * (lineEnd.x - lineStart.x);

  return direction === 'upward' ? cross > 0 : cross < 0;
}

/**
 * Simple proximity check -- has the boat come close enough to a mark?
 */
export function hasRoundedMark(
  boat: Boat,
  markPos: Vec2,
  markRadius: number,
): boolean {
  return distance(boat.position, markPos) < markRadius + 10;
}

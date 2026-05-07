import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, Boat, Course, Vec2, Wind } from './types';
import { degToRad, normalizeAngle, getWindAtTime } from './physics';

interface GameCanvasProps {
  gameState: GameState;
  width: number;
  height: number;
  darkMode: boolean;
  playerSheetAngle?: number;
}

// Wind variation: compute local wind strength at a given position and time
function getLocalWindStrength(x: number, y: number, time: number, width: number, height: number): number {
  // Multiple overlapping noise-like patterns that shift over time
  const nx = x / width;
  const ny = y / height;
  const t = time * 0.03;

  const wave1 = Math.sin((nx * 3 + t) * Math.PI * 2) * Math.cos((ny * 2 + t * 0.7) * Math.PI * 2);
  const wave2 = Math.sin((nx * 1.5 - t * 0.5 + ny * 2.5) * Math.PI * 2) * 0.5;
  const wave3 = Math.cos((nx * 4 + ny * 3 - t * 1.2) * Math.PI * 2) * 0.3;

  // Normalize to 0.6..1.4 range (wind strength multiplier)
  return 1.0 + (wave1 + wave2 + wave3) * 0.15;
}

export function GameCanvas({ gameState, width, height, darkMode, playerSheetAngle }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use a continuously advancing animation time (not game time which is 0 during countdown)
    const animTime = gameState.phase === 'countdown'
      ? (60 - gameState.countdown) // seconds elapsed since start
      : (60 + gameState.time);

    ctx.clearRect(0, 0, width, height);

    // Background water
    const waterGradient = ctx.createLinearGradient(0, 0, 0, height);
    if (darkMode) {
      waterGradient.addColorStop(0, '#0c1929');
      waterGradient.addColorStop(1, '#1a2d4a');
    } else {
      waterGradient.addColorStop(0, '#e0f2fe');
      waterGradient.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = waterGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw wind variation overlay (gradient patches showing wind strength)
    drawWindVariation(ctx, animTime, width, height, darkMode);

    // Draw water ripples
    drawWaterRipples(ctx, animTime, width, height, darkMode);

    // Draw animated wind arrows flowing downscreen
    drawAnimatedWindArrows(ctx, gameState.wind, animTime, width, height, darkMode);

    // Draw laylines (if beating)
    drawLaylines(ctx, gameState, darkMode);

    // Draw course
    drawCourse(ctx, gameState.course, animTime, gameState.markHits, darkMode);

    // Draw boat trails with pulsing water effect
    for (const boat of gameState.boats) {
      drawWakeTrail(ctx, boat, animTime);
    }

    // Draw boats
    for (const boat of gameState.boats) {
      drawBoat(ctx, boat, gameState.wind, darkMode, boat.isPlayer ? playerSheetAngle : undefined);
    }

    // Draw rule violation indicator
    if (gameState.currentViolation) {
      drawViolationIndicator(ctx, gameState.currentViolation.position);
    }

    // Draw wind direction indicator in top-right
    drawWindDirectionIndicator(ctx, gameState.wind, gameState.time, width, darkMode);
  }, [gameState, width, height, darkMode, playerSheetAngle]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block"
      style={{ imageRendering: 'auto' }}
    />
  );
}

function drawWindVariation(ctx: CanvasRenderingContext2D, time: number, width: number, height: number, darkMode: boolean) {
  ctx.save();
  const cellSize = 40;
  for (let x = 0; x < width; x += cellSize) {
    for (let y = 0; y < height; y += cellSize) {
      const strength = getLocalWindStrength(x + cellSize / 2, y + cellSize / 2, time, width, height);
      // Stronger wind = darker overlay (simulating darker water in gusts)
      const intensity = (strength - 0.6) / 0.8; // normalize 0.6..1.4 to 0..1
      if (darkMode) {
        ctx.fillStyle = `rgba(0, 80, 160, ${intensity * 0.12})`;
      } else {
        ctx.fillStyle = `rgba(0, 60, 120, ${intensity * 0.08})`;
      }
      ctx.fillRect(x, y, cellSize, cellSize);
    }
  }
  ctx.restore();
}

function drawWaterRipples(ctx: CanvasRenderingContext2D, time: number, width: number, height: number, darkMode: boolean) {
  ctx.save();
  ctx.globalAlpha = darkMode ? 0.06 : 0.10;
  ctx.strokeStyle = darkMode ? '#60a5fa' : '#0369a1';
  ctx.lineWidth = 0.5;

  for (let i = 0; i < 12; i++) {
    const y = ((i * 70 + time * 6) % (height + 60)) - 30;
    ctx.beginPath();
    for (let x = 0; x < width; x += 4) {
      const offset = Math.sin((x + time * 15 + i * 40) * 0.02) * 3;
      if (x === 0) ctx.moveTo(x, y + offset);
      else ctx.lineTo(x, y + offset);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAnimatedWindArrows(ctx: CanvasRenderingContext2D, wind: Wind, time: number, width: number, height: number, darkMode: boolean) {
  const currentWind = getWindAtTime(wind, time);
  // Wind blows FROM this direction, arrows flow in the opposite direction (where wind goes)
  const windGoingRad = degToRad(currentWind.direction + 180);
  // Wind flow vector (direction arrows move)
  const flowDx = Math.sin(windGoingRad);
  const flowDy = -Math.cos(windGoingRad);

  ctx.save();
  ctx.lineCap = 'round';

  const spacingX = 55;
  const spacingY = 45;
  const cols = Math.ceil(width / spacingX) + 2;
  const rows = Math.ceil(height / spacingY) + 4;

  // Global drift: all arrows move continuously in the wind direction.
  // Using a large tile period so the modulo "wrap" happens far off-screen.
  const tilePeriodX = cols * spacingX;
  const tilePeriodY = rows * spacingY;
  const baseSpeed = 25;

  for (let col = -1; col < cols; col++) {
    for (let row = -2; row < rows; row++) {
      // Static grid position (staggered)
      const gridX = col * spacingX + ((row & 1) ? spacingX * 0.5 : 0);
      const gridY = row * spacingY;

      // Each arrow drifts at a speed influenced by local wind strength at its grid position
      const localStrength = getLocalWindStrength(gridX, gridY, time * 0.5, width, height);
      const arrowSpeed = baseSpeed * localStrength;

      // Continuous drift offset in the wind direction
      const driftAmount = time * arrowSpeed;
      // Wrap using the tile period (much larger than visible area, so wrap is invisible)
      const wrappedDriftX = ((driftAmount * flowDx) % tilePeriodX + tilePeriodX) % tilePeriodX;
      const wrappedDriftY = ((driftAmount * flowDy) % tilePeriodY + tilePeriodY) % tilePeriodY;

      // Final arrow position = grid + drift, wrapped to stay in visible region
      let arrowX = ((gridX + wrappedDriftX) % tilePeriodX + tilePeriodX) % tilePeriodX - spacingX;
      let arrowY = ((gridY + wrappedDriftY) % tilePeriodY + tilePeriodY) % tilePeriodY - spacingY * 2;

      // Skip if outside visible area with margin
      if (arrowX < -30 || arrowX > width + 30 || arrowY < -30 || arrowY > height + 30) continue;

      // Per-arrow direction variation (gentle local wind shift for realism)
      const localVariation = Math.sin((arrowX * 0.008 + arrowY * 0.006 + time * 0.3)) * 0.12;
      const arrowRad = windGoingRad + localVariation;

      // Current strength at this arrow's actual position (for opacity/size)
      const strengthNow = getLocalWindStrength(arrowX, arrowY, time, width, height);
      const alpha = (darkMode ? 0.1 : 0.14) + (strengthNow - 0.8) * (darkMode ? 0.1 : 0.12);

      ctx.globalAlpha = Math.max(0.04, Math.min(0.32, alpha));
      ctx.strokeStyle = darkMode ? '#94a3b8' : '#64748b';
      ctx.lineWidth = 0.7 + strengthNow * 0.5;

      const arrowLen = 5 + strengthNow * 6;

      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(arrowRad);

      ctx.beginPath();
      ctx.moveTo(0, arrowLen);
      ctx.lineTo(0, -arrowLen);
      ctx.moveTo(0, -arrowLen);
      ctx.lineTo(-2.5, -arrowLen + 5);
      ctx.moveTo(0, -arrowLen);
      ctx.lineTo(2.5, -arrowLen + 5);
      ctx.stroke();

      ctx.restore();
    }
  }
  ctx.restore();
}

function drawWindDirectionIndicator(ctx: CanvasRenderingContext2D, wind: Wind, time: number, width: number, darkMode: boolean) {
  const currentWind = getWindAtTime(wind, time);
  const cx = width - 45;
  const cy = 45;
  const radius = 28;

  ctx.save();
  // Background circle
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = darkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = darkMode ? '#475569' : '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Compass rose marks
  ctx.fillStyle = darkMode ? '#64748b' : '#94a3b8';
  ctx.font = '8px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - radius + 2);
  ctx.fillText('S', cx, cy + radius - 2);
  ctx.fillText('E', cx + radius - 2, cy);
  ctx.fillText('W', cx - radius + 2, cy);

  // Wind arrow (pointing in direction wind is going)
  const windGoingRad = degToRad(currentWind.direction + 180);
  const arrowLen = radius - 8;

  ctx.strokeStyle = darkMode ? '#38bdf8' : '#0284c7';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  // Animate a pulsing glow
  const pulse = 0.7 + Math.sin(time * 3) * 0.3;
  ctx.globalAlpha = pulse;

  ctx.beginPath();
  const startX = cx - Math.sin(windGoingRad) * arrowLen * 0.4;
  const startY = cy + Math.cos(windGoingRad) * arrowLen * 0.4;
  const endX = cx + Math.sin(windGoingRad) * arrowLen;
  const endY = cy - Math.cos(windGoingRad) * arrowLen;
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - Math.sin(windGoingRad - 0.4) * 8,
    endY + Math.cos(windGoingRad - 0.4) * 8
  );
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - Math.sin(windGoingRad + 0.4) * 8,
    endY + Math.cos(windGoingRad + 0.4) * 8
  );
  ctx.stroke();

  // Speed label
  ctx.globalAlpha = 1;
  ctx.fillStyle = darkMode ? '#e2e8f0' : '#1e293b';
  ctx.font = 'bold 9px system-ui';
  ctx.fillText(`${currentWind.speed.toFixed(0)}kn`, cx, cy + radius + 12);

  ctx.restore();
}

function drawLaylines(ctx: CanvasRenderingContext2D, gameState: GameState, darkMode: boolean) {
  const windwardMark = gameState.course.marks.find(m => m.type === 'windward');
  if (!windwardMark) return;

  const currentWind = getWindAtTime(gameState.wind, gameState.time);
  const tackAngle = 45;
  const upwindDir = currentWind.direction + 180;

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 1.5;

  // Port layline
  ctx.strokeStyle = '#ef4444';
  const portAngle = degToRad(upwindDir + tackAngle + 180);
  ctx.beginPath();
  ctx.moveTo(windwardMark.position.x, windwardMark.position.y);
  ctx.lineTo(
    windwardMark.position.x + Math.sin(portAngle) * 400,
    windwardMark.position.y - Math.cos(portAngle) * 400
  );
  ctx.stroke();

  // Starboard layline
  ctx.strokeStyle = '#22c55e';
  const stbdAngle = degToRad(upwindDir - tackAngle + 180);
  ctx.beginPath();
  ctx.moveTo(windwardMark.position.x, windwardMark.position.y);
  ctx.lineTo(
    windwardMark.position.x + Math.sin(stbdAngle) * 400,
    windwardMark.position.y - Math.cos(stbdAngle) * 400
  );
  ctx.stroke();

  ctx.restore();
}

function drawCourse(ctx: CanvasRenderingContext2D, course: Course, time: number, markHits: { markIndex: number; startTime: number }[], darkMode: boolean) {
  // Draw start line
  ctx.save();
  ctx.strokeStyle = darkMode ? '#fbbf24' : '#d97706';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(course.startLine.port.x, course.startLine.port.y);
  ctx.lineTo(course.startLine.starboard.x, course.startLine.starboard.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw finish line
  ctx.strokeStyle = darkMode ? '#60a5fa' : '#2563eb';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(course.finishLine.port.x, course.finishLine.port.y);
  ctx.lineTo(course.finishLine.starboard.x, course.finishLine.starboard.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Mark numbering
  const markNumbers: Record<string, string> = {
    'windward': '1',
    'leeward': '2',
    'gate-port': '3P',
    'gate-starboard': '3S',
    'start-port': 'SP',
    'start-starboard': 'SC',
  };

  // Draw marks
  for (let i = 0; i < course.marks.length; i++) {
    const mark = course.marks[i];
    ctx.save();

    // Check if this mark has a hit animation
    const hitAnim = markHits.find(h => h.markIndex === i);
    let spinAngle = 0;
    let scaleEffect = 1;
    if (hitAnim) {
      const elapsed = time - hitAnim.startTime;
      if (elapsed < 2) {
        spinAngle = elapsed * Math.PI * 4; // 2 full rotations over 2 seconds
        scaleEffect = 1 + Math.sin(elapsed * Math.PI) * 0.3; // pulse up then back
      }
    }

    // Mark glow
    const gradient = ctx.createRadialGradient(
      mark.position.x, mark.position.y, 0,
      mark.position.x, mark.position.y, mark.radius * 2.5
    );

    let markColor: string;
    if (mark.type === 'windward') {
      markColor = '#f59e0b';
      gradient.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
      gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
    } else if (mark.type === 'leeward' || mark.type === 'gate-port' || mark.type === 'gate-starboard') {
      markColor = '#f59e0b';
      gradient.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
      gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
    } else if (mark.type === 'start-port') {
      markColor = '#ef4444';
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    } else {
      markColor = '#22c55e';
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(mark.position.x, mark.position.y, mark.radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Apply spin and scale for hit animation
    ctx.translate(mark.position.x, mark.position.y);
    ctx.rotate(spinAngle);
    ctx.scale(scaleEffect, scaleEffect);

    // Mark body
    ctx.fillStyle = markColor;
    ctx.beginPath();
    ctx.arc(0, 0, mark.radius, 0, Math.PI * 2);
    ctx.fill();

    // Mark outline
    ctx.strokeStyle = darkMode ? '#ffffff' : '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mark number in center
    ctx.fillStyle = darkMode ? '#000000' : '#ffffff';
    ctx.font = `bold ${mark.radius > 7 ? 9 : 7}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(markNumbers[mark.type] || '', 0, 0);

    ctx.restore();

    // Mark label above
    ctx.save();
    ctx.fillStyle = darkMode ? '#e2e8f0' : '#1e293b';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(mark.label, mark.position.x, mark.position.y - mark.radius - 10);
    ctx.restore();
  }

  // Draw gate line between gate marks
  const gatePort = course.marks.find(m => m.type === 'gate-port');
  const gateStbd = course.marks.find(m => m.type === 'gate-starboard');
  if (gatePort && gateStbd) {
    ctx.save();
    ctx.strokeStyle = darkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(gatePort.position.x, gatePort.position.y);
    ctx.lineTo(gateStbd.position.x, gateStbd.position.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function drawWakeTrail(ctx: CanvasRenderingContext2D, boat: Boat, time: number) {
  if (boat.trail.length < 2) return;

  ctx.save();
  ctx.lineCap = 'round';

  // Only draw the last N points of the trail (fading wake effect)
  const MAX_VISIBLE = 40;
  const startIdx = Math.max(0, boat.trail.length - MAX_VISIBLE);
  const visibleCount = boat.trail.length - startIdx;

  for (let i = startIdx + 1; i < boat.trail.length; i++) {
    // Progress: 0 = oldest visible point (faded), 1 = newest (bright)
    const progress = (i - startIdx) / visibleCount;

    // Fade: oldest points are transparent, newest are opaque
    const alpha = progress * progress * 0.6;

    // Width: thin at the start, thicker near the boat
    const lineWidth = 0.5 + progress * 2;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = boat.color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(boat.trail[i - 1].x, boat.trail[i - 1].y);
    ctx.lineTo(boat.trail[i].x, boat.trail[i].y);
    ctx.stroke();

    // Subtle white wake foam near the boat end
    if (progress > 0.8) {
      ctx.globalAlpha = alpha * 0.3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = lineWidth * 0.4;
      ctx.beginPath();
      const offset = Math.sin(i * 0.8) * 1.5;
      ctx.moveTo(boat.trail[i - 1].x + offset, boat.trail[i - 1].y);
      ctx.lineTo(boat.trail[i].x + offset, boat.trail[i].y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, wind: Wind, darkMode: boolean, sheetAngle?: number) {
  if (boat.finished) return;

  const { x, y } = boat.position;
  const headingRad = degToRad(boat.heading);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(headingRad);

  const boatLength = boat.isPlayer ? 22 : 18;
  const boatWidth = boat.isPlayer ? 5 : 4;

  // Compute sail deflection based on wind angle and sheet trim
  const windAngleRel = normalizeAngle(wind.direction - boat.heading);
  const windSide = Math.sin(degToRad(windAngleRel)); // positive = wind from starboard
  const absWindAngle = Math.abs(windAngleRel > 180 ? windAngleRel - 360 : windAngleRel);

  // Sheet angle determines how far out the sail can go
  // sheetAngle: 0 = fully eased (sails out), 1 = fully sheeted in (sails close to centerline)
  const sheet = sheetAngle !== undefined ? sheetAngle : 0.7;
  // Max 80% out (about 72 degrees / 1.26 radians)
  const maxSailDeflection = (1 - sheet) * 1.26;
  // Sail swings to leeward (away from wind)
  const sailDeflect = windSide > 0
    ? -Math.min(maxSailDeflection, absWindAngle * 0.008)
    : Math.min(maxSailDeflection, absWindAngle * 0.008);

  // Detect deep downwind sailing for goose-wing (wing-on-wing)
  const isDeepDownwind = absWindAngle > 150;
  const isFullyEased = sheet < 0.15;
  const gooseWing = isDeepDownwind && isFullyEased;

  // Hull - race yacht shape with pointed bow, flat transom, rounded sides
  ctx.fillStyle = boat.color;
  ctx.strokeStyle = darkMode ? '#ffffff' : '#1e293b';
  ctx.lineWidth = boat.isPlayer ? 1.8 : 1.2;

  ctx.beginPath();
  // Bow (sharp pointed front)
  ctx.moveTo(0, -boatLength * 0.9);
  // Starboard gunwale - curved sides
  ctx.bezierCurveTo(
    boatWidth * 0.5, -boatLength * 0.6,
    boatWidth * 1.05, -boatLength * 0.15,
    boatWidth, boatLength * 0.2
  );
  // Starboard quarter - round into flat transom
  ctx.bezierCurveTo(
    boatWidth * 0.95, boatLength * 0.35,
    boatWidth * 0.85, boatLength * 0.42,
    boatWidth * 0.75, boatLength * 0.45
  );
  // Flat transom (stern)
  ctx.lineTo(-boatWidth * 0.75, boatLength * 0.45);
  // Port quarter - round out from flat transom
  ctx.bezierCurveTo(
    -boatWidth * 0.85, boatLength * 0.42,
    -boatWidth * 0.95, boatLength * 0.35,
    -boatWidth, boatLength * 0.2
  );
  // Port gunwale - curved sides
  ctx.bezierCurveTo(
    -boatWidth * 1.05, -boatLength * 0.15,
    -boatWidth * 0.5, -boatLength * 0.6,
    0, -boatLength * 0.9
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Deck detail - centerline
  ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -boatLength * 0.7);
  ctx.lineTo(0, boatLength * 0.35);
  ctx.stroke();

  // Mast position (centre of boat)
  const mastY = -boatLength * 0.05;

  // Mast dot
  ctx.fillStyle = darkMode ? '#94a3b8' : '#475569';
  ctx.beginPath();
  ctx.arc(0, mastY, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Mainsail - pivots from mast (centre of boat)
  // After rotation by sailDeflect, wind comes from the "negative X" side in the sail's
  // local frame, pushing the belly to "positive X". But we need to account for the
  // fact that the rotation direction flips this: when sailDeflect is negative (sail to port),
  // in the sail's rotated frame the wind pushes belly to +X local. When sailDeflect is
  // positive (sail to starboard), wind pushes belly to -X local.
  // Simpler: belly always goes OPPOSITE to sailDeflect direction in the sail's local frame.
  const mainSailLength = boatLength * 0.7;
  const bellySide = sailDeflect <= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(0, mastY);
  ctx.rotate(sailDeflect);

  ctx.fillStyle = boat.isPlayer
    ? 'rgba(255, 255, 255, 0.9)'
    : 'rgba(255, 255, 255, 0.7)';
  ctx.strokeStyle = boat.isPlayer
    ? (darkMode ? '#f1f5f9' : '#94a3b8')
    : (darkMode ? '#cbd5e1' : '#94a3b8');
  ctx.lineWidth = 1.2;

  const bellyCurve = ((1 - sheet) * 4 + 2) * bellySide;
  ctx.beginPath();
  // Luff (leading edge) runs straight along Y axis (the mast)
  ctx.moveTo(0, -mainSailLength * 0.45); // Head (top of sail)
  ctx.lineTo(0, mainSailLength * 0.5); // Clew (end of boom)
  // Leech (trailing edge) curves back to head with belly
  ctx.quadraticCurveTo(
    bellyCurve * 1.3, mainSailLength * 0.05,
    0, -mainSailLength * 0.45
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Boom line (mast to end of boom)
  ctx.strokeStyle = darkMode ? '#94a3b8' : '#64748b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, mainSailLength * 0.5);
  ctx.stroke();

  ctx.restore();

  // Jib (foresail) - pivots from bow (nose of boat)
  const jibAttachY = -boatLength * 0.85; // bow attachment
  const jibLength = boatLength * 0.55;

  // Goose-wing: jib goes to opposite side of main when deep downwind
  const jibDeflect = gooseWing ? -sailDeflect : sailDeflect * 0.85;
  // Jib belly: same logic — opposite to its own deflection direction
  const jibBellySide = jibDeflect <= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(0, jibAttachY);
  ctx.rotate(jibDeflect);

  const jibBelly = ((1 - sheet) * 3.5 + 1.5) * jibBellySide;
  ctx.fillStyle = boat.isPlayer
    ? 'rgba(220, 240, 255, 0.9)'
    : 'rgba(255, 255, 255, 0.65)';
  ctx.strokeStyle = boat.isPlayer
    ? (darkMode ? '#93c5fd' : '#60a5fa')
    : (darkMode ? '#94a3b8' : '#94a3b8');
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(0, 0); // Head (tack at bow)
  ctx.lineTo(0, jibLength); // Clew (bottom)
  // Leech curves back to head with belly
  ctx.quadraticCurveTo(
    jibBelly * 1.2, jibLength * 0.4,
    0, 0
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  // Forestay line (mast to bow)
  ctx.strokeStyle = darkMode ? 'rgba(148,163,184,0.4)' : 'rgba(71,85,105,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, mastY);
  ctx.lineTo(0, -boatLength * 0.85);
  ctx.stroke();

  ctx.restore();

  // Player indicator ring
  if (boat.isPlayer) {
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.005) * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, boatLength + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Penalty indicator
  if (boat.penaltyTurns > 0) {
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('360', x, y - 26);
    ctx.restore();
  }

  // Sail number label
  ctx.save();
  ctx.fillStyle = darkMode ? '#cbd5e1' : '#475569';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(boat.sailNumber, x, y + boatLength * 0.55 + 14);
  ctx.restore();
}

function drawViolationIndicator(ctx: CanvasRenderingContext2D, position: Vec2) {
  const pulse = Math.sin(Date.now() * 0.008) * 0.3 + 0.7;

  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(position.x, position.y, 30, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 16px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', position.x, position.y - 35);
  ctx.restore();
}

import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, Boat, Course, Vec2, Wind } from './types';
import { degToRad, normalizeAngle, getWindAtTime } from './physics';

interface GameCanvasProps {
  gameState: GameState;
  width: number;
  height: number;
  darkMode: boolean;
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

export function GameCanvas({ gameState, width, height, darkMode }: GameCanvasProps) {
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
      drawBoat(ctx, boat, gameState.wind, darkMode);
    }

    // Draw rule violation indicator
    if (gameState.currentViolation) {
      drawViolationIndicator(ctx, gameState.currentViolation.position);
    }

    // Draw wind direction indicator in top-right
    drawWindDirectionIndicator(ctx, gameState.wind, gameState.time, width, darkMode);
  }, [gameState, width, height, darkMode]);

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
  const baseWindRad = degToRad(currentWind.direction + 180);

  ctx.save();
  ctx.lineCap = 'round';

  const spacingX = 60;
  const spacingY = 50;
  const baseSpeed = 30; // base pixels per second

  for (let col = 0; col < Math.ceil(width / spacingX) + 1; col++) {
    for (let row = -2; row < Math.ceil(height / spacingY) + 3; row++) {
      const baseX = col * spacingX + (row % 2 === 0 ? 0 : spacingX * 0.5);

      // Each arrow has a unique speed based on its position in the wind field.
      // Stronger wind areas (gusts/shadows) = faster movement.
      const localStrength = getLocalWindStrength(baseX, row * spacingY, time, width, height);
      // Speed varies from 20 (light) to 60 (gust) px/s
      const arrowSpeed = baseSpeed * localStrength * (0.7 + (col * 7 + row * 13) % 5 * 0.1);

      // Each arrow drifts at its own speed
      const drift = (time * arrowSpeed) % spacingY;
      const baseY = row * spacingY + drift;

      if (baseY < -20 || baseY > height + 20 || baseX < -20 || baseX > width + 20) continue;

      // Per-arrow direction variation (slight local wind shift)
      const localVariation = Math.sin((baseX * 0.01 + baseY * 0.008 + time * 0.5)) * 0.15;
      const arrowRad = baseWindRad + localVariation;

      // Gusts (stronger wind) = more opaque + larger arrows
      const strengthNow = getLocalWindStrength(baseX, baseY, time, width, height);
      const alpha = (darkMode ? 0.08 : 0.12) + strengthNow * (darkMode ? 0.08 : 0.1);

      ctx.globalAlpha = Math.min(0.3, alpha);
      ctx.strokeStyle = darkMode ? '#94a3b8' : '#64748b';
      ctx.lineWidth = 0.8 + strengthNow * 0.4;

      const arrowLen = 6 + strengthNow * 5;

      ctx.save();
      ctx.translate(baseX, baseY);
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

function drawBoat(ctx: CanvasRenderingContext2D, boat: Boat, wind: Wind, darkMode: boolean) {
  if (boat.finished) return;

  const { x, y } = boat.position;
  const headingRad = degToRad(boat.heading);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(headingRad);

  const boatLength = boat.isPlayer ? 16 : 14;
  const boatWidth = boat.isPlayer ? 5 : 4;

  // Hull
  ctx.fillStyle = boat.color;
  ctx.strokeStyle = darkMode ? '#ffffff' : '#1e293b';
  ctx.lineWidth = boat.isPlayer ? 2 : 1;

  ctx.beginPath();
  ctx.moveTo(0, -boatLength);
  ctx.bezierCurveTo(boatWidth, -boatLength * 0.3, boatWidth, boatLength * 0.5, 0, boatLength);
  ctx.bezierCurveTo(-boatWidth, boatLength * 0.5, -boatWidth, -boatLength * 0.3, 0, -boatLength);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sail
  const windAngleRel = normalizeAngle(wind.direction - boat.heading);
  const sailAngle = Math.sin(degToRad(windAngleRel)) * 0.6;

  ctx.strokeStyle = darkMode ? '#f8fafc' : '#f1f5f9';
  ctx.fillStyle = boat.isPlayer ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, -boatLength * 0.6);
  ctx.quadraticCurveTo(sailAngle * boatLength, 0, 0, boatLength * 0.3);
  ctx.stroke();
  ctx.fill();

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
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('360', x, y - 24);
    ctx.restore();
  }

  // Sail number label
  ctx.save();
  ctx.fillStyle = darkMode ? '#cbd5e1' : '#475569';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(boat.sailNumber, x, y + boatLength + 12);
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

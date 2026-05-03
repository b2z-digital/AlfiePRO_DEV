import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, Boat, Course, Vec2, Wind } from './types';
import { degToRad, normalizeAngle, getWindAtTime } from './physics';

interface GameCanvasProps {
  gameState: GameState;
  width: number;
  height: number;
  darkMode: boolean;
}

export function GameCanvas({ gameState, width, height, darkMode }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Draw water ripples
    drawWaterRipples(ctx, gameState.time, width, height, darkMode);

    // Draw wind indicators
    drawWindIndicators(ctx, gameState.wind, gameState.time, width, height, darkMode);

    // Draw laylines (if beating)
    drawLaylines(ctx, gameState, darkMode);

    // Draw course
    drawCourse(ctx, gameState.course, darkMode);

    // Draw boat trails
    for (const boat of gameState.boats) {
      drawTrail(ctx, boat);
    }

    // Draw boats
    for (const boat of gameState.boats) {
      drawBoat(ctx, boat, gameState.wind, darkMode);
    }

    // Draw rule violation indicator
    if (gameState.currentViolation) {
      drawViolationIndicator(ctx, gameState.currentViolation.position);
    }
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

function drawWaterRipples(ctx: CanvasRenderingContext2D, time: number, width: number, height: number, darkMode: boolean) {
  ctx.save();
  ctx.globalAlpha = darkMode ? 0.08 : 0.12;
  ctx.strokeStyle = darkMode ? '#60a5fa' : '#0369a1';
  ctx.lineWidth = 0.5;

  for (let i = 0; i < 15; i++) {
    const y = ((i * 60 + time * 8) % (height + 60)) - 30;
    ctx.beginPath();
    for (let x = 0; x < width; x += 4) {
      const offset = Math.sin((x + time * 20 + i * 40) * 0.02) * 3;
      if (x === 0) ctx.moveTo(x, y + offset);
      else ctx.lineTo(x, y + offset);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawWindIndicators(ctx: CanvasRenderingContext2D, wind: Wind, time: number, width: number, height: number, darkMode: boolean) {
  const currentWind = getWindAtTime(wind, time);
  // Show wind FROM direction (arrows point the direction wind is coming FROM = toward windward mark)
  const windFromRad = degToRad(currentWind.direction + 180);

  ctx.save();
  ctx.globalAlpha = darkMode ? 0.15 : 0.2;
  ctx.strokeStyle = darkMode ? '#94a3b8' : '#64748b';
  ctx.lineWidth = 1;

  const spacing = 70;
  for (let x = spacing; x < width; x += spacing) {
    for (let y = spacing; y < height; y += spacing) {
      const offset = Math.sin((x + y) * 0.01 + time) * 3;
      const arrowLen = 10;

      ctx.save();
      ctx.translate(x + offset, y);
      ctx.rotate(windFromRad);

      ctx.beginPath();
      ctx.moveTo(0, arrowLen);
      ctx.lineTo(0, -arrowLen);
      ctx.moveTo(0, -arrowLen);
      ctx.lineTo(-3, -arrowLen + 6);
      ctx.moveTo(0, -arrowLen);
      ctx.lineTo(3, -arrowLen + 6);
      ctx.stroke();

      ctx.restore();
    }
  }
  ctx.restore();
}

function drawLaylines(ctx: CanvasRenderingContext2D, gameState: GameState, darkMode: boolean) {
  const windwardMark = gameState.course.marks.find(m => m.type === 'windward');
  if (!windwardMark) return;

  const currentWind = getWindAtTime(gameState.wind, gameState.time);
  const tackAngle = 45;

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 1.5;

  // Port layline
  ctx.strokeStyle = '#ef4444';
  const portAngle = degToRad(currentWind.direction + tackAngle);
  ctx.beginPath();
  ctx.moveTo(windwardMark.position.x, windwardMark.position.y);
  ctx.lineTo(
    windwardMark.position.x + Math.sin(portAngle) * 400,
    windwardMark.position.y - Math.cos(portAngle) * 400
  );
  ctx.stroke();

  // Starboard layline
  ctx.strokeStyle = '#22c55e';
  const stbdAngle = degToRad(currentWind.direction - tackAngle);
  ctx.beginPath();
  ctx.moveTo(windwardMark.position.x, windwardMark.position.y);
  ctx.lineTo(
    windwardMark.position.x + Math.sin(stbdAngle) * 400,
    windwardMark.position.y - Math.cos(stbdAngle) * 400
  );
  ctx.stroke();

  ctx.restore();
}

function drawCourse(ctx: CanvasRenderingContext2D, course: Course, darkMode: boolean) {
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
  ctx.strokeStyle = darkMode ? '#a78bfa' : '#7c3aed';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(course.finishLine.port.x, course.finishLine.port.y);
  ctx.lineTo(course.finishLine.starboard.x, course.finishLine.starboard.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Draw marks
  for (const mark of course.marks) {
    ctx.save();

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

    // Mark body
    ctx.fillStyle = markColor;
    ctx.beginPath();
    ctx.arc(mark.position.x, mark.position.y, mark.radius, 0, Math.PI * 2);
    ctx.fill();

    // Mark outline
    ctx.strokeStyle = darkMode ? '#ffffff' : '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Mark label
    ctx.fillStyle = darkMode ? '#e2e8f0' : '#1e293b';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(mark.label, mark.position.x, mark.position.y - mark.radius - 8);

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

function drawTrail(ctx: CanvasRenderingContext2D, boat: Boat) {
  if (boat.trail.length < 2) return;

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  for (let i = 1; i < boat.trail.length; i++) {
    const alpha = (i / boat.trail.length) * 0.4;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = boat.color;
    ctx.beginPath();
    ctx.moveTo(boat.trail[i - 1].x, boat.trail[i - 1].y);
    ctx.lineTo(boat.trail[i].x, boat.trail[i].y);
    ctx.stroke();
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
    ctx.fillText('360°', x, y - 24);
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
  ctx.font = 'bold 18px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚠', position.x, position.y - 35);
  ctx.restore();
}

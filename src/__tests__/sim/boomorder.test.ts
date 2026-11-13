// The booms run straight along the sails' feet while the feet curve out into the belly: seen from
// leeward (the belly's side) the sail hides its boom; seen from windward the boom is in front.
import { describe, expect, it } from 'vitest';
import { drawBoat3d, type Pose } from '@/components/race-simulator/boat3d';

/** A canvas that only remembers what was filled and stroked, in order, and in what colour. */
function recorder() {
  const log: { op: 'fill' | 'stroke'; style: string; cap: string; alpha: number }[] = [];
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', font: '', textAlign: 'left', textBaseline: 'alphabetic' };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'fill') return () => log.push({ op: 'fill', style: String(t.fillStyle), cap: String(t.lineCap), alpha: Number(t.globalAlpha) });
      if (k === 'stroke') return () => log.push({ op: 'stroke', style: String(t.strokeStyle), cap: String(t.lineCap), alpha: Number(t.globalAlpha) });
      if (k === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 0 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      return () => undefined;
    },
    set(t, k: string, v) { t[k] = v; return true; },
  };
  return { ctx: new Proxy(ctx, handler) as unknown as CanvasRenderingContext2D, log };
}

const pose = { cls: 'IOM', rig: 'A', x: 0, y: 0, hdg: 0, heel: -6, pitch: 0, heave: 0, sd: -1, boom: 22, jib: 24, luff: 0,
  color: '#2E6FD8', luffTape: '#2E6FD8', ink: '#1C2B4A', deck: '#E9EDF2', sail: '58', country: 'AUS', spd: 0.8, hullSpeed: 1.25, isPlayer: true, alpha: 1 } as unknown as Pose;

function order(camX: number) {
  const cam: [number, number, number] = [camX, -0.4, 0.9];
  const P = (x: number, y: number, z: number) => {
    // A camera looking back at the boat across the x axis.
    const dx = x - cam[0], dy = y - cam[1], dz = z - cam[2];
    const depth = Math.abs(dx) + 0.01;
    return { x: 500 + (dy / depth) * 800 * Math.sign(-camX), y: 400 - (dz / depth) * 800, z: depth };
  };
  const { ctx, log } = recorder();
  drawBoat3d(ctx, pose, { P, F: 800, dpr: 1, cam, t: 0 });
  // The booms (round-ended, in the spar colour; the mast is square-ended) and the sail panels (the only things painted at 95%), in the order drawn.
  const seq = log.map(e => (e.op === 'stroke' && e.style === '#3A404C' && e.cap === 'round' ? 'B' : e.op === 'fill' && Math.abs(e.alpha - 0.95) < 1e-6 ? 'S' : '')).filter(Boolean);
  return seq.filter((x, k) => k === 0 || x !== seq[k - 1]).join('');
}

describe('Booms and sails', () => {
  it('from leeward (the side the sails are out on), each boom is drawn before its sail, so the sail covers it', () => {
    // Sails out to port (sd −1): port is −x here. Both booms, each straight before its sail's panels.
    expect(order(-3)).toBe('BSBS');
  });
  it('from windward, each boom is drawn over its sail', () => {
    expect(order(3)).toBe('SBSB');
  });
});

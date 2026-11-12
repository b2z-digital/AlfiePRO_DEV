// Your yacht on the water, on her own: the same model and the same painter as a race, turning
// slowly so you can see all of her. Drag to turn her yourself. The camera moves in on whatever
// you're working on (her hull, the jib's luff, the corners of her sails, her number).
import { useEffect, useRef } from 'react';
import type { ClassId } from '@/sim/classes';
import { DEG } from '@/sim/math';
import type { BoatLook } from '@/sim/types';
import { trim } from './bank';
import { drawBoat3d, drawReflection, modelSize, type DrawOpts, type Pose } from './boat3d';

export type StagePart = 'all' | 'hull' | 'tapes' | 'patches' | 'number';

interface Shot { /** What the camera looks at, in the boat's frame (m): forward, up. */ fx: number; z: number; /** How far back, m. */ dist: number; pitch: number; /** The side to settle on (degrees round from dead ahead), or null to keep turning. */ yaw: number | null }

function shotFor(part: StagePart, cls: ClassId): Shot {
  const s = modelSize(cls);
  const whole = Math.max(s.mastH * 1.12, s.L * 1.25);
  switch (part) {
    // (From a little above, so her deck and its patches show as she turns.)
    case 'hull': return { fx: 0, z: 0.12 * s.L, dist: s.L * 1.75, pitch: 24, yaw: null };
    case 'tapes': return { fx: (s.mastX + s.jibX) / 2, z: s.mastH * 0.42, dist: whole * 1.42, pitch: 7, yaw: 64 };
    case 'patches': return { fx: (s.mastX - s.boom + s.jibX) / 2, z: s.mastH * 0.15, dist: Math.max(s.L * 1.5, s.mastH * 0.75), pitch: 9, yaw: 96 };
    case 'number': return { fx: s.mastX - s.boom * 0.3, z: s.mastH * 0.5, dist: whole * 1.42, pitch: 6, yaw: 90 };
    default: return { fx: 0, z: s.mastH * 0.44, dist: whole * 1.55, pitch: 9, yaw: null };
  }
}

/** The shortest way round from one angle to another, degrees. */
const turn = (from: number, to: number) => ((to - from + 540) % 360) - 180;

export default function YachtStage({ cls, look, sail, part = 'all', inset, still, className }: {
  cls: ClassId; look: BoatLook; sail: string; part?: StagePart;
  /** Room taken by panels over the stage (px): she's centred in what's left. */
  inset?: { left?: number; right?: number; top?: number; bottom?: number };
  /** Don't turn her or move the water (a picture, not a stage). */
  still?: boolean; className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // What to draw, read by the frame loop: changing a colour never restarts it.
  const want = useRef({ cls, look, sail, part, inset, still });
  want.current = { cls, look, sail, part, inset, still };

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = { w: 1, h: 1, dpr: 1 };
    const fit = () => {
      const r = cv.getBoundingClientRect();
      size.dpr = Math.min(2, window.devicePixelRatio || 1);
      size.w = Math.max(1, Math.round(r.width)); size.h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(size.w * size.dpr); cv.height = Math.round(size.h * size.dpr);
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(cv);

    // The camera: where it is now, easing towards where the part being worked on wants it.
    const first = shotFor(want.current.part, want.current.cls);
    const cam = { yaw: first.yaw ?? 62, pitch: first.pitch, dist: first.dist, fx: first.fx, z: first.z };
    let lastTouch = -9;
    const drag = { id: -1, x: 0, y: 0 };
    const down = (e: PointerEvent) => { drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; cv.setPointerCapture(e.pointerId); lastTouch = performance.now() / 1000; };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      cam.yaw = (cam.yaw - (e.clientX - drag.x) * 0.45 + 360) % 360;
      cam.pitch = Math.max(3, Math.min(32, cam.pitch + (e.clientY - drag.y) * 0.18));
      drag.x = e.clientX; drag.y = e.clientY; lastTouch = performance.now() / 1000;
    };
    const up = (e: PointerEvent) => { if (e.pointerId === drag.id) { drag.id = -1; lastTouch = performance.now() / 1000; } };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    let raf = 0, last = performance.now(), shownPart: StagePart | null = null, shownCls: ClassId | null = null;
    const frame = (nowMs: number) => {
      const now = nowMs / 1000, dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const W = want.current, { w, h, dpr } = size;
      const shot = shotFor(W.part, W.cls);
      // A new part (or a new boat) takes the camera back from your hand.
      if (shownPart !== W.part || shownCls !== W.cls) { shownPart = W.part; shownCls = W.cls; lastTouch = -9; }
      const held = drag.id >= 0, resting = now - lastTouch > 4;
      const k = W.still ? 1 : 1 - Math.exp(-dt * 3.2);
      cam.dist += (shot.dist - cam.dist) * k; cam.fx += (shot.fx - cam.fx) * k; cam.z += (shot.z - cam.z) * k;
      // Left alone for a few seconds she goes back to the view for the part in hand: a set side,
      // or turning slowly on the spot.
      if (!held && resting) {
        cam.pitch += (shot.pitch - cam.pitch) * k;
        if (shot.yaw !== null) cam.yaw = (cam.yaw + turn(cam.yaw, shot.yaw) * k + 360) % 360;
        else if (!calm && !W.still) cam.yaw = (cam.yaw + dt * 9) % 360;
      }

      // She sits head to wind-ish, close-hauled on starboard, heeling a little and riding a slow swell.
      const t = W.still || calm ? 0 : now;
      const hull = W.look.hull, tr = trim(hull);
      const pose: Pose = {
        cls: W.cls, rig: 'A', x: 0, y: 0, hdg: 0,
        heel: 9 + Math.sin(t * 0.9) * 1.6, pitch: Math.sin(t * 0.7 + 1) * 1.1, heave: Math.sin(t * 1.1) * 0.006,
        sd: -1, boom: 13, jib: 15, luff: 0,
        color: hull, luffTape: W.look.jibLuff, patch: W.look.patch, hatch: W.look.deckPatch, ink: '#14327A', deck: W.look.deck ?? tr.deck, bottom: W.look.bottom,
        sail: W.sail, country: W.look.country ?? 'AUS', spd: 0, hullSpeed: 1, isPlayer: true, alpha: 1,
      };
      // The camera looks at a point on her centreline from `dist` away, round at `yaw`, down by `pitch`.
      const cy = Math.cos(cam.yaw * DEG), sy = Math.sin(cam.yaw * DEG), cp = Math.cos(cam.pitch * DEG), sp = Math.sin(cam.pitch * DEG);
      const f = { x: -sy * cp, y: -cy * cp, z: -sp }, r = { x: -cy, y: sy }, u = { x: -sy * sp, y: -cy * sp, z: cp };
      const eye = { x: -f.x * cam.dist, y: cam.fx - f.y * cam.dist, z: Math.max(0.06, cam.z - f.z * cam.dist) };
      const il = W.inset?.left ?? 0, ir = W.inset?.right ?? 0, it = W.inset?.top ?? 0, ib = W.inset?.bottom ?? 0;
      const vw = Math.max(120, w - il - ir), vh = Math.max(120, h - it - ib);
      const cx = il + vw / 2, cyy = it + vh / 2;
      // Fit by the smaller of the free width and height (a 36 degree lens across it).
      const F = (Math.min(vw * 1.25, vh) / 2) / Math.tan(18 * DEG);
      const P = (x: number, y: number, z: number) => {
        const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
        const zc = dx * f.x + dy * f.y + dz * f.z, zz = Math.max(0.05, zc);
        return { x: cx + ((dx * r.x + dy * r.y) / zz) * F, y: cyy - ((dx * u.x + dy * u.y + dz * u.z) / zz) * F, z: zc };
      };
      const o: DrawOpts = { P, F, dpr, cam: [eye.x, eye.y, eye.z], t: now, ambient: 0.84 };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Dusk on the pond: sky, a glow along the far bank, dark water.
      const hz = Math.max(0, Math.min(h, cyy - Math.tan(cam.pitch * DEG) * F));
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, '#060B1C'); sky.addColorStop(0.55, '#0E1C44'); sky.addColorStop(1, '#27448E');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hz);
      const water = ctx.createLinearGradient(0, hz, 0, h);
      water.addColorStop(0, '#1A3272'); water.addColorStop(0.18, '#0F2254'); water.addColorStop(1, '#060D24');
      ctx.fillStyle = water; ctx.fillRect(0, hz, w, h - hz);
      const glow = ctx.createRadialGradient(cx, hz, 0, cx, hz, Math.max(w, h) * 0.55);
      glow.addColorStop(0, 'rgba(120,150,255,0.30)'); glow.addColorStop(0.4, 'rgba(138,77,255,0.10)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      // The far bank: a low line of trees along the horizon.
      ctx.fillStyle = 'rgba(6,12,30,0.85)';
      ctx.beginPath(); ctx.moveTo(0, hz + 1);
      for (let x = 0; x <= w; x += 14) { const a = (x + cam.yaw * 9) * 0.013; ctx.lineTo(x, hz - 5 - 4 * Math.sin(a * 3.1) - 3 * Math.sin(a * 7.7 + 1)); }
      ctx.lineTo(w, hz + 1); ctx.closePath(); ctx.fill();
      // Light on the water under her, and rings going out from her hull.
      const L = modelSize(W.cls).L;
      const ring = (rad: number) => { ctx.beginPath(); for (let a = 0; a <= 40; a++) { const q = P(Math.sin((a / 40) * Math.PI * 2) * rad * 0.62, Math.cos((a / 40) * Math.PI * 2) * rad, 0); if (a === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); } ctx.closePath(); };
      // (A round pool of light lying on the water: squashed by how low the camera is.)
      const c0 = P(0, 0, 0), side = P(r.x * L * 1.7, r.y * L * 1.7, 0), near = P(sy * L * 1.7, cy * L * 1.7, 0);
      const rx = Math.max(40, Math.abs(side.x - c0.x)), ry = Math.max(8, Math.abs(near.y - c0.y));
      ctx.save();
      ctx.translate(c0.x, c0.y); ctx.scale(1, ry / rx);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      pool.addColorStop(0, 'rgba(120,170,255,0.30)'); pool.addColorStop(0.6, 'rgba(110,160,255,0.10)'); pool.addColorStop(1, 'rgba(110,160,255,0)');
      ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 4; i++) {
        const ph = ((t * 0.12 + i / 4) % 1), rad = L * (0.62 + ph * 1.5);
        ctx.strokeStyle = `rgba(170,205,255,${(0.16 * (1 - ph)).toFixed(3)})`; ctx.lineWidth = 1.2;
        ring(rad); ctx.stroke();
      }
      drawReflection(ctx, pose, o, 0.085);
      drawBoat3d(ctx, pose, o);
      // The edges fall away into the dark.
      const vg = ctx.createRadialGradient(cx, cyy, Math.min(vw, vh) * 0.42, cx, cyy, Math.max(w, h) * 0.85);
      vg.addColorStop(0, 'rgba(4,8,20,0)'); vg.addColorStop(1, 'rgba(4,8,20,0.72)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      if (!W.still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); };
    // A picture is drawn again when its box changes size.
    const ro2 = want.current.still && typeof ResizeObserver === 'function' ? new ResizeObserver(redraw) : null;
    ro2?.observe(cv);
    return () => {
      cancelAnimationFrame(raf); ro?.disconnect(); ro2?.disconnect();
      cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
    };
    // (A still picture is drawn afresh when what it shows changes; a live stage reads it every frame.)
  }, [still, still ? cls : null, still ? sail : null, still ? JSON.stringify(look) : null]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={canvas} className={className} style={{ touchAction: 'none', cursor: still ? undefined : 'grab' }} role="img" aria-label={`Your ${cls} from the side, sail number ${sail}`} />;
}

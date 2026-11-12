// Bank view: the race as a radio sailor sees it, standing in the control area on the bank and
// turning to follow their boat. A small perspective renderer on the 2D canvas: the sky and the far
// banks, the pond with its puffs, ripples and waves, the buoys and the start line, and every boat
// in 3D, heeled to the wind and moving on the waves, with mainsail and jib set to her sheet.
import { creditLine } from '@/sim/venue';
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import { DEFAULT_LOOK } from '@/sim/look';
import { DEG, dir, n180 } from '@/sim/math';
import { seaLevel } from '@/sim/sea';
import type { WorldOverlay } from '@/sim/scene';
import { DrawOpts, Pose, drawBoat3d, drawReflection, onWaves, rigFor, sailSet, twaFor } from './boat3d';
import { drawCredit, drawVenueScene } from './bankVenue';
import { drawGusts, drawRipples, drawWakes, drawWaves } from './bankWater';

interface V2 { x: number; y: number }
interface Proj { x: number; y: number; z: number }

export interface BankCam {
  x: number; y: number; z: number;
  /** Compass heading the camera looks along, and how far down it looks (degrees). */
  yaw: number; pitch: number;
  /** Horizontal field of view, degrees. */
  fov: number;
  ready: boolean;
}

/** Eye height above the water: a skipper standing on a low bank. */
const EYE = 2.1;
const NEAR = 0.35;

export function newBankCam(): BankCam { return { x: 0, y: 0, z: EYE, yaw: 0, pitch: 3, fov: 50, ready: false }; }


/**
 * Where on the control area a skipper stands to watch a boat at `target`. They walk the bank to stay
 * in touch with her, but only so far: never further down the course than a good way above the
 * leeward gate, nor further up it than short of the windward mark, so both are always looked down
 * (or up) on from the side, never back at from beyond them. `sight`: stand where the start and
 * finish line runs into the bank, to look straight down it, as you do for a start or a close finish
 * (when the bank runs along the line instead, there's no such place, and you stand as near as you can).
 */
export function bankStation(race: Race, target: V2, sight: boolean): V2 {
  const c = race.course, L = c.L;
  const ca = race.controlArea();
  const ex = ca.b.x - ca.a.x, ey = ca.b.y - ca.a.y, el2 = ex * ex + ey * ey || 1;
  // How far up the course each end of the control area is, and so the stretch of it you walk.
  const along = (x: number, y: number) => (x - c.origin.x) * c.up.x + (y - c.origin.y) * c.up.y;
  const a0 = along(ca.a.x, ca.a.y), da = along(ca.b.x, ca.b.y) - a0;
  const gate = along(c.byId.GP.p.x, c.byId.GP.p.y), top = along(c.byId.W.p.x, c.byId.W.p.y);
  const lo = gate + Math.max(6 * L, 0.4 * -gate), hi = top - 4 * L;
  let u0 = 0, u1 = 1;
  if (Math.abs(da) > 1e-6) {
    const ua = (lo - a0) / da, ub = (hi - a0) / da;
    u0 = Math.max(0, Math.min(ua, ub)); u1 = Math.min(1, Math.max(ua, ub));
    // None of the control area is in that stretch: the end of it nearest the stretch.
    if (u0 > u1) u0 = u1 = Math.abs(a0 - (lo + hi) / 2) < Math.abs(a0 + da - (lo + hi) / 2) ? 0 : 1;
  }
  let u = Math.max(u0, Math.min(u1, ((target.x - ca.a.x) * ex + (target.y - ca.a.y) * ey) / el2));
  if (sight) {
    const P = c.start.pin, S = c.start.stbd, dx = S.x - P.x, dy = S.y - P.y;
    const den = ex * dy - ey * dx;
    if (Math.abs(den) > 0.15 * Math.sqrt(el2) * Math.hypot(dx, dy)) u = Math.max(0, Math.min(1, ((P.x - ca.a.x) * dy - (P.y - ca.a.y) * dx) / den));
  }
  return { x: ca.a.x + ex * u, y: ca.a.y + ey * u };
}

/**
 * Stand in the control area and watch her, as a skipper does: you stay put (wandering only slowly
 * along the control area towards where she is, see bankStation), she sails across your view, and you
 * turn your head only when she nears the edge of it. As she gets far away the view closes in a
 * little, the way you peer at a distant boat, but never much. Glancing (holding M) turns straight to
 * the mark. `sight`: stand on the start and finish line, looking down it.
 */
export function followCam(cam: BankCam, race: Race, target: V2, dt: number, zoom: number, glance: boolean, sight = false) {
  const L = race.course.L;
  const want = bankStation(race, target, sight);
  // With your boat right in at the bank, step back up it a little, so you can still see her whole.
  const ox = want.x - target.x, oy = want.y - target.y, od = Math.hypot(ox, oy);
  const stepBack = Math.max(0, 7 * L - od);
  if (stepBack > 0 && od > 0.01) { want.x += (ox / od) * stepBack; want.y += (oy / od) * stepBack; }
  const snap = !cam.ready;
  // A walk along the bank: unhurried, a little brisker to get to the line for a finish.
  const kWalk = snap ? 1 : Math.min(1, dt * (sight ? 0.3 : 0.15));
  cam.x += (want.x - cam.x) * kWalk; cam.y += (want.y - cam.y) * kWalk;
  cam.z = EYE;
  let yawTo = Math.atan2(target.x - cam.x, target.y - cam.y) / DEG;
  const d = Math.hypot(target.x - cam.x, target.y - cam.y);
  let fovAuto = Math.max(30, Math.min(50, 50 * Math.sqrt((20 * L) / Math.max(1, d))));
  if (sight && !glance) {
    // Sighting the line: it runs away from you up the middle of the view, with your boat to one
    // side of it. Look between the two, wide enough for both; when she's too far off the line for
    // that, stay with her.
    const st = race.course.start;
    const far = Math.hypot(st.pin.x - cam.x, st.pin.y - cam.y) > Math.hypot(st.stbd.x - cam.x, st.stbd.y - cam.y) ? st.pin : st.stbd;
    const off = n180(yawTo - Math.atan2(far.x - cam.x, far.y - cam.y) / DEG);
    fovAuto = Math.min(66, Math.max(fovAuto, Math.abs(off) / 0.6 + 8));
    yawTo = n180(yawTo - Math.sign(off) * Math.min(Math.abs(off) / 2, 0.3 * fovAuto));
  }
  const fov = Math.max(6, Math.min(75, fovAuto / zoom));
  const pitch = (Math.atan2(cam.z, Math.max(1.5, d)) / DEG) * 0.82 + 0.4;
  if (snap) { cam.yaw = yawTo; cam.pitch = pitch; cam.fov = fov; cam.ready = true; return; }
  // She roams the middle third of the view; past that you turn with her, smoothly.
  const off = n180(yawTo - cam.yaw);
  const dz = glance ? 0 : cam.fov * (sight ? 0.04 : 0.16);
  const excess = Math.abs(off) > dz ? off - Math.sign(off) * dz : 0;
  cam.yaw += excess * Math.min(1, dt * (glance ? 3 : 1.4));
  cam.pitch += (pitch - cam.pitch) * Math.min(1, dt * 1.2);
  cam.fov += (fov - cam.fov) * Math.min(1, dt * 0.8);
}

export interface BankView {
  P: (x: number, y: number, z: number) => Proj;
  /** Screen points of a polygon on the water, clipped to what's in front of you. */
  ground: (pts: V2[]) => Proj[];
  /** Depth of a point on the water in front of the camera. */
  depth: (x: number, y: number) => number;
  F: number; w: number; h: number;
}

function makeView(cam: BankCam, w: number, h: number): BankView {
  const cy = Math.cos(cam.yaw * DEG), sy = Math.sin(cam.yaw * DEG);
  const cp = Math.cos(cam.pitch * DEG), sp = Math.sin(cam.pitch * DEG);
  // Camera basis: forward (looking down by the pitch), right, and up.
  const f = { x: sy * cp, y: cy * cp, z: -sp };
  const r = { x: cy, y: -sy };
  const u = { x: sy * sp, y: cy * sp, z: cp };
  const F = (w / 2) / Math.tan((cam.fov / 2) * DEG);
  const P = (x: number, y: number, z: number): Proj => {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const zc = dx * f.x + dy * f.y + dz * f.z;
    const xc = dx * r.x + dy * r.y;
    const yc = dx * u.x + dy * u.y + dz * u.z;
    const zz = Math.max(0.05, zc);
    return { x: w / 2 + (xc / zz) * F, y: h / 2 - (yc / zz) * F, z: zc };
  };
  const depth = (x: number, y: number) => (x - cam.x) * f.x + (y - cam.y) * f.y - cam.z * f.z;
  const ground = (pts: V2[]): Proj[] => {
    const out: Proj[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const za = depth(a.x, a.y) - NEAR, zb = depth(b.x, b.y) - NEAR;
      if (za >= 0) out.push(P(a.x, a.y, 0));
      if ((za >= 0) !== (zb >= 0)) { const k = za / (za - zb); out.push(P(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 0)); }
    }
    return out;
  };
  return { P, ground, depth, F, w, h };
}

/** Blend two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((p >> sh) & 255) * (1 - t) + ((q >> sh) & 255) * t);
  return `#${[16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

function hash(i: number, j: number) {
  let hh = (i * 374761393 + j * 668265263) | 0;
  hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
  return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
}

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function path(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], close = true) {
  ctx.beginPath();
  pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  if (close) ctx.closePath();
}

/** A line on the water, clipped to what's in front of you. */
function groundLine(ctx: CanvasRenderingContext2D, V: BankView, pts: V2[], closed: boolean) {
  ctx.beginPath();
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const za = V.depth(a.x, a.y) - NEAR, zb = V.depth(b.x, b.y) - NEAR;
    if (za < 0 && zb < 0) continue;
    let a2 = a, b2 = b;
    if (za < 0) { const k = za / (za - zb); a2 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    if (zb < 0) { const k = za / (za - zb); b2 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    const p1 = V.P(a2.x, a2.y, 0.004), p2 = V.P(b2.x, b2.y, 0.004);
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, size = 12, weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,11,22,0.6)'; ctx.fillText(s, x + 0.8, y + 0.8);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

export interface BankOptions {
  w: number; h: number; dpr: number; cam: BankCam;
  /** What you're sailing to: drawn with its name, and pointed to when it's out of view. */
  next: { x: number; y: number; name: string } | null;
  showZones: boolean;
  preStart: boolean;
  flashes: { x: number; y: number; t: number }[];
  overlays?: WorldOverlay[];
  names?: boolean;
  /** Draw boats this many steps back in their history (instant replay). */
  back: number;
  /** A ghost to race: another member's boat from their own race (her race, for her pose), drawn faint. */
  ghost?: { race: Race; b: Boat; label: string } | null;
  /** How much detail the water gets: 2 full, 1 less, 0 the least (for slower devices). */
  detail?: number;
  /** The map credit in the corner (off on a phone, which shows it under your boat's line). */
  credit?: boolean;
}

export function drawBank(ctx: CanvasRenderingContext2D, race: Race, v: BankOptions) {
  const { w, h, dpr, cam } = v;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const V = makeView(cam, w, h);
  const { P } = V;
  const c = race.course, B = c.bounds, L = c.L;
  const t = race.t;
  const at = (al: number, ac: number): V2 => ({ x: c.origin.x + c.up.x * al + c.right.x * ac, y: c.origin.y + c.up.y * al + c.right.y * ac });

  // ── Sky, haze and the land ──
  const fw = dir(cam.yaw);
  const hz = P(cam.x + fw.x * 4000, cam.y + fw.y * 4000, 0).y; // the horizon
  const sky = ctx.createLinearGradient(0, Math.min(0, hz - h), 0, Math.max(1, hz));
  sky.addColorStop(0, '#3F6FA8'); sky.addColorStop(0.7, '#8DB3D6'); sky.addColorStop(1, '#C9DCEB');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, Math.max(0, hz) + 1);
  const land = ctx.createLinearGradient(0, hz, 0, h);
  land.addColorStop(0, '#7E9C8C'); land.addColorStop(0.06, '#56744D'); land.addColorStop(1, '#3B5634');
  ctx.fillStyle = land;
  ctx.fillRect(0, Math.max(0, hz), w, h);

  // At a venue, the real lake and its banks; on the practice pond, a tree-lined pond.
  let waterClip: (() => void) | null = null;
  if (race.venue) {
    waterClip = drawVenueScene(ctx, V, race, cam, hz);
  } else {
    // Distant tree line beyond the pond, then the pond itself.
    const pond = [at(B.alongMin, -B.across), at(B.alongMax, -B.across), at(B.alongMax, B.across), at(B.alongMin, B.across)];
    // Trees round the pond: crowns lit from the sun's side, softer and hazier the further away they are.
    const trees = (back: number, n: number, hMin: number, hVar: number, color: string, seed: number) => {
      const crowns: { d: number; draw: () => void }[] = [];
      for (let e = 0; e < 4; e++) {
        const a = pond[e], b2 = pond[(e + 1) % 4];
        const ex = b2.x - a.x, ey = b2.y - a.y, el = Math.hypot(ex, ey) || 1;
        const out = { x: -ey / el, y: ex / el }; // the pond runs anticlockwise, so this points away from it
        for (let k = 0; k < n; k++) {
          const u = (k + hash(k, e + seed)) / n;
          const off = back * L * (1 + hash(e + seed, k) * 0.8);
          const gx = a.x + ex * u + out.x * off, gy = a.y + ey * u + out.y * off;
          const d = V.depth(gx, gy);
          if (d < 4) continue;
          const base = P(gx, gy, 0);
          if (base.x < -200 || base.x > w + 200) continue;
          const tall = hash(k * 3 + seed, e + 5) > 0.86; // the odd tall, narrow one
          const ht = (hMin + hash(k + seed, e) * hVar) * (tall ? 1.3 : 1);
          const top = P(gx, gy, ht);
          const wpx = Math.max(2, ((ht * (tall ? 0.34 : 0.55 + hash(e, k + seed) * 0.5)) / d) * V.F);
          const hpx = Math.max(1, (base.y - top.y) / 2);
          const haze = Math.max(0, Math.min(0.55, (d - 22) / 110));
          const col = mix(color, '#9FB4BC', haze), lit = mix(col, '#A9C49A', 0.28);
          crowns.push({ d, draw: () => {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.ellipse(base.x, base.y - hpx, wpx / 2, hpx, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = lit;
            ctx.beginPath(); ctx.ellipse(base.x - wpx * 0.14, base.y - hpx * 1.18, wpx * 0.3, hpx * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          } });
        }
      }
      crowns.sort((p1, p2) => p2.d - p1.d);
      for (const c2 of crowns) c2.draw();
    };
    // Check the pond runs the way `trees` expects (its outward normal), and flip it if not.
    {
      const a = pond[0], b2 = pond[1], cx0 = (pond[0].x + pond[2].x) / 2, cy0 = (pond[0].y + pond[2].y) / 2;
      const out = { x: -(b2.y - a.y), y: b2.x - a.x };
      if ((a.x - cx0) * out.x + (a.y - cy0) * out.y < 0) pond.reverse();
    }
    // Hazy hills on the horizon, then the far tree line.
    {
      ctx.fillStyle = '#9DB2B9';
      ctx.beginPath(); ctx.moveTo(0, hz + 2);
      for (let k = 0; k <= 48; k++) {
        const x = (w * k) / 48, a = cam.yaw + ((x - w / 2) / V.F) * (180 / Math.PI);
        ctx.lineTo(x, hz - 6 - 16 * (0.5 + 0.3 * Math.sin(a * 0.07 + 1.3) + 0.2 * Math.sin(a * 0.23 + 0.4)));
      }
      ctx.lineTo(w, hz + 2); ctx.closePath(); ctx.fill();
    }
    trees(14, 40, 3, 2.5, '#4E6E5A', 11);

    const water = V.ground(pond);
    if (water.length > 2) {
      const wg = ctx.createLinearGradient(0, hz, 0, h);
      wg.addColorStop(0, '#9DB8CF'); wg.addColorStop(0.035, '#5F86A8'); wg.addColorStop(0.25, '#2F577E'); wg.addColorStop(1, '#173A5E');
      ctx.fillStyle = wg;
      path(ctx, water); ctx.fill();
      ctx.strokeStyle = 'rgba(220,235,220,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      waterClip = () => path(ctx, water);
    }
    trees(4, 52, 1.4, 1.8, '#2F4A32', 3);
  }

  // ── Every boat's pose (live, or from her history in a replay) ──
  const o: DrawOpts = { P, F: V.F, dpr, cam: [cam.x, cam.y, cam.z], t };
  const posed: { b: Boat; pose: Pose; d: number }[] = [];
  race.boats.forEach((b, i) => {
    const H = race.hist[i];
    const kk = H.x.length - 1 - v.back;
    const live = v.back <= 0 || kk < 0;
    const bx = live ? b.x : H.x[kk], by = live ? b.y : H.y[kk], bh = live ? b.hdg : H.hdg[kk];
    const d = V.depth(bx, by);
    if (d < 0.7) return;
    posed.push({ b, pose: poseOf(race, b, bx, by, bh, live ? b.spd : H.spd[kk], live ? b.heel : H.heel[kk] ?? b.heel), d });
  });

  // ── On the water, under one clip to its shore (clipping is the slow part): the wind's ripples,
  // gusts and lulls, the waves, each boat's reflection, then the wakes ──
  ctx.save();
  if (waterClip) { waterClip(); ctx.clip('evenodd'); }
  const detail = v.detail ?? 2;
  // The wind's ripples and the waves are always there, however slow the device: they're how you
  // read the wind and the sea. Less detail only makes them coarser.
  drawRipples(ctx, V, race, cam, hz, detail);
  drawGusts(ctx, V, race, hz, detail);
  drawWaves(ctx, V, race, cam, detail);
  // Waves break a boat's reflection up: clear on flat water, a faint shimmer in waves.
  // And a breeze ripples them away even on flat water.
  const reflect = (!race.sea ? 0.3 : race.sea.kind === 'chop' ? 0.08 : 0.035) * (1 - 0.7 * Math.min(1, Math.max(0, (race.wind.meanTws(t) / 0.514444 - 3) / 11)));
  for (const q of posed) drawReflection(ctx, q.pose, o, reflect);
  drawWakes(ctx, V, race, posed.map(q => ({ i: race.boats.indexOf(q.b), pose: q.pose, L: q.b.cls.loa, beam: q.b.cls.beam, hullSpeed: q.b.cls.hullSpeed })), v.back, detail);
  ctx.restore();

  // ── The course: start line, zone, teaching marks ──
  ctx.lineCap = 'butt';
  ctx.setLineDash([9, 7]);
  ctx.strokeStyle = v.preStart ? 'rgba(255,190,80,0.9)' : 'rgba(255,190,80,0.5)';
  ctx.lineWidth = 1.6;
  groundLine(ctx, V, [c.start.pin, c.start.stbd], false);
  if (v.showZones && v.next) {
    const ring: V2[] = [];
    for (let k = 0; k < 40; k++) { const ang = (k / 40) * Math.PI * 2; ring.push({ x: v.next.x + Math.cos(ang) * 4 * L, y: v.next.y + Math.sin(ang) * 4 * L }); }
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    groundLine(ctx, V, ring, true);
  }
  for (const ov of v.overlays ?? []) {
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(77,163,255,0.9)'; ctx.lineWidth = 1.6;
    if (ov.kind === 'segment') groundLine(ctx, V, [{ x: ov.x1, y: ov.y1 }, { x: ov.x2, y: ov.y2 }], false);
    else {
      const ring: V2[] = [];
      for (let k = 0; k < 28; k++) { const ang = (k / 28) * Math.PI * 2; ring.push({ x: ov.x + Math.cos(ang) * ov.r, y: ov.y + Math.sin(ang) * ov.r }); }
      groundLine(ctx, V, ring, true);
    }
  }
  ctx.setLineDash([]);
  // Incident flashes: a ring spreading on the water.
  for (const fl of v.flashes) {
    const age = t - fl.t;
    if (age < 0 || age > 1.6) continue;
    const ring: V2[] = [];
    const rr = (0.6 + age * 2.2) * L;
    for (let k = 0; k < 28; k++) { const ang = (k / 28) * Math.PI * 2; ring.push({ x: fl.x + Math.cos(ang) * rr, y: fl.y + Math.sin(ang) * rr }); }
    ctx.strokeStyle = `rgba(255,120,90,${0.9 * (1 - age / 1.6)})`; ctx.lineWidth = 2.2;
    groundLine(ctx, V, ring, true);
  }

  // ── Everything standing on the water, far to near: buoys and boats ──
  type Item = { z: number; draw: () => void };
  const items: Item[] = [];
  const nextAt = v.next;
  for (const m of c.marks) {
    const base = P(m.p.x, m.p.y, 0);
    if (base.z < NEAR) continue;
    const isNext = !!nextAt && Math.hypot(nextAt.x - m.p.x, nextAt.y - m.p.y) < 0.01;
    items.push({ z: base.z, draw: () => {
      const bob = race.sea ? seaLevel(race.sea, m.p.x, m.p.y, t) * 0.8 : 0;
      const b0 = P(m.p.x, m.p.y, bob), top = P(m.p.x, m.p.y, bob + 0.34);
      const rpx = Math.max(2.2, (m.r / base.z) * V.F);
      const hgt = Math.max(4, b0.y - top.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(b0.x, b0.y, rpx * 1.25, Math.max(1, rpx * 0.3), 0, 0, Math.PI * 2); ctx.fill();
      const gr = ctx.createLinearGradient(b0.x - rpx, 0, b0.x + rpx, 0);
      const pin = m.kind === 'pin' || m.kind === 'start-stbd';
      gr.addColorStop(0, pin ? '#C9A21A' : '#D96B16'); gr.addColorStop(0.45, pin ? '#FFE266' : '#FFB061'); gr.addColorStop(1, pin ? '#B08A10' : '#C25F14');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(b0.x - rpx, b0.y);
      ctx.lineTo(b0.x - rpx * 0.5, b0.y - hgt);
      ctx.lineTo(b0.x + rpx * 0.5, b0.y - hgt);
      ctx.lineTo(b0.x + rpx, b0.y);
      ctx.closePath(); ctx.fill();
      const name = m.kind === 'pin' ? 'Pin' : m.kind === 'start-stbd' ? 'Start' : m.label === '1' ? 'Mark 1' : m.label;
      if (isNext) {
        const yy = b0.y - hgt - 12;
        ctx.fillStyle = '#9CCBFF';
        ctx.beginPath(); ctx.moveTo(b0.x - 5, yy - 5); ctx.lineTo(b0.x + 5, yy - 5); ctx.lineTo(b0.x, yy + 1); ctx.closePath(); ctx.fill();
        label(ctx, name, b0.x, yy - 14, '#CFE5FF', 12.5);
      } else if (base.z < 80) label(ctx, name, b0.x, b0.y - hgt - 10, 'rgba(255,255,255,0.8)', 11.5, 600);
    } });
  }
  for (const q of posed) items.push({ z: q.d, draw: () => drawBankBoat(ctx, V, race, q.b, q.pose, o, v) });
  // The ghost: pale and see-through, with her name.
  if (v.ghost && v.back === 0) {
    const g = v.ghost.b, d = V.depth(g.x, g.y);
    if (d > 0.7) {
      const pose = { ...poseOf(v.ghost.race, g, g.x, g.y, g.hdg, g.spd, g.heel), color: '#E8F1FF', luffTape: '#B9C7DA', patch: null, deck: '#E8F1FF', ink: '#5A6B85', alpha: 0.42, isPlayer: false };
      items.push({ z: d, draw: () => {
        const { top } = drawBoat3d(ctx, pose, o);
        label(ctx, v.ghost!.label, top.x, top.y - 10, 'rgba(232,241,255,0.75)', 11.5, 600);
      } });
    }
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  // ── Where's the mark? An arrow at the edge of the view when it's out of sight ──
  if (nextAt) {
    const q = P(nextAt.x, nextAt.y, 0.3);
    const off = q.z < NEAR || q.x < 24 || q.x > w - 24 || q.y < 24 || q.y > h - 24;
    if (off) {
      // Direction to it on screen; behind you, it's to whichever side is nearer.
      let dx = q.x - w / 2, dy = q.y - h / 2;
      if (q.z < NEAR) { const side = n180(Math.atan2(nextAt.x - cam.x, nextAt.y - cam.y) / DEG - cam.yaw); dx = side >= 0 ? 1 : -1; dy = 0; }
      const k = Math.min((w / 2 - 40) / Math.max(1e-6, Math.abs(dx)), (h / 2 - 70) / Math.max(1e-6, Math.abs(dy)));
      const ax = w / 2 + dx * k, ay = h / 2 + dy * k;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(7,13,27,0.75)';
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9CCBFF';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -7); ctx.lineTo(-2, 0); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
      label(ctx, nextAt.name.replace(/^the /, ''), Math.max(60, Math.min(w - 60, ax)), ay + (ay > h / 2 ? -28 : 28), '#CFE5FF', 12);
    }
  }
  if (race.venue && v.credit !== false) drawCredit(ctx, creditLine(race.venue.def), w, h);
}

/**
 * The corner patches of a boat whose skipper hasn't designed her own: every sail has them, in her
 * hull colour, some plain and some fingers, some with black or white between (by her sail number,
 * so she always looks the same).
 */
function fleetPatch(b: Boat): NonNullable<Pose['patch']> {
  const n = parseInt(b.sail, 10) || 0;
  return { style: n % 3 === 0 ? 'solid' : 'fingers', one: b.color, two: n % 4 === 1 ? '#1B2330' : n % 4 === 3 ? '#FFFFFF' : null };
}

/** The jib luff tape and deck colours that go with a hull colour. */
export function trim(color: string): { tape: string; deck: string } {
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 200;
  const hex = (k: number) => `#${[r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0')).join('')}`;
  return { tape: light ? '#64748B' : hex(0.78), deck: light ? '#DCE2EA' : '#E9EDF2' };
}

/** Where a boat is and how she's sitting, for the 3D model: heel, waves, sails set to her sheet. */
function poseOf(race: Race, b: Boat, bx: number, by: number, bh: number, spd: number, heel: number): Pose {
  const twa = twaFor(b.twd, bh);
  // Live, the sails are on the side her tack puts them; in a replay, the side her heading then did.
  const live = bx === b.x && by === b.y;
  const set = sailSet(twa, b.sheet, b.tws, !!b.disabled, live ? b.tack : undefined);
  const t = trim(b.color);
  const p: Pose = {
    cls: b.cls.id, rig: b.rig ?? rigFor(b.cls.id, race.wind.baseTws / 0.514444),
    x: bx, y: by, hdg: bh,
    // Diving, she pivots about a point well forward: the bow goes under a little and the stern lifts a lot.
    heel, pitch: live ? b.pitch : 0, heave: live ? Math.sin(-b.pitch * DEG) * b.cls.loa * 0.2 : 0, dive: live ? b.dive : 0,
    sd: set.sd, boom: set.boom, jib: set.jib, luff: set.luff,
    color: b.color, ink: b.isPlayer ? '#14327A' : '#151A22', deck: b.look?.deck ?? t.deck, bottom: b.look?.bottom,
    // Her own finish when she has one; your boat before you've designed her is the blue she always was.
    ...(b.look ? { luffTape: b.look.jibLuff, patch: b.look.patch, hatch: b.look.deckPatch }
      : b.isPlayer ? { luffTape: DEFAULT_LOOK.jibLuff, patch: DEFAULT_LOOK.patch }
        : { luffTape: t.tape, patch: fleetPatch(b) }),
    sail: b.sail, country: b.look?.country ?? b.country ?? 'AUS', spd, hullSpeed: b.cls.hullSpeed, isPlayer: b.isPlayer, alpha: b.finished ? 0.5 : 1,
  };
  return onWaves(p, race.sea, race.t);
}

/** How long "You" is called out when the race opens, seconds. */
export const YOU_INTRO = 7;
export const ALFIE = ['#2E7BFF', '#8A4DFF', '#FF3E9A', '#FF8A2B'];

/** A rounded pill in Alfie's colours with white text, pointing down at (x, y). */
export function alfieCallout(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, pulse: number) {
  ctx.save();
  ctx.font = `800 ${15}px ${FONT}`;
  const tw = ctx.measureText(text).width + 30, hh = 30;
  const k = 1 + 0.06 * pulse;
  ctx.translate(x, y); ctx.scale(k, k);
  const g = ctx.createLinearGradient(-tw / 2, 0, tw / 2, 0);
  ALFIE.forEach((c, i) => g.addColorStop(i / (ALFIE.length - 1), c));
  ctx.shadowColor = 'rgba(255,62,154,0.55)'; ctx.shadowBlur = 10 + 10 * pulse;
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-tw / 2, -hh - 9, tw, hh, hh / 2); else ctx.rect(-tw / 2, -hh - 9, tw, hh);
  ctx.moveTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(0, -1); ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -hh / 2 - 9 + 0.5);
  ctx.restore();
}

function drawBankBoat(ctx: CanvasRenderingContext2D, V: BankView, race: Race, b: Boat, pose: Pose, o: DrawOpts, v: BankOptions) {
  const t = race.t;
  // When the race opens: rings spreading on the water round your boat, in Alfie's colours.
  const intro = b.isPlayer && v.back === 0 && t < YOU_INTRO;
  if (intro) {
    const L = b.cls.loa;
    for (const ph of [0, 0.5]) {
      const u = (t * 0.9 + ph) % 1;
      const ring: V2[] = [];
      for (let k = 0; k < 32; k++) { const ang = (k / 32) * Math.PI * 2; ring.push({ x: pose.x + Math.cos(ang) * L * (0.7 + 1.8 * u), y: pose.y + Math.sin(ang) * L * (0.7 + 1.8 * u) }); }
      ctx.strokeStyle = ALFIE[Math.floor((t * 0.9 + ph) % ALFIE.length)];
      ctx.globalAlpha = (1 - u) * 0.9 * Math.min(1, (YOU_INTRO - t) / 1.5);
      ctx.lineWidth = 2.4;
      groundLine(ctx, V, ring, true);
      ctx.globalAlpha = 1;
    }
  }
  const { top, base, size } = drawBoat3d(ctx, pose, o);
  // Labels over the masthead.
  if (b.isPlayer) {
    if (intro) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      ctx.globalAlpha = Math.min(1, (YOU_INTRO - t) / 1.2);
      alfieCallout(ctx, 'This is you', top.x, top.y - 4 - 3 * pulse, pulse);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#4DA3FF';
      ctx.beginPath(); ctx.moveTo(top.x - 6, top.y - 12); ctx.lineTo(top.x + 6, top.y - 12); ctx.lineTo(top.x, top.y - 5); ctx.closePath(); ctx.fill();
      label(ctx, 'You', top.x, top.y - 22, '#FFFFFF', 13);
    }
  } else if (size > 9) {
    label(ctx, v.names && b.name && b.name !== b.sail ? `${b.name} · ${b.sail}` : b.sail, top.x, top.y - 9, 'rgba(255,255,255,0.85)', 11.5, 600);
  }
  if (b.hail && t - b.hail.t < 2.6 && v.back === 0) {
    ctx.font = `600 13px ${FONT}`;
    const tw = ctx.measureText(b.hail.text).width + 18;
    const yy = top.y - (b.isPlayer ? 46 : 32);
    ctx.fillStyle = /protest/i.test(b.hail.text) ? 'rgba(127,29,29,0.92)' : 'rgba(7,13,27,0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(top.x - tw / 2, yy - 12, tw, 24, 8); else ctx.rect(top.x - tw / 2, yy - 12, tw, 24);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.hail.text, top.x, yy + 0.5);
  }
  if (b.penalty.owed > 0 || (b.ocs && !b.started && t >= race.gunT)) label(ctx, b.ocs && !b.started ? 'OCS' : 'Penalty', base.x, base.y + 13, b.ocs && !b.started ? '#FCA5A5' : '#FFCB96', 11, 700);
  if (b.disabled) label(ctx, 'Out of control', base.x, base.y + 13, '#FCA5A5', 11, 700);
  void V;
}

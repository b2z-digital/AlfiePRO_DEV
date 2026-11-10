// The bank view at a real venue: the lake as you see it from the club's control area. The water is
// the real shoreline from OpenStreetMap; along every bank stand trees (thicker where the map has
// woods), with houses climbing the hills on the far shores and hazy ridges behind them. Piers reach
// into the water, and places across the lake are named on the skyline.
import type { Race } from '@/sim/engine';
import type { V2 } from '@/sim/math';
import { wetIn, type VenueScene } from '@/sim/venue';
import type { BankCam, BankView } from './bank';

interface Tree { x: number; y: number; z: number; h: number; wf: number; col: string; tall: boolean }
interface House { x: number; y: number; z: number; w: number; h: number; wall: string; roof: string }
interface Scenery { trees: Tree[]; houses: House[]; piers: V2[][]; rings: V2[][] }

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function hash(i: number, j: number) {
  let hh = (i * 374761393 + j * 668265263) | 0;
  hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
  return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 0..1 noise over the ground. */
function nz(x: number, y: number, k: number) {
  const v = 0.5 + 0.24 * Math.sin(x * 0.0041 + 1.7 * k) + 0.16 * Math.sin(y * 0.0063 + 2.9 * k) + 0.1 * Math.sin((x + y) * 0.011 + 0.6 * k);
  return Math.max(0, Math.min(1, v));
}

/** Blend two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((p >> sh) & 255) * (1 - t) + ((q >> sh) & 255) * t);
  return `#${[16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

/** How high the ground is this far back from the water: the hills behind the far shores. */
const ground = (x: number, y: number, back: number) => Math.min(1, back / 380) * (9 + 22 * nz(x, y, 5));

const cache = new WeakMap<VenueScene, Scenery>();

/** Trees, houses and piers, placed once per race on the venue's real banks (race frame). */
function scenery(v: VenueScene): Scenery {
  const got = cache.get(v);
  if (got) return got;
  const rings = [v.water, ...v.islands];
  const ctl = { x: (v.control[0].x + v.control[1].x) / 2, y: (v.control[0].y + v.control[1].y) / 2 };
  const dry = (x: number, y: number) => !wetIn(rings, x, y);
  const trees: Tree[] = [], houses: House[] = [];
  const greens = ['#3E5C47', '#47664D', '#365240', '#4E6E5A'];
  let k = 0;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (v.open(a, b)) continue; // where the map was cut: open lake beyond, no bank
      const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
      if (len < 0.5) continue;
      const land = { x: ey / len, y: -ex / len }; // water is on the left of every edge, so land is on the right
      for (let s = hash(i, 7) * 12; s < len; s += 8 + 9 * hash(k, 3)) {
        k++;
        const px = a.x + (ex * s) / len, py = a.y + (ey * s) / len;
        const dCtl = Math.hypot(px - ctl.x, py - ctl.y);
        if (dCtl < 45) continue; // the skippers' foreshore is open lawn
        // Stands of trees with lawns, beaches and houses between them.
        const stand = nz(px * 1.7, py * 1.7, 7);
        if (hash(k, 63) > Math.min(1, Math.max(0.06, (stand - 0.22) * 2.2))) continue;
        const back = 5 + 32 * hash(k, 67);
        const tx = px + land.x * back, ty = py + land.y * back;
        if (!dry(tx, ty)) continue;
        const tall = hash(k, 73) > 0.9;
        trees.push({ x: tx, y: ty, z: ground(tx, ty, back), h: (8 + 10 * hash(k, 71) + 6 * stand) * (tall ? 1.35 : 1), wf: tall ? 0.26 : 0.34 + 0.16 * hash(k, 79), col: greens[k % greens.length], tall });
        // Houses up the hills behind the far shores.
        if (dCtl > 350 && hash(k, 41) < 0.55) {
          const hb = 60 + 560 * hash(k, 43) ** 1.4;
          const hx = px + land.x * hb, hy = py + land.y * hb;
          if (dry(hx, hy)) {
            const n = Math.floor(hash(k, 45) * 4);
            houses.push({ x: hx, y: hy, z: ground(hx, hy, hb), w: 8 + 7 * hash(k, 49), h: 4.2 + 2.4 * hash(k, 51), wall: ['#EDE7DA', '#E1DBD0', '#F3EFE7', '#D8D2C6'][n], roof: ['#9A5E4C', '#6E7782', '#8B6A5A', '#5F6B76'][n] });
            // …and trees between them.
            if (hash(k, 47) < 0.6) {
              const gx = hx + (hash(k, 53) - 0.5) * 40, gy = hy + (hash(k, 55) - 0.5) * 40;
              if (dry(gx, gy)) trees.push({ x: gx, y: gy, z: ground(gx, gy, hb), h: 8 + 8 * hash(k, 57), wf: 0.42, col: '#4C6A52', tall: false });
            }
          }
        }
      }
    }
  }
  // The mapped woods and parks near the club.
  for (const f of v.features) {
    if (f.kind !== 'wood' && f.kind !== 'park') continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of f.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const area = (x1 - x0) * (y1 - y0);
    const n = Math.min(400, Math.round(area / (f.kind === 'wood' ? 140 : 1400)));
    for (let j = 0; j < n; j++) {
      k++;
      const tx = x0 + (x1 - x0) * hash(k, 91), ty = y0 + (y1 - y0) * hash(k, 93);
      if (Math.hypot(tx - ctl.x, ty - ctl.y) < 45) continue;
      let inside = false;
      for (let a = 0, b = f.pts.length - 1; a < f.pts.length; b = a++) {
        const p = f.pts[a], q = f.pts[b];
        if ((p.y > ty) !== (q.y > ty) && tx < ((q.x - p.x) * (ty - p.y)) / (q.y - p.y) + p.x) inside = !inside;
      }
      if (!inside || !dry(tx, ty)) continue;
      trees.push({ x: tx, y: ty, z: 0, h: 10 + 9 * hash(k, 95), wf: 0.36 + 0.14 * hash(k, 97), col: greens[k % greens.length], tall: false });
    }
  }
  const piers = v.features.filter(f => f.kind === 'pier' && f.pts.length >= 2).map(f => f.pts);
  const sc = { trees, houses, piers, rings };
  cache.set(v, sc);
  return sc;
}

/** Keep the part of a polygon where nx*x + ny*y >= c. */
function clipHalf(poly: V2[], nx: number, ny: number, c: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[i];
    const da = nx * a.x + ny * a.y - c, db = nx * b.x + ny * b.y - c;
    if (db >= 0) {
      if (da < 0) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
      out.push(b);
    } else if (da >= 0) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}

/** Clip a ground polygon to what the camera can see (with a margin), so nothing projects to huge numbers. */
function viewClip(cam: BankCam, V: BankView, poly: V2[]): V2[] {
  const half = Math.atan(V.w / 2 / V.F) / (Math.PI / 180) + 12;
  const yaw = cam.yaw * (Math.PI / 180);
  const fx = Math.sin(yaw), fy = Math.cos(yaw);
  let q = clipHalf(poly, fx, fy, fx * cam.x + fy * cam.y + 0.8);
  const la = (cam.yaw - half) * (Math.PI / 180), ra = (cam.yaw + half) * (Math.PI / 180);
  const nL = { x: Math.cos(la), y: -Math.sin(la) }, nR = { x: -Math.cos(ra), y: Math.sin(ra) };
  q = clipHalf(q, nL.x, nL.y, nL.x * cam.x + nL.y * cam.y);
  q = clipHalf(q, nR.x, nR.y, nR.x * cam.x + nR.y * cam.y);
  return q;
}

/** Distance from the camera along a bearing (degrees, race frame) to where the water ends. */
function farShore(rings: V2[][], v: VenueScene, x0: number, y0: number, ang: number): number {
  const dx = Math.sin(ang * (Math.PI / 180)), dy = Math.cos(ang * (Math.PI / 180));
  const hits: { t: number; open: boolean }[] = [];
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i];
      const ex = b.x - a.x, ey = b.y - a.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a.x - x0) * ey - (a.y - y0) * ex) / den;
      const s = ((a.x - x0) * dy - (a.y - y0) * dx) / den;
      if (t > 0.2 && s >= 0 && s <= 1) hits.push({ t, open: v.open(a, b) });
    }
  }
  hits.sort((p, q) => p.t - q.t);
  // From the bank, the first crossing is the near shore; the next is the far one.
  let wet = wetIn(rings, x0, y0);
  for (const h of hits) {
    if (wet) return h.open ? 6000 : h.t;
    wet = true;
  }
  return 6000;
}

/** Everything behind the racing: ridges, the lake, its banks, piers and the names of places. Returns the water outline (screen) for clipping. */
export function drawVenueScene(ctx: CanvasRenderingContext2D, V: BankView, race: Race, cam: BankCam, hz: number): (() => void) | null {
  const v = race.venue!;
  const sc = scenery(v);
  const { P, w, h } = V;
  const D2R = Math.PI / 180;
  const sx = (a: number, d: number) => cam.x + Math.sin(a * D2R) * d;
  const sy = (a: number, d: number) => cam.y + Math.cos(a * D2R) * d;

  // ── Ridges behind the far shores, hazy ──
  const cols: { x: number; a: number; D: number }[] = [];
  for (let x = -12; x <= w + 12; x += 8) {
    const a = cam.yaw + Math.atan((x - w / 2) / V.F) / D2R;
    cols.push({ x, a, D: Math.min(4500, farShore(sc.rings, v, cam.x, cam.y, a)) });
  }
  const ridge = (back: (c: { a: number; D: number }) => number, ht: (c: { a: number; D: number }) => number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(cols[0].x, hz + 2);
    for (const c of cols) {
      const d = c.D + back(c);
      const q = P(sx(c.a, d), sy(c.a, d), ht(c));
      ctx.lineTo(c.x, Math.min(hz + 1, q.y));
    }
    ctx.lineTo(cols[cols.length - 1].x, hz + 2); ctx.closePath(); ctx.fill();
  };
  ridge(c => 1400 + 1800 * nz(sx(c.a, c.D), sy(c.a, c.D), 1), c => (c.D >= 4500 ? 0 : 50 + 80 * nz(sx(c.a, c.D), sy(c.a, c.D), 2)), '#ADBFC8');
  ridge(c => 450 + 380 * nz(sx(c.a, c.D), sy(c.a, c.D), 4), c => (c.D >= 4500 ? 0 : 16 + 30 * nz(sx(c.a, c.D), sy(c.a, c.D), 5)), '#97AEAC');

  // ── The lake: the real shoreline, clipped to the view; islands are holes ──
  const outline: { x: number; y: number }[][] = [];
  for (const r of sc.rings) {
    const q = viewClip(cam, V, r);
    if (q.length > 2) outline.push(q.map(p => P(p.x, p.y, 0)));
  }
  const waterPath = () => {
    ctx.beginPath();
    for (const ring of outline) { ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
  };
  if (outline.length) {
    const wg = ctx.createLinearGradient(0, hz, 0, h);
    wg.addColorStop(0, '#A9C2D6'); wg.addColorStop(0.03, '#7FA0BD'); wg.addColorStop(0.12, '#4E7598'); wg.addColorStop(0.3, '#2F577E'); wg.addColorStop(1, '#173A5E');
    ctx.fillStyle = wg;
    waterPath(); ctx.fill('evenodd');
  }

  // ── Houses and trees, far to near ──
  const fw = { x: Math.sin(cam.yaw * D2R), y: Math.cos(cam.yaw * D2R) };
  const halfTan = (w / 2 + 60) / V.F;
  type Item = { d: number; draw: () => void };
  const items: Item[] = [];
  const refl: Item[] = [];
  const inView = (x: number, y: number) => {
    const dx = x - cam.x, dy = y - cam.y;
    const d = dx * fw.x + dy * fw.y;
    if (d < 12) return 0;
    const side = dx * fw.y - dy * fw.x;
    return Math.abs(side) < d * halfTan ? d : 0;
  };
  for (const t of sc.trees) {
    const d = inView(t.x, t.y);
    if (!d) continue;
    items.push({ d, draw: () => {
      const base = P(t.x, t.y, t.z), top = P(t.x, t.y, t.z + t.h);
      const hpx = Math.max(1.6, base.y - top.y);
      const rr = Math.max(1, (t.h * t.wf * V.F) / d);
      const haze = Math.max(0, Math.min(0.6, (d - 120) / 2600 + 0.12));
      const col = mix(t.col, '#9DB2B4', haze);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(base.x, base.y - hpx * 0.56, rr, hpx * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      if (hpx > 5) {
        ctx.fillStyle = mix(col, '#A9C49A', 0.25);
        ctx.beginPath(); ctx.ellipse(base.x - rr * 0.25, base.y - hpx * 0.7, rr * 0.5, hpx * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      }
    } });
    // A faint reflection, drawn down into the water, for trees right on the far shore.
    if (d > 150 && t.z < 3) refl.push({ d, draw: () => {
      const base = P(t.x, t.y, 0), top = P(t.x, t.y, t.h);
      const hpx = Math.max(1, base.y - top.y), rr = Math.max(1, (t.h * t.wf * V.F) / d);
      ctx.beginPath(); ctx.ellipse(base.x, base.y + hpx * 0.42, rr * 0.75, hpx * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    } });
  }
  for (const hs of sc.houses) {
    const d = inView(hs.x, hs.y);
    if (!d) continue;
    items.push({ d, draw: () => {
      const p0 = P(hs.x, hs.y, hs.z), p1 = P(hs.x, hs.y, hs.z + hs.h);
      const ww = (hs.w * V.F) / d, hh = Math.max(1.3, p0.y - p1.y);
      const haze = Math.max(0.2, Math.min(0.75, 0.3 + (d - 900) / 2600));
      ctx.fillStyle = mix(hs.wall, '#B9C9CF', haze);
      ctx.fillRect(p0.x - ww / 2, p1.y, ww, hh);
      ctx.fillStyle = mix(hs.roof, '#A9BAC1', haze);
      ctx.fillRect(p0.x - ww / 2, p1.y - hh * 0.28, ww, hh * 0.36);
    } });
  }
  items.sort((p, q) => q.d - p.d);
  // Reflections first, on the water, then the banks.
  const reflA = !race.sea ? 0.16 : race.sea.kind === 'chop' ? 0.08 : 0.04;
  if (refl.length) {
    ctx.save();
    if (outline.length) { waterPath(); ctx.clip('evenodd'); }
    ctx.globalAlpha = reflA;
    ctx.fillStyle = '#2C4636';
    for (const r of refl) r.draw();
    ctx.restore();
  }
  for (const it of items) it.draw();

  // ── Piers: a deck on posts, just above the water ──
  for (const pr of sc.piers) {
    for (let i = 0; i + 1 < pr.length; i++) {
      const a = pr[i], b = pr[i + 1];
      const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey) || 1;
      const nx = (-ey / len) * 1.1, ny = (ex / len) * 1.1;
      const quad = [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
      const q = viewClip(cam, V, quad);
      if (q.length < 3) continue;
      const deck = q.map(p => P(p.x, p.y, 0.7)), foot = q.map(p => P(p.x, p.y, 0));
      ctx.fillStyle = 'rgba(40,36,32,0.55)';
      ctx.beginPath(); foot.forEach((p, k2) => (k2 ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7A6E60';
      ctx.beginPath(); deck.forEach((p, k2) => (k2 ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    }
  }

  // ── Places across the water ──
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const lm of v.landmarks) {
    const d = inView(lm.at.x, lm.at.y);
    if (!d) continue;
    const q = P(lm.at.x, lm.at.y, 34);
    if (q.x < 80 || q.x > w - 80) continue;
    const km = Math.hypot(lm.at.x - cam.x, lm.at.y - cam.y) / 1000;
    const text = `${lm.name} · ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(q.x, q.y - 4); ctx.lineTo(q.x, q.y + 6); ctx.stroke();
    ctx.fillStyle = 'rgba(6,11,22,0.45)'; ctx.fillText(text, q.x + 0.8, q.y - 13.2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(text, q.x, q.y - 14);
  }
  return outline.length ? waterPath : null;
}

/** The map data's credit, small, in a corner of the view. */
export function drawCredit(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  ctx.font = `500 10.5px ${FONT}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(6,11,22,0.5)'; ctx.fillText(text, w - 11.5, h - 5.5);
  ctx.fillStyle = 'rgba(235,240,255,0.62)'; ctx.fillText(text, w - 12, h - 6);
}

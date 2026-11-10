// A real venue seen from above, for the top view and the course map: the land round the real
// shoreline, with the mapped parks, woods, buildings, roads, paths and piers, and the control area
// where the skippers stand. Map data © OpenStreetMap contributors (ODbL).
import type { V2 } from '@/sim/math';
import type { VenueScene } from '@/sim/venue';

type ToScreen = (x: number, y: number) => [number, number];

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

function ring(ctx: CanvasRenderingContext2D, pts: V2[], T: ToScreen, close = true) {
  pts.forEach((p, i) => { const [x, y] = T(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  if (close) ctx.closePath();
}

/** The water's outline (outer shore and islands) as the current path, for filling or clipping (even-odd). */
export function waterPath(ctx: CanvasRenderingContext2D, v: VenueScene, T: ToScreen) {
  ctx.beginPath();
  ring(ctx, v.water, T);
  for (const isl of v.islands) ring(ctx, isl, T);
}

/**
 * Everything that isn't water: drawn over the water texture, so the lake shows through only inside
 * the real shoreline. `mpp`: screen pixels per metre. `detail`: the mapped features and their names.
 */
export function drawVenueLand(ctx: CanvasRenderingContext2D, v: VenueScene, T: ToScreen, mpp: number, w: number, h: number, detail: boolean, label = true) {
  ctx.save();
  // Land: the whole view, less the water.
  ctx.beginPath();
  ctx.rect(-10, -10, w + 20, h + 20);
  ring(ctx, v.water, T);
  for (const isl of v.islands) ring(ctx, isl, T);
  ctx.fillStyle = '#0C1811';
  ctx.fill('evenodd');

  if (detail) {
    // Only on the land: a park or a reserve can be mapped right across the water it sits beside.
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, -10, w + 20, h + 20);
    ring(ctx, v.water, T);
    for (const isl of v.islands) ring(ctx, isl, T);
    ctx.clip('evenodd');
    const fills: Record<string, string> = { park: '#11291D', wood: '#0A2014', sand: '#4A4433', pitch: '#11301F', playground: '#2A2418', parking: '#151D27', bld: '#27313E', pond: '#16365F' };
    for (const kind of ['park', 'sand', 'pitch', 'wood', 'playground', 'parking', 'pond', 'bld']) {
      ctx.fillStyle = fills[kind];
      for (const f of v.features) {
        if (f.kind !== kind || f.pts.length < 3) continue;
        ctx.beginPath(); ring(ctx, f.pts, T); ctx.fill();
        if (kind === 'bld') { ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
    // Trees in the woods: soft dots.
    ctx.fillStyle = 'rgba(30,70,44,0.55)';
    for (const f of v.features) {
      if (f.kind !== 'wood') continue;
      for (let i = 0; i < f.pts.length; i++) {
        const [x, y] = T(f.pts[i].x, f.pts[i].y);
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, 3.5 * mpp), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    // Roads, paths, bridges and piers.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const f of v.features) {
      if (f.kind === 'road') { ctx.strokeStyle = '#222D3A'; ctx.lineWidth = Math.max(1.5, 6 * mpp); }
      else if (f.kind === 'path') { ctx.strokeStyle = 'rgba(200,215,230,0.16)'; ctx.lineWidth = Math.max(1, 1.6 * mpp); }
      else continue;
      ctx.beginPath(); ring(ctx, f.pts, T, false); ctx.stroke();
    }
    for (const f of v.features) {
      if (f.kind !== 'bridge') continue;
      ctx.strokeStyle = '#3A4654'; ctx.lineWidth = Math.max(2.5, 9 * mpp);
      ctx.beginPath(); ring(ctx, f.pts, T, false); ctx.stroke();
      ctx.strokeStyle = 'rgba(225,232,240,0.35)'; ctx.lineWidth = Math.max(0.8, 1 * mpp);
      ctx.beginPath(); ring(ctx, f.pts, T, false); ctx.stroke();
    }
    for (const f of v.features) {
      if (f.kind !== 'pier') continue;
      // A pontoon drawn as its outline is decked right across.
      const n = f.pts.length;
      if (n >= 4 && Math.hypot(f.pts[0].x - f.pts[n - 1].x, f.pts[0].y - f.pts[n - 1].y) < 4) {
        ctx.fillStyle = '#5E5549'; ctx.strokeStyle = 'rgba(255,240,220,0.18)'; ctx.lineWidth = Math.max(0.8, 0.5 * mpp);
        ctx.beginPath(); ring(ctx, f.pts, T); ctx.fill(); ctx.stroke();
        continue;
      }
      ctx.strokeStyle = '#5E5549'; ctx.lineWidth = Math.max(2, 2.2 * mpp);
      ctx.beginPath(); ring(ctx, f.pts, T, false); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,220,0.18)'; ctx.lineWidth = Math.max(0.8, 0.5 * mpp);
      ctx.beginPath(); ring(ctx, f.pts, T, false); ctx.stroke();
    }
  }

  // The water's edge.
  ctx.strokeStyle = 'rgba(150,190,140,0.30)';
  ctx.lineWidth = detail ? 2 : 1;
  waterPath(ctx, v, T); ctx.stroke();

  // The control area: where the skippers stand, a line along the bank with a tick at each end.
  const [ax, ay] = T(v.control[0].x, v.control[0].y), [bx, by] = T(v.control[1].x, v.control[1].y);
  {
    const dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1, tx = (-dy / dl) * 5, ty = (dx / dl) * 5;
    ctx.strokeStyle = 'rgba(120,185,255,0.9)';
    ctx.lineWidth = detail ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    if (detail) { ctx.moveTo(ax - tx, ay - ty); ctx.lineTo(ax + tx, ay + ty); ctx.moveTo(bx - tx, by - ty); ctx.lineTo(bx + tx, by + ty); }
    ctx.stroke();
  }

  if (detail) {
    ctx.font = `600 11.5px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Name the control area, set back on the bank, and the named places in view.
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1;
    // Set back towards the land: the water is to the left of a→b, so the land is to its right
    // (on screen, with y down, that's (-dy, dx)).
    const off = 16;
    const lx = mx - (dy / dl) * off, ly = my + (dx / dl) * off;
    if (label && lx > 0 && lx < w && ly > 0 && ly < h) { ctx.fillStyle = 'rgba(156,203,255,0.85)'; ctx.fillText('Control area', lx, ly); }
    if (mpp > 1.2) {
      ctx.fillStyle = 'rgba(235,240,255,0.42)';
      for (const f of v.features) {
        if (!f.name || (f.kind !== 'bld' && f.kind !== 'park')) continue;
        let cx = 0, cy = 0;
        for (const p of f.pts) { cx += p.x; cy += p.y; }
        const [x, y] = T(cx / f.pts.length, cy / f.pts.length);
        if (x < 40 || x > w - 40 || y < 20 || y > h - 20) continue;
        ctx.fillText(f.name, x, y);
      }
    }
  }
  ctx.restore();
}

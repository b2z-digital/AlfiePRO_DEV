// The tracking map: the water (the real shoreline when the venue is known), the course, ladder
// rungs square to the wind, laylines to the windward mark, trails and the boats, drawn hull-first so
// a bow over the line looks over the line. Wind up, north up, or from the bank. Drag to pan, wheel
// or pinch to zoom, double-click to fit; tap a boat to pick her.
import { useEffect, useRef } from 'react';
import { stateAt, type TrackedBoat, type V2 } from './core/analyse';
import type { TrackedRace } from './source';

export type Orient = 'wind' | 'north' | 'bank';
export interface MapProps {
  race: TrackedRace;
  t: number;
  orient?: Orient;
  /** Compass, from: the wind to square the ladder to (frame degrees). */
  wind?: number | null;
  trails?: number;
  ladder?: boolean;
  laylines?: boolean;
  follow?: string | null;
  /** Boats drawn with their whole race track (replay head to head). */
  tracks?: string[];
  /** Zoom in on the start line. */
  startView?: boolean;
  /** Bigger labels (club TV). */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
  onPick?: (id: string) => void;
  label?: string;
}

const rad = (d: number) => d * Math.PI / 180;

export default function TrackMap({ race, t, orient = 'wind', wind, trails = 45, ladder = true, laylines = true, follow, tracks, startView, scale = 1, className, style, onPick, label }: MapProps) {
  const cv = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const props = useRef({ race, t, orient, wind, trails, ladder, laylines, follow, tracks, startView, scale });
  props.current = { race, t, orient, wind, trails, ladder, laylines, follow, tracks, startView, scale };
  const drawRef = useRef<() => void>(() => {});
  const hits = useRef<{ id: string; x: number; y: number }[]>([]);

  useEffect(() => {
    const c = cv.current!;
    const draw = () => {
      const P = props.current;
      const r = P.race;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.clientWidth, H = c.clientHeight;
      if (!W || !H) return;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = r.venue ? '#0B1322' : '#0A1A33';
      g.fillRect(0, 0, W, H);
      const course = r.course;
      if (!course) return;
      const windDeg = P.wind ?? course.windDeg ?? 0;
      // Which way is up (a frame compass bearing).
      let phi = windDeg;
      if (P.orient === 'north') phi = -r.rot;
      if (P.orient === 'bank' && r.venue) {
        const [a, b] = r.venue.control;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const cm = { x: (course.start.pin.x + course.start.boat.x) / 2, y: (course.start.pin.y + course.start.boat.y) / 2 };
        phi = (Math.atan2(cm.x - m.x, cm.y - m.y) * 180 / Math.PI + 360) % 360;
      }
      const ca = Math.cos(rad(phi)), sa = Math.sin(rad(phi));
      const uv = (p: V2) => ({ u: p.x * ca - p.y * sa, v: p.x * sa + p.y * ca });
      // Fit the course (or the start line).
      const pts: V2[] = P.startView
        ? [course.start.pin, course.start.boat, ...r.boats.map(b => stateAt(b, P.t)).filter((s): s is NonNullable<typeof s> => !!s && Math.abs(s.x) < 1e5).map(s => ({ x: s.x, y: s.y }))]
        : [course.start.pin, course.start.boat, course.finish.pin, course.finish.boat, ...course.waypoints.flatMap(w => w.marks.map(m => m.p))];
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of pts) { const q = uv(p); u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v); }
      if (P.startView) {
        const cu = (u0 + u1) / 2, cvv = (v0 + v1) / 2;
        const sl = Math.hypot(course.start.boat.x - course.start.pin.x, course.start.boat.y - course.start.pin.y);
        u0 = Math.min(u0, cu - sl * 0.6); u1 = Math.max(u1, cu + sl * 0.6); v0 = Math.max(v0, cvv - sl * 0.35); v1 = Math.min(v1, cvv + sl * 0.35);
      }
      const pad = P.startView ? 1.12 : 1.25;
      const s0 = Math.min(W / Math.max(4, (u1 - u0) * pad), H / Math.max(4, (v1 - v0) * pad));
      const s = s0 * view.current.zoom;
      let cu = (u0 + u1) / 2, cvv = (v0 + v1) / 2;
      if (P.follow) {
        const b = r.boats.find(x => x.id === P.follow);
        const st = b && stateAt(b, P.t);
        if (st) { const q = uv(st); cu = q.u; cvv = q.v; }
      }
      const X = (p: V2) => { const q = uv(p); return { x: W / 2 + (q.u - cu) * s + view.current.pan.x, y: H / 2 - (q.v - cvv) * s + view.current.pan.y }; };
      const path = (ps: V2[], close = false) => { g.beginPath(); ps.forEach((p, i) => { const q = X(p); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); if (close) g.closePath(); };

      // Water and shore.
      if (r.venue) {
        g.fillStyle = '#0B1322';
        for (const f of r.venue.features) {
          if (f.kind === 'park' || f.kind === 'wood' || f.kind === 'pitch') { g.fillStyle = '#0E2219'; path(f.pts, true); g.fill(); }
          if (f.kind === 'bld') { g.fillStyle = '#182133'; path(f.pts, true); g.fill(); }
        }
        g.save();
        path(r.venue.water, true);
        for (const isl of r.venue.islands) { const q = isl.map(X); g.moveTo(q[0].x, q[0].y); q.forEach(p => g.lineTo(p.x, p.y)); g.closePath(); }
        const grd = g.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, '#0C2546'); grd.addColorStop(1, '#081A33');
        g.fillStyle = grd;
        g.fill('evenodd');
        g.strokeStyle = 'rgba(156,203,255,.42)'; g.lineWidth = 1.3; g.stroke();
        g.clip('evenodd');
      } else {
        const grd = g.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, '#0C2546'); grd.addColorStop(1, '#081A33');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
        g.save();
      }
      // Ladder rungs every 5 m, square to the wind now, through the first mark.
      const wm = course.waypoints[0]?.marks[0]?.p ?? { x: 0, y: 0 };
      const up = { x: Math.sin(rad(windDeg)), y: Math.cos(rad(windDeg)) };
      const rt = { x: up.y, y: -up.x };
      if (P.ladder && !P.startView) {
        g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
        for (let k = -4; k < 30; k++) {
          const cc = { x: wm.x - up.x * k * 5, y: wm.y - up.y * k * 5 };
          path([{ x: cc.x - rt.x * 60, y: cc.y - rt.y * 60 }, { x: cc.x + rt.x * 60, y: cc.y + rt.y * 60 }]); g.stroke();
        }
      }
      if (P.laylines && !P.startView && course.waypoints.length) {
        g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.2;
        for (const sg of [-1, 1]) {
          const a = rad(windDeg + 180 + sg * 42);
          path([wm, { x: wm.x + Math.sin(a) * 70, y: wm.y + Math.cos(a) * 70 }]); g.stroke();
        }
        g.setLineDash([]);
      }
      // The lines.
      const drawLine = (l: { pin: V2; boat: V2 }) => {
        g.setLineDash([5, 4]); g.strokeStyle = 'rgba(241,244,250,.75)'; g.lineWidth = 1.4 * P.scale;
        path([l.pin, l.boat]); g.stroke(); g.setLineDash([]);
      };
      drawLine(course.start);
      if (Math.hypot(course.finish.pin.x - course.start.pin.x, course.finish.pin.y - course.start.pin.y) > 0.5) drawLine(course.finish);
      if (P.startView) {
        // Metre ticks along the start line.
        const L = Math.hypot(course.start.boat.x - course.start.pin.x, course.start.boat.y - course.start.pin.y);
        g.strokeStyle = 'rgba(241,244,250,.45)'; g.lineWidth = 1;
        for (let k = 0; k <= Math.floor(L); k++) {
          const f = k / L;
          const q = X({ x: course.start.pin.x + (course.start.boat.x - course.start.pin.x) * f, y: course.start.pin.y + (course.start.boat.y - course.start.pin.y) * f });
          g.beginPath(); g.moveTo(q.x, q.y - 3); g.lineTo(q.x, q.y + 3); g.stroke();
        }
      }
      // Marks.
      const markDot = (p: V2, color: string, lab: string) => {
        const q = X(p);
        g.fillStyle = color + '24'; g.beginPath(); g.arc(q.x, q.y, 9 * P.scale, 0, 7); g.fill();
        g.fillStyle = color; g.strokeStyle = '#060B16'; g.lineWidth = 1.5; g.beginPath(); g.arc(q.x, q.y, 5.5 * P.scale, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#F1F4FA'; g.font = `700 ${Math.round(10.5 * P.scale)}px "Instrument Sans", system-ui, sans-serif`; g.textAlign = 'left';
        g.fillText(lab, q.x + 9 * P.scale, q.y + 4 * P.scale);
      };
      const seen = new Set<string>();
      for (const w of course.waypoints) for (const m of w.marks) { if (seen.has(m.id)) continue; seen.add(m.id); markDot(m.p, '#FF9F43', m.name); }
      markDot(course.start.pin, '#F1F4FA', 'Pin');
      markDot(course.start.boat, '#F1F4FA', 'Stbd');

      // Tracks and trails.
      const trackOf = (b: TrackedBoat, from: number, to: number, step: number) => {
        const out: V2[] = [];
        for (let tt = from; tt <= to; tt += step) { const st = stateAt(b, tt); if (st) out.push(st); }
        return out;
      };
      g.lineCap = 'round'; g.lineJoin = 'round';
      const hiTracks = new Set(P.tracks ?? []);
      for (const b of r.boats) {
        if (hiTracks.size) {
          const pts2 = trackOf(b, r.gun ?? r.t0, P.t, 0.6);
          g.strokeStyle = hiTracks.has(b.id) ? b.color : 'rgba(156,203,255,.13)';
          g.lineWidth = hiTracks.has(b.id) ? 2.2 : 1.1;
          path(pts2); g.stroke();
          continue;
        }
        if (!P.trails) continue;
        const pts2 = trackOf(b, P.t - P.trails, P.t, 0.4);
        const n = pts2.length;
        for (let k = 0; k < 10; k++) {
          const seg = pts2.slice(Math.floor(k * n / 10), Math.min(n, Math.floor((k + 1) * n / 10) + 1));
          if (seg.length < 2) continue;
          g.strokeStyle = b.color; g.globalAlpha = 0.9 * ((k + 1) / 10) ** 1.6; g.lineWidth = 2.2 * P.scale;
          path(seg); g.stroke();
        }
        g.globalAlpha = 1;
      }
      // Boats, to scale when close, never smaller than an icon.
      hits.current = [];
      const chips: { x: number; y: number; b: TrackedBoat }[] = [];
      for (const b of r.boats) {
        if (hiTracks.size && !hiTracks.has(b.id)) continue;
        const st = stateAt(b, P.t, 1e9);
        if (!st) continue;
        const q = X(st);
        const L = Math.max(15 * P.scale, b.length * s), B = Math.max(5.6 * P.scale, L * 0.2);
        const off = (b.length / 2 - b.bow) / b.length * L; // the hull's middle, from the tag (drawn hull lengths)
        g.save();
        g.translate(q.x, q.y);
        g.rotate(rad(st.h - phi));
        g.translate(0, off);
        if (P.follow === b.id) { g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, L * 0.95, 0, 7); g.stroke(); }
        g.globalAlpha = st.fresh ? 1 : 0.4;
        g.beginPath();
        g.moveTo(0, -L / 2);
        g.bezierCurveTo(B * 0.62, -L * 0.28, B * 0.55, L * 0.3, B * 0.34, L / 2);
        g.lineTo(-B * 0.34, L / 2);
        g.bezierCurveTo(-B * 0.55, L * 0.3, -B * 0.62, -L * 0.28, 0, -L / 2);
        g.fillStyle = b.color; g.fill(); g.strokeStyle = '#060B16'; g.lineWidth = 1; g.stroke();
        g.restore();
        g.globalAlpha = 1;
        hits.current.push({ id: b.id, x: q.x, y: q.y });
        chips.push({ x: q.x, y: q.y, b });
      }
      // Sail-number chips, placed clear of each other.
      g.font = `700 ${Math.round(10.5 * P.scale)}px "Instrument Sans", system-ui, sans-serif`;
      const taken: [number, number, number, number][] = [];
      for (const ch of chips) {
        const w = 10 + g.measureText(ch.b.sail).width, h = 15 * P.scale;
        let best: [number, number, number, number] | null = null, bo = Infinity;
        for (const [dx, dy] of [[12, -8], [-12 - w, -8], [-w / 2, -24 * P.scale], [-w / 2, 10 * P.scale], [14, 6], [-14 - w, 6]]) {
          const box: [number, number, number, number] = [ch.x + dx * P.scale, ch.y + dy, ch.x + dx * P.scale + w, ch.y + dy + h];
          let ov = 0;
          for (const tb of taken) ov += Math.max(0, Math.min(box[2], tb[2]) - Math.max(box[0], tb[0])) * Math.max(0, Math.min(box[3], tb[3]) - Math.max(box[1], tb[1]));
          if (ov < bo) { bo = ov; best = box; }
          if (!ov) break;
        }
        taken.push(best!);
        const me = P.follow === ch.b.id;
        g.fillStyle = me ? '#F1F4FA' : 'rgba(6,11,22,.86)';
        g.strokeStyle = ch.b.color; g.lineWidth = 1.3;
        g.beginPath(); g.roundRect(best![0], best![1], w, h, h / 2.6); g.fill(); g.stroke();
        g.fillStyle = me ? '#060B16' : '#F1F4FA'; g.textAlign = 'center';
        g.fillText(ch.b.sail, (best![0] + best![2]) / 2, best![3] - 4 * P.scale);
      }
      g.restore();
      // North arrow.
      const na = rad(-r.rot - phi);
      g.save(); g.translate(W - 26, 26);
      g.fillStyle = 'rgba(6,11,22,.72)'; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
      g.rotate(na); g.fillStyle = '#F1F4FA'; g.beginPath(); g.moveTo(0, -10); g.lineTo(4.5, 3); g.lineTo(0, 0); g.lineTo(-4.5, 3); g.closePath(); g.fill();
      g.restore();
      if (r.venue) {
        g.fillStyle = 'rgba(201,214,238,.55)'; g.font = '500 10px "Instrument Sans", system-ui, sans-serif'; g.textAlign = 'right';
        g.fillText('Map data © OpenStreetMap contributors', W - 8, H - 7);
      }
    };
    drawRef.current = draw;
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(c);
    // Pan and zoom.
    let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, px: view.current.pan.x, py: view.current.pan.y, moved: false }; c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      view.current.pan = { x: drag.px + dx, y: drag.py + dy };
      draw();
    };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved && onPickRef.current) {
        const rect = c.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let best: string | null = null, bd = 28;
        for (const h of hits.current) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h.id; } }
        if (best) onPickRef.current(best);
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); view.current.zoom = Math.max(0.4, Math.min(12, view.current.zoom * Math.exp(-e.deltaY * 0.0015))); draw(); };
    const dbl = () => { view.current = { zoom: 1, pan: { x: 0, y: 0 } }; draw(); };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    c.addEventListener('wheel', wheel, { passive: false }); c.addEventListener('dblclick', dbl);
    return () => {
      ro.disconnect();
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up);
      c.removeEventListener('wheel', wheel); c.removeEventListener('dblclick', dbl);
    };
  }, []);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  useEffect(() => { drawRef.current(); });
  return <canvas ref={cv} className={className} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', ...style }} role="img" aria-label={label ?? 'Race map'} />;
}

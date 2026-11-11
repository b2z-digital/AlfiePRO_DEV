// Choosing where you sail at a venue: a map of the club's real water (north up). Tap anywhere and
// you stand on the nearest bank; Alfie then lays the course in front of you for the wind, exactly as
// the race will have it. The marks, the start line and the stretch of bank you stand on are drawn
// from the same rule the race uses, so what you see here is what you get.
// Map data © OpenStreetMap contributors (ODbL).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES, type ClassId } from '@/sim/classes';
import { buildCourse, type CourseLength } from '@/sim/course';
import { frameAt, siteFor, toGeo, venueScene, type Site, type VenueDef } from '@/sim/venue';
import { drawVenueLand } from './venueMap';
import { Btn, C, Seg, compassName } from './ui';

const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
const LENGTHS: Record<CourseLength, CourseLength[]> = { long: ['long', 'medium', 'short'], medium: ['medium', 'short'], short: ['short'] };

/** The race as it would be laid: the same rule the engine uses, with a square line. */
function previewSite(def: VenueDef, windFrom: number, spot: [number, number] | null, classId: ClassId, length: CourseLength, fleetSize: number, laps: number): Site | null {
  const L = CLASSES[classId].loa;
  const courses = LENGTHS[length].map(len => buildCourse(0, L, { laps, length: len, fleetSize, lineBias: 0 }));
  return siteFor(def, windFrom, spot ? { x: spot[0], y: spot[1] } : null, courses);
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, deg: number, len: number) {
  // Pointing the way the wind blows: from `deg`.
  const a = ((deg + 180) * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const x1 = x + dx * len, y1 = y + dy * len, x0 = x - dx * len, y0 = y - dy * len;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - dx * 9 - dy * 5, y1 - dy * 9 + dx * 5); ctx.lineTo(x1 - dx * 9 + dy * 5, y1 - dy * 9 - dx * 5); ctx.closePath(); ctx.fill();
}

interface Props {
  def: VenueDef;
  /** The spot picked on this venue's map (metres east and north of the club's saved location), or null for the club's own. */
  spot: [number, number] | null;
  onSpot: (s: [number, number] | null) => void;
  /** The wind to lay the course for, compass degrees it blows from. */
  windFrom: number;
  windName: string;
  classId: ClassId; length: CourseLength; fleetSize: number; laps: number;
}

export default function VenuePick({ def, spot, onSpot, windFrom, windName, classId, length, fleetSize, laps }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const [zoom, setZoom] = useState<'near' | 'wide'>('near');
  const height = Math.round(Math.max(240, Math.min(400, width * 0.62)));

  const site = useMemo(() => previewSite(def, windFrom, spot, classId, length, fleetSize, laps), [def, windFrom, spot, classId, length, fleetSize, laps]);
  const control = site?.control ?? def.control;
  const atClub = control === def.control;
  const shorter = !!site && site.course.beat < buildCourse(0, CLASSES[classId].loa, { laps, length, fleetSize, lineBias: 0 }).beat - 0.01;

  // The view: close in round where you stand, or the whole of the water that was mapped.
  const view = useMemo(() => {
    const span = zoom === 'near' ? 560 : Math.min(2 * (def.cut ?? 900), 1800);
    const m = zoom === 'near' ? { x: (control[0].x + control[1].x) / 2, y: (control[0].y + control[1].y) / 2 } : { x: 0, y: 0 };
    const s = width / span;
    return { s, mx: m.x, my: m.y };
  }, [zoom, control, def, width]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setWidth(Math.max(260, Math.round(el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = width * dpr; cv.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { s, mx, my } = view;
    const T = (x: number, y: number): [number, number] => [width / 2 + (x - mx) * s, height / 2 - (y - my) * s];

    // Water, then the land over it.
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#1B4C7C'); g.addColorStop(1, '#143D68');
    ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    const scene = venueScene(def, frameAt(0, { x: 0, y: 0 }), control);
    drawVenueLand(ctx, scene, T, s, width, height, true, false);

    // The course as it will be laid: its water, the line and the marks.
    if (site) {
      const f = frameAt(windFrom, site.S), c = site.course, B = c.bounds;
      const G = (x: number, y: number) => { const q = toGeo(f, { x, y }); return T(q.x, q.y); };
      ctx.save();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(235,240,255,0.45)'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(77,163,255,0.10)';
      ctx.beginPath();
      [[-B.across, B.alongMin], [B.across, B.alongMin], [B.across, B.alongMax], [-B.across, B.alongMax]].forEach(([x, y], i) => { const [px, py] = G(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
      const [ax, ay] = G(c.start.pin.x, c.start.pin.y), [bx, by] = G(c.start.stbd.x, c.start.stbd.y);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#FFB340'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      for (const m of c.marks) {
        const [px, py] = G(m.p.x, m.p.y);
        ctx.fillStyle = '#FF9F43'; ctx.strokeStyle = 'rgba(6,11,22,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, zoom === 'near' ? 3.4 : 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    // Where you stand, ringed.
    {
      const [px, py] = T((control[0].x + control[1].x) / 2, (control[0].y + control[1].y) / 2);
      ctx.strokeStyle = '#9CCBFF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(77,163,255,0.22)'; ctx.fill();
    }
    // The clubhouse (the club's saved location).
    {
      const [px, py] = T(0, 0);
      if (px > 8 && px < width - 8 && py > 8 && py < height - 8) {
        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(6,11,22,0.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px + 5.5, py); ctx.lineTo(px, py + 6); ctx.lineTo(px - 5.5, py); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    // The wind, north and a scale.
    ctx.font = `600 11.5px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(6,11,22,0.62)';
    ctx.beginPath(); ctx.roundRect(10, 10, 132, 46, 10); ctx.fill();
    ctx.strokeStyle = '#9CCBFF'; ctx.fillStyle = '#9CCBFF'; ctx.lineWidth = 2;
    arrow(ctx, 32, 33, windFrom, 13);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#F1F4FA'; ctx.fillText(windName.length > 15 ? `${compassName(windFrom)} wind` : windName, 54, 26);
    ctx.fillStyle = 'rgba(235,240,255,0.7)'; ctx.fillText(`from ${String(Math.round(windFrom)).padStart(3, '0')}°`, 54, 41);
    const bar = zoom === 'near' ? 50 : 200;
    ctx.fillStyle = 'rgba(6,11,22,0.62)';
    ctx.beginPath(); ctx.roundRect(10, height - 34, bar * s + 20, 24, 8); ctx.fill();
    ctx.strokeStyle = '#F1F4FA'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(20, height - 17); ctx.lineTo(20 + bar * s, height - 17); ctx.stroke();
    ctx.fillStyle = '#F1F4FA'; ctx.textAlign = 'center'; ctx.font = `600 10.5px ${FONT}`;
    ctx.fillText(`${bar} m`, 20 + (bar * s) / 2, height - 26);
    ctx.fillStyle = 'rgba(6,11,22,0.62)';
    ctx.beginPath(); ctx.roundRect(width - 40, 10, 30, 30, 9); ctx.fill();
    ctx.fillStyle = '#F1F4FA'; ctx.font = `700 11px ${FONT}`; ctx.fillText('N', width - 25, 31);
    ctx.beginPath(); ctx.moveTo(width - 25, 14); ctx.lineTo(width - 21, 22); ctx.lineTo(width - 29, 22); ctx.closePath(); ctx.fill();
    ctx.font = `500 10px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(235,240,255,0.6)'; ctx.fillText(def.credit, width - 10, height - 7);
  }, [def, site, control, view, width, height, windFrom, windName, zoom]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width, py = ((e.clientY - r.top) / r.height) * height;
    const half = def.cut ?? 900;
    const x = Math.round(view.mx + (px - width / 2) / view.s), y = Math.round(view.my - (py - height / 2) / view.s);
    onSpot([Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, y))]);
  };

  const m = { x: (control[0].x + control[1].x) / 2, y: (control[0].y + control[1].y) / 2 };
  const away = Math.round(Math.hypot(m.x, m.y) / 10) * 10;
  const where = !site ? "A course won't fit on this water in this wind."
    : atClub ? (spot ? "A course won't fit off that bank in this wind, so you're at the club's usual spot." : "You're at the club's usual spot.")
      : `You're standing on the bank ${away} m ${compassName((Math.atan2(m.x, m.y) * 180) / Math.PI)} of the club.`;

  return (
    <div className="flex flex-col gap-2.5">
      <div ref={wrap} className="relative overflow-hidden rounded-2xl border border-white/10">
        <canvas ref={canvas} onPointerDown={pick} style={{ width: '100%', height, touchAction: 'manipulation' }} className="block cursor-crosshair"
          role="img" aria-label={`Map of ${def.name}. ${where} The course is laid for a wind from the ${compassName(windFrom)}.`} />
        <div className="absolute bottom-2.5 right-2.5 top-auto mb-5">
          <Seg size="sm" label="Map zoom" value={zoom} onChange={setZoom} options={[{ value: 'near', label: 'Near' }, { value: 'wide', label: 'Whole water' }]} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="m-0 min-w-0 flex-1 basis-[260px] text-[13px] leading-snug" style={{ color: C.mute }}>
          <b className="text-[#F1F4FA]">{where}</b> Tap the map to sail somewhere else on this water: you stand on the nearest bank and Alfie lays the course in front of you for the wind.{shorter ? ' It is narrow here in this wind, so the course is a shorter one.' : ''}
        </p>
        {spot && <Btn small onClick={() => onSpot(null)}>Back to the club's spot</Btn>}
      </div>
    </div>
  );
}

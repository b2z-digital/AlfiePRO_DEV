// A small map of the whole course for the Course panel: the pond, the marks and line, every boat as
// a dot with its heading, you highlighted, and the mark you're sailing to ringed. So you always know
// where you are, whatever the main view is doing.
import { useEffect, useRef } from 'react';
import type { Race } from '@/sim/engine';
import { dir } from '@/sim/math';
import type { BankCam } from './bank';
import { drawVenueLand } from './venueMap';

/** `cam`: in the bank view, the wedge of what you can see from where you stand. */
export default function CourseMap({ race, width = 240, height = 170, cam = null }: { race: Race; width?: number; height?: number; cam?: BankCam | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = width * dpr; cv.height = height * dpr;
    const draw = () => {
      const ctx = cv.getContext('2d'); if (!ctx) return;
      const c = race.course, B = c.bounds;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      // Fit the pond, rotated so upwind is up.
      const lenA = B.alongMax - B.alongMin, lenC = 2 * B.across;
      const s = Math.min((width - 12) / lenC, (height - 12) / lenA);
      const midA = (B.alongMin + B.alongMax) / 2;
      const P = (x: number, y: number) => {
        const dx = x - c.origin.x, dy = y - c.origin.y;
        const al = dx * c.up.x + dy * c.up.y, ac = dx * c.right.x + dy * c.right.y;
        return [width / 2 + ac * s, height / 2 - (al - midA) * s] as const;
      };
      if (race.venue) {
        // The real lake and its bank round the course area.
        ctx.fillStyle = 'rgba(30,70,130,0.35)';
        ctx.fillRect(0, 0, width, height);
        drawVenueLand(ctx, race.venue, (x, y) => [P(x, y)[0], P(x, y)[1]], s, width, height, false);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(235,240,255,0.18)'; ctx.lineWidth = 1;
        ctx.strokeRect(width / 2 - B.across * s, height / 2 - (B.alongMax - midA) * s, lenC * s, lenA * s);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = 'rgba(30,70,130,0.35)';
        ctx.strokeStyle = 'rgba(150,190,140,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(width / 2 - B.across * s, height / 2 - (B.alongMax - midA) * s, lenC * s, lenA * s); ctx.fill(); ctx.stroke();
      }
      // What you can see from the bank.
      if (cam && cam.ready) {
        const [cx0, cy0] = P(cam.x, cam.y);
        const far = Math.max(lenA, lenC) * 1.2;
        const edge = (a: number) => { const v = dir(a); const hx = v.x * c.right.x + v.y * c.right.y, hy = v.x * c.up.x + v.y * c.up.y; return [cx0 + hx * far * s, cy0 - hy * far * s] as const; };
        const half = cam.fov / 2;
        const [ax, ay] = edge(cam.yaw - half), [bx, by] = edge(cam.yaw + half);
        ctx.save();
        ctx.beginPath(); ctx.rect(width / 2 - B.across * s, height / 2 - (B.alongMax - midA) * s, lenC * s, lenA * s); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(ax, ay); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(cx0, cy0, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      // Start line and gate.
      const [lx1, ly1] = P(c.start.pin.x, c.start.pin.y), [lx2, ly2] = P(c.start.stbd.x, c.start.stbd.y);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#FFB340';
      ctx.beginPath(); ctx.moveTo(lx1, ly1); ctx.lineTo(lx2, ly2); ctx.stroke(); ctx.setLineDash([]);
      // The mark you're sailing to.
      const p = race.player;
      const leg = p ? race.course.legs[p.started ? p.legIndex : 0] : null;
      const nextIds = leg?.kind === 'mark' ? [leg.rounding.markId] : leg?.kind === 'gate' ? [leg.options[0].markId, leg.options[1].markId] : [];
      for (const m of c.marks) {
        const [mx, my] = P(m.p.x, m.p.y);
        ctx.fillStyle = '#FF9F43';
        ctx.beginPath(); ctx.arc(mx, my, 2.6, 0, Math.PI * 2); ctx.fill();
        if (nextIds.includes(m.id)) { ctx.strokeStyle = '#9CCBFF'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.stroke(); }
      }
      // Boats.
      for (const b of race.boats) {
        if (b.isPlayer) continue;
        const [bx, by] = P(b.x, b.y);
        ctx.globalAlpha = b.finished ? 0.35 : 0.85;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (p) {
        const [px, py] = P(p.x, p.y);
        // Heading tick, in map space (upwind is up).
        const hv = dir(p.hdg);
        const hx = hv.x * c.right.x + hv.y * c.right.y, hy = hv.x * c.up.x + hv.y * c.up.y;
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + hx * 9, py - hy * 9); ctx.stroke();
        ctx.fillStyle = '#4DA3FF'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    };
    draw();
    const id = window.setInterval(draw, 200);
    return () => window.clearInterval(id);
  }, [race, width, height, cam]);
  return <canvas ref={ref} style={{ width, height }} className="block rounded-xl bg-black/25" role="img" aria-label="Map of the course with your position and the fleet" />;
}

// Broadcast the final: a race played back from its tape under AlfiePRO's broadcast graphics, in full
// or as about thirty seconds of highlights. The camera directs itself (down the line for the start
// and the finish, the leaders and your boat in turn in between), and the graphics (the event bug, the
// running order, the wind, the boat in shot, the moments as they happen, the result) are drawn into
// the picture itself, so the highlights can be saved as a video to share.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, Share2, X } from 'lucide-react';
import type { Race } from '@/sim/engine';
import { DT } from '@/sim/physics';
import type { Boat } from '@/sim/types';
import { drawBank, followCam, newBankCam } from './bank';
import { Smoother } from './smooth';
import { boatName, cutHighlights, playTape, type Final, type Segment, type Tape } from './broadcast';

const KN = 0.514444;
const HEAD = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";
const BODY = "'Instrument Sans', system-ui, sans-serif";
const NAVY = 'rgba(9, 15, 32, 0.86)', BLUE = '#2E7BFF', SKY = '#4DA3FF', RED = '#FF4D5E', GOLD = '#F2C230';
const ORD = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; };

type Mode = 'full' | 'highlights';
interface Banner { text: string; tone: 'lead' | 'flag' | 'pen'; until: number }

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fit(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Everything drawn over the water: in the picture, so a recording carries it. */
function drawGraphics(ctx: CanvasRenderingContext2D, r: Race, o: {
  w: number; h: number; tape: Tape; mode: Mode; focus: Boat | null; ranked: Boat[]; banner: Banner | null; card: string | null; now: number; camYaw: number; result: boolean;
  /** How the race finished (from sailing it through once). */
  final: Final[];
}) {
  const { w, h } = o;
  const s = Math.max(0.72, Math.min(1.25, Math.min(w / 1280, h / 720)));
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  // The event bug, top left.
  const bx = 24 * s, by = 22 * s;
  ctx.font = `300 ${20 * s}px ${HEAD}`;
  const alfie = ctx.measureText('Alfie').width;
  ctx.font = `800 ${20 * s}px ${HEAD}`;
  const pro = ctx.measureText('PRO').width;
  ctx.font = `700 ${15 * s}px ${BODY}`;
  const title = fit(ctx, o.tape.title, 380 * s);
  const tw = ctx.measureText(title).width;
  ctx.font = `500 ${12 * s}px ${BODY}`;
  const sub = fit(ctx, o.tape.sub, 380 * s);
  const sw = ctx.measureText(sub).width;
  const bw = 18 * s + alfie + pro + 22 * s + Math.max(tw, sw) + 20 * s;
  rr(ctx, bx, by, bw, 52 * s, 12 * s); ctx.fillStyle = NAVY; ctx.fill();
  ctx.fillStyle = BLUE; rr(ctx, bx, by, 6 * s, 52 * s, 3 * s); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `300 ${20 * s}px ${HEAD}`; ctx.fillText('Alfie', bx + 18 * s, by + 26 * s);
  ctx.font = `800 ${20 * s}px ${HEAD}`; ctx.fillStyle = SKY; ctx.fillText('PRO', bx + 18 * s + alfie, by + 26 * s);
  const tx = bx + 18 * s + alfie + pro + 14 * s;
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(tx - 7 * s, by + 12 * s, 1, 28 * s);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 ${15 * s}px ${BODY}`; ctx.fillText(title, tx, by + 18 * s);
  ctx.fillStyle = 'rgba(220,230,245,0.75)'; ctx.font = `500 ${12 * s}px ${BODY}`; ctx.fillText(sub, tx, by + 36 * s);
  // REPLAY / HIGHLIGHTS
  const tag = o.mode === 'highlights' ? 'HIGHLIGHTS' : 'REPLAY';
  ctx.font = `800 ${11 * s}px ${BODY}`;
  const tgw = ctx.measureText(tag).width + 26 * s;
  rr(ctx, bx + bw + 8 * s, by + 14 * s, tgw, 24 * s, 12 * s); ctx.fillStyle = RED; ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(bx + bw + 18 * s, by + 26 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillText(tag, bx + bw + 26 * s, by + 26.5 * s);

  // The running order, down the left.
  if (r.t > r.gunT - 3 && !o.result) {
    const top = o.ranked.slice(0, 5);
    const me = r.player && !top.includes(r.player) ? r.player : null;
    const rows = me ? [...top, me] : top;
    const lx = bx, ly = by + 66 * s, rh = 30 * s, lw = 250 * s;
    rr(ctx, lx, ly, lw, rows.length * rh + 34 * s + (me ? 6 * s : 0), 12 * s); ctx.fillStyle = NAVY; ctx.fill();
    ctx.fillStyle = 'rgba(214,224,240,0.7)'; ctx.font = `700 ${10.5 * s}px ${BODY}`;
    const legs = r.course.legs.length;
    ctx.fillText(r.t < r.gunT ? 'STARTING' : `LEG ${Math.min(legs, (o.ranked[0]?.legIndex ?? 0) + 1)} OF ${legs}`, lx + 14 * s, ly + 17 * s);
    rows.forEach((b, i) => {
      const y = ly + 34 * s + i * rh + (me && b === me ? 6 * s : 0);
      const place = o.ranked.indexOf(b) + 1;
      if (b.isPlayer) { rr(ctx, lx + 6 * s, y, lw - 12 * s, rh - 4 * s, 8 * s); ctx.fillStyle = 'rgba(46,123,255,0.28)'; ctx.fill(); }
      ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${13 * s}px ${BODY}`; ctx.textAlign = 'right';
      ctx.fillText(String(place), lx + 32 * s, y + (rh - 4 * s) / 2);
      ctx.textAlign = 'left';
      ctx.fillStyle = b.color; rr(ctx, lx + 40 * s, y + 7 * s, 5 * s, rh - 18 * s, 2 * s); ctx.fill();
      ctx.fillStyle = 'rgba(214,224,240,0.75)'; ctx.font = `700 ${12 * s}px ${BODY}`;
      ctx.fillText(b.sail, lx + 52 * s, y + (rh - 4 * s) / 2);
      ctx.fillStyle = '#FFFFFF'; ctx.font = `600 ${13 * s}px ${BODY}`;
      ctx.fillText(fit(ctx, boatName(r, b), 128 * s), lx + 80 * s, y + (rh - 4 * s) / 2);
      if (b.finished) { ctx.fillStyle = GOLD; ctx.font = `800 ${11 * s}px ${BODY}`; ctx.textAlign = 'right'; ctx.fillText('FIN', lx + lw - 14 * s, y + (rh - 4 * s) / 2); ctx.textAlign = 'left'; }
    });
  }

  // The wind, top right.
  {
    const cx = w - 60 * s, cy = by + 38 * s, R = 30 * s;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = NAVY; ctx.fill();
    const blowTo = ((r.course.axis + 180 - o.camYaw) * Math.PI) / 180;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(blowTo);
    ctx.strokeStyle = SKY; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 15 * s); ctx.lineTo(0, -13 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7 * s, -6 * s); ctx.lineTo(0, -15 * s); ctx.lineTo(7 * s, -6 * s); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${13 * s}px ${BODY}`; ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(r.wind.baseTws / KN)} KN`, cx, cy + R + 14 * s);
    ctx.textAlign = 'left';
  }

  // The boat in shot, lower left.
  if (o.focus && !o.card && !o.result) {
    const b = o.focus, place = o.ranked.indexOf(b) + 1;
    const lx = bx, ly = h - 96 * s;
    ctx.font = `800 ${24 * s}px ${HEAD}`;
    const name = fit(ctx, boatName(r, b), 360 * s);
    const nw = Math.max(ctx.measureText(name).width, 180 * s);
    rr(ctx, lx, ly, nw + 110 * s, 70 * s, 12 * s); ctx.fillStyle = NAVY; ctx.fill();
    rr(ctx, lx, ly, 74 * s, 70 * s, 12 * s); ctx.fillStyle = b.isPlayer ? BLUE : 'rgba(255,255,255,0.1)'; ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = `800 ${28 * s}px ${HEAD}`;
    ctx.fillText(b.finished ? ORD(place) : String(place), lx + 37 * s, ly + 33 * s);
    ctx.font = `700 ${9.5 * s}px ${BODY}`; ctx.fillText(b.finished ? 'FINISHED' : 'PLACE', lx + 37 * s, ly + 55 * s);
    ctx.textAlign = 'left';
    ctx.font = `800 ${24 * s}px ${HEAD}`; ctx.fillText(name, lx + 90 * s, ly + 27 * s);
    ctx.fillStyle = 'rgba(214,224,240,0.8)'; ctx.font = `600 ${13 * s}px ${BODY}`;
    const leg = r.course.legs[b.legIndex];
    const bits = [name.startsWith('Sail ') ? null : `Sail ${b.sail}`, b.country ?? null, leg && b.started && !b.finished ? (leg.upwind ? 'Upwind' : 'Downwind') : null].filter(Boolean);
    ctx.fillText(bits.join(' · '), lx + 90 * s, ly + 51 * s);
  }

  // A moment as it happens, top centre.
  if (o.banner && o.now < o.banner.until && !o.card) {
    ctx.font = `800 ${16 * s}px ${BODY}`;
    const text = fit(ctx, o.banner.text, Math.min(620 * s, w - 200 * s));
    const bw2 = ctx.measureText(text).width + 40 * s;
    const x = (w - bw2) / 2, y = by;
    rr(ctx, x, y, bw2, 44 * s, 22 * s); ctx.fillStyle = o.banner.tone === 'lead' ? GOLD : o.banner.tone === 'pen' ? RED : BLUE; ctx.fill();
    ctx.fillStyle = o.banner.tone === 'lead' ? '#1A1405' : '#FFFFFF'; ctx.textAlign = 'center'; ctx.fillText(text, w / 2, y + 22.5 * s); ctx.textAlign = 'left';
  }

  // A highlights title card.
  if (o.card) {
    ctx.fillStyle = 'rgba(6,10,22,0.72)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = BLUE; ctx.fillRect(w / 2 - 40 * s, h / 2 - 44 * s, 80 * s, 4 * s);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = `800 ${46 * s}px ${HEAD}`;
    ctx.fillText(o.card.toUpperCase(), w / 2, h / 2);
    ctx.font = `600 ${15 * s}px ${BODY}`; ctx.fillStyle = 'rgba(214,224,240,0.8)';
    ctx.fillText(o.tape.title, w / 2, h / 2 + 44 * s);
    ctx.textAlign = 'left';
  }

  // The result.
  if (o.result) {
    const all = o.final.map(f => ({ boat: r.boats[f.boat], place: f.place, status: f.status })).filter(x => x.boat);
    const rows = all.filter(x => x.status === 'finished').slice(0, 3);
    const me = all.find(x => x.boat.isPlayer);
    const cw = Math.min(520 * s, w - 40 * s), ch = (rows.length + (me && me.place > 3 ? 1 : 0)) * 46 * s + 92 * s;
    const x = (w - cw) / 2, y = (h - ch) / 2;
    ctx.fillStyle = 'rgba(6,10,22,0.55)'; ctx.fillRect(0, 0, w, h);
    rr(ctx, x, y, cw, ch, 18 * s); ctx.fillStyle = NAVY; ctx.fill();
    ctx.fillStyle = GOLD; ctx.font = `800 ${12 * s}px ${BODY}`; ctx.fillText('RESULT', x + 26 * s, y + 30 * s);
    ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${22 * s}px ${HEAD}`; ctx.fillText(fit(ctx, o.tape.title, cw - 52 * s), x + 26 * s, y + 58 * s);
    const list = me && me.place > 3 ? [...rows, me] : rows;
    list.forEach((row, i) => {
      const yy = y + 92 * s + i * 46 * s;
      if (row.boat.isPlayer) { rr(ctx, x + 14 * s, yy - 4 * s, cw - 28 * s, 40 * s, 10 * s); ctx.fillStyle = 'rgba(46,123,255,0.28)'; ctx.fill(); }
      ctx.fillStyle = row.place === 1 ? GOLD : row.place === 2 ? '#C9D2DE' : row.place === 3 ? '#D9925B' : '#FFFFFF';
      ctx.font = `800 ${20 * s}px ${HEAD}`; ctx.fillText(row.status === 'finished' ? ORD(row.place) : row.status.toUpperCase(), x + 26 * s, yy + 16 * s);
      ctx.fillStyle = '#FFFFFF'; ctx.font = `700 ${16 * s}px ${BODY}`; ctx.fillText(fit(ctx, boatName(r, row.boat), cw - 200 * s), x + 92 * s, yy + 16 * s);
      ctx.fillStyle = 'rgba(214,224,240,0.75)'; ctx.font = `600 ${13 * s}px ${BODY}`; ctx.textAlign = 'right';
      ctx.fillText(`Sail ${row.boat.sail}`, x + cw - 26 * s, yy + 16 * s); ctx.textAlign = 'left';
    });
  }
  ctx.restore();
}

export interface SimBroadcastProps {
  tape: Tape;
  /** Keep it in your broadcasts (shown for a race not kept yet). */
  onKeep?: () => void;
  kept?: boolean;
  onClose: () => void;
}

export default function SimBroadcast({ tape, onKeep, kept, onClose }: SimBroadcastProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode>('highlights');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [segs, setSegs] = useState<Segment[] | null>(null);
  const [final, setFinal] = useState<Final[]>([]);
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(false);
  const [rec, setRec] = useState<'idle' | 'recording' | { url: string; file: File }>('idle');
  const recorder = useRef<MediaRecorder | null>(null);
  const st = useRef({ playing, speed, mode, segs });
  st.current = { playing, speed, mode, segs };

  // Cut the highlights once.
  useEffect(() => cutHighlights(tape, (s, f) => { setFinal(f); setSegs(s); }), [tape]);
  const finalRef = useRef(final);
  finalRef.current = final;

  const restart = useCallback((m: Mode) => { setMode(m); setFinished(false); setPlaying(true); setRun(n => n + 1); }, []);

  useEffect(() => {
    const cv = canvas.current, ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    if (mode === 'highlights' && !segs) return;
    const race = playTape(tape);
    const cam = newBankCam();
    const smooth = new Smoother();
    const size = { w: 0, h: 0, dpr: 1 };
    const fitCanvas = () => {
      const b = cv.getBoundingClientRect();
      size.dpr = Math.min(2, window.devicePixelRatio || 1, 1920 / Math.max(1, b.width));
      size.w = Math.max(1, Math.round(b.width)); size.h = Math.max(1, Math.round(b.height));
      cv.width = Math.round(size.w * size.dpr); cv.height = Math.round(size.h * size.dpr);
    };
    fitCanvas();
    const ro = new ResizeObserver(fitCanvas); ro.observe(cv);
    const target = { x: 0, y: 0, ready: false };
    let raf = 0, last = performance.now(), acc = 0, dead = false;
    let seg = 0, card: { label: string; until: number } | null = null, result: number | null = null;
    let banner: Banner | null = null, leader = '', seenInc = 0, focusOn: 'leaders' | 'me' = 'leaders', switchAt = 0, shot = '', cutAt = -99;
    const segsNow = mode === 'highlights' ? segs! : null;
    const finishedRef = { current: false };
    if (segsNow?.length) card = { label: segsNow[0].label, until: performance.now() + 1500 };

    const ranked = () => [...race.boats].sort((a, b) => race.progressScore(b) - race.progressScore(a));
    const frame = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const s = st.current;
      // Highlights: under a title card, run on to the segment's start.
      if (segsNow && card) {
        const want = segsNow[seg]?.from ?? 0;
        let n = 0;
        while (race.t < want && n < 1500 && !race.ended) { race.step(); n++; }
        if (now > card.until && race.t >= want) { card = null; cam.ready = false; target.ready = false; }
      } else if (s.playing && result === null) {
        acc += dt * (segsNow ? 1 : s.speed);
        let n = 0;
        while (acc >= DT && n < 80) { smooth.mark(race); race.step(); acc -= DT; n++; }
        if (n >= 80) acc = 0;
      }
      // Where the highlights go next, and when it's all over.
      if (segsNow && !card && result === null && race.t >= (segsNow[seg]?.to ?? Infinity)) {
        seg++;
        if (seg < segsNow.length) card = { label: segsNow[seg].label, until: now + 1300 };
        else result = now;
      }
      if (!segsNow && result === null && (race.ended || (race.boats.every(b => b.finished || b.retired || b.dsq)))) result = now;
      if (result !== null && now - result > 5200 && !finishedRef.current) { finishedRef.current = true; setFinished(true); }

      const order = ranked();
      // Moments: a change of lead, a penalty, a boat over the line.
      if (race.t > race.gunT + 15 && order[0] && order[0].id !== leader && leader) banner = { text: `${order[0].sail} ${boatName(race, order[0])} takes the lead`, tone: 'lead', until: now + 3500 };
      if (order[0]) leader = order[0].id;
      while (seenInc < race.incidents.length) {
        const inc = race.incidents[seenInc++];
        const b = race.boats.find(x => x.id === inc.offender);
        if (b) banner = { text: inc.kind === 'ocs' ? `${b.sail} ${boatName(race, b)}: over the line` : `${b.sail} ${boatName(race, b)}: penalty, rule ${inc.rule}`, tone: inc.kind === 'ocs' ? 'flag' : 'pen', until: now + 3500 };
      }

      // The camera: down the line for the start and the finish; the leaders and your boat in turn between.
      const preStart = race.t < race.gunT + 6;
      const finishing = order.some(b => b.finished) || (order[0] && order[0].legIndex >= race.course.legs.length - 1 && Math.hypot(order[0].x - race.course.finish.pin.x, order[0].y - race.course.finish.pin.y) < 14 * race.course.L);
      if (race.t > switchAt) { focusOn = focusOn === 'leaders' && race.player ? 'me' : 'leaders'; switchAt = race.t + (focusOn === 'me' ? 10 : 14); }
      const racing = order.filter(b => !b.finished && !b.retired);
      let focus = preStart ? null : finishing ? (racing[0] ?? order[0]) : focusOn === 'me' && race.player && !race.player.finished ? race.player : (racing[0] ?? order[0]);
      // Hold a shot at least four seconds (two boats swapping places mustn't flick the camera between them).
      const held = race.boats.find(b => b.id === shot);
      if (focus && held && focus !== held && race.t - cutAt < 4 && !held.finished) focus = held;
      // In shot: the boat, and up to two others close by her (never a point of open water between far-apart boats).
      const near = (b: Boat) => (focus ? Math.hypot(b.x - focus.x, b.y - focus.y) : 0);
      const group = preStart ? race.boats : focus ? [focus, ...racing.filter(b => b !== focus && near(b) < 10 * race.course.L).sort((a, b) => near(a) - near(b)).slice(0, 2)] : race.boats;
      const tx = group.reduce((a, b) => a + b.x, 0) / group.length, ty = group.reduce((a, b) => a + b.y, 0) / group.length;
      // A new boat in shot is a cut to another camera, not a pan across the water.
      const fid = focus?.id ?? '';
      if (fid !== shot) { shot = fid; cutAt = race.t; target.ready = false; cam.ready = false; }
      const k = target.ready ? Math.min(1, dt * 1.2) : 1;
      target.x += (tx - target.x) * k; target.y += (ty - target.y) * k; target.ready = true;

      smooth.apply(race, acc / DT);
      followCam(cam, race, target, dt, 1.45, false, preStart || !!finishing);
      const F = (size.w / 2) / Math.tan((cam.fov / 2) * (Math.PI / 180));
      cam.pitch = Math.atan((0.2 * size.h) / F) * (180 / Math.PI);
      drawBank(ctx, race, { w: size.w, h: size.h, dpr: size.dpr, cam, next: null, showZones: false, preStart: race.t < race.gunT, flashes: [], back: 0, detail: 2, credit: true, names: false });
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      drawGraphics(ctx, race, { w: size.w, h: size.h, tape, mode: segsNow ? 'highlights' : 'full', focus, ranked: order, banner, card: card?.label ?? null, now, camYaw: cam.yaw, result: result !== null, final: finalRef.current });
      smooth.restore(race);
    };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); };
    // (A new run, a new mode, or the cut arriving starts it again.)
  }, [tape, mode, segs, run]);

  // Saving the highlights as a video: play them through once, recording the picture.
  const record = useCallback(() => {
    const cv = canvas.current;
    if (!cv || typeof MediaRecorder === 'undefined' || !('captureStream' in cv)) return;
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
    const stream = (cv as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30);
    const mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const name = `alfiepro-highlights-${tape.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
      setRec({ url: URL.createObjectURL(blob), file: new File([blob], name, { type: blob.type }) });
    };
    recorder.current = mr;
    setRec('recording');
    restart('highlights');
    window.setTimeout(() => mr.start(500), 50);
  }, [restart, tape.title]);
  useEffect(() => {
    if (finished && recorder.current && recorder.current.state === 'recording') { recorder.current.stop(); recorder.current = null; }
  }, [finished]);
  useEffect(() => () => { if (typeof rec === 'object') URL.revokeObjectURL(rec.url); }, [rec]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const canRecord = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  const share = async () => {
    if (typeof rec !== 'object') return;
    try { if (navigator.canShare?.({ files: [rec.file] })) { await navigator.share({ files: [rec.file], title: tape.title }); return; } } catch { /* fall through to saving it */ }
    const a = document.createElement('a'); a.href = rec.url; a.download = rec.file.name; a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-[#F1F4FA]" role="dialog" aria-modal="true" aria-label={`Broadcast: ${tape.title}`} style={{ fontFamily: BODY }}>
      <canvas ref={canvas} className="block min-h-0 w-full flex-1" aria-hidden="true" />
      {mode === 'highlights' && !segs && <p className="absolute left-1/2 top-1/2 m-0 -translate-x-1/2 -translate-y-1/2 text-[15px] font-semibold">Cutting the highlights…</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0B1322] px-3 py-2.5 sm:px-5">
        <div className="flex gap-1.5" role="group" aria-label="What to watch">
          {(['highlights', 'full'] as Mode[]).map(m => (
            <button key={m} type="button" disabled={rec === 'recording'} onClick={() => restart(m)} aria-pressed={mode === m}
              className="sim-chip-btn" style={mode === m ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>{m === 'highlights' ? 'Highlights' : 'The whole race'}</button>
          ))}
        </div>
        {mode === 'full' && (
          <>
            <button type="button" className="sim-chip-btn" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
            <div className="flex gap-1" role="group" aria-label="Speed">
              {[1, 2, 4].map(x => <button key={x} type="button" className="sim-chip-btn" aria-pressed={speed === x} onClick={() => setSpeed(x)} style={speed === x ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>{x}×</button>)}
            </div>
          </>
        )}
        {finished && <button type="button" className="sim-chip-btn" onClick={() => restart(mode)}>Watch again</button>}
        <span className="flex-1" />
        {onKeep && !kept && <button type="button" className="sim-chip-btn" onClick={onKeep}>Keep in your broadcasts</button>}
        {kept && <span className="text-[13px]" style={{ color: 'rgba(214,224,240,0.7)' }}>In your broadcasts</span>}
        {canRecord && rec === 'idle' && <button type="button" className="sim-chip-btn" disabled={!segs} onClick={record}><Download size={15} />Save the highlights as a video</button>}
        {rec === 'recording' && <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#FF4D5E]" />Recording the highlights…</span>}
        {typeof rec === 'object' && (
          <>
            <a className="sim-chip-btn" href={rec.url} download={rec.file.name}><Download size={15} />Download the video</a>
            {typeof navigator.share === 'function' && <button type="button" className="sim-chip-btn" onClick={() => void share()}><Share2 size={15} />Share</button>}
          </>
        )}
        <button type="button" className="sim-chip-btn" onClick={onClose} aria-label="Close the broadcast"><X size={16} /></button>
      </div>
    </div>
  );
}

// The simulator's front window: a fleet of AI skippers racing right now, on the water and in the
// conditions you've set up, seen from the bank. It's the real engine and the real renderer, so what
// you see here is what you're about to sail. It rests when it's scrolled out of view or the tab is
// hidden, draws with less detail than a race (it's a backdrop), and holds one still frame for
// anyone who has asked their device for less motion.
import React, { useEffect, useRef } from 'react';
import { Race } from '@/sim/engine';
import { DT } from '@/sim/physics';
import type { RaceSettings } from '@/sim/types';
import { VENUES } from '@/sim/venues';
import { drawBank, followCam, newBankCam } from './bank';
import { Smoother } from './smooth';
import type { Setup } from './SimHome';
import { windAt } from '@/sim/venue';

/** A fleet racing with nobody at the helm, in the conditions set up. */
function heroRace(s: Setup, seed: number): Race {
  const def = s.venue !== 'pond' ? VENUES[s.venue] : undefined;
  const settings: RaceSettings = {
    venue: def?.id, windFrom: def ? windAt(def, s.windPick).from : undefined, venueSpot: def ? s.spots?.[def.id] : undefined,
    classId: s.classId, fleetSize: Math.min(10, Math.max(6, s.fleetSize)), level: s.level, tune: 2,
    windStrength: s.windStrength, windCharacter: s.windCharacter,
    laps: 2, length: 'medium', sequenceSeconds: 14, coach: 'off', autoTrim: true, seaState: s.seaState,
    seed, noPlayer: true,
  };
  const race = new Race(settings);
  // Open on the fleet coming up to the line, a few seconds before the gun.
  while (race.t < race.gunT - 5) race.step();
  return race;
}

/** `fill`: fill the box it's put in (a backdrop), instead of being a box of its own. */
export default function SimHero({ setup, children, className, fill, foot = 0 }: { setup: Setup; children?: React.ReactNode; className?: string; fill?: boolean; /** How much of its height is covered at the foot (0 to 1), by panels laid over it: the fleet is framed above them. */ foot?: number }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // (A club's own water arrives from the database a moment after the page opens: the window is rebuilt when it does.)
  const key = `${setup.venue}|${VENUES[setup.venue] ? 1 : 0}|${setup.windDir === 'usual' ? setup.windPick ?? 0 : 0}|${(setup.spots?.[setup.venue] ?? []).join(',')}|${setup.classId}|${setup.fleetSize}|${setup.level}|${setup.windStrength}|${setup.windCharacter}|${setup.seaState}`;
  const latest = useRef(setup);
  latest.current = setup;
  // (As a backdrop the words take more of the left, so the fleet is kept further right.)
  const fillRef = useRef(!!fill);
  fillRef.current = !!fill;
  const footRef = useRef(foot);
  footRef.current = foot;

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let race: Race | null = null;
    const cam = newBankCam();
    const smooth = new Smoother();
    const size = { w: 0, h: 0, dpr: 1 };
    const fit = () => {
      const r = cv.getBoundingClientRect();
      size.dpr = Math.min(1.25, window.devicePixelRatio || 1);
      size.w = Math.max(1, Math.round(r.width)); size.h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(size.w * size.dpr); cv.height = Math.round(size.h * size.dpr);
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(cv);
    let seen = true;
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { seen = es.some(e => e.isIntersecting); }) : null;
    io?.observe(cv);

    const target = { x: 0, y: 0, ready: false };
    const aim = (r: Race, dt: number) => {
      // Watch the thick of it: the three boats nearest the middle of the fleet still racing.
      const bs = r.boats.filter(b => !b.finished && !b.retired);
      if (!bs.length) return;
      const cx0 = bs.reduce((s, b) => s + b.x, 0) / bs.length, cy0 = bs.reduce((s, b) => s + b.y, 0) / bs.length;
      const near = [...bs].sort((a, b) => Math.hypot(a.x - cx0, a.y - cy0) - Math.hypot(b.x - cx0, b.y - cy0)).slice(0, 3);
      const tx = near.reduce((s, b) => s + b.x, 0) / near.length, ty = near.reduce((s, b) => s + b.y, 0) / near.length;
      const k = target.ready ? Math.min(1, dt * 0.9) : 1;
      target.x += (tx - target.x) * k; target.y += (ty - target.y) * k; target.ready = true;
    };
    const draw = (r: Race, dt: number, detail: number) => {
      aim(r, dt);
      // On a wide window the words sit on the left, so the fleet is kept to the right of the middle:
      // look at a point a little to the fleet's left.
      const vx = target.x - cam.x, vy = target.y - cam.y, d = Math.hypot(vx, vy) || 1;
      const off = size.w > 760 && cam.ready ? d * Math.tan((fillRef.current ? 0.27 : 0.2) * cam.fov * (Math.PI / 180)) : 0;
      followCam(cam, r, { x: target.x - (vy / d) * off, y: target.y + (vx / d) * off }, dt, 1.5, false, r.t < r.gunT + 4);
      // A wide, low window: look out level, with the far shore and some sky across the top of it.
      const F = (size.w / 2) / Math.tan((cam.fov / 2) * (Math.PI / 180));
      // (With panels over its foot, it looks down a little more, which lifts the fleet clear of them.)
      cam.pitch = Math.atan(((0.27 + Math.min(0.16, Math.max(0, footRef.current - 0.3) * 0.5)) * size.h) / F) * (180 / Math.PI);
      drawBank(ctx, r, { w: size.w, h: size.h, dpr: size.dpr, cam, next: null, showZones: false, preStart: r.t < r.gunT, flashes: [], back: 0, detail, credit: false });
    };

    let raf = 0, timer = 0, last = performance.now(), acc = 0, slow = 0, detail = 1, seed = Math.floor(Math.random() * 1e6), dead = false;
    const begin = () => {
      if (dead) return;
      try { race = heroRace(latest.current, seed++); } catch { race = null; }
      cam.ready = false; target.ready = false; acc = 0;
      if (race && still) draw(race, 0, 1);
    };
    // Built a moment after the page is up, so opening the simulator never waits on it.
    timer = window.setTimeout(begin, 60);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const raw = Math.max(0, (now - last) / 1000);
      last = now;
      const r = race;
      if (!r || still || !seen || document.hidden || raw > 0.5) return;
      const dt = Math.min(0.1, raw);
      // A backdrop mustn't cost the page its smoothness: on a slow device it draws with less detail.
      slow = raw > 1 / 32 ? slow + raw : Math.max(0, slow - raw);
      if (slow > 2 && detail > 0) { detail--; slow = 0; }
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 4) { smooth.mark(r); r.step(); acc -= DT; n++; }
      if (n >= 4) acc = 0;
      smooth.apply(r, acc / DT);
      draw(r, dt, detail);
      smooth.restore(r);
      // Another race when this one's leaders are home, or it has run long enough.
      if (r.ended || r.boats.filter(b => b.finished).length >= 3 || r.t > r.gunT + 420) begin();
    };
    if (!still) raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); window.clearTimeout(timer); ro?.disconnect(); io?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className={className} style={{ position: fill ? 'absolute' : 'relative', inset: fill ? 0 : undefined, overflow: 'hidden', background: 'linear-gradient(180deg, #3F6FA8 0%, #8DB3D6 34%, #1C3558 36%, #0E2240 100%)' }}>
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
      {children}
    </div>
  );
}

// Where a tracked race's fixes come from: a session in the database (live through realtime, or
// finished), or a demo race sailed by the simulator's engine. Every screen reads a TrackedRace and
// doesn't care which.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VenueScene } from '@/sim/venue';
import { analyseRace, standingsAt, DEFAULT_SETUP, type RaceAnalysis, type Standing, type TrackedBoat, type TrackedCourse, type TrackingSetup } from './core/analyse';
import { DemoRace } from './core/demo';
import { boatsFrom, courseFrom, epoch, loadFixes, subscribeFixes, type ClubTracking, type Kit, type SessionRow } from './data';

export type RaceSpec =
  | { kind: 'demo'; seed: number; venue: string | null; mode: 'live' | 'replay'; speed: number }
  | { kind: 'session'; session: SessionRow; kit: Kit; tracking: ClubTracking };

export interface TrackedRace {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  boats: TrackedBoat[];
  course: TrackedCourse | null;
  gun: number | null;
  /** First fix, latest fix (seconds). */
  t0: number;
  t1: number;
  /** "Now" on a live race (the latest fix); the end of a finished one. */
  now: number;
  live: boolean;
  /** Compass bearing of the frame's +y (0: unknown, the frame is the anchors' own). */
  rot: number;
  venue: VenueScene | null;
  setup: TrackingSetup;
  /** Goes up whenever fixes arrive (for redraws). */
  frame: number;
  demo: DemoRace | null;
  name: string;
  setSpeed?: (x: number) => void;
}

const EMPTY: TrackedRace = { status: 'loading', boats: [], course: null, gun: null, t0: 0, t1: 0, now: 0, live: false, rot: 0, venue: null, setup: DEFAULT_SETUP, frame: 0, demo: null, name: '' };

export function useTrackedRace(spec: RaceSpec | null, setup: TrackingSetup = DEFAULT_SETUP): TrackedRace {
  const [race, setRace] = useState<TrackedRace>(EMPTY);
  const key = spec ? (spec.kind === 'demo' ? `demo:${spec.seed}:${spec.venue}:${spec.mode}` : `s:${spec.session.id}`) : 'none';
  const speedRef = useRef(spec?.kind === 'demo' ? spec.speed : 1);
  useEffect(() => { if (spec?.kind === 'demo') speedRef.current = spec.speed; }, [spec]);

  useEffect(() => {
    if (!spec) { setRace({ ...EMPTY, status: 'error', error: 'No race' }); return; }
    let stop = false;
    const cleanups: (() => void)[] = [];
    setRace({ ...EMPTY, setup });

    if (spec.kind === 'demo') {
      const demo = new DemoRace({ seed: spec.seed, venue: spec.venue });
      const snap = (live: boolean, frame: number): TrackedRace => {
        const first = Math.min(...demo.boats.map(b => b.fixes[0]?.t ?? Infinity));
        return {
          status: 'ready', boats: demo.boats, course: demo.course, gun: demo.gun, t0: Number.isFinite(first) ? first : 0, t1: demo.t, now: demo.t,
          live, rot: demo.rot, venue: demo.venue, setup, frame, demo, name: 'Demo race', setSpeed: (x: number) => { speedRef.current = x; },
        };
      };
      if (spec.mode === 'replay') {
        // Sail it in slices so the page stays responsive.
        const slice = () => {
          if (stop) return;
          demo.advance(demo.t + 25);
          if (demo.ended) setRace(snap(false, 1));
          else { setRace(r => ({ ...r, status: 'loading', t1: demo.t })); setTimeout(slice, 0); }
        };
        setTimeout(slice, 0);
      } else {
        let last = performance.now();
        let frame = 0;
        demo.advance(Math.max(0, demo.gun - 45));
        const id = window.setInterval(() => {
          const now = performance.now();
          const dt = Math.min(0.5, (now - last) / 1000) * speedRef.current;
          last = now;
          if (!demo.ended) demo.advance(demo.t + dt);
          setRace(snap(!demo.ended, ++frame));
          if (demo.ended) window.clearInterval(id);
        }, 200);
        cleanups.push(() => window.clearInterval(id));
      }
    } else {
      const { session, kit, tracking } = spec;
      const layout = kit.layouts.find(l => l.id === session.course_layout_id) ?? kit.layouts.find(l => l.is_default) ?? kit.layouts[0];
      const course = layout ? courseFrom(layout, kit.anchors) : null;
      const geo = tracking.class_geometry ?? {};
      const fixes: { tag_id: string; x: number; y: number; h: number | null; at: string }[] = [];
      let frame = 0;
      let sess = session;
      const build = (): TrackedRace => {
        const boats = boatsFrom(kit.tags, fixes, geo);
        const ts = boats.flatMap(b => [b.fixes[0].t, b.fixes[b.fixes.length - 1].t]);
        const t0 = ts.length ? Math.min(...ts) : 0, t1 = ts.length ? Math.max(...ts) : 0;
        return {
          status: 'ready', boats, course, gun: sess.gun_at ? epoch(sess.gun_at) : null, t0, t1, now: sess.is_live ? Math.max(t1, Date.now() / 1000 - 0.5) : t1,
          live: sess.is_live, rot: 0, venue: null, setup, frame: ++frame, demo: null, name: sess.name,
        };
      };
      void loadFixes(session.id).then(rows => {
        if (stop) return;
        if (!rows) { setRace({ ...EMPTY, status: 'error', error: 'Couldn’t load the fixes' }); return; }
        fixes.push(...rows);
        setRace(build());
        if (session.is_live) {
          let pending = false;
          void subscribeFixes(session.id, f => {
            fixes.push(f);
            if (!pending) { pending = true; setTimeout(() => { pending = false; if (!stop) setRace(build()); }, 250); }
          }, s => { sess = { ...sess, ...s }; if (!stop) setRace(build()); }).then(un => { if (stop) un(); else cleanups.push(un); });
        }
      });
    }
    return () => { stop = true; cleanups.forEach(f => f()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return race;
}

/** The race worked out at a moment, recomputed at most once a second while live. */
export function useAnalysis(r: TrackedRace, at?: number): { a: RaceAnalysis | null; standings: Standing[]; t: number } {
  const t = at ?? r.now;
  // A finished race is worked out once, to the end; standings at any moment read from that.
  const bucket = r.live ? Math.floor(t) : r.t1;
  const a = useMemo(() => {
    if (r.status !== 'ready' || !r.course || !r.boats.length) return null;
    return analyseRace(r.boats, r.course, r.gun, bucket, r.setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.status, r.course, r.gun, bucket, r.boats.length, r.setup]);
  const standings = useMemo(() => (a && r.course ? standingsAt(r.boats, r.course, a, Math.min(t, a.now)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, Math.floor(t * 2)]);
  return { a, standings, t };
}

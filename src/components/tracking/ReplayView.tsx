// Replay a finished race: scrub or play it back, pick boats to compare tracks, see every boat's time
// and place on each leg, and how far behind the leader each was through the race.
import { useEffect, useMemo, useState } from 'react';
import { standingsAt } from './core/analyse';
import TrackMap, { type Orient } from './TrackMap';
import { useAnalysis, type TrackedRace } from './source';
import { rt, rt1 } from './format';
import { Btn, C, Seg, cx } from '../race-simulator/ui';

export default function ReplayView({ race }: { race: TrackedRace }) {
  const { a } = useAnalysis(race, race.t1);
  const gun = race.gun ?? race.t0;
  const [t, setT] = useState<number | null>(null);
  const [play, setPlay] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [orient, setOrient] = useState<Orient>('wind');
  const [picked, setPicked] = useState<string[]>([]);
  const at = t ?? race.t1;

  useEffect(() => {
    if (!play) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setT(x => { const n = (x ?? race.t0) + dt; if (n >= race.t1) { setPlay(false); return race.t1; } return n; });
    }, 100);
    return () => window.clearInterval(id);
  }, [play, speed, race.t0, race.t1]);

  // Leg times: from her start to the first mark, mark to mark, the last mark to the finish.
  const legs = useMemo(() => {
    if (!a || !race.course) return null;
    const n = race.course.waypoints.length + 1;
    const rows = race.boats.map(b => {
      const st = a.starts.find(s => s.boatId === b.id)?.startedAt ?? null;
      const rs = a.roundings.filter(r => r.boatId === b.id).sort((x, y) => x.wp - y.wp);
      const fin = a.finishes.find(f => f.boatId === b.id)?.t ?? null;
      const marks: (number | null)[] = [st];
      for (let w = 0; w < n - 1; w++) marks.push(rs.find(r => r.wp === w)?.t ?? null);
      marks.push(fin);
      const times = Array.from({ length: n }, (_, i) => (marks[i] != null && marks[i + 1] != null ? marks[i + 1]! - marks[i]! : null));
      return { id: b.id, times, fin, place: fin != null ? a.finishes.findIndex(f => f.boatId === b.id) + 1 : null };
    });
    const ranks = Array.from({ length: n }, (_, i) => {
      const order = rows.filter(r => r.times[i] != null).sort((x, y) => x.times[i]! - y.times[i]!).map(r => r.id);
      return Object.fromEntries(order.map((id, k) => [id, k + 1]));
    });
    rows.sort((x, y) => (x.place ?? 99) - (y.place ?? 99));
    return { n, rows, ranks };
  }, [a, race]);

  // Metres behind the leader, every 5 s.
  const gaps = useMemo(() => {
    if (!a || !race.course || race.gun == null) return null;
    const out: { t: number; g: Record<string, number> }[] = [];
    const end = a.finishes.length ? a.finishes[0].t : race.t1;
    for (let tt = race.gun + 5; tt <= end; tt += 5) {
      const s = standingsAt(race.boats, race.course, a, tt);
      const lead = s[0]?.progress ?? 0;
      out.push({ t: tt, g: Object.fromEntries(s.filter(x => !x.finished).map(x => [x.boatId, lead - x.progress])) });
    }
    return out;
  }, [a, race]);

  if (race.status !== 'ready' || !race.course || !a) return <p className="p-6" style={{ color: C.mute }}>{race.status === 'error' ? race.error : 'Working the race out…'}</p>;
  const boat = (id: string) => race.boats.find(b => b.id === id)!;
  const show = picked.length ? picked : (legs?.rows.slice(0, 4).map(r => r.id) ?? []);
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-6)));
  const st = standingsAt(race.boats, race.course, a, Math.min(at, a.now));

  const W = 1000, H = 200;
  const maxG = Math.max(5, ...(gaps ?? []).flatMap(p => show.map(id => p.g[id] ?? 0)));
  const tEnd = gaps && gaps.length ? gaps[gaps.length - 1].t : race.t1;
  const xs = (tt: number) => ((tt - gun) / Math.max(1, tEnd - gun)) * W;
  const ys = (g: number) => (g / maxG) * (H - 10) + 5;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <section aria-label="Replay map" className="relative min-w-0 flex-[3_1_520px] overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0A1A33]" style={{ aspectRatio: '1.25' }}>
          <TrackMap race={race} t={at} orient={orient} tracks={show} trails={picked.length ? 99999 : 45} label="Replay map with the picked boats' tracks" onPick={toggle} />
          <div className="absolute left-3 top-3"><Seg size="sm" label="Map view" value={orient} onChange={setOrient} options={[{ value: 'wind', label: 'Wind up' }, { value: 'north', label: 'North up' }]} /></div>
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[rgba(6,11,22,0.88)] px-2.5 py-2">
            <Btn small primary onClick={() => { if (!play && at >= race.t1 - 0.1) setT(race.t0); setPlay(p => !p); }}>{play ? 'Pause' : 'Play'}</Btn>
            <span className="w-[58px] font-mono text-[14px] tabular-nums">{rt(at - gun)}</span>
            <input type="range" min={race.t0} max={race.t1} step={0.2} value={at} onChange={e => { setPlay(false); setT(Number(e.target.value)); }} aria-label="Race time" className="min-w-[120px] flex-1 accent-[#4DA3FF]" />
            <Seg size="sm" label="Playback speed" value={speed} onChange={setSpeed} options={[{ value: 1, label: '1×' }, { value: 4, label: '4×' }, { value: 10, label: '10×' }, { value: 30, label: '30×' }]} />
          </div>
        </section>
        <section aria-labelledby="rp-h" className="min-w-0 max-w-[420px] flex-[1_1_300px] rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-3">
          <h3 id="rp-h" className="m-0 px-1 pb-2 text-[15px] font-bold">At {rt(at - gun)}</h3>
          <ol className="m-0 list-none p-0">
            {st.map(s => {
              const b = boat(s.boatId), on = show.includes(s.boatId);
              return (
                <li key={s.boatId}>
                  <button type="button" onClick={() => toggle(s.boatId)} aria-pressed={picked.includes(s.boatId)}
                    className={cx('grid w-full cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] border-0 border-t border-white/[0.05] px-1.5 py-[6px] text-left text-[13px] text-[#F1F4FA]', on ? 'bg-white/[0.07]' : 'bg-transparent hover:bg-white/[0.04]')}>
                    <b className="text-center">{s.place}</b>
                    <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-[20px] w-1 rounded-sm" style={{ background: b.color, opacity: on ? 1 : 0.4 }} /><b>{b.sail}</b><span className="truncate" style={{ color: C.mute }}>{b.name}</span></span>
                    <span className="font-mono text-[12.5px]" style={{ color: C.mute }}>{s.finished && s.finishT != null ? rt1(s.finishT - gun) : s.place === 1 ? '' : `${Math.round(s.gapM)} m`}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="m-1 mt-2 text-[12px]" style={{ color: C.faint }}>Tap boats to compare their tracks (up to six).</p>
        </section>
      </div>

      {gaps && gaps.length > 1 && (
        <section aria-labelledby="gap-h" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 id="gap-h" className="m-0 text-[15px] font-bold">Behind the leader</h3>
            <span className="text-[12.5px]" style={{ color: C.mute }}>metres further to go than the leader, from the gun to the first finish</span>
            <span className="ml-auto flex flex-wrap gap-3 text-[12.5px]">{show.map(id => <span key={id} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-[3px] w-3 rounded" style={{ background: boat(id).color }} />{boat(id).sail}</span>)}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H + 18}`} className="mt-2 block h-auto w-full" role="img" aria-label="Line chart of each picked boat's distance behind the leader through the race">
            {[0, 0.5, 1].map(f => <g key={f}><line x1={0} x2={W} y1={ys(maxG * f)} y2={ys(maxG * f)} stroke="rgba(255,255,255,.08)" /><text x={W - 2} y={ys(maxG * f) + (f === 0 ? 12 : -4)} textAnchor="end" fontSize="11" fill="rgba(235,240,255,.5)">{Math.round(maxG * f)} m</text></g>)}
            {a.roundings.length > 0 && race.course.waypoints.map((w, i) => {
              const first = Math.min(...a.roundings.filter(r => r.wp === i).map(r => r.t));
              return Number.isFinite(first) ? <g key={i}><line x1={xs(first)} x2={xs(first)} y1={0} y2={H} stroke="rgba(255,159,67,.35)" strokeDasharray="3 3" /><text x={xs(first) + 3} y={H + 13} fontSize="11" fill="rgba(255,203,150,.8)">{w.name.replace(/^Mark /, '')}</text></g> : null;
            })}
            {show.map(id => (
              <polyline key={id} fill="none" stroke={boat(id).color} strokeWidth={2} strokeLinejoin="round"
                points={gaps.filter(p => p.g[id] != null).map(p => `${xs(p.t).toFixed(1)},${ys(p.g[id]).toFixed(1)}`).join(' ')} />
            ))}
            {at <= gaps[gaps.length - 1].t && <line x1={xs(at)} x2={xs(at)} y1={0} y2={H} stroke="#fff" strokeWidth={1} />}
          </svg>
        </section>
      )}

      {legs && (
        <section aria-labelledby="legs-h" className="overflow-x-auto rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
          <h3 id="legs-h" className="m-0 text-[15px] font-bold">Leg by leg</h3>
          <table className="mt-2 w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: C.faint }}>
                <th scope="col" className="py-1.5 pr-2 font-bold">Place</th><th scope="col" className="py-1.5 pr-2 font-bold">Boat</th>
                {Array.from({ length: legs.n }, (_, i) => <th key={i} scope="col" className="py-1.5 pr-2 text-right font-bold">Leg {i + 1}</th>)}
                <th scope="col" className="py-1.5 text-right font-bold">Finish</th>
              </tr>
            </thead>
            <tbody>
              {legs.rows.map(r => (
                <tr key={r.id} className="border-t border-white/[0.05]">
                  <td className="py-[7px] pr-2 font-bold">{r.place ?? '–'}</td>
                  <td className="py-[7px] pr-2"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-[18px] w-1 rounded-sm" style={{ background: boat(r.id).color }} /><b>{boat(r.id).sail}</b></span></td>
                  {r.times.map((x, i) => {
                    const k = legs.ranks[i][r.id];
                    return <td key={i} className="py-[7px] pr-2 text-right font-mono"><span>{x != null ? rt(x) : '–'}</span>{k != null && <span className={cx('ml-1.5 text-[11.5px]', k === 1 ? 'font-bold text-[#7DDC97]' : '')} style={k === 1 ? undefined : { color: C.faint }}>{k}</span>}</td>;
                  })}
                  <td className="py-[7px] text-right font-mono">{r.fin != null ? rt1(r.fin - gun) : 'DNF'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 mt-2 text-[12px]" style={{ color: C.faint }}>Leg 1 runs from her start to the first mark. The small number is her rank on that leg; green is the fastest.</p>
        </section>
      )}
    </div>
  );
}

// The start: the line close up, scrubbed through the last seconds, with every boat's call at the gun
// (how far her hull was across, how fast she was going) and where along the line the fleet started.
import { useEffect, useMemo, useState } from 'react';
import TrackMap from './TrackMap';
import { useAnalysis, type TrackedRace } from './source';
import { kn, rt1 } from './format';
import { Btn, C, Chip, cx } from '../race-simulator/ui';

export default function StartView({ race }: { race: TrackedRace }) {
  const { a } = useAnalysis(race, race.live ? undefined : race.t1);
  const gun = race.gun;
  const lo = gun != null ? Math.max(race.t0, gun - 30) : race.t0;
  const hi = gun != null ? Math.min(race.now, gun + 20) : race.now;
  const [t, setT] = useState<number | null>(null);
  const [play, setPlay] = useState(false);
  const at = t ?? (gun != null ? Math.min(gun, race.now) : race.now);
  useEffect(() => {
    if (!play) return;
    const id = window.setInterval(() => setT(x => { const n = (x ?? lo) + 0.1; if (n >= hi) { setPlay(false); return hi; } return n; }), 100);
    return () => window.clearInterval(id);
  }, [play, lo, hi]);

  const calls = useMemo(() => (a ? [...a.starts].sort((x, y) => (y.atGun || -99) - (x.atGun || -99)) : []), [a]);
  const bins = useMemo(() => {
    const n = 10, out = new Array(n).fill(0);
    for (const s of a?.starts ?? []) if (s.lineAt != null) out[Math.min(n - 1, Math.max(0, Math.floor(s.lineAt * n)))]++;
    return out;
  }, [a]);
  if (race.status !== 'ready' || !race.course) return <p className="p-6" style={{ color: C.mute }}>Loading the race…</p>;
  if (gun == null) return <p className="p-6" style={{ color: C.mute }}>The gun hasn't gone yet. The start opens here as soon as it does.</p>;
  if (race.now < gun) return <p className="p-6" style={{ color: C.mute }}>{Math.ceil(gun - race.now)} s to the gun.</p>;
  const boat = (id: string) => race.boats.find(b => b.id === id)!;
  const over = calls.filter(c => c.call === 'over'), close = calls.filter(c => c.call === 'close');
  const maxBin = Math.max(1, ...bins);
  const pinHalf = bins.slice(0, 5).reduce((s, x) => s + x, 0), boatHalf = bins.slice(5).reduce((s, x) => s + x, 0);
  const acc = race.setup.accuracy;

  return (
    <div className="flex flex-wrap items-start gap-3">
      <section aria-label="The start line" className="relative min-w-0 flex-[3_1_560px] overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0A1A33]" style={{ aspectRatio: '1.5' }}>
        <TrackMap race={race} t={at} startView trails={12} ladder={false} laylines={false} label="The start line, close up" />
        <div className="absolute left-3 top-3 rounded-2xl border border-white/10 bg-[rgba(6,11,22,0.86)] px-3 py-2">
          <span className="block font-mono text-[26px] font-semibold tabular-nums">{rt1(at - gun)}</span>
          <span className="block text-[12px]" style={{ color: C.mute }}>{at < gun ? 'before the gun' : at - gun < 0.05 ? 'the gun' : 'after the gun'}</span>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-[rgba(6,11,22,0.88)] px-2.5 py-2">
          <Btn small onClick={() => { if (!play && at >= hi - 0.05) setT(lo); setPlay(p => !p); }}>{play ? 'Pause' : 'Play'}</Btn>
          <input type="range" min={lo} max={hi} step={0.1} value={at} onChange={e => { setPlay(false); setT(Number(e.target.value)); }} aria-label="Time around the start" className="flex-1 accent-[#4DA3FF]" />
          <Btn small onClick={() => { setPlay(false); setT(gun); }}>The gun</Btn>
        </div>
      </section>

      <div className="flex min-w-0 max-w-[460px] flex-[1_1_320px] flex-col gap-3">
        <section aria-labelledby="calls-h" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="calls-h" className="m-0 text-[15px] font-bold">At the gun</h3>
            {over.length ? <Chip tone="warn">{over.length} over</Chip> : <Chip tone="good">Nobody over</Chip>}
            {close.length > 0 && <Chip>{close.length} too close to call</Chip>}
          </div>
          <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: C.mute }}>
            How far the hull was across the line, bow or stern, worked from the tag and the boat's bow offset. Within ±{Math.round(acc * 100)} cm is too close to call: the officer decides.
          </p>
          <ol className="m-0 mt-2 list-none p-0">
            {calls.map(s => {
              const b = boat(s.boatId);
              const d = s.atGun;
              return (
                <li key={s.boatId} className="grid grid-cols-[minmax(0,1fr)_84px_64px_70px] items-center gap-2 border-t border-white/[0.05] py-[7px] text-[13px]">
                  <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-[22px] w-1 rounded-sm" style={{ background: b.color }} /><b>{b.sail}</b><span className="truncate" style={{ color: C.mute }}>{b.name}</span></span>
                  <span className={cx('text-right font-mono', s.call === 'over' ? 'text-[#F87171]' : s.call === 'close' ? 'text-[#FFB224]' : '')}>{Number.isFinite(d) ? `${d > 0 ? '+' : ''}${Math.round(d * 100)} cm` : 'no fix'}</span>
                  <span className="text-right font-mono" style={{ color: C.mute }}>{kn(s.speedAtGun)}</span>
                  <span className="text-right text-[12px] font-bold" style={{ color: s.call === 'over' ? '#F87171' : s.call === 'close' ? '#FFB224' : '#7DDC97' }}>
                    {s.call === 'over' ? (s.startedAt != null ? `back ${rt1(s.startedAt - gun)}` : 'Over') : s.call === 'close' ? 'Close' : 'Clear'}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
        <section aria-labelledby="line-h" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
          <h3 id="line-h" className="m-0 text-[15px] font-bold">Where they started</h3>
          <div className="mt-3 flex h-[70px] items-end gap-1" role="img" aria-label={`${pinHalf} boats started in the pin half, ${boatHalf} in the boat half`}>
            {bins.map((n, i) => <span key={i} className="flex-1 rounded-t-[4px] bg-[#4DA3FF]" style={{ height: `${(n / maxBin) * 100}%`, minHeight: n ? 4 : 1, opacity: n ? 1 : 0.2 }} />)}
          </div>
          <div className="mt-1 flex justify-between text-[12px]" style={{ color: C.faint }}><span>Pin</span><span>Boat end</span></div>
          <p className="m-0 mt-2 text-[13px]" style={{ color: C.mute }}>
            {pinHalf > boatHalf * 1.5 ? 'The fleet piled into the pin half.' : boatHalf > pinHalf * 1.5 ? 'The fleet went for the boat end.' : 'The fleet spread along the line.'}
          </p>
        </section>
      </div>
    </div>
  );
}

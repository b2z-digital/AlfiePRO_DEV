// After the race: where you finished and how places changed by mark, a replay of the whole race
// with your track and the winner's, three things to work on, your rules incidents, and the numbers.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Race } from '@/sim/engine';
import type { RaceSummary } from './stats';
import { fmt } from './stats';
import { drawReplayMap } from './render';
import { ruleText } from './rulesText';
import { Btn, C, Cap, CoachGlyph, Seg, Tile, cx, ordinal } from './ui';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-white/[0.055] py-2.5 text-[13.5px]">
      <span style={{ color: C.mute }}>{label}</span>
      <span className="text-right font-display tabular-nums">{value}</span>
    </div>
  );
}

function PlacesChart({ pts, of }: { pts: { label: string; place: number }[]; of: number }) {
  if (pts.length < 2) return null;
  const W = 420, H = 74, pad = 10;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (p: number) => pad + ((p - 1) / Math.max(1, of - 1)) * (H - pad * 2);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.place).toFixed(1)}`).join(' ');
  return (
    <div className="min-w-[260px] flex-[0_1_420px]">
      <Cap className="mb-1.5">Places by mark</Cap>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Your place at each mark: ${pts.map(p => `${p.label} ${ordinal(p.place)}`).join(', ')}`}>
        <path d={d} fill="none" stroke="#4DA3FF" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.place)} r={3.5} fill={i > 0 && p.place > pts[i - 1].place ? '#FF9F43' : '#4DA3FF'} />)}
      </svg>
      <div className="flex justify-between text-[11px]" style={{ color: C.mute }}>{pts.map((p, i) => <span key={i}>{p.label} {p.place}</span>)}</div>
    </div>
  );
}

function ReplayMap({ race }: { race: Race }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const n = race.track.length;
  const [frame, setFrame] = useState(n - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const winner = useMemo(() => race.results()[0]?.boat, [race]);
  const focus = useMemo(() => [race.player?.id ?? '', winner?.id ?? ''].filter(Boolean), [race, winner]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setFrame(f => { const nf = f + dt * 5 * speed; if (nf >= n - 1) { setPlaying(false); return n - 1; } return nf; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, n]);

  useEffect(() => {
    const el = wrap.current, c = cv.current;
    if (!el || !c) return;
    const draw = () => {
      const w = el.clientWidth, h = Math.round(Math.min(680, Math.max(360, w * 0.8)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = `${w}px`; c.style.height = `${h}px`; }
      const ctx = c.getContext('2d');
      if (ctx) drawReplayMap(ctx, race, w, h, dpr, frame, focus);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [race, frame, focus]);

  const t = n ? race.track[Math.min(n - 1, Math.floor(frame))].t - race.gunT : 0;
  const end = n ? race.track[n - 1].t - race.gunT : 0;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Cap>Replay</Cap>
        <span className="inline-flex items-center gap-1.5 text-[12.5px]"><span className="h-[3px] w-3.5 rounded-sm" style={{ background: race.player?.color }} />You</span>
        {winner && !winner.isPlayer && <span className="inline-flex items-center gap-1.5 text-[12.5px]"><span className="h-[3px] w-3.5 rounded-sm" style={{ background: winner.color }} />{winner.sail}, winner</span>}
      </div>
      <div ref={wrap} className="overflow-hidden rounded-2xl">
        <canvas ref={cv} className="block" role="img" aria-label="Map of the race with your track and the winner's" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Btn icon aria-label={playing ? 'Pause the replay' : 'Play the replay'} onClick={() => { if (frame >= n - 1) setFrame(0); setPlaying(v => !v); }}>
          {playing
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>}
        </Btn>
        <input type="range" min={0} max={Math.max(0, n - 1)} step={1} value={Math.floor(frame)} onChange={e => { setPlaying(false); setFrame(Number(e.target.value)); }} className="min-w-[140px] flex-1 accent-[#4DA3FF]" aria-label="Replay time" />
        <span className="text-[13px] tabular-nums" style={{ color: C.mute }}>{t < 0 ? `−${fmt(-t)}` : fmt(t)} / {fmt(end)}</span>
        <Seg size="sm" label="Replay speed" value={speed} onChange={setSpeed} options={[{ value: 2, label: '2×' }, { value: 8, label: '8×' }, { value: 20, label: '20×' }]} />
      </div>
    </div>
  );
}

export default function SimDebrief({ race, sum, onHome, onAgain }: { race: Race; sum: RaceSummary; onHome: () => void; onAgain: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const placeText = sum.mode === 'start'
    ? sum.ocs ? 'OCS' : sum.late === null ? 'Not started' : `+${sum.late.toFixed(1)} s`
    : sum.place ? ordinal(sum.place) : sum.status.toUpperCase();
  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);

  return (
    <div className="min-h-full text-[14px] text-[#F1F4FA]" style={{ backgroundColor: C.bg, backgroundImage: 'radial-gradient(1100px 700px at 12% -10%, rgba(30,108,255,.2), transparent 60%)', fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center gap-4">
          <Btn onClick={onHome}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Simulator
          </Btn>
          <div className="min-w-0 flex-[1_1_320px]">
            <h1 className="m-0 font-display text-[30px] font-bold tracking-[-0.02em]">{sum.mode === 'start' ? 'Start report' : 'Race debrief'}</h1>
            <p className="m-0 mt-1 text-[14px]" style={{ color: C.mute }}>{sum.title} · {sum.cls} · {sum.level[0].toUpperCase()}{sum.level.slice(1)} skippers · {sum.wind}</p>
          </div>
          <Btn primary onClick={onAgain}>{sum.mode === 'start' ? 'Try another start' : 'Race again'}</Btn>
        </header>

        <section className="flex flex-wrap items-center gap-7 rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-6 py-5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[48px] font-bold leading-none tabular-nums">{placeText}</span>
            {sum.mode === 'race' && sum.place && <span className="text-[15px]" style={{ color: C.mute }}>of {sum.of}</span>}
          </div>
          <span className="w-px self-stretch bg-white/[0.08]" />
          {sum.mode === 'race' ? (
            <>
              <div><Cap>Time</Cap><p className="m-0 mt-1 font-display text-[22px] font-semibold tabular-nums">{sum.time !== null ? fmt(sum.time) : '–'}</p></div>
              <div><Cap>Behind the winner</Cap><p className="m-0 mt-1 font-display text-[22px] font-semibold tabular-nums">{sum.behind === null ? '–' : sum.behind < 0.05 ? 'Won' : `${Math.round(sum.behind)} s`}</p></div>
              <div><Cap>Penalties</Cap><p className="m-0 mt-1 font-display text-[22px] font-semibold tabular-nums">{sum.penalties}</p></div>
              <div className="ml-auto" />
              <PlacesChart pts={sum.placesByLeg} of={sum.of} />
            </>
          ) : (
            <>
              <div><Cap>Speed at the gun</Cap><p className="m-0 mt-1 font-display text-[22px] font-semibold tabular-nums">{pct(sum.spdAtGun)}</p></div>
              <div><Cap>Favoured end</Cap><p className="m-0 mt-1 font-display text-[22px] font-semibold">{sum.favoured === 'square' ? 'Square line' : sum.favoured}</p></div>
              <div><Cap>From the favoured end</Cap><p className="m-0 mt-1 font-display text-[22px] font-semibold tabular-nums">{sum.fromFavouredL === null ? '–' : `${Math.round(sum.fromFavouredL)} lengths`}</p></div>
            </>
          )}
        </section>

        <section className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-[999_1_620px] rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-5">
            <ReplayMap race={race} />
          </div>
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
            <div className="flex flex-col gap-4 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="flex items-center gap-2.5">
                <Tile size={36}><CoachGlyph size={18} /></Tile>
                <p className="m-0 text-[16px] font-semibold">{sum.takeaways.length > 1 ? `${sum.takeaways.length === 2 ? 'Two' : 'Three'} things to take away` : 'To take away'}</p>
              </div>
              {sum.takeaways.length === 0 && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>A clean race. Try a stronger fleet next time.</p>}
              {sum.takeaways.map((t, i) => (
                <div key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5">
                  <span className={cx('font-display font-bold', t.tone === 'warn' ? 'text-[#FFCB96]' : t.tone === 'good' ? 'text-[#A7F3D0]' : 'text-[#9CCBFF]')}>{i + 1}</span>
                  <p className="m-0 text-[14px] leading-normal">{t.text}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-4">
              <Cap className="mb-2">Rules incidents</Cap>
              {sum.incidents.length === 0 && <p className="m-0 border-t border-white/[0.055] py-2.5 text-[13.5px]" style={{ color: C.mute }}>None involving you.</p>}
              {sum.incidents.map((i, k) => {
                const rt = ruleText(i.rule);
                return (
                  <div key={k} className="border-t border-white/[0.055] py-2.5">
                    <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3">
                      <span className="text-[13px] tabular-nums" style={{ color: C.mute }}>{i.t < 0 ? `−${fmt(-i.t)}` : fmt(i.t)}</span>
                      <div className="min-w-0">
                        <p className="m-0 text-[13.5px] font-semibold">Rule {i.rule} · {i.mine ? 'you' : 'against you'}</p>
                        <p className="m-0 mt-0.5 truncate text-[12.5px]" style={{ color: C.mute }}>{i.title}</p>
                      </div>
                      <Btn small onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>{open === k ? 'Hide' : 'Explain'}</Btn>
                    </div>
                    {open === k && (
                      <div className="mt-2.5 flex flex-col gap-2 rounded-xl bg-white/[0.04] px-3.5 py-3 text-[13.5px] leading-normal">
                        <p className="m-0">{i.text}</p>
                        {i.next && <p className="m-0" style={{ color: C.mute }}><b className="text-[#F1F4FA]">Next time:</b> {i.next}</p>}
                        {rt && <p className="m-0" style={{ color: C.mute }}><b className="text-[#F1F4FA]">Rule {rt.rule}, {rt.title.toLowerCase()}:</b> {rt.text}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
          <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-[18px]">
            <Cap className="mb-1.5">Start</Cap>
            <Stat label="After the gun" value={sum.ocs ? 'Over early' : sum.late === null ? '–' : `${sum.late.toFixed(1)} s`} />
            <Stat label="Speed at the gun" value={pct(sum.spdAtGun)} />
            <Stat label="From the favoured end" value={sum.fromFavouredL === null ? (sum.favoured === 'square' ? 'Square line' : '–') : `${Math.round(sum.fromFavouredL)} lengths`} />
          </div>
          {sum.mode === 'race' && (
            <>
              <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-[18px]">
                <Cap className="mb-1.5">Upwind</Cap>
                <Stat label="Time on the lifted tack" value={pct(sum.upwind.liftedPct)} />
                <Stat label="Tacks on big headers" value={sum.upwind.headers ? `${sum.upwind.headerTacks} of ${sum.upwind.headers}` : '–'} />
                <Stat label="Tacks upwind" value={sum.upwind.tacks} />
              </div>
              <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-[18px]">
                <Cap className="mb-1.5">Mark roundings</Cap>
                <Stat label="Places gained or lost" value={sum.roundings.gained > 0 ? `+${sum.roundings.gained}` : String(sum.roundings.gained)} />
                <Stat label="Penalties" value={sum.penalties} />
                <Stat label="Incidents at marks" value={sum.incidents.filter(i => /^18|^31/.test(i.rule)).length} />
              </div>
              <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-[18px]">
                <Cap className="mb-1.5">Downwind</Cap>
                <Stat label="Speed vs target" value={pct(sum.downwind.spdPct)} />
                <Stat label="Gybes" value={sum.downwind.gybes} />
                <Stat label="Time in clear air" value={pct(sum.downwind.clearAirPct)} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// After the race: where you finished and how places changed by mark, a replay of the whole race
// with your track and the winner's, three things to work on, your rules incidents, and the numbers.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Race } from '@/sim/engine';
import type { RaceSummary, TrainLink } from './stats';
import { fmt } from './stats';
import { ReplayBox, drawReplayMap } from './render';
import { Moment, frameAt } from './moments';
import { ruleText } from './rulesText';
import { AlfieOrb, Btn, C, Cap, Seg, cx, ordinal } from './ui';

export type { TrainLink };

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

/** "Write it up": Alfie's short report of the race, to keep or share. */
function WriteUp({ onWrite }: { onWrite: () => Promise<{ text: string } | { error: string }> }) {
  const [st, setSt] = useState<{ busy: boolean; text?: string; error?: string }>({ busy: false });
  const [copied, setCopied] = useState(false);
  const go = async () => {
    setSt(s => ({ ...s, busy: true, error: undefined }));
    const r = await onWrite();
    setSt('text' in r ? { busy: false, text: r.text } : { busy: false, error: r.error });
    setCopied(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(st.text ?? ''); setCopied(true); } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="flex flex-col gap-2.5 border-t border-white/[0.06] pt-3.5">
      {!st.text && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Btn small onClick={go} disabled={st.busy}><AlfieOrb size={18} />{st.busy ? 'Alfie is writing…' : 'Write it up'}</Btn>
          <span className="text-[12.5px]" style={{ color: C.faint }}>A short race report to keep or share</span>
        </div>
      )}
      {st.error && <p className="m-0 text-[13px] text-[#FCA5A5]">{st.error}</p>}
      {st.text && (
        <>
          <Cap>Alfie's write-up</Cap>
          <div className="flex flex-col gap-2 text-[14px] leading-relaxed">{st.text.split(/\n\s*\n/).map((para, i) => <p key={i} className="m-0">{para}</p>)}</div>
          <div className="flex flex-wrap gap-2">
            <Btn small onClick={copy}>{copied ? 'Copied' : 'Copy'}</Btn>
            <Btn small quiet onClick={go} disabled={st.busy}>{st.busy ? 'Writing…' : 'Write it again'}</Btn>
          </div>
        </>
      )}
    </div>
  );
}

type Compare = 'winner' | 'ahead' | 'none';

/** The box to show for a moment: where the boats in it sailed from 6 s before to 8 s after, and the mark if it's a rounding. */
function momentBox(race: Race, m: Moment): ReplayBox {
  const ids = m.focus.map(id => race.boats.findIndex(b => b.id === id)).filter(i => i >= 0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (let k = frameAt(race, m.t - 6); k <= frameAt(race, m.t + 8); k++) {
    const d = race.track[k]?.d;
    if (d) for (const i of ids) grow(d[i * 5], d[i * 5 + 1]);
  }
  if (m.kind === 'start') { grow(race.course.start.pin.x, race.course.start.pin.y); grow(race.course.start.stbd.x, race.course.start.stbd.y); }
  if (m.kind === 'mark' || m.kind === 'layline') for (const mk of race.course.marks) if (Math.hypot(mk.p.x - (x0 + x1) / 2, mk.p.y - (y0 + y1) / 2) < 14 * race.course.L) grow(mk.p.x, mk.p.y);
  // At least 12 lengths across, so you can see what was round her.
  const L = race.course.L, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hw = Math.max(6 * L, (x1 - x0) / 2 + 2 * L), hh = Math.max(6 * L, (y1 - y0) / 2 + 2 * L);
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
}

const TONE_DOT: Record<Moment['tone'], string> = { good: '#34D399', warn: '#FF9F43', plain: '#9CCBFF' };

function ReplayMap({ race, moments, onTakeOver, onLink }: { race: Race; moments: Moment[]; onTakeOver?: (t: number) => void; onLink?: (l: TrainLink) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const n = race.track.length;
  const [frame, setFrame] = useState(n - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [active, setActive] = useState<number | null>(null);
  const [stopAt, setStopAt] = useState<number | null>(null);
  const [compare, setCompare] = useState<Compare>('winner');
  const rows = useMemo(() => race.results(), [race]);
  const p = race.player;
  const winner = rows[0]?.boat;
  const ahead = useMemo(() => { const k = rows.findIndex(r => r.boat === p); return k > 0 ? rows[k - 1].boat : null; }, [rows, p]);
  const rival = compare === 'winner' ? (winner !== p ? winner : rows[1]?.boat) : compare === 'ahead' ? ahead : null;
  const m = active !== null ? moments[active] : null;
  const focus = useMemo(() => (m ? m.focus : [p?.id ?? '', rival?.id ?? ''].filter(Boolean)), [m, p, rival]);
  const box = useMemo(() => (m ? momentBox(race, m) : undefined), [race, m]);
  const tAt = (f: number) => (n ? race.track[Math.max(0, Math.min(n - 1, Math.floor(f)))].t : 0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000); last = now;
      setFrame(f => {
        const nf = f + dt * 5 * speed;
        if (stopAt !== null && nf >= stopAt) { setPlaying(false); return stopAt; }
        if (nf >= n - 1) { setPlaying(false); return n - 1; }
        return nf;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, n, stopAt]);

  useEffect(() => {
    const el = wrap.current, c = cv.current;
    if (!el || !c) return;
    const draw = () => {
      const w = el.clientWidth, h = Math.round(Math.min(680, Math.max(360, w * 0.72)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = `${w}px`; c.style.height = `${h}px`; }
      const ctx = c.getContext('2d');
      if (ctx) drawReplayMap(ctx, race, w, h, dpr, frame, focus, box);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [race, frame, focus, box]);

  /** Watch a moment: from 6 s before it, at 2×, stopping 8 s after. */
  const watch = (k: number) => {
    const mo = moments[k];
    setActive(k);
    setFrame(frameAt(race, mo.t - 6));
    setStopAt(frameAt(race, mo.t + 8));
    setSpeed(2);
    setPlaying(true);
  };
  const t = tAt(frame) - race.gunT;
  const t0 = n ? race.track[0].t : 0, tEnd = n ? race.track[n - 1].t : 1;
  const pos = (tt: number) => `${(100 * (tt - t0)) / Math.max(1, tEnd - t0)}%`;
  const clockText = (tt: number) => (tt < 0 ? `−${fmt(-tt)}` : fmt(tt));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Cap>Replay</Cap>
        {!m && <span className="inline-flex items-center gap-1.5 text-[12.5px]"><span className="h-[3px] w-3.5 rounded-sm" style={{ background: p?.color }} />You</span>}
        {!m && rival && <span className="inline-flex items-center gap-1.5 text-[12.5px]"><span className="h-[3px] w-3.5 rounded-sm" style={{ background: rival.color }} />{rival.sail}{rival === winner ? ', winner' : ', ahead of you'}</span>}
        {m && <Btn small quiet onClick={() => { setActive(null); setStopAt(null); }}>Whole race</Btn>}
        <span className="ml-auto" />
        {!m && <Seg size="sm" label="Compare with" value={compare} onChange={setCompare} options={[{ value: 'winner', label: 'Winner' }, ...(ahead && ahead !== winner ? [{ value: 'ahead' as const, label: 'Boat ahead' }] : []), { value: 'none', label: 'Just you' }]} />}
      </div>
      <div ref={wrap} className="relative overflow-hidden rounded-2xl">
        <canvas ref={cv} className="block" role="img" aria-label={m ? `Replay of ${m.title}` : 'Map of the race with your track and the winner\'s'} />
        <span className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/40 px-2 py-1 font-display text-[13px] tabular-nums">{clockText(t)}</span>
        {m && (
          <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-[rgba(7,13,27,0.88)] p-3.5 backdrop-blur-[10px] sm:right-auto sm:max-w-[460px]">
            <div className="flex items-center gap-2">
              <AlfieOrb size={24} />
              <p className="m-0 min-w-0 flex-1 truncate text-[14px] font-semibold">{m.title}</p>
              <span className="text-[12px] tabular-nums" style={{ color: C.mute }}>{clockText(m.t - race.gunT)}</span>
            </div>
            <p className="m-0 text-[13.5px] leading-normal">{m.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              {onTakeOver && m.from !== undefined && <Btn small primary onClick={() => onTakeOver(m.from!)}>Sail it again from here</Btn>}
              <Btn small onClick={() => watch(active!)}>Watch again</Btn>
              {m.link && onLink && <Btn small quiet onClick={() => onLink(m.link!)}>{m.link.label}</Btn>}
              {active! + 1 < moments.length && <Btn small quiet onClick={() => watch(active! + 1)}>Next moment</Btn>}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Btn icon aria-label={playing ? 'Pause the replay' : 'Play the replay'} onClick={() => { if (frame >= n - 1) setFrame(0); setStopAt(null); setPlaying(v => !v); }}>
          {playing
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>}
        </Btn>
        <div className="relative min-w-[140px] flex-1">
          <input type="range" min={0} max={Math.max(0, n - 1)} step={1} value={Math.floor(frame)} onChange={e => { setPlaying(false); setStopAt(null); setFrame(Number(e.target.value)); }} className="relative z-[1] w-full accent-[#4DA3FF]" aria-label="Replay time" />
          {/* Alfie's moments along the timeline */}
          <div className="pointer-events-none absolute inset-x-[7px] -bottom-1.5 h-1.5" aria-hidden="true">
            {moments.map((mo, k) => <span key={k} className="absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full" style={{ left: pos(mo.t), background: TONE_DOT[mo.tone], opacity: active === null || active === k ? 1 : 0.45 }} />)}
          </div>
        </div>
        <span className="text-[13px] tabular-nums" style={{ color: C.mute }}>{clockText(t)} / {fmt(tEnd - race.gunT)}</span>
        <Seg size="sm" label="Replay speed" value={speed} onChange={setSpeed} options={[{ value: 2, label: '2×' }, { value: 8, label: '8×' }, { value: 20, label: '20×' }]} />
      </div>
      {moments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2"><AlfieOrb size={20} /><Cap>Alfie's moments</Cap><span className="text-[12px]" style={{ color: C.faint }}>Watch each one, then sail it again from there</span></div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' }}>
            {moments.map((mo, k) => (
              <button key={k} type="button" onClick={() => watch(k)} aria-pressed={active === k}
                className={cx('flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left', active === k ? 'border-[rgba(77,163,255,0.5)] bg-[rgba(42,147,255,0.12)]' : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]')}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_DOT[mo.tone] }} />
                <span className="w-10 shrink-0 text-[12px] tabular-nums" style={{ color: C.mute }}>{clockText(mo.t - race.gunT)}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#F1F4FA]">{mo.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SimDebrief({ race, sum, moments, onHome, onAgain, onLink, onTakeOver, challenge = null, onWriteUp }: {
  race: Race; sum: RaceSummary; moments: Moment[]; onHome: () => void; onAgain: () => void; onLink?: (l: TrainLink) => void;
  /** Sail the race again from this race time, taking over your boat there. */
  onTakeOver?: (t: number) => void;
  /** This was a challenge (or a race of an event): its title, how the results took it, and a way back to it. */
  challenge?: { title: string; note: string | null; onOpen: () => void; event?: boolean; againLabel?: string } | null;
  /** Ask Alfie to write the race up (signed in only). */
  onWriteUp?: () => Promise<{ text: string } | { error: string }>;
}) {
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
          <Btn primary onClick={onAgain}>{sum.mode === 'start' ? 'Try another start' : challenge ? challenge.againLabel ?? 'Sail it again' : 'Race again'}</Btn>
        </header>

        {challenge && (
          <section className="flex flex-wrap items-center gap-3 rounded-[20px] border border-[rgba(77,163,255,0.3)] bg-[rgba(42,147,255,0.08)] px-5 py-4">
            <Cap>{challenge.event ? 'Event' : 'Challenge'}</Cap>
            <p className="m-0 min-w-0 flex-[1_1_260px] text-[14.5px]"><b>{challenge.title}</b>{challenge.note ? ` · ${challenge.note}` : ''}</p>
            <Btn small onClick={challenge.onOpen}>{challenge.event ? 'Standings' : 'Leaderboard'}</Btn>
          </section>
        )}

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
            <ReplayMap race={race} moments={moments} onTakeOver={onTakeOver} onLink={onLink} />
          </div>
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
            <div className="flex flex-col gap-4 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="flex items-center gap-2.5">
                <AlfieOrb size={34} />
                <p className="m-0 text-[16px] font-semibold">{sum.takeaways.length > 1 ? `Alfie's ${sum.takeaways.length === 2 ? 'two' : 'three'} things to work on` : "Alfie's take"}</p>
              </div>
              {sum.takeaways.length === 0 && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>A clean race. Try a stronger fleet next time.</p>}
              {sum.takeaways.map((t, i) => (
                <div key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5">
                  <span className={cx('font-display font-bold', t.tone === 'warn' ? 'text-[#FFCB96]' : t.tone === 'good' ? 'text-[#A7F3D0]' : 'text-[#9CCBFF]')}>{i + 1}</span>
                  <div>
                    <p className="m-0 text-[14px] leading-normal">{t.text}</p>
                    {t.link && onLink && <button type="button" onClick={() => onLink(t.link!)} className="mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-[#7DBBFF] hover:text-[#A9D2FF]">{t.link.label}</button>}
                  </div>
                </div>
              ))}
              {onWriteUp && <WriteUp onWrite={onWriteUp} />}
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

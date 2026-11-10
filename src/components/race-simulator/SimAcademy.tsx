// The Rules Academy: six modules of situations. Each one shows the situation drawn by the engine,
// asks who has to do what, then Alfie gives the ruling in plain English, with the radio sailing
// difference from Appendix E. Most can then be played out on the water against the same referee.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MODULES, RulesModule, Situation } from '@/sim/training';
import { sceneDiagram, drawDiagram } from './diagram';
import type { TrainingProgress } from './progress';
import { licence } from './progress';
import { RuleSheet } from './hud';
import { AlfieOrb, Btn, C, Cap, Chip, cx } from './ui';

function Diagram({ s }: { s: Situation }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const data = useMemo(() => sceneDiagram(s.scene(1), s.diagram.plan, s.diagram.seconds, s.labels, 1), [s]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const draw = () => {
      const w = cv.clientWidth || 560, h = cv.clientHeight || 340;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d'); if (ctx) drawDiagram(ctx, data, w, h, dpr);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [data]);
  return <canvas ref={ref} className="block h-[300px] w-full rounded-2xl sm:h-[340px]" role="img" aria-label={`Diagram: ${s.text}`} />;
}

function ModuleRow({ m, active, done, total, onOpen }: { m: RulesModule; active: boolean; done: number; total: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-current={active}
      className={cx('flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors', active ? 'border-[rgba(77,163,255,0.45)] bg-[rgba(42,147,255,0.10)]' : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.05]')}>
      <span className="font-display text-[20px] font-bold leading-[1.1] text-[#9CCBFF]">{m.n}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-[#F1F4FA]">{m.title}</span>
        <span className="mt-0.5 block text-[12.5px]" style={{ color: C.mute }}>{m.rules}</span>
      </span>
      <span className={cx('shrink-0 text-[12px] font-semibold tabular-nums', done === total ? 'text-[#7EE6BE]' : '')} style={done === total ? undefined : { color: C.mute }}>{done}/{total}</span>
    </button>
  );
}

export default function SimAcademy({ progress, initial, onAnswer, onPlay, onBack }: {
  progress: TrainingProgress;
  /** module/situation to open with */
  initial?: string | null;
  onAnswer: (id: string, correct: boolean) => void;
  onPlay: (id: string, watch: boolean) => void;
  onBack: () => void;
}) {
  const lic = licence(progress);
  const start = initial ? initial.split('/') : null;
  const [mid, setMid] = useState(start?.[0] ?? MODULES[0].id);
  const m = MODULES.find(x => x.id === mid) ?? MODULES[0];
  const [sid, setSid] = useState(start?.[1] ?? m.situations[0].id);
  const s = m.situations.find(x => x.id === sid) ?? m.situations[0];
  const id = `${m.id}/${s.id}`;
  const rec = progress.lessons[id];
  const [picked, setPicked] = useState<number | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [id]);
  const answered = picked !== null;
  const right = answered && !!s.answers[picked!].correct;
  const idx = m.situations.indexOf(s);
  const next = m.situations[idx + 1] ?? null;
  const nextModule = MODULES[MODULES.indexOf(m) + 1] ?? null;

  const choose = (k: number) => {
    if (answered) return;
    setPicked(k);
    onAnswer(id, !!s.answers[k].correct);
  };

  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center gap-4">
          <Btn onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Simulator
          </Btn>
          <div className="min-w-0 flex-[1_1_320px]">
            <h1 className="m-0 font-display text-[30px] font-bold tracking-[-0.02em]">Rules Academy</h1>
            <p className="m-0 mt-1 text-[14px]" style={{ color: C.mute }}>The Racing Rules of Sailing as radio sailors use them, with Appendix E. Answer each situation, then sail it.</p>
          </div>
          <Chip tone={lic.level === 6 ? 'good' : 'blue'}>Rules licence: level {lic.level} of 6</Chip>
        </header>

        <div className="flex flex-wrap items-start gap-5">
          <nav className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5" aria-label="Modules">
            {MODULES.map(x => {
              const mp = lic.modules.find(q => q.id === x.id)!;
              return <ModuleRow key={x.id} m={x} active={x.id === m.id} done={mp.answered} total={mp.total} onOpen={() => { setMid(x.id); setSid(x.situations[0].id); }} />;
            })}
            <p className="m-0 px-1 pt-1 text-[12px] leading-snug" style={{ color: C.faint }}>A learning aid built on the Racing Rules of Sailing 2025–2028 and Appendix E. It doesn't replace the rulebook.</p>
          </nav>

          <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-5 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6" aria-labelledby="sit-title">
            <div className="flex flex-wrap items-center gap-2">
              <Cap>Module {m.n} · {m.title}</Cap>
              <div className="ml-auto flex flex-wrap gap-1.5" role="tablist" aria-label="Situations">
                {m.situations.map((x, k) => {
                  const r = progress.lessons[`${m.id}/${x.id}`];
                  return (
                    <button key={x.id} type="button" role="tab" aria-selected={x.id === s.id} onClick={() => setSid(x.id)} title={x.title}
                      className={cx('h-8 min-w-8 cursor-pointer rounded-lg border px-2 text-[12.5px] font-semibold', x.id === s.id ? 'border-[rgba(77,163,255,0.5)] bg-[rgba(42,147,255,0.14)] text-white' : 'border-white/10 bg-white/[0.04] text-[rgba(235,240,255,0.8)]', r?.correct && x.id !== s.id && 'text-[#7EE6BE]')}>
                      {m.n}.{k + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <h2 id="sit-title" className="m-0 font-display text-[24px] font-bold">{s.title}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">{s.rules.map(r => <button key={r} type="button" onClick={() => setSheet(r)} className="cursor-pointer border-0 p-0"><Chip tone="blue">Rule {r}</Chip></button>)}</div>
              <p className="m-0 mt-3 text-[15px] leading-normal">{s.text}</p>
            </div>
            <Diagram s={s} />
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[15px] font-semibold">{s.question}</p>
              {s.answers.map((a, k) => (
                <button key={k} type="button" onClick={() => choose(k)} disabled={answered}
                  className={cx('flex min-h-[52px] w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left text-[14.5px] font-medium text-[#F1F4FA]',
                    !answered && 'cursor-pointer border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
                    answered && a.correct && 'border-[rgba(52,211,153,0.5)] bg-[rgba(52,211,153,0.10)]',
                    answered && picked === k && !a.correct && 'border-[rgba(255,99,99,0.5)] bg-[rgba(255,99,99,0.10)]',
                    answered && picked !== k && !a.correct && 'border-white/[0.06] bg-white/[0.02] opacity-70')}>
                  <span className="min-w-0 flex-1">{a.text}</span>
                  {answered && a.correct && <span className="text-[12.5px] font-semibold text-[#7EE6BE]">Right answer</span>}
                </button>
              ))}
            </div>
            {(answered || rec?.answered) && (
              <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                <div className="flex items-center gap-2.5">
                  <AlfieOrb size={30} />
                  <p className="m-0 text-[15px] font-semibold">{answered ? (right ? 'Alfie: that’s right' : 'Alfie: not quite') : 'Alfie’s ruling'}</p>
                </div>
                <p className="m-0 text-[14.5px] leading-normal">{s.ruling}</p>
                {s.rc && <p className="m-0 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13.5px] leading-normal" style={{ color: C.mute }}><b className="text-[#F1F4FA]">Radio sailing:</b> {s.rc}</p>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              {s.play && <Btn primary onClick={() => onPlay(id, false)}>Sail it</Btn>}
              {s.play?.solution && <Btn onClick={() => onPlay(id, true)}>Watch it done</Btn>}
              {rec?.played && <Chip tone="good">Sailed it</Chip>}
              <span className="ml-auto" />
              {next ? <Btn quiet onClick={() => setSid(next.id)}>Next: {next.title}</Btn>
                : nextModule ? <Btn quiet onClick={() => { setMid(nextModule.id); setSid(nextModule.situations[0].id); }}>Next module: {nextModule.title}</Btn> : null}
            </div>
          </section>
        </div>
      </div>
      {sheet && <RuleSheet rule={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

// You be the judge: watch a short incident from above, make the call (who broke a rule, and which
// one), then read what the simulator's referee found. Five cases a day, the same for everyone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { diagramAt, drawDiagram, sceneDiagram, type DiagramData } from './diagram';
import { RuleSheet } from './hud';
import { BOAT_COLOR, judgeCases, mark, ruleChoices, runCase, todaysCases, type Clip, type JudgeCase } from './judge';
import type { TrainingProgress } from './progress';
import type { TrainLink } from './stats';
import { AlfieOrb, Btn, C, Cap, Chip, cx, Page } from './ui';

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (at: number) => dayKey(new Date(at)) === dayKey();

/** The clip, played from above at one and a half times speed, then held on its last moment. `run` restarts it. */
function ClipView({ clip, run }: { clip: Clip; run: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const data: DiagramData | null = useMemo(() => {
    try {
      const d = sceneDiagram(clip.scene, undefined, clip.seconds, {}, clip.seed);
      // Close in on the boats: only the marks they sail near. And no protest hails: that's the call you're here to make.
      const near = (m: { x: number; y: number }) => d.boats.some(b => b.pts.some(p => Math.hypot(p.x - m.x, p.y - m.y) < 5.5 * d.L));
      return { ...d, marks: d.marks.filter(near), boats: d.boats.map(b => (b.hail && /protest/i.test(b.hail.text) ? { ...b, hail: null } : b)) };
    } catch { return null; }
  }, [clip]);
  useEffect(() => {
    const cv = ref.current; if (!cv || !data) return;
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now(), len = (clip.seconds / 1.5) * 1000;
    let raf = 0;
    const draw = (now: number) => {
      const w = cv.clientWidth || 560, h = cv.clientHeight || 340;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const t = still ? 1 : Math.min(1, (now - t0) / len);
      const ctx = cv.getContext('2d');
      // (For anyone who has asked for less motion: the whole clip as one picture, tracks and all.)
      if (ctx) { if (still) drawDiagram(ctx, data, w, h, dpr); else drawDiagram(ctx, diagramAt(data, t), w, h, dpr, { fit: data, live: true }); }
      if (t < 1) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    ro.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [data, clip, run]);
  if (!data) return <p className="m-0 rounded-2xl bg-white/[0.04] p-6 text-[14px]" style={{ color: C.mute }}>This clip couldn't be drawn.</p>;
  return <canvas ref={ref} className="sim-diagram" role="img" aria-label={`From above: ${clip.boats.join(' and ')} in a short incident. Wind from the top of the picture.`} />;
}

/** A choice: a boat (with her colour beside her name), a rule, or "nobody". Lit when chosen; marked once the call is in. */
function Choice({ on, state, onClick, disabled, children }: { on: boolean; state?: 'right' | 'wrong' | null; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={cx('flex min-h-[46px] cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left text-[14.5px] font-semibold text-[#F1F4FA] transition-colors disabled:cursor-default',
        state === 'right' ? 'border-[rgba(126,226,168,0.6)] bg-[rgba(52,211,153,0.14)]' : state === 'wrong' ? 'border-[rgba(255,159,67,0.6)] bg-[rgba(255,159,67,0.12)]'
          : on ? 'border-[#4DA3FF] bg-[rgba(46,123,255,0.16)]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-55 disabled:hover:bg-white/[0.04]')}>
      {children}
      {state && <span aria-hidden="true" className={cx('ml-auto text-[13px]', state === 'right' ? 'text-[#7EE2A8]' : 'text-[#FFCB96]')}>{state === 'right' ? '✓' : '✕'}</span>}
    </button>
  );
}

const NOBODY = '—';

export default function SimJudge({ training, onBack, onLink, onCall }: {
  training: TrainingProgress; onBack: () => void; onLink: (l: TrainLink) => void;
  /** A call has been made on a case: 0 to 2 points. */
  onCall: (caseId: string, points: number) => void;
}) {
  // Today's five first, then the rest of the book in a fixed order.
  const list = useMemo<JudgeCase[]>(() => { const today = todaysCases(dayKey()); return [...today, ...judgeCases().filter(c => !today.some(t => t.id === c.id))]; }, []);
  const [i, setI] = useState(() => { const k = list.slice(0, 5).findIndex(c => !(training.judge?.[c.id] && sameDay(training.judge[c.id].at))); return k < 0 ? 5 : k; });
  const c = list[Math.min(i, list.length - 1)];
  const clip = useMemo(() => runCase(c), [c]);
  const [who, setWho] = useState<string | null>(null);
  const [rule, setRule] = useState<string | null>(null);
  const [called, setCalled] = useState(false);
  const [run, setRun] = useState(0);
  const [sheet, setSheet] = useState<string | null>(null);
  useEffect(() => { setWho(null); setRule(null); setCalled(false); setRun(0); }, [c]);
  const rules = useMemo(() => (clip ? ruleChoices(clip.verdict, c.id.length * 31 + c.id.charCodeAt(3)) : []), [clip, c]);
  const todayDone = list.slice(0, 5).filter(x => training.judge?.[x.id] && sameDay(training.judge[x.id].at));
  const todayPoints = todayDone.reduce((s, x) => s + (training.judge?.[x.id]?.points ?? 0), 0);

  const call = () => {
    if (!clip || who === null) return;
    const m = mark(clip.verdict, who === NOBODY ? null : who, rule);
    setCalled(true);
    onCall(c.id, m.points);
  };
  const v = clip?.verdict ?? null;
  const m = v && called ? mark(v, who === NOBODY ? null : who, rule) : null;
  const ready = who === NOBODY || (who !== null && rule !== null);

  return (
    <Page onBack={onBack} title="You be the judge" text="Watch the incident, then make the call: who broke a rule, and which one? Some clips have no foul in them. The verdict is the simulator's referee's."
      side={<Chip tone={todayDone.length >= 5 ? 'good' : 'blue'}>Today: {todayDone.length} of 5 · {todayPoints} point{todayPoints === 1 ? '' : 's'}</Chip>} after={sheet && <RuleSheet rule={sheet} onClose={() => setSheet(null)} />}>

        {!clip || !v ? (
          <p className="m-0 sim-card p-6 text-[14px]">This case couldn't be set up. <Btn small onClick={() => setI(i + 1)}>Next case</Btn></p>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Cap>{i < 5 ? `Case ${i + 1} of today's 5` : `Case ${i + 1} of ${list.length}`}</Cap>
                <span className="ml-auto"><Btn small onClick={() => setRun(run + 1)}>Play it again</Btn></span>
              </div>
              <ClipView clip={clip} run={run} />
              <p className="m-0 text-[12.5px]" style={{ color: C.faint }}>Seen from above, with the wind coming down the picture. A dashed ring is a mark's four-length zone; a dashed orange line is the start line.</p>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2.5">
                <Cap>1. Who broke a rule?</Cap>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {clip.boats.map(b => (
                    <Choice key={b} on={who === b} disabled={called} onClick={() => { setWho(b); }} state={called ? (v.offender === b ? 'right' : who === b ? 'wrong' : null) : null}>
                      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: BOAT_COLOR[b] ?? '#F472B6' }} />{b}
                    </Choice>
                  ))}
                  <Choice on={who === NOBODY} disabled={called} onClick={() => { setWho(NOBODY); setRule(null); }} state={called ? (v.offender === null ? 'right' : who === NOBODY ? 'wrong' : null) : null}>Nobody: fair sailing</Choice>
                </div>
              </div>

              {who !== null && who !== NOBODY && (
                <div className="flex flex-col gap-2.5">
                  <Cap>2. Which rule?</Cap>
                  <div className="grid grid-cols-1 gap-2">
                    {rules.map(r => (
                      <Choice key={r.rule} on={rule === r.rule} disabled={called} onClick={() => setRule(r.rule)}
                        state={called && v.rule ? (r.rule.split('(')[0] === v.rule.split('(')[0] ? 'right' : rule === r.rule ? 'wrong' : null) : null}>
                        <span className="w-[54px] shrink-0 tabular-nums text-[#A9D2FF]">Rule {r.rule.split('(')[0]}</span><span className="font-medium">{r.title}</span>
                      </Choice>
                    ))}
                  </div>
                </div>
              )}

              {!called ? (
                <div><Btn primary disabled={!ready} onClick={call}>Make the call</Btn></div>
              ) : (
                <div className={cx('flex flex-col gap-3 rounded-[20px] border p-5', m && m.points === 2 ? 'border-[rgba(126,226,168,0.4)] bg-[rgba(52,211,153,0.07)]' : 'border-white/[0.09] bg-white/[0.035]')} role="status">
                  <div className="flex items-center gap-3">
                    <AlfieOrb size={30} />
                    <p className="m-0 font-display text-[19px] font-bold leading-tight">
                      {m!.points === 2 ? 'Right call.' : m!.who ? 'Right boat, wrong rule.' : v.offender ? `It was ${v.offender}.` : 'No foul in that one.'}
                    </p>
                    <Chip tone={m!.points === 2 ? 'good' : 'plain'} className="ml-auto">{m!.points} of 2</Chip>
                  </div>
                  <div>
                    <Cap>{v.rule ? `The referee: Rule ${v.rule.split('(')[0]}, ${(v.ruleTitle ?? '').toLowerCase()}` : 'The referee'}</Cap>
                    <p className="m-0 mt-1.5 text-[14.5px] leading-[1.5]">{v.text}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Btn primary onClick={() => setI(i + 1 >= list.length ? 0 : i + 1)}>{i === 4 ? 'More cases' : 'Next case'}</Btn>
                    {v.rule && <Btn onClick={() => setSheet(v.rule)}>Read the rule</Btn>}
                    <Btn quiet onClick={() => onLink({ kind: 'lesson', id: c.lesson, label: 'Sail it yourself' })}>Sail it yourself: {c.title}</Btn>
                  </div>
                  {i === 4 && <p className="m-0 text-[13px]" style={{ color: C.mute }}>That's today's five: {todayPoints} of 10 points. Five new ones tomorrow; the rest of the book is there if you want more now.</p>}
                </div>
              )}
            </div>
          </div>
        )}
    </Page>
  );
}

// The race officer's career: the hub (your standard, the duties, your best marks) and the duties
// built so far. Set the course: read the wind from the committee boat's readings, lay the line and
// the windward mark, and the fleet sails your course. Call the line: watch a start from the committee
// boat, and at the gun call the boats over, or a general recall.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Minus, Plus, RotateCcw } from 'lucide-react';
import { Race } from '@/sim/engine';
import { bearing, n360 } from '@/sim/math';
import { DT } from '@/sim/physics';
import { drawBank, newBankCam } from './bank';
import { Brand, DoorBack } from './SimDoors';
import { C, cx } from './ui';
import {
  DUTIES_READY, DUTY_NAME, PASS, RO_LEVELS, RO_NAME, courseGuide, courseRaceSettings, courseRun, courseStart, courseTask, freshSeed, lineRaceSettings, lineTask, markCourse, markLine, roLevel, roNext,
  type CourseMark, type CourseOutcome, type CourseSet, type CourseTask, type DutyId, type LineMark, type LineTask, type RoLevel, type RoRecord,
} from './ro';

const LEVEL_WORD: Record<RoLevel, string> = { club: 'Club', state: 'Regional', national: 'National', world: 'World' };
const DUTY_SAY: Record<DutyId, string> = {
  course: 'Read the wind from the committee boat, lay the start line and the windward mark, and the fleet sails your course.',
  line: 'Watch the start from the committee boat. At the gun, call the boats over, or a general recall.',
  score: 'Score a race day from the finishing sheets: letter scores, ties and the heats, in AlfiePRO.',
  protest: 'Hear a protest: the facts, the rule, and the decision.',
};
const pill = (on: boolean) => (on ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined);

function Score({ m, pass }: { m: number; pass: number }) {
  const ok = m >= pass;
  return (
    <div className="flex items-end gap-3">
      <b className="text-[54px] font-bold leading-none tabular-nums" style={{ color: ok ? '#7CE3A1' : '#FFB4A8' }}>{m}</b>
      <span className="pb-1.5 text-[14px]" style={{ color: C.mute }}>out of 100 · {pass} to pass · <b className="font-semibold" style={{ color: ok ? '#7CE3A1' : '#FFB4A8' }}>{ok ? 'Passed' : 'Not yet'}</b></span>
    </div>
  );
}

// ───────────────────────── Set the course ─────────────────────────

/** The course from above, turned so the last reading's wind is up: the readings round the ring, the line and mark 1. */
function CourseDiagram({ task, c }: { task: CourseTask; c: CourseSet }) {
  const up = task.readings[task.readings.length - 1].from;
  const S = 360, O = { x: 180, y: 268 };
  const scale = 200 / Math.max(c.beat, c.line * 0.75, 20);
  const pt = (brg: number, d: number) => ({ x: O.x + Math.sin(((brg - up) * Math.PI) / 180) * d * scale, y: O.y - Math.cos(((brg - up) * Math.PI) / 180) * d * scale });
  const pin = pt(c.square - 90, c.line / 2), stbd = pt(c.square + 90, c.line / 2), mark = pt(c.mark, c.beat);
  const ring = (brg: number, r: number) => ({ x: 180 + Math.sin(((brg - up) * Math.PI) / 180) * r, y: 180 - Math.cos(((brg - up) * Math.PI) / 180) * r });
  const n = ring(0, 168);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="block h-auto w-full max-w-[420px]" role="img" aria-label={`Your course: mark 1 at ${Math.round(n360(c.mark))}°, ${c.beat} lengths up; the line square to ${Math.round(n360(c.square))}°, ${c.line} lengths long`}>
      <rect width={S} height={S} rx={18} fill="#0E2A4A" />
      <circle cx={180} cy={180} r={160} fill="none" stroke="rgba(255,255,255,0.08)" />
      <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="rgba(214,224,240,0.7)">N</text>
      {task.readings.map((r, i) => {
        const a = ring(r.from, 160), b = ring(r.from, 146);
        const last = i === task.readings.length - 1;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={last ? '#FFD27A' : 'rgba(255,210,122,0.45)'} strokeWidth={last ? 3 : 2} strokeLinecap="round" />;
      })}
      {/* Laylines from the mark, 45° either side of the line's square (where you think the wind is) */}
      {[-45, 45].map(d => { const e = { x: mark.x + Math.sin(((c.square + 180 + d - up) * Math.PI) / 180) * 90, y: mark.y - Math.cos(((c.square + 180 + d - up) * Math.PI) / 180) * 90 }; return <line key={d} x1={mark.x} y1={mark.y} x2={e.x} y2={e.y} stroke="rgba(255,255,255,0.16)" strokeDasharray="4 5" />; })}
      <line x1={pin.x} y1={pin.y} x2={stbd.x} y2={stbd.y} stroke="#FFD27A" strokeWidth={2} strokeDasharray="5 4" />
      <line x1={O.x} y1={O.y} x2={mark.x} y2={mark.y} stroke="rgba(255,255,255,0.22)" />
      <circle cx={pin.x} cy={pin.y} r={5} fill="#F2C230" /><text x={pin.x - 8} y={pin.y + 16} textAnchor="end" fontSize="11" fill="#F1F4FA">Pin</text>
      <rect x={stbd.x - 7} y={stbd.y - 5} width={14} height={10} rx={2} fill="#F1F4FA" /><text x={stbd.x + 8} y={stbd.y + 18} fontSize="11" fill="#F1F4FA">Committee boat</text>
      <circle cx={mark.x} cy={mark.y} r={6} fill="#FF9F43" /><text x={mark.x + 9} y={mark.y - 8} fontSize="11.5" fontWeight="700" fill="#F1F4FA">Mark 1</text>
    </svg>
  );
}

function BearingRow({ label, value, onChange, help }: { label: string; value: number; onChange: (v: number) => void; help: string }) {
  const nudge = (d: number) => onChange(Math.round(n360(value + d)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold">{label}</span>
        <b className="text-[20px] font-bold tabular-nums">{String(Math.round(n360(value))).padStart(3, '0')}°</b>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {[-5, -1, 1, 5].map(d => <button key={d} type="button" className="sim-chip-btn" onClick={() => nudge(d)} aria-label={`${d > 0 ? 'Add' : 'Take'} ${Math.abs(d)}°`}>{d > 0 ? <Plus size={13} /> : <Minus size={13} />}{Math.abs(d)}°</button>)}
      </div>
      <span className="text-[12.5px]" style={{ color: C.faint }}>{help}</span>
    </div>
  );
}

function LengthRow({ label, value, onChange, min, max, help }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; help: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[14px] font-semibold" htmlFor={`len-${label}`}>{label}</label>
        <b className="text-[18px] font-bold tabular-nums">{value} <span className="text-[13px] font-normal" style={{ color: C.mute }}>lengths</span></b>
      </div>
      <input id={`len-${label}`} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-[#2E7BFF]" />
      <span className="text-[12.5px]" style={{ color: C.faint }}>{help}</span>
    </div>
  );
}

const CLASS_NAME: Record<string, string> = { IOM: 'IOM', DF95: 'DF95', DF65: 'DF65', '10R': '10 Rater', M: 'Marblehead' };

function CourseDuty({ task, onMarked, onAgain }: { task: CourseTask; onMarked: (score: number) => void; onAgain: () => void }) {
  const [c, setC] = useState<CourseSet>(() => courseStart(task));
  const [run, setRun] = useState<{ p: number } | null>(null);
  const [res, setRes] = useState<{ mark: CourseMark; out: CourseOutcome } | null>(null);
  const g = courseGuide(task);
  const set = (p: Partial<CourseSet>) => setC(v => ({ ...v, ...p }));
  const go = () => {
    const mark = markCourse(task, c);
    const r = courseRun(courseRaceSettings(task, c));
    setRun({ p: 0 });
    const slice = () => {
      const done = r.step(160);
      if (!done) { setRun({ p: r.progress() }); window.setTimeout(slice, 0); return; }
      setRun(null); setRes({ mark, out: r.result()! }); onMarked(mark.score);
    };
    window.setTimeout(slice, 30);
  };
  const shiftWord = task.shift > 0 ? 'veer (go right)' : 'back (go left)';
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="brief-title">
        <div>
          <h2 id="brief-title" className="sim-h3">The day</h2>
          <p className="m-0 mt-1 text-[14px] leading-relaxed" style={{ color: C.mute }}>
            {task.fleet} {CLASS_NAME[task.classId]}s, a windward–leeward course. Wind about {task.knots} knots{task.character === 'steady' ? ', steady' : ', swinging from side to side'}.
            {task.shift ? <> The forecast says it will <b className="text-[#F1F4FA]">{shiftWord} about {Math.abs(task.shift)}°</b> over the next few minutes.</> : null}
          </p>
        </div>
        <div>
          <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: C.faint }}>Wind readings from the committee boat</p>
          <ol className="m-0 grid list-none grid-cols-5 gap-1.5 p-0 text-center sm:grid-cols-10">
            {task.readings.map(r => (
              <li key={r.min} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-1 py-1.5">
                <b className="block text-[14px] tabular-nums">{String(r.from).padStart(3, '0')}°</b>
                <span className="text-[11px]" style={{ color: C.faint }}>{r.min === 1 ? 'now' : `−${r.min - 1} min`}</span>
              </li>
            ))}
          </ol>
        </div>
        <CourseDiagram task={task} c={c} />
      </section>

      <section className="sim-card flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="set-title">
        <h2 id="set-title" className="sim-h3">Your course</h2>
        <BearingRow label="Mark 1, from the line's centre" value={c.mark} onChange={v => set({ mark: v })} help="Straight up the wind the fleet will beat in." />
        <BearingRow label="Start line square to" value={c.square} onChange={v => set({ square: v })} help="Square to the wind at the start, so neither end is favoured." />
        <LengthRow label="The line" value={c.line} min={4} max={60} onChange={v => set({ line: v })} help={`Room for ${task.fleet} boats to start side by side.`} />
        <LengthRow label="The beat" value={c.beat} min={8} max={70} onChange={v => set({ beat: v })} help="Long enough for the fleet to spread out before the mark." />
        {!res && !run && <button type="button" className="sim-btn-lg sim-btn-go self-start" onClick={go}>Set the course and start<ArrowRight size={18} aria-hidden="true" /></button>}
        {run && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <span className="text-[14px] font-semibold">The fleet is sailing your course…</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#2E7BFF]" style={{ width: `${Math.round(run.p * 100)}%` }} /></div>
          </div>
        )}
        {res && (
          <div className="flex flex-col gap-4 border-t border-white/[0.08] pt-4" aria-live="polite">
            <Score m={res.mark.score} pass={PASS[task.level]} />
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {res.mark.parts.map(p => (
                <li key={p.what} className="grid grid-cols-[1fr_auto] gap-x-3 text-[14px]">
                  <b className="font-semibold">{p.what}</b><span className="tabular-nums" style={{ color: C.mute }}>{Math.round(p.got)} / {p.of}</span>
                  <span className="col-span-2 text-[13px]" style={{ color: C.mute }}>{p.note}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: C.mute }}>
              <b className="text-[#F1F4FA]">How it sailed.</b> They crossed the line {res.out.thirds[0]} at the pin end, {res.out.thirds[1]} in the middle and {res.out.thirds[2]} at the committee boat
              {res.out.ocs ? `; ${res.out.ocs} over early` : ''}{res.out.startIncidents ? `; ${res.out.startIncidents} incident${res.out.startIncidents === 1 ? '' : 's'} on the line` : ''}.
              {' '}The first three round mark 1 {res.out.topLeft} from the left and {res.out.topRight} from the right{res.out.beatTime ? `, the leader ${Math.round(res.out.beatTime)} s after the gun` : ''}.
              {' '}The wind averaged {String(Math.round(res.mark.truth.start)).padStart(3, '0')}° at the start and {String(Math.round(res.mark.truth.beat)).padStart(3, '0')}° up the beat; for {task.fleet} boats about {g.line} lengths of line and {g.beat} of beat.
            </p>
            <button type="button" className="sim-chip-btn self-start" onClick={onAgain}><RotateCcw size={14} />Another day</button>
          </div>
        )}
      </section>
    </div>
  );
}

// ───────────────────────── Call the line ─────────────────────────

type LinePhase = 'watch' | 'call' | 'marked';

function LineDuty({ task, onMarked, onAgain }: { task: LineTask; onMarked: (score: number) => void; onAgain: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<LinePhase>('watch');
  const [take, setTake] = useState(0);
  const [over, setOver] = useState<string[]>([]);
  const [sails, setSails] = useState<string[]>([]);
  const [called, setCalled] = useState<string[]>([]);
  const [general, setGeneral] = useState(false);
  const [mark, setMark] = useState<LineMark | null>(null);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const cv = canvas.current, ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const race = new Race(lineRaceSettings(task));
    // Watch from 15 seconds before the gun the first time, 6 when you look again.
    const from = race.gunT - (take ? 6 : 15);
    while (race.t < from) race.step();
    setSails([...race.boats.map(b => b.sail)].sort((a, b) => Number(a) - Number(b)));
    const size = { w: 1, h: 1, dpr: 1 };
    const cam = newBankCam();
    const { pin, stbd } = race.course.start;
    const len = Math.hypot(stbd.x - pin.x, stbd.y - pin.y);
    const L = race.course.L;
    // On the line, beyond the committee boat and raised, as a race officer sights it: the line runs
    // straight away to the pin, and a boat over shows on the course side of it. The view is framed so
    // the whole line, from the committee boat's end to the pin, is in the picture with room around it,
    // so every bow on the line can be seen.
    const back = 7 * L;
    cam.x = stbd.x + ((stbd.x - pin.x) / len) * back; cam.y = stbd.y + ((stbd.y - pin.y) / len) * back;
    cam.z = 2.4 * L; cam.yaw = bearing(stbd, pin); cam.ready = true;
    const deg = (r: number) => (r * 180) / Math.PI;
    const near = deg(Math.atan2(cam.z, back - 1.2 * L)), far = deg(Math.atan2(cam.z, back + len + 2 * L));
    const aim = () => {
      const half = (near - far) / 2 + 3;
      cam.pitch = (near + far) / 2;
      cam.fov = Math.max(36, 2 * deg(Math.atan(Math.tan((half * Math.PI) / 180) * (size.w / size.h))));
    };
    let raf = 0, last = performance.now(), acc = 0, dead = false, frozen = false;
    const fit = () => { const b = cv.getBoundingClientRect(); size.dpr = Math.min(2, window.devicePixelRatio || 1); size.w = Math.max(1, b.width); size.h = Math.max(1, b.height); cv.width = Math.round(size.w * size.dpr); cv.height = Math.round(size.h * size.dpr); aim(); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(cv);
    const frame = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!frozen) {
        acc += dt;
        while (acc >= DT) { race.step(); acc -= DT; if (race.t >= race.gunT + 0.3) { frozen = true; break; } }
        if (frozen) {
          setOver(race.incidents.filter(i => i.kind === 'ocs').map(i => race.boats.find(b => b.id === i.offender)!.sail));
          setPhase(p => (p === 'watch' ? 'call' : p));
        }
        const left = race.gunT - race.t;
        setClock(left > 0 ? `${Math.ceil(left)}` : 'GUN');
      }
      drawBank(ctx, race, { w: size.w, h: size.h, dpr: size.dpr, cam, next: null, showZones: false, preStart: true, flashes: [], back: 0, detail: 2, credit: false, blind: true });
    };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [task, take]);

  const toggle = (s: string) => setCalled(c => (c.includes(s) ? c.filter(x => x !== s) : [...c, s]));
  const submit = () => { const m = markLine(over, general ? [] : called, general, task.fleet); setMark(m); setPhase('marked'); onMarked(m.score); };
  return (
    <div className="flex flex-col gap-5">
      <section className="sim-card overflow-hidden p-0">
        <div className="relative">
          <canvas ref={canvas} className="block h-[min(60vh,560px,80vw)] w-full" aria-label="The start line, from the committee boat" />
          <div className="pointer-events-none absolute right-4 top-4 rounded-xl bg-[#0B1322]/85 px-4 py-2 text-center">
            <b className="block text-[28px] font-bold leading-none tabular-nums" style={{ color: clock === 'GUN' ? '#FF4D5E' : '#F1F4FA' }}>{clock}</b>
            <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>{clock === 'GUN' ? 'Starting signal' : 'to the start'}</span>
          </div>
        </div>
      </section>

      <p className="m-0 -mt-2 text-[13px]" style={{ color: C.faint }}>From the committee boat, sighting down the line to the pin. The course side is to the right: a bow past the dashed line at the gun is over.</p>
      {phase === 'watch' && <p className="m-0 text-[14.5px]" style={{ color: C.mute }}>Watch the line. At the gun the picture stops, and you call it.</p>}

      {phase !== 'watch' && (
        <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="call-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="call-title" className="sim-h3">Your call</h2>
              <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>Tap the sail numbers of the boats over the line at the gun. Too many to call one by one? Call a general recall.</p>
            </div>
            {phase === 'call' && <button type="button" className="sim-chip-btn" onClick={() => { setTake(t => t + 1); setPhase('call'); }}><RotateCcw size={14} />Look again</button>}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Boats over the line">
            {sails.map(s => {
              const on = !general && called.includes(s);
              const truth = mark ? (mark.over.includes(s) ? (on ? 'hit' : 'missed') : on ? 'wrong' : null) : null;
              return (
                <button key={s} type="button" disabled={phase === 'marked' || general} aria-pressed={on} onClick={() => toggle(s)}
                  className={cx('min-w-[52px] rounded-xl border px-3 py-2 text-[16px] font-bold tabular-nums', on ? 'border-[#FF4D5E] bg-[rgba(255,77,94,0.18)]' : 'border-white/15 bg-white/[0.04]',
                    truth === 'hit' && 'ring-2 ring-[#7CE3A1]', truth === 'missed' && 'ring-2 ring-[#FFB4A8]', truth === 'wrong' && 'opacity-60 line-through')}>{s}</button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="The signal">
            <button type="button" className="sim-chip-btn" disabled={phase === 'marked'} aria-pressed={!general} style={pill(!general)} onClick={() => setGeneral(false)}>{called.length ? `Individual recall: ${called.length} boat${called.length === 1 ? '' : 's'}` : 'All clear: none over'}</button>
            <button type="button" className="sim-chip-btn" disabled={phase === 'marked'} aria-pressed={general} style={pill(general)} onClick={() => setGeneral(true)}>General recall</button>
          </div>
          {phase === 'call' && <button type="button" className="sim-btn-lg sim-btn-go self-start" onClick={submit}>Make the call<ArrowRight size={18} aria-hidden="true" /></button>}
          {mark && (
            <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4" aria-live="polite">
              <Score m={mark.score} pass={PASS[task.level]} />
              <p className="m-0 text-[14px] leading-relaxed" style={{ color: C.mute }}>
                {mark.over.length ? <>Over at the gun: <b className="text-[#F1F4FA]">{mark.over.join(', ')}</b>. </> : <>Nobody was over at the gun. </>}
                {mark.general ? (mark.decisionRight ? 'A general recall was right: too many over to call them one by one.' : 'A general recall wasn\'t needed: the boats over could be called by number.')
                  : mark.decisionRight ? (mark.missed.length || mark.wrong.length ? `${mark.missed.length ? `Missed: ${mark.missed.join(', ')}. ` : ''}${mark.wrong.length ? `Called but not over: ${mark.wrong.join(', ')}.` : ''}` : 'Every call right.')
                    : 'Too many were over to call one by one: this needed a general recall.'}
              </p>
              <button type="button" className="sim-chip-btn self-start" onClick={onAgain}><RotateCcw size={14} />Another start</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ───────────────────────── The hub ─────────────────────────

export interface SimROProps {
  record: RoRecord | undefined;
  onRecord: (duty: DutyId, level: RoLevel, score: number) => void;
  onBack: () => void;
}

export default function SimRO({ record, onRecord, onBack }: SimROProps) {
  const held = roLevel(record), next = roNext(record);
  const [level, setLevel] = useState<RoLevel>(next ?? 'world');
  const [duty, setDuty] = useState<DutyId | null>(null);
  const [seed, setSeed] = useState(freshSeed);
  const open = useMemo(() => RO_LEVELS.slice(0, RO_LEVELS.indexOf(next ?? 'world') + 1), [next]);
  const course = useMemo(() => (duty === 'course' ? courseTask(level, seed) : null), [duty, level, seed]);
  const line = useMemo(() => (duty === 'line' ? lineTask(level, seed) : null), [duty, level, seed]);
  const marked = useCallback((s: number) => { if (duty) onRecord(duty, level, s); }, [duty, level, onRecord]);
  const again = () => setSeed(freshSeed());

  return (
    <div className="sim-page min-h-full px-4 pb-16 pt-5 text-[14px] text-[#F1F4FA] sm:px-6 lg:px-10 xl:px-16" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="flex flex-wrap items-center gap-3"><DoorBack onHome={duty ? () => setDuty(null) : onBack}/><Brand /></div>
      <header className="mb-6 mt-5 flex flex-col gap-2">
        <h1 className="sim-home-title m-0">{duty ? DUTY_NAME[duty] : 'Race officer'}</h1>
        <p className="sim-home-sub m-0">{duty ? `${LEVEL_WORD[level]} standard. ${DUTY_SAY[duty]}` : held ? `You're a ${RO_NAME[held]}.${next ? ` Next: ${RO_NAME[next]}.` : ' The top standard.'}` : 'Run the racing instead of sailing it. Pass each duty to become a Club race officer, then step up.'}</p>
      </header>

      {!duty && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Standard">
            {RO_LEVELS.map(lv => (
              <button key={lv} type="button" className="sim-chip-btn" disabled={!open.includes(lv)} aria-pressed={level === lv} style={pill(level === lv)} onClick={() => setLevel(lv)}>
                {LEVEL_WORD[lv]}{held && RO_LEVELS.indexOf(lv) <= RO_LEVELS.indexOf(held) ? <Check size={14} aria-label="held" /> : null}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['course', 'line', 'score', 'protest'] as DutyId[]).map(d => {
              const ready = DUTIES_READY.includes(d);
              const best = record?.best[`${d}:${level}`];
              return (
                <section key={d} className={cx('sim-card flex flex-col gap-3 p-5', !ready && 'opacity-70')} aria-labelledby={`duty-${d}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 id={`duty-${d}`} className="sim-h3">{DUTY_NAME[d]}</h2>
                    {best && <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums" style={{ background: best.score >= PASS[level] ? 'rgba(124,227,161,0.16)' : 'rgba(255,180,168,0.14)', color: best.score >= PASS[level] ? '#7CE3A1' : '#FFB4A8' }}>Best {best.score}</span>}
                  </div>
                  <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>{DUTY_SAY[d]}</p>
                  {ready ? <button type="button" className="sim-chip-btn self-start" onClick={() => { setSeed(freshSeed()); setDuty(d); }}>Try it at {LEVEL_WORD[level]} standard<ArrowRight size={14} /></button>
                    : <span className="text-[12.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.faint }}>On its way</span>}
                </section>
              );
            })}
          </div>
          <p className="m-0 text-[12.5px]" style={{ color: C.faint }}>{PASS[level]} out of 100 passes a duty at {LEVEL_WORD[level]} standard. Your race officer's record stays in the Academy.</p>
        </div>
      )}
      {duty === 'course' && course && <CourseDuty key={`${level}-${seed}`} task={course} onMarked={marked} onAgain={again} />}
      {duty === 'line' && line && <LineDuty key={`${level}-${seed}`} task={line} onMarked={marked} onAgain={again} />}
    </div>
  );
}

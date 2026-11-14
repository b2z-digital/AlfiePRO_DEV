// Your transmitter: plug in a RadioMaster (or any EdgeTX or OpenTX radio, or a gamepad) and set it
// up by moving its sticks, one picture and one thing to do at a time, in big type: Connect, Steering,
// Sail, Try it. It works out which stick is which, which way is right, which end is "sheeted in",
// where the rudder rests and how far each goes, and remembers each transmitter. Hail and Tack can go
// on a switch. "Set it up by hand" keeps the channel lists and the two-step calibration.
import { useEffect, useRef, useState } from 'react';
import { AxisCal, GamepadMapping, TRANSMITTER_DEADZONE, Trigger, activePad, calibrated, calibratedRange, connectedPads, deviceName, isTransmitter, savedFor } from './input';
import { Hold, PadFrame, Watch, atEnd, flicked, frameOf, inMiddle, markChecked, onAppleTouch, triggerText } from './transmitter';
import { Btn, C, Cap, Hud, cx } from './ui';

type Phase = 'connect' | 'found' | 'rudder' | 'right' | 'centre' | 'rudderDone' | 'sail' | 'in' | 'sailDone' | 'try' | 'hail' | 'tack' | 'manual';
type CalStep = 'idle' | 'centre' | 'range';

interface Job {
  phase: Phase; at: number;
  watch: Watch | null; hold: Hold; moved: boolean; startV: number;
  rudder: { axis: number; min: number; max: number; right?: 'min' | 'max'; centre?: number } | null;
  sail: { axis: number; min: number; max: number } | null;
  learnFrom: PadFrame | null; learnHold: Hold;
}

const newJob = (): Job => ({ phase: 'connect', at: 0, watch: null, hold: new Hold(), moved: false, startV: 0, rudder: null, sail: null, learnFrom: null, learnHold: new Hold() });

/** How long each green tick stays before the next step, and how long a stick has to be held. */
const TICK_MS = 1100, HOLD_MS = 500;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ───────────────────────── Pictures ─────────────────────────

const INK = '#E9EEF8', DIM = 'rgba(235,240,255,0.35)', BLUE = '#4DA3FF', GREEN = '#34D399';

/** One stick, close up, showing how to move it. */
function StickArt({ motion, size = 170 }: { motion: 'side' | 'updown' | 'right' | 'release'; size?: number }) {
  const still = reducedMotion();
  const anim = (values: string, dur = '2.4s') => (still ? null : <animateTransform attributeName="transform" type="translate" values={values} dur={dur} repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1" />);
  const at = motion === 'right' ? 'translate(40 0)' : 'translate(0 0)';
  const arrow = (d: string) => <path d={d} fill="none" stroke={BLUE} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={motion === 'side' ? 'Move the stick from side to side' : motion === 'updown' ? 'Move the stick up and down' : motion === 'right' ? 'Push the stick to the right and hold it' : 'Let the stick go back to the middle'}>
      <rect x="30" y="30" width="140" height="140" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
      <circle cx="100" cy="100" r="52" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeDasharray="5 6" />
      {motion === 'side' && arrow('M18 100 L6 100 M14 90 L4 100 L14 110')}
      {(motion === 'side' || motion === 'right') && arrow('M182 100 L194 100 M186 90 L196 100 L186 110')}
      {motion === 'updown' && <>{arrow('M100 18 L100 6 M90 14 L100 4 L110 14')}{arrow('M100 182 L100 194 M90 186 L100 196 L110 186')}</>}
      <g transform={at}>
        {motion === 'side' && anim('-40 0;40 0;-40 0')}
        {motion === 'updown' && anim('0 -40;0 40;0 -40')}
        {motion === 'release' && !still && <animateTransform attributeName="transform" type="translate" values="40 0;0 0;0 0" keyTimes="0;0.35;1" dur="2.4s" repeatCount="indefinite" />}
        <circle cx="100" cy="100" r="22" fill={INK} />
        <circle cx="100" cy="100" r="9" fill="rgba(6,11,22,0.25)" />
      </g>
      {motion === 'right' && <text x="100" y="192" textAnchor="middle" fill={BLUE} fontSize="18" fontWeight="700" fontFamily="inherit">RIGHT</text>}
    </svg>
  );
}

/** A boat seen from above, the wind coming down the page: her rudder and sail follow your sticks. */
function BoatArt({ rudder, sheet, size = 200, sailKnown = true }: { rudder: number; sheet: number | null; size?: number; sailKnown?: boolean }) {
  const r = Math.max(-1, Math.min(1, rudder)) * 35 * (Math.PI / 180);
  const a = (8 + (1 - Math.max(0, Math.min(1, sheet ?? 1))) * 67) * (Math.PI / 180);
  const bx = 100 + 66 * Math.sin(a), by = 82 + 66 * Math.cos(a);
  const turn = rudder > 0.2 ? 'right' : rudder < -0.2 ? 'left' : null;
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 200 220" role="img" aria-label={`Your boat: ${turn ? `turning ${turn}` : 'going straight'}${sheet != null && sailKnown ? `, sail ${sheet > 0.7 ? 'in' : sheet < 0.3 ? 'out' : 'half in'}` : ''}`}>
      <text x="22" y="22" fill={DIM} fontSize="13" fontWeight="700" fontFamily="inherit">WIND</text>
      <path d="M38 30 L38 54 M30 46 L38 56 L46 46" fill="none" stroke="#9CCBFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Hull */}
      <path d="M100 30 C122 60 124 110 116 176 L84 176 C76 110 78 60 100 30 Z" fill="rgba(77,163,255,0.18)" stroke="#9CCBFF" strokeWidth="2.5" />
      {/* Sail */}
      {sheet != null && <path d={`M100 82 Q ${(100 + bx) / 2 + 10 * Math.cos(a)} ${(82 + by) / 2 - 10 * Math.sin(a)} ${bx} ${by}`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />}
      <circle cx="100" cy="82" r="5" fill={INK} />
      {/* Rudder */}
      <path d={`M100 176 L${100 + 30 * Math.sin(r)} ${176 + 30 * Math.cos(r)}`} stroke={turn ? BLUE : INK} strokeWidth="7" strokeLinecap="round" />
      {turn && <text x="100" y="214" textAnchor="middle" fill={BLUE} fontSize="15" fontWeight="700" fontFamily="inherit">{turn === 'right' ? 'TURNING RIGHT' : 'TURNING LEFT'}</text>}
    </svg>
  );
}

/** The transmitter plugged into the computer with its USB cable. */
function CableArt({ width = 300 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 130) / 300} viewBox="0 0 300 130" role="img" aria-label="Your transmitter plugged into the computer with a USB cable">
      {/* Transmitter */}
      <rect x="8" y="34" width="112" height="76" rx="18" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <path d="M64 34 L64 6" stroke="rgba(255,255,255,0.35)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="38" cy="72" r="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" /><circle cx="38" cy="72" r="6" fill={INK} />
      <circle cx="90" cy="72" r="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" /><circle cx="90" cy="72" r="6" fill={INK} />
      {/* Cable */}
      <path d="M120 96 C170 126 170 60 214 84" fill="none" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
      <rect x="112" y="89" width="12" height="14" rx="3" fill={BLUE} /><rect x="210" y="78" width="14" height="12" rx="3" fill={BLUE} />
      {/* Computer */}
      <rect x="222" y="40" width="70" height="50" rx="6" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <path d="M212 98 L300 98" stroke="rgba(255,255,255,0.35)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** What the radio's screen shows when it's plugged in: pick the first one. */
function RadioScreenArt({ width = 260 }: { width?: number }) {
  const row = (y: number, text: string, on: boolean) => (
    <g key={text}>
      <rect x="14" y={y} width="232" height="30" rx="6" fill={on ? '#1E6CFF' : 'transparent'} />
      <text x="28" y={y + 20} fill={on ? '#FFFFFF' : 'rgba(235,240,255,0.55)'} fontSize="15" fontWeight={on ? 700 : 500} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{text}</text>
    </g>
  );
  return (
    <svg width={width} height={(width * 128) / 260} viewBox="0 0 260 128" role="img" aria-label="On the radio's screen, choose USB Joystick (HID)">
      <rect x="2" y="2" width="256" height="124" rx="12" fill="#0B1220" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      {row(14, 'USB Joystick (HID)', true)}
      {row(50, 'USB Storage (SD)', false)}
      {row(86, 'USB Serial (VCP)', false)}
    </svg>
  );
}

/** A switch flicking over, for Hail and Tack. */
function SwitchArt() {
  const still = reducedMotion();
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Flick the switch">
      <rect x="35" y="62" width="50" height="34" rx="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <g>
        {!still && <animateTransform attributeName="transform" type="rotate" values="-28 60 70;28 60 70;-28 60 70" dur="1.6s" repeatCount="indefinite" />}
        <path d="M60 70 L60 18" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function BigTick({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4" role="status">
      <span className="flex h-24 w-24 items-center justify-center rounded-full" style={{ background: 'rgba(52,211,153,0.16)', border: `3px solid ${GREEN}` }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <p className="m-0 font-display text-[26px] font-bold">{text}</p>
    </div>
  );
}

/** Progress while you're doing it: moving enough, or holding long enough. */
function Fill({ v, label }: { v: number; label: string }) {
  return (
    <div className="flex w-full max-w-[360px] flex-col gap-1.5">
      <div className="h-3 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-[#4DA3FF] transition-[width] duration-150" style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` }} /></div>
      <p className="m-0 text-center text-[15px]" style={{ color: C.mute }}>{label}</p>
    </div>
  );
}

const STEPS = ['Connect', 'Steering', 'Sail', 'Try it'] as const;
function Steps({ at }: { at: number }) {
  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label={`Step ${at + 1} of 4: ${STEPS[at]}`}>
      {STEPS.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className={cx('flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold', i < at ? 'bg-[rgba(52,211,153,0.18)] text-[#6EE7B7]' : i === at ? 'bg-[#1E6CFF] text-white' : 'bg-white/[0.07]')} style={i > at ? { color: C.mute } : undefined}>
            {i < at ? '✓' : i + 1}
          </span>
          <span className={cx('truncate text-[13.5px]', i === at ? 'font-semibold' : '')} style={i === at ? undefined : { color: C.mute }}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

const big = '!h-12 !px-6 !text-[16px]';

function Meter({ label, v, from }: { label: string; v: number; from: 'centre' | 'left' }) {
  const pct = from === 'centre' ? (v + 1) / 2 : v;
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-xs" style={{ color: C.mute }}>{label}</span>
      <span className="relative h-2 flex-1 rounded bg-white/[0.08]">
        {from === 'centre' && <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />}
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4DA3FF]" style={{ left: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
      </span>
      <span className="w-10 text-right font-mono text-xs tabular-nums">{v.toFixed(2)}</span>
    </div>
  );
}

// ───────────────────────── The set-up ─────────────────────────

export default function GamepadModal({ mapping, onSave, onClose }: { mapping: GamepadMapping; onSave: (m: GamepadMapping) => void; onClose: () => void }) {
  const [local, setLocal] = useState<GamepadMapping>({ ...mapping });
  const [axes, setAxes] = useState<number[]>([]);
  const [id, setId] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('connect');
  // How the current step is going (0..1), and whether it's taking a while (then a hint).
  const [progress, setProgress] = useState(0);
  const [slow, setSlow] = useState(false);
  const [extras, setExtras] = useState(false);
  // The check before sailing: each skipper confirms the boat turns the way they steer and the sail
  // comes in when they pull it in, flipping either if it's back to front. (Every EdgeTX radio looks
  // the same to the browser, so a set-up found for "this transmitter" may be someone else's radio.)
  const [ok, setOk] = useState({ steer: false, sail: false });
  const tried = useRef({ left: false, right: false, lo: 1, hi: 0 });
  const job = useRef<Job>(newJob());
  const localRef = useRef(local);
  localRef.current = local;
  const [step, setStep] = useState<CalStep>('idle');
  const stepRef = useRef<CalStep>('idle');
  stepRef.current = step;
  // Calibration by hand: the rest position, then the extremes seen while the sticks are moved.
  const cal = useRef<{ rudder: AxisCal; sheet: AxisCal }>({ rudder: { centre: 0, min: 0, max: 0 }, sheet: { centre: 0, min: 0, max: 0 } });

  useEffect(() => {
    let raf = 0;
    const go = (p: Phase, f: PadFrame, axis?: number) => {
      const j = job.current;
      j.phase = p; j.at = f.t; j.hold = new Hold(); j.moved = false; j.learnFrom = null; j.learnHold = new Hold();
      j.watch = p === 'rudder' || p === 'sail' ? new Watch(f) : null;
      j.startV = axis != null ? f.axes[axis] ?? 0 : 0;
      setPhase(p); setSlow(false); setProgress(0);
    };
    const track = (r: { axis: number; min: number; max: number }, v: number) => { r.min = Math.min(r.min, v); r.max = Math.max(r.max, v); };
    const step = (f: PadFrame, padId: string) => {
      const j = job.current;
      const r = j.rudder, s = j.sail;
      const since = f.t - j.at;
      switch (j.phase) {
        case 'connect': {
          // Set up before: straight to trying it. New: a green tick, then the steps.
          const saved = savedFor(padId);
          if (saved) { setLocal(saved); go('try', f); }
          else go('found', f);
          break;
        }
        case 'found': if (since > TICK_MS) go('rudder', f); break;
        case 'rudderDone': if (since > TICK_MS) go('sail', f); break;
        case 'sailDone': if (since > TICK_MS) go('try', f); break;
        case 'rudder': case 'sail': {
          j.watch!.add(f);
          const not = j.phase === 'sail' && r ? [r.axis] : [];
          const m = j.watch!.moved(not, 0.05);
          setProgress(m ? Math.min(1, (m.max - m.min) / 1.2) * Math.min(1, since / 1500) : 0);
          if (since > 7000) setSlow(true);
          if (since < 1500) break;
          const got = j.watch!.moved(not, 0.9);
          if (!got) break;
          if (j.phase === 'rudder') { j.rudder = { ...got }; go('right', f, got.axis); }
          else { j.sail = { ...got }; go('in', f, got.axis); }
          break;
        }
        case 'right': case 'in': {
          const x = j.phase === 'right' ? r! : s!;
          const v = f.axes[x.axis] ?? 0;
          track(x, v);
          if (Math.abs(v - j.startV) > 0.3) j.moved = true;
          const end = atEnd(v, x.min, x.max);
          const held = j.hold.feed(f.t, v);
          setProgress(end && j.moved ? Math.min(1, held / HOLD_MS) : 0);
          if (since > 5000) setSlow(true);
          if (!end || held < HOLD_MS || !j.moved) break;
          if (j.phase === 'right') { r!.right = end; go('centre', f, r!.axis); break; }
          // Both sticks known: the set-up, with the ends seen and where the rudder rests.
          setLocal(m => ({
            ...m,
            rudderAxis: r!.axis, rudderInverted: r!.right === 'min',
            sheetAxis: s!.axis, sheetInverted: end === 'min',
            cal: { rudder: { centre: r!.centre ?? (r!.min + r!.max) / 2, min: r!.min, max: r!.max }, sheet: { centre: (s!.min + s!.max) / 2, min: s!.min, max: s!.max } },
            deadzone: isTransmitter(padId) ? TRANSMITTER_DEADZONE : m.deadzone,
            device: padId,
          }));
          go('sailDone', f);
          break;
        }
        case 'centre': {
          const v = f.axes[r!.axis] ?? 0;
          track(r!, v);
          let held = 0;
          if (inMiddle(v, r!.min, r!.max)) held = j.hold.feed(f.t, v);
          else j.hold = new Hold();
          setProgress(Math.min(1, held / HOLD_MS));
          if (held > HOLD_MS) { r!.centre = v; go('rudderDone', f); }
          break;
        }
        case 'hail': case 'tack': {
          if (!j.learnFrom) { j.learnFrom = f; break; }
          const m = localRef.current;
          const t = flicked(j.learnFrom, f, [m.rudderAxis, m.sheetAxis]);
          if (!t) break;
          // A switch has to settle in its new position; a button counts as soon as it's pressed.
          if (t.kind === 'axis' && j.learnHold.feed(f.t, f.axes[t.index] ?? 0, 0.04) < 250) break;
          const which = j.phase;
          setLocal(cur => ({ ...cur, [which]: t as Trigger }));
          go('try', f);
          break;
        }
        default: break;
      }
    };
    const poll = () => {
      const pads = connectedPads();
      const gp = (chosen ? pads.find(p => p.id === chosen) : undefined) ?? activePad(localRef.current);
      const list = pads.map(p => p.id);
      setIds(prev => (prev.join('\n') === list.join('\n') ? prev : list));
      setAxes(gp ? [...gp.axes] : []);
      setId(gp ? gp.id : '');
      if (gp) {
        const f = frameOf(gp, performance.now());
        step(f, gp.id);
        if (stepRef.current === 'range' && f.axes.length) {
          const m = localRef.current, c = cal.current;
          const rv = f.axes[m.rudderAxis] ?? 0, sv = f.axes[m.sheetAxis] ?? 0;
          c.rudder.min = Math.min(c.rudder.min, rv); c.rudder.max = Math.max(c.rudder.max, rv);
          c.sheet.min = Math.min(c.sheet.min, sv); c.sheet.max = Math.max(c.sheet.max, sv);
        }
      } else if (job.current.phase !== 'manual' && job.current.phase !== 'connect') {
        // Unplugged part way: start again when it's back.
        job.current = newJob(); setPhase('connect');
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [chosen]);

  // Moving on from a button: the watching loop follows the same phase.
  const to = (p: Phase) => { const j = job.current; j.phase = p; j.at = performance.now(); j.learnFrom = null; j.learnHold = new Hold(); setPhase(p); setSlow(false); };
  const restart = () => { job.current = newJob(); setPhase('connect'); setLocal(m => ({ ...m, cal: undefined })); setOk({ steer: false, sail: false }); tried.current = { left: false, right: false, lo: 1, hi: 0 }; };
  const save = () => { const device = local.device ?? (id || undefined); onSave({ ...local, device }); if (device) markChecked(device); onClose(); };

  const rawR = axes[local.rudderAxis] ?? 0, rawS = axes[local.sheetAxis] ?? 0;
  const rud = (local.rudderInverted ? -1 : 1) * calibrated(rawR, local.cal?.rudder);
  const sail = local.sheetInverted ? 1 - calibratedRange(rawS, local.cal?.sheet) : calibratedRange(rawS, local.cal?.sheet);
  // What the sticks have done during the check: steered both ways, and the sail from out to in.
  if (phase === 'try' && id) {
    const t = tried.current;
    if (rud < -0.5) t.left = true;
    if (rud > 0.5) t.right = true;
    t.lo = Math.min(t.lo, sail); t.hi = Math.max(t.hi, sail);
  }
  const steerTried = tried.current.left && tried.current.right, sailTried = tried.current.hi - tried.current.lo > 0.6;
  const flipSteer = () => { setLocal(m => ({ ...m, rudderInverted: !m.rudderInverted })); tried.current = { ...tried.current, left: false, right: false }; };
  const flipSail = () => { setLocal(m => ({ ...m, sheetInverted: !m.sheetInverted })); tried.current = { ...tried.current, lo: 1, hi: 0 }; };
  const j = job.current;
  // While finding which way is right, the boat shows the stick as it is so far.
  const rawRudder = (() => { const r = j.rudder; if (!r) return 0; const v = axes[r.axis] ?? 0, mid = (r.min + r.max) / 2, half = Math.max(0.05, (r.max - r.min) / 2); return (v - mid) / half; })();
  const startCal = () => { cal.current = { rudder: { centre: rawR, min: rawR, max: rawR }, sheet: { centre: rawS, min: rawS, max: rawS } }; setStep('centre'); };
  const centreDone = () => { cal.current.rudder = { centre: rawR, min: rawR, max: rawR }; cal.current.sheet = { centre: rawS, min: rawS, max: rawS }; setStep('range'); };
  const rangeDone = () => { const c = cal.current; setLocal({ ...local, cal: { rudder: { ...c.rudder }, sheet: { ...c.sheet } }, device: local.device ?? (id || undefined) }); setStep('idle'); };
  const stepNo = phase === 'connect' || phase === 'found' ? 0 : phase === 'rudder' || phase === 'right' || phase === 'centre' || phase === 'rudderDone' ? 1 : phase === 'sail' || phase === 'in' || phase === 'sailDone' ? 2 : 3;
  const select = 'h-10 flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[14px] text-[#F1F4FA]';
  const n = Math.max(axes.length, 4);
  const ready = !!id;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 text-[#F1F4FA] sm:p-4" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default border-0 bg-black/60" onClick={onClose} />
      <Hud className="relative flex max-h-[calc(100%-24px)] w-full max-w-[620px] flex-col gap-5 overflow-y-auto px-5 py-5 text-[16px] sm:px-8 sm:py-7" role="dialog" aria-label="Set up your transmitter">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 font-display text-[26px] font-bold leading-tight">Your transmitter</h2>
            <p className="m-0 mt-1 truncate text-[15px]" style={{ color: C.mute }}>{id ? deviceName(id) : 'Sail with your own sticks'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-[#F1F4FA]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {phase !== 'manual' && <Steps at={stepNo} />}

        {ids.length > 1 && phase !== 'manual' && (
          <label className="flex items-center gap-3 text-[15px]">
            <span style={{ color: C.mute }}>Set up:</span>
            <select className={select} value={chosen ?? id} onChange={e => { setChosen(e.target.value); job.current = newJob(); setPhase('connect'); }}>
              {ids.map(x => <option key={x} value={x}>{deviceName(x)}</option>)}
            </select>
          </label>
        )}

        {/* 1. Connect */}
        {phase === 'connect' && !id && (
          <div className="flex flex-col gap-4">
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {([
                [<CableArt key="a" width={170} />, <>Plug your transmitter into this computer with its USB cable, and switch it on.</>],
                [<RadioScreenArt key="b" width={170} />, <>When the radio asks, choose <span className="whitespace-nowrap text-[#9CCBFF]">USB Joystick (HID)</span>.</>],
                [<StickArt key="c" motion="side" size={96} />, <>Then wiggle a stick.</>],
              ] as const).map(([art, text], i) => (
                <li key={i} className="flex flex-col items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-center sm:flex-row sm:text-left">
                  <div className="flex w-[176px] shrink-0 justify-center">{art}</div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1E6CFF] text-[17px] font-bold text-white">{i + 1}</span>
                    <p className="m-0 text-[19px] font-bold leading-snug">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3.5" role="status">
              <span className="relative flex h-3.5 w-3.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4DA3FF] opacity-60" /><span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[#4DA3FF]" /></span>
              <span className="text-[17px] font-semibold">Waiting for your transmitter…</span>
            </div>
            <p className="m-0 text-center text-[15px] leading-normal" style={{ color: C.mute }}>Tip: pick your sailing model on the radio first. The simulator then uses its rates and expo.</p>
            {onAppleTouch() && (
              <p className="m-0 rounded-2xl border border-[rgba(255,159,67,0.32)] bg-[rgba(255,159,67,0.10)] px-4 py-3 text-[15px] leading-normal text-[#FFD7B0]">
                An iPad or iPhone can't use a radio plugged in by USB: Apple only allows certain game controllers. Use a computer, or an Android tablet.
              </p>
            )}
          </div>
        )}
        {phase === 'found' && <BigTick text="Found it!" />}

        {/* 2. Steering */}
        {(phase === 'rudder' || phase === 'right' || phase === 'centre') && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="m-0 text-[22px] font-bold leading-snug" aria-live="polite">
              {phase === 'rudder' ? 'Move the stick you steer with from side to side, all the way, a few times.'
                : phase === 'right' ? <>Now push it to the <span className="text-[#9CCBFF]">right</span> and hold it there.</>
                  : 'Now let it go.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <StickArt motion={phase === 'rudder' ? 'side' : phase === 'right' ? 'right' : 'release'} />
              {/* Pushing right: the picture of what right does. Letting go: the rudder follows the stick back to the middle. */}
              {phase !== 'rudder' && <BoatArt rudder={phase === 'centre' ? rawRudder * (j.rudder?.right === 'min' ? -1 : 1) : 1} sheet={null} size={150} />}
            </div>
            <Fill v={progress} label={phase === 'rudder' ? (progress > 0.05 ? 'Keep going…' : 'Waiting for the stick to move') : progress > 0 ? 'Hold it…' : phase === 'right' ? 'Push it right over' : 'Let it spring back to the middle'} />
            {slow && <p className="m-0 text-[15px]" style={{ color: C.mute }}>{phase === 'rudder' ? 'Move only the steering stick, right to each side.' : phase === 'right' ? 'Push it as far right as it goes, and keep it still for a moment.' : 'Take your thumb off the stick.'}</p>}
          </div>
        )}
        {phase === 'rudderDone' && <BigTick text="Steering done" />}

        {/* 3. Sail */}
        {(phase === 'sail' || phase === 'in') && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="m-0 text-[22px] font-bold leading-snug" aria-live="polite">
              {phase === 'sail' ? 'Now move your sail stick all the way up and all the way down, a few times.'
                : <>Now pull the sail <span className="text-[#9CCBFF]">right in</span>, as you would going upwind, and hold it there.</>}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {phase === 'sail' ? <StickArt motion="updown" /> : <BoatArt rudder={0} sheet={1} size={150} />}
            </div>
            <Fill v={progress} label={phase === 'sail' ? (progress > 0.05 ? 'Keep going…' : 'Waiting for the stick to move') : progress > 0 ? 'Hold it…' : 'Sail right in'} />
            {slow && <p className="m-0 text-[15px]" style={{ color: C.mute }}>{phase === 'sail' ? 'Move only the sail stick, right to each end.' : 'Already in? Ease it out a little, then pull it back in and hold.'}</p>}
          </div>
        )}
        {phase === 'sailDone' && <BigTick text="Sail done" />}

        {/* 4. Try it: each skipper checks both sticks before sailing */}
        {phase === 'try' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="m-0 text-[22px] font-bold leading-snug">{savedFor(id) && !ok.steer ? 'A quick check of your sticks before you sail.' : 'Check your sticks.'}</p>
            <BoatArt rudder={rud} sheet={sail} size={170} />
            {!ok.steer ? (
              <div className="flex w-full flex-col items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-4" aria-live="polite">
                <p className="m-0 text-[19px] font-bold leading-snug">Steer <span className="text-[#9CCBFF]">left</span>, then <span className="text-[#9CCBFF]">right</span>. Does the boat turn the same way as your stick?</p>
                <p className="m-0 text-[15px]" style={{ color: C.mute }}>{steerTried ? 'Watch the rudder and the words under the boat.' : `Push it right over each way${tried.current.left || tried.current.right ? ` (now ${tried.current.left ? 'right' : 'left'})` : ''}.`}</p>
                <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
                  <Btn primary className={big} disabled={!steerTried} onClick={() => setOk(o => ({ ...o, steer: true }))}>Yes, the same way</Btn>
                  <Btn className={big} disabled={!steerTried} onClick={flipSteer}>No, it's back to front</Btn>
                </div>
              </div>
            ) : !ok.sail ? (
              <div className="flex w-full flex-col items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-4" aria-live="polite">
                <p className="m-0 flex items-center gap-2 text-[15px] font-semibold text-[#6EE7B7]"><span aria-hidden="true">✓</span>Steering checked</p>
                <p className="m-0 text-[19px] font-bold leading-snug">Now let the sail <span className="text-[#9CCBFF]">out</span>, then pull it <span className="text-[#9CCBFF]">right in</span>. Does the sail come in when you pull it in?</p>
                <p className="m-0 text-[15px]" style={{ color: C.mute }}>{sailTried ? 'Watch the sail on the boat.' : 'Move the sail stick all the way, end to end.'}</p>
                <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
                  <Btn primary className={big} disabled={!sailTried} onClick={() => setOk(o => ({ ...o, sail: true }))}>Yes, it comes in</Btn>
                  <Btn className={big} disabled={!sailTried} onClick={flipSail}>No, it's back to front</Btn>
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-3" aria-live="polite">
                <p className="m-0 flex items-center gap-2 text-[17px] font-semibold text-[#6EE7B7]"><span aria-hidden="true">✓</span>Steering and sail checked</p>
                <Btn primary className={big} onClick={save} disabled={!ready}>Go sailing</Btn>
              </div>
            )}
            <button type="button" onClick={restart} className="cursor-pointer border-0 bg-transparent p-1 text-[15px] font-semibold underline-offset-4 hover:underline" style={{ color: C.mute }}>Something else is wrong: set it up again</button>
            <button type="button" onClick={() => setExtras(v => !v)} aria-expanded={extras} className="cursor-pointer border-0 bg-transparent p-1 text-[15px] font-semibold text-[#9CCBFF] underline-offset-4 hover:underline">
              {extras ? 'Hide the extras' : 'Extras: Hail or Tack on a switch'}
            </button>
            {extras && (
              <div className="flex w-full flex-col gap-2.5 text-left">
                {(['hail', 'tack'] as const).map(k => (
                  <div key={k} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3">
                    <span className="w-14 text-[17px] font-bold">{k === 'hail' ? 'Hail' : 'Tack'}</span>
                    <span className="min-w-0 flex-1 text-[15px]" style={{ color: C.mute }}>{triggerText(local[k])}</span>
                    <Btn onClick={() => to(k)}>{local[k] ? 'Change' : 'Choose a switch'}</Btn>
                    {local[k] && <Btn quiet onClick={() => setLocal(m => ({ ...m, [k]: null }))}>Clear</Btn>}
                  </div>
                ))}
                <p className="m-0 text-[14px] leading-normal" style={{ color: C.mute }}>A switch only reaches the simulator if your model puts it on a channel: a spare one from CH5 to CH8, or CH9 and up.</p>
              </div>
            )}
          </div>
        )}
        {(phase === 'hail' || phase === 'tack') && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="m-0 text-[22px] font-bold leading-snug" aria-live="polite">Flick the switch you want for {phase === 'hail' ? 'Hail' : 'Tack'}, or press its button.</p>
            <SwitchArt />
            <Btn className={big} onClick={() => to('try')}>Cancel</Btn>
          </div>
        )}

        {/* By hand */}
        {phase === 'manual' && (
          <div className="flex flex-col gap-4 text-[14px]">
            <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-white/[0.04] p-3">
              {axes.slice(0, 8).map((v, i) => (
                <div key={i} className="text-center">
                  <div className="text-[11px]" style={{ color: C.mute }}>Axis {i + 1}</div>
                  <div className="font-mono text-xs" style={{ color: Math.abs(v) > 0.1 ? C.green : C.text }}>{v.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <Cap>Rudder stick</Cap>
              <span className="flex items-center gap-2">
                <select className={select} value={local.rudderAxis} onChange={e => setLocal({ ...local, rudderAxis: Number(e.target.value), cal: undefined })}>
                  {Array.from({ length: n }, (_, i) => <option key={i} value={i}>Axis {i + 1}</option>)}
                </select>
                <span className="flex items-center gap-1.5 text-[13px]" style={{ color: C.mute }}>
                  <input type="checkbox" checked={local.rudderInverted} onChange={e => setLocal({ ...local, rudderInverted: e.target.checked })} aria-label="Reverse the rudder" /> Reverse
                </span>
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <Cap>Sail stick</Cap>
              <span className="flex items-center gap-2">
                <select className={select} value={local.sheetAxis} onChange={e => setLocal({ ...local, sheetAxis: Number(e.target.value), cal: undefined })}>
                  {Array.from({ length: n }, (_, i) => <option key={i} value={i}>Axis {i + 1}</option>)}
                </select>
                <span className="flex items-center gap-1.5 text-[13px]" style={{ color: C.mute }}>
                  <input type="checkbox" checked={local.sheetInverted} onChange={e => setLocal({ ...local, sheetInverted: e.target.checked })} aria-label="Reverse the sail" /> Reverse
                </span>
              </span>
            </label>
            <div className="flex flex-col gap-2.5 rounded-xl bg-white/[0.04] px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Cap>Calibration</Cap>
                <span className="ml-auto text-xs" style={{ color: C.mute }}>{local.cal ? 'Calibrated' : 'Not calibrated'}</span>
              </div>
              <Meter label="Rudder" v={rud} from="centre" />
              <Meter label="Sail" v={sail} from="left" />
              {step === 'idle' && (
                <div className="flex flex-wrap gap-2">
                  <Btn small onClick={startCal} disabled={!id}>{local.cal ? 'Calibrate again' : 'Calibrate'}</Btn>
                  {local.cal && <Btn small quiet onClick={() => setLocal({ ...local, cal: undefined })}>Clear</Btn>}
                </div>
              )}
              {step === 'centre' && (
                <>
                  <p className="m-0 text-[13.5px] leading-snug">Let go of both sticks so they rest in the middle, then press Next.</p>
                  <div><Btn small primary onClick={centreDone}>Next</Btn></div>
                </>
              )}
              {step === 'range' && (
                <>
                  <p className="m-0 text-[13.5px] leading-snug">Move both sticks all the way to each end, two or three times, then press Done.</p>
                  <div><Btn small primary onClick={rangeDone}>Done</Btn></div>
                </>
              )}
            </div>
            <label className="flex flex-col gap-1.5">
              <Cap>Dead zone · {local.deadzone.toFixed(2)}</Cap>
              <input type="range" min={0} max={0.3} step={0.01} value={local.deadzone} onChange={e => setLocal({ ...local, deadzone: Number(e.target.value) })} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Btn primary onClick={save} disabled={!id}>Save</Btn>
              <Btn onClick={restart}>Set it up by moving the sticks</Btn>
            </div>
          </div>
        )}

        {phase !== 'manual' && (
          <div className="flex justify-center">
            <button type="button" onClick={() => to('manual')} className="cursor-pointer border-0 bg-transparent p-1 text-[13.5px] underline-offset-4 hover:underline" style={{ color: C.mute }}>Set it up by hand instead</button>
          </div>
        )}
      </Hud>
    </div>
  );
}

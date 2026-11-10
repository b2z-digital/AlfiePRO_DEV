// Transmitter set-up: pick which stick moves the rudder and which the sail, with live readings, and
// calibrate them: where each stick rests, and how far it really travels each way.
import { useEffect, useRef, useState } from 'react';
import { AxisCal, GamepadMapping, calibrated, calibratedRange, firstGamepad } from './input';
import { Btn, C, Cap, Hud } from './ui';

type CalStep = 'idle' | 'centre' | 'range';

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

export default function GamepadModal({ mapping, onSave, onClose }: { mapping: GamepadMapping; onSave: (m: GamepadMapping) => void; onClose: () => void }) {
  const [local, setLocal] = useState<GamepadMapping>({ ...mapping });
  const [axes, setAxes] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [step, setStep] = useState<CalStep>('idle');
  const raf = useRef(0);
  // Calibration in progress: the rest position, then the extremes seen while the sticks are moved.
  const cal = useRef<{ rudder: AxisCal; sheet: AxisCal }>({ rudder: { centre: 0, min: 0, max: 0 }, sheet: { centre: 0, min: 0, max: 0 } });
  const stepRef = useRef<CalStep>('idle');
  stepRef.current = step;

  useEffect(() => {
    const poll = () => {
      const gp = firstGamepad();
      const a = gp ? [...gp.axes] : [];
      setAxes(a);
      setName(gp ? gp.id : '');
      if (stepRef.current === 'range' && a.length) {
        const r = a[local.rudderAxis] ?? 0, sv = a[local.sheetAxis] ?? 0;
        const c = cal.current;
        c.rudder.min = Math.min(c.rudder.min, r); c.rudder.max = Math.max(c.rudder.max, r);
        c.sheet.min = Math.min(c.sheet.min, sv); c.sheet.max = Math.max(c.sheet.max, sv);
      }
      raf.current = requestAnimationFrame(poll);
    };
    raf.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf.current);
  }, [local.rudderAxis, local.sheetAxis]);

  const n = Math.max(axes.length, 4);
  const select = 'h-9 flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[13.5px] text-[#F1F4FA]';
  const rawR = axes[local.rudderAxis] ?? 0, rawS = axes[local.sheetAxis] ?? 0;
  const rud = (local.rudderInverted ? -1 : 1) * calibrated(rawR, local.cal?.rudder);
  const sail = local.sheetInverted ? 1 - calibratedRange(rawS, local.cal?.sheet) : calibratedRange(rawS, local.cal?.sheet);

  const startCal = () => {
    cal.current = { rudder: { centre: rawR, min: rawR, max: rawR }, sheet: { centre: rawS, min: rawS, max: rawS } };
    setStep('centre');
  };
  const centreDone = () => {
    cal.current.rudder = { centre: rawR, min: rawR, max: rawR };
    cal.current.sheet = { centre: rawS, min: rawS, max: rawS };
    setStep('range');
  };
  const rangeDone = () => {
    const c = cal.current;
    setLocal({ ...local, cal: { rudder: { ...c.rudder }, sheet: { ...c.sheet } } });
    setStep('idle');
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default border-0 bg-black/50" onClick={onClose} />
      <Hud className="relative flex max-h-[calc(100%-32px)] w-full max-w-[440px] flex-col gap-4 overflow-y-auto px-6 py-5" role="dialog" aria-label="Transmitter set-up">
        <h3 className="m-0 font-display text-[20px] font-bold">Transmitter</h3>
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: name ? C.green : C.red }} />
          <div className="min-w-0">
            <p className="m-0 text-[13.5px] font-semibold">{name ? 'Transmitter connected' : 'No transmitter found'}</p>
            <p className="m-0 truncate text-xs" style={{ color: C.mute }}>{name || 'Plug in a USB transmitter or gamepad in joystick mode, then move a stick.'}</p>
          </div>
        </div>
        {axes.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-white/[0.04] p-3">
            {axes.slice(0, 8).map((v, i) => (
              <div key={i} className="text-center">
                <div className="text-[10px]" style={{ color: C.mute }}>Axis {i}</div>
                <div className="font-mono text-xs" style={{ color: Math.abs(v) > 0.1 ? C.green : C.text }}>{v.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <Cap>Rudder stick</Cap>
          <span className="flex items-center gap-2">
            <select className={select} value={local.rudderAxis} onChange={e => setLocal({ ...local, rudderAxis: Number(e.target.value), cal: undefined })}>
              {Array.from({ length: n }, (_, i) => <option key={i} value={i}>Axis {i}</option>)}
            </select>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: C.mute }}>
              <input type="checkbox" checked={local.rudderInverted} onChange={e => setLocal({ ...local, rudderInverted: e.target.checked })} aria-label="Invert rudder" /> Invert
            </span>
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <Cap>Sail stick</Cap>
          <span className="flex items-center gap-2">
            <select className={select} value={local.sheetAxis} onChange={e => setLocal({ ...local, sheetAxis: Number(e.target.value), cal: undefined })}>
              {Array.from({ length: n }, (_, i) => <option key={i} value={i}>Axis {i}</option>)}
            </select>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: C.mute }}>
              <input type="checkbox" checked={local.sheetInverted} onChange={e => setLocal({ ...local, sheetInverted: e.target.checked })} aria-label="Invert sail" /> Invert
            </span>
          </span>
        </label>

        {/* Calibration */}
        <div className="flex flex-col gap-2.5 rounded-xl bg-white/[0.04] px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Cap>Calibration</Cap>
            <span className="ml-auto text-xs" style={{ color: C.mute }}>{local.cal ? 'Calibrated' : 'Not calibrated'}</span>
          </div>
          <Meter label="Rudder" v={rud} from="centre" />
          <Meter label="Sail" v={sail} from="left" />
          {step === 'idle' && (
            <div className="flex flex-wrap gap-2">
              <Btn small onClick={startCal} disabled={!name}>{local.cal ? 'Calibrate again' : 'Calibrate'}</Btn>
              {local.cal && <Btn small quiet onClick={() => setLocal({ ...local, cal: undefined })}>Clear</Btn>}
            </div>
          )}
          {step === 'centre' && (
            <>
              <p className="m-0 text-[13px] leading-snug">Let go of both sticks so they rest in the middle, then press Next.</p>
              <div><Btn small primary onClick={centreDone}>Next</Btn></div>
            </>
          )}
          {step === 'range' && (
            <>
              <p className="m-0 text-[13px] leading-snug">Move both sticks all the way to each end, two or three times, then press Done.</p>
              <div><Btn small primary onClick={rangeDone}>Done</Btn></div>
            </>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <Cap>Dead zone · {local.deadzone.toFixed(2)}</Cap>
          <input type="range" min={0} max={0.3} step={0.01} value={local.deadzone} onChange={e => setLocal({ ...local, deadzone: Number(e.target.value) })} />
        </label>
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={onClose}>Cancel</Btn>
          <Btn primary className="flex-1" onClick={() => { onSave(local); onClose(); }}>Save</Btn>
        </div>
      </Hud>
    </div>
  );
}

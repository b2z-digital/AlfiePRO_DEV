// Transmitter set-up: pick which stick moves the rudder and which the sail, with live readings.
import { useEffect, useRef, useState } from 'react';
import { GamepadMapping, firstGamepad } from './input';
import { Btn, C, Cap, Hud } from './ui';

export default function GamepadModal({ mapping, onSave, onClose }: { mapping: GamepadMapping; onSave: (m: GamepadMapping) => void; onClose: () => void }) {
  const [local, setLocal] = useState<GamepadMapping>({ ...mapping });
  const [axes, setAxes] = useState<number[]>([]);
  const [name, setName] = useState('');
  const raf = useRef(0);

  useEffect(() => {
    const poll = () => {
      const gp = firstGamepad();
      setAxes(gp ? [...gp.axes] : []);
      setName(gp ? gp.id : '');
      raf.current = requestAnimationFrame(poll);
    };
    raf.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const n = Math.max(axes.length, 4);
  const select = 'h-9 flex-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[13.5px] text-[#F1F4FA]';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default border-0 bg-black/50" onClick={onClose} />
      <Hud className="relative flex w-full max-w-[420px] flex-col gap-4 px-6 py-5" role="dialog" aria-label="Transmitter set-up">
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
            <select className={select} value={local.rudderAxis} onChange={e => setLocal({ ...local, rudderAxis: Number(e.target.value) })}>
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
            <select className={select} value={local.sheetAxis} onChange={e => setLocal({ ...local, sheetAxis: Number(e.target.value) })}>
              {Array.from({ length: n }, (_, i) => <option key={i} value={i}>Axis {i}</option>)}
            </select>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: C.mute }}>
              <input type="checkbox" checked={local.sheetInverted} onChange={e => setLocal({ ...local, sheetInverted: e.target.checked })} aria-label="Invert sail" /> Invert
            </span>
          </span>
        </label>
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

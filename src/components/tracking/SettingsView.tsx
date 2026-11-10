// The club's tracking settings: how results reach scoring, who can watch, how accurate the system
// is, each class's tag position, and when to raise alerts. Club admins change them; race officers see them.
import { useEffect, useState } from 'react';
import { coordinatorKey, saveConfig, type ClassGeometry, type ClubTracking } from './data';
import { Btn, C, Seg } from '../race-simulator/ui';

interface Props { tracking: ClubTracking; onSaved: () => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] py-3 first:border-t-0">
      <div className="min-w-[200px] flex-1"><p className="m-0 text-[14px] font-semibold">{label}</p>{hint && <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: C.mute }}>{hint}</p>}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
function Num({ value, onChange, step = 1, min = 0, max, unit, label, disabled }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; unit?: string; label: string; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: C.mute }}>
      <input type="number" aria-label={label} value={Number.isFinite(value) ? value : ''} step={step} min={min} max={max} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="h-9 w-[84px] rounded-[10px] border border-white/15 bg-white/[0.06] px-2 text-right font-mono text-[14px] text-[#F1F4FA] disabled:opacity-60" />
      {unit}
    </label>
  );
}

export default function SettingsView({ tracking, onSaved }: Props) {
  const [d, setD] = useState(tracking);
  const [rounding, setRounding] = useState(Number(tracking.rounding_m ?? 2));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [newClass, setNewClass] = useState('');
  useEffect(() => { setD(tracking); setRounding(Number(tracking.rounding_m ?? 2)); }, [tracking]);
  const ro = !tracking.can_manage;
  const set = <K extends keyof ClubTracking>(k: K, v: ClubTracking[K]) => setD(x => ({ ...x, [k]: v }));
  const geo = (cls: string, patch: Partial<ClassGeometry>) => setD(x => ({ ...x, class_geometry: { ...x.class_geometry, [cls]: { ...x.class_geometry[cls], ...patch } } }));
  const alert = (k: keyof ClubTracking['alerts'], v: number) => setD(x => ({ ...x, alerts: { ...x.alerts, [k]: v } }));
  const dirty = JSON.stringify(d) !== JSON.stringify(tracking) || rounding !== Number(tracking.rounding_m ?? 2);

  const save = async () => {
    setSaving(true); setMsg(null);
    const ok = await saveConfig(d.config_id, {
      scoring_mode: d.scoring_mode, visibility: d.visibility, public_delay_s: d.public_delay_s, accuracy_m: d.accuracy_m,
      class_geometry: d.class_geometry, alerts: d.alerts, rounding_threshold_m: rounding,
    });
    setSaving(false);
    setMsg(ok ? 'Saved.' : 'Couldn’t save. Check you’re a club admin and try again.');
    if (ok) onSaved();
  };

  return (
    <div className="flex max-w-[920px] flex-col gap-3">
      {ro && <p className="m-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[13px]" style={{ color: C.mute }}>Only club admins can change these. You can see them because you run races.</p>}
      <section aria-labelledby="s-score" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] px-4 py-2">
        <h3 id="s-score" className="m-0 pt-2 text-[15px] font-bold">Scoring</h3>
        <Field label="Finish order from tracking" hint="Off: tracking never touches results. Confirm: the scoring screen offers the order and the officer sends it. Automatic: it goes in as boats finish, and the officer can still change it.">
          <Seg label="Finish order from tracking" value={d.scoring_mode} onChange={v => !ro && set('scoring_mode', v)} options={[{ value: 'off', label: 'Off' }, { value: 'confirm', label: 'Officer confirms' }, { value: 'auto', label: 'Automatic' }]} />
        </Field>
        <Field label="System accuracy" hint="Crossings closer than this are flagged too close to call, at the start and the finish. Set it from your survey: most UWB set-ups hold 3–10 cm.">
          <Num label="System accuracy" value={Math.round(d.accuracy_m * 100)} step={1} min={1} max={50} unit="cm" disabled={ro} onChange={n => set('accuracy_m', n / 100)} />
        </Field>
        <Field label="Rounding zone" hint="How far from a mark a boat can pass and still count as rounding it.">
          <Num label="Rounding zone" value={rounding} step={0.5} min={0.5} max={20} unit="m" disabled={ro} onChange={setRounding} />
        </Field>
      </section>

      <section aria-labelledby="s-vis" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] px-4 py-2">
        <h3 id="s-vis" className="m-0 pt-2 text-[15px] font-bold">Who can watch</h3>
        <Field label="Live races" hint="Members: anyone in the club, in the app. Public: also a link anyone can open, a little behind live. Officers: only the people running the race.">
          <Seg label="Who can watch live races" value={d.visibility} onChange={v => !ro && set('visibility', v)} options={[{ value: 'officers', label: 'Officers' }, { value: 'members', label: 'Members' }, { value: 'public', label: 'Public' }]} />
        </Field>
        {d.visibility === 'public' && (
          <Field label="Public delay" hint="The public link runs this far behind, so nobody on the bank can relay positions to a skipper.">
            <Num label="Public delay" value={d.public_delay_s} min={0} max={300} unit="s" disabled={ro} onChange={n => set('public_delay_s', n)} />
          </Field>
        )}
      </section>

      <section aria-labelledby="s-geo" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
        <h3 id="s-geo" className="m-0 text-[15px] font-bold">Where the tag sits, by class</h3>
        <p className="m-0 mt-1 text-[12.5px]" style={{ color: C.mute }}>Measured from the tag to the bow, and the hull length. The system works out where the bow and stern are from these, so starts and finishes are judged on the hull, not the tag. A boat's own figures, in Kit, beat these.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: C.faint }}><th scope="col" className="py-1.5 font-bold">Class</th><th scope="col" className="py-1.5 font-bold">Tag to bow</th><th scope="col" className="py-1.5 font-bold">Hull length</th></tr></thead>
            <tbody>
              {Object.entries(d.class_geometry).map(([cls, g]) => (
                <tr key={cls} className="border-t border-white/[0.05]">
                  <th scope="row" className="py-2 text-left font-bold">{cls}</th>
                  <td className="py-2"><Num label={`${cls} tag to bow`} value={Math.round(g.bow * 100)} min={0} max={300} unit="cm" disabled={ro} onChange={n => geo(cls, { bow: n / 100 })} /></td>
                  <td className="py-2"><Num label={`${cls} hull length`} value={Math.round(g.length * 100)} min={10} max={400} unit="cm" disabled={ro} onChange={n => geo(cls, { length: n / 100 })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!ro && (
          <div className="mt-2 flex items-center gap-2">
            <input aria-label="New class" placeholder="Add a class" value={newClass} onChange={e => setNewClass(e.target.value)} className="h-9 w-[160px] rounded-[10px] border border-white/15 bg-white/[0.06] px-2 text-[14px] text-[#F1F4FA]" />
            <Btn small disabled={!newClass.trim() || !!d.class_geometry[newClass.trim()]} onClick={() => { geo(newClass.trim(), { bow: 0.5, length: 1.2 }); setNewClass(''); }}>Add</Btn>
          </div>
        )}
      </section>

      <section aria-labelledby="s-al" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] px-4 py-2">
        <h3 id="s-al" className="m-0 pt-2 text-[15px] font-bold">Alerts for the race officer</h3>
        <Field label="Boat stopped" hint="Barely moving for this long: aground, in the weed, or retired."><Num label="Stopped after" value={d.alerts.stopped_s} min={5} max={300} unit="s" disabled={ro} onChange={n => alert('stopped_s', n)} /></Field>
        <Field label="Tag lost" hint="No fix for this long."><Num label="Lost after" value={d.alerts.lost_s} min={1} max={120} unit="s" disabled={ro} onChange={n => alert('lost_s', n)} /></Field>
        <Field label="Close quarters" hint="Hulls this close count as an encounter: the replay keeps them, and a penalty turn is matched to them."><Num label="Close quarters" value={Math.round(d.alerts.close_m * 100)} min={5} max={200} unit="cm" disabled={ro} onChange={n => alert('close_m', n / 100)} /></Field>
        <Field label="Low battery" hint="Warn about a tag below this before the start."><Num label="Low battery" value={d.alerts.battery_pct} min={5} max={80} unit="%" disabled={ro} onChange={n => alert('battery_pct', n)} /></Field>
      </section>

      {tracking.can_run && (
        <section aria-labelledby="s-key" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
          <h3 id="s-key" className="m-0 text-[15px] font-bold">Coordinator key</h3>
          <p className="m-0 mt-1 text-[12.5px]" style={{ color: C.mute }}>The on-site coordinator sends positions with this key. Keep it on the coordinator only.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {key ? <code className="rounded-[10px] bg-white/[0.06] px-3 py-2 font-mono text-[13px]">{key}</code> : <Btn small onClick={() => void coordinatorKey(tracking.config_id).then(k => setKey(k ?? 'Not set'))}>Show the key</Btn>}
            {key && key !== 'Not set' && <Btn small onClick={() => void navigator.clipboard?.writeText(key)}>Copy</Btn>}
          </div>
        </section>
      )}

      {!ro && (dirty || msg) && (
        <div className="sticky bottom-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-[rgba(6,11,22,0.92)] px-4 py-3">
          <span className="text-[13px]" role="status" style={{ color: C.mute }}>{msg ?? (dirty ? 'Unsaved changes' : 'All saved')}</span>
          <Btn className="ml-auto" onClick={() => { setD(tracking); setRounding(Number(tracking.rounding_m ?? 2)); }} disabled={!dirty || saving}>Undo</Btn>
          <Btn primary onClick={() => void save()} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      )}
    </div>
  );
}

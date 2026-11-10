// The kit: anchors round the pond and the tags in the boats, with battery and when each was last
// heard from. Race officers set each tag's boat, sail number and where it sits in the hull.
import { useState } from 'react';
import { saveTag, type AnchorRow, type ClubTracking, type Kit, type TagRow } from './data';
import { Btn, C, Chip, cx } from '../race-simulator/ui';

const ONLINE_S = 90;
function seen(iso: string | null): { text: string; on: boolean } {
  if (!iso) return { text: 'Never', on: false };
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const on = s < ONLINE_S;
  if (s < 60) return { text: 'Just now', on };
  if (s < 3600) return { text: `${Math.round(s / 60)} min ago`, on };
  if (s < 86400) return { text: `${Math.round(s / 3600)} h ago`, on };
  return { text: new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), on };
}
function Battery({ pct, low }: { pct: number | null; low: number }) {
  if (pct == null) return <span style={{ color: C.faint }}>–</span>;
  const tone = pct < low ? '#F87171' : pct < low * 2 ? '#FFB224' : '#34D399';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[13px]">
      <span aria-hidden="true" className="relative h-[10px] w-[22px] rounded-[3px] border border-white/40"><span className="absolute inset-y-[1px] left-[1px] rounded-[1px]" style={{ width: `${Math.max(4, Math.min(100, pct)) * 0.18}px`, background: tone }} /></span>
      {pct}%
    </span>
  );
}

const inp = 'h-9 rounded-[10px] border border-white/15 bg-white/[0.06] px-2 text-[14px] text-[#F1F4FA] disabled:opacity-60';

function TagEditor({ tag, classes, canRun, onSaved }: { tag: TagRow; classes: string[]; canRun: boolean; onSaved: (t: TagRow) => void }) {
  const [d, setD] = useState(tag);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(tag);
  const num = (v: string) => (v === '' ? null : Number(v) / 100);
  const save = async () => {
    setBusy(true); setErr(false);
    const patch = { sail_number: d.sail_number, skipper_name: d.skipper_name, boat_class: d.boat_class, bow_offset_m: d.bow_offset_m, hull_length_m: d.hull_length_m, is_active: d.is_active, color: d.color };
    const ok = await saveTag(tag.id, patch);
    setBusy(false);
    if (ok) onSaved({ ...tag, ...patch }); else setErr(true);
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[100px_minmax(140px,1fr)_110px_96px_96px_auto]">
      <input className={inp} aria-label="Sail number" placeholder="Sail" value={d.sail_number ?? ''} disabled={!canRun} onChange={e => setD({ ...d, sail_number: e.target.value || null })} />
      <input className={inp} aria-label="Skipper" placeholder="Skipper" value={d.skipper_name ?? ''} disabled={!canRun} onChange={e => setD({ ...d, skipper_name: e.target.value || null })} />
      <select className={inp} aria-label="Class" value={d.boat_class ?? ''} disabled={!canRun} onChange={e => setD({ ...d, boat_class: e.target.value || null })}>
        <option value="">Class…</option>
        {classes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input className={inp} type="number" aria-label="Tag to bow, cm (blank uses the class figure)" placeholder="Bow cm" value={d.bow_offset_m != null ? Math.round(d.bow_offset_m * 100) : ''} disabled={!canRun} onChange={e => setD({ ...d, bow_offset_m: num(e.target.value) })} />
      <input className={inp} type="number" aria-label="Hull length, cm (blank uses the class figure)" placeholder="Hull cm" value={d.hull_length_m != null ? Math.round(d.hull_length_m * 100) : ''} disabled={!canRun} onChange={e => setD({ ...d, hull_length_m: num(e.target.value) })} />
      {canRun && <Btn small primary disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Saving…' : err ? 'Retry' : 'Save'}</Btn>}
    </div>
  );
}

export default function KitView({ kit, tracking, onChange }: { kit: Kit; tracking: ClubTracking; onChange: (k: Kit) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const low = tracking.alerts?.battery_pct ?? 20;
  const classes = Object.keys(tracking.class_geometry ?? {});
  const aOn = kit.anchors.filter(a => seen(a.last_seen_at).on).length;
  const tOn = kit.tags.filter(t => seen(t.last_seen_at).on).length;
  const lowTags = kit.tags.filter(t => t.is_active && t.battery_level != null && t.battery_level < low);
  const geo = (t: TagRow) => tracking.class_geometry?.[t.boat_class ?? ''];
  const roleName: Record<string, string> = { start_pin: 'Start pin', start_boat: 'Start boat end', finish_pin: 'Finish pin', finish_boat: 'Finish boat end', mark: 'Mark', gate: 'Gate', spreader: 'Spreader' };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {[
          ['Anchors heard', `${aOn} / ${kit.anchors.length}`, aOn < kit.anchors.length ? 'warn' : 'good'],
          ['Tags heard', `${tOn} / ${kit.tags.length}`, 'plain'],
          ['Low batteries', String(lowTags.length), lowTags.length ? 'warn' : 'good'],
        ].map(([k, v, tone]) => (
          <div key={k} className="min-w-[160px] flex-1 rounded-[18px] border border-white/[0.08] bg-[#0A0F1C] px-4 py-3">
            <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{k}</p>
            <p className={cx('m-0 font-mono text-[22px] font-semibold', tone === 'warn' ? 'text-[#FFB224]' : '')}>{v}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="k-a" className="overflow-x-auto rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
        <h3 id="k-a" className="m-0 text-[15px] font-bold">Anchors</h3>
        {!kit.anchors.length ? <p className="m-0 mt-2 text-[13px]" style={{ color: C.mute }}>No anchors yet. They're added when the system is installed.</p> : (
          <table className="mt-2 w-full min-w-[560px] border-collapse text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-[0.08em]" style={{ color: C.faint }}><th scope="col" className="py-1.5 font-bold">Anchor</th><th scope="col" className="py-1.5 font-bold">Role</th><th scope="col" className="py-1.5 text-right font-bold">Position</th><th scope="col" className="py-1.5 font-bold">&nbsp;Battery</th><th scope="col" className="py-1.5 font-bold">Last heard</th></tr></thead>
            <tbody>
              {kit.anchors.map((a: AnchorRow) => {
                const s = seen(a.last_seen_at);
                return (
                  <tr key={a.id} className="border-t border-white/[0.05]">
                    <th scope="row" className="py-2 text-left"><b>{a.name}</b> <span className="font-mono text-[12px]" style={{ color: C.faint }}>{a.anchor_id}</span></th>
                    <td className="py-2">{roleName[a.role] ?? a.role}</td>
                    <td className="py-2 text-right font-mono">{Number(a.position_x).toFixed(2)}, {Number(a.position_y).toFixed(2)}</td>
                    <td className="py-2">&nbsp;<Battery pct={a.battery_level} low={low} /></td>
                    <td className="py-2"><span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.on ? '#34D399' : 'rgba(255,255,255,.25)' }} />{s.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="k-t" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="k-t" className="m-0 text-[15px] font-bold">Tags</h3>
          <span className="text-[12.5px]" style={{ color: C.mute }}>Tap a tag to set its boat. Leave the bow and hull blank to use the class figures.</span>
        </div>
        {!kit.tags.length && <p className="m-0 mt-2 text-[13px]" style={{ color: C.mute }}>No tags registered yet.</p>}
        <ul className="m-0 mt-2 list-none p-0">
          {kit.tags.map(t => {
            const s = seen(t.last_seen_at), g = geo(t);
            const bow = t.bow_offset_m ?? g?.bow, len = t.hull_length_m ?? g?.length;
            return (
              <li key={t.id} className="border-t border-white/[0.05]">
                <button type="button" aria-expanded={open === t.id} onClick={() => setOpen(o => (o === t.id ? null : t.id))}
                  className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-0 bg-transparent px-1 py-2.5 text-left text-[13px] text-[#F1F4FA] sm:grid-cols-[auto_minmax(0,1fr)_150px_80px_110px]">
                  <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-extrabold text-[#060B16]" style={{ background: t.color ?? '#94A3B8' }}>{t.sail_number ?? '?'}</span>
                  <span className="min-w-0"><b className="block truncate">{t.skipper_name ?? 'Unassigned'}</b><span className="block truncate font-mono text-[12px]" style={{ color: C.faint }}>{t.tag_hardware_id}{t.boat_class ? ` · ${t.boat_class}` : ''}</span></span>
                  <span className="hidden text-[12.5px] sm:block" style={{ color: C.mute }}>{bow != null && len != null ? `Bow ${Math.round(bow * 100)} cm · hull ${Math.round(len * 100)} cm` : 'No class set'}</span>
                  <span className="hidden sm:block"><Battery pct={t.battery_level} low={low} /></span>
                  <span className="inline-flex items-center gap-1.5 justify-self-end"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.on ? '#34D399' : 'rgba(255,255,255,.25)' }} />{t.is_active ? s.text : <Chip>Off</Chip>}</span>
                </button>
                {open === t.id && (
                  <div className="pb-3 pl-1">
                    <TagEditor tag={t} classes={classes} canRun={tracking.can_run} onSaved={nt => onChange({ ...kit, tags: kit.tags.map(x => (x.id === nt.id ? nt : x)) })} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

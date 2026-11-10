// The course: lay it from the anchors. Pick the start and finish ends, the marks in order and which
// way each is rounded, and the wind. The plan shows it to scale; the checklist says whether tracking
// can score races on it.
import { useEffect, useMemo, useState } from 'react';
import { legLengths } from './core/analyse';
import { courseFrom, saveLayout, type AnchorRow, type ClubTracking, type Kit, type LayoutRow } from './data';
import { Btn, C, Chip, Seg, cx } from '../race-simulator/ui';

type Draft = Pick<LayoutRow, 'name' | 'course_type' | 'marks' | 'start_line' | 'finish_line' | 'wind_direction_deg' | 'is_default'> & { id?: string };
const blank = (): Draft => ({ name: 'New course', course_type: 'windward_leeward', marks: [], start_line: null, finish_line: null, wind_direction_deg: null, is_default: false });
const sel = 'h-9 rounded-[10px] border border-white/15 bg-white/[0.06] px-2 text-[14px] text-[#F1F4FA] disabled:opacity-60';

function Plan({ anchors, d }: { anchors: AnchorRow[]; d: Draft }) {
  const P = (a: AnchorRow) => ({ x: Number(a.position_x), y: Number(a.position_y) });
  const pts = anchors.map(P);
  if (!pts.length) return <p className="m-0 p-6 text-[13px]" style={{ color: C.mute }}>No anchors to lay a course with yet.</p>;
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  const span = Math.max(maxX - minX, maxY - minY, 10), pad = span * 0.12;
  const W = 600, H = 600, k = W / (span + pad * 2);
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
  const X = (x: number) => W / 2 + (x - cx0) * k, Y = (y: number) => H / 2 - (y - cy0) * k;
  const A = (id?: string) => anchors.find(a => a.id === id);
  const line = (l: Draft['start_line'], color: string, label: string) => {
    const p = A(l?.pin_anchor_id), b = A(l?.boat_anchor_id);
    if (!p || !b) return null;
    return <g><line x1={X(P(p).x)} y1={Y(P(p).y)} x2={X(P(b).x)} y2={Y(P(b).y)} stroke={color} strokeWidth={3} strokeDasharray="8 6" /><text x={(X(P(p).x) + X(P(b).x)) / 2} y={(Y(P(p).y) + Y(P(b).y)) / 2 - 8} textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{label}</text></g>;
  };
  const order = d.marks.map(m => A(m.anchor_id)).filter(Boolean) as AnchorRow[];
  const sMid = (() => { const p = A(d.start_line?.pin_anchor_id), b = A(d.start_line?.boat_anchor_id); return p && b ? { x: (P(p).x + P(b).x) / 2, y: (P(p).y + P(b).y) / 2 } : null; })();
  const fMid = (() => { const p = A(d.finish_line?.pin_anchor_id), b = A(d.finish_line?.boat_anchor_id); return p && b ? { x: (P(p).x + P(b).x) / 2, y: (P(p).y + P(b).y) / 2 } : sMid; })();
  const path = [sMid, ...order.map(P), fMid].filter(Boolean) as { x: number; y: number }[];
  const grid = Math.pow(10, Math.floor(Math.log10(span / 2)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Plan of the course laid on the anchors, to scale">
      <rect width={W} height={H} fill="#0A1A33" />
      {Array.from({ length: 40 }, (_, i) => Math.floor((minX - pad) / grid) * grid + i * grid).filter(x => X(x) >= 0 && X(x) <= W).map(x => <line key={`x${x}`} x1={X(x)} x2={X(x)} y1={0} y2={H} stroke="rgba(255,255,255,.05)" />)}
      {Array.from({ length: 40 }, (_, i) => Math.floor((minY - pad) / grid) * grid + i * grid).filter(y => Y(y) >= 0 && Y(y) <= H).map(y => <line key={`y${y}`} y1={Y(y)} y2={Y(y)} x1={0} x2={W} stroke="rgba(255,255,255,.05)" />)}
      {path.length > 1 && <polyline points={path.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')} fill="none" stroke="rgba(156,203,255,.45)" strokeWidth={2} />}
      {line(d.start_line, '#7DDC97', 'Start')}
      {d.finish_line && (d.finish_line.pin_anchor_id !== d.start_line?.pin_anchor_id || d.finish_line.boat_anchor_id !== d.start_line?.boat_anchor_id) && line(d.finish_line, '#F3B5FB', 'Finish')}
      {anchors.map(a => {
        const i = d.marks.findIndex(m => m.anchor_id === a.id), used = i >= 0;
        return (
          <g key={a.id}>
            <circle cx={X(P(a).x)} cy={Y(P(a).y)} r={used ? 11 : 7} fill={used ? '#FF9F43' : '#2A3B5C'} stroke="#fff" strokeWidth={used ? 2 : 1} />
            {used && <text x={X(P(a).x)} y={Y(P(a).y) + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#060B16">{i + 1}</text>}
            <text x={X(P(a).x) + 14} y={Y(P(a).y) - 10} fontSize="12" fill="rgba(235,240,255,.8)">{a.name}{used ? ` · ${d.marks[i].rounding === 'port' ? 'P' : 'S'}` : ''}</text>
          </g>
        );
      })}
      {d.wind_direction_deg != null && (
        <g transform={`translate(${W - 44} 44) rotate(${d.wind_direction_deg})`}>
          <circle r={26} fill="rgba(6,11,22,.8)" stroke="rgba(255,255,255,.2)" />
          <path d="M0 -18 V18 M-7 10 L0 18 L7 10" stroke="#9CCBFF" strokeWidth={2.5} fill="none" strokeLinecap="round" />
        </g>
      )}
      <g transform={`translate(16 ${H - 18})`}><line x1={0} x2={grid * k} y1={0} y2={0} stroke="#fff" strokeWidth={2} /><text x={grid * k + 6} y={4} fontSize="11" fill="rgba(235,240,255,.7)">{grid} m</text></g>
    </svg>
  );
}

export default function CourseView({ kit, tracking, onChange }: { kit: Kit; tracking: ClubTracking; onChange: (k: Kit) => void }) {
  const [id, setId] = useState<string | null>(kit.layouts.find(l => l.is_default)?.id ?? kit.layouts[0]?.id ?? null);
  const current = kit.layouts.find(l => l.id === id) ?? null;
  const [d, setD] = useState<Draft>(current ?? blank());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setD(current ?? blank()); setMsg(null); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const can = tracking.can_run;
  const ends = kit.anchors;
  const markable = kit.anchors.filter(a => ['mark', 'gate', 'spreader'].includes(a.role));
  const course = useMemo(() => courseFrom({ ...(current ?? { id: '', config_id: tracking.config_id, zones: [], course_distance_m: null }), ...d } as LayoutRow, kit.anchors), [d, current, kit.anchors, tracking.config_id]);
  const legs = course ? legLengths(course) : [];
  const assigned = kit.tags.filter(t => t.is_active && t.sail_number && t.boat_class).length;
  const checks = [
    { ok: !!course, text: 'Start line set on two anchors' },
    { ok: d.marks.length > 0, text: 'At least one mark, rounding side set' },
    { ok: assigned > 0, text: `Tags with a sail number and class (${assigned})` },
    { ok: tracking.scoring_mode !== 'off', text: tracking.scoring_mode === 'off' ? 'Finish order from tracking is off in Settings' : `Finish order: ${tracking.scoring_mode === 'auto' ? 'automatic' : 'officer confirms'}` },
  ];
  const ready = checks.every(c => c.ok);
  const move = (i: number, by: number) => setD(x => { const m = [...x.marks]; const [it] = m.splice(i, 1); m.splice(i + by, 0, it); return { ...x, marks: m }; });
  const setLine = (k: 'start_line' | 'finish_line', end: 'pin_anchor_id' | 'boat_anchor_id', v: string) =>
    setD(x => { const cur = x[k] ?? { pin_anchor_id: '', boat_anchor_id: '' }; const nx = { ...cur, [end]: v }; return { ...x, [k]: nx.pin_anchor_id || nx.boat_anchor_id ? nx : null }; });
  const save = async (asDefault = d.is_default) => {
    setBusy(true); setMsg(null);
    const row = await saveLayout({ ...(d.id ? { id: d.id } : {}), config_id: tracking.config_id, name: d.name.trim() || 'Course', course_type: d.course_type, marks: d.marks, start_line: d.start_line, finish_line: d.finish_line, wind_direction_deg: d.wind_direction_deg, is_default: asDefault, course_distance_m: legs.reduce((s, x) => s + x, 0) || null });
    if (row && asDefault) for (const l of kit.layouts) if (l.id !== row.id && l.is_default) await saveLayout({ id: l.id, config_id: l.config_id, name: l.name, is_default: false });
    setBusy(false);
    if (!row) { setMsg('Couldn’t save the course.'); return; }
    const layouts = [row, ...kit.layouts.filter(l => l.id !== row.id).map(l => (asDefault ? { ...l, is_default: false } : l))];
    onChange({ ...kit, layouts });
    setId(row.id); setD(row); setMsg('Saved.');
  };

  return (
    <div className="flex flex-wrap items-start gap-3">
      <section aria-label="Course plan" className="min-w-0 flex-[3_1_460px] overflow-hidden rounded-[22px] border border-white/[0.08]">
        <Plan anchors={kit.anchors} d={d} />
      </section>
      <div className="flex min-w-0 max-w-[480px] flex-[2_1_340px] flex-col gap-3">
        <section aria-labelledby="c-ready" className={cx('rounded-[20px] border p-4', ready ? 'border-[#34D399]/40 bg-[#34D399]/[0.06]' : 'border-white/[0.08] bg-[#0A0F1C]')}>
          <div className="flex items-center gap-2"><h3 id="c-ready" className="m-0 text-[15px] font-bold">Scoring from tracking</h3>{ready ? <Chip tone="good">Ready</Chip> : <Chip tone="warn">Not yet</Chip>}</div>
          <ul className="m-0 mt-2 list-none p-0">
            {checks.map(c => <li key={c.text} className="flex items-center gap-2 py-1 text-[13px]"><span aria-hidden="true" style={{ color: c.ok ? '#34D399' : '#FFB224' }}>{c.ok ? '✓' : '•'}</span><span style={{ color: c.ok ? undefined : C.mute }}>{c.text}</span></li>)}
          </ul>
        </section>

        <section aria-labelledby="c-edit" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="c-edit" className="m-0 text-[15px] font-bold">Course</h3>
            <select className={cx(sel, 'ml-auto max-w-[200px]')} aria-label="Course to edit" value={id ?? ''} onChange={e => setId(e.target.value || null)}>
              {kit.layouts.map(l => <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' (default)' : ''}</option>)}
              <option value="">New course…</option>
            </select>
          </div>
          <label className="mt-3 block text-[12.5px]" style={{ color: C.mute }}>Name
            <input className={cx(sel, 'mt-1 w-full')} value={d.name} disabled={!can} onChange={e => setD({ ...d, name: e.target.value })} />
          </label>
          {(['start_line', 'finish_line'] as const).map(k => (
            <fieldset key={k} className="m-0 mt-3 border-0 p-0">
              <legend className="mb-1 p-0 text-[12.5px]" style={{ color: C.mute }}>{k === 'start_line' ? 'Start line' : 'Finish line (blank: the start line)'}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['pin_anchor_id', 'boat_anchor_id'] as const).map(end => (
                  <select key={end} className={sel} aria-label={`${k === 'start_line' ? 'Start' : 'Finish'} ${end === 'pin_anchor_id' ? 'pin end' : 'boat end'}`} disabled={!can} value={d[k]?.[end] ?? ''} onChange={e => setLine(k, end, e.target.value)}>
                    <option value="">{end === 'pin_anchor_id' ? 'Pin end…' : 'Boat end…'}</option>
                    {ends.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="m-0 mb-1 mt-3 text-[12.5px]" style={{ color: C.mute }}>Marks, in the order sailed (two gate anchors in a row make a gate)</p>
          <ol className="m-0 list-none p-0">
            {d.marks.map((m, i) => {
              const a = kit.anchors.find(x => x.id === m.anchor_id);
              return (
                <li key={`${m.anchor_id}${i}`} className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] py-2 text-[13px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF9F43] text-[12px] font-extrabold text-[#060B16]">{i + 1}</span>
                  <b className="min-w-[60px] flex-1">{a?.name ?? 'Missing anchor'}</b>
                  <Seg size="sm" label={`Round mark ${i + 1}`} value={m.rounding} onChange={v => can && setD(x => ({ ...x, marks: x.marks.map((y, j) => (j === i ? { ...y, rounding: v } : y)) }))} options={[{ value: 'port', label: 'Port' }, { value: 'starboard', label: 'Stbd' }]} />
                  {can && <>
                    <Btn small icon aria-label="Earlier" disabled={i === 0} onClick={() => move(i, -1)}>↑</Btn>
                    <Btn small icon aria-label="Later" disabled={i === d.marks.length - 1} onClick={() => move(i, 1)}>↓</Btn>
                    <Btn small icon aria-label="Remove" onClick={() => setD(x => ({ ...x, marks: x.marks.filter((_, j) => j !== i) }))}>✕</Btn>
                  </>}
                </li>
              );
            })}
          </ol>
          {can && (
            <select className={cx(sel, 'mt-2 w-full')} aria-label="Add a mark" value="" onChange={e => e.target.value && setD(x => ({ ...x, marks: [...x.marks, { anchor_id: e.target.value, rounding: 'port' }] }))}>
              <option value="">Add a mark…</option>
              {markable.map(a => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
            </select>
          )}
          <label className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: C.mute }}>Wind from
            <input type="number" min={0} max={359} className={cx(sel, 'w-[84px] text-right font-mono')} disabled={!can} value={d.wind_direction_deg ?? ''} onChange={e => setD({ ...d, wind_direction_deg: e.target.value === '' ? null : ((Number(e.target.value) % 360) + 360) % 360 })} />
            ° on the plan (up is 0°). The live screens read the real wind from the fleet.
          </label>
          {legs.length > 0 && <p className="m-0 mt-3 text-[13px]" style={{ color: C.mute }}>Legs {legs.map(x => `${Math.round(x)} m`).join(' · ')} · {Math.round(legs.reduce((s, x) => s + x, 0))} m in all</p>}
          {can && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px]" role="status" style={{ color: C.mute }}>{msg}</span>
              <Btn className="ml-auto" disabled={busy || d.is_default} onClick={() => void save(true)}>Save as default</Btn>
              <Btn primary disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Btn>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

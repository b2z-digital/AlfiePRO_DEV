import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton, SubHeader, fmtDay } from '../ui';
import { ordinal } from './Home';
import { PeoplePicker } from './Chats';
import {
  MBoat, MRig, MRigCondition, RIG_FIELDS, WATER_LABEL, WIND_LABEL, Water, Wind,
  completeReminder, computeStats, createRig, loadBoats, loadCare, loadConditions, loadRaceLogs, loadRigs, logRace, saveCondition,
} from '../me';

const AddBoatModal = lazy(() => import('../../components/garage/AddBoatModal').then(m => ({ default: m.AddBoatModal })));

const HERO = 'linear-gradient(140deg,#0E4A3A,#1E9E6A 55%,#BFF3D6)';
const boatTitle = (b: MBoat) => b.name || `${b.type}${b.sail ? ` ${b.sail}` : ''}`;
const fmtVal = (v: any, unit: string) => (v === undefined || v === null || v === '' ? '—' : `${v}${unit === '°' ? '°' : unit ? ` ${unit}` : ''}`);

/* ─────────────── Boat shed list ─────────────── */

export const BoatShedScreen: React.FC = () => {
  const navigate = useNavigate();
  const { memberIds, light } = useMobile();
  const [boats, setBoats] = useState<MBoat[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = React.useCallback(() => { loadBoats(memberIds).then(setBoats).catch(() => setBoats([])); }, [memberIds]);
  useEffect(() => { if (memberIds.length) load(); else setBoats([]); }, [memberIds, load]);

  return (
    <div className="m-stack">
      <SubHeader title="Boat shed" right={memberIds.length > 0 ? <button className="m-pill-btn" onClick={() => setAdding(true)}><Icon name="plus" size={17} />Add boat</button> : undefined} />
      {boats === null ? <><Skeleton h={180} /><Skeleton h={180} /></> : boats.length === 0 ? (
        <div className="m-card m-empty">Add your boat to keep its rig settings, care and results in one place.</div>
      ) : boats.map(b => (
        <button key={b.id} className="m-card" style={{ overflow: 'hidden', padding: 0, textAlign: 'left', color: 'inherit' }} onClick={() => navigate(`/my-garage/${b.id}`)}>
          <span style={{ display: 'block', height: 140, background: b.image ? `center / cover no-repeat url("${b.image}")` : HERO }} />
          <span className="m-row" style={{ padding: 14 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="m-lb" style={{ display: 'block', color: light ? '#0F7A5A' : '#8FE7B4' }}>{b.type}{b.sail ? ` · Sail ${b.sail}` : ''}</span>
              <span className="m-disp m-ell" style={{ display: 'block', fontSize: 21, fontWeight: 700 }}>{boatTitle(b)}</span>
            </span>
            <span className="m-dim" style={{ fontSize: 13 }}>{b.rigCount} {b.rigCount === 1 ? 'rig' : 'rigs'}</span>
            <Icon name="chevron" className="m-dim" />
          </span>
        </button>
      ))}
      {adding && memberIds[0] && (
        <Suspense fallback={null}>
          <AddBoatModal darkMode={!light} memberId={memberIds[0]} onClose={() => setAdding(false)} onSuccess={() => { setAdding(false); load(); }} />
        </Suspense>
      )}
    </div>
  );
};

/* ─────────────── One boat ─────────────── */

type Tab = 'overview' | 'rig' | 'care' | 'performance';

export const BoatScreen: React.FC = () => {
  const { boatId = '' } = useParams();
  const navigate = useNavigate();
  const { memberIds, light } = useMobile();
  const [boat, setBoat] = useState<MBoat | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('rig');
  useEffect(() => {
    if (!memberIds.length) return;
    loadBoats(memberIds).then(list => setBoat(list.find(b => b.id === boatId) || null)).catch(() => setBoat(null));
  }, [memberIds, boatId]);

  if (boat === undefined) return <div className="m-stack"><Skeleton h={240} /><Skeleton h={300} /></div>;
  if (boat === null) return <div className="m-stack"><SubHeader title="Boat shed" /><div className="m-card m-empty">This boat isn't in your boat shed.</div></div>;

  return (
    <div className="m-stack">
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'calc(220px + var(--m-safe-top))', background: `linear-gradient(180deg, rgba(6,11,22,0) 30%, var(--m-bg)), ${boat.image ? `center / cover no-repeat url("${boat.image}")` : HERO}` }} />
      <header className="m-top" style={{ position: 'relative', justifyContent: 'space-between' }}>
        <button className="m-ibtn m-ibtn-d" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/my-garage'))}><Icon name="back" /></button>
      </header>
      <div style={{ height: 64 }} />
      <div style={{ position: 'relative' }}>
        <div className="m-lb" style={{ color: light ? '#0F7A5A' : '#8FE7B4' }}>{boat.type}{boat.sail ? ` · Sail ${boat.sail}` : ''}</div>
        <div className="m-disp" style={{ fontSize: 28, fontWeight: 700 }}>{boatTitle(boat)}</div>
      </div>
      <nav className="m-seg" aria-label="Boat sections">
        {(['overview', 'rig', 'care', 'performance'] as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'm-on' : ''} onClick={() => setTab(t)}>{t === 'overview' ? 'Overview' : t === 'rig' ? 'Rig' : t === 'care' ? 'Care' : 'Performance'}</button>
        ))}
      </nav>
      {tab === 'overview' && <Overview boat={boat} />}
      {tab === 'rig' && <RigTab boat={boat} />}
      {tab === 'care' && <CareTab boat={boat} />}
      {tab === 'performance' && <PerformanceTab boat={boat} />}
    </div>
  );
};

const Overview: React.FC<{ boat: MBoat }> = ({ boat }) => (
  <>
    <div className="m-card">
      <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Class</span><b style={{ fontWeight: 600 }}>{boat.type}</b></div>
      {boat.sail && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Sail number</span><b style={{ fontWeight: 600 }}>{boat.sail}</b></div>}
      {boat.hull && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Hull</span><b style={{ fontWeight: 600 }}>{boat.hull}</b></div>}
      {boat.design && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Design</span><b style={{ fontWeight: 600 }}>{boat.design}</b></div>}
      <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Rigs</span><b style={{ fontWeight: 600 }}>{boat.rigCount}</b></div>
    </div>
    {boat.description && <p className="m-mut" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{boat.description}</p>}
    {boat.tuningGuide && <a className="m-btn m-btn-g" href={boat.tuningGuide} target="_blank" rel="noreferrer"><Icon name="doc" />Tuning guide</a>}
  </>
);

/* Rig: pick the rig and the conditions, see and edit my settings, log a race, share */
const RigTab: React.FC<{ boat: MBoat }> = ({ boat }) => {
  const navigate = useNavigate();
  const { calendar, memberIds, profile, toast, tap } = useMobile();
  const [rigs, setRigs] = useState<MRig[] | null>(null);
  const [rigId, setRigId] = useState('');
  const [conds, setConds] = useState<MRigCondition[]>([]);
  const [wind, setWind] = useState<Wind>('medium');
  const [water, setWater] = useState<Water>('moderate');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [logging, setLogging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const reloadRigs = React.useCallback(async (select?: string) => {
    const list = await loadRigs(boat.id);
    setRigs(list);
    setRigId(id => select || (list.find(r => r.id === id) ? id : (list.find(r => r.isDefault) || list[0])?.id || ''));
  }, [boat.id]);
  useEffect(() => { reloadRigs().catch(() => setRigs([])); }, [reloadRigs]);
  const reloadConds = React.useCallback(() => {
    if (!rigId) { setConds([]); return; }
    loadConditions(rigId).then(c => { setConds(c); loadRaceLogs(c.map(x => x.id)).then(setLogs); }).catch(() => setConds([]));
  }, [rigId]);
  useEffect(() => { reloadConds(); }, [reloadConds]);

  const cond = conds.find(c => c.wind === wind && c.water === water);
  useEffect(() => { setEditing(false); setDraft(cond?.settings || {}); setNotes(cond?.notes || ''); }, [cond?.id, wind, water, rigId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addRig = async () => {
    const name = window.prompt('Name the rig (for example A rig)');
    if (!name?.trim()) return;
    try { const r = await createRig(boat.id, name.trim(), !(rigs || []).length); await reloadRigs(r.id); tap('success'); } catch { toast("Couldn't add the rig. Try again."); }
  };
  const save = async () => {
    if (!rigId) return;
    setBusy(true);
    try {
      const settings = { ...(cond?.settings || {}), ...draft, notes };
      await saveCondition(rigId, cond, wind, water, settings, notes);
      tap('success'); toast('Settings saved'); setEditing(false); reloadConds();
    } catch { toast("Couldn't save. Try again."); } finally { setBusy(false); }
  };

  const myName = `${profile.firstName} ${profile.lastName}`.trim();
  const recent = useMemo(() => computeStats(calendar, memberIds, myName, new Date().getFullYear(), boat.type).results.slice(0, 8), [calendar, memberIds, myName, boat.type]);
  const rig = (rigs || []).find(r => r.id === rigId);
  const shareText = () => {
    const lines = RIG_FIELDS.filter(f => cond?.settings?.[f.key] !== undefined && cond?.settings?.[f.key] !== 0).map(f => `${f.label}: ${fmtVal(cond!.settings[f.key], f.unit)}`);
    return `${boat.type} · ${rig?.name || 'Rig'} · ${WIND_LABEL[wind]} wind, ${WATER_LABEL[water].toLowerCase()} water\n${lines.join('\n')}${notes ? `\n${notes}` : ''}`;
  };

  if (rigs === null) return <Skeleton h={300} />;
  if (!rigs.length) {
    return (
      <div className="m-card m-empty">
        No rigs yet. Add your A rig to start recording settings.
        <div style={{ marginTop: 12 }}><button className="m-btn m-btn-p" onClick={addRig}><Icon name="plus" />Add a rig</button></div>
      </div>
    );
  }

  return (
    <>
      <div className="m-chips">
        {rigs.map(r => <button key={r.id} className={`m-chip ${r.id === rigId ? 'm-chip-on' : ''}`} onClick={() => setRigId(r.id)}>{r.name}</button>)}
        <button className="m-chip" onClick={addRig} aria-label="Add a rig"><Icon name="plus" size={16} /></button>
      </div>
      <div className="m-row" style={{ gap: 8 }}>
        <div className="m-seg" style={{ flex: 1 }}>
          {(['light', 'medium', 'strong'] as Wind[]).map(w => <button key={w} className={wind === w ? 'm-on' : ''} onClick={() => setWind(w)}><Icon name="wind" size={14} />{WIND_LABEL[w]}</button>)}
        </div>
        <label style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Water</span>
          <select value={water} onChange={e => setWater(e.target.value as Water)} className="m-chip" style={{ height: 40, appearance: 'none', paddingRight: 13 }}>
            {(['flat', 'moderate', 'rough'] as Water[]).map(w => <option key={w} value={w}>{WATER_LABEL[w]} water</option>)}
          </select>
        </label>
      </div>
      <div className="m-card" style={{ overflow: 'hidden' }}>
        <div className="m-li" style={{ background: 'var(--m-fill)', paddingTop: 10, paddingBottom: 10 }}>
          <span className="m-lb m-dim" style={{ flex: 1, fontSize: 10.5 }}>Setting</span>
          <span className="m-lb m-dim" style={{ fontSize: 10.5 }}>Mine</span>
        </div>
        {RIG_FIELDS.map(f => (
          <div key={f.key} className="m-li" style={{ paddingTop: 10, paddingBottom: 10 }}>
            <span className="m-mut" style={{ flex: 1, fontSize: 14 }}>{f.label}</span>
            {editing ? (
              <label className="m-row" style={{ gap: 6 }}>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{f.label}</span>
                <input inputMode="decimal" value={draft[f.key] ?? ''} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value === '' ? '' : Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) }))}
                  style={{ width: 76, height: 34, borderRadius: 9, border: '1px solid var(--m-fill-b)', background: 'var(--m-fill)', color: 'var(--m-ink)', textAlign: 'right', padding: '0 8px', font: 'inherit', fontSize: 15 }} />
                <span className="m-dim" style={{ width: 22, fontSize: 12 }}>{f.unit}</span>
              </label>
            ) : (
              <b className="m-num" style={{ fontWeight: 600, fontSize: 14 }}>{cond ? fmtVal(cond.settings[f.key], f.unit) : '—'}</b>
            )}
          </div>
        ))}
        {(editing || notes) && (
          <div className="m-li" style={{ alignItems: 'flex-start' }}>
            {editing
              ? <textarea className="m-textarea" style={{ minHeight: 60 }} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
              : <span className="m-mut" style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{notes}</span>}
          </div>
        )}
      </div>
      <div className="m-dim" style={{ fontSize: 12.5 }}>
        {cond ? `${rig?.name} · ${WIND_LABEL[wind].toLowerCase()} wind, ${WATER_LABEL[water].toLowerCase()} water. Same settings as the desktop Rig tuning tab.` : `Nothing saved for ${WIND_LABEL[wind].toLowerCase()} wind and ${WATER_LABEL[water].toLowerCase()} water yet.`}
      </div>
      {editing ? (
        <div className="m-row" style={{ gap: 8 }}>
          <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => { setEditing(false); setDraft(cond?.settings || {}); setNotes(cond?.notes || ''); }}>Cancel</button>
        </div>
      ) : (
        <>
          <div className="m-row" style={{ gap: 8 }}>
            <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={() => (cond ? setLogging(true) : toast('Save settings for these conditions first'))}>Log a race</button>
            <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => (cond ? setSharing(true) : toast('Save settings for these conditions first'))}>Share settings</button>
          </div>
          <button className="m-btn m-btn-g" onClick={() => setEditing(true)}><Icon name="edit" size={18} />{cond ? 'Edit settings' : 'Add settings'}</button>
        </>
      )}
      {logs.length > 0 && (
        <>
          <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Logged races</p>
          <div className="m-card">
            {logs.slice(0, 6).map((l: any) => (
              <div key={l.id} className="m-li">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="m-ell" style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{l.race_title}</span>
                  <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{l.race_date ? fmtDay(l.race_date.slice(0, 10), { day: 'numeric', month: 'short' }) : ''}{(() => { const c = conds.find(x => x.id === l.rig_condition_id); return c ? ` · ${WIND_LABEL[c.wind]} wind` : ''; })()}</span>
                </span>
                {l.performance_position && <span className="m-disp" style={{ fontWeight: 700 }}>{l.performance_position}{ordinal(l.performance_position)}</span>}
              </div>
            ))}
          </div>
        </>
      )}
      {logging && cond && (
        <>
          <div className="m-veil" onClick={() => setLogging(false)} />
          <div className="m-sheet" role="dialog" aria-label="Log a race">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700 }}>Log a race</div>
            <div className="m-mut" style={{ fontSize: 13.5, margin: '4px 0 12px' }}>With {rig?.name}, {WIND_LABEL[wind].toLowerCase()} wind, {WATER_LABEL[water].toLowerCase()} water.</div>
            {recent.length === 0 ? <div className="m-empty">Your {boat.type} results this year will show here.</div> : (
              <div className="m-card">
                {recent.map(r => (
                  <button key={r.item.key} className="m-li" onClick={async () => {
                    try {
                      await logRace(cond.id, { id: r.item.key, title: r.item.title, date: r.item.date, venue: r.item.venue, position: r.position, of: r.of, points: r.points });
                      tap('success'); toast('Race logged'); setLogging(false); reloadConds();
                    } catch { toast("Couldn't log that. Try again."); }
                  }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{r.item.title}</span>
                      <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{fmtDay(r.item.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    </span>
                    <span className="m-disp" style={{ fontWeight: 700 }}>{r.position}{ordinal(r.position)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {sharing && <PeoplePicker title="Share settings with" onClose={() => setSharing(false)} onPick={id => navigate(`/comms/chat/${id}?draft=${encodeURIComponent(shareText())}`)} />}
    </>
  );
};

const CareTab: React.FC<{ boat: MBoat }> = ({ boat }) => {
  const { toast, tap } = useMobile();
  const [care, setCare] = useState<{ reminders: any[]; logs: any[] } | null>(null);
  const load = React.useCallback(() => { loadCare(boat.id).then(setCare).catch(() => setCare({ reminders: [], logs: [] })); }, [boat.id]);
  useEffect(() => { load(); }, [load]);
  if (!care) return <Skeleton h={200} />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Coming up</p>
      {care.reminders.length === 0 ? <div className="m-card m-empty">No jobs due. Add reminders on the desktop Boat shed.</div> : (
        <div className="m-card">
          {care.reminders.map((r: any) => (
            <div key={r.id} className="m-li">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="m-ell" style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: r.due_date && r.due_date < today ? '#FF6B6B' : 'var(--m-dim)' }}>
                  {r.due_date ? `${r.due_date < today ? 'Overdue · ' : 'Due '}${fmtDay(r.due_date, { day: 'numeric', month: 'short' })}` : 'No date'}
                </span>
              </span>
              <button className="m-btn m-btn-g" style={{ height: 34 }} onClick={async () => {
                try { await completeReminder(r.id); tap('success'); toast('Marked done'); load(); } catch { toast("Couldn't save. Try again."); }
              }}><Icon name="check" size={16} />Done</button>
            </div>
          ))}
        </div>
      )}
      {care.logs.length > 0 && (
        <>
          <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Work done</p>
          <div className="m-card">
            {care.logs.map((l: any) => (
              <div key={l.id} className="m-li">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="m-ell" style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{l.title}</span>
                  <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{l.performed_date ? fmtDay(l.performed_date, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}{l.performed_by ? ` · ${l.performed_by}` : ''}</span>
                </span>
                {l.cost ? <b style={{ fontWeight: 600 }}>${Number(l.cost).toLocaleString('en-AU')}</b> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};

const PerformanceTab: React.FC<{ boat: MBoat }> = ({ boat }) => {
  const navigate = useNavigate();
  const { calendar, memberIds, profile } = useMobile();
  const s = useMemo(() => computeStats(calendar, memberIds, `${profile.firstName} ${profile.lastName}`.trim(), new Date().getFullYear(), boat.type), [calendar, memberIds, profile, boat.type]);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {[[s.races, 'races'], [s.wins, 'wins'], [s.avgFinish ?? '—', 'avg finish']].map(([v, l]) => (
          <div key={String(l)} className="m-card" style={{ padding: 12, textAlign: 'center' }}><div className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{v}</div><div className="m-dim" style={{ fontSize: 12 }}>{l}</div></div>
        ))}
      </div>
      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>{boat.type} results this year</p>
      {s.results.length === 0 ? <div className="m-card m-empty">No {boat.type} results this year yet.</div> : (
        <div className="m-card">
          {s.results.slice(0, 10).map(r => (
            <button key={r.item.key} className="m-li" onClick={() => navigate(`/calendar/event/${encodeURIComponent(r.item.key)}`)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{r.item.title}</span>
                <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{fmtDay(r.item.date, { weekday: 'short', day: 'numeric', month: 'short' })} · of {r.of}</span>
              </span>
              <span className="m-disp" style={{ fontWeight: 700 }}>{r.position}{ordinal(r.position)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
};

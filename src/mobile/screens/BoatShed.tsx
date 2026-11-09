import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton, SubHeader, fmtDay } from '../ui';
import { ordinal } from './Home';
import { PeoplePicker } from './Chats';
import {
  MBoat, MRig, MRigCondition, RIG_FIELDS, WATER_LABEL, WIND_LABEL, Water, Wind,
  RECURRENCE, addBoatImage, addReminder, addWorkLog, completeReminder, computeStats, createRig, loadBoatImages, loadBoatRaceLogs, loadBoats, loadCare, loadConditions, loadRaceLogs, loadRigs, logRace, saveCondition,
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
      <BoatPhotos boat={boat} />
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
  const [comparing, setComparing] = useState(false);

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
          <div className="m-row" style={{ gap: 8 }}>
            <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => setEditing(true)}><Icon name="edit" size={18} />{cond ? 'Edit settings' : 'Add settings'}</button>
            <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => setComparing(true)} disabled={!conds.length}><Icon name="copy" size={18} />Compare</button>
          </div>
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
      {comparing && rig && <RigCompare rig={rig} conds={conds} wind={wind} water={water} onClose={() => setComparing(false)} />}
      {sharing && <PeoplePicker title="Share settings with" onClose={() => setSharing(false)} onPick={id => navigate(`/comms/chat/${id}?draft=${encodeURIComponent(shareText())}`)} />}
    </>
  );
};

const CareTab: React.FC<{ boat: MBoat }> = ({ boat }) => {
  const { toast, tap } = useMobile();
  const [care, setCare] = useState<{ reminders: any[]; logs: any[] } | null>(null);
  const [adding, setAdding] = useState<'reminder' | 'log' | null>(null);
  const load = React.useCallback(() => { loadCare(boat.id).then(setCare).catch(() => setCare({ reminders: [], logs: [] })); }, [boat.id]);
  useEffect(() => { load(); }, [load]);
  if (!care) return <Skeleton h={200} />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Coming up</p>
      {care.reminders.length === 0 ? <div className="m-card m-empty">No jobs due. Add a reminder for the next one.</div> : (
        <div className="m-card">
          {care.reminders.map((r: any) => (
            <div key={r.id} className="m-li">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="m-ell" style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: r.due_date && r.due_date < today ? '#FF6B6B' : 'var(--m-dim)' }}>
                  {r.due_date ? `${r.due_date < today ? 'Overdue · ' : 'Due '}${fmtDay(r.due_date, { day: 'numeric', month: 'short' })}` : 'No date'}{r.recurrence && r.recurrence !== 'once' ? ` · ${(RECURRENCE.find(x => x[0] === r.recurrence) || [, r.recurrence])[1]}` : ''}
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
      <div className="m-row" style={{ gap: 8 }}>
        <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => setAdding('reminder')}><Icon name="bell" size={17} />Add reminder</button>
        <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => setAdding('log')}><Icon name="wrench" size={17} />Log work</button>
      </div>
      {adding && <CareSheet kind={adding} boat={boat} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); tap('success'); toast(adding === 'reminder' ? 'Reminder added' : 'Work logged'); load(); }} />}
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
      <ByRig boat={boat} />
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

/* ─────────────── Phase 2 board: photos, compare rig settings, care jobs, performance by rig ─────────────── */

const BoatPhotos: React.FC<{ boat: MBoat }> = ({ boat }) => {
  const { currentClub } = useAuth();
  const { toast, tap } = useMobile();
  const [imgs, setImgs] = useState<{ id: string; url: string }[] | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const load = React.useCallback(() => { loadBoatImages(boat.id).then(setImgs).catch(() => setImgs([])); }, [boat.id]);
  useEffect(() => { load(); }, [load]);
  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try { for (const f of files) await addBoatImage(boat.id, currentClub?.clubId, f); tap('success'); toast(files.length === 1 ? 'Photo added' : `${files.length} photos added`); load(); }
    catch { toast("Couldn't add the photo. Try again."); } finally { setBusy(false); }
  };
  const list = [...(boat.image ? [{ id: 'main', url: boat.image }] : []), ...(imgs || []).filter(i => i.url !== boat.image)];
  return (
    <>
      <div className="m-hscroll" style={{ gap: 8, position: 'relative' }}>
        {list.map(i => <button key={i.id} aria-label="Open photo" onClick={() => setView(i.url)} style={{ flex: '0 0 auto', width: 112, height: 80, borderRadius: 12, border: 0, background: `#10233F url("${i.url}") center / cover` }} />)}
        <button onClick={() => ref.current?.click()} disabled={busy} style={{ flex: '0 0 auto', width: 80, height: 80, borderRadius: 12, border: '1.5px dashed var(--m-fill-b)', background: 'var(--m-fill)', color: 'var(--m-mut)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11.5, fontWeight: 600 }}>
          <Icon name="camera" size={20} />{busy ? 'Adding…' : 'Add photo'}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={e => { void add(Array.from(e.target.files || [])); e.target.value = ''; }} />
      {view && (
        <div className="m-viewer" role="dialog" aria-label="Photo">
          <div className="m-row" style={{ padding: 'calc(var(--m-safe-top) + 8px) 16px 8px', color: '#fff' }}>
            <button className="m-ibtn m-ibtn-d" aria-label="Close" onClick={() => setView(null)}><Icon name="close" /></button>
            <span style={{ flex: 1, fontWeight: 600 }}>{boatTitle(boat)} · {list.findIndex(x => x.url === view) + 1} / {list.length}</span>
          </div>
          <img src={view} alt="" />
        </div>
      )}
    </>
  );
};

/** Board: "Compare rig settings": one rig's settings across wind ranges (or sea states) side by side. */
const RigCompare: React.FC<{ rig: MRig; conds: MRigCondition[]; wind: Wind; water: Water; onClose: () => void }> = ({ rig, conds, wind, water, onClose }) => {
  const [by, setBy] = useState<'wind' | 'water'>('wind');
  // Start on the conditions with the most saved settings if the ones on screen have none to compare
  const most = <T extends string>(vals: T[], pick: (c: MRigCondition) => T): T => vals.map(v => [v, conds.filter(c => pick(c) === v).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const [w, setW] = useState<Water>(() => (conds.filter(c => c.water === water).length > 1 ? water : most(['flat', 'moderate', 'rough'] as Water[], c => c.water)));
  const [wd, setWd] = useState<Wind>(() => (conds.filter(c => c.wind === wind).length > 1 ? wind : most(['light', 'medium', 'strong'] as Wind[], c => c.wind)));
  const cols = by === 'wind' ? (['light', 'medium', 'strong'] as Wind[]).map(k => ({ k, label: WIND_LABEL[k], c: conds.find(c => c.wind === k && c.water === w) }))
    : (['flat', 'moderate', 'rough'] as Water[]).map(k => ({ k, label: WATER_LABEL[k], c: conds.find(c => c.water === k && c.wind === wd) }));
  const rows = RIG_FIELDS.filter(f => cols.some(x => x.c && x.c.settings[f.key] !== undefined && x.c.settings[f.key] !== ''));
  const hi = by === 'wind' ? wind : water;
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Compare rig settings" style={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <span className="m-grab" />
        <div className="m-row" style={{ marginBottom: 10 }}>
          <div className="m-disp" style={{ flex: 1, fontSize: 20, fontWeight: 700 }}>Compare rig settings</div>
          <button className="m-ibtn" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <nav className="m-seg" aria-label="Compare by"><button className={by === 'wind' ? 'm-on' : ''} onClick={() => setBy('wind')}>Wind</button><button className={by === 'water' ? 'm-on' : ''} onClick={() => setBy('water')}>Sea state</button></nav>
        <div className="m-chips" style={{ margin: '10px 0' }}>
          {by === 'wind'
            ? (['flat', 'moderate', 'rough'] as Water[]).map(k => <button key={k} className={`m-chip ${w === k ? 'm-chip-on' : ''}`} onClick={() => setW(k)}>{WATER_LABEL[k]} water</button>)
            : (['light', 'medium', 'strong'] as Wind[]).map(k => <button key={k} className={`m-chip ${wd === k ? 'm-chip-on' : ''}`} onClick={() => setWd(k)}>{WIND_LABEL[k]} wind</button>)}
        </div>
        <div className="m-mut" style={{ fontSize: 13, marginBottom: 8 }}>{rig.name} · {by === 'wind' ? `${WATER_LABEL[w].toLowerCase()} water, by wind` : `${WIND_LABEL[wd].toLowerCase()} wind, by sea state`}</div>
        {rows.length === 0 ? <div className="m-card m-empty">No settings saved for these conditions yet.</div> : (
          <div className="m-card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr style={{ color: 'var(--m-dim)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Setting</th>
                {cols.map(x => <th key={x.k} style={{ padding: '9px 8px', background: x.k === hi ? 'rgba(10,132,255,.12)' : undefined }}>{x.label}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(f => (
                  <tr key={f.key} style={{ borderTop: '1px solid var(--m-line)' }}>
                    <td className="m-mut" style={{ padding: '9px 10px' }}>{f.label}</td>
                    {cols.map(x => <td key={x.k} style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 600, background: x.k === hi ? 'rgba(10,132,255,.08)' : undefined }}>{x.c ? fmtVal(x.c.settings[f.key], f.unit) : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-dim" style={{ fontSize: 12, margin: '8px 0 0' }}>Highlighted: the conditions you were looking at.</p>
      </div>
    </>
  );
};

const CareSheet: React.FC<{ kind: 'reminder' | 'log'; boat: MBoat; onClose: () => void; onSaved: () => void }> = ({ kind, boat, onClose, onSaved }) => {
  const { toast } = useMobile();
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(kind === 'log' ? today : '');
  const [repeat, setRepeat] = useState('once');
  const [cost, setCost] = useState('');
  const [by, setBy] = useState('');
  const [type, setType] = useState<'repair' | 'upgrade' | 'inspection' | 'cleaning' | 'other'>('repair');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      if (kind === 'reminder') await addReminder(boat.id, { title: title.trim(), due_date: date || null, recurrence: repeat });
      else await addWorkLog(boat.id, { title: title.trim(), cost: cost ? Number(cost) : null, performed_date: date || today, performed_by: by.trim(), type });
      onSaved();
    } catch { toast("Couldn't save that. Try again."); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label={kind === 'reminder' ? 'Add reminder' : 'Log work'}>
        <span className="m-grab" />
        <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 12 }}>{kind === 'reminder' ? 'Add reminder' : 'Log work'}</div>
        <label style={{ display: 'block' }}><span className="m-lb m-dim">{kind === 'reminder' ? 'What needs doing' : 'What was done'}</span>
          <input autoFocus className="m-field" value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'reminder' ? 'Replace the jib sheet' : 'New B rig main'} /></label>
        {kind === 'log' && (
          <div className="m-chips" style={{ marginTop: 10 }}>
            {(['repair', 'upgrade', 'inspection', 'cleaning', 'other'] as const).map(t => <button key={t} className={`m-chip ${type === t ? 'm-chip-on' : ''}`} onClick={() => setType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
          <label style={{ minWidth: 0 }}><span className="m-lb m-dim">{kind === 'reminder' ? 'Due' : 'Date'}</span><input type="date" className="m-field" value={date} onChange={e => setDate(e.target.value)} /></label>
          {kind === 'reminder'
            ? <label style={{ minWidth: 0 }}><span className="m-lb m-dim">Repeats</span><select className="m-field" value={repeat} onChange={e => setRepeat(e.target.value)}>{RECURRENCE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            : <label style={{ minWidth: 0 }}><span className="m-lb m-dim">Cost ($)</span><input inputMode="decimal" className="m-field" value={cost} onChange={e => setCost(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /></label>}
        </div>
        {kind === 'log' && <label style={{ display: 'block', marginTop: 10 }}><span className="m-lb m-dim">Done by</span><input className="m-field" value={by} onChange={e => setBy(e.target.value)} placeholder="Me, or the sailmaker" /></label>}
        <button className="m-btn m-btn-p" style={{ width: '100%', marginTop: 14 }} disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
};

/** Board: Performance › By rig: average finish of the races you logged on each rig, and where it went best. */
const ByRig: React.FC<{ boat: MBoat }> = ({ boat }) => {
  const [d, setD] = useState<Awaited<ReturnType<typeof loadBoatRaceLogs>> | null>(null);
  useEffect(() => { loadBoatRaceLogs(boat.id).then(setD).catch(() => setD(null)); }, [boat.id]);
  if (!d || !d.logs.length) return null;
  const condRig = new Map(d.conds.map(c => [c.id, c]));
  const by = d.rigs.map(r => {
    const logs = d.logs.filter((l: any) => condRig.get(l.rig_condition_id)?.rigId === r.id && l.performance_position);
    const avg = logs.length ? Math.round((logs.reduce((t: number, l: any) => t + l.performance_position, 0) / logs.length) * 10) / 10 : null;
    return { r, n: logs.length, avg };
  }).filter(x => x.n);
  // Best rig + wind combination with at least two logged races
  const combos = new Map<string, { rig: string; wind: Wind; sum: number; n: number }>();
  d.logs.forEach((l: any) => {
    const c = condRig.get(l.rig_condition_id); if (!c || !l.performance_position) return;
    const k = `${c.rigId}|${c.wind}`; const x = combos.get(k) || { rig: c.rigId, wind: c.wind, sum: 0, n: 0 };
    x.sum += l.performance_position; x.n++; combos.set(k, x);
  });
  const best = [...combos.values()].filter(x => x.n >= 2).sort((a, b) => a.sum / a.n - b.sum / b.n)[0];
  const min = Math.min(...by.map(x => x.avg || 99));
  return (
    <>
      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>By rig · from your race log</p>
      <div className="m-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {by.map(x => (
          <div key={x.r.id}>
            <div className="m-row" style={{ justifyContent: 'space-between', fontSize: 14 }}><b style={{ fontWeight: 600 }}>{x.r.name}</b><span><b className="m-disp">{x.avg}</b> <span className="m-dim" style={{ fontSize: 12 }}>avg · {x.n} race{x.n === 1 ? '' : 's'}</span></span></div>
            <span style={{ display: 'block', height: 6, borderRadius: 4, background: 'var(--m-bar)', marginTop: 6 }}><span style={{ display: 'block', height: '100%', borderRadius: 4, width: `${x.avg ? Math.max(8, (min / x.avg) * 100) : 0}%`, background: 'linear-gradient(90deg,#1E9E6A,#7FE0A8)' }} /></span>
          </div>
        ))}
        {best && <div className="m-mut" style={{ fontSize: 13 }}>Best in {WIND_LABEL[best.wind].toLowerCase()} wind on the {d.rigs.find(r => r.id === best.rig)?.name}: {Math.round((best.sum / best.n) * 10) / 10} average over {best.n} races.</div>}
      </div>
    </>
  );
};

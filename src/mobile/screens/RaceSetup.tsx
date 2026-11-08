import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { Skipper } from '../../types';
import type { HeatAssignment, HeatConfiguration, HeatDesignation, HeatManagement, SeedingMethod } from '../../types/heat';
import { getHeatDisplayLabel } from '../../types/heat';
import type { RaceEvent } from '../../types/race';
import { RaceDaySignOn, deleteSignOn, findSignOn, getSignOnSheet, localRaceDay, signOn } from '../../utils/raceSignOnStorage';
import { getStoredMembers } from '../../utils/storage';
import { DROP_RULE_OPTIONS, boatTypeMatchesClass, skipperFromMemberBoat } from '../../utils/raceSetup';
import { HeatSetupChoices, buildHeatSetup, heatManagementFromAssignments, seedFromImportedRankings } from '../../utils/heatSetup';
import { calculateOptimalHeats as optimalHMS } from '../../utils/hmsHeatSystem';
import { calculateOptimalHeats as optimalSHRS, estimateDiversityMetrics } from '../../utils/shrsHeatSystem';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton, SubHeader } from '../ui';
import { Toggle } from './FirstRun';
import { DeskItem } from '../raceDesk';
import { currentHeats, observerSettingsOf, racingStarted, saveRaceSettings, saveSkippers, useSetupEvent } from '../raceSetupData';

/* ─────────────── shared bits ─────────────── */

const subOf = (item: DeskItem) => [item.event.raceClass, item.roundName || item.title].filter(Boolean).join(' · ');

const SailBadge: React.FC<{ sail?: string; on?: boolean }> = ({ sail, on }) => (
  <span className={`m-sail ${on ? 'm-sail-on' : ''}`}>{sail || '–'}</span>
);

const Stepper: React.FC<{ value: number; min?: number; max?: number; step?: number; onChange: (n: number) => void; disabled?: boolean; label: string }> = ({ value, min = 0, max = 99, step = 1, onChange, disabled, label }) => (
  <span className="m-step" aria-label={label}>
    <button aria-label={`Less ${label}`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
    <b>{value}</b>
    <button aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
  </span>
);

const Locked: React.FC = () => <span className="m-pill" style={{ background: 'var(--m-fill)', color: 'var(--m-dim)' }}>Locked</span>;

const Loading: React.FC = () => (
  <div className="m-stack"><SubHeader title="" /><Skeleton h={120} /><Skeleton h={300} /></div>
);

const Missing: React.FC = () => (
  <div className="m-stack"><SubHeader title="" /><div className="m-card m-empty">This event isn't available.</div></div>
);

/** "DF65 · Mojo · 9:21": class, then the design unless it just repeats the class. */
const boatLine = (e: RaceEvent, s: Skipper, extra?: string) => {
  const design = s.hull || s.boatModel;
  return [e.raceClass, design && design !== e.raceClass ? design : '', extra].filter(Boolean).join(' · ');
};

const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[ap]m$/i, '') : '');

/* ─────────────── Sign on ─────────────── */

/** The race day: today while the event is on, otherwise its first day (desktop defaults to today). */
function raceDayFor(e: RaceEvent): string {
  const today = localRaceDay();
  const start = (e.date || '').slice(0, 10);
  const end = (e.endDate || e.date || '').slice(0, 10);
  return today >= start && today <= end ? today : start;
}

export const SignOnScreen: React.FC = () => {
  const { key = '' } = useParams();
  const { user, currentClub } = useAuth();
  const { toast, tap } = useMobile();
  const { item, event } = useSetupEvent(key);
  const [entries, setEntries] = useState<RaceDaySignOn[] | null>(null);
  const [q, setQ] = useState('');
  const [walkUp, setWalkUp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const day = event ? raceDayFor(event) : '';
  const load = React.useCallback(async () => { if (event) setEntries(await getSignOnSheet(event.id, day)); }, [event?.id, day]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  if (item === undefined || (item && !event)) return <Loading />;
  if (!item || !event) return <Missing />;
  const skippers = event.skippers || [];
  const list = entries || [];
  const clubId = currentClub?.clubId || event.clubId || '';

  const entryFor = (s: Skipper) => findSignOn(list, s);
  const walkUps = list.filter(x => !skippers.some(s => findSignOn([x], s)));
  const match = (name: string, sail?: string) => !q || name.toLowerCase().includes(q.toLowerCase()) || (sail || '').toLowerCase().includes(q.toLowerCase());
  const notYet = skippers.filter(s => !entryFor(s) && match(s.name, s.sailNo));
  const signed = skippers.filter(s => entryFor(s) && match(s.name, s.sailNo));
  const signedCount = skippers.filter(s => entryFor(s)).length;
  const toCome = skippers.length - signedCount;

  // Same entry as the desktop sheet's quick sign on (by an admin from the race desk)
  const signOnSkipper = async (s: Skipper) => {
    setBusy(s.name); tap();
    const r = await signOn({
      event_id: event.id, club_id: clubId, race_day: day,
      skipper_name: s.name, sail_number: s.sailNo || '', member_id: s.memberId || null,
      user_id: user?.id || null, signed_on_by: 'admin',
      emergency_contact_name: null, emergency_contact_phone: null, notes: null,
    });
    setBusy(null);
    if (!r.success) toast("Couldn't sign on. Try again."); else void load();
  };
  const undo = async (entry: RaceDaySignOn) => {
    setBusy(entry.id); tap();
    await deleteSignOn(entry.id);
    setBusy(null); void load();
  };
  const signOnAll = async () => {
    setBusy('all'); tap('medium');
    for (const s of skippers.filter(x => !entryFor(x))) {
      await signOn({
        event_id: event.id, club_id: clubId, race_day: day,
        skipper_name: s.name, sail_number: s.sailNo || '', member_id: s.memberId || null,
        user_id: user?.id || null, signed_on_by: 'admin',
        emergency_contact_name: null, emergency_contact_phone: null, notes: null,
      });
    }
    setBusy(null); tap('success'); void load();
  };

  const Row = ({ s, entry }: { s: Skipper; entry?: RaceDaySignOn }) => (
    <button className="m-li" onClick={() => (entry ? undo(entry) : signOnSkipper(s))} disabled={!!busy}>
      <SailBadge sail={s.sailNo} on={!!entry} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{s.name}</span>
        <span className="m-mut m-ell" style={{ display: 'block', fontSize: 12.5 }}>{boatLine(event, s, entry ? timeOf(entry.signed_on_at) : '')}</span>
      </span>
      {entry ? <span className="m-ok" style={{ width: 26, height: 26 }}><Icon name="check" size={15} strokeWidth={3} /></span> : <span className="m-todo" style={{ width: 26, height: 26 }} />}
    </button>
  );

  return (
    <div className="m-stack">
      <SubHeader sub={subOf(item)} title="Sign on" right={
        <button className="m-link" title="Hand a tablet over as a sign-on kiosk" onClick={() => window.open(`${window.location.origin}/sign-on/${encodeURIComponent(event.id)}`, '_blank')}>Kiosk</button>
      } />
      <div className="m-card m-row" style={{ padding: 16, gap: 14 }}>
        <span className="m-disp" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{entries ? signedCount : '–'}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{signedCount} of {skippers.length} signed on</span>
          <span className="m-mut" style={{ display: 'block', fontSize: 13 }}>{[walkUps.length ? `${walkUps.length} walk-up${walkUps.length > 1 ? 's' : ''}` : '', toCome ? `${toCome} still to come` : 'Everyone is here'].filter(Boolean).join(' · ')}</span>
          {day !== localRaceDay() && <span className="m-dim" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>For {new Date(day + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
        </span>
      </div>
      <div className="m-row" style={{ gap: 8 }}>
        <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={signOnAll} disabled={!!busy || toCome === 0}><Icon name="check" size={18} />{busy === 'all' ? 'Signing on…' : 'Sign on all'}</button>
        <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => setWalkUp(true)}><Icon name="plus" size={18} />Walk-up</button>
      </div>
      <label className="m-search"><Icon name="search" size={18} /><input value={q} onChange={ev => setQ(ev.target.value)} placeholder="Name or sail number" /></label>
      {entries === null ? <Skeleton h={200} /> : (
        <>
          {notYet.length > 0 && (
            <>
              <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Not signed on · {notYet.length}</p>
              <div className="m-card">{notYet.map(s => <Row key={s.name} s={s} />)}</div>
            </>
          )}
          {(signed.length > 0 || walkUps.length > 0) && (
            <>
              <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Signed on · {signed.length + walkUps.length}</p>
              <div className="m-card">
                {signed.map(s => <Row key={s.name} s={s} entry={entryFor(s)} />)}
                {walkUps.filter(w => match(w.skipper_name, w.sail_number)).map(w => (
                  <button key={w.id} className="m-li" onClick={() => undo(w)} disabled={!!busy}>
                    <SailBadge sail={w.sail_number} on />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="m-row" style={{ gap: 6 }}><span className="m-ell" style={{ fontWeight: 600, fontSize: 15 }}>{w.skipper_name}</span><span className="m-pill" style={{ background: 'rgba(255,159,10,.15)', color: 'var(--m-amber-ink)' }}>Walk-up</span></span>
                      <span className="m-mut m-ell" style={{ display: 'block', fontSize: 12.5 }}>{[event.raceClass, timeOf(w.signed_on_at)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="m-ok" style={{ width: 26, height: 26 }}><Icon name="check" size={15} strokeWidth={3} /></span>
                  </button>
                ))}
              </div>
            </>
          )}
          {skippers.length === 0 && walkUps.length === 0 && <div className="m-card m-empty">No skippers entered yet. Add them in Skippers, or sign on walk-ups.</div>}
          <p className="m-dim" style={{ fontSize: 12.5, textAlign: 'center', margin: '4px 0 0' }}>Tap a skipper to sign them on; tap again to undo.</p>
        </>
      )}
      {walkUp && <WalkUpSheet event={event} day={day} clubId={clubId} onClose={() => setWalkUp(false)} onDone={() => { setWalkUp(false); void load(); }} />}
    </div>
  );
};

const WalkUpSheet: React.FC<{ event: RaceEvent; day: string; clubId: string; onClose: () => void; onDone: () => void }> = ({ event, day, clubId, onClose, onDone }) => {
  const { user } = useAuth();
  const { toast, tap } = useMobile();
  const [name, setName] = useState('');
  const [sail, setSail] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  // Same entry as the desktop sheet's walk-up form
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const r = await signOn({
      event_id: event.id, club_id: clubId, race_day: day,
      skipper_name: name.trim(), sail_number: sail.trim(), member_id: null,
      user_id: user?.id || null, signed_on_by: 'admin',
      emergency_contact_name: contact.trim() || null, emergency_contact_phone: phone.trim() || null,
      notes: 'Walk-up entry',
    });
    setBusy(false);
    if (!r.success) { toast("Couldn't sign on. Try again."); return; }
    tap('success'); onDone();
  };
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Walk-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="m-grab" />
        <div className="m-row"><div className="m-disp" style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>Walk-up</div><button className="m-link" onClick={onClose}>Cancel</button></div>
        <div className="m-row" style={{ gap: 10 }}>
          <label className="m-fld" style={{ flex: 2 }}><span>Name</span><input className="m-field" value={name} onChange={e => setName(e.target.value)} autoFocus /></label>
          <label className="m-fld" style={{ flex: 1 }}><span>Sail no.</span><input className="m-field" value={sail} onChange={e => setSail(e.target.value)} inputMode="numeric" /></label>
        </div>
        <label className="m-fld"><span>Emergency contact <span className="m-dim" style={{ fontWeight: 400 }}>optional</span></span><input className="m-field" value={contact} onChange={e => setContact(e.target.value)} /></label>
        <label className="m-fld"><span>Contact phone <span className="m-dim" style={{ fontWeight: 400 }}>optional</span></span><input className="m-field" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" /></label>
        <button className="m-btn m-btn-p" style={{ height: 50 }} onClick={save} disabled={busy || !name.trim()}>{busy ? 'Signing on…' : 'Sign on'}</button>
      </div>
    </>
  );
};

/* ─────────────── Skippers ─────────────── */

export const SkippersScreen: React.FC = () => {
  const { key = '' } = useParams();
  const { toast, tap } = useMobile();
  const { item, event, setEvent } = useSetupEvent(key);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  if (item === undefined || (item && !event)) return <Loading />;
  if (!item || !event) return <Missing />;
  const skippers = event.skippers || [];
  const handicap = event.raceFormat === 'handicap';
  const locked = racingStarted(event);

  const save = async (next: Skipper[], msg?: string) => {
    setBusy(true);
    try {
      const hadHeats = !!currentHeats(event);
      const updated = await saveSkippers(event, next);
      setEvent(updated);
      tap('success');
      if (hadHeats && !currentHeats(updated)) toast('Skippers removed, so the heats were cleared. Seed them again in Heats.');
      else if (msg) toast(msg);
    } catch {
      toast("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="m-stack">
      <SubHeader sub={subOf(item)} title={`Skippers · ${skippers.length}`} right={
        !locked ? <button className="m-btn m-btn-p" style={{ height: 36, padding: '0 14px' }} onClick={() => setAdding(true)}><Icon name="plus" size={17} />Add</button> : undefined
      } />
      {skippers.length === 0 ? (
        <div className="m-card m-empty">No skippers yet. Add them from club members or by hand.</div>
      ) : (
        <div className="m-card">
          <div className="m-row m-lb m-dim" style={{ padding: '10px 14px 6px', gap: 12 }}>
            <span style={{ width: 44 }}>Sail</span><span style={{ flex: 1 }}>Skipper</span>{handicap && <span>Start hcap</span>}
          </div>
          {skippers.map((s, i) => (
            <button key={`${s.name}-${i}`} className="m-li" onClick={() => setEditing(i)} disabled={busy}>
              <SailBadge sail={s.sailNo} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{s.name}{s.withdrawnFromRace ? <span className="m-dim" style={{ fontWeight: 400 }}> · withdrawn</span> : ''}</span>
                <span className="m-mut m-ell" style={{ display: 'block', fontSize: 12.5 }}>{boatLine(event, s, !handicap ? s.club : '')}</span>
              </span>
              {handicap && (
                s.startHcap ? <span style={{ fontWeight: 700, fontSize: 16 }}>{s.startHcap}<span className="m-dim" style={{ fontWeight: 400, fontSize: 12 }}> s</span></span>
                  : <span className="m-pill" style={{ background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)' }}>Scratch</span>
              )}
            </button>
          ))}
        </div>
      )}
      {handicap && skippers.length > 0 && !locked && (
        <button className="m-btn m-btn-g" onClick={() => save(skippers.map(s => ({ ...s, startHcap: 0 })), 'Everyone starts off scratch')} disabled={busy}>All scratch</button>
      )}
      <p className="m-dim" style={{ fontSize: 12.5, textAlign: 'center', margin: 0 }}>
        {locked ? 'Racing has started: skippers and handicaps are managed while scoring.' : handicap ? 'Tap a skipper to change their handicap or withdraw them. Handicaps can be changed until the first race is scored.' : 'Tap a skipper to withdraw them from the event.'}
      </p>
      {editing !== null && skippers[editing] && (
        <SkipperSheet skipper={skippers[editing]} handicap={handicap} locked={locked} onClose={() => setEditing(null)}
          onSave={hcap => { const next = skippers.map((s, i) => (i === editing ? { ...s, startHcap: hcap } : s)); setEditing(null); void save(next); }}
          onRemove={() => { const next = skippers.filter((_, i) => i !== editing); setEditing(null); void save(next, 'Skipper withdrawn'); }} />
      )}
      {adding && <AddSkippersSheet event={event} onClose={() => setAdding(false)} onAdd={(added) => { setAdding(false); void save([...skippers, ...added], `${added.length} added`); }} />}
    </div>
  );
};

const SkipperSheet: React.FC<{ skipper: Skipper; handicap: boolean; locked: boolean; onClose: () => void; onSave: (hcap: number) => void; onRemove: () => void }> = ({ skipper, handicap, locked, onClose, onSave, onRemove }) => {
  const [hcap, setHcap] = useState(skipper.startHcap || 0);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label={skipper.name} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="m-grab" />
        <div className="m-row" style={{ gap: 12 }}>
          <SailBadge sail={skipper.sailNo} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-ell" style={{ fontWeight: 700, fontSize: 18 }}>{skipper.name}</div>
            <div className="m-mut" style={{ fontSize: 13 }}>{[skipper.hull || skipper.boatModel, skipper.club].filter(Boolean).join(' · ')}</div>
          </div>
          <button className="m-link" onClick={onClose}>Close</button>
        </div>
        {handicap && (
          <div className="m-card m-row" style={{ padding: '12px 14px' }}>
            <span style={{ flex: 1 }}><span style={{ display: 'block', fontWeight: 600 }}>Start handicap</span><span className="m-dim" style={{ fontSize: 12.5 }}>Seconds of head start. 0 is scratch.</span></span>
            <Stepper value={hcap} step={10} max={600} onChange={setHcap} disabled={locked} label="handicap" />
          </div>
        )}
        {handicap && !locked && <button className="m-btn m-btn-p" style={{ height: 50 }} onClick={() => onSave(hcap)} disabled={hcap === (skipper.startHcap || 0)}>Save handicap</button>}
        {!locked && (confirm
          ? <button className="m-btn" style={{ height: 50, background: 'rgba(255,59,48,.16)', color: 'var(--m-red-ink)' }} onClick={onRemove}>Withdraw {skipper.name.split(' ')[0]} from the event</button>
          : <button className="m-btn m-btn-g" style={{ color: 'var(--m-red-ink)' }} onClick={() => setConfirm(true)}>Withdraw…</button>)}
      </div>
    </>
  );
};

type MemberBoatRow = { key: string; member: any; boat: any; name: string };

const AddSkippersSheet: React.FC<{ event: RaceEvent; onClose: () => void; onAdd: (s: Skipper[]) => void }> = ({ event, onClose, onAdd }) => {
  const { currentClub } = useAuth();
  const { toast } = useMobile();
  const [tab, setTab] = useState<'members' | 'hand'>('members');
  const [rows, setRows] = useState<MemberBoatRow[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const used = useMemo(() => new Set((event.skippers || []).map(s => s.sailNo)), [event.skippers]);
  const handicap = event.raceFormat === 'handicap';
  const [m, setM] = useState({ name: '', sailNo: '', hull: '', club: currentClub?.club?.abbreviation || currentClub?.club?.name || '', startHcap: 0 });

  useEffect(() => {
    // The desktop skipper list: club members' boats of this class with sail number, design and club
    getStoredMembers().then(members => {
      const out: MemberBoatRow[] = [];
      for (const mem of members as any[]) {
        for (const b of mem.boats || []) {
          if (!boatTypeMatchesClass(b.boat_type, event.raceClass) || !b.sail_number || !b.hull || !mem.club) continue;
          if (used.has(b.sail_number)) continue;
          out.push({ key: b.id, member: mem, boat: b, name: `${mem.first_name} ${mem.last_name}` });
        }
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      setRows(out);
    }).catch(() => setRows([]));
  }, [event.raceClass, used]);

  const addPicked = () => {
    const chosen = (rows || []).filter(r => picked[r.key]);
    const seen = new Set(used);
    const out: Skipper[] = [];
    for (const r of chosen) {
      if (seen.has(r.boat.sail_number)) continue;
      seen.add(r.boat.sail_number);
      out.push(skipperFromMemberBoat(r.member, r.boat, r.member.avatar_url || undefined));
    }
    if (out.length) onAdd(out);
  };
  // Same checks as the desktop "add skipper by hand"
  const addByHand = () => {
    if (!m.name.trim() || !m.sailNo.trim() || !m.hull.trim() || !m.club.trim()) { toast('Name, sail number, design and club are all needed'); return; }
    const clash = (event.skippers || []).find(s => s.sailNo === m.sailNo.trim());
    if (clash) { toast(`Sail ${m.sailNo} is already ${clash.name}'s`); return; }
    if ((event.skippers || []).some(s => s.name.toLowerCase() === m.name.trim().toLowerCase())) { toast(`${m.name} is already entered`); return; }
    onAdd([{ name: m.name.trim(), sailNo: m.sailNo.trim(), hull: m.hull.trim(), club: m.club.trim(), boatModel: m.hull.trim(), startHcap: m.startHcap || 0, country_code: 'AU', country: 'Australia' } as any]);
  };
  const shown = (rows || []).filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()) || String(r.boat.sail_number).includes(q));
  const count = Object.values(picked).filter(Boolean).length;

  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Add skippers" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '86vh' }}>
        <span className="m-grab" />
        <div className="m-row"><div className="m-disp" style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>Add skippers</div><button className="m-link" onClick={onClose}>Cancel</button></div>
        <div className="m-seg">
          <button className={tab === 'members' ? 'm-on' : ''} onClick={() => setTab('members')}>Club members</button>
          <button className={tab === 'hand' ? 'm-on' : ''} onClick={() => setTab('hand')}>By hand</button>
        </div>
        {tab === 'members' ? (
          <>
            <label className="m-search"><Icon name="search" size={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name or sail number" /></label>
            <div className="m-card" style={{ overflowY: 'auto', minHeight: 120 }}>
              {rows === null ? <div className="m-empty">Loading members…</div> : shown.length === 0 ? <div className="m-empty">No members with a {event.raceClass} boat left to add. Members need a sail number, design and club on their boat.</div> : shown.map(r => (
                <button key={r.key} className="m-li" onClick={() => setPicked(p => ({ ...p, [r.key]: !p[r.key] }))}>
                  <SailBadge sail={r.boat.sail_number} on={!!picked[r.key]} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="m-ell" style={{ display: 'block', fontWeight: 600 }}>{r.name}</span>
                    <span className="m-mut m-ell" style={{ display: 'block', fontSize: 12.5 }}>{[r.boat.hull, handicap && r.boat.handicap ? `${r.boat.handicap} s` : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  {picked[r.key] ? <span className="m-ok" style={{ width: 24, height: 24 }}><Icon name="check" size={14} strokeWidth={3} /></span> : <span className="m-todo" style={{ width: 24, height: 24 }} />}
                </button>
              ))}
            </div>
            <button className="m-btn m-btn-p" style={{ height: 50 }} onClick={addPicked} disabled={!count}>{count ? `Add ${count}` : 'Choose skippers'}</button>
          </>
        ) : (
          <>
            <div className="m-row" style={{ gap: 10 }}>
              <label className="m-fld" style={{ flex: 2 }}><span>Name</span><input className="m-field" value={m.name} onChange={e => setM({ ...m, name: e.target.value })} /></label>
              <label className="m-fld" style={{ flex: 1 }}><span>Sail no.</span><input className="m-field" value={m.sailNo} onChange={e => setM({ ...m, sailNo: e.target.value })} inputMode="numeric" /></label>
            </div>
            <div className="m-row" style={{ gap: 10 }}>
              <label className="m-fld" style={{ flex: 1 }}><span>Design</span><input className="m-field" value={m.hull} onChange={e => setM({ ...m, hull: e.target.value })} placeholder="e.g. Britpop" /></label>
              <label className="m-fld" style={{ flex: 1 }}><span>Club</span><input className="m-field" value={m.club} onChange={e => setM({ ...m, club: e.target.value })} /></label>
            </div>
            {handicap && (
              <div className="m-row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>Start handicap</span><Stepper value={m.startHcap} step={10} max={600} onChange={n => setM({ ...m, startHcap: n })} label="handicap" /></div>
            )}
            <button className="m-btn m-btn-p" style={{ height: 50 }} onClick={addByHand}>Add skipper</button>
          </>
        )}
      </div>
    </>
  );
};

/* ─────────────── Heats ─────────────── */

const DEFAULT_CHOICES = (e: RaceEvent, hm: HeatManagement | null): HeatSetupChoices => {
  const n = e.skippers?.length || 0;
  const c = hm?.configuration;
  const system: 'hms' | 'shrs' = c?.scoringSystem === 'shrs' ? 'shrs' : c ? 'hms' : e.raceClass && n ? 'hms' : 'hms';
  const hmsDef = optimalHMS(n);
  const heats = c?.numberOfHeats || Math.max(2, system === 'hms' ? hmsDef.numberOfHeats : optimalSHRS(n));
  return {
    scoringSystem: system,
    shrsMode: c?.shrsAssignmentMode || 'preset',
    numberOfHeats: heats,
    promotionCount: c?.promotionCount || hmsDef.promotionCount || 4,
    seedingMethod: c?.seedingMethod || 'random',
    fleetManagementEnabled: c?.fleetManagementEnabled ?? true,
    heatLabelStyle: c?.heatLabelStyle || 'letters',
    heatOrder: c?.heatOrder || 'ascending',
    qualifyingRounds: c?.shrsQualifyingRounds || estimateDiversityMetrics(n, heats, 8).recommendedMinRounds || 8,
  };
};

const HEAT_COLOURS = ['#2E7BFF', '#8A4DFF', '#FF3E9A', '#FF8A2B', '#34C759', '#40C8C0'];

export const HeatsScreen: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { toast, tap } = useMobile();
  const { item, event, setEvent } = useSetupEvent(key);
  const [choices, setChoices] = useState<HeatSetupChoices | null>(null);
  const [draft, setDraft] = useState<HeatManagement | null>(null);
  const [unassigned, setUnassigned] = useState<number[]>([]);
  const [moving, setMoving] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const saved = event ? currentHeats(event) : null;
  useEffect(() => { if (event && !choices) setChoices(DEFAULT_CHOICES(event, currentHeats(event))); }, [event]); // eslint-disable-line react-hooks/exhaustive-deps

  if (item === undefined || (item && !event)) return <Loading />;
  if (!item || !event || !choices) return item === null ? <Missing /> : <Loading />;
  const skippers = event.skippers || [];
  const locked = racingStarted(event);
  const shown = draft || saved;
  const round1 = shown?.rounds?.[0];
  const config: HeatConfiguration | undefined = shown?.configuration;
  const system = (config?.scoringSystem || choices.scoringSystem) as 'hms' | 'shrs';

  // Seeding: the desktop wizard's own heat building, finished like its manual / ranking steps
  const seed = (method: SeedingMethod) => {
    tap();
    const c = { ...choices, seedingMethod: method };
    setChoices(c);
    const r = buildHeatSetup(skippers, c);
    if (r.pendingSeedingAction === 'ranking') {
      const s = seedFromImportedRankings(skippers, c.numberOfHeats);
      if ('error' in s) { toast(s.error); return; }
      if (!s.rankedCount) toast('No skippers have a national ranking, so they were spread evenly.');
      setDraft(heatManagementFromAssignments(r.heatManagement.configuration, s.assignments, s.rankedIndices));
      setUnassigned([]);
    } else if (r.pendingSeedingAction === 'manual') {
      setDraft(r.heatManagement);
      setUnassigned(skippers.map((_, i) => i));
    } else {
      setDraft(r.heatManagement);
      setUnassigned([]);
    }
  };

  // Moving a skipper turns the heats into hand-made ones (as the desktop manual assignment does)
  const moveTo = (to: HeatDesignation) => {
    if (moving === null || !shown || !round1) return;
    const assignments: HeatAssignment[] = round1.heatAssignments.map(a => ({
      heatDesignation: a.heatDesignation,
      skipperIndices: a.heatDesignation === to ? [...a.skipperIndices.filter(i => i !== moving), moving] : a.skipperIndices.filter(i => i !== moving),
    }));
    const left = unassigned.filter(i => i !== moving);
    setUnassigned(left);
    setDraft(left.length ? { ...shown, rounds: [{ ...round1, heatAssignments: assignments }, ...shown.rounds.slice(1)] } : heatManagementFromAssignments(shown.configuration, assignments));
    setMoving(null);
    tap();
  };

  const lock = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const updated = await saveRaceSettings(event, {
        numRaces: event.numRaces || 12,
        dropRules: draft.configuration.scoringSystem || 'hms',
        heatManagement: draft,
        observerSettings: observerSettingsOf(event),
      });
      setEvent(updated);
      setDraft(null);
      tap('success'); toast('Heats locked for race 1');
    } catch {
      toast("Couldn't save the heats. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sailsOrder = (i: number, n: number) => (system === 'hms' ? ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1 - i] : '');
  const howText = system === 'hms'
    ? `Race 1 seeds the heats, then they're re-sorted on results. In each race after that, the top ${config?.promotionCount || choices.promotionCount} of a lower heat promote and sail again; the bottom ${config?.promotionCount || choices.promotionCount} of each upper heat drop for the next race.`
    : (config?.shrsAssignmentMode || choices.shrsMode) === 'preset'
      ? `Qualifying heats are set for all ${config?.shrsQualifyingRounds || choices.qualifyingRounds} qualifying rounds so everyone meets as many skippers as possible, then the fleet splits into finals fleets.`
      : 'Each qualifying round re-sorts the heats on results, then the fleet splits into finals fleets.';

  return (
    <div className="m-stack">
      <SubHeader sub={`${subOf(item)}${shown ? ` · ${system.toUpperCase()}` : ''}`} title="Race 1 heats" />
      {locked && <div className="m-card m-row" style={{ padding: '12px 14px', gap: 10 }}><Icon name="clock" size={18} /><span className="m-mut" style={{ fontSize: 13.5 }}>Racing has started. Heat moves are made while scoring.</span></div>}
      {!locked && (
        <>
          {!saved && !draft && (
            <div className="m-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="m-seg">
                <button className={choices.scoringSystem === 'hms' ? 'm-on' : ''} onClick={() => { const h = Math.max(2, optimalHMS(skippers.length).numberOfHeats); setChoices({ ...choices, scoringSystem: 'hms', numberOfHeats: h, promotionCount: optimalHMS(skippers.length).promotionCount }); }}>HMS 2022</button>
                <button className={choices.scoringSystem === 'shrs' ? 'm-on' : ''} onClick={() => { const h = Math.max(2, optimalSHRS(skippers.length)); setChoices({ ...choices, scoringSystem: 'shrs', numberOfHeats: h, qualifyingRounds: estimateDiversityMetrics(skippers.length, h, 8).recommendedMinRounds }); }}>SHRS</button>
              </div>
              <div className="m-row"><span style={{ flex: 1, fontWeight: 600 }}>Heats</span><Stepper value={choices.numberOfHeats} min={2} max={system === 'hms' ? 6 : 5} onChange={n => setChoices({ ...choices, numberOfHeats: n })} label="heats" /></div>
              {choices.scoringSystem === 'hms' ? (
                <div className="m-row"><span style={{ flex: 1, fontWeight: 600 }}>Promote / relegate</span><Stepper value={choices.promotionCount} min={2} max={12} onChange={n => setChoices({ ...choices, promotionCount: n })} label="promotion" /></div>
              ) : (
                <>
                  <div className="m-seg">
                    <button className={choices.shrsMode === 'preset' ? 'm-on' : ''} onClick={() => setChoices({ ...choices, shrsMode: 'preset' })}>Pre-assigned</button>
                    <button className={choices.shrsMode === 'progressive' ? 'm-on' : ''} onClick={() => setChoices({ ...choices, shrsMode: 'progressive' })}>Progressive</button>
                  </div>
                  <div className="m-row"><span style={{ flex: 1, fontWeight: 600 }}>Qualifying rounds</span><Stepper value={choices.qualifyingRounds} min={1} max={event.numRaces || 16} onChange={n => setChoices({ ...choices, qualifyingRounds: n })} label="qualifying rounds" /></div>
                </>
              )}
              <span className="m-dim" style={{ fontSize: 12.5 }}>{skippers.length} skippers. Then choose how to seed race 1.</span>
            </div>
          )}
          <div className="m-seg" role="group" aria-label="Seeding">
            {(['random', 'ranking', 'manual'] as SeedingMethod[]).map(mth => (
              <button key={mth} className={(draft || saved) && (shown?.configuration.seedingMethod === mth || (mth === 'manual' && unassigned.length > 0)) ? 'm-on' : ''} onClick={() => seed(mth)} disabled={skippers.length < 2}>
                {mth === 'random' ? 'Random' : mth === 'ranking' ? 'Ranking' : 'Manual'}
              </button>
            ))}
          </div>
          {skippers.length < 2 && <div className="m-card m-empty">Add skippers before seeding heats.</div>}
        </>
      )}
      {shown && <p className="m-mut" style={{ fontSize: 13, margin: 0, lineHeight: 1.45 }}>{howText}</p>}
      {unassigned.length > 0 && (
        <div className="m-card" style={{ borderColor: 'rgba(255,159,10,.4)' }}>
          <div className="m-lb" style={{ padding: '12px 14px 4px', color: 'var(--m-amber-ink)' }}>Not in a heat · {unassigned.length} — tap to place</div>
          {unassigned.map(i => <HeatRow key={i} s={skippers[i]} onTap={() => setMoving(i)} />)}
        </div>
      )}
      {round1?.heatAssignments.map((a, i, all) => {
        const n = a.skipperIndices.length;
        const expanded = !!open[a.heatDesignation] || n <= 4 || (!locked && !!draft);
        const label = getHeatDisplayLabel(a.heatDesignation, config);
        return (
          <div key={a.heatDesignation} className="m-card">
            <div className="m-row" style={{ padding: '12px 14px', gap: 12 }}>
              <span className="m-heat" style={{ background: HEAT_COLOURS[i % HEAT_COLOURS.length] }}>{label}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 16 }}>Heat {label}</span>
                <span className="m-mut" style={{ fontSize: 12.5 }}>{n} boat{n === 1 ? '' : 's'}{sailsOrder(i, all.length) ? ` · sails ${sailsOrder(i, all.length)}` : ''}</span>
              </span>
            </div>
            {(expanded ? a.skipperIndices : a.skipperIndices.slice(0, 3)).map(si => (
              <HeatRow key={si} s={skippers[si]} onTap={!locked ? () => setMoving(si) : undefined} />
            ))}
            {!expanded && n > 3 && <button className="m-li m-mut" style={{ justifyContent: 'center', fontSize: 13.5 }} onClick={() => setOpen(o => ({ ...o, [a.heatDesignation]: true }))}>+ {n - 3} more</button>}
          </div>
        );
      })}
      {!locked && draft && (
        <button className="m-btn m-btn-p" style={{ height: 52, fontSize: 16 }} onClick={lock} disabled={busy || unassigned.length > 0}>
          <Icon name="check" size={18} />{busy ? 'Saving…' : unassigned.length ? `Place ${unassigned.length} more` : 'Lock heats for Race 1'}
        </button>
      )}
      {!locked && saved && !draft && <p className="m-dim" style={{ fontSize: 12.5, textAlign: 'center', margin: 0 }}>These heats are saved. Re-seed above, or tap a skipper to move them.</p>}
      {shown && <button className="m-btn m-btn-g" onClick={() => navigate(`/race-desk/event/${key}/settings`)}>Race settings</button>}
      {moving !== null && round1 && (
        <>
          <div className="m-veil" onClick={() => setMoving(null)} />
          <div className="m-sheet" role="dialog" aria-label="Move to heat" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="m-grab" />
            <div style={{ fontWeight: 700, fontSize: 18 }}>Move {skippers[moving]?.name} to</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, round1.heatAssignments.length)}, minmax(0, 1fr))`, gap: 8 }}>
              {round1.heatAssignments.map((a, i) => (
                <button key={a.heatDesignation} className="m-btn m-btn-g" style={{ height: 56, flexDirection: 'column', gap: 2 }} onClick={() => moveTo(a.heatDesignation)} disabled={a.skipperIndices.includes(moving)}>
                  <span style={{ fontWeight: 700, color: HEAT_COLOURS[i % HEAT_COLOURS.length] }}>Heat {getHeatDisplayLabel(a.heatDesignation, config)}</span>
                  <span className="m-dim" style={{ fontSize: 11.5 }}>{a.skipperIndices.length} boats</span>
                </button>
              ))}
            </div>
            <button className="m-link" style={{ alignSelf: 'center', padding: 10 }} onClick={() => setMoving(null)}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
};

const HeatRow: React.FC<{ s?: Skipper; onTap?: () => void }> = ({ s, onTap }) => {
  if (!s) return null;
  const body = (
    <>
      <SailBadge sail={s.sailNo} />
      <span className="m-ell" style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>{s.name}</span>
      {s.national_ranking ? <span className="m-dim" style={{ fontSize: 13 }}>#{s.national_ranking}</span> : null}
    </>
  );
  return onTap ? <button className="m-li" style={{ padding: '9px 14px' }} onClick={onTap}>{body}</button> : <div className="m-li" style={{ padding: '9px 14px' }}>{body}</div>;
};

/* ─────────────── Race settings ─────────────── */

const DROP_CHOICES = DROP_RULE_OPTIONS.filter(o => !o.forHeatRacing && o.value !== 'custom');
const dropsText = (rules: number[] | string | undefined) => {
  if (typeof rules === 'string') return rules === 'shrs' ? 'SHRS (1 after 4, 2 after 8, +1 per 8)' : rules === 'hms' ? 'HMS heat system' : rules;
  if (!rules || !rules.length) return 'No discards';
  return rules.slice(0, 4).join(', ') + (rules.length > 4 ? '…' : '');
};

export const RaceSettingsScreen: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { toast, tap } = useMobile();
  const { item, event, setEvent } = useSetupEvent(key);
  const [numRaces, setNumRaces] = useState(12);
  const [drops, setDrops] = useState<number[] | string>([4, 8, 16, 24, 32, 40]);
  const [custom, setCustom] = useState('');
  const [labels, setLabels] = useState<'letters' | 'numbers'>('letters');
  const [obs, setObs] = useState(observerSettingsOf({} as RaceEvent));
  const [pickDrops, setPickDrops] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!event || ready) return;
    setNumRaces(event.numRaces || 12);
    setDrops(event.dropRules || [4, 8, 16, 24, 32, 40]);
    setLabels(currentHeats(event)?.configuration.heatLabelStyle || 'letters');
    setObs(observerSettingsOf(event));
    setReady(true);
  }, [event, ready]);

  if (item === undefined || (item && !event)) return <Loading />;
  if (!item || !event) return <Missing />;
  const hm = currentHeats(event);
  const locked = racingStarted(event);
  const sys = hm?.configuration.scoringSystem === 'shrs' ? 'shrs' : hm ? 'hms' : null;

  const save = async () => {
    setBusy(true);
    try {
      const heatManagement = hm ? { ...hm, configuration: { ...hm.configuration, heatLabelStyle: labels } } : null;
      const updated = await saveRaceSettings(event, { numRaces, dropRules: drops, heatManagement, observerSettings: obs });
      setEvent(updated);
      tap('success'); toast('Race settings saved');
    } catch {
      toast("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="m-stack">
      <SubHeader sub={subOf(item)} title="Race settings" right={<button className="m-link" style={{ fontSize: 16, fontWeight: 700, padding: '0 6px' }} onClick={save} disabled={busy}>{busy ? 'Saving' : 'Save'}</button>} />
      <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Scoring</p>
      <div className="m-card">
        <div className="m-li"><span style={{ flex: 1 }}>System</span><span className="m-mut" style={{ marginRight: 8 }}>{event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'} · low point</span><Locked /></div>
        <div className="m-li"><span style={{ flex: 1 }}>Races</span><Stepper value={numRaces} min={1} max={40} onChange={setNumRaces} label="races" /></div>
        {sys ? (
          <div className="m-li"><span style={{ flex: 1 }}>Drop a race after</span><span className="m-mut" style={{ marginRight: 8 }}>{dropsText(drops)}</span><Locked /></div>
        ) : (
          <button className="m-li" onClick={() => setPickDrops(true)}><span style={{ flex: 1 }}>Drop a race after</span><span className="m-mut">{dropsText(drops)}</span><Icon name="chevron" size={16} className="m-dim" /></button>
        )}
      </div>
      {hm && (
        <>
          <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Heats</p>
          <div className="m-card">
            <div className="m-li"><span style={{ flex: 1 }}>Heat system</span><span className="m-mut" style={{ marginRight: 8 }}>{sys === 'shrs' ? `SHRS · ${hm.configuration.shrsAssignmentMode === 'progressive' ? 'progressive' : 'pre-assigned'}` : 'HMS 2022'}</span>{locked ? <Locked /> : null}</div>
            <div className="m-li"><span style={{ flex: 1 }}>Heats</span><span className="m-mut" style={{ marginRight: 8 }}>{hm.configuration.numberOfHeats}</span>{locked ? <Locked /> : null}</div>
            {sys === 'hms' && <div className="m-li"><span style={{ flex: 1 }}>Promote / relegate</span><span className="m-mut" style={{ marginRight: 8 }}>{hm.configuration.promotionCount} (Schedule {hm.configuration.promotionCount >= 6 ? 'C' : 'B'})</span>{locked ? <Locked /> : null}</div>}
            {sys === 'shrs' && hm.configuration.shrsQualifyingRounds && <div className="m-li"><span style={{ flex: 1 }}>Qualifying rounds</span><span className="m-mut" style={{ marginRight: 8 }}>{hm.configuration.shrsQualifyingRounds}</span>{locked ? <Locked /> : null}</div>}
            <div className="m-li"><span style={{ flex: 1 }}>Heat labels</span>
              <span className="m-seg">
                <button className={labels === 'letters' ? 'm-on' : ''} onClick={() => setLabels('letters')}>A, B, C</button>
                <button className={labels === 'numbers' ? 'm-on' : ''} onClick={() => setLabels('numbers')}>1, 2, 3</button>
              </span>
            </div>
            {!locked && <button className="m-li" style={{ color: 'var(--m-blue-ink)' }} onClick={() => navigate(`/race-desk/event/${key}/heats`)}><span style={{ flex: 1 }}>Change heats and seeding</span><Icon name="chevron" size={16} /></button>}
          </div>
        </>
      )}
      <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>On the day</p>
      <div className="m-card">
        <div className="m-li"><span style={{ flex: 1 }}>Roll call before each heat</span><Toggle on={!!obs.enable_roll_call} label="Roll call" onChange={v => setObs({ ...obs, enable_roll_call: v })} /></div>
        <div className="m-li"><span style={{ flex: 1 }}>Observers</span><Toggle on={!!obs.enable_observers} label="Observers" onChange={v => setObs({ ...obs, enable_observers: v })} /></div>
        {obs.enable_observers && <div className="m-li"><span style={{ flex: 1 }}>Observers per heat</span><Stepper value={obs.observers_per_heat || 2} min={1} max={6} onChange={n => setObs({ ...obs, observers_per_heat: n })} label="observers" /></div>}
        <div className="m-li"><span style={{ flex: 1 }}>Auto-complete sail numbers</span><Toggle on={!!obs.auto_complete_sail} label="Auto-complete sail numbers" onChange={v => setObs({ ...obs, auto_complete_sail: v })} /></div>
      </div>
      <p className="m-dim" style={{ fontSize: 12.5, textAlign: 'center', margin: 0 }}>The same settings as desktop. Anything that would change scored results locks once racing starts.</p>
      {pickDrops && (
        <>
          <div className="m-veil" onClick={() => setPickDrops(false)} />
          <div className="m-sheet" role="dialog" aria-label="Discards" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="m-grab" />
            <div style={{ fontWeight: 700, fontSize: 18 }}>Discards</div>
            <div className="m-card">
              {DROP_CHOICES.map(o => {
                const on = JSON.stringify(o.value) === JSON.stringify(drops);
                return (
                  <button key={o.label} className="m-li" onClick={() => { setDrops(o.value as number[]); setPickDrops(false); }}>
                    <span style={{ flex: 1, fontSize: 14 }}>{o.label}</span>{on && <Icon name="check" size={18} style={{ color: 'var(--m-blue-ink)' }} />}
                  </button>
                );
              })}
            </div>
            <label className="m-fld"><span>Custom: drop after races</span>
              <div className="m-row" style={{ gap: 8 }}>
                <input className="m-field" value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. 4, 8, 12" inputMode="numeric" />
                <button className="m-btn m-btn-g" style={{ marginTop: 4 }} onClick={() => {
                  const v = custom.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
                  if (!v.length) return;
                  setDrops(v); setPickDrops(false);
                }}>Use</button>
              </div>
            </label>
          </div>
        </>
      )}
    </div>
  );
};

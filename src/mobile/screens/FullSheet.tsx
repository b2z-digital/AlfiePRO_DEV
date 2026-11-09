/**
 * Race Management · The full sheet (board "Turn the phone for two-thumb finishing and the full
 * sheet"): every race and total, drops struck through, from the desktop results engine. Tap a
 * cell to correct it (the scoring screen's own cell edit); the totals redo themselves.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { heatManagementOf } from '../../utils/raceSetup';
import { updateMemberHandicapsFor } from '../../utils/scoringConfirm';
import { eventStandings } from '../data';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { startScoring, dropsLabel } from '../raceDesk';
import { useSetupEvent } from '../raceSetupData';
import { forScoring } from '../raceSession';
import { confirmsOnPhone, editCell, handicapSettingsFor, runOf, saveRun } from '../confirmRace';
import { sendOrKeep } from '../outbox';
import { useAllowLandscape, useLandscape } from '../orientation';
import { HEAT_COLOURS, Loading, Missing } from './RaceSetup';
import { OfflineBar } from './Sync';

const HEAT_PLUS = ['DNF', 'RET', 'NSC', 'OCS', 'DNS', 'DNC'];
const ENTRANTS_PLUS = ['DSQ', 'BFD', 'UFD', 'DNE', 'WDN'];
const COMMITTEE = ['RDG', 'DPI', 'ZFP', 'SCP'];

interface CellTarget { race: number; index: number; position: number | null; letter?: string; points?: number }

/** Correcting one cell: a place, or a letter score (committee scores need their points). */
const CellSheet: React.FC<{ target: CellTarget; name: string; sail: string; boats: number; taken: Map<number, string>; onSave: (position: number | null, letter?: string, points?: number) => void; onClose: () => void }> = ({ target, name, sail, boats, taken, onSave, onClose }) => {
  const [place, setPlace] = useState(target.position ? String(target.position) : '');
  const [letter, setLetter] = useState<string | undefined>(target.letter);
  const [points, setPoints] = useState(target.points && target.points > 0 ? String(target.points) : '');
  const n = parseInt(place, 10);
  const needsPoints = !!letter && COMMITTEE.includes(letter);
  const pts = parseFloat(points);
  const ok = letter ? (!needsPoints || (!isNaN(pts) && pts >= 0.1)) : (!isNaN(n) && n >= 1 && n <= boats);
  const clash = !letter && !isNaN(n) ? taken.get(n) : undefined;
  const chip = (c: string) => <button key={c} className={`m-ls ${letter === c ? 'm-ls-on' : ''}`} style={{ height: 44 }} aria-pressed={letter === c} onClick={() => { setLetter(letter === c ? undefined : c); }}><b>{c}</b></button>;
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label={`Correct ${sail} in race ${target.race}`}>
        <span className="m-grab" />
        <div className="m-row" style={{ gap: 12 }}>
          <span className="m-fc" style={{ width: 54 }}><b>{sail || '–'}</b></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{name}</div>
            <div className="m-dim" style={{ fontSize: 12.5 }}>Race {target.race} · now {target.letter || (target.position ? `${target.position}` : 'no result')}</div>
          </div>
        </div>
        <label className="m-fld" style={{ marginTop: 12 }}><span>Place</span>
          <input className="m-field" type="number" inputMode="numeric" min={1} max={boats} value={letter ? '' : place} disabled={!!letter} placeholder={letter ? letter : `1 to ${boats}`} onChange={e => setPlace(e.target.value)} style={{ fontSize: 22, textAlign: 'center' }} />
        </label>
        {clash && <div className="m-dim" style={{ fontSize: 12.5, marginTop: 6, color: 'var(--m-amber-ink)' }}>{clash} also has {n} in this race. Change theirs too if they swapped.</div>}
        <p className="m-lb m-dim" style={{ margin: '12px 0 7px' }}>Or a letter score</p>
        <div className="m-lsg">{[...HEAT_PLUS, ...ENTRANTS_PLUS, ...COMMITTEE].map(chip)}</div>
        {needsPoints && (
          <label className="m-fld" style={{ marginTop: 10 }}><span>Points</span>
            <input className="m-field" type="number" inputMode="decimal" min="0.1" step="0.1" value={points} onChange={e => setPoints(e.target.value)} placeholder="e.g. 3 or 2.5" style={{ textAlign: 'center' }} />
          </label>
        )}
        <div className="m-row" style={{ gap: 8, marginTop: 14 }}>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="m-btn m-btn-p" style={{ flex: 2 }} disabled={!ok} onClick={() => (letter ? onSave(COMMITTEE.includes(letter) ? (target.position ?? null) : null, letter, needsPoints ? pts : undefined) : onSave(n))}>Save</button>
        </div>
      </div>
    </>
  );
};

export const FullSheetScreen: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { tap, toast, memberIds } = useMobile();
  const { item, event, setEvent } = useSetupEvent(key);
  const [view, setView] = useState<'overall' | 'heat'>('overall');
  const [cell, setCell] = useState<CellTarget | null>(null);
  const [busy, setBusy] = useState(false);
  useAllowLandscape();
  const landscape = useLandscape();

  const ev = useMemo(() => (event ? forScoring(event) : null), [event]);
  const st = useMemo(() => (ev ? eventStandings(ev) : null), [ev]);
  if (item === undefined || (item && !event)) return <Loading />;
  if (!item || !event || !ev) return <Missing />;

  const hm = heatManagementOf(ev);
  const heats = !!hm?.configuration?.enabled;
  const canEdit = !heats && confirmsOnPhone(event);
  const raceCols = st ? [...st.races] : [];
  const planned = Math.max(raceCols.length, Math.min(ev.numRaces || 0, raceCols.length + 6));
  for (let r = (raceCols[raceCols.length - 1] || 0) + 1; raceCols.length < planned; r++) raceCols.push(r);
  const done = st?.races.length || 0;
  const skippers = ev.skippers || [];
  const isYou = (memberId?: string) => !!memberId && memberIds.includes(memberId);

  const heatCell = (i: number, race: number) => {
    const res = hm?.rounds.find(r => r.round === race)?.results.find(r => r.skipperIndex === i && r.round === race);
    return res ? { heat: res.heatDesignation as string, pos: res.letterScore || (res.position != null ? String(res.position) : '') } : null;
  };

  const open = (race: number, i: number) => {
    if (!canEdit) return;
    const r = (ev.raceResults || []).find((x: any) => x.race === race && x.skipperIndex === i) as any;
    setCell({ race, index: i, position: r?.position ?? null, letter: r?.letterScore || undefined, points: r?.customPoints });
  };
  const save = async (position: number | null, letter?: string, points?: number) => {
    if (!cell) return;
    setBusy(true);
    try {
      const settings = await handicapSettingsFor(event);
      const before = runOf(event);
      const { run, memberHandicapRace } = editCell(before, cell.race, cell.index, position, letter, points, settings);
      const sail = String(skippers[cell.index]?.sailNo || '');
      const r = await sendOrKeep({ eventId: event.id, kind: 'save', event, run, label: `Race ${cell.race} · ${sail} corrected to ${letter || position}` }, () => saveRun(event, run));
      if (!r.kept && memberHandicapRace !== undefined) void updateMemberHandicapsFor(before.skippers, memberHandicapRace, run.raceResults, settings.ruleset);
      setEvent(r.event);
      tap('success');
      toast(r.kept ? 'Saved on this phone; it sends when you have signal' : 'Corrected · totals updated');
      setCell(null);
    } catch {
      toast("Couldn't save the correction. Try again.");
    }
    setBusy(false);
  };
  const desktop = async () => { const err = await startScoring(event, currentClub?.clubId || event.clubId); if (err) toast(err); };

  const taken = new Map<number, string>();
  if (cell) for (const r of (ev.raceResults || []) as any[]) if (r.race === cell.race && r.skipperIndex !== cell.index && r.position && !r.letterScore) taken.set(r.position, skippers[r.skipperIndex]?.name || '');

  return (
    <div className="m-sheetx">
      <div className="m-row" style={{ gap: 8 }}>
        <button className="m-ibtn m-ibtn-s" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="m-disp" style={{ fontSize: 17, fontWeight: 700 }}>{item.title}</span>{' '}
          <span className="m-dim" style={{ fontSize: 12.5 }}>after {done} race{done === 1 ? '' : 's'} · {dropsLabel(event)}</span>
        </div>
        {heats && (
          <div className="m-seg" style={{ height: 36 }}>
            <button className={view === 'overall' ? 'm-on' : ''} onClick={() => setView('overall')}>Overall</button>
            <button className={view === 'heat' ? 'm-on' : ''} onClick={() => setView('heat')}>By heat</button>
          </div>
        )}
      </div>
      <OfflineBar />
      {!st ? <div className="m-card m-empty">No results yet. They appear here as races are confirmed.</div> : (
        <div className="m-sheetx-wrap">
          <table className="m-xt">
            <thead>
              <tr>
                <th>#</th><th className="m-xt-nm">Skipper</th><th>Sail</th>
                {raceCols.map(r => <th key={r}>R{r}</th>)}
                <th>Total</th><th>Nett</th>
              </tr>
            </thead>
            <tbody>
              {st.rows.map((row, k) => (
                <tr key={row.index} className={isYou(row.memberId) ? 'm-xt-you' : ''}>
                  <td><span>{k + 1}</span></td>
                  <td className="m-xt-nm"><span>{isYou(row.memberId) ? 'You' : row.name}</span></td>
                  <td><span className="m-dim">{row.sailNo}</span></td>
                  {raceCols.map(r => {
                    if (r > (st.races[st.races.length - 1] || 0)) return <td key={r}><span className="m-xt-future">–</span></td>;
                    if (view === 'heat') {
                      const h = heatCell(row.index, r);
                      return <td key={r}><span>{h ? <><i className="m-xt-heat" style={{ background: HEAT_COLOURS[(h.heat.charCodeAt(0) - 65) % HEAT_COLOURS.length] }}>{h.heat}</i>{h.pos}</> : '–'}</span></td>;
                    }
                    const c = st.cell(row.index, r);
                    const cls = st.isDropped(row.index, r) ? 'm-xt-drop' : /^[A-Z]/.test(c) ? 'm-xt-ls' : '';
                    return (
                      <td key={r}>
                        {canEdit
                          ? <button className={cls} aria-label={`${row.name}, race ${r}: ${c || 'no result'}. Correct`} onClick={() => open(r, row.index)}>{c || '–'}</button>
                          : <span className={cls}>{c || '–'}</span>}
                      </td>
                    );
                  })}
                  <td><span className="m-xt-tot">{row.grossLabel}</span></td>
                  <td><span className="m-xt-nett">{row.netLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="m-dim m-row" style={{ fontSize: 12, gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {canEdit ? 'Tap a result to correct it; the totals redo themselves.' : heats ? 'Heat results are corrected on the scoring sheet.' : 'Multi-day events are corrected on the scoring sheet.'}
        {!canEdit && <button className="m-link" style={{ fontSize: 12.5, padding: '2px 4px' }} onClick={() => void desktop()}>Open the scoring sheet</button>}
        {!landscape && <span>· Turn your phone to see more races.</span>}
      </div>
      {cell && (
        <CellSheet target={cell} name={skippers[cell.index]?.name || ''} sail={String(skippers[cell.index]?.sailNo || '')} boats={skippers.length} taken={taken}
          onClose={() => setCell(null)} onSave={(p, l, pts) => { if (!busy) void save(p, l, pts); }} />
      )}
    </div>
  );
};

export default FullSheetScreen;

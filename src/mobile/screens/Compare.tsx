/**
 * Compare skippers (phase 2 board, Racing › Results in depth): head to head for the season, one class
 * or all time, with the desktop's performance numbers side by side. Up to four skippers.
 * /compare?b=m:<memberId> (or a name); you are always first.
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, SubHeader } from '../ui';
import { everyoneIn, headToHead, parseRef, performanceOf, racesFor, refKey, type SkipperRef } from '../performance';

const COLOURS = ['#3D95FF', '#F5821F', '#A472F5', '#2FB765'];
const BARS = ['linear-gradient(90deg,#2E7BFF,#8A4DFF)', 'linear-gradient(90deg,#FF8A2B,#FF3E9A)', 'linear-gradient(90deg,#8A4DFF,#C49BFF)', 'linear-gradient(90deg,#1FAE5B,#5FD47F)'];

export const CompareScreen: React.FC = () => {
  const { calendar, memberIds, profile } = useMobile();
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState<string>('season');
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const myName = `${profile.firstName} ${profile.lastName}`.trim();
  const year = String(new Date().getFullYear());

  const scored = useMemo(() => calendar.filter(i => i.kind === 'race' && (i.event?.raceResults?.length || i.event?.dayResults) && i.event?.skippers?.length), [calendar]);
  const me: SkipperRef = useMemo(() => {
    for (const i of scored) {
      const s = (i.event?.skippers || []).find((x: any) => x.memberId && memberIds.includes(x.memberId));
      if (s) return { memberId: s.memberId, name: s.name };
    }
    return { memberId: memberIds[0], name: myName || 'You' };
  }, [scored, memberIds, myName]);

  const others = useMemo(() => (params.getAll('b').length ? params.getAll('b') : (params.get('b') || '').split(',')).filter(Boolean)
    .map(t => parseRef(t, scored)).filter(Boolean) as SkipperRef[], [params, scored]);
  const people = [me, ...others.filter(o => refKey(o) !== refKey(me))].slice(0, 4);

  const classes = useMemo(() => {
    const cs = new Map<string, number>();
    scored.forEach(i => { if (i.raceClass && racesFor([i], me).length) cs.set(i.raceClass, (cs.get(i.raceClass) || 0) + 1); });
    return [...cs.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 4);
  }, [scored, me]);

  const pool = useMemo(() => scored.filter(i => scope === 'all' ? true : scope === 'season' ? i.date.startsWith(year) : i.raceClass === scope), [scored, scope, year]);
  const stats = people.map(p => ({ p, s: performanceOf(racesFor(pool, p)) }));
  const h2h = people.length >= 2 ? headToHead(pool, people[0], people[1]) : null;

  const setOthers = (list: SkipperRef[]) => setParams({ b: list.map(refKey).join(',') }, { replace: true });
  const everyone = useMemo(() => everyoneIn(scored).filter(x => refKey(x) !== refKey(me)), [scored, me]);
  const found = everyone.filter(x => !q || x.name.toLowerCase().includes(q.toLowerCase()) || String(x.sailNo || '').includes(q)).slice(0, 40);

  type Metric = { label: string; get: (s: ReturnType<typeof performanceOf>) => number; fmt: (n: number) => string; lower?: boolean; zeroIsNone?: boolean };
  const metrics: Metric[] = [
    { label: 'Avg finish', get: s => s.avgFinish, fmt: n => (n ? String(n) : '–'), lower: true, zeroIsNone: true },
    { label: 'Race wins', get: s => s.wins, fmt: String },
    { label: 'Top 3', get: s => s.top3Finishes, fmt: String },
    { label: 'Consistency', get: s => s.consistencyScore, fmt: n => (n ? String(n) : '–'), lower: true, zeroIsNone: true },
    { label: 'DNF / DNS', get: s => s.dnfDnsPercentage, fmt: n => `${n}%`, lower: true },
    { label: 'Races', get: s => s.totalRaces, fmt: String },
  ];

  return (
    <div className="m-stack">
      <SubHeader title="Compare" />
      <div className="m-row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {people.map((p, i) => (
          <div key={refKey(p)} className="m-row" style={{ gap: 8, flex: people.length > 2 ? '1 1 40%' : 1, minWidth: 0, justifyContent: i === 1 && people.length === 2 ? 'flex-end' : undefined }}>
            {i === 1 && people.length === 2 && <span className="m-disp m-dim" style={{ fontSize: 16, marginRight: 'auto' }}>vs</span>}
            <span style={{ borderRadius: 999, padding: 2, background: COLOURS[i] }}><Avatar name={p.name} size={36} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="m-ell" style={{ fontWeight: 700, color: COLOURS[i] }}>{i === 0 ? 'You' : p.name}</div>
              {i > 0 && <button onClick={() => setOthers(others.filter(o => refKey(o) !== refKey(p)))} style={{ background: 'none', border: 0, padding: 0, color: 'var(--m-dim)', fontSize: 12 }}>Remove</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="m-chips">
        {[['season', 'This season'], ...classes.map(c => [c, c]), ['all', 'All time']].map(([id, label]) => (
          <button key={id} className={`m-chip ${scope === id ? 'm-chip-on' : ''}`} onClick={() => setScope(id)}>{label}</button>
        ))}
      </div>

      {people.length < 2 ? (
        <div className="m-card m-empty">Add a skipper to see how you compare.</div>
      ) : (
        <>
          {h2h && (
            <div className="m-card" style={{ padding: 16, textAlign: 'center' }}>
              <div className="m-lb m-dim">Head to head</div>
              <div className="m-disp" style={{ fontSize: 34, fontWeight: 700, marginTop: 4 }}>
                <span style={{ color: COLOURS[0] }}>{h2h.a}</span> <span className="m-dim" style={{ fontSize: 20 }}>–</span> <span style={{ color: COLOURS[1] }}>{h2h.b}</span>
              </div>
              <div className="m-mut" style={{ fontSize: 12.5 }}>
                {h2h.races ? `races you both sailed · ${h2h.a > h2h.b ? 'you\'re ahead' : h2h.b > h2h.a ? `${people[1].name.split(' ')[0]}'s ahead` : 'level'}` : 'You haven\'t raced each other here yet'}
              </div>
            </div>
          )}
          <div className="m-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {metrics.map(m => {
              const vals = stats.map(x => m.get(x.s));
              const max = Math.max(...vals, 1);
              // Only skippers with races here count; a zero average means no finishes, not a perfect score
              const usable = vals.filter((v, i) => stats[i].s.totalRaces > 0 && !(m.zeroIsNone && v === 0));
              const best = usable.length ? (m.lower ? Math.min(...usable) : Math.max(...usable)) : null;
              return (
                <div key={m.label}>
                  <div className="m-row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span className="m-dim">{m.label}</span>
                    <span className="m-row" style={{ gap: 12 }}>
                      {vals.map((v, i) => <b key={i} style={{ color: best != null && v === best && stats.filter((_, j) => vals[j] === best).length < stats.length ? COLOURS[i] : 'var(--m-ink)', minWidth: 28, textAlign: 'right' }}>{m.fmt(v)}</b>)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {vals.map((v, i) => {
                      // Lower is better for some numbers: the best gets the full bar, so longer always reads as better
                      const w = m.lower ? (m.zeroIsNone && !v ? 0 : best == null ? 0 : v === 0 ? 100 : Math.max(6, ((best || 1) / v) * 100)) : (v / max) * 100;
                      return <span key={i} style={{ height: 6, borderRadius: 4, background: 'var(--m-bar)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${w}%`, background: BARS[i], borderRadius: 4 }} /></span>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="m-dim" style={{ margin: 0, fontSize: 12 }}>Consistency is the spread of finishes (lower is steadier), worked out as on the desktop results page.</p>
        </>
      )}

      {people.length < 4 && <button className="m-btn m-btn-g" onClick={() => setPicking(true)}><Icon name="plus" size={18} />{people.length < 2 ? 'Choose a skipper' : 'Add another skipper'}</button>}

      {picking && (
        <>
          <div className="m-veil" onClick={() => setPicking(false)} />
          <div className="m-sheet" role="dialog" aria-label="Choose a skipper" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <span className="m-grab" />
            <label className="m-search"><Icon name="search" size={18} /><input autoFocus placeholder="Name or sail number" value={q} onChange={e => setQ(e.target.value)} /></label>
            <div style={{ overflowY: 'auto', marginTop: 10 }}>
              {found.length === 0 ? <div className="m-empty">Nobody by that name in your results.</div> : found.map(x => (
                <button key={refKey(x)} className="m-li" style={{ width: '100%' }} disabled={people.some(p => refKey(p) === refKey(x))}
                  onClick={() => { setOthers([...others, x]); setPicking(false); setQ(''); }}>
                  <Avatar name={x.name} size={34} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><span style={{ fontWeight: 600 }}>{x.name}</span><br /><span className="m-dim" style={{ fontSize: 12 }}>{[x.raceClass, x.sailNo, `${x.events} event${x.events === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span></span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CompareScreen;

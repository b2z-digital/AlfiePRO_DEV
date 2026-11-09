import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, SubHeader } from '../ui';
import { ordinal } from './Home';
import { computeStats } from '../me';
import { askAlfie } from '../ask';
import { performanceOf, racesFor, type RaceRow, type SkipperRef } from '../performance';

/** Average finish by month: lower is better, so the line rises as you improve. */
const TrendChart: React.FC<{ months: { label: string; avg: number }[] }> = ({ months }) => {
  const W = 320, H = 130, top = 20, bottom = 100, left = 30, right = 300;
  const max = Math.max(...months.map(m => m.avg), 2);
  const min = Math.min(...months.map(m => m.avg), 1);
  const lo = Math.max(1, Math.floor(min)), hi = Math.max(lo + 1, Math.ceil(max));
  const y = (v: number) => top + ((v - lo) / (hi - lo)) * (bottom - top);
  const x = (i: number) => (months.length === 1 ? (left + right) / 2 : left + (i * (right - left)) / (months.length - 1));
  const pts = months.map((m, i) => `${x(i)},${y(m.avg)}`).join(' ');
  const every = Math.ceil(months.length / 6);
  const sfx = (n: number) => `${n}${ordinal(n)}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" style={{ marginTop: 8 }}
      aria-label={`Average finish by month: ${months.map(m => `${m.label} ${m.avg}`).join(', ')}`}>
      {[top, (top + bottom) / 2, bottom].map(v => <line key={v} x1="0" y1={v} x2={W} y2={v} stroke="var(--m-line)" />)}
      <text x="0" y={top - 4} fill="var(--m-dim)" fontSize="10">{sfx(lo)}</text>
      <text x="0" y={bottom - 4} fill="var(--m-dim)" fontSize="10">{sfx(hi)}</text>
      {months.length > 1 && <polyline points={pts} fill="none" stroke="var(--m-blue-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {months.length > 0 && <circle cx={x(months.length - 1)} cy={y(months[months.length - 1].avg)} r="4" fill="var(--m-blue-ink)" />}
      {months.map((m, i) => (i % every === 0 || i === months.length - 1) && (
        <text key={m.label + i} x={x(i)} y={H - 8} fill="var(--m-dim)" fontSize="10" textAnchor="middle">{m.label}</text>
      ))}
    </svg>
  );
};

type View = 'overview' | 'classes' | 'venues' | 'insights';
type Level = 'any' | 'club' | 'state' | 'national';

const one = (n: number) => Math.round(n * 10) / 10;
const avgOf = (rows: RaceRow[]) => { const p = rows.filter(r => r.position != null && !r.letterScore).map(r => r.position!); return p.length ? one(p.reduce((a, b) => a + b, 0) / p.length) : null; };

/**
 * My stats (phase 2 board, Me › My stats in depth): Overview, Classes, Venues and Insights,
 * for this season or all time, club / state / national. Race numbers use the desktop's
 * performance calculation (utils/skipperPerformance) over every race you have a result in.
 */
export const StatsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { calendar, memberIds, profile } = useMobile();
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const thisYear = new Date().getFullYear();
  const [view, setView] = useState<View>('overview');
  const [allTime, setAllTime] = useState(false);
  const [level, setLevel] = useState<Level>('any');

  const me: SkipperRef = useMemo(() => {
    for (const i of calendar) {
      const sk = (i.event?.skippers || []).find((x: any) => x.memberId && memberIds.includes(x.memberId));
      if (sk) return { memberId: sk.memberId, name: sk.name };
    }
    return { memberId: memberIds[0], name };
  }, [calendar, memberIds, name]);

  const pool = useMemo(() => calendar.filter(i => i.kind === 'race' && (allTime || i.date.startsWith(String(thisYear))) && (level === 'any' || i.level === level)), [calendar, allTime, level, thisYear]);
  const rows = useMemo(() => racesFor(pool, me).sort((a, b) => a.item.date.localeCompare(b.item.date) || a.race - b.race), [pool, me]);
  const perf = useMemo(() => performanceOf(rows), [rows]);
  const s = useMemo(() => computeStats(pool, memberIds, name, allTime ? null : thisYear), [pool, memberIds, name, allTime, thisYear]);
  const events = new Set(rows.map(r => r.item.key)).size;
  const pct = (n: number) => (perf.totalRaces ? Math.round((n / perf.totalRaces) * 100) : 0);

  // Previous season's average for the ▲/▼ beside this season's
  const lastYearAvg = useMemo(() => (allTime ? null : avgOf(racesFor(calendar.filter(i => i.kind === 'race' && i.date.startsWith(String(thisYear - 1)) && (level === 'any' || i.level === level)), me))), [calendar, allTime, level, me, thisYear]);

  const trend = useMemo(() => {
    const m = s.months;
    if (m.length < 4) return null;
    const recent = m.slice(-3), before = m.slice(-6, -3);
    if (!before.length) return null;
    const a = recent.reduce((t, x) => t + x.avg, 0) / recent.length;
    const b = before.reduce((t, x) => t + x.avg, 0) / before.length;
    if (Math.abs(a - b) < 0.3) return { text: 'Holding steady', good: true };
    return a < b ? { text: 'Improving', good: true } : { text: 'Slipping', good: false };
  }, [s.months]);
  const bestMonth = s.months.length ? [...s.months].sort((a, b) => a.avg - b.avg)[0] : null;

  // Where you finish: 1st … 9th, 10th+
  const spread = useMemo(() => {
    const b = Array.from({ length: 10 }, () => 0);
    perf.positionHistory.forEach(p => { b[Math.min(p, 10) - 1]++; });
    return b;
  }, [perf.positionHistory]);

  const groupBy = (key: (r: RaceRow) => string | undefined) => {
    const m = new Map<string, RaceRow[]>();
    rows.forEach(r => { const k = key(r); if (!k) return; m.set(k, [...(m.get(k) || []), r]); });
    return [...m.entries()].map(([k, list]) => ({ k, list, p: performanceOf(list) })).filter(x => x.p.totalRaces > 0).sort((a, b) => b.p.totalRaces - a.p.totalRaces);
  };
  const byClass = useMemo(() => groupBy(r => r.item.raceClass), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const byVenue = useMemo(() => groupBy(r => r.item.venue || undefined), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const strongest = byClass.filter(x => x.p.racesCompleted >= 5).sort((a, b) => (a.p.avgFinish || 99) - (b.p.avgFinish || 99))[0];

  const insights = useMemo(() => {
    const out: { title: string; body: string; ask: string }[] = [];
    const placed = rows.filter(r => r.position != null && !r.letterScore);
    if (placed.length >= 20) {
      const last = placed.slice(-30), before = placed.slice(-60, -30);
      const a = avgOf(last), b = before.length >= 10 ? avgOf(before) : null;
      if (a != null && b != null && a < b - 0.3) out.push({ title: 'Your best form lately', body: `Average finish ${a} over your last ${last.length} races, down from ${b} in the ${before.length} before.`, ask: 'Why has my form improved lately?' });
      else if (a != null && b != null && a > b + 0.3) out.push({ title: 'Form has dipped', body: `Average finish ${a} over your last ${last.length} races, up from ${b} before that.`, ask: 'My results have dipped lately. What should I work on?' });
    }
    // Longest run of podium race finishes
    let run = 0, best = 0, bestEnd = -1;
    rows.forEach((r, i) => { if (r.position != null && !r.letterScore && r.position <= 3) { run++; if (run > best) { best = run; bestEnd = i; } } else run = 0; });
    if (best >= 3) {
      const from = rows[bestEnd - best + 1], to = rows[bestEnd];
      out.push({ title: `Longest podium streak: ${best}`, body: from.item.key === to.item.key ? `${to.item.title}, races ${from.race}–${to.race}.` : `From ${from.item.title} to ${to.item.title}.`, ask: 'What went right in my best podium streak?' });
    }
    // Last race of the day
    const lastRace = new Map<string, number>();
    rows.forEach(r => lastRace.set(r.item.key, Math.max(lastRace.get(r.item.key) || 0, r.race)));
    const finals = placed.filter(r => r.race === lastRace.get(r.item.key) && r.race > 1);
    const rest = placed.filter(r => r.race !== lastRace.get(r.item.key));
    if (finals.length >= 4 && rest.length >= 8) {
      const d = one((avgOf(finals) || 0) - (avgOf(rest) || 0));
      if (d >= 0.8) out.push({ title: 'Watch the last race of the day', body: `You finish ${d} places further back on average in the final race.`, ask: 'Why do I drop places in the last race of the day?' });
      else if (d <= -0.8) out.push({ title: 'Strong finisher', body: `You finish ${-d} places better on average in the last race of the day.`, ask: 'I finish strongly at the end of the day. How do I start like that?' });
    }
    if (perf.totalRaces >= 10 && perf.dnfDnsPercentage >= 10) out.push({ title: 'Races not finished', body: `${perf.dnfDnsPercentage}% of your races are a DNF, DNS or DNC.`, ask: 'How do I cut down on DNFs?' });
    if (strongest && byClass.length > 1) out.push({ title: `Strongest class: ${strongest.k}`, body: `${strongest.p.avgFinish} average over ${strongest.p.totalRaces} races, with ${strongest.p.wins} wins.`, ask: `Why do I sail the ${strongest.k} better than my other boats?` });
    return out;
  }, [rows, perf, strongest, byClass.length]);
  const recent = rows.filter(r => r.position != null && !r.letterScore).slice(-8);

  const Kpi: React.FC<{ v: React.ReactNode; l: React.ReactNode }> = ({ v, l }) => (
    <div className="m-card" style={{ padding: 14 }}>
      <div className="m-disp" style={{ fontSize: 30, fontWeight: 700 }}>{v}</div>
      <div className="m-dim" style={{ fontSize: 12.5 }}>{l}</div>
    </div>
  );
  const Bar: React.FC<{ label: string; sub: string; avg: number | null; min: number }> = ({ label, sub, avg, min }) => (
    <div className="m-li" style={{ alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m-row" style={{ justifyContent: 'space-between' }}><b style={{ fontWeight: 600, fontSize: 14.5 }} className="m-ell">{label}</b><span className="m-disp" style={{ fontWeight: 700 }}>{avg ?? '–'} <span className="m-dim" style={{ fontWeight: 400, fontSize: 12 }}>avg</span></span></div>
        <div className="m-dim" style={{ fontSize: 12, margin: '2px 0 6px' }}>{sub}</div>
        <span style={{ display: 'block', height: 6, borderRadius: 4, background: 'var(--m-bar)' }}><span style={{ display: 'block', height: '100%', borderRadius: 4, width: `${avg ? Math.max(8, (min / avg) * 100) : 0}%`, background: 'linear-gradient(90deg,#2E7BFF,#8A4DFF)' }} /></span>
      </div>
    </div>
  );

  return (
    <div className="m-stack">
      <SubHeader title="My stats" right={<button className="m-ibtn" aria-label="Compare with another skipper" onClick={() => navigate('/compare')}><Icon name="people" size={19} /></button>} />
      <nav className="m-seg" aria-label="Stats sections">
        {([['overview', 'Overview'], ['classes', 'Classes'], ['venues', 'Venues'], ['insights', 'Insights']] as [View, string][]).map(([v, l]) => (
          <button key={v} className={view === v ? 'm-on' : ''} onClick={() => setView(v)}>{l}</button>
        ))}
      </nav>
      <div className="m-chips">
        <button className={`m-chip ${!allTime ? 'm-chip-on' : ''}`} onClick={() => setAllTime(false)}>This season</button>
        <button className={`m-chip ${allTime ? 'm-chip-on' : ''}`} onClick={() => setAllTime(true)}>All time</button>
        <span style={{ width: 1, background: 'var(--m-line)', flexShrink: 0 }} />
        {([['any', 'All levels'], ['club', 'Club'], ['state', 'State'], ['national', 'National']] as [Level, string][]).map(([v, l]) => (
          <button key={v} className={`m-chip ${level === v ? 'm-chip-on' : ''}`} onClick={() => setLevel(v)}>{l}</button>
        ))}
      </div>

      {perf.totalRaces === 0 ? (
        <div className="m-card m-empty">No races {allTime ? 'yet' : `in ${thisYear} yet`}. Your numbers fill in as results are published.</div>
      ) : view === 'overview' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <Kpi v={perf.totalRaces} l={`races sailed · ${events} event${events === 1 ? '' : 's'}`} />
            <Kpi v={perf.avgFinish || '—'} l={<>average finish{lastYearAvg != null && perf.avgFinish ? <span style={{ color: perf.avgFinish <= lastYearAvg ? '#5FD47F' : '#FF9F0A', fontWeight: 600 }}> · {perf.avgFinish <= lastYearAvg ? '▲' : '▼'} {one(Math.abs(lastYearAvg - perf.avgFinish))}</span> : null}</>} />
            <Kpi v={perf.wins} l={`race wins · ${pct(perf.wins)}%`} />
            <Kpi v={perf.top3Finishes} l={`top 3 · ${pct(perf.top3Finishes)}%`} />
          </div>
          {s.months.length > 0 && (
            <div className="m-card" style={{ padding: 14 }}>
              <div className="m-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Average finish by month</span>
                {trend && <span style={{ fontSize: 12.5, fontWeight: 600, color: trend.good ? '#5FD47F' : '#FF9F0A' }}>{trend.text}</span>}
              </div>
              <TrendChart months={s.months} />
              <div className="m-dim" style={{ fontSize: 12 }}>Lower is better.{bestMonth && s.months.length > 1 ? ` Best month: ${new Date(`${bestMonth.key}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'long' })}.` : ''}</div>
            </div>
          )}
          <div className="m-card" style={{ padding: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Where you finish</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90, marginTop: 10 }} role="img" aria-label={spread.map((n, i) => `${i === 9 ? '10th+' : `${i + 1}${ordinal(i + 1)}`}: ${n}`).join(', ')}>
              {spread.map((n, i) => <span key={i} style={{ flex: 1, height: `${Math.max(4, (n / Math.max(...spread, 1)) * 100)}%`, borderRadius: '5px 5px 2px 2px', background: i < 3 ? 'linear-gradient(180deg,#FFD25E,#E8A26B)' : 'rgba(77,163,255,.5)' }} />)}
            </div>
            <div className="m-row m-dim" style={{ justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}><span>1st</span><span>5th</span><span>10th+</span></div>
          </div>
          <div className="m-card m-row" style={{ padding: '12px 14px', gap: 14, justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{perf.consistencyScore || '–'}</div><div className="m-dim" style={{ fontSize: 11.5 }}>consistency</div></div>
            <div><div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{perf.bestFinish ? `${perf.bestFinish}${ordinal(perf.bestFinish)}` : '–'}</div><div className="m-dim" style={{ fontSize: 11.5 }}>best</div></div>
            <div><div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{perf.dnfDnsPercentage}%</div><div className="m-dim" style={{ fontSize: 11.5 }}>DNF / DNS</div></div>
          </div>
          {s.rivals.length > 0 && (
            <>
              <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Closest rivals</p>
              <div className="m-card">
                {s.rivals.map(r => {
                  const first = r.name.split(' ')[0];
                  const text = r.mine > r.theirs ? `You're ahead ${r.mine}–${r.theirs}` : r.theirs > r.mine ? `${first}'s ahead ${r.theirs}–${r.mine}` : `Level ${r.mine}–${r.theirs}`;
                  return (
                    <button key={r.name} className="m-li" onClick={() => navigate(`/compare?b=${encodeURIComponent(r.memberId ? `m:${r.memberId}` : r.name)}`)}>
                      <Avatar name={r.name} size={34} />
                      <span style={{ flex: 1, fontSize: 14.5, textAlign: 'left' }}>{r.name}</span>
                      <span className="m-mut" style={{ fontSize: 13 }}>{text}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : view === 'classes' ? (
        <>
          <div className="m-card">{byClass.map(x => <Bar key={x.k} label={x.k} sub={`${x.p.totalRaces} races · ${x.p.wins} wins · ${x.p.top3Finishes} top 3`} avg={x.p.avgFinish || null} min={Math.min(...byClass.map(y => y.p.avgFinish || 99))} />)}</div>
          {strongest && (
            <div className="m-card m-spec" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700 }}>Strongest class: {strongest.k}</div>
              <div className="m-mut" style={{ fontSize: 13, marginTop: 2 }}>{strongest.p.wins} wins, {strongest.p.top3Finishes} podiums, {100 - strongest.p.dnfDnsPercentage}% of races finished</div>
            </div>
          )}
        </>
      ) : view === 'venues' ? (
        byVenue.length === 0 ? <div className="m-card m-empty">Venues show once your events have one set.</div> : (
          <div className="m-card">{byVenue.map(x => <Bar key={x.k} label={x.k} sub={`${x.p.totalRaces} races · ${x.p.wins} wins`} avg={x.p.avgFinish || null} min={Math.min(...byVenue.map(y => y.p.avgFinish || 99))} />)}</div>
        )
      ) : (
        <>
          {insights.length === 0 ? <div className="m-card m-empty">Insights appear once you have a few more races scored.</div> : insights.map(x => (
            <button key={x.title} className="m-card" onClick={() => askAlfie(x.ask)} style={{ padding: 14, textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700 }}>{x.title}</span>
                <span className="m-mut" style={{ display: 'block', fontSize: 13, marginTop: 2, lineHeight: 1.4 }}>{x.body}</span>
              </span>
              <Icon name="sparkle" size={18} style={{ color: 'var(--m-blue-ink)' }} />
            </button>
          ))}
          {recent.length > 0 && (
            <div className="m-card" style={{ padding: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Recent form</span>
              <div className="m-row" style={{ gap: 6, marginTop: 10 }}>
                {recent.map((r, i) => <span key={i} className="m-disp" style={{ flex: 1, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, background: r.position! <= 3 ? 'rgba(255,210,94,.2)' : 'var(--m-fill-b)', color: r.position! <= 3 ? 'var(--m-gold-ink)' : 'var(--m-ink)' }}>{r.position}</span>)}
              </div>
              <div className="m-dim" style={{ fontSize: 12, marginTop: 6 }}>Last {recent.length} races, newest on the right</div>
            </div>
          )}
        </>
      )}
      <div className="m-row" style={{ gap: 8 }}>
        <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => navigate('/my-results')}><Icon name="calendar" size={18} />Race history</button>
        <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => navigate('/compare')}><Icon name="people" size={18} />Compare</button>
      </div>
    </div>
  );
};

export default StatsScreen;

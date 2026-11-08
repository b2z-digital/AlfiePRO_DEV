import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, SubHeader } from '../ui';
import { ordinal } from './Home';
import { computeStats } from '../me';

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

export const StatsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { calendar, memberIds, profile } = useMobile();
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const years = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear()]);
    calendar.forEach(i => { if (i.kind === 'race' && i.event?.raceResults?.length) ys.add(Number(i.date.slice(0, 4))); });
    return [...ys].sort((a, b) => b - a);
  }, [calendar]);
  const [year, setYear] = useState(years[0]);
  const s = useMemo(() => computeStats(calendar, memberIds, name, year), [calendar, memberIds, name, year]);

  // "Better since July": compare the last three months with the three before
  const trend = useMemo(() => {
    const m = s.months;
    if (m.length < 4) return null;
    const recent = m.slice(-3), before = m.slice(-6, -3);
    if (!before.length) return null;
    const a = recent.reduce((t, x) => t + x.avg, 0) / recent.length;
    const b = before.reduce((t, x) => t + x.avg, 0) / before.length;
    if (Math.abs(a - b) < 0.3) return { text: 'Holding steady', good: true };
    return a < b ? { text: `Better since ${recent[0].label}`, good: true } : { text: `Slipping since ${recent[0].label}`, good: false };
  }, [s.months]);

  return (
    <div className="m-stack">
      <SubHeader
        title="My stats"
        right={(
          <label className="m-chip" style={{ height: 30, position: 'relative' }}>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Season</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ appearance: 'none', background: 'transparent', border: 0, color: 'inherit', font: 'inherit' }}>
              {years.map(y => <option key={y} value={y}>{y} season</option>)}
            </select>
            <Icon name="down" size={14} />
          </label>
        )}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {[[s.races, 'races sailed'], [s.wins, 'race wins'], [s.podiums, 'podiums'], [s.avgFinish ?? '—', 'average finish']].map(([v, l]) => (
          <div key={String(l)} className="m-card" style={{ padding: 14 }}>
            <div className="m-disp" style={{ fontSize: 30, fontWeight: 700 }}>{v}</div>
            <div className="m-dim" style={{ fontSize: 12.5 }}>{l}</div>
          </div>
        ))}
      </div>
      {s.months.length > 0 && (
        <div className="m-card" style={{ padding: 14 }}>
          <div className="m-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Average finish by month</span>
            {trend && <span style={{ fontSize: 12.5, fontWeight: 600, color: trend.good ? '#5FD47F' : '#FF9F0A' }}>{trend.text}</span>}
          </div>
          <TrendChart months={s.months} />
        </div>
      )}
      {s.rivals.length > 0 && (
        <>
          <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Closest rivals</p>
          <div className="m-card">
            {s.rivals.map(r => {
              const first = r.name.split(' ')[0];
              const text = r.mine > r.theirs ? `You're ahead ${r.mine}–${r.theirs}` : r.theirs > r.mine ? `${first}'s ahead ${r.theirs}–${r.mine}` : `Level ${r.mine}–${r.theirs}`;
              return (
                <button key={r.name} className="m-li" onClick={() => r.memberId && navigate(`/skipper/m:${r.memberId}`)} disabled={!r.memberId}>
                  <Avatar name={r.name} size={34} />
                  <span style={{ flex: 1, fontSize: 14.5 }}>{r.name}</span>
                  <span className="m-mut" style={{ fontSize: 13 }}>{text}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {s.races === 0 && <div className="m-card m-empty">No races in {year} yet. Your numbers fill in as results are published.</div>}
      <button className="m-btn m-btn-g" onClick={() => navigate('/my-results')}><Icon name="trophy" size={18} />Every result</button>
    </div>
  );
};

export default StatsScreen;

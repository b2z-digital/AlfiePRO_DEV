import React, { useMemo } from 'react';
import { Users, Check, RefreshCw, UserPlus, TrendingUp, CreditCard, Sailboat, Calendar } from 'lucide-react';

/**
 * Club Membership → Dashboard, built to the design board (MemDash).
 * Pure presentation of the figures MembershipDashboard already loads.
 */

interface Props {
  stats: { totalMembers: number; activeMembers: number; pendingRenewals: number; newMembersThisMonth: number };
  membersByCategory: Record<string, number>;
  membersByClass: Record<string, number>;
  memberActivity: { singleEvents: number; seriesEvents: number };
  retentionData: Record<string, number>;
  joinDates: string[];
  timeRange: 'month' | 'quarter' | 'year';
  onTimeRangeChange: (r: 'month' | 'quarter' | 'year') => void;
}

const PALETTE = ['#2F7BFF', '#8A4DFF', '#FF3E9A', '#FF8A2B', '#40C8C0', '#30D158', '#FFC56B', '#9AA6BD'];

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const Head: React.FC<{ icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode }> = ({ icon, title, sub, right }) => (
  <div className="flex items-start gap-3 mb-5">
    <span className="a-tile" style={{ width: 36, height: 36 }}>{icon}</span>
    <div className="flex-1 min-w-0">
      <h3 className="a-display a-ink text-lg font-semibold leading-tight">{title}</h3>
      {sub && <p className="a-dim text-[13px] mt-0.5">{sub}</p>}
    </div>
    {right}
  </div>
);

/** Ring made of arc segments */
const Ring: React.FC<{ parts: { value: number; color: string }[]; size?: number; stroke?: number; children?: React.ReactNode }> = ({ parts, size = 168, stroke = 10, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0);
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={stroke} />
        {total > 0 && parts.map((p, i) => {
          if (p.value <= 0) return null;
          const len = Math.max((p.value / total) * c - gap, 1);
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset} />
          );
          offset += (p.value / total) * c;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};

/** Members over time, from join dates */
const useTrend = (joinDates: string[], total: number, range: 'month' | 'quarter' | 'year') =>
  useMemo(() => {
    const now = new Date();
    const points: { label: string; end: Date }[] = [];
    if (range === 'year') {
      for (let i = 4; i >= 0; i--) {
        const y = now.getFullYear() - i;
        points.push({ label: String(y), end: i === 0 ? now : new Date(y, 11, 31, 23, 59, 59) });
      }
    } else if (range === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      for (let i = 4; i >= 0; i--) {
        const qi = q - i;
        const y = now.getFullYear() + Math.floor(qi / 4);
        const qq = ((qi % 4) + 4) % 4;
        points.push({ label: `Q${qq + 1} ${String(y).slice(2)}`, end: i === 0 ? now : new Date(y, qq * 3 + 3, 0, 23, 59, 59) });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        points.push({ label: d.toLocaleString('en-AU', { month: 'short' }), end: i === 0 ? now : new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) });
      }
    }
    const times = joinDates.map((d) => new Date(d).getTime()).filter((t) => !isNaN(t));
    const undated = Math.max(0, total - times.length);
    return points.map((p) => ({ label: p.label, value: undated + times.filter((t) => t <= p.end.getTime()).length }));
  }, [joinDates, total, range]);

const TrendChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const W = 640, H = 210, padL = 34, padR = 18, padT = 26, padB = 30;
  const vals = data.map((d) => d.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min = Math.max(0, min - 2); max = max + 2; }
  const span = max - min;
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(data.length - 1, 1);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;
  const ticks = [max, Math.round((max + min) / 2), min];
  const last = data[data.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto a-trend" role="img" aria-label="Members over time">
      <defs>
        <linearGradient id="aTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2F7BFF" stopOpacity="0.32" />
          <stop offset="1" stopColor="#2F7BFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="a-trend-grid" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="a-trend-tick">{t}</text>
        </g>
      ))}
      <path d={area} fill="url(#aTrendFill)" />
      <path d={line} fill="none" stroke="#2F7BFF" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 5 : 3.5} className={i === data.length - 1 ? 'a-trend-dot-on' : 'a-trend-dot'} />
      ))}
      {data.map((d, i) => (
        <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" className={i === data.length - 1 ? 'a-trend-x a-trend-x-on' : 'a-trend-x'}>{d.label}</text>
      ))}
      {last && (
        <g transform={`translate(${x(data.length - 1)} ${y(last.value) - 22})`}>
          <rect x={-18} y={-13} width={36} height={22} rx={7} className="a-trend-pill" />
          <text x={0} y={2} textAnchor="middle" className="a-trend-pill-t">{last.value}</text>
        </g>
      )}
    </svg>
  );
};

export const MembershipOverviewBoard: React.FC<Props> = ({
  stats, membersByCategory, membersByClass, memberActivity, retentionData, joinDates, timeRange, onTimeRangeChange,
}) => {
  const trend = useTrend(joinDates, stats.totalMembers, timeRange);
  const monthName = new Date().toLocaleString('en-AU', { month: 'long' });

  const types = Object.entries(membersByCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const typeTotal = types.reduce((s, [, v]) => s + v, 0);
  const classes = Object.entries(membersByClass).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const classMax = Math.max(1, ...classes.map(([, v]) => v));
  const renewed = retentionData['Renewed'] || 0;
  const notRenewed = retentionData['Not Renewed'] || 0;
  const retTotal = renewed + notRenewed;
  const single = memberActivity.singleEvents || 0;
  const series = memberActivity.seriesEvents || 0;
  const dots = Math.min(single + series, 48);
  const seriesDots = single + series > 0 ? Math.round((series / (single + series)) * dots) : 0;

  const statCards = [
    { cap: 'Total members', value: stats.totalMembers, sub: 'All membership types', icon: <Users size={18} /> },
    { cap: 'Active members', value: stats.activeMembers, sub: `${pct(stats.activeMembers, stats.totalMembers)}% of members are financial`, icon: <Check size={18} /> },
    { cap: 'Pending renewals', value: stats.pendingRenewals, sub: 'Due in the next 30 days', icon: <RefreshCw size={18} />, amber: stats.pendingRenewals > 0 },
    { cap: 'New this month', value: stats.newMembersThisMonth, sub: stats.newMembersThisMonth ? `Joined in ${monthName}` : `No new joins in ${monthName}`, icon: <UserPlus size={18} /> },
  ];

  return (
    <div className="a-memdash space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {statCards.map((c) => (
          <div key={c.cap} className="a-card a-hov p-6">
            <div className="flex items-start justify-between">
              <p className="a-cap">{c.cap}</p>
              <span className="a-tile" style={{ width: 40, height: 40 }}>{c.icon}</span>
            </div>
            <div className={`a-num text-5xl font-bold mt-1 ${c.amber ? 'a-txt-a' : 'a-ink'}`}>{c.value}</div>
            <p className="a-mute text-sm mt-3">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
        <div className="a-card p-6">
          <Head
            icon={<TrendingUp size={18} />}
            title="Membership trends"
            sub={`Total members by ${timeRange}`}
            right={
              <div className="a-seg" role="radiogroup" aria-label="Range">
                {(['month', 'quarter', 'year'] as const).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={timeRange === r}
                    className={`a-seg-i ${timeRange === r ? 'a-seg-on' : ''}`} onClick={() => onTimeRangeChange(r)}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            }
          />
          <TrendChart data={trend} />
        </div>

        <div className="a-card p-6">
          <Head icon={<CreditCard size={18} />} title="Membership types" />
          <div className="flex justify-center mb-5">
            <Ring parts={types.map(([, v], i) => ({ value: v, color: PALETTE[i % PALETTE.length] }))}>
              <span className="a-num a-ink text-3xl font-bold">{typeTotal}</span>
              <span className="a-dim text-xs">members</span>
            </Ring>
          </div>
          <div className="a-divide">
            {types.length === 0 && <p className="a-dim text-sm text-center py-3">No membership types yet</p>}
            {types.map(([name, v], i) => (
              <div key={name} className="flex items-center gap-3 py-2.5">
                <span className="a-light" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="a-ink text-sm flex-1 truncate">{name}</span>
                <span className="a-num a-ink text-sm font-semibold">{v}</span>
                <span className="a-dim text-xs w-10 text-right">{pct(v, typeTotal)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="a-card p-6">
          <Head icon={<Sailboat size={18} />} title="Members by class" sub="Registered boats" />
          <div className="space-y-3">
            {classes.length === 0 && <p className="a-dim text-sm">No boats registered yet</p>}
            {classes.slice(0, 8).map(([name, v], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="a-lb-cls a-memdash-cls" style={{ ['--a-cls' as any]: PALETTE[i % PALETTE.length] }}>{name}</span>
                <div className="a-memdash-bar flex-1"><span style={{ width: `${(v / classMax) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></div>
                <span className="a-num a-ink text-sm font-semibold w-7 text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="a-card p-6">
          <Head icon={<Calendar size={18} />} title="Event participation" sub="Member entries this season" />
          <div className="grid grid-cols-2 gap-3">
            <div className="a-memdash-well"><p className="a-cap">Single events</p><div className={`a-num text-4xl font-bold mt-1 ${single ? 'a-ink' : 'a-dim'}`}>{single}</div></div>
            <div className="a-memdash-well"><p className="a-cap">Pointscore series</p><div className={`a-num text-4xl font-bold mt-1 ${series ? 'a-ink' : 'a-dim'}`}>{series}</div></div>
          </div>
          {dots > 0 && (
            <div className="a-memdash-dots mt-5" aria-hidden="true">
              {Array.from({ length: dots }, (_, i) => <span key={i} className={i < seriesDots ? 'is-series' : 'is-single'} />)}
            </div>
          )}
          <div className="flex justify-between mt-2 a-dim text-xs">
            <span>{series} entries · all series</span>
            <span>{single} single</span>
          </div>
        </div>

        <div className="a-card p-6">
          <Head icon={<RefreshCw size={18} />} title="Member retention" sub="This membership year" />
          <div className="flex items-center gap-5">
            <Ring size={136} stroke={9} parts={[{ value: renewed, color: '#30D158' }, { value: notRenewed, color: 'rgba(150,160,180,0.35)' }]}>
              <span className="a-num a-ink text-3xl font-bold">{pct(renewed, retTotal)}%</span>
              <span className="a-dim text-xs">retained</span>
            </Ring>
            <div className="flex-1 a-divide min-w-0">
              {[['Renewed', renewed, '#30D158'], ['Not renewed', notRenewed, 'rgba(150,160,180,0.6)']].map(([label, v, color]) => (
                <div key={label as string} className="flex items-center gap-3 py-2.5">
                  <span className="a-light" style={{ background: color as string }} />
                  <span className="a-ink text-sm flex-1">{label}</span>
                  <span className="a-num a-ink text-sm font-semibold">{v as number}</span>
                  <span className="a-dim text-xs w-10 text-right">{pct(v as number, retTotal)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

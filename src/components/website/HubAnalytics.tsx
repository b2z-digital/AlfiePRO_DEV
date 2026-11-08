import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Clock, Download, FileText, Link2, Loader2, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useHub } from './hubData';
import { dailySeries, EMPTY_STATS, fetchSiteStats, fmtDuration, pageName, pctChange, periods, SiteStats, SOURCE_LABEL } from './stats';

const RANGES = [{ d: 7, l: '7 days' }, { d: 30, l: '30 days' }, { d: 90, l: '90 days' }, { d: 365, l: '12 months' }];
const DEVICE_COLOURS: Record<string, string> = { phone: '#3987e5', computer: '#d95926', tablet: '#199e70' };
const DEVICE_LABEL: Record<string, string> = { phone: 'Phone', computer: 'Computer', tablet: 'Tablet' };
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BLOCKS = [{ h: 6, l: '6am' }, { h: 9, l: '9am' }, { h: 12, l: '12pm' }, { h: 15, l: '3pm' }, { h: 18, l: '6pm' }, { h: 21, l: '9pm' }];
const RAMP = ['#11203D', '#152B52', '#1A3A6E', '#1F4A8C', '#2559AA', '#2B69C6', '#3478DB', '#4C8BE6', '#6FA4EE', '#94BEF5'];
const RAMP_LIGHT = ['#EEF3FB', '#DCE7F8', '#C6D9F4', '#A9C6EE', '#88B0E7', '#6699DF', '#4A84D6', '#3471C9', '#265EB0', '#1C4C93'];

const Trend: React.FC<{ now: number; before: number; suffix?: string }> = ({ now, before, suffix }) => {
  const p = pctChange(now, before);
  if (p === null) return <span>{suffix || 'No earlier visits to compare'}</span>;
  return <><b style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: p < 0 ? '#FF6B60' : '#4CD07A', fontWeight: 700 }}>{p < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />}{Math.abs(p)}%</b>{suffix}</>;
};

export const HubAnalytics: React.FC = () => {
  const { club, pages } = useHub();
  const [range, setRange] = useState(30);
  const [data, setData] = useState<{ now: SiteStats; prev: SiteStats } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const light = typeof document !== 'undefined' && document.documentElement.classList.contains('alfie-light');

  useEffect(() => {
    setData(null);
    const { start, end, prevStart } = periods(range);
    Promise.all([fetchSiteStats(club!.id, start, end), fetchSiteStats(club!.id, prevStart, start)])
      .then(([now, prev]) => setData({ now, prev }))
      .catch(() => setData({ now: EMPTY_STATS, prev: EMPTY_STATS }));
  }, [club, range]);

  const { start, prevStart } = periods(range);
  const now = data?.now || EMPTY_STATS;
  const prev = data?.prev || EMPTY_STATS;
  const series = dailySeries(now, start, range);
  const prevSeries = dailySeries(prev, prevStart, range);
  const titles = Object.fromEntries(pages.map(p => [p.page_slug, p.page_title]));

  // Chart geometry (weekly buckets for long ranges keep it readable)
  const bucket = range > 90 ? 7 : 1;
  const group = (s: { date: Date; value: number }[]) => {
    const out: { date: Date; value: number }[] = [];
    for (let i = 0; i < s.length; i += bucket) out.push({ date: s[i].date, value: s.slice(i, i + bucket).reduce((a, b) => a + b.value, 0) });
    return out;
  };
  const cur = group(series), old = group(prevSeries);
  const W = 760, H = 230;
  const top = Math.max(4, ...cur.map(p => p.value), ...old.map(p => p.value)) * 1.12;
  const xy = (i: number, v: number) => [6 + ((W - 12) * i) / Math.max(1, cur.length - 1), H - 2 - ((H - 10) * v) / top];
  const line = (pts: { value: number }[]) => 'M' + pts.map((p, i) => xy(i, p.value).map(n => n.toFixed(1)).join(' ')).join(' L');
  const curLine = line(cur);
  const fill = `${curLine} L${xy(cur.length - 1, 0)[0].toFixed(1)} ${H} L6 ${H} Z`;
  const ticks = [0.25, 0.5, 0.75].map(f => Math.round((top * f) / 5) * 5).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const labelIdx = [0, Math.floor(cur.length / 3), Math.floor((2 * cur.length) / 3), cur.length - 1];
  const fmtDay = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(cur.length - 1, Math.round(((x - 6) / (W - 12)) * (cur.length - 1)))));
  };

  const sources = useMemo(() => {
    const total = now.sources.reduce((a, b) => a + b.visits, 0) || 1;
    return now.sources.map(s => ({ ...s, pct: Math.round((s.visits / total) * 100) }));
  }, [now]);
  const devices = useMemo(() => {
    const total = now.devices.reduce((a, b) => a + b.visits, 0) || 1;
    return ['phone', 'computer', 'tablet'].map(k => ({ k, pct: Math.round(((now.devices.find(d => d.device === k)?.visits || 0) / total) * 100) }));
  }, [now]);

  const heat = useMemo(() => {
    const grid = BLOCKS.map(b => DAYS.map((_, di) => now.hours.filter(h => h.dow === di + 1 && h.hour >= b.h && h.hour < b.h + 3).reduce((a, h) => a + h.views, 0)));
    const max = Math.max(1, ...grid.flat());
    let best = { v: 0, d: 0, b: 0 };
    grid.forEach((row, bi) => row.forEach((v, di) => { if (v > best.v) best = { v, d: di, b: bi }; }));
    return { grid, max, best };
  }, [now]);

  const csv = () => {
    const rows = [['Date', 'Visitors', 'Page views'], ...dailySeries(now, start, range).map((d, i) => [d.date.toISOString().slice(0, 10), String(d.value), String(dailySeries(now, start, range, 'views')[i].value)])];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(club!.abbreviation || 'website').toLowerCase()}-visits-${range}d.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const phonePct = devices.find(d => d.k === 'phone')?.pct || 0;
  const ramp = light ? RAMP_LIGHT : RAMP;
  const h = hover !== null ? { c: cur[hover], o: old[hover], x: xy(hover, cur[hover]?.value || 0) } : null;

  return (
    <>
      <div className="wh-an-bar">
        <div className="a-seg" role="group" aria-label="Date range">
          {RANGES.map(r => <button key={r.d} className={`a-seg-i ${range === r.d ? 'a-seg-on' : ''}`} onClick={() => setRange(r.d)}>{r.l}</button>)}
        </div>
        <span className="wh-dim text-[12.5px]">{fmtDay(start)} – {fmtDay(new Date())}, compared with the {range === 365 ? '12 months' : `${range} days`} before</span>
        <div className="r"><button className="a-btn" style={{ height: 34 }} onClick={csv} disabled={!data || now.views === 0}><Download size={14} />Download CSV</button></div>
      </div>

      {!data ? (
        <div className="a-card wh-empty" style={{ padding: 48 }}><Loader2 size={18} className="wh-spin inline" /> Loading visits…</div>
      ) : now.views === 0 && prev.views === 0 ? (
        <div className="a-card wh-empty" style={{ padding: '48px 24px' }}>
          <Activity size={22} style={{ margin: '0 auto 10px' }} />
          <div className="wh-ink" style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>No visits counted yet</div>
          Your public pages now count visits (no cookies or personal details). Numbers will appear here as people visit your site.
        </div>
      ) : (
        <>
          <div className="wh-kpis">
            <section className="a-card wh-kpi"><p className="a-cap">Visitors</p><div className="v wh-num">{now.visitors.toLocaleString()}</div><div className="d"><Trend now={now.visitors} before={prev.visitors} suffix={prev.visitors ? ` vs ${prev.visitors.toLocaleString()}` : undefined} /></div></section>
            <section className="a-card wh-kpi"><p className="a-cap">Page views</p><div className="v wh-num">{now.views.toLocaleString()}</div><div className="d"><Trend now={now.views} before={prev.views} suffix={now.sessions ? ` · ${(now.views / Math.max(1, now.sessions)).toFixed(1)} pages a visit` : undefined} /></div></section>
            <section className="a-card wh-kpi"><p className="a-cap">Average visit</p><div className="v wh-num">{fmtDuration(now.avg_seconds)}</div><div className="d">{prev.avg_seconds ? <Trend now={now.avg_seconds} before={prev.avg_seconds} suffix={` vs ${fmtDuration(prev.avg_seconds)}`} /> : 'Time spent on a page'}</div></section>
            <section className="a-card wh-kpi"><p className="a-cap">On phones</p><div className="v wh-num">{phonePct}%</div><div className="d">{phonePct >= 50 ? 'Check new pages on a phone first' : 'Of all visits'}</div></section>
          </div>

          <div className="wh-an">
            <section className="a-card" aria-label="Visitors over time">
              <div className="wh-ch"><span className="a-tile a-tile-sm"><Activity size={17} /></span><div><h3 className="a-display">Visitors {bucket > 1 ? 'each week' : 'each day'}</h3><div className="sub">Hover to compare</div></div>
                <div className="r wh-legend"><span><i />This period</span><span><i className="prev" />Period before</span></div></div>
              <div className="wh-chartwrap">
                <svg ref={svgRef} width="100%" height={H + 22} viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`Visitors ${bucket > 1 ? 'each week' : 'each day'} compared with the period before`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
                  <defs><linearGradient id="w-an-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3987e5" stopOpacity=".28" /><stop offset="1" stopColor="#3987e5" stopOpacity="0" /></linearGradient></defs>
                  {ticks.map(t => { const y = H - 2 - ((H - 10) * t) / top; return <g key={t}><path d={`M0 ${y} H${W}`} stroke="currentColor" strokeOpacity=".06" /><text x={W - 2} y={y - 5} textAnchor="end" fontSize="10.5" fill="currentColor" fillOpacity=".4">{t}</text></g>; })}
                  <path d={`M0 ${H - 0.5} H${W}`} stroke="currentColor" strokeOpacity=".12" />
                  <path d={line(old)} fill="none" stroke="currentColor" strokeOpacity=".38" strokeWidth="2" strokeDasharray="4 4" />
                  <path d={fill} fill="url(#w-an-g)" />
                  <path d={curLine} fill="none" stroke="#3987e5" strokeWidth="2" strokeLinejoin="round" />
                  {h && h.c && (
                    <>
                      <path d={`M${h.x[0]} 6 V${H}`} stroke="currentColor" strokeOpacity=".35" />
                      <circle cx={h.x[0]} cy={h.x[1]} r="5" fill="#3987e5" stroke="var(--w-frame)" strokeWidth="2" />
                    </>
                  )}
                  <g fontSize="10.5" fill="currentColor" fillOpacity=".45">
                    {labelIdx.filter((v, i, a) => a.indexOf(v) === i && cur[v]).map((i, k, arr) => (
                      <text key={i} x={xy(i, 0)[0]} y={H + 16} textAnchor={k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle'}>{fmtDay(cur[i].date)}</text>
                    ))}
                  </g>
                </svg>
                {h && h.c && (
                  <div className="wh-tip" style={{ left: `calc(${(h.x[0] / W) * 100}% ${h.x[0] > W / 2 ? '- 190px' : '+ 30px'})`, top: 24 }}>
                    <div className="h">{bucket > 1 ? `Week of ${fmtDay(h.c.date)}` : h.c.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                    <div className="rw"><i />Visitors<b>{h.c.value}</b></div>
                    {h.o && <div className="rw"><i className="prev" />{fmtDay(h.o.date)}<b>{h.o.value}</b></div>}
                  </div>
                )}
              </div>
            </section>

            <section className="a-card" aria-label="Where visitors come from">
              <div className="wh-ch"><span className="a-tile a-tile-sm"><Link2 size={17} /></span><div><h3 className="a-display">Where visitors come from</h3><div className="sub">Share of visits</div></div></div>
              <div className="wh-src">
                {sources.length === 0 ? <p className="wh-empty">No visits in this period.</p> : sources.map(s => (
                  <div key={s.source} className="rw"><span>{SOURCE_LABEL[s.source] || s.source}</span><span className="bar" style={{ width: `${Math.max(2, (s.pct / Math.max(1, sources[0].pct)) * 100)}%` }} /><span className="v">{s.pct}%</span></div>
                ))}
              </div>
            </section>
          </div>

          <div className="wh-an2">
            <section className="a-card" aria-label="Top pages">
              <div className="wh-ch"><span className="a-tile a-tile-sm"><FileText size={17} /></span><div><h3 className="a-display">Top pages</h3></div></div>
              <table className="wh-tbl"><thead><tr><th>Page</th><th className="n">Views</th><th className="n">Avg. time</th></tr></thead><tbody>
                {now.pages.slice(0, 8).map(p => (
                  <tr key={p.path}><td><span className="pg">{pageName(p.path, titles)}</span></td><td className="n">{p.views.toLocaleString()}</td><td className="n">{p.avg ? fmtDuration(p.avg) : '–'}</td></tr>
                ))}
                {now.pages.length === 0 && <tr><td colSpan={3} className="wh-dim">No visits in this period.</td></tr>}
              </tbody></table>
            </section>

            <section className="a-card" aria-label="Busiest times">
              <div className="wh-ch"><span className="a-tile a-tile-sm"><Clock size={17} /></span><div><h3 className="a-display">Busiest times</h3><div className="sub">{heat.best.v ? `${DAY_NAMES[heat.best.d]} around ${BLOCKS[heat.best.b].l} is your busiest time` : 'When people visit'}</div></div></div>
              <div className="wh-heat">
                <div className="wh-hgrid">
                  <span />
                  {DAYS.map((d, i) => <span key={i} className="dl">{d}</span>)}
                  {BLOCKS.map((b, bi) => (
                    <React.Fragment key={b.h}>
                      <span className="lb">{b.l}</span>
                      {heat.grid[bi].map((v, di) => <i key={di} title={`${DAY_NAMES[di]} ${b.l}: ${v} views`} style={{ background: ramp[Math.min(9, Math.round((v / heat.max) * 9))] }} />)}
                    </React.Fragment>
                  ))}
                </div>
                <div className="wh-dim" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11 }}>
                  <span>Fewer</span><span style={{ display: 'flex', gap: 2 }}>{ramp.filter((_, i) => i % 2 === 0).map(c => <i key={c} style={{ display: 'block', width: 14, height: 8, borderRadius: 2, background: c }} />)}</span><span>More</span>
                </div>
              </div>
            </section>

            <section className="a-card" aria-label="Devices">
              <div className="wh-ch"><span className="a-tile a-tile-sm"><Smartphone size={17} /></span><div><h3 className="a-display">Devices</h3><div className="sub">What people visit on</div></div></div>
              <div className="wh-devbar" role="img" aria-label={devices.map(d => `${DEVICE_LABEL[d.k]} ${d.pct}%`).join(', ')}>
                {devices.filter(d => d.pct > 0).map(d => <i key={d.k} style={{ width: `${d.pct}%`, background: DEVICE_COLOURS[d.k] }} />)}
              </div>
              <div className="wh-devleg">
                {devices.map(d => (
                  <span key={d.k}><i style={{ background: DEVICE_COLOURS[d.k] }} />{d.k === 'phone' ? <Smartphone size={14} /> : d.k === 'computer' ? <Monitor size={14} /> : <Tablet size={14} />}{DEVICE_LABEL[d.k]}<b>{d.pct}%</b></span>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
};

import React, { useState, useEffect } from 'react';
import { TrendingUp, Award, TrendingDown, Activity, Calendar, Target } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PerformanceTabProps {
  boatId: string;
  sailNumber: string;
  darkMode: boolean;
}

interface RaceResult {
  position: number;
  date: string;
  title: string;
  totalCompetitors: number;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({ boatId, sailNumber, darkMode }) => {
  const [loading, setLoading] = useState(true);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [stats, setStats] = useState({
    totalRaces: 0,
    bestPosition: null as number | null,
    avgPosition: null as number | null,
    podiumFinishes: 0,
    top5Finishes: 0,
    recentTrend: 'neutral' as 'improving' | 'declining' | 'neutral'
  });

  useEffect(() => {
    fetchPerformanceData();
  }, [boatId, sailNumber]);

  const findBoatSkipperIndex = (skippers: any[]): number[] => {
    if (!skippers || !Array.isArray(skippers)) return [];
    const indices: number[] = [];
    skippers.forEach((skipper: any, idx: number) => {
      if (skipper.boatId === boatId) {
        indices.push(idx);
      }
    });
    return indices;
  };

  const fetchPerformanceData = async () => {
    try {
      const results: RaceResult[] = [];

      const { data: raceData } = await supabase
        .from('quick_races')
        .select('id, race_date, event_name, race_results, skippers')
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .neq('is_simulated', true)
        .order('race_date', { ascending: false });

      if (raceData) {
        for (const race of raceData) {
          const skipperIndices = findBoatSkipperIndex(race.skippers);
          if (skipperIndices.length === 0) continue;

          const totalCompetitors = (race.skippers || []).length;
          for (const result of (race.race_results || [])) {
            if (skipperIndices.includes(result.skipperIndex)) {
              const pos = typeof result.position === 'string' ? parseInt(result.position) : result.position;
              if (pos && !isNaN(pos) && pos > 0) {
                results.push({
                  position: pos,
                  date: race.race_date,
                  title: `${race.event_name || 'Race'} - Race ${result.race || ''}`,
                  totalCompetitors
                });
              }
            }
          }
        }
      }

      const { data: seriesRounds } = await supabase
        .from('race_series_rounds')
        .select(`
          id, date, round_name, round_index,
          race_results, skippers,
          race_series:series_id(id, series_name)
        `)
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .order('date', { ascending: false });

      if (seriesRounds) {
        for (const round of seriesRounds) {
          const skipperIndices = findBoatSkipperIndex(round.skippers);
          if (skipperIndices.length === 0) continue;

          const totalCompetitors = (round.skippers || []).length;
          const seriesName = Array.isArray(round.race_series)
            ? round.race_series[0]?.series_name
            : (round.race_series as any)?.series_name;
          const roundLabel = round.round_name || `Round ${(round.round_index ?? 0) + 1}`;

          for (const result of (round.race_results || [])) {
            if (skipperIndices.includes(result.skipperIndex)) {
              const pos = typeof result.position === 'string' ? parseInt(result.position) : result.position;
              if (pos && !isNaN(pos) && pos > 0) {
                results.push({
                  position: pos,
                  date: round.date,
                  title: `${seriesName || 'Series'} - ${roundLabel} R${result.race || ''}`,
                  totalCompetitors
                });
              }
            }
          }
        }
      }

      results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRaceResults(results);

      if (results.length > 0) {
        const positions = results.map(r => r.position);
        const avgPos = positions.reduce((a, b) => a + b, 0) / positions.length;
        const podiumCount = positions.filter(p => p <= 3).length;
        const top5Count = positions.filter(p => p <= 5).length;

        let trend: 'improving' | 'declining' | 'neutral' = 'neutral';
        if (results.length >= 5) {
          const recentAvg = results.slice(0, 5).reduce((sum, r) => sum + r.position, 0) / 5;
          const olderResults = results.slice(5, 10);
          if (olderResults.length > 0) {
            const olderAvg = olderResults.reduce((sum, r) => sum + r.position, 0) / olderResults.length;
            if (recentAvg < olderAvg - 1) trend = 'improving';
            else if (recentAvg > olderAvg + 1) trend = 'declining';
          }
        }

        setStats({
          totalRaces: results.length,
          bestPosition: Math.min(...positions),
          avgPosition: Math.round(avgPos * 10) / 10,
          podiumFinishes: podiumCount,
          top5Finishes: top5Count,
          recentTrend: trend
        });
      }
    } catch (err) {
      console.error('Error fetching performance data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="a-card text-center" style={{ padding: 48 }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
        <p className="a-dim text-[13.5px]">Loading performance…</p>
      </div>
    );
  }

  if (raceResults.length === 0) {
    return (
      <div className="a-card a-empty text-center" style={{ padding: 48 }}>
        <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Activity size={22} /></span>
        <h3 className="a-ink text-[16px] font-semibold mb-1">No race data yet</h3>
        <p className="a-dim text-[13.5px]">Race with this boat to see performance here</p>
      </div>
    );
  }

  const MEDAL: Record<number, string> = { 1: '#FFC56B', 2: '#C9D1DE', 3: '#E59A62' };
  const ord = (n: number | null) => n ? `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}` : '–';
  const line = darkMode ? '#4DA3FF' : '#0A64D8';
  const grid = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.07)';
  const tick = darkMode ? 'rgba(235,240,255,0.45)' : 'rgba(15,23,42,0.5)';
  const last = raceResults.slice(0, 15).reverse();

  const chartData = {
    labels: last.map(r => new Date(r.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })),
    datasets: [
      {
        label: 'Position',
        data: last.map(r => r.position),
        borderColor: line,
        backgroundColor: (ctx: any) => {
          const c = ctx.chart.ctx; const h = ctx.chart.height || 260;
          const g = c.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, darkMode ? 'rgba(46,123,255,0.28)' : 'rgba(10,100,216,0.16)');
          g.addColorStop(1, 'rgba(46,123,255,0)');
          return g;
        },
        fill: 'start' as const,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: last.map(r => MEDAL[r.position] || line),
        pointBorderColor: darkMode ? '#0D1424' : '#fff',
        pointBorderWidth: 2,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: darkMode ? 'rgba(17,22,34,0.96)' : 'rgba(255,255,255,0.98)',
        titleColor: darkMode ? '#fff' : '#0B1220',
        bodyColor: darkMode ? 'rgba(235,240,255,0.75)' : 'rgba(15,23,42,0.7)',
        borderColor: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
      }
    },
    scales: {
      y: { reverse: true, beginAtZero: false, grid: { color: grid }, border: { display: false }, ticks: { color: tick, stepSize: 1 } },
      x: { grid: { display: false }, border: { display: false }, ticks: { color: tick } }
    }
  };

  const buckets = [
    { label: '1st', n: raceResults.filter(r => r.position === 1).length, color: '#FFC56B', cls: 'a-best-1' },
    { label: '2nd', n: raceResults.filter(r => r.position === 2).length, color: '#C9D1DE', cls: 'a-best-2' },
    { label: '3rd', n: raceResults.filter(r => r.position === 3).length, color: '#E59A62', cls: 'a-best-3' },
    { label: '4–5th', n: raceResults.filter(r => r.position >= 4 && r.position <= 5).length, color: '#40C8C0', cls: 'a-mute' },
    { label: '6–10th', n: raceResults.filter(r => r.position >= 6 && r.position <= 10).length, color: '#8A4DFF', cls: 'a-mute' },
    { label: '11+', n: raceResults.filter(r => r.position > 10).length, color: 'rgba(154,166,189,0.5)', cls: 'a-mute' },
  ];
  const maxB = Math.max(1, ...buckets.map(b => b.n));
  const mini = (icon: React.ReactNode, label: string, value: React.ReactNode, cls = 'a-ink') => (
    <div className="a-card" style={{ padding: '14px 16px' }}>
      <div className="a-dim flex items-center gap-1.5 text-[12px]">{icon}{label}</div>
      <div className={`a-display a-num text-[24px] font-semibold leading-none mt-2 ${cls}`}>{value}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {mini(<Calendar size={14} />, 'Races', stats.totalRaces)}
        {mini(<Award size={14} />, 'Best', ord(stats.bestPosition), stats.bestPosition && stats.bestPosition <= 3 ? `a-best-${stats.bestPosition}` : 'a-ink')}
        {mini(<Target size={14} />, 'Avg', stats.avgPosition || '–')}
        {mini(<Award size={14} />, 'Podiums', stats.podiumFinishes)}
        {mini(<Award size={14} />, 'Top 5', stats.top5Finishes)}
        {mini(stats.recentTrend === 'improving' ? <TrendingUp size={14} /> : stats.recentTrend === 'declining' ? <TrendingDown size={14} /> : <Activity size={14} />, 'Trend',
          stats.recentTrend === 'improving' ? 'Improving' : stats.recentTrend === 'declining' ? 'Declining' : 'Stable',
          stats.recentTrend === 'improving' ? 'a-txt-g' : stats.recentTrend === 'declining' ? 'a-txt-r' : 'a-mute')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="a-card flex flex-col gap-3" style={{ padding: 20 }}>
          <div className="flex items-center gap-3">
            <span className="a-tile a-tile-sm"><TrendingUp size={16} /></span>
            <div className="flex-1 min-w-0">
              <h2 className="a-display a-ink m-0 text-[18px] font-semibold">Last {last.length} races</h2>
              <p className="a-dim mt-0.5 text-[12.5px]">Higher on the chart is better</p>
            </div>
          </div>
          <div style={{ height: 260 }}>
            <Line data={chartData} options={chartOptions as any} />
          </div>
        </div>

        <div className="a-card flex flex-col gap-3" style={{ padding: 20 }}>
          <div className="flex items-center gap-3">
            <span className="a-tile a-tile-sm"><Award size={16} /></span>
            <div className="flex-1 min-w-0">
              <h2 className="a-display a-ink m-0 text-[18px] font-semibold">Where you finish</h2>
              <p className="a-dim mt-0.5 text-[12.5px]">{raceResults.length} races</p>
            </div>
          </div>
          {buckets.map(b => (
            <div key={b.label} className="grid items-center gap-3" style={{ gridTemplateColumns: '64px 1fr 40px', height: 34 }}>
              <span className={`text-[13px] font-semibold ${b.cls}`}>{b.label}</span>
              <div className="a-bar-track"><div style={{ width: `${(b.n / maxB) * 100}%`, minWidth: b.n ? 4 : 0, height: '100%', borderRadius: 999, background: b.color }} /></div>
              <span className="a-num a-ink text-right text-[14px] font-semibold">{b.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="a-card overflow-hidden">
        <div style={{ padding: '18px 18px 8px' }}>
          <div className="flex items-center gap-3">
            <span className="a-tile a-tile-sm"><Calendar size={16} /></span>
            <h2 className="a-display a-ink flex-1 m-0 text-[18px] font-semibold">Recent results</h2>
          </div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          {raceResults.slice(0, 10).map((result, index) => (
            <div key={`${result.date}-${index}`} className="a-rr" style={{ padding: '12px 16px', cursor: 'default' }}>
              {MEDAL[result.position]
                ? <span className="a-med" style={{ width: 32, height: 32, background: MEDAL[result.position], boxShadow: `0 0 0 3px color-mix(in srgb, ${MEDAL[result.position]} 25%, transparent)` }}>{result.position}</span>
                : <span className="a-med a-med-n" style={{ width: 32, height: 32 }}>{result.position}</span>}
              <div className="flex-1 min-w-0">
                <div className="a-ink text-[14.5px] font-semibold truncate">{result.title}</div>
                <div className="a-dim text-[12.5px] mt-0.5">{result.totalCompetitors} competitors</div>
              </div>
              <span className="a-dim text-[12.5px] whitespace-nowrap">{new Date(result.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

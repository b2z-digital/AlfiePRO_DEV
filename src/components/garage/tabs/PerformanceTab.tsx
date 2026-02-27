import React, { useState, useEffect } from 'react';
import { TrendingUp, Award, TrendingDown, Activity, Calendar, Target } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { Line, Bar } from 'react-chartjs-2';
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
      if (skipper.boatId === boatId ||
          skipper.sailNo === sailNumber ||
          skipper.sail_number === sailNumber) {
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
      <div className={`
        rounded-2xl p-12 text-center
        ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
      `}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading performance data...</p>
      </div>
    );
  }

  if (raceResults.length === 0) {
    return (
      <div className={`
        rounded-2xl p-12 text-center
        ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
      `}>
        <Activity className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
        <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          No Race Data Yet
        </h3>
        <p className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Start racing with this boat to see performance analytics
        </p>
      </div>
    );
  }

  const chartData = {
    labels: raceResults.slice(0, 15).reverse().map(r =>
      new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    ),
    datasets: [
      {
        label: 'Position',
        data: raceResults.slice(0, 15).reverse().map(r => r.position),
        borderColor: darkMode ? 'rgb(34, 211, 238)' : 'rgb(8, 145, 178)',
        backgroundColor: darkMode ? 'rgba(34, 211, 238, 0.1)' : 'rgba(8, 145, 178, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: darkMode ? 'rgb(34, 211, 238)' : 'rgb(8, 145, 178)',
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: darkMode ? '#fff' : '#000',
        bodyColor: darkMode ? '#cbd5e1' : '#475569',
        borderColor: darkMode ? '#475569' : '#cbd5e1',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        reverse: true,
        beginAtZero: false,
        grid: {
          color: darkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b',
          stepSize: 1
        },
        title: {
          display: true,
          text: 'Position (Lower is Better)',
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      },
      x: {
        grid: {
          color: darkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      }
    }
  };

  const positionDistributionData = {
    labels: ['1st', '2nd', '3rd', '4-5th', '6-10th', '11+'],
    datasets: [
      {
        label: 'Finishes',
        data: [
          raceResults.filter(r => r.position === 1).length,
          raceResults.filter(r => r.position === 2).length,
          raceResults.filter(r => r.position === 3).length,
          raceResults.filter(r => r.position >= 4 && r.position <= 5).length,
          raceResults.filter(r => r.position >= 6 && r.position <= 10).length,
          raceResults.filter(r => r.position > 10).length,
        ],
        backgroundColor: [
          'rgba(234, 179, 8, 0.8)',   // Gold
          'rgba(168, 162, 158, 0.8)',  // Silver
          'rgba(205, 127, 50, 0.8)',   // Bronze
          'rgba(34, 211, 238, 0.8)',   // Cyan
          'rgba(147, 51, 234, 0.8)',   // Purple
          'rgba(100, 116, 139, 0.8)',  // Gray
        ],
        borderColor: darkMode ? 'rgba(30, 41, 59, 1)' : 'rgba(255, 255, 255, 1)',
        borderWidth: 2
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        titleColor: darkMode ? '#fff' : '#000',
        bodyColor: darkMode ? '#cbd5e1' : '#475569',
        borderColor: darkMode ? '#475569' : '#cbd5e1',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: darkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b',
          stepSize: 1
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Performance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className={`
          rounded-xl p-4
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className={darkMode ? 'text-cyan-400' : 'text-cyan-600'} />
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Total Races
            </span>
          </div>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {stats.totalRaces}
          </div>
        </div>

        <div className={`
          rounded-xl p-4
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <div className="flex items-center gap-2 mb-2">
            <Award size={16} className="text-yellow-500" />
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Best Finish
            </span>
          </div>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {stats.bestPosition ? `${stats.bestPosition}${['st', 'nd', 'rd'][stats.bestPosition - 1] || 'th'}` : '-'}
          </div>
        </div>

        <div className={`
          rounded-xl p-4
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Avg Position
            </span>
          </div>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {stats.avgPosition || '-'}
          </div>
        </div>

        <div className={`
          rounded-xl p-4
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <div className="flex items-center gap-2 mb-2">
            <Award size={16} className="text-orange-500" />
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Podiums
            </span>
          </div>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {stats.podiumFinishes}
          </div>
        </div>

        <div className={`
          rounded-xl p-4
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <div className="flex items-center gap-2 mb-2">
            <Award size={16} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Top 5
            </span>
          </div>
          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {stats.top5Finishes}
          </div>
        </div>

        <div className={`
          rounded-xl p-4
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <div className="flex items-center gap-2 mb-2">
            {stats.recentTrend === 'improving' ? (
              <TrendingUp size={16} className="text-green-500" />
            ) : stats.recentTrend === 'declining' ? (
              <TrendingDown size={16} className="text-red-500" />
            ) : (
              <Activity size={16} className={darkMode ? 'text-slate-400' : 'text-slate-600'} />
            )}
            <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Trend
            </span>
          </div>
          <div className={`text-sm font-bold ${
            stats.recentTrend === 'improving' ? 'text-green-500' :
            stats.recentTrend === 'declining' ? 'text-red-500' :
            darkMode ? 'text-slate-400' : 'text-slate-600'
          }`}>
            {stats.recentTrend === 'improving' ? 'Improving' :
             stats.recentTrend === 'declining' ? 'Declining' : 'Stable'}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Position Trend */}
        <div className={`
          rounded-2xl p-6
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Position Trend (Last 15 Races)
          </h3>
          <div style={{ height: '300px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Position Distribution */}
        <div className={`
          rounded-2xl p-6
          ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
        `}>
          <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Position Distribution
          </h3>
          <div style={{ height: '300px' }}>
            <Bar data={positionDistributionData} options={barOptions} />
          </div>
        </div>
      </div>

      {/* Recent Results */}
      <div className={`
        rounded-2xl p-6
        ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
      `}>
        <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Recent Results
        </h3>
        <div className="space-y-2">
          {raceResults.slice(0, 10).map((result, index) => (
            <div
              key={`${result.date}-${index}`}
              className={`
                flex items-center justify-between p-3 rounded-lg
                ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
              `}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center font-bold
                  ${result.position === 1 ? 'bg-yellow-500 text-white' :
                    result.position === 2 ? 'bg-gray-400 text-white' :
                    result.position === 3 ? 'bg-orange-500 text-white' :
                    darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'}
                `}>
                  {result.position}
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {result.title}
                  </p>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {result.totalCompetitors} competitors
                  </p>
                </div>
              </div>
              <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {new Date(result.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

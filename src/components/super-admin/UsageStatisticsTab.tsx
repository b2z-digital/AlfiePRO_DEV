import { useState, useEffect } from 'react';
import {
  Globe, Building, Users, MapPin, TrendingUp, Calendar,
  Trophy, BarChart3, Activity, ArrowUpRight, Filter
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import { supabase } from '../../utils/supabase';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement, Filler);

interface UsageStatisticsTabProps {
  darkMode: boolean;
  stats: {
    totalClubs: number;
    totalMembers: number;
    totalStateAssociations: number;
    totalNationalAssociations: number;
    totalEvents: number;
    totalRaces: number;
  };
  loading: boolean;
}

interface ClubDetail {
  id: string;
  name: string;
  abbreviation: string;
  state: string;
  country: string;
  memberCount: number;
  raceCount: number;
  createdAt: string;
}

interface StateBreakdown {
  state: string;
  clubs: number;
  members: number;
}

export function UsageStatisticsTab({ darkMode, stats, loading }: UsageStatisticsTabProps) {
  const [clubs, setClubs] = useState<ClubDetail[]>([]);
  const [stateBreakdown, setStateBreakdown] = useState<StateBreakdown[]>([]);
  const [monthlyGrowth, setMonthlyGrowth] = useState<{ month: string; clubs: number; members: number }[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [viewMode, setViewMode] = useState<'overview' | 'clubs'>('overview');

  useEffect(() => {
    loadDetailedStats();
  }, []);

  const loadDetailedStats = async () => {
    try {
      const { data: clubsData } = await supabase
        .from('clubs')
        .select('id, name, abbreviation, state, country, created_at');

      const { data: membersData } = await supabase
        .from('members')
        .select('id, club_id, created_at');

      const { data: racesData } = await supabase
        .from('quick_races')
        .select('id, club_id');

      const membersByClub: Record<string, number> = {};
      const racesByClub: Record<string, number> = {};

      (membersData || []).forEach(m => {
        membersByClub[m.club_id] = (membersByClub[m.club_id] || 0) + 1;
      });
      (racesData || []).forEach(r => {
        racesByClub[r.club_id] = (racesByClub[r.club_id] || 0) + 1;
      });

      const clubDetails: ClubDetail[] = (clubsData || []).map(c => ({
        id: c.id,
        name: c.name,
        abbreviation: c.abbreviation || '',
        state: c.state || 'Unknown',
        country: c.country || 'Australia',
        memberCount: membersByClub[c.id] || 0,
        raceCount: racesByClub[c.id] || 0,
        createdAt: c.created_at,
      }));

      setClubs(clubDetails);

      const stateMap: Record<string, { clubs: number; members: number }> = {};
      clubDetails.forEach(c => {
        const key = c.state || 'Unknown';
        if (!stateMap[key]) stateMap[key] = { clubs: 0, members: 0 };
        stateMap[key].clubs++;
        stateMap[key].members += c.memberCount;
      });

      setStateBreakdown(
        Object.entries(stateMap)
          .map(([state, data]) => ({ state, ...data }))
          .sort((a, b) => b.members - a.members)
      );

      const monthMap: Record<string, { clubs: number; members: number }> = {};
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap[key] = { clubs: 0, members: 0 };
      }

      (clubsData || []).forEach(c => {
        const d = new Date(c.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthMap[key] !== undefined) monthMap[key].clubs++;
      });
      (membersData || []).forEach(m => {
        const d = new Date(m.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthMap[key] !== undefined) monthMap[key].members++;
      });

      let cumulativeClubs = 0;
      let cumulativeMembers = 0;
      const growth = Object.entries(monthMap).map(([month, data]) => {
        cumulativeClubs += data.clubs;
        cumulativeMembers += data.members;
        return { month, clubs: cumulativeClubs, members: cumulativeMembers };
      });

      setMonthlyGrowth(growth);
    } catch (err) {
      console.error('Error loading detailed stats:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const chartColors = {
    grid: darkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.15)',
    text: darkMode ? '#94a3b8' : '#64748b',
    tooltipBg: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: darkMode ? '#e2e8f0' : '#334155',
    tooltipBorder: darkMode ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
  };

  const stateChartData = {
    labels: stateBreakdown.map(s => s.state),
    datasets: [{
      data: stateBreakdown.map(s => s.members),
      backgroundColor: [
        '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
      ],
      borderWidth: 0,
      borderRadius: 4,
    }],
  };

  const growthChartData = {
    labels: monthlyGrowth.map(g => {
      const [y, m] = g.month.split('-');
      return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
    }),
    datasets: [
      {
        label: 'Total Members',
        data: monthlyGrowth.map(g => g.members),
        borderColor: '#0ea5e9',
        backgroundColor: darkMode ? 'rgba(14, 165, 233, 0.1)' : 'rgba(14, 165, 233, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#0ea5e9',
      },
      {
        label: 'Total Clubs',
        data: monthlyGrowth.map(g => g.clubs),
        borderColor: '#10b981',
        backgroundColor: darkMode ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#10b981',
      },
    ],
  };

  const clubsByStateBarData = {
    labels: stateBreakdown.map(s => s.state),
    datasets: [
      {
        label: 'Clubs',
        data: stateBreakdown.map(s => s.clubs),
        backgroundColor: '#10b981',
        borderRadius: 6,
      },
      {
        label: 'Members',
        data: stateBreakdown.map(s => s.members),
        backgroundColor: '#0ea5e9',
        borderRadius: 6,
      },
    ],
  };

  const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: chartColors.text,
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
          font: { size: 12 },
        },
      },
      tooltip: {
        backgroundColor: chartColors.tooltipBg,
        titleColor: chartColors.tooltipText,
        bodyColor: chartColors.tooltipText,
        borderColor: chartColors.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { color: chartColors.grid },
        ticks: { color: chartColors.text, font: { size: 11 } },
      },
      y: {
        grid: { color: chartColors.grid },
        ticks: { color: chartColors.text, font: { size: 11 } },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('overview')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'overview'
                ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
                : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <BarChart3 size={14} className="inline mr-1.5" />
            Overview
          </button>
          <button
            onClick={() => setViewMode('clubs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'clubs'
                ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
                : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Building size={14} className="inline mr-1.5" />
            All Clubs
          </button>
        </div>
      </div>

      {viewMode === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`rounded-xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                <TrendingUp size={18} className="inline mr-2 text-sky-500" />
                Platform Growth (12 Months)
              </h3>
              <div className="h-[300px]">
                {loadingDetails ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <Line data={growthChartData} options={{ ...commonChartOptions }} />
                )}
              </div>
            </div>

            <div className={`rounded-xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                <MapPin size={18} className="inline mr-2 text-emerald-500" />
                Clubs & Members by State
              </h3>
              <div className="h-[300px]">
                {loadingDetails ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <Bar data={clubsByStateBarData} options={commonChartOptions} />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`rounded-xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                <Globe size={18} className="inline mr-2 text-amber-500" />
                Members by Region
              </h3>
              <div className="h-[250px]">
                {loadingDetails ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <Doughnut
                    data={stateChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: '60%',
                      plugins: {
                        legend: { display: true, position: 'bottom', labels: { color: chartColors.text, padding: 12, usePointStyle: true, font: { size: 11 } } },
                        tooltip: { backgroundColor: chartColors.tooltipBg, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText, borderColor: chartColors.tooltipBorder, borderWidth: 1, padding: 12, cornerRadius: 8 },
                      },
                    }}
                  />
                )}
              </div>
            </div>

            <div className={`lg:col-span-2 rounded-xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                <Activity size={18} className="inline mr-2 text-cyan-500" />
                State/Region Breakdown
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <th className="pb-3 pr-4">Region</th>
                      <th className="pb-3 pr-4 text-right">Clubs</th>
                      <th className="pb-3 pr-4 text-right">Members</th>
                      <th className="pb-3 text-right">Avg/Club</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {stateBreakdown.map((s) => (
                      <tr key={s.state} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                        <td className={`py-3 pr-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          <span className="inline-flex items-center gap-2">
                            <MapPin size={14} className="text-emerald-500" />
                            {s.state}
                          </span>
                        </td>
                        <td className={`py-3 pr-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{s.clubs}</td>
                        <td className={`py-3 pr-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{s.members}</td>
                        <td className={`py-3 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          {s.clubs > 0 ? (s.members / s.clubs).toFixed(1) : '0'}
                        </td>
                      </tr>
                    ))}
                    {stateBreakdown.length === 0 && (
                      <tr>
                        <td colSpan={4} className={`py-8 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          No data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-b border-slate-700/50' : 'text-slate-500 border-b border-slate-200'}`}>
                  <th className="p-4">Club</th>
                  <th className="p-4">State</th>
                  <th className="p-4">Country</th>
                  <th className="p-4 text-right">Members</th>
                  <th className="p-4 text-right">Races</th>
                  <th className="p-4 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {clubs
                  .sort((a, b) => b.memberCount - a.memberCount)
                  .map((club) => (
                    <tr key={club.id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className={`p-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${darkMode ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-700'}`}>
                            {club.abbreviation?.slice(0, 2) || club.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium">{club.name}</p>
                            {club.abbreviation && (
                              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{club.abbreviation}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`p-4 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{club.state}</td>
                      <td className={`p-4 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{club.country}</td>
                      <td className="p-4 text-right">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                          club.memberCount > 0
                            ? darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                            : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Users size={12} />
                          {club.memberCount}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                          club.raceCount > 0
                            ? darkMode ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-700'
                            : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Trophy size={12} />
                          {club.raceCount}
                        </span>
                      </td>
                      <td className={`p-4 text-right text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date(club.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

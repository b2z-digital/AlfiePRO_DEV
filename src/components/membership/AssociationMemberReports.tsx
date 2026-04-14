import React, { useState, useEffect } from 'react';
import {
  Users, TrendingUp, TrendingDown, Calendar, BarChart3,
  PieChart as PieChartIcon, LineChart as LineChartIcon,
  Download, Filter, Sparkles, Target, Building2, Crown,
  ChevronDown, FileText, Plus
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Doughnut, Bar, Pie } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { CustomReportBuilder } from './CustomReportBuilder';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AssociationMemberReportsProps {
  darkMode: boolean;
  stateAssociationId?: string;
}

interface MembershipMetrics {
  totalMembers: number;
  financialMembers: number;
  newMembersThisYear: number;
  retentionRate: number;
  growthRate: number;
  averageAge: number;
}

interface ClubMetrics {
  clubId: string;
  clubName: string;
  memberCount: number;
  financialCount: number;
  newMembersThisYear: number;
  retentionRate: number;
  growthRate: number;
}

interface MonthlyTrend {
  month: string;
  newMembers: number;
  renewals: number;
  lapsed: number;
  total: number;
}

interface MembershipTypeBreakdown {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

export const AssociationMemberReports: React.FC<AssociationMemberReportsProps> = ({
  darkMode,
  stateAssociationId: propStateAssociationId
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'clubs' | 'custom'>('overview');
  const [dateRange, setDateRange] = useState('this-year');
  const [metrics, setMetrics] = useState<MembershipMetrics>({
    totalMembers: 0,
    financialMembers: 0,
    newMembersThisYear: 0,
    retentionRate: 0,
    growthRate: 0,
    averageAge: 0
  });
  const [clubMetrics, setClubMetrics] = useState<ClubMetrics[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [membershipTypeBreakdown, setMembershipTypeBreakdown] = useState<MembershipTypeBreakdown[]>([]);
  const [showCustomReportBuilder, setShowCustomReportBuilder] = useState(false);
  const [resolvedStateAssociationId, setResolvedStateAssociationId] = useState<string | undefined>(propStateAssociationId);

  useEffect(() => {
    if (user) {
      fetchReportData();
    }
  }, [user, propStateAssociationId, dateRange]);

  const fetchReportData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      let stateId = propStateAssociationId;

      if (!stateId) {
        const { data: userStateAssoc } = await supabase
          .from('user_state_associations')
          .select('state_association_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (userStateAssoc) {
          stateId = (userStateAssoc as any).state_association_id;
        }
      }

      if (!stateId) {
        throw new Error('No state association found');
      }

      setResolvedStateAssociationId(stateId);

      // Get all clubs in this state
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, name')
        .eq('state_association_id', stateId);

      if (!clubs || clubs.length === 0) {
        setLoading(false);
        return;
      }

      const clubIds = clubs.map(c => c.id);

      // Get all members from these clubs
      const { data: members } = await supabase
        .from('members')
        .select('*')
        .in('club_id', clubIds);

      if (!members) {
        setLoading(false);
        return;
      }

      // Calculate metrics
      const currentYear = new Date().getFullYear();
      const currentDate = new Date();
      const yearStart = new Date(currentYear, 0, 1);

      const totalMembers = members.filter(m => m.membership_status === 'active').length;
      const financialMembers = members.filter(m => m.is_financial).length;
      const newMembersThisYear = members.filter(m => {
        if (!m.date_joined) return false;
        const joinDate = new Date(m.date_joined);
        return joinDate >= yearStart;
      }).length;

      // Get last year's member count for growth rate
      const lastYear = currentYear - 1;
      const lastYearEnd = new Date(lastYear, 11, 31);
      const lastYearMembers = members.filter(m => {
        if (!m.date_joined) return false;
        const joinDate = new Date(m.date_joined);
        return joinDate <= lastYearEnd;
      }).length;

      const growthRate = lastYearMembers > 0
        ? ((totalMembers - lastYearMembers) / lastYearMembers) * 100
        : 0;

      // Calculate retention rate
      const renewalsThisYear = members.filter(m => {
        if (!m.renewal_date) return false;
        const renewalDate = new Date(m.renewal_date);
        return renewalDate.getFullYear() === currentYear;
      }).length;

      const retentionRate = lastYearMembers > 0
        ? (renewalsThisYear / lastYearMembers) * 100
        : 0;

      setMetrics({
        totalMembers,
        financialMembers,
        newMembersThisYear,
        retentionRate,
        growthRate,
        averageAge: 0 // Calculate if we have DOB data
      });

      // Calculate club-level metrics
      const clubMetricsData: ClubMetrics[] = clubs.map(club => {
        const clubMembers = members.filter(m => m.club_id === club.id && m.membership_status === 'active');
        const clubFinancial = clubMembers.filter(m => m.is_financial).length;

        // New members this year for this club
        const clubNewMembers = members.filter(m => {
          if (m.club_id !== club.id) return false;
          if (!m.date_joined) return false;
          const joinDate = new Date(m.date_joined);
          return joinDate >= yearStart;
        }).length;

        // Calculate YoY membership growth
        // Current active members
        const currentActive = clubMembers.length;

        // Estimate last year's member count:
        // Returning members (active now, joined before this year) + new members this year
        // = would give us current count, so:
        // Last year ≈ Current active members - New members this year + Members who left
        // Since we can't easily track members who left, use:
        // Returning members = current active who joined before this year
        const returningMembers = clubMembers.filter(m => {
          if (!m.date_joined) return false;
          const joinDate = new Date(m.date_joined);
          return joinDate < yearStart;
        }).length;

        // Last year's estimate = returning members (this is conservative, assumes these were the only members last year)
        // Better estimate: Check if we have renewal data from last year
        const clubMembersRenewedLastYear = members.filter(m => {
          if (m.club_id !== club.id) return false;
          if (!m.renewal_date) return false;
          const renewalDate = new Date(m.renewal_date);
          return renewalDate.getFullYear() === lastYear;
        }).length;

        // Use whichever gives us a better estimate of last year's membership
        // If we have renewal data from last year, use that as it's more accurate
        const clubLastYearActive = clubMembersRenewedLastYear > 0
          ? clubMembersRenewedLastYear
          : returningMembers;

        // Calculate YoY growth: ((Current - Last Year) / Last Year) * 100
        const clubGrowth = clubLastYearActive > 0
          ? ((currentActive - clubLastYearActive) / clubLastYearActive) * 100
          : (currentActive > 0 ? 100 : 0);

        // Retention rate for this club
        const clubRenewalsThisYear = members.filter(m => {
          if (m.club_id !== club.id) return false;
          if (!m.renewal_date) return false;
          const renewalDate = new Date(m.renewal_date);
          return renewalDate.getFullYear() === currentYear;
        }).length;

        const clubRetention = clubLastYearActive > 0
          ? (clubRenewalsThisYear / clubLastYearActive) * 100
          : 0;

        return {
          clubId: club.id,
          clubName: club.name,
          memberCount: clubMembers.length,
          financialCount: clubFinancial,
          newMembersThisYear: clubNewMembers,
          retentionRate: clubRetention,
          growthRate: clubGrowth
        };
      });

      setClubMetrics(clubMetricsData);

      // Calculate monthly trends
      const monthlyData: MonthlyTrend[] = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(currentYear, i, 1);
        const monthEnd = new Date(currentYear, i + 1, 0);

        const newInMonth = members.filter(m => {
          if (!m.date_joined) return false;
          const joinDate = new Date(m.date_joined);
          return joinDate >= monthStart && joinDate <= monthEnd;
        }).length;

        const renewalsInMonth = members.filter(m => {
          if (!m.renewal_date) return false;
          const renewalDate = new Date(m.renewal_date);
          return renewalDate >= monthStart && renewalDate <= monthEnd;
        }).length;

        const totalUpToMonth = members.filter(m => {
          if (!m.date_joined) return false;
          const joinDate = new Date(m.date_joined);
          return joinDate <= monthEnd && m.membership_status === 'active';
        }).length;

        monthlyData.push({
          month: months[i],
          newMembers: newInMonth,
          renewals: renewalsInMonth,
          lapsed: 0, // Calculate based on renewal dates
          total: totalUpToMonth
        });
      }

      setMonthlyTrends(monthlyData);

      // Calculate membership type breakdown
      const typeBreakdown: Record<string, number> = {};
      members.filter(m => m.membership_status === 'active').forEach(m => {
        const type = m.membership_level || 'Standard';
        typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
      });

      const colors = [
        '#3B82F6', // blue
        '#10B981', // green
        '#F59E0B', // amber
        '#EF4444', // red
        '#8B5CF6', // purple
        '#EC4899', // pink
        '#06B6D4', // cyan
      ];

      const breakdownData: MembershipTypeBreakdown[] = Object.entries(typeBreakdown).map(([type, count], index) => ({
        type,
        count,
        percentage: (count / totalMembers) * 100,
        color: colors[index % colors.length]
      }));

      setMembershipTypeBreakdown(breakdownData);

    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();

    doc.setFontSize(20);
    doc.text('Member Reports', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated on ${date}`, 14, 28);

    // Add metrics summary
    doc.setFontSize(14);
    doc.text('Overview', 14, 40);
    doc.setFontSize(10);

    const summaryData = [
      ['Total Members', metrics.totalMembers.toString()],
      ['Financial Members', metrics.financialMembers.toString()],
      ['New Members This Year', metrics.newMembersThisYear.toString()],
      ['Retention Rate', `${metrics.retentionRate.toFixed(1)}%`],
      ['Growth Rate', `${metrics.growthRate.toFixed(1)}%`]
    ];

    (doc as any).autoTable({
      startY: 45,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'grid'
    });

    // Add club metrics
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Club Performance', 14, 20);

    const clubData = clubMetrics.map(club => [
      club.clubName,
      club.memberCount.toString(),
      club.financialCount.toString(),
      club.newMembersThisYear.toString(),
      `${club.retentionRate.toFixed(1)}%`,
      `${club.growthRate.toFixed(1)}%`
    ]);

    (doc as any).autoTable({
      startY: 25,
      head: [['Club', 'Total Members', 'Financial Members', 'New Members', 'Retention', 'Growth']],
      body: clubData,
      theme: 'grid'
    });

    doc.save(`member-reports-${date}.pdf`);
  };

  // Chart configurations
  const membershipTrendChartData = {
    labels: monthlyTrends.map(m => m.month),
    datasets: [
      {
        label: 'Total Members',
        data: monthlyTrends.map(m => m.total),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'New Members',
        data: monthlyTrends.map(m => m.newMembers),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Renewals',
        data: monthlyTrends.map(m => m.renewals),
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const membershipTypeChartData = {
    labels: membershipTypeBreakdown.map(m => m.type),
    datasets: [
      {
        data: membershipTypeBreakdown.map(m => m.count),
        backgroundColor: membershipTypeBreakdown.map(m => m.color),
        borderWidth: 0
      }
    ]
  };

  const clubPerformanceChartData = {
    labels: clubMetrics.slice(0, 10).map(c => c.clubName),
    datasets: [
      {
        label: 'Total Members',
        data: clubMetrics.slice(0, 10).map(c => c.memberCount),
        backgroundColor: '#3B82F6',
      },
      {
        label: 'Financial Members',
        data: clubMetrics.slice(0, 10).map(c => c.financialCount),
        backgroundColor: '#10B981',
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: darkMode ? '#E2E8F0' : '#1E293B',
          font: {
            size: 12
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)'
        },
        ticks: {
          color: darkMode ? '#94A3B8' : '#64748B'
        }
      },
      y: {
        grid: {
          color: darkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)'
        },
        ticks: {
          color: darkMode ? '#94A3B8' : '#64748B'
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: darkMode ? '#E2E8F0' : '#1E293B',
          font: {
            size: 12
          },
          padding: 15
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-8 lg:p-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                <BarChart3 className="text-white" size={28} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  Member Reports
                </h1>
                <p className="text-sm text-slate-400">
                  Analytics and insights across your member base
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCustomReportBuilder(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                <Plus size={18} />
                Custom Report
              </button>
              <button
                onClick={exportToPDF}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <Download size={18} />
                Export PDF
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'trends'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              Trends
            </button>
            <button
              onClick={() => setActiveTab('clubs')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'clubs'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              Club Performance
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              Custom Reports
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Users className="text-blue-400" size={24} />
                  <span className="text-xs text-blue-400 font-medium">TOTAL</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">
                  {metrics.totalMembers}
                </div>
                <div className="text-sm text-slate-400">Total Members</div>
              </div>

              <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border border-emerald-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Target className="text-emerald-400" size={24} />
                  <span className="text-xs text-emerald-400 font-medium">FINANCIAL</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">
                  {metrics.financialMembers}
                </div>
                <div className="text-sm text-slate-400">
                  {((metrics.financialMembers / metrics.totalMembers) * 100).toFixed(1)}% financial rate
                </div>
              </div>

              <div className="p-6 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Sparkles className="text-purple-400" size={24} />
                  {metrics.growthRate >= 0 ? (
                    <TrendingUp className="text-purple-400" size={20} />
                  ) : (
                    <TrendingDown className="text-purple-400" size={20} />
                  )}
                </div>
                <div className="text-3xl font-bold text-white mb-1">
                  {metrics.newMembersThisYear}
                </div>
                <div className="text-sm text-slate-400">
                  New this year ({metrics.growthRate.toFixed(1)}% growth)
                </div>
              </div>

              <div className="p-6 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/10 border border-amber-500/20">
                <div className="flex items-center justify-between mb-4">
                  <Crown className="text-amber-400" size={24} />
                  <span className="text-xs text-amber-400 font-medium">RETENTION</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">
                  {metrics.retentionRate.toFixed(1)}%
                </div>
                <div className="text-sm text-slate-400">Member retention rate</div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Membership Type Breakdown */}
              <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <PieChartIcon size={20} className="text-blue-400" />
                  Membership Type Breakdown
                </h3>
                <div style={{ height: '300px' }}>
                  <Doughnut data={membershipTypeChartData} options={doughnutOptions} />
                </div>
              </div>

              {/* Monthly Growth Trend */}
              <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <LineChartIcon size={20} className="text-emerald-400" />
                  Growth Overview
                </h3>
                <div style={{ height: '300px' }}>
                  <Line data={membershipTrendChartData} options={chartOptions} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trends Tab */}
        {activeTab === 'trends' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4">Membership Trends</h3>
              <div style={{ height: '400px' }}>
                <Line data={membershipTrendChartData} options={chartOptions} />
              </div>
            </div>

            {/* Monthly Breakdown Table */}
            <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4">Monthly Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Month</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">New Members</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Renewals</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {monthlyTrends.map((month) => (
                      <tr key={month.month} className="hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-white">{month.month}</td>
                        <td className="px-4 py-3 text-right text-emerald-400">{month.newMembers}</td>
                        <td className="px-4 py-3 text-right text-blue-400">{month.renewals}</td>
                        <td className="px-4 py-3 text-right text-white font-medium">{month.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Clubs Tab */}
        {activeTab === 'clubs' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4">Club Performance Comparison</h3>
              <div style={{ height: '400px' }}>
                <Bar data={clubPerformanceChartData} options={chartOptions} />
              </div>
            </div>

            {/* Club Metrics Table */}
            <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50">
              <h3 className="text-lg font-semibold text-white mb-4">Detailed Club Metrics</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Club</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Total Members</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Financial Members</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">New Members</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Retention Rate</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Member Growth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {clubMetrics.map((club) => (
                      <tr key={club.clubId} className="hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-white">{club.clubName}</td>
                        <td className="px-4 py-3 text-right text-white">{club.memberCount}</td>
                        <td className="px-4 py-3 text-right text-emerald-400">
                          {club.financialCount}
                          <span className="text-slate-500 text-xs ml-1">
                            ({club.memberCount > 0 ? ((club.financialCount / club.memberCount) * 100).toFixed(0) : 0}%)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-blue-400">{club.newMembersThisYear}</td>
                        <td className="px-4 py-3 text-right text-purple-400">
                          {club.retentionRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`flex items-center justify-end gap-1 ${club.growthRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {club.growthRate >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {club.growthRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Custom Reports Tab */}
        {activeTab === 'custom' && (
          <div className="space-y-6">
            <div className="p-12 rounded-xl bg-slate-800/30 border border-slate-700/50 text-center">
              <div className="max-w-2xl mx-auto">
                <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-6">
                  <FileText className="text-purple-400" size={32} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">
                  Custom Report Builder
                </h3>
                <p className="text-slate-400 mb-6">
                  Create custom reports with specific metrics, filters, and visualizations tailored to your needs.
                </p>
                <button
                  onClick={() => setShowCustomReportBuilder(true)}
                  className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
                >
                  Build Custom Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Custom Report Builder Modal */}
      <CustomReportBuilder
        isOpen={showCustomReportBuilder}
        onClose={() => setShowCustomReportBuilder(false)}
        darkMode={darkMode}
        stateAssociationId={resolvedStateAssociationId}
      />
    </div>
  );
};

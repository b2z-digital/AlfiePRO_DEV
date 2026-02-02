import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import { Send, Mail, Users, TrendingUp, Activity, Plus, X, Palette } from 'lucide-react';
import { getMarketingOverviewStats, createMarketingCampaign } from '../utils/marketingStorage';
import type { MarketingOverviewStats } from '../types/marketing';
import { supabase } from '../utils/supabase';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
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
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MarketingPageProps {
  darkMode?: boolean;
}

export default function MarketingPage({ darkMode = true }: MarketingPageProps) {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [stats, setStats] = useState<MarketingOverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignSubject, setCampaignSubject] = useState('');

  useEffect(() => {
    loadStats();
  }, [currentClub]);

  async function loadStats() {
    if (!currentClub) return;

    try {
      setLoading(true);
      const data = await getMarketingOverviewStats(currentClub.clubId);
      setStats(data);
    } catch (error) {
      console.error('Error loading marketing stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCampaign() {
    if (!currentClub || !campaignName.trim() || !campaignSubject.trim()) return;

    try {
      const { data: user } = await supabase.auth.getUser();

      const campaign = await createMarketingCampaign({
        club_id: currentClub.clubId,
        name: campaignName,
        subject: campaignSubject,
        from_name: currentClub.club?.name || 'Club Admin',
        from_email: user.user?.email || 'noreply@alfiepro.com.au',
        status: 'draft'
      });

      setShowCampaignModal(false);
      setCampaignName('');
      setCampaignSubject('');

      addNotification('Campaign created successfully', 'success');

      // Navigate to campaigns page
      navigate('/marketing/campaigns');
    } catch (error) {
      console.error('Error creating campaign:', error);
      addNotification('Failed to create campaign. Please try again.', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const chartData = {
    labels: ['Sent', 'Delivered', 'Opened', 'Clicked'],
    datasets: [
      {
        label: 'Email Performance',
        data: [
          stats?.period_stats.sent || 0,
          stats?.period_stats.delivered || 0,
          stats?.period_stats.opened || 0,
          stats?.period_stats.clicked || 0
        ],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
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
        mode: 'index' as const,
        intersect: false,
        backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: darkMode ? '#e2e8f0' : '#1e293b',
        bodyColor: darkMode ? '#cbd5e1' : '#475569',
        borderColor: darkMode ? 'rgba(71, 85, 105, 0.5)' : 'rgba(203, 213, 225, 0.5)',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: darkMode ? 'rgba(71, 85, 105, 0.2)' : 'rgba(203, 213, 225, 0.5)'
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b'
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
    <div className="p-16 space-y-6">
      {/* Header with Icon and Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <Send className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Marketing
            </h1>
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
              Manage your email campaigns and automation flows
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/marketing/campaigns')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
          >
            <Send className="w-5 h-5" />
            Campaigns
          </button>
          <button
            onClick={() => navigate('/marketing/flows')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              darkMode
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Activity className="w-5 h-5" />
            Flows
          </button>
          <button
            onClick={() => navigate('/marketing/subscribers')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              darkMode
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Users className="w-5 h-5" />
            Lists
          </button>
          <button
            onClick={() => navigate('/marketing/templates')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              darkMode
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Palette className="w-5 h-5" />
            Templates
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={`rounded-xl p-6 ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Total Campaigns</p>
              <p className={`text-3xl font-bold mt-1 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                {stats?.total_campaigns || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-500" />
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-6 ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Active Flows</p>
              <p className={`text-3xl font-bold mt-1 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                {stats?.active_flows || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-500" />
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-6 ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Total Subscribers</p>
              <p className={`text-3xl font-bold mt-1 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                {stats?.total_subscribers || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-500" />
            </div>
          </div>
        </div>

        <div className={`rounded-xl p-6 ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Avg. Open Rate</p>
              <p className={`text-3xl font-bold mt-1 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                {stats?.period_stats.avg_open_rate.toFixed(1) || 0}%
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Last 30 Days Performance */}
      <div className={`rounded-xl p-6 ${
        darkMode
          ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
          : 'bg-white shadow-sm border border-gray-200'
      }`}>
        <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
          Last 30 Days Performance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <div className={`flex items-center gap-2 text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              <Send className="w-4 h-4" />
              Sent
            </div>
            <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              {stats?.period_stats.sent.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <div className={`flex items-center gap-2 text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              <Mail className="w-4 h-4" />
              Delivered
            </div>
            <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              {stats?.period_stats.delivered.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <div className={`flex items-center gap-2 text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              <Activity className="w-4 h-4" />
              Opened
            </div>
            <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              {stats?.period_stats.opened.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <div className={`flex items-center gap-2 text-sm mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              <TrendingUp className="w-4 h-4" />
              Clicked
            </div>
            <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              {stats?.period_stats.clicked.toLocaleString() || 0}
            </p>
          </div>
        </div>
        <div className="h-64">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Recent Campaigns & Flows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Campaigns */}
        <div className={`rounded-xl p-6 ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Recent Campaigns
            </h2>
            <Link to="/marketing/campaigns" className="text-sm text-blue-500 hover:text-blue-600">
              View all
            </Link>
          </div>
          {stats?.recent_campaigns && stats.recent_campaigns.length > 0 ? (
            <div className="space-y-3">
              {stats.recent_campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  to={`/marketing/campaigns/${campaign.id}`}
                  className={`block p-4 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-slate-700/30 hover:bg-slate-700/50'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        {campaign.name}
                      </h3>
                      <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        {campaign.subject}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span className={`px-2 py-1 rounded-full ${
                          campaign.status === 'sent' ? 'bg-green-500/20 text-green-400' :
                          campaign.status === 'draft' ? darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700' :
                          campaign.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {campaign.status}
                        </span>
                        {campaign.status === 'sent' && (
                          <>
                            <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>
                              {campaign.total_opened} opens
                            </span>
                            <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>
                              {campaign.total_clicked} clicks
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Mail className={`w-12 h-12 mx-auto mb-2 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
              <p className={darkMode ? 'text-slate-400' : 'text-gray-500'}>No campaigns yet</p>
              <Link to="/marketing/campaigns/new" className="text-blue-500 hover:text-blue-600 text-sm mt-2 inline-block">
                Create your first campaign
              </Link>
            </div>
          )}
        </div>

        {/* Recent Flows */}
        <div className={`rounded-xl p-6 ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Automation Flows
            </h2>
            <Link to="/marketing/flows" className="text-sm text-blue-500 hover:text-blue-600">
              View all
            </Link>
          </div>
          {stats?.recent_flows && stats.recent_flows.length > 0 ? (
            <div className="space-y-3">
              {stats.recent_flows.map((flow) => (
                <Link
                  key={flow.id}
                  to={`/marketing/flows/${flow.id}`}
                  className={`block p-4 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-slate-700/30 hover:bg-slate-700/50'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
                        {flow.name}
                      </h3>
                      <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        {flow.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span className={`px-2 py-1 rounded-full ${
                          flow.status === 'active' ? 'bg-green-500/20 text-green-400' :
                          flow.status === 'draft' ? darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700' :
                          flow.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                          darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {flow.status}
                        </span>
                        {flow.status === 'active' && (
                          <>
                            <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>
                              {flow.currently_active} active
                            </span>
                            <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>
                              {flow.total_enrolled} enrolled
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className={`w-12 h-12 mx-auto mb-2 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
              <p className={darkMode ? 'text-slate-400' : 'text-gray-500'}>No automation flows yet</p>
              <Link to="/marketing/flows/new" className="text-blue-500 hover:text-blue-600 text-sm mt-2 inline-block">
                Create your first flow
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-8 text-white">
        <h2 className="text-2xl font-bold mb-4">Ready to grow your reach?</h2>
        <p className="text-blue-100 mb-6">
          Create powerful email campaigns and automation flows to engage your members and promote your events.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/marketing/campaigns"
            className="px-6 py-3 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
          >
            Browse Campaigns
          </Link>
          <Link
            to="/marketing/templates"
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            View Templates
          </Link>
          <Link
            to="/marketing/subscribers"
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            Manage Subscribers
          </Link>
        </div>
      </div>

      {/* Create Campaign Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`max-w-md w-full rounded-xl p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Create New Campaign
              </h2>
              <button
                onClick={() => setShowCampaignModal(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Summer Regatta 2024"
                  className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Email Subject
                </label>
                <input
                  type="text"
                  value={campaignSubject}
                  onChange={(e) => setCampaignSubject(e.target.value)}
                  placeholder="e.g., Join us for the Summer Regatta!"
                  className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCampaignModal(false);
                  setCampaignName('');
                  setCampaignSubject('');
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={!campaignName.trim() || !campaignSubject.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Flow Modal */}
    </div>
  );
}

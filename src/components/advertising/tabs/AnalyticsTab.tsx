import React, { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
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
  Filler,
} from 'chart.js';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { AdCampaign, CampaignAnalytics } from '../../../types/advertising';
import { Download, TrendingUp, MousePointer, Eye, DollarSign, Calendar } from 'lucide-react';
import { useNotification } from '../../../contexts/NotificationContext';

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

export const AnalyticsTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const { addNotification } = useNotification();

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      loadAnalytics();
    }
  }, [selectedCampaign, dateRange]);

  const loadCampaigns = async () => {
    try {
      const data = await advertisingStorage.getCampaigns();
      setCampaigns(data);
      if (data.length > 0 && !selectedCampaign) {
        setSelectedCampaign(data[0].id);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
      addNotification('Failed to load campaigns', 'error');
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await advertisingStorage.getCampaignAnalytics(
        selectedCampaign,
        dateRange.start,
        dateRange.end
      );
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
      addNotification('Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = () => {
    if (!analytics) return;

    const report = {
      campaign: analytics.campaign_name,
      advertiser: analytics.advertiser_name,
      dateRange: `${dateRange.start} to ${dateRange.end}`,
      metrics: {
        totalImpressions: analytics.total_impressions,
        totalClicks: analytics.total_clicks,
        ctr: `${analytics.ctr.toFixed(2)}%`,
        totalCost: `$${analytics.total_cost.toFixed(2)}`,
        avgCPM: `$${analytics.avg_cpm.toFixed(2)}`,
      },
      impressionsByDate: analytics.impressions_by_date,
      clicksByDate: analytics.clicks_by_date,
      impressionsByState: analytics.impressions_by_state,
      impressionsByDevice: analytics.impressions_by_device,
      topPlacements: analytics.top_placements,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-analytics-${analytics.campaign_name}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addNotification('Report exported successfully', 'success');
  };

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No campaigns found. Create a campaign to view analytics.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">
          No analytics data available for this campaign.
        </p>
      </div>
    );
  }

  // Chart configurations
  const impressionsClicksChartData = {
    labels: analytics.impressions_by_date.map((d) => d.date),
    datasets: [
      {
        label: 'Impressions',
        data: analytics.impressions_by_date.map((d) => d.count),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Clicks',
        data: analytics.clicks_by_date.map((d) => {
          const date = d.date;
          return analytics.clicks_by_date.find((c) => c.date === date)?.count || 0;
        }),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const deviceChartData = {
    labels: analytics.impressions_by_device.map((d) => d.device),
    datasets: [
      {
        data: analytics.impressions_by_device.map((d) => d.count),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(245, 158, 11)',
        ],
        borderWidth: 2,
      },
    ],
  };

  const stateChartData = {
    labels: analytics.impressions_by_state.map((d) => d.state),
    datasets: [
      {
        label: 'Impressions by State',
        data: analytics.impressions_by_state.map((d) => d.count),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <span className="flex items-center text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <button
          onClick={exportReport}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export Report
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Impressions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {analytics.total_impressions.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Eye className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Clicks</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {analytics.total_clicks.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <MousePointer className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">CTR</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {analytics.ctr.toFixed(2)}%
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                ${analytics.total_cost.toFixed(2)}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <DollarSign className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Avg CPM</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                ${analytics.avg_cpm.toFixed(2)}
              </p>
            </div>
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
              <Calendar className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Impressions & Clicks Over Time */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Performance Over Time
        </h3>
        <Line
          data={impressionsClicksChartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  color: 'rgb(156, 163, 175)',
                },
              },
            },
            scales: {
              x: {
                grid: {
                  color: 'rgba(156, 163, 175, 0.1)',
                },
                ticks: {
                  color: 'rgb(156, 163, 175)',
                },
              },
              y: {
                grid: {
                  color: 'rgba(156, 163, 175, 0.1)',
                },
                ticks: {
                  color: 'rgb(156, 163, 175)',
                },
              },
            },
          }}
          height={300}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Device Distribution
          </h3>
          <div className="h-64">
            <Doughnut
              data={deviceChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      color: 'rgb(156, 163, 175)',
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Top States */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Top States
          </h3>
          <div className="h-64">
            <Bar
              data={stateChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                  },
                },
                scales: {
                  x: {
                    grid: {
                      color: 'rgba(156, 163, 175, 0.1)',
                    },
                    ticks: {
                      color: 'rgb(156, 163, 175)',
                    },
                  },
                  y: {
                    grid: {
                      color: 'rgba(156, 163, 175, 0.1)',
                    },
                    ticks: {
                      color: 'rgb(156, 163, 175)',
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Top Placements */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Top Placements
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Placement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Impressions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Clicks
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  CTR
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {analytics.top_placements.map((placement, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {placement.placement_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {placement.impressions.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {placement.clicks.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {placement.impressions > 0
                      ? ((placement.clicks / placement.impressions) * 100).toFixed(2)
                      : '0.00'}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

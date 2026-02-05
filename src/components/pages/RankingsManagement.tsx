import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Upload, AlertCircle, CheckCircle, Clock, MapPin, Link2 } from 'lucide-react';
import type { NationalRanking, RankingSyncLog, RankingURLConfig } from '../../types/rankings';
import {
  getAllRankings,
  getRankingsByClass,
  scrapeRankings,
  getSyncLogs,
} from '../../utils/rankingsStorage';

interface RankingsManagementProps {
  nationalAssociationId: string;
}

// Default URLs for different yacht classes
const DEFAULT_RANKING_URLS: RankingURLConfig[] = [
  { yachtClassName: 'IOM', url: 'https://radiosailing.org.au/index.php?arcade=iom-ranking' },
  { yachtClassName: 'DF95', url: 'https://radiosailing.org.au/index.php?arcade=df95-ranking' },
  { yachtClassName: 'DF65', url: 'https://radiosailing.org.au/index.php?arcade=df65-ranking' },
  { yachtClassName: 'Marblehead', url: 'https://radiosailing.org.au/index.php?arcade=marblehead-ranking' },
  { yachtClassName: '10 Rater', url: 'https://radiosailing.org.au/index.php?arcade=10r-ranking' },
  { yachtClassName: 'A Class', url: 'https://radiosailing.org.au/index.php?arcade=a-class-ranking' },
];

export const RankingsManagement: React.FC<RankingsManagementProps> = ({
  nationalAssociationId,
}) => {
  const [rankings, setRankings] = useState<NationalRanking[]>([]);
  const [syncLogs, setSyncLogs] = useState<RankingSyncLog[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [urlConfigs, setUrlConfigs] = useState<RankingURLConfig[]>(DEFAULT_RANKING_URLS);
  const [loading, setLoading] = useState(false);
  const [syncingClass, setSyncingClass] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadRankings();
    loadSyncLogs();
  }, [nationalAssociationId]);

  async function loadRankings() {
    try {
      setLoading(true);
      const data = await getAllRankings(nationalAssociationId);
      setRankings(data);
    } catch (err: any) {
      console.error('Error loading rankings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncLogs() {
    try {
      const logs = await getSyncLogs(nationalAssociationId, 10);
      setSyncLogs(logs);
    } catch (err: any) {
      console.error('Error loading sync logs:', err);
    }
  }

  async function handleSyncClass(yachtClassName: string, url: string) {
    try {
      setSyncingClass(yachtClassName);
      setError(null);
      setSuccess(null);

      const result = await scrapeRankings(url, yachtClassName, nationalAssociationId);

      if (result.success) {
        setSuccess(`Successfully imported ${result.rankingsImported} rankings for ${yachtClassName}`);
        await loadRankings();
        await loadSyncLogs();
      } else {
        setError(`Failed to import rankings for ${yachtClassName}`);
      }
    } catch (err: any) {
      console.error('Error syncing rankings:', err);
      setError(err.message);
    } finally {
      setSyncingClass(null);
    }
  }

  async function handleSyncAll() {
    setError(null);
    setSuccess(null);
    let successCount = 0;
    let failCount = 0;

    for (const config of urlConfigs) {
      try {
        setSyncingClass(config.yachtClassName);
        const result = await scrapeRankings(
          config.url,
          config.yachtClassName,
          nationalAssociationId
        );

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(`Error syncing ${config.yachtClassName}:`, err);
        failCount++;
      }
    }

    setSyncingClass(null);
    await loadRankings();
    await loadSyncLogs();

    if (failCount === 0) {
      setSuccess(`Successfully synced all ${successCount} classes`);
    } else {
      setError(`Synced ${successCount} classes, ${failCount} failed`);
    }
  }

  const classGroups = rankings.reduce((acc, ranking) => {
    if (!acc[ranking.yacht_class_name]) {
      acc[ranking.yacht_class_name] = [];
    }
    acc[ranking.yacht_class_name].push(ranking);
    return acc;
  }, {} as Record<string, NationalRanking[]>);

  const displayedRankings = selectedClass
    ? classGroups[selectedClass] || []
    : rankings;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">National Rankings</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage and sync national rankings for all yacht classes
          </p>
        </div>

        <button
          onClick={handleSyncAll}
          disabled={syncingClass !== null}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${syncingClass ? 'animate-spin' : ''}`} />
          <span>Sync All Classes</span>
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">Success</p>
            <p className="text-sm text-green-700 mt-1">{success}</p>
          </div>
        </div>
      )}

      {/* URL Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Ranking Source URLs</h3>

        <div className="space-y-3">
          {urlConfigs.map((config, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={config.yachtClassName}
                  onChange={(e) => {
                    const updated = [...urlConfigs];
                    updated[index].yachtClassName = e.target.value;
                    setUrlConfigs(updated);
                  }}
                  placeholder="Class name (e.g., IOM)"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="url"
                  value={config.url}
                  onChange={(e) => {
                    const updated = [...urlConfigs];
                    updated[index].url = e.target.value;
                    setUrlConfigs(updated);
                  }}
                  placeholder="https://..."
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={() => handleSyncClass(config.yachtClassName, config.url)}
                disabled={syncingClass !== null}
                className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncingClass === config.yachtClassName ? 'animate-spin' : ''}`} />
                <span className="text-sm">Sync</span>
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setUrlConfigs([...urlConfigs, { yachtClassName: '', url: '' }])}
          className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add Another Class
        </button>
      </div>

      {/* Rankings Display */}
      <div className="bg-white rounded-lg shadow">
        {/* Class Filter Tabs */}
        <div className="border-b border-gray-200 px-6 pt-4">
          <div className="flex space-x-4 overflow-x-auto">
            <button
              onClick={() => setSelectedClass('')}
              className={`pb-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap ${
                selectedClass === ''
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              All Classes ({rankings.length})
            </button>

            {Object.keys(classGroups).map((className) => (
              <button
                key={className}
                onClick={() => setSelectedClass(className)}
                className={`pb-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap ${
                  selectedClass === className
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {className} ({classGroups[className].length})
              </button>
            ))}
          </div>
        </div>

        {/* Rankings Table */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-600">Loading rankings...</p>
            </div>
          ) : displayedRankings.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No rankings found</p>
              <p className="text-sm text-gray-500 mt-1">
                Click "Sync All Classes" or sync individual classes to import rankings
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sail No.
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Points
                    </th>
                    {!selectedClass && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Class
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedRankings.map((ranking) => (
                    <tr key={ranking.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-semibold text-sm">
                          {ranking.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {ranking.skipper_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {ranking.sail_number || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {ranking.state && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {ranking.state}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {ranking.points?.toFixed(0) || '-'}
                      </td>
                      {!selectedClass && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {ranking.yacht_class_name}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(ranking.last_updated).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sync History */}
      {syncLogs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync History</h3>

          <div className="space-y-3">
            {syncLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg"
              >
                {log.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">
                      {log.yacht_class_name}
                    </p>
                    <span className="text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mt-1">
                    {log.status === 'success'
                      ? `Imported ${log.rankings_imported} rankings`
                      : log.error_message || 'Failed to sync'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

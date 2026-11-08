import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Upload, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Clock, MapPin, Link2, Trophy } from 'lucide-react';
import { InlineLoading, PageHead } from '../association/AssocUI';
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
  { yachtClassName: '10R', url: 'https://radiosailing.org.au/index.php?arcade=10r-ranking' },
  { yachtClassName: 'Marblehead', url: 'https://radiosailing.org.au/index.php?arcade=marblehead-ranking' },
  { yachtClassName: 'A Class', url: 'https://radiosailing.org.au/index.php?arcade=aclass-ranking' },
  { yachtClassName: 'DF65', url: 'https://radiosailing.org.au/index.php?arcade=df65-ranking' },
  { yachtClassName: 'DF95', url: 'https://radiosailing.org.au/index.php?arcade=df95-ranking' },
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
    <div className="flex flex-col gap-[22px]">
      {/* Header */}
      <PageHead icon={<Trophy size={24} />} title="National rankings" sub="Manage and sync national rankings for all yacht classes">
        <button
          type="button"
          onClick={handleSyncAll}
          disabled={syncingClass !== null}
          className="a-btn a-btn-p"
        >
          <RefreshCw className={`w-4 h-4 ${syncingClass ? 'animate-spin' : ''}`} />
          Sync all classes
        </button>
      </PageHead>

      {/* Status Messages */}
      {error && (
        <div className="a-note a-note-r">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold m-0">Couldn't sync</p>
            <p className="text-sm mt-0.5 m-0 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="a-note" style={{ borderColor: 'rgba(48,209,88,0.3)', background: 'rgba(48,209,88,0.06)' }}>
          <CheckCircle className="w-5 h-5 a-txt-g flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold a-ink m-0">Done</p>
            <p className="text-sm a-mute mt-0.5 m-0">{success}</p>
          </div>
        </div>
      )}

      {/* URL Configuration */}
      <section className="a-card p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="a-tile"><Link2 size={18} /></span>
          <div>
            <h3 className="a-ink text-[16px] font-semibold m-0">Ranking source URLs</h3>
            <p className="a-mute text-[13px] m-0 mt-0.5">Where each class's rankings are read from</p>
          </div>
        </div>

        <div className="space-y-3">
          {urlConfigs.map((config, index) => (
            <div key={index} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-3 min-w-0">
                <input
                  type="text"
                  value={config.yachtClassName}
                  onChange={(e) => {
                    const updated = [...urlConfigs];
                    updated[index].yachtClassName = e.target.value;
                    setUrlConfigs(updated);
                  }}
                  placeholder="Class name (e.g. IOM)"
                  aria-label="Class name"
                  className="a-inp"
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
                  aria-label="Rankings URL"
                  className="a-inp"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSyncClass(config.yachtClassName, config.url)}
                disabled={syncingClass !== null}
                className="a-btn"
              >
                <RefreshCw className={`w-4 h-4 ${syncingClass === config.yachtClassName ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setUrlConfigs([...urlConfigs, { yachtClassName: '', url: '' }])}
          className="a-btn a-btn-q a-btn-sm mt-4 a-txt-b"
        >
          + Add another class
        </button>
      </section>

      {/* Rankings Display */}
      <section className="a-card overflow-hidden">
        {/* Class Filter Tabs */}
        <div className="px-5 sm:px-6 pt-5">
          <div className="a-seg max-w-full overflow-x-auto" role="tablist" aria-label="Yacht class">
            <button
              type="button"
              role="tab"
              aria-selected={selectedClass === ''}
              onClick={() => setSelectedClass('')}
              className={`a-seg-i ${selectedClass === '' ? 'a-seg-on' : ''}`}
            >
              All classes
              <span className="a-cnt">{rankings.length}</span>
            </button>

            {Object.keys(classGroups).map((className) => (
              <button
                key={className}
                type="button"
                role="tab"
                aria-selected={selectedClass === className}
                onClick={() => setSelectedClass(className)}
                className={`a-seg-i ${selectedClass === className ? 'a-seg-on' : ''}`}
              >
                {className}
                <span className="a-cnt">{classGroups[className].length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Rankings Table */}
        <div className="p-5 sm:p-6">
          {loading ? (
            <InlineLoading label="Loading rankings…" />
          ) : displayedRankings.length === 0 ? (
            <div className="a-empty py-12">
              <span className="a-tile" style={{ width: 56, height: 56 }}><Trophy size={24} /></span>
              <p className="a-ink text-[15px] font-semibold m-0">No rankings yet</p>
              <p className="a-mute text-sm m-0">
                Use "Sync all classes", or sync one class, to import rankings
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full a-atable">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">Rank</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Sail no.</th>
                    <th className="px-4 py-3 text-left">State</th>
                    <th className="px-4 py-3 text-left">Points</th>
                    {!selectedClass && (
                      <th className="px-4 py-3 text-left">Class</th>
                    )}
                    <th className="px-4 py-3 text-left">Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRankings.map((ranking) => (
                    <tr key={ranking.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`a-rank ${ranking.rank <= 3 ? `a-rank-${ranking.rank}` : ''}`}>
                          {ranking.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap a-ink text-sm font-medium">
                        {ranking.skipper_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm a-mute a-num">
                        {ranking.sail_number || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {ranking.state && (
                          <span className="a-lb-fmt">{ranking.state}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm a-ink a-num">
                        {ranking.points?.toFixed(0) || '-'}
                      </td>
                      {!selectedClass && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm a-mute">
                          {ranking.yacht_class_name}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-sm a-dim">
                        {new Date(ranking.last_updated).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Sync History */}
      {syncLogs.length > 0 && (
        <section className="a-card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="a-tile"><Clock size={18} /></span>
            <h3 className="a-ink text-[16px] font-semibold m-0">Sync history</h3>
          </div>

          <div className="a-grp">
            {syncLogs.map((log) => (
              <div key={log.id} className="a-lnk items-start">
                <span className={`a-light mt-1.5 ${log.status === 'success' ? 'a-light-g' : 'a-light-r'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm font-semibold a-ink m-0">
                      {log.yacht_class_name}
                    </p>
                    <span className="text-xs a-dim">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className={`text-sm mt-1 m-0 ${log.status === 'success' ? 'a-mute' : 'a-txt-r'}`}>
                    {log.status === 'success'
                      ? `Imported ${log.rankings_imported} rankings`
                      : log.error_message || 'Failed to sync'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

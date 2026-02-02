import React, { useState, useEffect } from 'react';
import { X, Eye, TrendingUp, Clock, Users, Video, Calendar } from 'lucide-react';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamSession, LivestreamArchive } from '../../types/livestream';

interface StreamAnalyticsModalProps {
  sessionId: string;
  clubId: string;
  onClose: () => void;
}

export function StreamAnalyticsModal({
  sessionId,
  clubId,
  onClose
}: StreamAnalyticsModalProps) {
  const [session, setSession] = useState<LivestreamSession | null>(null);
  const [archives, setArchives] = useState<LivestreamArchive[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [sessionId, clubId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [sessionData, archivesData] = await Promise.all([
        livestreamStorage.getSession(sessionId),
        livestreamStorage.getArchives(clubId)
      ]);

      setSession(sessionData);
      setArchives(archivesData);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return 'N/A';
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const diff = endTime.getTime() - startTime.getTime();

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const totalArchiveViews = archives.reduce((sum, archive) => sum + archive.view_count, 0);
  const totalArchiveLikes = archives.reduce((sum, archive) => sum + archive.like_count, 0);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-white">Stream Analytics</h2>
            <p className="text-sm text-gray-400 mt-1">Performance metrics and insights</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading analytics...</div>
          ) : !session ? (
            <div className="text-center py-12 text-gray-400">No data available</div>
          ) : (
            <div className="space-y-6">
              {/* Current Stream Stats */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Current Stream</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Status */}
                  <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Video className="w-5 h-5 text-blue-400" />
                      <h4 className="text-sm font-medium text-gray-300">Status</h4>
                    </div>
                    <p className="text-2xl font-bold text-white capitalize">
                      {session.status}
                    </p>
                    {session.status === 'live' && (
                      <span className="inline-block mt-2 px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded font-medium">
                        Live Now
                      </span>
                    )}
                  </div>

                  {/* Current Viewers */}
                  <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Eye className="w-5 h-5 text-green-400" />
                      <h4 className="text-sm font-medium text-gray-300">Current Viewers</h4>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {session.viewer_count.toLocaleString()}
                    </p>
                  </div>

                  {/* Peak Viewers */}
                  <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <TrendingUp className="w-5 h-5 text-purple-400" />
                      <h4 className="text-sm font-medium text-gray-300">Peak Viewers</h4>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {session.peak_viewers.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Duration Stats */}
              {session.actual_start_time && (
                <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Clock className="w-5 h-5 text-blue-400" />
                    <h4 className="font-medium text-white">Duration</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Started</p>
                      <p className="text-white font-medium">
                        {new Date(session.actual_start_time).toLocaleString()}
                      </p>
                    </div>
                    {session.end_time && (
                      <div>
                        <p className="text-gray-400">Ended</p>
                        <p className="text-white font-medium">
                          {new Date(session.end_time).toLocaleString()}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-400">Total Duration</p>
                      <p className="text-white font-medium">
                        {formatDuration(session.actual_start_time, session.end_time)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Archives Overview */}
              {archives.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Archive Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Video className="w-5 h-5 text-blue-400" />
                        <h4 className="text-sm font-medium text-gray-300">Total Videos</h4>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {archives.length}
                      </p>
                    </div>

                    <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Eye className="w-5 h-5 text-green-400" />
                        <h4 className="text-sm font-medium text-gray-300">Total Views</h4>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {totalArchiveViews.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        <h4 className="text-sm font-medium text-gray-300">Total Likes</h4>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {totalArchiveLikes.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Recent Archives */}
                  <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                    <h4 className="font-medium text-white mb-3">Recent Streams</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {archives.slice(0, 5).map((archive) => (
                        <div
                          key={archive.id}
                          className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="text-white font-medium text-sm">{archive.title}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(archive.recorded_at).toLocaleDateString()}
                              </span>
                              {archive.duration && (
                                <span>{Math.floor(archive.duration / 60)} min</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-medium">{archive.view_count}</p>
                            <p className="text-xs text-gray-400">views</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tips */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <h4 className="font-semibold text-blue-300 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Analytics Tips
                </h4>
                <ul className="text-sm text-blue-200/80 space-y-1">
                  <li>• Peak viewers typically occur 15-20 minutes into the stream</li>
                  <li>• Promote your stream 24-48 hours in advance for better reach</li>
                  <li>• Archive your streams for members who missed the live event</li>
                  <li>• Engage with viewers in chat to boost retention</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

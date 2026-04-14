import React, { useState, useEffect } from 'react';
import { Play, Eye, ThumbsUp, MessageSquare, Calendar, Clock, Video } from 'lucide-react';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamArchive } from '../../types/livestream';
import { formatDistanceToNow } from 'date-fns';

interface LivestreamArchiveViewerProps {
  clubId?: string;
  eventId?: string;
}

export function LivestreamArchiveViewer({ clubId, eventId }: LivestreamArchiveViewerProps) {
  const [archives, setArchives] = useState<LivestreamArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArchive, setSelectedArchive] = useState<LivestreamArchive | null>(null);

  useEffect(() => {
    loadArchives();
  }, [clubId, eventId]);

  const loadArchives = async () => {
    try {
      let data: LivestreamArchive[];
      if (eventId) {
        data = await livestreamStorage.getArchivesByEvent(eventId);
      } else if (clubId) {
        data = await livestreamStorage.getArchives(clubId);
      } else {
        data = [];
      }
      setArchives(data);
    } catch (error) {
      console.error('Error loading archives:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Loading replays...</div>
      </div>
    );
  }

  if (archives.length === 0) {
    return (
      <div className="text-center py-12">
        <Video className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">No race replays available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {archives.map((archive) => (
          <div
            key={archive.id}
            className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-all cursor-pointer group"
            onClick={() => setSelectedArchive(archive)}
          >
            <div className="aspect-video bg-slate-900 relative overflow-hidden">
              {archive.thumbnail_url ? (
                <img
                  src={archive.thumbnail_url}
                  alt={archive.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="w-12 h-12 text-slate-700" />
                </div>
              )}

              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                  <Play className="w-8 h-8 text-white ml-1" />
                </div>
              </div>

              {archive.duration && (
                <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs text-white">
                  {formatDuration(archive.duration)}
                </div>
              )}
            </div>

            <div className="p-4">
              <h3 className="font-semibold text-white line-clamp-2 mb-2">
                {archive.title}
              </h3>

              {archive.description && (
                <p className="text-sm text-slate-400 line-clamp-2 mb-3">
                  {archive.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>{archive.view_count.toLocaleString()}</span>
                </div>
                {archive.like_count > 0 && (
                  <div className="flex items-center gap-1">
                    <ThumbsUp className="w-3 h-3" />
                    <span>{archive.like_count.toLocaleString()}</span>
                  </div>
                )}
                {archive.comment_count > 0 && (
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    <span>{archive.comment_count.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2 text-xs text-slate-400">
                <Calendar className="w-3 h-3" />
                <span>{formatDistanceToNow(new Date(archive.recorded_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedArchive && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedArchive(null)}
        >
          <div
            className="bg-slate-800 rounded-lg border border-slate-700 max-w-5xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-video bg-black">
              {(selectedArchive as any).source === 'cloudflare' && (selectedArchive as any).cloudflare_playback_url ? (
                <iframe
                  src={`${(selectedArchive as any).cloudflare_playback_url}?autoplay=true&muted=false&preload=auto`}
                  title={selectedArchive.title}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="w-full h-full"
                  style={{ border: 'none' }}
                />
              ) : selectedArchive.youtube_video_id ? (
                <iframe
                  src={`https://www.youtube.com/embed/${selectedArchive.youtube_video_id}?autoplay=1`}
                  title={selectedArchive.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="w-16 h-16 text-slate-600" />
                </div>
              )}
            </div>

            <div className="p-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                {selectedArchive.title}
              </h2>

              {selectedArchive.description && (
                <p className="text-slate-300 mb-4">
                  {selectedArchive.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-6 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span>{selectedArchive.view_count.toLocaleString()} views</span>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(selectedArchive.recorded_at).toLocaleDateString()}</span>
                </div>

                {selectedArchive.duration && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{formatDuration(selectedArchive.duration)}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                {selectedArchive.youtube_url && (
                  <a
                    href={selectedArchive.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Watch on YouTube
                  </a>
                )}

                <button
                  onClick={() => setSelectedArchive(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

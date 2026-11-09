import { useEffect, useState } from 'react';
import { Pause, Share2, Square } from 'lucide-react';
import type { LivestreamRaceSegment, LivestreamSession } from '../../types/livestream';
import { livestreamStorage } from '../../utils/livestreamStorage';
import { useRaceCompanion, type CompanionBoat } from '../../utils/liveRaceCompanion';
import { LiveVideo } from './LiveVideo';
import { LiveCompanion } from './LiveCompanion';
import { goneYouTubeIds } from '../../utils/youtubeAvailability';

/** A broadcast's race videos (one per race), refreshed every 30 seconds while shown. */
export function useRaceVideos(sessionId: string | null | undefined) {
  const [videos, setVideos] = useState<LivestreamRaceSegment[]>([]);
  useEffect(() => {
    setVideos([]);
    if (!sessionId) return;
    let cancelled = false;
    const load = () => livestreamStorage.getSegments(sessionId)
      .then(async list => {
        // Race videos deleted on YouTube drop out here too
        const gone = await goneYouTubeIds(list);
        if (!cancelled) setVideos(list.filter(v => !v.youtube_video_id || !gone.has(v.youtube_video_id)));
      })
      .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sessionId]);
  return videos;
}

export type RaceVideoState = 'live' | 'uploading' | 'ready' | 'failed';
export function raceVideoState(v: LivestreamRaceSegment): RaceVideoState {
  if (v.upload_status === 'pending' && !v.segment_end_time) return 'live';
  if (v.upload_status === 'uploaded' || v.upload_status === 'cleanup_complete') return v.youtube_video_id ? 'ready' : 'uploading';
  if (v.upload_status === 'failed') return 'failed';
  return 'uploading';
}

/** One race in the strip under the picture: Replay (plays in Alfie), Uploading, or live now */
export function RaceVideoTile({ video, winner, onPlay }: {
  video: LivestreamRaceSegment;
  winner?: CompanionBoat | null;
  onPlay?: (video: LivestreamRaceSegment) => void;
}) {
  const state = raceVideoState(video);
  const title = video.race_number ? `Race ${video.race_number}` : (video.segment_title || 'Race');
  const sub = state === 'live' ? 'live now'
    : state === 'ready' ? `Replay${winner?.sail ? ` · won by ${winner.sail}` : ''}`
    : state === 'failed' ? 'Video unavailable'
    : 'Uploading…';
  if (state === 'ready' && onPlay) {
    return (
      <button type="button" className="alv-rt" onClick={() => onPlay(video)} aria-label={`Play ${title} replay`}>
        <b>{title}</b><span>{sub}</span>
      </button>
    );
  }
  return <span className={`alv-rt ${state === 'live' ? 'is-live' : ''}`}><b>{title}</b><span>{sub}</span></span>;
}

function startedAt(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/**
 * AlfieTV watch page (board "AlfieTV watch"): the live picture with its race strip,
 * and Race / Standings from scoring beside it. Hold and end show in the picture,
 * so the race details stay up while racing is paused.
 */
export function LiveWatchView({ session, clubName, venueImage, isPaused, isEnded, playerKey, suspended, onClose, onPlayReplay }: {
  session: LivestreamSession;
  clubName?: string;
  venueImage?: string;
  isPaused: boolean;
  isEnded: boolean;
  /** Changes when the picture should reconnect (after a hold) */
  playerKey: number;
  /** Something plays on top (a race replay): silence the live picture and ignore Escape */
  suspended?: boolean;
  onClose: () => void;
  onPlayReplay?: (video: LivestreamRaceSegment) => void;
}) {
  const { companion, loaded } = useRaceCompanion(session.event_id);
  const videos = useRaceVideos(session.id);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !suspended) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, suspended]);

  const share = async () => {
    const url = `${window.location.origin}/alfie-tv?watch=${session.id}`;
    const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> };
    try {
      if (nav.share) { await nav.share({ title: session.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* closed the share sheet */ }
  };

  const meta = [clubName, session.actual_start_time ? `started ${startedAt(session.actual_start_time)}` : null].filter(Boolean).join(' · ');

  return (
    <div className="alv alv-watch" role="dialog" aria-modal="true" aria-label={`Watching ${session.title}`}>
      <header className="alv-watch-top">
        <span className="alv-watch-brand" aria-hidden="true">Alfie<b>TV</b></span>
        {session.is_public === false && (
          <span className="alv-chip is-test" role="status"><b>TEST</b>Only people with this link can see this broadcast</span>
        )}
        <button type="button" className="alv-btn is-small" onClick={onClose} title="Back to AlfieTV (Esc)">Exit</button>
      </header>

      <div className="alv-watch-grid">
        <div className="alv-watch-main">
          <div className="alv-watch-player">
            {isEnded || isPaused ? (
              <div className="alv-watch-card">
                {venueImage && <img src={venueImage} alt="" />}
                <div>
                  <span className={`chip ${isEnded ? 'is-end' : ''}`}>
                    {isEnded ? <Square className="w-3.5 h-3.5" aria-hidden="true" /> : <Pause className="w-3.5 h-3.5" aria-hidden="true" />}
                    {isEnded ? 'ENDED' : 'ON HOLD'}
                  </span>
                  <h2 className="alv-disp">{isEnded ? 'The broadcast has ended' : 'Racing will resume shortly'}</h2>
                  <p>{isEnded ? 'Thanks for watching. Each race is on YouTube once it\'s uploaded.' : 'Stay here: the picture comes back on its own.'}</p>
                  {isEnded && <button type="button" className="alv-btn is-small" onClick={onClose}>Back to AlfieTV</button>}
                </div>
              </div>
            ) : (
              <LiveVideo key={playerKey} session={session} muted={suspended} />
            )}
          </div>

          <div className="alv-watch-info">
            <div className="min-w-0">
              <h1 className="alv-disp">{session.title}</h1>
              {meta && <p>{meta}</p>}
            </div>
            <button type="button" className="alv-btn is-small" onClick={share}>
              <Share2 className="w-4 h-4" aria-hidden="true" />
              {copied ? 'Link copied' : 'Share'}
            </button>
          </div>

          {videos.length > 0 && (
            <div className="alv-watch-races" aria-label="Races">
              {videos.map(v => (
                <RaceVideoTile key={v.id} video={v} winner={companion?.winners[v.race_number]} onPlay={onPlayReplay} />
              ))}
            </div>
          )}
        </div>

        <aside className="alv-watch-side" aria-label="Race details">
          <LiveCompanion companion={companion} loaded={loaded} linked={!!session.event_id} />
        </aside>
      </div>
    </div>
  );
}

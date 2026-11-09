import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clapperboard, Pause, Radio, Share2, Square, Tv } from 'lucide-react';
import type { LivestreamRaceSegment, LivestreamSession } from '../../types/livestream';
import { supabase } from '../../utils/supabase';
import { useRaceCompanion } from '../../utils/liveRaceCompanion';
import { LiveVideo } from './LiveVideo';
import { raceVideoState, useRaceVideos } from './LiveWatchView';

function clock(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/**
 * The event's Live tab (board "Event Live"): the broadcast playing in the event,
 * its races with each race's video as soon as it's on YouTube, and for the club's
 * admins a way into the control room.
 */
export function EventLiveTab({ session: initial, venue, canRun, onOpenControlRoom, onOpenAlfieTV }: {
  session: LivestreamSession;
  venue?: string;
  /** Club admin or editor: shows the control room shortcut */
  canRun: boolean;
  onOpenControlRoom: () => void;
  onOpenAlfieTV: () => void;
}) {
  const [session, setSession] = useState(initial);
  const [playerKey, setPlayerKey] = useState(0);
  const [replay, setReplay] = useState<LivestreamRaceSegment | null>(null);
  const [copied, setCopied] = useState(false);
  const videos = useRaceVideos(session.id);
  const { companion } = useRaceCompanion(session.event_id);

  const sessionRef = useRef(initial);
  sessionRef.current = session;
  useEffect(() => { setSession(initial); }, [initial.id]);

  // Keep the status fresh: going live, holds and the end show without a reload
  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from('livestream_sessions')
        .select('status, is_paused, actual_start_time, scheduled_start_time, end_time')
        .eq('id', initial.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const prev = sessionRef.current;
      const resumed = !!prev.is_paused && !data.is_paused;
      const wentLive = prev.status !== 'live' && data.status === 'live';
      setSession({ ...prev, ...data } as LivestreamSession);
      if (resumed || wentLive) setTimeout(() => setPlayerKey(k => k + 1), resumed ? 2000 : 0);
    }, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [initial.id]);

  // Record races broadcasts aren't streamed: show the race videos, never a live player
  const recordOnly = session.broadcast_mode === 'races_only';
  const isLive = session.status === 'live' && !recordOnly;
  const isEnded = session.status === 'ended';
  const races = useMemo(
    () => [...videos].sort((a, b) => (b.race_number || 0) - (a.race_number || 0)),
    [videos],
  );

  const share = async () => {
    const url = `${window.location.origin}/alfie-tv?watch=${session.id}`;
    const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> };
    try {
      if (nav.share) { await nav.share({ title: session.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* share sheet closed */ }
  };

  const when = session.scheduled_start_time
    ? new Date(session.scheduled_start_time).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <div className="alv alv-elive">
      <div className="alv-elive-main">
        <div className="alv-elive-player">
          {replay?.youtube_video_id ? (
            <>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${replay.youtube_video_id}?autoplay=1&rel=0`}
                title={`Race ${replay.race_number}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <button type="button" className="alv-btn is-small alv-elive-back" onClick={() => setReplay(null)}>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                {isLive ? 'Back to live' : 'Close video'}
              </button>
            </>
          ) : isLive && !session.is_paused ? (
            <LiveVideo key={playerKey} session={session} compact />
          ) : (
            <div className="alv-watch-card">
              <div>
                <span className={`chip ${isEnded || !isLive ? 'is-end' : ''}`}>
                  {isEnded ? <Square className="w-3.5 h-3.5" aria-hidden="true" />
                    : isLive ? <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                    : <Radio className="w-3.5 h-3.5" aria-hidden="true" />}
                  {recordOnly ? 'RACE VIDEOS' : isEnded ? 'ENDED' : isLive ? 'ON HOLD' : 'STREAMING'}
                </span>
                <h2 className="alv-disp">
                  {recordOnly ? (isEnded ? 'Race videos' : 'Races are being recorded') : isEnded ? 'The broadcast has ended' : isLive ? 'Racing will resume shortly' : when ? `Live from ${when}` : 'Live here on race day'}
                </h2>
                <p>
                  {recordOnly
                    ? 'This one isn\'t streamed live. Each race appears below once it\'s scored and on YouTube.'
                    : isEnded
                    ? 'Each race is below once it\'s on YouTube.'
                    : isLive
                    ? 'The picture comes back on its own.'
                    : 'Watch it here or in AlfieTV. Each race goes to YouTube once it\'s scored.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="alv-watch-info">
          <div className="min-w-0">
            <h3 className="alv-disp">{venue ? `Live from ${venue}` : session.title}</h3>
            <p>
              {[isLive && session.actual_start_time ? `started ${clock(session.actual_start_time)}` : null,
                'each race goes to YouTube once it\'s scored'].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="alv-elive-actions">
            <button type="button" className="alv-btn is-small" onClick={share}>
              <Share2 className="w-4 h-4" aria-hidden="true" />
              {copied ? 'Link copied' : 'Share'}
            </button>
            <button type="button" className="alv-btn is-small" onClick={onOpenAlfieTV}>
              <Tv className="w-4 h-4" aria-hidden="true" />
              Open in AlfieTV
            </button>
          </div>
        </div>

        {canRun && (
          <div className="alv-elive-run">
            <span>
              You run this event
              {session.is_public === false && <em> · test broadcast, only admins see this tab</em>}
            </span>
            <button type="button" className="alv-btn is-small alv-btn-p" onClick={onOpenControlRoom}>
              <Clapperboard className="w-4 h-4" aria-hidden="true" />
              Control room
            </button>
          </div>
        )}
      </div>

      <aside className="alv-elive-side" aria-label="Races">
        <span className="alv-eyebrow">{isEnded ? 'Races' : 'Races today'}</span>
        {races.length > 0 ? (
          <ul className="alv-elive-races">
            {races.map(v => {
              const state = raceVideoState(v);
              const winner = companion?.winners[v.race_number];
              const isPlaying = replay?.id === v.id;
              return (
                <li key={v.id} className={state === 'live' ? 'is-live' : ''}>
                  <span className="r">R{v.race_number}</span>
                  <span className="t">
                    <b>Race {v.race_number}{winner?.sail ? ` · won by ${winner.sail}` : ''}</b>
                    <small>from {clock(v.segment_start_time)}</small>
                  </span>
                  {state === 'live' ? <span className="alv-live-badge">LIVE</span>
                    : state === 'ready' ? (
                      <button type="button" className="alv-btn is-xs" onClick={() => setReplay(isPlaying ? null : v)} aria-pressed={isPlaying}>
                        {isPlaying ? 'Playing' : 'Video'}
                      </button>
                    )
                    : state === 'failed' ? <span className="st">Unavailable</span>
                    : <span className="st is-up">Uploading</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="alv-comp-empty">Each race records as its own video when scoring starts it, and shows here.</p>
        )}
        <p className="alv-elive-note">
          Each race video plays here as soon as it's on YouTube. After the event, the Media tab shows the event's playlist.
        </p>
      </aside>
    </div>
  );
}

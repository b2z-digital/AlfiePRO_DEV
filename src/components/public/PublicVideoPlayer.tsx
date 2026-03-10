import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Tv } from 'lucide-react';

declare global {
  interface Window {
    YT: {
      Player: new (
        el: string | HTMLElement,
        config: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: Record<string, (event: { target: YTPlayer; data: number }) => void>;
        }
      ) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
  interface YTPlayer {
    playVideo: () => void;
    pauseVideo: () => void;
    getIframe: () => HTMLIFrameElement;
    destroy: () => void;
  }
}

export default function PublicVideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const [hasEnded, setHasEnded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);

  const title = searchParams.get('title') || '';
  const channel = searchParams.get('channel') || '';
  const returnScheme = searchParams.get('return') || '';
  const autoplay = searchParams.get('autoplay') !== '0';

  useEffect(() => {
    if (!videoId || videoId.length !== 11) return;

    const loadAPI = () => {
      if (window.YT && window.YT.Player) {
        createPlayer();
        return;
      }
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = createPlayer;
    };

    const createPlayer = () => {
      if (!playerDivRef.current || playerRef.current) return;

      playerRef.current = new window.YT.Player(playerDivRef.current, {
        videoId: videoId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          playsinline: 0,
          fs: 1,
        },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            setPlayerReady(true);
            if (autoplay) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === 0) {
              setHasEnded(true);
            }
          },
        },
      });
    };

    loadAPI();

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId, autoplay]);

  const handleClose = () => {
    if (returnScheme) {
      window.location.href = returnScheme;
    } else {
      window.close();
    }
  };

  if (!videoId || videoId.length !== 11) {
    return (
      <div className="player-root">
        <div className="player-error">
          <Tv className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2 text-white">Video Not Found</h1>
          <p className="text-slate-400 text-sm">Invalid or missing video ID.</p>
        </div>
        <style>{globalStyles}</style>
      </div>
    );
  }

  return (
    <div className="player-root">
      <div className="player-video-area">
        <div className="player-container">
          <div ref={playerDivRef} className="player-embed" />
          {!playerReady && (
            <div className="player-loader">
              <div className="player-spinner" />
            </div>
          )}
        </div>
      </div>

      {(title || channel) && !hasEnded && (
        <div className="player-info">
          {title && <div className="player-title">{title}</div>}
          {channel && <div className="player-channel">{channel}</div>}
        </div>
      )}

      {hasEnded && (
        <div className="player-ended">
          <p className="player-ended-text">Video finished</p>
          <button onClick={handleClose} className="player-ended-btn">
            Back to App
          </button>
        </div>
      )}

      <style>{globalStyles}</style>
    </div>
  );
}

const globalStyles = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  html, body {
    background: #000 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    width: 100% !important;
    height: 100% !important;
  }

  .player-root {
    position: fixed;
    inset: 0;
    background: #000;
    display: flex;
    flex-direction: column;
    z-index: 9999;
  }

  .player-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
  }

  .player-video-area {
    width: 100%;
    position: relative;
  }

  .player-container {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    background: #000;
  }

  .player-embed,
  .player-embed iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .player-loader {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f172a;
    z-index: 2;
  }
  .player-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #0ea5e9;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .player-info {
    padding: 16px 16px 8px;
  }
  .player-title {
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.35;
    margin-bottom: 2px;
  }
  .player-channel {
    color: #64748b;
    font-size: 12px;
  }

  .player-ended {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .player-ended-text {
    color: #64748b;
    font-size: 14px;
    margin-bottom: 16px;
  }
  .player-ended-btn {
    padding: 10px 24px;
    background: #0284c7;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .player-ended-btn:active {
    background: #0369a1;
  }

  /* Landscape: video fills entire viewport */
  @media (orientation: landscape) {
    .player-root {
      flex-direction: row;
    }
    .player-video-area {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .player-container {
      padding-bottom: 0;
      width: 100%;
      height: 100%;
    }
    .player-info,
    .player-ended {
      display: none;
    }
  }

  /* iOS fullscreen support for iframes */
  iframe {
    -webkit-overflow-scrolling: touch;
  }
`;

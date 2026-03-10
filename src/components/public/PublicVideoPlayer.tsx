import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Tv } from 'lucide-react';

export default function PublicVideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const [isReady, setIsReady] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const title = searchParams.get('title') || '';
  const channel = searchParams.get('channel') || '';
  const returnScheme = searchParams.get('return') || '';
  const autoplay = searchParams.get('autoplay') !== '0';

  const checkOrientation = useCallback(() => {
    const landscape = window.innerWidth > window.innerHeight;
    setIsLandscape(landscape);
  }, []);

  useEffect(() => {
    checkOrientation();

    const handleOrientationChange = () => {
      setTimeout(checkOrientation, 100);
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', handleOrientationChange);

    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationChange);
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', handleOrientationChange);
      }
    };
  }, [checkOrientation]);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com' &&
          event.origin !== 'https://www.youtube-nocookie.com') return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'onStateChange' && data.info === 0) {
          setHasEnded(true);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleClose = () => {
    if (returnScheme) {
      window.location.href = returnScheme;
    } else {
      window.close();
    }
  };

  if (!videoId || videoId.length !== 11) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <Tv className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Video Not Found</h1>
          <p className="text-slate-400 text-sm">Invalid or missing video ID.</p>
        </div>
      </div>
    );
  }

  const currentOrigin = window.location.origin;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&controls=1&modestbranding=1&rel=0&iv_load_policy=3&cc_load_policy=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(currentOrigin)}`;

  if (isLandscape) {
    return (
      <div ref={containerRef} className="fixed inset-0 bg-black z-[9999]">
        {isReady ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            title={title || 'AlfieTV Video'}
            style={{ border: 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-10 h-10 border-[3px] border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <style>{`
          html, body {
            background: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black flex flex-col">
      <div className="flex-1 flex flex-col">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          {isReady ? (
            <iframe
              ref={iframeRef}
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              title={title || 'AlfieTV Video'}
              style={{ border: 'none' }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-[3px] border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {(title || channel) && !hasEnded && (
          <div className="px-4 pt-4 pb-2">
            {title && (
              <h1 className="text-white font-medium text-[15px] leading-snug mb-0.5">{title}</h1>
            )}
            {channel && (
              <p className="text-slate-500 text-xs">{channel}</p>
            )}
          </div>
        )}

        {hasEnded && (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <p className="text-slate-500 text-sm mb-4">Video finished</p>
              <button
                onClick={handleClose}
                className="px-6 py-2.5 bg-sky-600 active:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Back to App
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        html, body {
          background: #000 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
      `}</style>
    </div>
  );
}

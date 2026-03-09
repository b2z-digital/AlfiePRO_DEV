import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { X, ChevronLeft, Tv } from 'lucide-react';

export default function PublicVideoPlayer() {
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const [isReady, setIsReady] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const title = searchParams.get('title') || '';
  const channel = searchParams.get('channel') || '';
  const returnScheme = searchParams.get('return') || '';
  const autoplay = searchParams.get('autoplay') !== '0';

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 300);
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
        // ignore non-JSON messages
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
      <div className="min-h-screen bg-black flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 safe-area-top">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors text-sm font-medium"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2 text-sky-400">
          <Tv className="w-4 h-4" />
          <span className="text-xs font-semibold tracking-wider uppercase">AlfieTV</span>
        </div>
        <button
          onClick={handleClose}
          className="text-slate-400 hover:text-white transition-colors p-1"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          {isReady && (
            <iframe
              ref={iframeRef}
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={title || 'AlfieTV Video'}
            />
          )}
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {(title || channel) && (
          <div className="px-4 py-4 bg-slate-900">
            {title && (
              <h1 className="text-white font-semibold text-base leading-snug mb-1">{title}</h1>
            )}
            {channel && (
              <p className="text-slate-400 text-sm">{channel}</p>
            )}
          </div>
        )}

        {hasEnded && (
          <div className="flex-1 flex items-center justify-center px-6 pb-8">
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-4">Video finished</p>
              <button
                onClick={handleClose}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Back to App
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .safe-area-top {
          padding-top: max(0.75rem, env(safe-area-inset-top));
        }
        body {
          background: #000 !important;
          margin: 0;
          padding: 0;
        }
      `}</style>
    </div>
  );
}

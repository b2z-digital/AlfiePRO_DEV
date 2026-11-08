import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export type PreviewDevice = 'desktop' | 'tablet' | 'phone';

const WIDTH: Record<PreviewDevice, number> = { desktop: 1280, tablet: 820, phone: 390 };

interface Props {
  /** In-app path of the public page, e.g. /club/<id>/public */
  path: string;
  device: PreviewDevice;
  height: number;
  /** Unsaved settings shown in the preview only */
  overrides?: Record<string, unknown>;
  /** Let people click around inside the preview */
  interactive?: boolean;
  title?: string;
}

/** The club's real public site, scaled down inside the Website hub. */
export const SitePreviewFrame: React.FC<Props> = ({ path, device, height, overrides, interactive = false, title = 'Website preview' }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [w, setW] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const overKey = JSON.stringify(overrides || null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const send = () => {
    if (!overrides) return;
    try {
      frame.current?.contentWindow?.postMessage({ type: 'alfie-site-preview', ...overrides }, window.location.origin);
    } catch { /* ignore */ }
  };

  useEffect(() => { send(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [overKey, loaded]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === 'alfie-site-preview-ready') send();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overKey]);

  const vw = WIDTH[device];
  const pad = device === 'phone' ? 0 : 14;
  const avail = Math.max(0, w - pad * 2);
  const phoneScale = Math.min(1, (height - 44) / 760, avail / vw);
  const scale = device === 'phone' ? phoneScale : (avail > 0 ? Math.min(1, avail / vw) : 0.5);
  const vh = device === 'phone' ? 760 : Math.ceil((height - 14) / scale);
  const left = device === 'phone' ? Math.max(0, (w - vw * scale) / 2) : pad;
  const src = `${path}${path.includes('?') ? '&' : '?'}sitePreview=1`;

  return (
    <div ref={wrap} className="wh-bf-body" style={{ height }}>
      {w > 0 && (
        <iframe
          ref={frame}
          key={src}
          src={src}
          title={title}
          className={`wh-frame${device === 'phone' ? ' wh-frame-phone' : ''}`}
          style={{ width: vw, height: vh, left, transform: `scale(${scale})` }}
          onLoad={() => setLoaded(true)}
          tabIndex={interactive ? 0 : -1}
          aria-hidden={interactive ? undefined : true}
        />
      )}
      {!loaded && <div className="wh-frame-load"><Loader2 size={16} className="wh-spin" />Loading preview…</div>}
      {device !== 'phone' && <div className="wh-fade" />}
      {!interactive && <div className="wh-frame-shield" />}
    </div>
  );
};

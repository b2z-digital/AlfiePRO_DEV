import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
   SmartImage: shows any image well in any box.
   Once an image loads, a tiny copy (max 72px) is read on a canvas and classified:
   - photo   → cropped to the box around its most interesting area (edges, colour,
               skin tones; vertical crops lean towards the top, where faces and
               headlines usually are)
   - graphic → posters and artwork with text: shown whole over a blurred copy of itself
   - logo    → transparent or plain background: shown whole, centred, on that colour
   Images from hosts that don't allow pixel access fall back to shape rules.
   Results are cached per image URL for the session.
   ───────────────────────────────────────────────────────────────────────────── */

type Kind = 'photo' | 'graphic' | 'logo';
interface Analysis {
  w: number;
  h: number;
  kind: Kind;
  bg?: string;          // plain border colour for logos
  cols?: number[];      // interest per column (analysis scale)
  rows?: number[];      // interest per row (analysis scale)
}

const cache = new Map<string, Analysis>();
const pending = new Map<string, Promise<Analysis | null>>();

const sameOrigin = (src: string) => {
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

const analysableHost = (src: string) => {
  try {
    const u = new URL(src, window.location.href);
    return u.origin === window.location.origin || /(^|\.)supabase\.(co|in)$/.test(u.hostname);
  } catch {
    return false;
  }
};

function analysePixels(img: HTMLImageElement): Analysis | null {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return null;
  const scale = 72 / Math.max(w, h);
  const cw = Math.max(8, Math.round(w * scale)), ch = Math.max(8, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, cw, ch);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return null; // tainted: the host doesn't allow reading pixels
  }
  const px = (x: number, y: number) => (y * cw + x) * 4;

  // Border: transparent or a single plain colour means logo / artwork on a background
  let bR = 0, bG = 0, bB = 0, bN = 0, transparent = 0;
  const border: number[][] = [];
  for (let x = 0; x < cw; x++) for (const y of [0, 1, ch - 2, ch - 1]) border.push([x, y]);
  for (let y = 2; y < ch - 2; y++) for (const x of [0, 1, cw - 2, cw - 1]) border.push([x, y]);
  for (const [x, y] of border) {
    const i = px(x, y);
    if (data[i + 3] < 24) { transparent++; continue; }
    bR += data[i]; bG += data[i + 1]; bB += data[i + 2]; bN++;
  }
  const mR = bN ? bR / bN : 0, mG = bN ? bG / bN : 0, mB = bN ? bB / bN : 0;
  let dev = 0;
  for (const [x, y] of border) {
    const i = px(x, y);
    if (data[i + 3] < 24) continue;
    dev += Math.abs(data[i] - mR) + Math.abs(data[i + 1] - mG) + Math.abs(data[i + 2] - mB);
  }
  dev = bN ? dev / bN / 3 : 0;
  const transparentShare = transparent / border.length;

  // Colour concentration: posters and artwork are made of a few flat colours, so they
  // stay concentrated at a finer colour grid; photos (skies, water, skin) are gradients
  // that spread out as the grid gets finer.
  const coarse = new Map<number, number>(), fine = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 24) continue;
    opaque++;
    const k4 = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const k3 = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    coarse.set(k4, (coarse.get(k4) || 0) + 1);
    fine.set(k3, (fine.get(k3) || 0) + 1);
  }
  const top8 = (m: Map<number, number>) => [...m.values()].sort((a, b) => b - a).slice(0, 8).reduce((a, b) => a + b, 0);
  const concentration = opaque ? top8(coarse) / opaque : 1;
  const fineConcentration = opaque ? top8(fine) / opaque : 1;
  const flat = fineConcentration > 0.6 && fineConcentration / Math.max(concentration, 0.01) > 0.88;

  let kind: Kind = 'photo';
  let bg: string | undefined;
  if (transparentShare > 0.5) {
    kind = 'logo';
    // Dark artwork on a transparent background needs a light card, and vice versa
    let lum = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      lum += 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; n++;
    }
    bg = n && lum / n < 100 ? '#EEF2F8' : undefined;
  } else if (dev < 10 && concentration > 0.45) {
    kind = 'logo';
    bg = `rgb(${Math.round(mR)}, ${Math.round(mG)}, ${Math.round(mB)})`;
  } else if (flat) {
    kind = 'graphic';
  }

  // Interest map: local contrast + saturation + a nudge for skin tones
  const cols = new Array(cw).fill(0), rows = new Array(ch).fill(0);
  for (let y = 0; y < ch - 1; y++) {
    for (let x = 0; x < cw - 1; x++) {
      const i = px(x, y), r = data[i], g = data[i + 1], b = data[i + 2];
      const ir = px(x + 1, y), id = px(x, y + 1);
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      const edge = Math.abs(lum - (0.3 * data[ir] + 0.59 * data[ir + 1] + 0.11 * data[ir + 2]))
        + Math.abs(lum - (0.3 * data[id] + 0.59 * data[id + 1] + 0.11 * data[id + 2]));
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      const skin = r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 && Math.abs(r - g) > 15 ? 1 : 0;
      const score = edge + sat * 24 + skin * 30;
      cols[x] += score; rows[y] += score;
    }
  }
  return { w, h, kind, bg, cols, rows };
}

/** Best window along one axis: the start (0..1) of the window with the most interest. */
function bestOffset(profile: number[], windowLen: number, topBias: boolean): number {
  const n = profile.length;
  const win = Math.max(1, Math.min(n, Math.round(windowLen)));
  if (win >= n) return 0.5;
  const weighted = profile.map((v, i) => (topBias ? v * (1.18 - 0.36 * (i / n)) : v));
  let sum = 0;
  for (let i = 0; i < win; i++) sum += weighted[i];
  let best = sum, bestAt = 0;
  for (let i = win; i < n; i++) {
    sum += weighted[i] - weighted[i - win];
    if (sum > best) { best = sum; bestAt = i - win + 1; }
  }
  return bestAt / (n - win);
}

function loadForAnalysis(src: string): Promise<Analysis | null> {
  if (cache.has(src)) return Promise.resolve(cache.get(src)!);
  if (pending.has(src)) return pending.get(src)!;
  const p = new Promise<Analysis | null>(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = window.setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      const a = analysePixels(img) || { w: img.naturalWidth, h: img.naturalHeight, kind: 'photo' as Kind };
      cache.set(src, a);
      resolve(a);
    };
    img.onerror = () => { window.clearTimeout(timer); resolve(null); };
    img.src = src;
  });
  pending.set(src, p);
  p.finally(() => pending.delete(src));
  return p;
}

export interface SmartImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /** Shown when there's no image or it fails to load */
  fallback?: React.ReactNode;
  /** Zoom slightly on hover of a parent .group (cards) */
  zoomOnHover?: boolean;
  /** Load straight away (heroes) instead of lazily */
  eager?: boolean;
  /** Let the box take the image's own shape, kept between these width/height ratios */
  naturalAspect?: [number, number];
}

export const SmartImage: React.FC<SmartImageProps> = ({ src, alt, className = '', style, fallback, zoomOnHover, eager, naturalAspect }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const srcRef = useRef(src);
  srcRef.current = src;
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 16, h: 10 });
  const [analysis, setAnalysis] = useState<Analysis | null>(() => (src ? cache.get(src) || null : null));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setNatural(null);
    setAnalysis(src ? cache.get(src) || null : null);
  }, [src]);

  const handleLoaded = (img: HTMLImageElement) => {
    setLoaded(true);
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    if (!src) return;
    const known = cache.get(src);
    if (known) { setAnalysis(known); return; }
    // Same-origin images can be read straight from the displayed element; others are
    // read from a separate CORS request so the image on screen never depends on it.
    if (sameOrigin(src)) {
      const a = analysePixels(img);
      if (a) { cache.set(src, a); setAnalysis(a); return; }
    }
    // Only our own storage sends the headers needed to read pixels; other hosts get the shape rules
    if (!analysableHost(src)) return;
    const want = src;
    loadForAnalysis(src).then(a => { if (a && srcRef.current === want) setAnalysis(a); });
  };

  // Images already in the browser cache can finish before React sees the load event
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth && !loaded) handleLoaded(img);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (!src || failed) {
    return (
      <div ref={boxRef} className={`a-si a-si-fb ${className}`} style={style}>
        {fallback}
      </div>
    );
  }

  // Decide how to place the image in this box
  const nw = analysis?.w || natural?.w || 0;
  const nh = analysis?.h || natural?.h || 0;
  const boxAspect = box.w / box.h;
  const imgAspect = nw && nh ? nw / nh : boxAspect;
  const kept = imgAspect > boxAspect ? boxAspect / imgAspect : imgAspect / boxAspect; // share kept by a crop
  let mode: 'cover' | 'contain' | 'blur' = 'cover';
  let position = '50% 50%';
  let bg: string | undefined;
  if (analysis?.kind === 'logo') {
    mode = 'contain';
    bg = analysis.bg;
  } else if (analysis?.kind === 'graphic' && kept < 0.82) {
    mode = 'blur';
  } else if (nw && kept < 0.5) {
    mode = 'blur';
  } else if (nw) {
    if (imgAspect > boxAspect) {
      const x = analysis?.cols ? bestOffset(analysis.cols, analysis.cols.length * kept, false) : 0.5;
      position = `${Math.round(x * 100)}% 50%`;
    } else if (imgAspect < boxAspect) {
      const y = analysis?.rows ? bestOffset(analysis.rows, analysis.rows.length * kept, true) : 0.3;
      position = `50% ${Math.round(y * 100)}%`;
    }
  }

  const boxStyle: React.CSSProperties = { ...style };
  if (bg) boxStyle.background = bg;
  if (naturalAspect && nw && nh) boxStyle.aspectRatio = String(Math.min(naturalAspect[1], Math.max(naturalAspect[0], nw / nh)));

  return (
    <div ref={boxRef} className={`a-si ${zoomOnHover ? 'a-si-zoom' : ''} ${loaded ? 'a-si-in' : ''} ${className}`} style={boxStyle} data-fit={mode}>
      {mode === 'blur' && <img src={src} alt="" aria-hidden="true" className="a-si-back" />}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="a-si-img"
        style={{
          objectFit: mode === 'cover' ? 'cover' : 'contain',
          objectPosition: position,
          padding: mode === 'contain' ? '9%' : undefined,
        }}
        onLoad={e => handleLoaded(e.currentTarget)}
        onError={() => setFailed(true)}
      />
    </div>
  );
};

export default SmartImage;

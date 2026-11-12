// A country's flag, drawn (not an emoji: emoji flags don't draw on Windows). The flags are the
// flag-icons set (MIT), each loaded only when it's shown. A code without a flag shows its letters.
import { useEffect, useState } from 'react';
import { alpha2, countryName } from './flags';

const FLAGS = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;
const cache = new Map<string, string>();

export default function Flag({ code, size = 18, className }: { code: string | null | undefined; size?: number; className?: string }) {
  const c = alpha2(code);
  const key = c ? `/node_modules/flag-icons/flags/4x3/${c.toLowerCase()}.svg` : '';
  const [url, setUrl] = useState<string | null>(() => cache.get(key) ?? null);
  useEffect(() => {
    if (!c || cache.has(key) || !FLAGS[key]) { setUrl(cache.get(key) ?? null); return; }
    let live = true;
    void FLAGS[key]().then(u => { cache.set(key, u); if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [c, key]);
  if (!c) return null;
  const h = Math.round(size * 0.75);
  if (!url) {
    return <span className={className} title={countryName(c)} aria-label={countryName(c)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: h, borderRadius: 3, fontSize: Math.max(8, Math.round(size * 0.42)), fontWeight: 700, letterSpacing: '0.02em', background: 'rgba(255,255,255,0.1)', color: 'rgba(235,240,255,0.75)', verticalAlign: 'middle' }}>{c}</span>;
  }
  return <img src={url} alt={countryName(c)} title={countryName(c)} width={size} height={h} className={className} style={{ display: 'inline-block', width: size, height: h, objectFit: 'cover', borderRadius: 3, boxShadow: '0 0 0 1px rgba(255,255,255,0.14)', verticalAlign: 'middle' }} />;
}

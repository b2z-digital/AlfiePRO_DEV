import { supabase } from '../../utils/supabase';

export interface SiteStats {
  views: number;
  visitors: number;
  sessions: number;
  avg_seconds: number;
  days: { d: string; views: number; visitors: number }[];
  pages: { path: string; views: number; avg: number }[];
  sources: { source: string; visits: number }[];
  devices: { device: string; visits: number }[];
  hours: { dow: number; hour: number; views: number }[];
}

export const EMPTY_STATS: SiteStats = { views: 0, visitors: 0, sessions: 0, avg_seconds: 0, days: [], pages: [], sources: [], devices: [], hours: [] };

const DAY = 86400000;

export async function fetchSiteStats(clubId: string, from: Date, to: Date): Promise<SiteStats> {
  const { data, error } = await supabase.rpc('club_website_stats', {
    p_club: clubId, p_from: from.toISOString(), p_to: to.toISOString(),
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney',
  });
  if (error || !data) return EMPTY_STATS;
  return { ...EMPTY_STATS, ...(data as SiteStats) };
}

/** Last N days ending today, and the N days before that. */
export function periods(days: number) {
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  const start = new Date(end.getTime() - days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  return { start, end, prevStart };
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** One value per day from start (inclusive) for n days, zero where nothing was recorded. */
export function dailySeries(stats: SiteStats, start: Date, n: number, key: 'visitors' | 'views' = 'visitors') {
  const map = new Map(stats.days.map(d => [d.d, d[key]]));
  return Array.from({ length: n }, (_, i) => {
    const day = new Date(start.getTime() + i * DAY + DAY / 2);
    return { date: day, value: map.get(ymd(day)) || 0 };
  });
}

export const pageName = (path: string, pageTitles: Record<string, string> = {}) => {
  if (!path || path === '/') return 'Home';
  const clean = path.replace(/^\//, '');
  const known: Record<string, string> = {
    'race-calendar': 'Race calendar', results: 'Results', news: 'News', classifieds: 'Classifieds',
    venues: 'Venues', 'yacht-classes': 'Yacht classes', contact: 'Contact', privacy: 'Privacy', terms: 'Terms',
  };
  if (known[clean]) return known[clean];
  if (clean.startsWith('news/')) return 'News article';
  if (clean.startsWith('results/')) return 'Race results';
  if (pageTitles[clean]) return pageTitles[clean];
  return clean.replace(/[-/]/g, ' ').replace(/^\w/, c => c.toUpperCase());
};

export const SOURCE_LABEL: Record<string, string> = {
  google: 'Google', facebook: 'Facebook', instagram: 'Instagram', direct: 'Typed or bookmarked', arya: 'ARYA website', search: 'Other search engines', other: 'Other websites',
};

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

export const pctChange = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** Smooth-enough path for a small area chart. */
export function areaPath(values: number[], w: number, h: number, pad = 4, top?: number) {
  const max = top ?? Math.max(1, ...values) * 1.1;
  const n = Math.max(2, values.length);
  const pts = values.map((v, i) => [pad + ((w - pad * 2) * i) / (n - 1), h - 2 - ((h - 8) * v) / max] as [number, number]);
  if (pts.length === 1) pts.push([w - pad, pts[0][1]]);
  const line = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  const fill = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return { line, fill, pts, max };
}

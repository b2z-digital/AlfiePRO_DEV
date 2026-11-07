import { supabase } from '../../utils/supabase';
import type { Article } from '../../utils/articleStorage';

/** Same rules as before: full URLs and site paths as they are, otherwise a file in the article-images bucket. */
export const resolveCoverImage = (coverImage?: string | null): string | null => {
  if (!coverImage) return null;
  if (coverImage.startsWith('http://') || coverImage.startsWith('https://') || coverImage.startsWith('/') || coverImage.startsWith('data:') || coverImage.startsWith('blob:')) {
    return coverImage;
  }
  const { data } = supabase.storage.from('article-images').getPublicUrl(coverImage);
  return data?.publicUrl || null;
};

export const stripHtml = (html?: string | null) =>
  (html || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

export const wordCount = (html?: string | null) => {
  const text = stripHtml(html);
  return text ? text.split(' ').length : 0;
};

export const readMinutes = (html?: string | null) => Math.max(1, Math.round(wordCount(html) / 220));

export const excerptOf = (article: Pick<Article, 'excerpt' | 'content'>, max = 180) => {
  const own = stripHtml(article.excerpt);
  if (own) return own;
  const text = stripHtml(article.content);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
};

/** "Just now", "3h ago", "Yesterday", "4 days ago", then a short date. */
export const relativeDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 0) return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && d.getDate() === now.getDate()) return `${hours}h ago`;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};

export const longDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export const isFresh = (iso?: string | null, days = 3) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && Date.now() - t < days * 86400000 && Date.now() >= t;
};

export type NewsTone = 'club' | 'state' | 'national';

/** Who the story is from, using the same rules as the old labels. */
export const sourceOf = (article: Partial<Article>): { tone: NewsTone; label: string; short: string } => {
  const level = article.event_name ? article.event_level : undefined;
  const type = level === 'national' ? 'national'
    : level === 'state' ? 'state'
      : article.source_type === 'national' ? 'national'
        : article.source_type === 'state' ? 'state'
          : 'club';
  if (type === 'national') return { tone: 'national', label: article.source_name ? `${article.source_name} News` : 'National News', short: article.source_name || 'National' };
  if (type === 'state') return { tone: 'state', label: article.source_name ? `${article.source_name} News` : 'State News', short: article.source_name || 'State' };
  return { tone: 'club', label: 'Club News', short: 'Club' };
};

/** Placeholder palette for stories without a cover image, picked from the id so it stays the same. */
const PLACEHOLDERS: [string, string][] = [
  ['#2E7BFF', '#8A4DFF'],
  ['#8A4DFF', '#FF3E9A'],
  ['#0A84FF', '#40C8C0'],
  ['#FF3E9A', '#FF8A2B'],
  ['#1E6CFF', '#30D158'],
  ['#5856D6', '#2E7BFF'],
];
export const placeholderColours = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  return PLACEHOLDERS[h % PLACEHOLDERS.length];
};

export const splitName = (name?: string | null): [string, string] => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ['', ''];
  return [parts[0], parts.length > 1 ? parts[parts.length - 1] : ''];
};

/** Saving fills an empty summary with the start of the article; that copy isn't worth repeating under the headline. */
export const hasOwnExcerpt = (article: Pick<Article, 'excerpt' | 'content'>) => {
  const ex = stripHtml(article.excerpt).replace(/(\.\.\.|…)$/, '').trim();
  if (!ex) return false;
  const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();
  const body = squash((article.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '));
  return !body.startsWith(squash(ex).slice(0, 80));
};

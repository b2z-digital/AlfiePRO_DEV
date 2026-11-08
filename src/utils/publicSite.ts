// Shared settings for a club's public website: theme, menu and homepage layout.
// Everything here falls back to today's site when a club hasn't saved anything.

export type SiteCorners = 'square' | 'soft' | 'round';
export type SiteButtons = 'solid' | 'outline';

export interface SiteTheme {
  preset?: string;
  primary?: string;      // buttons, links, highlights
  dark?: string;         // footer and dark bands
  accent?: string;       // labels and badges
  headingFont?: string;
  bodyFont?: string;
  corners?: SiteCorners;
  buttons?: SiteButtons;
  logoDark?: string | null; // logo for dark backgrounds (footer)
  favicon?: string | null;
}

export type SiteMenuKind = 'home' | 'auto' | 'page' | 'link' | 'dropdown';

export interface SiteMenuItem {
  id: string;
  kind: SiteMenuKind;
  label: string;
  /** auto: page key; page: page slug; link: full URL */
  target?: string;
  children?: SiteMenuItem[];
}

export interface SiteMenu {
  items: SiteMenuItem[];
}

export type HomeSectionId = 'hero' | 'welcome' | 'tiles' | 'events' | 'news' | 'map';

export interface SiteLayout {
  home?: { id: HomeSectionId; on: boolean }[];
}

/** Pages AlfiePRO builds from club data. Paths are relative to the site root. */
export const AUTO_PAGES: { key: string; label: string; path: string }[] = [
  { key: 'race-calendar', label: 'Race calendar', path: '/race-calendar' },
  { key: 'results', label: 'Results', path: '/results' },
  { key: 'news', label: 'News', path: '/news' },
  { key: 'classifieds', label: 'Classifieds', path: '/classifieds' },
  { key: 'venues', label: 'Venues', path: '/venues' },
  { key: 'yacht-classes', label: 'Yacht classes', path: '/yacht-classes' },
  { key: 'contact', label: 'Contact', path: '/contact' },
];

/** Slugs a custom page can't use because a built-in page lives there. */
export const RESERVED_SLUGS = new Set([
  ...AUTO_PAGES.map(p => p.key), 'privacy', 'terms', 'home', 'news', 'results', 'public', 'admin', 'login',
]);

export const MEMBERSHIP_URL = 'https://alfiepro.com.au/register';

/** The menu every club site had before menus could be edited. */
export const DEFAULT_MENU: SiteMenuItem[] = [
  { id: 'home', kind: 'home', label: 'Home' },
  { id: 'membership', kind: 'link', label: 'Membership', target: MEMBERSHIP_URL },
  { id: 'race-calendar', kind: 'auto', label: 'Race calendar', target: 'race-calendar' },
  { id: 'yacht-classes', kind: 'auto', label: 'Yacht classes', target: 'yacht-classes' },
  { id: 'results', kind: 'auto', label: 'Results', target: 'results' },
  { id: 'venues', kind: 'auto', label: 'Venues', target: 'venues' },
  { id: 'news', kind: 'auto', label: 'Latest news', target: 'news' },
  { id: 'classifieds', kind: 'auto', label: 'Classifieds', target: 'classifieds' },
  { id: 'contact', kind: 'auto', label: 'Contact us', target: 'contact' },
];

export const HOME_SECTIONS: { id: HomeSectionId; label: string; note: string }[] = [
  { id: 'hero', label: 'Hero slides', note: 'The big rotating images' },
  { id: 'welcome', label: 'Welcome', note: 'Your club introduction from Club settings' },
  { id: 'tiles', label: 'Quick links', note: 'Up to 6 tiles' },
  { id: 'events', label: 'Upcoming races and results', note: 'From your race calendar and results' },
  { id: 'news', label: 'Latest news', note: 'Your 3 newest articles' },
  { id: 'map', label: 'Map', note: 'Your default venue' },
];

export function resolveMenu(menu: unknown): SiteMenuItem[] {
  const items = (menu as SiteMenu | null)?.items;
  return Array.isArray(items) && items.length > 0 ? items : DEFAULT_MENU;
}

export function resolveHomeSections(layout: unknown): { id: HomeSectionId; on: boolean }[] {
  const saved = (layout as SiteLayout | null)?.home;
  const known = HOME_SECTIONS.map(s => s.id);
  if (!Array.isArray(saved) || saved.length === 0) return known.map(id => ({ id, on: true }));
  const out = saved.filter(s => known.includes(s.id)).map(s => ({ id: s.id, on: s.on !== false }));
  // Sections added after the club saved its order go at the end, switched on
  for (const id of known) if (!out.some(s => s.id === id)) out.push({ id, on: true });
  return out;
}

/** Path (relative to the site root) a menu item points at, or the full URL for links. */
export function menuItemHref(item: SiteMenuItem): { internal: boolean; href: string } | null {
  switch (item.kind) {
    case 'home': return { internal: true, href: '/' };
    case 'auto': {
      const p = AUTO_PAGES.find(a => a.key === item.target);
      return p ? { internal: true, href: p.path } : null;
    }
    case 'page': return item.target ? { internal: true, href: `/${item.target}` } : null;
    case 'link': return item.target ? { internal: false, href: item.target } : null;
    default: return null;
  }
}

export function countMenuItems(items: SiteMenuItem[]): number {
  return items.reduce((n, i) => n + 1 + (i.children ? countMenuItems(i.children) : 0), 0);
}

/* Theme */

export const SITE_FONTS = ['Outfit', 'Inter', 'Montserrat', 'Open Sans', 'Poppins', 'Lato', 'Roboto', 'Raleway', 'Instrument Sans'];

export const THEME_PRESETS: { id: string; name: string; theme: SiteTheme }[] = [
  { id: 'club', name: 'Club blue', theme: { primary: '#2563EB', dark: '#111827', accent: '#F59E0B', headingFont: 'Outfit', bodyFont: 'Inter', corners: 'soft', buttons: 'solid' } },
  { id: 'harbour', name: 'Harbour', theme: { primary: '#0E7C86', dark: '#0B2A3C', accent: '#FF9B54', headingFont: 'Montserrat', bodyFont: 'Open Sans', corners: 'soft', buttons: 'solid' } },
  { id: 'regatta', name: 'Regatta', theme: { primary: '#D62839', dark: '#14213D', accent: '#FCA311', headingFont: 'Poppins', bodyFont: 'Lato', corners: 'square', buttons: 'solid' } },
  { id: 'lakeside', name: 'Lakeside', theme: { primary: '#15803D', dark: '#0F2A1D', accent: '#EAB308', headingFont: 'Raleway', bodyFont: 'Inter', corners: 'round', buttons: 'solid' } },
];

export const DEFAULT_THEME: Required<Omit<SiteTheme, 'preset' | 'logoDark' | 'favicon'>> = {
  primary: '#2563EB', dark: '#111827', accent: '#F59E0B', headingFont: 'Outfit', bodyFont: 'Inter', corners: 'soft', buttons: 'solid',
};

export function hasTheme(theme: unknown): theme is SiteTheme {
  return !!theme && typeof theme === 'object' && Object.keys(theme as object).length > 0;
}

const HEX = /^#([0-9a-f]{6})$/i;
export const isHex = (v?: string | null): v is string => !!v && HEX.test(v);

function mix(hex: string, other: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
  const ch = (x: number, s: number) => (x >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) * (1 - amount) + ch(b, s) * amount);
  return '#' + [16, 8, 0].map(s => m(s).toString(16).padStart(2, '0')).join('');
}

/** Relative luminance (WCAG). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [16, 8, 0].map(s => {
    const v = ((n >> s) & 255) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** CSS custom properties for a saved theme. */
export function themeVars(theme: SiteTheme): Record<string, string> {
  const t = { ...DEFAULT_THEME, ...Object.fromEntries(Object.entries(theme).filter(([, v]) => v != null && v !== '')) } as typeof DEFAULT_THEME;
  const primary = isHex(t.primary) ? t.primary : DEFAULT_THEME.primary;
  const dark = isHex(t.dark) ? t.dark : DEFAULT_THEME.dark;
  const accent = isHex(t.accent) ? t.accent : DEFAULT_THEME.accent;
  const radius = t.corners === 'square' ? '0px' : t.corners === 'round' ? '999px' : '8px';
  const cardRadius = t.corners === 'square' ? '0px' : t.corners === 'round' ? '18px' : '8px';
  return {
    '--site-p': primary,
    '--site-p-hover': mix(primary, '#000000', 0.14),
    '--site-p-soft': mix(primary, '#ffffff', 0.9),
    '--site-p-ink': luminance(primary) > 0.45 ? '#111827' : '#ffffff',
    '--site-dark': dark,
    '--site-accent': accent,
    '--site-accent-ink': luminance(accent) > 0.45 ? '#1f1300' : '#ffffff',
    '--site-radius': radius,
    '--site-card-radius': cardRadius,
    '--site-head-font': `'${t.headingFont}'`,
    '--site-body-font': `'${t.bodyFont}'`,
  };
}

export function googleFontsHref(fonts: (string | undefined)[]): string | null {
  const list = Array.from(new Set(fonts.filter((f): f is string => !!f && SITE_FONTS.includes(f))));
  if (list.length === 0) return null;
  const fam = list.map(f => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700;800`).join('&');
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}

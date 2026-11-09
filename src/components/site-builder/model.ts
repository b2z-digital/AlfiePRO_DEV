// Site builder: what can be added to a page, and the settings each part has.
import type { DeviceType, EventPageColumn, EventPageRow, EventWidgetConfig, EventWidgetType } from '../../types/eventWidgets';
import { MEMBERSHIP_URL } from '../../utils/publicSite';

export const newId = () => Math.random().toString(36).slice(2, 10);
export const DEVICES: { id: DeviceType; label: string; width: number }[] = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 820 },
  { id: 'mobile', label: 'Phone', width: 390 },
];

/* ── Settings fields ─────────────────────────────────────────────────────── */
export type Field =
  | { k: string; label: string; type: 'text' | 'textarea' | 'url' | 'image'; placeholder?: string; note?: string }
  | { k: string; label: string; type: 'richtext'; note?: string }
  | { k: string; label: string; type: 'number'; min?: number; max?: number; step?: number; unit?: string }
  | { k: string; label: string; type: 'toggle'; note?: string }
  | { k: string; label: string; type: 'seg' | 'select'; options: { v: string; l: string }[] }
  | { k: string; label: string; type: 'checks'; options: { v: string; l: string }[] }
  | { k: string; label: string; type: 'colour'; note?: string }
  | { k: string; label: string; type: 'size' }
  | { k: string; label: string; type: 'items'; item: Field[]; add: string; itemLabel: (it: any, i: number) => string };

const ALIGN: Field = { k: 'align', label: 'Align', type: 'seg', options: [{ v: 'left', l: 'Left' }, { v: 'center', l: 'Centre' }, { v: 'right', l: 'Right' }] };
const BTN_STYLES = [{ v: 'primary', l: 'Main' }, { v: 'dark', l: 'Dark' }, { v: 'accent', l: 'Accent' }, { v: 'outline', l: 'Outline' }, { v: 'light', l: 'White' }, { v: 'ghost', l: 'Glass' }];
const SECTION_TITLE: Field[] = [
  { k: 'show_title', label: 'Show a title', type: 'toggle' },
  { k: 'eyebrow', label: 'Small label above', type: 'text', placeholder: 'On the water' },
  { k: 'title', label: 'Title', type: 'text' },
  { k: 'button_text', label: 'Link text', type: 'text', note: 'Leave empty to hide the link' },
];

export type ModuleGroup = 'basics' | 'layout' | 'club' | 'engage';
export interface ModuleDef {
  type: EventWidgetType;
  label: string;
  note: string;
  group: ModuleGroup;
  live?: boolean;
  icon: string;
  defaults: () => Record<string, any>;
  fields: Field[];
  /** Design-tab fields specific to this module */
  design?: Field[];
}

export const MODULES: ModuleDef[] = [
  {
    type: 'heading', label: 'Heading', note: 'Titles and section headings', group: 'basics', icon: 'heading',
    defaults: () => ({ text: 'A clear, short heading', level: 'h2', align: 'left' }),
    fields: [
      { k: 'text', label: 'Heading', type: 'textarea' },
      { k: 'eyebrow', label: 'Small label above', type: 'text', placeholder: 'Radio yachting since 1987' },
      { k: 'subtext', label: 'Intro line below', type: 'textarea' },
      { k: 'level', label: 'Level', type: 'seg', options: [{ v: 'h1', l: 'H1' }, { v: 'h2', l: 'H2' }, { v: 'h3', l: 'H3' }] },
    ],
    design: [
      { k: 'size', label: 'Size', type: 'size' },
      { k: 'weight', label: 'Weight', type: 'seg', options: [{ v: '', l: 'Auto' }, { v: '500', l: '500' }, { v: '600', l: '600' }, { v: '700', l: '700' }, { v: '800', l: '800' }] },
      ALIGN,
      { k: 'color', label: 'Colour', type: 'colour' },
      { k: 'max_width', label: 'Max width', type: 'number', min: 200, max: 1400, step: 20, unit: 'px' },
    ],
  },
  {
    type: 'site-text', label: 'Text', note: 'Paragraphs, lists and links', group: 'basics', icon: 'text',
    defaults: () => ({ content: '<p>Tell visitors about your club, your racing and how to get involved.</p>', align: 'left', size: 'md' }),
    fields: [{ k: 'content', label: 'Text', type: 'richtext', note: 'You can also type straight onto the page.' }],
    design: [
      { k: 'size', label: 'Text size', type: 'seg', options: [{ v: 'sm', l: 'Small' }, { v: 'md', l: 'Normal' }, { v: 'lg', l: 'Large' }] },
      ALIGN,
      { k: 'color', label: 'Colour', type: 'seg', options: [{ v: '', l: 'Dark' }, { v: 'white', l: 'White' }] },
      { k: 'max_width', label: 'Max width', type: 'number', min: 200, max: 1400, step: 20, unit: 'px' },
    ],
  },
  {
    type: 'site-button', label: 'Button', note: 'One or two buttons', group: 'basics', icon: 'button',
    defaults: () => ({ text: 'Join the club', url: MEMBERSHIP_URL, style: 'primary', size: 'md', align: 'left' }),
    fields: [
      { k: 'text', label: 'Button text', type: 'text' },
      { k: 'url', label: 'Link to', type: 'url' },
      { k: 'second_text', label: 'Second button', type: 'text', placeholder: 'Leave empty for one button' },
      { k: 'second_url', label: 'Second button links to', type: 'url' },
    ],
    design: [
      { k: 'style', label: 'Style', type: 'select', options: BTN_STYLES },
      { k: 'second_style', label: 'Second button style', type: 'select', options: BTN_STYLES },
      { k: 'size', label: 'Size', type: 'seg', options: [{ v: 'sm', l: 'Small' }, { v: 'md', l: 'Medium' }, { v: 'lg', l: 'Large' }] },
      ALIGN,
      { k: 'full', label: 'Full width', type: 'toggle' },
    ],
  },
  {
    type: 'site-image', label: 'Image', note: 'A photo with an optional link', group: 'basics', icon: 'image',
    defaults: () => ({ src: '', alt: '', shape: 'rounded', ratio: 'auto', align: 'center' }),
    fields: [
      { k: 'src', label: 'Image', type: 'image' },
      { k: 'alt', label: 'Describe the image', type: 'text', note: 'Read out by screen readers and shown if the image can’t load' },
      { k: 'caption', label: 'Caption', type: 'text' },
      { k: 'url', label: 'Link to', type: 'url' },
    ],
    design: [
      { k: 'ratio', label: 'Shape', type: 'select', options: [{ v: 'auto', l: 'As uploaded' }, { v: '16:9', l: 'Wide 16:9' }, { v: '4:3', l: 'Classic 4:3' }, { v: '1:1', l: 'Square' }, { v: '3:4', l: 'Tall 3:4' }] },
      { k: 'shape', label: 'Corners', type: 'seg', options: [{ v: 'square', l: 'Square' }, { v: 'rounded', l: 'Rounded' }, { v: 'circle', l: 'Circle' }] },
      ALIGN,
      { k: 'max_width', label: 'Max width', type: 'number', min: 80, max: 1400, step: 20, unit: 'px' },
    ],
  },
  {
    type: 'site-video', label: 'Video', note: 'YouTube or Vimeo', group: 'basics', icon: 'video',
    defaults: () => ({ url: '' }),
    fields: [{ k: 'url', label: 'Video link', type: 'text', placeholder: 'https://www.youtube.com/watch?v=…' }, { k: 'title', label: 'Title (for screen readers)', type: 'text' }],
  },
  {
    type: 'divider', label: 'Divider', note: 'A thin line', group: 'basics', icon: 'divider', defaults: () => ({}), fields: [],
  },
  {
    type: 'spacer', label: 'Space', note: 'Breathing room', group: 'basics', icon: 'spacer', defaults: () => ({ height: 40 }),
    fields: [{ k: 'height', label: 'Height', type: 'number', min: 4, max: 400, step: 4, unit: 'px' }],
  },
  {
    type: 'code-block', label: 'Embed / code', note: 'Forms, maps, widgets', group: 'basics', icon: 'code', defaults: () => ({ code: '', height: 400, enable_sandbox: true }),
    fields: [{ k: 'code', label: 'Embed code', type: 'textarea', note: 'Paste the code a service gives you to embed it' }, { k: 'height', label: 'Height', type: 'number', min: 50, max: 2000, step: 10, unit: 'px' }],
  },

  {
    type: 'feature-cards', label: 'Cards', note: 'Two to four cards side by side', group: 'layout', icon: 'cards',
    defaults: () => ({ columns: 3, style: 'card', items: [
      { title: 'Race with us', text: 'Club racing most weekends, with fleets for every level.', link_text: 'Race calendar', url: '/race-calendar' },
      { title: 'Try sailing', text: 'Borrow a club boat for your first race. We’ll show you the ropes.', link_text: 'Get in touch', url: '/contact' },
      { title: 'Join the club', text: 'Membership covers racing, results and club events.', link_text: 'Join online', url: MEMBERSHIP_URL },
    ] }),
    fields: [{ k: 'items', label: 'Cards', type: 'items', add: 'Add a card', itemLabel: (it, i) => it?.title || `Card ${i + 1}`, item: [
      { k: 'image', label: 'Picture', type: 'image' }, { k: 'title', label: 'Title', type: 'text' }, { k: 'text', label: 'Text', type: 'textarea' },
      { k: 'link_text', label: 'Link text', type: 'text' }, { k: 'url', label: 'Link to', type: 'url' },
    ] }],
    design: [{ k: 'columns', label: 'Per row', type: 'seg', options: [{ v: '2', l: '2' }, { v: '3', l: '3' }, { v: '4', l: '4' }] }, { k: 'style', label: 'Style', type: 'seg', options: [{ v: 'card', l: 'Cards' }, { v: 'plain', l: 'Plain' }] }],
  },
  {
    type: 'accordion', label: 'Questions', note: 'Questions that open', group: 'layout', icon: 'accordion',
    defaults: () => ({ open_first: true, items: [
      { q: 'Do I need my own boat?', a: 'No. The club has boats you can borrow for your first few races.' },
      { q: 'When do you race?', a: 'Most weekends. See the race calendar for times and venues.' },
    ] }),
    fields: [{ k: 'items', label: 'Questions', type: 'items', add: 'Add a question', itemLabel: (it, i) => it?.q || `Question ${i + 1}`, item: [{ k: 'q', label: 'Question', type: 'text' }, { k: 'a', label: 'Answer', type: 'textarea' }] }, { k: 'open_first', label: 'Open the first one', type: 'toggle' }],
  },
  {
    type: 'image-gallery', label: 'Gallery', note: 'A grid of photos', group: 'layout', icon: 'gallery', defaults: () => ({ columns: 3, items: [] }),
    fields: [{ k: 'items', label: 'Photos', type: 'items', add: 'Add a photo', itemLabel: (it, i) => it?.alt || `Photo ${i + 1}`, item: [{ k: 'src', label: 'Photo', type: 'image' }, { k: 'alt', label: 'Describe it', type: 'text' }] }],
    design: [{ k: 'columns', label: 'Per row', type: 'seg', options: [{ v: '2', l: '2' }, { v: '3', l: '3' }, { v: '4', l: '4' }] }],
  },
  {
    type: 'logo-strip', label: 'Sponsors', note: 'A row of logos', group: 'layout', icon: 'logos', defaults: () => ({ title: 'Thanks to our sponsors', height: 56, grayscale: false, items: [] }),
    fields: [{ k: 'title', label: 'Title', type: 'text' }, { k: 'items', label: 'Logos', type: 'items', add: 'Add a logo', itemLabel: (it, i) => it?.alt || `Logo ${i + 1}`, item: [{ k: 'src', label: 'Logo', type: 'image' }, { k: 'alt', label: 'Sponsor name', type: 'text' }, { k: 'url', label: 'Their website', type: 'url' }] }],
    design: [{ k: 'height', label: 'Logo height', type: 'number', min: 24, max: 160, step: 4, unit: 'px' }, { k: 'grayscale', label: 'Grey until hovered', type: 'toggle' }],
  },

  {
    type: 'club-races', label: 'Upcoming races', note: 'From your race calendar', group: 'club', live: true, icon: 'races',
    defaults: () => ({ title: 'Upcoming races', eyebrow: 'On the water', count: 3, layout: 'cards', show_venue: true }),
    fields: [...SECTION_TITLE, { k: 'count', label: 'How many', type: 'number', min: 1, max: 12 }, { k: 'race_class', label: 'Only this class', type: 'text', placeholder: 'e.g. IOM (leave empty for all)' }],
    design: [{ k: 'layout', label: 'Layout', type: 'seg', options: [{ v: 'cards', l: 'Cards' }, { v: 'list', l: 'List' }] }, { k: 'show_venue', label: 'Show the venue', type: 'toggle' }],
  },
  {
    type: 'club-results', label: 'Latest results', note: 'Winners from recent racing', group: 'club', live: true, icon: 'results',
    defaults: () => ({ title: 'Latest results', count: 3, show_podium: true }),
    fields: [...SECTION_TITLE, { k: 'count', label: 'How many', type: 'number', min: 1, max: 8 }, { k: 'show_podium', label: 'Show the top three', type: 'toggle' }],
  },
  {
    type: 'club-news', label: 'News', note: 'Club, state or national news', group: 'club', live: true, icon: 'news',
    defaults: () => ({ title: 'Latest news', count: 3, layout: 'cards', sources: ['club', 'state', 'national'], show_images: true, show_excerpt: true, show_source: true }),
    fields: [...SECTION_TITLE, { k: 'count', label: 'How many', type: 'number', min: 1, max: 12 }, { k: 'sources', label: 'News from', type: 'checks', options: [{ v: 'club', l: 'Your club' }, { v: 'state', l: 'Your state association' }, { v: 'national', l: 'National' }] }],
    design: [{ k: 'layout', label: 'Layout', type: 'seg', options: [{ v: 'cards', l: 'Cards' }, { v: 'list', l: 'List' }] }, { k: 'show_images', label: 'Pictures', type: 'toggle' }, { k: 'show_excerpt', label: 'Summary', type: 'toggle' }, { k: 'show_source', label: 'Where it’s from', type: 'toggle' }],
  },
  {
    type: 'club-classes', label: 'Classes we sail', note: 'Your boat classes', group: 'club', live: true, icon: 'classes',
    defaults: () => ({ title: 'Classes we sail', show_description: true, columns: 4 }),
    fields: [...SECTION_TITLE, { k: 'show_description', label: 'Descriptions', type: 'toggle' }],
    design: [{ k: 'columns', label: 'Per row', type: 'seg', options: [{ v: '2', l: '2' }, { v: '3', l: '3' }, { v: '4', l: '4' }] }],
  },
  {
    type: 'club-committee', label: 'Committee', note: 'Who to contact', group: 'club', live: true, icon: 'committee',
    defaults: () => ({ title: 'Our committee', show_email: true }),
    fields: [{ k: 'show_title', label: 'Show a title', type: 'toggle' }, { k: 'title', label: 'Title', type: 'text' }, { k: 'show_email', label: 'Email links', type: 'toggle' }],
  },
  {
    type: 'club-join', label: 'Join / membership', note: 'A banner with a join button', group: 'club', icon: 'join',
    defaults: () => ({ title: 'Come sailing with us', text: 'New skippers are always welcome. Join online in a few minutes.', button_text: 'Join the club', url: MEMBERSHIP_URL, style: 'brand' }),
    fields: [{ k: 'title', label: 'Title', type: 'text' }, { k: 'text', label: 'Text', type: 'textarea' }, { k: 'button_text', label: 'Button text', type: 'text' }, { k: 'url', label: 'Button links to', type: 'url' }, { k: 'second_text', label: 'Second button', type: 'text', placeholder: 'e.g. Ask a question' }, { k: 'second_url', label: 'Second button links to', type: 'url' }],
    design: [{ k: 'style', label: 'Look', type: 'seg', options: [{ v: 'brand', l: 'Brand' }, { v: 'dark', l: 'Dark' }, { v: 'light', l: 'Light' }] }],
  },
  {
    type: 'club-venues', label: 'Venues', note: 'Where you sail, with directions', group: 'club', live: true, icon: 'venues',
    defaults: () => ({ title: 'Where we sail' }), fields: [...SECTION_TITLE],
  },
  {
    type: 'club-classifieds', label: 'For sale', note: 'Newest boats and gear', group: 'club', live: true, icon: 'classifieds',
    defaults: () => ({ title: 'For sale', count: 3, scope: 'all' }),
    fields: [...SECTION_TITLE, { k: 'count', label: 'How many', type: 'number', min: 1, max: 9 }, { k: 'scope', label: 'Listings', type: 'seg', options: [{ v: 'all', l: 'Everywhere' }, { v: 'club', l: 'Your club only' }] }],
  },
];

export const MODULE_GROUPS: { id: ModuleGroup; label: string; note?: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'layout', label: 'Layout' },
  { id: 'club', label: 'Club · live data', note: 'Fills itself from AlfiePRO' },
];

export const moduleDef = (type: string) => MODULES.find(m => m.type === type);

/** Friendly names for widgets made with the older builders. */
const LEGACY: Record<string, string> = {
  'text-block': 'Text (older)', 'image-block': 'Image (older)', hero: 'Hero (older)', 'cta-button': 'Button (older)', slider: 'Slider', 'media-gallery': 'Gallery (older)',
  'video-player': 'Video (older)', 'contact-form': 'Contact form', 'news-feed': 'News (older)', 'sponsor-grid': 'Sponsors (older)', countdown: 'Countdown',
};
export const moduleLabel = (w: EventWidgetConfig) => moduleDef(w.type)?.label || LEGACY[w.type] || w.type.replace(/-/g, ' ');

export function makeModule(type: EventWidgetType, settings?: Record<string, any>): EventWidgetConfig {
  const def = moduleDef(type);
  return { id: newId(), type, order: 0, settings: { ...(def?.defaults() || {}), ...(settings || {}) } };
}

/* ── Rows ────────────────────────────────────────────────────────────────── */
export const ROW_LAYOUTS: { id: string; widths: number[]; label: string }[] = [
  { id: '1', widths: [12], label: 'One column' },
  { id: '2', widths: [6, 6], label: 'Two columns' },
  { id: '3', widths: [4, 4, 4], label: 'Three columns' },
  { id: '4', widths: [3, 3, 3, 3], label: 'Four columns' },
  { id: '2-1', widths: [8, 4], label: 'Wide and narrow' },
  { id: '1-2', widths: [4, 8], label: 'Narrow and wide' },
  { id: '1-1-2', widths: [3, 3, 6], label: 'Two narrow, one wide' },
  { id: '5-7', widths: [5, 7], label: 'Text and picture' },
];

export function makeColumn(width: number, widgets: EventWidgetConfig[] = []): EventPageColumn {
  return { id: newId(), width, widgets: widgets.map((w, i) => ({ ...w, order: i })) };
}

export function makeRow(widths: number[], cols: EventWidgetConfig[][] = [], extra: Partial<EventPageRow> = {}): EventPageRow {
  return {
    id: newId(), order: 0, columns: widths.map((w, i) => makeColumn(w, cols[i] || [])),
    padding: { top: 56, bottom: 56, left: 24, right: 24 }, columnGap: 24, stackOnMobile: true, ...extra,
  };
}

/** Re-number orders and keep everything consistent before saving. */
export function normaliseRows(rows: EventPageRow[]): EventPageRow[] {
  return rows.map((r, i) => ({ ...r, order: i, columns: r.columns.map(c => ({ ...c, widgets: c.widgets.map((w, j) => ({ ...w, order: j })) })) }));
}

/** A deep copy with fresh ids (duplicate, paste, sections). */
export function cloneRow(r: EventPageRow): EventPageRow {
  return { ...JSON.parse(JSON.stringify(r)), id: newId(), anchor: undefined, columns: r.columns.map(cloneColumn) };
}
export function cloneColumn(c: EventPageColumn): EventPageColumn {
  return { ...JSON.parse(JSON.stringify(c)), id: newId(), widgets: c.widgets.map(cloneModule) };
}
export function cloneModule(w: EventWidgetConfig): EventWidgetConfig {
  return { ...JSON.parse(JSON.stringify(w)), id: newId(), anchor: undefined };
}

/* ── Ready-made sections ─────────────────────────────────────────────────── */
export interface SectionDef { id: string; label: string; note: string; make: () => EventPageRow }

export const SECTIONS: SectionDef[] = [
  {
    id: 'hero', label: 'Hero', note: 'Big title over a photo with buttons',
    make: () => makeRow([12], [[
      makeModule('heading', { level: 'h1', eyebrow: 'Radio yachting since 1987', text: 'Racing every Sunday on the lake', subtext: 'Fleets for every level. New skippers welcome: borrow a club boat for your first race.', color: 'white', max_width: 760 }),
      makeModule('site-button', { text: 'See the race calendar', url: '/race-calendar', style: 'accent', size: 'lg', second_text: 'Try sailing', second_url: '/contact', second_style: 'ghost' }),
    ]], { name: 'Hero', minHeight: '520px', padding: { top: 120, bottom: 96, left: 24, right: 24 }, background: { type: 'gradient', value: 'linear-gradient(160deg, var(--site-dark, #0F2742), var(--site-p, #1A8FE3))' } }),
  },
  {
    id: 'intro', label: 'Text and picture', note: 'A story with a photo beside it',
    make: () => makeRow([6, 6], [
      [makeModule('heading', { eyebrow: 'Who we are', text: 'A friendly club on the water', level: 'h2' }), makeModule('site-text', { content: '<p>From first-timers to national champions, our skippers race radio-controlled yachts most weekends.</p><p>Come down, have a look and try one of the club boats.</p>' }), makeModule('site-button', { text: 'Get in touch', url: '/contact', style: 'outline' })],
      [makeModule('site-image', { src: '', ratio: '4:3' })],
    ], { name: 'Text and picture' }),
  },
  {
    id: 'cards', label: 'Feature cards', note: 'Three ways to get involved',
    make: () => makeRow([12], [[makeModule('heading', { text: 'Get involved', level: 'h2', align: 'center' }), makeModule('feature-cards')]], { name: 'Feature cards', background: { type: 'color', value: '#F5F8FC' } }),
  },
  {
    id: 'racing', label: 'Races and results', note: 'Upcoming races beside the latest results',
    make: () => makeRow([7, 5], [[makeModule('club-races', { layout: 'list', count: 4 })], [makeModule('club-results', { count: 2 })]], { name: 'Races and results' }),
  },
  {
    id: 'news', label: 'Latest news', note: 'Three newest stories',
    make: () => makeRow([12], [[makeModule('club-news')]], { name: 'Latest news', background: { type: 'color', value: '#F5F8FC' } }),
  },
  {
    id: 'join', label: 'Join banner', note: 'Membership call to action',
    make: () => makeRow([12], [[makeModule('club-join')]], { name: 'Join banner', padding: { top: 40, bottom: 40, left: 24, right: 24 } }),
  },
  {
    id: 'faq', label: 'Questions', note: 'Common questions, answered',
    make: () => makeRow([4, 8], [[makeModule('heading', { text: 'Questions', level: 'h2', subtext: 'Can’t see yours? Get in touch.' })], [makeModule('accordion')]], { name: 'Questions' }),
  },
  {
    id: 'sponsors', label: 'Sponsors strip', note: 'Logos of the people who help',
    make: () => makeRow([12], [[makeModule('logo-strip', { grayscale: true })]], { name: 'Sponsors', padding: { top: 40, bottom: 40, left: 24, right: 24 } }),
  },
];

/* ── Selection paths ─────────────────────────────────────────────────────── */
export type Sel =
  | { kind: 'row'; row: string }
  | { kind: 'col'; row: string; col: string }
  | { kind: 'mod'; row: string; col: string; mod: string };

export function findSel(rows: EventPageRow[], id: string, kind: 'row' | 'col' | 'mod'): Sel | null {
  for (const r of rows) {
    if (kind === 'row' && r.id === id) return { kind: 'row', row: r.id };
    for (const c of r.columns) {
      if (kind === 'col' && c.id === id) return { kind: 'col', row: r.id, col: c.id };
      for (const w of c.widgets) if (kind === 'mod' && w.id === id) return { kind: 'mod', row: r.id, col: c.id, mod: w.id };
    }
  }
  return null;
}

export function getAt(rows: EventPageRow[], sel: Sel | null) {
  if (!sel) return { row: null, col: null, mod: null };
  const row = rows.find(r => r.id === sel.row) || null;
  const col = sel.kind !== 'row' ? row?.columns.find(c => c.id === sel.col) || null : null;
  const mod = sel.kind === 'mod' ? col?.widgets.find(w => w.id === sel.mod) || null : null;
  return { row, col, mod };
}

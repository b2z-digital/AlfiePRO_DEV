// Every block the builder offers, with its starting settings.
import type { Block, BlockProps, BlockType, EmailDoc } from './types.ts';

export interface BlockInfo<T extends BlockType = BlockType> {
  type: T;
  label: string;
  group: 'club' | 'basic';
  note: string;
  live?: boolean;
  personal?: boolean;
  defaults: () => BlockProps[T];
}

const info = <T extends BlockType>(b: BlockInfo<T>) => b;

export const BLOCKS: { [K in BlockType]: BlockInfo<K> } = {
  news: info({ type: 'news', label: 'Latest news', group: 'club', live: true, note: 'Club, state or national news',
    defaults: () => ({ title: 'Latest news', sources: ['club', 'state', 'national'], clubFirst: true, count: 3, layout: 'feature', showImages: true, showSummary: true, showSource: true, sinceLastSend: false, whenEmpty: 'hide', buttonText: 'Read more news' }) }),
  results: info({ type: 'results', label: 'Latest results', group: 'club', live: true, personal: true, note: 'Top finishers, reader highlighted',
    defaults: () => ({ title: 'Latest results', count: 1, top: 3, highlightReader: true, buttonText: 'See full results' }) }),
  events: info({ type: 'events', label: 'Upcoming events', group: 'club', live: true, personal: true, note: 'With I’m going buttons',
    defaults: () => ({ title: 'Coming up', count: 3, daysAhead: 30, myClasses: false, showAnswer: true, showGoing: true, showDetails: true, buttonText: 'See the race calendar' }) }),
  classifieds: info({ type: 'classifieds', label: 'Classifieds', group: 'club', live: true, note: 'Newest boats and gear',
    defaults: () => ({ title: 'New in Classifieds', count: 3, scope: 'everywhere', showPrice: true, buttonText: 'See all classifieds' }) }),
  videos: info({ type: 'videos', label: 'AlfieTV', group: 'club', live: true, note: 'Latest videos',
    defaults: () => ({ title: 'On AlfieTV', count: 3, source: 'everywhere', buttonText: 'Watch on AlfieTV' }) }),
  membership: info({ type: 'membership', label: 'Membership', group: 'club', personal: true, note: 'Renew or join, for each reader',
    defaults: () => ({ title: 'Your membership', renewText: 'Renew now', joinText: 'Join the club', showWhenCurrent: true }) }),
  calendar: info({ type: 'calendar', label: 'Race calendar', group: 'club', live: true, personal: true, note: 'The next few weeks of racing',
    defaults: () => ({ title: 'Next 4 weeks', weeks: 4, myClasses: false, showVenue: true, buttonText: 'Full race calendar' }) }),
  countdown: info({ type: 'countdown', label: 'Event countdown', group: 'club', live: true, note: 'Days to go and who’s going',
    defaults: () => ({ title: '', showGoing: true }) }),

  header: info({ type: 'header', label: 'Club header', group: 'basic', note: 'Logo and club name',
    defaults: () => ({ show: 'both', tone: 'dark', note: '' }) }),
  hero: info({ type: 'hero', label: 'Hero', group: 'basic', note: 'Big picture with a title',
    defaults: () => ({ image: '', label: '', title: 'A big headline', text: '', buttonText: '', url: '', height: 'md' }) }),
  heading: info({ type: 'heading', label: 'Heading', group: 'basic', note: 'Section title',
    defaults: () => ({ text: 'Heading', size: 'md', align: 'left' }) }),
  text: info({ type: 'text', label: 'Text', group: 'basic', note: 'Paragraphs and links',
    defaults: () => ({ text: 'Hi {first_name}, write your message here.', align: 'left' }) }),
  button: info({ type: 'button', label: 'Button', group: 'basic', note: 'A link people tap',
    defaults: () => ({ text: 'Find out more', url: '', style: 'solid', align: 'left' }) }),
  image: info({ type: 'image', label: 'Image', group: 'basic', note: 'A photo or graphic',
    defaults: () => ({ src: '', alt: '', url: '', inset: true, caption: '' }) }),
  columns: info({ type: 'columns', label: 'Columns', group: 'basic', note: 'Two or three cards side by side',
    defaults: () => ({ cols: 2, items: [{ title: 'First', text: 'A short description.', buttonText: 'More', url: '' }, { title: 'Second', text: 'A short description.', buttonText: 'More', url: '' }] }) }),
  quote: info({ type: 'quote', label: 'Quote', group: 'basic', note: 'Something someone said',
    defaults: () => ({ text: 'A great day on the water.', by: '' }) }),
  social: info({ type: 'social', label: 'Social links', group: 'basic', note: 'Website, Facebook, Instagram',
    defaults: () => ({ title: 'Follow the club', links: [{ kind: 'website', url: '' }, { kind: 'facebook', url: '' }, { kind: 'instagram', url: '' }] }) }),
  logos: info({ type: 'logos', label: 'Sponsors', group: 'basic', note: 'A row of logos',
    defaults: () => ({ title: 'Thanks to our sponsors', items: [] }) }),
  divider: info({ type: 'divider', label: 'Divider', group: 'basic', note: 'A thin line', defaults: () => ({}) }),
  spacer: info({ type: 'spacer', label: 'Space', group: 'basic', note: 'Breathing room', defaults: () => ({ size: 'md' }) }),
};

export const CLUB_BLOCKS: BlockType[] = ['news', 'results', 'events', 'classifieds', 'videos', 'membership', 'calendar', 'countdown'];
export const BASIC_BLOCKS: BlockType[] = ['header', 'hero', 'heading', 'text', 'button', 'image', 'columns', 'quote', 'social', 'logos', 'divider', 'spacer'];

export const newId = () => Math.random().toString(36).slice(2, 10);

export function makeBlock<T extends BlockType>(type: T): Block<T> {
  return { id: newId(), type, props: BLOCKS[type].defaults() as BlockProps[T] };
}

/** Fill in settings added after a block was saved, so old emails keep working. */
export function normaliseDoc(raw: unknown): EmailDoc {
  const d = raw as EmailDoc | null;
  const blocks = Array.isArray(d?.blocks) ? d!.blocks : [];
  return {
    version: 1,
    blocks: blocks
      .filter(b => b && typeof b === 'object' && (b.type as string) in BLOCKS)
      .map(b => ({ id: b.id || newId(), type: b.type, props: { ...(BLOCKS[b.type].defaults() as object), ...(b.props || {}) } as any })),
  };
}

export const emptyDoc = (): EmailDoc => ({
  version: 1,
  blocks: [makeBlock('header'), makeBlock('text'), makeBlock('button')],
});

/** A starting point that shows off the club blocks. */
export const starterDoc = (): EmailDoc => ({
  version: 1,
  blocks: [
    makeBlock('header'),
    { ...makeBlock('hero'), props: { ...BLOCKS.hero.defaults(), label: 'What’s on', title: 'This week at the club' } },
    { ...makeBlock('text'), props: { text: 'Hi {first_name}, here’s what’s happening at the club.', align: 'left' } },
    makeBlock('results'),
    makeBlock('events'),
    makeBlock('news'),
  ],
});

/** Block ids of the club content blocks in a doc (for the "Live" checks). */
export const liveTypes = (doc: EmailDoc) => Array.from(new Set(doc.blocks.filter(b => BLOCKS[b.type].live || BLOCKS[b.type].personal).map(b => b.type)));

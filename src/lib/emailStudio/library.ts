// AlfiePRO template library: ready-made emails every club and association can start from.
// Each uses the club's own brand kit and club content blocks, so they fill themselves in.
import { BLOCKS, newId } from './catalog.ts';
import type { Block, BlockProps, BlockType, EmailDoc } from './types.ts';

const b = <T extends BlockType>(type: T, props: Partial<BlockProps[T]> = {}): Block<T> =>
  ({ id: newId(), type, props: { ...(BLOCKS[type].defaults() as object), ...props } as BlockProps[T] });

export interface LibraryTemplate {
  key: string;
  name: string;
  category: 'Newsletters' | 'Results' | 'Events' | 'Membership' | 'Announcements' | 'Seasonal';
  note: string;
  subject: string;
  preview: string;
  topic: string;
  doc: () => EmailDoc;
}

export const LIBRARY: LibraryTemplate[] = [
  {
    key: 'weekly', name: 'Weekly club update', category: 'Newsletters', topic: 'news',
    note: 'Results, racing, news and listings', subject: 'This week at {club_name}', preview: 'Results, what’s coming up and the latest club news',
    doc: () => ({ version: 1, blocks: [
      b('header', { note: 'Weekly update' }),
      b('hero', { label: 'What’s on', title: 'This week at the club', height: 'sm' }),
      b('text', { text: 'Hi {first_name}, here’s what’s happening at the club this week.' }),
      b('results'), b('events', { count: 3, daysAhead: 14 }), b('news', { count: 3 }), b('classifieds', { count: 3 }),
    ] }),
  },
  {
    key: 'results', name: 'Race day results', category: 'Results', topic: 'results',
    note: 'Podium, full results and what’s next', subject: 'Results are in', preview: 'See how the fleet finished',
    doc: () => ({ version: 1, blocks: [
      b('header'), b('hero', { label: 'Results', title: 'Results are in', height: 'sm' }),
      b('text', { text: 'Hi {first_name}, thanks to everyone who sailed. Here’s how the fleet finished.' }),
      b('results', { top: 5 }), b('videos', { count: 1, title: 'On AlfieTV' }), b('events', { title: 'Next up', count: 2 }),
    ] }),
  },
  {
    key: 'entries', name: 'Entries are open', category: 'Events', topic: 'events',
    note: 'Event hero, key dates and an Enter button', subject: 'Entries are open', preview: 'Key dates and how to enter',
    doc: () => ({ version: 1, blocks: [
      b('header'), b('hero', { label: 'Entries open', title: 'Name of the regatta', text: 'Dates · Venue', buttonText: 'Enter now', url: '', height: 'lg' }),
      b('text', { text: 'Hi {first_name}, entries are now open. Early entry closes on **date**.\n\n- Racing on **day one** and **day two**\n- Registration and measurement the evening before\n- Regatta dinner on the Saturday night' }),
      b('countdown'), b('button', { text: 'Enter now', url: '', align: 'center' }), b('calendar', { title: 'Also coming up', weeks: 8 }),
    ] }),
  },
  {
    key: 'welcome', name: 'Welcome to the club', category: 'Membership', topic: 'important',
    note: 'First steps and the app', subject: 'Welcome to {club_name}', preview: 'Everything you need for your first race day',
    doc: () => ({ version: 1, blocks: [
      b('header'), b('hero', { label: 'Welcome', title: 'Welcome aboard, {first_name}', height: 'sm' }),
      b('text', { text: 'We’re glad you’ve joined {club_name}. Here’s how to get started:\n\n- Sign in to AlfiePRO to see results, the race calendar and club news\n- Add your boat to your profile\n- Say you’re going to your first race day below' }),
      b('events', { title: 'Your first race day', count: 2 }), b('membership', { showWhenCurrent: true }),
    ] }),
  },
  {
    key: 'renewal', name: 'Renewal reminder', category: 'Membership', topic: 'important',
    note: 'Membership card and a renew button', subject: 'Time to renew your {club_name} membership', preview: 'Renew in a minute and keep racing',
    doc: () => ({ version: 1, blocks: [
      b('header'), b('text', { text: 'Hi {first_name},\n\nYour membership is due for renewal. Renewing keeps you racing, covered and in the results.' }),
      b('membership', { showWhenCurrent: false }), b('calendar', { title: 'Racing coming up', weeks: 6 }),
    ] }),
  },
  {
    key: 'wrap', name: 'Season wrap-up', category: 'Seasonal', topic: 'news',
    note: 'Champions, photos and thanks', subject: 'That’s a wrap on the season', preview: 'Champions, highlights and thank yous',
    doc: () => ({ version: 1, blocks: [
      b('header'), b('hero', { label: 'Season wrap-up', title: 'What a season', height: 'md' }),
      b('text', { text: 'Hi {first_name}, thank you for a fantastic season on the water.' }),
      b('results', { title: 'Final results', top: 5 }), b('videos', { title: 'Highlights', count: 3 }),
      b('quote', { text: 'A great season of close racing and good company.', by: 'The Commodore' }),
      b('logos', { title: 'Thanks to our sponsors' }),
    ] }),
  },
  {
    key: 'letter', name: 'Letter from the Commodore', category: 'Announcements', topic: 'news',
    note: 'Plain and personal', subject: 'A note from the Commodore', preview: 'News from the committee',
    doc: () => ({ version: 1, blocks: [
      b('header', { tone: 'light' }),
      b('text', { text: 'Dear {first_name},\n\nWrite your letter here.\n\nKind regards,\n**Your name**\nCommodore, {club_name}' }),
    ] }),
  },
  {
    key: 'host', name: 'Welcome from the host club', category: 'Events', topic: 'events',
    note: 'Countdown, venue and agenda for visitors', subject: 'Welcome to the regatta, {first_name}', preview: 'Everything you need before you arrive',
    doc: () => ({ version: 1, blocks: [
      b('header'), b('hero', { label: 'You’re in', title: 'See you on the water, {first_name}', height: 'md' }),
      b('text', { text: 'We can’t wait to host you. Here’s everything you need before you arrive.' }),
      b('countdown'),
      b('heading', { text: 'Agenda', size: 'sm' }),
      b('text', { text: '- **Friday 4 to 7pm** Registration and measurement\n- **Saturday 9:00am** Briefing, first warning 10:00am\n- **Saturday 6:30pm** Regatta dinner\n- **Sunday 3:30pm** Presentation' }),
      b('heading', { text: 'Where to stay', size: 'sm' }),
      b('columns', { cols: 2, items: [{ title: 'Place to stay', text: 'Distance from the venue and any club rate.', buttonText: 'Book', url: '' }, { title: 'Another option', text: 'Distance from the venue.', buttonText: 'Book', url: '' }] }),
    ] }),
  },
  {
    key: 'agm', name: 'AGM notice and nominations', category: 'Announcements', topic: 'important',
    note: 'Date, agenda and how to nominate', subject: 'Notice of the {club_name} AGM', preview: 'Date, agenda and committee nominations',
    doc: () => ({ version: 1, blocks: [
      b('header', { tone: 'light' }),
      b('heading', { text: 'Annual General Meeting', size: 'lg' }),
      b('text', { text: 'Dear {first_name},\n\nNotice is given that the Annual General Meeting of {club_name} will be held on **date** at **time**, at **venue**.\n\n**Agenda**\n- Apologies\n- Minutes of the last AGM\n- Reports from the Commodore and Treasurer\n- Election of the committee\n- General business\n\nNominations for the committee close on **date**.' }),
      b('button', { text: 'Nominate someone', url: '' }),
    ] }),
  },
];

export const LIBRARY_CATEGORIES = ['Newsletters', 'Results', 'Events', 'Membership', 'Announcements', 'Seasonal'] as const;

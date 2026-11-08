// Email studio: the email document, live club content and the reader.
// Shared by the app (builder, previews) and the email-studio edge function (sending),
// so this folder must stay free of browser, React and Supabase imports.

export type Align = 'left' | 'center';

export type BlockType =
  | 'header' | 'hero' | 'heading' | 'text' | 'button' | 'image' | 'divider' | 'spacer'
  | 'columns' | 'quote' | 'social' | 'logos'
  | 'news' | 'events' | 'results' | 'classifieds' | 'videos' | 'membership' | 'calendar' | 'countdown';

export interface CardItem { image?: string; title?: string; text?: string; buttonText?: string; url?: string }
export interface SocialLink { kind: 'facebook' | 'instagram' | 'youtube' | 'website' | 'x'; url: string }
export interface LogoItem { src: string; url?: string; alt?: string }

export interface BlockProps {
  header: { show: 'logo' | 'name' | 'both'; tone: 'dark' | 'primary' | 'light'; note?: string };
  hero: { image?: string; label?: string; title?: string; text?: string; buttonText?: string; url?: string; height: 'sm' | 'md' | 'lg' };
  heading: { text: string; size: 'lg' | 'md' | 'sm'; align: Align };
  text: { text: string; align: Align };
  button: { text: string; url: string; style: 'solid' | 'outline'; align: Align; full?: boolean };
  image: { src?: string; alt?: string; url?: string; inset?: boolean; caption?: string };
  divider: Record<string, never>;
  spacer: { size: 'sm' | 'md' | 'lg' };
  columns: { cols: 2 | 3; items: CardItem[] };
  quote: { text: string; by?: string };
  social: { title?: string; links: SocialLink[] };
  logos: { title?: string; items: LogoItem[] };
  news: {
    title?: string; sources: ('club' | 'state' | 'national')[]; clubFirst: boolean; count: number;
    layout: 'list' | 'cards' | 'feature'; showImages: boolean; showSummary: boolean; showSource: boolean;
    sinceLastSend: boolean; whenEmpty: 'hide' | 'older'; buttonText?: string;
  };
  events: {
    title?: string; count: number; daysAhead: number; myClasses: boolean;
    showAnswer: boolean; showGoing: boolean; showDetails: boolean; buttonText?: string;
  };
  results: { title?: string; count: number; top: number; highlightReader: boolean; buttonText?: string };
  classifieds: { title?: string; count: number; category?: string; scope: 'club' | 'everywhere'; showPrice: boolean; buttonText?: string };
  videos: { title?: string; count: number; source: 'club' | 'everywhere'; buttonText?: string };
  membership: { title?: string; renewText?: string; joinText?: string; showWhenCurrent: boolean };
  calendar: { title?: string; weeks: number; myClasses: boolean; showVenue: boolean; buttonText?: string };
  countdown: { eventKey?: string; title?: string; showGoing: boolean };
}

export type Block<T extends BlockType = BlockType> = { id: string; type: T; props: BlockProps[T] };

export interface EmailDoc {
  version: 1;
  blocks: Block[];
}

/* Brand kit (comes from Website › Design unless the club turns that off) */
export interface Brand {
  clubName: string;
  logo?: string | null;
  logoDark?: string | null;
  primary: string;
  dark: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  corners: 'square' | 'soft' | 'round';
  buttons: 'solid' | 'outline';
}

/* Live content, fetched when the email is built or sent */
export interface FeedNews { id: string; title: string; excerpt?: string | null; image?: string | null; published_at?: string | null; source: 'club' | 'state' | 'national'; url: string }
export interface FeedEvent {
  event_key: string; kind: 'event' | 'round' | 'meeting'; title: string; event_date: string; end_date?: string | null;
  venue?: string | null; map_url?: string | null; race_class?: string | null; class_key?: string | null; race_format?: string | null;
  is_paid?: boolean; entry_fee?: number | null; start_time?: string | null; going?: number; url: string;
}
export interface FeedStanding { pos: number; name: string; sail?: string | null; points?: number | null }
export interface FeedResult { id: string; title: string; date: string; race_class?: string | null; boats: number; url: string; standings: FeedStanding[] }
export interface FeedClassified { id: string; title: string; price?: number | null; image?: string | null; location?: string | null; category?: string | null; url: string; mine?: boolean }
export interface FeedVideo { id: string; title: string; thumb?: string | null; duration?: string | null; url: string; mine?: boolean }

export interface Feed {
  club: { id: string; name: string; address?: string | null; appUrl: string; siteUrl: string };
  news: FeedNews[];
  events: FeedEvent[];
  results: FeedResult[];
  classifieds: FeedClassified[];
  videos: FeedVideo[];
  /** When the last email of this kind went out (for "only since the last send") */
  lastSentAt?: string | null;
}

export interface Reader {
  member_id?: string | null;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  user_id?: string | null;
  is_member: boolean;
  is_financial?: boolean;
  renewal_date?: string | null;
  membership_level?: string | null;
  boats?: { class: string; key?: string | null; label?: string | null }[];
  answers?: Record<string, 'yes' | 'no' | 'maybe'>;
  /** What's On answer token, for "I'm going" buttons */
  token?: string | null;
  renewUrl?: string | null;
}

export interface RenderOptions {
  subject?: string;
  previewText?: string;
  brand: Brand;
  feed: Feed;
  reader: Reader;
  footerAddress?: string | null;
  /** Builder canvas: adds block markers and skips tracking */
  edit?: boolean;
  /** Turn a link into a tracked link (send only) */
  wrapLink?: (url: string, blockId: string) => string;
  openPixel?: string | null;
  preferencesUrl?: string | null;
  unsubscribeUrl?: string | null;
  viewInBrowserUrl?: string | null;
}

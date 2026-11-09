import React, { createContext, useContext, useState } from 'react';
import DOMPurify from 'dompurify';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, ExternalLink, Mail, MapPin, Trophy, Users } from 'lucide-react';
import type { DeviceType, EventWidgetConfig } from '../../types/eventWidgets';
import { MEMBERSHIP_URL } from '../../utils/publicSite';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { useClubClasses, useClubCommittee, useClubListings, useClubNews, useClubRaces, useClubResults, useClubVenues } from './clubData';
import '../../styles/site-modules.css';

/** Set by the site builder canvas: lets modules show placeholders and edit text in place. */
export interface SiteEdit {
  device: DeviceType;
  /** Save text typed straight into a module */
  inline: (widgetId: string, key: string, value: string) => void;
}
export const SiteEditContext = createContext<SiteEdit | null>(null);
export const useSiteEdit = () => useContext(SiteEditContext);

export const SITE_MODULE_TYPES = new Set([
  'heading', 'site-text', 'site-image', 'site-video', 'image-gallery', 'logo-strip', 'site-button', 'feature-cards', 'accordion', 'club-races', 'club-results', 'club-news', 'club-classes',
  'club-committee', 'club-join', 'club-venues', 'club-classifieds',
]);

export const HEADING_SIZES: Record<string, Record<DeviceType, number>> = {
  h1: { desktop: 50, tablet: 40, mobile: 32 },
  h2: { desktop: 32, tablet: 28, mobile: 24 },
  h3: { desktop: 22, tablet: 20, mobile: 18 },
};

/** A heading's size on a screen: its own value, else the next larger screen's (scaled), else the default. */
export function headingSize(size: Partial<Record<DeviceType, number>> | undefined, level: 'h1' | 'h2' | 'h3', device: DeviceType): number {
  const own = (d: DeviceType) => (Number(size?.[d]) > 0 ? Number(size?.[d]) : null);
  const def = HEADING_SIZES[level];
  if (device === 'desktop') return own('desktop') ?? def.desktop;
  if (device === 'tablet') return own('tablet') ?? (own('desktop') ? Math.round(own('desktop')! * def.tablet / def.desktop) : def.tablet);
  const t = own('tablet') ?? (own('desktop') ? Math.round(own('desktop')! * def.tablet / def.desktop) : null);
  return own('mobile') ?? (t ? Math.round(t * def.mobile / def.tablet) : def.mobile);
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymd = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return { y, m: m - 1, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
const longDate = (s?: string | null) => { if (!s) return ''; const v = ymd(s); return `${DAYS[v.dow]} ${v.d} ${MONTHS[v.m].charAt(0)}${MONTHS[v.m].slice(1).toLowerCase()}`; };
const money = (n: number | null) => (n == null ? '' : `$${Number(n).toLocaleString('en-AU', { maximumFractionDigits: 2 })}`);

/** Text that can be typed into on the builder canvas. */
const Editable: React.FC<{ id: string; k: string; value: string; as?: keyof JSX.IntrinsicElements; className?: string; style?: React.CSSProperties; html?: boolean }> = ({ id, k, value, as = 'div', className, style, html }) => {
  const edit = useSiteEdit();
  const Tag = as as React.ElementType;
  if (!edit) return html ? <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: value }} /> : <Tag className={className} style={style}>{value}</Tag>;
  return (
    <Tag
      className={className}
      style={style}
      data-sb-inline={k}
      data-sb-mod-inline={id}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const v = html ? e.currentTarget.innerHTML : e.currentTarget.innerText.replace(/\n+$/, '');
        if (v !== value) edit.inline(id, k, v);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => { if (!html && e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
      {...(html ? { dangerouslySetInnerHTML: { __html: value } } : { children: value })}
    />
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => {
  const edit = useSiteEdit();
  return edit ? <div className="sm-empty">{text}</div> : null;
};

const Title: React.FC<{ w: EventWidgetConfig; fallback: string; link?: { to: string; text: string } }> = ({ w, fallback, link }) => {
  const s = w.settings || {};
  if (s.show_title === false) return null;
  return (
    <div className="sm-titlebar">
      <div>
        {s.eyebrow ? <div className="sm-eyebrow">{s.eyebrow}</div> : null}
        <Editable id={w.id} k="title" value={s.title ?? fallback} as="h2" className="sm-h2" />
      </div>
      {link && s.button_text !== '' && <SiteLink to={link.to} className="sm-more">{s.button_text || link.text}<ArrowRight size={16} /></SiteLink>}
    </div>
  );
};

/** Internal links use the router; anything else opens normally. */
const SiteLink: React.FC<{ to: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ to, className, style, children }) => {
  const { buildPublicUrl } = usePublicNavigation();
  if (/^(https?:|mailto:|tel:|#)/i.test(to)) return <a href={to} className={className} style={style} target={/^https?:/i.test(to) ? '_blank' : undefined} rel="noreferrer">{children}</a>;
  return <Link to={buildPublicUrl(to.startsWith('/') ? to : `/${to}`)} className={className} style={style}>{children}</Link>;
};

/* ── Basics ──────────────────────────────────────────────────────────────── */
const HeadingModule: React.FC<{ w: EventWidgetConfig; device: DeviceType }> = ({ w, device }) => {
  const s = w.settings || {};
  const level = (['h1', 'h2', 'h3'].includes(s.level) ? s.level : 'h2') as 'h1' | 'h2' | 'h3';
  const size = headingSize(s.size, level, device);
  const color = s.color === 'white' ? '#fff' : s.color === 'primary' ? 'var(--site-p, #2563EB)' : s.color === 'dark' ? 'var(--site-dark, #0F172A)' : /^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : undefined;
  return (
    <div className="sm-heading" style={{ textAlign: s.align || 'left' }}>
      {s.eyebrow ? <Editable id={w.id} k="eyebrow" value={s.eyebrow} className="sm-eyebrow" style={color ? { color, opacity: 0.85 } : undefined} /> : null}
      <Editable id={w.id} k="text" value={s.text ?? 'Heading'} as={level} className="sm-head" style={{ fontSize: size, fontWeight: Number(s.weight) || (level === 'h1' ? 800 : 700), lineHeight: level === 'h1' ? 1.05 : level === 'h2' ? 1.15 : 1.25, color, maxWidth: s.max_width ? `${s.max_width}px` : undefined, marginLeft: s.align === 'center' ? 'auto' : undefined, marginRight: s.align === 'center' ? 'auto' : undefined }} />
      {s.subtext ? <Editable id={w.id} k="subtext" value={s.subtext} as="p" className="sm-lede" style={{ color: s.color === 'white' ? 'rgba(255,255,255,.86)' : undefined, marginLeft: s.align === 'center' ? 'auto' : undefined, marginRight: s.align === 'center' ? 'auto' : undefined }} /> : null}
    </div>
  );
};

/** Clean rich text: keeps headings, lists, links and simple formatting. */
export const cleanHtml = (html: string) => DOMPurify.sanitize(String(html || ''), {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
});

const TextModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  const html = cleanHtml(s.content ?? '<p>Write something about your club.</p>');
  return (
    <Editable id={w.id} k="content" value={html} html className={`sm-text sm-text-${s.size || 'md'}`}
      style={{ textAlign: s.align || 'left', color: s.color === 'white' ? '#fff' : undefined, maxWidth: s.max_width ? `${s.max_width}px` : undefined, marginLeft: s.align === 'center' ? 'auto' : undefined, marginRight: s.align === 'center' ? 'auto' : undefined }} />
  );
};

const ImageModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  if (!s.src) return <Empty text="Choose an image in the panel on the right" />;
  const img = <img src={s.src} alt={s.alt || ''} className={`sm-img sm-img-${s.shape || 'rounded'}`} style={{ aspectRatio: s.ratio && s.ratio !== 'auto' ? s.ratio.replace(':', ' / ') : undefined, objectFit: s.ratio && s.ratio !== 'auto' ? 'cover' : undefined, maxWidth: s.max_width ? `${s.max_width}px` : undefined }} loading="lazy" />;
  return (
    <figure className="sm-fig" style={{ textAlign: s.align || 'center' }}>
      {s.url ? <SiteLink to={s.url}>{img}</SiteLink> : img}
      {s.caption ? <figcaption className="sm-cap">{s.caption}</figcaption> : null}
    </figure>
  );
};

const videoEmbed = (url: string) => {
  const yt = (url || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vm = (url || '').match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
};

const VideoModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  const src = videoEmbed(s.url);
  if (!src) return <Empty text="Paste a YouTube or Vimeo link in the panel on the right" />;
  return <div className="sm-video"><iframe src={src} title={s.title || 'Video'} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen loading="lazy" /></div>;
};

const GalleryModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  const items: any[] = (Array.isArray(s.items) ? s.items : []).filter(i => i?.src);
  if (!items.length) return <Empty text="Add photos in the panel on the right" />;
  return (
    <div className={`sm-gallery sm-cols-${s.columns || 3}`}>
      {items.map((it, i) => <a key={i} href={it.src} target="_blank" rel="noreferrer" className="sm-gal-i" style={{ backgroundImage: `url(${it.src})` }} aria-label={it.alt || `Photo ${i + 1}`} />)}
    </div>
  );
};

const LogosModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  const items: any[] = (Array.isArray(s.items) ? s.items : []).filter(i => i?.src);
  return (
    <div>
      {s.title ? <div className="sm-logos-t">{s.title}</div> : null}
      {!items.length ? <Empty text="Add sponsor logos in the panel on the right" /> : (
        <div className={`sm-logos${s.grayscale ? ' sm-gray' : ''}`}>
          {items.map((it, i) => {
            const img = <img src={it.src} alt={it.alt || ''} style={{ height: Number(s.height) || 56 }} loading="lazy" />;
            return it.url ? <a key={i} href={it.url} target="_blank" rel="noreferrer">{img}</a> : <span key={i}>{img}</span>;
          })}
        </div>
      )}
    </div>
  );
};

const ButtonModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  const btn = (text: string, url: string, style: string, k: string) => (
    <SiteLink to={url || '#'} className={`sm-btn sm-btn-${style || 'primary'} sm-btn-${s.size || 'md'}${s.full ? ' sm-btn-full' : ''}`}>
      <Editable id={w.id} k={k} value={text} as="span" />
    </SiteLink>
  );
  return (
    <div className="sm-btns" style={{ justifyContent: s.align === 'center' ? 'center' : s.align === 'right' ? 'flex-end' : 'flex-start' }}>
      {btn(s.text || 'Find out more', s.url, s.style, 'text')}
      {s.second_text ? btn(s.second_text, s.second_url, s.second_style || 'outline', 'second_text') : null}
    </div>
  );
};

const CardsModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  const items: any[] = Array.isArray(s.items) ? s.items : [];
  if (!items.length) return <Empty text="Add cards in the panel on the right" />;
  return (
    <div className={`sm-cards sm-cols-${s.columns || 3}${s.style === 'plain' ? ' sm-cards-plain' : ''}`}>
      {items.map((it, i) => (
        <div key={i} className="sm-card">
          {it.image ? <div className="sm-card-img" style={{ backgroundImage: `url(${it.image})` }} /> : null}
          <div className="sm-card-b">
            {it.title ? <h3 className="sm-h3">{it.title}</h3> : null}
            {it.text ? <p className="sm-p">{it.text}</p> : null}
            {it.link_text ? <SiteLink to={it.url || '#'} className="sm-more">{it.link_text}<ArrowRight size={15} /></SiteLink> : null}
          </div>
        </div>
      ))}
    </div>
  );
};

const AccordionModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  const items: any[] = Array.isArray(s.items) ? s.items : [];
  const [open, setOpen] = useState<number | null>(s.open_first === false ? null : 0);
  if (!items.length) return <Empty text="Add questions in the panel on the right" />;
  return (
    <div className="sm-acc">
      {items.map((it, i) => (
        <div key={i} className={`sm-acc-i${open === i ? ' on' : ''}`}>
          <button type="button" className="sm-acc-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{it.q || 'Question'}<ChevronDown size={18} /></button>
          {open === i && <div className="sm-acc-a">{String(it.a || '').split(/\n{2,}/).map((p, j) => <p key={j}>{p}</p>)}</div>}
        </div>
      ))}
    </div>
  );
};

/* ── Club live data ──────────────────────────────────────────────────────── */
const RacesModule: React.FC<{ w: EventWidgetConfig; clubId: string }> = ({ w, clubId }) => {
  const s = w.settings || {};
  const { data, loading } = useClubRaces(clubId);
  const list = data.filter(r => !s.race_class || (r.raceClass || '').toLowerCase().includes(String(s.race_class).toLowerCase())).slice(0, Number(s.count) || 3);
  return (
    <div>
      <Title w={w} fallback="Upcoming races" link={{ to: '/race-calendar', text: 'Full calendar' }} />
      {loading ? <div className="sm-skel" /> : !list.length ? <Empty text="No races coming up. This shows your next races from the race calendar." /> : (
        <div className={s.layout === 'list' ? 'sm-list' : `sm-cards sm-cols-${Math.min(list.length, 3)}`}>
          {list.map(r => {
            const d = ymd(r.date);
            return (
              <SiteLink key={r.id} to="/race-calendar" className={s.layout === 'list' ? 'sm-row' : 'sm-card sm-race'}>
                <span className="sm-date"><b>{d.d}</b>{MONTHS[d.m]}</span>
                <span className="sm-race-b">
                  <span className="sm-race-t">{r.title}</span>
                  <span className="sm-meta">{[r.series, r.raceClass, s.show_venue === false ? null : r.venue].filter(Boolean).join(' · ') || longDate(r.date)}</span>
                </span>
              </SiteLink>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ResultsModule: React.FC<{ w: EventWidgetConfig; clubId: string }> = ({ w, clubId }) => {
  const s = w.settings || {};
  const { data, loading } = useClubResults(clubId);
  const list = data.slice(0, Number(s.count) || 3);
  const medal = ['#D4A017', '#94A3B8', '#B87333'];
  return (
    <div>
      <Title w={w} fallback="Latest results" link={{ to: '/results', text: 'All results' }} />
      {loading ? <div className="sm-skel" /> : !list.length ? <Empty text="No results yet. This shows your latest scored races." /> : (
        <div className={`sm-cards sm-cols-${Math.min(list.length, 3)}`}>
          {list.map(r => (
            <SiteLink key={r.id} to={`/results/${r.id}`} className="sm-card sm-result">
              <div className="sm-result-h"><Trophy size={16} /><span>{r.title}</span></div>
              <div className="sm-meta">{[longDate(r.date), r.raceClass, r.boats ? `${r.boats} boats` : null].filter(Boolean).join(' · ')}</div>
              {s.show_podium !== false && r.podium.length > 0 && (
                <ol className="sm-podium">
                  {r.podium.map((p, i) => <li key={i}><span className="sm-pos" style={{ background: medal[i] }}>{i + 1}</span><span className="sm-pn">{p.name}{p.sail ? <em> #{p.sail}</em> : null}</span>{p.points != null && <span className="sm-pts">{p.points} pts</span>}</li>)}
                </ol>
              )}
            </SiteLink>
          ))}
        </div>
      )}
    </div>
  );
};

const NewsModule: React.FC<{ w: EventWidgetConfig; clubId: string }> = ({ w, clubId }) => {
  const s = w.settings || {};
  const { data, loading } = useClubNews(clubId);
  const sources: string[] = Array.isArray(s.sources) && s.sources.length ? s.sources : ['club', 'state', 'national'];
  const list = data.filter(a => sources.includes(a.source)).slice(0, Number(s.count) || 3);
  const tag = (src: string) => <span className={`sm-src sm-src-${src}`}>{src === 'club' ? 'Club' : src === 'state' ? 'State' : 'National'}</span>;
  return (
    <div>
      <Title w={w} fallback="Latest news" link={{ to: '/news', text: 'All news' }} />
      {loading ? <div className="sm-skel" /> : !list.length ? <Empty text="No news yet. This shows your latest published articles." /> : (
        <div className={s.layout === 'list' ? 'sm-list' : `sm-cards sm-cols-${Math.min(list.length, 3)}`}>
          {list.map(a => (
            <SiteLink key={a.id} to={`/news/${a.id}`} className={s.layout === 'list' ? 'sm-row sm-news-row' : 'sm-card sm-news'}>
              {s.show_images !== false && a.image ? <span className="sm-card-img" style={{ backgroundImage: `url(${a.image})` }} /> : null}
              <span className="sm-card-b">
                <span className="sm-meta">{s.show_source !== false ? tag(a.source) : null}{longDate(a.date)}</span>
                <span className="sm-h3">{a.title}</span>
                {s.show_excerpt !== false && a.excerpt ? <span className="sm-p sm-clamp">{a.excerpt}</span> : null}
              </span>
            </SiteLink>
          ))}
        </div>
      )}
    </div>
  );
};

const ClassesModule: React.FC<{ w: EventWidgetConfig; clubId: string }> = ({ w, clubId }) => {
  const s = w.settings || {};
  const { data, loading } = useClubClasses(clubId);
  return (
    <div>
      <Title w={w} fallback="Classes we sail" link={{ to: '/yacht-classes', text: 'About the classes' }} />
      {loading ? <div className="sm-skel" /> : !data.length ? <Empty text="Add your classes in Club settings to show them here." /> : (
        <div className={`sm-cards sm-cols-${Math.min(data.length, Number(s.columns) || 4)}`}>
          {data.map(c => (
            <SiteLink key={c.id} to="/yacht-classes" className="sm-card">
              {c.image ? <span className="sm-card-img sm-contain" style={{ backgroundImage: `url(${c.image})` }} /> : null}
              <span className="sm-card-b"><span className="sm-h3">{c.name}</span>{s.show_description !== false && c.description ? <span className="sm-p sm-clamp">{c.description}</span> : null}</span>
            </SiteLink>
          ))}
        </div>
      )}
    </div>
  );
};

const CommitteeModule: React.FC<{ w: EventWidgetConfig; clubId: string }> = ({ w, clubId }) => {
  const s = w.settings || {};
  const { data, loading } = useClubCommittee(clubId);
  return (
    <div>
      <Title w={w} fallback="Our committee" />
      {loading ? <div className="sm-skel" /> : !data.length ? <Empty text="Choose which committee positions show on your website in Club settings." /> : (
        <div className={`sm-cards sm-cols-${Math.min(data.length, 4)}`}>
          {data.map((o, i) => (
            <div key={i} className="sm-card sm-person">
              <span className="sm-avatar"><Users size={18} /></span>
              <span className="sm-card-b"><span className="sm-meta">{o.position}</span><span className="sm-h3">{o.name || 'Vacant'}</span>
                {s.show_email !== false && o.email ? <a className="sm-link" href={`mailto:${o.email}`}><Mail size={14} />Email</a> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const JoinModule: React.FC<{ w: EventWidgetConfig }> = ({ w }) => {
  const s = w.settings || {};
  return (
    <div className={`sm-join sm-join-${s.style || 'brand'}`}>
      <div className="sm-join-b">
        <Editable id={w.id} k="title" value={s.title ?? 'Come sailing with us'} as="h2" className="sm-h2" />
        <Editable id={w.id} k="text" value={s.text ?? 'New skippers are always welcome. Join online in a few minutes.'} as="p" className="sm-p" />
      </div>
      <div className="sm-btns">
        <SiteLink to={s.url || MEMBERSHIP_URL} className="sm-btn sm-btn-accent sm-btn-lg"><Editable id={w.id} k="button_text" value={s.button_text || 'Join the club'} as="span" /></SiteLink>
        {s.second_text ? <SiteLink to={s.second_url || '/contact'} className="sm-btn sm-btn-ghost sm-btn-lg">{s.second_text}</SiteLink> : null}
      </div>
    </div>
  );
};

const VenuesModule: React.FC<{ w: EventWidgetConfig; clubId: string }> = ({ w, clubId }) => {
  const { data, loading } = useClubVenues(clubId);
  return (
    <div>
      <Title w={w} fallback="Where we sail" link={{ to: '/venues', text: 'All venues' }} />
      {loading ? <div className="sm-skel" /> : !data.length ? <Empty text="Add your venues in Club settings to show them here." /> : (
        <div className={`sm-cards sm-cols-${Math.min(data.length, 3)}`}>
          {data.map(v => (
            <div key={v.id} className="sm-card">
              {v.image ? <span className="sm-card-img" style={{ backgroundImage: `url(${v.image})` }} /> : null}
              <span className="sm-card-b"><span className="sm-h3">{v.name}</span>{v.address ? <span className="sm-p"><MapPin size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />{v.address}</span> : null}
                {v.lat != null && v.lng != null ? <a className="sm-link" href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">Directions<ExternalLink size={13} /></a> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ListingsModule: React.FC<{ w: EventWidgetConfig; clubId: string }> = ({ w, clubId }) => {
  const s = w.settings || {};
  const { data, loading } = useClubListings(clubId, s.scope === 'club');
  const list = data.slice(0, Number(s.count) || 3);
  return (
    <div>
      <Title w={w} fallback="For sale" link={{ to: '/classifieds', text: 'All listings' }} />
      {loading ? <div className="sm-skel" /> : !list.length ? <Empty text="No listings right now. This shows the newest boats and gear for sale." /> : (
        <div className={`sm-cards sm-cols-${Math.min(list.length, 3)}`}>
          {list.map(c => (
            <SiteLink key={c.id} to="/classifieds" className="sm-card">
              <span className="sm-card-img" style={{ backgroundImage: c.image ? `url(${c.image})` : undefined }} />
              <span className="sm-card-b">{c.price != null && <span className="sm-price">{money(c.price)}</span>}<span className="sm-h3">{c.title}</span>{c.location ? <span className="sm-meta">{c.location}</span> : null}</span>
            </SiteLink>
          ))}
        </div>
      )}
    </div>
  );
};

/** Renders one of the site builder's own modules. */
export const SiteModule: React.FC<{ widget: EventWidgetConfig; clubId: string; device: DeviceType }> = ({ widget, clubId, device }) => {
  switch (widget.type) {
    case 'heading': return <HeadingModule w={widget} device={device} />;
    case 'site-text': return <TextModule w={widget} />;
    case 'site-image': return <ImageModule w={widget} />;
    case 'site-video': return <VideoModule w={widget} />;
    case 'image-gallery': return <GalleryModule w={widget} />;
    case 'logo-strip': return <LogosModule w={widget} />;
    case 'site-button': return <ButtonModule w={widget} />;
    case 'feature-cards': return <CardsModule w={widget} />;
    case 'accordion': return <AccordionModule w={widget} />;
    case 'club-races': return <RacesModule w={widget} clubId={clubId} />;
    case 'club-results': return <ResultsModule w={widget} clubId={clubId} />;
    case 'club-news': return <NewsModule w={widget} clubId={clubId} />;
    case 'club-classes': return <ClassesModule w={widget} clubId={clubId} />;
    case 'club-committee': return <CommitteeModule w={widget} clubId={clubId} />;
    case 'club-join': return <JoinModule w={widget} />;
    case 'club-venues': return <VenuesModule w={widget} clubId={clubId} />;
    case 'club-classifieds': return <ListingsModule w={widget} clubId={clubId} />;
    default: return null;
  }
};


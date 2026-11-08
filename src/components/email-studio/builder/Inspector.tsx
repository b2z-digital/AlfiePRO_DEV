import React, { useMemo, useRef, useState } from 'react';
import { Bold, Copy, ImagePlus, Italic, Link2, List, Minus, Plus, Trash2, UserRound, X, CircleCheck } from 'lucide-react';
import { ASwitch } from '../../alfie/Kit';
import { MediaLibraryModal } from '../../MediaLibraryModal';
import { BLOCKS } from '../../../lib/emailStudio/catalog';
import type { Block, BlockProps, BlockType, CardItem, LogoItem, SocialLink } from '../../../lib/emailStudio/types';
import { useStudio } from '../studioData';
import { BlockIcon } from './icons';

/* ── Small controls ──────────────────────────────────────────────────────── */
const Sec: React.FC<{ label?: string; children: React.ReactNode; row?: boolean }> = ({ label, children, row }) => (
  <div className="esb-s" style={row ? { flexDirection: 'row', alignItems: 'center' } : undefined}>
    {label && <span className="lbl" style={row ? { flex: 1 } : undefined}>{label}</span>}
    {children}
  </div>
);
const Txt: React.FC<{ value?: string; onChange: (v: string) => void; placeholder?: string; label?: string }> = ({ value, onChange, placeholder, label }) => (
  <input className="a-inp" style={{ height: 40, fontSize: 14 }} value={value || ''} placeholder={placeholder} aria-label={label || placeholder} onChange={e => onChange(e.target.value)} />
);
function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="a-seg" role="group" aria-label={label} style={{ alignSelf: 'flex-start' }}>
      {options.map(([v, l]) => <button key={String(v)} type="button" className={`a-seg-i${v === value ? ' a-seg-on' : ''}`} style={{ height: 30, fontSize: 12.5 }} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
const Sw: React.FC<{ label: string; note?: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, note, value, onChange }) => (
  <div className="esb-row"><span>{label}{note && <small>{note}</small>}</span><ASwitch checked={value} onChange={onChange} label={label} /></div>
);
const Step: React.FC<{ value: number; min: number; max: number; onChange: (v: number) => void; label: string }> = ({ value, min, max, onChange, label }) => (
  <div className="esb-step" role="group" aria-label={label}>
    <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={14} /></button>
    <span>{value}</span>
    <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={14} /></button>
  </div>
);

export const ImageField: React.FC<{ value?: string; onChange: (v: string) => void; label?: string }> = ({ value, onChange, label = 'Image' }) => {
  const [open, setOpen] = useState(false);
  const light = typeof document !== 'undefined' && document.documentElement.classList.contains('alfie-light');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="esb-imgpick">
        <span className="th" style={value ? { backgroundImage: `url("${value.replace(/"/g, '%22')}")` } : undefined} />
        <button type="button" className="a-btn a-btn-sm" onClick={() => setOpen(true)}><ImagePlus size={14} />{value ? 'Change' : 'Choose'}</button>
        {value && <button type="button" className="a-ib" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => onChange('')}><X size={15} /></button>}
      </div>
      <input className="a-inp" style={{ height: 36, fontSize: 12.5 }} value={value || ''} placeholder="Or paste an image link" aria-label={`${label} link`} onChange={e => onChange(e.target.value.trim())} />
      {open && <MediaLibraryModal isOpen onClose={() => setOpen(false)} onSelect={url => { onChange(url); setOpen(false); }} darkMode={!light} />}
    </div>
  );
};

export const LinkField: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const s = useStudio();
  const site = s.feed.club.siteUrl;
  const app = s.feed.club.appUrl;
  const picks: [string, string][] = [
    ['Race calendar', `${site}/race-calendar`], ['Results', `${site}/results`], ['Club news', `${site}/news`], ['Classifieds', `${site}/classifieds`],
    ['Club website', site], ['Join the club', `${app}/register`], ['AlfieTV', `${app}/alfie-tv`], ['Sign in to AlfiePRO', `${app}/login`],
  ];
  const bad = !!value && !/^(https?:\/\/|mailto:|tel:)/i.test(value.trim());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="a-field" style={{ height: 40 }}><Link2 size={14} /><input value={value || ''} placeholder="https://" aria-label="Link" onChange={e => onChange(e.target.value.trim())} /></div>
      {bad && <span className="es-hint es-warn" style={{ fontSize: 12 }}>Start the link with https://</span>}
      <select className="es-sel" style={{ height: 34, fontSize: 12.5 }} value="" aria-label="Link to a club page" onChange={e => e.target.value && onChange(e.target.value)}>
        <option value="">Link to a club page…</option>
        {picks.map(([l, u]) => <option key={l} value={u}>{l}</option>)}
      </select>
    </div>
  );
};

/** Text with a little formatting toolbar (markdown-lite). */
const TextArea: React.FC<{ value: string; onChange: (v: string) => void; rows?: number }> = ({ value, onChange, rows = 8 }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (a: string, b: string, ph: string) => {
    const el = ref.current;
    if (!el) return;
    const s0 = el.selectionStart, s1 = el.selectionEnd;
    const mid = value.slice(s0, s1) || ph;
    const next = value.slice(0, s0) + a + mid + b + value.slice(s1);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s0 + a.length, s0 + a.length + mid.length); });
  };
  const insert = (t: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    onChange(value.slice(0, at) + t + value.slice(at));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + t.length, at + t.length); });
  };
  const link = () => {
    const url = window.prompt('Link address', 'https://');
    if (url && /^(https?:\/\/|mailto:)/i.test(url)) wrap('[', `](${url})`, 'link text');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="esb-mdbar">
        <button type="button" onClick={() => wrap('**', '**', 'bold text')} aria-label="Bold"><Bold size={13} /></button>
        <button type="button" onClick={() => wrap('*', '*', 'italic text')} aria-label="Italic"><Italic size={13} /></button>
        <button type="button" onClick={link} aria-label="Add a link"><Link2 size={13} />Link</button>
        <button type="button" onClick={() => insert('\n- ')} aria-label="Bullet list"><List size={13} />List</button>
        <button type="button" onClick={() => insert('{first_name}')} aria-label="Insert first name"><UserRound size={13} />First name</button>
      </div>
      <textarea ref={ref} className="es-ta" rows={rows} value={value} onChange={e => onChange(e.target.value)} aria-label="Text" />
      <span className="es-dim" style={{ fontSize: 11.5 }}>**bold**, *italic*, [link text](https://…). A blank line starts a new paragraph.</span>
    </div>
  );
};

/* ── Per-block settings ──────────────────────────────────────────────────── */
type Upd<T extends BlockType> = (patch: Partial<BlockProps[T]>) => void;

function Fields({ block, set }: { block: Block; set: Upd<BlockType> }) {
  const s = useStudio();
  const p = block.props as never as Record<string, unknown>;
  const u = set as (patch: Record<string, unknown>) => void;
  const items = <T,>(k: string) => (p[k] as T[]) || [];
  const setItem = <T,>(k: string, i: number, patch: Partial<T>) => u({ [k]: items<T>(k).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const categories = useMemo(() => Array.from(new Set(s.feed.classifieds.map(c => c.category).filter(Boolean))) as string[], [s.feed.classifieds]);
  const futureEvents = useMemo(() => s.feed.events.filter(e => e.kind !== 'meeting'), [s.feed.events]);

  switch (block.type) {
    case 'header': return <>
      <Sec label="Show"><Seg label="Show" value={p.show as string} options={[['both', 'Logo and name'], ['logo', 'Logo'], ['name', 'Name']]} onChange={v => u({ show: v })} /></Sec>
      <Sec label="Colour"><Seg label="Colour" value={p.tone as string} options={[['dark', 'Dark'], ['primary', 'Main'], ['light', 'White']]} onChange={v => u({ tone: v })} /></Sec>
      <Sec label="Text on the right"><Txt value={p.note as string} onChange={v => u({ note: v })} placeholder="e.g. Weekly update" /></Sec>
    </>;
    case 'hero': return <>
      <Sec label="Picture"><ImageField value={p.image as string} onChange={v => u({ image: v })} /></Sec>
      <Sec label="Small label"><Txt value={p.label as string} onChange={v => u({ label: v })} placeholder="e.g. Results" /></Sec>
      <Sec label="Headline"><Txt value={p.title as string} onChange={v => u({ title: v })} /></Sec>
      <Sec label="Line under the headline"><Txt value={p.text as string} onChange={v => u({ text: v })} placeholder="Optional" /></Sec>
      <Sec label="Button"><Txt value={p.buttonText as string} onChange={v => u({ buttonText: v })} placeholder="No button" />{!!p.buttonText && <LinkField value={p.url as string} onChange={v => u({ url: v })} />}</Sec>
      <Sec label="Height"><Seg label="Height" value={p.height as string} options={[['sm', 'Short'], ['md', 'Medium'], ['lg', 'Tall']]} onChange={v => u({ height: v })} /></Sec>
    </>;
    case 'heading': return <>
      <Sec label="Heading"><Txt value={p.text as string} onChange={v => u({ text: v })} /></Sec>
      <Sec label="Size"><Seg label="Size" value={p.size as string} options={[['lg', 'Large'], ['md', 'Medium'], ['sm', 'Small']]} onChange={v => u({ size: v })} /></Sec>
      <Sec label="Align"><Seg label="Align" value={p.align as string} options={[['left', 'Left'], ['center', 'Centre']]} onChange={v => u({ align: v })} /></Sec>
    </>;
    case 'text': return <>
      <Sec><TextArea value={p.text as string} onChange={v => u({ text: v })} /></Sec>
      <Sec label="Align"><Seg label="Align" value={p.align as string} options={[['left', 'Left'], ['center', 'Centre']]} onChange={v => u({ align: v })} /></Sec>
    </>;
    case 'button': return <>
      <Sec label="Button text"><Txt value={p.text as string} onChange={v => u({ text: v })} /></Sec>
      <Sec label="Goes to"><LinkField value={p.url as string} onChange={v => u({ url: v })} /></Sec>
      <Sec label="Style"><Seg label="Style" value={p.style as string} options={[['solid', 'Solid'], ['outline', 'Outline']]} onChange={v => u({ style: v })} /></Sec>
      <Sec label="Align"><Seg label="Align" value={p.align as string} options={[['left', 'Left'], ['center', 'Centre']]} onChange={v => u({ align: v })} /></Sec>
      <Sec><Sw label="Full width" value={!!p.full} onChange={v => u({ full: v })} /></Sec>
    </>;
    case 'image': return <>
      <Sec label="Image"><ImageField value={p.src as string} onChange={v => u({ src: v })} /></Sec>
      <Sec label="Description for screen readers"><Txt value={p.alt as string} onChange={v => u({ alt: v })} placeholder="e.g. Boats rounding the top mark" />{!String(p.alt || '').trim() && !!p.src && <span className="es-hint es-warn" style={{ fontSize: 12 }}>Add a short description</span>}</Sec>
      <Sec label="Link (optional)"><LinkField value={p.url as string} onChange={v => u({ url: v })} /></Sec>
      <Sec label="Caption"><Txt value={p.caption as string} onChange={v => u({ caption: v })} placeholder="Optional" /></Sec>
      <Sec><Sw label="Keep inside the margins" note="Off makes it run edge to edge" value={!!p.inset} onChange={v => u({ inset: v })} /></Sec>
    </>;
    case 'spacer': return <Sec label="Size"><Seg label="Size" value={p.size as string} options={[['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]} onChange={v => u({ size: v })} /></Sec>;
    case 'divider': return <Sec><span className="es-hint">A thin line between sections. Nothing to set.</span></Sec>;
    case 'quote': return <>
      <Sec label="Quote"><textarea className="es-ta" style={{ minHeight: 90 }} value={p.text as string} onChange={e => u({ text: e.target.value })} aria-label="Quote" /></Sec>
      <Sec label="Who said it"><Txt value={p.by as string} onChange={v => u({ by: v })} placeholder="Optional" /></Sec>
    </>;
    case 'columns': {
      const list = items<CardItem>('items');
      return <>
        <Sec label="Columns"><Seg label="Columns" value={p.cols as number} options={[[2, 'Two'], [3, 'Three']]} onChange={v => u({ cols: v, items: Array.from({ length: v }, (_x, i) => list[i] || { title: 'New card', text: '', buttonText: '', url: '' }) })} /></Sec>
        {list.slice(0, p.cols as number).map((it, i) => (
          <div key={i} className="esb-s"><div className="esb-item">
            <div className="h">Card {i + 1}</div>
            <ImageField value={it.image} onChange={v => setItem<CardItem>('items', i, { image: v })} />
            <Txt value={it.title} onChange={v => setItem<CardItem>('items', i, { title: v })} placeholder="Title" />
            <textarea className="es-ta" style={{ minHeight: 70 }} value={it.text || ''} onChange={e => setItem<CardItem>('items', i, { text: e.target.value })} placeholder="Text" aria-label={`Card ${i + 1} text`} />
            <Txt value={it.buttonText} onChange={v => setItem<CardItem>('items', i, { buttonText: v })} placeholder="Button text (optional)" />
            {!!it.buttonText && <LinkField value={it.url} onChange={v => setItem<CardItem>('items', i, { url: v })} />}
          </div></div>
        ))}
      </>;
    }
    case 'social': {
      const list = items<SocialLink>('links');
      return <>
        <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="Optional" /></Sec>
        <Sec label="Links">
          {list.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="es-sel" style={{ width: 120, height: 38 }} value={l.kind} aria-label="Kind of link" onChange={e => setItem<SocialLink>('links', i, { kind: e.target.value as SocialLink['kind'] })}>
                {['website', 'facebook', 'instagram', 'youtube', 'x'].map(k => <option key={k} value={k}>{k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1)}</option>)}
              </select>
              <input className="a-inp" style={{ height: 38, fontSize: 13 }} value={l.url} placeholder="https://" aria-label="Address" onChange={e => setItem<SocialLink>('links', i, { url: e.target.value.trim() })} />
              <button type="button" className="a-ib" aria-label="Remove link" onClick={() => u({ links: list.filter((_x, j) => j !== i) })}><X size={15} /></button>
            </div>
          ))}
          <button type="button" className="a-btn a-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => u({ links: [...list, { kind: 'website', url: '' }] })}><Plus size={14} />Add a link</button>
        </Sec>
      </>;
    }
    case 'logos': {
      const list = items<LogoItem>('items');
      return <>
        <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="Optional" /></Sec>
        {list.map((l, i) => (
          <div key={i} className="esb-s"><div className="esb-item">
            <div className="h">Logo {i + 1}<button type="button" className="a-ib" aria-label="Remove logo" onClick={() => u({ items: list.filter((_x, j) => j !== i) })}><X size={15} /></button></div>
            <ImageField value={l.src} onChange={v => setItem<LogoItem>('items', i, { src: v })} />
            <Txt value={l.alt} onChange={v => setItem<LogoItem>('items', i, { alt: v })} placeholder="Sponsor name" />
            <LinkField value={l.url} onChange={v => setItem<LogoItem>('items', i, { url: v })} />
          </div></div>
        ))}
        <Sec><button type="button" className="a-btn a-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => u({ items: [...list, { src: '', url: '', alt: '' }] })}><Plus size={14} />Add a logo</button></Sec>
      </>;
    }

    /* Club content */
    case 'news': {
      const src = (p.sources as string[]) || [];
      const tog = (k: string) => u({ sources: src.includes(k) ? src.filter(x => x !== k) : [...src, k] });
      return <>
        <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="No title" /></Sec>
        <Sec label="News from">
          <div className="esb-tog">{[['club', 'Our club'], ['state', 'State'], ['national', 'National']].map(([k, l]) => (
            <button key={k} type="button" className={src.includes(k) ? 'on' : ''} aria-pressed={src.includes(k)} onClick={() => tog(k)}>{src.includes(k) && <CircleCheck size={13} />}{l}</button>
          ))}</div>
          <Sw label="Club news first" note="Then state and national" value={!!p.clubFirst} onChange={v => u({ clubFirst: v })} />
        </Sec>
        <Sec label="How many" row><Step label="How many" value={p.count as number} min={1} max={6} onChange={v => u({ count: v })} /></Sec>
        <Sec label="Layout">
          <div className="esb-lays">
            {([['list', 'List'], ['cards', 'Cards'], ['feature', 'Feature']] as const).map(([k, l]) => (
              <button key={k} type="button" className={`esb-lay${p.layout === k ? ' on' : ''}`} aria-pressed={p.layout === k} onClick={() => u({ layout: k })}>
                <span className="pv" aria-hidden style={{ flexDirection: k === 'list' ? 'column' : 'row' }}>
                  {k === 'list' && <><i style={{ height: 10 }} /><i style={{ height: 10 }} /><i style={{ height: 10 }} /></>}
                  {k === 'cards' && <><i style={{ flex: 1 }} /><i style={{ flex: 1 }} /></>}
                  {k === 'feature' && <><i style={{ flex: 1.3 }} /><span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}><i style={{ height: 12 }} /><i style={{ height: 12 }} /><i style={{ height: 12 }} /></span></>}
                </span>{l}
              </button>
            ))}
          </div>
        </Sec>
        <Sec label="Show">
          <Sw label="Pictures" value={!!p.showImages} onChange={v => u({ showImages: v })} />
          <Sw label="Short summary" value={!!p.showSummary} onChange={v => u({ showSummary: v })} />
          <Sw label="Where it’s from" note="Club, state or national label" value={!!p.showSource} onChange={v => u({ showSource: v })} />
          <Sw label="Only news since the last email" value={!!p.sinceLastSend} onChange={v => u({ sinceLastSend: v })} />
        </Sec>
        <Sec label="If there’s no news"><Seg label="If there's no news" value={p.whenEmpty as string} options={[['hide', 'Hide this block'], ['older', 'Show older news']]} onChange={v => u({ whenEmpty: v })} /></Sec>
        <Sec label="Button"><Txt value={p.buttonText as string} onChange={v => u({ buttonText: v })} placeholder="No button" /></Sec>
      </>;
    }
    case 'events': return <>
      <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="No title" /></Sec>
      <Sec label="How many" row><Step label="How many" value={p.count as number} min={1} max={6} onChange={v => u({ count: v })} /></Sec>
      <Sec label="Looking ahead"><select className="es-sel" value={p.daysAhead as number} aria-label="Looking ahead" onChange={e => u({ daysAhead: Number(e.target.value) })}>
        {[[7, 'One week'], [14, 'Two weeks'], [30, 'A month'], [60, 'Two months'], [90, 'Three months'], [180, 'Six months']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></Sec>
      <Sec label="Buttons and details">
        <Sw label="Only classes they sail" note="Each member sees their own classes" value={!!p.myClasses} onChange={v => u({ myClasses: v })} />
        <Sw label="I’m going buttons" note="Shows “You’re going” if they’ve said yes" value={!!p.showAnswer} onChange={v => u({ showAnswer: v })} />
        <Sw label="How many are going" value={!!p.showGoing} onChange={v => u({ showGoing: v })} />
        <Sw label="Venue and first start" value={!!p.showDetails} onChange={v => u({ showDetails: v })} />
      </Sec>
      <Sec label="Button under the list"><Txt value={p.buttonText as string} onChange={v => u({ buttonText: v })} placeholder="No button" /></Sec>
    </>;
    case 'results': return <>
      <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="No title" /></Sec>
      <Sec label="Race days" row><Step label="Race days" value={p.count as number} min={1} max={3} onChange={v => u({ count: v })} /></Sec>
      <Sec label="Places shown"><Seg label="Places shown" value={p.top as number} options={[[3, 'Top 3'], [5, 'Top 5'], [10, 'Top 10']]} onChange={v => u({ top: v })} /></Sec>
      <Sec><Sw label="Highlight the reader" note="Each member sees their own place" value={!!p.highlightReader} onChange={v => u({ highlightReader: v })} /></Sec>
      <Sec label="Button"><Txt value={p.buttonText as string} onChange={v => u({ buttonText: v })} placeholder="No button" /></Sec>
    </>;
    case 'classifieds': return <>
      <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="No title" /></Sec>
      <Sec label="How many"><Seg label="How many" value={p.count as number} options={[[3, '3'], [6, '6'], [9, '9']]} onChange={v => u({ count: v })} /></Sec>
      <Sec label="Listings from"><Seg label="Listings from" value={p.scope as string} options={[['everywhere', 'Everywhere'], ['club', 'Our club']]} onChange={v => u({ scope: v })} /></Sec>
      {categories.length > 0 && <Sec label="Category"><select className="es-sel" value={(p.category as string) || ''} aria-label="Category" onChange={e => u({ category: e.target.value })}>
        <option value="">All categories</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select></Sec>}
      <Sec><Sw label="Show prices" value={!!p.showPrice} onChange={v => u({ showPrice: v })} /></Sec>
      <Sec label="Button"><Txt value={p.buttonText as string} onChange={v => u({ buttonText: v })} placeholder="No button" /></Sec>
    </>;
    case 'videos': return <>
      <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="No title" /></Sec>
      <Sec label="How many" row><Step label="How many" value={p.count as number} min={1} max={4} onChange={v => u({ count: v })} /></Sec>
      <Sec label="Videos from"><Seg label="Videos from" value={p.source as string} options={[['everywhere', 'All of AlfieTV'], ['club', 'Our club channel']]} onChange={v => u({ source: v })} /></Sec>
      <Sec label="Button"><Txt value={p.buttonText as string} onChange={v => u({ buttonText: v })} placeholder="No button" /></Sec>
    </>;
    case 'membership': return <>
      <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} /></Sec>
      <Sec label="Renew button"><Txt value={p.renewText as string} onChange={v => u({ renewText: v })} /></Sec>
      <Sec label="Join button" ><Txt value={p.joinText as string} onChange={v => u({ joinText: v })} /><span className="es-dim" style={{ fontSize: 11.5 }}>Shown to people on a list who aren’t members</span></Sec>
      <Sec><Sw label="Show to paid-up members" note="Off leaves it out unless they’re due" value={!!p.showWhenCurrent} onChange={v => u({ showWhenCurrent: v })} /></Sec>
    </>;
    case 'calendar': return <>
      <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="No title" /></Sec>
      <Sec label="Weeks ahead"><Seg label="Weeks ahead" value={p.weeks as number} options={[[2, '2'], [4, '4'], [8, '8'], [12, '12']]} onChange={v => u({ weeks: v })} /></Sec>
      <Sec>
        <Sw label="Only classes they sail" value={!!p.myClasses} onChange={v => u({ myClasses: v })} />
        <Sw label="Show the venue" value={!!p.showVenue} onChange={v => u({ showVenue: v })} />
      </Sec>
      <Sec label="Button"><Txt value={p.buttonText as string} onChange={v => u({ buttonText: v })} placeholder="No button" /></Sec>
    </>;
    case 'countdown': return <>
      <Sec label="Event">
        <select className="es-sel" value={(p.eventKey as string) || ''} aria-label="Event" onChange={e => u({ eventKey: e.target.value })}>
          <option value="">The next event on the calendar</option>
          {futureEvents.map(e => <option key={e.event_key} value={e.event_key}>{e.title} · {e.event_date}</option>)}
        </select>
      </Sec>
      <Sec label="Title"><Txt value={p.title as string} onChange={v => u({ title: v })} placeholder="The event’s name" /></Sec>
      <Sec><Sw label="How many are going" value={!!p.showGoing} onChange={v => u({ showGoing: v })} /></Sec>
    </>;
    default: return null;
  }
}

export const Inspector: React.FC<{ block: Block | null; onChange: (id: string, patch: Record<string, unknown>) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; feedReady: boolean }> = ({ block, onChange, onDuplicate, onDelete, feedReady }) => {
  if (!block) {
    return (
      <div className="esb-s" style={{ borderBottom: 0, padding: 24 }}>
        <b className="es-ink" style={{ fontSize: 15 }}>Nothing selected</b>
        <span className="es-hint">Click a block in the email to change it, or drag a block in from the left.</span>
      </div>
    );
  }
  const info = BLOCKS[block.type];
  return (
    <>
      <div className="esb-rp-h">
        <span className="a-tile" style={info.group === 'club' ? { background: 'rgba(10,132,255,.14)', color: '#8CC4FF' } : undefined}><BlockIcon type={block.type} size={17} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><b className="a-display">{info.label}</b><span>{info.note}</span></div>
        <button type="button" className="a-ib" aria-label="Duplicate block" onClick={() => onDuplicate(block.id)}><Copy size={15} /></button>
        <button type="button" className="a-ib" aria-label="Delete block" onClick={() => onDelete(block.id)}><Trash2 size={15} /></button>
      </div>
      <Fields key={block.id} block={block} set={patch => onChange(block.id, patch as Record<string, unknown>)} />
      {(info.live || info.personal) && (
        <div className="esb-note"><CircleCheck size={16} style={{ flexShrink: 0, color: '#4CD07A', marginTop: 1 }} />
          <span>{info.personal ? 'Each person sees their own version. ' : ''}This fills itself in from AlfiePRO when the email sends{feedReady ? ', so the preview shows what would go out right now.' : '. Showing sample content until your club’s content loads.'} Links open in AlfiePRO.</span>
        </div>
      )}
    </>
  );
};

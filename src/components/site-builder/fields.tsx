import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, ChevronDown, ChevronUp, Image as ImageIcon, Italic, Link2, List, ListOrdered, Monitor, Plus, Quote, Smartphone, Tablet, Trash2, X } from 'lucide-react';
import { MediaLibraryModal } from '../MediaLibraryModal';
import type { DeviceType } from '../../types/eventWidgets';
import { AUTO_PAGES, MEMBERSHIP_URL } from '../../utils/publicSite';
import type { Field } from './model';
import { HEADING_SIZES, headingSize } from '../site/SiteModules';

export const DeviceIcon: React.FC<{ d: DeviceType; size?: number }> = ({ d, size = 14 }) => (d === 'mobile' ? <Smartphone size={size} /> : d === 'tablet' ? <Tablet size={size} /> : <Monitor size={size} />);

/* ── Small controls ──────────────────────────────────────────────────────── */
export const Row: React.FC<{ label: string; note?: string; children: React.ReactNode; stack?: boolean; device?: DeviceType | null }> = ({ label, note, children, stack, device }) => (
  <div className={`sbf${stack ? ' st' : ''}`}>
    <div className="sbf-l">{label}{device ? <span className="sbf-dev" title={`Set for ${device === 'mobile' ? 'phones' : device}`}><DeviceIcon d={device} size={12} /></span> : null}{note ? <small>{note}</small> : null}</div>
    <div className="sbf-c">{children}</div>
  </div>
);

export const Txt: React.FC<{ value?: string; onChange: (v: string) => void; placeholder?: string; label?: string; area?: boolean; rows?: number }> = ({ value, onChange, placeholder, label, area, rows = 3 }) => (
  area
    ? <textarea className="sb-in sb-ta" rows={rows} value={value ?? ''} placeholder={placeholder} aria-label={label} onChange={e => onChange(e.target.value)} />
    : <input className="sb-in" value={value ?? ''} placeholder={placeholder} aria-label={label} onChange={e => onChange(e.target.value)} />
);

export const Seg: React.FC<{ value: string; options: { v: string; l: React.ReactNode }[]; onChange: (v: string) => void; label?: string }> = ({ value, options, onChange, label }) => (
  <div className="sb-seg" role="radiogroup" aria-label={label}>
    {options.map(o => <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>)}
  </div>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className="a-sw" onClick={() => onChange(!checked)} />
);

export const Num: React.FC<{ value?: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; unit?: string; placeholder?: string; label?: string }> = ({ value, onChange, min, max, step = 1, unit, placeholder, label }) => (
  <div className="sb-num">
    <input type="number" inputMode="numeric" aria-label={label} value={value ?? ''} placeholder={placeholder} min={min} max={max} step={step}
      onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); onChange(v === null || Number.isNaN(v) ? null : v); }} />
    {unit ? <span>{unit}</span> : null}
  </div>
);

export const SITE_COLOURS = [
  { v: '', l: 'Default', css: '#0F172A' },
  { v: 'primary', l: 'Main', css: 'var(--sb-site-p, #2563EB)' },
  { v: 'dark', l: 'Dark', css: 'var(--sb-site-dark, #111827)' },
  { v: 'white', l: 'White', css: '#FFFFFF' },
];

export const Colour: React.FC<{ value?: string; onChange: (v: string) => void; label: string; allowNone?: boolean; site?: { primary: string; dark: string; accent: string } }> = ({ value, onChange, label, allowNone, site }) => {
  const chips = [
    ...(allowNone ? [{ v: '', l: 'None', css: 'transparent' }] : []),
    { v: site?.primary || '#2563EB', l: 'Main' }, { v: site?.dark || '#111827', l: 'Dark' }, { v: site?.accent || '#F59E0B', l: 'Accent' },
    { v: '#FFFFFF', l: 'White' }, { v: '#F5F8FC', l: 'Tint' }, { v: '#0F172A', l: 'Ink' },
  ];
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value! : '#ffffff';
  return (
    <div className="sb-colours" role="group" aria-label={label}>
      {chips.map(c => (
        <button key={c.l} type="button" title={c.l} aria-pressed={(value || '') === c.v} className={`sb-chip${(value || '').toLowerCase() === c.v.toLowerCase() ? ' on' : ''}${c.v === '' ? ' none' : ''}`} style={{ background: (c as any).css || c.v }} onClick={() => onChange(c.v)} />
      ))}
      <label className="sb-chip custom" title="Pick any colour" style={{ background: hex }}>
        <input type="color" value={hex} onChange={e => onChange(e.target.value)} aria-label={`${label}: pick any colour`} />
      </label>
    </div>
  );
};

/** Text colour for headings: named site colours or any colour. */
const TextColour: React.FC<{ value?: string; onChange: (v: string) => void; label: string }> = ({ value, onChange, label }) => {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value! : '#0f172a';
  return (
    <div className="sb-colours" role="group" aria-label={label}>
      {SITE_COLOURS.map(c => <button key={c.v || 'def'} type="button" title={c.l} className={`sb-chip${(value || '') === c.v ? ' on' : ''}`} style={{ background: c.css }} onClick={() => onChange(c.v)} />)}
      <label className="sb-chip custom" title="Pick any colour" style={{ background: hex }}><input type="color" value={hex} onChange={e => onChange(e.target.value)} aria-label={`${label}: pick any colour`} /></label>
    </div>
  );
};

export const ImagePick: React.FC<{ value?: string; onChange: (v: string) => void; label: string }> = ({ value, onChange, label }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="sb-img">
      <button type="button" className="sb-img-th" style={value ? { backgroundImage: `url(${value})` } : undefined} onClick={() => setOpen(true)} aria-label={`Choose ${label.toLowerCase()}`}>{!value && <ImageIcon size={18} />}</button>
      <div className="sb-img-r">
        <button type="button" className="sb-btn sm" onClick={() => setOpen(true)}>{value ? 'Change' : 'Choose image'}</button>
        {value ? <button type="button" className="sb-ib" onClick={() => onChange('')} aria-label="Remove image"><X size={14} /></button> : null}
      </div>
      {open && <MediaLibraryModal isOpen onClose={() => setOpen(false)} onSelect={(url: string) => { onChange(url); setOpen(false); }} darkMode />}
    </div>
  );
};

/** A link: a page on the site, the membership form, or any web address. */
export const UrlField: React.FC<{ value?: string; onChange: (v: string) => void; pages: { slug: string; title: string }[] }> = ({ value, onChange, pages }) => {
  const opts = [
    { v: '/', l: 'Home' },
    ...AUTO_PAGES.map(a => ({ v: a.path, l: a.label })),
    ...pages.map(p => ({ v: `/${p.slug}`, l: p.title })),
    { v: MEMBERSHIP_URL, l: 'Join the club (membership form)' },
  ];
  const known = opts.find(o => o.v === value);
  return (
    <div className="sb-url">
      <select className="sb-in" value={known ? known.v : '__custom'} onChange={e => { if (e.target.value !== '__custom') onChange(e.target.value); else if (known) onChange('https://'); }} aria-label="Link to">
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        <option value="__custom">A web address…</option>
      </select>
      {!known && <input className="sb-in" value={value || ''} placeholder="https://… or #section" onChange={e => onChange(e.target.value)} aria-label="Web address" />}
    </div>
  );
};

export const RichText: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] }, codeBlock: false, code: false, horizontalRule: false }), Link.configure({ openOnClick: false })],
    content: value,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: { attributes: { class: 'sb-rt-body' } },
  });
  // Typed on the page: show it here too
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (editor.getHTML() !== value) editor.commands.setContent(value || '', { emitUpdate: false } as never);
  }, [value, editor]);
  if (!editor) return null;
  const b = (on: boolean, label: string, act: () => void, icon: React.ReactNode) => (
    <button type="button" className={on ? 'on' : ''} aria-label={label} title={label} onMouseDown={e => { e.preventDefault(); act(); }}>{icon}</button>
  );
  return (
    <div className="sb-rt">
      <div className="sb-rt-bar">
        {b(editor.isActive('bold'), 'Bold', () => editor.chain().focus().toggleBold().run(), <Bold size={14} />)}
        {b(editor.isActive('italic'), 'Italic', () => editor.chain().focus().toggleItalic().run(), <Italic size={14} />)}
        {b(editor.isActive('link'), 'Link', () => {
          if (editor.isActive('link')) { editor.chain().focus().unsetLink().run(); return; }
          const url = window.prompt('Link to (a web address, or a page like /contact)');
          if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }, <Link2 size={14} />)}
        <span className="sep" />
        {b(editor.isActive('heading', { level: 2 }), 'Heading', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2')}
        {b(editor.isActive('heading', { level: 3 }), 'Small heading', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3')}
        {b(editor.isActive('bulletList'), 'List', () => editor.chain().focus().toggleBulletList().run(), <List size={14} />)}
        {b(editor.isActive('orderedList'), 'Numbered list', () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={14} />)}
        {b(editor.isActive('blockquote'), 'Quote', () => editor.chain().focus().toggleBlockquote().run(), <Quote size={14} />)}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

/** A heading's size for the screen being edited, with the inherited value shown when not set. */
export const SizeField: React.FC<{ value?: Partial<Record<DeviceType, number>>; level: string; device: DeviceType; onChange: (v: Partial<Record<DeviceType, number>>) => void }> = ({ value, level, device, onChange }) => {
  const lv = (['h1', 'h2', 'h3'].includes(level) ? level : 'h2') as 'h1' | 'h2' | 'h3';
  const own = value?.[device];
  const shown = headingSize(value, lv, device);
  const others = (['desktop', 'tablet', 'mobile'] as DeviceType[]).filter(d => d !== device);
  return (
    <div className="sb-size">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="range" min={12} max={96} value={shown} onChange={e => onChange({ ...(value || {}), [device]: Number(e.target.value) })} aria-label="Size" />
        <Num value={own ?? null} placeholder={String(shown)} unit="px" onChange={v => { const next = { ...(value || {}) }; if (v == null) delete next[device]; else next[device] = v; onChange(next); }} label="Size in pixels" />
      </div>
      <div className="sb-hint">{others.map(d => `${d === 'mobile' ? 'Phone' : d[0].toUpperCase() + d.slice(1)} ${headingSize(value, lv, d)}`).join(' · ')}{own == null ? ` · following ${device === 'desktop' ? `the ${lv.toUpperCase()} default (${HEADING_SIZES[lv].desktop})` : 'the larger screen'}` : ''}</div>
    </div>
  );
};

/** A list of things (cards, questions, photos, logos), each with its own fields. */
export const ItemsField: React.FC<{ field: Extract<Field, { type: 'items' }>; value: any[]; onChange: (v: any[]) => void; pages: { slug: string; title: string }[] }> = ({ field, value, onChange, pages }) => {
  const items = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState<number | null>(items.length ? 0 : null);
  const set = (i: number, k: string, v: unknown) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); setOpen(j); };
  return (
    <div className="sb-items">
      {items.map((it, i) => (
        <div key={i} className={`sb-item${open === i ? ' on' : ''}`}>
          <div className="sb-item-h">
            <button type="button" className="t" onClick={() => setOpen(open === i ? null : i)}>{it?.src ? <span className="th" style={{ backgroundImage: `url(${it.src})` }} /> : null}{field.itemLabel(it, i)}</button>
            <button type="button" className="sb-ib" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
            <button type="button" className="sb-ib" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ChevronDown size={14} /></button>
            <button type="button" className="sb-ib" aria-label="Remove" onClick={() => { onChange(items.filter((_x, j) => j !== i)); setOpen(null); }}><Trash2 size={14} /></button>
          </div>
          {open === i && (
            <div className="sb-item-b">
              {field.item.map(f => <FieldControl key={f.k} f={f} value={it?.[f.k]} onChange={v => set(i, f.k, v)} pages={pages} />)}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="sb-add" onClick={() => { onChange([...items, {}]); setOpen(items.length); }}><Plus size={14} />{field.add}</button>
    </div>
  );
};

/** Any field from a module's definition. */
export const FieldControl: React.FC<{ f: Field; value: any; onChange: (v: any) => void; pages: { slug: string; title: string }[]; device?: DeviceType; all?: Record<string, any>; site?: { primary: string; dark: string; accent: string } }> = ({ f, value, onChange, pages, device = 'desktop', all }) => {
  switch (f.type) {
    case 'text': return <Row label={f.label} note={f.note} stack><Txt value={value} onChange={onChange} placeholder={f.placeholder} label={f.label} /></Row>;
    case 'textarea': return <Row label={f.label} note={f.note} stack><Txt value={value} onChange={onChange} placeholder={f.placeholder} label={f.label} area /></Row>;
    case 'url': return <Row label={f.label} stack><UrlField value={value} onChange={onChange} pages={pages} /></Row>;
    case 'image': return <Row label={f.label} note={f.note} stack><ImagePick value={value} onChange={onChange} label={f.label} /></Row>;
    case 'richtext': return <Row label={f.label} note={f.note} stack><RichText value={value || ''} onChange={onChange} /></Row>;
    case 'number': return <Row label={f.label}><Num value={value} onChange={v => onChange(v ?? undefined)} min={f.min} max={f.max} step={f.step} unit={f.unit} label={f.label} /></Row>;
    case 'toggle': return <Row label={f.label} note={f.note}><Toggle checked={f.k.startsWith('show_') ? value !== false : !!value} onChange={onChange} label={f.label} /></Row>;
    case 'seg': return <Row label={f.label} stack={f.options.length > 3}><Seg value={String(value ?? f.options[0].v)} options={f.options} onChange={onChange} label={f.label} /></Row>;
    case 'select': return <Row label={f.label}><select className="sb-in" value={value ?? f.options[0].v} onChange={e => onChange(e.target.value)} aria-label={f.label}>{f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Row>;
    case 'checks': {
      const arr: string[] = Array.isArray(value) ? value : f.options.map(o => o.v);
      return (
        <Row label={f.label} stack>
          <div className="sb-checks">{f.options.map(o => (
            <label key={o.v}><input type="checkbox" checked={arr.includes(o.v)} onChange={e => onChange(e.target.checked ? [...arr, o.v] : arr.filter(x => x !== o.v))} />{o.l}</label>
          ))}</div>
        </Row>
      );
    }
    case 'colour': return <Row label={f.label} stack><TextColour value={value} onChange={onChange} label={f.label} /></Row>;
    case 'size': return <Row label={f.label} stack device={device}><SizeField value={value} level={all?.level || 'h2'} device={device} onChange={onChange} /></Row>;
    case 'items': return <Row label={f.label} stack><ItemsField field={f} value={value} onChange={onChange} pages={pages} /></Row>;
    default: return null;
  }
};

/** Margin or padding for one screen size, as four numbers around a box. */
export const SpacingBox: React.FC<{ label: string; device: DeviceType; own: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>> | null; shown: Record<'top' | 'bottom' | 'left' | 'right', number>; onChange: (v: Record<'top' | 'bottom' | 'left' | 'right', number> | null) => void }> = ({ label, device, own, shown, onChange }) => {
  const set = (k: 'top' | 'bottom' | 'left' | 'right', v: number | null) => onChange({ ...shown, ...(own || {}), [k]: v ?? 0 } as never);
  const cell = (k: 'top' | 'bottom' | 'left' | 'right') => (
    <input className={`sb-sp-${k}`} type="number" inputMode="numeric" value={own ? (own[k] ?? '') : ''} placeholder={String(shown[k])} aria-label={`${label} ${k}`} onChange={e => set(k, e.target.value === '' ? null : Number(e.target.value))} />
  );
  return (
    <div className="sb-sp">
      <div className="sb-sp-h"><span>{label}</span>{own && device !== 'desktop' ? <button type="button" className="sb-link" onClick={() => onChange(null)}>Use the desktop value</button> : null}</div>
      <div className="sb-sp-box">
        {cell('top')}{cell('left')}<span className="sb-sp-mid" />{cell('right')}{cell('bottom')}
      </div>
    </div>
  );
};

/** Collapsible group with a one-line summary of what's set. */
export const Group: React.FC<{ title: string; summary?: string; open?: boolean; children: React.ReactNode }> = ({ title, summary, open: initial = true, children }) => {
  const [open, setOpen] = useState(initial);
  return (
    <section className={`sb-grp${open ? ' on' : ''}`}>
      <button type="button" className="sb-grp-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>{!open && summary ? <small>{summary}</small> : null}<ChevronDown size={15} />
      </button>
      {open && <div className="sb-grp-b">{children}</div>}
    </section>
  );
};

export const useDebounced = <T,>(v: T, ms: number) => {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
};

export const useLatest = <T,>(v: T) => { const r = useRef(v); r.current = v; return r; };
export const useStable = <T,>(fn: () => T, deps: unknown[]) => useMemo(fn, deps); // eslint-disable-line react-hooks/exhaustive-deps

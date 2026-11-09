import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, FileText, Loader2, Menu as MenuIcon, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import { DEFAULT_THEME, RESERVED_SLUGS, SITE_FONTS, THEME_PRESETS, contrast, googleFontsHref, isHex, type SiteTheme } from '../../utils/publicSite';
import { Row, Seg, Toggle } from './fields';

export interface PageItem { id: string; slug: string; title: string; is_published: boolean; hasDraft: boolean; inMenu: boolean }

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/* ── Pages ─────────────────────────────────────────────────────────────── */

export const PagesPanel: React.FC<{
  pages: PageItem[];
  current: string;
  onOpen: (slug: string) => void;
  onSettings: () => void;
  onCreate: (title: string, slug: string, addToMenu: boolean) => Promise<boolean>;
  onManage: () => void;
  onClose: () => void;
}> = ({ pages, current, onOpen, onSettings, onCreate, onManage, onClose }) => {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [menu, setMenu] = useState(true);
  const [busy, setBusy] = useState(false);
  const slug = slugify(title);
  const clash = !slug ? null : RESERVED_SLUGS.has(slug) ? 'That address is used by a built-in page.' : pages.some(p => p.slug === slug) ? 'You already have a page at that address.' : null;

  const create = async () => {
    if (!title.trim() || !slug || clash || busy) return;
    setBusy(true);
    const ok = await onCreate(title.trim(), slug, menu);
    setBusy(false);
    if (ok) { setAdding(false); setTitle(''); }
  };

  return (
    <div className="sb-lp-in">
      <div className="sb-lp-h">
        <div><b>Pages</b><span>Switch page, or start a new one</span></div>
        <button type="button" className="sb-ib" onClick={onClose} aria-label="Close pages"><X size={16} /></button>
      </div>
      <div className="sb-lp-scroll">
        <div className="sb-pad" style={{ paddingTop: 0 }}>
          {adding ? (
            <div className="sb-newpage">
              <label className="sb-lab">Page name
                <input className="sb-in" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Try sailing" onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setAdding(false); }} />
              </label>
              <div className="sb-hint" style={clash ? { color: '#FF8F87' } : undefined}>{clash || (slug ? `It will be at /${slug}` : 'The web address comes from the name.')}</div>
              <Row label="Add it to the menu" note="It only shows once you publish it"><Toggle checked={menu} onChange={setMenu} label="Add it to the menu" /></Row>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="sb-btn sm" onClick={() => setAdding(false)}>Cancel</button>
                <button type="button" className="sb-btn sm sb-btn-p" disabled={busy || !slug || !!clash} onClick={create}>{busy ? <Loader2 size={14} className="sb-spin" /> : <Plus size={14} />}Create and edit</button>
              </div>
            </div>
          ) : (
            <button type="button" className="sb-add" onClick={() => setAdding(true)}><Plus size={14} />New page</button>
          )}
        </div>
        <div className="sb-pages" role="list">
          {pages.map(p => {
            const on = p.slug === current;
            const st = !p.is_published ? { c: 'draft', t: 'Draft' } : p.hasDraft ? { c: 'chg', t: 'Changes' } : { c: 'live', t: 'Live' };
            return (
              <div key={p.id} role="listitem" className={`sb-pg${on ? ' on' : ''}`}>
                <button type="button" className="t" onClick={() => !on && onOpen(p.slug)} aria-current={on ? 'page' : undefined}>
                  <FileText size={15} />
                  <span className="n"><b>{p.title}</b><small>/{p.slug}{p.inMenu ? '' : ' · not in menu'}</small></span>
                  <span className={`sb-status ${st.c}`}><i />{st.t}</span>
                </button>
                {on && <button type="button" className="sb-ib" onClick={onSettings} title="Page settings" aria-label="Page settings"><Settings2 size={15} /></button>}
              </div>
            );
          })}
        </div>
        <div className="sb-pad">
          <button type="button" className="sb-btn" onClick={onManage}><MenuIcon size={15} />Menu and page order</button>
          <div className="sb-hint">The menu, page order and built-in pages (results, news, calendar) live in Website › Pages &amp; menu.</div>
        </div>
      </div>
    </div>
  );
};

/* ── Site styles ───────────────────────────────────────────────────────── */

const COLOURS: { key: 'primary' | 'dark' | 'accent'; name: string; use: string }[] = [
  { key: 'primary', name: 'Main colour', use: 'Buttons, links, highlights' },
  { key: 'dark', name: 'Dark colour', use: 'Footer and dark bands' },
  { key: 'accent', name: 'Accent', use: 'Labels and call-outs' },
];

const fullTheme = (t: SiteTheme | null): SiteTheme => ({ ...DEFAULT_THEME, ...(t || {}) });

/**
 * Colours, fonts, corners and buttons for the whole site, previewed live on the canvas.
 * Saving changes the live site straight away (like Website › Design).
 */
export const StylesPanel: React.FC<{
  saved: SiteTheme | null;
  onPreview: (t: SiteTheme | null) => void;
  onSave: (t: SiteTheme) => Promise<boolean>;
  onMore: () => void;
  onClose: () => void;
}> = ({ saved, onPreview, onSave, onMore, onClose }) => {
  const [theme, setTheme] = useState<SiteTheme>(() => fullTheme(saved));
  const [saving, setSaving] = useState(false);
  const savedKey = JSON.stringify(fullTheme(saved));
  const dirty = JSON.stringify(theme) !== savedKey;
  const set = (patch: Partial<SiteTheme>) => setTheme(t => ({ ...t, ...patch, preset: patch.preset ?? 'custom' }));

  // Show it on the canvas while choosing; put the saved look back when the panel closes
  useEffect(() => { onPreview(dirty ? theme : null); }, [theme, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const fonts = googleFontsHref([theme.headingFont, theme.bodyFont]);
  const primary = isHex(theme.primary) ? theme.primary! : DEFAULT_THEME.primary;
  const readable = contrast(primary, '#ffffff') >= 3;
  const fontOptions = useMemo(() => SITE_FONTS.map(f => <option key={f} value={f}>{f}</option>), []);

  const save = async () => {
    setSaving(true);
    const clean = Object.fromEntries(Object.entries(theme).filter(([, v]) => v !== undefined && v !== '')) as SiteTheme;
    const ok = await onSave(clean);
    setSaving(false);
    if (ok) onPreview(null);
  };

  return (
    <div className="sb-lp-in">
      {fonts && <link rel="stylesheet" href={fonts} />}
      <div className="sb-lp-h">
        <div><b>Site styles</b><span>Every page and section follows these</span></div>
        <button type="button" className="sb-ib" onClick={onClose} aria-label="Close site styles"><X size={16} /></button>
      </div>
      <div className="sb-lp-scroll">
        <div className="sb-pad">
          <div className="sbf st">
            <span className="sbf-l">Start from a look</span>
            <div className="sb-looks">
              {THEME_PRESETS.map(p => {
                const on = theme.preset === p.id;
                return (
                  <button key={p.id} type="button" className={`sb-look${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setTheme(t => ({ ...t, ...p.theme, preset: p.id }))}>
                    <span className="sw"><i style={{ background: p.theme.primary }} /><i style={{ background: p.theme.dark }} /><i style={{ background: p.theme.accent }} /></span>
                    <b>{p.name}</b>{on && <Check size={13} />}
                  </button>
                );
              })}
            </div>
          </div>
          {COLOURS.map(c => (
            <div key={c.key} className="sbf">
              <span className="sbf-l">{c.name}<small>{c.use}</small></span>
              <label className="sb-cpick" style={{ background: isHex(theme[c.key]) ? theme[c.key] : DEFAULT_THEME[c.key] }}>
                <input type="color" value={isHex(theme[c.key]) ? theme[c.key] : DEFAULT_THEME[c.key]} onChange={e => set({ [c.key]: e.target.value } as Partial<SiteTheme>)} aria-label={c.name} />
              </label>
              <input className="sb-in sb-hex" value={theme[c.key] || ''} onChange={e => set({ [c.key]: e.target.value.trim() } as Partial<SiteTheme>)} aria-label={`${c.name} code`} spellCheck={false} />
            </div>
          ))}
          {!readable && <div className="sb-hidden-note" style={{ margin: 0 }}>White text is hard to read on this main colour. Try a darker shade.</div>}
          <div className="sbf st">
            <span className="sbf-l">Heading font</span>
            <select className="sb-in" value={theme.headingFont} onChange={e => set({ headingFont: e.target.value })} style={{ fontFamily: theme.headingFont }}>{fontOptions}</select>
          </div>
          <div className="sbf st">
            <span className="sbf-l">Body font</span>
            <select className="sb-in" value={theme.bodyFont} onChange={e => set({ bodyFont: e.target.value })} style={{ fontFamily: theme.bodyFont }}>{fontOptions}</select>
          </div>
          <div className="sb-fontpv" style={{ fontFamily: theme.bodyFont }}>
            <b style={{ fontFamily: theme.headingFont }}>Racing every Sunday</b>
            <span>New skippers are always welcome. Borrow a club boat for your first race.</span>
          </div>
          <Row label="Corners" stack><Seg value={theme.corners || 'soft'} options={[{ v: 'square', l: 'Square' }, { v: 'soft', l: 'Soft' }, { v: 'round', l: 'Round' }]} onChange={v => set({ corners: v as SiteTheme['corners'] })} label="Corners" /></Row>
          <Row label="Buttons" stack><Seg value={theme.buttons || 'solid'} options={[{ v: 'solid', l: 'Solid' }, { v: 'outline', l: 'Outline' }]} onChange={v => set({ buttons: v as SiteTheme['buttons'] })} label="Buttons" /></Row>
        </div>
      </div>
      <div className="sb-lp-foot">
        {dirty ? (
          <>
            <button type="button" className="sb-btn sm" onClick={() => setTheme(fullTheme(saved))}><RotateCcw size={14} />Undo</button>
            <button type="button" className="sb-btn sm sb-btn-p" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="sb-spin" /> : <Check size={14} />}Save for the whole site</button>
          </>
        ) : (
          <button type="button" className="sb-link" onClick={onMore}><ExternalLink size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Logos, favicon and more in Website › Design</button>
        )}
      </div>
    </div>
  );
};

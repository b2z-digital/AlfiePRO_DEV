import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, AlertTriangle, Loader2, Monitor, Smartphone, Sparkles, Tablet, Upload, RotateCcw } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAlfieLight } from '../alfie/Kit';
import { MediaLibraryModal } from '../MediaLibraryModal';
import { AUTO_PAGES, contrast, DEFAULT_THEME, hasTheme, isHex, SITE_FONTS, SiteTheme, THEME_PRESETS, googleFontsHref } from '../../utils/publicSite';
import { useHub } from './hubData';
import { SitePreviewFrame, PreviewDevice } from './SitePreviewFrame';

const PAIRS: [string, string][] = [['Outfit', 'Inter'], ['Montserrat', 'Open Sans'], ['Poppins', 'Lato'], ['Raleway', 'Inter']];

const COLOURS: { key: 'primary' | 'dark' | 'accent'; name: string; use: string }[] = [
  { key: 'primary', name: 'Main colour', use: 'Buttons, links, highlights' },
  { key: 'dark', name: 'Dark colour', use: 'Footer and dark bands' },
  { key: 'accent', name: 'Accent', use: 'Labels on slides' },
];

/** Picks a strong colour and a dark colour from the club logo. */
async function coloursFromLogo(src: string): Promise<{ primary?: string; dark?: string } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 48, 48);
        const d = ctx.getImageData(0, 0, 48, 48).data;
        const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          const k = `${r >> 5}-${g >> 5}-${b >> 5}`;
          const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
          e.n++; e.r += r; e.g += g; e.b += b;
          buckets.set(k, e);
        }
        const list = Array.from(buckets.values()).map(e => {
          const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const hex = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
          return { n: e.n, sat, light: max / 255, hex };
        });
        const strong = list.filter(c2 => c2.sat > 0.35 && c2.light > 0.25 && c2.light < 0.95).sort((a, b) => b.n * b.sat - a.n * a.sat)[0];
        const dark = list.filter(c2 => c2.light < 0.3).sort((a, b) => b.n - a.n)[0];
        resolve({ primary: strong?.hex, dark: dark?.hex });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src + (src.includes('?') ? '&' : '?') + 'cors=1';
  });
}

export const HubDesign: React.FC = () => {
  const { club, pages, previewPath, updateClub, log } = useHub();
  const { addNotification } = useNotifications();
  const light = useAlfieLight();
  const saved: SiteTheme | null = hasTheme(club!.website_theme) ? club!.website_theme : null;
  const [theme, setTheme] = useState<SiteTheme>(() => ({ ...DEFAULT_THEME, ...(saved || {}) }));
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [path, setPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [upload, setUpload] = useState<null | 'logoDark' | 'favicon'>(null);
  const [matching, setMatching] = useState(false);

  const savedKey = JSON.stringify(saved ? { ...DEFAULT_THEME, ...saved } : null);
  const dirty = JSON.stringify(theme) !== savedKey;
  const set = (patch: Partial<SiteTheme>) => setTheme(t => ({ ...t, ...patch, preset: patch.preset ?? (Object.keys(patch).some(k => k !== 'logoDark' && k !== 'favicon') ? 'custom' : t.preset) }));

  // Load the picked fonts in the hub too, so the font pickers show them
  const fontHref = googleFontsHref([theme.headingFont, theme.bodyFont]);

  const save = async () => {
    setSaving(true);
    const clean: SiteTheme = Object.fromEntries(Object.entries(theme).filter(([, v]) => v !== undefined && v !== '')) as SiteTheme;
    const ok = await updateClub({ website_theme: clean } as any);
    setSaving(false);
    if (ok) { log('updated', 'design', 'Website design'); addNotification('success', 'Design saved. Your site has the new look.'); }
    else addNotification('error', 'Could not save the design. Please try again.');
  };

  const useStandard = async () => {
    if (!window.confirm('Go back to the standard AlfiePRO look? Your colours, fonts and extra logos will be removed.')) return;
    const ok = await updateClub({ website_theme: null } as any);
    if (ok) { setTheme({ ...DEFAULT_THEME }); log('updated', 'design', 'Standard look'); addNotification('success', 'Your site is back to the standard look.'); }
  };

  const matchLogo = async () => {
    if (!club!.logo) return;
    setMatching(true);
    const res = await coloursFromLogo(club!.logo);
    setMatching(false);
    if (!res || (!res.primary && !res.dark)) { addNotification('info', 'Couldn’t read colours from your logo. Pick them by hand.'); return; }
    set({ ...(res.primary ? { primary: res.primary } : {}), ...(res.dark ? { dark: res.dark } : {}) });
  };

  const primary = isHex(theme.primary) ? theme.primary : DEFAULT_THEME.primary;
  const readable = contrast(primary, '#ffffff') >= 3;

  const pathOptions = useMemo(() => [
    { value: '', label: 'Home' },
    ...AUTO_PAGES.map(a => ({ value: a.path, label: a.label })),
    ...pages.filter(p => p.is_published).map(p => ({ value: `/${p.page_slug}`, label: p.page_title })),
  ], [pages]);

  return (
    <div className="wh-dz">
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <section className="a-card wh-dset" aria-label="Design settings">
        <div className="wh-dsec">
          <div className="wh-dsec-h"><h3 className="a-display">Start from a look</h3><span className="r wh-dim text-[12px]">Changes colours and fonts only</span></div>
          <div className="wh-presets">
            {THEME_PRESETS.map(p => {
              const on = theme.preset === p.id;
              return (
                <button key={p.id} className={`wh-pr${on ? ' on' : ''}`} onClick={() => set({ ...p.theme, preset: p.id })} aria-pressed={on}>
                  {on && <span className="ck"><Check size={11} strokeWidth={3} /></span>}
                  <span className="sws"><i style={{ background: p.theme.primary }} /><i style={{ background: p.theme.dark }} /><i style={{ background: p.theme.accent }} /></span>
                  <b>{p.name}</b>
                </button>
              );
            })}
          </div>
        </div>

        <div className="wh-dsec">
          <div className="wh-dsec-h"><h3 className="a-display">Logo</h3></div>
          <div className="wh-logos">
            <div className="wh-lslot">
              <span className="bx" style={{ background: '#fff', cursor: 'default' }}>{club!.logo ? <img src={club!.logo} alt="Club logo" /> : <span style={{ color: '#0D2240', fontWeight: 800 }}>{club!.abbreviation}</span>}</span>
              <span className="cp">On light · from Club settings</span>
            </div>
            <div className="wh-lslot">
              <button className="bx" style={{ background: theme.dark || DEFAULT_THEME.dark }} onClick={() => setUpload('logoDark')} aria-label="Choose a logo for dark backgrounds">
                {theme.logoDark ? <img src={theme.logoDark} alt="" /> : <span style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, fontWeight: 600 }}>Add logo</span>}
                <span className="up"><Upload size={16} /></span>
              </button>
              <span className="cp">On dark (footer)</span>
            </div>
            <div className="wh-lslot">
              <button className="bx" style={{ background: 'var(--w-fill)', boxShadow: '0 0 0 1px var(--w-line)' }} onClick={() => setUpload('favicon')} aria-label="Choose a browser tab icon">
                {theme.favicon ? <img src={theme.favicon} alt="" style={{ width: 30, height: 30 }} /> : <Upload size={16} className="wh-dim" />}
                <span className="up"><Upload size={16} /></span>
              </button>
              <span className="cp">Tab icon</span>
            </div>
          </div>
        </div>

        <div className="wh-dsec">
          <div className="wh-dsec-h"><h3 className="a-display">Colours</h3>
            {club!.logo && <span className="r"><button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={matchLogo} disabled={matching}>{matching ? <Loader2 size={14} className="wh-spin" /> : <Sparkles size={14} />}Match my logo</button></span>}
          </div>
          {COLOURS.map(c => {
            const v = (theme[c.key] as string) || DEFAULT_THEME[c.key];
            return (
              <div key={c.key} className="wh-crow">
                <label className="s" style={{ background: isHex(v) ? v : '#000' }}><input type="color" value={isHex(v) ? v : '#000000'} onChange={e => set({ [c.key]: e.target.value } as any)} aria-label={c.name} /></label>
                <div><div className="nm">{c.name}</div><div className="us">{c.use}</div></div>
                <input className="a-inp" value={v} maxLength={7} onChange={e => set({ [c.key]: e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}` } as any)} aria-label={`${c.name} hex code`} />
              </div>
            );
          })}
          <div className={`wh-okline${readable ? '' : ' warn'}`}>{readable ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{readable ? 'Buttons and links are easy to read' : 'Your main colour is very light, so links will be hard to read. Try a darker one.'}</div>
        </div>

        <div className="wh-dsec">
          <div className="wh-dsec-h"><h3 className="a-display">Fonts</h3></div>
          <div className="wh-fontrow"><label className="k" htmlFor="w-hf">Headings</label>
            <select id="w-hf" className="a-inp" value={theme.headingFont} onChange={e => set({ headingFont: e.target.value })} style={{ fontFamily: `'${theme.headingFont}', sans-serif`, fontWeight: 700 }}>
              {SITE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="wh-fontrow"><label className="k" htmlFor="wh-bf">Body text</label>
            <select id="wh-bf" className="a-inp" value={theme.bodyFont} onChange={e => set({ bodyFont: e.target.value })} style={{ fontFamily: `'${theme.bodyFont}', sans-serif` }}>
              {SITE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="wh-chips">
            {PAIRS.map(([h, b]) => (
              <button key={h + b} className={`wh-chip${theme.headingFont === h && theme.bodyFont === b ? ' on' : ''}`} onClick={() => set({ headingFont: h, bodyFont: b })}>{h} + {b}</button>
            ))}
          </div>
        </div>

        <div className="wh-dsec">
          <div className="wh-dsec-h"><h3 className="a-display">Shape</h3></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="a-seg" role="group" aria-label="Corners">
              {(['square', 'soft', 'round'] as const).map(k => <button key={k} className={`a-seg-i ${theme.corners === k ? 'a-seg-on' : ''}`} onClick={() => set({ corners: k })}>{k[0].toUpperCase() + k.slice(1)}</button>)}
            </div>
            <div className="a-seg" role="group" aria-label="Button style">
              {(['solid', 'outline'] as const).map(k => <button key={k} className={`a-seg-i ${theme.buttons === k ? 'a-seg-on' : ''}`} onClick={() => set({ buttons: k })}>{k === 'solid' ? 'Solid buttons' : 'Outline'}</button>)}
            </div>
          </div>
        </div>

        {saved ? (
          <button className="wh-more" style={{ background: 'none', border: 0, borderTop: '1px solid var(--w-line2)', cursor: 'pointer', textAlign: 'left' }} onClick={useStandard}><RotateCcw size={15} />Go back to the standard AlfiePRO look</button>
        ) : (
          <div className="wh-more" style={{ color: 'var(--w-dim)', fontWeight: 500 }}>Your site uses the standard AlfiePRO look until you save a design.</div>
        )}
      </section>

      <section className="a-card wh-bf wh-dprev" aria-label="Design preview" style={{ position: 'sticky' }}>
        <div className="wh-bf-bar">
          <div className="a-seg" role="group" aria-label="Preview size">
            <button className={`a-seg-i ${device === 'desktop' ? 'a-seg-on' : ''}`} onClick={() => setDevice('desktop')} aria-label="Desktop"><Monitor size={15} /></button>
            <button className={`a-seg-i ${device === 'tablet' ? 'a-seg-on' : ''}`} onClick={() => setDevice('tablet')} aria-label="Tablet"><Tablet size={15} /></button>
            <button className={`a-seg-i ${device === 'phone' ? 'a-seg-on' : ''}`} onClick={() => setDevice('phone')} aria-label="Phone"><Smartphone size={15} /></button>
          </div>
          <select className="wh-pg-sel" value={path} onChange={e => setPath(e.target.value)} aria-label="Page to preview">
            {pathOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="wh-dim" style={{ marginLeft: 'auto', fontSize: 12.5 }}>Changes show here straight away</span>
        </div>
        <SitePreviewFrame path={`${previewPath}${path}`} device={device} height={760} overrides={{ theme }} interactive title="Design preview" />
        {dirty && (
          <div className="wh-savebar" role="status">
            <span className="dt" /><span style={{ fontWeight: 600 }}>{saved ? 'Unsaved changes' : 'Not on your site yet'}</span>
            <button className="a-btn" style={{ height: 34 }} onClick={() => setTheme({ ...DEFAULT_THEME, ...(saved || {}) })}>Undo</button>
            <button className="a-btn a-btn-p" style={{ height: 34 }} onClick={save} disabled={saving}>{saving ? <Loader2 size={15} className="wh-spin" /> : null}Save design</button>
          </div>
        )}
      </section>

      {upload && (
        <MediaLibraryModal isOpen onClose={() => setUpload(null)} onSelect={url => { set({ [upload]: url } as any); setUpload(null); }} darkMode={!light} isHomepageMedia />
      )}
    </div>
  );
};

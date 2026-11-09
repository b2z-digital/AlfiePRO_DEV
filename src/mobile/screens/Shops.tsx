import React, { useEffect, useMemo, useState } from 'react';
import { useMobile } from '../MobileContext';
import { Icon, IconName } from '../icons';
import { Skeleton } from '../ui';
import { PageHeader } from './Club';
import { isNative } from '../../lib/native/platform';
import {
  SHOP_ACCENTS, ShopCategory, ShopIcon, ShopSupplier, loadShops, recordShopVisit, shopColor, shopDomain, shopInitials, shopMesh, shopUrl,
} from '../../utils/shopStorage';

const GLYPH: Record<ShopIcon, IconName> = { bag: 'bag', sail: 'sail', wrench: 'wrench', radio: 'sound', boat: 'sail', tag: 'tag', battery: 'bag', box: 'bag' };

async function openStore(s: ShopSupplier) {
  const url = shopUrl(s.website_url);
  if (!url) return;
  recordShopVisit(s.id);
  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch { /* fall back */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

const banner = (s: ShopSupplier, light: boolean): React.CSSProperties =>
  s.cover_url ? { backgroundImage: `url("${s.cover_url}")` } : { background: shopMesh(shopColor(s), light) };

const Logo: React.FC<{ s: ShopSupplier }> = ({ s }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className="m-shp-lg">
      {s.logo_url && !broken ? <img src={s.logo_url} alt="" onError={() => setBroken(true)} /> : <b style={{ color: shopColor(s) }}>{shopInitials(s.name)}</b>}
    </span>
  );
};

const CatIcon: React.FC<{ c: ShopCategory; size?: number; box?: number }> = ({ c, size = 13, box = 22 }) => {
  const a = SHOP_ACCENTS[c.accent] || SHOP_ACCENTS.blue;
  return <span className="m-shp-ic" style={{ background: a.bg, color: a.fg, width: box, height: box }}><Icon name={GLYPH[c.icon] || 'bag'} size={size} /></span>;
};

const StoreTile: React.FC<{ s: ShopSupplier; light: boolean; onOpen: () => void }> = ({ s, light, onOpen }) => (
  <button className="m-shp-st" onClick={onOpen}>
    <div className="m-shp-bn" style={banner(s, light)} />
    <div className="m-shp-bd">
      <Logo s={s} />
      <div className="m-shp-nm">{s.name}</div>
      {(s.tagline || s.description) && <div className="m-shp-tg">{s.tagline || s.description}</div>}
      {s.boat_classes.length > 0 && (
        <div className="m-shp-cls">
          {s.boat_classes.slice(0, 3).map(c => <span key={c} className="m-shp-cl">{c}</span>)}
          {s.boat_classes.length > 3 && <span className="m-shp-cl">+{s.boat_classes.length - 3}</span>}
        </div>
      )}
    </div>
  </button>
);

const StoreSheet: React.FC<{ s: ShopSupplier; categories: ShopCategory[]; light: boolean; onClose: () => void }> = ({ s, categories, light, onClose }) => {
  const url = shopUrl(s.website_url);
  const cats = categories.filter(c => s.categoryIds.includes(c.id));
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet m-shp-sheet" role="dialog" aria-label={s.name}>
        <span className="m-grab" />
        <div className="m-shp-hero" style={banner(s, light)} />
        <div className="m-shp-in">
          <Logo s={s} />
          <div>
            <h2>{s.name}</h2>
            {s.tagline && <div className="m-mut" style={{ fontSize: 14.5, marginTop: 4 }}>{s.tagline}</div>}
          </div>
          {cats.length > 0 && (
            <div className="m-chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
              {cats.map(c => <span key={c.id} className="m-chip" style={{ paddingLeft: 10 }}><CatIcon c={c} size={12} box={20} />{c.name}</span>)}
            </div>
          )}
          {s.description && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--m-mut)', whiteSpace: 'pre-line' }}>{s.description}</p>}
          {s.boat_classes.length > 0 && (
            <div className="m-shp-cls" style={{ paddingTop: 0 }}>{s.boat_classes.map(c => <span key={c} className="m-shp-cl" style={{ height: 24, lineHeight: '24px', fontSize: 11, padding: '0 9px' }}>{c}</span>)}</div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {url && <button className="m-shp-fact" style={{ border: 0, textAlign: 'left' }} onClick={() => openStore(s)}><Icon name="globe" size={18} className="m-dim" /><div style={{ minWidth: 0, flex: 1 }}><small>Website</small><span>{shopDomain(url)}</span></div><Icon name="external" size={16} className="m-dim" /></button>}
            {s.email && <a className="m-shp-fact" href={`mailto:${s.email}`}><Icon name="mail" size={18} className="m-dim" /><div style={{ minWidth: 0 }}><small>Email</small><span>{s.email}</span></div></a>}
            {s.phone && <a className="m-shp-fact" href={`tel:${s.phone.replace(/\s+/g, '')}`}><Icon name="phone" size={18} className="m-dim" /><div style={{ minWidth: 0 }}><small>Phone</small><span>{s.phone}</span></div></a>}
            {s.location && <div className="m-shp-fact"><Icon name="pin" size={18} className="m-dim" /><div style={{ minWidth: 0 }}><small>Based in</small><span>{s.location}</span></div></div>}
            {s.ships_to && <div className="m-shp-fact"><Icon name="truck" size={18} className="m-dim" /><div style={{ minWidth: 0 }}><small>Ships to</small><span>{s.ships_to}</span></div></div>}
          </div>
          {url ? (
            <button className="m-shp-go" onClick={() => openStore(s)}>Visit store<Icon name="external" size={17} /></button>
          ) : s.email ? (
            <a className="m-shp-go" href={`mailto:${s.email}`}><Icon name="mail" size={17} />Email {s.name}</a>
          ) : s.phone ? (
            <a className="m-shp-go" href={`tel:${s.phone.replace(/\s+/g, '')}`}><Icon name="phone" size={17} />Call {s.name}</a>
          ) : null}
          <div className="m-dim" style={{ fontSize: 12, textAlign: 'center' }}>Orders and support are handled by the supplier.</div>
        </div>
      </div>
    </>
  );
};

export const ShopsScreen: React.FC = () => {
  const { light, tap } = useMobile();
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [aisle, setAisle] = useState('all');
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ShopSupplier | null>(null);

  useEffect(() => {
    loadShops()
      .then(d => { setCategories(d.categories.filter(c => c.is_active)); setSuppliers(d.suppliers.filter(s => s.is_active)); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const classes = useMemo(() => {
    const m = new Map<string, number>();
    suppliers.forEach(s => s.boat_classes.forEach(c => m.set(c, (m.get(c) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [suppliers]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return suppliers.filter(s =>
      (aisle === 'all' || s.categoryIds.includes(aisle)) && (!cls || s.boat_classes.includes(cls)) &&
      (!t || [s.name, s.tagline, s.description, ...s.boat_classes].some(v => (v || '').toLowerCase().includes(t))));
  }, [suppliers, aisle, cls, q]);

  const browsing = aisle === 'all' && !cls && !q.trim();
  const featured = suppliers.filter(s => s.is_featured);
  const shelves = (aisle === 'all' ? categories : categories.filter(c => c.id === aisle))
    .map(c => ({ c, items: matches.filter(s => s.categoryIds.includes(c.id)) })).filter(x => x.items.length);
  const show = (s: ShopSupplier) => { tap(); setOpen(s); };

  return (
    <div className="m-stack">
      <PageHeader title="Shops" />
      {loading ? (
        <>
          <Skeleton h={196} />
          <div className="m-shp-grid"><Skeleton h={190} /><Skeleton h={190} /><Skeleton h={190} /><Skeleton h={190} /></div>
        </>
      ) : failed ? (
        <div className="m-card m-empty">Shops couldn’t load. Check your connection and try again.</div>
      ) : !suppliers.length ? (
        <div className="m-card m-empty"><Icon name="bag" size={28} /><div style={{ fontWeight: 650, color: 'var(--m-ink)', marginTop: 8 }}>The shops are opening soon</div>Suppliers of parts, sails and gear will appear here.</div>
      ) : (
        <>
          {browsing && featured.length > 0 && (
            <div className="m-shp-spot">
              {featured.map(s => (
                <button key={s.id} className="m-shp-sl" style={s.cover_url ? { backgroundImage: `url("${s.cover_url}")` } : { background: shopMesh(shopColor(s), false) }} onClick={() => show(s)}>
                  <Logo s={s} />
                  <span className="m-shp-kick"><Icon name="sparkle" size={11} />Spotlight</span>
                  <h3>{s.name}</h3>
                  {(s.tagline || s.description) && <p>{s.tagline || s.description}</p>}
                </button>
              ))}
            </div>
          )}

          <label className="m-search"><Icon name="search" size={17} className="m-dim" /><input placeholder="Search suppliers, fins, sails…" value={q} onChange={e => setQ(e.target.value)} />{q && <button onClick={() => setQ('')} aria-label="Clear" style={{ background: 'none', border: 0, color: 'var(--m-dim)', display: 'flex' }}><Icon name="close" size={16} /></button>}</label>

          <div className="m-chips">
            <button className={`m-chip ${aisle === 'all' ? 'm-chip-on' : ''}`} onClick={() => setAisle('all')}>All shops</button>
            {categories.map(c => (
              <button key={c.id} className={`m-chip ${aisle === c.id ? 'm-chip-on' : ''}`} onClick={() => setAisle(c.id)} style={{ paddingLeft: 12 }}>
                <CatIcon c={c} size={12} box={20} />{c.name}
              </button>
            ))}
          </div>
          {classes.length > 0 && (
            <div className="m-chips">
              {classes.map(c => (
                <button key={c} className={`m-chip ${cls === c ? 'm-chip-on' : ''}`} style={{ height: 28, fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em' }} onClick={() => setCls(cls === c ? '' : c)}>{c}</button>
              ))}
            </div>
          )}

          {!matches.length ? (
            <div className="m-card m-empty">No suppliers match. Try another class or category.</div>
          ) : shelves.map(({ c, items }) => (
            <section key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="m-shp-sh"><CatIcon c={c} size={15} box={30} /><h2>{c.name}</h2><span className="m-dim" style={{ marginLeft: 'auto', fontSize: 13 }}>{items.length}</span></div>
              <div className="m-shp-grid">{items.map(s => <StoreTile key={`${c.id}-${s.id}`} s={s} light={light} onOpen={() => show(s)} />)}</div>
            </section>
          ))}
        </>
      )}
      {open && <StoreSheet s={open} categories={categories} light={light} onClose={() => setOpen(null)} />}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight, BatteryCharging, ChevronLeft, ChevronRight, Globe, Mail, MapPin, Package, Phone, Radio,
  Sailboat, Ship, ShoppingBag, Sparkles, Tag, Truck, Wrench, X,
} from 'lucide-react';
import {
  SHOP_ACCENTS, ShopCategory, ShopIcon, ShopSupplier, recordShopVisit, shopColor, shopDomain, shopInitials, shopMesh, shopUrl,
} from '../../utils/shopStorage';

/** True while the Alfie light theme is on (follows the html class). */
export function useAlfieLight(): boolean {
  const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('alfie-light');
  const [light, setLight] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setLight(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return light;
}

const GLYPHS: Record<ShopIcon, LucideIcon> = {
  bag: ShoppingBag, sail: Sailboat, wrench: Wrench, radio: Radio, boat: Ship, tag: Tag, battery: BatteryCharging, box: Package,
};

export const CategoryGlyph: React.FC<{ icon: ShopIcon | string; size?: number }> = ({ icon, size = 17 }) => {
  const G = GLYPHS[icon as ShopIcon] || ShoppingBag;
  return <G size={size} />;
};

export const CategoryBadge: React.FC<{ category: ShopCategory; size?: number; iconSize?: number }> = ({ category, size = 34, iconSize = 17 }) => {
  const a = SHOP_ACCENTS[category.accent] || SHOP_ACCENTS.blue;
  return (
    <span style={{ width: size, height: size, borderRadius: '30%', background: a.bg, color: a.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <CategoryGlyph icon={category.icon} size={iconSize} />
    </span>
  );
};

/** Supplier logo on white, or its initials in the brand colour. */
export const ShopLogo: React.FC<{ supplier: ShopSupplier; className?: string }> = ({ supplier, className = 'a-sh-logo' }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className={className}>
      {supplier.logo_url && !broken
        ? <img src={supplier.logo_url} alt="" onError={() => setBroken(true)} />
        : <b style={{ color: shopColor(supplier) }}>{shopInitials(supplier.name)}</b>}
    </span>
  );
};

export function shopBanner(supplier: ShopSupplier, light: boolean): React.CSSProperties {
  return supplier.cover_url
    ? { backgroundImage: `url("${supplier.cover_url}")` }
    : { background: shopMesh(shopColor(supplier), light) };
}

export function visitShop(supplier: ShopSupplier): void {
  const url = shopUrl(supplier.website_url);
  if (!url) return;
  recordShopVisit(supplier.id);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Storefront card: brand banner, floating logo, name, classes. */
export const StoreCard: React.FC<{ supplier: ShopSupplier; light: boolean; onOpen: (s: ShopSupplier) => void; showFeatured?: boolean }> = ({ supplier, light, onOpen, showFeatured = true }) => {
  const domain = shopDomain(supplier.website_url);
  return (
    <article
      className="a-sh-store"
      role="button"
      tabIndex={0}
      aria-label={`${supplier.name} — open store`}
      onClick={() => onOpen(supplier)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(supplier); } }}
    >
      <div className="a-sh-banner" style={shopBanner(supplier, light)}>
        {!supplier.cover_url && <span className="a-sh-grain" />}
        <div className="a-sh-pins">
          {showFeatured && supplier.is_featured ? <span className="a-sh-pin a-sh-pin-spec"><Sparkles size={11} />Featured</span> : <span />}
          {supplier.ships_to ? <span className="a-sh-pin"><Truck size={12} />{supplier.ships_to}</span> : supplier.location ? <span className="a-sh-pin"><MapPin size={12} />{supplier.location}</span> : null}
        </div>
      </div>
      <div className="a-sh-body">
        <ShopLogo supplier={supplier} />
        <div>
          <h3 className="a-sh-name">{supplier.name}</h3>
          {(supplier.tagline || supplier.description) && <p className="a-sh-tag">{supplier.tagline || supplier.description}</p>}
        </div>
        {supplier.boat_classes.length > 0 && (
          <div className="a-sh-cls">
            {supplier.boat_classes.slice(0, 4).map(c => <span key={c} className="a-sh-cl">{c}</span>)}
            {supplier.boat_classes.length > 4 && <span className="a-sh-cl">+{supplier.boat_classes.length - 4}</span>}
          </div>
        )}
        <div className="a-sh-go">
          <span className="truncate">{domain || (supplier.email || supplier.phone ? 'Contact direct' : 'Details')}</span>
          <b>{domain ? 'Visit store' : 'View'}<ArrowUpRight size={15} /></b>
        </div>
      </div>
    </article>
  );
};

/** Big rotating hero for featured suppliers. */
export const Spotlight: React.FC<{ suppliers: ShopSupplier[]; onOpen: (s: ShopSupplier) => void }> = ({ suppliers, onOpen }) => {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = suppliers.length;
  useEffect(() => {
    if (n < 2 || paused) return;
    const t = window.setInterval(() => setI(x => (x + 1) % n), 6000);
    return () => window.clearInterval(t);
  }, [n, paused]);
  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  if (!n) return null;
  return (
    <section className="a-sh-spot" aria-roledescription="carousel" aria-label="Featured suppliers" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {suppliers.map((s, k) => (
        <div key={s.id} className={`a-sh-spot-slide ${k === i ? 'on' : ''}`} aria-hidden={k !== i}>
          <div className="a-sh-spot-bg" style={s.cover_url ? { backgroundImage: `url("${s.cover_url}")` } : { background: shopMesh(shopColor(s), false) }} />
          {!s.cover_url && <span className="a-sh-spot-grain" />}
          <div style={{ minWidth: 0 }}>
            <span className="a-sh-kick"><i />Spotlight</span>
            <h2>{s.name}</h2>
            {(s.tagline || s.description) && <p>{s.description || s.tagline}</p>}
            <div className="a-sh-spot-cta">
              {shopUrl(s.website_url) && (
                <button className="a-sh-btn-w" tabIndex={k === i ? 0 : -1} onClick={() => visitShop(s)}>Visit store<ArrowUpRight size={16} /></button>
              )}
              <button className="a-sh-btn-gl" tabIndex={k === i ? 0 : -1} onClick={() => onOpen(s)}>Store details</button>
            </div>
          </div>
          <ShopLogo supplier={s} className="a-sh-spot-logo" />
        </div>
      ))}
      {n > 1 && (
        <>
          <div className="a-sh-dots">
            {suppliers.map((s, k) => <button key={s.id} className={k === i ? 'on' : ''} aria-label={`Show ${s.name}`} onClick={() => setI(k)} />)}
          </div>
          <div className="a-sh-arrows">
            <button aria-label="Previous" onClick={() => setI(x => (x - 1 + n) % n)}><ChevronLeft size={18} /></button>
            <button aria-label="Next" onClick={() => setI(x => (x + 1) % n)}><ChevronRight size={18} /></button>
          </div>
        </>
      )}
    </section>
  );
};

/** Slide-in store panel with everything about one supplier. */
export const StorePanel: React.FC<{ supplier: ShopSupplier; categories: ShopCategory[]; light: boolean; onClose: () => void }> = ({ supplier, categories, light, onClose }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const url = shopUrl(supplier.website_url);
  const cats = categories.filter(c => supplier.categoryIds.includes(c.id));
  return (
    <>
      <div className="a-sh-veil" onClick={onClose} />
      <aside className="a-sh-panel" role="dialog" aria-modal="true" aria-label={supplier.name}>
        <div className="a-sh-panel-hero" style={shopBanner(supplier, light)}>
          <button className="a-sh-panel-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="a-sh-panel-body">
          <ShopLogo supplier={supplier} />
          <h3>{supplier.name}</h3>
          {supplier.tagline && <p className="a-sh-tag" style={{ WebkitLineClamp: 'unset', fontSize: 14.5, marginTop: 6 }}>{supplier.tagline}</p>}

          {cats.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {cats.map(c => (
                <span key={c.id} className="a-lb-fmt" style={{ height: 28, gap: 7, paddingLeft: 4 }}>
                  <CategoryBadge category={c} size={20} iconSize={12} />{c.name}
                </span>
              ))}
            </div>
          )}

          {supplier.description && (
            <div className="mt-5">
              <div className="a-cap mb-2">About</div>
              <p className="a-sh-about">{supplier.description}</p>
            </div>
          )}

          {supplier.boat_classes.length > 0 && (
            <div className="mt-5">
              <div className="a-cap mb-2">Classes</div>
              <div className="a-sh-cls">{supplier.boat_classes.map(c => <span key={c} className="a-sh-cl" style={{ height: 26, fontSize: 11.5, padding: '0 10px' }}>{c}</span>)}</div>
            </div>
          )}

          {(url || supplier.email || supplier.phone || supplier.location || supplier.ships_to) && (
            <div className="mt-5">
              <div className="a-cap mb-2">Details</div>
              <div className="a-sh-facts">
                {url && <a className="a-sh-fact" href={url} target="_blank" rel="noopener noreferrer" onClick={() => recordShopVisit(supplier.id)}><Globe size={16} /><div className="min-w-0"><small>Website</small><span>{shopDomain(url)}</span></div></a>}
                {supplier.email && <a className="a-sh-fact" href={`mailto:${supplier.email}`}><Mail size={16} /><div className="min-w-0"><small>Email</small><span>{supplier.email}</span></div></a>}
                {supplier.phone && <a className="a-sh-fact" href={`tel:${supplier.phone.replace(/\s+/g, '')}`}><Phone size={16} /><div className="min-w-0"><small>Phone</small><span>{supplier.phone}</span></div></a>}
                {supplier.location && <div className="a-sh-fact"><MapPin size={16} /><div className="min-w-0"><small>Based in</small><span>{supplier.location}</span></div></div>}
                {supplier.ships_to && <div className="a-sh-fact"><Truck size={16} /><div className="min-w-0"><small>Ships to</small><span>{supplier.ships_to}</span></div></div>}
              </div>
            </div>
          )}

          <div className="a-sh-soon mt-5"><ShoppingBag size={18} />Buying through Alfie is coming. For now, orders are placed with the supplier.</div>
        </div>
        <div className="a-sh-panel-foot">
          {url ? (
            <button className="a-sh-visit" onClick={() => visitShop(supplier)}>Visit {supplier.name}<ArrowUpRight size={18} /></button>
          ) : supplier.email ? (
            <a className="a-sh-visit" href={`mailto:${supplier.email}`}><Mail size={17} />Email {supplier.name}</a>
          ) : supplier.phone ? (
            <a className="a-sh-visit" href={`tel:${supplier.phone.replace(/\s+/g, '')}`}><Phone size={17} />Call {supplier.name}</a>
          ) : (
            <button className="a-btn a-btn-q flex-1" style={{ height: 50 }} onClick={onClose}>Close</button>
          )}
        </div>
      </aside>
    </>
  );
};

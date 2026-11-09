import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Settings2, Store, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ShopCategory, ShopSupplier, loadShops } from '../utils/shopStorage';
import { CategoryBadge, Spotlight, StoreCard, StorePanel, useAlfieLight } from '../components/shops/ShopParts';

/** Shops: suppliers of parts, sails and gear, shown as storefronts. */
const ShopsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const light = useAlfieLight();
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [aisle, setAisle] = useState<string>('all');
  const [cls, setCls] = useState<string>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ShopSupplier | null>(null);

  useEffect(() => {
    loadShops()
      .then(({ categories, suppliers }) => {
        setCategories(categories.filter(c => c.is_active));
        setSuppliers(suppliers.filter(s => s.is_active));
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const classes = useMemo(() => {
    const seen = new Map<string, number>();
    suppliers.forEach(s => s.boat_classes.forEach(c => seen.set(c, (seen.get(c) || 0) + 1)));
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [suppliers]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return suppliers.filter(s =>
      (!cls || s.boat_classes.includes(cls)) &&
      (aisle === 'all' || s.categoryIds.includes(aisle)) &&
      (!term || [s.name, s.tagline, s.description, s.location, ...s.boat_classes].some(v => (v || '').toLowerCase().includes(term))),
    );
  }, [suppliers, q, cls, aisle]);

  const browsing = aisle === 'all' && !cls && !q.trim();
  const featured = suppliers.filter(s => s.is_featured);
  const countIn = (catId: string) => suppliers.filter(s => s.categoryIds.includes(catId)).length;
  const shelves = (aisle === 'all' ? categories : categories.filter(c => c.id === aisle))
    .map(c => ({ cat: c, items: matches.filter(s => s.categoryIds.includes(c.id)) }))
    .filter(x => x.items.length);
  const uncategorised = aisle === 'all' ? matches.filter(s => !s.categoryIds.some(id => categories.some(c => c.id === id))) : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Store size={24} /></span>
          <div className="flex-1 min-w-0">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Shops</h1>
            <p className="a-mute mt-1 text-[14.5px]">Parts, sails and gear from radio sailing suppliers</p>
          </div>
          {isSuperAdmin && (
            <button className="a-btn a-btn-q" style={{ height: 42, borderRadius: 13 }} onClick={() => navigate('/shops-management')}>
              <Settings2 size={16} />Manage shops
            </button>
          )}
        </div>

        {loading ? (
          <>
            <div className="a-card animate-pulse" style={{ height: 280, borderRadius: 26 }} />
            <div className="a-sh-grid">{[0, 1, 2, 3].map(i => <div key={i} className="a-card animate-pulse" style={{ height: 300, borderRadius: 22 }} />)}</div>
          </>
        ) : failed ? (
          <div className="a-card a-empty text-center" style={{ padding: 48 }}>
            <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Store size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">Shops couldn’t load</h3>
            <p className="a-dim text-[13.5px]">Check your connection and try again.</p>
          </div>
        ) : !suppliers.length ? (
          <div className="a-card a-empty text-center" style={{ padding: 56 }}>
            <span className="a-tile a-tile-rim mx-auto mb-3" style={{ width: 56, height: 56 }}><Store size={24} /></span>
            <h3 className="a-ink text-[17px] font-semibold mb-1">The shops are opening soon</h3>
            <p className="a-dim text-[13.5px]">Suppliers of parts, sails and gear will appear here.</p>
          </div>
        ) : (
          <>
            {browsing && featured.length > 0 && <Spotlight suppliers={featured} onOpen={setOpen} />}

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="a-sh-aisles flex-1 min-w-0" role="tablist" aria-label="Categories">
                  <button role="tab" aria-selected={aisle === 'all'} className={`a-sh-aisle ${aisle === 'all' ? 'a-sh-aisle-on' : ''}`} onClick={() => setAisle('all')}>
                    <span style={{ background: 'var(--alfie-spectrum)', color: '#fff' }}><Store size={17} /></span>All shops<em>{suppliers.length}</em>
                  </button>
                  {categories.map(c => (
                    <button key={c.id} role="tab" aria-selected={aisle === c.id} className={`a-sh-aisle ${aisle === c.id ? 'a-sh-aisle-on' : ''}`} onClick={() => setAisle(c.id)}>
                      <CategoryBadge category={c} />{c.name}<em>{countIn(c.id)}</em>
                    </button>
                  ))}
                </div>
                <label className="a-field" style={{ minWidth: 240, flex: '0 1 320px' }}>
                  <Search size={16} />
                  <input type="text" placeholder="Search suppliers, fins, sails…" value={q} onChange={e => setQ(e.target.value)} />
                  {q && <button onClick={() => setQ('')} className="a-dim flex" aria-label="Clear search"><X size={14} /></button>}
                </label>
              </div>
              {classes.length > 0 && (
                <div className="a-sh-classes" role="group" aria-label="Shop by class">
                  <span className="a-cap">Shop by class</span>
                  {classes.map(c => (
                    <button key={c} className={`a-sh-cls-chip ${cls === c ? 'on' : ''}`} aria-pressed={cls === c} onClick={() => setCls(cls === c ? '' : c)}>{c}</button>
                  ))}
                </div>
              )}
            </div>

            {!matches.length ? (
              <div className="a-card a-empty text-center" style={{ padding: 48 }}>
                <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Search size={22} /></span>
                <h3 className="a-ink text-[16px] font-semibold mb-1">No suppliers match</h3>
                <p className="a-dim text-[13.5px] mb-4">Try another class, category or search.</p>
                <button className="a-btn a-btn-q mx-auto" onClick={() => { setQ(''); setCls(''); setAisle('all'); }}>Clear filters</button>
              </div>
            ) : (
              <>
                {shelves.map(({ cat, items }) => (
                  <section key={cat.id}>
                    <div className="a-sh-sec">
                      <div className="flex items-center gap-3 min-w-0">
                        <CategoryBadge category={cat} size={40} iconSize={19} />
                        <div className="min-w-0">
                          <h2>{cat.name}</h2>
                          {cat.description && <p>{cat.description}</p>}
                        </div>
                      </div>
                      <span className="a-dim text-[13px] whitespace-nowrap">{items.length} {items.length === 1 ? 'store' : 'stores'}</span>
                    </div>
                    <div className="a-sh-grid">
                      {items.map(s => <StoreCard key={`${cat.id}-${s.id}`} supplier={s} light={light} onOpen={setOpen} />)}
                    </div>
                  </section>
                ))}
                {uncategorised.length > 0 && (
                  <section>
                    <div className="a-sh-sec"><h2>More stores</h2></div>
                    <div className="a-sh-grid">{uncategorised.map(s => <StoreCard key={s.id} supplier={s} light={light} onOpen={setOpen} />)}</div>
                  </section>
                )}
              </>
            )}

            <p className="a-dim text-[12.5px] text-center" style={{ marginTop: 8 }}>
              Suppliers are listed to help members find gear. Orders, prices and support are handled by each supplier.
            </p>
          </>
        )}
      </div>

      {open && <StorePanel supplier={open} categories={categories} light={light} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default ShopsPage;

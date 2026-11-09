import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Edit3, ExternalLink, Eye, ImagePlus, Loader2, MousePointerClick, Plus, Search, Sparkles, Star, Store, Trash2, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  SHOP_ACCENTS, SHOP_CLASSES, ShopAccent, ShopCategory, ShopCategoryInput, ShopIcon, ShopSupplier, ShopSupplierInput,
  deleteShopCategory, deleteShopSupplier, loadShops, reorderShop, saveShopCategory, saveShopSupplier, shopColor, shopDomain,
  updateShopSupplier, uploadShopImage,
} from '../../utils/shopStorage';
import { CategoryBadge, CategoryGlyph, ShopLogo, StoreCard, useAlfieLight } from '../shops/ShopParts';

const ICONS: ShopIcon[] = ['bag', 'sail', 'wrench', 'radio', 'boat', 'tag', 'battery', 'box'];
const SWATCHES = ['#0A84FF', '#2457C5', '#8A4DFF', '#FF3E9A', '#C0262D', '#E2612B', '#CA8A04', '#22B455', '#0E7490', '#334155', '#0F172A'];

const EMPTY_SUPPLIER: ShopSupplierInput = {
  name: '', tagline: '', description: '', website_url: '', logo_url: null, cover_url: null, brand_color: null,
  email: '', phone: '', location: '', ships_to: '', boat_classes: [], is_featured: false, is_active: true, sort_order: 0, categoryIds: [],
};
const EMPTY_CATEGORY: ShopCategoryInput = { name: '', description: '', icon: 'bag', accent: 'blue', sort_order: 0, is_active: true };

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

// ─── Image picker (logo / banner) ────────────────────────────────────────────

const ImagePick: React.FC<{ label: string; hint: string; value: string | null; wide?: boolean; onChange: (url: string | null) => void; kind: 'logo' | 'cover' }> = ({ label, hint, value, wide, onChange, kind }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('Choose an image file'); return; }
    setBusy(true); setErr('');
    try { onChange(await uploadShopImage(f, kind)); } catch (e: any) { setErr(e?.message || 'Upload failed'); } finally { setBusy(false); }
  };
  return (
    <div>
      <span className="a-flab">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="a-box flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ width: wide ? 150 : 72, height: 72, borderRadius: 16, background: value && !wide ? '#fff' : undefined, cursor: 'pointer' }}
          aria-label={`Upload ${label.toLowerCase()}`}
        >
          {busy ? <Loader2 size={20} className="animate-spin" /> : value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: wide ? 'cover' : 'contain', padding: wide ? 0 : 6 }} />
            : <ImagePlus size={20} className="a-dim" />}
        </button>
        <div className="min-w-0">
          <div className="flex gap-2">
            <button type="button" className="a-btn a-btn-sm a-btn-q" onClick={() => input.current?.click()} disabled={busy}>{value ? 'Replace' : 'Upload'}</button>
            {value && <button type="button" className="a-btn a-btn-sm a-btn-q" onClick={() => onChange(null)}>Remove</button>}
          </div>
          <div className="a-dim text-[12px] mt-1.5">{err || hint}</div>
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
};

// ─── Supplier editor ─────────────────────────────────────────────────────────

const SupplierEditor: React.FC<{
  initial: ShopSupplierInput; categories: ShopCategory[]; light: boolean; userId?: string;
  onClose: () => void; onSaved: () => void;
}> = ({ initial, categories, light, userId, onClose, onSaved }) => {
  const [f, setF] = useState<ShopSupplierInput>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [customClass, setCustomClass] = useState('');
  const set = <K extends keyof ShopSupplierInput>(k: K, v: ShopSupplierInput[K]) => setF(p => ({ ...p, [k]: v }));
  const toggle = (k: 'boat_classes' | 'categoryIds', v: string) => setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }));
  const classOptions = [...new Set([...SHOP_CLASSES, ...f.boat_classes])];
  const color = f.brand_color || shopColor({ name: f.name || 'Shop', brand_color: null });

  const save = async () => {
    if (!f.name.trim()) { setErr('Give the supplier a name'); return; }
    setSaving(true); setErr('');
    try {
      await saveShopSupplier({
        ...f,
        tagline: blank(f.tagline), description: blank(f.description), website_url: blank(f.website_url),
        email: blank(f.email), phone: blank(f.phone), location: blank(f.location), ships_to: blank(f.ships_to),
      }, userId);
      onSaved();
    } catch (e: any) { setErr(e?.message || 'Could not save'); setSaving(false); }
  };

  const preview: ShopSupplier = { ...(f as any), id: f.id || 'preview', visit_count: 0, name: f.name || 'Supplier name' };

  return (
    <div className="a-dlg" onClick={onClose}>
      <div className="a-sheet" style={{ maxWidth: 1040 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={f.id ? 'Edit supplier' : 'Add supplier'}>
        <div className="a-dlg-head">
          <span className="a-tile a-tile-rim"><Store size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="a-display a-ink text-[19px] font-semibold">{f.id ? `Edit ${initial.name}` : 'Add a supplier'}</div>
            <div className="a-dim text-[13px]">Shown in Sailing › Shops and in the phone app</div>
          </div>
          <button className="a-ib" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="a-dlg-body">
          <div className="grid gap-7" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2"><span className="a-flab">Name</span><input className="a-inp" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Bergan Sails" autoFocus /></label>
                <label className="col-span-2"><span className="a-flab">Tagline</span><input className="a-inp" value={f.tagline || ''} onChange={e => set('tagline', e.target.value)} placeholder="One line, e.g. Handcrafted race sails" maxLength={80} /></label>
                <label className="col-span-2"><span className="a-flab">About</span><textarea className="a-inp" rows={4} value={f.description || ''} onChange={e => set('description', e.target.value)} placeholder="What they make or sell, and who for" /></label>
                <label><span className="a-flab">Website</span><input className="a-inp" value={f.website_url || ''} onChange={e => set('website_url', e.target.value)} placeholder="https://" inputMode="url" /></label>
                <label><span className="a-flab">Email</span><input className="a-inp" value={f.email || ''} onChange={e => set('email', e.target.value)} placeholder="orders@…" inputMode="email" /></label>
                <label><span className="a-flab">Phone</span><input className="a-inp" value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="Optional" inputMode="tel" /></label>
                <label><span className="a-flab">Based in</span><input className="a-inp" value={f.location || ''} onChange={e => set('location', e.target.value)} placeholder="e.g. Lake Macquarie, NSW" /></label>
                <label className="col-span-2"><span className="a-flab">Ships to</span><input className="a-inp" value={f.ships_to || ''} onChange={e => set('ships_to', e.target.value)} placeholder="e.g. Australia-wide & NZ" /></label>
              </div>

              <div>
                <span className="a-flab">Categories</span>
                {categories.length ? (
                  <div className="flex flex-wrap gap-2">
                    {categories.map(c => {
                      const on = f.categoryIds.includes(c.id);
                      return (
                        <button key={c.id} type="button" onClick={() => toggle('categoryIds', c.id)} className={`a-lb-fmt ${on ? '' : 'opacity-60'}`} aria-pressed={on}
                          style={{ height: 34, paddingLeft: 5, gap: 8, cursor: 'pointer', outline: on ? '2px solid #0A84FF' : 'none', outlineOffset: 1 }}>
                          <CategoryBadge category={c} size={24} iconSize={13} />{c.name}
                        </button>
                      );
                    })}
                  </div>
                ) : <div className="a-dim text-[13px]">Add a category first (Categories tab).</div>}
              </div>

              <div>
                <span className="a-flab">Classes they cater for</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {classOptions.map(c => (
                    <button key={c} type="button" className={`a-sh-cls-chip ${f.boat_classes.includes(c) ? 'on' : ''}`} aria-pressed={f.boat_classes.includes(c)} onClick={() => toggle('boat_classes', c)}>{c}</button>
                  ))}
                  <input className="a-inp" style={{ height: 32, width: 120, fontSize: 13, borderRadius: 10 }} placeholder="+ Other" value={customClass}
                    onChange={e => setCustomClass(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && customClass.trim()) { e.preventDefault(); if (!f.boat_classes.includes(customClass.trim())) toggle('boat_classes', customClass.trim()); setCustomClass(''); } }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ImagePick label="Logo" kind="logo" hint="Square works best. PNG or SVG on white." value={f.logo_url} onChange={v => set('logo_url', v)} />
                <ImagePick label="Banner image" kind="cover" wide hint="Optional. Wide photo of their gear." value={f.cover_url} onChange={v => set('cover_url', v)} />
              </div>

              <div>
                <span className="a-flab">Brand colour <span className="a-dim font-normal">· used for the banner when there's no image</span></span>
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map(c => (
                    <button key={c} type="button" onClick={() => set('brand_color', c)} aria-label={c}
                      style={{ width: 28, height: 28, borderRadius: 9, background: c, border: 0, cursor: 'pointer', boxShadow: color.toLowerCase() === c.toLowerCase() ? '0 0 0 2px #111622, 0 0 0 4px #fff' : 'inset 0 0 0 1px rgba(255,255,255,.15)' }} />
                  ))}
                  <label className="a-btn a-btn-sm a-btn-q" style={{ cursor: 'pointer' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: color, display: 'inline-block' }} />Custom
                    <input type="color" value={color} onChange={e => set('brand_color', e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} />
                  </label>
                  {f.brand_color && <button type="button" className="a-btn a-btn-sm a-btn-q" onClick={() => set('brand_color', null)}>Auto</button>}
                </div>
              </div>

              <div className="a-box flex flex-col" style={{ padding: '4px 14px' }}>
                <div className="flex items-center gap-3 py-3">
                  <Sparkles size={17} className="a-dim" />
                  <div className="flex-1"><div className="a-ink text-[14px] font-semibold">Featured</div><div className="a-dim text-[12.5px]">Shown in the Spotlight at the top of Shops</div></div>
                  <button type="button" className="a-sw" role="switch" aria-checked={f.is_featured} aria-label="Featured" onClick={() => set('is_featured', !f.is_featured)} />
                </div>
                <div className="flex items-center gap-3 py-3" style={{ borderTop: '1px solid rgba(127,127,127,.12)' }}>
                  <Eye size={17} className="a-dim" />
                  <div className="flex-1"><div className="a-ink text-[14px] font-semibold">Visible to members</div><div className="a-dim text-[12.5px]">Turn off to hide without deleting</div></div>
                  <button type="button" className="a-sw" role="switch" aria-checked={f.is_active} aria-label="Visible" onClick={() => set('is_active', !f.is_active)} />
                </div>
              </div>
            </div>

            <div>
              <div className="sticky top-0">
                <div className="a-cap mb-2">Live preview</div>
                <div style={{ pointerEvents: 'none' }}><StoreCard supplier={preview} light={light} onOpen={() => {}} /></div>
              </div>
            </div>
          </div>
        </div>
        <div className="a-dlg-foot">
          {err && <span className="a-txt-r text-[13px] mr-auto self-center">{err}</span>}
          <button className="a-btn a-btn-q" onClick={onClose}>Cancel</button>
          <button className="a-btn a-btn-p" onClick={save} disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" />}{f.id ? 'Save changes' : 'Add supplier'}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Category editor ─────────────────────────────────────────────────────────

const CategoryEditor: React.FC<{ initial: ShopCategoryInput; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState<ShopCategoryInput>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!f.name.trim()) { setErr('Give the category a name'); return; }
    setSaving(true); setErr('');
    try { await saveShopCategory({ ...f, description: blank(f.description) }); onSaved(); } catch (e: any) { setErr(e?.message || 'Could not save'); setSaving(false); }
  };
  const preview = { ...(f as any), id: 'p' } as ShopCategory;
  return (
    <div className="a-dlg" onClick={onClose}>
      <div className="a-sheet" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Category">
        <div className="a-dlg-head">
          <CategoryBadge category={preview} size={40} iconSize={19} />
          <div className="flex-1 a-display a-ink text-[19px] font-semibold">{f.id ? 'Edit category' : 'New category'}</div>
          <button className="a-ib" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="a-dlg-body flex flex-col gap-4">
          <label><span className="a-flab">Name</span><input className="a-inp" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Electronics" autoFocus /></label>
          <label><span className="a-flab">Short description</span><input className="a-inp" value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} placeholder="e.g. Servos, winches, receivers and batteries" /></label>
          <div>
            <span className="a-flab">Icon</span>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(ic => (
                <button key={ic} type="button" className={`a-ib ${f.icon === ic ? 'a-ib-on' : ''}`} style={{ width: 42, height: 42 }} onClick={() => setF({ ...f, icon: ic })} aria-label={ic} aria-pressed={f.icon === ic}>
                  <CategoryGlyph icon={ic} size={18} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="a-flab">Colour</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SHOP_ACCENTS) as ShopAccent[]).map(a => (
                <button key={a} type="button" onClick={() => setF({ ...f, accent: a })} aria-label={SHOP_ACCENTS[a].label} aria-pressed={f.accent === a}
                  style={{ width: 34, height: 34, borderRadius: 11, border: 0, cursor: 'pointer', background: SHOP_ACCENTS[a].fg, boxShadow: f.accent === a ? '0 0 0 2px #111622, 0 0 0 4px #fff' : 'none' }} />
              ))}
            </div>
          </div>
          <div className="a-box flex items-center gap-3" style={{ padding: '12px 14px' }}>
            <div className="flex-1"><div className="a-ink text-[14px] font-semibold">Visible to members</div><div className="a-dim text-[12.5px]">Hidden categories don't show as an aisle</div></div>
            <button type="button" className="a-sw" role="switch" aria-checked={f.is_active} aria-label="Visible" onClick={() => setF({ ...f, is_active: !f.is_active })} />
          </div>
        </div>
        <div className="a-dlg-foot">
          {err && <span className="a-txt-r text-[13px] mr-auto self-center">{err}</span>}
          <button className="a-btn a-btn-q" onClick={onClose}>Cancel</button>
          <button className="a-btn a-btn-p" onClick={save} disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" />}{f.id ? 'Save' : 'Add category'}</button>
        </div>
      </div>
    </div>
  );
};

const Confirm: React.FC<{ title: string; body: string; onCancel: () => void; onConfirm: () => void; busy: boolean }> = ({ title, body, onCancel, onConfirm, busy }) => (
  <div className="a-confirm a-dlg" onClick={onCancel}>
    <div className="a-sheet" style={{ maxWidth: 440, padding: 24 }} onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true">
      <div className="a-display a-ink text-[18px] font-semibold">{title}</div>
      <p className="a-mute text-[14px] mt-2">{body}</p>
      <div className="flex justify-end gap-2 mt-5">
        <button className="a-btn a-btn-q" onClick={onCancel}>Cancel</button>
        <button className="a-btn a-btn-d" onClick={onConfirm} disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}Delete</button>
      </div>
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: number | string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="a-card flex items-center gap-3" style={{ padding: '14px 16px' }}>
    <span className="a-tile">{icon}</span>
    <div><div className="a-display a-num a-ink text-[22px] font-semibold leading-none">{value}</div><div className="a-dim text-[12.5px] mt-1">{label}</div></div>
  </div>
);

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function ShopsManagementTab({ darkMode: _darkMode }: { darkMode?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const light = useAlfieLight();
  const [view, setView] = useState<'suppliers' | 'categories'>('suppliers');
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState<ShopSupplierInput | null>(null);
  const [editingCat, setEditingCat] = useState<ShopCategoryInput | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'supplier' | 'category'; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const d = await loadShops();
      setCategories(d.categories); setSuppliers(d.suppliers); setError('');
    } catch (e: any) {
      setError(/shop_/.test(e?.message || '') ? 'The Shops tables haven’t been created in this database yet.' : (e?.message || 'Could not load shops'));
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return suppliers.filter(s => (!catFilter || s.categoryIds.includes(catFilter)) && (!t || [s.name, s.tagline, s.website_url].some(v => (v || '').toLowerCase().includes(t))));
  }, [suppliers, q, catFilter]);
  const canReorder = !q.trim() && !catFilter;

  const move = async (table: 'shop_suppliers' | 'shop_categories', list: { id: string }[], idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map(x => x.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    if (table === 'shop_suppliers') setSuppliers(ids.map(id => suppliers.find(s => s.id === id)!));
    else setCategories(ids.map(id => categories.find(c => c.id === id)!));
    await reorderShop(table, ids).catch(e => setError(e?.message || 'Could not reorder'));
  };

  const quick = async (s: ShopSupplier, fields: Partial<ShopSupplier>) => {
    setSuppliers(list => list.map(x => (x.id === s.id ? { ...x, ...fields } : x)));
    await updateShopSupplier(s.id, fields as any).catch(e => { setError(e?.message || 'Could not update'); refresh(); });
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'supplier') await deleteShopSupplier(confirm.id); else await deleteShopCategory(confirm.id);
      setConfirm(null); await refresh();
    } catch (e: any) { setError(e?.message || 'Could not delete'); } finally { setBusy(false); }
  };

  const visits = suppliers.reduce((t, s) => t + (s.visit_count || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Store size={24} /></span>
        <div className="flex-1 min-w-0">
          <h1 className="a-display a-ink m-0 text-[28px] font-bold leading-[1.1]">Shops</h1>
          <p className="a-mute mt-1 text-[14px]">Suppliers members see in Sailing › Shops and the phone app</p>
        </div>
        <button className="a-btn a-btn-q" style={{ height: 42 }} onClick={() => navigate('/shops')}><Eye size={16} />Preview</button>
        {view === 'suppliers'
          ? <button className="a-btn a-btn-p" style={{ height: 42 }} onClick={() => setEditing({ ...EMPTY_SUPPLIER, categoryIds: catFilter ? [catFilter] : [], sort_order: suppliers.length + 1 })}><Plus size={17} />Add supplier</button>
          : <button className="a-btn a-btn-p" style={{ height: 42 }} onClick={() => setEditingCat({ ...EMPTY_CATEGORY, sort_order: categories.length + 1 })}><Plus size={17} />Add category</button>}
      </div>

      {error && <div className="a-box a-box-bad a-txt-r text-[13.5px]" style={{ padding: '10px 14px' }}>{error}</div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat label="Suppliers" value={suppliers.length} icon={<Store size={18} />} />
        <Stat label="Visible" value={suppliers.filter(s => s.is_active).length} icon={<Eye size={18} />} />
        <Stat label="Featured" value={suppliers.filter(s => s.is_featured).length} icon={<Sparkles size={18} />} />
        <Stat label="Store visits" value={visits} icon={<MousePointerClick size={18} />} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="a-seg" role="tablist">
          <button role="tab" aria-selected={view === 'suppliers'} className={`a-seg-i ${view === 'suppliers' ? 'a-seg-on' : ''}`} onClick={() => setView('suppliers')}>Suppliers<span className="a-cnt">{suppliers.length}</span></button>
          <button role="tab" aria-selected={view === 'categories'} className={`a-seg-i ${view === 'categories' ? 'a-seg-on' : ''}`} onClick={() => setView('categories')}>Categories<span className="a-cnt">{categories.length}</span></button>
        </div>
        {view === 'suppliers' && (
          <>
            <label className="a-field flex-1 min-w-[220px]"><Search size={16} /><input placeholder="Search suppliers" value={q} onChange={e => setQ(e.target.value)} />{q && <button className="a-dim flex" onClick={() => setQ('')} aria-label="Clear"><X size={14} /></button>}</label>
            <select className="a-inp a-inp-sel" style={{ height: 42, width: 'auto', minWidth: 190 }} value={catFilter} onChange={e => setCatFilter(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
      </div>

      {loading ? (
        <div className="a-card flex items-center justify-center gap-2 a-dim" style={{ padding: 48 }}><Loader2 size={18} className="animate-spin" />Loading shops…</div>
      ) : view === 'suppliers' ? (
        shown.length === 0 ? (
          <div className="a-card a-empty text-center" style={{ padding: 48 }}>
            <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Store size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">{suppliers.length ? 'No suppliers match' : 'No suppliers yet'}</h3>
            <p className="a-dim text-[13.5px]">{suppliers.length ? 'Try another search or category.' : 'Add the first supplier members will see.'}</p>
          </div>
        ) : (
          <div className="a-card overflow-hidden">
            {shown.map((s, i) => (
              <div key={s.id} className="a-rr" style={{ padding: '12px 16px', opacity: s.is_active ? 1 : 0.55 }}>
                {canReorder && (
                  <div className="flex flex-col gap-0.5">
                    <button className="a-ib" style={{ width: 26, height: 22 }} onClick={() => move('shop_suppliers', shown, i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={13} /></button>
                    <button className="a-ib" style={{ width: 26, height: 22 }} onClick={() => move('shop_suppliers', shown, i, 1)} disabled={i === shown.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
                  </div>
                )}
                <ShopLogo supplier={s} className="a-sh-logo a-sh-logo-sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="a-ink text-[15px] font-semibold truncate">{s.name}</span>
                    {!s.is_active && <span className="a-lb-cls">Hidden</span>}
                  </div>
                  <div className="a-dim text-[12.5px] truncate flex items-center gap-1.5">
                    {s.website_url ? <><ExternalLink size={12} />{shopDomain(s.website_url)}</> : s.email || 'No website'}
                  </div>
                </div>
                <div className="hidden lg:flex gap-1.5 flex-wrap justify-end" style={{ maxWidth: 260 }}>
                  {categories.filter(c => s.categoryIds.includes(c.id)).map(c => (
                    <span key={c.id} className="a-lb-fmt" style={{ height: 24, gap: 6, paddingLeft: 3, fontSize: 12 }}><CategoryBadge category={c} size={18} iconSize={11} />{c.name}</span>
                  ))}
                </div>
                <span className="a-dim text-[12.5px] whitespace-nowrap hidden md:inline" title="Visit store taps" style={{ width: 70, textAlign: 'right' }}>{s.visit_count} visits</span>
                <button className={`a-ib ${s.is_featured ? 'a-ib-on' : ''}`} title={s.is_featured ? 'Featured — click to unfeature' : 'Feature in Spotlight'} aria-pressed={s.is_featured} onClick={() => quick(s, { is_featured: !s.is_featured })}>
                  <Star size={16} fill={s.is_featured ? 'currentColor' : 'none'} />
                </button>
                <button className="a-sw" role="switch" aria-checked={s.is_active} aria-label={`${s.name} visible`} title="Visible to members" onClick={() => quick(s, { is_active: !s.is_active })} />
                <button className="a-ib" title="Edit" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ ...s })}><Edit3 size={16} /></button>
                <button className="a-ib a-ib-d" title="Delete" aria-label={`Delete ${s.name}`} onClick={() => setConfirm({ kind: 'supplier', id: s.id, name: s.name })}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )
      ) : categories.length === 0 ? (
        <div className="a-card a-empty text-center" style={{ padding: 48 }}>
          <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Store size={22} /></span>
          <h3 className="a-ink text-[16px] font-semibold mb-1">No categories yet</h3>
          <p className="a-dim text-[13.5px]">Categories are the aisles members browse, e.g. Sails, Parts & Accessories.</p>
        </div>
      ) : (
        <div className="a-card overflow-hidden">
          {categories.map((c, i) => {
            const count = suppliers.filter(s => s.categoryIds.includes(c.id)).length;
            return (
              <div key={c.id} className="a-rr" style={{ padding: '12px 16px', opacity: c.is_active ? 1 : 0.55 }}>
                <div className="flex flex-col gap-0.5">
                  <button className="a-ib" style={{ width: 26, height: 22 }} onClick={() => move('shop_categories', categories, i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={13} /></button>
                  <button className="a-ib" style={{ width: 26, height: 22 }} onClick={() => move('shop_categories', categories, i, 1)} disabled={i === categories.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
                </div>
                <CategoryBadge category={c} size={42} iconSize={20} />
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-[15px] font-semibold">{c.name}</div>
                  <div className="a-dim text-[12.5px] truncate">{c.description || 'No description'}</div>
                </div>
                <span className="a-dim text-[12.5px] whitespace-nowrap">{count} {count === 1 ? 'supplier' : 'suppliers'}</span>
                <button className="a-sw" role="switch" aria-checked={c.is_active} aria-label={`${c.name} visible`}
                  onClick={async () => { setCategories(l => l.map(x => (x.id === c.id ? { ...x, is_active: !x.is_active } : x))); await saveShopCategory({ ...c, is_active: !c.is_active }).catch(() => refresh()); }} />
                <button className="a-ib" title="Edit" aria-label={`Edit ${c.name}`} onClick={() => setEditingCat({ ...c })}><Edit3 size={16} /></button>
                <button className="a-ib a-ib-d" title="Delete" aria-label={`Delete ${c.name}`} onClick={() => setConfirm({ kind: 'category', id: c.id, name: c.name })}><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <SupplierEditor initial={editing} categories={categories} light={light} userId={user?.id}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
      {editingCat && <CategoryEditor initial={editingCat} onClose={() => setEditingCat(null)} onSaved={() => { setEditingCat(null); refresh(); }} />}
      {confirm && (
        <Confirm
          title={`Delete ${confirm.name}?`}
          body={confirm.kind === 'supplier'
            ? 'They’ll be removed from Shops for everyone. To hide them for now instead, turn off Visible.'
            : 'The category is removed. Its suppliers stay, but no longer appear under this aisle.'}
          busy={busy} onCancel={() => setConfirm(null)} onConfirm={doDelete} />
      )}
    </div>
  );
}

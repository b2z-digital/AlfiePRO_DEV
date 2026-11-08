import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { createClassified } from '../../utils/classifiedStorage';
import { CLASSIFIED_CATEGORIES, CLASSIFIED_CONDITIONS } from '../../types/classified';
import { useMobile } from '../MobileContext';
import { Icon, AlfieSails } from '../icons';
import { Avatar, Skeleton } from '../ui';
import { timeAgo } from '../data';
import { PageHeader } from './Club';
import { askAlfie } from '../ask';
import { Classified, loadClassified, loadClassifieds, money, sellerName, sellerUserId, toggleFavourite } from '../club';

const FALLBACKS = [
  'linear-gradient(140deg,#0A3D7A,#2A93FF 60%,#CDEBFF)',
  'linear-gradient(140deg,#3B1C6E,#8A4DFF 60%,#E7D9FF)',
  'linear-gradient(140deg,#5A2A10,#FF8A2B 60%,#FFE1C2)',
  'linear-gradient(140deg,#0E4A3A,#34C759 60%,#D4F7DF)',
];
const imgBg = (c: Classified, i: number) => (c.images?.[0] ? `url("${c.images[0]}")` : FALLBACKS[i % FALLBACKS.length]);
const priceLabel = (c: Classified) => (Number(c.price) > 0 ? money(c.price) : 'POA');
const catLabel = (v: string) => CLASSIFIED_CATEGORIES.find(c => c.value === v)?.label.split(' ')[0] || v;
const condLabel = (v: string) => CLASSIFIED_CONDITIONS.find(c => c.value === v)?.label || v;

const Heart: React.FC<{ on: boolean; onClick: (e: React.MouseEvent) => void }> = ({ on, onClick }) => (
  <span role="button" tabIndex={0} className="m-heart" aria-label={on ? 'Remove from saved' : 'Save'} aria-pressed={on} onClick={onClick}
    onKeyDown={e => { if (e.key === 'Enter') onClick(e as any); }} style={on ? { color: '#FF7DB8' } : undefined}>
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
  </span>
);

/* ─────────────── Browse ─────────────── */

export const ClassifiedsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentClub } = useAuth();
  const { toast, tap } = useMobile();
  const [items, setItems] = useState<Classified[] | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [selling, setSelling] = useState(false);

  const load = React.useCallback(() => {
    loadClassifieds(currentClub?.clubId, user?.id).then(r => { setItems(r.items); setFavs(r.favourites); }).catch(() => setItems([]));
  }, [currentClub?.clubId, user?.id]);
  useEffect(() => { load(); }, [load]);

  const chips = useMemo(() => {
    const classes = [...new Set((items || []).map(c => c.boat_class).filter(Boolean))] as string[];
    const cats = [...new Set((items || []).map(c => c.category).filter(c => c && c !== 'yachts'))] as string[];
    return [...classes.sort().map(c => ({ id: `class:${c}`, label: c })), ...cats.map(c => ({ id: `cat:${c}`, label: catLabel(c) })), { id: 'saved', label: 'Saved' }];
  }, [items]);

  const shown = (items || []).filter(c => {
    if (filter.startsWith('class:') && c.boat_class !== filter.slice(6)) return false;
    if (filter.startsWith('cat:') && c.category !== filter.slice(4)) return false;
    if (filter === 'saved' && !favs.has(c.id)) return false;
    if (q) {
      const t = `${c.title} ${c.description} ${c.boat_class || ''} ${c.location}`.toLowerCase();
      if (!t.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const heart = async (e: React.MouseEvent, c: Classified) => {
    e.stopPropagation();
    if (!user?.id) return;
    const on = !favs.has(c.id);
    setFavs(s => { const n = new Set(s); if (on) n.add(c.id); else n.delete(c.id); return n; });
    tap(on ? 'success' : 'light');
    try { await toggleFavourite(c.id, user.id); } catch { toast("Couldn't save that. Try again."); load(); }
  };

  return (
    <div className="m-stack">
      <PageHeader title="Classifieds" right={<button className="m-pill-btn" onClick={() => setSelling(true)}><Icon name="camera" size={17} />Sell</button>} />
      <label className="m-search">
        <Icon name="search" size={17} />
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Search classifieds</span>
        <input placeholder="Search boats, rigs and parts" value={q} onChange={e => setQ(e.target.value)} />
      </label>
      <div className="m-chips">
        <button className={`m-chip ${filter === 'all' ? 'm-chip-on' : ''}`} onClick={() => setFilter('all')}>All</button>
        {chips.map(c => <button key={c.id} className={`m-chip ${filter === c.id ? 'm-chip-on' : ''}`} onClick={() => setFilter(c.id)}>{c.label}</button>)}
      </div>
      {items === null ? (
        <div className="m-cl-grid">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={200} />)}</div>
      ) : shown.length === 0 ? (
        <div className="m-card m-empty">{filter === 'saved' ? 'Tap the heart on a listing to save it here.' : 'Nothing listed here yet.'}</div>
      ) : (
        <div className="m-cl-grid">
          {shown.map((c, i) => (
            <button key={c.id} className="m-it" onClick={() => navigate(`/classifieds/${c.id}`)}>
              <span className="m-it-img" style={{ backgroundImage: imgBg(c, i) }}><Heart on={favs.has(c.id)} onClick={e => heart(e, c)} /></span>
              <span className="m-price">{priceLabel(c)}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>{c.title}</span>
              <span className="m-dim" style={{ fontSize: 12 }}>{[c.location, timeAgo(c.created_at)].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
      {selling && <SellSheet onClose={() => setSelling(false)} onDone={id => { setSelling(false); load(); navigate(`/classifieds/${id}`); }} />}
    </div>
  );
};

/* ─────────────── Sell: photo first, the rest in one sheet ─────────────── */

const SellSheet: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const { user, currentClub } = useAuth();
  const { myClasses, toast, tap } = useMobile();
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: '', price: '', boat_class: myClasses[0] || '', category: 'yachts', condition: 'used', location: '', description: '', is_public: true });
  const camRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: any) => setF(x => ({ ...x, [k]: v }));

  // Same upload path as the desktop form (media bucket, user folder, compressed)
  const upload = async (files: File[]) => {
    if (!files.length || !user?.id) return;
    setUploading(true);
    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const urls: string[] = [];
      for (const file of files) {
        const c = await compressImage(file, 'photo');
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${c.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('media').upload(path, c);
        if (error) continue;
        urls.push(supabase.storage.from('media').getPublicUrl(path).data.publicUrl);
      }
      setImages(i => [...i, ...urls]);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!user?.id || !f.title.trim()) return;
    setBusy(true);
    try {
      const created = await createClassified({
        title: f.title.trim(), description: f.description.trim(), price: Number(f.price) || 0, location: f.location.trim(),
        category: f.category, condition: f.condition, images, contact_email: user.email || '', club_id: currentClub?.clubId,
        is_public: f.is_public, boat_class: f.boat_class || undefined,
      }, user.id);
      tap('success');
      toast('Your listing is live');
      onDone(created.id);
    } catch {
      toast("Couldn't list that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = { width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--m-fill-b)', background: 'var(--m-fill)', color: 'var(--m-ink)', padding: '0 12px', font: 'inherit', fontSize: 15 };
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Sell something">
        <span className="m-grab" />
        <div className="m-row" style={{ marginBottom: 12 }}>
          <div className="m-disp" style={{ flex: 1, fontSize: 21, fontWeight: 700 }}>Sell something</div>
          <button className="m-ibtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <input ref={camRef} type="file" accept="image/*" multiple hidden onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <div className="m-g" style={{ marginBottom: 12 }}>
          {images.map((u, i) => <span key={u} style={{ backgroundImage: `url("${u}")` }}><span role="button" tabIndex={0} className="m-heart" aria-label="Remove photo" onClick={() => setImages(x => x.filter((_, j) => j !== i))}><Icon name="close" size={16} /></span></span>)}
          <button onClick={() => camRef.current?.click()} style={{ background: 'var(--m-fill)', border: '1px dashed var(--m-fill-b)', color: 'var(--m-mut)', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
            <Icon name="camera" size={24} />{uploading ? 'Uploading…' : images.length ? 'Add more' : 'Add photos'}
          </button>
        </div>
        <div className="m-stack" style={{ gap: 10 }}>
          <label><span className="m-lb m-dim">Title</span><input style={field} value={f.title} onChange={e => set('title', e.target.value)} placeholder="DF95 hull, A and B rigs" /></label>
          <div className="m-row" style={{ gap: 10 }}>
            <label style={{ flex: 1 }}><span className="m-lb m-dim">Price (AUD)</span><input style={field} inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0 for POA" /></label>
            <label style={{ flex: 1 }}><span className="m-lb m-dim">Class</span><input style={field} value={f.boat_class} onChange={e => set('boat_class', e.target.value)} placeholder="DF65" /></label>
          </div>
          <div className="m-row" style={{ gap: 10 }}>
            <label style={{ flex: 1 }}><span className="m-lb m-dim">Category</span>
              <select style={field} value={f.category} onChange={e => set('category', e.target.value)}>{CLASSIFIED_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
            </label>
            <label style={{ flex: 1 }}><span className="m-lb m-dim">Condition</span>
              <select style={field} value={f.condition} onChange={e => set('condition', e.target.value)}>{CLASSIFIED_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
            </label>
          </div>
          <label><span className="m-lb m-dim">Location</span><input style={field} value={f.location} onChange={e => set('location', e.target.value)} placeholder="Suburb" /></label>
          <label><span className="m-lb m-dim">Description</span><textarea className="m-textarea" style={{ ...field, height: 110, padding: 12 }} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Age, what's included, any repairs" /></label>
          <label className="m-row" style={{ gap: 10, fontSize: 14.5 }}>
            <input type="checkbox" checked={f.is_public} onChange={e => set('is_public', e.target.checked)} style={{ width: 20, height: 20, accentColor: '#0A84FF' }} />
            Show to sailors at other clubs too
          </label>
          <button className="m-btn m-btn-p" style={{ width: '100%' }} disabled={busy || uploading || !f.title.trim()} onClick={save}>{busy ? 'Listing…' : 'List it'}</button>
        </div>
      </div>
    </>
  );
};

/* ─────────────── Listing ─────────────── */

export const ListingScreen: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { light } = useMobile();
  const [c, setC] = useState<Classified | null | undefined>(undefined);
  const [slide, setSlide] = useState(0);
  useEffect(() => { loadClassified(id).then(setC).catch(() => setC(null)); }, [id]);

  if (c === undefined) return <div className="m-stack"><Skeleton h={330} /><Skeleton h={200} /></div>;
  if (c === null) return <div className="m-stack"><PageHeader title="Listing" /><div className="m-card m-empty">This listing has been removed.</div></div>;

  const seller = sellerName(c);
  const sellerId = sellerUserId(c);
  const mine = sellerId && sellerId === user?.id;
  const images = c.images?.length ? c.images : [];
  const share = async () => {
    const url = `https://alfiepro.com.au/classifieds/${c.id}`;
    try { if (navigator.share) await navigator.share({ title: c.title, text: `${c.title} · ${priceLabel(c)}`, url }); } catch { /* dismissed */ }
  };
  const message = () => {
    if (!sellerId) return;
    const draft = encodeURIComponent(`Hi ${seller.split(' ')[0]}, is your ${c.title} still available?`);
    navigate(`/comms/chat/${sellerId}?draft=${draft}`);
  };
  const contactEmail = c.external_contact_email || c.contact_email;
  const contactPhone = c.external_contact_phone || c.contact_phone;

  return (
    <div className="m-stack" style={{ paddingBottom: 84 }}>
      <div className="m-hero-img" style={{ background: images.length ? '#10233F' : FALLBACKS[0] }}>
        {images.length > 0 && (
          <div className="m-swipe" onScroll={e => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
            {images.map(u => <span key={u} style={{ backgroundImage: `url("${u}")` }} />)}
          </div>
        )}
        <div className="m-top">
          <button className="m-ibtn m-ibtn-d" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/classifieds'))}><Icon name="back" /></button>
          <button className="m-ibtn m-ibtn-d" aria-label="Share" onClick={share}><Icon name="share" /></button>
        </div>
        {images.length > 1 && <div className="m-dots">{images.map((u, i) => <span key={u} className={i === slide ? 'm-on' : ''} />)}</div>}
      </div>
      <div className="m-price" style={{ fontSize: 30, marginTop: 4 }}>{priceLabel(c)}</div>
      <div style={{ fontWeight: 700, fontSize: 19, marginTop: -6 }}>{c.title}</div>
      <div className="m-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {c.boat_class && <span className="m-chip" style={{ height: 28, fontSize: 12.5 }}>{c.boat_class}</span>}
        {c.condition && <span className="m-chip" style={{ height: 28, fontSize: 12.5 }}>{condLabel(c.condition)}</span>}
        {c.location && <span className="m-chip" style={{ height: 28, fontSize: 12.5 }}>{c.location}</span>}
      </div>
      <div className="m-card">
      <button className="m-li" onClick={() => sellerId && navigate(`/skipper/${sellerId}`)} disabled={!sellerId}>
        <Avatar name={seller} url={c.user?.avatar_url || c.matched_member?.avatar_url} size={42} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{seller}</span>
          <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{c.club?.name || c.matched_member?.club_name || ''}{c.created_at ? ` · listed ${timeAgo(c.created_at)}` : ''}</span>
        </span>
      </button>
      </div>
      {c.description && <p className="m-mut" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.description}</p>}
      {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>View the original listing</a>}
      <div className="m-bar">
        <button className="m-btn m-btn-g" style={{ width: 56, padding: 0 }} aria-label="Ask Alfie about this listing"
          onClick={() => askAlfie(`Is ${priceLabel(c)} a fair price for a ${c.title}${c.condition ? ` in ${condLabel(c.condition).toLowerCase()} condition` : ''}?`)}>
          <span className="m-av" style={{ width: 26, height: 26, padding: 2, background: 'conic-gradient(from 200deg,#2E7BFF,#8A4DFF,#FF3E9A,#FF8A2B,#2E7BFF)' }}>
            <span className="m-av" style={{ width: '100%', height: '100%', background: light ? '#fff' : '#0B1222' }}><AlfieSails size={13} light={light} /></span>
          </span>
        </button>
        {mine ? (
          <button className="m-btn m-btn-g" style={{ flex: 1 }} disabled>This is your listing</button>
        ) : sellerId ? (
          <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={message}><Icon name="chat" />Message seller</button>
        ) : contactPhone ? (
          <a className="m-btn m-btn-p" style={{ flex: 1 }} href={`tel:${contactPhone}`}><Icon name="phone" />Call seller</a>
        ) : contactEmail ? (
          <a className="m-btn m-btn-p" style={{ flex: 1 }} href={`mailto:${contactEmail}?subject=${encodeURIComponent(c.title)}`}><Icon name="mail" />Email seller</a>
        ) : null}
      </div>
    </div>
  );
};

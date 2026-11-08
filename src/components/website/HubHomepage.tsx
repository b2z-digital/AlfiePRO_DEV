import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRight, ChevronLeft, ChevronRight, EyeOff, Eye, GripVertical, Image as ImageIcon, Info, LayoutGrid, Layers, Loader2, Monitor, Pencil, Plus, Smartphone, Trash2, Upload, X, Newspaper, Map as MapIcon, House, Trophy } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAlfieLight } from '../alfie/Kit';
import { MediaLibraryModal } from '../MediaLibraryModal';
import { HomepageTileModal } from '../pages/HomepageTileModal';
import { AUTO_PAGES, HOME_SECTIONS, HomeSectionId, resolveHomeSections, themeVars, hasTheme } from '../../utils/publicSite';
import { useHub } from './hubData';

interface Slide {
  id?: string;
  title: string;
  subtitle: string;
  image_url: string;
  button_text: string;
  button_url: string;
  display_order: number;
  is_active: boolean;
  label?: string | null;
  show_from?: string | null;
  show_until?: string | null;
}

interface Tile { id: string; title: string; description: string; image_url: string; link_url: string; display_order: number; is_active: boolean }

const EMPTY_SLIDE: Slide = { title: '', subtitle: '', image_url: '', button_text: '', button_url: '', display_order: 0, is_active: true, label: '', show_from: null, show_until: null };

const SECTION_ICON: Record<HomeSectionId, React.ReactNode> = {
  hero: <ImageIcon size={16} />, welcome: <House size={16} />, tiles: <LayoutGrid size={16} />, events: <Trophy size={16} />, news: <Newspaper size={16} />, map: <MapIcon size={16} />,
};

const SlideCard: React.FC<{ s: Slide; i: number; sel: boolean; onClick: () => void }> = ({ s, i, sel, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id! });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <div className={`wh-sl${sel ? ' sel' : ''}${s.is_active ? '' : ' hid'}`} onClick={onClick} role="button" tabIndex={0} aria-label={`Edit slide ${i + 1}`} onKeyDown={e => { if (e.key === 'Enter') onClick(); }}>
        {s.image_url && <img src={s.image_url} alt="" />}
        <span className="no">{i + 1}</span>
        {!s.is_active && <span className="hb"><EyeOff size={12} />Hidden</span>}
        <span className="gp" {...attributes} {...listeners} aria-label="Drag to reorder" onClick={e => e.stopPropagation()}><GripVertical size={15} /></span>
        <b>{s.title || s.label || 'Untitled slide'}</b>
      </div>
    </div>
  );
};

const SectionRow: React.FC<{ id: HomeSectionId; on: boolean; onToggle: () => void }> = ({ id, on, onToggle }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const meta = HOME_SECTIONS.find(s => s.id === id)!;
  const here = id === 'hero' || id === 'tiles';
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`wh-sec${on ? '' : ' off'}`}>
      <button className="g" aria-label={`Drag ${meta.label}`} {...attributes} {...listeners}><GripVertical size={16} /></button>
      <span className="a-tile a-tile-sm">{SECTION_ICON[id]}</span>
      <div><div className="nm">{meta.label}</div><div className="mm">{meta.note}</div></div>
      <span className="r">
        {here ? <span className="wh-pill wh-v">Edited here</span> : <span className="wh-pill wh-auto">Auto</span>}
        <button type="button" role="switch" aria-checked={on} aria-label={`Show ${meta.label}`} className="a-sw" onClick={onToggle} />
      </span>
    </div>
  );
};

export const HubHomepage: React.FC = () => {
  const { club, pages, updateClub, log, reload } = useHub();
  const { addNotification } = useNotifications();
  const light = useAlfieLight();
  const clubId = club!.id;
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [selId, setSelId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Slide | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [pv, setPv] = useState<'desktop' | 'phone'>('desktop');
  const [tileEdit, setTileEdit] = useState<Tile | null | 'new'>(null);
  const [sections, setSections] = useState(() => resolveHomeSections(club!.website_layout));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const load = useCallback(async () => {
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('homepage_slides').select('*').eq('club_id', clubId).order('display_order'),
      supabase.from('homepage_tiles').select('*').eq('club_id', clubId).order('display_order'),
    ]);
    setSlides((s as Slide[]) || []);
    setTiles((t as Tile[]) || []);
    return (s as Slide[]) || [];
  }, [clubId]);

  useEffect(() => {
    load().then(s => {
      if (s.length) { setSelId(s[0].id!); setDraft({ ...s[0] }); }
    });
  }, [load]);

  const select = (s: Slide) => { setSelId(s.id!); setDraft({ ...s }); };
  const startNew = () => { setSelId('new'); setDraft({ ...EMPTY_SLIDE, display_order: slides?.length || 0 }); };
  const selIndex = slides ? slides.findIndex(s => s.id === selId) : -1;
  const saved = slides?.find(s => s.id === selId) || null;
  const changed = draft && (selId === 'new' || JSON.stringify({ ...saved, updated_at: undefined }) !== JSON.stringify({ ...draft, updated_at: undefined }));

  const saveSlide = async () => {
    if (!draft) return;
    if (!draft.image_url) { addNotification('error', 'Choose an image for the slide first.'); return; }
    if (draft.show_from && draft.show_until && draft.show_from > draft.show_until) { addNotification('error', 'The last day is before the first day. Check the show dates.'); return; }
    setSaving(true);
    const payload = {
      title: draft.title.trim(), subtitle: (draft.subtitle || '').trim(), image_url: draft.image_url,
      button_text: (draft.button_text || '').trim(), button_url: (draft.button_url || '').trim(), is_active: draft.is_active,
      label: draft.label?.trim() || null, show_from: draft.show_from || null, show_until: draft.show_until || null,
    };
    let error;
    let newId: string | null = null;
    if (selId === 'new') {
      const res = await supabase.from('homepage_slides').insert({ ...payload, club_id: clubId, display_order: slides?.length || 0 }).select('id').single();
      error = res.error; newId = res.data?.id || null;
    } else {
      ({ error } = await supabase.from('homepage_slides').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', selId!));
    }
    setSaving(false);
    if (error) { addNotification('error', 'Could not save the slide. Please try again.'); return; }
    log(selId === 'new' ? 'created' : 'updated', 'slide', payload.title || payload.label || 'Slide', newId || (selId as string));
    const s = await load();
    const id = newId || (selId as string);
    const fresh = s.find(x => x.id === id);
    if (fresh) select(fresh);
    reload(['slides']);
    addNotification('success', 'Slide saved. It’s on your homepage now.');
  };

  const deleteSlide = async () => {
    if (!saved?.id) { setDraft(null); setSelId(null); return; }
    if (!window.confirm('Delete this slide?')) return;
    const { error } = await supabase.from('homepage_slides').delete().eq('id', saved.id);
    if (error) { addNotification('error', 'Could not delete the slide.'); return; }
    log('deleted', 'slide', saved.title || 'Slide', saved.id);
    const s = await load();
    if (s.length) select(s[0]); else { setDraft(null); setSelId(null); }
    reload(['slides']);
  };

  const onSlideDrag = async (e: DragEndEvent) => {
    if (!slides || !e.over || e.active.id === e.over.id) return;
    const from = slides.findIndex(s => s.id === e.active.id);
    const to = slides.findIndex(s => s.id === e.over!.id);
    const next = arrayMove(slides, from, to).map((s, i) => ({ ...s, display_order: i }));
    setSlides(next);
    const results = await Promise.all(next.map(s => supabase.from('homepage_slides').update({ display_order: s.display_order }).eq('id', s.id!)));
    if (results.some(r => r.error)) addNotification('error', 'Could not save the new order.');
    else log('updated', 'slides', 'Slide order');
  };

  const toggleTile = async (t: Tile) => {
    const { error } = await supabase.from('homepage_tiles').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) { addNotification('error', 'Could not update the tile.'); return; }
    setTiles(prev => prev?.map(x => (x.id === t.id ? { ...x, is_active: !t.is_active } : x)) || null);
  };

  const deleteTile = async (t: Tile) => {
    if (!window.confirm(`Delete the “${t.title}” tile?`)) return;
    const { error } = await supabase.from('homepage_tiles').delete().eq('id', t.id);
    if (error) { addNotification('error', 'Could not delete the tile.'); return; }
    log('deleted', 'tile', t.title, t.id);
    setTiles(prev => prev?.filter(x => x.id !== t.id) || null);
  };

  const saveTile = async (tile: Partial<Tile>) => {
    const editing = tileEdit && tileEdit !== 'new' ? tileEdit : null;
    const { error } = editing
      ? await supabase.from('homepage_tiles').update({ ...tile, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('homepage_tiles').insert({ ...tile, club_id: clubId, display_order: tiles?.length || 0 });
    if (error) { addNotification('error', 'Could not save the tile.'); return; }
    log(editing ? 'updated' : 'created', 'tile', tile.title || 'Tile', editing?.id);
    setTileEdit(null);
    await load();
  };

  const onTileDrag = async (e: DragEndEvent) => {
    if (!tiles || !e.over || e.active.id === e.over.id) return;
    const next = arrayMove(tiles, tiles.findIndex(t => t.id === e.active.id), tiles.findIndex(t => t.id === e.over!.id)).map((t, i) => ({ ...t, display_order: i }));
    setTiles(next);
    await Promise.all(next.map(t => supabase.from('homepage_tiles').update({ display_order: t.display_order }).eq('id', t.id)));
  };

  const saveSections = async (next: typeof sections) => {
    setSections(next);
    const ok = await updateClub({ website_layout: { ...(club!.website_layout || {}), home: next } } as any);
    if (!ok) addNotification('error', 'Could not save the homepage layout.');
    else log('updated', 'homepage', 'Homepage sections');
  };

  const onSectionDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    saveSections(arrayMove(sections, sections.findIndex(s => s.id === e.active.id), sections.findIndex(s => s.id === e.over!.id)));
  };

  const linkOptions = useMemo(() => [
    { value: '/', label: 'Home' },
    ...AUTO_PAGES.map(a => ({ value: a.path, label: a.label })),
    ...pages.map(p => ({ value: `/${p.page_slug}`, label: p.page_title + (p.is_published ? '' : ' (draft)') })),
  ], [pages]);
  const linkIsCustom = !!draft?.button_url && !linkOptions.some(o => o.value === draft.button_url);
  const [customLink, setCustomLink] = useState(false);
  useEffect(() => { setCustomLink(linkIsCustom); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selId]);

  const themed = hasTheme(club!.website_theme);
  const tv = themed ? themeVars(club!.website_theme) : null;
  const showing = slides?.filter(s => s.is_active).length || 0;
  const hidden = (slides?.length || 0) - showing;
  const set = (patch: Partial<Slide>) => setDraft(d => (d ? { ...d, ...patch } : d));

  return (
    <>
      <section className="a-card wh-intro">
        <span className="a-tile wh-t-b"><Info size={17} /></span>
        <div className="tx"><b>Your homepage is a stack of sections.</b> Edit the slides and quick links here, and choose which sections show and in what order.</div>
      </section>

      <div className="wh-hm">
        <div className="wh-hm-main">
          <section className="a-card" aria-label="Hero slides">
            <div className="wh-ch">
              <span className="a-tile a-tile-sm"><ImageIcon size={17} /></span>
              <div><h3 className="a-display">Hero slides</h3><div className="sub">The big rotating images at the top of your homepage</div></div>
              <div className="r"><span className="wh-dim text-[12.5px]">{showing} showing{hidden ? ` · ${hidden} hidden` : ''}</span></div>
            </div>
            {slides === null ? <div className="wh-empty">Loading…</div> : (
              <>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSlideDrag}>
                  <SortableContext items={slides.map(s => s.id!)} strategy={horizontalListSortingStrategy}>
                    <div className="wh-strip">
                      {slides.map((s, i) => <SlideCard key={s.id} s={s} i={i} sel={selId === s.id} onClick={() => select(s)} />)}
                      <button className="wh-sl-add" onClick={startNew} style={selId === 'new' ? { borderColor: '#0A84FF', color: '#4DA3FF' } : undefined}><Plus size={18} />Add slide</button>
                    </div>
                  </SortableContext>
                </DndContext>
                <div className="wh-stripnote"><GripVertical size={14} />{slides.length > 1 ? 'Drag to change the order. Click a slide to edit it.' : 'Click a slide to edit it.'}</div>
              </>
            )}
          </section>

          <section className="a-card" aria-label="Quick links">
            <div className="wh-ch">
              <span className="a-tile a-tile-sm"><LayoutGrid size={17} /></span>
              <div><h3 className="a-display">Quick links</h3><div className="sub">Tiles under the slides that take people to key pages</div></div>
              <div className="r">
                <span className="wh-dim text-[12.5px]"><b className="wh-ink">{tiles?.length || 0}</b> of 6 used</span>
                <button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} disabled={(tiles?.length || 0) >= 6} title={(tiles?.length || 0) >= 6 ? 'You can have up to 6 quick links' : undefined} onClick={() => setTileEdit('new')}><Plus size={15} />Add tile</button>
              </div>
            </div>
            {tiles === null ? <div className="wh-empty">Loading…</div> : tiles.length === 0 ? (
              <p className="wh-empty">No tiles yet. Your homepage shows the standard six until you add your own.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onTileDrag}>
                <SortableContext items={tiles.map(t => t.id)} strategy={rectSortingStrategy}>
                  <div className="wh-qgrid">
                    {tiles.map(t => <TileCard key={t.id} t={t} onEdit={() => setTileEdit(t)} onToggle={() => toggleTile(t)} onDelete={() => deleteTile(t)} />)}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>

          <section className="a-card" aria-label="Homepage sections">
            <div className="wh-ch"><span className="a-tile a-tile-sm"><Layers size={17} /></span><div><h3 className="a-display">Homepage sections</h3><div className="sub">Top to bottom, as visitors see them. Changes save straight away.</div></div></div>
            <div className="wh-secs">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDrag}>
                <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {sections.map(s => <SectionRow key={s.id} id={s.id} on={s.on} onToggle={() => saveSections(sections.map(x => (x.id === s.id ? { ...x, on: !x.on } : x)))} />)}
                </SortableContext>
              </DndContext>
            </div>
          </section>
        </div>

        <aside className="a-card wh-insp" aria-label="Edit slide">
          {!draft ? (
            <div className="wh-empty" style={{ padding: 40 }}>
              <ImageIcon size={22} style={{ margin: '0 auto 10px' }} />
              <div className="wh-ink" style={{ fontWeight: 600, marginBottom: 4 }}>No slide selected</div>
              Click a slide to edit it, or add one.
              <div style={{ marginTop: 14 }}><button className="a-btn a-btn-p" onClick={startNew}><Plus size={15} />Add slide</button></div>
            </div>
          ) : (
            <>
              <div className="wh-insp-h">
                <h3 className="a-display">{selId === 'new' ? 'New slide' : `Slide ${selIndex + 1} of ${slides?.length || 0}`}</h3>
                {selId !== 'new' && slides && slides.length > 1 && (
                  <>
                    <button className="a-ib" aria-label="Previous slide" onClick={() => select(slides[(selIndex - 1 + slides.length) % slides.length])}><ChevronLeft size={17} /></button>
                    <button className="a-ib" aria-label="Next slide" onClick={() => select(slides[(selIndex + 1) % slides.length])}><ChevronRight size={17} /></button>
                  </>
                )}
                <button className="a-ib" aria-label="Close" onClick={() => { setDraft(null); setSelId(null); }}><X size={17} /></button>
              </div>
              <div className="wh-insp-b">
                <div className="wh-ipv">
                  <div className="wh-ipv-top"><p className="a-cap">Preview</p>
                    <div className="a-seg" role="group" aria-label="Preview size">
                      <button className={`a-seg-i ${pv === 'desktop' ? 'a-seg-on' : ''}`} onClick={() => setPv('desktop')} aria-label="Desktop"><Monitor size={14} /></button>
                      <button className={`a-seg-i ${pv === 'phone' ? 'a-seg-on' : ''}`} onClick={() => setPv('phone')} aria-label="Phone"><Smartphone size={14} /></button>
                    </div>
                  </div>
                  <div className={`wh-mini${pv === 'phone' ? ' phone' : ''}`} style={tv ? (tv as React.CSSProperties) : undefined}>
                    <div className="wh-mini-hero">
                      {draft.image_url && <img src={draft.image_url} alt="" />}
                      {(draft.label || draft.title || draft.subtitle || draft.button_text) && (
                        <div className="wh-mini-in">
                          {draft.label && <span className="k" style={tv ? { background: 'var(--site-accent)', color: 'var(--site-accent-ink)' } : undefined}>{draft.label}</span>}
                          {draft.title && <h4 style={tv ? { fontFamily: 'var(--site-head-font)' } : undefined}>{draft.title}</h4>}
                          {draft.subtitle && <p>{draft.subtitle}</p>}
                          {draft.button_text && <span className="b" style={tv ? { background: 'var(--site-p)', color: 'var(--site-p-ink)', borderRadius: 'var(--site-radius)' } : undefined}>{draft.button_text}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="wh-ifs">
                  <div>
                    <p className="wh-lab">Image</p>
                    <div className="wh-imgrow">
                      <span className="th">{draft.image_url ? <img src={draft.image_url} alt="" /> : <span className="wh-frame-load"><ImageIcon size={18} /></span>}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => setMediaOpen(true)}><Upload size={14} />{draft.image_url ? 'Replace' : 'Choose image'}</button>
                        <span className="wh-dim" style={{ fontSize: 11.5, lineHeight: 1.35 }}>Wide photos work best (at least 1600 px across)</span>
                      </div>
                    </div>
                  </div>
                  <div><label className="wh-lab" htmlFor="w-sl-label">Small label <span className="c">Optional</span></label><input id="w-sl-label" className="a-inp" value={draft.label || ''} maxLength={40} onChange={e => set({ label: e.target.value })} placeholder="e.g. This Sunday" /></div>
                  <div><label className="wh-lab" htmlFor="w-sl-title">Headline <span className="c">{draft.title.length} / 60</span></label><input id="w-sl-title" className="a-inp" value={draft.title} maxLength={80} onChange={e => set({ title: e.target.value })} /></div>
                  <div><label className="wh-lab" htmlFor="w-sl-sub">Text <span className="c">{(draft.subtitle || '').length} / 160</span></label><textarea id="w-sl-sub" className="a-inp" rows={2} value={draft.subtitle || ''} maxLength={240} onChange={e => set({ subtitle: e.target.value })} /></div>
                  <div className="wh-two">
                    <div><label className="wh-lab" htmlFor="w-sl-btn">Button</label><input id="w-sl-btn" className="a-inp" value={draft.button_text || ''} onChange={e => set({ button_text: e.target.value })} placeholder="e.g. Enter now" /></div>
                    <div>
                      <label className="wh-lab" htmlFor="w-sl-to">Goes to</label>
                      <select id="w-sl-to" className="a-inp" value={customLink ? '__custom' : (draft.button_url || '')} onChange={e => {
                        if (e.target.value === '__custom') { setCustomLink(true); set({ button_url: 'https://' }); }
                        else { setCustomLink(false); set({ button_url: e.target.value }); }
                      }}>
                        <option value="">Nowhere</option>
                        {linkOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        <option value="__custom">Another website…</option>
                      </select>
                    </div>
                  </div>
                  {customLink && <div><label className="wh-lab" htmlFor="w-sl-url">Web address</label><input id="w-sl-url" className="a-inp" value={draft.button_url} onChange={e => set({ button_url: e.target.value })} placeholder="https://" /></div>}
                  {draft.button_text && !draft.button_url && <div className="wh-hint" style={{ marginTop: -6 }}>Choose where the button goes, or it won’t show.</div>}
                  <div className="wh-swline"><div><div className="t">Show this slide</div></div><button type="button" role="switch" aria-checked={draft.is_active} aria-label="Show this slide" className="a-sw" onClick={() => set({ is_active: !draft.is_active })} /></div>
                  <div>
                    <p className="wh-lab">Show between <span className="c">Optional</span></p>
                    <div className="wh-two">
                      <label className="a-field" style={{ height: 42 }}><input type="date" value={draft.show_from || ''} onChange={e => set({ show_from: e.target.value || null })} aria-label="Show from" style={{ colorScheme: light ? 'light' : 'dark' }} /></label>
                      <label className="a-field" style={{ height: 42 }}><input type="date" value={draft.show_until || ''} min={draft.show_from || undefined} onChange={e => set({ show_until: e.target.value || null })} aria-label="Show until" style={{ colorScheme: light ? 'light' : 'dark' }} /></label>
                    </div>
                    <div className="wh-hint">Leave empty to always show. With an end date, the slide hides itself after the day, so the homepage never goes stale.</div>
                  </div>
                </div>
              </div>
              <div className="wh-ifoot">
                {selId === 'new'
                  ? <button className="a-btn" style={{ height: 34 }} onClick={() => { if (slides?.length) select(slides[0]); else { setDraft(null); setSelId(null); } }}>Cancel</button>
                  : <button className="a-btn wh-btn-d" style={{ height: 34 }} onClick={deleteSlide}><Trash2 size={14} />Delete</button>}
                {changed && selId !== 'new' && <button className="a-btn" style={{ height: 34, marginLeft: 'auto' }} onClick={() => saved && select(saved)}>Undo</button>}
                <button className="a-btn a-btn-p" style={{ height: 34, marginLeft: changed && selId !== 'new' ? 0 : 'auto' }} onClick={saveSlide} disabled={saving || !changed}>{saving ? <Loader2 size={15} className="wh-spin" /> : null}{selId === 'new' ? 'Add slide' : 'Save slide'}</button>
              </div>
            </>
          )}
        </aside>
      </div>

      {mediaOpen && (
        <MediaLibraryModal isOpen={mediaOpen} onClose={() => setMediaOpen(false)} onSelect={url => { set({ image_url: url }); setMediaOpen(false); }} darkMode={!light} isHomepageMedia />
      )}
      {tileEdit && (
        <HomepageTileModal isOpen onClose={() => setTileEdit(null)} onSave={saveTile as any} tile={tileEdit === 'new' ? null : (tileEdit as any)} darkMode={!light} />
      )}
    </>
  );
};

const TileCard: React.FC<{ t: Tile; onEdit: () => void; onToggle: () => void; onDelete: () => void }> = ({ t, onEdit, onToggle, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: t.id });
  const to = t.link_url?.startsWith('/') ? (AUTO_PAGES.find(a => a.path === t.link_url)?.label || t.link_url) : t.link_url?.replace(/^https?:\/\//, '');
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`wh-qt${t.is_active ? '' : ' hid'}`} {...attributes} {...listeners}>
      {t.image_url && <img src={t.image_url} alt="" />}
      {!t.is_active && <span className="hb"><EyeOff size={12} />Hidden</span>}
      <span className="ctl" onPointerDown={e => e.stopPropagation()}>
        <button onClick={onToggle} aria-label={t.is_active ? 'Hide tile' : 'Show tile'} title={t.is_active ? 'Hide tile' : 'Show tile'}>{t.is_active ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        <button onClick={onEdit} aria-label="Edit tile" title="Edit tile"><Pencil size={15} /></button>
        <button onClick={onDelete} aria-label="Delete tile" title="Delete tile"><Trash2 size={15} /></button>
      </span>
      <b>{t.title}</b>
      <span className="to"><ArrowRight size={12} />{to}</span>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ExternalLink, FileText, FolderOpen, GripVertical, House, Link2, Menu as MenuIcon, Pencil, Plus, Trash2, Loader2, IndentIncrease, IndentDecrease, RotateCcw } from 'lucide-react';
import { AUTO_PAGES, DEFAULT_MENU, MEMBERSHIP_URL, resolveMenu, SiteMenuItem } from '../../utils/publicSite';
import { useHub } from './hubData';
import { useNotifications } from '../../contexts/NotificationContext';

interface Flat { item: SiteMenuItem; depth: 0 | 1 }

const uid = () => Math.random().toString(36).slice(2, 10);

const flatten = (items: SiteMenuItem[]): Flat[] =>
  items.flatMap(i => [{ item: { ...i, children: undefined }, depth: 0 as const }, ...(i.children || []).map(c => ({ item: { ...c, children: undefined }, depth: 1 as const }))]);

const build = (flat: Flat[]): SiteMenuItem[] => {
  const out: SiteMenuItem[] = [];
  for (const f of flat) {
    if (f.depth === 1 && out.length > 0) {
      const parent = out[out.length - 1];
      parent.children = [...(parent.children || []), f.item];
    } else {
      out.push({ ...f.item, children: undefined });
    }
  }
  return out.map(i => (i.children?.length ? i : { ...i, children: undefined }));
};

const blockEnd = (flat: Flat[], i: number) => {
  let j = i + 1;
  if (flat[i]?.depth === 0) while (j < flat.length && flat[j].depth === 1) j++;
  return j;
};

const ICON: Record<string, React.ReactNode> = {
  home: <House size={16} />, auto: <FileText size={16} />, page: <FileText size={16} />, link: <Link2 size={16} />, dropdown: <FolderOpen size={16} />,
};

/** keepClean: the change has already been saved, so don't mark the menu as having unsaved edits. */
export interface MenuEditorHandle { add: (item: SiteMenuItem, keepClean?: boolean) => void; remove: (pred: (i: SiteMenuItem) => boolean, keepClean?: boolean) => void }

const Row: React.FC<{
  f: Flat; index: number; draft?: boolean; open: boolean; onToggle: () => void;
  onChange: (patch: Partial<SiteMenuItem>) => void; onRemove: () => void; onIndent: () => void; onOutdent: () => void; canIndent: boolean;
}> = ({ f, draft, open, onToggle, onChange, onRemove, onIndent, onOutdent, canIndent }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const tag = f.item.kind === 'auto' ? <span className="wh-tg wh-tg-auto">Auto</span>
    : f.item.kind === 'link' ? <span className="wh-tg wh-tg-link">Link</span>
    : f.item.kind === 'dropdown' ? <span className="wh-tg wh-tg-dd">Dropdown</span>
    : draft ? <span className="wh-tg wh-tg-draft">Draft</span> : null;
  return (
    <div ref={setNodeRef} style={style}>
      <div className={`wh-mi${f.depth === 1 ? ' kid' : ''}${isDragging ? ' dragging' : ''}`}>
        <button className="g" aria-label={`Drag ${f.item.label}`} {...attributes} {...listeners}><GripVertical size={16} /></button>
        <span className="ic">{ICON[f.item.kind]}</span>
        <span className="lb">{f.item.label}</span>
        {f.item.kind === 'dropdown' && <ChevronDown size={15} className="wh-dim" />}
        <span className="r">{tag}<button className="a-ib" onClick={onToggle} aria-label={`Edit ${f.item.label}`} aria-expanded={open}><Pencil size={14} /></button></span>
      </div>
      {open && (
        <div className="wh-mi-edit">
          <label className="wh-lab" style={{ margin: 0 }}>Label</label>
          <input className="a-inp" value={f.item.label} onChange={e => onChange({ label: e.target.value })} aria-label="Menu label" />
          {f.item.kind === 'link' && (
            <>
              <label className="wh-lab" style={{ margin: 0 }}>Web address</label>
              <input className="a-inp" value={f.item.target || ''} placeholder="https://" onChange={e => onChange({ target: e.target.value })} aria-label="Link address" />
            </>
          )}
          <div className="row">
            {f.depth === 0 && f.item.kind !== 'dropdown' && canIndent && <button className="a-btn" style={{ height: 32, padding: '0 10px', fontSize: 12.5 }} onClick={onIndent}><IndentIncrease size={14} />Put under the item above</button>}
            {f.depth === 1 && <button className="a-btn" style={{ height: 32, padding: '0 10px', fontSize: 12.5 }} onClick={onOutdent}><IndentDecrease size={14} />Move to the top level</button>}
            <button className="a-btn wh-btn-d" style={{ height: 32, padding: '0 10px', fontSize: 12.5, marginLeft: 'auto' }} onClick={onRemove}><Trash2 size={14} />Remove</button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Site menu editor with a header preview. Saves to clubs.website_menu. */
export const MenuEditor: React.FC<{ registerApi?: (api: MenuEditorHandle) => void; onChange?: (items: SiteMenuItem[]) => void }> = ({ registerApi, onChange }) => {
  const { club, pages, updateClub, log } = useHub();
  const { addNotification } = useNotifications();
  const savedKey = JSON.stringify(club?.website_menu || null);
  const [flat, setFlat] = useState<Flat[]>(() => flatten(resolveMenu(club?.website_menu)));
  const [openId, setOpenId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<null | 'page' | 'link' | 'dropdown'>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTarget, setNewTarget] = useState('');

  useEffect(() => { if (!dirty) setFlat(flatten(resolveMenu(club?.website_menu))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [savedKey]);

  const items = useMemo(() => build(flat), [flat]);
  useEffect(() => { onChange?.(items); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [items]);

  const update = (next: Flat[]) => { setFlat(next); setDirty(true); };

  useEffect(() => {
    registerApi?.({
      add: (item, keepClean) => { setFlat(prev => [...prev, { item, depth: 0 }]); if (!keepClean) setDirty(true); },
      remove: (pred, keepClean) => { setFlat(prev => prev.filter(f => !pred(f.item))); if (!keepClean) setDirty(true); },
    });
  }, [registerApi]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = flat.findIndex(f => f.item.id === active.id);
    const to = flat.findIndex(f => f.item.id === over.id);
    if (from < 0 || to < 0) return;
    const moving = flat[from];
    if (moving.depth === 0) {
      const end = blockEnd(flat, from);
      const block = flat.slice(from, end);
      const rest = [...flat.slice(0, from), ...flat.slice(end)];
      let at = rest.findIndex(f => f.item.id === over.id);
      if (at < 0) return;
      if (to > from) {
        // dropping lower: go after the target and its children
        at = rest[at].depth === 0 ? blockEnd(rest, at) : at + 1;
      } else if (rest[at].depth === 1) {
        // dropping onto a child while moving up: go before its parent group
        while (at > 0 && rest[at].depth === 1) at--;
      }
      update([...rest.slice(0, at), ...block, ...rest.slice(at)]);
    } else {
      const next = flat.filter((_, i) => i !== from);
      let at = next.findIndex(f => f.item.id === over.id);
      if (to > from) at += 1;
      const depth: 0 | 1 = at === 0 ? 0 : moving.depth;
      next.splice(at, 0, { ...moving, depth });
      update(next);
    }
  };

  const save = async () => {
    setSaving(true);
    const clean = build(flat).map(i => ({ ...i, label: i.label.trim() || 'Untitled' }));
    const ok = await updateClub({ website_menu: { items: clean } } as any);
    setSaving(false);
    if (ok) {
      setDirty(false);
      log('updated', 'menu', 'Site menu');
      addNotification('success', 'Menu saved. It’s on your site now.');
    } else addNotification('error', 'Could not save the menu. Please try again.');
  };

  const reset = () => { update(flatten(DEFAULT_MENU)); setOpenId(null); };

  const inMenu = (kind: string, target?: string) => flat.some(f => f.item.kind === kind && f.item.target === target);
  const addable = [
    ...pages.filter(p => !inMenu('page', p.page_slug)).map(p => ({ value: `page:${p.page_slug}`, label: p.page_title + (p.is_published ? '' : ' (draft)') })),
    ...AUTO_PAGES.filter(a => !inMenu('auto', a.key)).map(a => ({ value: `auto:${a.key}`, label: a.label })),
    ...(!flat.some(f => f.item.kind === 'home') ? [{ value: 'home:', label: 'Home' }] : []),
    ...(!flat.some(f => f.item.kind === 'link' && f.item.target === MEMBERSHIP_URL) ? [{ value: `link:${MEMBERSHIP_URL}`, label: 'Membership (join online)' }] : []),
  ];

  const confirmAdd = () => {
    let item: SiteMenuItem | null = null;
    if (adding === 'link' && newUrl.trim()) item = { id: uid(), kind: 'link', label: newLabel.trim() || newUrl.trim(), target: /^https?:\/\//.test(newUrl.trim()) ? newUrl.trim() : `https://${newUrl.trim()}` };
    if (adding === 'dropdown' && newLabel.trim()) item = { id: uid(), kind: 'dropdown', label: newLabel.trim() };
    if (adding === 'page' && newTarget) {
      const [kind, target] = newTarget.split(/:(.*)/s);
      const label = kind === 'page' ? pages.find(p => p.page_slug === target)?.page_title || target
        : kind === 'auto' ? AUTO_PAGES.find(a => a.key === target)?.label || target
        : kind === 'home' ? 'Home' : 'Membership';
      item = { id: uid(), kind: kind as SiteMenuItem['kind'], label, target: kind === 'home' ? undefined : target };
    }
    if (!item) return;
    update([...flat, { item, depth: 0 }]);
    setAdding(null); setNewLabel(''); setNewUrl(''); setNewTarget('');
  };

  const top = items.slice(0, 5);
  const draftSlugs = new Set(pages.filter(p => !p.is_published).map(p => p.page_slug));

  return (
    <aside className="a-card wh-menu" aria-label="Site menu">
      <div className="wh-ch">
        <span className="a-tile a-tile-sm"><MenuIcon size={17} /></span>
        <div><h3 className="a-display">Site menu</h3><div className="sub">Drag to reorder. Edit an item to nest it.</div></div>
        <div className="r"><button className="a-ib" onClick={reset} title="Go back to the standard menu" aria-label="Go back to the standard menu"><RotateCcw size={16} /></button></div>
      </div>
      <div className="wh-hdrp" aria-label="Menu preview">
        {club?.logo && <img src={club.logo} alt="" />}
        {top.map(i => <span key={i.id}>{i.label}{(i.children?.length || i.kind === 'dropdown') ? <ChevronDown size={9} /> : null}</span>)}
        {items.length > top.length && <span className="more">+{items.length - top.length}</span>}
      </div>
      <div className="wh-tree">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={flat.map(f => f.item.id)} strategy={verticalListSortingStrategy}>
            {flat.map((f, i) => (
              <Row
                key={f.item.id} f={f} index={i}
                draft={f.item.kind === 'page' && draftSlugs.has(f.item.target || '')}
                open={openId === f.item.id}
                onToggle={() => setOpenId(openId === f.item.id ? null : f.item.id)}
                onChange={patch => update(flat.map(x => (x.item.id === f.item.id ? { ...x, item: { ...x.item, ...patch } } : x)))}
                onRemove={() => { const end = blockEnd(flat, i); update(f.depth === 0 ? [...flat.slice(0, i), ...flat.slice(i + 1, end).map(c => ({ ...c, depth: 0 as const })), ...flat.slice(end)] : flat.filter((_, k) => k !== i)); setOpenId(null); }}
                onIndent={() => update(flat.map((x, k) => (k === i ? { ...x, depth: 1 } : x)))}
                onOutdent={() => update(flat.map((x, k) => (k === i ? { ...x, depth: 0 } : x)))}
                canIndent={i > 0 && flat.slice(i + 1, blockEnd(flat, i)).length === 0}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {adding && (
        <div className="wh-mi-edit" style={{ margin: '0 16px 12px' }}>
          {adding === 'page' && (
            <>
              <label className="wh-lab" style={{ margin: 0 }} htmlFor="w-add-page">Page</label>
              <select id="w-add-page" className="a-inp" value={newTarget} onChange={e => setNewTarget(e.target.value)}>
                <option value="">Choose a page…</option>
                {addable.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </>
          )}
          {adding !== 'page' && (
            <>
              <label className="wh-lab" style={{ margin: 0 }}>Label</label>
              <input className="a-inp" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder={adding === 'dropdown' ? 'e.g. Racing' : 'e.g. Facebook'} aria-label="Label" />
            </>
          )}
          {adding === 'link' && (
            <>
              <label className="wh-lab" style={{ margin: 0 }}>Web address</label>
              <input className="a-inp" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://facebook.com/yourclub" aria-label="Web address" />
            </>
          )}
          <div className="row">
            <button className="a-btn" style={{ height: 32 }} onClick={() => setAdding(null)}>Cancel</button>
            <button className="a-btn a-btn-p" style={{ height: 32, marginLeft: 'auto' }} onClick={confirmAdd}>Add to menu</button>
          </div>
        </div>
      )}
      <div className="wh-mfoot">
        <div className="row">
          <button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => setAdding('page')} disabled={addable.length === 0}><Plus size={14} />Page</button>
          <button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => setAdding('link')}><ExternalLink size={14} />Link</button>
          <button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => setAdding('dropdown')}><FolderOpen size={14} />Dropdown</button>
        </div>
        {dirty ? (
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="wh-save-note">Not saved yet</span>
            <button className="a-btn" style={{ height: 34, marginLeft: 'auto' }} onClick={() => { setFlat(flatten(resolveMenu(club?.website_menu))); setDirty(false); }}>Undo</button>
            <button className="a-btn a-btn-p" style={{ height: 34 }} onClick={save} disabled={saving}>{saving ? <Loader2 size={15} className="wh-spin" /> : null}Save menu</button>
          </div>
        ) : (
          <span className="wh-save-note">{club?.website_menu ? 'Saved. This is the menu on your site.' : 'This is the standard menu every club starts with.'}</span>
        )}
      </div>
    </aside>
  );
};

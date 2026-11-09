import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar, Eye, FileText, Loader2, Mail, Map as MapIcon, Menu as MenuIcon, MoreHorizontal, Newspaper, Pencil, Plus, Sailboat, Search, Send, Tag, Trash2, Trophy, X, EyeOff, ExternalLink, House } from 'lucide-react';
import { createOrganizationPage, deleteOrganizationPage, updateOrganizationPage } from '../../utils/organizationPageBuilderStorage';
import { AUTO_PAGES, RESERVED_SLUGS, SiteMenuItem, resolveMenu } from '../../utils/publicSite';
import { useNotifications } from '../../contexts/NotificationContext';
import { useHub, timeAgo } from './hubData';
import { HUB_ROUTES, hasDraftChanges, publishUpdate } from './WebsiteHub';
import { PageThumb } from './PageThumb';
import { MenuEditor, MenuEditorHandle } from './MenuEditor';

const AUTO_META: Record<string, { icon: React.ReactNode; note: string }> = {
  'race-calendar': { icon: <Calendar size={17} />, note: 'From your race calendar' },
  results: { icon: <Trophy size={17} />, note: 'From your race results' },
  news: { icon: <Newspaper size={17} />, note: 'Club and association news' },
  classifieds: { icon: <Tag size={17} />, note: 'Boats and gear for sale' },
  venues: { icon: <MapIcon size={17} />, note: 'Your sailing venues' },
  'yacht-classes': { icon: <Sailboat size={17} />, note: 'Classes sailed at your club' },
  contact: { icon: <Mail size={17} />, note: 'Contact form and map' },
};

/** A menu without the items that match, including matching items inside dropdowns. */
const withoutItems = (items: SiteMenuItem[], pred: (i: SiteMenuItem) => boolean): SiteMenuItem[] =>
  items.filter(i => !pred(i)).map(i => (i.children ? { ...i, children: i.children.filter(c => !pred(c)) } : i));

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const NewPageDialog: React.FC<{ onClose: () => void; onCreated: (slug: string, title: string, addToMenu: boolean) => void }> = ({ onClose, onCreated }) => {
  const { club, pages } = useHub();
  const { addNotification } = useNotifications();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [addToMenu, setAddToMenu] = useState(true);
  const [busy, setBusy] = useState(false);
  const finalSlug = slugTouched ? slugify(slug) : slugify(title);
  const clash = !finalSlug ? null
    : RESERVED_SLUGS.has(finalSlug) ? 'That address is used by a built-in page. Try another.'
    : pages.some(p => p.page_slug === finalSlug) ? 'You already have a page at that address.' : null;

  const create = async () => {
    if (!title.trim() || !finalSlug || clash) return;
    setBusy(true);
    const page = await createOrganizationPage('club', club!.id, { page_title: title.trim(), page_slug: finalSlug, is_published: false, show_in_navigation: addToMenu });
    setBusy(false);
    if (!page) { addNotification('error', 'Could not create the page. Please try again.'); return; }
    onCreated(finalSlug, title.trim(), addToMenu);
  };

  return (
    <div className="a-dlg" role="dialog" aria-modal="true" aria-label="New page" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="a-sheet" style={{ maxWidth: 460 }}>
        <div className="a-dlg-head">
          <span className="a-tile"><FileText size={17} /></span>
          <div className="flex-1"><h2 className="a-display a-ink m-0 text-[18px] font-semibold">New page</h2><p className="a-dim m-0 mt-0.5 text-[12.5px]">It opens in the builder as a draft.</p></div>
          <button className="a-ib" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="a-dlg-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="wh-lab" htmlFor="w-np-title">Page name</label>
            <input id="w-np-title" className="a-inp" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Join the club" onKeyDown={e => { if (e.key === 'Enter') create(); }} />
          </div>
          <div>
            <label className="wh-lab" htmlFor="w-np-slug">Web address</label>
            <div className="a-field"><span className="wh-dim" style={{ whiteSpace: 'nowrap' }}>/</span><input id="w-np-slug" value={slugTouched ? slug : slugify(title)} onChange={e => { setSlug(e.target.value); setSlugTouched(true); }} placeholder="join-the-club" /></div>
            {clash ? <div className="wh-hint" style={{ color: '#FF6B60' }}>{clash}</div> : finalSlug ? <div className="wh-hint">Your page will be at /{finalSlug}</div> : null}
          </div>
          <label className="wh-swline" style={{ cursor: 'pointer' }}>
            <div><div className="t">Add it to the menu</div><div className="s">It only shows once you publish it</div></div>
            <button type="button" role="switch" aria-checked={addToMenu} aria-label="Add it to the menu" className="a-sw" onClick={() => setAddToMenu(!addToMenu)} />
          </label>
        </div>
        <div className="a-dlg-foot">
          <button className="a-btn" onClick={onClose}>Cancel</button>
          <button className="a-btn a-btn-p" onClick={create} disabled={busy || !title.trim() || !finalSlug || !!clash}>{busy ? <Loader2 size={15} className="wh-spin" /> : <Plus size={15} />}Create and edit</button>
        </div>
      </div>
    </div>
  );
};

export const HubPages: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { club, pages, reload, log, liveHost, previewPath, updateClub } = useHub();
  const { addNotification } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'live' | 'draft' | 'nomenu'>('all');
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(() => new URLSearchParams(location.search).has('new'));
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<SiteMenuItem[]>([]);
  const menuApi = useRef<MenuEditorHandle | null>(null);
  const registerApi = useCallback((api: MenuEditorHandle) => { menuApi.current = api; }, []);

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.wh-pop-menu, [data-pop-toggle]')) setMenuFor(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuFor]);

  const allIn = (items: SiteMenuItem[]): SiteMenuItem[] => items.flatMap(i => [i, ...(i.children || [])]);
  const inMenu = (kind: string, target?: string) => allIn(menuItems).some(i => i.kind === kind && i.target === target);

  const shown = useMemo(() => pages.filter(p => {
    if (q && !`${p.page_title} ${p.page_slug}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'live') return p.is_published;
    if (filter === 'draft') return !p.is_published;
    if (filter === 'nomenu') return !inMenu('page', p.page_slug);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pages, q, filter, menuItems]);

  const counts = {
    all: pages.length,
    live: pages.filter(p => p.is_published).length,
    draft: pages.filter(p => !p.is_published).length,
    nomenu: pages.filter(p => !inMenu('page', p.page_slug)).length,
  };

  const publicUrl = (slug: string) => (liveHost ? `https://${liveHost}/${slug}` : `${previewPath}/${slug}`);

  const togglePublish = async (p: any) => {
    setMenuFor(null);
    const res = await updateOrganizationPage(p.id, (p.is_published ? { is_published: false } : publishUpdate(p)) as any);
    if (!res) { addNotification('error', 'Could not change the page. Please try again.'); return; }
    log(p.is_published ? 'unpublished' : 'published', 'page', p.page_title, p.id);
    await reload(['pages']);
    addNotification('success', p.is_published ? 'Page taken off your site' : 'Page published');
  };

  const publishChanges = async (p: any) => {
    setMenuFor(null);
    const res = await updateOrganizationPage(p.id, publishUpdate(p) as any);
    if (!res) { addNotification('error', 'Could not publish. Please try again.'); return; }
    log('published', 'page', p.page_title, p.id);
    await reload(['pages']);
    addNotification('success', 'Changes are live');
  };

  const remove = async (p: any) => {
    setMenuFor(null);
    if (!window.confirm(`Delete “${p.page_title}”? This can’t be undone.`)) return;
    const ok = await deleteOrganizationPage(p.id);
    if (!ok) { addNotification('error', 'Could not delete the page.'); return; }
    // Take it out of the saved menu straight away, so no menu item is left pointing at a deleted page
    const isIt = (i: SiteMenuItem) => i.kind === 'page' && i.target === p.page_slug;
    const saved = withoutItems(resolveMenu(club?.website_menu), isIt);
    const menuSaved = club?.website_menu ? await updateClub({ website_menu: { items: saved } } as never) : true;
    menuApi.current?.remove(isIt, menuSaved);
    log('deleted', 'page', p.page_title, p.id);
    await reload(['pages']);
    addNotification(menuSaved ? 'success' : 'error', menuSaved ? 'Page deleted' : 'Page deleted, but it could not be taken out of the menu. Remove it there and save.');
  };

  const toggleMenu = (kind: 'page' | 'auto', target: string, label: string) => {
    if (inMenu(kind, target)) menuApi.current?.remove(i => i.kind === kind && i.target === target);
    else menuApi.current?.add({ id: Math.random().toString(36).slice(2, 10), kind, label, target });
  };

  const onCreated = async (slug: string, title: string, addToMenu: boolean) => {
    setShowNew(false);
    log('created', 'page', title);
    if (addToMenu) {
      // Save straight away so the new page is in the menu when published. Start from the saved menu (not unsaved
      // edits) and drop any old item for the same address, so the menu never shows the same page twice.
      const isIt = (i: SiteMenuItem) => i.kind === 'page' && i.target === slug;
      const item: SiteMenuItem = { id: Math.random().toString(36).slice(2, 10), kind: 'page', label: title, target: slug };
      const items = [...withoutItems(resolveMenu(club?.website_menu), isIt), item];
      const ok = await updateClub({ website_menu: { items } } as never);
      if (ok) { menuApi.current?.remove(isIt, true); menuApi.current?.add(item, true); }
      else addNotification('error', 'Page created, but it could not be added to the menu.');
    }
    navigate(`/website/pages/edit/${slug}`);
  };

  return (
    <div className="wh-pm">
      <div className="wh-pm-main">
        <div className="wh-tbar">
          <label className="a-field"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search pages" aria-label="Search pages" /></label>
          <div className="a-seg" role="group" aria-label="Filter pages">
            {([['all', 'All'], ['live', 'Live'], ['draft', 'Drafts'], ['nomenu', 'Not in menu']] as const).map(([k, l]) => (
              <button key={k} className={`a-seg-i ${filter === k ? 'a-seg-on' : ''}`} onClick={() => setFilter(k)}>{l} <span className="wh-dim">{counts[k]}</span></button>
            ))}
          </div>
          <button className="a-btn a-btn-p" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(true)}><Plus size={16} />New page</button>
        </div>

        <div className="wh-sech"><h3 className="a-display">Your pages</h3><span className="wh-dim text-[12.5px]">Designed in the builder</span></div>
        <div className="wh-pgrid">
          {filter === 'all' && !q && (
            <article className="wh-pc wh-pc-home">
              <div className="tw" onClick={() => navigate(HUB_ROUTES.homepage)} role="button" tabIndex={0} aria-label="Edit the homepage" onKeyDown={e => { if (e.key === 'Enter') navigate(HUB_ROUTES.homepage); }}>
                <span className="wh-pth lg" style={{ width: '100%', height: 136 }}>
                  {club!.cover_image_url ? <img src={club!.cover_image_url} alt="" style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 4 }} /> : <span><i style={{ height: 64, background: '#1E293B' }} /></span>}
                  <span style={{ gridTemplateColumns: '1fr 1fr 1fr' }}><i style={{ height: 30, background: '#94A3B8' }} /><i style={{ height: 30, background: '#94A3B8' }} /><i style={{ height: 30, background: '#94A3B8' }} /></span>
                </span>
                <span className="ov"><span className="a-btn a-btn-p" style={{ height: 32 }}><Pencil size={14} />Edit</span></span>
              </div>
              <div className="pb">
                <div className="t1"><b>Home</b><span className="wh-pill wh-auto"><House size={12} />Homepage</span></div>
                <div className="sl">{liveHost || 'Your site’s front page'}</div>
                <div className="pf"><span className="wh-pill wh-live">Live</span><span className="wh-pill"><MenuIcon size={12} />In menu</span></div>
              </div>
            </article>
          )}
          {shown.map(p => {
            const menuOn = inMenu('page', p.page_slug);
            return (
              <article key={p.id} className="wh-pc">
                <div className="tw" onClick={() => navigate(`/website/pages/edit/${p.page_slug}`)} role="button" tabIndex={0} aria-label={`Edit ${p.page_title}`} onKeyDown={e => { if (e.key === 'Enter') navigate(`/website/pages/edit/${p.page_slug}`); }}>
                  <PageThumb rows={(hasDraftChanges(p) ? p.draft_rows : p.rows) as any} w="100%" h={136} large />
                  <span className="ov">
                    <span className="a-btn a-btn-p" style={{ height: 32 }}><Pencil size={14} />Edit</span>
                    {p.is_published && <a className="a-btn" style={{ height: 32 }} href={publicUrl(p.page_slug)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}><Eye size={14} />View</a>}
                  </span>
                </div>
                <div className="pb">
                  <div className="t1"><b>{p.page_title}</b>
                    <button className="a-ib" data-pop-toggle aria-label={`More for ${p.page_title}`} aria-expanded={menuFor === p.id} onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}><MoreHorizontal size={16} /></button>
                  </div>
                  <div className="sl">/{p.page_slug}</div>
                  <div className="pf">
                    <span className={`wh-pill ${p.is_published ? 'wh-live' : 'wh-draft'}`}>{p.is_published ? 'Live' : 'Draft'}</span>
                    {p.is_published && hasDraftChanges(p) && <span className="wh-pill wh-draft" title="Changes made in the builder that aren't on your site yet">Unpublished changes</span>}
                    <span className="wh-pill" style={menuOn ? undefined : { opacity: 0.7 }}>{menuOn ? <><MenuIcon size={12} />In menu</> : 'Not in menu'}</span>
                    <span className="ed">{timeAgo(p.updated_at || p.created_at || new Date().toISOString())}</span>
                  </div>
                  {menuFor === p.id && (
                    <div className="wh-pop-menu" role="menu">
                      <button role="menuitem" onClick={() => navigate(`/website/pages/edit/${p.page_slug}`)}><Pencil size={15} />Edit in builder</button>
                      {p.is_published && hasDraftChanges(p) && <button role="menuitem" onClick={() => publishChanges(p)}><Send size={15} />Publish changes</button>}
                      <button role="menuitem" onClick={() => togglePublish(p)}>{p.is_published ? <><EyeOff size={15} />Take off the site</> : <><Send size={15} />Publish</>}</button>
                      <button role="menuitem" onClick={() => { setMenuFor(null); toggleMenu('page', p.page_slug, p.page_title); }}><MenuIcon size={15} />{menuOn ? 'Remove from menu' : 'Add to menu'}</button>
                      {p.is_published && <button role="menuitem" onClick={() => { setMenuFor(null); window.open(publicUrl(p.page_slug), '_blank', 'noopener'); }}><ExternalLink size={15} />View on site</button>}
                      <button role="menuitem" className="d" onClick={() => remove(p)}><Trash2 size={15} />Delete</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {shown.length === 0 && (filter !== 'all' || q) && <p className="wh-empty" style={{ gridColumn: '1 / -1' }}>No pages match.</p>}
        </div>
        {pages.length === 0 && filter === 'all' && !q && (
          <div className="a-card wh-intro">
            <span className="a-tile wh-t-b"><Plus size={17} /></span>
            <div className="tx"><b>Add your own pages.</b> About the club, joining, sail training, sponsors — build them visually and add them to the menu.</div>
            <button className="a-btn a-btn-p" onClick={() => setShowNew(true)}><Plus size={15} />New page</button>
          </div>
        )}

        <div className="wh-sech" style={{ marginTop: 8, flexDirection: 'column', gap: 4 }}>
          <h3 className="a-display">Pages Alfie fills in for you</h3>
          <span className="wh-dim text-[12.5px]">Always up to date from your races, results, news and listings. Switch one on to put it in your menu.</span>
        </div>
        <div className="wh-auto-grid">
          {AUTO_PAGES.map(a => {
            const on = inMenu('auto', a.key);
            return (
              <div key={a.key} className="wh-ap">
                <span className="a-tile a-tile-sm">{AUTO_META[a.key]?.icon}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={`${a.label} in the menu`} className="a-sw" onClick={() => toggleMenu('auto', a.key, a.label)} />
                <div>
                  <div className="nm">{a.label}<a href={liveHost ? `https://${liveHost}${a.path}` : `${previewPath}${a.path}`} target="_blank" rel="noopener noreferrer" className="wh-dim" aria-label={`Open ${a.label}`}><ExternalLink size={12} /></a></div>
                  <div className="mm">{AUTO_META[a.key]?.note}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <MenuEditor registerApi={registerApi} onChange={setMenuItems} />

      {showNew && <NewPageDialog onClose={() => { setShowNew(false); if (location.search) navigate(HUB_ROUTES.pages, { replace: true }); }} onCreated={onCreated} />}
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, ChevronDown, Command, ExternalLink, Eye, EyeOff, FileText, Layers, Loader2, Palette, Plus, Redo2, RotateCcw, Send, Settings2, Undo2, X,
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import type { DeviceType, EventPageRow } from '../../types/eventWidgets';
import { cleanHtml } from '../site/SiteModules';
import { hasTheme, isHex, resolveMenu, type SiteMenuItem, type SiteTheme } from '../../utils/publicSite';
import { createOrganizationPage } from '../../utils/organizationPageBuilderStorage';
import { DEVICES, MODULES, SECTIONS, findSel, getAt, makeModule, makeRow, moduleLabel, normaliseRows, cloneModule, cloneRow, type Sel } from './model';
import { duplicateAt, insertModule, insertRow, moveAt, moveModule, patchModSettings, placeModule, removeAt, toggleHide, patchMod, patchRow, patchCol } from './ops';
import type { CanvasIn, CanvasOut, DropTarget } from './SiteCanvas';
import { InsertPanel, type DragItem, type InsertTab } from './InsertPanel';
import { LayersPanel } from './LayersPanel';
import { SettingsPanel } from './SettingsPanel';
import { QuickActions, type QuickAction } from './QuickActions';
import { PagesPanel, StylesPanel, type PageItem } from './SidePanels';
import { DeviceIcon } from './fields';
import { ModuleIcon } from './icons';
import '../../styles/site-builder.css';

interface PageRow { id: string; page_title: string; page_slug: string; rows: EventPageRow[] | null; draft_rows: EventPageRow[] | null; is_published: boolean; meta_title: string | null; meta_description: string | null; updated_at: string }
type SaveState = 'saved' | 'saving' | 'error' | 'idle';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
const siteColours = (t: SiteTheme | null) => ({
  primary: isHex(t?.primary) ? t!.primary! : '#2563EB',
  dark: isHex(t?.dark) ? t!.dark! : '#111827',
  accent: isHex(t?.accent) ? t!.accent! : '#F59E0B',
});

/** The site builder: one page of a club website, edited on a live canvas. */
export const SiteBuilder: React.FC = () => {
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const clubId = currentClub?.clubId as string;
  const clubName = (currentClub as any)?.club?.name || 'Your club';
  const clubAbbr = (currentClub as any)?.club?.abbreviation || clubName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 3);
  const clubLogo = (currentClub as any)?.club?.logo || null;

  const [page, setPage] = useState<PageRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [site, setSite] = useState({ primary: '#2563EB', dark: '#111827', accent: '#F59E0B' });
  const [theme, setTheme] = useState<SiteTheme | null>(null);
  const themePreview = useRef<SiteTheme | null>(null);
  const [rows, setRows] = useState<EventPageRow[]>([]);
  const hist = useRef<{ past: EventPageRow[][]; future: EventPageRow[][]; key: string | null; at: number }>({ past: [], future: [], key: null, at: 0 });
  const [, bump] = useState(0);
  const [sel, setSel] = useState<Sel | null>(null);
  const [device, setDevice] = useState<DeviceType>('desktop');
  const [left, setLeft] = useState<'insert' | 'layers' | 'pages' | 'styles' | null>('insert');
  const [insertTab, setInsertTab] = useState<InsertTab>('modules');
  const [insertAt, setInsertAt] = useState<{ kind: 'index'; index: number } | { kind: 'col'; col: string } | null>(null);
  const [showHidden, setShowHidden] = useState(true);
  const [save, setSave] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [qa, setQa] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const [pageSettings, setPageSettings] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(1200);
  const dragItem = useRef<DragItem | null>(null);
  const clip = useRef<{ kind: 'mod'; mod: any } | { kind: 'row'; row: EventPageRow } | null>(null);

  /* ── Load ── */
  useEffect(() => {
    if (!clubId || !pageSlug) return;
    let off = false;
    (async () => {
      const [{ data: p }, { data: list }, { data: club }] = await Promise.all([
        supabase.from('organization_page_layouts').select('id, page_title, page_slug, rows, draft_rows, is_published, meta_title, meta_description, updated_at').eq('club_id', clubId).eq('page_slug', pageSlug).maybeSingle(),
        supabase.from('organization_page_layouts').select('id, page_slug, page_title, is_published, draft_rows').eq('club_id', clubId).order('navigation_order'),
        supabase.from('clubs').select('website_theme, website_menu').eq('id', clubId).maybeSingle(),
      ]);
      if (off) return;
      if (!p) { setMissing(true); return; }
      const pg = p as unknown as PageRow;
      setPage(pg);
      const start = Array.isArray(pg.draft_rows) ? pg.draft_rows : Array.isArray(pg.rows) ? pg.rows : [];
      rowsRef.current = start;
      setRows(start);
      hist.current = { past: [], future: [], key: null, at: 0 };
      setSel(null);
      setSave(pg.draft_rows ? 'saved' : 'idle');
      const menu = resolveMenu((club as any)?.website_menu);
      const inMenu = (slug: string) => menu.some(i => (i.kind === 'page' && i.target === slug) || (i.children || []).some(c => c.kind === 'page' && c.target === slug));
      setPages((list || []).map((x: any) => ({ id: x.id, slug: x.page_slug, title: x.page_title, is_published: x.is_published, hasDraft: Array.isArray(x.draft_rows), inMenu: inMenu(x.page_slug) })));
      const t = hasTheme((club as any)?.website_theme) ? (club as any).website_theme as SiteTheme : null;
      setTheme(t);
      setSite(siteColours(t));
    })();
    return () => { off = true; };
  }, [clubId, pageSlug]);

  /* ── Edit with history ── */
  const rowsRef = useRef<EventPageRow[]>([]);
  const change = useCallback((next: EventPageRow[], coalesce?: string) => {
    rowsRef.current = next;
    setRows(prev => {
      const h = hist.current;
      const now = Date.now();
      if (!(coalesce && h.key === coalesce && now - h.at < 1200)) h.past = [...h.past.slice(-79), prev];
      h.future = [];
      h.key = coalesce || null;
      h.at = now;
      return next;
    });
    bump(x => x + 1);
  }, []);
  const undo = useCallback(() => {
    const h = hist.current;
    if (!h.past.length) return;
    setRows(cur => { h.future = [cur, ...h.future]; const prev = h.past[h.past.length - 1]; h.past = h.past.slice(0, -1); h.key = null; rowsRef.current = prev; return prev; });
    bump(x => x + 1);
  }, []);
  const redo = useCallback(() => {
    const h = hist.current;
    if (!h.future.length) return;
    setRows(cur => { h.past = [...h.past, cur]; const next = h.future[0]; h.future = h.future.slice(1); h.key = null; rowsRef.current = next; return next; });
    bump(x => x + 1);
  }, []);

  // Drop a selection that no longer exists (after undo or delete)
  useEffect(() => {
    if (!sel) return;
    const { row, col, mod } = getAt(rows, sel);
    if (!row || (sel.kind !== 'row' && !col) || (sel.kind === 'mod' && !mod)) setSel(null);
  }, [rows, sel]);

  /* ── Autosave the draft ── */
  const normal = useMemo(() => normaliseRows(rows), [rows]);
  /** The live layout, normalised the same way so opening a page doesn't count as a change */
  const base = useMemo(() => normaliseRows(Array.isArray(page?.rows) ? page!.rows! : []), [page?.rows]);
  const hasChanges = !!page && !same(normal, base);
  useEffect(() => {
    if (!page) return;
    const t = setTimeout(async () => {
      const draft = same(normal, base) ? null : normal;
      if (draft === null ? page.draft_rows == null : same(draft, page.draft_rows)) return;
      setSave('saving');
      const { error } = await supabase.from('organization_page_layouts').update({ draft_rows: draft as never }).eq('id', page.id);
      if (error) { setSave('error'); return; }
      setPage(p => (p ? { ...p, draft_rows: draft } : p));
      setPages(ps => ps.map(x => (x.id === page.id ? { ...x, hasDraft: draft !== null } : x)));
      setSave('saved');
      setSavedAt(Date.now());
    }, 900);
    return () => clearTimeout(t);
  }, [normal, base, page]);

  /** Ask the canvas to finish any text being typed; resolves once its edit has arrived (or after a moment). */
  const commitWait = useRef(new Map<number, () => void>());
  const commitCanvas = useCallback(() => new Promise<void>(resolve => {
    const win = frame.current?.contentWindow;
    if (!win) { resolve(); return; }
    const ask = Date.now() + Math.random();
    const done = () => { commitWait.current.delete(ask); resolve(); };
    commitWait.current.set(ask, done);
    win.postMessage({ __sb: 1, type: 'commit', ask }, window.location.origin);
    setTimeout(done, 400);
  }), []);

  const flush = useCallback(async () => {
    if (!page) return true;
    await commitCanvas();
    const cur = normaliseRows(rowsRef.current);
    const draft = same(cur, base) ? null : cur;
    if (draft === null ? page.draft_rows == null : same(draft, page.draft_rows)) return true;
    const { error } = await supabase.from('organization_page_layouts').update({ draft_rows: draft as never }).eq('id', page.id);
    if (!error) setPage(p => (p ? { ...p, draft_rows: draft } : p));
    return !error;
  }, [page, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const publish = async () => {
    if (!page) return;
    setPublishing(true);
    await commitCanvas();
    const final = normaliseRows(rowsRef.current);
    const { error } = await supabase.from('organization_page_layouts').update({ rows: final as never, draft_rows: null, is_published: true, updated_at: new Date().toISOString() }).eq('id', page.id);
    setPublishing(false);
    if (error) { addNotification('error', 'Could not publish. Please try again.'); return; }
    setPage(p => (p ? { ...p, rows: final, draft_rows: null, is_published: true } : p));
    setPages(ps => ps.map(x => (x.id === page.id ? { ...x, hasDraft: false, is_published: true } : x)));
    setSave('idle');
    logActivity('published', 'page', page.page_title, page.id);
    addNotification('success', page.is_published ? 'Changes published. They’re on your site now.' : 'Page published. It’s on your site now.');
  };

  const discard = async () => {
    if (!page || !window.confirm('Throw away your changes and go back to the live page?')) return;
    const { error } = await supabase.from('organization_page_layouts').update({ draft_rows: null }).eq('id', page.id);
    if (error) { addNotification('error', 'Could not discard the changes.'); return; }
    setPage(p => (p ? { ...p, draft_rows: null } : p));
    change(page.rows || []);
    setSave('idle');
  };

  const leave = async (to: string) => { await flush(); navigate(to); };

  const logActivity = (action: string, type: string, name: string, id?: string) => {
    supabase.auth.getUser()
      .then(({ data }) => supabase.from('website_activity_log').insert({ club_id: clubId, user_id: data.user?.id || null, action, entity_type: type, entity_name: name, entity_id: id || null }))
      .then(() => undefined, () => undefined);
  };

  /* ── Pages panel: a new page, added to the menu if wanted ── */
  const createPage = async (title: string, slug: string, addToMenu: boolean) => {
    const created = await createOrganizationPage('club', clubId, { page_title: title, page_slug: slug, is_published: false, show_in_navigation: addToMenu } as never);
    if (!created) { addNotification('error', 'Could not create the page. Please try again.'); return false; }
    logActivity('created', 'page', title, (created as { id?: string }).id);
    if (addToMenu) {
      // Start from the saved menu and drop any old item for the same address, so the page is never listed twice
      const { data } = await supabase.from('clubs').select('website_menu').eq('id', clubId).maybeSingle();
      const isIt = (i: SiteMenuItem) => i.kind === 'page' && i.target === slug;
      const items = [
        ...resolveMenu((data as { website_menu?: unknown } | null)?.website_menu).filter(i => !isIt(i)).map(i => (i.children ? { ...i, children: i.children.filter(c => !isIt(c)) } : i)),
        { id: Math.random().toString(36).slice(2, 10), kind: 'page' as const, label: title, target: slug },
      ];
      const { error } = await supabase.from('clubs').update({ website_menu: { items } } as never).eq('id', clubId);
      if (error) addNotification('error', 'Page created, but it could not be added to the menu.');
    }
    await leave(`/website/pages/edit/${slug}`);
    return true;
  };

  /* ── Site styles: preview on the canvas, save for the whole site ── */
  const themeRef = useRef<SiteTheme | null>(null);
  themeRef.current = theme;
  const postTheme = useCallback((t: SiteTheme | null) => {
    themePreview.current = t;
    const show = t ?? themeRef.current;
    frame.current?.contentWindow?.postMessage({ type: 'alfie-site-preview', theme: show }, window.location.origin);
    setSite(siteColours(show));
  }, []);
  useEffect(() => {
    // The canvas header asks for the preview look when it (re)loads
    const onReady = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || e.data?.type !== 'alfie-site-preview-ready') return;
      if (themePreview.current) postTheme(themePreview.current);
    };
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, [postTheme]);
  const saveTheme = async (t: SiteTheme) => {
    const { error } = await supabase.from('clubs').update({ website_theme: t } as never).eq('id', clubId);
    if (error) { addNotification('error', 'Could not save the styles. Please try again.'); return false; }
    themeRef.current = t;
    setTheme(t);
    logActivity('updated', 'design', 'Website design');
    addNotification('success', 'Styles saved. Your whole site has the new look.');
    return true;
  };

  /* ── Canvas sizing ── */
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [page]);
  const devW = DEVICES.find(d => d.id === device)!.width;
  // Shrink the page to fit when the screen is narrower than the device (the layout inside stays the device's)
  const fitW = Math.max(280, areaW - (device === 'desktop' ? 40 : 64));
  const scale = fitW < devW ? fitW / devW : 1;

  /* ── Talk to the canvas ── */
  const send = useCallback((m: CanvasIn) => frame.current?.contentWindow?.postMessage({ __sb: 1, ...m }, window.location.origin), []);
  useEffect(() => { if (frameReady) send({ type: 'state', rows, sel, showHidden, title: page?.page_title || '' }); }, [rows, sel, showHidden, frameReady, page?.page_title, send]);

  const selectById = useCallback((kind: 'row' | 'col' | 'mod' | null, id: string | null) => {
    setSel(kind && id ? findSel(rows, id, kind) : null);
  }, [rows]);

  const act = useCallback((a: string, s: Sel | null = sel) => {
    if (!s) return;
    if (a === 'del') { change(removeAt(rows, s)); setSel(null); }
    if (a === 'dup') { const r = duplicateAt(rows, s); change(r.rows); setSel(r.sel); }
    if (a === 'up' || a === 'down') change(moveAt(rows, s, a === 'up' ? -1 : 1));
  }, [rows, sel, change]);

  const insertItem = useCallback((item: DragItem, where?: DropTarget | null) => {
    const target = where ?? (insertAt?.kind === 'col' ? { kind: 'col' as const, col: insertAt.col, index: Number.MAX_SAFE_INTEGER } : insertAt?.kind === 'index' ? { kind: 'page' as const, index: insertAt.index } : null);
    if (item.kind === 'module') {
      const mod = makeModule(item.def.type);
      if (target?.kind === 'col') {
        const next = insertModule(rows, target.col, mod, target.index);
        change(next);
        const s = findSel(next, mod.id, 'mod'); setSel(s);
      } else if (target?.kind === 'page') {
        const row = makeRow([12], [[mod]]);
        change(insertRow(rows, row, target.index));
        setSel({ kind: 'mod', row: row.id, col: row.columns[0].id, mod: mod.id });
      } else {
        const r = placeModule(rows, sel, mod);
        change(r.rows); setSel(r.sel);
      }
      setTimeout(() => send({ type: 'scrollTo', id: mod.id }), 120);
    } else {
      const row = item.kind === 'section' ? item.def.make() : makeRow(item.widths);
      let index = rows.length;
      if (target?.kind === 'page') index = target.index;
      else if (target?.kind === 'col') index = rows.findIndex(r => r.columns.some(c => c.id === target.col)) + 1;
      else if (sel) index = rows.findIndex(r => r.id === sel.row) + 1;
      change(insertRow(rows, row, index));
      setSel({ kind: 'row', row: row.id });
      setTimeout(() => send({ type: 'scrollTo', id: row.id }), 120);
    }
    setInsertAt(null);
  }, [rows, sel, insertAt, change, send]);

  const copy = useCallback(() => {
    const { row, mod } = getAt(rows, sel);
    if (sel?.kind === 'mod' && mod) { clip.current = { kind: 'mod', mod }; addNotification('success', 'Copied. Select where it goes and paste.'); }
    else if (sel?.kind === 'row' && row) { clip.current = { kind: 'row', row }; addNotification('success', 'Section copied. Paste puts it after the selected section.'); }
  }, [rows, sel, addNotification]);
  const paste = useCallback(() => {
    const c = clip.current;
    if (!c) return;
    if (c.kind === 'mod') { const r = placeModule(rows, sel, cloneModule(c.mod)); change(r.rows); setSel(r.sel); }
    else { const row = cloneRow(c.row); const i = sel ? rows.findIndex(r => r.id === sel.row) + 1 : rows.length; change(insertRow(rows, row, i)); setSel({ kind: 'row', row: row.id }); }
  }, [rows, sel, change]);

  const onKey = useCallback((key: string, meta: boolean, shift: boolean) => {
    const k = key.toLowerCase();
    if (meta && k === 'z') { shift ? redo() : undo(); return; }
    if (meta && k === 'y') { redo(); return; }
    if (meta && k === 'k') { setQa(true); return; }
    if (meta && k === 's') { flush().then(ok => ok && addNotification('success', 'Draft saved')); return; }
    if (meta && k === 'd') { act('dup'); return; }
    if (meta && k === 'c') { copy(); return; }
    if (meta && k === 'v') { paste(); return; }
    if (key === 'Escape') { if (sel?.kind === 'mod') setSel({ kind: 'col', row: sel.row, col: sel.col }); else if (sel?.kind === 'col') setSel({ kind: 'row', row: sel.row }); else setSel(null); return; }
    if ((key === 'Delete' || key === 'Backspace') && sel) { act('del'); }
  }, [undo, redo, flush, act, copy, paste, sel, addNotification]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow || !e.data?.__sb) return;
      const m = e.data as CanvasOut;
      if (m.type === 'ready') setFrameReady(true);
      if (m.type === 'select') selectById(m.kind, m.id);
      if (m.type === 'act') act(m.act, m.sel);
      if (m.type === 'drop' && dragItem.current) { insertItem(dragItem.current, m.target); dragItem.current = null; }
      if (m.type === 'move') {
        const t = m.target;
        if (t.kind === 'col') { const next = moveModule(rows, m.mod, t.col, t.index); change(next); setSel(findSel(next, m.mod, 'mod')); }
      }
      if (m.type === 'committed') commitWait.current.get(m.ask)?.();
      if (m.type === 'inline') change(patchModSettings(rowsRef.current, m.mod, { [m.key]: m.key === 'content' ? cleanHtml(m.value) : m.value }), `${m.mod}:${m.key}`);
      if (m.type === 'insert') { setInsertAt({ kind: 'index', index: m.index }); setLeft('insert'); setInsertTab('sections'); }
      if (m.type === 'addModule') { setInsertAt({ kind: 'col', col: m.col }); setLeft('insert'); setInsertTab('modules'); const s = findSel(rows, m.col, 'col'); if (s) setSel(s); }
      if (m.type === 'key') onKey(m.key, m.meta, m.shift);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [rows, act, insertItem, change, selectById, onKey]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName);
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); setQa(true); return; }
      if (typing) return;
      if (meta && ['z', 'y', 's', 'd', 'c', 'v'].includes(e.key.toLowerCase())) e.preventDefault();
      if (meta || ['Delete', 'Backspace', 'Escape'].includes(e.key)) onKey(e.key, meta, e.shiftKey);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onKey]);

  // Leaving with unsaved edits: save them first
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (page && !same(normal, page.draft_rows ?? base)) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [normal, base, page]);

  /* ── Quick actions ── */
  const actions = useMemo<QuickAction[]>(() => {
    const out: QuickAction[] = [];
    const { mod, row } = getAt(rows, sel);
    const what = sel?.kind === 'mod' && mod ? moduleLabel(mod) : sel?.kind === 'row' && row ? (row.name || 'section') : sel?.kind === 'col' ? 'column' : '';
    if (sel) {
      const word = device === 'mobile' ? 'phones' : device === 'tablet' ? 'tablets' : 'desktop';
      const item = sel.kind === 'mod' ? mod : sel.kind === 'row' ? row : getAt(rows, sel).col;
      const hidden = !!(item as any)?.hideOn?.includes(device);
      out.push({ id: 'hide', group: 'Actions', label: `${hidden ? 'Show' : 'Hide'} ${what} on ${word}`, icon: hidden ? <Eye size={15} /> : <EyeOff size={15} />, run: () => {
        if (sel.kind === 'mod' && mod) change(patchMod(rows, mod.id, { hideOn: toggleHide(mod, device).hideOn }));
        else if (sel.kind === 'row' && row) change(patchRow(rows, row.id, { hideOn: toggleHide(row, device).hideOn }));
        else if (sel.kind === 'col') { const c = getAt(rows, sel).col; if (c) change(patchCol(rows, c.id, { hideOn: toggleHide(c, device).hideOn })); }
      } });
      if (sel.kind !== 'col') {
        out.push({ id: 'dup', group: 'Actions', label: `Duplicate ${what}`, hint: '⌘D', run: () => act('dup') });
        out.push({ id: 'up', group: 'Actions', label: `Move ${what} up`, run: () => act('up') });
        out.push({ id: 'down', group: 'Actions', label: `Move ${what} down`, run: () => act('down') });
        out.push({ id: 'copy', group: 'Actions', label: `Copy ${what}`, hint: '⌘C', run: copy });
      }
      out.push({ id: 'del', group: 'Actions', label: `Delete ${what}`, hint: 'Delete', run: () => act('del') });
    }
    if (clip.current) out.push({ id: 'paste', group: 'Actions', label: 'Paste', hint: '⌘V', run: paste });
    out.push({ id: 'undo', group: 'Actions', label: 'Undo', hint: '⌘Z', icon: <Undo2 size={15} />, run: undo });
    out.push({ id: 'publish', group: 'Actions', label: page?.is_published ? 'Publish changes' : 'Publish page', icon: <Send size={15} />, run: publish });
    MODULES.forEach(m => out.push({ id: `ins-${m.type}`, group: 'Insert', label: m.label, hint: m.note, icon: <ModuleIcon type={m.type} size={15} />, run: () => insertItem({ kind: 'module', def: m }) }));
    SECTIONS.forEach(s => out.push({ id: `sec-${s.id}`, group: 'Insert', label: `${s.label} section`, hint: s.note, icon: <Plus size={15} />, run: () => insertItem({ kind: 'section', def: s }) }));
    pages.filter(p => p.slug !== pageSlug).forEach(p => out.push({ id: `pg-${p.id}`, group: 'Go to', label: `Page · ${p.title}`, hint: p.is_published ? `/${p.slug}` : 'Draft', icon: <FileText size={15} />, run: () => leave(`/website/pages/edit/${p.slug}`) }));
    out.push({ id: 'go-pages', group: 'Go to', label: 'Pages', hint: 'Switch page or add one', icon: <FileText size={15} />, run: () => setLeft('pages') });
    out.push({ id: 'go-styles', group: 'Go to', label: 'Site styles', hint: 'Colours, fonts, corners', icon: <Palette size={15} />, run: () => setLeft('styles') });
    out.push({ id: 'go-menu', group: 'Go to', label: 'Menu and page order', icon: <FileText size={15} />, run: () => leave('/website/pages') });
    DEVICES.forEach(d => out.push({ id: `dev-${d.id}`, group: 'View', label: `Edit for ${d.label.toLowerCase()}`, hint: `${d.width} px`, icon: <DeviceIcon d={d.id} size={15} />, run: () => setDevice(d.id) }));
    out.push({ id: 'hidden', group: 'View', label: showHidden ? 'Don’t show hidden items while editing' : 'Show hidden items while editing', icon: <EyeOff size={15} />, run: () => setShowHidden(v => !v) });
    out.push({ id: 'layers', group: 'View', label: 'Layers', icon: <Layers size={15} />, run: () => setLeft('layers') });
    out.push({ id: 'preview', group: 'View', label: 'Preview in a new tab', icon: <ExternalLink size={15} />, run: () => openPreview() });
    return out;
  }, [rows, sel, device, pages, pageSlug, showHidden, page?.is_published]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPreview = async () => {
    await flush();
    if (page) window.open(`/club/${clubId}/public/__builder?preview=${page.id}`, '_blank', 'noopener');
  };

  if (missing) {
    return (
      <div className="sb-root sb-missing">
        <div><b>This page isn’t here any more.</b><span>It may have been deleted or renamed.</span><button type="button" className="sb-btn" onClick={() => navigate('/website/pages')}>Back to pages</button></div>
      </div>
    );
  }
  if (!page) return <div className="sb-root sb-missing"><Loader2 className="sb-spin" size={22} /></div>;

  const status = !page.is_published ? { cls: 'draft', t: 'Draft' } : hasChanges ? { cls: 'chg', t: 'Unpublished changes' } : { cls: 'live', t: 'Live' };
  const target = insertAt?.kind === 'col' ? 'to the selected column' : insertAt?.kind === 'index' ? 'at the marked spot' : sel?.kind === 'mod' ? 'below the selection' : sel ? 'to the selection' : 'to the end of the page';
  const { row: sRow, col: sCol, mod: sMod } = getAt(rows, sel);

  return (
    <div className="sb-root">
      {/* Top bar */}
      <header className="sb-top">
        <button type="button" className="sb-ib" onClick={() => leave('/website/pages')} aria-label="Back to pages" title="Back to pages"><ArrowLeft size={18} /></button>
        <span className="sb-club">{clubLogo ? <img src={clubLogo} alt="" /> : <b>{clubAbbr}</b>}</span>
        <div className="sb-where">
          <small>Club website · {clubName}</small>
          <div style={{ position: 'relative' }}>
            <button type="button" className="sb-pagebtn" onClick={() => setPageMenu(v => !v)} aria-haspopup="menu" aria-expanded={pageMenu}>
              {page.page_title}<ChevronDown size={14} /><span className={`sb-status ${status.cls}`}><i />{status.t}</span>
            </button>
            {pageMenu && (
              <div className="sb-menu" role="menu" onMouseLeave={() => setPageMenu(false)}>
                <div className="gh">Pages</div>
                {pages.map(p => (
                  <button key={p.id} type="button" role="menuitem" className={p.slug === pageSlug ? 'on' : ''} onClick={() => { setPageMenu(false); if (p.slug !== pageSlug) leave(`/website/pages/edit/${p.slug}`); }}>
                    <FileText size={14} />{p.title}<small>{p.is_published ? `/${p.slug}` : 'Draft'}</small>
                  </button>
                ))}
                <div className="sep" />
                <button type="button" role="menuitem" onClick={() => { setPageMenu(false); setPageSettings(true); }}><Settings2 size={14} />Page settings</button>
                <button type="button" role="menuitem" onClick={() => { setPageMenu(false); setLeft('pages'); }}><Plus size={14} />New page</button>
                <button type="button" role="menuitem" onClick={() => leave('/website/pages')}><FileText size={14} />Menu and page order</button>
              </div>
            )}
          </div>
        </div>
        <div className="sb-devs" role="radiogroup" aria-label="Screen size">
          {DEVICES.map(d => <button key={d.id} type="button" role="radio" aria-checked={device === d.id} className={device === d.id ? 'on' : ''} onClick={() => setDevice(d.id)} title={`${d.label} · ${d.width} px`}><DeviceIcon d={d.id} size={15} /><span>{d.label}</span></button>)}
          <span className="sb-devw">{devW} px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}</span>
        </div>
        <div className="sb-hist">
          <button type="button" className="sb-ib" onClick={undo} disabled={!hist.current.past.length} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={17} /></button>
          <button type="button" className="sb-ib" onClick={redo} disabled={!hist.current.future.length} aria-label="Redo" title="Redo (⌘⇧Z)"><Redo2 size={17} /></button>
        </div>
        <button type="button" className="sb-find" onClick={() => setQa(true)}><Command size={14} /><span>Find or do anything</span><kbd>⌘K</kbd></button>
        <span className="sb-save" aria-live="polite" title={savedAt ? `Last saved ${new Date(savedAt).toLocaleTimeString()}` : undefined}>
          {save === 'saving' ? <><Loader2 size={13} className="sb-spin" />Saving…</> : save === 'error' ? <span className="err">Not saved. Check your connection.</span> : hasChanges ? <><Check size={13} />Draft saved</> : page.is_published ? 'No changes' : 'Draft'}
        </span>
        {hasChanges && page.is_published && <button type="button" className="sb-ib" onClick={discard} title="Discard changes" aria-label="Discard changes"><RotateCcw size={16} /></button>}
        <button type="button" className="sb-btn" onClick={openPreview}><Eye size={15} />Preview</button>
        <button type="button" className="sb-btn sb-btn-p" onClick={publish} disabled={publishing || (page.is_published && !hasChanges)}>
          {publishing ? <Loader2 size={15} className="sb-spin" /> : <Send size={15} />}{page.is_published ? 'Publish changes' : 'Publish page'}
        </button>
      </header>

      <div className={`sb-body${left ? ' with-lp' : ''}`}>
        {/* Tool rail */}
        <nav className="sb-rail" aria-label="Builder tools">
          <button type="button" className={left === 'insert' ? 'on' : ''} onClick={() => setLeft(left === 'insert' ? null : 'insert')} title="Insert" aria-label="Insert"><Plus size={19} /></button>
          <button type="button" className={left === 'layers' ? 'on' : ''} onClick={() => setLeft(left === 'layers' ? null : 'layers')} title="Layers" aria-label="Layers"><Layers size={18} /></button>
          <span className="sp" />
          <button type="button" className={left === 'pages' ? 'on' : ''} onClick={() => setLeft(left === 'pages' ? null : 'pages')} title="Pages" aria-label="Pages"><FileText size={18} /></button>
          <button type="button" className={left === 'styles' ? 'on' : ''} onClick={() => setLeft(left === 'styles' ? null : 'styles')} title="Site styles" aria-label="Site styles"><Palette size={18} /></button>
          <button type="button" className={showHidden ? '' : 'on'} onClick={() => setShowHidden(v => !v)} title={showHidden ? 'Hide hidden items while editing' : 'Show hidden items while editing'} aria-label="Show hidden items"><EyeOff size={18} /></button>
        </nav>

        {left && (
          <aside className="sb-lp">
            {left === 'insert'
              ? <InsertPanel tab={insertTab} setTab={setInsertTab} target={target} onPick={item => insertItem(item)} onClose={() => { setLeft(null); setInsertAt(null); }}
                  onDragStart={item => { dragItem.current = item; send({ type: 'drag', active: true, kind: item.kind === 'module' ? 'module' : 'section' }); }}
                  onDragEnd={() => { send({ type: 'drag', active: false }); setTimeout(() => { dragItem.current = null; }, 300); }} />
              : left === 'layers'
                ? <LayersPanel rows={rows} sel={sel} device={device} onSelect={s => { setSel(s); send({ type: 'scrollTo', id: s.kind === 'mod' ? s.mod : s.kind === 'col' ? s.col : s.row }); }} onChange={r => change(r)} onClose={() => setLeft(null)} />
                : left === 'pages'
                  ? <PagesPanel pages={pages} current={pageSlug || ''} onOpen={slug => leave(`/website/pages/edit/${slug}`)} onSettings={() => setPageSettings(true)} onCreate={createPage} onManage={() => leave('/website/pages')} onClose={() => setLeft(null)} />
                  : <StylesPanel saved={theme} onPreview={postTheme} onSave={saveTheme} onMore={() => leave('/website/theme')} onClose={() => setLeft(null)} />}
          </aside>
        )}

        {/* Canvas */}
        <main className="sb-canvas" ref={area}>
          {insertAt && <div className="sb-banner"><Plus size={14} />Pick something on the left to add it {insertAt.kind === 'col' ? 'to this column' : 'here'}.<button type="button" className="sb-link" onClick={() => setInsertAt(null)}>Cancel</button></div>}
          {device !== 'desktop' && <div key={device} className="sb-banner dev"><DeviceIcon d={device} size={14} />Editing for {device === 'mobile' ? 'phones' : 'tablets'}. Spacing, sizes and what’s hidden are set for this screen; content is the same everywhere.</div>}
          <div className={`sb-frame-wrap ${device}`} style={{ width: scale < 1 ? fitW : devW, height: '100%' }}>
            <iframe
              ref={frame}
              title="Page canvas"
              src={`/club/${clubId}/public/__builder?sitePreview=1`}
              style={scale < 1 ? { width: devW, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left' } : { width: devW, height: '100%' }}
            />
          </div>
          <div className="sb-crumbs" aria-label="Selected">
            <button type="button" onClick={() => setSel(null)}>{page.page_title}</button>
            {sRow && <><span>›</span><button type="button" className="row" onClick={() => setSel({ kind: 'row', row: sRow.id })}>{sRow.name || `Section ${rows.indexOf(sRow) + 1}`}</button></>}
            {sCol && sRow && sRow.columns.length > 1 && <><span>›</span><button type="button" className="col" onClick={() => setSel({ kind: 'col', row: sRow.id, col: sCol.id })}>Column {sRow.columns.indexOf(sCol) + 1}</button></>}
            {sMod && <><span>›</span><button type="button" className="mod">{moduleLabel(sMod)}</button></>}
            <span className="sp" />
            <span className="dim">{device === 'desktop' ? 'Editing desktop · tablet and phone follow' : `Editing ${device === 'mobile' ? 'phone' : 'tablet'}`}</span>
          </div>
        </main>

        {/* Settings */}
        <aside className="sb-rp">
          <SettingsPanel rows={rows} sel={sel} device={device} clubId={clubId} pages={pages.map(p => ({ slug: p.slug, title: p.title }))} site={site} onChange={change} onAct={a => act(a)} onSelect={setSel} />
        </aside>
      </div>

      {qa && <QuickActions actions={actions} onClose={() => setQa(false)} />}
      {pageSettings && <PageSettings page={page} onClose={() => setPageSettings(false)} onSaved={p => { setPage(x => (x ? { ...x, ...p } : x)); setPages(list => list.map(l => (l.id === page.id ? { ...l, title: p.page_title } : l))); }} />}
    </div>
  );
};

const PageSettings: React.FC<{ page: PageRow; onClose: () => void; onSaved: (p: { page_title: string; meta_title: string | null; meta_description: string | null }) => void }> = ({ page, onClose, onSaved }) => {
  const { addNotification } = useNotifications();
  const [title, setTitle] = useState(page.page_title);
  const [mt, setMt] = useState(page.meta_title || '');
  const [md, setMd] = useState(page.meta_description || '');
  const [busy, setBusy] = useState(false);
  const saveIt = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const patch = { page_title: title.trim(), meta_title: mt.trim() || null, meta_description: md.trim() || null };
    const { error } = await supabase.from('organization_page_layouts').update(patch).eq('id', page.id);
    setBusy(false);
    if (error) { addNotification('error', 'Could not save the page settings.'); return; }
    onSaved(patch);
    addNotification('success', 'Page settings saved');
    onClose();
  };
  return (
    <div className="sb-qa-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Page settings">
      <div className="sb-dlg">
        <div className="sb-dlg-h"><b>Page settings</b><button type="button" className="sb-ib" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="sb-dlg-b">
          <label className="sb-lab">Page name<input className="sb-in" value={title} onChange={e => setTitle(e.target.value)} /></label>
          <div className="sb-hint">Web address: /{page.page_slug}</div>
          <label className="sb-lab">Title in Google and browser tabs<input className="sb-in" value={mt} onChange={e => setMt(e.target.value)} placeholder={page.page_title} /></label>
          <label className="sb-lab">Description in Google<textarea className="sb-in sb-ta" rows={3} value={md} onChange={e => setMd(e.target.value)} placeholder="One or two sentences about this page" /></label>
          <div className="sb-hint">{md.length}/160 characters</div>
        </div>
        <div className="sb-dlg-f"><button type="button" className="sb-btn" onClick={onClose}>Cancel</button><button type="button" className="sb-btn sb-btn-p" onClick={saveIt} disabled={busy || !title.trim()}>{busy ? <Loader2 size={15} className="sb-spin" /> : null}Save</button></div>
      </div>
    </div>
  );
};

export default SiteBuilder;

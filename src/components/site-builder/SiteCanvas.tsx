import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { PUBLIC_CLUB_COLUMNS } from '../../utils/publicClubColumns';
import type { Club } from '../../types/club';
import type { DeviceType, EventPageRow } from '../../types/eventWidgets';
import { PublicHeader } from '../public/PublicHeader';
import { PublicFooter } from '../public/PublicFooter';
import { PageRows, deviceFor } from '../site/PageRows';
import type { SiteEdit } from '../site/SiteModules';
import { moduleLabel, type Sel } from './model';
import '../../styles/site-builder-canvas.css';

/*
 * The site builder's canvas. It runs inside an iframe in the builder and renders the page exactly like
 * the public site (same header, rows, modules and theme), plus outlines, toolbars and drop targets.
 * The builder owns the page; this frame only draws it and reports what the person clicks, drops or types.
 */

export type CanvasIn =
  | { type: 'state'; rows: EventPageRow[]; sel: Sel | null; showHidden: boolean; title: string }
  | { type: 'drag'; active: boolean; kind?: 'module' | 'section' }
  | { type: 'scrollTo'; id: string }
  | { type: 'commit'; ask: number };

export type DropTarget = { kind: 'col'; col: string; index: number } | { kind: 'page'; index: number };
export type CanvasOut =
  | { type: 'ready' }
  | { type: 'select'; kind: 'row' | 'col' | 'mod' | null; id: string | null }
  | { type: 'act'; act: string; sel: Sel }
  | { type: 'drop'; target: DropTarget }
  | { type: 'move'; mod: string; target: DropTarget }
  | { type: 'inline'; mod: string; key: string; value: string }
  | { type: 'insert'; index: number }
  | { type: 'addModule'; col: string }
  | { type: 'key'; key: string; meta: boolean; shift: boolean }
  | { type: 'committed'; ask: number };

const post = (m: CanvasOut) => window.parent.postMessage({ __sb: 1, ...m }, window.location.origin);

interface Box { top: number; left: number; width: number; height: number }
const boxOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height };
};

const I = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />;
const ICONS = {
  up: I('<path d="m18 15-6-6-6 6"/>'),
  down: I('<path d="m6 9 6 6 6-6"/>'),
  dup: I('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  del: I('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'),
  move: I('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  plus: I('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  cog: I('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  bold: I('<path d="M14 12a4 4 0 0 0 0-8H6v8"/><path d="M15 20a4 4 0 0 0 0-8H6v8Z"/>'),
  italic: I('<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  list: I('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>'),
  quote: I('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>'),
};

/** Preview of a page's latest changes in its own tab (signed-in club admins only, through page permissions). */
const PreviewPage: React.FC<{ clubId: string; pageId: string }> = ({ clubId, pageId }) => {
  const [club, setClub] = useState<Club | null>(null);
  const [page, setPage] = useState<{ title: string; rows: EventPageRow[] } | null | 'missing'>(null);
  useEffect(() => {
    Promise.all([
      supabase.from('clubs').select(PUBLIC_CLUB_COLUMNS).eq('id', clubId).maybeSingle(),
      supabase.from('organization_page_layouts').select('page_title, rows, draft_rows').eq('id', pageId).eq('club_id', clubId).maybeSingle(),
    ]).then(([{ data: c }, { data: p }]) => {
      if (c) setClub({ ...(c as any), committeePositions: [] } as Club);
      const pp = p as any;
      setPage(pp ? { title: pp.page_title, rows: (Array.isArray(pp.draft_rows) ? pp.draft_rows : pp.rows) || [] } : 'missing');
      if (pp) document.title = `Preview · ${pp.page_title}`;
    });
  }, [clubId, pageId]);
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="sbc-prev">Preview of your latest changes. Visitors see them once you publish.</div>
      <PublicHeader club={club} activePage="" />
      <main className="pt-20 flex-1">
        {page === null ? <div className="py-32 text-center text-gray-500">Loading…</div>
          : page === 'missing' ? <div className="py-32 text-center text-gray-600">Sign in as a club admin to preview this page.</div>
          : <PageRows rows={page.rows} websiteId={clubId} />}
      </main>
      {club && <PublicFooter club={club} clubId={clubId} />}
    </div>
  );
};

export const SiteCanvas: React.FC = () => {
  const previewId = new URLSearchParams(window.location.search).get('preview');
  const { clubId: cid } = useParams<{ clubId: string }>();
  if (previewId && cid) return <PreviewPage clubId={cid} pageId={previewId} />;
  return <CanvasFrame />;
};

const CanvasFrame: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const [club, setClub] = useState<Club | null>(null);
  const [st, setSt] = useState<{ rows: EventPageRow[]; sel: Sel | null; showHidden: boolean; title: string } | null>(null);
  const [drag, setDrag] = useState<{ active: boolean; kind?: 'module' | 'section'; internal?: string }>({ active: false });
  const [hover, setHover] = useState<{ kind: 'row' | 'col' | 'mod'; id: string } | null>(null);
  const [drop, setDrop] = useState<{ target: DropTarget; line: Box } | null>(null);
  const [tick, setTick] = useState(0);
  const [device, setDevice] = useState<DeviceType>(() => deviceFor(window.innerWidth));
  const [richFocus, setRichFocus] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clubId) return;
    supabase.from('clubs').select(PUBLIC_CLUB_COLUMNS).eq('id', clubId).maybeSingle().then(({ data }) => { if (data) setClub({ ...(data as any), committeePositions: [] } as Club); });
  }, [clubId]);

  // Messages from the builder
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent || !e.data?.__sb) return;
      const m = e.data as CanvasIn;
      if (m.type === 'state') setSt({ rows: m.rows, sel: m.sel, showHidden: m.showHidden, title: m.title });
      if (m.type === 'drag') { setDrag({ active: m.active, kind: m.kind }); if (!m.active) setDrop(null); }
      if (m.type === 'commit') {
        // Finish any text being typed (its edit is posted first), then say so
        const a = document.activeElement as HTMLElement | null;
        if (a?.dataset?.sbInline !== undefined) a.blur();
        post({ type: 'committed', ask: m.ask });
      }
      if (m.type === 'scrollTo') {
        const el = document.querySelector(`[data-sb-mod="${m.id}"],[data-sb-col="${m.id}"],[data-sb-row="${m.id}"]`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    window.addEventListener('message', onMsg);
    post({ type: 'ready' });
    const onResize = () => { setDevice(deviceFor(window.innerWidth)); setTick(t => t + 1); };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', () => setTick(t => t + 1), { passive: true });
    return () => { window.removeEventListener('message', onMsg); window.removeEventListener('resize', onResize); };
  }, []);

  // Outlines follow the layout as images load and text changes
  useEffect(() => {
    if (!root.current) return;
    const ro = new ResizeObserver(() => setTick(t => t + 1));
    ro.observe(root.current);
    return () => ro.disconnect();
  }, [st === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing on the canvas navigates away; keys go to the builder unless typing
  useEffect(() => {
    const stop = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (a) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      const meta = e.metaKey || e.ctrlKey;
      if (typing && e.key === 'Escape') { (e.target as HTMLElement).blur(); return; } // done typing: keep the text
      if (typing && !(meta && ['z', 'k', 's'].includes(e.key.toLowerCase()))) return;
      if (meta && e.key.toLowerCase() === 'z' && typing) return; // let the text field undo its own typing
      if (meta || ['Delete', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (meta && ['k', 's', 'z', 'd', 'c', 'v'].includes(e.key.toLowerCase())) e.preventDefault();
        post({ type: 'key', key: e.key, meta, shift: e.shiftKey });
      }
    };
    // Clicking into the builder (Publish, the settings panel) doesn't blur text being typed on the canvas,
    // so finish the edit when the canvas loses focus: the edit is saved before anything else happens
    const onWinBlur = () => {
      const a = document.activeElement as HTMLElement | null;
      if (a?.dataset?.sbInline !== undefined) a.blur();
    };
    document.addEventListener('click', stop, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onWinBlur);
    return () => { document.removeEventListener('click', stop, true); document.removeEventListener('keydown', onKey); window.removeEventListener('blur', onWinBlur); };
  }, []);

  const edit = useMemo<SiteEdit>(() => ({ device, inline: (mod, key, value) => post({ type: 'inline', mod, key, value }) }), [device]);

  const sel = st?.sel || null;
  const selEl = useMemo(() => {
    if (!sel) return null;
    const id = sel.kind === 'mod' ? sel.mod : sel.kind === 'col' ? sel.col : sel.row;
    return document.querySelector(`[data-sb-${sel.kind}="${id}"]`);
  }, [sel, st, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const selBox = boxOf(selEl);
  const hovEl = hover && !(sel && ((sel.kind === 'mod' && sel.mod === hover.id) || (sel.kind === 'col' && sel.col === hover.id) || (sel.kind === 'row' && sel.row === hover.id)))
    ? document.querySelector(`[data-sb-${hover.kind}="${hover.id}"]`) : null;
  const hovBox = boxOf(hovEl);
  void tick;

  /* Click and hover: the innermost thing under the pointer */
  const hitAt = (t: HTMLElement): { kind: 'row' | 'col' | 'mod'; id: string } | null => {
    const mod = t.closest('[data-sb-mod]');
    if (mod) return { kind: 'mod', id: mod.getAttribute('data-sb-mod')! };
    const col = t.closest('[data-sb-col]');
    if (col) return { kind: 'col', id: col.getAttribute('data-sb-col')! };
    const row = t.closest('[data-sb-row]');
    if (row) return { kind: 'row', id: row.getAttribute('data-sb-row')! };
    return null;
  };

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-sb-ui]')) return;
    const empty = t.closest('[data-sb-colempty]');
    if (empty) { post({ type: 'addModule', col: empty.getAttribute('data-sb-colempty')! }); return; }
    const h = hitAt(t);
    post({ type: 'select', kind: h?.kind || null, id: h?.id || null });
  };

  /* Drop targets: modules go into the nearest column, sections between sections */
  const targetAt = useCallback((x: number, y: number, kind: 'module' | 'section'): { target: DropTarget; line: Box } | null => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-sb-row]'));
    if (kind === 'section') {
      if (!rows.length) {
        const pg = document.querySelector('[data-sb-page]');
        const b = boxOf(pg);
        return b ? { target: { kind: 'page', index: 0 }, line: { top: b.top + 40, left: b.left + 40, width: b.width - 80, height: 4 } } : null;
      }
      let index = rows.length;
      for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
      const ref = rows[Math.min(index, rows.length - 1)].getBoundingClientRect();
      const top = (index < rows.length ? ref.top : ref.bottom) + window.scrollY - 2;
      return { target: { kind: 'page', index }, line: { top, left: ref.left + window.scrollX, width: ref.width, height: 4 } };
    }
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    let col = el?.closest('[data-sb-col]') as HTMLElement | null;
    if (!col) {
      // Nearest column on that row, else the nearest column overall
      const row = el?.closest('[data-sb-row]') || null;
      const cols = Array.from((row || document).querySelectorAll<HTMLElement>('[data-sb-col]'));
      let best: HTMLElement | null = null; let bd = Infinity;
      cols.forEach(c => { const r = c.getBoundingClientRect(); const dx = Math.max(r.left - x, 0, x - r.right); const dy = Math.max(r.top - y, 0, y - r.bottom); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } });
      col = best;
    }
    if (!col) return null;
    const mods = Array.from(col.querySelectorAll<HTMLElement>(':scope > [data-sb-mod]'));
    let index = mods.length;
    for (let i = 0; i < mods.length; i++) { const r = mods[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
    const cr = col.getBoundingClientRect();
    let top: number;
    if (!mods.length) top = cr.top + cr.height / 2;
    else if (index < mods.length) top = mods[index].getBoundingClientRect().top - 2;
    else top = mods[mods.length - 1].getBoundingClientRect().bottom + 2;
    return { target: { kind: 'col', col: col.getAttribute('data-sb-col')!, index }, line: { top: top + window.scrollY - 2, left: cr.left + window.scrollX + 4, width: cr.width - 8, height: 4 } };
  }, []);

  useEffect(() => {
    const over = (e: DragEvent) => {
      const kind = drag.internal ? 'module' : drag.kind;
      if (!drag.active && !drag.internal) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = drag.internal ? 'move' : 'copy';
      setDrop(targetAt(e.clientX, e.clientY, kind || 'module'));
    };
    const dropH = (e: DragEvent) => {
      if (!drag.active && !drag.internal) return;
      e.preventDefault();
      const t = targetAt(e.clientX, e.clientY, (drag.internal ? 'module' : drag.kind) || 'module');
      if (t) { if (drag.internal) post({ type: 'move', mod: drag.internal, target: t.target }); else post({ type: 'drop', target: t.target }); }
      setDrop(null);
      if (drag.internal) setDrag({ active: false });
    };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDrop(null); };
    document.addEventListener('dragover', over);
    document.addEventListener('drop', dropH);
    document.addEventListener('dragleave', leave);
    return () => { document.removeEventListener('dragover', over); document.removeEventListener('drop', dropH); document.removeEventListener('dragleave', leave); };
  }, [drag, targetAt]);

  /* Rich text: a small format bar while typing in a Text module */
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      setRichFocus(t?.getAttribute?.('data-sb-inline') === 'content' ? t : null);
    };
    const onBlur = () => setTimeout(() => { if (!document.activeElement || document.activeElement.getAttribute('data-sb-inline') !== 'content') setRichFocus(null); }, 120);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur); };
  }, []);
  const fmt = (cmd: string, val?: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (cmd === 'createLink') {
      const url = window.prompt('Link to (a web address, or a page like /contact)');
      if (!url) return;
      document.execCommand('createLink', false, url);
      return;
    }
    document.execCommand(cmd, false, val);
  };
  const richBox = boxOf(richFocus);

  if (!st) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontFamily: 'system-ui' }}>Loading the page…</div>;

  const selected = sel ? (sel.kind === 'mod' ? st.rows.flatMap(r => r.columns.flatMap(c => c.widgets)).find(w => w.id === sel.mod) : null) : null;
  const selLabel = !sel ? '' : sel.kind === 'mod' ? (selected ? moduleLabel(selected) : 'Module')
    : sel.kind === 'col' ? 'Column'
    : (() => { const r = st.rows.find(x => x.id === sel.row); return `${r?.name || 'Section'}${r ? ` · ${r.columns.length} column${r.columns.length === 1 ? '' : 's'}` : ''}`; })();

  return (
    <div className={`sbc${st.showHidden ? '' : ' sbc-hide-hidden'}${drag.active || drag.internal ? ' sbc-dragging' : ''}`}>
      <PublicHeader club={club} activePage="" />
      <main className="pt-20" data-sb-page onClick={onClick}
        onMouseMove={e => { if (drag.active) return; const h = hitAt(e.target as HTMLElement); setHover(h); }}
        onMouseLeave={() => setHover(null)}>
        <div ref={root}>
          {st.rows.length === 0 ? (
            <div className="sbc-blank" data-sb-ui>
              <div className="sbc-blank-in">
                <div className="t">{st.title || 'A new page'}</div>
                <div className="s">Start with a ready-made section, or drag one in from the left.</div>
                <button type="button" onClick={() => post({ type: 'insert', index: 0 })}>{ICONS.plus}Add a section</button>
              </div>
            </div>
          ) : (
            <PageRows rows={st.rows} websiteId={clubId as string} edit={edit} />
          )}
        </div>
      </main>
      {club && <div className="sbc-foot"><PublicFooter club={club} clubId={clubId} /></div>}

      {/* Overlays */}
      <div className="sbc-ov" aria-hidden={false}>
        {hovBox && hover && <div className={`sbc-box sbc-${hover.kind} sbc-hov`} style={{ top: hovBox.top, left: hovBox.left, width: hovBox.width, height: hovBox.height }} />}
        {selBox && sel && (
          <>
            <div className={`sbc-box sbc-${sel.kind} sbc-sel`} style={{ top: selBox.top, left: selBox.left, width: selBox.width, height: selBox.height }} />
            <div className={`sbc-bar sbc-bar-${sel.kind}`} data-sb-ui style={{ top: Math.max(84, selBox.top - 30), left: selBox.left, maxWidth: selBox.width }}>
              <span className="lbl">{selLabel}</span>
              {sel.kind === 'mod' && (
                <span className="tb">
                  <button type="button" title="Drag to move" draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', 'sb-move'); e.dataTransfer.effectAllowed = 'move'; setDrag({ active: false, internal: sel.mod }); }}
                    onDragEnd={() => { setDrag({ active: false }); setDrop(null); }}>{ICONS.move}</button>
                  <button type="button" title="Move up" onClick={() => post({ type: 'act', act: 'up', sel })}>{ICONS.up}</button>
                  <button type="button" title="Move down" onClick={() => post({ type: 'act', act: 'down', sel })}>{ICONS.down}</button>
                  <button type="button" title="Duplicate" onClick={() => post({ type: 'act', act: 'dup', sel })}>{ICONS.dup}</button>
                  <button type="button" title="Delete" onClick={() => post({ type: 'act', act: 'del', sel })}>{ICONS.del}</button>
                </span>
              )}
              {sel.kind === 'col' && (
                <span className="tb"><button type="button" title="Add a module" onClick={() => post({ type: 'addModule', col: sel.col })}>{ICONS.plus}</button></span>
              )}
              {sel.kind === 'row' && (
                <span className="tb">
                  <button type="button" title="Move up" onClick={() => post({ type: 'act', act: 'up', sel })}>{ICONS.up}</button>
                  <button type="button" title="Move down" onClick={() => post({ type: 'act', act: 'down', sel })}>{ICONS.down}</button>
                  <button type="button" title="Duplicate" onClick={() => post({ type: 'act', act: 'dup', sel })}>{ICONS.dup}</button>
                  <button type="button" title="Delete" onClick={() => post({ type: 'act', act: 'del', sel })}>{ICONS.del}</button>
                </span>
              )}
            </div>
            {sel.kind === 'row' && (
              <>
                <button type="button" data-sb-ui className="sbc-add" style={{ top: selBox.top - 15, left: selBox.left + selBox.width / 2 - 15 }} title="Add a section above"
                  onClick={() => post({ type: 'insert', index: st.rows.findIndex(r => r.id === sel.row) })}>{ICONS.plus}</button>
                <button type="button" data-sb-ui className="sbc-add" style={{ top: selBox.top + selBox.height - 15, left: selBox.left + selBox.width / 2 - 15 }} title="Add a section below"
                  onClick={() => post({ type: 'insert', index: st.rows.findIndex(r => r.id === sel.row) + 1 })}>{ICONS.plus}</button>
              </>
            )}
          </>
        )}
        {drop && <div className={`sbc-line${drop.target.kind === 'page' ? ' sec' : ''}`} style={{ top: drop.line.top, left: drop.line.left, width: drop.line.width }} />}
        {richFocus && richBox && (
          <div className="sbc-fmt" data-sb-ui style={{ top: Math.max(84, richBox.top - 44), left: richBox.left }}>
            <button type="button" title="Bold" onMouseDown={fmt('bold')}>{ICONS.bold}</button>
            <button type="button" title="Italic" onMouseDown={fmt('italic')}>{ICONS.italic}</button>
            <button type="button" title="Link" onMouseDown={fmt('createLink')}>{ICONS.link}</button>
            <span className="sep" />
            <button type="button" title="Heading" onMouseDown={fmt('formatBlock', 'h2')}>H2</button>
            <button type="button" title="Small heading" onMouseDown={fmt('formatBlock', 'h3')}>H3</button>
            <button type="button" title="Paragraph" onMouseDown={fmt('formatBlock', 'p')}>¶</button>
            <button type="button" title="List" onMouseDown={fmt('insertUnorderedList')}>{ICONS.list}</button>
            <button type="button" title="Quote" onMouseDown={fmt('formatBlock', 'blockquote')}>{ICONS.quote}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteCanvas;

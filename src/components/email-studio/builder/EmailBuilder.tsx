import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Check, Eye, GripVertical, Loader2, Monitor, Redo2, Search, Send, Smartphone, Undo2, X, Bookmark } from 'lucide-react';
import { useNotifications } from '../../../contexts/NotificationContext';
import { supabase } from '../../../utils/supabase';
import { BASIC_BLOCKS, BLOCKS, CLUB_BLOCKS, makeBlock, newId, normaliseDoc } from '../../../lib/emailStudio/catalog';
import { emailBody, emailHead, renderEmail } from '../../../lib/emailStudio/render';
import type { Block, BlockType, EmailDoc, Reader } from '../../../lib/emailStudio/types';
import { useStudio } from '../studioData';
import { getCampaign, saveContent, saveTemplate, type MemberLite } from '../api';
import { MemberPicker, TestSend } from '../ui';
import { Canvas, type CanvasMsg } from './Canvas';
import { Inspector } from './Inspector';
import { BlockIcon } from './icons';

/* ── Layers (drag to reorder) ────────────────────────────────────────────── */
const Layer: React.FC<{ b: Block; on: boolean; onPick: () => void }> = ({ b, on, onPick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
  const p = b.props as Record<string, unknown>;
  const hint = String(p.title || p.text || p.label || '').replace(/\{first_name\}/g, 'name').replace(/\{club_name\}/g, 'club').replace(/[*_[\]()]/g, '').slice(0, 28);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <button type="button" className={`esb-layer${on ? ' on' : ''}`} onClick={onPick}>
        <span {...attributes} {...listeners} aria-label={`Drag ${BLOCKS[b.type].label}`} style={{ cursor: 'grab', display: 'inline-flex', color: 'var(--e-dim)' }} onClick={e => e.stopPropagation()}><GripVertical size={14} /></span>
        <BlockIcon type={b.type} size={15} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{BLOCKS[b.type].label}</span>
        {hint && <small style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</small>}
      </button>
    </div>
  );
};

/* ── Builder ─────────────────────────────────────────────────────────────── */
export const EmailBuilder: React.FC<{ kind: 'campaign' | 'template' }> = ({ kind }) => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const s = useStudio();
  const { addNotification } = useNotifications();

  const [meta, setMeta] = useState<{ name: string; subject: string; preview: string; fromName: string; replyTo: string | null } | null>(null);
  const [hist, setHist] = useState<{ list: EmailDoc[]; at: number }>({ list: [], at: 0 });
  const doc = hist.list[hist.at] || null;
  const [sel, setSel] = useState<string | null>(params.get('block'));
  const [scrollTo, setScrollTo] = useState<string | null>(params.get('block'));
  const [insertAfter, setInsertAfter] = useState<string | null>(null);
  const [tab, setTab] = useState<'blocks' | 'layers'>('blocks');
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState(false);
  const [dragType, setDragType] = useState<BlockType | null>(null);
  const [save, setSave] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [as, setAs] = useState<MemberLite | null>(null);
  const [reader, setReader] = useState<Reader | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const lastPush = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDoc = useRef<EmailDoc | null>(null);
  latestDoc.current = doc;

  useEffect(() => { s.loadFeed(); }, [s]);

  // Load
  useEffect(() => {
    if (!id) return;
    (async () => {
      if (kind === 'campaign') {
        const r = await getCampaign(id);
        if (!r) { addNotification('error', 'Campaign not found'); navigate('/email-studio/campaigns'); return; }
        if (r.campaign.status === 'sent' || r.campaign.status === 'sending') { navigate(`/email-studio/campaigns/${id}`); return; }
        setMeta({ name: r.campaign.name, subject: r.campaign.subject, preview: r.campaign.preview_text || '', fromName: r.campaign.from_name, replyTo: r.campaign.reply_to });
        setHist({ list: [normaliseDoc(r.doc)], at: 0 });
      } else {
        const { data } = await supabase.from('marketing_email_templates').select('id, name, email_content_json').eq('id', id).maybeSingle();
        if (!data) { addNotification('error', 'Template not found'); navigate('/email-studio/templates'); return; }
        setMeta({ name: data.name, subject: data.name, preview: '', fromName: s.defaults.from_name, replyTo: s.defaults.reply_to });
        setHist({ list: [normaliseDoc(data.email_content_json)], at: 0 });
      }
    })();
  }, [id, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview as a member
  useEffect(() => {
    let off = false;
    if (!as) { setReader(null); return; }
    s.readerFor(as.id).then(r => !off && setReader(r)).catch(() => null);
    return () => { off = true; };
  }, [as, s]);

  const persist = useCallback(async (d: EmailDoc) => {
    if (!id || !meta) return;
    setSave('saving');
    try {
      if (kind === 'campaign') {
        const html = renderEmail(d, { brand: s.brand, feed: s.feed, reader: s.reader, subject: meta.subject }).html;
        await saveContent(id, d, html);
      } else {
        await saveTemplate(s.clubId, { id, name: meta.name, doc: d });
      }
      setSave('saved');
    } catch (e) {
      setSave('dirty');
      addNotification('error', (e as Error).message || 'Could not save');
    }
  }, [id, kind, meta, s.brand, s.feed, s.reader, s.clubId, addNotification]);

  const change = useCallback((next: EmailDoc, coalesce = false) => {
    setHist(h => {
      const now = Date.now();
      const join = coalesce && now - lastPush.current < 900 && h.at > 0;
      lastPush.current = now;
      const list = h.list.slice(0, h.at + 1);
      if (join) list[list.length - 1] = next; else list.push(next);
      const trimmed = list.slice(-80);
      return { list: trimmed, at: trimmed.length - 1 };
    });
    setSave('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => latestDoc.current && persist(latestDoc.current), 900);
  }, [persist]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const undo = () => { setHist(h => ({ ...h, at: Math.max(0, h.at - 1) })); setSave('dirty'); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => latestDoc.current && persist(latestDoc.current), 900); };
  const redo = () => { setHist(h => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) })); setSave('dirty'); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => latestDoc.current && persist(latestDoc.current), 900); };

  // Block operations
  const insert = useCallback((type: BlockType, index?: number) => {
    if (!doc) return;
    const b = makeBlock(type);
    const blocks = [...doc.blocks];
    let at = index ?? blocks.length;
    if (index == null && (insertAfter || sel)) {
      const i = blocks.findIndex(x => x.id === (insertAfter || sel));
      if (i >= 0) at = i + 1;
    }
    blocks.splice(at, 0, b as Block);
    change({ ...doc, blocks });
    setSel(b.id);
    setScrollTo(b.id);
    setInsertAfter(null);
  }, [doc, sel, insertAfter, change]);

  const patchBlock = useCallback((bid: string, patch: Record<string, unknown>) => {
    if (!doc) return;
    change({ ...doc, blocks: doc.blocks.map(b => (b.id === bid ? { ...b, props: { ...(b.props as object), ...patch } } as Block : b)) }, true);
  }, [doc, change]);

  const act = useCallback((a: string, bid: string) => {
    if (!doc) return;
    const i = doc.blocks.findIndex(b => b.id === bid);
    if (i < 0) return;
    const blocks = [...doc.blocks];
    if (a === 'up' && i > 0) { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; }
    else if (a === 'down' && i < blocks.length - 1) { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; }
    else if (a === 'dup') { const copy = { ...blocks[i], id: newId(), props: JSON.parse(JSON.stringify(blocks[i].props)) } as Block; blocks.splice(i + 1, 0, copy); setSel(copy.id); }
    else if (a === 'del') { blocks.splice(i, 1); setSel(null); }
    else if (a === 'add') { setInsertAfter(bid); setTab('blocks'); return; }
    else return;
    change({ ...doc, blocks });
  }, [doc, change]);

  const onCanvas = useCallback((m: CanvasMsg) => {
    if (m.type === 'select') { setSel(m.id || null); setScrollTo(null); setInsertAfter(null); }
    if (m.type === 'act' && m.id && m.act) act(m.act, m.id);
    if (m.type === 'insert' && m.after) { setInsertAfter(m.after); setTab('blocks'); }
    if (m.type === 'drop' && dragType) { insert(dragType, m.index); setDragType(null); }
  }, [act, insert, dragType]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (!typing && sel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); act('del', sel); }
      if (e.key === 'Escape') { setSel(null); setInsertAfter(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Render for the canvas
  const opts = useMemo(() => ({ brand: s.brand, feed: s.feed, reader: reader || s.reader, footerAddress: s.defaults.footer_address, edit: true, subject: meta?.subject, previewText: meta?.preview }), [s.brand, s.feed, s.reader, reader, s.defaults.footer_address, meta]);
  const head = useMemo(() => emailHead(opts), [opts]);
  const body = useMemo(() => (doc ? emailBody(doc, opts).body : ''), [doc, opts]);
  const labels = useMemo(() => Object.fromEntries((doc?.blocks || []).map(b => [b.id, BLOCKS[b.type].label])), [doc]);
  const selBlock = doc?.blocks.find(b => b.id === sel) || null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onLayerDrag = (e: DragEndEvent) => {
    if (!doc || !e.over || e.active.id === e.over.id) return;
    const from = doc.blocks.findIndex(b => b.id === e.active.id);
    const to = doc.blocks.findIndex(b => b.id === e.over!.id);
    change({ ...doc, blocks: arrayMove(doc.blocks, from, to) });
  };

  const done = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (doc && save !== 'saved') await persist(doc);
    navigate(kind === 'campaign' ? `/email-studio/campaigns/${id}` : '/email-studio/templates');
  };

  const saveAsTemplate = async () => {
    if (!doc || !meta) return;
    const name = window.prompt('Name this template', meta.name);
    if (!name) return;
    try { await saveTemplate(s.clubId, { name, doc }); addNotification('success', 'Saved to your templates'); }
    catch (e) { addNotification('error', (e as Error).message); }
  };

  if (!doc || !meta) return <div className="es-full"><div className="es-empty" style={{ marginTop: 80 }}><Loader2 size={20} className="es-spin" /></div></div>;

  const match = (t: BlockType) => !q.trim() || `${BLOCKS[t].label} ${BLOCKS[t].note}`.toLowerCase().includes(q.trim().toLowerCase());
  const tile = (t: BlockType) => (
    <button key={t} type="button" className={`esb-bk${BLOCKS[t].live || BLOCKS[t].personal ? ' live' : ''}`} draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', t); e.dataTransfer.effectAllowed = 'copy'; setDragType(t); }}
      onDragEnd={() => setTimeout(() => setDragType(null), 50)}
      onClick={() => insert(t)} title={BLOCKS[t].note}>
      <BlockIcon type={t} size={20} />{BLOCKS[t].label}
    </button>
  );

  return (
    <div className="es-full">
      <header className="es-top">
        <button className="a-ib" aria-label="Back" onClick={done}><ArrowLeft size={18} /></button>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <div className="ttl a-display">{meta.name}</div>
          <div className="st"><i className={save === 'saved' ? 'ok' : ''} />{kind === 'template' ? 'Template · ' : ''}{save === 'saving' ? 'Saving…' : save === 'dirty' ? 'Unsaved changes' : 'All changes saved'}</div>
        </div>
        <div className="r" style={{ marginLeft: 0 }}>
          <button className="a-ib" aria-label="Undo" disabled={hist.at === 0} onClick={undo}><Undo2 size={16} /></button>
          <button className="a-ib" aria-label="Redo" disabled={hist.at >= hist.list.length - 1} onClick={redo}><Redo2 size={16} /></button>
          <div className="a-seg" role="group" aria-label="Device">
            <button className={`a-seg-i${!phone ? ' a-seg-on' : ''}`} style={{ height: 30 }} aria-pressed={!phone} onClick={() => setPhone(false)}><Monitor size={15} />Desktop</button>
            <button className={`a-seg-i${phone ? ' a-seg-on' : ''}`} style={{ height: 30 }} aria-pressed={phone} onClick={() => setPhone(true)}><Smartphone size={15} />Phone</button>
          </div>
        </div>
        <div className="r">
          <div style={{ width: 210 }} title="Fill the email in as one of your members"><MemberPicker value={as} onChange={setAs} allowNone noneLabel="Preview as me" /></div>
          <div style={{ position: 'relative' }}>
            <button className="a-btn a-btn-sm" onClick={() => setTestOpen(o => !o)} aria-expanded={testOpen}><Send size={15} />Send me a test</button>
            {testOpen && (
              <div className="es-menu" style={{ right: 0, top: 42, width: 400, padding: 14, maxHeight: 'none', overflow: 'visible' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}><b className="es-ink" style={{ fontSize: 14 }}>Send a test</b><button className="a-ib" style={{ marginLeft: 'auto', width: 28, height: 28 }} aria-label="Close" onClick={() => setTestOpen(false)}><X size={15} /></button></div>
                <TestSend doc={doc} subject={meta.subject} previewText={meta.preview} fromName={meta.fromName} replyTo={meta.replyTo} campaignId={kind === 'campaign' ? id : null} compact />
              </div>
            )}
          </div>
          <button className="a-btn a-btn-sm" onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(renderEmail(doc, { ...opts, edit: false }).html); w.document.close(); } }}><Eye size={15} />Preview</button>
          {kind === 'campaign' && <button className="a-btn a-btn-sm" onClick={saveAsTemplate}><Bookmark size={15} />Save as template</button>}
          <button className="a-btn a-btn-p a-btn-sm" onClick={done}><Check size={15} />Done</button>
        </div>
      </header>

      <div className="esb">
        <aside className="esb-lp" aria-label="Blocks">
          <div className="esb-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'blocks'} className={tab === 'blocks' ? 'on' : ''} onClick={() => setTab('blocks')}>Blocks</button>
            <button role="tab" aria-selected={tab === 'layers'} className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}>Layers <span className="es-dim">{doc.blocks.length}</span></button>
          </div>
          {tab === 'blocks' ? (
            <>
              <label className="a-field" style={{ margin: 12, height: 38 }}><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search blocks" aria-label="Search blocks" /></label>
              {insertAfter && <div className="es-hint" style={{ margin: '0 12px 6px', padding: '8px 10px', borderRadius: 10, background: 'rgba(10,132,255,.12)' }}>Pick a block to add below <b>{labels[insertAfter]}</b>. <button className="es-link" onClick={() => setInsertAfter(null)}>Cancel</button></div>}
              <div className="esb-grp">
                <div className="esb-gh"><p className="a-cap m-0">Club content</p><span className="es-dim" style={{ fontSize: 11, marginLeft: 'auto' }}>Fills itself</span></div>
                <div className="esb-bks">{CLUB_BLOCKS.filter(match).map(tile)}</div>
              </div>
              <div className="esb-grp">
                <div className="esb-gh"><p className="a-cap m-0">Basics</p></div>
                <div className="esb-bks">{BASIC_BLOCKS.filter(match).map(tile)}</div>
              </div>
              <p className="es-dim" style={{ fontSize: 11.5, margin: '4px 14px 16px' }}>Click to add below the selected block, or drag into the email.</p>
            </>
          ) : (
            <div style={{ padding: 10 }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onLayerDrag}>
                <SortableContext items={doc.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  {doc.blocks.map(b => <Layer key={b.id} b={b} on={b.id === sel} onPick={() => { setSel(b.id); setScrollTo(b.id); }} />)}
                </SortableContext>
              </DndContext>
              {doc.blocks.length === 0 && <div className="es-empty">No blocks yet</div>}
            </div>
          )}
        </aside>

        <div className={`esb-cv${phone ? ' phone' : ''}`}>
          <div className="esb-cvbar">
            <span>{reader ? `Showing as ${reader.first_name} ${reader.last_name || ''}` : 'Showing as you'}{!s.feedReady && ' · loading your club’s content…'}</span>
            {s.feedError && <span className="es-warn">Club content couldn’t load. Showing samples.</span>}
            <span className="r">{phone ? 'Phone' : 'Desktop'}</span>
          </div>
          <Canvas head={head} body={body} selected={sel} labels={labels} phone={phone} dragging={!!dragType} scrollTo={scrollTo} onMessage={onCanvas} />
        </div>

        <aside className="esb-rp" aria-label="Block settings">
          <Inspector block={selBlock} feedReady={s.feedReady} onChange={patchBlock} onDuplicate={bid => act('dup', bid)} onDelete={bid => act('del', bid)} />
        </aside>
      </div>
    </div>
  );
};

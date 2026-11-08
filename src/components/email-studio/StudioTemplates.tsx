import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FilePlus2, Loader2, MoreHorizontal, Palette, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { emptyDoc, normaliseDoc } from '../../lib/emailStudio/catalog';
import { LIBRARY, LIBRARY_CATEGORIES, type LibraryTemplate } from '../../lib/emailStudio/library';
import { renderEmail } from '../../lib/emailStudio/render';
import type { EmailDoc } from '../../lib/emailStudio/types';
import { useStudio } from './studioData';
import { ago, deleteTemplate, listSavedTemplates, saveTemplate, type SavedTemplate } from './api';
import { Confirm, EmailFrame, TestSend } from './ui';
import { useNewCampaign } from './EmailStudio';

export interface PickedTemplate { name: string; subject?: string; doc: EmailDoc; topic?: string; previewText?: string }

interface Card {
  id: string;
  name: string;
  note: string;
  category: string;
  own: boolean;
  updated?: string;
  subject?: string;
  preview?: string;
  topic?: string;
  doc: () => EmailDoc;
}

const fromLibrary = (t: LibraryTemplate): Card => ({ id: `lib:${t.key}`, name: t.name, note: t.note, category: t.category, own: false, subject: t.subject, preview: t.preview, topic: t.topic, doc: t.doc });
const fromSaved = (t: SavedTemplate): Card => ({ id: t.id, name: t.name, note: t.description || 'Saved by your club', category: 'Saved by your club', own: true, updated: t.updated_at, doc: () => normaliseDoc(t.email_content_json) });
const BLANK: Card = { id: 'blank', name: 'Start from scratch', note: 'Your header and footer, nothing else', category: 'Blank', own: false, doc: emptyDoc };

/** A scaled-down live render of a template. */
const TemplateThumb: React.FC<{ card: Card }> = ({ card }) => {
  const s = useStudio();
  const html = useMemo(() => renderEmail(card.doc(), { brand: s.brand, feed: s.feed, reader: s.reader, footerAddress: s.defaults.footer_address, subject: card.subject }).html,
    [card, s.brand, s.feed, s.reader, s.defaults.footer_address]);
  return <div className="es-tpl-th" aria-hidden><iframe title="" srcDoc={html} tabIndex={-1} loading="lazy" /></div>;
};

function useCards() {
  const s = useStudio();
  const [saved, setSaved] = useState<SavedTemplate[] | null>(null);
  const load = () => listSavedTemplates(s.clubId).then(setSaved).catch(() => setSaved([]));
  useEffect(() => { load(); s.loadFeed(); }, [s.clubId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = useMemo(() => [...(saved || []).map(fromSaved), ...LIBRARY.map(fromLibrary)], [saved]);
  return { cards, saved, reload: load };
}

const Cats: React.FC<{ value: string; onChange: (v: string) => void; own: boolean }> = ({ value, onChange, own }) => (
  <div className="es-cats" role="tablist" aria-label="Template categories">
    {['All', ...(own ? ['Saved by your club'] : []), ...LIBRARY_CATEGORIES].map(c => (
      <button key={c} type="button" role="tab" aria-selected={value === c} className={`es-cat${value === c ? ' on' : ''}`} onClick={() => onChange(c)}>{c}</button>
    ))}
  </div>
);

const Meta: React.FC<{ card: Card }> = ({ card }) => (
  <div className="m">
    {card.own ? <span className="es-by es-by-c">Your club</span> : card.id !== 'blank' && <span className="es-by es-by-a">AlfiePRO</span>}
    <span>{card.own ? `Edited ${ago(card.updated)}` : card.note}</span>
  </div>
);

/** Full-size preview with a test send. */
const PreviewDialog: React.FC<{ card: Card; onClose: () => void; onUse: () => void; busy?: boolean }> = ({ card, onClose, onUse, busy }) => {
  const s = useStudio();
  const doc = useMemo(() => card.doc(), [card]);
  const html = useMemo(() => renderEmail(doc, { brand: s.brand, feed: s.feed, reader: s.reader, footerAddress: s.defaults.footer_address, subject: card.subject }).html, [doc, s.brand, s.feed, s.reader, s.defaults.footer_address, card.subject]);
  const [phone, setPhone] = useState(false);
  return (
    <div className="a-dlg" role="dialog" aria-modal="true" aria-label={`Preview ${card.name}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="a-sheet es-root" style={{ maxWidth: 1040, padding: 0, gap: 0 }}>
        <div className="a-dlg-head">
          <div className="flex-1 min-w-0">
            <h2 className="a-display es-ink m-0 text-[19px] font-semibold">{card.name}</h2>
            <p className="es-dim m-0 mt-0.5 text-[12.5px]">{card.note}. Shown with your club’s colours and content.</p>
          </div>
          <div className="esb-tog"><button type="button" className={!phone ? 'on' : ''} onClick={() => setPhone(false)}>Desktop</button><button type="button" className={phone ? 'on' : ''} onClick={() => setPhone(true)}>Phone</button></div>
          <button className="a-ib" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="a-dlg-body" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--e-inset)', borderRadius: 16, padding: 12, minWidth: 0 }}>
            <EmailFrame html={html} auto title={`${card.name} preview`} style={{ maxWidth: phone ? 390 : 680 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button className="a-btn a-btn-p" onClick={onUse} disabled={busy}>{busy ? <Loader2 size={16} className="es-spin" /> : <Plus size={16} />}Use this template</button>
            <div className="a-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Send size={15} className="es-dim" /><b className="es-ink" style={{ fontSize: 14 }}>Send me a test</b></div>
              <span className="es-dim" style={{ fontSize: 12 }}>See it in your own inbox, filled in as you or any member.</span>
              <TestSend doc={doc} subject={card.subject || card.name} previewText={card.preview} fromName={s.defaults.from_name} replyTo={s.defaults.reply_to} compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Template grid used by "New campaign". */
export const TemplatePicker: React.FC<{ onPick: (t: PickedTemplate) => void }> = ({ onPick }) => {
  const { cards, saved } = useCards();
  const [cat, setCat] = useState('All');
  const [preview, setPreview] = useState<Card | null>(null);
  const shown = useMemo(() => [BLANK, ...cards].filter(c => cat === 'All' || c.category === cat), [cards, cat]);
  const pick = (c: Card) => onPick({ name: c.id === 'blank' ? 'New campaign' : c.name, subject: c.subject, doc: c.doc(), topic: c.topic, previewText: c.preview });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Cats value={cat} onChange={setCat} own={!!saved?.length} />
      <div className="es-tpls">
        {shown.map(c => (
          <div key={c.id} className="es-tpl" style={{ position: 'relative' }}>
            <button type="button" onClick={() => pick(c)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column' }} aria-label={`Use ${c.name}`}>
              <TemplateThumb card={c} />
              <div className="es-tpl-i"><b>{c.name}</b><Meta card={c} /></div>
            </button>
            {c.id !== 'blank' && <button type="button" className="es-tpl-pv" onClick={() => setPreview(c)}><Eye size={14} />Preview</button>}
          </div>
        ))}
      </div>
      {preview && <PreviewDialog card={preview} onClose={() => setPreview(null)} onUse={() => { pick(preview); setPreview(null); }} />}
    </div>
  );
};

/** Email studio › Templates */
export const StudioTemplates: React.FC = () => {
  const s = useStudio();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const { cards, saved, reload } = useCards();
  const { start, busy } = useNewCampaign();
  const [cat, setCat] = useState('All');
  const [preview, setPreview] = useState<Card | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [del, setDel] = useState<Card | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const shown = cards.filter(c => cat === 'All' || c.category === cat);
  const use = (c: Card) => start({ name: c.name, subject: c.subject, doc: c.doc(), topic: c.topic, previewText: c.preview });
  const customise = async (c: Card | null) => {
    setWorking(true);
    try {
      const id = await saveTemplate(s.clubId, { name: c ? `${c.name} (club version)` : 'New template', description: c?.note, category: c?.category || 'general', doc: c ? c.doc() : emptyDoc() });
      navigate(`/email-studio/templates/${id}/design`);
    } catch (e) { addNotification('error', (e as Error).message || 'Could not create the template'); } finally { setWorking(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="a-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span className="a-tile" style={{ width: 44, height: 44 }}><Palette size={20} /></span>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <h3 className="a-display es-ink" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Templates</h3>
          <div className="es-dim" style={{ fontSize: 12.5, marginTop: 2 }}>Every template uses your club’s colours and logo, and its club content blocks fill in by themselves. Save your own to reuse each week.</div>
        </div>
        <button className="a-btn" onClick={() => customise(null)} disabled={working}>{working ? <Loader2 size={16} className="es-spin" /> : <FilePlus2 size={16} />}New template</button>
      </section>

      <Cats value={cat} onChange={setCat} own={!!saved?.length} />

      {saved === null ? <div className="es-empty"><Loader2 size={18} className="es-spin" /></div> : (
        <div className="es-tpls">
          {shown.map(c => (
            <div key={c.id} className="es-tpl" style={{ position: 'relative' }}>
              <button type="button" onClick={() => setPreview(c)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column' }} aria-label={`Preview ${c.name}`}>
                <TemplateThumb card={c} />
                <div className="es-tpl-i"><b>{c.name}</b><Meta card={c} /></div>
              </button>
              <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px', flexWrap: 'wrap' }}>
                <button className="a-btn a-btn-p a-btn-sm" disabled={busy} onClick={() => use(c)}><Plus size={14} />Use</button>
                {c.own
                  ? <button className="a-btn a-btn-sm" onClick={() => navigate(`/email-studio/templates/${c.id}/design`)}><Pencil size={14} />Edit</button>
                  : <button className="a-btn a-btn-sm" disabled={working} onClick={() => customise(c)}><Palette size={14} />Make it your own</button>}
                {c.own && (
                  <span style={{ position: 'relative', marginLeft: 'auto' }}>
                    <button className="a-ib" aria-label={`More for ${c.name}`} onClick={e => { e.stopPropagation(); setMenu(m => (m === c.id ? null : c.id)); }}><MoreHorizontal size={16} /></button>
                    {menu === c.id && (
                      <div className="es-menu" style={{ bottom: 40, right: 0, minWidth: 180 }}>
                        <button type="button" onClick={() => setPreview(c)}><Eye size={15} />Preview and test</button>
                        <button type="button" className="dz" onClick={() => setDel(c)}><Trash2 size={15} />Delete</button>
                      </div>
                    )}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && <PreviewDialog card={preview} busy={busy} onClose={() => setPreview(null)} onUse={() => use(preview)} />}
      {del && (
        <Confirm title="Delete this template?" danger confirm="Delete" busy={working}
          body={<>“{del.name}” will be removed. Campaigns already made from it keep their design.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            setWorking(true);
            try { await deleteTemplate(del.id); await reload(); setDel(null); addNotification('success', 'Template deleted'); }
            catch (e) { addNotification('error', (e as Error).message); } finally { setWorking(false); }
          }} />
      )}
    </div>
  );
};

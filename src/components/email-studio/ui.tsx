import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, Search, Send, Users, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import type { EmailDoc, Reader } from '../../lib/emailStudio/types';
import { renderEmail } from '../../lib/emailStudio/render';
import { avatarColour, initialsOf } from '../alfie/Kit';
import { useStudio } from './studioData';
import { BUILTINS, isEmail, searchMembers, sendTest, type Audience, type AudiencePart, type MemberLite } from './api';

/* ── Status pill ─────────────────────────────────────────────────────────── */
export const StatusPill: React.FC<{ status: string; at?: string | null }> = ({ status }) => {
  const map: Record<string, [string, string]> = {
    draft: ['es-draft', 'Draft'], scheduled: ['es-auto', 'Scheduled'], sending: ['es-v', 'Sending'], sent: ['es-live', 'Sent'],
  };
  const [cls, label] = map[status] || ['', status];
  return <span className={`es-pill ${cls}`}>{status === 'sending' && <Loader2 size={11} className="es-spin" />}{label}</span>;
};

/* ── Mini email thumbnail (pure decoration) ─────────────────────────────── */
export const Thumb: React.FC<{ seed?: string; color?: string }> = ({ seed = '', color = '#1E293B' }) => {
  const n = Array.from(seed).reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <span className="es-thumb" aria-hidden>
      <i style={{ height: 10 + (n % 5), background: color }} />
      <i style={{ height: 4, width: `${60 + (n % 30)}%` }} />
      <i style={{ height: 8, width: `${36 + (n % 20)}%`, background: '#3987e5' }} />
    </span>
  );
};

/* ── Rendered email in an iframe ─────────────────────────────────────────── */
export const EmailFrame: React.FC<{ html: string; height?: number; auto?: boolean; title?: string; className?: string; style?: React.CSSProperties }> = ({ html, height = 600, auto, title = 'Email preview', className, style }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(height);
  const doc = useMemo(() => html.replace('<head>', '<head><base target="_blank">'), [html]);
  useEffect(() => {
    if (!auto) return;
    const f = ref.current;
    if (!f) return;
    const fit = () => { try { const b = f.contentDocument?.body; if (b) setH(Math.max(200, b.scrollHeight + 4)); } catch { /* cross-origin never happens with srcdoc */ } };
    f.addEventListener('load', fit);
    const t = setInterval(fit, 800);
    return () => { f.removeEventListener('load', fit); clearInterval(t); };
  }, [auto, doc]);
  return <iframe ref={ref} title={title} srcDoc={doc} className={`es-frame ${className || ''}`} style={{ height: auto ? h : height, ...style }} />;
};

/** Render a doc with the studio's brand and live content. */
export function useRendered(doc: EmailDoc | null, o: { subject?: string; previewText?: string; reader?: Reader | null; edit?: boolean } = {}) {
  const s = useStudio();
  return useMemo(() => {
    if (!doc) return null;
    return renderEmail(doc, {
      subject: o.subject, previewText: o.previewText, brand: s.brand, feed: s.feed, reader: o.reader || s.reader,
      footerAddress: s.defaults.footer_address, edit: o.edit,
      preferencesUrl: '#', unsubscribeUrl: '#',
    });
  }, [doc, o.subject, o.previewText, o.reader, o.edit, s.brand, s.feed, s.reader, s.defaults.footer_address]);
}

/* ── Member picker ("fill in as", profiles) ──────────────────────────────── */
export const MemberPicker: React.FC<{ value: MemberLite | null; onChange: (m: MemberLite | null) => void; placeholder?: string; allowNone?: boolean; noneLabel?: string }> = ({ value, onChange, placeholder = 'Search members', allowNone, noneLabel = 'Sample member' }) => {
  const { clubId } = useStudio();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<MemberLite[]>([]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let off = false;
    setBusy(true);
    const t = setTimeout(() => searchMembers(clubId, q).then(r => { if (!off) setRows(r); }).finally(() => !off && setBusy(false)), 180);
    return () => { off = true; clearTimeout(t); };
  }, [open, q, clubId]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const label = value ? `${value.first_name || ''} ${value.last_name || ''}`.trim() || value.email : noneLabel;
  return (
    <div ref={box} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button type="button" className="a-btn a-btn-sm" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="es-menu" style={{ top: 40, left: 0, right: 0 }} role="listbox">
          <div className="a-field" style={{ height: 38, margin: '2px 2px 6px' }}>
            <Search size={14} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
          </div>
          {allowNone && <button type="button" onClick={() => { onChange(null); setOpen(false); }}><Users size={15} />{noneLabel}</button>}
          {busy && !rows.length ? <div className="es-empty" style={{ padding: 14 }}><Loader2 size={15} className="es-spin" /></div> : rows.map(m => (
            <button key={m.id} type="button" role="option" aria-selected={value?.id === m.id} onClick={() => { onChange(m); setOpen(false); }}>
              <span className="es-av" style={{ width: 26, height: 26, borderRadius: 8, fontSize: 11, background: avatarColour(m.id) }}>{initialsOf(m.first_name, m.last_name)}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email}</span>
              {value?.id === m.id && <Check size={14} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
          {!busy && !rows.length && <div className="es-empty" style={{ padding: 14 }}>No members found</div>}
        </div>
      )}
    </div>
  );
};

/* ── Send a test ─────────────────────────────────────────────────────────── */
export const TestSend: React.FC<{ doc: EmailDoc; subject: string; previewText?: string; fromName?: string; replyTo?: string | null; campaignId?: string | null; compact?: boolean; onSent?: () => void }> = ({ doc, subject, previewText, fromName, replyTo, campaignId, compact, onSent }) => {
  const { user } = useAuth();
  const { clubId } = useStudio();
  const { addNotification } = useNotifications();
  const me = (user as { email?: string } | null)?.email || '';
  const [to, setTo] = useState<string[]>(me ? [me] : []);
  const [add, setAdd] = useState('');
  const [as, setAs] = useState<MemberLite | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const push = () => {
    const parts = add.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    const bad = parts.filter(p => !isEmail(p));
    if (bad.length) { addNotification('error', `${bad[0]} doesn’t look like an email address`); return; }
    setTo(t => Array.from(new Set([...t, ...parts.map(p => p.toLowerCase())])).slice(0, 10));
    setAdd('');
  };
  const send = async () => {
    if (add.trim()) push();
    const list = add.trim() ? Array.from(new Set([...to, ...add.split(/[\s,;]+/).filter(isEmail)])) : to;
    if (!list.length) { addNotification('error', 'Add an email address to send the test to'); return; }
    setBusy(true);
    try {
      const r = await sendTest({ clubId, doc, subject: subject || 'Test email', previewText, fromName, replyTo, to: list, memberId: as?.id || null, campaignId });
      setLast(new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }));
      addNotification('success', r.failed?.length ? `Test sent, but not to ${r.failed.join(', ')}` : `Test sent to ${list.length === 1 ? list[0] : `${list.length} people`}. It can take a minute to arrive.`);
      onSent?.();
    } catch (e) {
      addNotification('error', (e as Error).message || 'The test could not be sent');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="es-chips">
        {to.map(e => (
          <span key={e} className="es-chip">{e === me.toLowerCase() || e === me ? 'You' : e}<button type="button" aria-label={`Remove ${e}`} onClick={() => setTo(t => t.filter(x => x !== e))}><X size={13} /></button></span>
        ))}
        <span className="a-field" style={{ height: 32, flex: '1 1 160px', borderRadius: 10, padding: '0 10px' }}>
          <input value={add} onChange={e => setAdd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (add.trim()) push(); } }} placeholder="Add an email address" aria-label="Add an email address" />
          {add.trim() && <button type="button" className="a-ib" style={{ width: 24, height: 24 }} onClick={push} aria-label="Add"><Plus size={14} /></button>}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: compact ? 'wrap' : 'nowrap' }}>
        <span className="es-dim" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Fill in as</span>
        <MemberPicker value={as} onChange={setAs} allowNone noneLabel="Me (or a sample member)" />
        <button type="button" className="a-btn a-btn-p a-btn-sm" onClick={send} disabled={busy}>{busy ? <Loader2 size={14} className="es-spin" /> : <Send size={14} />}Send test</button>
      </div>
      {last && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4CD07A' }}><Check size={14} />Last test went out at {last}</div>}
    </div>
  );
};

/* ── Audience part labels and picker ─────────────────────────────────────── */
export function partLabel(p: AudiencePart, s: { segments: { id: string; name: string }[]; lists: { id: string; name: string }[] }) {
  if (p.kind === 'builtin') return BUILTINS.find(b => b.key === p.key)?.label || p.label || 'Members';
  if (p.kind === 'segment') return s.segments.find(x => x.id === p.id)?.name || p.label || 'Segment';
  if (p.kind === 'list') return s.lists.find(x => x.id === p.id)?.name || p.label || 'List';
  if (p.kind === 'not_opened') return p.label || 'Didn’t open an earlier email';
  if (p.kind === 'opened_not_clicked') return p.label || 'Opened but didn’t click';
  return p.label || 'Clicked an earlier email';
}
const sameP = (a: AudiencePart, b: AudiencePart) => a.kind === b.kind && (a.kind === 'builtin' ? a.key === (b as { key: string }).key : (a as { id: string }).id === (b as { id: string }).id);

export const AudienceEditor: React.FC<{ value: Audience; onChange: (a: Audience) => void }> = ({ value, onChange }) => {
  const s = useStudio();
  const [menu, setMenu] = useState<'include' | 'exclude' | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  const add = (which: 'include' | 'exclude', p: AudiencePart) => {
    if (value[which].some(x => sameP(x, p))) return setMenu(null);
    onChange({ ...value, [which]: [...value[which], p] });
    setMenu(null);
  };
  const remove = (which: 'include' | 'exclude', i: number) => onChange({ ...value, [which]: value[which].filter((_x, j) => j !== i) });
  const options = (which: 'include' | 'exclude') => (
    <div className="es-menu" style={{ top: 38, left: 0 }}>
      <div className="gh">Members</div>
      {BUILTINS.map(b => <button type="button" key={b.key} onClick={() => add(which, { kind: 'builtin', key: b.key })}>{b.label}<small>{b.note}</small></button>)}
      {s.segments.length > 0 && <div className="gh">Your segments</div>}
      {s.segments.map(g => <button type="button" key={g.id} onClick={() => add(which, { kind: 'segment', id: g.id, label: g.name })}>{g.name}</button>)}
      {s.lists.length > 0 && <div className="gh">Lists</div>}
      {s.lists.map(g => <button type="button" key={g.id} onClick={() => add(which, { kind: 'list', id: g.id, label: g.name })}>{g.name}<small>{g.total_contacts ?? ''}</small></button>)}
    </div>
  );
  return (
    <div ref={box} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div className="es-lbl">Send to</div>
        <div className="es-chips" style={{ position: 'relative' }}>
          {value.include.map((p, i) => (
            <span key={i} className="es-chip">{partLabel(p, s)}<button type="button" aria-label={`Remove ${partLabel(p, s)}`} onClick={() => remove('include', i)}><X size={13} /></button></span>
          ))}
          <span style={{ position: 'relative' }}>
            <button type="button" className="es-chip add" onClick={() => setMenu(m => (m === 'include' ? null : 'include'))}><Plus size={13} />Add a group, segment or list</button>
            {menu === 'include' && options('include')}
          </span>
        </div>
      </div>
      <div>
        <div className="es-lbl">Leave out</div>
        <div className="es-chips">
          {value.exclude.map((p, i) => (
            <span key={i} className="es-chip ex">{partLabel(p, s)}<button type="button" aria-label={`Stop leaving out ${partLabel(p, s)}`} onClick={() => remove('exclude', i)}><X size={13} /></button></span>
          ))}
          <span style={{ position: 'relative' }}>
            <button type="button" className="es-chip add" onClick={() => setMenu(m => (m === 'exclude' ? null : 'exclude'))}><Plus size={13} />Leave people out</button>
            {menu === 'exclude' && options('exclude')}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ── Confirm dialog ──────────────────────────────────────────────────────── */
export const Confirm: React.FC<{ title: string; body: React.ReactNode; confirm: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, body, confirm, danger, busy, onConfirm, onClose }) => (
  <div className="a-dlg" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="a-sheet" style={{ maxWidth: 440 }}>
      <div className="a-dlg-head"><h2 className="a-display a-ink m-0 text-[18px] font-semibold flex-1">{title}</h2><button className="a-ib" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="a-dlg-body es-hint" style={{ fontSize: 14 }}>{body}</div>
      <div className="a-dlg-foot">
        <button className="a-btn" onClick={onClose}>Cancel</button>
        <button className={`a-btn ${danger ? 'a-btn-d' : 'a-btn-p'}`} onClick={onConfirm} disabled={busy}>{busy && <Loader2 size={15} className="es-spin" />}{confirm}</button>
      </div>
    </div>
  </div>
);

/* ── Inbox preview on a phone ────────────────────────────────────────────── */
export const InboxPreview: React.FC<{ from: string; subject: string; preview: string }> = ({ from, subject, preview }) => {
  const now = new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return (
    <div className="es-phone" aria-label="How it looks in an inbox">
      <div className="es-scr">
        <div className="es-sb"><span>{now.replace(/\s?[ap]m/, '')}</span><span>Inbox</span></div>
        <div className="es-ih"><span>Mailboxes</span><h4>Inbox</h4></div>
        <div className="es-ml ours"><span className="ud" /><div style={{ minWidth: 0, flex: 1 }}><div className="fr">{from || 'Your club'}<span>{now}</span></div><div className="sj">{subject || 'Your subject line'}</div><div className="pv">{preview || 'The first line of your email shows here. Add preview text to choose what it says.'}</div></div></div>
        <div className="es-ml"><span className="ud" /><div style={{ minWidth: 0, flex: 1 }}><div className="fr">Harbour Hobbies<span>4:40 pm</span></div><div className="sj">Your order has shipped</div><div className="pv">Two packs of sail numbers and a new winch servo are on the way.</div></div></div>
        <div className="es-ml"><span className="ud rd" /><div style={{ minWidth: 0, flex: 1 }}><div className="fr">Mum<span>2:03 pm</span></div><div className="sj">Sunday lunch</div><div className="pv">Are you still coming? Bring the kids, Dad wants to see the new boat.</div></div></div>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CalendarClock, Check, Eye, Loader2, Paintbrush, Send, Type, X } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { normaliseDoc, BLOCKS } from '../../lib/emailStudio/catalog';
import { linkProblems, missingAlt, fillTokens } from '../../lib/emailStudio/render';
import type { EmailDoc } from '../../lib/emailStudio/types';
import { useStudio } from './studioData';
import { audienceCount, DEFAULT_AUDIENCE, getCampaign, saveCampaign, sendNow, fmtDate, fmtTime, type AudienceCount, type CampaignRow } from './api';
import { AudienceEditor, Confirm, InboxPreview, StatusPill, TestSend, useRendered } from './ui';

const toLocalInput = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600 * 1000);
  if (!iso) d.setHours(17, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const Ck: React.FC<{ ok: boolean | 'warn' }> = ({ ok }) => (
  <span className={`es-ck ${ok === true ? 'ok' : ok === 'warn' ? 'wn' : ''}`}>{ok === true ? <Check size={14} strokeWidth={3} /> : ok === 'warn' ? <AlertTriangle size={13} /> : <span style={{ width: 8, height: 8, borderRadius: 99, background: 'currentColor', opacity: 0.5 }} />}</span>
);

export const CampaignComposer: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const s = useStudio();
  const { addNotification } = useNotifications();
  const [c, setC] = useState<CampaignRow | null>(null);
  const [doc, setDoc] = useState<EmailDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [count, setCount] = useState<AudienceCount | null>(null);
  const [counting, setCounting] = useState(false);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState(toLocalInput(null));
  const [confirm, setConfirm] = useState<'send' | 'schedule' | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<Partial<CampaignRow>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => { s.loadFeed(); }, [s]);
  useEffect(() => {
    if (!id) return;
    getCampaign(id).then(r => {
      if (!r) { setMissing(true); return; }
      if (r.campaign.status === 'sent') { navigate(`/email-studio/campaigns/${id}/report`, { replace: true }); return; }
      setC({ ...r.campaign, audience: r.campaign.audience || DEFAULT_AUDIENCE });
      setDoc(normaliseDoc(r.doc));
      if (r.campaign.status === 'scheduled' && r.campaign.send_at) { setWhen('later'); setAt(toLocalInput(r.campaign.send_at)); }
    });
  }, [id, navigate]);

  // Poll while sending
  useEffect(() => {
    if (c?.status !== 'sending' || !id) return;
    const t = setInterval(() => getCampaign(id).then(r => { if (r) { if (r.campaign.status === 'sent') navigate(`/email-studio/campaigns/${id}/report`); else setC(x => (x ? { ...x, ...r.campaign } : x)); } }), 4000);
    return () => clearInterval(t);
  }, [c?.status, id, navigate]);

  const flush = useCallback(async () => {
    if (!id || !Object.keys(pending.current).length) return;
    const patch = pending.current;
    pending.current = {};
    setSaved('saving');
    try { await saveCampaign(id, patch); setSaved('saved'); } catch (e) { setSaved('dirty'); addNotification('error', (e as Error).message || 'Could not save'); }
  }, [id, addNotification]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void flush(); }, [flush]);

  const set = (patch: Partial<CampaignRow>) => {
    setC(x => (x ? { ...x, ...patch } : x));
    pending.current = { ...pending.current, ...patch };
    setSaved('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  // Live audience count
  const audKey = JSON.stringify([c?.audience, c?.topic]);
  useEffect(() => {
    if (!c) return;
    let off = false;
    setCounting(true);
    const t = setTimeout(() => audienceCount(s.clubId, c.audience || DEFAULT_AUDIENCE, c.topic).then(r => !off && setCount(r)).catch(() => !off && setCount(null)).finally(() => !off && setCounting(false)), 300);
    return () => { off = true; clearTimeout(t); };
  }, [audKey, s.clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rendered = useRendered(doc, { subject: c?.subject, previewText: c?.preview_text || '' });
  const problems = useMemo(() => (doc ? linkProblems(doc) : []), [doc]);
  const noAlt = useMemo(() => (doc ? missingAlt(doc) : []), [doc]);
  const liveBlocks = useMemo(() => (doc ? Array.from(new Set(doc.blocks.map(b => BLOCKS[b.type].label))) : []), [doc]);

  if (missing) return <div className="es-full"><div className="es-wrap"><div className="a-card es-empty">This campaign doesn’t exist any more. <button className="es-link" onClick={() => navigate('/email-studio/campaigns')}>Back to campaigns</button></div></div></div>;
  if (!c || !doc) return <div className="es-full"><div className="es-empty" style={{ marginTop: 80 }}><Loader2 size={20} className="es-spin" /></div></div>;

  const locked = c.status === 'sending';
  const checks = {
    audience: !!count && count.count > 0,
    subject: !!c.subject.trim(),
    content: doc.blocks.length > 0 && problems.length === 0,
    alt: noAlt.length === 0,
    tested: !!c.test_sent_at,
  };
  const ready = checks.audience && checks.subject && checks.content;
  const atDate = new Date(at);
  const atOk = when === 'now' || atDate.getTime() > Date.now() + 2 * 60 * 1000;
  const previewSubject = fillTokens(c.subject, s.reader, s.brand);
  const previewLine = fillTokens(c.preview_text || '', s.reader, s.brand) || (rendered?.text.split('\n').find(l => l.trim().length > 30) || '').slice(0, 140);

  const go = async () => {
    setBusy(true);
    await flush();
    try {
      if (confirm === 'send') {
        const r = await sendNow(c.id);
        addNotification('success', `On its way to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}`);
        setC({ ...c, status: 'sending' });
      } else {
        await saveCampaign(c.id, { status: 'scheduled', send_at: atDate.toISOString() });
        setC({ ...c, status: 'scheduled', send_at: atDate.toISOString() });
        addNotification('success', `Scheduled for ${fmtDate(atDate.toISOString())} at ${fmtTime(atDate.toISOString())}`);
      }
      setConfirm(null);
    } catch (e) {
      addNotification('error', (e as Error).message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const unschedule = async () => {
    setBusy(true);
    try { await saveCampaign(c.id, { status: 'draft' }); setC({ ...c, status: 'draft' }); addNotification('success', 'No longer scheduled. It’s a draft again.'); }
    catch (e) { addNotification('error', (e as Error).message); } finally { setBusy(false); }
  };
  const insertName = () => {
    const el = subjectRef.current;
    const pos = el?.selectionStart ?? c.subject.length;
    set({ subject: `${c.subject.slice(0, pos)}{first_name}${c.subject.slice(pos)}` });
  };

  return (
    <div className="es-full">
      <header className="es-top">
        <button className="a-ib" aria-label="Back to campaigns" onClick={async () => { await flush(); navigate('/email-studio/campaigns'); }}><ArrowLeft size={18} /></button>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div className="ttl"><input value={c.name} aria-label="Campaign name" onChange={e => set({ name: e.target.value })} disabled={locked} /></div>
          <div className="st"><StatusPill status={c.status} />{c.status === 'scheduled' && c.send_at ? `${fmtDate(c.send_at)} at ${fmtTime(c.send_at)}` : ''}<i className={saved === 'saved' ? 'ok' : ''} />{saved === 'saving' ? 'Saving…' : saved === 'dirty' ? 'Unsaved changes' : 'All changes saved'}</div>
        </div>
        <div className="r">
          <button className="a-btn a-btn-sm" onClick={async () => { await flush(); navigate(`/email-studio/campaigns/${c.id}/design`); }} disabled={locked}><Paintbrush size={15} />Edit design</button>
          {c.status === 'scheduled' && <button className="a-btn a-btn-sm" onClick={unschedule} disabled={busy}><X size={15} />Unschedule</button>}
          {locked ? <span className="es-pill es-v"><Loader2 size={12} className="es-spin" />Sending to {c.total_recipients || ''} people</span> : (
            <button className="a-btn a-btn-p" disabled={!ready || !atOk || busy} onClick={() => setConfirm(when === 'now' ? 'send' : 'schedule')} title={!ready ? 'Finish the checklist first' : undefined}>
              {when === 'now' ? <><Send size={15} />Send now</> : <><CalendarClock size={15} />{c.status === 'scheduled' ? 'Update schedule' : `Schedule for ${atDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`}</>}
            </button>
          )}
        </div>
      </header>

      <div className="es-scroll">
        <div className="es-wrap es-split-w" style={{ gridTemplateColumns: 'minmax(0,1fr) 440px' }}>
          <div className="es-col" style={{ gap: 14 }}>
            {c.last_error && <div className="a-card es-sec" style={{ borderColor: 'rgba(255,99,90,.35)' }}><AlertTriangle size={18} className="es-warn" /><div className="es-hint">{c.last_error}</div></div>}
            {locked && <div className="a-card es-sec"><Loader2 size={18} className="es-spin" /><div className="es-hint"><b>Sending now.</b> You can leave this page; it keeps going. The report opens when it’s done. <button className="es-link" onClick={() => navigate(`/email-studio/campaigns/${c.id}/report`)}>See progress</button></div></div>}

            <section className="a-card es-sec" aria-label="Who gets it">
              <Ck ok={checks.audience} />
              <div className="bd">
                <div className="hh"><h3 className="a-display">Who gets it</h3>
                  <span className="r"><label className="es-dim" style={{ fontSize: 12 }} htmlFor="es-topic">Topic</label>
                    <select id="es-topic" className="es-sel" style={{ width: 230, height: 34 }} value={c.topic || 'news'} onChange={e => set({ topic: e.target.value })} disabled={locked}>
                      {s.topics.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      <option value="important">Important club notice (everyone gets it)</option>
                    </select>
                  </span>
                </div>
                <AudienceEditor value={c.audience || DEFAULT_AUDIENCE} onChange={a => set({ audience: a })} />
                <div className="es-total">
                  <div><b>{counting && !count ? '…' : (count?.count ?? 0).toLocaleString()}</b><div className="es-dim" style={{ fontSize: 12 }}>{count?.count === 1 ? 'person will get this' : 'people will get this'}</div></div>
                  {count && count.count > 0 && (
                    <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', flex: 1, gap: 2, minWidth: 80 }} aria-hidden>
                      <i style={{ flex: count.members || 0.001, background: '#3987e5' }} /><i style={{ flex: count.others || 0.001, background: '#8A4DFF' }} />
                    </div>
                  )}
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <span style={{ color: '#8CC4FF' }}>{count?.members ?? 0} members</span>{count && count.others > 0 && <> · <span style={{ color: '#C9AEFF' }}>{count.others} others</span></>}
                    <br /><span className="es-dim">{count && count.left_out > 0 ? `${count.left_out} left out or opted out` : 'Anyone on two lists gets it once'}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="a-card es-sec" aria-label="From">
              <Ck ok={!!c.from_name.trim()} />
              <div className="bd">
                <div className="hh"><h3 className="a-display">From</h3></div>
                <div className="es-g2">
                  <label><span className="es-lbl">Sender name</span><input className="a-inp" value={c.from_name} onChange={e => set({ from_name: e.target.value })} disabled={locked} /></label>
                  <label><span className="es-lbl">Replies go to</span><input className="a-inp" type="email" value={c.reply_to || ''} placeholder="secretary@yourclub.org.au" onChange={e => set({ reply_to: e.target.value })} disabled={locked} /></label>
                </div>
                <div className="es-hint">Sent from noreply@alfiepro.com.au with your club’s name. Replies go to the address above.</div>
              </div>
            </section>

            <section className="a-card es-sec" aria-label="Subject line">
              <Ck ok={checks.subject} />
              <div className="bd">
                <div className="hh"><h3 className="a-display">Subject line</h3></div>
                <label><span className="es-lbl">Subject<span className="cn">{c.subject.length} characters{c.subject.length > 60 ? ' · long subjects get cut off on phones' : ''}</span></span>
                  <input ref={subjectRef} className="a-inp" value={c.subject} onChange={e => set({ subject: e.target.value })} disabled={locked} /></label>
                <label><span className="es-lbl">Preview text<span className="cn">Shows after the subject in most inboxes</span></span>
                  <input className="a-inp" value={c.preview_text || ''} placeholder="A short line that makes people want to open it" onChange={e => set({ preview_text: e.target.value })} disabled={locked} /></label>
                <div><button className="a-btn a-btn-sm" onClick={insertName} disabled={locked}><Type size={14} />Add first name</button></div>
              </div>
            </section>

            <section className="a-card es-sec" aria-label="Content">
              <Ck ok={checks.content ? (checks.alt ? true : 'warn') : false} />
              <div className="bd">
                <div className="hh"><h3 className="a-display">Content</h3><span className="r"><button className="a-btn a-btn-sm" onClick={async () => { await flush(); navigate(`/email-studio/campaigns/${c.id}/design`); }} disabled={locked}><Paintbrush size={14} />Edit design</button></span></div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ width: 150, height: 190, borderRadius: 10, overflow: 'hidden', position: 'relative', flexShrink: 0, boxShadow: '0 0 0 1px var(--e-line), 0 10px 24px rgba(0,0,0,.3)', background: '#F3F5F8', cursor: 'pointer' }}
                    onClick={async () => { if (locked) return; await flush(); navigate(`/email-studio/campaigns/${c.id}/design`); }} role="button" aria-label="Edit the design" tabIndex={0}>
                    {rendered && <iframe title="Email thumbnail" srcDoc={rendered.html} style={{ position: 'absolute', top: 0, left: 0, width: 660, height: 840, border: 0, transform: 'scale(0.227)', transformOrigin: 'top left', pointerEvents: 'none' }} tabIndex={-1} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: 1 }}>
                    <div className="es-chips">{liveBlocks.map(l => <span key={l} className="es-pill">{l}</span>)}</div>
                    {doc.blocks.length === 0 && <div className="es-hint es-warn">The email is empty. Add some blocks.</div>}
                    {problems.length === 0 ? <div className="es-hint">Links look good. Links to your club pages open in AlfiePRO.</div>
                      : problems.slice(0, 4).map((p, i) => <div key={i} className="es-hint es-warn">{p.what}. <button className="es-link" onClick={() => navigate(`/email-studio/campaigns/${c.id}/design?block=${p.blockId}`)}>Fix it</button></div>)}
                    {noAlt.length > 0 && <div className="es-hint es-warn">{noAlt.length} image{noAlt.length === 1 ? ' has' : 's have'} no description for screen readers. <button className="es-link" onClick={() => navigate(`/email-studio/campaigns/${c.id}/design?block=${noAlt[0]}`)}>Fix it</button></div>}
                  </div>
                </div>
              </div>
            </section>

            <section className="a-card es-sec" aria-label="When">
              <Ck ok={atOk} />
              <div className="bd">
                <div className="hh"><h3 className="a-display">When</h3></div>
                <div className="a-seg" role="group" aria-label="When to send" style={{ alignSelf: 'flex-start' }}>
                  <button className={`a-seg-i${when === 'now' ? ' a-seg-on' : ''}`} aria-pressed={when === 'now'} onClick={() => setWhen('now')} disabled={locked}>Send now</button>
                  <button className={`a-seg-i${when === 'later' ? ' a-seg-on' : ''}`} aria-pressed={when === 'later'} onClick={() => setWhen('later')} disabled={locked}>At a set time</button>
                </div>
                {when === 'later' && (
                  <label style={{ maxWidth: 320 }}><span className="es-lbl">Day and time</span>
                    <input className="a-inp" type="datetime-local" value={at} min={toLocalInput(new Date(Date.now() + 5 * 60000).toISOString())} onChange={e => setAt(e.target.value)} disabled={locked} /></label>
                )}
                <div className="es-hint">{when === 'now' ? 'It starts going out as soon as you press Send now. Large sends take a few minutes.' : atOk ? `Goes out ${atDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} at ${fmtTime(atDate.toISOString())}, your time. You can keep editing until then.` : 'Pick a time at least a few minutes from now.'}</div>
              </div>
            </section>
          </div>

          <aside className="es-col" style={{ gap: 14 }} aria-label="Checks and preview">
            <section className="a-card" style={{ padding: '16px 18px' }} aria-label="Ready to send">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h3 className="a-display es-ink" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Ready to send</h3><span className="es-dim" style={{ marginLeft: 'auto', fontSize: 12 }}>{[checks.audience, checks.subject, checks.content, checks.alt, checks.tested].filter(Boolean).length} of 5 done</span></div>
              <ul className="es-chk">
                <li><Ck ok={checks.audience} />{count ? `${count.count} ${count.count === 1 ? 'person' : 'people'} chosen` : 'Choose who gets it'}</li>
                <li><Ck ok={checks.subject} />Subject line</li>
                <li><Ck ok={checks.content} />Content and links{problems.length > 0 && <span className="r es-warn">{problems.length} to fix</span>}</li>
                <li><Ck ok={checks.alt || 'warn'} />Image descriptions{!checks.alt && <span className="r es-warn">{noAlt.length} to fix</span>}</li>
                <li><Ck ok={checks.tested || 'warn'} />Test email sent{c.test_sent_at ? <span className="r">{fmtTime(c.test_sent_at)}</span> : <span className="r">Recommended</span>}</li>
              </ul>
            </section>

            <section className="a-card" style={{ padding: '16px 18px 22px' }} aria-label="Inbox preview">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <h3 className="a-display es-ink" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>How it looks in the inbox</h3>
                <button className="a-btn a-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { const w = window.open('', '_blank'); if (w && rendered) { w.document.write(rendered.html); w.document.close(); } }}><Eye size={14} />Full preview</button>
              </div>
              <InboxPreview from={c.from_name} subject={previewSubject} preview={previewLine} />
            </section>

            <section className="a-card" style={{ padding: '16px 18px' }} aria-label="Send a test">
              <h3 className="a-display es-ink" style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600 }}>Send a test</h3>
              <TestSend doc={doc} subject={c.subject} previewText={c.preview_text || ''} fromName={c.from_name} replyTo={c.reply_to} campaignId={c.id} compact
                onSent={() => setC(x => (x ? { ...x, test_sent_at: new Date().toISOString() } : x))} />
            </section>
          </aside>
        </div>
      </div>

      {confirm && (
        <Confirm
          title={confirm === 'send' ? 'Send it now?' : 'Schedule it?'}
          body={confirm === 'send'
            ? <>“{c.subject}” goes to <b>{count?.count ?? 0} {count?.count === 1 ? 'person' : 'people'}</b> straight away. This can’t be undone.</>
            : <>“{c.subject}” goes to the people in this audience on <b>{atDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} at {fmtTime(atDate.toISOString())}</b>. You can unschedule it before then.</>}
          confirm={confirm === 'send' ? 'Send now' : 'Schedule'} busy={busy} onConfirm={go} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
};

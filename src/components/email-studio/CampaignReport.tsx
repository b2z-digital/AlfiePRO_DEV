import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Copy, ExternalLink, Link2, Loader2, MousePointerClick, RotateCcw, Trophy } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { BLOCKS, normaliseDoc } from '../../lib/emailStudio/catalog';
import { renderEmail } from '../../lib/emailStudio/render';
import type { EmailDoc } from '../../lib/emailStudio/types';
import { useStudio } from './studioData';
import { createCampaign, duplicateCampaign, fmtDate, fmtTime, getCampaign, pct, reportData, type CampaignRow, type ReportData } from './api';
import { EmailFrame, StatusPill } from './ui';
import { toneStyle } from './StudioHome';
import { BlockIcon } from './builder/icons';

const OpensChart: React.FC<{ hours: { h: number; n: number }[]; sent: number }> = ({ hours, sent }) => {
  const pts = useMemo(() => {
    const by = new Map(hours.map(h => [h.h, h.n]));
    let run = 0;
    return Array.from({ length: 49 }, (_v, h) => { if (h > 0) run += by.get(h - 1) || 0; return { h, v: sent ? Math.min(100, (run / sent) * 100) : 0 }; });
  }, [hours, sent]);
  const max = Math.min(100, Math.max(25, Math.ceil(Math.max(...pts.map(p => p.v)) / 25) * 25));
  const X = (h: number) => 44 + (h / 48) * 556;
  const Y = (v: number) => 150 - (v / max) * 140;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.h).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const ticks = Array.from({ length: max / 25 + 1 }, (_v, i) => i * 25);
  return (
    <svg viewBox="0 0 620 176" role="img" aria-label={`Opened by ${Math.round(last.v)}% after 48 hours`}>
      <defs><linearGradient id="es-opf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3987e5" stopOpacity=".32" /><stop offset="1" stopColor="#3987e5" stopOpacity="0" /></linearGradient></defs>
      {ticks.map(t => <g key={t}><line x1="44" x2="600" y1={Y(t)} y2={Y(t)} stroke="var(--e-line)" /><text x="36" y={Y(t) + 4} fill="var(--e-dim)" fontSize="11" textAnchor="end">{t}%</text></g>)}
      {[0, 12, 24, 36, 48].map(h => <text key={h} x={X(h)} y="170" fill="var(--e-dim)" fontSize="11" textAnchor="middle">{h === 0 ? 'Sent' : `${h} hours`}</text>)}
      <path d={`${line} L${X(48)} 150 L${X(0)} 150 Z`} fill="url(#es-opf)" />
      <path d={line} fill="none" stroke="#3987e5" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={X(48)} cy={Y(last.v)} r="4" fill="#3987e5" />
      <text x={X(48) - 4} y={Y(last.v) - 9} fill="var(--e-ink)" fontSize="12" fontWeight="700" textAnchor="end">{Math.round(last.v)}%</text>
    </svg>
  );
};

export const CampaignReport: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const s = useStudio();
  const { addNotification } = useNotifications();
  const [c, setC] = useState<CampaignRow | null>(null);
  const [doc, setDoc] = useState<EmailDoc | null>(null);
  const [r, setR] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { s.loadFeed(); }, [s]);
  useEffect(() => {
    if (!id) return;
    let off = false;
    const load = async () => {
      const [got, rep] = await Promise.all([getCampaign(id), reportData(id).catch(() => null)]);
      if (off) return;
      if (got) { setC(got.campaign); setDoc(normaliseDoc(got.doc)); }
      setR(rep);
    };
    load();
    const t = setInterval(() => { if (c?.status === 'sending' || !c) load(); }, 5000);
    return () => { off = true; clearInterval(t); };
  }, [id, c?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = r?.totals;
  const sent = t?.sent || 0;
  const totalClicks = useMemo(() => (r?.links || []).reduce((a, l) => a + l.clicks, 0), [r]);

  const mapHtml = useMemo(() => {
    if (!doc) return '';
    const html = renderEmail(doc, { brand: s.brand, feed: s.feed, reader: s.reader, footerAddress: s.defaults.footer_address, edit: true, subject: c?.subject }).html;
    const blocks = r?.blocks || {};
    const sum = Object.values(blocks).reduce((a, n) => a + n, 0);
    return html
      .replace('</head>', '<style>[data-es-block]>td{position:relative}.hm{position:absolute;right:10px;top:8px;padding:3px 9px;border-radius:99px;background:#E11D74;color:#fff;font:700 12px Arial,sans-serif;box-shadow:0 4px 10px rgba(0,0,0,.25);z-index:2}</style></head>')
      .replace(/<tr data-es-block="([^"]+)"[^>]*><td([^>]*)>/g, (m, bid) => {
        const n = blocks[bid];
        if (!n || !sum) return m;
        const share = Math.round((n / sum) * 100);
        const a = Math.min(0.85, 0.25 + share / 100);
        return m.replace(/<td([^>]*)>$/, `<td$1><div class="hm">${share}%</div><div style="position:absolute;inset:0;box-shadow:inset 0 0 0 2px rgba(225,29,116,${a});background:rgba(225,29,116,${a / 8});pointer-events:none"></div>`);
      });
  }, [doc, r, s.brand, s.feed, s.reader, s.defaults.footer_address, c?.subject]);

  if (!c) return <div className="es-full"><div className="es-empty" style={{ marginTop: 80 }}><Loader2 size={20} className="es-spin" /></div></div>;

  const follow = async (kind: 'not_opened' | 'opened_not_clicked') => {
    if (!doc) return;
    setBusy(kind);
    try {
      const nid = await createCampaign(s.clubId, {
        name: `${c.name} · ${kind === 'not_opened' ? 'resend' : 'follow-up'}`,
        subject: kind === 'not_opened' ? c.subject : `In case you missed it: ${c.subject}`,
        doc, fromName: c.from_name, replyTo: c.reply_to, topic: c.topic || 'news', previewText: c.preview_text || '',
        audience: { include: [{ kind, id: c.id, label: kind === 'not_opened' ? `Didn’t open “${c.name}”` : `Opened “${c.name}” but didn’t click` }], exclude: [] },
      });
      navigate(`/email-studio/campaigns/${nid}`);
    } catch (e) { addNotification('error', (e as Error).message); } finally { setBusy(null); }
  };

  const linkName = (u: string) => {
    try {
      const url = new URL(u);
      const path = url.pathname.replace(/\/club\/[^/]+\/public/, '') || '/';
      if (/alfiepro\.com\.au$/.test(url.hostname)) {
        if (path.startsWith('/whats-on/answer')) return url.searchParams.get('a') === 'no' ? 'Can’t make it' : 'I’m going';
        if (path.startsWith('/results')) return 'Results';
        if (path.startsWith('/news')) return 'News article';
        if (path.startsWith('/race-calendar')) return 'Race calendar';
        if (path.startsWith('/classifieds')) return 'Classifieds';
        if (path.startsWith('/play') || path.startsWith('/alfie-tv')) return 'AlfieTV video';
        if (path.startsWith('/membership')) return 'Renew membership';
        if (path.startsWith('/register')) return 'Join the club';
      }
      return url.hostname.replace(/^www\./, '');
    } catch { return u; }
  };

  return (
    <div className="es-full">
      <header className="es-top">
        <button className="a-ib" aria-label="Back to campaigns" onClick={() => navigate('/email-studio/campaigns')}><ArrowLeft size={18} /></button>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div className="ttl a-display">{c.name}</div>
          <div className="st"><StatusPill status={c.status} />{c.sent_at ? `${fmtDate(c.sent_at)}, ${fmtTime(c.sent_at)}` : c.status === 'sending' ? 'Going out now' : ''}{t ? ` · ${t.recipients} people` : ''}</div>
        </div>
        <div className="r">
          <button className="a-btn a-btn-sm" disabled={!!busy} onClick={async () => { setBusy('dup'); try { const nid = await duplicateCampaign(c.id); navigate(`/email-studio/campaigns/${nid}`); } catch (e) { addNotification('error', (e as Error).message); } finally { setBusy(null); } }}><Copy size={15} />Duplicate</button>
          <button className="a-btn a-btn-sm" onClick={() => { const w = window.open('', '_blank'); if (w && doc) { w.document.write(renderEmail(doc, { brand: s.brand, feed: s.feed, reader: s.reader, footerAddress: s.defaults.footer_address, subject: c.subject }).html); w.document.close(); } }}><ExternalLink size={15} />View email</button>
        </div>
      </header>

      <div className="es-scroll">
        <div className="es-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {c.status === 'sending' && t && (
            <div className="a-card es-sec"><Loader2 size={18} className="es-spin" /><div className="es-hint"><b>Sending: {t.sent + t.failed} of {t.recipients} done.</b> This page updates by itself.</div></div>
          )}
          {c.last_error && <div className="a-card es-sec"><span className="es-warn">{c.last_error}</span></div>}

          <section className="es-kpis" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }} aria-label="Results">
            <div className="a-card es-kpi"><p className="a-cap m-0">Delivered</p><div className="v es-num">{sent}<small>{t?.recipients ? `${pct(sent, t.recipients)}%` : ''}</small></div><div className="d">{t?.failed ? `${t.failed} couldn’t be sent` : 'Every email went out'}</div></div>
            <div className="a-card es-kpi"><p className="a-cap m-0">Opened</p><div className="v es-num">{t?.opened ?? 0}<small>{pct(t?.opened || 0, sent)}%</small></div><div className="d">Some mail apps hide opens, so this is a guide</div></div>
            <div className="a-card es-kpi"><p className="a-cap m-0">Clicked</p><div className="v es-num">{t?.clicked ?? 0}<small>{pct(t?.clicked || 0, sent)}%</small></div><div className="d">{t?.clicks ?? 0} clicks in total</div></div>
            <div className="a-card es-kpi hero"><p className="a-cap m-0">Back in AlfiePRO</p><div className="v es-num">{t?.app ?? 0}</div><div className="d">Followed a link into AlfiePRO</div></div>
            <div className="a-card es-kpi"><p className="a-cap m-0">Unsubscribed</p><div className="v es-num">{t?.unsubscribed ?? 0}<small>{pct(t?.unsubscribed || 0, sent)}%</small></div><div className="d">From this club’s emails</div></div>
          </section>

          <div className="es-split" style={{ gridTemplateColumns: 'minmax(0,1fr) 470px' }}>
            <div className="es-col">
              <section className="a-card" aria-label="Opened over the first 48 hours">
                <div className="es-ch"><span className="a-tile" style={toneStyle('b')}><BarChart3 size={17} /></span><div><h3 className="a-display">Opened over the first 48 hours</h3><div className="sub">Share of the {sent} delivered</div></div></div>
                <div className="es-chart">{r ? <OpensChart hours={r.hours} sent={sent} /> : <div className="es-empty"><Loader2 size={16} className="es-spin" /></div>}</div>
              </section>

              <div className="es-g2" style={{ gap: 20 }}>
                <section className="a-card" aria-label="Follow up">
                  <div className="es-ch"><span className="a-tile" style={toneStyle('g')}><RotateCcw size={17} /></span><div><h3 className="a-display">Follow up</h3><div className="sub">Reach the people this missed</div></div></div>
                  <div className="es-cb" style={{ gap: 10 }}>
                    <div className="es-fu"><b>{t?.not_opened ?? 0}</b><span className="t">didn’t open it. Send it again with a new subject line.</span><button className="a-btn a-btn-sm" disabled={!t?.not_opened || !!busy} onClick={() => follow('not_opened')}>{busy === 'not_opened' && <Loader2 size={14} className="es-spin" />}Resend</button></div>
                    <div className="es-fu"><b>{t?.opened_not_clicked ?? 0}</b><span className="t">opened but didn’t click. Send them a short follow-up.</span><button className="a-btn a-btn-sm" disabled={!t?.opened_not_clicked || !!busy} onClick={() => follow('opened_not_clicked')}>{busy === 'opened_not_clicked' && <Loader2 size={14} className="es-spin" />}Follow up</button></div>
                  </div>
                </section>
                <section className="a-card" aria-label="Where people clicked">
                  <div className="es-ch"><span className="a-tile" style={toneStyle('p')}><MousePointerClick size={17} /></span><div><h3 className="a-display">Most clicked</h3><div className="sub">By part of the email</div></div></div>
                  <ul className="es-acts">
                    {Object.entries(r?.blocks || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([bid, n]) => {
                      const b = doc?.blocks.find(x => x.id === bid);
                      return <li key={bid}><span className="a-tile" style={{ width: 28, height: 28 }}>{b ? <BlockIcon type={b.type} size={14} /> : <Trophy size={14} />}</span>{b ? BLOCKS[b.type].label : 'A block you removed'}<b>{n}</b></li>;
                    })}
                    {!Object.keys(r?.blocks || {}).length && <li className="es-dim">No clicks yet</li>}
                  </ul>
                </section>
              </div>

              <section className="a-card" aria-label="Links">
                <div className="es-ch"><span className="a-tile"><Link2 size={17} /></span><div><h3 className="a-display">Links</h3><div className="sub">{totalClicks} clicks from {t?.clicked ?? 0} people</div></div></div>
                {(r?.links || []).length === 0 ? <div className="es-empty">No clicks yet.</div> : (
                  <table className="es-lt">
                    <thead><tr><th>Link</th><th style={{ textAlign: 'right' }}>Clicks</th><th style={{ textAlign: 'right', width: 180 }}>Share of clicks</th></tr></thead>
                    <tbody>
                      {(r?.links || []).slice(0, 12).map((l, i) => (
                        <tr key={i}>
                          <td>{linkName(l.url)}<div className="u">{l.url}</div></td>
                          <td className="n">{l.clicks}</td>
                          <td><div className="es-bar" style={{ justifyContent: 'flex-end' }}><i style={{ width: Math.max(4, pct(l.clicks, totalClicks) * 1.6) }} /><span className="es-num">{pct(l.clicks, totalClicks)}%</span></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <section className="a-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Click map">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h3 className="a-display es-ink" style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Click map</h3><span className="es-dim" style={{ fontSize: 12.5 }}>Share of clicks on each part</span></div>
              {doc && <EmailFrame html={mapHtml} auto title="Click map" />}
              <span className="es-dim" style={{ fontSize: 11.5 }}>Club content is shown as it is today, so it may differ from what was sent.</span>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ExternalLink, Loader2, Mail, Palette, Plus, Tags, Trash2 } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { ASwitch } from '../alfie/Kit';
import { brandFor, DEFAULT_BRAND, TOPICS_DEFAULT, topicsFor, type StudioSettingsRow } from '../../lib/emailStudio/brand';
import { starterDoc } from '../../lib/emailStudio/catalog';
import { renderEmail } from '../../lib/emailStudio/render';
import type { Brand } from '../../lib/emailStudio/types';
import { useStudio } from './studioData';
import { FROM_EMAIL, isEmail, saveSettings } from './api';
import { EmailFrame } from './ui';
import { toneStyle } from './StudioHome';
import { ImageField } from './builder/Inspector';

const FONTS = ['Inter', 'Outfit', 'Poppins', 'Montserrat', 'Lato', 'Open Sans', 'Roboto', 'Raleway', 'Playfair Display', 'Merriweather', 'Georgia', 'Arial'];

/** Email studio › Settings: sender, brand kit and the topics members can choose from. */
export const StudioSettings: React.FC = () => {
  const s = useStudio();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const initial = useMemo<StudioSettingsRow>(() => ({
    from_name: s.settings?.from_name ?? s.club?.name ?? '',
    reply_to: s.settings?.reply_to ?? s.club?.contact_email ?? '',
    footer_address: s.settings?.footer_address ?? s.club?.address ?? '',
    use_website_brand: s.settings?.use_website_brand ?? true,
    brand: s.settings?.brand ?? null,
    topics: topicsFor(s.settings),
  }), [s.settings, s.club]);
  const [f, setF] = useState<StudioSettingsRow>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(initial), [initial]);
  useEffect(() => { s.loadFeed(); }, [s.loadFeed]); // eslint-disable-line react-hooks/exhaustive-deps

  const website = useMemo(() => brandFor({ name: s.club?.name || 'Your club', logo: s.club?.logo, website_theme: s.club?.website_theme }, null), [s.club]);
  const own: Partial<Brand> = f.brand || {};
  const brand = useMemo(() => brandFor({ name: s.club?.name || 'Your club', logo: s.club?.logo, website_theme: s.club?.website_theme }, f), [s.club, f]);
  const setBrand = (patch: Partial<Brand>) => setF(x => ({ ...x, brand: { ...website, ...(x.brand || {}), ...patch } }));
  const html = useMemo(() => renderEmail(starterDoc(), { brand, feed: s.feed, reader: s.reader, footerAddress: f.footer_address || null, subject: 'Preview' }).html, [brand, s.feed, s.reader, f.footer_address]);

  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const topics = f.topics || TOPICS_DEFAULT;
  const setTopic = (i: number, patch: Partial<{ label: string; note: string }>) => setF(x => ({ ...x, topics: (x.topics || TOPICS_DEFAULT).map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const save = async () => {
    if (!String(f.from_name || '').trim()) { addNotification('error', 'Add a sender name'); return; }
    if (f.reply_to && !isEmail(f.reply_to)) { addNotification('error', 'The reply-to address doesn’t look right'); return; }
    const clean = topics.map(t => ({ ...t, label: t.label.trim() || 'Untitled topic' }));
    setSaving(true);
    try {
      const row: StudioSettingsRow = { ...f, from_name: String(f.from_name).trim(), reply_to: f.reply_to?.trim() || null, footer_address: f.footer_address?.trim() || null, topics: clean };
      await saveSettings(s.clubId, row);
      await s.reload(['settings']);
      addNotification('success', 'Email settings saved');
    } catch (e) { addNotification('error', (e as Error).message || 'Could not save'); } finally { setSaving(false); }
  };

  const Swatch = ({ label, c }: { label: string; c: string }) => <span className="es-swatch"><i style={{ background: c }} />{label}</span>;
  const colour = (label: string, k: 'primary' | 'dark' | 'accent') => (
    <label key={k} className="es-swatch" style={{ cursor: 'pointer' }}>
      <i style={{ background: brand[k], position: 'relative', overflow: 'hidden' }}><input type="color" value={brand[k]} onChange={e => setBrand({ [k]: e.target.value })} aria-label={`${label} colour`} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></i>{label}
    </label>
  );

  return (
    <div className="es-split-w">
      <div className="es-col">
        <section className="a-card" aria-label="Sender">
          <div className="es-ch"><span className="a-tile" style={toneStyle('b')}><Mail size={17} /></span><div><h3 className="a-display">Sender</h3><div className="sub">How your emails show up in an inbox</div></div></div>
          <div className="es-cb">
            <div className="es-g2">
              <div><div className="es-lbl">Sender name</div><div className="a-field"><input value={f.from_name || ''} onChange={e => setF(x => ({ ...x, from_name: e.target.value }))} aria-label="Sender name" /></div></div>
              <div><div className="es-lbl">Replies go to</div><div className="a-field"><input type="email" value={f.reply_to || ''} onChange={e => setF(x => ({ ...x, reply_to: e.target.value }))} placeholder="secretary@yourclub.com" aria-label="Reply-to address" /></div></div>
            </div>
            <div className="es-hint">Emails are sent from <b>{FROM_EMAIL}</b> so they reach inboxes reliably. When members reply, it goes to the address above.</div>
            <div>
              <div className="es-lbl">Address in the footer</div>
              <textarea className="es-ta" style={{ minHeight: 70 }} value={f.footer_address || ''} onChange={e => setF(x => ({ ...x, footer_address: e.target.value }))} placeholder="Club address, shown at the bottom of every email" aria-label="Footer address" />
              <div className="es-hint" style={{ marginTop: 6 }}>Email rules ask for a postal address in every newsletter.</div>
            </div>
          </div>
        </section>

        <section className="a-card" aria-label="Brand kit">
          <div className="es-ch"><span className="a-tile" style={toneStyle('p')}><Palette size={17} /></span><div><h3 className="a-display">Brand kit</h3><div className="sub">Colours, logo and fonts every email uses</div></div></div>
          <div className="es-cb">
            <div className="es-sws">
              <div className="es-swr">
                <div className="t"><b>Use your website’s look</b><span>Emails match Website › Design. Change it there and emails follow.</span></div>
                <ASwitch checked={f.use_website_brand !== false} onChange={v => setF(x => ({ ...x, use_website_brand: v, brand: v ? x.brand : { ...website, ...(x.brand || {}) } }))} label="Use your website’s look" />
              </div>
            </div>
            {f.use_website_brand !== false ? (
              <>
                <div className="es-swatches"><Swatch label="Main" c={website.primary} /><Swatch label="Dark" c={website.dark} /><Swatch label="Accent" c={website.accent} /></div>
                <div className="es-hint">{website.headingFont} for headings, {website.bodyFont} for text.</div>
                <button className="es-link" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/website/theme')}><ExternalLink size={14} />Open Website › Design</button>
              </>
            ) : (
              <>
                <div className="es-swatches">{colour('Main', 'primary')}{colour('Dark', 'dark')}{colour('Accent', 'accent')}</div>
                <ImageField label="Logo" value={own.logo || s.club?.logo || ''} onChange={v => setBrand({ logo: v || null })} />
                <div className="es-g2">
                  <div><div className="es-lbl">Heading font</div><select className="es-sel" value={brand.headingFont} onChange={e => setBrand({ headingFont: e.target.value })}>{FONTS.map(x => <option key={x}>{x}</option>)}</select></div>
                  <div><div className="es-lbl">Text font</div><select className="es-sel" value={brand.bodyFont} onChange={e => setBrand({ bodyFont: e.target.value })}>{FONTS.map(x => <option key={x}>{x}</option>)}</select></div>
                </div>
                <div className="es-g2">
                  <div><div className="es-lbl">Corners</div><div className="esb-tog">{(['square', 'soft', 'round'] as const).map(c => <button key={c} type="button" className={brand.corners === c ? 'on' : ''} onClick={() => setBrand({ corners: c })}>{c[0].toUpperCase() + c.slice(1)}</button>)}</div></div>
                  <div><div className="es-lbl">Buttons</div><div className="esb-tog">{(['solid', 'outline'] as const).map(c => <button key={c} type="button" className={brand.buttons === c ? 'on' : ''} onClick={() => setBrand({ buttons: c })}>{c[0].toUpperCase() + c.slice(1)}</button>)}</div></div>
                </div>
                <button className="es-link" style={{ alignSelf: 'flex-start' }} onClick={() => setF(x => ({ ...x, brand: { ...website } }))}>Start again from the website colours</button>
              </>
            )}
          </div>
        </section>

        <section className="a-card" aria-label="Topics">
          <div className="es-ch"><span className="a-tile" style={toneStyle('g')}><Tags size={17} /></span><div><h3 className="a-display">Topics</h3><div className="sub">Members can turn each one off without leaving every email</div></div></div>
          <div className="es-cb" style={{ gap: 8 }}>
            {topics.map((t, i) => (
              <div key={t.key} className="es-topic">
                <div className="t">
                  <input value={t.label} onChange={e => setTopic(i, { label: e.target.value })} aria-label="Topic name" />
                  <small><input value={t.note || ''} onChange={e => setTopic(i, { note: e.target.value })} placeholder="What members get" aria-label="Topic description" style={{ font: '400 11.5px Instrument Sans, sans-serif', color: 'var(--e-dim)' }} /></small>
                </div>
                {!TOPICS_DEFAULT.some(d => d.key === t.key) && <button className="a-ib" aria-label={`Remove ${t.label}`} onClick={() => setF(x => ({ ...x, topics: (x.topics || TOPICS_DEFAULT).filter((_y, j) => j !== i) }))}><Trash2 size={15} /></button>}
              </div>
            ))}
            <div className="es-topic" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--e-line)' }}>
              <div className="t"><b className="es-ink" style={{ fontSize: 13 }}>Important club notices</b><small>Renewals, receipts, AGMs and safety notices. Everyone gets these, even if they unsubscribe from the rest.</small></div>
              <Check size={16} className="es-dim" />
            </div>
            <button type="button" className="es-chip add" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => {
              const label = 'New topic';
              let key = '';
              do { key = `custom_${Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`; } while (topics.some(t => t.key === key));
              setF(x => ({ ...x, topics: [...(x.topics || TOPICS_DEFAULT), { key, label, note: '' }] }));
            }}><Plus size={13} />Add a topic</button>
          </div>
        </section>
      </div>

      <div className="es-col" style={{ position: 'sticky', top: 16 }}>
        <section className="a-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Preview">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 className="a-display es-ink" style={{ margin: 0, fontSize: 17, fontWeight: 600, flex: 1 }}>How emails look</h3>
            <button className="a-btn a-btn-p a-btn-sm" disabled={!dirty || saving} onClick={save}>{saving ? <Loader2 size={14} className="es-spin" /> : <Check size={14} />}{dirty ? 'Save changes' : 'Saved'}</button>
          </div>
          <EmailFrame html={html} height={620} title="Brand preview" />
          {f.use_website_brand === false && brand.primary === DEFAULT_BRAND.primary && <span className="es-dim" style={{ fontSize: 11.5 }}>Pick your club colours on the left.</span>}
        </section>
      </div>
    </div>
  );
};

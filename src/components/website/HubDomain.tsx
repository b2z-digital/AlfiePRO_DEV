import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Check, Image as ImageIcon, Loader2, Search, Share2 } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAlfieLight } from '../alfie/Kit';
import { MediaLibraryModal } from '../MediaLibraryModal';
import { EnhancedDomainManagementSection } from '../settings/EnhancedDomainManagementSection';
import { useHub } from './hubData';

interface Form {
  seo_title: string;
  seo_description: string;
  allow_indexing: boolean;
  default_share_image: string | null;
  default_share_description: string;
  twitter_handle: string;
  google_analytics_id: string;
  facebook_pixel_id: string;
}

export const HubDomain: React.FC = () => {
  const { club, liveHost, updateClub, reload, log } = useHub();
  const { addNotification } = useNotifications();
  const light = useAlfieLight();
  const c = club!;
  const initial = useMemo<Form>(() => ({
    seo_title: c.seo_title || c.name,
    seo_description: c.seo_description || '',
    allow_indexing: c.allow_indexing !== false,
    default_share_image: c.default_share_image || null,
    default_share_description: c.default_share_description || '',
    twitter_handle: c.twitter_handle || '',
    google_analytics_id: c.google_analytics_id || '',
    facebook_pixel_id: c.facebook_pixel_id || '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [c.id]);
  const [form, setForm] = useState<Form>(initial);
  const [base, setBase] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    const patch = {
      seo_title: form.seo_title.trim() || c.name,
      seo_description: form.seo_description.trim() || null,
      allow_indexing: form.allow_indexing,
      default_share_image: form.default_share_image,
      default_share_description: form.default_share_description.trim() || null,
      twitter_handle: form.twitter_handle.trim() || null,
      google_analytics_id: form.google_analytics_id.trim() || null,
      facebook_pixel_id: form.facebook_pixel_id.trim() || null,
    };
    const ok = await updateClub(patch as any);
    setSaving(false);
    if (ok) { setBase(form); log('updated', 'settings', 'Search and sharing'); addNotification('success', 'Saved'); }
    else addNotification('error', 'Could not save. Please try again.');
  };

  const host = liveHost || 'your-club.alfiepro.com.au';
  const shareImg = form.default_share_image;
  const shareIsLogo = !shareImg || shareImg === c.logo;
  const desc = form.seo_description.trim();
  const googleOk = form.seo_title.trim().length >= 10 && desc.length >= 50;
  const gaOk = /^G-[A-Z0-9]{6,}$/i.test(form.google_analytics_id.trim());

  return (
    <>
      <div className="wh-dm">
        <div className="wh-col">
          {c.id && (
            <EnhancedDomainManagementSection
              entityType="club"
              entityId={c.id}
              entityName={c.name}
              currentSubdomain={c.abbreviation?.toLowerCase()}
              onDomainUpdate={() => reload(['club', 'domains'])}
            />
          )}

          <section className="a-card" aria-label="Google and search">
            <div className="wh-ch"><span className="a-tile a-tile-sm"><Search size={17} /></span><div><h3 className="a-display">Google and search</h3><div className="sub">What people see before they click</div></div></div>
            <div className="wh-cb">
              <div><label className="wh-lab" htmlFor="w-seo-t">Site title <span className="c">{form.seo_title.length} / 60</span></label><input id="w-seo-t" className="a-inp" value={form.seo_title} maxLength={70} onChange={e => set({ seo_title: e.target.value })} /></div>
              <div>
                <label className="wh-lab" htmlFor="w-seo-d">Description <span className="c">{form.seo_description.length} / 160</span></label>
                <textarea id="w-seo-d" className="a-inp" rows={3} value={form.seo_description} maxLength={200} onChange={e => set({ seo_description: e.target.value })} placeholder={`e.g. Radio yacht racing every Sunday at ${c.name.split(' ')[0]}. New skippers welcome.`} />
                <div className="wh-hint">Say where you sail and what you race. That is what people search for.</div>
              </div>
              <div className="wh-swline">
                <div><div className="t">Let search engines list my site</div><div className="s">Turn off while you are still building it</div></div>
                <button type="button" role="switch" aria-checked={form.allow_indexing} aria-label="Let search engines list my site" className="a-sw" onClick={() => set({ allow_indexing: !form.allow_indexing })} />
              </div>
            </div>
          </section>
        </div>

        <div className="wh-col">
          <section className="a-card" aria-label="Previews">
            <div className="wh-cb" style={{ paddingTop: 18 }}>
              <div>
                <div className="wh-pvh"><p className="a-cap">On Google</p>{googleOk ? <span className="wh-pill wh-live"><Check size={12} />Looks good</span> : <span className="wh-pill wh-warn"><AlertTriangle size={12} />Add a description</span>}</div>
                <div className="wh-gsr">
                  <div className="site"><span className="fav">{c.logo ? <img src={c.logo} alt="" /> : null}</span><div><div className="sn">{c.name}</div><div className="su">https://{host}</div></div></div>
                  <div className="gt">{form.seo_title || c.name}</div>
                  <div className="gd">{desc || `Official website of ${c.name}`}</div>
                </div>
              </div>
              <div>
                <div className="wh-pvh"><p className="a-cap">When your link is shared</p>{shareIsLogo ? <span className="wh-pill wh-warn"><AlertTriangle size={12} />Only your logo</span> : <span className="wh-pill wh-live"><Check size={12} />Photo set</span>}</div>
                <div className="wh-fb">
                  <div className="im">{shareImg ? <img src={shareImg} alt="" className={shareIsLogo ? 'logo' : undefined} /> : c.logo ? <img src={c.logo} alt="" className="logo" /> : null}</div>
                  <div className="tx"><div className="d">{host}</div><div className="t">{form.seo_title || c.name}</div><div className="s">{form.default_share_description || desc || `Visit the official website of ${c.name}`}</div></div>
                </div>
              </div>
            </div>
          </section>

          <section className="a-card" aria-label="Sharing">
            <div className="wh-ch"><span className="a-tile a-tile-sm"><Share2 size={17} /></span><div><h3 className="a-display">Sharing</h3><div className="sub">Facebook, Messenger and X</div></div></div>
            <div className="wh-cb">
              <div className="wh-shimg">
                <span className="th">{shareImg ? <img src={shareImg} alt="" className={shareIsLogo ? 'logo' : undefined} /> : <ImageIcon size={20} className="wh-dim" />}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="a-btn a-btn-p" style={{ height: 34 }} onClick={() => setPicker(true)}><ImageIcon size={15} />{shareIsLogo ? 'Choose a photo' : 'Change photo'}</button>
                  <span className="wh-dim" style={{ fontSize: 11.5, lineHeight: 1.35 }}>Wide photos work best (1200 × 630).</span>
                </div>
              </div>
              <div><label className="wh-lab" htmlFor="w-sh-d">Share text</label><input id="w-sh-d" className="a-inp" value={form.default_share_description} onChange={e => set({ default_share_description: e.target.value })} placeholder={`Visit the official website of ${c.name}`} /></div>
              <div><label className="wh-lab" htmlFor="w-sh-x">X (Twitter) handle <span className="c">Optional</span></label><input id="w-sh-x" className="a-inp" value={form.twitter_handle} onChange={e => set({ twitter_handle: e.target.value })} placeholder="@yourclub" /></div>
            </div>
          </section>

          <section className="a-card" aria-label="Visitor tracking">
            <div className="wh-ch"><span className="a-tile a-tile-sm"><BarChart3 size={17} /></span><div><h3 className="a-display">Other tracking</h3><div className="sub">AlfiePRO counts your visitors for you. Add these only if you already use them.</div></div></div>
            <div className="wh-cb">
              <div>
                <label className="wh-lab" htmlFor="w-ga">Google Analytics ID</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input id="w-ga" className="a-inp" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }} value={form.google_analytics_id} onChange={e => set({ google_analytics_id: e.target.value })} placeholder="G-XXXXXXXXXX" />
                  {gaOk && <span className="wh-pill wh-live" style={{ flexShrink: 0 }}><Check size={12} />Connected</span>}
                </div>
              </div>
              <div><label className="wh-lab" htmlFor="w-px">Facebook Pixel ID <span className="c">Optional</span></label><input id="w-px" className="a-inp" value={form.facebook_pixel_id} onChange={e => set({ facebook_pixel_id: e.target.value })} placeholder="e.g. 1234567890" /></div>
            </div>
          </section>
        </div>
      </div>

      {dirty && (
        <div style={{ position: 'sticky', bottom: 16, zIndex: 20, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div className="wh-savebar" style={{ position: 'static', transform: 'none', pointerEvents: 'auto' }} role="status">
            <span className="dt" /><span style={{ fontWeight: 600 }}>Unsaved changes</span>
            <button className="a-btn" style={{ height: 34 }} onClick={() => setForm(base)}>Undo</button>
            <button className="a-btn a-btn-p" style={{ height: 34 }} onClick={save} disabled={saving}>{saving ? <Loader2 size={15} className="wh-spin" /> : null}Save</button>
          </div>
        </div>
      )}

      {picker && (
        <MediaLibraryModal isOpen onClose={() => setPicker(false)} onSelect={url => { set({ default_share_image: url }); setPicker(false); }} darkMode={!light} isHomepageMedia />
      )}
    </>
  );
};

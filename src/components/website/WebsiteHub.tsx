import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Eye, Send, SquarePen, LayoutGrid, FileText, House, Palette, BarChart3, Trophy, ExternalLink, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { updateOrganizationPage } from '../../utils/organizationPageBuilderStorage';
import { WebsiteHubProvider, useHub } from './hubData';
import { HubOverview } from './HubOverview';
import { HubPages } from './HubPages';
import { HubHomepage } from './HubHomepage';
import { HubDesign } from './HubDesign';
import { HubDomain } from './HubDomain';
import { HubAnalytics } from './HubAnalytics';
import { HubEvents } from './HubEvents';
import '../../styles/alfie-website.css';

export type HubTab = 'overview' | 'pages' | 'homepage' | 'design' | 'domain' | 'analytics' | 'events';

export const HUB_ROUTES: Record<HubTab, string> = {
  overview: '/website',
  pages: '/website/pages',
  homepage: '/website/homepage',
  design: '/website/theme',
  domain: '/website/settings',
  analytics: '/website/analytics',
  events: '/website/event-websites-management',
};

const TABS: { id: HubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} /> },
  { id: 'pages', label: 'Pages & menu', icon: <FileText size={16} /> },
  { id: 'homepage', label: 'Homepage', icon: <House size={16} /> },
  { id: 'design', label: 'Design', icon: <Palette size={16} /> },
  { id: 'domain', label: 'Domain & SEO', icon: <Globe size={16} /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
  { id: 'events', label: 'Event sites', icon: <Trophy size={16} /> },
];

/** Draft pages that have something on them (empty drafts don't need publishing). */
export const draftsToPublish = (pages: { is_published: boolean; rows?: unknown[] | null }[]) =>
  pages.filter(p => !p.is_published && Array.isArray(p.rows) && p.rows.length > 0);

const PublishDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { pages, reload, log } = useHub();
  const { addNotification } = useNotifications();
  const drafts = draftsToPublish(pages as any);
  const [busy, setBusy] = useState<string | null>(null);

  const publish = async (ids: string[]) => {
    setBusy(ids.length > 1 ? 'all' : ids[0]);
    let ok = 0;
    for (const id of ids) {
      const res = await updateOrganizationPage(id, { is_published: true } as any);
      if (res) {
        ok++;
        log('published', 'page', res.page_title, res.id);
      }
    }
    await reload(['pages']);
    setBusy(null);
    if (ok) addNotification('success', ok === 1 ? 'Page published' : `${ok} pages published`);
    else addNotification('error', 'Could not publish. Please try again.');
    if (ok === drafts.length) onClose();
  };

  return (
    <div className="a-dlg" role="dialog" aria-modal="true" aria-label="Publish pages" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="a-sheet" style={{ maxWidth: 480 }}>
        <div className="a-dlg-head">
          <span className="a-tile"><Send size={17} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="a-display a-ink m-0 text-[18px] font-semibold">Publish pages</h2>
            <p className="a-dim m-0 mt-0.5 text-[12.5px]">Draft pages only appear on your site once published. Everything else goes live when you save it.</p>
          </div>
          <button className="a-ib" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="a-dlg-body" style={{ padding: 0 }}>
          {drafts.length === 0 ? (
            <p className="wh-empty">Nothing waiting. All your pages are live.</p>
          ) : drafts.map((p: any) => (
            <div key={p.id} className="a-lnk">
              <FileText size={17} className="a-dim" />
              <div className="flex-1 min-w-0">
                <div className="a-ink text-[14px] font-semibold truncate">{p.page_title}</div>
                <div className="a-dim text-[12px]">/{p.page_slug}</div>
              </div>
              <button className="a-btn" style={{ height: 34 }} disabled={!!busy} onClick={() => publish([p.id])}>
                {busy === p.id ? <Loader2 size={15} className="wh-spin" /> : 'Publish'}
              </button>
            </div>
          ))}
        </div>
        {drafts.length > 1 && (
          <div className="a-dlg-foot">
            <button className="a-btn a-btn-p" disabled={!!busy} onClick={() => publish(drafts.map((d: any) => d.id))}>
              {busy === 'all' ? <Loader2 size={15} className="wh-spin" /> : <Send size={15} />}Publish all {drafts.length}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const HubShell: React.FC<{ tab: HubTab }> = ({ tab }) => {
  const navigate = useNavigate();
  const hub = useHub();
  const { club, pages, addresses, activity, liveHost, previewHref, status, loading } = hub;
  const [publishOpen, setPublishOpen] = useState(false);
  const drafts = draftsToPublish(pages as any);
  const domainProblem = addresses.some(a => a.state === 'problem');

  const lastChange = activity[0];
  const editTarget = useMemo(() => {
    const withContent = [...pages].sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    return withContent[0]?.page_slug || null;
  }, [pages]);

  const statusPill = status === 'live'
    ? <span className="wh-pill wh-live"><span className="d" />Live</span>
    : status === 'pending'
      ? <span className="wh-pill wh-draft"><span className="d" />Setting up address</span>
      : <span className="wh-pill"><span className="d" />Not live yet</span>;

  const logo = club?.logo;
  const initials = (club?.abbreviation || club?.name || '?').slice(0, 4).toUpperCase();

  return (
    <div className="h-full overflow-y-auto">
      <div className="wh-root">
        <header className="wh-head">
          <span className="wh-clubmark">{logo ? <img src={logo} alt="" /> : <span>{initials}</span>}</span>
          <div className="min-w-0">
            <div className="wh-titlerow"><h1 className="a-display">Website</h1>{!loading && statusPill}</div>
            <div className="wh-sub">
              {liveHost ? (
                <a href={`https://${liveHost}`} target="_blank" rel="noopener noreferrer">{liveHost}<ExternalLink size={13} /></a>
              ) : (
                <span>{club?.name}</span>
              )}
              {lastChange && (
                <>
                  <span className="wh-dim">·</span>
                  <span>Last change {lastChange.created_at ? new Date(lastChange.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''} by {lastChange.who}</span>
                </>
              )}
            </div>
          </div>
          <div className="wh-act">
            <a className="a-btn" href={previewHref} target="_blank" rel="noopener noreferrer"><Eye size={17} />Preview</a>
            {drafts.length > 0 && (
              <button className="a-btn" onClick={() => setPublishOpen(true)}><Send size={16} />Publish<span className="wh-cnt">{drafts.length}</span></button>
            )}
            <button
              className="a-btn a-btn-p"
              onClick={() => navigate(editTarget ? `/website/pages/edit/${editTarget}` : `${HUB_ROUTES.pages}?new=1`)}
            >
              <SquarePen size={16} />Edit website
            </button>
          </div>
        </header>

        <nav className="wh-tabs" aria-label="Website sections">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`wh-tab${t.id === tab ? ' on' : ''}`}
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => navigate(HUB_ROUTES[t.id])}
            >
              {t.icon}{t.label}
              {t.id === 'pages' && pages.length > 0 && <span className="n">{pages.length}</span>}
              {t.id === 'domain' && domainProblem && <span className="wd" aria-label="Needs attention" />}
            </button>
          ))}
        </nav>

        {loading || !club ? (
          <div className="a-card wh-empty" style={{ padding: 48 }}><Loader2 size={20} className="wh-spin inline" /> Loading your website…</div>
        ) : (
          <>
            {tab === 'overview' && <HubOverview />}
            {tab === 'pages' && <HubPages />}
            {tab === 'homepage' && <HubHomepage />}
            {tab === 'design' && <HubDesign />}
            {tab === 'domain' && <HubDomain />}
            {tab === 'analytics' && <HubAnalytics />}
            {tab === 'events' && <HubEvents />}
          </>
        )}
      </div>
      {publishOpen && <PublishDialog onClose={() => setPublishOpen(false)} />}
    </div>
  );
};

/** The club Website area. Associations keep their existing screens (see DashboardLayout). */
export const WebsiteHub: React.FC<{ tab: HubTab }> = ({ tab }) => {
  const { currentClub } = useAuth();
  const clubId = currentClub?.clubId;
  if (!clubId) return null;
  return (
    <WebsiteHubProvider clubId={clubId} key={clubId}>
      <HubShell tab={tab} />
    </WebsiteHubProvider>
  );
};

export default WebsiteHub;

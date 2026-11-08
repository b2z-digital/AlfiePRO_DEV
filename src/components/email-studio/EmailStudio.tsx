import React, { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { FileText, LayoutGrid, Loader2, Plus, Send, Settings2, Users, Workflow, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { StudioProvider, useStudio } from './studioData';
import { StudioHome } from './StudioHome';
import { StudioCampaigns } from './StudioCampaigns';
import { CampaignComposer } from './CampaignComposer';
import { CampaignReport } from './CampaignReport';
import { EmailBuilder } from './builder/EmailBuilder';
import { StudioAudience } from './StudioAudience';
import { StudioTemplates, TemplatePicker } from './StudioTemplates';
import { StudioFlows } from './StudioFlows';
import { StudioSettings } from './StudioSettings';
import { createCampaign, DEFAULT_AUDIENCE } from './api';
import type { EmailDoc } from '../../lib/emailStudio/types';
import '../../styles/alfie-email-studio.css';

export type StudioTab = 'home' | 'campaigns' | 'flows' | 'audience' | 'templates' | 'settings';
export const STUDIO_ROUTES: Record<StudioTab, string> = {
  home: '/email-studio',
  campaigns: '/email-studio/campaigns',
  flows: '/email-studio/flows',
  audience: '/email-studio/audience',
  templates: '/email-studio/templates',
  settings: '/email-studio/settings',
};
const TABS: { id: StudioTab; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <LayoutGrid size={16} /> },
  { id: 'campaigns', label: 'Campaigns', icon: <Send size={16} /> },
  { id: 'flows', label: 'Flows', icon: <Workflow size={16} /> },
  { id: 'audience', label: 'Audience', icon: <Users size={16} /> },
  { id: 'templates', label: 'Templates', icon: <FileText size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 size={16} /> },
];

export const SendIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" />
  </svg>
);

/** Create a campaign from a template and open it. */
export function useNewCampaign() {
  const s = useStudio();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [busy, setBusy] = useState(false);
  const start = async (o: { name: string; subject?: string; doc: EmailDoc; topic?: string; previewText?: string }) => {
    setBusy(true);
    try {
      const id = await createCampaign(s.clubId, {
        name: o.name, subject: o.subject || o.name, doc: o.doc, topic: o.topic || 'news', previewText: o.previewText,
        fromName: s.defaults.from_name, replyTo: s.defaults.reply_to, audience: DEFAULT_AUDIENCE,
      });
      navigate(`/email-studio/campaigns/${id}`);
    } catch (e) {
      addNotification('error', (e as Error).message || 'Could not create the campaign');
    } finally {
      setBusy(false);
    }
  };
  return { start, busy };
}

const NewCampaignDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { start, busy } = useNewCampaign();
  return (
    <div className="a-dlg" role="dialog" aria-modal="true" aria-label="New campaign" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="a-sheet es-root" style={{ maxWidth: 1080, padding: 0, gap: 0 }}>
        <div className="a-dlg-head">
          <span className="es-mark" style={{ width: 40, height: 40, borderRadius: 13 }}><Plus size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="a-display es-ink m-0 text-[19px] font-semibold">New campaign</h2>
            <p className="es-dim m-0 mt-0.5 text-[12.5px]">Start from a template. Everything uses your club’s colours and fills in with your club’s news, results and events.</p>
          </div>
          {busy && <Loader2 size={18} className="es-spin" />}
          <button className="a-ib" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="a-dlg-body" style={{ padding: 20 }}>
          <TemplatePicker onPick={t => start(t)} />
        </div>
      </div>
    </div>
  );
};

const Shell: React.FC<{ tab: StudioTab }> = ({ tab }) => {
  const navigate = useNavigate();
  const s = useStudio();
  const [creating, setCreating] = useState(false);
  return (
    <div className="h-full overflow-y-auto">
      <div className="es-root">
        <header className="es-head">
          <span className="es-mark"><SendIcon /></span>
          <div className="min-w-0">
            <h1 className="a-display">Email studio</h1>
            <div className="sub">Newsletters, campaigns and automatic emails for {s.club?.name || 'your club'}</div>
          </div>
          <div className="act">
            <button className="a-btn" onClick={() => navigate(STUDIO_ROUTES.flows)}><Workflow size={16} />Flows</button>
            <button className="a-btn a-btn-p" onClick={() => setCreating(true)}><Plus size={16} />New campaign</button>
          </div>
        </header>
        <nav className="es-tabs" aria-label="Email studio sections">
          {TABS.map(t => (
            <button key={t.id} className={`es-tab${t.id === tab ? ' on' : ''}`} aria-current={t.id === tab ? 'page' : undefined} onClick={() => navigate(STUDIO_ROUTES[t.id])}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>
        {tab === 'home' && <StudioHome onNew={() => setCreating(true)} />}
        {tab === 'campaigns' && <StudioCampaigns onNew={() => setCreating(true)} />}
        {tab === 'flows' && <StudioFlows />}
        {tab === 'audience' && <StudioAudience />}
        {tab === 'templates' && <StudioTemplates />}
        {tab === 'settings' && <StudioSettings />}
      </div>
      {creating && <NewCampaignDialog onClose={() => setCreating(false)} />}
    </div>
  );
};

/** Communications › Email studio (clubs). Mounted at /email-studio/*. */
export const EmailStudio: React.FC = () => {
  const { currentClub } = useAuth();
  const clubId = currentClub?.clubId;
  if (!clubId) return null;
  return (
    <StudioProvider clubId={clubId} key={clubId}>
      <Routes>
        <Route index element={<Shell tab="home" />} />
        <Route path="campaigns" element={<Shell tab="campaigns" />} />
        <Route path="campaigns/:id" element={<CampaignComposer />} />
        <Route path="campaigns/:id/design" element={<EmailBuilder kind="campaign" />} />
        <Route path="campaigns/:id/report" element={<CampaignReport />} />
        <Route path="flows" element={<Shell tab="flows" />} />
        <Route path="audience" element={<Shell tab="audience" />} />
        <Route path="templates" element={<Shell tab="templates" />} />
        <Route path="templates/:id/design" element={<EmailBuilder kind="template" />} />
        <Route path="settings" element={<Shell tab="settings" />} />
        <Route path="*" element={<Navigate to="/email-studio" replace />} />
      </Routes>
    </StudioProvider>
  );
};

export default EmailStudio;

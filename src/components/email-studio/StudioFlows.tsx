import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, GitBranch, Loader2, Sparkles, Workflow, Zap } from 'lucide-react';
import { MembershipSettingsPage } from '../pages/MembershipSettingsPage';
import { getMarketingAutomationFlows } from '../../utils/marketingStorage';
import type { MarketingAutomationFlow } from '../../types/marketing';
import { useStudio } from './studioData';
import { ago } from './api';
import { toneStyle } from './StudioHome';

const TRIGGERS: Record<string, string> = {
  event_registration: 'When someone enters an event',
  time_based: 'On a schedule',
  form_submission: 'When a form is sent',
  manual: 'Started by hand',
  membership_renewal: 'Around membership renewal',
  event_published: 'When an event is published',
};
const STATUS: Record<string, [string, string]> = { active: ['es-live', 'Live'], draft: ['es-draft', 'Draft'], paused: ['', 'Paused'], archived: ['', 'Archived'] };

/** Email studio › Flows: the emails AlfiePRO sends by itself, plus the club's own flows. */
export const StudioFlows: React.FC = () => {
  const s = useStudio();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<MarketingAutomationFlow[] | null>(null);
  const dark = typeof document !== 'undefined' && !document.documentElement.classList.contains('alfie-light');

  useEffect(() => { getMarketingAutomationFlows(s.clubId).then(setFlows).catch(() => setFlows([])); }, [s.clubId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="es-insight">
        <span className="a-tile" style={toneStyle('v')}><Sparkles size={17} /></span>
        <div className="tx"><b>Flows send the right email at the right moment, by themselves.</b> The club emails below already run for every member. A new flow builder with ready-made recipes, such as entry reminders before a regatta, is on its way.</div>
      </section>

      <section aria-label="Club emails">
        <div className="es-sh">
          <h3 className="a-display">Club emails</h3>
          <span className="es-dim" style={{ fontSize: 12.5 }}>Welcome, renewals, receipts, new events and the What’s On weekly. AlfiePRO sends these when something happens.</span>
        </div>
        <div className="es-builtin">
          <MembershipSettingsPage darkMode={dark} initialView="emails" />
        </div>
      </section>

      <section className="a-card" aria-label="Your flows">
        <div className="es-ch">
          <span className="a-tile" style={toneStyle('b')}><Workflow size={17} /></span>
          <div><h3 className="a-display">Your flows</h3><div className="sub">Step-by-step emails your club set up</div></div>
          <div className="r"><button className="a-btn a-btn-sm" onClick={() => navigate('/marketing/flows')}><GitBranch size={14} />Open the flow builder</button></div>
        </div>
        {flows === null ? <div className="es-empty"><Loader2 size={16} className="es-spin" /></div> : !flows.length ? (
          <div className="es-empty">No flows yet. The club emails above already cover welcomes, renewals and new events.</div>
        ) : (
          <div className="es-rows">
            {flows.map(f => {
              const [cls, label] = STATUS[f.status] || ['', f.status];
              return (
                <button key={f.id} type="button" className="es-row" style={{ gridTemplateColumns: '40px minmax(0,1fr) 110px 90px 24px' }} onClick={() => navigate(`/marketing/flows/${f.id}`)}>
                  <span className="a-tile" style={{ width: 36, height: 36 }}><Zap size={16} /></span>
                  <span style={{ minWidth: 0 }}><div className="es-nm">{f.name}</div><div className="es-ed">{TRIGGERS[f.trigger_type] || f.trigger_type} · edited {ago(f.updated_at)}</div></span>
                  <span className="es-rn">{f.total_enrolled || 0} started</span>
                  <span><span className={`es-pill ${cls}`}>{label}</span></span>
                  <ArrowRight size={16} className="es-dim" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

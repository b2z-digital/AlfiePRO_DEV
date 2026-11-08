import React from 'react';
import { Camera, Globe, LayoutGrid } from 'lucide-react';
import { CustomizableDashboard } from './CustomizableDashboard';

/**
 * State and national association dashboards, built like the club dashboard:
 * the cover photo runs edge to edge under the floating menu and fades into the
 * page, with a glass toolbar (public website, cover photo, customise) and the
 * association's logo and name over it.
 */
interface AssociationDashboardShellProps {
  kind: 'state' | 'national';
  name: string;
  logoUrl?: string | null;
  cover?: { url?: string | null; x?: number; y?: number; scale?: number } | null;
  publicUrl: string;
  firstName?: string | null;
  canChangeCover: boolean;
  canCustomise: boolean;
  onChangeCover: () => void;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|inc\.?)$/i.test(w))
    .slice(0, 3).map((w) => w[0]).join('').toUpperCase();

export const AssociationDashboardShell: React.FC<AssociationDashboardShellProps> = ({
  kind, name, logoUrl, cover, publicUrl, firstName, canChangeCover, canCustomise, onChangeCover,
}) => {
  const hasCover = !!cover?.url;
  return (
    <div className="alfie-dash h-full overflow-y-auto">
      <section className="alfie-dash-hero">
        <div className="alfie-dash-hero-media" aria-hidden="true">
          <img
            src={cover?.url || '/lmryc_slide.jpeg'}
            alt=""
            style={hasCover ? {
              transform: `translate(${cover?.x || 0}px, ${cover?.y || 0}px) scale(${cover?.scale || 1})`,
              transformOrigin: 'center',
            } : undefined}
          />
          <div className="alfie-dash-hero-scrim" />
        </div>

        <div className="alfie-dash-tools" role="toolbar" aria-label="Dashboard tools">
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" title="Open your public website in a new tab">
            <Globe size={17} />
            <span>Public website</span>
          </a>
          {canChangeCover && (
            <>
              <span className="alfie-dash-tools-sep" />
              <button type="button" onClick={onChangeCover} title={hasCover ? 'Change the cover photo' : 'Add a cover photo'}>
                <Camera size={17} />
                <span>Cover photo</span>
              </button>
            </>
          )}
          {canCustomise && (
            <>
              <span className="alfie-dash-tools-sep" />
              <button type="button" onClick={() => window.dispatchEvent(new Event('alfie-dashboard-edit'))} title="Customise your dashboard">
                <LayoutGrid size={17} />
                <span>Customise</span>
              </button>
            </>
          )}
        </div>

        <div className="alfie-dash-hero-body px-4 sm:px-6 lg:px-16">
          {logoUrl
            ? <img src={logoUrl} alt="" className="alfie-dash-logo" />
            : <span className="alfie-dash-logo alfie-dash-logo-ph" aria-hidden="true">{initials(name) || 'A'}</span>}
          <div className="min-w-0">
            <h1 className="alfie-dash-title">{name}</h1>
            <p className="alfie-dash-sub">
              {kind === 'state' ? 'State association' : 'National association'}
              {firstName ? ` · Welcome back, ${firstName}` : ''}
            </p>
          </div>
        </div>
      </section>

      <div className="alfie-dash-body p-4 sm:p-6 lg:p-16 lg:pt-2">
        <CustomizableDashboard hideEditButton />
      </div>
    </div>
  );
};

export default AssociationDashboardShell;

import React, { useId } from 'react';

/**
 * Sidebar section icons. Each is a line drawing with one accent shape: a soft
 * tint normally, filled with the Alfie spectrum when `active` (the section
 * you're in). Components carry `navIcon = true` so the sidebar knows it can
 * pass `active` without it reaching a plain lucide icon.
 */
export interface NavIconProps {
  size?: number;
  className?: string;
  active?: boolean;
}

type Shape = (accent: React.SVGProps<SVGPathElement>, accent2: React.SVGProps<SVGPathElement>, dot: React.SVGProps<SVGCircleElement>) => React.ReactNode;

export type NavIconComponent = React.FC<NavIconProps> & { navIcon: true };

function navIcon(name: string, shape: Shape): NavIconComponent {
  const C = (({ size = 20, className, active = false }: NavIconProps) => {
    const gid = `navsp-${useId().replace(/:/g, '')}`;
    const accent: React.SVGProps<SVGPathElement> = active
      ? { fill: `url(#${gid})`, stroke: `url(#${gid})` }
      : { fill: 'currentColor', fillOpacity: 0.16 };
    const accent2: React.SVGProps<SVGPathElement> = active
      ? { fill: `url(#${gid})`, fillOpacity: 0.55, stroke: `url(#${gid})` }
      : { fill: 'currentColor', fillOpacity: 0.16 };
    const dot: React.SVGProps<SVGCircleElement> = { fill: 'currentColor', stroke: 'none' };
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={['alfie-nav-icon', active ? 'alfie-nav-icon-on' : '', className].filter(Boolean).join(' ')}
        style={{ overflow: 'visible' }}
        aria-hidden="true"
      >
        {active && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2E7BFF" />
              <stop offset=".38" stopColor="#8A4DFF" />
              <stop offset=".7" stopColor="#FF3E9A" />
              <stop offset="1" stopColor="#FF8A2B" />
            </linearGradient>
          </defs>
        )}
        {shape(accent, accent2, dot)}
      </svg>
    );
  }) as NavIconComponent;
  C.displayName = name;
  C.navIcon = true;
  return C;
}

/** Dashboard: tiles, one of them a sail. */
export const NavDashboardIcon = navIcon('NavDashboardIcon', a => (
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    <path {...a} d="M17 3.2 L20.8 10.6 H13.2 Z" />
    <path d="M17 3.2 V10.6" />
  </>
));

/** Club: a burgee on its staff. */
export const NavClubIcon = navIcon('NavClubIcon', (a, _a2, d) => (
  <>
    <path d="M6.5 21 V3" />
    <path d="M3.8 21 H9.2" />
    <path {...a} d="M6.5 3.8 L19.5 7.6 L6.5 11.4 Z" />
    <circle {...d} cx="10.6" cy="7.6" r="1.1" />
  </>
));

/** Association membership: member clubs, two burgees side by side. */
export const NavMemberClubsIcon = navIcon('NavMemberClubsIcon', (a, a2) => (
  <>
    <path d="M5 21 V4" />
    <path d="M13 21 V7" />
    <path d="M2.8 21 H15.2" />
    <path {...a2} d="M5 4.6 L12.4 6.9 L5 9.2 Z" />
    <path {...a} d="M13 7.6 L21 10.1 L13 12.6 Z" />
  </>
));

/** National associations: a hub joined to its states. */
export const NavAssociationsIcon = navIcon('NavAssociationsIcon', a => (
  <>
    <path d="M12 8.6 V5.8 M8.8 14.4 L6.4 15.8 M15.2 14.4 L17.6 15.8" />
    <circle cx="12" cy="4" r="1.8" />
    <circle cx="4.8" cy="16.8" r="1.8" />
    <circle cx="19.2" cy="16.8" r="1.8" />
    <path {...a} d="M12 8.6 L15.2 14.4 H8.8 Z" />
  </>
));

/** Me: a skipper in a cap. */
export const NavMeIcon = navIcon('NavMeIcon', a => (
  <>
    <circle cx="12" cy="10" r="3.6" />
    <path {...a} d="M8.3 9.1 C8.6 5.2 15.4 5.2 15.7 9.1 Z" />
    <path d="M8 9.1 H17.6" />
    <path d="M5 20.8 C5.6 16.6 8.6 14.6 12 14.6 C15.4 14.6 18.4 16.6 19 20.8" />
  </>
));

/** News & Media: a newspaper with a play button. */
export const NavNewsIcon = navIcon('NavNewsIcon', a => (
  <>
    <path d="M4 5.5 A1.5 1.5 0 0 1 5.5 4 H15 A1.5 1.5 0 0 1 16.5 5.5 V18.5 A2 2 0 0 0 18.5 20.5 H6 A2 2 0 0 1 4 18.5 Z" />
    <path d="M16.5 9 H19 A1 1 0 0 1 20 10 V18.5 A2 2 0 0 1 18.5 20.5" />
    <path {...a} d="M8 8.2 L12.8 10.9 L8 13.6 Z" />
    <path d="M7.8 17 H13" />
  </>
));

/** Racing: a race mark, a course arrow and water. */
export const NavRacingIcon = navIcon('NavRacingIcon', a => (
  <>
    <path d="M12 3 V5.4" />
    <path {...a} d="M12 5.4 L15.9 14.6 H8.1 Z" />
    <path d="M9.3 11.8 H14.7" />
    <path d="M2.8 18.6 C4.3 17.4 5.8 17.4 7.3 18.6 S10.3 19.8 11.8 18.6 14.8 17.4 16.3 18.6 19.3 19.8 20.8 18.6" />
    <path d="M18.4 4.6 A8.5 8.5 0 0 1 20.6 12.4" />
    <path d="M20.6 12.4 L18.6 11.1 M20.6 12.4 L21.8 10.3" />
  </>
));

/** Marketplace: a shopping bag with a main and jib. */
export const NavMarketplaceIcon = navIcon('NavMarketplaceIcon', (a, a2) => (
  <>
    <path d="M4.8 8 H19.2 L18.1 19.9 A1.2 1.2 0 0 1 16.9 21 H7.1 A1.2 1.2 0 0 1 5.9 19.9 Z" />
    <path d="M9 8 V6.6 A3 3 0 0 1 15 6.6 V8" />
    <path {...a} d="M12.6 10.6 L16 18 H12.6 Z" />
    <path {...a2} d="M11.4 12.4 V18 H8.6 Z" />
  </>
));

/** Connect: two conversations. */
export const NavConnectIcon = navIcon('NavConnectIcon', (a, _a2, d) => (
  <>
    <path d="M3.5 6 A2 2 0 0 1 5.5 4 H13.5 A2 2 0 0 1 15.5 6 V11 A2 2 0 0 1 13.5 13 H8.5 L5.5 15.6 V13 H5.5 A2 2 0 0 1 3.5 11 Z" />
    <path {...a} d="M17.5 9 H18.5 A2 2 0 0 1 20.5 11 V16 A2 2 0 0 1 18.5 18 V20.4 L15.6 18 H11.5 A2 2 0 0 1 9.5 16 V15" />
    <circle {...d} cx="7" cy="8.5" r=".9" />
    <circle {...d} cx="9.5" cy="8.5" r=".9" />
    <circle {...d} cx="12" cy="8.5" r=".9" />
  </>
));

export const isNavIcon = (c: unknown): c is NavIconComponent => !!c && (c as any).navIcon === true;

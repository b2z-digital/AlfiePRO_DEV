import React, { useEffect, useState } from 'react';

/**
 * The AlfiePRO preloader: the two-sail logo heeling over a moving wave, the wordmark
 * and a slim progress bar. Its styles live in index.html (#alf-splash-css) so the very
 * first paint, before the app's code arrives, already shows it; this renders the same
 * markup once the app runs.
 *
 * A loader that follows straight on from another one (or from that first-paint splash)
 * skips its entrance and keeps its animations in step, so splash → sign-in check →
 * club load reads as one screen.
 */

interface AlfieLoaderProps {
  /** Short status under the bar, e.g. "Signing out" */
  message?: string;
  /** Light theme; defaults to the user's saved choice */
  light?: boolean;
  /** Show the logo and wordmark. Defaults to off on club and association websites
   *  (their own domains and subdomains), where it's just the bar */
  brand?: boolean;
  /** 'screen' covers the window; 'page' fills a page's content area */
  variant?: 'screen' | 'page';
}

declare global {
  interface Window { __alfBootAt?: number }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// The first-paint splash stays up until the app's first render replaces it
let lastSeenAt = typeof window !== 'undefined' && window.__alfBootAt ? now() : 0;
// Loaders on screen right now (a new one renders before the one it replaces unmounts)
let onScreen = 0;

function savedLight(): boolean {
  try {
    if (typeof document !== 'undefined' && document.body?.classList.contains('light-mode')) return true;
    return localStorage.getItem('lightMode') === 'true';
  } catch {
    return false;
  }
}

/** Club and association websites (subdomains and custom domains), as App.tsx and index.html decide */
function onClubSite(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  const alfie = h === 'alfiepro.com.au' || h.endsWith('.alfiepro.com.au');
  const main = /^(www\.|app\.)?alfiepro\.com\.au$/.test(h);
  const dev = h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || /webcontainer|bolt\.new|stackblitz\.io|amplifyapp\.com/.test(h);
  return (alfie && !main) || (!alfie && !dev);
}

const Mark = () => (
  <svg className="alf-splash__mark" viewBox="0 0 129.34 201.37" aria-hidden="true">
    <path
      className="alf-sail alf-sail--main"
      fill="#0066b4"
      d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z"
    />
    <path
      className="alf-sail alf-sail--jib"
      fill="#01a2e9"
      d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z"
    />
  </svg>
);

export const AlfieLoader: React.FC<AlfieLoaderProps> = ({ message, light, brand: brandProp, variant = 'screen' }) => {
  const brand = brandProp ?? !onClubSite();
  const [intro] = useState(() => !(onScreen > 0 || (lastSeenAt && now() - lastSeenAt < 900)));
  // All the loops (1.5 s, 2.4 s, 3.6 s) repeat every 36 s. Count from when the first-paint
  // splash started, so the boat, wave and bar carry on where the previous loader left them
  const [phase] = useState(() => {
    const base = typeof window !== 'undefined' && window.__alfBootAt ? window.__alfBootAt : 0;
    return `-${Math.round(Math.max(0, now() - base) % 36000)}ms`;
  });

  useEffect(() => {
    onScreen += 1;
    return () => { onScreen -= 1; lastSeenAt = now(); };
  }, []);

  const isLight = light ?? savedLight();
  const className = [
    'alf-splash',
    isLight && 'is-light',
    !brand && 'is-plain',
    variant === 'page' && 'is-page',
    !intro && 'no-intro',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} role="status" aria-live="polite" style={{ ['--alf-t' as string]: phase }}>
      <div className="alf-splash__inner">
        {brand && (
          <>
            <div className="alf-splash__boat">
              <div className="alf-splash__glow" />
              <Mark />
              <svg className="alf-splash__water" viewBox="0 0 96 12" aria-hidden="true">
                <path d="M0 6Q12 1 24 6T48 6T72 6T96 6T120 6T144 6" />
              </svg>
            </div>
            <div className="alf-splash__word" aria-hidden="true"><span>Alfie</span><b>PRO</b></div>
          </>
        )}
        <div className="alf-splash__bar" aria-hidden="true"><i /></div>
        <div className="alf-splash__msg">{message ? `${message}…` : ''}</div>
        {!message && <span className="alf-sr">Loading{brand ? ' AlfiePRO' : ''}</span>}
      </div>
    </div>
  );
};

export default AlfieLoader;

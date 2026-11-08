import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { googleFontsHref, hasTheme, SiteLayout, SiteMenu, SiteTheme, themeVars } from '../utils/publicSite';
import '../styles/public-site.css';

/** True when the page is shown inside the Website hub's preview frame. */
export const isSitePreview = () =>
  typeof window !== 'undefined' && window.parent !== window && new URLSearchParams(window.location.search).has('sitePreview');

type PreviewMessage = { type: 'alfie-site-preview'; theme?: SiteTheme | null; menu?: SiteMenu | null; layout?: SiteLayout | null };

/**
 * Unsaved theme/menu/layout sent from the Website hub to its preview frame.
 * Only accepted from a same-origin parent.
 */
export function useSitePreviewOverrides(): Omit<PreviewMessage, 'type'> | null {
  const [over, setOver] = useState<Omit<PreviewMessage, 'type'> | null>(null);
  useEffect(() => {
    if (!isSitePreview()) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const d = e.data as PreviewMessage;
      if (!d || d.type !== 'alfie-site-preview') return;
      setOver(prev => ({ ...(prev || {}), ...d }));
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: 'alfie-site-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return over;
}

/**
 * Applies a club's saved website look to the page. Nothing changes for clubs
 * that haven't saved a theme. Cleans up when the public page unmounts.
 */
export function useSiteTheme(saved: unknown) {
  const over = useSitePreviewOverrides();
  const theme = (over && 'theme' in over ? over.theme : saved) as SiteTheme | null | undefined;
  const key = JSON.stringify(theme || null);

  useEffect(() => {
    const body = document.body;
    if (!hasTheme(theme)) return;
    const vars = themeVars(theme);
    Object.entries(vars).forEach(([k, v]) => body.style.setProperty(k, v));
    body.setAttribute('data-site-theme', '');
    body.setAttribute('data-site-buttons', theme.buttons || 'solid');

    const href = googleFontsHref([theme.headingFont, theme.bodyFont]);
    let link: HTMLLinkElement | null = null;
    if (href) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-site-fonts', '');
      document.head.appendChild(link);
    }
    let icon: HTMLLinkElement | null = null;
    let prevIcons: { el: HTMLLinkElement; href: string }[] = [];
    if (theme.favicon) {
      prevIcons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map(el => ({ el, href: el.href }));
      prevIcons.forEach(p => p.el.setAttribute('href', theme.favicon as string));
      if (prevIcons.length === 0) {
        icon = document.createElement('link');
        icon.rel = 'icon';
        icon.href = theme.favicon;
        document.head.appendChild(icon);
      }
    }
    return () => {
      Object.keys(vars).forEach(k => body.style.removeProperty(k));
      body.removeAttribute('data-site-theme');
      body.removeAttribute('data-site-buttons');
      link?.remove();
      icon?.remove();
      prevIcons.forEach(p => p.el.setAttribute('href', p.href));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { theme: hasTheme(theme) ? theme : null, menu: over && 'menu' in over ? over.menu : undefined, layout: over && 'layout' in over ? over.layout : undefined };
}

/** Slugs of a club's published builder pages, so the menu can skip drafts. Null until loaded. */
export function usePublishedPageSlugs(clubId: string | null | undefined, needed: boolean): Set<string> | null {
  const [slugs, setSlugs] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!clubId || !needed) return;
    let alive = true;
    supabase.from('organization_page_layouts').select('page_slug').eq('club_id', clubId).eq('is_published', true)
      .then(({ data }) => { if (alive) setSlugs(new Set((data || []).map((r: { page_slug: string }) => r.page_slug))); }, () => { if (alive) setSlugs(new Set()); });
    return () => { alive = false; };
  }, [clubId, needed]);
  return slugs;
}

/* Visit counting */

const VID = 'alfie_site_vid';
const SID = 'alfie_site_sid';
let lastHit: { key: string; at: number } | null = null;

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

function stored(store: Storage | undefined, key: string): string {
  try {
    const v = store?.getItem(key);
    if (v) return v;
    const id = newId();
    store?.setItem(key, id);
    return id;
  } catch {
    return newId();
  }
}

function sitePath(pathname: string): string {
  const m = pathname.match(/^\/club\/[^/]+\/public(\/.*)?$/);
  const p = m ? (m[1] || '/') : pathname;
  return p.length > 1 ? p.replace(/\/$/, '') : '/';
}

function endVisit(id: string, startedAt: number, beacon: boolean) {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  if (seconds < 1) return;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (beacon && url && key) {
    try {
      fetch(`${url}/rest/v1/rpc/end_website_visit`, {
        method: 'POST',
        keepalive: true,
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_visit: id, p_seconds: seconds }),
      }).catch(() => {});
    } catch { /* ignore */ }
    return;
  }
  supabase.rpc('end_website_visit', { p_visit: id, p_seconds: seconds }).then(() => {}, () => {});
}

/** Counts a visit to a club's public page (Website › Analytics). Never blocks or breaks the page. */
export function useSiteVisit(clubId?: string | null) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!clubId || typeof window === 'undefined' || isSitePreview()) return;
    if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(navigator.userAgent)) return;
    const path = sitePath(pathname);
    const hitKey = `${clubId}${path}`;
    const now = Date.now();
    if (lastHit && lastHit.key === hitKey && now - lastHit.at < 4000) return;
    lastHit = { key: hitKey, at: now };

    const id = newId();
    let ref = '';
    try {
      ref = document.referrer && new URL(document.referrer).host !== window.location.host ? document.referrer.slice(0, 500) : '';
    } catch { ref = ''; }
    supabase.from('website_analytics').insert({
      id,
      club_id: clubId,
      page_path: path.slice(0, 300),
      visitor_id: stored(typeof localStorage !== 'undefined' ? localStorage : undefined, VID),
      session_id: stored(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, SID),
      referrer: ref || null,
      user_agent: navigator.userAgent.slice(0, 400),
    }).then(() => {}, () => {});

    let ended = false;
    const finish = (beacon: boolean) => {
      if (ended) return;
      ended = true;
      endVisit(id, now, beacon);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') finish(true); };
    const onPageHide = () => finish(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      finish(false);
    };
  }, [clubId, pathname]);
}

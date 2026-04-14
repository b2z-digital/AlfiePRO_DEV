import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabase';

const HEARTBEAT_INTERVAL = 5 * 60 * 1000;

const PAGE_SECTION_MAP: Record<string, string> = {
  '/races': 'races',
  '/race-management': 'races',
  '/results': 'results',
  '/membership': 'membership',
  '/members': 'membership',
  '/finances': 'finances',
  '/events': 'events',
  '/event-websites': 'events',
  '/event-command': 'events',
  '/settings': 'settings',
  '/media': 'media',
  '/comms': 'comms',
  '/community': 'community',
  '/website': 'website',
  '/meetings': 'meetings',
  '/tasks': 'tasks',
  '/documents': 'documents',
  '/classifieds': 'classifieds',
  '/weather': 'weather',
  '/livestream': 'livestream',
  '/live-tracking': 'tracking',
  '/alfie-tv': 'alfietv',
  '/marketing': 'marketing',
  '/news': 'news',
  '/my-garage': 'garage',
  '/calendar': 'calendar',
  '/engagement': 'admin',
  '/resources': 'admin',
  '/super-admin': 'admin',
  '/': 'dashboard',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toValidUuid(v: string | null | undefined): string | null {
  if (!v) return null;
  return UUID_RE.test(v) ? v : null;
}

function getPageSection(path: string): string {
  for (const [prefix, section] of Object.entries(PAGE_SECTION_MAP)) {
    if (prefix === '/') continue;
    if (path === prefix || path.startsWith(prefix + '/')) {
      return section;
    }
  }
  if (path === '/' || path === '') return 'dashboard';
  return 'other';
}

export function usePlatformTracking(
  currentClubId?: string | null,
  associationId?: string | null,
  associationType?: string | null
) {
  const sessionIdRef = useRef<string | null>(null);
  const lastPathRef = useRef<string>('');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionCreatingRef = useRef(false);
  const contextRef = useRef({ clubId: currentClubId, associationId, associationType });

  contextRef.current = { clubId: currentClubId, associationId, associationType };

  useEffect(() => {
    let cancelled = false;

    const createSession = async () => {
      if (sessionCreatingRef.current || sessionIdRef.current) return;
      sessionCreatingRef.current = true;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) {
          sessionCreatingRef.current = false;
          return;
        }

        const { data, error } = await supabase
          .from('platform_sessions')
          .insert({
            user_id: session.user.id,
            club_id: toValidUuid(contextRef.current.clubId),
            association_id: toValidUuid(contextRef.current.associationId),
            association_type: contextRef.current.associationType || null,
            user_agent: navigator.userAgent.slice(0, 200),
          })
          .select('id')
          .maybeSingle();

        if (!cancelled && !error && data) {
          sessionIdRef.current = data.id;
        }
      } catch (_e) {
        // Never break the app
      } finally {
        sessionCreatingRef.current = false;
      }
    };

    createSession();

    const hb = setInterval(async () => {
      if (!sessionIdRef.current) return;
      try {
        const ctx = contextRef.current;
        await supabase
          .from('platform_sessions')
          .update({
            last_active_at: new Date().toISOString(),
            club_id: toValidUuid(ctx.clubId),
            association_id: toValidUuid(ctx.associationId),
            association_type: ctx.associationType || null,
          })
          .eq('id', sessionIdRef.current);
      } catch (_e) {
        // Silent
      }
    }, HEARTBEAT_INTERVAL);

    heartbeatRef.current = hb;

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  const trackPageView = useCallback(async (path: string) => {
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const ctx = contextRef.current;
      await supabase.from('platform_page_views').insert({
        session_id: sessionIdRef.current || null,
        user_id: session.user.id,
        club_id: toValidUuid(ctx.clubId),
        association_id: toValidUuid(ctx.associationId),
        page_path: path,
        page_section: getPageSection(path),
      });
    } catch (_e) {
      // Silent
    }
  }, []);

  return { trackPageView, sessionId: sessionIdRef.current };
}

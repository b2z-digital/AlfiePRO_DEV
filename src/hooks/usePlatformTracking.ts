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
  '/': 'dashboard',
};

function getPageSection(path: string): string {
  for (const [prefix, section] of Object.entries(PAGE_SECTION_MAP)) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return section;
    }
  }
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

  const startSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('platform_sessions')
        .insert({
          user_id: session.user.id,
          club_id: currentClubId || null,
          association_id: associationId || null,
          association_type: associationType || null,
          user_agent: navigator.userAgent.slice(0, 200),
        })
        .select('id')
        .single();

      if (!error && data) {
        sessionIdRef.current = data.id;
      }
    } catch (e) {
      // Silently fail - tracking should never break the app
    }
  }, [currentClubId, associationId, associationType]);

  const trackPageView = useCallback(async (path: string) => {
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from('platform_page_views').insert({
        session_id: sessionIdRef.current || null,
        user_id: session.user.id,
        club_id: currentClubId || null,
        association_id: associationId || null,
        page_path: path,
        page_section: getPageSection(path),
      });
    } catch (e) {
      // Silently fail
    }
  }, [currentClubId, associationId]);

  const heartbeat = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await supabase
        .from('platform_sessions')
        .update({
          last_active_at: new Date().toISOString(),
          club_id: currentClubId || undefined,
          association_id: associationId || undefined,
          association_type: associationType || undefined,
        })
        .eq('id', sessionIdRef.current);
    } catch (e) {
      // Silently fail
    }
  }, [currentClubId, associationId, associationType]);

  useEffect(() => {
    startSession();

    heartbeatRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [startSession, heartbeat]);

  return { trackPageView, sessionId: sessionIdRef.current };
}

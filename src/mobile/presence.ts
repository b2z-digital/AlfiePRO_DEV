/**
 * Who's online. The desktop marks people by `profiles.last_seen` (AuthContext keeps it fresh every
 * five minutes, on the phone too); the old app used `user_presence` (upsert_user_presence, stale
 * after three minutes). The phone keeps both up to date, so a skipper shows as online to people
 * on any of the apps, and reads both when drawing the green dot.
 */
import { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

const BEAT_MS = 2 * 60 * 1000;
const STALE_MS = 3 * 60 * 1000;

export const recentlyActive = (row?: { is_online?: boolean | null; last_seen_at?: string | null } | null) =>
  !!row?.is_online && !!row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < STALE_MS;

async function mark(userId: string, online: boolean) {
  try { await supabase.rpc('upsert_user_presence', { p_user_id: userId, p_is_online: online }); } catch { /* offline */ }
}

/** Online while the app is open and in front; offline when it goes to the background. */
export function usePresence() {
  const { user } = useAuth();
  const id = user?.id;
  useEffect(() => {
    if (!id) return;
    const beat = () => { if (document.visibilityState !== 'hidden') void mark(id, true); };
    const onVis = () => {
      if (document.visibilityState === 'hidden') void mark(id, false);
      else { beat(); void supabase.rpc('update_user_last_seen').then(() => {}, () => {}); }
    };
    beat();
    const t = setInterval(beat, BEAT_MS);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('alfie-native-resume', beat);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('alfie-native-resume', beat);
    };
  }, [id]);
}

/** The people (of these) the old app counts as online right now. */
export async function onlineByPresence(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const { data } = await supabase.from('user_presence').select('user_id, is_online, last_seen_at').in('user_id', userIds);
  return new Set((data || []).filter(recentlyActive).map((r: any) => r.user_id));
}

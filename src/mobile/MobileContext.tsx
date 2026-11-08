import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import {
  AttendanceIndex, AttendanceStatus, MCalendarItem, loadAttendance, loadCalendar, loadMyMemberIds,
  setAttendance, unreadNotificationCount,
} from './data';
import { isNative } from '../lib/native/platform';

interface MobileState {
  calendar: MCalendarItem[];
  calendarLoading: boolean;
  attendance: AttendanceIndex;
  memberIds: string[];
  profile: { firstName: string; lastName: string; avatarUrl: string | null };
  unread: number;
  light: boolean;
  refresh: () => Promise<void>;
  refreshUnread: () => void;
  answer: (item: MCalendarItem, status: AttendanceStatus) => Promise<void>;
  toast: (msg: string) => void;
  tap: (style?: 'light' | 'medium' | 'success') => void;
}

const Ctx = createContext<MobileState | null>(null);

export const useMobile = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMobile outside MobileProvider');
  return v;
};

export const MobileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, currentClub, currentOrganization } = useAuth();
  const [calendar, setCalendar] = useState<MCalendarItem[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [attendance, setAttendanceIdx] = useState<AttendanceIndex>({ mine: {}, going: {} });
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [profile, setProfile] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', avatarUrl: null as string | null });
  const [unread, setUnread] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const light = (() => { try { return localStorage.getItem('lightMode') === 'true'; } catch { return false; } })();

  const clubId = currentClub?.clubId;

  const refresh = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const [items, att] = await Promise.all([
        loadCalendar(clubId, currentOrganization ? { type: currentOrganization.type, id: currentOrganization.id } : null),
        loadAttendance(clubId, user?.id),
      ]);
      setCalendar(items);
      setAttendanceIdx(att);
    } finally {
      setCalendarLoading(false);
    }
  }, [clubId, currentOrganization?.id, currentOrganization?.type, user?.id]);

  const refreshUnread = useCallback(() => { unreadNotificationCount(user?.id).then(setUnread).catch(() => {}); }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { loadMyMemberIds(user?.id).then(setMemberIds).catch(() => {}); }, [user?.id]);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('first_name, last_name, avatar_url').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (data) setProfile({ firstName: data.first_name || '', lastName: data.last_name || '', avatarUrl: data.avatar_url || null });
    });
  }, [user?.id]);

  // Unread count: now, on resume, and when a notification arrives
  useEffect(() => {
    refreshUnread();
    const onResume = () => { refreshUnread(); void refresh(); };
    window.addEventListener('alfie-native-resume', onResume);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (user?.id) {
      channel = supabase
        .channel(`m-notifications-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => refreshUnread())
        .subscribe();
    }
    return () => {
      window.removeEventListener('alfie-native-resume', onResume);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user?.id, refreshUnread, refresh]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const tap = useCallback((style: 'light' | 'medium' | 'success' = 'light') => {
    if (isNative) {
      import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
        if (style === 'success') void Haptics.notification({ type: NotificationType.Success });
        else void Haptics.impact({ style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
      }).catch(() => {});
    } else if (navigator.vibrate) {
      navigator.vibrate(style === 'success' ? [12, 40, 12] : 10);
    }
  }, []);

  const answer = useCallback(async (item: MCalendarItem, status: AttendanceStatus) => {
    if (!user?.id || !clubId) { toast('Sign in to a club to answer.'); return; }
    const key = item.seriesId && item.roundName ? `${item.seriesId.split('-').slice(0, 5).join('-')}__${item.roundName}` : item.eventId;
    if (!key) return;
    const prev = attendance;
    // Optimistic update
    setAttendanceIdx(a => {
      const going = { ...a.going };
      const list = (going[key] || []).filter(g => g.userId !== user.id);
      if (status === 'yes') list.push({ userId: user.id, name: `${profile.firstName} ${profile.lastName}`.trim() || 'You', avatarUrl: profile.avatarUrl || undefined });
      going[key] = list;
      return { mine: { ...a.mine, [key]: status }, going };
    });
    tap(status === 'yes' ? 'success' : 'light');
    try {
      await setAttendance(item, status, user.id, clubId);
      toast(status === 'yes' ? "You're going" : status === 'no' ? "Marked as can't make it" : 'Marked as maybe');
    } catch {
      setAttendanceIdx(prev);
      toast("Couldn't save your answer. Try again.");
    }
  }, [user?.id, clubId, attendance, profile, tap, toast]);

  const value = useMemo<MobileState>(() => ({
    calendar, calendarLoading, attendance, memberIds, profile, unread, light,
    refresh, refreshUnread, answer, toast, tap,
  }), [calendar, calendarLoading, attendance, memberIds, profile, unread, light, refresh, refreshUnread, answer, toast, tap]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="m-toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
};

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import {
  AttendanceIndex, AttendanceStatus, MCalendarItem, attendanceKey, loadAttendance, loadCalendar, loadMyMemberIds,
  setAttendance, unreadNotificationCount,
} from './data';
import { isNative } from '../lib/native/platform';

export type Appearance = 'system' | 'light' | 'dark';

interface MobileState {
  calendar: MCalendarItem[];
  calendarLoading: boolean;
  attendance: AttendanceIndex;
  memberIds: string[];
  myClasses: string[];
  profile: { firstName: string; lastName: string; avatarUrl: string | null };
  unread: number;
  light: boolean;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  /** Network and saved copies (board: "No signal at the pond") */
  online: boolean;
  savedAt: string | null;
  /** RSVP keys answered offline, waiting to send */
  queued: Record<string, AttendanceStatus>;
  /** Unfinancial members can look but not take part until they renew (board: "Membership due") */
  restricted: boolean;
  requireFinancial: () => boolean;
  refresh: () => Promise<void>;
  refreshUnread: () => void;
  refreshProfile: () => void;
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

const APPEARANCE_KEY = 'alfie-m-appearance';
const readAppearance = (): Appearance => {
  try {
    const a = localStorage.getItem(APPEARANCE_KEY) as Appearance | null;
    if (a === 'system' || a === 'light' || a === 'dark') return a;
    return localStorage.getItem('lightMode') === 'true' ? 'light' : 'system';
  } catch { return 'system'; }
};
const systemLight = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)').matches : false);

const cacheKey = (userId: string, clubId?: string) => `alfie-m-cache:${userId}:${clubId || 'none'}`;
const queueKey = (userId: string) => `alfie-m-rsvp-queue:${userId}`;
interface QueuedAnswer { key: string; status: AttendanceStatus; item: Pick<MCalendarItem, 'seriesId' | 'roundName' | 'eventId' | 'key'>; clubId: string }
const readJSON = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const writeJSON = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private mode */ } };
const isNetworkError = (e: any) => !navigator.onLine || /fetch|network|Failed to fetch|Load failed/i.test(String(e?.message || e));

export const MobileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { user, currentClub, currentOrganization, hasUnfinancialMember } = useAuth();
  const clubId = currentClub?.clubId;
  const cached = useMemo(() => (user?.id ? readJSON<any>(cacheKey(user.id, clubId), null) : null), [user?.id, clubId]);
  const [calendar, setCalendar] = useState<MCalendarItem[]>(cached?.calendar || []);
  const [calendarLoading, setCalendarLoading] = useState(!cached);
  const [attendance, setAttendanceIdx] = useState<AttendanceIndex>(cached?.attendance || { mine: {}, going: {} });
  const [memberIds, setMemberIds] = useState<string[]>(cached?.memberIds || []);
  const [myClasses, setMyClasses] = useState<string[]>(cached?.myClasses || []);
  const [savedAt, setSavedAt] = useState<string | null>(cached?.savedAt || null);
  const [profile, setProfile] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', avatarUrl: null as string | null });
  const [unread, setUnread] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [appearance, setAppearanceState] = useState<Appearance>(readAppearance);
  const [sysLight, setSysLight] = useState(systemLight);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [queue, setQueue] = useState<QueuedAnswer[]>(() => (user?.id ? readJSON<QueuedAnswer[]>(queueKey(user.id), []) : []));
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const light = appearance === 'system' ? sysLight : appearance === 'light';

  // Appearance follows the phone unless the member picked one
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setSysLight(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const setAppearance = useCallback((a: Appearance) => {
    setAppearanceState(a);
    try {
      localStorage.setItem(APPEARANCE_KEY, a);
      // Keep the desktop's key in step so the same choice shows there too
      localStorage.setItem('lightMode', String(a === 'system' ? systemLight() : a === 'light'));
    } catch { /* ignore */ }
  }, []);

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

  const refresh = useCallback(async () => {
    if (!navigator.onLine) { setCalendarLoading(false); return; }
    setCalendarLoading(c => c && !calendar.length);
    try {
      const [items, att] = await Promise.all([
        loadCalendar(clubId, currentOrganization ? { type: currentOrganization.type, id: currentOrganization.id } : null),
        loadAttendance(clubId, user?.id),
      ]);
      setCalendar(items);
      // Answers still waiting to send stay as the member left them
      setAttendanceIdx(() => {
        const mine = { ...att.mine };
        queue.forEach(q => { mine[q.key] = q.status; });
        return { ...att, mine };
      });
      const at = new Date().toISOString();
      setSavedAt(at);
      if (user?.id) {
        const prev = readJSON<any>(cacheKey(user.id, clubId), {});
        writeJSON(cacheKey(user.id, clubId), { ...prev, calendar: items, attendance: att, savedAt: at });
      }
    } catch { /* keep the saved copy */ } finally {
      setCalendarLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, currentOrganization?.id, currentOrganization?.type, user?.id, queue.length]);

  const refreshUnread = useCallback(() => { unreadNotificationCount(user?.id).then(setUnread).catch(() => {}); }, [user?.id]);
  const refreshProfile = useCallback(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('first_name, last_name, avatar_url').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (data) setProfile({ firstName: data.first_name || '', lastName: data.last_name || '', avatarUrl: data.avatar_url || null });
    });
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    loadMyMemberIds(user?.id).then(async ids => {
      setMemberIds(ids);
      if (!ids.length) return;
      const { data } = await supabase.from('member_boats').select('boat_type').in('member_id', ids);
      const classes = [...new Set((data || []).map((b: any) => b.boat_type).filter(Boolean))] as string[];
      setMyClasses(classes);
      if (user?.id) {
        const prev = readJSON<any>(cacheKey(user.id, clubId), {});
        writeJSON(cacheKey(user.id, clubId), { ...prev, memberIds: ids, myClasses: classes });
      }
    }).catch(() => {});
  }, [user?.id, clubId]);
  useEffect(() => { refreshProfile(); }, [refreshProfile]);

  // Send answers given offline as soon as there's signal
  const flush = useCallback(async () => {
    if (!user?.id || !queue.length || !navigator.onLine) return;
    const left: QueuedAnswer[] = [];
    for (const q of queue) {
      try { await setAttendance(q.item as MCalendarItem, q.status, user.id, q.clubId); } catch (e) { if (isNetworkError(e)) left.push(q); }
    }
    setQueue(left);
    writeJSON(queueKey(user.id), left);
    if (left.length < queue.length) toast(queue.length - left.length === 1 ? 'Your answer was sent' : 'Your answers were sent');
  }, [queue, user?.id, toast]);

  useEffect(() => {
    const up = () => { setOnline(true); void flush(); void refresh(); refreshUnread(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [flush, refresh, refreshUnread]);
  useEffect(() => { if (online && queue.length) void flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Unread count: now, on resume, and when a notification arrives
  useEffect(() => {
    refreshUnread();
    const onResume = () => { refreshUnread(); void refresh(); void flush(); };
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
  }, [user?.id, refreshUnread, refresh, flush]);

  const restricted = !!hasUnfinancialMember;
  const requireFinancial = useCallback(() => {
    if (!restricted) return true;
    navigate('/membership-due');
    return false;
  }, [restricted, navigate]);

  const answer = useCallback(async (item: MCalendarItem, status: AttendanceStatus) => {
    if (!user?.id || !clubId) { toast('Sign in to a club to answer.'); return; }
    if (status === 'yes' && !requireFinancial()) return;
    const key = attendanceKey(item);
    if (!key) return;
    const prev = attendance;
    setAttendanceIdx(a => {
      const going = { ...a.going };
      const list = (going[key] || []).filter(g => g.userId !== user.id);
      if (status === 'yes') list.push({ userId: user.id, name: `${profile.firstName} ${profile.lastName}`.trim() || 'You', avatarUrl: profile.avatarUrl || undefined });
      going[key] = list;
      return { mine: { ...a.mine, [key]: status }, going };
    });
    tap(status === 'yes' ? 'success' : 'light');
    const enqueue = () => {
      const next = [...queue.filter(q => q.key !== key), { key, status, clubId, item: { seriesId: item.seriesId, roundName: item.roundName, eventId: item.eventId, key: item.key } }];
      setQueue(next);
      writeJSON(queueKey(user.id), next);
      toast("Saved. It'll send when you're back online.");
    };
    if (!navigator.onLine) { enqueue(); return; }
    try {
      await setAttendance(item, status, user.id, clubId);
      toast(status === 'yes' ? "You're going" : status === 'no' ? "Marked as can't make it" : 'Marked as maybe');
    } catch (e) {
      if (isNetworkError(e)) { enqueue(); return; }
      setAttendanceIdx(prev);
      toast("Couldn't save your answer. Try again.");
    }
  }, [user?.id, clubId, attendance, profile, tap, toast, queue, requireFinancial]);

  const queued = useMemo(() => Object.fromEntries(queue.map(q => [q.key, q.status])), [queue]);

  const value = useMemo<MobileState>(() => ({
    calendar, calendarLoading, attendance, memberIds, myClasses, profile, unread, light, appearance, setAppearance,
    online, savedAt, queued, restricted, requireFinancial,
    refresh, refreshUnread, refreshProfile, answer, toast, tap,
  }), [calendar, calendarLoading, attendance, memberIds, myClasses, profile, unread, light, appearance, setAppearance, online, savedAt, queued, restricted, requireFinancial, refresh, refreshUnread, refreshProfile, answer, toast, tap]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="m-toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
};

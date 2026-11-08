import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { isNative, nativePushEnabled } from '../../lib/native/platform';
import { useMobile, Appearance } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton, SubHeader } from '../ui';
import { NOTIFY_KINDS, Toggle, saveNotificationPrefs } from './FirstRun';

const PRIVACY: { key: string; label: string; sub: string; def: boolean }[] = [
  { key: 'profile_visible_to_club', label: 'Show my profile to my club', sub: 'Name, photo and classes', def: true },
  { key: 'show_race_results', label: 'Show my results on my profile', sub: 'Results stay on event pages either way', def: true },
  { key: 'show_boat_details', label: 'Show my boats', sub: 'Class and sail number', def: true },
  { key: 'show_performance_stats', label: 'Show my season numbers', sub: 'Races, wins and podiums', def: true },
  { key: 'show_activity_status', label: 'Show when I’m online', sub: 'The green dot in chats', def: true },
  { key: 'allow_direct_messages', label: 'Let members message me', sub: '', def: true },
  { key: 'show_in_community_directory', label: 'List me in the member directory', sub: '', def: true },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <>
    <p className="m-lb m-dim" style={{ margin: '6px 0 0' }}>{title}</p>
    <div className="m-card">{children}</div>
  </>
);

/** Me › Settings: profile, notifications, privacy, appearance and account. */
export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, userClubs, currentClub, currentOrganization, signOut } = useAuth();
  const { profile, refreshProfile, appearance, setAppearance, toast, tap } = useMobile();
  const [first, setFirst] = useState(profile.firstName);
  const [last, setLast] = useState(profile.lastName);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notify, setNotify] = useState<Record<string, boolean> | null>(null);
  const [privacy, setPrivacy] = useState<Record<string, boolean> | null>(null);
  const [confirm, setConfirm] = useState<0 | 1 | 2>(0);
  const [cancelling, setCancelling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setFirst(profile.firstName); setLast(profile.lastName); }, [profile.firstName, profile.lastName]);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('user_notification_preferences').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      setNotify({ push_notifications: data?.push_notifications ?? true, ...Object.fromEntries(NOTIFY_KINDS.map(k => [k.key, data?.[k.key] ?? k.def])) });
    });
    supabase.from('user_privacy_settings').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      setPrivacy(Object.fromEntries(PRIVACY.map(k => [k.key, data?.[k.key] ?? k.def])));
    });
  }, [user?.id]);

  const saveName = async () => {
    if (!user?.id || (!first.trim() && !last.trim())) return;
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ first_name: first.trim(), last_name: last.trim(), updated_at: new Date().toISOString() }).eq('id', user.id);
    setSavingName(false);
    if (error) { toast("Couldn't save your name. Try again."); return; }
    tap('success'); toast('Saved'); refreshProfile();
  };

  // Same bucket and naming as the live app's avatar upload
  const uploadAvatar = async (file?: File) => {
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const img = await compressImage(file, 'avatar').catch(() => file);
      const name = `${user.id}-${Date.now()}.${(img.name.split('.').pop() || 'jpg').toLowerCase()}`;
      const { error } = await supabase.storage.from('avatars').upload(name, img, { contentType: img.type || 'image/jpeg', upsert: true });
      if (error) throw error;
      const url = supabase.storage.from('avatars').getPublicUrl(name).data.publicUrl;
      const { error: e2 } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (e2) throw e2;
      tap('success'); toast('Photo updated'); refreshProfile();
    } catch {
      toast("Couldn't update your photo. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const setNotifyKey = async (k: string, v: boolean) => {
    if (!user?.id || !notify) return;
    const next = { ...notify, [k]: v };
    setNotify(next);
    try {
      await saveNotificationPrefs(user.id, { [k]: v });
      if (k === 'push_notifications' && v && isNative && nativePushEnabled) {
        const { requestAndRegister } = await import('../../lib/native/push');
        if (!(await requestAndRegister())) toast('Allow notifications for AlfiePRO in your phone’s Settings.');
      }
    } catch { setNotify(notify); toast("Couldn't save that. Try again."); }
  };
  const setPrivacyKey = async (k: string, v: boolean) => {
    if (!user?.id || !privacy) return;
    const prev = privacy;
    setPrivacy({ ...privacy, [k]: v });
    const { error } = await supabase.from('user_privacy_settings').upsert({ user_id: user.id, [k]: v, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) { setPrivacy(prev); toast("Couldn't save that. Try again."); }
  };

  // Same as the live app's "Cancel account" (Apple requires deleting an account in the app)
  const cancelAccount = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase.rpc('cancel_user_account');
      if (error) throw error;
      toast('Your account has been cancelled');
      await supabase.auth.signOut({ scope: 'global' });
      try { localStorage.clear(); } catch { /* ignore */ }
      window.location.href = '/login';
    } catch (e: any) {
      toast(e?.message || "Couldn't cancel your account. Try again.");
      setCancelling(false);
    }
  };

  const name = `${profile.firstName} ${profile.lastName}`.trim() || 'Me';
  const orgCount = userClubs.length;
  const where = currentOrganization && currentOrganization.type !== 'club' ? currentOrganization.name : currentClub?.club?.name;
  const nameDirty = first.trim() !== profile.firstName || last.trim() !== profile.lastName;
  const field: React.CSSProperties = { flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', color: 'var(--m-ink)', font: 'inherit', fontSize: 15, textAlign: 'right', outline: 'none' };

  return (
    <div className="m-stack">
      <SubHeader title="Settings" />
      <div className="m-row" style={{ gap: 14 }}>
        <button style={{ position: 'relative', background: 'none', border: 0, padding: 0 }} aria-label="Change photo" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Avatar name={name} url={profile.avatarUrl} size={64} />
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 999, background: 'var(--m-blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--m-bg)' }}><Icon name="camera" size={14} /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { void uploadAvatar(e.target.files?.[0]); e.target.value = ''; }} />
        <div style={{ minWidth: 0 }}>
          <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
          <div className="m-mut m-ell" style={{ fontSize: 13.5 }}>{user?.email}</div>
        </div>
      </div>

      <Section title="Your details">
        <label className="m-li"><span className="m-mut" style={{ width: 110 }}>First name</span><input style={field} value={first} onChange={e => setFirst(e.target.value)} autoComplete="given-name" /></label>
        <label className="m-li"><span className="m-mut" style={{ width: 110 }}>Last name</span><input style={field} value={last} onChange={e => setLast(e.target.value)} autoComplete="family-name" /></label>
      </Section>
      {nameDirty && <button className="m-btn m-btn-p" onClick={saveName} disabled={savingName}>{savingName ? 'Saving…' : 'Save details'}</button>}

      <Section title="Club">
        <button className="m-li" onClick={() => navigate('/choose-club')}>
          <Icon name="club" className="m-dim" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="m-ell" style={{ display: 'block' }}>{where || 'Choose a club'}</span>
            {orgCount > 1 && <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>Switch between your {orgCount} clubs</span>}
          </span>
          <Icon name="chevron" size={17} className="m-dim" />
        </button>
        <button className="m-li" onClick={() => navigate('/my-membership')}><Icon name="doc" className="m-dim" /><span style={{ flex: 1 }}>Membership</span><Icon name="chevron" size={17} className="m-dim" /></button>
      </Section>

      <Section title="Notifications">
        {notify === null ? <div style={{ padding: 14 }}><Skeleton h={120} /></div> : (
          <>
            <div className="m-li"><span style={{ flex: 1 }}>Push notifications</span><Toggle label="Push notifications" on={notify.push_notifications} onChange={v => setNotifyKey('push_notifications', v)} /></div>
            {NOTIFY_KINDS.map(k => (
              <div key={k.key} className="m-li" style={notify.push_notifications ? undefined : { opacity: .5 }}>
                <span style={{ flex: 1 }}>{k.label}</span>
                <Toggle label={k.label} on={notify[k.key]} onChange={v => setNotifyKey(k.key, v)} />
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="Privacy">
        {privacy === null ? <div style={{ padding: 14 }}><Skeleton h={160} /></div> : PRIVACY.map(k => (
          <div key={k.key} className="m-li">
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block' }}>{k.label}</span>
              {k.sub && <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{k.sub}</span>}
            </span>
            <Toggle label={k.label} on={privacy[k.key]} onChange={v => setPrivacyKey(k.key, v)} />
          </div>
        ))}
      </Section>

      <Section title="Appearance">
        <div style={{ padding: 10 }}>
          <div className="m-seg">
            {(['system', 'light', 'dark'] as Appearance[]).map(a => (
              <button key={a} className={appearance === a ? 'm-on' : ''} onClick={() => { tap(); setAppearance(a); }}>{a === 'system' ? 'Match phone' : a === 'light' ? 'Light' : 'Dark'}</button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Account">
        <button className="m-li" onClick={() => signOut()}><Icon name="back" className="m-dim" /><span style={{ flex: 1 }}>Sign out</span></button>
        <button className="m-li" onClick={() => setConfirm(1)} style={{ color: '#FF8C82' }}><Icon name="close" /><span style={{ flex: 1 }}>Cancel my account</span></button>
      </Section>
      <div className="m-dim" style={{ fontSize: 12, textAlign: 'center' }}>AlfiePRO 2.0{isNative ? '' : ' · phone preview'}</div>

      {confirm > 0 && (
        <>
          <div className="m-veil" onClick={() => !cancelling && setConfirm(0)} />
          <div className="m-sheet" role="alertdialog" aria-label="Cancel my account">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700 }}>{confirm === 1 ? 'Cancel your account?' : 'Are you absolutely sure?'}</div>
            <p className="m-mut" style={{ fontSize: 14.5, lineHeight: 1.5 }}>
              {confirm === 1
                ? 'Your club memberships will be cancelled and your account deactivated. Your past results stay in the events you sailed.'
                : 'This can’t be undone. You’ll be signed out and won’t be able to use AlfiePRO with this account.'}
            </p>
            <div className="m-stack" style={{ gap: 8 }}>
              {confirm === 1
                ? <button className="m-btn" style={{ background: '#FF3B30', color: '#fff' }} onClick={() => setConfirm(2)}>Continue</button>
                : <button className="m-btn" style={{ background: '#FF3B30', color: '#fff' }} onClick={cancelAccount} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Yes, cancel my account'}</button>}
              <button className="m-btn m-btn-g" onClick={() => setConfirm(0)} disabled={cancelling}>Keep my account</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsScreen;

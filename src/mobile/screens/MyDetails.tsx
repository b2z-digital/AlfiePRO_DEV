/**
 * My details (phase 2 board, Me › My details): photo, contact, emergency contact and every club you
 * belong to with its renewal. Saves the same members / profiles fields as the web's member edit
 * (MemberEditModal), on each of your club memberships so every club has the same details.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton, SubHeader } from '../ui';

interface Row {
  id: string; club_id: string; first_name: string; last_name: string; email: string; phone: string;
  street: string; city: string; state: string; postcode: string;
  emergency_contact_name: string; emergency_contact_phone: string; emergency_contact_relationship: string;
  avatar_url: string | null; renewal_date: string | null; is_financial: boolean | null; membership_level: string | null;
  club?: { name: string } | null;
}
const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'street', 'city', 'state', 'postcode', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'] as const;
type Form = Record<typeof FIELDS[number], string>;

export const MyDetailsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentClub } = useAuth();
  const { profile, toast, tap } = useMobile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('members').select('*, club:clubs(name)').eq('user_id', user.id).then(({ data }) => {
      const list = ((data as unknown as Row[]) || []);
      const main = list.find(r => r.club_id === currentClub?.clubId) || list[0];
      setRows(list);
      if (main) {
        setForm(Object.fromEntries(FIELDS.map(k => [k, (main as any)[k] || ''])) as Form);
        setAvatar(main.avatar_url || profile.avatarUrl || null);
      }
    }, () => setRows([]));
  }, [user?.id, currentClub?.clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: typeof FIELDS[number], v: string) => { setForm(f => ({ ...(f as Form), [k]: v })); setDirty(true); };

  const save = async () => {
    if (!form || !rows?.length) return;
    setBusy(true);
    try {
      const update = { ...form, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('members').update(update).in('id', rows.map(r => r.id));
      if (error) throw error;
      if (user?.id) await supabase.from('profiles').update({ first_name: form.first_name, last_name: form.last_name, full_name: `${form.first_name} ${form.last_name}`.trim() }).eq('id', user.id);
      tap('success'); toast('Details saved'); setDirty(false);
    } catch { toast("Couldn't save your details. Try again."); } finally { setBusy(false); }
  };

  // Same storage and fields as the web's avatar upload
  const upload = async (file?: File) => {
    if (!file || !rows?.length || !user?.id) return;
    setBusy(true);
    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const f = await compressImage(file, 'photo').catch(() => file);
      const path = `avatars/${rows[0].id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('media').upload(path, f, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
      await supabase.from('members').update({ avatar_url: url }).in('id', rows.map(r => r.id));
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      setAvatar(url); tap('success'); toast('Photo updated');
    } catch { toast("Couldn't update your photo. Try again."); } finally { setBusy(false); }
  };

  const field = (k: typeof FIELDS[number], label: string, type = 'text', mode?: React.HTMLAttributes<HTMLInputElement>['inputMode']) => (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span className="m-lb m-dim">{label}</span>
      <input className="m-field" type={type} inputMode={mode} value={form?.[k] || ''} onChange={e => set(k, e.target.value)} />
    </label>
  );

  if (rows === null) return <div className="m-stack"><SubHeader title="My details" /><Skeleton h={160} /><Skeleton h={260} /></div>;
  if (!form) return <div className="m-stack"><SubHeader title="My details" /><div className="m-card m-empty">You're not a member of a club on AlfiePRO yet.</div></div>;
  const name = `${form.first_name} ${form.last_name}`.trim() || 'Me';
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="m-stack">
      <SubHeader title="My details" right={<button className="m-pill-btn" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>} />
      <div className="m-row" style={{ gap: 14 }}>
        <Avatar name={name} url={avatar} size={68} />
        <div>
          <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ background: 'none', border: 0, padding: 0, color: 'var(--m-blue-ink)', fontWeight: 600, fontSize: 14 }}>Change photo</button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />

      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Contact</p>
      <div className="m-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{field('first_name', 'First name')}{field('last_name', 'Last name')}</div>
        {field('email', 'Email', 'email', 'email')}
        {field('phone', 'Phone', 'tel', 'tel')}
        {field('street', 'Street')}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>{field('city', 'Suburb')}{field('state', 'State')}{field('postcode', 'Postcode', 'text', 'numeric')}</div>
      </div>

      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Emergency contact</p>
      <div className="m-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {field('emergency_contact_name', 'Name')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>{field('emergency_contact_phone', 'Phone', 'tel', 'tel')}{field('emergency_contact_relationship', 'Relationship')}</div>
        {!form.emergency_contact_name && <div className="m-dim" style={{ fontSize: 12.5 }}>Race officers can see this on race day if something goes wrong.</div>}
      </div>

      <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Clubs</p>
      <div className="m-card">
        {rows.map(r => {
          const current = !!r.is_financial && (!r.renewal_date || r.renewal_date >= today);
          return (
            <button key={r.id} className="m-li" onClick={() => navigate('/my-membership')}>
              <span className="m-tile" style={{ background: 'var(--m-fill-b)' }}><Icon name="club" size={18} /></span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="m-ell" style={{ display: 'block', fontWeight: 600 }}>{r.club?.name || 'Club'}</span>
                <span className="m-dim" style={{ fontSize: 12.5 }}>{[r.membership_level, r.renewal_date ? `${current ? 'current to' : 'lapsed'} ${new Date(r.renewal_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="m-pill" style={{ background: current ? 'rgba(52,199,89,.16)' : 'rgba(255,159,10,.18)', color: current ? '#2FB765' : '#E58A00' }}>{current ? 'Current' : 'Renew'}</span>
            </button>
          );
        })}
      </div>
      {rows.length > 1 && <p className="m-dim" style={{ margin: 0, fontSize: 12 }}>Saving updates your details at every club.</p>}
    </div>
  );
};

export default MyDetailsScreen;

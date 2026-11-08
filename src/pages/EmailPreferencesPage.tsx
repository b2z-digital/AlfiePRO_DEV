import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import '../styles/alfie-email-studio.css';

/* ─────────────────────────────────────────────────────────────────────────────
   /email/preferences — opened from the footer of an Email studio email. No login:
   the link carries the recipient id (?t=). ?unsub=1 comes from the unsubscribe link
   and asks to confirm; ?test=1 is the link inside test sends and saves nothing.
   ───────────────────────────────────────────────────────────────────────────── */

interface Prefs {
  club: { name: string; logo: string | null } | null;
  email: string;
  first_name: string | null;
  topics: { key: string; label: string; note?: string }[];
  unsubscribed: boolean;
  topics_off: string[];
  is_member: boolean;
  whats_on: boolean | null;
}

const DEMO: Prefs = {
  club: { name: 'Your club', logo: null }, email: 'y•••@example.com', first_name: 'there', unsubscribed: false, topics_off: [], is_member: true, whats_on: true,
  topics: [
    { key: 'news', label: 'Club news and announcements', note: 'Updates and newsletters from the club' },
    { key: 'results', label: 'Results', note: 'Results after race days' },
    { key: 'events', label: 'Events and regattas', note: 'Entries opening and event details' },
    { key: 'classifieds', label: 'Classifieds', note: 'Boats and gear for sale' },
  ],
};

const Sw: React.FC<{ on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, label, onChange, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className="ep-sw" disabled={disabled} onClick={() => onChange(!on)} />
);

const EmailPreferencesPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const test = params.get('test') === '1';
  const askUnsub = params.get('unsub') === '1';
  const [p, setP] = useState<Prefs | null>(test ? DEMO : null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>(test ? 'ready' : 'loading');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (test) return;
    if (!/^[0-9a-f-]{36}$/i.test(token)) { setState('missing'); return; }
    supabase.rpc('email_studio_prefs_get', { p_token: token }).then(({ data, error }) => {
      if (error) { setState('error'); return; }
      if (!data) { setState('missing'); return; }
      setP(data as Prefs);
      setState('ready');
    });
  }, [token, test]);

  const save = async (next: Prefs, msg: string) => {
    setP(next);
    if (test) { setSaved('This is a test email, so nothing was changed.'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('email_studio_prefs_set', {
      p_token: token, p_unsubscribed: next.unsubscribed, p_topics_off: next.topics_off, p_whats_on: next.is_member ? next.whats_on : null,
    });
    setSaving(false);
    if (error) { setSaved('That didn’t save. Please try again.'); return; }
    if (data) setP(data as Prefs);
    setSaved(msg);
  };

  const club = p?.club?.name || 'the club';
  const toggleTopic = (key: string, on: boolean) => {
    if (!p) return;
    const off = on ? p.topics_off.filter(k => k !== key) : Array.from(new Set([...p.topics_off, key]));
    save({ ...p, topics_off: off, unsubscribed: on ? false : p.unsubscribed }, 'Saved');
  };

  return (
    <div className="ep-root">
      <main className="ep-card" aria-live="polite">
        <div className="ep-head">
          {p?.club?.logo ? <img src={p.club.logo} alt="" /> : <span style={{ width: 48, height: 48, borderRadius: 12, background: '#E8F1FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#0A84FF' }}>{(p?.club?.name || 'A')[0]}</span>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{p?.club?.name || 'Email preferences'}</div>
            <div style={{ fontSize: 13, color: '#64748B' }}>{p ? `Emails to ${p.email}` : 'Choose the emails you get'}</div>
          </div>
        </div>

        <div className="ep-body">
          {state === 'loading' && <div style={{ color: '#64748B', padding: '12px 0' }}>Loading your preferences…</div>}
          {state === 'missing' && <div style={{ padding: '6px 0', lineHeight: 1.5 }}><b>This link isn’t recognised.</b><br />Open the link at the bottom of a recent email from your club, or change your email settings in AlfiePRO.</div>}
          {state === 'error' && <div style={{ padding: '6px 0', lineHeight: 1.5 }}><b>Something went wrong.</b><br />Please try the link again in a minute.</div>}

          {state === 'ready' && p && (
            <>
              {test && <div className="ep-row" style={{ background: '#FFF7E6' }}><div className="t"><b>This is a test email</b><small>Members see their own settings here. Changes on this page aren’t saved.</small></div></div>}

              {p.unsubscribed ? (
                <div className="ep-row" style={{ background: '#FEF2F2', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  <div className="t"><b>You’re unsubscribed from {club} emails</b><small>You’ll still get important notices such as membership renewals and receipts.</small></div>
                  <button type="button" className="ep-btn" disabled={saving} onClick={() => save({ ...p, unsubscribed: false }, `Welcome back. You’ll get ${club} emails again.`)}>Subscribe again</button>
                </div>
              ) : askUnsub ? (
                <div className="ep-row" style={{ background: '#FEF2F2', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  <div className="t"><b>Unsubscribe from {club} emails?</b><small>Or keep the ones you want by turning off the rest below.</small></div>
                  <button type="button" className="ep-btn" style={{ background: '#B42318' }} disabled={saving} onClick={() => save({ ...p, unsubscribed: true }, 'You’re unsubscribed.')}>Unsubscribe</button>
                </div>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.5, color: '#334155' }}>Hi {p.first_name || 'there'}, choose what {club} emails you about.</div>
              )}

              {p.topics.map(t => {
                const on = !p.unsubscribed && !p.topics_off.includes(t.key);
                return (
                  <div key={t.key} className="ep-row">
                    <div className="t"><b>{t.label}</b>{t.note && <small>{t.note}</small>}</div>
                    <Sw on={on} label={t.label} disabled={saving} onChange={v => toggleTopic(t.key, v)} />
                  </div>
                );
              })}
              {p.is_member && p.whats_on !== null && (
                <div className="ep-row">
                  <div className="t"><b>What’s On weekly</b><small>Your racing for the week ahead, with one-tap answers</small></div>
                  <Sw on={!!p.whats_on} label="What’s On weekly" disabled={saving} onChange={v => save({ ...p, whats_on: v }, v ? 'What’s On is back on.' : 'What’s On is off.')} />
                </div>
              )}
              <div className="ep-row" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px #E2E8F0' }}>
                <div className="t"><b>Important club notices</b><small>Renewals, receipts and safety notices always reach you.</small></div>
              </div>

              {!p.unsubscribed && !askUnsub && (
                <button type="button" className="ep-btn o" disabled={saving} onClick={() => save({ ...p, unsubscribed: true }, 'You’re unsubscribed.')}>Unsubscribe from all {club} emails</button>
              )}
              <div style={{ minHeight: 20, fontSize: 13, color: saved?.startsWith('That') ? '#B42318' : '#15803D', textAlign: 'center' }}>{saving ? 'Saving…' : saved}</div>
            </>
          )}
          <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>Sent with AlfiePRO</div>
        </div>
      </main>
    </div>
  );
};

export default EmailPreferencesPage;

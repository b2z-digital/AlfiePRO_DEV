import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { sanitizePassword } from '../../utils/password';
import { signInWithOAuthProvider, signInWithAppleNative } from '../../lib/native/oauth';
import { isIOS } from '../../lib/native/platform';
import { AlfieSails, Icon } from '../icons';
import '../../styles/alfie-mobile.css';

/** Branded phone sign-in (Sign in & first run board). Used in the apps and the phone preview. */
export const MobileWelcome: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'start' | 'email'>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const light = (() => { try { return localStorage.getItem('lightMode') === 'true'; } catch { return false; } })();

  const google = async () => {
    setBusy('google'); setError('');
    const { error } = await signInWithOAuthProvider('google', { webRedirectPath: '/', queryParams: { access_type: 'offline', prompt: 'consent' } });
    if (error) { setError(error.message || 'Google sign-in failed'); }
    setBusy(null);
  };

  const apple = async () => {
    setBusy('apple'); setError('');
    try {
      const { error } = await signInWithAppleNative();
      if (error) throw error;
      navigate('/');
    } catch (e: any) {
      if (!/cancel/i.test(e?.message || '')) setError(e?.message || 'Apple sign-in failed');
    } finally { setBusy(null); }
  };

  const emailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('email'); setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: sanitizePassword(password) });
      if (error) throw error;
      if (data.user) navigate('/');
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      setError(msg.includes('invalid') ? 'That email or password is not right. Check them and try again.' : err.message || 'Sign-in failed');
    } finally { setBusy(null); }
  };

  return (
    <div className={`m-app ${light ? 'm-light' : ''}`} style={{ background: light ? undefined : 'radial-gradient(320px 280px at 50% 30%, rgba(10,132,255,.32), transparent 70%), linear-gradient(180deg,#0A1428 0%,#060B16 60%)' }}>
      <div className="m-scroll m-no-tabs" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 'calc(var(--m-safe-top) + 12vh)' }}>
        <AlfieSails size={92} light={light} />
        <div className="m-disp" style={{ fontSize: 40, marginTop: 18 }}><span style={{ fontWeight: 300 }}>Alfie</span><span style={{ fontWeight: 700 }}>PRO</span></div>
        <p className="m-mut" style={{ margin: '6px 0 0', fontSize: 16, lineHeight: 1.45 }}>Your club, your racing and your boats,<br />all in one place.</p>
        <div style={{ flex: 1, minHeight: 40 }} />

        {mode === 'start' ? (
          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isIOS && (
              <button className="m-btn" style={{ height: 52, background: '#fff', color: '#0A1020', fontSize: 16 }} onClick={apple} disabled={!!busy}>
                <svg width="18" height="20" viewBox="0 0 384 512" aria-hidden="true"><path fill="#0A1020" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-62.1 24-72.5-24 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" /></svg>
                {busy === 'apple' ? 'Signing in…' : 'Continue with Apple'}
              </button>
            )}
            <button className="m-btn m-btn-g" style={{ height: 52, fontSize: 16 }} onClick={google} disabled={!!busy}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: '#fff', color: '#1A73E8', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>G</span>
              {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <button className="m-btn m-btn-g" style={{ height: 52, fontSize: 16 }} onClick={() => setMode('email')}>
              <Icon name="doc" size={19} />Sign in with email
            </button>
            {error && <div style={{ color: '#FF8C82', fontSize: 14 }}>{error}</div>}
            <p className="m-mut" style={{ margin: '8px 0 0', fontSize: 14 }}>New here? <a href="/register" style={{ fontWeight: 600 }}>Create an account</a></p>
            <p className="m-mut" style={{ margin: 0, fontSize: 14 }}>Got an email from your club? <a href="/forgot-password" style={{ fontWeight: 600 }}>Activate it</a></p>
          </div>
        ) : (
          <form onSubmit={emailSignIn} style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            <label className="m-lb m-mut" htmlFor="m-email">Email</label>
            <input id="m-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ height: 50, borderRadius: 13, border: '1px solid var(--m-fill-b)', background: 'var(--m-fill)', color: 'var(--m-ink)', padding: '0 14px', fontSize: 16 }} />
            <label className="m-lb m-mut" htmlFor="m-pass">Password</label>
            <input id="m-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ height: 50, borderRadius: 13, border: '1px solid var(--m-fill-b)', background: 'var(--m-fill)', color: 'var(--m-ink)', padding: '0 14px', fontSize: 16 }} />
            {error && <div style={{ color: '#FF8C82', fontSize: 14 }}>{error}</div>}
            <button className="m-btn m-btn-p" style={{ height: 52, fontSize: 16, marginTop: 6 }} disabled={busy === 'email'}>{busy === 'email' ? 'Signing in…' : 'Sign in'}</button>
            <div className="m-row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
              <button type="button" className="m-btn" style={{ background: 'none', padding: 0, height: 36, color: 'var(--m-mut)' }} onClick={() => setMode('start')}>Back</button>
              <a href="/forgot-password" style={{ fontWeight: 600 }}>Forgot password?</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

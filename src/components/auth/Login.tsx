import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { sanitizePassword } from '../../utils/password';
import { Logo } from '../Logo';
import { GoogleIcon } from './GoogleIcon';
import { Smartphone, Monitor, ExternalLink, Eye, EyeOff, ArrowRight } from 'lucide-react';

const AppleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 384 512" fill="currentColor" className={className}>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-62.1 24-72.5-24 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
  </svg>
);

const GooglePlayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 512 512" fill="currentColor" className={className}>
    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
  </svg>
);

function useIsMobilePhone() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      const isMobileWidth = width < 768;
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(isMobileWidth && hasTouchScreen);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [appLinks, setAppLinks] = useState<{ ios: string; android: string }>({ ios: '', android: '' });
  const [showLogin, setShowLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobilePhone();

  useEffect(() => {
    if (isMobile) {
      const fetchAppLinks = async () => {
        try {
          const { data } = await supabase
            .from('platform_settings')
            .select('key, value')
            .eq('category', 'mobile_app');

          const links = { ios: '', android: '' };
          (data || []).forEach((s: { key: string; value: string }) => {
            if (s.key === 'ios_app_store_url') links.ios = s.value;
            if (s.key === 'android_play_store_url') links.android = s.value;
          });
          setAppLinks(links);
        } catch (err) {
          console.error('Error fetching app links:', err);
        }
      };
      fetchAppLinks();
    }
  }, [isMobile]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: sanitizePassword(password),
      });

      if (error) throw error;

      if (data.user) {
        navigate('/');
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        setError('The email or password you entered is incorrect. Please check and try again. If your password was recently reset by an administrator, make sure you are using the new password.');
      } else {
        setError(err.message || 'Failed to log in');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setGoogleLoading(false);
    }
  };

  if (isMobile && !showLogin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center px-5 py-10">
        <div className="max-w-sm w-full">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Logo size="large" />
            <h1 className="text-3xl text-white tracking-wide">
              <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
            </h1>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 pt-8 pb-6 text-center border-b border-slate-700/30">
              <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-2 ring-blue-500/30">
                <Smartphone className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                Get the AlfiePRO App
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                For the best experience on mobile, download the AlfiePRO app for your device.
              </p>
            </div>

            <div className="p-6 space-y-3">
              {appLinks.ios ? (
                <a
                  href={appLinks.ios}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 w-full px-5 py-4 bg-white rounded-xl text-black hover:bg-gray-100 transition-all active:scale-[0.98] group"
                >
                  <AppleIcon className="w-7 h-7 shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="text-[10px] leading-tight text-gray-500 uppercase tracking-wider">Download on the</div>
                    <div className="text-lg font-semibold leading-tight -mt-0.5">App Store</div>
                  </div>
                  <ExternalLink size={16} className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                </a>
              ) : (
                <div className="flex items-center gap-4 w-full px-5 py-4 bg-slate-700/40 rounded-xl border border-slate-600/30">
                  <AppleIcon className="w-7 h-7 shrink-0 text-slate-500" />
                  <div className="flex-1 text-left">
                    <div className="text-[10px] leading-tight text-slate-500 uppercase tracking-wider">Coming soon on</div>
                    <div className="text-lg font-semibold leading-tight -mt-0.5 text-slate-400">App Store</div>
                  </div>
                </div>
              )}

              {appLinks.android ? (
                <a
                  href={appLinks.android}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 w-full px-5 py-4 bg-white rounded-xl text-black hover:bg-gray-100 transition-all active:scale-[0.98] group"
                >
                  <GooglePlayIcon className="w-6 h-6 shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="text-[10px] leading-tight text-gray-500 uppercase tracking-wider">Get it on</div>
                    <div className="text-lg font-semibold leading-tight -mt-0.5">Google Play</div>
                  </div>
                  <ExternalLink size={16} className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                </a>
              ) : (
                <div className="flex items-center gap-4 w-full px-5 py-4 bg-slate-700/40 rounded-xl border border-slate-600/30">
                  <GooglePlayIcon className="w-6 h-6 shrink-0 text-slate-500" />
                  <div className="flex-1 text-left">
                    <div className="text-[10px] leading-tight text-slate-500 uppercase tracking-wider">Coming soon on</div>
                    <div className="text-lg font-semibold leading-tight -mt-0.5 text-slate-400">Google Play</div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <div className="rounded-xl p-4 bg-slate-700/30">
                <p className="text-slate-300 text-xs font-medium mb-2 flex items-center gap-1.5">
                  <Monitor size={14} className="text-slate-400" />
                  Desktop & Tablet
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  The full AlfiePRO web platform is available on tablets and desktop computers at{' '}
                  <span className="text-blue-400 font-medium">alfiepro.com.au</span>
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowLogin(true)}
            className="w-full mt-4 py-3 text-slate-400 hover:text-white text-sm transition-colors text-center"
          >
            Continue to web sign in
          </button>
        </div>
      </div>
    );
  }

  const inputClass =
    'w-full h-[52px] px-4 bg-white/[0.05] border border-white/[0.14] rounded-[14px] text-white text-base placeholder-white/50 focus:outline-none focus:border-[#6E8FFF] focus:ring-4 focus:ring-[#5E80FF]/25 focus:bg-white/[0.08] transition-colors';

  return (
    <div className="min-h-screen bg-[#0B1328] text-white lg:flex">
      {/* Photo panel: hero on small screens, full-height left half on desktop */}
      <section className="relative overflow-hidden flex flex-col justify-between min-h-[46vh] lg:min-h-screen lg:flex-1 px-6 pt-8 pb-16 sm:px-10 lg:p-12">
        <img
          src="/login-yacht.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[50%_30%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#070D22]/60 via-transparent to-[#070D22]/85"
        />

        <div className="relative flex items-center gap-3">
          <Logo size="medium" />
          <div className="text-3xl text-white tracking-wide">
            <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
          </div>
        </div>

        <div className="relative max-w-xl mt-10">
          <p className="flex max-sm:hidden items-center gap-2.5 mb-4 text-[13px] font-semibold tracking-[0.14em] uppercase text-[#A9C4FF]">
            <span aria-hidden="true" className="inline-block w-7 h-0.5 bg-[#A9C4FF]" />
            Welcome back
          </p>
          <h1 className="font-['Outfit',sans-serif] font-semibold text-[40px] sm:text-5xl xl:text-[72px] leading-[1.02] tracking-tight">
            Good to have
            <br />
            you aboard.
          </h1>
          <p className="max-sm:hidden mt-4 max-w-md text-lg leading-relaxed text-white/85">
            Sign in to pick up right where you left off.
          </p>
        </div>
      </section>

      {/* Form panel */}
      <section
        aria-labelledby="signin-title"
        className="relative -mt-8 lg:mt-0 rounded-t-[28px] lg:rounded-none bg-[#0B1328] flex flex-col lg:flex-1 lg:max-w-[720px] px-6 pt-8 pb-8 sm:px-10 lg:px-16 lg:pt-9"
      >
        <p className="max-lg:hidden self-end text-[15px] text-white/80">
          New to AlfiePRO?{' '}
          <button
            onClick={() => navigate('/register')}
            className="font-semibold text-[#9DB8FF] hover:text-[#C9D7FF] transition-colors"
          >
            Create an account
          </button>
        </p>

        <div className="flex-1 flex items-center justify-center lg:py-10">
          <div className="w-full max-w-[400px]">
            <h2
              id="signin-title"
              className="font-['Outfit',sans-serif] text-[34px] font-semibold tracking-tight mb-2"
            >
              Sign in
            </h2>
            <p className="text-white/70 mb-7">Use your Google account or email.</p>

            {error && (
              <div role="alert" className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full h-[52px] flex items-center justify-center gap-3 bg-white/[0.05] hover:bg-white/10 border border-white/[0.16] rounded-[14px] font-medium transition-colors disabled:opacity-60"
            >
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </button>

            <div className="flex items-center gap-3.5 my-6">
              <span aria-hidden="true" className="flex-1 h-px bg-white/[0.12]" />
              <span className="text-[13px] text-white/65">or with email</span>
              <span aria-hidden="true" className="flex-1 h-px bg-white/[0.12]" />
            </div>

            <form onSubmit={handleLogin} className="space-y-[18px]">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white/85 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-sm font-medium text-white/85">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="text-sm font-medium text-[#9DB8FF] hover:text-[#C9D7FF] transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`${inputClass} pr-14`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1 w-11 h-11 flex items-center justify-center rounded-[10px] text-white/70 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-[54px] mt-1 flex items-center justify-center gap-2.5 bg-[#3B63E0] hover:brightness-110 disabled:bg-slate-600 disabled:hover:brightness-100 text-white font-semibold rounded-[14px] transition-all shadow-[0_12px_30px_rgba(59,99,224,0.4)] disabled:shadow-none"
              >
                {loading ? 'Signing in...' : 'Sign in'}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <p className="lg:hidden mt-6 text-center text-sm text-white/80">
              New to AlfiePRO?{' '}
              <button
                onClick={() => navigate('/register')}
                className="font-semibold text-[#9DB8FF] hover:text-[#C9D7FF] transition-colors"
              >
                Create an account
              </button>
            </p>
          </div>
        </div>

        <footer className="mt-10 lg:mt-0 flex flex-wrap items-center justify-between gap-3 text-[13px] text-white/70">
          <p>© {new Date().getFullYear()} AlfiePRO</p>
          <nav aria-label="Legal" className="flex gap-5">
            <a href="/privacy-policy" className="text-white/80 hover:text-white transition-colors">Privacy</a>
            <a href="/terms-of-service" className="text-white/80 hover:text-white transition-colors">Terms</a>
          </nav>
        </footer>
      </section>
    </div>
  );
};

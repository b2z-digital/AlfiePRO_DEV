import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { sanitizePassword } from '../../utils/password';
import { Logo } from '../Logo';
import { GoogleIcon } from './GoogleIcon';
import { Smartphone, Monitor, ExternalLink } from 'lucide-react';

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: sanitizePassword(password),
      });

      if (error) throw error;

      if (data.user) {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to log in');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
          <div className="flex justify-end items-center px-6 py-4 border-b border-slate-700/30">
            <div className="flex items-center gap-3">
              <div className="px-5 py-1.5 bg-blue-600 rounded-full text-white text-sm font-semibold shadow-lg shadow-blue-500/15">
                Sign In
              </div>
              <button
                onClick={() => navigate('/register')}
                className="px-5 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-full transition-all duration-200"
              >
                Create Account
              </button>
            </div>
          </div>

          <div className="p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="flex items-center gap-4 mb-3">
                <Logo size="medium" />
                <div className="text-3xl text-white">
                  <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
                </div>
              </div>
            </div>

            <div className="mx-auto">
              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl backdrop-blur-sm">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-3 bg-slate-700/60 hover:bg-slate-600/70 disabled:bg-slate-700/40 border border-slate-600/50 hover:border-slate-500/60 text-slate-200 font-medium rounded-xl transition-all duration-200 backdrop-blur-sm disabled:text-slate-500 mb-6"
              >
                {googleLoading ? (
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                {googleLoading ? 'Redirecting...' : 'Continue with Google'}
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-600/50" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-slate-800/50 text-slate-400">or sign in with email</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => navigate('/forgot-password')}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/25 disabled:shadow-none"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-slate-400 text-sm">
                  Don't have an account?{' '}
                  <button
                    onClick={() => navigate('/register')}
                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Sign up
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { Smartphone, Monitor, Tablet, LogOut, Download, ExternalLink } from 'lucide-react';
import { supabase } from '../utils/supabase';

interface AppStoreLinks {
  ios: string;
  android: string;
}

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

export const MobileAppComingSoon: React.FC = () => {
  const [appLinks, setAppLinks] = useState<AppStoreLinks>({ ios: '', android: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAppLinks = async () => {
      try {
        const { data } = await supabase
          .from('platform_settings')
          .select('key, value')
          .eq('category', 'mobile_app');

        const links: AppStoreLinks = { ios: '', android: '' };
        (data || []).forEach((setting: { key: string; value: string }) => {
          if (setting.key === 'ios_app_store_url') links.ios = setting.value;
          if (setting.key === 'android_play_store_url') links.android = setting.value;
        });
        setAppLinks(links);
      } catch (err) {
        console.error('Error fetching app store links:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAppLinks();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const hasAnyLink = appLinks.ios || appLinks.android;

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
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          <div className="px-6 pb-6">
            <div className={`rounded-xl p-4 ${hasAnyLink ? 'bg-slate-700/30' : 'bg-blue-900/20 border border-blue-700/30'}`}>
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
          onClick={handleSignOut}
          className="flex items-center justify-center gap-2 mx-auto mt-6 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
};

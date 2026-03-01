import React from 'react';
import { Logo } from './Logo';
import { Smartphone, Monitor, Tablet, LogOut } from 'lucide-react';
import { supabase } from '../utils/supabase';

export const MobileAppComingSoon: React.FC = () => {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Logo size="large" />
          <h1 className="text-3xl text-white tracking-wide">
            <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
          </h1>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 mb-6">
          <div className="w-16 h-16 bg-blue-500/15 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Smartphone className="w-8 h-8 text-blue-400" />
          </div>

          <h2 className="text-xl font-bold text-white mb-3">
            Mobile Apps Coming Soon
          </h2>

          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            AlfiePRO is best experienced on a tablet or desktop computer. Our dedicated iOS and Android apps are currently in development and will be available soon.
          </p>

          <div className="bg-slate-700/30 rounded-xl p-4 mb-6">
            <p className="text-slate-300 text-sm font-medium mb-3">
              For now, please use AlfiePRO on:
            </p>
            <div className="flex items-center justify-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-slate-600/50 rounded-lg flex items-center justify-center">
                  <Tablet className="w-5 h-5 text-slate-300" />
                </div>
                <span className="text-xs text-slate-400">Tablet</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-slate-600/50 rounded-lg flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-slate-300" />
                </div>
                <span className="text-xs text-slate-400">Desktop</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700/50 pt-4">
            <p className="text-slate-500 text-xs">
              We'll notify you when the mobile apps are ready to download.
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center justify-center gap-2 mx-auto text-slate-400 hover:text-white text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
};

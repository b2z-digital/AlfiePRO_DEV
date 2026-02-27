import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { Logo } from '../Logo';
import { GoogleIcon } from './GoogleIcon';
import { User, Building, ArrowLeft } from 'lucide-react';

type RegistrationMode = 'choice' | 'user' | 'club';

export const Register: React.FC = () => {
  const [mode, setMode] = useState<RegistrationMode>('choice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        if (mode === 'club') {
          navigate('/register-club');
        } else {
          navigate('/onboarding');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError('');

    try {
      const redirectPath = mode === 'club' ? '/register-club' : '/';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${redirectPath}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to sign up with Google');
      setGoogleLoading(false);
    }
  };

  if (mode === 'choice') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center mb-10">
            <div className="flex items-center gap-4 mb-3">
              <Logo size="medium" />
              <div className="text-3xl text-white">
                <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
              </div>
            </div>
            <p className="text-slate-400 text-sm mt-2">Choose how you'd like to get started</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => setMode('user')}
              className="group relative bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 text-left transition-all duration-300 hover:border-blue-500/50 hover:bg-slate-800/70 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1"
            >
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-blue-500 to-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-14 h-14 rounded-xl bg-blue-500/15 flex items-center justify-center mb-5 group-hover:bg-blue-500/25 transition-colors">
                <User className="text-blue-400" size={28} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">User Registration</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Join an existing club as a member. Perfect for sailors looking to register with their local yacht club.
              </p>
              <div className="mt-6 flex items-center gap-2 text-blue-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Get started
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <button
              onClick={() => setMode('club')}
              className="group relative bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 text-left transition-all duration-300 hover:border-emerald-500/50 hover:bg-slate-800/70 hover:shadow-xl hover:shadow-emerald-500/5 hover:-translate-y-1"
            >
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-14 h-14 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-5 group-hover:bg-emerald-500/25 transition-colors">
                <Building className="text-emerald-400" size={28} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Club Registration</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Register your club on AlfiePRO. Set up your club under a state association and get your dashboard ready.
              </p>
              <div className="mt-6 flex items-center gap-2 text-emerald-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Register your club
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-700/30">
            <button
              onClick={() => setMode('choice')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-full transition-all duration-200"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-full transition-all duration-200"
              >
                Sign In
              </button>
              <div className={`px-5 py-1.5 rounded-full text-white text-sm font-semibold shadow-lg ${
                mode === 'club'
                  ? 'bg-emerald-600 shadow-emerald-500/15'
                  : 'bg-blue-600 shadow-blue-500/15'
              }`}>
                {mode === 'club' ? 'Club Registration' : 'Create Account'}
              </div>
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
              {mode === 'club' && (
                <p className="text-emerald-400 text-sm mt-1 font-medium">Register your club on AlfiePRO</p>
              )}
            </div>

            <div className="mx-auto">
              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl backdrop-blur-sm">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleGoogleSignUp}
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
                  <span className="px-3 bg-slate-800/50 text-slate-400">or sign up with email</span>
                </div>
              </div>

              <form onSubmit={handleRegister} className="space-y-5">
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
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
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

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 disabled:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg disabled:shadow-none ${
                    mode === 'club'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/15 hover:shadow-xl hover:shadow-emerald-500/25'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/25'
                  }`}
                >
                  {loading ? 'Creating account...' : mode === 'club' ? 'Create Account & Register Club' : 'Create Account'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-slate-400 text-sm">
                  Already have an account?{' '}
                  <button
                    onClick={() => navigate('/login')}
                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Sign in
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

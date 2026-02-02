import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { Logo } from '../Logo';

export const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
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
        navigate('/onboarding');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
          {/* Top navigation bar */}
          <div className="flex justify-end items-center px-6 py-4 border-b border-slate-700/30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-full transition-all duration-200"
              >
                Sign In
              </button>
              <div className="px-5 py-1.5 bg-blue-600 rounded-full text-white text-sm font-semibold shadow-lg shadow-blue-500/15">
                Create Account
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Centered AlfiePRO logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="flex items-center gap-4 mb-3">
                <Logo size="medium" />
                <div className="text-3xl text-white">
                  <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
                </div>
              </div>
            </div>

            {/* Form - centered and narrower */}
            <div className="mx-auto">

              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl backdrop-blur-sm">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

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
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
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
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
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
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/25 disabled:shadow-none"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
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

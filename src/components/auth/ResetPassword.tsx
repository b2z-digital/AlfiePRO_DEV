import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { Logo } from '../Logo';
import { CheckCircle, Lock, Eye, EyeOff } from 'lucide-react';

export const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
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
              {success ? (
                <div className="text-center space-y-4">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                      <CheckCircle size={32} className="text-green-400" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold text-white">Password updated</h2>
                  <p className="text-slate-400 text-sm">
                    Your password has been successfully updated. You can now sign in with your new password.
                  </p>
                  <button
                    onClick={() => navigate('/login')}
                    className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all duration-200"
                  >
                    Sign In
                  </button>
                </div>
              ) : !sessionReady ? (
                <div className="text-center space-y-4">
                  <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center">
                      <Lock size={28} className="text-blue-400" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold text-white">Verifying reset link...</h2>
                  <p className="text-slate-400 text-sm">
                    Please wait while we verify your password reset link.
                  </p>
                  <div className="flex justify-center">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="flex justify-center mb-4">
                      <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center">
                        <Lock size={28} className="text-blue-400" />
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">Set new password</h2>
                    <p className="text-slate-400 text-sm">
                      Choose a strong password for your account.
                    </p>
                  </div>

                  {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl backdrop-blur-sm">
                      <p className="text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleResetPassword} className="space-y-5">
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                        New password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoFocus
                          className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                          placeholder="Minimum 6 characters"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                        Confirm new password
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={6}
                          className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                          placeholder="Confirm your new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/25 disabled:shadow-none"
                    >
                      {loading ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

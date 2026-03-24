import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { Logo } from '../Logo';
import { CircleCheck as CheckCircle, Lock, Eye, EyeOff, TriangleAlert as AlertTriangle, UserPlus } from 'lucide-react';

type FlowType = 'activation' | 'reset' | 'legacy';

export const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const navigate = useNavigate();
  const sessionReadyRef = useRef(false);

  const url = new URL(window.location.href);

  const activationToken = url.searchParams.get('activation');
  const resetToken = url.searchParams.get('reset');
  const tokenEmail = url.searchParams.get('email');

  let flowType: FlowType = 'legacy';
  if (activationToken && tokenEmail) {
    flowType = 'activation';
  } else if (resetToken && tokenEmail) {
    flowType = 'reset';
  }

  const isCustomTokenFlow = flowType === 'activation' || flowType === 'reset';

  useEffect(() => {
    if (isCustomTokenFlow) {
      sessionReadyRef.current = true;
      setSessionReady(true);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let pollIntervalId: ReturnType<typeof setInterval>;

    const markReady = () => {
      if (!sessionReadyRef.current) {
        sessionReadyRef.current = true;
        setSessionReady(true);
      }
    };

    const markExpired = () => {
      if (!sessionReadyRef.current) {
        setExpired(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        markReady();
      } else if (event === 'SIGNED_IN' && session) {
        markReady();
      }
    });

    const hasCode = url.searchParams.has('code');
    const hasHashRecovery = window.location.hash.includes('type=recovery');

    if (hasCode || hasHashRecovery) {
      pollIntervalId = setInterval(async () => {
        if (sessionReadyRef.current) {
          clearInterval(pollIntervalId);
          return;
        }
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            markReady();
            clearInterval(pollIntervalId);
          }
        } catch (_) {}
      }, 500);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        markReady();
      }
    });

    timeoutId = setTimeout(() => {
      if (!sessionReadyRef.current) {
        markExpired();
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeoutId);
      if (pollIntervalId) clearInterval(pollIntervalId);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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
      if (isCustomTokenFlow) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const body: Record<string, string> = {
          email: tokenEmail!,
          password,
        };

        if (flowType === 'activation') {
          body.activation_token = activationToken!;
        } else {
          body.reset_token = resetToken!;
        }

        const res = await fetch(`${supabaseUrl}/functions/v1/set-member-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to set password');
        }

        setSuccess(true);
        setLoading(false);
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        setSuccess(true);
        setLoading(false);

        try {
          await supabase.auth.signOut();
        } catch (_) {}
      }
    } catch (err: any) {
      setLoading(false);
      if (err.message?.includes('expired') || err.message?.includes('invalid') || err.message?.includes('session') || err.message?.includes('token')) {
        if (flowType === 'activation') {
          setError('Your activation link has expired or is invalid. Please contact your club administrator to resend the activation email.');
        } else {
          setError('Your reset link has expired or is invalid. Please request a new one.');
        }
      } else {
        setError(err.message || 'Failed to set password');
      }
    }
  };

  const isActivation = flowType === 'activation';

  const headingText = isActivation ? 'Set Up Your Password' : 'Set New Password';
  const subtitleText = isActivation
    ? 'Create a password to access your club account.'
    : 'Choose a strong password for your account.';
  const buttonText = isActivation ? 'Create Password' : 'Update Password';
  const loadingText = isActivation ? 'Creating...' : 'Updating...';
  const successHeading = isActivation ? 'Account activated' : 'Password updated';
  const successMessage = isActivation
    ? 'Your password has been set and your account is now active. You can sign in to access your club.'
    : 'Your password has been successfully updated. You can now sign in with your new password.';
  const expiredHeading = isActivation ? 'Activation link expired' : 'Link expired or invalid';
  const expiredMessage = isActivation
    ? 'This activation link has expired or is invalid. Please contact your club administrator to resend the activation email.'
    : 'This password reset link has expired or is invalid. Please request a new one.';
  const verifyingHeading = isActivation ? 'Verifying activation link...' : 'Verifying reset link...';
  const verifyingMessage = isActivation
    ? 'Please wait while we verify your activation link.'
    : 'Please wait while we verify your password reset link.';

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
                  <h2 className="text-xl font-semibold text-white">{successHeading}</h2>
                  <p className="text-slate-400 text-sm">
                    {successMessage}
                  </p>
                  <button
                    onClick={() => navigate('/login')}
                    className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all duration-200"
                  >
                    Sign In
                  </button>
                </div>
              ) : expired ? (
                <div className="text-center space-y-4">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center">
                      <AlertTriangle size={32} className="text-amber-400" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold text-white">{expiredHeading}</h2>
                  <p className="text-slate-400 text-sm">
                    {expiredMessage}
                  </p>
                  <div className="flex gap-3 justify-center mt-4">
                    {!isActivation && (
                      <button
                        onClick={() => navigate('/forgot-password')}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all duration-200"
                      >
                        Request New Link
                      </button>
                    )}
                    <button
                      onClick={() => navigate('/login')}
                      className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-all duration-200"
                    >
                      Back to Sign In
                    </button>
                  </div>
                </div>
              ) : !sessionReady ? (
                <div className="text-center space-y-4">
                  <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center">
                      <Lock size={28} className="text-blue-400" />
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold text-white">{verifyingHeading}</h2>
                  <p className="text-slate-400 text-sm">
                    {verifyingMessage}
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
                        {isActivation ? (
                          <UserPlus size={28} className="text-blue-400" />
                        ) : (
                          <Lock size={28} className="text-blue-400" />
                        )}
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">{headingText}</h2>
                    <p className="text-slate-400 text-sm">
                      {subtitleText}
                    </p>
                    {tokenEmail && (
                      <p className="text-slate-500 text-xs mt-2">
                        <span className="text-slate-300">{tokenEmail}</span>
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl backdrop-blur-sm">
                      <p className="text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                        {isActivation ? 'Password' : 'New password'}
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
                          className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
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
                        Confirm password
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={6}
                          className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                          placeholder="Confirm your password"
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
                      {loading ? loadingText : buttonText}
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

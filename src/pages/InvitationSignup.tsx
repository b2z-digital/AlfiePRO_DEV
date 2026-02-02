import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { validateInvitationToken, acceptInvitation } from '../utils/memberInvitations';
import { Logo } from '../components/Logo';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

export const InvitationSignup: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [validating, setValidating] = useState(true);
  const [invitationValid, setInvitationValid] = useState(false);
  const [clubName, setClubName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberName, setMemberName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      validateToken();
    }
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setError('No invitation token provided');
      setValidating(false);
      return;
    }

    const result = await validateInvitationToken(token);

    if (!result.valid) {
      setError(result.error || 'Invalid invitation');
      setInvitationValid(false);
      setValidating(false);
      return;
    }

    if (result.invitation) {
      setInvitationValid(true);
      setMemberEmail(result.invitation.email);

      // Fetch club name
      const { data: clubData } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', result.invitation.club_id)
        .single();

      if (clubData) {
        setClubName(clubData.name);
      }

      // Fetch member details if available
      if (result.invitation.member_id) {
        const { data: memberData } = await supabase
          .from('members')
          .select('first_name, last_name')
          .eq('id', result.invitation.member_id)
          .single();

        if (memberData) {
          setMemberName(`${memberData.first_name} ${memberData.last_name}`);
        }
      }
    }

    setValidating(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // First, try to sign up (handles case where user doesn't exist yet)
      let authError: any = null;
      let authData: any = null;

      const signupResult = await supabase.auth.signUp({
        email: memberEmail,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        }
      });

      authData = signupResult.data;
      authError = signupResult.error;

      // If user already exists, try to sign in instead
      if (authError) {
        if (authError.status === 422 ||
            authError.message?.toLowerCase().includes('already') ||
            authError.message?.toLowerCase().includes('exists')) {

          console.log('User already exists, attempting sign in...');

          const signInResult = await supabase.auth.signInWithPassword({
            email: memberEmail,
            password: password,
          });

          if (signInResult.error) {
            throw new Error('An account with this email already exists. If you forgot your password, please use the "Sign in instead" link below and select "Forgot password".');
          }

          authData = signInResult.data;
        } else {
          // Some other error occurred
          throw authError;
        }
      }

      // Verify we have a session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please check your email to confirm your account before proceeding.');
      }

      // Accept the invitation
      const acceptResult = await acceptInvitation(token!);

      if (!acceptResult.success) {
        throw new Error(acceptResult.error || 'Failed to link your account to the club');
      }

      setSuccess(true);

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);

    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader className="animate-spin text-blue-500 mx-auto mb-4" size={48} />
          <p className="text-slate-400">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (!invitationValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-slate-700">
            <div className="text-center mb-6">
              <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
              <h2 className="text-2xl font-bold text-white mb-2">Invalid Invitation</h2>
              <p className="text-slate-400">{error || 'This invitation is invalid or has expired.'}</p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-slate-700">
            <div className="text-center">
              <CheckCircle className="text-green-500 mx-auto mb-4" size={48} />
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to {clubName}!</h2>
              <p className="text-slate-400 mb-6">
                Your account has been created successfully. Redirecting to dashboard...
              </p>
              <div className="flex items-center justify-center">
                <Loader className="animate-spin text-blue-500" size={24} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Logo />
            <h1 className="text-3xl font-bold text-white">Alfie PRO</h1>
          </div>
          <p className="text-slate-400">You've been invited to join {clubName}</p>
        </div>

        <div className="bg-slate-800 rounded-xl shadow-2xl p-8 border border-slate-700">
          {memberName && (
            <div className="mb-6 p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
              <p className="text-sm text-blue-400">
                <strong>Welcome {memberName}!</strong> Complete the form below to create your account.
              </p>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-6">
            {error && (
              <div className="bg-red-900/20 border border-red-600/30 text-red-400 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={memberEmail}
                readOnly
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 mt-1">This email is from your club membership</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Choose a secure password"
                required
                minLength={6}
              />
              <p className="text-xs text-slate-500 mt-1">Minimum 6 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Re-enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Account...' : 'Create Account & Join Club'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                Sign in instead
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

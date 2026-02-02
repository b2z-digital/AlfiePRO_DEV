import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';

export default function StripeOAuthCallback() {
  console.log('🔵 StripeOAuthCallback component rendering');
  console.log('🔍 IMMEDIATE localStorage check:', {
    hasToken: !!localStorage.getItem('stripe_oauth_token'),
    hasClubId: !!localStorage.getItem('stripe_oauth_club_id'),
    hasTimestamp: !!localStorage.getItem('stripe_oauth_timestamp'),
    token: localStorage.getItem('stripe_oauth_token')?.substring(0, 30) + '...',
    domain: window.location.hostname
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<string>('Processing...');

  useEffect(() => {
    const handleCallback = async () => {
      console.log('🚀 StripeOAuthCallback: Component mounted and starting callback processing');
      console.log('📍 Current URL:', window.location.href);
      console.log('📍 Pathname:', window.location.pathname);
      console.log('📍 Search params:', window.location.search);

      // Small delay to ensure auth context is initialized
      await new Promise(resolve => setTimeout(resolve, 500));

      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      console.log('📋 OAuth params:', {
        code: code ? code.substring(0, 10) + '...' : 'MISSING',
        state: state || 'MISSING',
        error: error || 'none'
      });

      if (error) {
        console.error('Stripe OAuth error:', error);
        setStatus('Error: ' + error);
        setTimeout(() => {
          navigate('/membership?tab=payment-settings&stripe_error=' + error);
        }, 2000);
        return;
      }

      if (!code || !state) {
        console.error('Missing code or state in OAuth callback');
        setStatus('Invalid callback parameters');
        setTimeout(() => {
          navigate('/membership?tab=payment-settings&stripe_error=invalid_callback');
        }, 2000);
        return;
      }

      try {
        setStatus('Checking authentication...');

        // Try to get session with timeout (don't wait too long)
        let session = null;

        console.log('⏱️ Attempting to get Supabase session with 2s timeout...');
        try {
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Session check timeout')), 2000)
          );

          const { data: { session: currentSession }, error: sessionError } = await Promise.race([
            sessionPromise,
            timeoutPromise
          ]) as any;

          if (sessionError) {
            console.error('❌ Session error:', sessionError);
          } else if (currentSession) {
            session = currentSession;
            console.log('✅ Supabase session found:', { userId: session.user.id, expiresAt: session.expires_at });
          } else {
            console.log('⚠️ No Supabase session returned');
          }
        } catch (err: any) {
          console.log('⚠️ Session check failed or timed out:', err.message);
        }

        // If no session from Supabase, try to get stored OAuth session from multiple sources
        if (!session) {
          console.log('⚠️ No Supabase session found, checking localStorage, sessionStorage, and cookies...');

          // Helper function to get cookie value
          const getCookie = (name: string): string | null => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
            return null;
          };

          // Try multiple sources (prioritize localStorage, then sessionStorage, then cookies)
          let storedToken = localStorage.getItem('stripe_oauth_token')
            || sessionStorage.getItem('stripe_oauth_token')
            || getCookie('stripe_oauth_token');

          let storedRefreshToken = localStorage.getItem('stripe_oauth_refresh_token')
            || sessionStorage.getItem('stripe_oauth_refresh_token')
            || getCookie('stripe_oauth_refresh_token');

          let storedTimestamp = localStorage.getItem('stripe_oauth_timestamp')
            || sessionStorage.getItem('stripe_oauth_timestamp')
            || getCookie('stripe_oauth_timestamp');

          let storedClubId = localStorage.getItem('stripe_oauth_club_id')
            || sessionStorage.getItem('stripe_oauth_club_id')
            || getCookie('stripe_oauth_club_id');

          console.log('📦 Storage contents:', {
            hasToken: !!storedToken,
            hasTimestamp: !!storedTimestamp,
            hasClubId: !!storedClubId,
            tokenPreview: storedToken ? storedToken.substring(0, 20) + '...' : 'none',
            localStorage: {
              hasToken: !!localStorage.getItem('stripe_oauth_token'),
              hasClubId: !!localStorage.getItem('stripe_oauth_club_id')
            },
            sessionStorage: {
              hasToken: !!sessionStorage.getItem('stripe_oauth_token'),
              hasClubId: !!sessionStorage.getItem('stripe_oauth_club_id')
            },
            cookies: {
              hasToken: !!getCookie('stripe_oauth_token'),
              hasClubId: !!getCookie('stripe_oauth_club_id')
            }
          });

          if (storedToken && storedTimestamp) {
            const age = Date.now() - parseInt(storedTimestamp);
            const maxAge = 10 * 60 * 1000; // 10 minutes

            console.log(`⏱️ Token age: ${Math.floor(age / 1000)}s (max: ${maxAge / 1000}s)`);

            if (age < maxAge) {
              console.log('✅ Found valid stored OAuth token, attempting to restore Supabase session...');

              // Try to restore the Supabase session using the stored tokens WITH TIMEOUT
              try {
                const setSessionPromise = supabase.auth.setSession({
                  access_token: storedToken,
                  refresh_token: storedRefreshToken || storedToken
                });

                const timeoutPromise = new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('setSession timeout')), 3000)
                );

                const { data, error } = await Promise.race([setSessionPromise, timeoutPromise]) as any;

                if (error) {
                  console.error('❌ Failed to restore Supabase session:', error);
                } else if (data?.session) {
                  session = data.session;
                  console.log('✅ Successfully restored Supabase session:', {
                    userId: session.user?.id,
                    expiresAt: session.expires_at
                  });
                } else {
                  console.error('❌ setSession returned no session');
                }
              } catch (restoreError: any) {
                console.error('❌ Exception restoring session:', restoreError.message);
              }

              // If session restore failed, use the stored token directly
              if (!session) {
                console.log('⚠️ Using stored token directly as fallback');
                session = {
                  access_token: storedToken,
                  user: { id: storedClubId || '' }
                } as any;
              }
            } else {
              console.error('❌ Stored OAuth token expired');
              // Clean up expired tokens from all storage locations
              localStorage.removeItem('stripe_oauth_token');
              localStorage.removeItem('stripe_oauth_club_id');
              localStorage.removeItem('stripe_oauth_timestamp');
              sessionStorage.removeItem('stripe_oauth_token');
              sessionStorage.removeItem('stripe_oauth_club_id');
              sessionStorage.removeItem('stripe_oauth_timestamp');
              // Clear cookies
              const domain = window.location.hostname.includes('alfiepro.com.au') ? '.alfiepro.com.au' : window.location.hostname;
              document.cookie = `stripe_oauth_token=; path=/; domain=${domain}; max-age=0`;
              document.cookie = `stripe_oauth_club_id=; path=/; domain=${domain}; max-age=0`;
              document.cookie = `stripe_oauth_timestamp=; path=/; domain=${domain}; max-age=0`;
            }
          } else {
            console.error('❌ No stored OAuth token found in any storage');
          }
        } else {
          console.log('✅ Using Supabase session');
        }

        if (!session) {
          console.error('No session found after all attempts');
          setStatus('Authentication required - redirecting to login...');
          setTimeout(() => {
            navigate('/login?redirect=/membership?tab=payment-settings');
          }, 2000);
          return;
        }

        setStatus('Connecting to Stripe...');

        // Prepare headers with session token
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        };

        console.log('Calling connect-stripe edge function...', {
          hasSession: !!session,
          hasToken: !!session?.access_token
        });

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-stripe`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              code,
              state,
              club_id: state,
            }),
          }
        );

        const result = await response.json();
        console.log('Stripe connection result:', result);

        if (response.ok && result.success) {
          // Clean up stored session data from all storage locations
          localStorage.removeItem('stripe_oauth_token');
          localStorage.removeItem('stripe_oauth_club_id');
          localStorage.removeItem('stripe_oauth_timestamp');
          sessionStorage.removeItem('stripe_oauth_token');
          sessionStorage.removeItem('stripe_oauth_club_id');
          sessionStorage.removeItem('stripe_oauth_timestamp');
          // Clear cookies
          const domain = window.location.hostname.includes('alfiepro.com.au') ? '.alfiepro.com.au' : window.location.hostname;
          document.cookie = `stripe_oauth_token=; path=/; domain=${domain}; max-age=0`;
          document.cookie = `stripe_oauth_club_id=; path=/; domain=${domain}; max-age=0`;
          document.cookie = `stripe_oauth_timestamp=; path=/; domain=${domain}; max-age=0`;
          console.log('🧹 Cleaned up stored OAuth session data from all storage locations');

          setStatus('Success! Redirecting...');
          // Use window.location to force a full page reload and restore Supabase connection
          setTimeout(() => {
            window.location.replace('/membership?tab=payment-settings&stripe_connected=true');
          }, 1000);
        } else {
          throw new Error(result.error || 'Failed to connect Stripe account');
        }
      } catch (err: any) {
        console.error('Error processing Stripe callback:', err);
        setStatus('Error: ' + err.message);
        setTimeout(() => {
          navigate('/membership?tab=payment-settings&stripe_error=' + encodeURIComponent(err.message));
        }, 2000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-6 relative">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
        <p className="text-white text-xl font-semibold mb-2">{status}</p>
        <p className="text-slate-400">Please wait while we complete the setup...</p>
      </div>
    </div>
  );
}

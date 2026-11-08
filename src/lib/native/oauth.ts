import { Browser } from '@capacitor/browser';
import { supabase } from '../../utils/supabase';
import { isNative, isIOS, NATIVE_AUTH_CALLBACK } from './platform';

type OAuthOptions = {
  /** Where to land after sign-in on the web (path on this origin). */
  webRedirectPath?: string;
  queryParams?: Record<string, string>;
};

/**
 * Google (and other OAuth) sign-in that works on web and in the native apps.
 * Web: the normal full-page redirect. Native: the provider opens in the system browser
 * sheet and returns through alfiepro://auth/callback, handled in bootstrap.ts.
 */
export async function signInWithOAuthProvider(provider: 'google', opts: OAuthOptions = {}) {
  if (!isNative) {
    return supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${opts.webRedirectPath ?? '/'}`,
        queryParams: opts.queryParams,
      },
    });
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: NATIVE_AUTH_CALLBACK,
      skipBrowserRedirect: true,
      queryParams: opts.queryParams,
    },
  });
  if (error || !data?.url) return { data, error };
  await Browser.open({ url: data.url, presentationStyle: 'popover' });
  return { data, error: null };
}

/** Finishes a native OAuth sign-in from the alfiepro://auth/callback deep link. */
export async function completeNativeOAuth(params: URLSearchParams): Promise<{ error: string | null }> {
  try { await Browser.close(); } catch { /* sheet already closed */ }
  const errorDescription = params.get('error_description') || params.get('error');
  if (errorDescription) return { error: errorDescription };
  const code = params.get('code');
  if (!code) return { error: 'Sign-in was cancelled.' };
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return { error: error?.message ?? null };
}

/**
 * Sign in with Apple (iOS). The live Expo app offers it, and Apple requires it alongside
 * Google sign-in (guideline 4.8). Uses Supabase's ID-token flow with a hashed nonce.
 */
export async function signInWithAppleNative() {
  if (!isIOS) throw new Error('Sign in with Apple is only available in the iOS app.');
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');

  const rawNonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
  const hashedNonce = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

  const result = await SignInWithApple.authorize({
    clientId: 'com.b2zdigital.alfiepro',
    redirectURI: NATIVE_AUTH_CALLBACK,
    scopes: 'email name',
    nonce: hashedNonce,
  });

  const idToken = result.response.identityToken;
  if (!idToken) throw new Error('Apple did not return an identity token.');

  return supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken, nonce: rawNonce });
}

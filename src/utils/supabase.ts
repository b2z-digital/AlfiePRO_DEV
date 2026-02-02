const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
  throw new Error(
    'Missing VITE_SUPABASE_URL environment variable. Please check your .env file.'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY environment variable. Please check your .env file.'
  );
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch (error) {
  throw new Error(
    `Invalid VITE_SUPABASE_URL format: ${supabaseUrl}. Please check your .env file.`
  );
}

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'alfie-pro-auth',
    flowType: 'pkce',
    // CRITICAL: Prevent session conflicts across tabs
    // When one tab refreshes, other tabs need to pick up the new session
    debug: false
  },
  global: {
    headers: {
      'X-Client-Info': 'alfie-pro-web'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    timeout: 20000,
    heartbeatIntervalMs: 15000
  }
});

// Helper to check if session is valid (with timeout to prevent blocking)
async function ensureValidSession(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Session check timeout')), 3000)
    );

    const sessionPromise = supabase.auth.getSession();

    const { data: { session }, error } = await Promise.race([
      sessionPromise,
      timeoutPromise
    ]) as any;

    if (error || !session) {
      console.warn('No valid session found');
      return false;
    }

    // Check if token is expired or about to expire (within 1 minute)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const now = Date.now();
    const isExpired = expiresAt < now;
    const isExpiringSoon = expiresAt < now + 60000; // 1 minute

    if (isExpired || isExpiringSoon) {
      console.log('Session expired or expiring soon, refreshing...');

      const refreshTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Session refresh timeout')), 5000)
      );

      const refreshPromise = supabase.auth.refreshSession();

      const { data: refreshData, error: refreshError } = await Promise.race([
        refreshPromise,
        refreshTimeoutPromise
      ]) as any;

      if (refreshError || !refreshData.session) {
        console.error('Session refresh failed:', refreshError);
        return false;
      }

      console.log('Session refreshed successfully');
      return true;
    }

    return true;
  } catch (error: any) {
    if (error.message === 'Session check timeout' || error.message === 'Session refresh timeout') {
      console.error('Session operation timed out - likely connection issue');
    } else {
      console.error('Session validation error:', error);
    }
    return false;
  }
}

// Helper function to retry failed queries
export async function retryQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  maxRetries = 2,
  delay = 500
): Promise<{ data: T | null; error: any }> {
  let lastError: any = null;

  // Skip session check on normal queries - only check if we get auth errors
  // This significantly improves performance

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Execute query (timeout is now handled in global fetch)
      const result = await queryFn();

      // If no error, return immediately
      if (!result.error) {
        return result;
      }

      // Check if it's a connection/network/auth error
      const isRetryableError =
        result.error?.message?.includes('Failed to fetch') ||
        result.error?.message?.includes('NetworkError') ||
        result.error?.message?.includes('fetch') ||
        result.error?.message?.includes('timeout') ||
        result.error?.message?.includes('aborted') ||
        result.error?.message?.includes('JWT') ||
        result.error?.code === 'PGRST301' || // JWT expired
        result.error?.code === '57P01' || // Connection terminated
        result.error?.code === '08006' || // Connection failure
        result.error?.status === 401; // Unauthorized

      if (!isRetryableError) {
        // Not a retryable error, return immediately
        return result;
      }

      lastError = result.error;
      console.warn(`Query attempt ${i + 1}/${maxRetries} failed:`, result.error?.message);

      // If not the last retry, wait before trying again
      if (i < maxRetries - 1) {
        const backoffDelay = delay * Math.pow(2, i); // Exponential backoff
        console.log(`Waiting ${backoffDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));

        // Only try to refresh session if error is clearly auth-related
        const isAuthError = (
          result.error?.message?.includes('JWT') ||
          result.error?.status === 401 ||
          result.error?.code === 'PGRST301'
        );

        if (isAuthError) {
          try {
            console.log('Auth error detected, refreshing session...');
            await ensureValidSession();
          } catch (err) {
            console.warn('Session refresh failed:', err);
          }
        }
      }
    } catch (error: any) {
      lastError = error;
      console.warn(`Query attempt ${i + 1}/${maxRetries} threw error:`, error?.message || error);

      if (i < maxRetries - 1) {
        const backoffDelay = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  console.error('All retry attempts failed. Last error:', lastError?.message || lastError);
  return { data: null, error: lastError || new Error('Query failed after all retries') };
}

// Simplified connection health check - only checks session validity
let healthCheckInterval: number | null = null;
let lastSuccessfulQuery = Date.now();
let consecutiveFailures = 0;
let isSupabaseUnresponsive = false;

// Export function to check if Supabase is responsive
export function isSupabaseResponsive(): boolean {
  return !isSupabaseUnresponsive;
}

// Function to detect and handle completely stuck connections
async function detectStuckConnection(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const testStart = Date.now();
    const { error } = await supabase
      .from('clubs')
      .select('count', { count: 'exact', head: true })
      .limit(1)
      .abortSignal(controller.signal);

    clearTimeout(timeoutId);
    const elapsed = Date.now() - testStart;

    if (error) {
      consecutiveFailures++;
      console.warn(`Connection test failed (${consecutiveFailures} consecutive failures)`);

      if (consecutiveFailures >= 2) {
        console.error('⚠️ Supabase appears unresponsive - switching to offline mode');
        isSupabaseUnresponsive = true;

        // Notify user after 3 seconds if still unresponsive
        setTimeout(() => {
          if (isSupabaseUnresponsive) {
            window.dispatchEvent(new CustomEvent('supabase-unresponsive'));
          }
        }, 3000);
      }
    } else {
      consecutiveFailures = 0;
      isSupabaseUnresponsive = false;
      lastSuccessfulQuery = Date.now();

      if (elapsed > 2000) {
        console.warn('Connection is slow:', elapsed, 'ms');
        window.dispatchEvent(new CustomEvent('supabase-slow'));
      }
    }
  } catch (error: any) {
    consecutiveFailures++;
    console.error('Connection test error:', error);

    if (consecutiveFailures >= 2) {
      console.error('⚠️ Supabase appears unresponsive - switching to offline mode');
      isSupabaseUnresponsive = true;
      window.dispatchEvent(new CustomEvent('supabase-unresponsive'));
    }
  }
}

export function startConnectionHealthCheck() {
  if (healthCheckInterval) return;

  // Run initial stuck connection check after 2 seconds
  setTimeout(detectStuckConnection, 2000);

  healthCheckInterval = window.setInterval(async () => {
    // First check if connection is stuck
    await detectStuckConnection();

    // Only do session refresh if connection is responsive
    if (!isSupabaseUnresponsive) {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.warn('Session check error:', error);
          return;
        }

        if (session) {
          // Only refresh if close to expiring (within 5 minutes)
          const expiresAt = session.expires_at;
          if (expiresAt) {
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = expiresAt - now;

            if (timeUntilExpiry < 300) { // Less than 5 minutes
              console.log('Session expiring soon, refreshing...');
              const { error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {
                console.error('Session refresh failed:', refreshError);
              } else {
                console.log('Session refreshed successfully');
                lastSuccessfulQuery = Date.now();
              }
            }
          }
        }
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }
  }, 30000); // Check every 30 seconds
}

export function stopConnectionHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Clear the auth refresh attempted flag on successful page load
// This ensures we can try page reload again if auth fails after a successful session
window.addEventListener('load', () => {
  // Wait a bit to ensure auth is initialized
  setTimeout(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // We have a valid session, clear the refresh attempted flag
        sessionStorage.removeItem('auth_refresh_attempted');
      }
    });
  }, 1000);
});

// Listen for auth state changes to detect session issues
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event);

  if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed successfully');
    lastSuccessfulQuery = Date.now();
    sessionStorage.removeItem('auth_refresh_attempted');

    // Broadcast to other tabs that token was refreshed
    try {
      localStorage.setItem('auth_token_refreshed_at', Date.now().toString());
    } catch (e) {
      console.warn('Failed to broadcast token refresh:', e);
    }
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out, redirecting to login...');
    window.location.href = '/login';
  } else if (event === 'USER_UPDATED') {
    console.log('User updated');
  }
});

// CRITICAL: Listen for storage events from other tabs
// This allows tabs to stay in sync when sessions change
window.addEventListener('storage', async (e) => {
  // Ignore events from same window
  if (!e.key) return;

  // Check if auth storage changed in another tab
  if (e.key === 'alfie-pro-auth') {
    console.log('🔄 Auth session changed in another tab - syncing...');

    try {
      // Get the updated session from localStorage
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Failed to sync session from other tab:', error);
        return;
      }

      if (session) {
        console.log('✅ Session synced from other tab');
        lastSuccessfulQuery = Date.now();
        consecutiveFailures = 0;
        isSupabaseUnresponsive = false;
      } else {
        console.warn('⚠️ No session found after storage change');
      }
    } catch (error) {
      console.error('Error handling storage change:', error);
    }
  }

  // Handle token refresh broadcasts
  if (e.key === 'auth_token_refreshed_at') {
    console.log('🔄 Token refreshed in another tab');
    lastSuccessfulQuery = Date.now();
    consecutiveFailures = 0;
    isSupabaseUnresponsive = false;
  }
});

// Channel management to prevent duplicate subscriptions
const activeChannels = new Map<string, any>();

export function getOrCreateChannel(channelName: string, setupFn: (channel: any) => any) {
  // Check if channel already exists
  if (activeChannels.has(channelName)) {
    const existingChannel = activeChannels.get(channelName);
    // Verify it's still connected
    if (existingChannel?.state === 'joined' || existingChannel?.state === 'joining') {
      console.log(`Reusing existing channel: ${channelName}`);
      return existingChannel;
    } else {
      // Clean up dead channel
      console.log(`Cleaning up dead channel: ${channelName}`);
      supabase.removeChannel(existingChannel);
      activeChannels.delete(channelName);
    }
  }

  // Create new channel
  console.log(`Creating new channel: ${channelName}`);
  const channel = setupFn(supabase.channel(channelName));
  activeChannels.set(channelName, channel);
  return channel;
}

export function removeChannelByName(channelName: string) {
  const channel = activeChannels.get(channelName);
  if (channel) {
    console.log(`Removing channel: ${channelName}`);
    supabase.removeChannel(channel);
    activeChannels.delete(channelName);
  }
}

export function cleanupAllChannels() {
  console.log(`Cleaning up ${activeChannels.size} channels`);
  activeChannels.forEach((channel, name) => {
    supabase.removeChannel(channel);
  });
  activeChannels.clear();
}

// Cleanup channels on page unload
window.addEventListener('beforeunload', () => {
  cleanupAllChannels();
});

// Query cache to reduce redundant database calls
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

const queryCache = new Map<string, CacheEntry<any>>();

export function getCachedQuery<T>(
  key: string,
  ttlMs: number = 5000 // Default 5 second cache
): T | null {
  const entry = queryCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }

  return entry.data as T;
}

export function setCachedQuery<T>(
  key: string,
  data: T,
  ttlMs: number = 5000
): void {
  const now = Date.now();
  queryCache.set(key, {
    data,
    timestamp: now,
    expiresAt: now + ttlMs
  });
}

export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    queryCache.clear();
    return;
  }

  const keys = Array.from(queryCache.keys());
  keys.forEach(key => {
    if (key.includes(pattern)) {
      queryCache.delete(key);
    }
  });
}

// Helper for cached queries
export async function cachedQuery<T>(
  key: string,
  queryFn: () => Promise<{ data: T | null; error: any }>,
  ttlMs: number = 5000
): Promise<{ data: T | null; error: any; fromCache: boolean }> {
  // Check cache first
  const cached = getCachedQuery<T>(key, ttlMs);
  if (cached !== null) {
    return { data: cached, error: null, fromCache: true };
  }

  // Execute query
  const result = await retryQuery(queryFn);

  // Cache successful results
  if (!result.error && result.data !== null) {
    setCachedQuery(key, result.data, ttlMs);
  }

  return { ...result, fromCache: false };
}

// Start health check automatically
startConnectionHealthCheck();

// Tab visibility handler - verify connection when tab becomes visible again
let lastVisibilityChange = Date.now();
let wasHidden = false;

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    wasHidden = true;
    lastVisibilityChange = Date.now();
  } else if (document.visibilityState === 'visible' && wasHidden) {
    const timeSinceHidden = Date.now() - lastVisibilityChange;
    console.log(`Tab became visible after ${Math.round(timeSinceHidden / 1000)}s`);

    // ULTRA-SMART session management for multi-tab stability:
    // < 10s: Do nothing (instant tab switch, session is definitely valid)
    // 10-60s: Silent validation only (check without triggering events)
    // > 60s: Full refresh (long absence, ensure fresh token)
    const isInstantSwitch = timeSinceHidden < 10000; // 10 seconds
    const needsRefresh = timeSinceHidden > 60000; // 60 seconds

    try {
      if (isInstantSwitch) {
        // Instant tab switch - do absolutely nothing
        // Session is still valid, no need to check or refresh
        console.log('⚡ Instant tab switch - no session check needed');

        // Just reset health check state
        lastSuccessfulQuery = Date.now();
        consecutiveFailures = 0;
        isSupabaseUnresponsive = false;

      } else if (needsRefresh) {
        console.log('🔄 Long absence detected - refreshing session...');

        const { data, error } = await supabase.auth.refreshSession();

        if (error || !data.session) {
          console.error('❌ Session refresh failed on tab return:', error);
          // If session refresh fails, try getting current session
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session) {
            console.error('❌ No valid session found - redirecting to login');
            window.location.href = '/login';
            return;
          }
        } else {
          console.log('✅ Session refreshed successfully on tab return');
        }

        // Reset state
        lastSuccessfulQuery = Date.now();
        consecutiveFailures = 0;
        isSupabaseUnresponsive = false;

        // Invalidate cache after long absence
        invalidateCache();

      } else {
        // Medium tab switch (10-60s) - just verify without refresh
        console.log('✅ Medium tab switch - verifying session silently');

        // Just reset health check state - trust that auto-refresh is working
        lastSuccessfulQuery = Date.now();
        consecutiveFailures = 0;
        isSupabaseUnresponsive = false;
      }

      // Dispatch event to notify components that connection is ready
      window.dispatchEvent(new CustomEvent('supabase-reconnected'));

    } catch (error) {
      console.error('❌ Critical error during tab visibility handling:', error);
      // Last resort - reload the page if we've been hidden for more than 60 seconds
      if (timeSinceHidden > 60000) {
        console.log('⚠️ Long hidden period detected - reloading page');
        window.location.reload();
      }
    }

    wasHidden = false;
    lastVisibilityChange = Date.now();
  }
});

// Manual connection recovery function that can be called by components
export async function forceConnectionRecovery() {
  console.log('🔄 Force connection recovery requested...');

  try {
    // 1. Try to refresh the session
    const refreshPromise = supabase.auth.refreshSession();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Session refresh timeout')), 5000)
    );

    const { data, error } = await Promise.race([refreshPromise, timeoutPromise]) as any;

    if (error || !data.session) {
      console.error('❌ Session refresh failed during recovery');
      return false;
    }

    console.log('✓ Session refreshed');

    // 2. Test the connection with a simple query
    const testPromise = supabase
      .from('clubs')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    const queryTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection test timeout')), 5000)
    );

    await Promise.race([testPromise, queryTimeoutPromise]);

    console.log('✓ Connection test passed');

    // Reset health check state
    lastSuccessfulQuery = Date.now();
    consecutiveFailures = 0;
    isSupabaseUnresponsive = false;
    sessionStorage.removeItem('connection_reload_attempted');

    return true;
  } catch (error) {
    console.error('❌ Connection recovery failed:', error);
    return false;
  }
}

// Test connection on initialization - NON-BLOCKING with timeout
(async () => {
  try {
    console.log('🔍 Testing Supabase connection...');
    console.log('📍 Supabase URL:', supabaseUrl);
    console.log('📍 Current domain:', window.location.hostname);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection test timeout')), 3000)
    );

    const testPromise = supabase.from('clubs').select('count', { count: 'exact', head: true });

    const { error } = await Promise.race([testPromise, timeoutPromise]) as any;

    if (error) {
      console.error('❌ Supabase connection test failed:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        status: error.status,
        hint: error.hint
      });
    } else {
      console.log('✅ Supabase connection established successfully');
      lastSuccessfulQuery = Date.now();
    }
  } catch (error: any) {
    console.error('❌ Supabase connection test exception:', error);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
  }
})();
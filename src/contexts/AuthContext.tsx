import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import { getUserClubs } from '../utils/auth';
import { Club } from '../types/club';
import { UserSubscription } from '../types/subscription';

interface UserClub {
  id: string;
  clubId: string;
  role: 'admin' | 'editor' | 'member' | 'super_admin' | 'state_admin' | 'national_admin';
  club?: Club;
}

interface AuthUser extends User {
  firstName?: string;
  lastName?: string;
}

interface CurrentOrganization {
  id: string;
  type: 'club' | 'state' | 'national';
  name: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  userClubs: UserClub[];
  currentClub: UserClub | null;
  currentOrganization: CurrentOrganization | null;
  loading: boolean;
  clubsLoaded: boolean;
  isLoggingOut: boolean;
  isSwitchingClub: boolean;
  isSuperAdmin: boolean;
  isNationalOrgAdmin: boolean;
  isStateOrgAdmin: boolean;
  userSubscription: UserSubscription | null;
  onboardingCompleted: boolean;
  hasPendingApplication: boolean;
  hasPendingClubApplication: boolean;
  signOut: () => Promise<void>;
  refreshUserClubs: () => Promise<UserClub[]>;
  setCurrentClub: (club: UserClub | null) => void;
  setCurrentOrganization: (org: CurrentOrganization | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper function to validate UUID
const isValidUUID = (uuid: string): boolean => {
  return UUID_REGEX.test(uuid);
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userClubs, setUserClubs] = useState<UserClub[]>([]);
  const [currentClub, setCurrentClub] = useState<UserClub | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<CurrentOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [clubsLoaded, setClubsLoaded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Check if we're in the middle of a club switch (persists across reload)
  const [isSwitchingClub, setIsSwitchingClub] = useState(() => {
    return sessionStorage.getItem('switching_club') === 'true';
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isNationalOrgAdmin, setIsNationalOrgAdmin] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [hasPendingApplication, setHasPendingApplication] = useState(false);
  const [hasPendingClubApplication, setHasPendingClubApplication] = useState(false);
  const [isStateOrgAdmin, setIsStateOrgAdmin] = useState(false);
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // CRITICAL: Track current user ID with ref to prevent duplicate SIGNED_IN processing
  // State updates are async, so we need a synchronous way to check current user
  const currentUserIdRef = useRef<string | null>(null);

  const refreshUserClubs = async (userId?: string) => {
    // Use provided userId or fall back to current user state
    const effectiveUserId = userId || user?.id;

    if (!effectiveUserId) {
      setUserClubs([]);
      setIsSuperAdmin(false);
      setIsNationalOrgAdmin(false);
      setIsStateOrgAdmin(false);
      return [];
    }

    try {
      // Check user metadata for super admin status first (this is the primary way)
      const { data: { user: userData } } = await supabase.auth.getUser();
      const isSuperAdminFromMetadata = userData?.user_metadata?.is_super_admin === true;

      // Execute all role checks and subscription fetch in parallel for better performance
      const [superAdminResult, nationalAdminResult, stateAdminResult, subscriptionResult] = await Promise.all([
        supabase.rpc('get_user_club_roles', { p_user_id: effectiveUserId }),
        supabase
          .from('user_national_associations')
          .select('role')
          .eq('user_id', effectiveUserId)
          .eq('role', 'national_admin')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('user_state_associations')
          .select('role')
          .eq('user_id', effectiveUserId)
          .eq('role', 'state_admin')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', effectiveUserId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      const userClubRoles = superAdminResult.data || [];
      const userIsSuperAdmin = isSuperAdminFromMetadata || (Array.isArray(userClubRoles) && userClubRoles.some((r: any) => r.role === 'super_admin'));
      setIsSuperAdmin(userIsSuperAdmin);

      const userIsNationalAdmin = nationalAdminResult.data?.role === 'national_admin';
      setIsNationalOrgAdmin(userIsNationalAdmin);

      const userIsStateAdmin = stateAdminResult.data?.role === 'state_admin';
      setIsStateOrgAdmin(userIsStateAdmin);

      if (!subscriptionResult.error && subscriptionResult.data) {
        setUserSubscription(subscriptionResult.data);
      } else {
        setUserSubscription(null);
      }

      let fetchedClubs: any[] = [];

      if (userIsSuperAdmin) {
        // If super admin, fetch all clubs
        const { data: allClubsData, error: allClubsError } = await supabase
          .from('clubs')
          .select('id, name, abbreviation, logo')
          .order('name');
        
        if (allClubsError) throw allClubsError;
        
        // Map all clubs to UserClub format, assuming 'admin' role for super admin access
        fetchedClubs = allClubsData.map(club => ({
          id: `super_admin_${club.id}`, // Unique ID for super admin's view
          clubId: club.id,
          role: 'admin', // Super admin acts as admin for all clubs
          club: club
        }));
      } else {
        // Get user clubs with simplified approach to avoid RLS issues
        const userClubsData = await getUserClubs();
        
        // Get club details for each club
        const clubDetailsPromises = userClubsData.map(async (uc: any) => {
          try {
            // Validate club_id before making the request
            if (!uc.club_id || !isValidUUID(uc.club_id)) {
              console.error(`Invalid club_id: ${uc.club_id}`);
              return {
                id: uc.id,
                clubId: uc.club_id || '',
                role: uc.role
              };
            }

            const { data: clubData, error } = await supabase
              .from('clubs')
              .select('id, name, abbreviation, logo')
              .eq('id', uc.club_id)
              .single();
            
            if (error) throw error;
            
            return {
              id: uc.id,
              clubId: uc.club_id,
              role: uc.role,
              club: clubData
            };
          } catch (error) {
            console.error(`Error fetching club details for ${uc.club_id}:`, error);
            return {
              id: uc.id,
              clubId: uc.club_id || '',
              role: uc.role
            };
          }
        });
        
        fetchedClubs = await Promise.all(clubDetailsPromises);
      }
      
      // Filter out clubs with invalid IDs
      const validClubs = fetchedClubs.filter(club => 
        club.clubId && isValidUUID(club.clubId)
      );
      
      // Check for organization admin roles
      const hasNationalAdmin = validClubs.some(club => 
        club.role === 'national_admin' || 
        (club.club?.organization_type === 'national_association' && (club.role === 'admin' || club.role === 'super_admin'))
      );
      const hasStateAdmin = validClubs.some(club => 
        club.role === 'state_admin' || 
        (club.club?.organization_type === 'state_association' && (club.role === 'admin' || club.role === 'super_admin'))
      );
      
      setIsNationalOrgAdmin(hasNationalAdmin);
      setIsStateOrgAdmin(hasStateAdmin);
      
      console.log('Fetched user clubs with details:', validClubs);
      setUserClubs(validClubs);
      setClubsLoaded(true);

      // Clear club switching state once clubs are loaded
      if (sessionStorage.getItem('switching_club') === 'true') {
        console.log('✅ Club switch completed');
        sessionStorage.removeItem('switching_club');
        sessionStorage.removeItem('switching_to_club_name');
        setIsSwitchingClub(false);
      }

      // Set current club if none is selected or restore from localStorage
      // Get user's default club preference
      let defaultClubId: string | null = null;
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('default_club_id')
          .eq('id', effectiveUserId)
          .single();

        defaultClubId = profileData?.default_club_id;
      } catch (err) {
        console.error('Error fetching default club:', err);
      }

      // Priority 1: Use default club if set
      if (defaultClubId && isValidUUID(defaultClubId)) {
        const defaultClub = validClubs.find(club => club.clubId === defaultClubId);
        if (defaultClub) {
          setCurrentClub(defaultClub);
          localStorage.setItem('currentClubId', defaultClub.clubId);
          return validClubs;
        }
      }

      // Priority 2: Use previously selected club from localStorage
      const savedClubId = localStorage.getItem('currentClubId');

      if (savedClubId && isValidUUID(savedClubId)) {
        const savedClub = validClubs.find(club => club.clubId === savedClubId);
        if (savedClub) {
          setCurrentClub(savedClub);
          return validClubs;
        }
      }

      // Clear invalid club ID from localStorage
      if (savedClubId && !isValidUUID(savedClubId)) {
        localStorage.removeItem('currentClubId');
      }

      // Priority 3: Default to first club
      if (validClubs.length > 0 && !currentClub) {
        setCurrentClub(validClubs[0]);
        localStorage.setItem('currentClubId', validClubs[0].clubId);
      }

      return validClubs;
    } catch (error) {
      console.error('Error in refreshUserClubs:', error);
      setUserClubs([]);
      setIsSuperAdmin(false);
      setIsNationalOrgAdmin(false);
      setIsStateOrgAdmin(false);
      setUserSubscription(null);
      return [];
    }
  };

  const handleSetCurrentClub = (club: UserClub | null) => {
    const previousClub = currentClub;

    console.log('🏢 handleSetCurrentClub called');
    console.log('  Previous club:', previousClub?.clubId, previousClub?.club?.name);
    console.log('  New club:', club?.clubId, club?.club?.name);
    console.log('  Is initial load:', isInitialLoad);
    console.log('  Stack trace:', new Error().stack);

    // Only reload if we're actually CHANGING clubs AND it's not the initial load
    const isActualChange = !isInitialLoad && previousClub?.clubId !== club?.clubId && previousClub !== null;

    setCurrentClub(club);
    if (club && club.clubId && isValidUUID(club.clubId)) {
      localStorage.setItem('currentClubId', club.clubId);

      if (isActualChange) {
        console.log('🔄 Club changed by user - reloading page');

        // Set sessionStorage flag to persist across reload
        sessionStorage.setItem('switching_club', 'true');
        sessionStorage.setItem('switching_to_club_name', club.club?.name || 'club');

        // Show loading overlay before reload
        setIsSwitchingClub(true);

        // Clear any cached data from previous club
        localStorage.removeItem(CURRENT_EVENT_KEY);

        // Slightly longer delay to ensure loading overlay renders
        setTimeout(() => {
          // Force reload to refresh all data for the new club
          window.location.reload();
        }, 150);
      } else {
        console.log('✅ No reload needed (initial load or same club)');
      }

      // Mark that initial load is complete
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    } else {
      localStorage.removeItem('currentClubId');
    }
  };

  const handleSetCurrentOrganization = (org: CurrentOrganization | null) => {
    setCurrentOrganization(org);
    if (org) {
      localStorage.setItem('currentOrganization', JSON.stringify(org));
    } else {
      localStorage.removeItem('currentOrganization');
    }
  };

  const signOut = async () => {
    try {
      console.log('Signing out...');
      setIsLoggingOut(true);

      // Sign out from Supabase first
      await supabase.auth.signOut();

      // Clear local storage items
      localStorage.removeItem('currentClubId');
      localStorage.removeItem('currentOrganization');
      localStorage.removeItem(CURRENT_EVENT_KEY);
      sessionStorage.clear();

      // Force immediate redirect to login page to avoid white screen
      window.location.href = '/login';
    } catch (error) {
      console.error('Error in signOut function:', error);

      // Force redirect to login page even if there's an error
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    let mounted = true;

    // Set a maximum timeout for loading state (10 seconds to account for slow connections)
    const loadingTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('⚠️ Auth loading timeout reached, setting loading to false');
        setLoading(false);
      }
    }, 10000);

    const initializeAuth = async () => {
      try {
        // Get initial session with timeout protection
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null }, error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), 8000)
        );

        let result: any;
        try {
          result = await Promise.race([sessionPromise, timeoutPromise]);
        } catch (timeoutError: any) {
          console.error('Error initializing auth:', timeoutError);

          // FALLBACK: Try to read session directly from localStorage
          console.log('⚠️ Attempting to read session from localStorage fallback...');
          try {
            const storedSession = localStorage.getItem('alfie-pro-auth');
            if (storedSession) {
              const parsedSession = JSON.parse(storedSession);
              console.log('📦 Found stored session:', { hasUser: !!parsedSession?.currentSession?.user });

              if (parsedSession?.currentSession?.user) {
                result = { data: { session: parsedSession.currentSession }, error: null };
                console.log('✅ Using stored session as fallback');
              } else {
                result = { data: { session: null }, error: timeoutError };
              }
            } else {
              result = { data: { session: null }, error: timeoutError };
            }
          } catch (parseError) {
            console.error('Failed to parse stored session:', parseError);
            result = { data: { session: null }, error: timeoutError };
          }
        }

        const { data: { session }, error } = result;

        if (error && !session) {
          console.error('No valid session found');
        }

        if (mounted && session?.user) {
          const { data: { user: validatedUser }, error: validateError } = await supabase.auth.getUser();
          if (validateError || !validatedUser) {
            console.warn('Session exists but server validation failed, clearing session');
            await supabase.auth.signOut().catch(() => {});
            localStorage.removeItem('alfie-pro-auth');
            if (mounted) {
              currentUserIdRef.current = null;
              setUser(null);
              setOnboardingCompleted(false);
              clearTimeout(loadingTimeout);
              setLoading(false);
            }
            return;
          }

          const firstName = validatedUser.user_metadata?.first_name;
          const lastName = validatedUser.user_metadata?.last_name;

          const enhancedUser: AuthUser = {
            ...validatedUser,
            firstName,
            lastName
          };

          const previousUserId = currentUserIdRef.current;
          currentUserIdRef.current = validatedUser.id;

          if (previousUserId && previousUserId !== validatedUser.id) {
            localStorage.removeItem('currentClubId');
            localStorage.removeItem('currentOrganization');
          }

          setUser(enhancedUser);

          const { data: profileData } = await supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('id', validatedUser.id)
            .maybeSingle();

          setOnboardingCompleted(profileData?.onboarding_completed || false);

          const { data: pendingApp } = await supabase
            .from('membership_applications')
            .select('id, status')
            .eq('user_id', validatedUser.id)
            .eq('is_draft', false)
            .eq('status', 'pending')
            .limit(1)
            .maybeSingle();

          setHasPendingApplication(!!pendingApp);

          const { data: pendingClub } = await supabase
            .from('clubs')
            .select('id')
            .eq('registered_by_user_id', validatedUser.id)
            .eq('approval_status', 'pending_approval')
            .limit(1)
            .maybeSingle();

          setHasPendingClubApplication(!!pendingClub);

          await refreshUserClubs(validatedUser.id);

          // Restore currentOrganization from localStorage if exists
          try {
            const storedOrg = localStorage.getItem('currentOrganization');
            if (storedOrg) {
              const parsedOrg = JSON.parse(storedOrg);
              setCurrentOrganization(parsedOrg);
            }
          } catch (err) {
            console.error('Error restoring currentOrganization:', err);
          }

          clearTimeout(loadingTimeout);
          setLoading(false);
        } else if (mounted) {
          currentUserIdRef.current = null; // Clear ref when no session
          setUser(null);
          setOnboardingCompleted(false);
          clearTimeout(loadingTimeout);
          setLoading(false);
        }

        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('Auth state changed:', event, session?.user?.email);

            if (event === 'TOKEN_REFRESHED') {
              return;
            }

            if (event === 'PASSWORD_RECOVERY') {
              return;
            }

            const isOnResetPage = window.location.pathname === '/reset-password';
            if (isOnResetPage && (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED')) {
              return;
            }

            // Handle signed out events
            if (event === 'SIGNED_OUT') {
              console.log('User signed out, clearing state');
              if (mounted) {
                currentUserIdRef.current = null; // Clear ref
                setUser(null);
                setUserClubs([]);
                setCurrentClub(null);
                setIsSuperAdmin(false);
                setIsNationalOrgAdmin(false);
                setIsStateOrgAdmin(false);
                setUserSubscription(null);
                setOnboardingCompleted(false);
                setHasPendingApplication(false);
                setHasPendingClubApplication(false);
              }
              return;
            }

            // CRITICAL: Ignore SIGNED_IN events if user is already authenticated
            // Use ref instead of state to avoid async state update issues
            if (event === 'SIGNED_IN' && currentUserIdRef.current === session?.user?.id) {
              console.log('SIGNED_IN event for already authenticated user - ignoring');
              return;
            }

            if (mounted && session?.user) {
              // Extract first name and last name from user metadata
              const firstName = session.user.user_metadata?.first_name;
              const lastName = session.user.user_metadata?.last_name;

              // Create enhanced user object with first and last name
              const enhancedUser: AuthUser = {
                ...session.user,
                firstName,
                lastName
              };

              const prevUserId = currentUserIdRef.current;
              currentUserIdRef.current = session.user.id;

              if (prevUserId && prevUserId !== session.user.id) {
                localStorage.removeItem('currentClubId');
                localStorage.removeItem('currentOrganization');
              }

              setUser(enhancedUser);

              // Check onboarding status
              const { data: profileData } = await supabase
                .from('profiles')
                .select('onboarding_completed')
                .eq('id', session.user.id)
                .maybeSingle();

              setOnboardingCompleted(profileData?.onboarding_completed || false);

              // Check for pending membership application
              const { data: pendingApp } = await supabase
                .from('membership_applications')
                .select('id, status')
                .eq('user_id', session.user.id)
                .eq('is_draft', false)
                .eq('status', 'pending')
                .limit(1)
                .maybeSingle();

              setHasPendingApplication(!!pendingApp);

              // Check for pending club registration
              const { data: pendingClub } = await supabase
                .from('clubs')
                .select('id')
                .eq('registered_by_user_id', session.user.id)
                .eq('approval_status', 'pending_approval')
                .limit(1)
                .maybeSingle();

              setHasPendingClubApplication(!!pendingClub);

              // Refresh clubs with explicit user ID
              await refreshUserClubs(session.user.id);
            } else if (mounted) {
              currentUserIdRef.current = null; // Clear ref when no session
              setUser(null);
              setUserClubs([]);
              setCurrentClub(null);
              setIsSuperAdmin(false);
              setIsNationalOrgAdmin(false);
              setIsStateOrgAdmin(false);
              setUserSubscription(null);
              setOnboardingCompleted(false);
              setHasPendingApplication(false);
              setHasPendingClubApplication(false);
              localStorage.removeItem('currentClubId');
            }
          }
        );

        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          clearTimeout(loadingTimeout);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
    };
  }, []);

  // REMOVED: Refresh clubs when user changes
  // This was causing duplicate refreshes and channel thrashing
  // refreshUserClubs() is already called in onAuthStateChange
  // useEffect(() => {
  //   if (user && !loading) {
  //     refreshUserClubs();
  //   }
  // }, [user, loading]);

  // DISABLED: Page visibility session checking
  // This was causing conflicts with the supabase.ts visibility handler
  // and creating race conditions when switching between tabs
  // The supabase.ts handler now manages all session refresh logic
  // useEffect(() => {
  //   let isCheckingSession = false;
  //   const handleVisibilityChange = async () => { ... };
  //   document.addEventListener('visibilitychange', handleVisibilityChange);
  //   return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  // }, [user]);

  // Note: Proactive session refresh is handled by Supabase's autoRefreshToken
  // and the health check in supabase.ts - no need for duplicate logic here

  const impersonationOverrides = React.useMemo(() => {
    try {
      const stored = sessionStorage.getItem('impersonation_session');
      if (!stored) return null;
      const imp = JSON.parse(stored);
      if (!imp || !imp.targetMemberId) return null;

      const targetClubs: UserClub[] = (imp.targetClubs || []).map((tc: any) => ({
        id: `imp_${tc.club_id}`,
        clubId: tc.club_id,
        role: tc.role || 'member',
        club: {
          id: tc.club_id,
          name: tc.club_name,
          abbreviation: tc.club_abbreviation,
          logo: tc.club_logo,
        },
      }));

      const defaultClubId = imp.targetDefaultClubId;
      const targetCurrentClub = targetClubs.find(c => c.clubId === defaultClubId) || targetClubs[0] || null;

      return {
        userClubs: targetClubs,
        currentClub: targetCurrentClub,
        isSuperAdmin: imp.targetIsSuperAdmin === true,
        isNationalOrgAdmin: false,
        isStateOrgAdmin: false,
        onboardingCompleted: imp.targetOnboardingCompleted !== false,
      };
    } catch {
      return null;
    }
  }, []);

  const value = {
    user,
    userClubs: impersonationOverrides?.userClubs ?? userClubs,
    currentClub: impersonationOverrides?.currentClub ?? currentClub,
    currentOrganization: impersonationOverrides ? null : currentOrganization,
    loading,
    clubsLoaded,
    isLoggingOut,
    isSwitchingClub,
    isSuperAdmin: impersonationOverrides?.isSuperAdmin ?? isSuperAdmin,
    isNationalOrgAdmin: impersonationOverrides?.isNationalOrgAdmin ?? isNationalOrgAdmin,
    isStateOrgAdmin: impersonationOverrides?.isStateOrgAdmin ?? isStateOrgAdmin,
    userSubscription,
    onboardingCompleted: impersonationOverrides?.onboardingCompleted ?? onboardingCompleted,
    hasPendingApplication,
    hasPendingClubApplication,
    signOut,
    refreshUserClubs,
    setCurrentClub: handleSetCurrentClub,
    setCurrentOrganization: handleSetCurrentOrganization,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Key for current event in localStorage
const CURRENT_EVENT_KEY = 'current-event';
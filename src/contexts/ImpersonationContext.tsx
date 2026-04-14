import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '../utils/supabase';
import { ImpersonationPreloaderModal } from '../components/ImpersonationPreloaderModal';

interface ImpersonatedClub {
  club_id: string;
  role: string;
  club_name: string;
  club_abbreviation?: string;
  club_logo?: string;
}

interface ImpersonationSession {
  sessionId: string;
  targetUserId: string | null;
  targetMemberId: string;
  targetName: string;
  targetEmail: string;
  targetAvatarUrl: string | null;
  targetClubs: ImpersonatedClub[];
  targetDefaultClubId: string | null;
  targetIsSuperAdmin: boolean;
  targetOnboardingCompleted: boolean;
}

interface EffectiveProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
}

interface ImpersonationContextType {
  isImpersonating: boolean;
  session: ImpersonationSession | null;
  effectiveUserId: string | null;
  effectiveProfile: EffectiveProfile | null;
  startImpersonation: (memberId: string, reason?: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const PRELOADER_FLAG = 'impersonation_preloader_active';

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export const ImpersonationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<ImpersonationSession | null>(() => {
    try {
      const stored = sessionStorage.getItem('impersonation_session');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [showPreloader, setShowPreloader] = useState(() => {
    return sessionStorage.getItem(PRELOADER_FLAG) === 'true';
  });

  const [preloaderTarget, setPreloaderTarget] = useState<{
    name: string;
    avatarUrl: string | null;
    clubName?: string;
  } | null>(() => {
    if (sessionStorage.getItem(PRELOADER_FLAG) === 'true') {
      try {
        const stored = sessionStorage.getItem('impersonation_session');
        if (stored) {
          const s = JSON.parse(stored);
          const club = s.targetClubs?.find((c: ImpersonatedClub) => c.club_id === s.targetDefaultClubId) || s.targetClubs?.[0];
          return {
            name: s.targetName || '',
            avatarUrl: s.targetAvatarUrl || null,
            clubName: club?.club_name
          };
        }
      } catch { /* ignore */ }
    }
    return null;
  });

  useEffect(() => {
    if (showPreloader) {
      const timer = setTimeout(() => {
        sessionStorage.removeItem(PRELOADER_FLAG);
        setShowPreloader(false);
        setPreloaderTarget(null);
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      const htmlPreloader = document.getElementById('impersonation-preloader');
      if (htmlPreloader) {
        htmlPreloader.style.display = 'none';
      }
    }
  }, [showPreloader]);

  const startImpersonation = useCallback(async (memberId: string, reason?: string) => {
    const { data, error } = await supabase.rpc('start_impersonation_session', {
      p_target_member_id: memberId,
      p_reason: reason || ''
    });

    if (error) throw error;

    const newSession: ImpersonationSession = {
      sessionId: data.session_id,
      targetUserId: data.target_user_id,
      targetMemberId: data.target_member_id,
      targetName: data.target_name,
      targetEmail: data.target_email,
      targetAvatarUrl: data.target_avatar_url,
      targetClubs: data.target_clubs || [],
      targetDefaultClubId: data.target_default_club_id,
      targetIsSuperAdmin: data.target_is_super_admin,
      targetOnboardingCompleted: data.target_onboarding_completed
    };

    sessionStorage.setItem('impersonation_session', JSON.stringify(newSession));
    setSession(newSession);

    if (newSession.targetDefaultClubId) {
      localStorage.setItem('currentClubId', newSession.targetDefaultClubId);
    } else if (newSession.targetClubs.length > 0) {
      localStorage.setItem('currentClubId', newSession.targetClubs[0].club_id);
    }

    localStorage.removeItem('currentOrganization');

    const club = newSession.targetClubs.find(c => c.club_id === newSession.targetDefaultClubId) || newSession.targetClubs[0];
    setPreloaderTarget({
      name: newSession.targetName,
      avatarUrl: newSession.targetAvatarUrl,
      clubName: club?.club_name
    });
    setShowPreloader(true);
    sessionStorage.setItem(PRELOADER_FLAG, 'true');

    setTimeout(() => {
      window.location.href = '/';
    }, 800);
  }, []);

  const stopImpersonation = useCallback(async () => {
    if (session?.sessionId) {
      try {
        await supabase.rpc('end_impersonation_session', {
          p_session_id: session.sessionId
        });
      } catch (err) {
        console.error('Error ending impersonation session:', err);
      }
    }

    sessionStorage.removeItem('impersonation_session');
    sessionStorage.removeItem(PRELOADER_FLAG);
    setSession(null);

    window.location.href = '/';
  }, [session]);

  const effectiveUserId = session?.targetUserId ?? null;

  const effectiveProfile: EffectiveProfile | null = session ? (() => {
    const nameParts = (session.targetName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    return {
      firstName,
      lastName,
      fullName: session.targetName || '',
      avatarUrl: session.targetAvatarUrl || null,
    };
  })() : null;

  return (
    <ImpersonationContext.Provider value={{
      isImpersonating: !!session,
      session,
      effectiveUserId,
      effectiveProfile,
      startImpersonation,
      stopImpersonation
    }}>
      {children}
      <ImpersonationPreloaderModal
        isOpen={showPreloader}
        targetName={preloaderTarget?.name || ''}
        targetAvatarUrl={preloaderTarget?.avatarUrl || null}
        targetClubName={preloaderTarget?.clubName}
      />
    </ImpersonationContext.Provider>
  );
};

export const useImpersonation = () => {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
};

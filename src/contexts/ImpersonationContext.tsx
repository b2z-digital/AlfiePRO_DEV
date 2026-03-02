import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../utils/supabase';

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

interface ImpersonationContextType {
  isImpersonating: boolean;
  session: ImpersonationSession | null;
  startImpersonation: (memberId: string, reason?: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

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

    window.location.href = '/';
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
    setSession(null);

    window.location.href = '/';
  }, [session]);

  return (
    <ImpersonationContext.Provider value={{
      isImpersonating: !!session,
      session,
      startImpersonation,
      stopImpersonation
    }}>
      {children}
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

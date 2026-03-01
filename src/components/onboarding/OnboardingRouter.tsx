import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { OnboardingChoiceScreen } from './OnboardingChoiceScreen';
import { OnboardingWizard } from './OnboardingWizard';
import { ClubSetupWizard } from './ClubSetupWizard';
import { CheckCircle2, Building2, ArrowRight } from 'lucide-react';

interface OnboardingRouterProps {
  darkMode: boolean;
}

interface LinkedClub {
  club_id: string;
  club_name: string;
  club_abbreviation: string | null;
  role: string;
  club_logo: string | null;
}

type OnboardingMode = 'choice' | 'join-club' | 'start-club' | 'already-linked';

export const OnboardingRouter: React.FC<OnboardingRouterProps> = ({ darkMode }) => {
  const [mode, setMode] = useState<OnboardingMode>('choice');
  const [loading, setLoading] = useState(true);
  const [linkedClubs, setLinkedClubs] = useState<LinkedClub[]>([]);
  const [confirmingLink, setConfirmingLink] = useState(false);

  useEffect(() => {
    checkExistingApplications();
  }, []);

  const checkExistingApplications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: linkStatus } = await supabase.rpc('check_member_linking_status');

      if (linkStatus?.success && linkStatus.status === 'linked' && linkStatus.clubs?.length > 0) {
        setLinkedClubs(linkStatus.clubs);
        setMode('already-linked');
        setLoading(false);
        return;
      }

      if (linkStatus?.success && linkStatus.status === 'unlinked') {
        const { data: selfLink } = await supabase.rpc('try_link_current_user_to_members');
        if (selfLink?.success && selfLink.linked_count > 0) {
          setLinkedClubs(selfLink.clubs);
          setMode('already-linked');
          setLoading(false);
          return;
        }
      }

      const { data: memberApp } = await supabase
        .from('membership_applications')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_draft', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: clubApp } = await supabase
        .from('club_setup_applications')
        .select('id, current_step')
        .eq('user_id', user.id)
        .eq('is_draft', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (clubApp) {
        const { data: allClubDrafts } = await supabase
          .from('club_setup_applications')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_draft', true)
          .neq('id', clubApp.id);

        if (allClubDrafts && allClubDrafts.length > 0) {
          const duplicateIds = allClubDrafts.map(d => d.id);
          await supabase
            .from('club_setup_applications')
            .delete()
            .in('id', duplicateIds);
        }
      }

      if (clubApp) {
        setMode('start-club');
      } else {
        setMode('join-club');
      }
    } catch (error) {
      console.error('Error checking applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmLink = async () => {
    setConfirmingLink(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', user.id);
      }
      window.location.href = '/';
    } catch (error) {
      console.error('Error confirming link:', error);
      setConfirmingLink(false);
    }
  };

  const handleComplete = () => {
    window.location.reload();
  };

  const handleSelectJoinClub = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete any club setup application drafts
      await supabase
        .from('club_setup_applications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_draft', true);

      // Don't create a membership application draft yet - let OnboardingWizard handle it
      setMode('join-club');
    } catch (error) {
      console.error('Error switching to join club:', error);
      setMode('join-club');
    }
  };

  const handleSelectStartClub = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete any membership application drafts
      await supabase
        .from('membership_applications')
        .delete()
        .eq('user_id', user.id)
        .eq('is_draft', true);

      // Don't create a club setup application draft yet - let ClubSetupWizard handle it
      setMode('start-club');
    } catch (error) {
      console.error('Error switching to start club:', error);
      setMode('start-club');
    }
  };

  const handleBackToChoice = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMode('choice');
        return;
      }

      // Delete both draft applications when going back to choice
      const [memberResult, clubResult] = await Promise.all([
        supabase
          .from('membership_applications')
          .delete()
          .eq('user_id', user.id)
          .eq('is_draft', true),
        supabase
          .from('club_setup_applications')
          .delete()
          .eq('user_id', user.id)
          .eq('is_draft', true),
      ]);

      if (memberResult.error) console.error('Error deleting member app:', memberResult.error);
      if (clubResult.error) console.error('Error deleting club app:', clubResult.error);

      setMode('choice');
    } catch (error) {
      console.error('Error going back to choice:', error);
      setMode('choice');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (mode === 'already-linked') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Welcome! We found your membership</h1>
            <p className="text-slate-400">
              Your email address matches an existing member record. You've been automatically linked to the following club{linkedClubs.length > 1 ? 's' : ''}:
            </p>
          </div>

          <div className="space-y-3 mb-8">
            {linkedClubs.map((club) => (
              <div
                key={club.club_id}
                className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex items-center gap-4"
              >
                <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                  {club.club_logo ? (
                    <img src={club.club_logo} alt={club.club_name} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold truncate">{club.club_name}</h3>
                  {club.club_abbreviation && (
                    <p className="text-slate-400 text-sm">{club.club_abbreviation}</p>
                  )}
                </div>
                <span className="text-xs bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full capitalize flex-shrink-0">
                  {club.role}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={handleConfirmLink}
            disabled={confirmingLink}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {confirmingLink ? 'Setting up your account...' : 'Continue to Dashboard'}
            {!confirmingLink && <ArrowRight className="w-5 h-5" />}
          </button>

          <p className="text-center text-slate-500 text-sm mt-4">
            Not the right account? Contact your club administrator for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'choice') {
    return (
      <OnboardingChoiceScreen
        onSelectJoinClub={handleSelectJoinClub}
        onSelectStartClub={handleSelectStartClub}
      />
    );
  }

  if (mode === 'start-club') {
    return (
      <ClubSetupWizard
        onComplete={handleComplete}
        onBack={handleBackToChoice}
      />
    );
  }

  return (
    <OnboardingWizard
      darkMode={darkMode}
      onBack={handleBackToChoice}
    />
  );
};

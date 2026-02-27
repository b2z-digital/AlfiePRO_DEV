import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { OnboardingChoiceScreen } from './OnboardingChoiceScreen';
import { OnboardingWizard } from './OnboardingWizard';
import { ClubSetupWizard } from './ClubSetupWizard';

interface OnboardingRouterProps {
  darkMode: boolean;
}

type OnboardingMode = 'choice' | 'join-club' | 'start-club';

export const OnboardingRouter: React.FC<OnboardingRouterProps> = ({ darkMode }) => {
  const [mode, setMode] = useState<OnboardingMode>('choice');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkExistingApplications();
  }, []);

  const checkExistingApplications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('OnboardingRouter: No user found');
        setLoading(false);
        return;
      }

      console.log('OnboardingRouter: Checking for existing applications for user:', user.id);

      // Check for membership application
      const { data: memberApp, error: memberError } = await supabase
        .from('membership_applications')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_draft', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (memberError) {
        console.error('Error checking membership application:', memberError);
      }
      console.log('OnboardingRouter: Found membership application:', memberApp);

      // Check for club setup application
      const { data: clubApp, error: clubError } = await supabase
        .from('club_setup_applications')
        .select('id, current_step')
        .eq('user_id', user.id)
        .eq('is_draft', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (clubError) {
        console.error('Error checking club setup application:', clubError);
      }
      console.log('OnboardingRouter: Found club setup application:', clubApp);

      // Clean up any duplicate drafts
      if (clubApp) {
        const { data: allClubDrafts } = await supabase
          .from('club_setup_applications')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_draft', true)
          .neq('id', clubApp.id);

        if (allClubDrafts && allClubDrafts.length > 0) {
          console.log('OnboardingRouter: Cleaning up duplicate club setup applications:', allClubDrafts.length);
          const duplicateIds = allClubDrafts.map(d => d.id);
          await supabase
            .from('club_setup_applications')
            .delete()
            .in('id', duplicateIds);
        }
      }

      // Show choice screen if no existing applications
      if (clubApp) {
        console.log('OnboardingRouter: Setting mode to start-club');
        setMode('start-club');
      } else if (memberApp) {
        console.log('OnboardingRouter: Setting mode to join-club');
        setMode('join-club');
      } else {
        console.log('OnboardingRouter: Showing choice screen');
        setMode('choice');
      }
    } catch (error) {
      console.error('Error checking applications:', error);
    } finally {
      setLoading(false);
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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { Logo } from '../Logo';
import { ClubWelcomeStep } from './steps/ClubWelcomeStep';
import { ClubInformationStep } from './steps/ClubInformationStep';
import { ClubContactStep } from './steps/ClubContactStep';
import { ClubVenueStep } from './steps/ClubVenueStep';
import { ClubFinancialStep } from './steps/ClubFinancialStep';
import { ClubSubscriptionStep } from './steps/ClubSubscriptionStep';
import { ClubReviewStep } from './steps/ClubReviewStep';
import { Check, LogOut, Building2, Mail, MapPin, DollarSign, CreditCard, FileCheck } from 'lucide-react';

interface ClubSetupWizardProps {
  onComplete: () => void;
  onBack?: () => void;
}

export interface ClubSetupData {
  clubInfo: {
    name: string;
    abbreviation: string;
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    description?: string;
  };
  contactInfo: {
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    website?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  primaryVenue: {
    name: string;
    description?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    image?: string;
  };
  financialInfo: {
    taxType?: string;
    taxId?: string;
    currency?: string;
  };
  subscriptionPlan?: string;
}

const STEPS = [
  { id: 0, key: 'welcome', name: 'Welcome', icon: Building2 },
  { id: 1, key: 'club-info', name: 'Club Info', icon: Building2 },
  { id: 2, key: 'contact', name: 'Contact', icon: Mail },
  { id: 3, key: 'venue', name: 'Venue', icon: MapPin },
  { id: 4, key: 'financial', name: 'Financial', icon: DollarSign },
  { id: 5, key: 'subscription', name: 'Plan', icon: CreditCard },
  { id: 6, key: 'review', name: 'Review', icon: FileCheck },
] as const;

type StepType = typeof STEPS[number]['key'];

export const ClubSetupWizard: React.FC<ClubSetupWizardProps> = ({
  onComplete,
  onBack,
}) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<StepType>('welcome');
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [data, setData] = useState<ClubSetupData>({
    clubInfo: {
      name: '',
      abbreviation: '',
    },
    contactInfo: {
      email: '',
    },
    primaryVenue: {
      name: '',
    },
    financialInfo: {},
  });

  useEffect(() => {
    loadOrCreateApplication();
  }, []);

  useEffect(() => {
    if (applicationId) {
      const timeoutId = setTimeout(() => {
        saveProgress();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [data, currentStep, completedSteps, applicationId]);

  const loadOrCreateApplication = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the most recent draft application
      const { data: existing } = await supabase
        .from('club_setup_applications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_draft', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        setApplicationId(existing.id);
        setCurrentStep(existing.current_step as StepType);

        // Restore completed steps
        if (existing.completed_steps && Array.isArray(existing.completed_steps)) {
          setCompletedSteps(existing.completed_steps);
        } else {
          // If no completed steps saved, mark all steps before current as completed
          const currentIndex = STEPS.findIndex(s => s.key === existing.current_step);
          if (currentIndex > 0) {
            setCompletedSteps(Array.from({ length: currentIndex }, (_, i) => i));
          }
        }

        setData({
          clubInfo: existing.club_info || data.clubInfo,
          contactInfo: existing.contact_info || data.contactInfo,
          primaryVenue: existing.primary_venue || data.primaryVenue,
          financialInfo: existing.financial_info || data.financialInfo,
          subscriptionPlan: existing.subscription_plan,
        });

        // Clean up any duplicate drafts
        const { data: allDrafts } = await supabase
          .from('club_setup_applications')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_draft', true)
          .neq('id', existing.id);

        if (allDrafts && allDrafts.length > 0) {
          const duplicateIds = allDrafts.map(d => d.id);
          await supabase
            .from('club_setup_applications')
            .delete()
            .in('id', duplicateIds);
        }
      } else {
        const { data: newApp, error } = await supabase
          .from('club_setup_applications')
          .insert({
            user_id: user.id,
            current_step: 'welcome',
          })
          .select()
          .single();

        if (error) throw error;
        if (newApp) setApplicationId(newApp.id);
      }
    } catch (error) {
      console.error('Error loading application:', error);
    }
  };

  const saveProgress = async () => {
    if (!applicationId) return;

    try {
      await supabase
        .from('club_setup_applications')
        .update({
          current_step: currentStep,
          completed_steps: completedSteps,
          club_info: data.clubInfo,
          contact_info: data.contactInfo,
          primary_venue: data.primaryVenue,
          financial_info: data.financialInfo,
          subscription_plan: data.subscriptionPlan,
        })
        .eq('id', applicationId);
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const handleNext = () => {
    const currentIndex = STEPS.findIndex(s => s.key === currentStep);
    if (!completedSteps.includes(currentIndex)) {
      setCompletedSteps([...completedSteps, currentIndex]);
    }
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].key);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.findIndex(s => s.key === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].key);
    } else if (onBack) {
      onBack();
    }
  };

  const updateData = (section: keyof ClubSetupData, newData: any) => {
    setData((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...newData },
    }));
  };

  const handleComplete = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !applicationId) return;

      await supabase
        .from('club_setup_applications')
        .update({
          is_draft: false,
          completed_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      onComplete();
    } catch (error) {
      console.error('Error completing setup:', error);
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);
  const progress = ((currentStepIndex) / (STEPS.length - 1)) * 100;

  const handleSaveAndExit = async () => {
    await saveProgress();
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Header with Logo and Save & Exit */}
        <div className="relative flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <Logo size="large" />
            <h1 className="text-3xl text-white tracking-wide">
              <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
            </h1>
          </div>
          {currentStepIndex > 0 && (
            <button
              onClick={handleSaveAndExit}
              className="absolute right-0 flex items-center gap-2 px-4 py-2 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Save & Exit</span>
            </button>
          )}
        </div>

        {/* Step Progress */}
        {currentStepIndex > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              {STEPS.slice(1).map((step, index) => (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        completedSteps.includes(step.id)
                          ? 'bg-green-500 text-white'
                          : currentStep === step.key
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-400'
                      }`}
                    >
                      {completedSteps.includes(step.id) ? (
                        <Check size={20} />
                      ) : (
                        <span className="text-sm font-medium">{step.id}</span>
                      )}
                    </div>
                    <span
                      className={`text-xs mt-2 ${
                        currentStep === step.key
                          ? 'text-green-400 font-medium'
                          : 'text-slate-500'
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < STEPS.length - 2 && (
                    <div
                      className={`flex-1 h-1 mx-2 rounded transition-all ${
                        completedSteps.includes(step.id)
                          ? 'bg-green-500'
                          : 'bg-slate-700/50'
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="w-full bg-slate-700/50 backdrop-blur-sm rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-green-400 h-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="transition-all duration-300">
          {currentStep === 'welcome' && (
            <ClubWelcomeStep onNext={handleNext} onBack={onBack} />
          )}
          {currentStep === 'club-info' && (
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12">
              <ClubInformationStep
                data={data.clubInfo}
                onUpdate={(newData) => updateData('clubInfo', newData)}
                onNext={handleNext}
                onBack={handleBack}
              />
            </div>
          )}
          {currentStep === 'contact' && (
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12">
              <ClubContactStep
                data={data.contactInfo}
                onUpdate={(newData) => updateData('contactInfo', newData)}
                onNext={handleNext}
                onBack={handleBack}
              />
            </div>
          )}
          {currentStep === 'venue' && (
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12">
              <ClubVenueStep
                data={data.primaryVenue}
                onUpdate={(newData) => updateData('primaryVenue', newData)}
                onNext={handleNext}
                onBack={handleBack}
              />
            </div>
          )}
          {currentStep === 'financial' && (
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12">
              <ClubFinancialStep
                data={data.financialInfo}
                onUpdate={(newData) => updateData('financialInfo', newData)}
                onNext={handleNext}
                onBack={handleBack}
              />
            </div>
          )}
          {currentStep === 'subscription' && (
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12">
              <ClubSubscriptionStep
                selectedPlan={data.subscriptionPlan}
                onSelectPlan={(plan) => setData({ ...data, subscriptionPlan: plan })}
                onNext={handleNext}
                onBack={handleBack}
              />
            </div>
          )}
          {currentStep === 'review' && (
            <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12">
              <ClubReviewStep
                data={data}
                applicationId={applicationId}
                onComplete={handleComplete}
                onBack={handleBack}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

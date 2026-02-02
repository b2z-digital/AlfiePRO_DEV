import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LogOut } from 'lucide-react';
import { Logo } from '../Logo';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { WelcomeStep } from './steps/WelcomeStep';
import { ClubDiscoveryStep } from './steps/ClubDiscoveryStep';
import { ProfileSetupStep } from './steps/ProfileSetupStep';
import { MembershipSelectionStep } from './steps/MembershipSelectionStep';
import { BoatInformationStep } from './steps/BoatInformationStep';
import { EmergencyContactStep } from './steps/EmergencyContactStep';
import { PaymentMethodStep } from './steps/PaymentMethodStep';
import { CodeOfConductStep } from './steps/CodeOfConductStep';
import { ReviewAndSubmitStep } from './steps/ReviewAndSubmitStep';
import { useNotifications } from '../../contexts/NotificationContext';

export interface OnboardingData {
  clubId?: string;
  clubName?: string;
  clubLogo?: string;
  clubBankName?: string;
  clubBsb?: string;
  clubAccountNumber?: string;
  avatarUrl?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  membershipTypeId?: string;
  membershipTypeName?: string;
  membershipAmount?: number;
  boats: Array<{
    type: string;
    sailNumber: string;
    hullName: string;
  }>;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  paymentMethod: 'card' | 'bank_transfer';
  codeOfConductAccepted: boolean;
}

const STEPS = [
  { id: 0, name: 'Welcome', component: WelcomeStep },
  { id: 1, name: 'Find Club', component: ClubDiscoveryStep },
  { id: 2, name: 'Profile', component: ProfileSetupStep },
  { id: 3, name: 'Membership', component: MembershipSelectionStep },
  { id: 4, name: 'Boats', component: BoatInformationStep },
  { id: 5, name: 'Emergency', component: EmergencyContactStep },
  { id: 6, name: 'Payment', component: PaymentMethodStep },
  { id: 7, name: 'Agreement', component: CodeOfConductStep },
  { id: 8, name: 'Review', component: ReviewAndSubmitStep },
];

interface OnboardingWizardProps {
  darkMode: boolean;
  onBack?: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ darkMode, onBack }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<OnboardingData>({
    firstName: '',
    lastName: '',
    email: user?.email || '',
    phone: '',
    boats: [],
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    paymentMethod: 'bank_transfer',
    codeOfConductAccepted: false,
  });

  useEffect(() => {
    if (user) {
      loadDraftApplication();
    }
  }, [user]);

  const loadDraftApplication = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('membership_applications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_draft', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setDraftId(data.id);
        setCurrentStep(data.draft_step || 0);
        setCompletedSteps(data.completed_steps || []);

        // If club_id exists but bank details are missing from application_data, fetch from clubs table
        let bankDetails = {
          clubBankName: data.application_data?.clubBankName,
          clubBsb: data.application_data?.clubBsb,
          clubAccountNumber: data.application_data?.clubAccountNumber,
        };

        if (data.club_id && (!bankDetails.clubBankName && !bankDetails.clubBsb && !bankDetails.clubAccountNumber)) {
          try {
            const { data: clubData } = await supabase
              .from('clubs')
              .select('bank_name, bsb, account_number')
              .eq('id', data.club_id)
              .single();

            if (clubData) {
              bankDetails = {
                clubBankName: clubData.bank_name,
                clubBsb: clubData.bsb,
                clubAccountNumber: clubData.account_number,
              };
            }
          } catch (clubError) {
            console.error('Error fetching club bank details:', clubError);
          }
        }

        setFormData({
          clubId: data.club_id,
          clubName: data.application_data?.clubName,
          clubLogo: data.application_data?.clubLogo,
          clubBankName: bankDetails.clubBankName,
          clubBsb: bankDetails.clubBsb,
          clubAccountNumber: bankDetails.clubAccountNumber,
          avatarUrl: data.avatar_url || undefined,
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
          phone: data.phone || '',
          street: data.street || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          postcode: data.postcode || undefined,
          membershipTypeId: data.membership_type_id || undefined,
          membershipTypeName: data.membership_type_name || undefined,
          membershipAmount: data.membership_amount || undefined,
          boats: data.boats || [],
          emergencyContactName: data.emergency_contact_name || '',
          emergencyContactPhone: data.emergency_contact_phone || '',
          emergencyContactRelationship: data.emergency_contact_relationship || '',
          paymentMethod: data.payment_method || 'bank_transfer',
          codeOfConductAccepted: data.code_of_conduct_accepted || false,
        });
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async (stepNumber: number, data: Partial<OnboardingData>) => {
    if (!user) return;

    try {
      const applicationData = { ...formData, ...data };

      const payload = {
        user_id: user.id,
        club_id: applicationData.clubId,
        first_name: applicationData.firstName,
        last_name: applicationData.lastName,
        email: applicationData.email,
        phone: applicationData.phone,
        street: applicationData.street,
        city: applicationData.city,
        state: applicationData.state,
        postcode: applicationData.postcode,
        avatar_url: applicationData.avatarUrl,
        membership_type_id: applicationData.membershipTypeId,
        membership_type_name: applicationData.membershipTypeName,
        membership_amount: applicationData.membershipAmount,
        boats: applicationData.boats,
        emergency_contact_name: applicationData.emergencyContactName,
        emergency_contact_phone: applicationData.emergencyContactPhone,
        emergency_contact_relationship: applicationData.emergencyContactRelationship,
        payment_method: applicationData.paymentMethod,
        code_of_conduct_accepted: applicationData.codeOfConductAccepted,
        code_of_conduct_accepted_at: applicationData.codeOfConductAccepted ? new Date().toISOString() : null,
        application_data: applicationData,
        draft_step: stepNumber,
        completed_steps: completedSteps,
        is_draft: true,
        status: 'pending',
      };

      if (draftId) {
        const { error } = await supabase
          .from('membership_applications')
          .update(payload)
          .eq('id', draftId);

        if (error) throw error;
      } else {
        const { data: newDraft, error } = await supabase
          .from('membership_applications')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        if (newDraft) setDraftId(newDraft.id);
      }
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  };

  const handleNext = async (stepData: Partial<OnboardingData>) => {
    const updatedData = { ...formData, ...stepData };
    setFormData(updatedData);

    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }

    await saveDraft(currentStep + 1, updatedData);
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else if (onBack) {
      onBack();
    }
  };

  const handleSubmit = async (finalData: Partial<OnboardingData>) => {
    if (!user) return;

    const applicationData = { ...formData, ...finalData };

    try {
      const payload = {
        user_id: user.id,
        club_id: applicationData.clubId,
        first_name: applicationData.firstName,
        last_name: applicationData.lastName,
        email: applicationData.email,
        phone: applicationData.phone,
        street: applicationData.street,
        city: applicationData.city,
        state: applicationData.state,
        postcode: applicationData.postcode,
        avatar_url: applicationData.avatarUrl,
        membership_type_id: applicationData.membershipTypeId,
        membership_type_name: applicationData.membershipTypeName,
        membership_amount: applicationData.membershipAmount,
        boats: applicationData.boats,
        emergency_contact_name: applicationData.emergencyContactName,
        emergency_contact_phone: applicationData.emergencyContactPhone,
        emergency_contact_relationship: applicationData.emergencyContactRelationship,
        payment_method: applicationData.paymentMethod,
        code_of_conduct_accepted: applicationData.codeOfConductAccepted,
        code_of_conduct_accepted_at: new Date().toISOString(),
        application_data: applicationData,
        draft_step: 0,
        is_draft: false,
        status: 'pending',
      };

      if (draftId) {
        const { error } = await supabase
          .from('membership_applications')
          .update(payload)
          .eq('id', draftId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('membership_applications')
          .insert(payload);

        if (error) throw error;
      }

      // Mark onboarding as completed
      await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      // Send confirmation email to applicant
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (token) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-membership-notifications`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email_type: 'application_received',
              recipient_email: applicationData.email,
              member_data: {
                first_name: applicationData.firstName,
                last_name: applicationData.lastName,
                club_name: applicationData.clubName || 'the club',
                membership_type: applicationData.membershipTypeName,
                amount: applicationData.membershipAmount,
                currency: 'AUD',
                club_id: applicationData.clubId,
                user_id: user.id,
                bank_name: applicationData.clubBankName,
                bsb: applicationData.clubBsb,
                account_number: applicationData.clubAccountNumber,
                payment_method: applicationData.paymentMethod,
              },
            }),
          });
        }
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Don't fail the submission if email fails
      }

      addNotification('success', 'Application submitted successfully! Check your email for confirmation.');
      navigate('/application-pending');
    } catch (error) {
      console.error('Error submitting application:', error);
      addNotification('error', 'Failed to submit application. Please try again.');
    }
  };

  const CurrentStepComponent = STEPS[currentStep].component;
  const progress = ((currentStep) / (STEPS.length - 1)) * 100;

  const handleSaveAndExit = async () => {
    await saveDraft(currentStep, formData);
    addNotification('success', 'Progress saved! You can continue later.');
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 md:py-8">
        {/* Header with Logo and Save & Exit */}
        <div className="relative flex items-center justify-center mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <Logo size="large" />
            <h1 className="text-xl sm:text-2xl md:text-3xl text-white tracking-wide">
              <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
            </h1>
          </div>
          {currentStep > 0 && (
            <button
              onClick={handleSaveAndExit}
              className="absolute right-0 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all text-sm"
            >
              <LogOut size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span className="hidden sm:inline">Save & Exit</span>
            </button>
          )}
        </div>
        {currentStep > 0 && (
          <div className="mb-4 sm:mb-6 md:mb-8">
            <div className="flex items-center justify-between mb-3 sm:mb-4 overflow-x-auto scrollbar-hide">
              {STEPS.slice(1).map((step, index) => (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center min-w-0 flex-shrink-0">
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all ${
                        completedSteps.includes(step.id)
                          ? 'bg-green-500 text-white'
                          : currentStep === step.id
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-400'
                      }`}
                    >
                      {completedSteps.includes(step.id) ? (
                        <Check size={14} className="sm:w-4 sm:h-4 md:w-5 md:h-5" />
                      ) : (
                        <span className="text-xs sm:text-sm font-medium">{step.id}</span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] sm:text-xs mt-1 sm:mt-2 hidden sm:block truncate max-w-[60px] md:max-w-none text-center ${
                        currentStep === step.id
                          ? 'text-green-400 font-medium'
                          : 'text-slate-500'
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < STEPS.length - 2 && (
                    <div
                      className={`flex-1 h-0.5 sm:h-1 mx-1 sm:mx-2 rounded transition-all min-w-[8px] ${
                        completedSteps.includes(step.id)
                          ? 'bg-green-500'
                          : 'bg-slate-700/50'
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="w-full bg-slate-700/50 backdrop-blur-sm rounded-full h-1.5 sm:h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-green-400 h-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="transition-all duration-300">
          {currentStep === 0 ? (
            <CurrentStepComponent
              darkMode={darkMode}
              formData={formData}
              onNext={handleNext}
              onBack={handleBack}
              onSubmit={handleSubmit}
              isFirstStep={currentStep === 0}
              isLastStep={currentStep === STEPS.length - 1}
            />
          ) : (
            <div className="w-full">
              <CurrentStepComponent
                darkMode={darkMode}
                formData={formData}
                onNext={handleNext}
                onBack={handleBack}
                onSubmit={handleSubmit}
                isFirstStep={currentStep === 0}
                isLastStep={currentStep === STEPS.length - 1}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

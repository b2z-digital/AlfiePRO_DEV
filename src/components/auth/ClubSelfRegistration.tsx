import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, ChevronRight, ChevronLeft, Palette, MapPin, Users, DollarSign, CheckCircle, Loader2, Globe } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../Logo';
import { AssociationSelectionStep } from './registration-steps/AssociationSelectionStep';
import { BasicInfoStep } from '../pages/club-onboarding/BasicInfoStep';
import { BrandingStep } from '../pages/club-onboarding/BrandingStep';
import { VenueStep } from '../pages/club-onboarding/VenueStep';
import { MembershipStep } from '../pages/club-onboarding/MembershipStep';
import { FinanceStep } from '../pages/club-onboarding/FinanceStep';
import { ReviewStep } from '../pages/club-onboarding/ReviewStep';
import { ClubOnboardingFormData } from '../pages/club-onboarding/types';

const SELF_REG_STEPS = [
  { key: 'association', label: 'Association', shortLabel: 'Assoc.', icon: Globe },
  { key: 'basic', label: 'Club Details', shortLabel: 'Details', icon: Building },
  { key: 'branding', label: 'Branding', shortLabel: 'Branding', icon: Palette },
  { key: 'venue', label: 'Venue', shortLabel: 'Venue', icon: MapPin },
  { key: 'membership', label: 'Memberships', shortLabel: 'Members', icon: Users },
  { key: 'finance', label: 'Finance', shortLabel: 'Finance', icon: DollarSign },
  { key: 'review', label: 'Review', shortLabel: 'Review', icon: CheckCircle },
];

const INITIAL_FORM_DATA: ClubOnboardingFormData = {
  name: '',
  abbreviation: '',
  location: '',
  country: 'Australia',
  email: '',
  phone: '',
  website: '',
  logoFile: null,
  logoPreview: '',
  clubIntroduction: '',
  featuredImageFile: null,
  featuredImagePreview: '',
  venueName: '',
  venueAddress: '',
  venueDescription: '',
  venueLatitude: -32.9688,
  venueLongitude: 151.7174,
  membershipTypes: [],
  currency: 'AUD',
  taxName: 'GST',
  taxRate: 10,
  taxEnabled: true,
  assignAdmin: false,
  adminEmail: '',
  adminFirstName: '',
  adminLastName: '',
  sendInvitation: false,
};

interface ClubSelfRegistrationProps {
  darkMode: boolean;
}

export const ClubSelfRegistration: React.FC<ClubSelfRegistrationProps> = ({ darkMode }) => {
  const { user, refreshUserClubs } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ClubOnboardingFormData>(INITIAL_FORM_DATA);
  const [selectedAssociationId, setSelectedAssociationId] = useState<string>('');
  const [selectedAssociationName, setSelectedAssociationName] = useState<string>('');

  useEffect(() => {
    if (!user) {
      navigate('/register');
    }
  }, [user, navigate]);

  const totalSteps = SELF_REG_STEPS.length;

  const updateFormData = (updates: Partial<ClubOnboardingFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return selectedAssociationId !== '';
      case 1:
        return formData.name.trim() !== '' && formData.abbreviation.trim() !== '' && formData.country !== '';
      case 2:
        return true;
      case 3:
        return true;
      case 4:
        return formData.membershipTypes.every(t => t.name.trim() !== '');
      case 5:
        return true;
      case 6:
        return true;
      default:
        return false;
    }
  };

  const uploadImage = async (clubId: string, file: File, path: string): Promise<string | null> => {
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `clubs/${clubId}/${path}.${ext}`;
      const { error } = await supabase.storage
        .from('media')
        .upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);
      return urlData.publicUrl;
    } catch (error) {
      console.error(`Error uploading ${path}:`, error);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const clubInsert: any = {
        name: formData.name,
        abbreviation: formData.abbreviation,
        location: formData.location,
        email: formData.email,
        phone: formData.phone,
        website: formData.website,
        state_association_id: selectedAssociationId || null,
        registered_by_user_id: user.id,
        approval_status: 'pending_approval',
        onboarding_completed: false,
        club_introduction: formData.clubIntroduction || null,
        cover_image_url: '/lmryc_slide.jpeg',
      };

      const { data: club, error: clubError } = await supabase
        .from('clubs')
        .insert(clubInsert)
        .select()
        .single();

      if (clubError) throw clubError;

      if (formData.logoFile) {
        const logoUrl = await uploadImage(club.id, formData.logoFile, 'logo');
        if (logoUrl) {
          await supabase.from('clubs').update({ logo: logoUrl }).eq('id', club.id);
        }
      }

      if (formData.featuredImageFile) {
        const featuredUrl = await uploadImage(club.id, formData.featuredImageFile, 'featured');
        if (featuredUrl) {
          await supabase.from('clubs').update({
            featured_image_url: featuredUrl,
            cover_image_url: featuredUrl
          }).eq('id', club.id);
        }
      }

      if (formData.venueName.trim()) {
        const { data: venue } = await supabase
          .from('venues')
          .insert({
            name: formData.venueName,
            description: formData.venueDescription || '',
            address: formData.venueAddress || '',
            latitude: formData.venueLatitude,
            longitude: formData.venueLongitude,
            club_id: club.id,
            is_default: true,
          })
          .select()
          .single();

        if (venue) {
          await supabase.from('club_venues').insert({
            club_id: club.id,
            venue_id: venue.id,
            is_primary: true,
          });
        }
      }

      if (formData.membershipTypes.length > 0) {
        const typesToInsert = formData.membershipTypes.map(t => ({
          club_id: club.id,
          name: t.name,
          description: t.description || null,
          amount: t.amount,
          currency: formData.currency,
          renewal_period: t.renewal_period,
          is_active: true,
        }));
        await supabase.from('membership_types').insert(typesToInsert);
      }

      if (formData.taxEnabled && formData.taxName) {
        await supabase.from('tax_rates').insert({
          club_id: club.id,
          name: formData.taxName,
          rate: formData.taxRate,
          currency: formData.currency,
          is_default: true,
          is_active: true,
        });
      }

      await refreshUserClubs(user.id);
      navigate('/club-application-pending');
    } catch (error) {
      console.error('Error submitting club registration:', error);
    } finally {
      setLoading(false);
    }
  };

  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Logo size="small" />
            <div className="text-xl text-white">
              <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/register')}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-8 pt-6 pb-4">
            <h2 className="text-2xl font-bold text-white">
              Register Your Club
            </h2>
            <p className="text-sm mt-1 text-slate-400">
              Step {currentStep + 1} of {totalSteps} - {SELF_REG_STEPS[currentStep].label}
            </p>
          </div>

          <div className="px-8 pb-4">
            <div className="flex items-center gap-1">
              {SELF_REG_STEPS.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                return (
                  <React.Fragment key={step.key}>
                    <button
                      onClick={() => index <= currentStep && setCurrentStep(index)}
                      disabled={index > currentStep}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isCompleted
                            ? 'text-emerald-500 hover:bg-slate-700/50 cursor-pointer'
                            : 'text-slate-600'
                      }`}
                    >
                      <Icon size={14} />
                      <span className="hidden lg:inline">{step.shortLabel}</span>
                    </button>
                    {index < SELF_REG_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 rounded-full mx-0.5 ${
                        isCompleted ? 'bg-emerald-500' : 'bg-slate-700'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="mt-3 h-1 rounded-full overflow-hidden bg-slate-700">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="px-8 py-4 max-h-[60vh] overflow-y-auto">
            {currentStep === 0 && (
              <AssociationSelectionStep
                selectedAssociationId={selectedAssociationId}
                selectedAssociationName={selectedAssociationName}
                onSelect={(id, name) => {
                  setSelectedAssociationId(id);
                  setSelectedAssociationName(name);
                }}
                darkMode={true}
              />
            )}
            {currentStep === 1 && (
              <BasicInfoStep
                formData={formData}
                updateFormData={updateFormData}
                darkMode={true}
                stateAssociationId={selectedAssociationId}
              />
            )}
            {currentStep === 2 && (
              <BrandingStep formData={formData} updateFormData={updateFormData} darkMode={true} />
            )}
            {currentStep === 3 && (
              <VenueStep formData={formData} updateFormData={updateFormData} darkMode={true} />
            )}
            {currentStep === 4 && (
              <MembershipStep formData={formData} updateFormData={updateFormData} darkMode={true} />
            )}
            {currentStep === 5 && (
              <FinanceStep formData={formData} updateFormData={updateFormData} darkMode={true} />
            )}
            {currentStep === 6 && (
              <div>
                <ReviewStep formData={formData} updateFormData={updateFormData} darkMode={true} />
                <div className="mt-4 p-4 rounded-xl border bg-amber-500/10 border-amber-500/20">
                  <p className="text-sm text-amber-300">
                    Your club registration will be submitted for approval by the {selectedAssociationName || 'association'} administrators. You'll be notified once your club has been approved.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-8 py-5 border-t border-slate-700">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
                currentStep === 0
                  ? 'opacity-40 cursor-not-allowed'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              <ChevronLeft size={18} />
              Back
            </button>

            <div className="flex items-center gap-3">
              {currentStep < totalSteps - 1 ? (
                <button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                    canProceed()
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30'
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Next
                  <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading || !canProceed()}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                    loading || !canProceed()
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Submit for Approval
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

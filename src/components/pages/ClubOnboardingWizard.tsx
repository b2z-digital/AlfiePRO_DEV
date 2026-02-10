import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Building, Palette, Sailboat, MapPin, Users, DollarSign, UserPlus, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import { BasicInfoStep } from './club-onboarding/BasicInfoStep';
import { BrandingStep } from './club-onboarding/BrandingStep';
import { YachtClassesStep } from './club-onboarding/YachtClassesStep';
import { VenueStep } from './club-onboarding/VenueStep';
import { MembershipStep } from './club-onboarding/MembershipStep';
import { FinanceStep } from './club-onboarding/FinanceStep';
import { AdminStep } from './club-onboarding/AdminStep';
import { ReviewStep } from './club-onboarding/ReviewStep';
import { ClubOnboardingFormData, STEP_CONFIG } from './club-onboarding/types';

interface ClubOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stateAssociationId: string;
  darkMode: boolean;
}

const STEP_ICONS = [Building, Palette, Sailboat, MapPin, Users, DollarSign, UserPlus, CheckCircle];

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
  selectedBoatClassIds: [],
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

export const ClubOnboardingWizard: React.FC<ClubOnboardingWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  stateAssociationId,
  darkMode
}) => {
  const { addNotification } = useNotification();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ClubOnboardingFormData>(INITIAL_FORM_DATA);

  const totalSteps = STEP_CONFIG.length;

  if (!isOpen) return null;

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
        return formData.name.trim() !== '' && formData.abbreviation.trim() !== '' && formData.country !== '';
      case 1:
        return true;
      case 2:
        return true;
      case 3:
        return true;
      case 4:
        return formData.membershipTypes.every(t => t.name.trim() !== '');
      case 5:
        return true;
      case 6:
        if (!formData.assignAdmin) return true;
        return formData.adminEmail.trim() !== '' &&
               formData.adminFirstName.trim() !== '' &&
               formData.adminLastName.trim() !== '';
      case 7:
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
    setLoading(true);

    try {
      const clubInsert: any = {
        name: formData.name,
        abbreviation: formData.abbreviation,
        location: formData.location,
        email: formData.email,
        phone: formData.phone,
        website: formData.website,
        state_association_id: stateAssociationId || null,
        assigned_by_user_id: user?.id,
        onboarding_completed: !formData.assignAdmin,
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

      if (formData.selectedBoatClassIds.length > 0) {
        const boatClassRows = formData.selectedBoatClassIds.map(bcId => ({
          club_id: club.id,
          boat_class_id: bcId,
        }));
        await supabase.from('club_boat_classes').insert(boatClassRows);
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

      if (formData.assignAdmin && formData.adminEmail) {
        const { data: existingMember } = await supabase
          .from('members')
          .select('id, user_id')
          .eq('email', formData.adminEmail)
          .eq('club_id', club.id)
          .maybeSingle();

        if (existingMember?.user_id) {
          await supabase
            .from('user_clubs')
            .insert({
              user_id: existingMember.user_id,
              club_id: club.id,
              role: 'admin'
            });
        } else {
          await supabase
            .from('members')
            .insert({
              club_id: club.id,
              email: formData.adminEmail,
              first_name: formData.adminFirstName,
              last_name: formData.adminLastName,
              membership_status: 'pending'
            });

          if (formData.sendInvitation) {
            await supabase.functions.invoke('send-member-invitation', {
              body: {
                email: formData.adminEmail,
                firstName: formData.adminFirstName,
                lastName: formData.adminLastName,
                clubId: club.id,
                clubName: formData.name,
                role: 'admin'
              }
            });
          }
        }
      }

      addNotification('success', `${formData.name} has been created successfully!`);
      setFormData(INITIAL_FORM_DATA);
      setCurrentStep(0);
      onSuccess();
    } catch (error) {
      console.error('Error creating club:', error);
      addNotification('error', 'Failed to create club. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(INITIAL_FORM_DATA);
    setCurrentStep(0);
    onClose();
  };

  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl ${
        darkMode ? 'bg-slate-800' : 'bg-white'
      }`}>
        <div className={`flex-shrink-0 flex items-center justify-between px-8 pt-6 pb-4`}>
          <div>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Add New Club
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Step {currentStep + 1} of {totalSteps} - {STEP_CONFIG[currentStep].label}
            </p>
          </div>
          <button
            onClick={handleClose}
            className={`p-2 rounded-xl transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-shrink-0 px-8 pb-4">
          <div className="flex items-center gap-1">
            {STEP_CONFIG.map((step, index) => {
              const Icon = STEP_ICONS[index];
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              return (
                <React.Fragment key={step.key}>
                  <button
                    onClick={() => index <= currentStep && setCurrentStep(index)}
                    disabled={index > currentStep}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? darkMode
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-emerald-50 text-emerald-700'
                        : isCompleted
                          ? darkMode
                            ? 'text-emerald-500 hover:bg-slate-700/50 cursor-pointer'
                            : 'text-emerald-600 hover:bg-slate-50 cursor-pointer'
                          : darkMode
                            ? 'text-slate-600'
                            : 'text-slate-300'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="hidden lg:inline">{step.shortLabel}</span>
                  </button>
                  {index < STEP_CONFIG.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded-full mx-0.5 ${
                      isCompleted
                        ? 'bg-emerald-500'
                        : darkMode
                          ? 'bg-slate-700'
                          : 'bg-slate-200'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className={`mt-3 h-1 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-4">
          {currentStep === 0 && (
            <BasicInfoStep
              formData={formData}
              updateFormData={updateFormData}
              darkMode={darkMode}
              stateAssociationId={stateAssociationId}
            />
          )}
          {currentStep === 1 && (
            <BrandingStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 2 && (
            <YachtClassesStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 3 && (
            <VenueStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 4 && (
            <MembershipStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 5 && (
            <FinanceStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 6 && (
            <AdminStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 7 && (
            <ReviewStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
        </div>

        <div className={`flex-shrink-0 flex items-center justify-between px-8 py-5 border-t ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${
              currentStep === 0
                ? 'opacity-40 cursor-not-allowed'
                : darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
            }`}
          >
            <ChevronLeft size={18} />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className={`px-4 py-2.5 rounded-xl font-medium transition-colors text-sm ${
                darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Cancel
            </button>

            {currentStep < totalSteps - 1 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                  canProceed()
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30'
                    : darkMode
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
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
                    ? darkMode
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Creating Club...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Create Club
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

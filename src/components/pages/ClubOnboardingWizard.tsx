import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Building, Palette, Sailboat, MapPin, Users, DollarSign, UserPlus, CheckCircle, Loader2, Calendar } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import { BasicInfoStep } from './club-onboarding/BasicInfoStep';
import { BrandingStep } from './club-onboarding/BrandingStep';
import { YachtClassesStep } from './club-onboarding/YachtClassesStep';
import { SailingDaysStep } from './club-onboarding/SailingDaysStep';
import { VenueStep } from './club-onboarding/VenueStep';
import { MembershipStep } from './club-onboarding/MembershipStep';
import { FinanceStep } from './club-onboarding/FinanceStep';
import { AdminStep } from './club-onboarding/AdminStep';
import { ReviewStep } from './club-onboarding/ReviewStep';
import { ClubOnboardingFormData, STEP_CONFIG } from './club-onboarding/types';
import { v4 as uuidv4 } from 'uuid';

interface ClubOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stateAssociationId: string;
  darkMode: boolean;
  clubId?: string;
}

const STEP_ICONS = [Building, Palette, Sailboat, Calendar, MapPin, Users, DollarSign, UserPlus, CheckCircle];

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
  sailingDays: [],
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
  darkMode,
  clubId
}) => {
  const { addNotification } = useNotification();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [formData, setFormData] = useState<ClubOnboardingFormData>(INITIAL_FORM_DATA);

  const isEditMode = !!clubId;
  const totalSteps = STEP_CONFIG.length;

  useEffect(() => {
    if (isOpen && clubId) {
      loadClubData(clubId);
    } else if (isOpen && !clubId) {
      setFormData(INITIAL_FORM_DATA);
      setCurrentStep(0);
    }
  }, [isOpen, clubId]);

  const loadClubData = async (id: string) => {
    setInitialLoading(true);
    try {
      const { data: club } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!club) return;

      const { data: venues } = await supabase
        .from('venues')
        .select('*')
        .eq('club_id', id)
        .eq('is_default', true)
        .limit(1);
      const venue = venues?.[0];

      const { data: boatClasses } = await supabase
        .from('club_boat_classes')
        .select('boat_class_id')
        .eq('club_id', id);

      const { data: sailingDays } = await supabase
        .from('club_sailing_days')
        .select('*')
        .eq('club_id', id);

      const { data: membershipTypes } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', id)
        .eq('is_active', true);

      const { data: taxRates } = await supabase
        .from('tax_rates')
        .select('*')
        .eq('club_id', id)
        .eq('is_default', true)
        .limit(1);
      const taxRate = taxRates?.[0];

      setFormData({
        name: club.name || '',
        abbreviation: club.abbreviation || '',
        location: club.address || '',
        country: 'Australia',
        email: club.contact_email || '',
        phone: club.contact_phone || '',
        website: club.subdomain_slug || '',
        logoFile: null,
        logoPreview: club.logo || '',
        clubIntroduction: club.club_introduction || '',
        featuredImageFile: null,
        featuredImagePreview: club.featured_image_url || '',
        venueName: venue?.name || '',
        venueAddress: venue?.address || '',
        venueDescription: venue?.description || '',
        venueLatitude: venue?.latitude || -32.9688,
        venueLongitude: venue?.longitude || 151.7174,
        selectedBoatClassIds: (boatClasses || []).map(bc => bc.boat_class_id),
        sailingDays: (sailingDays || []).map(sd => ({
          id: sd.id,
          day_of_week: sd.day_of_week,
          start_time: sd.start_time,
          end_time: sd.end_time,
          boat_class_id: sd.boat_class_id,
          description: sd.description || '',
          is_active: sd.is_active,
        })),
        membershipTypes: (membershipTypes || []).map(mt => ({
          id: mt.id,
          name: mt.name,
          description: mt.description || '',
          amount: Number(mt.amount) || 0,
          currency: mt.currency || 'AUD',
          renewal_period: mt.renewal_period || 'annual',
        })),
        currency: taxRate?.currency || 'AUD',
        taxName: taxRate?.name || club.tax_name || 'GST',
        taxRate: taxRate ? Number(taxRate.rate) * 100 : (club.tax_rate ? Number(club.tax_rate) * 100 : 10),
        taxEnabled: club.tax_enabled !== false,
        assignAdmin: false,
        adminEmail: '',
        adminFirstName: '',
        adminLastName: '',
        sendInvitation: false,
      });
    } catch (error) {
      console.error('Error loading club data:', error);
      addNotification('error', 'Failed to load club data');
    } finally {
      setInitialLoading(false);
    }
  };

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
        return true; // Sailing days step (optional)
      case 4:
        return true; // Venue step
      case 5:
        return formData.membershipTypes.every(t => t.name.trim() !== '');
      case 6:
        return true; // Finance step
      case 7:
        if (!formData.assignAdmin) return true;
        return formData.adminEmail.trim() !== '' &&
               formData.adminFirstName.trim() !== '' &&
               formData.adminLastName.trim() !== '';
      case 8:
        return true; // Review step
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

  const applyDefaultDashboardTemplate = async (clubId: string, userId: string) => {
    try {
      const RACE_MANAGEMENT_TEMPLATE_ID = 'a1111111-1111-1111-1111-111111111111';

      // Load the Race Management template from database
      const { data: template, error: templateError } = await supabase
        .from('dashboard_templates')
        .select('*')
        .eq('id', RACE_MANAGEMENT_TEMPLATE_ID)
        .single();

      if (templateError || !template) {
        console.warn('Could not load Race Management template:', templateError);
        return;
      }

      // Convert template data to dashboard layout format
      const templateLayout = template.template_data?.lg || [];
      const rowConfigs = template.template_data?.row_configs || [];

      const rowMap = new Map();
      const widgets: any[] = [];

      templateLayout.forEach((widgetConfig: any) => {
        const rowNum = widgetConfig.row;

        if (!rowMap.has(rowNum)) {
          const rowWidgets = templateLayout.filter((w: any) => w.row === rowNum);
          const rowConfig = rowConfigs.find((r: any) => r.row === rowNum);
          const columns = rowConfig?.columns || rowWidgets.length;

          rowMap.set(rowNum, {
            id: `row-${uuidv4()}`,
            columns,
            widgetIds: [],
            order: rowNum,
            height: rowConfig?.height || 'default'
          });
        }

        const row = rowMap.get(rowNum);
        const widgetId = `widget-${uuidv4()}`;

        widgets.push({
          id: widgetId,
          type: widgetConfig.type,
          rowId: row.id,
          columnIndex: widgetConfig.col,
          position: {
            x: widgetConfig.col,
            y: rowNum,
            w: widgetConfig.width,
            h: widgetConfig.height
          },
          settings: widgetConfig.settings || {},
          colorTheme: widgetConfig.colorTheme || 'default'
        });

        row.widgetIds.push(widgetId);
      });

      const rows = Array.from(rowMap.values()).sort((a: any, b: any) => a.order - b.order);

      const dashboardLayout = {
        widgets,
        rows,
        version: 1
      };

      // Save as user's default dashboard for this club
      await supabase
        .from('user_dashboard_layouts')
        .insert({
          user_id: userId,
          club_id: clubId,
          state_association_id: null,
          national_association_id: null,
          is_default: true,
          layout: dashboardLayout
        });

      console.log('✅ Applied Race Management template as default dashboard');
    } catch (error) {
      console.error('Error applying default dashboard template:', error);
      // Don't throw - dashboard template is nice-to-have, not critical
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      if (isEditMode && clubId) {
        await handleUpdate(clubId);
      } else {
        await handleCreate();
      }

      setFormData(INITIAL_FORM_DATA);
      setCurrentStep(0);
      onSuccess();
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} club:`, error);
      addNotification('error', `Failed to ${isEditMode ? 'update' : 'create'} club. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string) => {
    const clubUpdate: any = {
      name: formData.name,
      abbreviation: formData.abbreviation,
      address: formData.location || null,
      contact_email: formData.email || null,
      contact_phone: formData.phone || null,
      club_introduction: formData.clubIntroduction || null,
      tax_enabled: formData.taxEnabled,
      tax_name: formData.taxName || null,
      tax_rate: formData.taxRate / 100,
    };

    const { error: clubError } = await supabase
      .from('clubs')
      .update(clubUpdate)
      .eq('id', id);

    if (clubError) throw clubError;

    if (formData.logoFile) {
      const logoUrl = await uploadImage(id, formData.logoFile, 'logo');
      if (logoUrl) {
        await supabase.from('clubs').update({ logo: logoUrl }).eq('id', id);
      }
    }

    if (formData.featuredImageFile) {
      const featuredUrl = await uploadImage(id, formData.featuredImageFile, 'featured');
      if (featuredUrl) {
        await supabase.from('clubs').update({
          featured_image_url: featuredUrl,
          cover_image_url: featuredUrl
        }).eq('id', id);
      }
    }

    const { data: existingVenue } = await supabase
      .from('venues')
      .select('id')
      .eq('club_id', id)
      .eq('is_default', true)
      .maybeSingle();

    if (formData.venueName.trim()) {
      if (existingVenue) {
        await supabase.from('venues').update({
          name: formData.venueName,
          description: formData.venueDescription || '',
          address: formData.venueAddress || '',
          latitude: formData.venueLatitude,
          longitude: formData.venueLongitude,
        }).eq('id', existingVenue.id);
      } else {
        const { data: venue } = await supabase
          .from('venues')
          .insert({
            name: formData.venueName,
            description: formData.venueDescription || '',
            address: formData.venueAddress || '',
            latitude: formData.venueLatitude,
            longitude: formData.venueLongitude,
            club_id: id,
            is_default: true,
          })
          .select()
          .single();

        if (venue) {
          await supabase.from('club_venues').insert({
            club_id: id,
            venue_id: venue.id,
            is_primary: true,
          });
        }
      }
    }

    const newTypeIds = formData.membershipTypes.filter(t => t.id).map(t => t.id);

    const { data: existingTypes } = await supabase
      .from('membership_types')
      .select('id')
      .eq('club_id', id)
      .eq('is_active', true);

    const existingTypeIds = (existingTypes || []).map(t => t.id);
    const removedIds = existingTypeIds.filter(eid => !newTypeIds.includes(eid));

    if (removedIds.length > 0) {
      await supabase.from('membership_types')
        .update({ is_active: false })
        .in('id', removedIds);
    }

    for (const mt of formData.membershipTypes) {
      if (mt.id && existingTypeIds.includes(mt.id)) {
        await supabase.from('membership_types').update({
          name: mt.name,
          description: mt.description || null,
          amount: mt.amount,
          currency: formData.currency,
          renewal_period: mt.renewal_period,
        }).eq('id', mt.id);
      } else {
        await supabase.from('membership_types').insert({
          club_id: id,
          name: mt.name,
          description: mt.description || null,
          amount: mt.amount,
          currency: formData.currency,
          renewal_period: mt.renewal_period,
          is_active: true,
        });
      }
    }

    await supabase.from('club_boat_classes').delete().eq('club_id', id);
    if (formData.selectedBoatClassIds.length > 0) {
      const boatClassRows = formData.selectedBoatClassIds.map(bcId => ({
        club_id: id,
        boat_class_id: bcId,
      }));
      await supabase.from('club_boat_classes').insert(boatClassRows);
    }

    if (formData.taxEnabled && formData.taxName) {
      const { data: existingTax } = await supabase
        .from('tax_rates')
        .select('id')
        .eq('club_id', id)
        .eq('is_default', true)
        .maybeSingle();

      if (existingTax) {
        await supabase.from('tax_rates').update({
          name: formData.taxName,
          rate: formData.taxRate / 100,
          currency: formData.currency,
        }).eq('id', existingTax.id);
      } else {
        await supabase.from('tax_rates').insert({
          club_id: id,
          name: formData.taxName,
          rate: formData.taxRate / 100,
          currency: formData.currency,
          is_default: true,
          is_active: true,
        });
      }
    }

    if (formData.assignAdmin && formData.adminEmail) {
      const { data: existingMember } = await supabase
        .from('members')
        .select('id, user_id')
        .eq('email', formData.adminEmail)
        .eq('club_id', id)
        .maybeSingle();

      if (existingMember?.user_id) {
        const { data: existingRole } = await supabase
          .from('user_clubs')
          .select('id')
          .eq('user_id', existingMember.user_id)
          .eq('club_id', id)
          .maybeSingle();

        if (!existingRole) {
          await supabase.from('user_clubs').insert({
            user_id: existingMember.user_id,
            club_id: id,
            role: 'admin'
          });
        }
      } else {
        await supabase.from('members').insert({
          club_id: id,
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
              clubId: id,
              clubName: formData.name,
              role: 'admin'
            }
          });
        }
      }
    }

    addNotification('success', `${formData.name} has been updated successfully!`);
  };

  const handleCreate = async () => {
    const clubInsert: any = {
      name: formData.name,
      abbreviation: formData.abbreviation,
      address: formData.location || null,
      contact_email: formData.email || null,
      contact_phone: formData.phone || null,
      state_association_id: stateAssociationId || null,
      created_by_user_id: user?.id,
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

    if (formData.sailingDays.length > 0) {
      const sailingDaysToInsert = formData.sailingDays.map(day => ({
        club_id: club.id,
        day_of_week: day.day_of_week,
        start_time: day.start_time,
        end_time: day.end_time,
        boat_class_id: day.boat_class_id,
        description: day.description || null,
        is_active: day.is_active,
      }));
      await supabase.from('club_sailing_days').insert(sailingDaysToInsert);
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

    // Apply the Race Management dashboard template as the default
    if (user?.id) {
      await applyDefaultDashboardTemplate(club.id, user.id);
    }

    addNotification('success', `${formData.name} has been created successfully!`);
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
              {isEditMode ? 'Edit Club' : 'Add New Club'}
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
                    onClick={() => (isEditMode || index <= currentStep) && setCurrentStep(index)}
                    disabled={!isEditMode && index > currentStep}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? darkMode
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-emerald-50 text-emerald-700'
                        : (isCompleted || isEditMode)
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
                      (isCompleted || isEditMode)
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
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin text-emerald-500 mb-4" />
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Loading club details...</p>
            </div>
          ) : (<>
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
            <SailingDaysStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 4 && (
            <VenueStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 5 && (
            <MembershipStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 6 && (
            <FinanceStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 7 && (
            <AdminStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          {currentStep === 8 && (
            <ReviewStep formData={formData} updateFormData={updateFormData} darkMode={darkMode} />
          )}
          </>)}
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
                    {isEditMode ? 'Saving Changes...' : 'Creating Club...'}
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    {isEditMode ? 'Save Changes' : 'Create Club'}
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

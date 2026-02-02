import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Building, MapPin, Mail, Phone, User, UserPlus } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';

interface ClubOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stateAssociationId: string;
  darkMode: boolean;
}

interface FormData {
  // Step 1: Basic Information
  name: string;
  abbreviation: string;
  location: string;

  // Step 2: Contact Details
  email: string;
  phone: string;
  website: string;

  // Step 3: Admin Assignment (optional)
  assignAdmin: boolean;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  sendInvitation: boolean;
}

export const ClubOnboardingWizard: React.FC<ClubOnboardingWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  stateAssociationId,
  darkMode
}) => {
  const { addNotification } = useNotification();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    abbreviation: '',
    location: '',
    email: '',
    phone: '',
    website: '',
    assignAdmin: false,
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    sendInvitation: false
  });

  const totalSteps = 3;

  if (!isOpen) return null;

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // Create the club
      const { data: club, error: clubError } = await supabase
        .from('clubs')
        .insert({
          name: formData.name,
          abbreviation: formData.abbreviation,
          location: formData.location,
          email: formData.email,
          phone: formData.phone,
          website: formData.website,
          state_association_id: stateAssociationId,
          assigned_by_user_id: user?.id,
          onboarding_completed: !formData.assignAdmin // Mark as completed if not assigning admin
        })
        .select()
        .single();

      if (clubError) throw clubError;

      // If assigning an admin, handle the invitation
      if (formData.assignAdmin && formData.adminEmail) {
        // Check if user exists
        const { data: existingMember } = await supabase
          .from('members')
          .select('id, user_id')
          .eq('email', formData.adminEmail)
          .eq('club_id', club.id)
          .maybeSingle();

        if (existingMember?.user_id) {
          // User exists, assign them as admin directly
          await supabase
            .from('user_clubs')
            .insert({
              user_id: existingMember.user_id,
              club_id: club.id,
              role: 'admin'
            });

          addNotification('success', `Club created and ${formData.adminFirstName} ${formData.adminLastName} assigned as admin`);
        } else {
          // Create member record for future linking
          await supabase
            .from('members')
            .insert({
              club_id: club.id,
              email: formData.adminEmail,
              first_name: formData.adminFirstName,
              last_name: formData.adminLastName,
              membership_status: 'pending'
            });

          // Send invitation if requested
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
            addNotification('success', `Club created and invitation sent to ${formData.adminEmail}`);
          } else {
            addNotification('success', `Club created. Admin can be invited manually later.`);
          }
        }
      } else {
        addNotification('success', 'Club created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('Error creating club:', error);
      addNotification('error', 'Failed to create club');
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.name.trim() !== '';
      case 2:
        return true; // Contact details are optional
      case 3:
        if (!formData.assignAdmin) return true;
        return formData.adminEmail.trim() !== '' &&
               formData.adminFirstName.trim() !== '' &&
               formData.adminLastName.trim() !== '';
      default:
        return false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`w-full max-w-3xl rounded-xl shadow-2xl ${
        darkMode ? 'bg-slate-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Add New Club
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Step {currentStep} of {totalSteps}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className={`h-2 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-lg bg-emerald-500/20">
                  <Building className="text-emerald-400" size={24} />
                </div>
                <div>
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Basic Information
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Enter the club's basic details
                  </p>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Club Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => updateFormData({ name: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  placeholder="e.g., Port Stephens Yacht Club"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Abbreviation
                </label>
                <input
                  type="text"
                  value={formData.abbreviation}
                  onChange={(e) => updateFormData({ abbreviation: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  placeholder="e.g., PSYC"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Location
                </label>
                <div className="relative">
                  <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`} size={18} />
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => updateFormData({ location: e.target.value })}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                    placeholder="e.g., Port Stephens, NSW"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Contact Details */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-lg bg-blue-500/20">
                  <Mail className="text-blue-400" size={24} />
                </div>
                <div>
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Contact Details
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Add contact information for the club
                  </p>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Email
                </label>
                <div className="relative">
                  <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`} size={18} />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateFormData({ email: e.target.value })}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                    placeholder="contact@club.com"
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Phone
                </label>
                <div className="relative">
                  <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`} size={18} />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateFormData({ phone: e.target.value })}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                    placeholder="(02) 1234 5678"
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Website
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => updateFormData({ website: e.target.value })}
                  className={`w-full px-4 py-2.5 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  placeholder="https://www.club.com"
                />
              </div>
            </div>
          )}

          {/* Step 3: Admin Assignment */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-lg bg-purple-500/20">
                  <UserPlus className="text-purple-400" size={24} />
                </div>
                <div>
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Assign Club Admin
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Optional: Assign someone to manage this club
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${
                darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-blue-50 border-blue-200'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.assignAdmin}
                    onChange={(e) => updateFormData({ assignAdmin: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-slate-400 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div>
                    <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Assign an admin to this club
                    </div>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      The admin will have full control over club management
                    </p>
                  </div>
                </label>
              </div>

              {formData.assignAdmin && (
                <div className="space-y-4 pl-4 border-l-2 border-emerald-500">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.adminFirstName}
                        onChange={(e) => updateFormData({ adminFirstName: e.target.value })}
                        className={`w-full px-4 py-2.5 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                        placeholder="John"
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.adminLastName}
                        onChange={(e) => updateFormData({ adminLastName: e.target.value })}
                        className={`w-full px-4 py-2.5 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                        placeholder="Smith"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.adminEmail}
                      onChange={(e) => updateFormData({ adminEmail: e.target.value })}
                      className={`w-full px-4 py-2.5 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                          : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                      } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                      placeholder="admin@email.com"
                    />
                  </div>

                  <div className={`p-3 rounded-lg border ${
                    darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.sendInvitation}
                        onChange={(e) => updateFormData({ sendInvitation: e.target.checked })}
                        className="mt-0.5 w-4 h-4 rounded border-slate-400 text-emerald-500 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          Send invitation email
                        </div>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          The admin will receive an email to join and set up their account
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {!formData.assignAdmin && (
                <div className={`p-4 rounded-lg border ${
                  darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'
                }`}>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    You can assign an admin later from the club management page. The club will appear in your clubs list
                    and you'll maintain full access until an admin is assigned.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between p-6 border-t ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              currentStep === 1
                ? 'opacity-50 cursor-not-allowed'
                : darkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
            }`}
          >
            <ChevronLeft size={20} />
            Back
          </button>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                canProceed()
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-600 text-slate-400 cursor-not-allowed'
              }`}
            >
              Next
              <ChevronRight size={20} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !canProceed()}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                loading || !canProceed()
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {loading ? 'Creating...' : 'Create Club'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

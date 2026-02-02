import React, { useState } from 'react';
import { Send, Edit2, CheckCircle, User, MapPin, Award, Anchor, AlertCircle, CreditCard } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { Avatar } from '../../ui/Avatar';

interface ReviewAndSubmitStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onBack: () => void;
  onSubmit: (data: Partial<OnboardingData>) => void;
}

export const ReviewAndSubmitStep: React.FC<ReviewAndSubmitStepProps> = ({
  darkMode,
  formData,
  onBack,
  onSubmit,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit({});
  };

  const InfoSection = ({ icon: Icon, title, children, iconColor, rightContent }: any) => (
    <div className="p-4 sm:p-5 md:p-6 rounded-xl bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${iconColor} flex items-center justify-center flex-shrink-0`}>
            <Icon className="text-white w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <h3 className={`font-semibold text-base sm:text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {title}
          </h3>
        </div>
        {rightContent && <div className="sm:ml-auto">{rightContent}</div>}
      </div>
      {children}
    </div>
  );

  const InfoRow = ({ label, value }: { label: string; value: string | undefined }) => (
    <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-slate-700/30 last:border-0 gap-1 sm:gap-2">
      <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}:</span>
      <span className={`font-medium text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
        {value || 'Not specified'}
      </span>
    </div>
  );

  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-green-500 to-green-600 mb-3 sm:mb-4">
            <CheckCircle className="text-white w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <h2 className={`text-2xl sm:text-3xl font-bold mb-1 sm:mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Review Your Application
          </h2>
          <p className={`text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Please review your information before submitting
          </p>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <InfoSection
            icon={MapPin}
            title="Club"
            iconColor="bg-green-500"
            rightContent={
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  {formData.clubLogo ? (
                    <img
                      src={formData.clubLogo}
                      alt={formData.clubName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML = `<span class="text-white font-semibold text-base sm:text-xl">${formData.clubName?.charAt(0) || 'C'}</span>`;
                        }
                      }}
                    />
                  ) : (
                    <span className="text-white font-semibold text-base sm:text-xl">{formData.clubName?.charAt(0) || 'C'}</span>
                  )}
                </div>
                <div className={`font-medium text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                  {formData.clubName || 'Not selected'}
                </div>
              </div>
            }
          >
            <div className="text-xs sm:text-sm text-slate-400">
              Your selected sailing club
            </div>
          </InfoSection>

          <InfoSection
            icon={User}
            title="Personal Information"
            iconColor="bg-purple-500"
            rightContent={
              <div className="flex items-center gap-2 sm:gap-3">
                <Avatar
                  firstName={formData.firstName}
                  lastName={formData.lastName}
                  imageUrl={formData.avatarUrl}
                  size="md"
                />
                <div className={`font-medium text-sm sm:text-lg ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                  {formData.firstName} {formData.lastName}
                </div>
              </div>
            }
          >
            <InfoRow label="Email" value={formData.email} />
            <InfoRow label="Phone" value={formData.phone} />
            {formData.street && (
              <InfoRow
                label="Address"
                value={`${formData.street}, ${formData.city} ${formData.state} ${formData.postcode}`}
              />
            )}
          </InfoSection>

          <InfoSection icon={Award} title="Membership" iconColor="bg-green-500">
            <InfoRow label="Type" value={formData.membershipTypeName} />
            <InfoRow
              label="Amount"
              value={formData.membershipAmount ? `$${formData.membershipAmount} AUD/year` : undefined}
            />
          </InfoSection>

          {formData.boats && formData.boats.length > 0 && (
            <InfoSection icon={Anchor} title="Boat(s)" iconColor="bg-cyan-500">
              <div className="space-y-2 sm:space-y-3">
                {formData.boats.map((boat, index) => (
                  <div
                    key={index}
                    className="p-2.5 sm:p-3 rounded-lg bg-slate-700/30 backdrop-blur-sm border border-slate-600/30"
                  >
                    <div className={`font-medium mb-0.5 sm:mb-1 text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      {boat.type} - #{boat.sailNumber}
                    </div>
                    {boat.hullName && (
                      <div className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {boat.hullName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </InfoSection>
          )}

          <InfoSection icon={AlertCircle} title="Emergency Contact" iconColor="bg-red-500">
            <InfoRow label="Name" value={formData.emergencyContactName} />
            <InfoRow label="Phone" value={formData.emergencyContactPhone} />
            <InfoRow label="Relationship" value={formData.emergencyContactRelationship} />
          </InfoSection>

          <InfoSection icon={CreditCard} title="Payment Method" iconColor="bg-amber-500">
            <InfoRow
              label="Method"
              value={formData.paymentMethod === 'card' ? 'Online Card Payment' : 'Bank Transfer'}
            />
            {formData.paymentMethod === 'bank_transfer' && (
              <>
                <div className={`mt-2 sm:mt-3 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm ${
                  darkMode ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'
                }`}>
                  Please transfer the membership fee to the club's bank account using your name as the reference.
                </div>
                {(formData.clubBankName || formData.clubBsb || formData.clubAccountNumber) && (
                  <div className={`mt-2 sm:mt-3 p-3 sm:p-4 rounded-lg border ${
                    darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-white border-slate-200'
                  }`}>
                    <div className={`font-semibold mb-2 sm:mb-3 text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      Bank Details
                    </div>
                    {formData.clubBankName && (
                      <div className="mb-1.5 sm:mb-2">
                        <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Bank Name: </span>
                        <span className={`font-medium text-xs sm:text-sm ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                          {formData.clubBankName}
                        </span>
                      </div>
                    )}
                    {formData.clubBsb && (
                      <div className="mb-1.5 sm:mb-2">
                        <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>BSB: </span>
                        <span className={`font-medium text-xs sm:text-sm ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                          {formData.clubBsb}
                        </span>
                      </div>
                    )}
                    {formData.clubAccountNumber && (
                      <div>
                        <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Account Number: </span>
                        <span className={`font-medium text-xs sm:text-sm ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                          {formData.clubAccountNumber}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </InfoSection>

          <div className={`p-3 sm:p-4 rounded-lg ${darkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-start gap-2 sm:gap-3">
              <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5 w-4 h-4 sm:w-5 sm:h-5" />
              <div>
                <p className={`font-medium mb-0.5 sm:mb-1 text-sm sm:text-base ${darkMode ? 'text-green-300' : 'text-green-800'}`}>
                  Code of Conduct Accepted
                </p>
                <p className={`text-xs sm:text-sm ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                  You've agreed to abide by the club's code of conduct
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-6 sm:mt-8 p-4 sm:p-5 md:p-6 rounded-xl ${darkMode ? 'bg-green-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'}`}>
          <h4 className={`font-semibold mb-2 text-sm sm:text-base ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>
            What happens next?
          </h4>
          <ul className={`space-y-1.5 sm:space-y-2 text-xs sm:text-sm ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
            <li className="flex items-start gap-1.5 sm:gap-2">
              <span className="font-bold flex-shrink-0">1.</span>
              <span>Your application will be reviewed by club administrators</span>
            </li>
            <li className="flex items-start gap-1.5 sm:gap-2">
              <span className="font-bold flex-shrink-0">2.</span>
              <span>You'll receive an email once your application is processed</span>
            </li>
            <li className="flex items-start gap-1.5 sm:gap-2">
              <span className="font-bold flex-shrink-0">3.</span>
              <span>Once approved, you'll have full access to all club features</span>
            </li>
          </ul>
        </div>

        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between">
          <button
            onClick={onBack}
            disabled={submitting}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base ${
              submitting
                ? 'opacity-50 cursor-not-allowed'
                : darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Edit2 size={18} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Edit Application</span>
            <span className="sm:hidden">Edit</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold transition-all transform text-sm sm:text-base ${
              submitting
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-lg hover:scale-105'
            }`}
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white"></div>
                <span className="hidden sm:inline">Submitting...</span>
                <span className="sm:hidden">Submitting...</span>
              </>
            ) : (
              <>
                <Send size={18} className="sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Submit Application</span>
                <span className="sm:hidden">Submit</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

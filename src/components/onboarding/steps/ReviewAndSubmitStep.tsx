import React, { useState } from 'react';
import { Send, Edit2, CheckCircle } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { ApplicationSummaryView } from '../../membership/ApplicationSummaryView';

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

  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-6 sm:p-8 md:p-12">
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

        <ApplicationSummaryView
          darkMode={darkMode}
          application={{
            first_name: formData.firstName || '',
            last_name: formData.lastName || '',
            email: formData.email || '',
            phone: formData.phone || '',
            street: formData.street,
            city: formData.city,
            state: formData.state,
            postcode: formData.postcode,
            avatar_url: formData.avatarUrl,
            membership_type_name: formData.membershipTypeName,
            membership_amount: formData.membershipAmount,
            boats: formData.boats,
            emergency_contact_name: formData.emergencyContactName || '',
            emergency_contact_phone: formData.emergencyContactPhone || '',
            emergency_contact_relationship: formData.emergencyContactRelationship || '',
            payment_method: formData.paymentMethod || '',
            code_of_conduct_accepted: formData.codeOfConductAccepted,
          }}
          club={formData.clubName ? {
            name: formData.clubName,
            logo: formData.clubLogo,
            bank_name: formData.clubBankName,
            bsb: formData.clubBsb,
            account_number: formData.clubAccountNumber,
          } : undefined}
          mode="review"
        />

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
  );
};

import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';

interface EmergencyContactStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack: () => void;
}

export const EmergencyContactStep: React.FC<EmergencyContactStepProps> = ({
  darkMode,
  formData,
  onNext,
  onBack,
}) => {
  const [name, setName] = useState(formData.emergencyContactName || '');
  const [phone, setPhone] = useState(formData.emergencyContactPhone || '');
  const [relationship, setRelationship] = useState(formData.emergencyContactRelationship || '');

  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 4) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 4)} ${numbers.slice(4)}`;
    return `${numbers.slice(0, 4)} ${numbers.slice(4, 7)} ${numbers.slice(7, 10)}`;
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setPhone(formatted);
  };

  const handleContinue = () => {
    if (!name || !phone || !relationship) {
      alert('Please fill in all emergency contact fields');
      return;
    }

    onNext({
      emergencyContactName: name,
      emergencyContactPhone: phone,
      emergencyContactRelationship: relationship,
    });
  };

  const relationships = [
    'Partner',
    'Spouse',
    'Parent',
    'Sibling',
    'Child',
    'Friend',
    'Other Family',
    'Other',
  ];

  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="text-red-500 w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <h2 className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Emergency Contact
          </h2>
        </div>
        <p className={`mb-4 sm:mb-6 text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Safety first! Who should we contact in case of emergency?
        </p>

        <div className={`p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 ${
          darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
        }`}>
          <p className={`text-xs sm:text-sm ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
            This information will be kept confidential and only used in emergency situations during club activities.
          </p>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-white text-slate-900 border-slate-300'
              } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              placeholder="Full name of emergency contact"
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Contact Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-white text-slate-900 border-slate-300'
              } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              placeholder="0412 345 678"
              maxLength={12}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Relationship <span className="text-red-500">*</span>
            </label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-white text-slate-900 border-slate-300'
              } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            >
              <option value="">Select relationship</option>
              {relationships.map((rel) => (
                <option key={rel} value={rel}>
                  {rel}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between">
          <button
            onClick={onBack}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base ${
              darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
            Back
          </button>

          <button
            onClick={handleContinue}
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-green-700 transition-all shadow-lg text-sm sm:text-base"
          >
            Continue
            <ArrowRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

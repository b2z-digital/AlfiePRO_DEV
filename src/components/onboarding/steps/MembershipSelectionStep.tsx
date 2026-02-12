import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, Check, Loader } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { supabase } from '../../../utils/supabase';

interface MembershipType {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  renewal_period: string;
  features: string[];
}

interface MembershipSelectionStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack: () => void;
}

export const MembershipSelectionStep: React.FC<MembershipSelectionStepProps> = ({
  darkMode,
  formData,
  onNext,
  onBack,
}) => {
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedType, setSelectedType] = useState<string | undefined>(formData.membershipTypeId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMembershipTypes();
  }, [formData.clubId]);

  const fetchMembershipTypes = async () => {
    if (!formData.clubId) return;

    try {
      const { data, error } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', formData.clubId)
        .order('amount');

      if (error) throw error;

      // Filter out Lifetime Member and add features
      const typesWithFeatures = (data || [])
        .filter(type => !type.name.toLowerCase().includes('lifetime'))
        .map(type => ({
          ...type,
          features: parseFeatures(type.description),
        }));

      setMembershipTypes(typesWithFeatures);
    } catch (error) {
      console.error('Error fetching membership types:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseFeatures = (description: string): string[] => {
    if (!description) return [];

    if (description.toLowerCase().includes('full') || description.toLowerCase().includes('racing')) {
      return ['All club events', 'Racing fees included', 'Voting rights', 'Club facilities access'];
    }

    if (description.toLowerCase().includes('casual') || description.toLowerCase().includes('social')) {
      return ['Club access', 'Pay per event', 'Social events', 'Limited facilities'];
    }

    return ['Club membership benefits'];
  };

  const handleContinue = () => {
    if (!selectedType) {
      alert('Please select a membership type');
      return;
    }

    const selected = membershipTypes.find(t => t.id === selectedType);
    if (!selected) return;

    onNext({
      membershipTypeId: selected.id,
      membershipTypeName: selected.name,
      membershipAmount: selected.amount,
    });
  };

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-center">
          <Loader className="animate-spin text-blue-500 w-6 h-6 sm:w-8 sm:h-8" />
          <span className={`ml-3 text-sm sm:text-base ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Loading memberships...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="w-full max-w-5xl mx-auto">
        <h2 className={`text-xl sm:text-2xl font-bold mb-1 sm:mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Choose Your Membership
        </h2>
        <p className={`mb-6 sm:mb-8 text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Select the membership type that best suits your needs
        </p>

        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {membershipTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`text-left p-4 sm:p-5 md:p-6 rounded-xl transition-all transform ${
                selectedType === type.id
                  ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-xl scale-[1.02]'
                  : darkMode
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 shadow'
              }`}
            >
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold mb-1">{type.name}</h3>
                  <p className={`text-xl sm:text-2xl font-bold ${selectedType === type.id ? 'text-white' : 'text-blue-500'}`}>
                    ${type.amount} {type.currency}
                    <span className={`text-xs sm:text-sm font-normal ml-1 ${
                      selectedType === type.id ? 'text-blue-100' : darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      /{type.renewal_period}
                    </span>
                  </p>
                </div>

                {selectedType === type.id && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Check className="text-white w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                )}
              </div>

              <p className={`text-xs sm:text-sm mb-3 sm:mb-4 ${
                selectedType === type.id ? 'text-blue-100' : darkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {type.description}
              </p>

              <div className="space-y-1.5 sm:space-y-2">
                {type.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Check size={14} className={`sm:w-4 sm:h-4 flex-shrink-0 ${selectedType === type.id ? 'text-blue-100' : 'text-green-500'}`} />
                    <span className={`text-xs sm:text-sm ${
                      selectedType === type.id ? 'text-white' : darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {membershipTypes.length > 0 && (
          <div className={`p-3 sm:p-4 rounded-lg ${darkMode ? 'bg-green-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'}`}>
            <p className={`text-xs sm:text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
              Most sailors choose the Full Member option for complete access to all club benefits.
            </p>
          </div>
        )}

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
            disabled={!selectedType}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-all text-sm sm:text-base ${
              selectedType
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-lg'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            Continue
            <ArrowRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

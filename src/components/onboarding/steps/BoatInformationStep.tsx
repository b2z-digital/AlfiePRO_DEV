import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Plus, Trash2, Anchor } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { supabase } from '../../../utils/supabase';

interface BoatInformationStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack: () => void;
}

interface Boat {
  type: string;
  sailNumber: string;
  hullName: string;
}

export const BoatInformationStep: React.FC<BoatInformationStepProps> = ({
  darkMode,
  formData,
  onNext,
  onBack,
}) => {
  const [boats, setBoats] = useState<Boat[]>(
    formData.boats.length > 0 ? formData.boats : [{ type: '', sailNumber: '', hullName: '' }]
  );
  const [skipBoats, setSkipBoats] = useState(false);

  // Boat types as defined in the system
  const boatTypes = ['DF65', 'DF95', '10R', 'IOM', 'Marblehead', 'A Class', 'RC Laser'];

  const addBoat = () => {
    setBoats([...boats, { type: '', sailNumber: '', hullName: '' }]);
    setSkipBoats(false);
  };

  const removeBoat = (index: number) => {
    if (boats.length === 1) {
      setBoats([{ type: '', sailNumber: '', hullName: '' }]);
    } else {
      setBoats(boats.filter((_, i) => i !== index));
    }
  };

  const updateBoat = (index: number, field: keyof Boat, value: string) => {
    const updated = [...boats];
    updated[index] = { ...updated[index], [field]: value };
    setBoats(updated);
  };

  const handleContinue = async () => {
    const validBoats = boats.filter(b => b.type || b.sailNumber || b.hullName);

    const completeBoats = validBoats.filter(b => b.type && b.sailNumber);

    if (validBoats.length > 0 && completeBoats.length !== validBoats.length) {
      alert('Please complete all boat information or remove incomplete entries');
      return;
    }

    // Validate no duplicate sail numbers in the club
    if (completeBoats.length > 0 && formData.clubId) {
      const duplicateCheck = await checkDuplicateSailNumbers(completeBoats, formData.clubId);
      if (duplicateCheck.hasDuplicates) {
        alert(`The following sail number(s) are already registered in this club: ${duplicateCheck.duplicates.join(', ')}. Please use a different sail number.`);
        return;
      }
    }

    onNext({
      boats: skipBoats ? [] : completeBoats,
    });
  };

  const checkDuplicateSailNumbers = async (boatsToCheck: Boat[], clubId: string) => {
    try {
      // First get all member IDs for this club
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id')
        .eq('club_id', clubId);

      if (membersError) {
        console.error('Error fetching members:', membersError);
        return { hasDuplicates: false, duplicates: [] };
      }

      if (!members || members.length === 0) {
        return { hasDuplicates: false, duplicates: [] };
      }

      const memberIds = members.map(m => m.id);

      // Now check for existing boats with these member IDs
      const { data: existingBoats, error } = await supabase
        .from('member_boats')
        .select('boat_type, sail_number')
        .in('member_id', memberIds);

      if (error) {
        console.error('Error checking duplicate sail numbers:', error);
        return { hasDuplicates: false, duplicates: [] };
      }

      const duplicates: string[] = [];

      for (const boat of boatsToCheck) {
        const isDuplicate = existingBoats?.some(
          eb => eb.boat_type === boat.type && eb.sail_number === boat.sailNumber
        );

        if (isDuplicate) {
          duplicates.push(`${boat.type} #${boat.sailNumber}`);
        }
      }

      return {
        hasDuplicates: duplicates.length > 0,
        duplicates
      };
    } catch (error) {
      console.error('Error in duplicate check:', error);
      return { hasDuplicates: false, duplicates: [] };
    }
  };


  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <Anchor className="text-blue-500 w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <h2 className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Your Boat(s)
          </h2>
        </div>
        <p className={`mb-4 sm:mb-6 text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Tell us about the boat(s) you'll be racing
        </p>

        <div className="space-y-4 sm:space-y-6">
          {boats.map((boat, index) => (
            <div
              key={index}
              className={`p-4 sm:p-5 md:p-6 rounded-xl ${
                darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-slate-50 border border-slate-200'
              }`}
            >
              <div className="flex justify-between items-center mb-3 sm:mb-4">
                <h3 className={`font-semibold text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  Boat {index + 1}
                </h3>
                {boats.length > 1 && (
                  <button
                    onClick={() => removeBoat(index)}
                    className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                      darkMode
                        ? 'text-red-400 hover:bg-red-500/10'
                        : 'text-red-600 hover:bg-red-50'
                    }`}
                  >
                    <Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>
                )}
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Boat Type / Class
                  </label>
                  <select
                    value={boat.type}
                    onChange={(e) => updateBoat(index, 'type', e.target.value)}
                    className={`w-full px-4 py-3 rounded-lg ${
                      darkMode
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-white text-slate-900 border-slate-300'
                    } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  >
                    <option value="">Select a boat type...</option>
                    {boatTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Sail Number
                    </label>
                    <input
                      type="text"
                      value={boat.sailNumber}
                      onChange={(e) => updateBoat(index, 'sailNumber', e.target.value)}
                      className={`w-full px-4 py-3 rounded-lg ${
                        darkMode
                          ? 'bg-slate-700 text-white border-slate-600'
                          : 'bg-white text-slate-900 border-slate-300'
                      } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="e.g., 911"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Hull Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={boat.hullName}
                      onChange={(e) => updateBoat(index, 'hullName', e.target.value)}
                      className={`w-full px-4 py-3 rounded-lg ${
                        darkMode
                          ? 'bg-slate-700 text-white border-slate-600'
                          : 'bg-white text-slate-900 border-slate-300'
                      } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="e.g., Sanga"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addBoat}
            className={`w-full p-3 sm:p-4 rounded-xl border-2 border-dashed transition-colors text-sm sm:text-base ${
              darkMode
                ? 'border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-400'
                : 'border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600'
            }`}
          >
            <Plus className="inline-block mr-2 w-4 h-4 sm:w-5 sm:h-5" />
            Add Another Boat
          </button>

          <button
            onClick={() => setSkipBoats(!skipBoats)}
            className={`w-full text-center py-2.5 sm:py-3 rounded-lg transition-colors text-sm sm:text-base ${
              skipBoats
                ? 'bg-green-500/10 text-blue-400 border border-blue-500/20'
                : darkMode
                ? 'text-slate-400 hover:text-slate-300'
                : 'text-slate-600 hover:text-slate-700'
            }`}
          >
            {skipBoats ? "I'll add my boat later (selected)" : "I'll add my boat later"}
          </button>
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
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-green-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            Continue
            <ArrowRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

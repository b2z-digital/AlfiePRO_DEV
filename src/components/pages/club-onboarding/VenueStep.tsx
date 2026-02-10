import React from 'react';
import { MapPin, Navigation, FileText } from 'lucide-react';
import { StepProps } from './types';

export const VenueStep: React.FC<StepProps> = ({
  formData,
  updateFormData,
  darkMode
}) => {
  const inputClass = `w-full px-4 py-3 rounded-xl border transition-all duration-200 ${
    darkMode
      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:bg-slate-700 focus:border-emerald-500'
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500'
  } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`;

  const labelClass = `block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`;

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-orange-500/20' : 'bg-orange-50'
        }`}>
          <MapPin className="text-orange-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Default Venue
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Set up your club's primary racing venue
        </p>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-2 mb-4">
          <Navigation className={darkMode ? 'text-orange-400' : 'text-orange-500'} size={18} />
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Venue Details
          </h4>
        </div>

        <div className="space-y-5">
          <div>
            <label className={labelClass}>
              Venue Name
            </label>
            <input
              type="text"
              value={formData.venueName}
              onChange={(e) => updateFormData({ venueName: e.target.value })}
              className={inputClass}
              placeholder="e.g., Teralba Sailing Club"
            />
          </div>

          <div>
            <label className={labelClass}>
              Address
            </label>
            <div className="relative">
              <MapPin className={`absolute left-3 top-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
              <input
                type="text"
                value={formData.venueAddress}
                onChange={(e) => updateFormData({ venueAddress: e.target.value })}
                className={`${inputClass} pl-10`}
                placeholder="e.g., 123 Lakeside Drive, Teralba NSW 2284"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Description
            </label>
            <div className="relative">
              <FileText className={`absolute left-3 top-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={16} />
              <textarea
                value={formData.venueDescription}
                onChange={(e) => updateFormData({ venueDescription: e.target.value })}
                rows={3}
                className={`${inputClass} pl-10 resize-none`}
                placeholder="Brief description of the venue, facilities, parking, etc."
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`p-4 rounded-xl border ${
        darkMode ? 'bg-slate-700/20 border-slate-600/30' : 'bg-blue-50 border-blue-200'
      }`}>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          You can add more venues and configure map coordinates later from the Venues page. This sets up your primary racing location.
        </p>
      </div>
    </div>
  );
};

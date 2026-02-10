import React, { useState, useEffect } from 'react';
import { Building, MapPin, Mail, Phone, Globe, Flag } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { loadGoogleMaps } from '../../../utils/googleMaps';
import { StepProps, COUNTRIES, COUNTRY_DEFAULTS } from './types';

interface StateAssociation {
  id: string;
  name: string;
  short_name: string;
}

export const BasicInfoStep: React.FC<StepProps & { stateAssociationId: string }> = ({
  formData,
  updateFormData,
  darkMode,
  stateAssociationId
}) => {
  const [stateAssociations, setStateAssociations] = useState<StateAssociation[]>([]);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    loadStateAssociations();
    loadGoogleMaps(() => setMapsReady(true));
  }, []);

  useEffect(() => {
    if (mapsReady) {
      const input = document.getElementById('onboarding-club-location') as HTMLInputElement;
      if (input && window.google) {
        const searchBox = new google.maps.places.SearchBox(input);
        searchBox.addListener('places_changed', () => {
          const places = searchBox.getPlaces();
          if (!places || places.length === 0) return;
          const place = places[0];
          updateFormData({
            location: place.formatted_address || place.name || formData.location
          });
        });
      }
    }
  }, [mapsReady]);

  const loadStateAssociations = async () => {
    const { data } = await supabase
      .from('state_associations')
      .select('id, name, short_name')
      .eq('status', 'active')
      .order('name');
    if (data) setStateAssociations(data);
  };

  const handleCountryChange = (country: string) => {
    const defaults = COUNTRY_DEFAULTS[country];
    const updates: any = { country };
    if (defaults) {
      updates.currency = defaults.currency;
      updates.taxName = defaults.taxName;
      updates.taxRate = defaults.taxRate;
      updates.taxEnabled = defaults.taxRate > 0;
    }
    updateFormData(updates);
  };

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
          darkMode ? 'bg-emerald-500/20' : 'bg-emerald-50'
        }`}>
          <Building className="text-emerald-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Club Details
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Let's start with the basics about your club
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <label className={labelClass}>
            Club Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            className={inputClass}
            placeholder="e.g., Port Stephens Radio Yacht Club"
          />
        </div>

        <div>
          <label className={labelClass}>
            Abbreviation <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.abbreviation}
            onChange={(e) => updateFormData({ abbreviation: e.target.value.toUpperCase() })}
            className={inputClass}
            placeholder="e.g., PSRYC"
            maxLength={10}
          />
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Max 10 characters
          </p>
        </div>

        <div>
          <label className={labelClass}>
            Country <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Flag className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
            <select
              value={formData.country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className={`${inputClass} pl-10 appearance-none cursor-pointer`}
            >
              <option value="">Select country...</option>
              {COUNTRIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {formData.country === 'Australia' && (
            <p className={`text-xs mt-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
              GST (10%) will be configured automatically
            </p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>Location</label>
          <div className="relative">
            <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
            <input
              id="onboarding-club-location"
              type="text"
              value={formData.location}
              onChange={(e) => updateFormData({ location: e.target.value })}
              className={`${inputClass} pl-10`}
              placeholder="Search for location..."
            />
          </div>
        </div>

        {stateAssociations.length > 0 && (
          <div className="md:col-span-2">
            <label className={labelClass}>State Association</label>
            <select
              value={stateAssociationId || ''}
              disabled
              className={`${inputClass} opacity-70 cursor-not-allowed`}
            >
              <option value="">None</option>
              {stateAssociations.map(sa => (
                <option key={sa.id} value={sa.id}>
                  {sa.name} ({sa.short_name})
                </option>
              ))}
            </select>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Automatically assigned to your association
            </p>
          </div>
        )}
      </div>

      <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <h4 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Contact Details
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateFormData({ email: e.target.value })}
                className={`${inputClass} pl-10`}
                placeholder="contact@club.com"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <div className="relative">
              <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateFormData({ phone: e.target.value })}
                className={`${inputClass} pl-10`}
                placeholder="(02) 1234 5678"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Website</label>
            <div className="relative">
              <Globe className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
              <input
                type="url"
                value={formData.website}
                onChange={(e) => updateFormData({ website: e.target.value })}
                className={`${inputClass} pl-10`}
                placeholder="https://www.club.com"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

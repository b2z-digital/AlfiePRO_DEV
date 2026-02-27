import React, { useState, useEffect } from 'react';
import { CheckCircle, Building, Palette, Sailboat, MapPin, Users, DollarSign, UserPlus } from 'lucide-react';
import { StepProps } from './types';
import { BoatClass } from '../../../types/boatClass';
import { getBoatClasses } from '../../../utils/boatClassStorage';

export const ReviewStep: React.FC<StepProps> = ({
  formData,
  darkMode
}) => {
  const [allClasses, setAllClasses] = useState<BoatClass[]>([]);

  useEffect(() => {
    getBoatClasses().then(setAllClasses).catch(() => {});
  }, []);

  const selectedClassNames = allClasses
    .filter(c => (formData.selectedBoatClassIds || []).includes(c.id))
    .map(c => c.name);

  const sectionClass = `p-4 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`;
  const labelClass = `text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`;
  const valueClass = `text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`;
  const emptyClass = `text-sm italic ${darkMode ? 'text-slate-500' : 'text-slate-400'}`;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-emerald-500/20' : 'bg-emerald-50'
        }`}>
          <CheckCircle className="text-emerald-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Review & Create
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Review your club setup before creating
        </p>
      </div>

      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-3">
          <Building size={16} className="text-emerald-500" />
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Club Details</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={labelClass}>Name</div>
            <div className={valueClass}>{formData.name || '-'}</div>
          </div>
          <div>
            <div className={labelClass}>Abbreviation</div>
            <div className={valueClass}>{formData.abbreviation || '-'}</div>
          </div>
          <div>
            <div className={labelClass}>Country</div>
            <div className={valueClass}>{formData.country || '-'}</div>
          </div>
          <div>
            <div className={labelClass}>Location</div>
            <div className={valueClass}>{formData.location || '-'}</div>
          </div>
          {formData.email && (
            <div>
              <div className={labelClass}>Email</div>
              <div className={valueClass}>{formData.email}</div>
            </div>
          )}
          {formData.phone && (
            <div>
              <div className={labelClass}>Phone</div>
              <div className={valueClass}>{formData.phone}</div>
            </div>
          )}
        </div>
      </div>

      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-3">
          <Palette size={16} className="text-blue-500" />
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Branding</h4>
        </div>
        <div className="flex items-center gap-4">
          {formData.logoPreview ? (
            <img src={formData.logoPreview} alt="Logo" className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-slate-600/50' : 'bg-slate-200'
            }`}>
              <Building size={20} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
            </div>
          )}
          <div className="flex-1">
            <div className={labelClass}>Logo</div>
            <div className={formData.logoPreview ? valueClass : emptyClass}>
              {formData.logoPreview ? 'Uploaded' : 'Not uploaded'}
            </div>
          </div>
          <div className="flex-1">
            <div className={labelClass}>Featured Image</div>
            <div className={formData.featuredImagePreview ? valueClass : emptyClass}>
              {formData.featuredImagePreview ? 'Uploaded' : 'Not uploaded'}
            </div>
          </div>
        </div>
        {formData.clubIntroduction && (
          <div className="mt-3">
            <div className={labelClass}>Introduction</div>
            <div className={`${valueClass} line-clamp-2`}>{formData.clubIntroduction}</div>
          </div>
        )}
      </div>

      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-3">
          <Sailboat size={16} className="text-sky-500" />
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Yacht Classes ({selectedClassNames.length})
          </h4>
        </div>
        {selectedClassNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedClassNames.map((name) => (
              <span
                key={name}
                className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                  darkMode
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'bg-sky-100 text-sky-700 border border-sky-200'
                }`}
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className={emptyClass}>No classes selected</p>
        )}
      </div>

      {formData.venueName && (
        <div className={sectionClass}>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-orange-500" />
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Default Venue</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={labelClass}>Name</div>
              <div className={valueClass}>{formData.venueName}</div>
            </div>
            {formData.venueAddress && (
              <div>
                <div className={labelClass}>Address</div>
                <div className={valueClass}>{formData.venueAddress}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {formData.membershipTypes.length > 0 && (
        <div className={sectionClass}>
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-cyan-500" />
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Membership Types ({formData.membershipTypes.length})
            </h4>
          </div>
          <div className="space-y-2">
            {formData.membershipTypes.map((type) => (
              <div
                key={type.id}
                className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                  darkMode ? 'bg-slate-600/30' : 'bg-white'
                }`}
              >
                <div>
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {type.name}
                  </span>
                  {type.description && (
                    <span className={`text-xs ml-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      - {type.description}
                    </span>
                  )}
                </div>
                <span className={`text-sm font-medium ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  ${type.amount}/{type.renewal_period === 'annual' ? 'yr' : type.renewal_period === 'monthly' ? 'mo' : type.renewal_period === 'quarterly' ? 'qtr' : 'life'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={16} className="text-green-500" />
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Finance</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={labelClass}>Currency</div>
            <div className={valueClass}>{formData.currency}</div>
          </div>
          <div>
            <div className={labelClass}>Tax</div>
            <div className={formData.taxEnabled ? valueClass : emptyClass}>
              {formData.taxEnabled ? `${formData.taxName} (${formData.taxRate}%)` : 'Disabled'}
            </div>
          </div>
        </div>
      </div>

      {formData.assignAdmin && (
        <div className={sectionClass}>
          <div className="flex items-center gap-2 mb-3">
            <UserPlus size={16} className="text-sky-500" />
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Club Admin</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={labelClass}>Name</div>
              <div className={valueClass}>{formData.adminFirstName} {formData.adminLastName}</div>
            </div>
            <div>
              <div className={labelClass}>Email</div>
              <div className={valueClass}>{formData.adminEmail}</div>
            </div>
          </div>
          {formData.sendInvitation && (
            <div className={`mt-2 text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
              An invitation email will be sent
            </div>
          )}
        </div>
      )}
    </div>
  );
};

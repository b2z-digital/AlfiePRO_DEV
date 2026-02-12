import React from 'react';
import { Users, Plus, Trash2, DollarSign, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { StepProps, MembershipTypeEntry } from './types';
import { v4 as uuidv4 } from 'uuid';

const RENEWAL_PERIODS = [
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'lifetime', label: 'Lifetime' },
] as const;

const MEMBERSHIP_TYPES = [
  { value: true, label: 'Full/Primary', description: 'Pays club + state + national fees' },
  { value: false, label: 'Associate/Secondary', description: 'Pays club fee only (no association fees)' },
] as const;

export const MembershipStep: React.FC<StepProps> = ({
  formData,
  updateFormData,
  darkMode
}) => {
  const hasPrimaryType = formData.membershipTypes.some(t => t.is_primary_type !== false);
  const hasAtLeastOneType = formData.membershipTypes.length > 0;

  const addType = () => {
    const newType: MembershipTypeEntry = {
      id: uuidv4(),
      name: '',
      description: '',
      amount: 0,
      currency: formData.currency || 'AUD',
      renewal_period: 'annual',
      is_primary_type: true, // Default to primary type
    };
    updateFormData({
      membershipTypes: [...formData.membershipTypes, newType]
    });
  };

  const updateType = (id: string, updates: Partial<MembershipTypeEntry>) => {
    updateFormData({
      membershipTypes: formData.membershipTypes.map(t =>
        t.id === id ? { ...t, ...updates } : t
      )
    });
  };

  const removeType = (id: string) => {
    const typeToRemove = formData.membershipTypes.find(t => t.id === id);
    const remainingTypes = formData.membershipTypes.filter(t => t.id !== id);

    // Prevent removing the last primary type
    if (typeToRemove?.is_primary_type !== false && remainingTypes.length > 0) {
      const hasOtherPrimaryType = remainingTypes.some(t => t.is_primary_type !== false);
      if (!hasOtherPrimaryType) {
        alert('You must have at least one Full/Primary membership type. Please add another Full membership before removing this one.');
        return;
      }
    }

    updateFormData({
      membershipTypes: remainingTypes
    });
  };

  const inputClass = `w-full px-4 py-2.5 rounded-lg border transition-all duration-200 ${
    darkMode
      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:bg-slate-700 focus:border-emerald-500'
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500'
  } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`;

  const labelClass = `block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-cyan-500/20' : 'bg-cyan-50'
        }`}>
          <Users className="text-cyan-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Membership Types
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Define the membership categories for your club
        </p>
      </div>

      {formData.membershipTypes.length === 0 && (
        <div className={`p-6 rounded-xl border text-center ${
          darkMode ? 'bg-slate-700/20 border-slate-600/50' : 'bg-slate-50 border-slate-200'
        }`}>
          <Users className={`mx-auto mb-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={36} />
          <h4 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            No membership types yet
          </h4>
          <p className={`text-sm mb-5 max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Every club has different membership structures. Add your membership types below, or skip this step and configure them later from the Membership Settings page.
          </p>
          <button
            onClick={addType}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors text-sm"
          >
            <Plus size={16} />
            Add Membership Type
          </button>
        </div>
      )}

      {/* Warning: No Primary Type */}
      {hasAtLeastOneType && !hasPrimaryType && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'
        }`}>
          <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="text-red-500 font-semibold text-sm mb-1">Primary Membership Required</h4>
            <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
              You must have at least one Full/Primary membership type. This ensures new members can join your club and pay the required state/national association fees.
            </p>
          </div>
        </div>
      )}

      {/* Success: Has Primary Type */}
      {hasAtLeastOneType && hasPrimaryType && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          darkMode ? 'bg-green-500/10 border-green-500/30' : 'bg-green-50 border-green-200'
        }`}>
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="text-green-500 font-semibold text-sm mb-1">All Set!</h4>
            <p className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
              You have a Full/Primary membership type configured. New members will be automatically guided to this membership.
            </p>
          </div>
        </div>
      )}

      {formData.membershipTypes.length > 0 && (
        <div className="space-y-4">
          {formData.membershipTypes.map((type, index) => (
            <div
              key={type.id}
              className={`p-4 rounded-xl border transition-all ${
                darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold uppercase tracking-wider ${
                  darkMode ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  Type {index + 1}
                </span>
                <button
                  onClick={() => removeType(type.id)}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className={labelClass}>Membership Type <span className="text-red-500">*</span></label>
                  <select
                    value={type.is_primary_type === false ? 'false' : 'true'}
                    onChange={(e) => updateType(type.id, { is_primary_type: e.target.value === 'true' })}
                    className={`${inputClass} cursor-pointer`}
                  >
                    {MEMBERSHIP_TYPES.map(mt => (
                      <option key={String(mt.value)} value={String(mt.value)}>
                        {mt.label} - {mt.description}
                      </option>
                    ))}
                  </select>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                    {type.is_primary_type !== false
                      ? 'Recommended for new members joining your club'
                      : 'For members who already belong to another club in your association'
                    }
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={type.name}
                    onChange={(e) => updateType(type.id, { name: e.target.value })}
                    className={inputClass}
                    placeholder="e.g., Full Member"
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <input
                    type="text"
                    value={type.description}
                    onChange={(e) => updateType(type.id, { description: e.target.value })}
                    className={inputClass}
                    placeholder="Brief description"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <span className="flex items-center gap-1">
                      <DollarSign size={12} />
                      Amount ({formData.currency || 'AUD'})
                    </span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={type.amount}
                    onChange={(e) => updateType(type.id, { amount: parseFloat(e.target.value) || 0 })}
                    className={inputClass}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      Renewal Period
                    </span>
                  </label>
                  <select
                    value={type.renewal_period}
                    onChange={(e) => updateType(type.id, { renewal_period: e.target.value as any })}
                    className={`${inputClass} cursor-pointer`}
                  >
                    {RENEWAL_PERIODS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addType}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm ${
              darkMode
                ? 'bg-slate-700/50 border border-slate-600 hover:border-emerald-500 text-slate-300 hover:text-white'
                : 'bg-white border border-slate-300 hover:border-emerald-500 text-slate-700'
            }`}
          >
            <Plus size={16} />
            Add Another Type
          </button>
        </div>
      )}

      <div className={`p-4 rounded-xl border ${
        darkMode ? 'bg-slate-700/20 border-slate-600/30' : 'bg-blue-50 border-blue-200'
      }`}>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          This step is optional. You can skip it and configure membership types later once the club admin has set up their account.
        </p>
      </div>
    </div>
  );
};

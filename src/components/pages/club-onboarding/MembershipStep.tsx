import React from 'react';
import { Users, Plus, Trash2, DollarSign, Calendar } from 'lucide-react';
import { StepProps, MembershipTypeEntry } from './types';
import { v4 as uuidv4 } from 'uuid';

const RENEWAL_PERIODS = [
  { value: 'annual', label: 'Annual' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'lifetime', label: 'Lifetime' },
] as const;

export const MembershipStep: React.FC<StepProps> = ({
  formData,
  updateFormData,
  darkMode
}) => {
  const addType = () => {
    const newType: MembershipTypeEntry = {
      id: uuidv4(),
      name: '',
      description: '',
      amount: 0,
      currency: formData.currency || 'AUD',
      renewal_period: 'annual',
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
    updateFormData({
      membershipTypes: formData.membershipTypes.filter(t => t.id !== id)
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

import React from 'react';
import { DollarSign, Receipt, Percent, Info } from 'lucide-react';
import { StepProps, CURRENCIES } from './types';

export const FinanceStep: React.FC<StepProps> = ({
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
          darkMode ? 'bg-green-500/20' : 'bg-green-50'
        }`}>
          <DollarSign className="text-green-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Finance & Tax
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Configure your club's financial settings
        </p>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-2 mb-4">
          <Receipt className={darkMode ? 'text-green-400' : 'text-green-500'} size={18} />
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Currency
          </h4>
        </div>

        <div>
          <label className={labelClass}>Default Currency</label>
          <select
            value={formData.currency}
            onChange={(e) => updateFormData({ currency: e.target.value })}
            className={`${inputClass} cursor-pointer`}
          >
            {CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          {formData.country && (
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Auto-selected based on your country ({formData.country})
            </p>
          )}
        </div>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Percent className={darkMode ? 'text-green-400' : 'text-green-500'} size={18} />
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Tax Settings
            </h4>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Enable Tax
            </span>
            <div className="relative">
              <input
                type="checkbox"
                checked={formData.taxEnabled}
                onChange={(e) => updateFormData({ taxEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-600 rounded-full peer peer-checked:bg-emerald-500 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
        </div>

        {formData.taxEnabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tax Name</label>
              <input
                type="text"
                value={formData.taxName}
                onChange={(e) => updateFormData({ taxName: e.target.value })}
                className={inputClass}
                placeholder="e.g., GST, VAT"
              />
            </div>
            <div>
              <label className={labelClass}>Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.taxRate}
                onChange={(e) => updateFormData({ taxRate: parseFloat(e.target.value) || 0 })}
                className={inputClass}
                placeholder="e.g., 10"
              />
            </div>
          </div>
        )}

        {formData.taxEnabled && formData.country === 'Australia' && (
          <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
            darkMode ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'
          }`}>
            <Info size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
            <p className={`text-xs ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
              GST at 10% has been configured as the default for Australian clubs. This will be applied to invoices and transactions where applicable.
            </p>
          </div>
        )}

        {!formData.taxEnabled && (
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Tax is currently disabled. You can enable it later from the Finance Settings page.
          </p>
        )}
      </div>

      <div className={`p-4 rounded-xl border ${
        darkMode ? 'bg-slate-700/20 border-slate-600/30' : 'bg-blue-50 border-blue-200'
      }`}>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Additional finance settings like budget categories, invoice numbering, and Stripe payment integration can be configured later from the Finance Settings page.
        </p>
      </div>
    </div>
  );
};

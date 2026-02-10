import React from 'react';
import { UserPlus, Mail, Send } from 'lucide-react';
import { StepProps } from './types';

export const AdminStep: React.FC<StepProps> = ({
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
          darkMode ? 'bg-sky-500/20' : 'bg-sky-50'
        }`}>
          <UserPlus className="text-sky-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Club Admin
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Optionally assign someone to manage this club
        </p>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.assignAdmin}
            onChange={(e) => updateFormData({ assignAdmin: e.target.checked })}
            className="mt-1 w-5 h-5 rounded border-slate-400 text-emerald-500 focus:ring-emerald-500"
          />
          <div>
            <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Assign an admin to this club
            </div>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              The admin will have full control over club settings, members, races, and finances
            </p>
          </div>
        </label>
      </div>

      {formData.assignAdmin && (
        <div className={`p-5 rounded-xl border space-y-4 ${
          darkMode ? 'bg-slate-700/30 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
        }`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.adminFirstName}
                onChange={(e) => updateFormData({ adminFirstName: e.target.value })}
                className={inputClass}
                placeholder="John"
              />
            </div>
            <div>
              <label className={labelClass}>
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.adminLastName}
                onChange={(e) => updateFormData({ adminLastName: e.target.value })}
                className={inputClass}
                placeholder="Smith"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
              <input
                type="email"
                value={formData.adminEmail}
                onChange={(e) => updateFormData({ adminEmail: e.target.value })}
                className={`${inputClass} pl-10`}
                placeholder="admin@email.com"
              />
            </div>
          </div>

          <div className={`p-3 rounded-lg border ${
            darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-slate-200'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.sendInvitation}
                onChange={(e) => updateFormData({ sendInvitation: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-slate-400 text-emerald-500 focus:ring-emerald-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Send size={14} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                  <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Send invitation email
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  The admin will receive an email to join and set up their account
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {!formData.assignAdmin && (
        <div className={`p-4 rounded-xl border ${
          darkMode ? 'bg-slate-700/20 border-slate-600/30' : 'bg-blue-50 border-blue-200'
        }`}>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            You can assign an admin later from the club management page. The club will appear in your clubs list
            and you'll maintain full access until an admin is assigned.
          </p>
        </div>
      )}
    </div>
  );
};

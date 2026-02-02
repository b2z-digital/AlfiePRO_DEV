import React, { useState } from 'react';
import { Shield, DollarSign, FileText, Calendar, Users, Eye } from 'lucide-react';

interface CommitteePositionFormProps {
  darkMode: boolean;
  onSubmit: (data: PositionFormData) => void;
  onCancel: () => void;
  initialData?: PositionFormData;
}

export interface PositionFormData {
  position_name: string;
  description: string;
  permissions: {
    admin: boolean;
    editor: boolean;
    race_officer: boolean;
    treasurer: boolean;
    finance_viewer: boolean;
  };
}

const permissionOptions = [
  {
    key: 'admin' as const,
    label: 'Admin',
    description: 'Full access to all club management features',
    icon: Shield,
    color: 'text-red-400'
  },
  {
    key: 'editor' as const,
    label: 'Editor',
    description: 'Manage content (news, media, articles)',
    icon: FileText,
    color: 'text-blue-400'
  },
  {
    key: 'race_officer' as const,
    label: 'Race Officer',
    description: 'Manage races, results, and events',
    icon: Calendar,
    color: 'text-green-400'
  },
  {
    key: 'treasurer' as const,
    label: 'Treasurer',
    description: 'Full finance management and reporting',
    icon: DollarSign,
    color: 'text-amber-400'
  },
  {
    key: 'finance_viewer' as const,
    label: 'Finance Viewer',
    description: 'View-only access to financial data',
    icon: Eye,
    color: 'text-purple-400'
  }
];

export const CommitteePositionForm: React.FC<CommitteePositionFormProps> = ({
  darkMode,
  onSubmit,
  onCancel,
  initialData
}) => {
  const [formData, setFormData] = useState<PositionFormData>(
    initialData || {
      position_name: '',
      description: '',
      permissions: {
        admin: false,
        editor: false,
        race_officer: false,
        treasurer: false,
        finance_viewer: false
      }
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const togglePermission = (key: keyof PositionFormData['permissions']) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key]
      }
    }));
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${darkMode ? 'bg-slate-800/30' : 'bg-white'} rounded-lg border ${darkMode ? 'border-slate-700/50' : 'border-slate-200'} p-6`}>
      <div>
        <h3 className={`text-lg font-semibold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          {initialData ? 'Edit Committee Position' : 'Add Committee Position'}
        </h3>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Define the position and set access permissions
        </p>
      </div>

      {/* Basic Information */}
      <div className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${
            darkMode ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Position Name *
          </label>
          <input
            type="text"
            value={formData.position_name}
            onChange={(e) => setFormData({ ...formData, position_name: e.target.value })}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
            } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            placeholder="e.g., President, Treasurer, Secretary"
            required
          />
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${
            darkMode ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
            } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            placeholder="Brief description of the role and responsibilities"
            rows={3}
          />
        </div>
      </div>

      {/* Permissions Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Shield className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} size={20} />
          <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Access Permissions
          </h4>
        </div>
        <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Select which areas this position can access. Multiple permissions can be assigned.
        </p>

        <div className="space-y-3">
          {permissionOptions.map((option) => {
            const Icon = option.icon;
            const isActive = formData.permissions[option.key];

            return (
              <div
                key={option.key}
                className={`relative border rounded-lg transition-all ${
                  isActive
                    ? darkMode
                      ? 'bg-slate-700/50 border-emerald-500/50'
                      : 'bg-emerald-50 border-emerald-300'
                    : darkMode
                    ? 'bg-slate-700/20 border-slate-600/50'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <label className="flex items-start p-4 cursor-pointer">
                  <div className="flex items-start gap-3 flex-1">
                    <Icon className={`${option.color} mt-0.5`} size={20} />
                    <div className="flex-1">
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {option.label}
                      </div>
                      <p className={`text-sm mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {option.description}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => togglePermission(option.key)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                      isActive ? 'bg-emerald-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>
              </div>
            );
          })}
        </div>

        <div className={`mt-4 p-3 rounded-lg border ${
          darkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
        }`}>
          <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
            <strong>Note:</strong> Members assigned to this position will automatically receive these permissions.
            Standard members without committee positions have basic viewing access only.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
            darkMode
              ? 'bg-slate-700 hover:bg-slate-600 text-white'
              : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
          }`}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
        >
          {initialData ? 'Save Changes' : 'Create Position'}
        </button>
      </div>
    </form>
  );
};

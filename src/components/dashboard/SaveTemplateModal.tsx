import React, { useState } from 'react';
import { LogOut, Save, LayoutGrid } from 'lucide-react';
import { DashboardLayout } from '../../types/dashboard';

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, icon: string, isPublic: boolean) => Promise<void>;
  currentLayout: DashboardLayout;
  darkMode: boolean;
}

const ICON_OPTIONS = [
  { value: 'LayoutGrid', label: 'Layout Grid' },
  { value: 'Calendar', label: 'Calendar' },
  { value: 'DollarSign', label: 'Dollar Sign' },
  { value: 'Users', label: 'Users' },
  { value: 'TrendingUp', label: 'Trending Up' },
  { value: 'BarChart', label: 'Bar Chart' },
  { value: 'PieChart', label: 'Pie Chart' },
  { value: 'Activity', label: 'Activity' }
];

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentLayout,
  darkMode
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('LayoutGrid');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave(name, description, icon, isPublic);
      setName('');
      setDescription('');
      setIcon('LayoutGrid');
      setIsPublic(false);
      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className={`${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} px-6 py-4 border-b flex items-center justify-between`}>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save Dashboard as Template
          </h2>
          <button
            onClick={onClose}
            className={`${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} p-2 rounded-lg transition-colors`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Template Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Custom Dashboard"
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template is for..."
              rows={3}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Icon
            </label>
            <select
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            >
              {ICON_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <div className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Make this template public
                </div>
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Other clubs in your organization can use this template
                </div>
              </div>
            </label>
          </div>

          <div className={`${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg p-4`}>
            <div className="flex items-start gap-2">
              <LayoutGrid className={`w-5 h-5 mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <div>
                <div className={`text-sm font-medium mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                  Current Layout Summary
                </div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {currentLayout.rows.length} rows, {currentLayout.widgets.length} widgets
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} px-6 py-4 border-t flex items-center justify-end gap-3`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium ${
              darkMode
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
            } transition-colors`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
              !name.trim() || saving
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white transition-colors`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
};

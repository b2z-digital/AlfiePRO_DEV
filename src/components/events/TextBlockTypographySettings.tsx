import React, { useState } from 'react';

interface TypographyStyle {
  font_family: string;
  font_size: string;
  line_height: string;
}

interface Props {
  settings: any;
  onChange: (key: string, value: any) => void;
  darkMode?: boolean;
  getCurrentValue?: (key: string, defaultValue?: any) => any;
}

const fontOptions = [
  { label: 'Inherit', value: 'inherit' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Open Sans', value: 'Open Sans' },
  { label: 'Lato', value: 'Lato' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Raleway', value: 'Raleway' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Merriweather', value: 'Merriweather' },
  { label: 'PT Sans', value: 'PT Sans' },
  { label: 'Nunito', value: 'Nunito' },
  { label: 'System Sans', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'System Serif', value: 'Georgia, serif' },
  { label: 'Monospace', value: 'monospace' }
];

const lineHeightOptions = [
  { label: 'Tight (1.2)', value: '1.2' },
  { label: 'Snug (1.25)', value: '1.25' },
  { label: 'Normal (1.4)', value: '1.4' },
  { label: 'Relaxed (1.6)', value: '1.6' },
  { label: 'Loose (2)', value: '2' }
];

export const TextBlockTypographySettings: React.FC<Props> = ({ settings, onChange, darkMode = false, getCurrentValue }) => {
  const [activeTab, setActiveTab] = useState<'h1' | 'h2' | 'h3' | 'normal'>('h1');

  const tabs = [
    { id: 'h1' as const, label: 'Heading 1', preview: 'H1' },
    { id: 'h2' as const, label: 'Heading 2', preview: 'H2' },
    { id: 'h3' as const, label: 'Heading 3', preview: 'H3' },
    { id: 'normal' as const, label: 'Normal Text', preview: 'Normal' }
  ];

  const getSettingKey = (base: string) => `${activeTab}_${base}`;

  const getValue = (base: string, defaultValue: string) => {
    const key = getSettingKey(base);
    // Use getCurrentValue if provided (for responsive support), otherwise fall back to settings
    if (getCurrentValue) {
      return getCurrentValue(key, defaultValue);
    }
    return settings[key] ?? defaultValue;
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={`block text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Typography Settings
        </label>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-lg font-medium transition-all text-sm ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-white'
                  : darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.preview}
            </button>
          ))}
        </div>

        <div className={`p-4 rounded-lg border ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <h4 className={`text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            {tabs.find(t => t.id === activeTab)?.label} Styling
          </h4>

          <div className="space-y-3">
            <div>
              <label className={`block text-xs mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Font Family
              </label>
              <select
                value={getValue('font_family', 'Roboto')}
                onChange={(e) => onChange(getSettingKey('font_family'), e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
              >
                {fontOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Font Size (px)
                </label>
                <input
                  type="number"
                  value={getValue('font_size', activeTab === 'h1' ? '32' : activeTab === 'h2' ? '24' : activeTab === 'h3' ? '18' : '14')}
                  onChange={(e) => onChange(getSettingKey('font_size'), e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                  min="8"
                  max="120"
                />
              </div>

              <div>
                <label className={`block text-xs mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Line Height
                </label>
                <select
                  value={getValue('line_height', activeTab === 'normal' ? '1.6' : '1.2')}
                  onChange={(e) => onChange(getSettingKey('line_height'), e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                >
                  {lineHeightOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

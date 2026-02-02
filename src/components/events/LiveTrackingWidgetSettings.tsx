import React from 'react';

interface LiveTrackingWidgetSettingsProps {
  settings: any;
  onUpdate: (settings: any) => void;
}

export default function LiveTrackingWidgetSettings({ settings, onUpdate }: LiveTrackingWidgetSettingsProps) {
  const currentSettings = {
    title: settings?.title || 'Live Race Tracking',
    description: settings?.description || 'Track your performance in real-time during the event',
    showInstructions: settings?.showInstructions !== false,
    backgroundColor: settings?.backgroundColor || 'bg-gray-800',
    textColor: settings?.textColor || 'text-white',
    accentColor: settings?.accentColor || 'cyan',
  };

  const handleChange = (field: string, value: any) => {
    onUpdate({
      ...currentSettings,
      [field]: value,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Widget Title
        </label>
        <input
          type="text"
          value={currentSettings.title}
          onChange={(e) => handleChange('title', e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="Live Race Tracking"
        />
        <p className="text-xs text-gray-400 mt-1">Main heading shown at the top of the widget</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
        <textarea
          value={currentSettings.description}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={2}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="Track your performance in real-time during the event"
        />
        <p className="text-xs text-gray-400 mt-1">Subtitle shown below the title</p>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={currentSettings.showInstructions}
            onChange={(e) => handleChange('showInstructions', e.target.checked)}
            className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
          />
          <span className="text-sm font-medium text-gray-300">Show Instructions</span>
        </label>
        <p className="text-xs text-gray-400 mt-1 ml-6">Display helpful tips at the bottom of the widget</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Accent Color
        </label>
        <select
          value={currentSettings.accentColor}
          onChange={(e) => handleChange('accentColor', e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        >
          <option value="cyan">Cyan (Default)</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
          <option value="purple">Purple</option>
          <option value="pink">Pink</option>
          <option value="orange">Orange</option>
          <option value="red">Red</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">Primary color used for highlights and buttons</p>
      </div>

      <div className="border-t border-gray-700 pt-6">
        <h4 className="text-sm font-medium text-gray-300 mb-4">Advanced Styling</h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Background Color
            </label>
            <input
              type="text"
              value={currentSettings.backgroundColor}
              onChange={(e) => handleChange('backgroundColor', e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono text-sm"
              placeholder="bg-gray-800"
            />
            <p className="text-xs text-gray-500 mt-1">Tailwind CSS class for background (e.g., bg-gray-800)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Text Color
            </label>
            <input
              type="text"
              value={currentSettings.textColor}
              onChange={(e) => handleChange('textColor', e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono text-sm"
              placeholder="text-white"
            />
            <p className="text-xs text-gray-500 mt-1">Tailwind CSS class for text (e.g., text-white)</p>
          </div>
        </div>
      </div>

      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
        <h4 className="text-sm font-medium text-cyan-400 mb-2">How Live Tracking Works</h4>
        <ul className="space-y-1 text-xs text-gray-300">
          <li>• Skippers select their profile from the list</li>
          <li>• Real-time updates appear as races are scored</li>
          <li>• Shows current position, points, and recent results</li>
          <li>• No account or app download required</li>
        </ul>
      </div>
    </div>
  );
}

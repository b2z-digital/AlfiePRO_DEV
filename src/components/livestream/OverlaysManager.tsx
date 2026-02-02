import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Hash, Users, AlertCircle, Trophy } from 'lucide-react';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamSession, OverlayConfig } from '../../types/livestream';

interface OverlaysManagerProps {
  session: LivestreamSession;
  onUpdate?: (session: LivestreamSession) => void;
}

export function OverlaysManager({ session, onUpdate }: OverlaysManagerProps) {
  const [config, setConfig] = useState<OverlayConfig>(session.overlay_config);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState('Live - Racing');
  const [showStatusEditor, setShowStatusEditor] = useState(false);

  useEffect(() => {
    setConfig(session.overlay_config);
  }, [session.overlay_config]);

  const updateConfig = async (updates: Partial<OverlayConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    try {
      setSaving(true);
      // If statusText is being updated, include it
      if ('statusText' in updates) {
        newConfig.statusText = updates.statusText || statusText;
      }

      await livestreamStorage.updateSession(session.id, {
        overlay_config: newConfig
      });

      if (onUpdate) {
        onUpdate({ ...session, overlay_config: newConfig });
      }
    } catch (error) {
      console.error('Error updating overlay config:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleOverlay = (key: keyof OverlayConfig) => {
    if (typeof config[key] === 'boolean') {
      updateConfig({ [key]: !config[key] });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Stream Overlays</h3>
        <p className="text-sm text-gray-400">
          Configure which overlays appear during your livestream
        </p>
      </div>

      {/* Overlay Toggles */}
      <div className="space-y-4">
        {/* Race Number / Heat */}
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Hash className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Race Number / Heat</h4>
                <p className="text-sm text-gray-400">Display current race or heat number</p>
              </div>
            </div>
            <button
              onClick={() => toggleOverlay('showHeatNumber')}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                config.showHeatNumber ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  config.showHeatNumber ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {config.showHeatNumber && (
            <div className="pl-14 space-y-2">
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2">Preview Position</p>
                <div className="text-sm text-gray-300">Top Right Corner</div>
              </div>
            </div>
          )}
        </div>

        {/* Skippers List */}
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Skippers List</h4>
                <p className="text-sm text-gray-400">Show live standings with sail numbers</p>
              </div>
            </div>
            <button
              onClick={() => toggleOverlay('showSkippers')}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                config.showSkippers ? 'bg-green-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  config.showSkippers ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {config.showSkippers && (
            <div className="pl-14 space-y-2">
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2">Preview Position</p>
                <div className="text-sm text-gray-300">Top Left Corner (Vertical List)</div>
              </div>

              {/* Show Handicaps Toggle */}
              <div className="flex items-center justify-between bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                <label className="text-sm text-gray-300">Show Handicaps</label>
                <button
                  onClick={() => toggleOverlay('showHandicaps')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.showHandicaps ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.showHandicaps ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status Updates */}
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-600 rounded-lg">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Status Updates</h4>
                <p className="text-sm text-gray-400">Display race status (On-hold, Live, etc.)</p>
              </div>
            </div>
            <button
              onClick={() => toggleOverlay('showStandings')}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                config.showStandings ? 'bg-orange-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  config.showStandings ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {config.showStandings && (
            <div className="pl-14 space-y-2">
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2">Preview Position</p>
                <div className="text-sm text-gray-300">Bottom Center</div>
              </div>

              {/* Status Text Customization */}
              <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
                <label className="block text-xs text-gray-400 mb-2">Custom Status Text</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    placeholder="e.g., Live - Racing, On Hold, etc."
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => updateConfig({ statusText })}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-medium transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Weather (Existing) */}
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-600 rounded-lg">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Weather Conditions</h4>
                <p className="text-sm text-gray-400">Show wind speed and direction</p>
              </div>
            </div>
            <button
              onClick={() => toggleOverlay('showWeather')}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                config.showWeather ? 'bg-cyan-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  config.showWeather ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Theme Selection */}
      <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
        <h4 className="font-semibold text-white mb-3">Overlay Theme</h4>
        <div className="grid grid-cols-3 gap-3">
          {(['dark', 'light', 'transparent'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => updateConfig({ theme })}
              className={`p-3 rounded-lg border-2 transition-all ${
                config.theme === theme
                  ? 'border-blue-500 bg-blue-500/20'
                  : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
              }`}
            >
              <div className="text-sm font-medium text-white capitalize">{theme}</div>
              <div className="text-xs text-gray-400 mt-1">
                {theme === 'dark' && 'Best for bright conditions'}
                {theme === 'light' && 'Best for dark conditions'}
                {theme === 'transparent' && 'Minimal overlay'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Status Position */}
      <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
        <h4 className="font-semibold text-white mb-3">Status Position</h4>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'left', label: 'Bottom Left' },
            { value: 'bottom', label: 'Bottom Center' },
            { value: 'right', label: 'Bottom Right' }
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateConfig({ position: value })}
              className={`p-3 rounded-lg border-2 transition-all ${
                config.position === value
                  ? 'border-blue-500 bg-blue-500/20'
                  : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
              }`}
            >
              <div className="text-sm font-medium text-white">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview Notice */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Eye className="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-300 mb-1">Live Preview</h4>
            <p className="text-sm text-blue-200/80">
              Your overlay settings will appear in the 'Start Test Stream' preview and during live broadcasts.
              Overlays update automatically as race data changes.
            </p>
          </div>
        </div>
      </div>

      {saving && (
        <div className="text-center text-sm text-gray-400">
          Saving changes...
        </div>
      )}
    </div>
  );
}

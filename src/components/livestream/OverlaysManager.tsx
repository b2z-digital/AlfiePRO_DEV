import React, { useState, useEffect } from 'react';
import { Hash, Users, CircleAlert as AlertCircle, Trophy, Eye, ChevronDown } from 'lucide-react';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamSession, OverlayConfig } from '../../types/livestream';

interface OverlayItem {
  id: string;
  key: keyof OverlayConfig;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  description: string;
  position: string;
  hasSubToggle?: boolean;
  subToggleKey?: keyof OverlayConfig;
  subToggleLabel?: string;
  hasCustomText?: boolean;
}

interface OverlaysManagerProps {
  session: LivestreamSession;
  onUpdate?: (session: LivestreamSession) => void;
}

export function OverlaysManager({ session, onUpdate }: OverlaysManagerProps) {
  const [config, setConfig] = useState<OverlayConfig>(session.overlay_config);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState(session.overlay_config?.statusText || 'Live - Racing');
  const [expandedOverlay, setExpandedOverlay] = useState<string | null>(null);

  useEffect(() => {
    setConfig(session.overlay_config);
  }, [session.overlay_config]);

  const updateConfig = async (updates: Partial<OverlayConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      setSaving(true);
      if ('statusText' in updates) {
        newConfig.statusText = updates.statusText || statusText;
      }
      await livestreamStorage.updateSession(session.id, { overlay_config: newConfig });
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

  const fleetOpacity = Math.min(0.9, Math.max(0.25, Number(config?.fleetOpacity ?? 0.58)));

  const toggleExpand = (id: string) => {
    setExpandedOverlay(expandedOverlay === id ? null : id);
  };

  const overlays: OverlayItem[] = [
    {
      id: 'heat',
      key: 'showHeatNumber' as keyof OverlayConfig,
      icon: <Hash className="w-3.5 h-3.5" />,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/15',
      label: 'Race bar',
      description: 'Race or heat, status and time',
      position: 'Bottom left',
    },
    {
      id: 'skippers',
      key: 'showSkippers' as keyof OverlayConfig,
      icon: <Users className="w-3.5 h-3.5" />,
      color: 'text-green-400',
      bgColor: 'bg-green-500/15',
      label: 'Fleet list',
      description: 'Every boat: sail no., skipper, boat type. Finishers move up',
      position: 'Top right',
    },
    {
      id: 'status',
      key: 'showStandings' as keyof OverlayConfig,
      icon: <AlertCircle className="w-3.5 h-3.5" />,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/15',
      label: 'Results card',
      description: 'Each race\'s results for 20 seconds when it\'s scored',
      position: 'Centre',
    },
    {
      id: 'weather',
      key: 'showWeather' as keyof OverlayConfig,
      icon: <Trophy className="w-3.5 h-3.5" />,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/15',
      label: 'Wind',
      description: 'Shown in the race bar when weather is available',
      position: 'Race bar',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {overlays.map((overlay) => {
          const isEnabled = !!config[overlay.key];
          const isExpanded = expandedOverlay === overlay.id;
          const hasExpandableContent = overlay.hasSubToggle || overlay.hasCustomText;

          return (
            <div key={overlay.id} className="rounded-lg border border-[#3a3a40] overflow-hidden bg-[#1a1a1e]">
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${overlay.bgColor}`}>
                  <span className={overlay.color}>{overlay.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white font-medium">{overlay.label}</span>
                    {isEnabled && hasExpandableContent && (
                      <button
                        onClick={() => toggleExpand(overlay.id)}
                        className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 leading-tight">{overlay.description}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleOverlay(overlay.key)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-[18px] bg-[#3a3a40] peer-focus:ring-1 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-[14px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>

              {isEnabled && isExpanded && (
                <div className="px-3 pb-2.5 space-y-2 border-t border-[#3a3a40]/50 pt-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">Position</span>
                    <span className="text-slate-400">{overlay.position}</span>
                  </div>

                  {overlay.hasSubToggle && overlay.subToggleKey && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{overlay.subToggleLabel}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!config[overlay.subToggleKey]}
                          onChange={() => toggleOverlay(overlay.subToggleKey!)}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-[16px] bg-[#3a3a40] rounded-full peer peer-checked:after:translate-x-[12px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:rounded-full after:h-[12px] after:w-[12px] after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    </div>
                  )}

                  {overlay.hasCustomText && (
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Status text</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={statusText}
                          onChange={(e) => setStatusText(e.target.value)}
                          onBlur={() => updateConfig({ statusText })}
                          onKeyDown={(e) => { if (e.key === 'Enter') updateConfig({ statusText }); }}
                          placeholder="e.g., Live - Racing"
                          className="flex-1 px-2 py-1 bg-[#232328] border border-[#3a3a40] rounded text-white text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#3a3a40] pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="alv-see-through" className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">See-through</label>
          <span className="text-[11px] text-slate-400">{Math.round((1 - fleetOpacity) * 100)}% clear</span>
        </div>
        <input
          id="alv-see-through"
          type="range"
          min={10}
          max={75}
          step={5}
          value={Math.round((1 - fleetOpacity) * 100)}
          onChange={(e) => setConfig({ ...config, fleetOpacity: 1 - Number(e.target.value) / 100 })}
          onPointerUp={(e) => updateConfig({ fleetOpacity: 1 - Number((e.target as HTMLInputElement).value) / 100 })}
          onKeyUp={(e) => updateConfig({ fleetOpacity: 1 - Number((e.target as HTMLInputElement).value) / 100 })}
          className="w-full accent-blue-500"
        />
        <p className="text-[10px] text-slate-500 leading-relaxed">How much of the racing shows through the fleet list, race bar and cards.</p>
      </div>

      <div className="flex items-center gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
        <Eye className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <p className="text-[10px] text-blue-300/80 leading-relaxed">
          Overlays update automatically during preview and live broadcasts.
        </p>
      </div>
    </div>
  );
}

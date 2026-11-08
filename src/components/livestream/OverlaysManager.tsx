import { useState, useEffect } from 'react';
import { livestreamStorage } from '../../utils/livestreamStorage';
import type { LivestreamSession, OverlayConfig } from '../../types/livestream';

interface OverlayItem {
  id: string;
  key: keyof OverlayConfig;
  label: string;
  description: string;
}

interface OverlaysManagerProps {
  session: LivestreamSession;
  onUpdate?: (session: LivestreamSession) => void;
}

export function OverlaysManager({ session, onUpdate }: OverlaysManagerProps) {
  const [config, setConfig] = useState<OverlayConfig>(session.overlay_config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(session.overlay_config);
  }, [session.overlay_config]);

  const updateConfig = async (updates: Partial<OverlayConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      setSaving(true);
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
    updateConfig({ [key]: !config?.[key] });
  };

  const fleetOpacity = Math.min(0.9, Math.max(0.25, Number(config?.fleetOpacity ?? 0.58)));

  const overlays: OverlayItem[] = [
    {
      id: 'heat',
      key: 'showHeatNumber' as keyof OverlayConfig,
      label: 'Race bar',
      description: 'Race or heat, status, time and wind',
    },
    {
      id: 'skippers',
      key: 'showSkippers' as keyof OverlayConfig,
      label: 'Fleet list',
      description: 'Every boat: sail no., skipper, boat type. Finishers move up',
    },
    {
      id: 'status',
      key: 'showStandings' as keyof OverlayConfig,
      label: 'Results card',
      description: 'Each race\'s results for 20 seconds when it\'s scored',
    },
    {
      id: 'weather',
      key: 'showWeather' as keyof OverlayConfig,
      label: 'Wind',
      description: 'Venue wind in the race bar, when weather is available',
    },
  ];

  return (
    <div className="alv-ovm">
      {overlays.map((overlay) => {
        const isEnabled = !!config[overlay.key];
        return (
          <div key={overlay.id} className="alv-tg">
            <div className="min-w-0">
              <b id={`alv-ovm-${overlay.id}`}>{overlay.label}</b>
              <span>{overlay.description}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              aria-labelledby={`alv-ovm-${overlay.id}`}
              className="alv-sw"
              onClick={() => toggleOverlay(overlay.key)}
            />
          </div>
        );
      })}

      <div className="alv-tg is-range">
        <div className="min-w-0">
          <label htmlFor="alv-see-through"><b>See-through</b></label>
          <span>{Math.round((1 - fleetOpacity) * 100)}% of the racing shows through</span>
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
          className="alv-range"
        />
      </div>

      <p className="alv-ovm-note">
        {saving ? 'Saving…' : 'Changes show on the program straight away, in preview and on air.'}
      </p>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Radio, Plus, Settings, MapPin, Tag, Play, Eye, Trash2, RefreshCw, Copy, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { UwbCourseDesigner } from './uwb/UwbCourseDesigner';
import { UwbTagRegistry } from './uwb/UwbTagRegistry';
import { UwbLiveRaceViewer } from './uwb/UwbLiveRaceViewer';
import { UwbRaceSessionManager } from './uwb/UwbRaceSessionManager';

interface UwbConfig {
  id: string;
  club_id: string;
  name: string;
  coordinator_api_key: string;
  update_frequency_hz: number;
  rounding_threshold_m: number;
  ocs_threshold_m: number;
  auto_scoring_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type TabView = 'overview' | 'course' | 'tags' | 'sessions' | 'live';

export function UwbTrackingTab() {
  const [configs, setConfigs] = useState<UwbConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<UwbConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('overview');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [copiedKey, setCopiedKey] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
    loadClubs();
  }, []);

  async function loadConfigs() {
    setLoading(true);
    const { data } = await supabase
      .from('uwb_tracking_configs')
      .select('*')
      .order('created_at', { ascending: false });
    setConfigs(data || []);
    if (data?.length && !selectedConfig) {
      setSelectedConfig(data[0]);
    }
    setLoading(false);
  }

  async function loadClubs() {
    const { data } = await supabase
      .from('clubs')
      .select('id, name')
      .order('name');
    setClubs(data || []);
  }

  async function createConfig(clubId: string, name: string) {
    const { data, error } = await supabase
      .from('uwb_tracking_configs')
      .insert({ club_id: clubId, name })
      .select()
      .single();
    if (!error && data) {
      setConfigs(prev => [data, ...prev]);
      setSelectedConfig(data);
      setShowCreateModal(false);
    }
  }

  async function toggleActive(config: UwbConfig) {
    const { error } = await supabase
      .from('uwb_tracking_configs')
      .update({ is_active: !config.is_active, updated_at: new Date().toISOString() })
      .eq('id', config.id);
    if (!error) {
      const updated = { ...config, is_active: !config.is_active };
      setConfigs(prev => prev.map(c => c.id === config.id ? updated : c));
      if (selectedConfig?.id === config.id) setSelectedConfig(updated);
    }
  }

  async function updateConfig(updates: Partial<UwbConfig>) {
    if (!selectedConfig) return;
    const { error } = await supabase
      .from('uwb_tracking_configs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', selectedConfig.id);
    if (!error) {
      const updated = { ...selectedConfig, ...updates };
      setConfigs(prev => prev.map(c => c.id === selectedConfig.id ? updated : c));
      setSelectedConfig(updated);
    }
  }

  async function deleteConfig(id: string) {
    if (!confirm('Delete this UWB configuration? All associated anchors, tags, and race data will be permanently removed.')) return;
    const { error } = await supabase.from('uwb_tracking_configs').delete().eq('id', id);
    if (!error) {
      setConfigs(prev => prev.filter(c => c.id !== id));
      if (selectedConfig?.id === id) setSelectedConfig(configs.find(c => c.id !== id) || null);
    }
  }

  function copyApiKey() {
    if (!selectedConfig) return;
    navigator.clipboard.writeText(selectedConfig.coordinator_api_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  const clubName = (clubId: string) => clubs.find(c => c.id === clubId)?.name || 'Unknown Club';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Radio className="w-7 h-7 text-sky-400" />
            UWB Boat Tracking
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Ultra-wideband precision tracking system for automated race scoring
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Configuration
        </button>
      </div>

      {/* Config Selector */}
      {configs.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {configs.map(config => (
            <button
              key={config.id}
              onClick={() => { setSelectedConfig(config); setActiveTab('overview'); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                selectedConfig?.id === config.id
                  ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                  : 'border-slate-700/50 bg-slate-800/30 text-slate-300 hover:border-slate-600'
              }`}
            >
              {config.is_active ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-slate-500" />
              )}
              <span className="font-medium text-sm">{config.name}</span>
              <span className="text-xs text-slate-500">({clubName(config.club_id)})</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected Config */}
      {selectedConfig && (
        <>
          {/* Tab Navigation */}
          <div className="border-b border-slate-700/50">
            <nav className="flex gap-1">
              {([
                { key: 'overview', label: 'Overview', icon: Settings },
                { key: 'course', label: 'Course Designer', icon: MapPin },
                { key: 'tags', label: 'Tag Registry', icon: Tag },
                { key: 'sessions', label: 'Race Sessions', icon: Play },
                { key: 'live', label: 'Live Viewer', icon: Eye },
              ] as { key: TabView; label: string; icon: React.ElementType }[]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-sky-500 text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mt-4">
            {activeTab === 'overview' && (
              <OverviewPanel
                config={selectedConfig}
                clubName={clubName(selectedConfig.club_id)}
                onToggleActive={() => toggleActive(selectedConfig)}
                onUpdate={updateConfig}
                onDelete={() => deleteConfig(selectedConfig.id)}
                onCopyKey={copyApiKey}
                copiedKey={copiedKey}
              />
            )}
            {activeTab === 'course' && (
              <UwbCourseDesigner configId={selectedConfig.id} />
            )}
            {activeTab === 'tags' && (
              <UwbTagRegistry configId={selectedConfig.id} />
            )}
            {activeTab === 'sessions' && (
              <UwbRaceSessionManager
                configId={selectedConfig.id}
                onViewLive={(sessionId) => { setLiveSessionId(sessionId); setActiveTab('live'); }}
              />
            )}
            {activeTab === 'live' && (
              <UwbLiveRaceViewer configId={selectedConfig.id} sessionId={liveSessionId} />
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {configs.length === 0 && (
        <div className="text-center py-16 rounded-2xl border bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <Radio className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No UWB Configurations</h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto text-sm">
            Create a UWB tracking configuration for a club to get started with precision boat tracking and automated scoring.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
          >
            Create First Configuration
          </button>
        </div>
      )}

      {/* Create Config Modal */}
      {showCreateModal && (
        <CreateConfigModal
          clubs={clubs}
          onClose={() => setShowCreateModal(false)}
          onCreate={createConfig}
        />
      )}
    </div>
  );
}

function OverviewPanel({
  config,
  clubName,
  onToggleActive,
  onUpdate,
  onDelete,
  onCopyKey,
  copiedKey,
}: {
  config: UwbConfig;
  clubName: string;
  onToggleActive: () => void;
  onUpdate: (updates: Partial<UwbConfig>) => void;
  onDelete: () => void;
  onCopyKey: () => void;
  copiedKey: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Status Card */}
      <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
        <h3 className="font-semibold text-white mb-4">System Status</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Club</span>
            <span className="text-sm font-medium text-white">{clubName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Status</span>
            <button
              onClick={onToggleActive}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                config.is_active
                  ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70'
              }`}
            >
              {config.is_active ? (
                <><CheckCircle2 className="w-3.5 h-3.5" /> Active</>
              ) : (
                <><AlertCircle className="w-3.5 h-3.5" /> Inactive</>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Auto Scoring</span>
            <button
              onClick={() => onUpdate({ auto_scoring_enabled: !config.auto_scoring_enabled })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                config.auto_scoring_enabled
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-slate-700/50 text-slate-400'
              }`}
            >
              {config.auto_scoring_enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </div>

      {/* API Key Card */}
      <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
        <h3 className="font-semibold text-white mb-4">Coordinator API Key</h3>
        <p className="text-xs text-slate-500 mb-3">
          Flash this key onto the coordinator device. It authenticates position data uploads.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 truncate">
            {config.coordinator_api_key}
          </code>
          <button
            onClick={onCopyKey}
            className="p-2 rounded-lg border border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            title="Copy API key"
          >
            {copiedKey ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">
          POST positions to: /functions/v1/uwb-position-ingest/positions
        </p>
      </div>

      {/* Settings Card */}
      <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
        <h3 className="font-semibold text-white mb-4">Tracking Parameters</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400">Update Frequency (Hz)</label>
            <input
              type="number"
              value={config.update_frequency_hz}
              onChange={(e) => onUpdate({ update_frequency_hz: parseInt(e.target.value) || 10 })}
              className="mt-1 w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              min={1}
              max={50}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">Rounding Threshold (meters)</label>
            <input
              type="number"
              step="0.1"
              value={config.rounding_threshold_m}
              onChange={(e) => onUpdate({ rounding_threshold_m: parseFloat(e.target.value) || 2.0 })}
              className="mt-1 w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              min={0.5}
              max={10}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">OCS Detection Threshold (meters)</label>
            <input
              type="number"
              step="0.1"
              value={config.ocs_threshold_m}
              onChange={(e) => onUpdate({ ocs_threshold_m: parseFloat(e.target.value) || 0.5 })}
              className="mt-1 w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              min={0.1}
              max={5}
            />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl border p-6 bg-slate-800/30 border-red-900/30 backdrop-blur-sm">
        <h3 className="font-semibold text-red-400 mb-4">Danger Zone</h3>
        <p className="text-sm text-slate-400 mb-4">
          Deleting this configuration will remove all anchors, tags, course layouts, and recorded race data permanently.
        </p>
        <button
          onClick={onDelete}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
        >
          <Trash2 className="w-4 h-4" />
          Delete Configuration
        </button>
      </div>
    </div>
  );
}

function CreateConfigModal({
  clubs,
  onClose,
  onCreate,
}: {
  clubs: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (clubId: string, name: string) => void;
}) {
  const [clubId, setClubId] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-white mb-4">New UWB Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Club</label>
            <select
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            >
              <option value="">Select a club...</option>
              {clubs.map(club => (
                <option key={club.id} value={club.id}>{club.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Configuration Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lake Macquarie UWB Setup"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            onClick={() => onCreate(clubId, name || 'Default UWB Setup')}
            disabled={!clubId}
            className="px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  ToggleLeft, ToggleRight, Building, MapPin, Globe, Search,
  Shield, ChevronDown, ChevronRight, Lock, Unlock, Filter,
  Zap, Monitor, Trophy, Newspaper, Users, DollarSign, Wrench,
  CheckSquare, AlertTriangle, X, Plus, Edit2, Trash2, Save,
  RefreshCw, BarChart3
} from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface FeatureAccessTabProps {
  darkMode: boolean;
}

interface FeatureControl {
  id: string;
  feature_key: string;
  feature_label: string;
  feature_description: string | null;
  feature_group: string;
  is_globally_enabled: boolean;
}

interface FeatureOverride {
  id: string;
  feature_control_id: string;
  target_type: string;
  target_id: string;
  is_enabled: boolean;
}

interface OrgTarget {
  id: string;
  name: string;
  type: 'club' | 'state_association' | 'national_association';
}

const groupIcons: Record<string, typeof Trophy> = {
  racing: Trophy,
  content: Newspaper,
  communications: Zap,
  tools: Wrench,
  website: Monitor,
  membership: Users,
  finance: DollarSign,
  operations: CheckSquare,
  monetization: DollarSign,
  general: Shield,
};

const groupLabels: Record<string, string> = {
  racing: 'Racing & Events',
  content: 'Content & Media',
  communications: 'Communications',
  tools: 'Resources & Tools',
  website: 'Website',
  membership: 'Membership',
  finance: 'Finance',
  operations: 'Operations',
  monetization: 'Monetization',
  general: 'General',
};

const availableGroups = Object.entries(groupLabels).map(([key, label]) => ({ key, label }));

export function FeatureAccessTab({ darkMode }: FeatureAccessTabProps) {
  const [features, setFeatures] = useState<FeatureControl[]>([]);
  const [overrides, setOverrides] = useState<FeatureOverride[]>([]);
  const [targets, setTargets] = useState<OrgTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedFeature, setSelectedFeature] = useState<FeatureControl | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTarget, setFilterTarget] = useState<string>('all');
  const [showAddFeature, setShowAddFeature] = useState(false);
  const [editingFeature, setEditingFeature] = useState<FeatureControl | null>(null);
  const [newFeature, setNewFeature] = useState({ key: '', label: '', description: '', group: 'general' });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [featuresRes, overridesRes, clubsRes, stateRes, nationalRes] = await Promise.all([
        supabase.from('platform_feature_controls').select('*').order('feature_group, feature_label'),
        supabase.from('platform_feature_overrides').select('*'),
        supabase.from('clubs').select('id, name'),
        supabase.from('state_associations').select('id, name'),
        supabase.from('national_associations').select('id, name'),
      ]);

      setFeatures(featuresRes.data || []);
      setOverrides(overridesRes.data || []);

      const allTargets: OrgTarget[] = [
        ...(clubsRes.data || []).map(c => ({ id: c.id, name: c.name, type: 'club' as const })),
        ...(stateRes.data || []).map(s => ({ id: s.id, name: s.name, type: 'state_association' as const })),
        ...(nationalRes.data || []).map(n => ({ id: n.id, name: n.name, type: 'national_association' as const })),
      ];
      setTargets(allTargets);

      const groups = new Set(featuresRes.data?.map(f => f.feature_group) || []);
      setExpandedGroups(groups);
    } catch (err) {
      console.error('Error loading feature data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleGlobal = async (featureId: string, currentState: boolean) => {
    await supabase
      .from('platform_feature_controls')
      .update({ is_globally_enabled: !currentState, updated_at: new Date().toISOString() })
      .eq('id', featureId);

    setFeatures(prev => prev.map(f => f.id === featureId ? { ...f, is_globally_enabled: !currentState } : f));
  };

  const toggleOverride = async (featureId: string, targetType: string, targetId: string) => {
    const existing = overrides.find(
      o => o.feature_control_id === featureId && o.target_type === targetType && o.target_id === targetId
    );
    const feature = features.find(f => f.id === featureId);
    if (!feature) return;

    if (existing) {
      const newEnabled = !existing.is_enabled;
      if (newEnabled === feature.is_globally_enabled) {
        setOverrides(prev => prev.filter(o => o.id !== existing.id));
        await supabase.from('platform_feature_overrides').delete().eq('id', existing.id);
      } else {
        setOverrides(prev => prev.map(o => o.id === existing.id ? { ...o, is_enabled: newEnabled } : o));
        await supabase
          .from('platform_feature_overrides')
          .update({ is_enabled: newEnabled, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
    } else {
      const newOverride: FeatureOverride = {
        id: crypto.randomUUID(),
        feature_control_id: featureId,
        target_type: targetType,
        target_id: targetId,
        is_enabled: !feature.is_globally_enabled,
      };
      setOverrides(prev => [...prev, newOverride]);

      const { data, error } = await supabase.from('platform_feature_overrides').insert({
        feature_control_id: featureId,
        target_type: targetType,
        target_id: targetId,
        is_enabled: !feature.is_globally_enabled,
      }).select('*').maybeSingle();

      if (error || !data) {
        setOverrides(prev => prev.filter(o => o.id !== newOverride.id));
      } else {
        setOverrides(prev => prev.map(o => o.id === newOverride.id ? data : o));
      }
    }
  };

  const addFeature = async () => {
    if (!newFeature.key.trim() || !newFeature.label.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('platform_feature_controls').insert({
        feature_key: newFeature.key.trim().toLowerCase().replace(/\s+/g, '_'),
        feature_label: newFeature.label.trim(),
        feature_description: newFeature.description.trim() || null,
        feature_group: newFeature.group,
        is_globally_enabled: true,
      }).select().maybeSingle();

      if (error) throw error;
      if (data) {
        setFeatures(prev => [...prev, data].sort((a, b) => a.feature_group.localeCompare(b.feature_group) || a.feature_label.localeCompare(b.feature_label)));
      }
      setShowAddFeature(false);
      setNewFeature({ key: '', label: '', description: '', group: 'general' });
    } catch (err) {
      console.error('Error adding feature:', err);
      alert('Failed to add feature. The feature key may already exist.');
    } finally {
      setSaving(false);
    }
  };

  const updateFeature = async () => {
    if (!editingFeature) return;
    setSaving(true);
    try {
      await supabase.from('platform_feature_controls')
        .update({
          feature_label: editingFeature.feature_label,
          feature_description: editingFeature.feature_description,
          feature_group: editingFeature.feature_group,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingFeature.id);

      setFeatures(prev => prev.map(f => f.id === editingFeature.id ? editingFeature : f));
      setEditingFeature(null);
    } catch (err) {
      console.error('Error updating feature:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteFeature = async (featureId: string) => {
    if (deleteConfirm !== featureId) {
      setDeleteConfirm(featureId);
      return;
    }
    try {
      await supabase.from('platform_feature_overrides').delete().eq('feature_control_id', featureId);
      await supabase.from('platform_feature_controls').delete().eq('id', featureId);
      setFeatures(prev => prev.filter(f => f.id !== featureId));
      setOverrides(prev => prev.filter(o => o.feature_control_id !== featureId));
      if (selectedFeature?.id === featureId) setSelectedFeature(null);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting feature:', err);
    }
  };

  const bulkToggleGroup = async (group: string, enabled: boolean) => {
    const groupFeatures = features.filter(f => f.feature_group === group);
    for (const f of groupFeatures) {
      if (f.is_globally_enabled !== enabled) {
        await supabase.from('platform_feature_controls')
          .update({ is_globally_enabled: enabled, updated_at: new Date().toISOString() })
          .eq('id', f.id);
      }
    }
    setFeatures(prev => prev.map(f => f.feature_group === group ? { ...f, is_globally_enabled: enabled } : f));
    setBulkAction(null);
  };

  const clearAllOverrides = async (featureId: string) => {
    await supabase.from('platform_feature_overrides').delete().eq('feature_control_id', featureId);
    setOverrides(prev => prev.filter(o => o.feature_control_id !== featureId));
  };

  const getOverrideState = (featureId: string, targetType: string, targetId: string): boolean | null => {
    const override = overrides.find(
      o => o.feature_control_id === featureId && o.target_type === targetType && o.target_id === targetId
    );
    return override ? override.is_enabled : null;
  };

  const groupedFeatures = useMemo(() => {
    return features.reduce<Record<string, FeatureControl[]>>((acc, f) => {
      if (!acc[f.feature_group]) acc[f.feature_group] = [];
      acc[f.feature_group].push(f);
      return acc;
    }, {});
  }, [features]);

  const featureStats = useMemo(() => {
    const total = features.length;
    const enabled = features.filter(f => f.is_globally_enabled).length;
    const disabled = total - enabled;
    const withOverrides = new Set(overrides.map(o => o.feature_control_id)).size;
    const totalOverrides = overrides.length;
    return { total, enabled, disabled, withOverrides, totalOverrides };
  }, [features, overrides]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const filteredTargets = targets.filter(t => {
    if (filterTarget !== 'all' && t.type !== filterTarget) return false;
    if (searchTerm && !t.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const groupedTargets = useMemo(() => {
    const clubs = filteredTargets.filter(t => t.type === 'club');
    const stateAssocs = filteredTargets.filter(t => t.type === 'state_association');
    const nationalAssocs = filteredTargets.filter(t => t.type === 'national_association');
    return { clubs, stateAssocs, nationalAssocs };
  }, [filteredTargets]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
            <Zap className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Feature Access</h1>
            <p className="text-sm text-slate-400">Control platform features and overrides</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Features', value: featureStats.total, color: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', textColor: 'text-sky-400' },
          { label: 'Enabled', value: featureStats.enabled, color: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', textColor: 'text-emerald-400' },
          { label: 'Disabled', value: featureStats.disabled, color: 'from-red-500/20 to-red-700/20', border: 'border-red-500/30', textColor: 'text-red-400' },
          { label: 'With Overrides', value: featureStats.withOverrides, color: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', textColor: 'text-amber-400' },
          { label: 'Total Overrides', value: featureStats.totalOverrides, color: 'from-cyan-500/20 to-cyan-700/20', border: 'border-cyan-500/30', textColor: 'text-cyan-400' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-2xl border p-4 bg-gradient-to-br ${stat.color} ${stat.border} backdrop-blur-sm`}>
            <p className={`text-2xl font-bold ${stat.textColor}`}>{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="rounded-2xl border p-3 bg-amber-500/10 border-amber-500/20 flex items-start gap-3 flex-1">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-400/80">
            Toggling a feature OFF globally disables it for ALL organizations. Use per-organization overrides for selective control.
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => setShowAddFeature(true)}
            className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
          >
            <Plus size={16} />
            Add Feature
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/50 transition-colors"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {showAddFeature && (
        <div className="rounded-2xl border p-5 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-white">Add New Feature Flag</h4>
            <button onClick={() => { setShowAddFeature(false); setNewFeature({ key: '', label: '', description: '', group: 'general' }); }}>
              <X size={16} className="text-slate-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Feature Key</label>
              <input
                type="text"
                value={newFeature.key}
                onChange={e => setNewFeature(prev => ({ ...prev, key: e.target.value }))}
                placeholder="e.g. live_streaming"
                className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Unique identifier, auto-formatted to snake_case</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Display Label</label>
              <input
                type="text"
                value={newFeature.label}
                onChange={e => setNewFeature(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g. Live Streaming"
                className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Description (optional)</label>
              <input
                type="text"
                value={newFeature.description}
                onChange={e => setNewFeature(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of what this feature controls"
                className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Group</label>
              <select
                value={newFeature.group}
                onChange={e => setNewFeature(prev => ({ ...prev, group: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white"
              >
                {availableGroups.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAddFeature(false); setNewFeature({ key: '', label: '', description: '', group: 'general' }); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addFeature}
              disabled={!newFeature.key.trim() || !newFeature.label.trim() || saving}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Feature'}
            </button>
          </div>
        </div>
      )}

      {editingFeature && (
        <div className="rounded-2xl border p-5 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-white">Edit Feature: {editingFeature.feature_key}</h4>
            <button onClick={() => setEditingFeature(null)}>
              <X size={16} className="text-slate-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Display Label</label>
              <input
                type="text"
                value={editingFeature.feature_label}
                onChange={e => setEditingFeature(prev => prev ? { ...prev, feature_label: e.target.value } : null)}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Description</label>
              <input
                type="text"
                value={editingFeature.feature_description || ''}
                onChange={e => setEditingFeature(prev => prev ? { ...prev, feature_description: e.target.value || null } : null)}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Group</label>
              <select
                value={editingFeature.feature_group}
                onChange={e => setEditingFeature(prev => prev ? { ...prev, feature_group: e.target.value } : null)}
                className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-800 border-slate-600 text-white"
              >
                {availableGroups.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingFeature(null)} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
              Cancel
            </button>
            <button onClick={updateFeature} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50">
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-3">
          {Object.entries(groupedFeatures).map(([group, groupFeatures]) => {
            const GroupIcon = groupIcons[group] || Shield;
            const isExpanded = expandedGroups.has(group);
            const enabledCount = groupFeatures.filter(f => f.is_globally_enabled).length;
            return (
              <div
                key={group}
                className="rounded-2xl border overflow-hidden bg-slate-800/30 border-slate-700/50 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleGroup(group)}
                    className="flex-1 flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-sky-500/20">
                        <GroupIcon size={16} className="text-sky-500" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-white">{groupLabels[group] || group}</p>
                        <p className="text-xs text-slate-400">
                          {enabledCount}/{groupFeatures.length} enabled
                        </p>
                      </div>
                    </div>
                    {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  </button>
                  {isExpanded && (
                    <div className="pr-4 relative">
                      <button
                        onClick={() => setBulkAction(bulkAction === group ? null : group)}
                        className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded transition-colors"
                      >
                        Bulk
                      </button>
                      {bulkAction === group && (
                        <div className="absolute right-0 top-full mt-1 z-10 rounded-lg border bg-slate-800 border-slate-700 shadow-xl py-1 w-40">
                          <button
                            onClick={() => bulkToggleGroup(group, true)}
                            className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-slate-700/50 transition-colors"
                          >
                            Enable all in group
                          </button>
                          <button
                            onClick={() => bulkToggleGroup(group, false)}
                            className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-700/50 transition-colors"
                          >
                            Disable all in group
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700/50">
                    {groupFeatures.map(feature => {
                      const overrideCount = overrides.filter(o => o.feature_control_id === feature.id).length;
                      return (
                        <div
                          key={feature.id}
                          className={`flex items-center justify-between p-4 ${
                            selectedFeature?.id === feature.id
                              ? 'bg-sky-500/10'
                              : 'hover:bg-slate-700/20'
                          } border-b border-slate-700/30 last:border-0 transition-colors cursor-pointer`}
                          onClick={() => setSelectedFeature(selectedFeature?.id === feature.id ? null : feature)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${feature.is_globally_enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-white">{feature.feature_label}</p>
                              {feature.feature_description && (
                                <p className="text-xs text-slate-500 truncate">{feature.feature_description}</p>
                              )}
                              <p className="text-[10px] text-slate-600 font-mono">{feature.feature_key}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {overrideCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400">
                                {overrideCount}
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingFeature(feature); }}
                              className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                              title="Edit feature"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteFeature(feature.id); }}
                              className={`p-1 rounded transition-colors ${deleteConfirm === feature.id ? 'text-red-400 bg-red-500/20' : 'text-slate-500 hover:text-red-400'}`}
                              title={deleteConfirm === feature.id ? 'Click again to confirm' : 'Delete feature'}
                            >
                              <Trash2 size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGlobal(feature.id, feature.is_globally_enabled);
                              }}
                              className="flex-shrink-0"
                            >
                              {feature.is_globally_enabled ? (
                                <ToggleRight size={28} className="text-emerald-500" />
                              ) : (
                                <ToggleLeft size={28} className="text-slate-600" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {Object.keys(groupedFeatures).length === 0 && (
            <div className="rounded-2xl border p-12 text-center bg-slate-800/30 border-slate-700/50">
              <Shield size={40} className="mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 font-medium">No feature flags configured</p>
              <p className="text-xs text-slate-500 mt-1">Add a feature flag to get started</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border sticky top-28 h-fit bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          {selectedFeature ? (
            <div>
              <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{selectedFeature.feature_label}</h3>
                    <p className="text-[10px] text-slate-500 font-mono">{selectedFeature.feature_key}</p>
                  </div>
                  <button onClick={() => setSelectedFeature(null)}>
                    <X size={16} className="text-slate-400" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-slate-400">Per-organization overrides</p>
                  {overrides.filter(o => o.feature_control_id === selectedFeature.id).length > 0 && (
                    <button
                      onClick={() => clearAllOverrides(selectedFeature.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Clear all overrides
                    </button>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                    />
                  </div>
                  <select
                    value={filterTarget}
                    onChange={e => setFilterTarget(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border text-xs bg-slate-800 border-slate-600 text-white"
                  >
                    <option value="all">All</option>
                    <option value="club">Clubs</option>
                    <option value="state_association">States</option>
                    <option value="national_association">National</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto">
                {groupedTargets.clubs.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2.5 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <Building size={13} className="text-emerald-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                          Clubs ({groupedTargets.clubs.length})
                        </span>
                      </div>
                    </div>
                    {groupedTargets.clubs.map(target => (
                      <OverrideTargetRow
                        key={`${target.type}-${target.id}`}
                        target={target}
                        selectedFeature={selectedFeature}
                        getOverrideState={getOverrideState}
                        toggleOverride={toggleOverride}
                      />
                    ))}
                  </div>
                )}

                {groupedTargets.stateAssocs.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2.5 bg-slate-800/90 backdrop-blur-sm border-y border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-amber-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                          State Associations ({groupedTargets.stateAssocs.length})
                        </span>
                      </div>
                    </div>
                    {groupedTargets.stateAssocs.map(target => (
                      <OverrideTargetRow
                        key={`${target.type}-${target.id}`}
                        target={target}
                        selectedFeature={selectedFeature}
                        getOverrideState={getOverrideState}
                        toggleOverride={toggleOverride}
                      />
                    ))}
                  </div>
                )}

                {groupedTargets.nationalAssocs.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-4 py-2.5 bg-slate-800/90 backdrop-blur-sm border-y border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <Globe size={13} className="text-sky-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                          National Associations ({groupedTargets.nationalAssocs.length})
                        </span>
                      </div>
                    </div>
                    {groupedTargets.nationalAssocs.map(target => (
                      <OverrideTargetRow
                        key={`${target.type}-${target.id}`}
                        target={target}
                        selectedFeature={selectedFeature}
                        getOverrideState={getOverrideState}
                        toggleOverride={toggleOverride}
                      />
                    ))}
                  </div>
                )}

                {filteredTargets.length === 0 && (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    No organizations match your search
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              <Shield size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">Select a Feature</p>
              <p className="text-xs mt-1">Click on a feature from the list to manage per-organization access overrides.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverrideTargetRow({ target, selectedFeature, getOverrideState, toggleOverride }: {
  target: OrgTarget;
  selectedFeature: FeatureControl;
  getOverrideState: (featureId: string, targetType: string, targetId: string) => boolean | null;
  toggleOverride: (featureId: string, targetType: string, targetId: string) => void;
}) {
  const overrideState = getOverrideState(selectedFeature.id, target.type, target.id);
  const effectiveState = overrideState !== null ? overrideState : selectedFeature.is_globally_enabled;
  const TypeIcon = target.type === 'club' ? Building : target.type === 'state_association' ? MapPin : Globe;
  const iconColor = target.type === 'club' ? 'text-emerald-400/50' : target.type === 'state_association' ? 'text-amber-400/50' : 'text-sky-400/50';

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <TypeIcon size={14} className={`${iconColor} flex-shrink-0`} />
        <span className="text-sm truncate text-slate-300">{target.name}</span>
        {overrideState !== null && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 ${
            overrideState ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            override
          </span>
        )}
      </div>
      <button
        onClick={() => toggleOverride(selectedFeature.id, target.type, target.id)}
        className="flex-shrink-0 ml-2"
      >
        {effectiveState ? (
          <ToggleRight size={24} className={overrideState !== null ? 'text-emerald-500' : 'text-emerald-500/50'} />
        ) : (
          <ToggleLeft size={24} className={overrideState !== null ? 'text-red-500' : 'text-slate-600'} />
        )}
      </button>
    </div>
  );
}

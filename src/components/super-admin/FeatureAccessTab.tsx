import { useState, useEffect } from 'react';
import {
  ToggleLeft, ToggleRight, Building, MapPin, Globe, Search,
  Shield, ChevronDown, ChevronRight, Lock, Unlock, Filter,
  Zap, Monitor, Trophy, Newspaper, Users, DollarSign, Wrench,
  CheckSquare, AlertTriangle, X
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

export function FeatureAccessTab({ darkMode }: FeatureAccessTabProps) {
  const [features, setFeatures] = useState<FeatureControl[]>([]);
  const [overrides, setOverrides] = useState<FeatureOverride[]>([]);
  const [targets, setTargets] = useState<OrgTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedFeature, setSelectedFeature] = useState<FeatureControl | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTarget, setFilterTarget] = useState<string>('all');

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

  const toggleGlobal = async (featureId: string, currentState: boolean) => {
    await supabase
      .from('platform_feature_controls')
      .update({ is_globally_enabled: !currentState, updated_at: new Date().toISOString() })
      .eq('id', featureId);

    setFeatures(prev => prev.map(f => f.id === featureId ? { ...f, is_globally_enabled: !currentState } : f));
  };

  const toggleOverride = async (featureId: string, targetType: string, targetId: string, currentlyEnabled: boolean | null) => {
    const existing = overrides.find(
      o => o.feature_control_id === featureId && o.target_type === targetType && o.target_id === targetId
    );

    if (existing) {
      if (currentlyEnabled !== null) {
        await supabase.from('platform_feature_overrides').delete().eq('id', existing.id);
        setOverrides(prev => prev.filter(o => o.id !== existing.id));
      } else {
        await supabase
          .from('platform_feature_overrides')
          .update({ is_enabled: !existing.is_enabled, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        setOverrides(prev => prev.map(o => o.id === existing.id ? { ...o, is_enabled: !o.is_enabled } : o));
      }
    } else {
      const { data } = await supabase.from('platform_feature_overrides').insert({
        feature_control_id: featureId,
        target_type: targetType,
        target_id: targetId,
        is_enabled: false,
      }).select().maybeSingle();

      if (data) setOverrides(prev => [...prev, data]);
    }
  };

  const getOverrideState = (featureId: string, targetType: string, targetId: string): boolean | null => {
    const override = overrides.find(
      o => o.feature_control_id === featureId && o.target_type === targetType && o.target_id === targetId
    );
    return override ? override.is_enabled : null;
  };

  const groupedFeatures = features.reduce<Record<string, FeatureControl[]>>((acc, f) => {
    if (!acc[f.feature_group]) acc[f.feature_group] = [];
    acc[f.feature_group].push(f);
    return acc;
  }, {});

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className={`text-sm font-medium ${darkMode ? 'text-amber-400' : 'text-amber-800'}`}>Global Feature Controls</p>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-amber-400/70' : 'text-amber-700'}`}>
              Toggling a feature OFF globally will disable it for ALL organizations. Individual overrides allow you to enable/disable features per organization.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-3">
          {Object.entries(groupedFeatures).map(([group, groupFeatures]) => {
            const GroupIcon = groupIcons[group] || Shield;
            const isExpanded = expandedGroups.has(group);
            return (
              <div
                key={group}
                className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}
              >
                <button
                  onClick={() => toggleGroup(group)}
                  className={`w-full flex items-center justify-between p-4 ${darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'} transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${darkMode ? 'bg-sky-500/20' : 'bg-sky-50'}`}>
                      <GroupIcon size={16} className="text-sky-500" />
                    </div>
                    <div className="text-left">
                      <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{groupLabels[group] || group}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {groupFeatures.filter(f => f.is_globally_enabled).length}/{groupFeatures.length} enabled
                      </p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} /> : <ChevronRight size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />}
                </button>

                {isExpanded && (
                  <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                    {groupFeatures.map(feature => {
                      const overrideCount = overrides.filter(o => o.feature_control_id === feature.id).length;
                      return (
                        <div
                          key={feature.id}
                          className={`flex items-center justify-between p-4 ${
                            selectedFeature?.id === feature.id
                              ? darkMode ? 'bg-sky-500/10' : 'bg-sky-50'
                              : darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'
                          } ${darkMode ? 'border-b border-slate-700/30 last:border-0' : 'border-b border-slate-100 last:border-0'} transition-colors cursor-pointer`}
                          onClick={() => setSelectedFeature(selectedFeature?.id === feature.id ? null : feature)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${feature.is_globally_enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <div>
                              <p className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{feature.feature_label}</p>
                              {feature.feature_description && (
                                <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{feature.feature_description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {overrideCount > 0 && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${darkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                {overrideCount} override{overrideCount > 1 ? 's' : ''}
                              </span>
                            )}
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
                                <ToggleLeft size={28} className={darkMode ? 'text-slate-600' : 'text-slate-300'} />
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
        </div>

        <div className={`lg:col-span-2 rounded-2xl border sticky top-28 h-fit ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          {selectedFeature ? (
            <div>
              <div className={`p-4 border-b ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{selectedFeature.feature_label}</h3>
                  <button onClick={() => setSelectedFeature(null)}>
                    <X size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                  </button>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Manage per-organization access overrides</p>

                <div className="flex gap-2 mt-3">
                  <div className="relative flex-1">
                    <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Search..."
                      className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    />
                  </div>
                  <select
                    value={filterTarget}
                    onChange={e => setFilterTarget(e.target.value)}
                    className={`px-2 py-1.5 rounded-lg border text-xs ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    <option value="all">All</option>
                    <option value="club">Clubs</option>
                    <option value="state_association">States</option>
                    <option value="national_association">National</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto">
                {filteredTargets.map(target => {
                  const overrideState = getOverrideState(selectedFeature.id, target.type, target.id);
                  const effectiveState = overrideState !== null ? overrideState : selectedFeature.is_globally_enabled;
                  const TypeIcon = target.type === 'club' ? Building : target.type === 'state_association' ? MapPin : Globe;

                  return (
                    <div
                      key={`${target.type}-${target.id}`}
                      className={`flex items-center justify-between px-4 py-2.5 ${darkMode ? 'border-b border-slate-700/30 hover:bg-slate-700/20' : 'border-b border-slate-100 hover:bg-slate-50'} transition-colors`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TypeIcon size={14} className={darkMode ? 'text-slate-500 flex-shrink-0' : 'text-slate-400 flex-shrink-0'} />
                        <span className={`text-sm truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{target.name}</span>
                        {overrideState !== null && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 ${
                            overrideState
                              ? darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                              : darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                          }`}>
                            override
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => toggleOverride(
                          selectedFeature.id,
                          target.type,
                          target.id,
                          overrideState
                        )}
                        className="flex-shrink-0 ml-2"
                      >
                        {effectiveState ? (
                          <ToggleRight size={24} className={overrideState !== null ? 'text-emerald-500' : 'text-emerald-500/50'} />
                        ) : (
                          <ToggleLeft size={24} className={overrideState !== null ? 'text-red-500' : darkMode ? 'text-slate-600' : 'text-slate-300'} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={`p-8 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
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

import { useState, useEffect, useMemo } from 'react';
import {
  ToggleLeft, ToggleRight, Building, Search,
  Shield, ChevronDown, ChevronRight,
  Zap, Monitor, Trophy, Newspaper, Users, DollarSign, Wrench,
  CheckSquare, X, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface ClubFeaturesAccessProps {
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

interface ClubTarget {
  id: string;
  name: string;
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

export function ClubFeaturesAccess({ darkMode }: ClubFeaturesAccessProps) {
  const { currentOrganization } = useAuth();
  const [features, setFeatures] = useState<FeatureControl[]>([]);
  const [overrides, setOverrides] = useState<FeatureOverride[]>([]);
  const [clubs, setClubs] = useState<ClubTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedFeature, setSelectedFeature] = useState<FeatureControl | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (currentOrganization?.id) {
      loadData();
    }
  }, [currentOrganization?.id]);

  const loadData = async () => {
    if (!currentOrganization?.id) return;

    try {
      const tableName = currentOrganization.type === 'state'
        ? 'state_associations'
        : 'national_associations';
      const fkColumn = currentOrganization.type === 'state'
        ? 'state_association_id'
        : 'national_association_id';

      const [featuresRes, clubsRes] = await Promise.all([
        supabase.from('platform_feature_controls').select('*').order('feature_group, feature_label'),
        supabase.from('clubs').select('id, name').eq(fkColumn, currentOrganization.id).order('name'),
      ]);

      const featureData = featuresRes.data || [];
      const clubData = (clubsRes.data || []) as ClubTarget[];
      setFeatures(featureData);
      setClubs(clubData);

      const clubIds = clubData.map(c => c.id);
      if (clubIds.length > 0) {
        const { data: overrideData } = await supabase
          .from('platform_feature_overrides')
          .select('*')
          .eq('target_type', 'club')
          .in('target_id', clubIds);
        setOverrides(overrideData || []);
      } else {
        setOverrides([]);
      }

      const groups = new Set(featureData.map(f => f.feature_group));
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

  const toggleOverride = async (featureId: string, targetId: string) => {
    const existing = overrides.find(
      o => o.feature_control_id === featureId && o.target_type === 'club' && o.target_id === targetId
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
        target_type: 'club',
        target_id: targetId,
        is_enabled: !feature.is_globally_enabled,
      };
      setOverrides(prev => [...prev, newOverride]);

      const { data, error } = await supabase.from('platform_feature_overrides').insert({
        feature_control_id: featureId,
        target_type: 'club',
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

  const getOverrideState = (featureId: string, targetId: string): boolean | null => {
    const override = overrides.find(
      o => o.feature_control_id === featureId && o.target_type === 'club' && o.target_id === targetId
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
    const clubOverrides = overrides.length;
    const withOverrides = new Set(overrides.map(o => o.feature_control_id)).size;
    return { total, enabled, clubOverrides, withOverrides };
  }, [features, overrides]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const filteredClubs = clubs.filter(c =>
    !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
            <Zap className="text-white" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Club Features Access</h2>
            <p className="text-sm text-slate-400">Control which features are available for your clubs</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/50 transition-colors"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Features', value: featureStats.total, color: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30', textColor: 'text-sky-400' },
          { label: 'Globally Enabled', value: featureStats.enabled, color: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30', textColor: 'text-emerald-400' },
          { label: 'Features with Overrides', value: featureStats.withOverrides, color: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30', textColor: 'text-amber-400' },
          { label: 'Total Overrides', value: featureStats.clubOverrides, color: 'from-cyan-500/20 to-cyan-700/20', border: 'border-cyan-500/30', textColor: 'text-cyan-400' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-2xl border p-4 bg-gradient-to-br ${stat.color} ${stat.border} backdrop-blur-sm`}>
            <p className={`text-2xl font-bold ${stat.textColor}`}>{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {clubs.length === 0 ? (
        <div className="rounded-2xl border p-12 text-center bg-slate-800/30 border-slate-700/50">
          <Building size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 font-medium">No clubs found</p>
          <p className="text-xs text-slate-500 mt-1">There are no clubs under this association yet</p>
        </div>
      ) : (
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
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
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
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                              {overrideCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400">
                                  {overrideCount}
                                </span>
                              )}
                              <div className={`w-2 h-2 rounded-full ${feature.is_globally_enabled ? 'bg-emerald-500/50' : 'bg-red-500/50'}`} />
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
                  <div className="flex items-center gap-2 mt-2">
                    <div className={`w-2 h-2 rounded-full ${selectedFeature.is_globally_enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-xs text-slate-400">
                      Globally {selectedFeature.is_globally_enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-3">Club overrides</p>
                  <div className="mt-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search clubs..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="max-h-[500px] overflow-y-auto">
                  <div className="sticky top-0 z-10 px-4 py-2.5 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700/50">
                    <div className="flex items-center gap-2">
                      <Building size={13} className="text-emerald-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                        Clubs ({filteredClubs.length})
                      </span>
                    </div>
                  </div>
                  {filteredClubs.map(club => {
                    const overrideState = getOverrideState(selectedFeature.id, club.id);
                    const effectiveState = overrideState !== null ? overrideState : selectedFeature.is_globally_enabled;
                    return (
                      <div
                        key={club.id}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Building size={14} className="text-emerald-400/50 flex-shrink-0" />
                          <span className="text-sm truncate text-slate-300">{club.name}</span>
                          {overrideState !== null && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 ${
                              overrideState ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              override
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleOverride(selectedFeature.id, club.id)}
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
                  })}
                  {filteredClubs.length === 0 && (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No clubs match your search
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500">
                <Shield size={40} className="mx-auto mb-3 opacity-40" />
                <p className="font-medium">Select a Feature</p>
                <p className="text-xs mt-1">Click on a feature to manage which clubs have access to it.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, ChevronDown, ChevronRight, Save, RotateCcw,
  Trophy, Newspaper, Zap, Wrench, Monitor, Users,
  DollarSign, CheckSquare, Info, RefreshCw
} from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface AccessLevelDefaultsTabProps {
  darkMode: boolean;
}

interface FeatureControl {
  feature_key: string;
  feature_label: string;
  feature_group: string;
}

interface TemplateRow {
  id: string;
  access_level: string;
  feature_key: string;
  capability: string;
}

const ACCESS_LEVELS = ['admin', 'editor', 'viewer'] as const;
const CAPABILITIES = ['full', 'edit', 'view', 'none'] as const;

const capabilityLabels: Record<string, string> = {
  full: 'Full Access',
  edit: 'Can Edit',
  view: 'View Only',
  none: 'No Access',
};

const capabilityColors: Record<string, string> = {
  full: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  edit: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  view: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  none: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const accessLevelLabels: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const accessLevelColors: Record<string, string> = {
  admin: 'text-amber-400',
  editor: 'text-blue-400',
  viewer: 'text-slate-400',
};

const groupIcons: Record<string, React.ElementType> = {
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

export function AccessLevelDefaultsTab({ darkMode }: AccessLevelDefaultsTabProps) {
  const [features, setFeatures] = useState<FeatureControl[]>([]);
  const [templates, setTemplates] = useState<Record<string, Record<string, string>>>({});
  const [originalTemplates, setOriginalTemplates] = useState<Record<string, Record<string, string>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [overrideCount, setOverrideCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [featuresRes, templatesRes, overridesRes] = await Promise.all([
        supabase
          .from('platform_feature_controls')
          .select('feature_key, feature_label, feature_group')
          .order('feature_group')
          .order('feature_label'),
        supabase
          .from('access_level_permission_templates')
          .select('id, access_level, feature_key, capability'),
        supabase
          .from('access_level_permissions')
          .select('id', { count: 'exact', head: true }),
      ]);

      if (featuresRes.error) throw featuresRes.error;
      setFeatures(featuresRes.data || []);
      setOverrideCount(overridesRes.count || 0);

      const templateMap: Record<string, Record<string, string>> = {};
      (templatesRes.data || []).forEach((t: TemplateRow) => {
        if (!templateMap[t.feature_key]) templateMap[t.feature_key] = {};
        templateMap[t.feature_key][t.access_level] = t.capability;
      });
      setTemplates(templateMap);
      setOriginalTemplates(JSON.parse(JSON.stringify(templateMap)));
      setHasChanges(false);

      const groups = new Set((featuresRes.data || []).map((f: FeatureControl) => f.feature_group));
      setExpandedGroups(groups);
    } catch (err: any) {
      console.error('Error loading template data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getCapability = (featureKey: string, accessLevel: string): string => {
    return templates[featureKey]?.[accessLevel] ||
      (accessLevel === 'admin' ? 'full' : accessLevel === 'editor' ? 'edit' : 'view');
  };

  const handleCapabilityChange = (featureKey: string, accessLevel: string, capability: string) => {
    const newTemplates = { ...templates };
    if (!newTemplates[featureKey]) newTemplates[featureKey] = {};
    newTemplates[featureKey][accessLevel] = capability;
    setTemplates(newTemplates);
    setHasChanges(JSON.stringify(newTemplates) !== JSON.stringify(originalTemplates));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const rows: { access_level: string; feature_key: string; capability: string }[] = [];
      Object.entries(templates).forEach(([featureKey, levels]) => {
        Object.entries(levels).forEach(([accessLevel, capability]) => {
          rows.push({ access_level: accessLevel, feature_key: featureKey, capability });
        });
      });

      for (const row of rows) {
        const { error } = await supabase
          .from('access_level_permission_templates')
          .upsert(row, { onConflict: 'access_level,feature_key' });
        if (error) throw error;
      }

      setOriginalTemplates(JSON.parse(JSON.stringify(templates)));
      setHasChanges(false);
    } catch (err: any) {
      console.error('Error saving templates:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (group: string) => {
    const newGroups = new Set(expandedGroups);
    if (newGroups.has(group)) {
      newGroups.delete(group);
    } else {
      newGroups.add(group);
    }
    setExpandedGroups(newGroups);
  };

  const featureGroups = features.reduce<Record<string, FeatureControl[]>>((acc, f) => {
    if (!acc[f.feature_group]) acc[f.feature_group] = [];
    acc[f.feature_group].push(f);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <Shield size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Access Level Defaults</h2>
              <p className="text-sm text-slate-400">
                Set system-wide default permissions for each access level
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-700/50 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
          <div className="text-2xl font-bold text-white">{features.length}</div>
          <div className="text-xs text-slate-400">Total Features</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
          <div className="text-2xl font-bold text-amber-400">{Object.keys(templates).length * 3}</div>
          <div className="text-xs text-slate-400">Template Rules</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
          <div className="text-2xl font-bold text-blue-400">{overrideCount}</div>
          <div className="text-xs text-slate-400">Org Overrides</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
          <div className="text-2xl font-bold text-green-400">3</div>
          <div className="text-xs text-slate-400">Access Levels</div>
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-400">
            These defaults apply to ALL clubs and associations that have not customized their own permissions.
            Individual organizations can override these defaults from their Committee Management settings.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-700/50">
        <div className="grid grid-cols-[1fr_140px_140px_140px] bg-slate-800/80 border-b border-slate-700/50">
          <div className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
            Feature
          </div>
          {ACCESS_LEVELS.map(level => (
            <div key={level} className={`px-3 py-3 text-xs font-medium uppercase tracking-wider text-center ${accessLevelColors[level]}`}>
              {accessLevelLabels[level]}
            </div>
          ))}
        </div>

        {Object.entries(featureGroups).map(([group, groupFeatures]) => {
          const GroupIcon = groupIcons[group] || Shield;
          const isExpanded = expandedGroups.has(group);

          return (
            <div key={group}>
              <button
                onClick={() => toggleGroup(group)}
                className="w-full grid grid-cols-[1fr_140px_140px_140px] bg-slate-700/30 hover:bg-slate-700/50 transition-colors border-b border-slate-700/30"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <GroupIcon size={16} className="text-slate-400" />
                  <span className="text-sm font-medium text-white">
                    {groupLabels[group] || group}
                  </span>
                  <span className="text-xs text-slate-500">
                    {groupFeatures.length} features
                  </span>
                  {isExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                </div>
                <div className="col-span-3" />
              </button>

              {isExpanded && groupFeatures.map(feature => (
                <div
                  key={feature.feature_key}
                  className="grid grid-cols-[1fr_140px_140px_140px] border-b border-slate-700/20 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="px-4 py-3 pl-12 flex items-center">
                    <span className="text-sm text-slate-300">{feature.feature_label}</span>
                  </div>
                  {ACCESS_LEVELS.map(level => {
                    const cap = getCapability(feature.feature_key, level);
                    return (
                      <div key={level} className="px-3 py-2 flex items-center justify-center">
                        <select
                          value={cap}
                          onChange={(e) => handleCapabilityChange(feature.feature_key, level, e.target.value)}
                          className={`w-full text-xs font-medium px-2 py-1.5 rounded border cursor-pointer transition-colors ${capabilityColors[cap]} bg-transparent`}
                        >
                          {CAPABILITIES.map(c => (
                            <option key={c} value={c} className="bg-slate-800 text-white">
                              {capabilityLabels[c]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

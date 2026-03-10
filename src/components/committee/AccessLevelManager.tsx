import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, ChevronDown, ChevronRight, RotateCcw, Save,
  Trophy, Newspaper, Zap, Wrench, Monitor, Users,
  DollarSign, CheckSquare, Info
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface AccessLevelManagerProps {
  darkMode: boolean;
  scopeType: 'club' | 'state_association' | 'national_association';
  scopeId: string;
}

interface FeatureControl {
  feature_key: string;
  feature_label: string;
  feature_group: string;
}

interface PermissionRow {
  feature_key: string;
  admin: string;
  editor: string;
  viewer: string;
}

interface TemplateRow {
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

const scopeColumnMap: Record<string, string> = {
  club: 'club_id',
  state_association: 'state_association_id',
  national_association: 'national_association_id',
};

export default function AccessLevelManager({ darkMode, scopeType, scopeId }: AccessLevelManagerProps) {
  const { addNotification } = useNotifications();
  const [features, setFeatures] = useState<FeatureControl[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, string>>>({});
  const [templates, setTemplates] = useState<Record<string, Record<string, string>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalPermissions, setOriginalPermissions] = useState<Record<string, Record<string, string>>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [featuresRes, templatesRes, permissionsRes] = await Promise.all([
        supabase
          .from('platform_feature_controls')
          .select('feature_key, feature_label, feature_group')
          .order('feature_group')
          .order('feature_label'),
        supabase
          .from('access_level_permission_templates')
          .select('access_level, feature_key, capability'),
        supabase
          .from('access_level_permissions')
          .select('access_level, feature_key, capability')
          .eq(scopeColumnMap[scopeType], scopeId),
      ]);

      if (featuresRes.error) throw featuresRes.error;
      setFeatures(featuresRes.data || []);

      const templateMap: Record<string, Record<string, string>> = {};
      (templatesRes.data || []).forEach((t: TemplateRow) => {
        if (!templateMap[t.feature_key]) templateMap[t.feature_key] = {};
        templateMap[t.feature_key][t.access_level] = t.capability;
      });
      setTemplates(templateMap);

      const permMap: Record<string, Record<string, string>> = {};
      (permissionsRes.data || []).forEach((p: TemplateRow) => {
        if (!permMap[p.feature_key]) permMap[p.feature_key] = {};
        permMap[p.feature_key][p.access_level] = p.capability;
      });
      setPermissions(permMap);
      setOriginalPermissions(JSON.parse(JSON.stringify(permMap)));
      setHasChanges(false);

      const groups = new Set((featuresRes.data || []).map((f: FeatureControl) => f.feature_group));
      setExpandedGroups(groups);
    } catch (err: any) {
      console.error('Error loading access level data:', err);
      addNotification('error', 'Failed to load access level permissions');
    } finally {
      setLoading(false);
    }
  }, [scopeType, scopeId, addNotification]);

  useEffect(() => {
    if (scopeId) loadData();
  }, [loadData, scopeId]);

  const getEffectiveCapability = (featureKey: string, accessLevel: string): string => {
    const override = permissions[featureKey]?.[accessLevel];
    if (override) return override;
    const template = templates[featureKey]?.[accessLevel];
    if (template) return template;
    if (accessLevel === 'admin') return 'full';
    if (accessLevel === 'editor') return 'edit';
    return 'view';
  };

  const isOverride = (featureKey: string, accessLevel: string): boolean => {
    return !!permissions[featureKey]?.[accessLevel];
  };

  const handleCapabilityChange = (featureKey: string, accessLevel: string, capability: string) => {
    const templateDefault = templates[featureKey]?.[accessLevel] ||
      (accessLevel === 'admin' ? 'full' : accessLevel === 'editor' ? 'edit' : 'view');

    const newPerms = { ...permissions };
    if (capability === templateDefault) {
      if (newPerms[featureKey]) {
        delete newPerms[featureKey][accessLevel];
        if (Object.keys(newPerms[featureKey]).length === 0) {
          delete newPerms[featureKey];
        }
      }
    } else {
      if (!newPerms[featureKey]) newPerms[featureKey] = {};
      newPerms[featureKey][accessLevel] = capability;
    }
    setPermissions(newPerms);
    setHasChanges(JSON.stringify(newPerms) !== JSON.stringify(originalPermissions));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const scopeCol = scopeColumnMap[scopeType];

      const { error: deleteError } = await supabase
        .from('access_level_permissions')
        .delete()
        .eq(scopeCol, scopeId);

      if (deleteError) throw deleteError;

      const rows: any[] = [];
      Object.entries(permissions).forEach(([featureKey, levels]) => {
        Object.entries(levels).forEach(([accessLevel, capability]) => {
          const row: any = {
            feature_key: featureKey,
            access_level: accessLevel,
            capability,
          };
          row[scopeCol] = scopeId;
          rows.push(row);
        });
      });

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('access_level_permissions')
          .insert(rows);
        if (insertError) throw insertError;
      }

      setOriginalPermissions(JSON.parse(JSON.stringify(permissions)));
      setHasChanges(false);
      addNotification('success', 'Access level permissions saved');
    } catch (err: any) {
      console.error('Error saving permissions:', err);
      addNotification('error', `Failed to save: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    try {
      setSaving(true);
      const scopeCol = scopeColumnMap[scopeType];

      const { error } = await supabase
        .from('access_level_permissions')
        .delete()
        .eq(scopeCol, scopeId);

      if (error) throw error;

      setPermissions({});
      setOriginalPermissions({});
      setHasChanges(false);
      addNotification('success', 'All permissions reset to defaults');
    } catch (err: any) {
      console.error('Error resetting permissions:', err);
      addNotification('error', 'Failed to reset permissions');
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

  const overrideCount = Object.values(permissions).reduce((count, levels) => {
    return count + Object.keys(levels).length;
  }, 0);

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
          <h3 className="text-lg font-semibold text-white">Access Level Permissions</h3>
          <p className="text-sm text-slate-400 mt-1">
            Configure what each access level can do across features
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overrideCount > 0 && (
            <button
              onClick={handleResetAll}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-700/50 rounded-lg transition-colors"
            >
              <RotateCcw size={14} />
              Reset to Defaults
            </button>
          )}
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
        {ACCESS_LEVELS.map(level => {
          const count = Object.values(permissions).filter(levels => levels[level]).length;
          return (
            <div key={level} className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
              <div className={`text-2xl font-bold ${accessLevelColors[level]}`}>
                {count > 0 ? count : '--'}
              </div>
              <div className="text-xs text-slate-400">{accessLevelLabels[level]} Overrides</div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-400">
            Each position's access level (Admin/Editor/Viewer) determines which features they can use.
            When a member holds multiple positions, they receive the highest access level.
            Customizations override the system defaults -- use "Reset to Defaults" to revert.
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
          const groupOverrides = groupFeatures.filter(f =>
            ACCESS_LEVELS.some(l => isOverride(f.feature_key, l))
          ).length;

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
                  {groupOverrides > 0 && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                      {groupOverrides} customized
                    </span>
                  )}
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
                    const effective = getEffectiveCapability(feature.feature_key, level);
                    const hasOverride = isOverride(feature.feature_key, level);
                    return (
                      <div key={level} className="px-3 py-2 flex items-center justify-center">
                        <select
                          value={effective}
                          onChange={(e) => handleCapabilityChange(feature.feature_key, level, e.target.value)}
                          className={`w-full text-xs font-medium px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                            hasOverride
                              ? capabilityColors[effective] + ' ring-1 ring-blue-500/30'
                              : capabilityColors[effective]
                          } bg-transparent`}
                        >
                          {CAPABILITIES.map(cap => (
                            <option key={cap} value={cap} className="bg-slate-800 text-white">
                              {capabilityLabels[cap]}
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

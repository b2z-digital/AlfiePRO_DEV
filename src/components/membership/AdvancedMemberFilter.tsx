import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Filter, ChevronDown, BookmarkPlus } from 'lucide-react';
import {
  FilterCondition,
  FilterGroup,
  MemberFilterConfig,
  MEMBER_FILTER_FIELDS,
  getFilterField,
  getOperatorLabel
} from '../../types/memberFilters';
import {
  createEmptyCondition,
  createEmptyGroup,
  validateFilterConfig
} from '../../utils/memberFilters';

interface AdvancedMemberFilterProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: MemberFilterConfig) => void;
  initialConfig?: MemberFilterConfig;
  boatClasses: string[];
  memberCount: number;
  darkMode: boolean;
}

export const AdvancedMemberFilter: React.FC<AdvancedMemberFilterProps> = ({
  isOpen,
  onClose,
  onApply,
  initialConfig,
  boatClasses,
  memberCount,
  darkMode
}) => {
  const [filterConfig, setFilterConfig] = useState<MemberFilterConfig>(
    initialConfig || {
      groups: [
        {
          id: `group-${Date.now()}`,
          logic: 'AND',
          conditions: []
        }
      ],
      groupLogic: 'AND'
    }
  );

  useEffect(() => {
    if (initialConfig) {
      setFilterConfig(initialConfig);
    }
  }, [initialConfig]);

  const addGroup = () => {
    setFilterConfig({
      ...filterConfig,
      groups: [...filterConfig.groups, createEmptyGroup()]
    });
  };

  const removeGroup = (groupId: string) => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.filter(g => g.id !== groupId)
    });
  };

  const updateGroupLogic = (groupId: string, logic: 'AND' | 'OR') => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.map(g =>
        g.id === groupId ? { ...g, logic } : g
      )
    });
  };

  const addCondition = (groupId: string) => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.map(g =>
        g.id === groupId
          ? { ...g, conditions: [...g.conditions, createEmptyCondition()] }
          : g
      )
    });
  };

  const removeCondition = (groupId: string, conditionId: string) => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.map(g =>
        g.id === groupId
          ? { ...g, conditions: g.conditions.filter(c => c.id !== conditionId) }
          : g
      )
    });
  };

  const updateCondition = (
    groupId: string,
    conditionId: string,
    updates: Partial<FilterCondition>
  ) => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.map(g =>
        g.id === groupId
          ? {
              ...g,
              conditions: g.conditions.map(c =>
                c.id === conditionId ? { ...c, ...updates } : c
              )
            }
          : g
      )
    });
  };

  const handleApply = () => {
    const validation = validateFilterConfig(filterConfig);
    if (!validation.valid) {
      alert(`Filter validation failed:\n${validation.errors.join('\n')}`);
      return;
    }
    onApply(filterConfig);
    onClose();
  };

  const handleClear = () => {
    setFilterConfig({
      groups: [
        {
          id: `group-${Date.now()}`,
          logic: 'AND',
          conditions: []
        }
      ],
      groupLogic: 'AND'
    });
  };

  const renderConditionValue = (
    groupId: string,
    condition: FilterCondition
  ) => {
    const field = getFilterField(condition.field);
    if (!field) return null;

    // Operators that don't need a value
    const noValueOperators = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];
    if (noValueOperators.includes(condition.operator)) {
      return null;
    }

    // Special handling for boat class
    if (field.id === 'boat_class') {
      return (
        <select
          multiple
          value={condition.value || []}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, option => option.value);
            updateCondition(groupId, condition.id, { value: selected });
          }}
          className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {boatClasses.map(bc => (
            <option key={bc} value={bc}>{bc}</option>
          ))}
        </select>
      );
    }

    // Select type
    if (field.type === 'select' && field.options) {
      if (condition.operator === 'in' || condition.operator === 'not_in') {
        return (
          <select
            multiple
            value={condition.value || []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, option => option.value);
              updateCondition(groupId, condition.id, { value: selected });
            }}
            className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {field.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      }

      return (
        <select
          value={condition.value || ''}
          onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
          className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select...</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    // Date type
    if (field.type === 'date') {
      if (condition.operator === 'in_last' || condition.operator === 'in_next') {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={condition.value || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
              placeholder="Number"
              className="w-24 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400">days</span>
          </div>
        );
      }

      if (condition.operator === 'between') {
        return (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={condition.value || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
              className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400">and</span>
            <input
              type="date"
              value={condition.value2 || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value2: e.target.value })}
              className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
      }

      return (
        <input
          type="date"
          value={condition.value || ''}
          onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
          className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );
    }

    // Number type
    if (field.type === 'number') {
      if (condition.operator === 'between') {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={condition.value || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
              placeholder="From"
              className="w-32 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400">and</span>
            <input
              type="number"
              value={condition.value2 || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value2: e.target.value })}
              placeholder="To"
              className="w-32 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
      }

      return (
        <input
          type="number"
          value={condition.value || ''}
          onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
          placeholder={field.placeholder}
          className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );
    }

    // Text type (default)
    return (
      <input
        type="text"
        value={condition.value || ''}
        onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
        placeholder={field.placeholder}
        className="flex-1 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-6xl bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-b border-slate-600/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Filter className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Advanced Member Filters</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Build complex filters with multiple conditions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Group Logic Selector */}
            {filterConfig.groups.length > 1 && (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-medium text-slate-300">Combine groups with:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterConfig({ ...filterConfig, groupLogic: 'AND' })}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      filterConfig.groupLogic === 'AND'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    AND
                  </button>
                  <button
                    onClick={() => setFilterConfig({ ...filterConfig, groupLogic: 'OR' })}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      filterConfig.groupLogic === 'OR'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    OR
                  </button>
                </div>
              </div>
            )}

            {/* Filter Groups */}
            {filterConfig.groups.map((group, groupIndex) => (
              <div
                key={group.id}
                className="p-4 rounded-xl bg-slate-800/50 border border-slate-700"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-400">
                      Group {groupIndex + 1}
                    </span>
                    {group.conditions.length > 1 && (
                      <>
                        <span className="text-slate-500">•</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateGroupLogic(group.id, 'AND')}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              group.logic === 'AND'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            }`}
                          >
                            AND
                          </button>
                          <button
                            onClick={() => updateGroupLogic(group.id, 'OR')}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              group.logic === 'OR'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            }`}
                          >
                            OR
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {filterConfig.groups.length > 1 && (
                    <button
                      onClick={() => removeGroup(group.id)}
                      className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition-colors"
                      title="Remove group"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {/* Conditions */}
                <div className="space-y-3">
                  {group.conditions.map((condition, condIndex) => {
                    const field = getFilterField(condition.field);
                    const availableOperators = field ? field.operators : [];

                    return (
                      <div
                        key={condition.id}
                        className="flex items-start gap-2 p-3 rounded-lg bg-slate-900/50"
                      >
                        {condIndex > 0 && (
                          <span className="text-xs font-medium text-slate-500 pt-2">
                            {group.logic}
                          </span>
                        )}

                        {/* Field Selector */}
                        <select
                          value={condition.field}
                          onChange={(e) => {
                            const newField = getFilterField(e.target.value);
                            updateCondition(group.id, condition.id, {
                              field: e.target.value,
                              operator: newField?.operators[0] || 'equals',
                              value: '',
                              value2: undefined
                            });
                          }}
                          className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select field...</option>
                          {MEMBER_FILTER_FIELDS.map(f => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>

                        {/* Operator Selector */}
                        <select
                          value={condition.operator}
                          onChange={(e) => updateCondition(group.id, condition.id, {
                            operator: e.target.value as any,
                            value: '',
                            value2: undefined
                          })}
                          disabled={!condition.field}
                          className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                          {availableOperators.map(op => (
                            <option key={op} value={op}>
                              {getOperatorLabel(op)}
                            </option>
                          ))}
                        </select>

                        {/* Value Input */}
                        {renderConditionValue(group.id, condition)}

                        {/* Remove Condition */}
                        <button
                          onClick={() => removeCondition(group.id, condition.id)}
                          className="p-2 rounded text-red-400 hover:bg-red-900/20 transition-colors flex-shrink-0"
                          title="Remove condition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add Condition Button */}
                  <button
                    onClick={() => addCondition(group.id)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                    Add condition
                  </button>
                </div>
              </div>
            ))}

            {/* Add Group Button */}
            <button
              onClick={addGroup}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-slate-300 hover:text-white border-2 border-dashed border-slate-700 hover:border-slate-600 rounded-xl transition-colors"
            >
              <Plus size={18} />
              Add filter group
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-6 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-t border-slate-600/50">
          <div className="text-sm text-slate-400">
            {memberCount} member{memberCount !== 1 ? 's' : ''} will be displayed
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClear}
              className="px-6 py-2.5 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-medium"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl font-medium"
            >
              <Filter size={18} />
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

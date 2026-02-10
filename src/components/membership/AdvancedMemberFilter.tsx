import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Filter, ChevronDown, Check } from 'lucide-react';
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

interface DropdownOption {
  value: string;
  label: string;
}

const FilterDropdown: React.FC<{
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minWidth?: number;
}> = ({ value, options, onChange, placeholder = 'Select...', disabled, minWidth = 180 }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, minWidth) });
  }, [minWidth]);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onClickOut = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current && !btnRef.current.contains(t) && menuRef.current && !menuRef.current.contains(t)) {
        setOpen(false);
      }
    };
    const onScroll = () => updatePos();
    document.addEventListener('mousedown', onClickOut);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onClickOut);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePos]);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        className={`
          flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
          bg-slate-800/80 text-slate-200 border border-slate-700/60
          ${open ? 'ring-2 ring-blue-500/40 border-blue-500/50' : 'hover:bg-slate-700/80'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        style={{ minWidth }}
      >
        <span className={selected ? 'text-slate-200' : 'text-slate-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="rounded-xl shadow-2xl border bg-slate-800 border-slate-700 shadow-black/50"
        >
          <div className="py-1 max-h-[260px] overflow-y-auto overscroll-contain rounded-xl
            [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600/50"
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`
                  w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors text-left
                  ${value === opt.value ? 'bg-blue-500/15 text-blue-400' : 'text-slate-300 hover:bg-slate-700/80'}
                `}
              >
                <span>{opt.label}</span>
                {value === opt.value && <Check size={14} className="text-blue-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const FilterMultiSelect: React.FC<{
  value: string[];
  options: DropdownOption[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}> = ({ value, options, onChange, placeholder = 'Select...' }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200) });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onClickOut = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current && !btnRef.current.contains(t) && menuRef.current && !menuRef.current.contains(t)) {
        setOpen(false);
      }
    };
    const onScroll = () => updatePos();
    document.addEventListener('mousedown', onClickOut);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onClickOut);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePos]);

  const toggle = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const selectedLabels = value.map(v => options.find(o => o.value === v)?.label).filter(Boolean);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
          bg-slate-800/80 text-slate-200 border border-slate-700/60
          ${open ? 'ring-2 ring-blue-500/40 border-blue-500/50' : 'hover:bg-slate-700/80'}
        `}
        style={{ minWidth: 200 }}
      >
        <span className={selectedLabels.length > 0 ? 'text-slate-200 truncate' : 'text-slate-500'}>
          {selectedLabels.length > 0 ? `${selectedLabels.length} selected` : placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="rounded-xl shadow-2xl border bg-slate-800 border-slate-700 shadow-black/50"
        >
          <div className="py-1 max-h-[260px] overflow-y-auto overscroll-contain rounded-xl
            [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600/50"
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`
                  w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors text-left
                  ${value.includes(opt.value) ? 'bg-blue-500/15 text-blue-400' : 'text-slate-300 hover:bg-slate-700/80'}
                `}
              >
                <span>{opt.label}</span>
                {value.includes(opt.value) && <Check size={14} className="text-blue-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

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

  const inputClass = "px-4 py-2.5 bg-slate-800/80 text-sm text-slate-200 rounded-xl border border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all";

  const renderConditionValue = (
    groupId: string,
    condition: FilterCondition
  ) => {
    const field = getFilterField(condition.field);
    if (!field) return null;

    const noValueOperators = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];
    if (noValueOperators.includes(condition.operator)) {
      return null;
    }

    if (field.id === 'boat_class') {
      return (
        <FilterMultiSelect
          value={Array.isArray(condition.value) ? condition.value : []}
          options={boatClasses.map(bc => ({ value: bc, label: bc }))}
          onChange={(selected) => updateCondition(groupId, condition.id, { value: selected })}
          placeholder="Select classes..."
        />
      );
    }

    if (field.type === 'select' && field.options) {
      if (condition.operator === 'in' || condition.operator === 'not_in') {
        return (
          <FilterMultiSelect
            value={Array.isArray(condition.value) ? condition.value : []}
            options={field.options.map(opt => ({ value: opt.value, label: opt.label }))}
            onChange={(selected) => updateCondition(groupId, condition.id, { value: selected })}
            placeholder="Select values..."
          />
        );
      }

      return (
        <FilterDropdown
          value={typeof condition.value === 'string' ? condition.value : ''}
          options={field.options.map(opt => ({ value: opt.value, label: opt.label }))}
          onChange={(val) => updateCondition(groupId, condition.id, { value: val })}
          placeholder="Select value..."
        />
      );
    }

    if (field.type === 'date') {
      if (condition.operator === 'in_last' || condition.operator === 'in_next') {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={condition.value || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
              placeholder="Number"
              className={`w-24 ${inputClass}`}
            />
            <span className="text-slate-400 text-sm">days</span>
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
              className={inputClass}
            />
            <span className="text-slate-400 text-sm">and</span>
            <input
              type="date"
              value={condition.value2 || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value2: e.target.value })}
              className={inputClass}
            />
          </div>
        );
      }

      return (
        <input
          type="date"
          value={condition.value || ''}
          onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
          className={inputClass}
        />
      );
    }

    if (field.type === 'number') {
      if (condition.operator === 'between') {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={condition.value || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
              placeholder="From"
              className={`w-32 ${inputClass}`}
            />
            <span className="text-slate-400 text-sm">and</span>
            <input
              type="number"
              value={condition.value2 || ''}
              onChange={(e) => updateCondition(groupId, condition.id, { value2: e.target.value })}
              placeholder="To"
              className={`w-32 ${inputClass}`}
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
          className={inputClass}
        />
      );
    }

    return (
      <input
        type="text"
        value={condition.value || ''}
        onChange={(e) => updateCondition(groupId, condition.id, { value: e.target.value })}
        placeholder={field.placeholder}
        className={`flex-1 ${inputClass}`}
      />
    );
  };

  if (!isOpen) return null;

  const fieldOptions: DropdownOption[] = [
    { value: '', label: 'Select field...' },
    ...MEMBER_FILTER_FIELDS.map(f => ({ value: f.id, label: f.label }))
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] border border-slate-700/50">
        <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <Filter className="text-white" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Advanced Member Filters</h2>
              <p className="text-sm text-blue-100 mt-0.5">
                Build complex filters with multiple conditions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/15 p-2 rounded-xl transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {filterConfig.groups.length > 1 && (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-medium text-slate-300">Combine groups with:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterConfig({ ...filterConfig, groupLogic: 'AND' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      filterConfig.groupLogic === 'AND'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    AND
                  </button>
                  <button
                    onClick={() => setFilterConfig({ ...filterConfig, groupLogic: 'OR' })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      filterConfig.groupLogic === 'OR'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    OR
                  </button>
                </div>
              </div>
            )}

            {filterConfig.groups.map((group, groupIndex) => (
              <div
                key={group.id}
                className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-400">
                      Group {groupIndex + 1}
                    </span>
                    {group.conditions.length > 1 && (
                      <>
                        <span className="text-slate-500">&#8226;</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateGroupLogic(group.id, 'AND')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                              group.logic === 'AND'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                            }`}
                          >
                            AND
                          </button>
                          <button
                            onClick={() => updateGroupLogic(group.id, 'OR')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                              group.logic === 'OR'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
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
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      title="Remove group"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {group.conditions.map((condition, condIndex) => {
                    const field = getFilterField(condition.field);
                    const availableOperators = field ? field.operators : [];

                    const operatorOptions: DropdownOption[] = availableOperators.map(op => ({
                      value: op,
                      label: getOperatorLabel(op)
                    }));

                    return (
                      <div
                        key={condition.id}
                        className="flex items-start gap-2 p-3 rounded-xl bg-slate-900/40 border border-slate-700/30"
                      >
                        {condIndex > 0 && (
                          <span className="text-xs font-medium text-slate-500 pt-2.5">
                            {group.logic}
                          </span>
                        )}

                        <FilterDropdown
                          value={condition.field}
                          options={fieldOptions}
                          onChange={(val) => {
                            const newField = getFilterField(val);
                            updateCondition(group.id, condition.id, {
                              field: val,
                              operator: newField?.operators[0] || 'equals',
                              value: '',
                              value2: undefined
                            });
                          }}
                          placeholder="Select field..."
                          minWidth={200}
                        />

                        <FilterDropdown
                          value={condition.operator}
                          options={operatorOptions}
                          onChange={(val) => updateCondition(group.id, condition.id, {
                            operator: val as FilterCondition['operator'],
                            value: '',
                            value2: undefined
                          })}
                          placeholder="Operator..."
                          disabled={!condition.field}
                          minWidth={160}
                        />

                        {renderConditionValue(group.id, condition)}

                        <button
                          onClick={() => removeCondition(group.id, condition.id)}
                          className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex-shrink-0"
                          title="Remove condition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => addCondition(group.id)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-xl transition-colors"
                  >
                    <Plus size={16} />
                    Add condition
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={addGroup}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-slate-400 hover:text-white border-2 border-dashed border-slate-700/50 hover:border-slate-600 rounded-xl transition-all"
            >
              <Plus size={18} />
              Add filter group
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-5 border-t border-slate-700/50">
          <div className="text-sm text-slate-400">
            {memberCount} member{memberCount !== 1 ? 's' : ''} will be displayed
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClear}
              className="px-5 py-2.5 rounded-xl font-medium transition-colors text-slate-300 hover:text-white hover:bg-slate-800"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-medium transition-colors text-slate-300 hover:text-white hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 font-medium transition-colors"
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

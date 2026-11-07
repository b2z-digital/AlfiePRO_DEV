import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FilterCondition,
  MemberFilterConfig,
  MEMBER_FILTER_FIELDS,
  getFilterField,
  getOperatorLabel
} from '../../types/memberFilters';
import {
  createEmptyCondition,
  createEmptyGroup,
  validateFilterConfig,
  countFilteredMembers
} from '../../utils/memberFilters';
import { AlfieIcon } from '../brand/AlfieIcon';

/* Advanced member filters, on the Alfie sheet. Same filter model and behaviour as before:
   groups of conditions joined by AND / OR, groups joined by AND / OR. Menus are portalled,
   solid, flip upwards near the bottom of the screen, and the field menu can be searched. */

interface DropdownOption {
  value: string;
  label: string;
  group?: string;
}

const NO_VALUE_OPERATORS = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];

// Section headings for the field menu (fields not listed fall under "Other")
const FIELD_SECTIONS: [string, string[]][] = [
  ['Name and contact', ['first_name', 'last_name', 'email', 'phone']],
  ['Location', ['city', 'state', 'postcode', 'country']],
  ['Membership', ['is_financial', 'membership_status', 'membership_level', 'membership_category', 'category']],
  ['Dates', ['date_joined', 'renewal_date', 'payment_confirmed_at']],
  ['Payment', ['payment_status', 'payment_method', 'amount_paid']],
  ['Boats', ['boat_class', 'boat_count']],
  ['Emergency contact', ['emergency_contact_name', 'emergency_contact_phone']],
  ['AlfiePRO account', ['user_id', 'invite_status']],
];
const sectionOf = (id: string) => FIELD_SECTIONS.find(([, ids]) => ids.includes(id))?.[0] || 'Other';

/** Positions a portalled menu under (or above) its button and keeps it there while scrolling. */
function useMenuPosition(open: boolean, btnRef: React.RefObject<HTMLButtonElement>, minWidth: number) {
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, width: minWidth, top: 0, maxHeight: 300 });
  const update = useCallback(() => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, minWidth), vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    if (below < 240 && above > below) {
      setPos({ left, width, bottom: vh - r.top + 6, maxHeight: Math.min(340, above) });
    } else {
      setPos({ left, width, top: r.bottom + 6, maxHeight: Math.min(340, Math.max(160, below)) });
    }
  }, [btnRef, minWidth]);
  useEffect(() => {
    if (!open) return;
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, update]);
  return pos;
}

const Menu: React.FC<{
  open: boolean;
  onClose: () => void;
  btnRef: React.RefObject<HTMLButtonElement>;
  minWidth: number;
  options: DropdownOption[];
  isSelected: (v: string) => boolean;
  onPick: (v: string) => void;
  searchable?: boolean;
  multi?: boolean;
  label: string;
}> = ({ open, onClose, btnRef, minWidth, options, isSelected, onPick, searchable, multi, label }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const pos = useMenuPosition(open, btnRef, minWidth);

  useEffect(() => {
    if (!open) { setQ(''); return; }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, btnRef]);

  // Scroll the chosen option into view when the menu opens
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }, [open]);

  if (!open) return null;
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  let lastGroup: string | undefined;

  return createPortal(
    <div
      ref={menuRef}
      className="a-mf-menu"
      role="listbox"
      aria-label={label}
      aria-multiselectable={multi || undefined}
      style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, zIndex: 100000 }}
    >
      {searchable && (
        <div className="a-mf-search">
          <AlfieIcon glyph="search" size={15} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search fields" aria-label="Search fields" />
        </div>
      )}
      <div className="a-mf-list">
        {shown.length === 0 && <div className="a-mf-none">No matches</div>}
        {shown.map(o => {
          const head = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          const on = isSelected(o.value);
          return (
            <React.Fragment key={o.value}>
              {head && <div className="a-mf-sec">{head}</div>}
              <button
                type="button"
                role="option"
                aria-selected={on}
                className={`a-mf-opt ${on ? 'a-mf-opt-on' : ''}`}
                onClick={() => { onPick(o.value); if (!multi) { onClose(); btnRef.current?.focus(); } }}
              >
                {multi && <span className={`a-mf-chk ${on ? 'a-mf-chk-on' : ''}`}>{on && <AlfieIcon glyph="check" size={12} strokeWidth={2.6} />}</span>}
                <span className="a-mf-opt-l">{o.label}</span>
                {!multi && on && <AlfieIcon glyph="check" size={15} strokeWidth={2.2} className="a-mf-tick" />}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>,
    document.body
  );
};

const FilterDropdown: React.FC<{
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minWidth?: number;
  searchable?: boolean;
  label: string;
}> = ({ value, options, onChange, placeholder = 'Select…', disabled, minWidth = 180, searchable, label }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find(o => o.value === value);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? `${label}: ${selected.label}` : label}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`a-mf-pick ${open ? 'a-mf-pick-open' : ''}`}
        style={{ minWidth }}
      >
        <span className={selected ? '' : 'a-mf-ph'}>{selected ? selected.label : placeholder}</span>
        <AlfieIcon glyph="chev" size={15} className={`a-mf-chev ${open ? 'a-mf-chev-up' : ''}`} />
      </button>
      <Menu open={open} onClose={close} btnRef={btnRef} minWidth={Math.max(minWidth, 220)} options={options}
        isSelected={v => v === value} onPick={onChange} searchable={searchable} label={label} />
    </>
  );
};

const FilterMultiSelect: React.FC<{
  value: string[];
  options: DropdownOption[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label: string;
}> = ({ value, options, onChange, placeholder = 'Select…', label }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const labels = value.map(v => options.find(o => o.value === v)?.label).filter(Boolean) as string[];
  const text = labels.length === 0 ? placeholder : labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={labels.length ? `${label}: ${labels.join(', ')}` : label}
        onClick={() => setOpen(o => !o)}
        className={`a-mf-pick ${open ? 'a-mf-pick-open' : ''}`}
        style={{ minWidth: 200 }}
      >
        <span className={labels.length ? 'truncate' : 'a-mf-ph'}>{text}</span>
        <AlfieIcon glyph="chev" size={15} className={`a-mf-chev ${open ? 'a-mf-chev-up' : ''}`} />
      </button>
      <Menu open={open} onClose={close} btnRef={btnRef} minWidth={220} options={options} multi label={label}
        isSelected={v => value.includes(v)}
        onPick={v => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])} />
    </>
  );
};

const Logic: React.FC<{ value: 'AND' | 'OR'; onChange: (v: 'AND' | 'OR') => void; label: string; all: string; any: string }> = ({ value, onChange, label, all, any }) => (
  <div className="a-seg a-mf-seg" role="radiogroup" aria-label={label}>
    <button type="button" role="radio" aria-checked={value === 'AND'} className={`a-seg-i ${value === 'AND' ? 'a-seg-on' : ''}`} onClick={() => onChange('AND')}>{all}</button>
    <button type="button" role="radio" aria-checked={value === 'OR'} className={`a-seg-i ${value === 'OR' ? 'a-seg-on' : ''}`} onClick={() => onChange('OR')}>{any}</button>
  </div>
);

interface AdvancedMemberFilterProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: MemberFilterConfig) => void;
  initialConfig?: MemberFilterConfig;
  boatClasses: string[];
  /** Count shown in the footer when the members list isn't passed in */
  memberCount?: number;
  /** When passed, the footer shows a live count for the filters being built */
  members?: any[];
  darkMode?: boolean;
}

const isComplete = (c: FilterCondition) =>
  !!c.field && !!c.operator && (
    NO_VALUE_OPERATORS.includes(c.operator) ||
    (Array.isArray(c.value) ? c.value.length > 0 : c.value !== '' && c.value !== undefined && c.value !== null) &&
    (c.operator !== 'between' || (c.value2 !== '' && c.value2 !== undefined && c.value2 !== null))
  );

export const AdvancedMemberFilter: React.FC<AdvancedMemberFilterProps> = ({
  isOpen,
  onClose,
  onApply,
  initialConfig,
  boatClasses,
  memberCount,
  members,
}) => {
  const [filterConfig, setFilterConfig] = useState<MemberFilterConfig>(
    initialConfig || {
      groups: [{ id: `group-${Date.now()}`, logic: 'AND', conditions: [] }],
      groupLogic: 'AND'
    }
  );
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (initialConfig) {
      setFilterConfig(initialConfig);
    }
  }, [initialConfig]);

  useEffect(() => { setErrors([]); }, [filterConfig]);

  // Close on Escape (menus handle their own Escape first)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const liveCount = useMemo(() => {
    if (!members) return null;
    try {
      const complete: MemberFilterConfig = {
        ...filterConfig,
        groups: filterConfig.groups
          .map(g => ({ ...g, conditions: g.conditions.filter(isComplete) }))
          .filter(g => g.conditions.length > 0),
      };
      return complete.groups.length === 0 ? members.length : countFilteredMembers(members as any, complete);
    } catch {
      return null;
    }
  }, [members, filterConfig]);

  const addGroup = () => {
    setFilterConfig({ ...filterConfig, groups: [...filterConfig.groups, createEmptyGroup()] });
  };

  const removeGroup = (groupId: string) => {
    setFilterConfig({ ...filterConfig, groups: filterConfig.groups.filter(g => g.id !== groupId) });
  };

  const updateGroupLogic = (groupId: string, logic: 'AND' | 'OR') => {
    setFilterConfig({ ...filterConfig, groups: filterConfig.groups.map(g => (g.id === groupId ? { ...g, logic } : g)) });
  };

  const addCondition = (groupId: string) => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.map(g => (g.id === groupId ? { ...g, conditions: [...g.conditions, createEmptyCondition()] } : g))
    });
  };

  const removeCondition = (groupId: string, conditionId: string) => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.map(g => (g.id === groupId ? { ...g, conditions: g.conditions.filter(c => c.id !== conditionId) } : g))
    });
  };

  const updateCondition = (groupId: string, conditionId: string, updates: Partial<FilterCondition>) => {
    setFilterConfig({
      ...filterConfig,
      groups: filterConfig.groups.map(g =>
        g.id === groupId ? { ...g, conditions: g.conditions.map(c => (c.id === conditionId ? { ...c, ...updates } : c)) } : g
      )
    });
  };

  const isFilterEmpty = (config: MemberFilterConfig) => config.groups.every(g => g.conditions.length === 0);

  const handleApply = () => {
    if (isFilterEmpty(filterConfig)) {
      onApply(filterConfig);
      onClose();
      return;
    }
    const validation = validateFilterConfig(filterConfig);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    onApply(filterConfig);
    onClose();
  };

  const handleClear = () => {
    const emptyConfig: MemberFilterConfig = {
      groups: [{ id: `group-${Date.now()}`, logic: 'AND', conditions: [] }],
      groupLogic: 'AND'
    };
    onApply(emptyConfig);
    onClose();
  };

  const renderConditionValue = (groupId: string, condition: FilterCondition) => {
    const field = getFilterField(condition.field);
    if (!field) return null;
    if (NO_VALUE_OPERATORS.includes(condition.operator)) return null;

    if (field.id === 'boat_class') {
      return (
        <FilterMultiSelect
          label="Boat classes"
          value={Array.isArray(condition.value) ? condition.value : []}
          options={boatClasses.map(bc => ({ value: bc, label: bc }))}
          onChange={selected => updateCondition(groupId, condition.id, { value: selected })}
          placeholder="Select classes"
        />
      );
    }

    if (field.type === 'select' && field.options) {
      if (condition.operator === 'in' || condition.operator === 'not_in') {
        return (
          <FilterMultiSelect
            label={`${field.label} values`}
            value={Array.isArray(condition.value) ? condition.value : []}
            options={field.options.map(opt => ({ value: opt.value, label: opt.label }))}
            onChange={selected => updateCondition(groupId, condition.id, { value: selected })}
            placeholder="Select values"
          />
        );
      }
      return (
        <FilterDropdown
          label={`${field.label} value`}
          value={typeof condition.value === 'string' ? condition.value : ''}
          options={field.options.map(opt => ({ value: opt.value, label: opt.label }))}
          onChange={val => updateCondition(groupId, condition.id, { value: val })}
          placeholder="Select value"
        />
      );
    }

    if (field.type === 'date') {
      if (condition.operator === 'in_last' || condition.operator === 'in_next') {
        return (
          <div className="a-mf-inline">
            <input type="number" min={0} value={condition.value || ''} aria-label="Number of days"
              onChange={e => updateCondition(groupId, condition.id, { value: e.target.value })}
              placeholder="30" className="a-inp a-mf-inp" style={{ width: 96 }} />
            <span className="a-mute">days</span>
          </div>
        );
      }
      if (condition.operator === 'between') {
        return (
          <div className="a-mf-inline">
            <input type="date" value={condition.value || ''} aria-label="From date"
              onChange={e => updateCondition(groupId, condition.id, { value: e.target.value })} className="a-inp a-mf-inp" />
            <span className="a-mute">and</span>
            <input type="date" value={condition.value2 || ''} aria-label="To date"
              onChange={e => updateCondition(groupId, condition.id, { value2: e.target.value })} className="a-inp a-mf-inp" />
          </div>
        );
      }
      return (
        <input type="date" value={condition.value || ''} aria-label={`${field.label} date`}
          onChange={e => updateCondition(groupId, condition.id, { value: e.target.value })} className="a-inp a-mf-inp" />
      );
    }

    if (field.type === 'number') {
      if (condition.operator === 'between') {
        return (
          <div className="a-mf-inline">
            <input type="number" value={condition.value || ''} aria-label="From"
              onChange={e => updateCondition(groupId, condition.id, { value: e.target.value })}
              placeholder="From" className="a-inp a-mf-inp" style={{ width: 120 }} />
            <span className="a-mute">and</span>
            <input type="number" value={condition.value2 || ''} aria-label="To"
              onChange={e => updateCondition(groupId, condition.id, { value2: e.target.value })}
              placeholder="To" className="a-inp a-mf-inp" style={{ width: 120 }} />
          </div>
        );
      }
      return (
        <input type="number" value={condition.value || ''} aria-label={field.label}
          onChange={e => updateCondition(groupId, condition.id, { value: e.target.value })}
          placeholder={field.placeholder} className="a-inp a-mf-inp" style={{ width: 160 }} />
      );
    }

    return (
      <input type="text" value={condition.value || ''} aria-label={field.label}
        onChange={e => updateCondition(groupId, condition.id, { value: e.target.value })}
        placeholder={field.placeholder} className="a-inp a-mf-inp a-mf-grow" />
    );
  };

  if (!isOpen) return null;

  const fieldOptions: DropdownOption[] = FIELD_SECTIONS.flatMap(([section, ids]) =>
    ids.map(id => MEMBER_FILTER_FIELDS.find(f => f.id === id)).filter(Boolean).map(f => ({ value: f!.id, label: f!.label, group: section }))
  ).concat(
    MEMBER_FILTER_FIELDS.filter(f => sectionOf(f.id) === 'Other').map(f => ({ value: f.id, label: f.label, group: 'Other' }))
  );

  const total = members ? members.length : null;
  const shownCount = liveCount ?? memberCount;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <section className="a-sheet a-mf relative w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="a-mf-title">
        <header className="a-sheet-head a-bd border-b flex items-center gap-3.5" style={{ padding: '18px 18px 16px 22px' }}>
          <span className="a-tile a-tile-rim" style={{ width: 44, height: 44 }}><AlfieIcon glyph="filter" size={20} /></span>
          <div className="flex-1 min-w-0">
            <h2 id="a-mf-title" className="a-display a-ink text-[20px] font-semibold leading-tight">Advanced member filters</h2>
            <p className="a-mute text-[13.5px] mt-0.5">Build a filter from any member detail. Combine conditions and groups.</p>
          </div>
          <button type="button" className="a-ib" onClick={onClose} aria-label="Close"><AlfieIcon glyph="x" size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto a-mf-body">
          {filterConfig.groups.length > 1 && (
            <div className="a-mf-combine">
              <span>Show members who match</span>
              <Logic label="Combine groups" value={filterConfig.groupLogic} onChange={v => setFilterConfig({ ...filterConfig, groupLogic: v })} all="All groups" any="Any group" />
            </div>
          )}

          {filterConfig.groups.map((group, groupIndex) => (
            <React.Fragment key={group.id}>
              {groupIndex > 0 && <div className="a-mf-between"><span>{filterConfig.groupLogic === 'AND' ? 'and' : 'or'}</span></div>}
              <section className="a-mf-group" aria-label={`Group ${groupIndex + 1}`}>
                <div className="a-mf-gh">
                  <span className="a-cap">Group {groupIndex + 1}</span>
                  {group.conditions.length > 1 && (
                    <span className="a-mf-gh-logic">
                      <span className="a-mute">Match</span>
                      <Logic label={`Group ${groupIndex + 1} logic`} value={group.logic} onChange={v => updateGroupLogic(group.id, v)} all="All" any="Any" />
                      <span className="a-mute">of these</span>
                    </span>
                  )}
                  <span className="flex-1" />
                  {filterConfig.groups.length > 1 && (
                    <button type="button" className="a-ib a-ib-d" onClick={() => removeGroup(group.id)} aria-label={`Remove group ${groupIndex + 1}`} title="Remove group">
                      <AlfieIcon glyph="trash" size={17} />
                    </button>
                  )}
                </div>

                {group.conditions.length === 0 && (
                  <p className="a-mf-empty">No conditions yet. Add one to start filtering.</p>
                )}

                <div className="a-mf-rows">
                  {group.conditions.map((condition, condIndex) => {
                    const field = getFilterField(condition.field);
                    const operatorOptions: DropdownOption[] = (field ? field.operators : []).map(op => ({ value: op, label: getOperatorLabel(op) }));
                    return (
                      <div key={condition.id} className="a-mf-row">
                        <span className="a-mf-join">{condIndex === 0 ? 'Where' : group.logic === 'AND' ? 'and' : 'or'}</span>
                        <FilterDropdown
                          label="Field"
                          value={condition.field}
                          options={fieldOptions}
                          searchable
                          onChange={val => {
                            const newField = getFilterField(val);
                            updateCondition(group.id, condition.id, {
                              field: val,
                              operator: newField?.operators[0] || 'equals',
                              value: '',
                              value2: undefined
                            });
                          }}
                          placeholder="Choose a field"
                          minWidth={200}
                        />
                        <FilterDropdown
                          label="Condition"
                          value={condition.operator}
                          options={operatorOptions}
                          onChange={val => updateCondition(group.id, condition.id, {
                            operator: val as FilterCondition['operator'],
                            value: '',
                            value2: undefined
                          })}
                          placeholder="Condition"
                          disabled={!condition.field}
                          minWidth={170}
                        />
                        {renderConditionValue(group.id, condition)}
                        <span className="flex-1" />
                        <button type="button" className="a-ib a-ib-d" onClick={() => removeCondition(group.id, condition.id)} aria-label="Remove condition" title="Remove condition">
                          <AlfieIcon glyph="trash" size={17} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button type="button" className="a-mf-add" onClick={() => addCondition(group.id)}>
                  <AlfieIcon glyph="plus" size={16} strokeWidth={2} />Add condition
                </button>
              </section>
            </React.Fragment>
          ))}

          <button type="button" className="a-mf-addgroup" onClick={addGroup}>
            <AlfieIcon glyph="plus" size={17} strokeWidth={2} />Add filter group
          </button>
        </div>

        <footer className="a-sheet-foot a-mf-foot">
          <div className="a-mf-count">
            {errors.length > 0 ? (
              <span className="a-mf-err" role="alert">{errors[0]}{errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}</span>
            ) : shownCount !== undefined && shownCount !== null ? (
              <span><b className="a-ink a-num">{shownCount}</b>{total !== null ? ` of ${total}` : ''} member{(total ?? shownCount) !== 1 ? 's' : ''} {liveCount !== null ? 'match' : 'will be displayed'}</span>
            ) : null}
          </div>
          <button type="button" className="a-btn a-btn-q" onClick={handleClear}>Clear all</button>
          <button type="button" className="a-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="a-btn a-btn-p" onClick={handleApply}>
            <AlfieIcon glyph="filter" size={17} />Apply filters
          </button>
        </footer>
      </section>
    </div>
  );
};

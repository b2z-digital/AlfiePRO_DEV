import { Member } from '../types/member';
import { FilterCondition, FilterGroup, MemberFilterConfig, FilterOperator } from '../types/memberFilters';

/**
 * Apply a single filter condition to a member
 */
export const applyFilterCondition = (member: any, condition: FilterCondition): boolean => {
  const { field, operator, value, value2 } = condition;

  // Get the field value from member
  let fieldValue = member[field];

  // Special handling for nested/computed fields
  if (field === 'boat_class') {
    // Get all boat classes for this member
    const boatClasses = member.boats?.map((boat: any) => boat.boat_type).filter(Boolean) || [];

    if (operator === 'in') {
      if (!value || value.length === 0) return true;
      return boatClasses.some((bc: string) => value.includes(bc));
    }
    if (operator === 'not_in') {
      if (!value || value.length === 0) return true;
      return !boatClasses.some((bc: string) => value.includes(bc));
    }
    if (operator === 'is_empty') {
      return boatClasses.length === 0;
    }
    return false;
  }

  if (field === 'boat_count') {
    fieldValue = member.boats?.length || 0;
  }

  if (field === 'user_id') {
    // Check if user has an account
    const hasAccount = !!member.user_id;
    if (operator === 'equals') {
      return value === 'true' ? hasAccount : !hasAccount;
    }
    return false;
  }

  // Convert field value to appropriate type for comparison
  const normalizedValue = normalizeValue(fieldValue, operator);
  const normalizedFilterValue = normalizeFilterValue(value, operator);
  const normalizedFilterValue2 = value2 !== undefined ? normalizeFilterValue(value2, operator) : undefined;

  // Apply operator
  switch (operator) {
    case 'equals':
      return normalizedValue === normalizedFilterValue;

    case 'not_equals':
      return normalizedValue !== normalizedFilterValue;

    case 'contains':
      return String(normalizedValue || '').toLowerCase().includes(String(normalizedFilterValue || '').toLowerCase());

    case 'not_contains':
      return !String(normalizedValue || '').toLowerCase().includes(String(normalizedFilterValue || '').toLowerCase());

    case 'starts_with':
      return String(normalizedValue || '').toLowerCase().startsWith(String(normalizedFilterValue || '').toLowerCase());

    case 'ends_with':
      return String(normalizedValue || '').toLowerCase().endsWith(String(normalizedFilterValue || '').toLowerCase());

    case 'is_empty':
      return normalizedValue === null || normalizedValue === undefined || normalizedValue === '';

    case 'is_not_empty':
      return normalizedValue !== null && normalizedValue !== undefined && normalizedValue !== '';

    case 'greater_than':
      return Number(normalizedValue) > Number(normalizedFilterValue);

    case 'less_than':
      return Number(normalizedValue) < Number(normalizedFilterValue);

    case 'greater_than_or_equal':
      return Number(normalizedValue) >= Number(normalizedFilterValue);

    case 'less_than_or_equal':
      return Number(normalizedValue) <= Number(normalizedFilterValue);

    case 'between':
      const numValue = Number(normalizedValue);
      return numValue >= Number(normalizedFilterValue) && numValue <= Number(normalizedFilterValue2);

    case 'in':
      if (!Array.isArray(normalizedFilterValue)) return false;
      return normalizedFilterValue.includes(normalizedValue);

    case 'not_in':
      if (!Array.isArray(normalizedFilterValue)) return true;
      return !normalizedFilterValue.includes(normalizedValue);

    case 'before':
      if (!normalizedValue || !normalizedFilterValue) return false;
      return new Date(normalizedValue) < new Date(normalizedFilterValue);

    case 'after':
      if (!normalizedValue || !normalizedFilterValue) return false;
      return new Date(normalizedValue) > new Date(normalizedFilterValue);

    case 'on':
      if (!normalizedValue || !normalizedFilterValue) return false;
      const dateValue = new Date(normalizedValue);
      const filterDate = new Date(normalizedFilterValue);
      return dateValue.toDateString() === filterDate.toDateString();

    case 'in_last':
      if (!normalizedValue || !normalizedFilterValue) return false;
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(normalizedFilterValue));
      return new Date(normalizedValue) >= daysAgo && new Date(normalizedValue) <= new Date();

    case 'in_next':
      if (!normalizedValue || !normalizedFilterValue) return false;
      const daysAhead = new Date();
      daysAhead.setDate(daysAhead.getDate() + Number(normalizedFilterValue));
      return new Date(normalizedValue) >= new Date() && new Date(normalizedValue) <= daysAhead;

    case 'is_true':
      return normalizedValue === true || normalizedValue === 'true';

    case 'is_false':
      return normalizedValue === false || normalizedValue === 'false' || !normalizedValue;

    default:
      return true;
  }
};

/**
 * Apply a filter group (multiple conditions with AND/OR logic)
 */
export const applyFilterGroup = (member: Member, group: FilterGroup): boolean => {
  if (!group.conditions || group.conditions.length === 0) {
    return true;
  }

  const results = group.conditions.map(condition => applyFilterCondition(member, condition));

  if (group.logic === 'AND') {
    return results.every(r => r);
  } else {
    return results.some(r => r);
  }
};

/**
 * Apply complete filter configuration to a member
 */
export const applyMemberFilter = (member: Member, filterConfig: MemberFilterConfig): boolean => {
  if (!filterConfig.groups || filterConfig.groups.length === 0) {
    return true;
  }

  const groupResults = filterConfig.groups.map(group => applyFilterGroup(member, group));

  if (filterConfig.groupLogic === 'AND') {
    return groupResults.every(r => r);
  } else {
    return groupResults.some(r => r);
  }
};

/**
 * Filter an array of members using a filter configuration
 */
export const filterMembers = (members: Member[], filterConfig: MemberFilterConfig): Member[] => {
  if (!filterConfig.groups || filterConfig.groups.length === 0) {
    return members;
  }

  return members.filter(member => applyMemberFilter(member, filterConfig));
};

/**
 * Normalize a value for comparison
 */
const normalizeValue = (value: any, operator: FilterOperator): any => {
  if (value === null || value === undefined) {
    return null;
  }

  // For boolean operators
  if (operator === 'is_true' || operator === 'is_false') {
    return value;
  }

  // For date operators
  if (['before', 'after', 'on', 'in_last', 'in_next'].includes(operator)) {
    return value;
  }

  // For numeric operators
  if (['greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'between'].includes(operator)) {
    return value;
  }

  // For text operators, convert to string
  return String(value);
};

/**
 * Normalize a filter value for comparison
 */
const normalizeFilterValue = (value: any, operator: FilterOperator): any => {
  if (value === null || value === undefined) {
    return null;
  }

  // For 'in' and 'not_in' operators, ensure it's an array
  if (operator === 'in' || operator === 'not_in') {
    return Array.isArray(value) ? value : [value];
  }

  // For boolean values
  if (value === 'true' || value === true) {
    return 'true';
  }
  if (value === 'false' || value === false) {
    return 'false';
  }

  return value;
};

/**
 * Create an empty filter configuration
 */
export const createEmptyFilter = (): MemberFilterConfig => {
  return {
    groups: [
      {
        id: generateId(),
        logic: 'AND',
        conditions: []
      }
    ],
    groupLogic: 'AND'
  };
};

/**
 * Create an empty filter group
 */
export const createEmptyGroup = (): FilterGroup => {
  return {
    id: generateId(),
    logic: 'AND',
    conditions: []
  };
};

/**
 * Create an empty filter condition
 */
export const createEmptyCondition = (): FilterCondition => {
  return {
    id: generateId(),
    field: '',
    operator: 'equals',
    value: ''
  };
};

/**
 * Generate a unique ID
 */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Count how many members match a filter
 */
export const countFilteredMembers = (members: Member[], filterConfig: MemberFilterConfig): number => {
  return filterMembers(members, filterConfig).length;
};

/**
 * Validate a filter configuration
 */
export const validateFilterConfig = (filterConfig: MemberFilterConfig): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!filterConfig.groups || filterConfig.groups.length === 0) {
    return { valid: true, errors: [] };
  }

  filterConfig.groups.forEach((group, groupIndex) => {
    if (!group.conditions || group.conditions.length === 0) {
      errors.push(`Group ${groupIndex + 1} has no conditions`);
    }

    group.conditions.forEach((condition, condIndex) => {
      if (!condition.field) {
        errors.push(`Group ${groupIndex + 1}, Condition ${condIndex + 1}: Field is required`);
      }

      if (!condition.operator) {
        errors.push(`Group ${groupIndex + 1}, Condition ${condIndex + 1}: Operator is required`);
      }

      // Check if value is required for this operator
      const noValueOperators = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];
      if (!noValueOperators.includes(condition.operator) && (condition.value === null || condition.value === undefined || condition.value === '')) {
        errors.push(`Group ${groupIndex + 1}, Condition ${condIndex + 1}: Value is required`);
      }

      // Check if value2 is required for 'between' operator
      if (condition.operator === 'between' && (condition.value2 === null || condition.value2 === undefined || condition.value2 === '')) {
        errors.push(`Group ${groupIndex + 1}, Condition ${condIndex + 1}: Second value is required for 'between' operator`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors
  };
};

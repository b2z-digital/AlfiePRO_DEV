export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'between'
  | 'in'
  | 'not_in'
  | 'before'
  | 'after'
  | 'on'
  | 'in_last'
  | 'in_next'
  | 'is_true'
  | 'is_false';

export type FilterFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multi-select'
  | 'boat-class';

export interface FilterField {
  id: string;
  label: string;
  type: FilterFieldType;
  operators: FilterOperator[];
  options?: { value: string; label: string }[];
  placeholder?: string;
  description?: string;
}

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
  value2?: any; // For 'between' operator
}

export interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface MemberFilterConfig {
  groups: FilterGroup[];
  groupLogic: 'AND' | 'OR'; // How to combine groups
}

export interface FilterPreset {
  id: string;
  club_id: string;
  name: string;
  description?: string;
  filter_config: MemberFilterConfig;
  is_default: boolean;
  is_shared: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Available filter fields for members
export const MEMBER_FILTER_FIELDS: FilterField[] = [
  // Basic Information
  {
    id: 'first_name',
    label: 'First Name',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter first name'
  },
  {
    id: 'last_name',
    label: 'Last Name',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter last name'
  },
  {
    id: 'email',
    label: 'Email',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter email'
  },
  {
    id: 'phone',
    label: 'Phone',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter phone number'
  },

  // Location
  {
    id: 'city',
    label: 'City',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter city'
  },
  {
    id: 'state',
    label: 'State',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter state'
  },
  {
    id: 'postcode',
    label: 'Postcode',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'starts_with', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter postcode'
  },
  {
    id: 'country',
    label: 'Country',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter country'
  },

  // Membership
  {
    id: 'is_financial',
    label: 'Financial Status',
    type: 'select',
    operators: ['equals'],
    options: [
      { value: 'true', label: 'Financial' },
      { value: 'false', label: 'Unfinancial' }
    ]
  },
  {
    id: 'membership_status',
    label: 'Membership Status',
    type: 'select',
    operators: ['equals', 'not_equals', 'in', 'not_in'],
    options: [
      { value: 'active', label: 'Active' },
      { value: 'pending', label: 'Pending' },
      { value: 'expired', label: 'Expired' },
      { value: 'archived', label: 'Archived' }
    ]
  },
  {
    id: 'membership_level',
    label: 'Membership Level',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter membership level'
  },
  {
    id: 'category',
    label: 'Member Category',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter category',
    description: 'Junior, Senior, Life Member, etc.'
  },

  // Dates
  {
    id: 'date_joined',
    label: 'Date Joined',
    type: 'date',
    operators: ['before', 'after', 'on', 'between', 'in_last', 'in_next', 'is_empty', 'is_not_empty'],
    placeholder: 'Select date'
  },
  {
    id: 'renewal_date',
    label: 'Renewal Date',
    type: 'date',
    operators: ['before', 'after', 'on', 'between', 'in_last', 'in_next', 'is_empty', 'is_not_empty'],
    placeholder: 'Select date'
  },
  {
    id: 'payment_confirmed_at',
    label: 'Payment Confirmed Date',
    type: 'date',
    operators: ['before', 'after', 'on', 'between', 'in_last', 'in_next', 'is_empty', 'is_not_empty'],
    placeholder: 'Select date'
  },

  // Payment
  {
    id: 'payment_status',
    label: 'Payment Status',
    type: 'select',
    operators: ['equals', 'not_equals', 'in', 'not_in'],
    options: [
      { value: 'paid', label: 'Paid' },
      { value: 'pending', label: 'Pending' },
      { value: 'failed', label: 'Failed' },
      { value: 'refunded', label: 'Refunded' }
    ]
  },
  {
    id: 'payment_method',
    label: 'Payment Method',
    type: 'select',
    operators: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
    options: [
      { value: 'stripe', label: 'Stripe' },
      { value: 'cash', label: 'Cash' },
      { value: 'bank_transfer', label: 'Bank Transfer' },
      { value: 'cheque', label: 'Cheque' },
      { value: 'other', label: 'Other' }
    ]
  },
  {
    id: 'amount_paid',
    label: 'Amount Paid',
    type: 'number',
    operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'between'],
    placeholder: 'Enter amount'
  },

  // Boats
  {
    id: 'boat_class',
    label: 'Boat Class',
    type: 'boat-class',
    operators: ['in', 'not_in', 'is_empty'],
    placeholder: 'Select boat class(es)'
  },
  {
    id: 'boat_count',
    label: 'Number of Boats',
    type: 'number',
    operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal'],
    placeholder: 'Enter number',
    description: 'Total number of boats registered'
  },

  // Emergency Contact
  {
    id: 'emergency_contact_name',
    label: 'Emergency Contact Name',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter emergency contact name'
  },
  {
    id: 'emergency_contact_phone',
    label: 'Emergency Contact Phone',
    type: 'text',
    operators: ['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'],
    placeholder: 'Enter emergency contact phone'
  },

  // Account Status
  {
    id: 'user_id',
    label: 'Has User Account',
    type: 'select',
    operators: ['equals'],
    options: [
      { value: 'true', label: 'Yes (Linked)' },
      { value: 'false', label: 'No (Not Linked)' }
    ],
    description: 'Whether member has a linked user account'
  }
];

// Helper to get field config by ID
export const getFilterField = (fieldId: string): FilterField | undefined => {
  return MEMBER_FILTER_FIELDS.find(f => f.id === fieldId);
};

// Helper to get operator label
export const getOperatorLabel = (operator: FilterOperator): string => {
  const labels: Record<FilterOperator, string> = {
    equals: 'equals',
    not_equals: 'does not equal',
    contains: 'contains',
    not_contains: 'does not contain',
    starts_with: 'starts with',
    ends_with: 'ends with',
    is_empty: 'is empty',
    is_not_empty: 'is not empty',
    greater_than: 'greater than',
    less_than: 'less than',
    greater_than_or_equal: 'greater than or equal to',
    less_than_or_equal: 'less than or equal to',
    between: 'between',
    in: 'is any of',
    not_in: 'is not any of',
    before: 'before',
    after: 'after',
    on: 'on',
    in_last: 'in the last',
    in_next: 'in the next',
    is_true: 'is true',
    is_false: 'is false'
  };
  return labels[operator] || operator;
};

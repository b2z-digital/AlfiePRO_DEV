export type RosterStatus = 'draft' | 'active' | 'completed' | 'archived';
export type AllocationMethod = 'fair_random' | 'manual' | 'round_robin';
export type ReminderType = 'email' | 'notification' | 'both';
export type AssignmentStatus = 'assigned' | 'confirmed' | 'declined' | 'swapped' | 'completed';

export interface ProRoster {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  boat_class: string;
  series_id: string | null;
  start_date: string;
  end_date: string;
  status: RosterStatus;
  allocation_method: AllocationMethod;
  reminder_days_before: number;
  reminder_type: ReminderType;
  allow_decline: boolean;
  max_consecutive: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProRosterRound {
  id: string;
  roster_id: string;
  date: string;
  name: string | null;
  series_round_id: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  assignment?: ProRosterAssignment;
}

export interface ProRosterAssignment {
  id: string;
  roster_id: string;
  round_id: string;
  member_id: string;
  status: AssignmentStatus;
  task_id: string | null;
  assigned_at: string;
  confirmed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  swap_member_id: string | null;
  created_at: string;
  updated_at: string;
  member_name?: string;
  member_avatar?: string | null;
}

export interface ProRosterExclusion {
  id: string;
  roster_id: string;
  member_id: string;
  exclusion_date: string;
  reason: string | null;
  created_at: string;
}

export interface ProRosterMember {
  id: string;
  roster_id: string;
  member_id: string;
  is_active: boolean;
  duty_count: number;
  last_duty_date: string | null;
  created_at: string;
  member_name?: string;
  member_avatar?: string | null;
}

export interface RosterFormData {
  name: string;
  description: string;
  boat_class: string;
  series_id: string | null;
  start_date: string;
  end_date: string;
  allocation_method: AllocationMethod;
  reminder_days_before: number;
  reminder_type: ReminderType;
  allow_decline: boolean;
  max_consecutive: number;
}

export interface RosterWithDetails extends ProRoster {
  rounds: ProRosterRound[];
  assignments: ProRosterAssignment[];
  members: ProRosterMember[];
  exclusions: ProRosterExclusion[];
}

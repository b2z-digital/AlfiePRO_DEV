export type MeetingCategory = 'general' | 'committee';
export type RecurrenceType = 'none' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export interface Meeting {
  id: string;
  club_id: string;
  name: string;
  location: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  conferencing_url: string | null;
  description: string | null;
  chairperson_id: string | null;
  minute_taker_id: string | null;
  created_at: string;
  updated_at: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  minutes_status: 'not_started' | 'in_progress' | 'completed';
  minutes_locked?: boolean;
  members_present?: { id: string; name: string }[];
  guests_present?: { name: string }[];
  meeting_category?: MeetingCategory;
  recurrence_type?: RecurrenceType;
  recurrence_end_date?: string | null;
  recurrence_parent_id?: string | null;
  recurrence_index?: number;
  meeting_type?: 'in_person' | 'online' | 'hybrid';
  state_association_id?: string | null;
  national_association_id?: string | null;
  visible_to_member_clubs?: boolean;
  organization_name?: string | null;
  chairperson?: {
    first_name: string;
    last_name: string;
    avatar_url?: string | null;
  };
  minute_taker?: {
    first_name: string;
    last_name: string;
    avatar_url?: string | null;
  };
}

export interface MeetingAgendaItem {
  id: string;
  meeting_id: string;
  item_number: number;
  item_name: string;
  owner_id: string | null;
  type: 'for_noting' | 'for_action' | 'for_discussion';
  duration: number | null;
  minutes_content?: string;
  minutes_decision?: string;
  minutes_tasks?: string;
  minutes_attachments?: any[];
  created_at: string;
  updated_at: string;
  owner?: {
    first_name: string;
    last_name: string;
    avatar_url?: string | null;
  };
}

export interface MeetingFormData {
  name: string;
  location: string;
  date: string;
  start_time: string;
  end_time: string;
  conferencing_url?: string;
  description?: string;
  chairperson_id?: string;
  minute_taker_id?: string;
  meeting_category?: MeetingCategory;
  recurrence_type?: RecurrenceType;
  recurrence_end_date?: string;
  meeting_type?: 'in_person' | 'online' | 'hybrid';
  visible_to_member_clubs?: boolean;
  agenda_items: {
    item_number: number;
    item_name: string;
    owner_id?: string;
    type: 'for_noting' | 'for_action' | 'for_discussion';
    duration?: number;
  }[];
}

export interface MeetingAttendee {
  id: string;
  name: string;
  avatar_url?: string | null;
  isPresent: boolean;
}

export interface MeetingGuest {
  name: string;
}

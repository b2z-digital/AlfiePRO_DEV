export type BoatType = 'DF65' | 'DF95' | '10R' | 'IOM' | 'Marblehead' | 'A Class' | 'RC Laser';
export type MembershipLevel = 'Full' | 'Full Pro Rata' | 'Associate' | 'Custom';

export interface MemberBoat {
  id: string;
  member_id: string;
  boat_type: BoatType;
  sail_number: string | null;
  hull: string | null;
  handicap: number | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  club: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  date_joined: string | null;
  membership_level: MembershipLevel | null;
  membership_level_custom: string | null;
  is_financial: boolean;
  amount_paid: number | null;
  created_at: string;
  updated_at: string;
  boats?: MemberBoat[];
  user_id?: string | null;
  renewal_date?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  avatar_url?: string | null;
  country?: string | null;
  country_code?: string | null;
  category?: string | null;
}

export interface MemberFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  club: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  date_joined: string;
  membership_level: MembershipLevel | null;
  membership_level_custom: string | null;
  is_financial: boolean;
  amount_paid: number | null;
  boats: Array<{
    boat_type: BoatType | null;
    sail_number: string;
    hull: string;
    handicap: number | null;
  }>;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  country?: string;
  country_code?: string;
  category?: string;
}

export interface ImportedMember {
  'First Name': string;
  'Last Name': string;
  'Email': string;
  'Phone': string;
  'Club': string;
  'Street': string;
  'City': string;
  'State': string;
  'Postcode': string;
  'Date Joined': string;
  'Membership Level': string;
  'Financial': string;
  'Amount Paid': string;
  'Boat Type': string;
  'Sail Number': string;
  'Hull': string;
  'Handicap': string;
  'Emergency Contact': string;
  'Emergency Phone': string;
  'Emergency Relationship': string;
}
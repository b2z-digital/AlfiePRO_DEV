import { BoatType } from './member';

export type RenewalMode = 'anniversary' | 'fixed';

export interface MembershipType {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  renewal_period: 'annual' | 'monthly' | 'quarterly' | 'lifetime';
  is_active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRenewal {
  id: string;
  member_id: string;
  membership_type_id: string;
  renewal_date: string;
  expiry_date: string;
  amount_paid: number;
  payment_method: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipPayment {
  id: string;
  member_id: string;
  membership_type_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payment_method: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  other_clubs: string;
  membership_type_id: string;
  boats: Array<{
    boat_type: BoatType | null;
    sail_number: string;
    hull: string;
    handicap: number | null;
  }>;
  agree_to_code_of_conduct: boolean;
}

export interface MembershipSettings {
  club_id: string;
  stripe_connected: boolean;
  stripe_account_id: string | null;
  stripe_publishable_key: string | null;
  auto_renew_enabled: boolean;
  renewal_notification_days: number;
  code_of_conduct: string | null;
  renewal_mode: RenewalMode;
  fixed_renewal_date: string | null; // MM-DD format
}

export interface EmailTemplate {
  id?: string;
  club_id: string;
  template_key: 'welcome' | 'renewal' | 'event';
  subject: string;
  body: string;
  created_at?: string;
  updated_at?: string;
}

export interface EmailTemplatesCollection {
  welcome: {
    subject: string;
    body: string;
  };
  renewal: {
    subject: string;
    body: string;
  };
  event: {
    subject: string;
    body: string;
  };
}
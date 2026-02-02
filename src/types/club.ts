export interface CommitteePosition {
  id: string;
  title: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface Club {
  id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
  committeePositions: CommitteePosition[];
  created_at: string;
  updated_at: string;
  created_by_user_id?: string;
  club_introduction?: string;
  featured_image_url?: string;
  cover_image_url?: string;
  google_analytics_id?: string | null;
}

export interface ClubFormData {
  name: string;
  abbreviation: string;
  logo: string | null;
  committeePositions: Array<{
    title: string;
    name: string;
    email: string;
    phone: string;
  }>;
}

export interface StateAssociation {
  id: string;
  name: string;
  short_name: string | null;
  state: string;
  abn: string | null;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string;
  stripe_account_id: string | null;
  subscription_tier: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NationalAssociation {
  id: string;
  name: string;
  short_name: string | null;
  abn: string | null;
  description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string;
  stripe_account_id: string | null;
  subscription_tier: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganizationType = 'club' | 'state' | 'national';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  logo?: string | null;
  role?: string;
}
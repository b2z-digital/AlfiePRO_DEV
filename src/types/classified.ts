export interface Classified {
  id: string;
  title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  condition: 'new' | 'like new' | 'good' | 'fair' | 'used';
  images: string[];
  contact_email: string;
  contact_phone?: string;
  user_id: string;
  club_id?: string;
  boat_class?: string;
  status: 'active' | 'sold' | 'expired' | 'deleted';
  is_public: boolean;
  views_count: number;
  featured: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  is_external?: boolean;
  external_contact_name?: string;
  external_contact_email?: string;
  external_contact_phone?: string;
  created_by_user_id?: string;
  source_url?: string;
  external_source_id?: string;
  is_scraped?: boolean;

  // Joined data
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
  club?: {
    id: string;
    name: string;
    logo?: string;
  };
  is_favorited?: boolean;
  favorites_count?: number;
}

export interface ClassifiedFavorite {
  id: string;
  classified_id: string;
  user_id: string;
  created_at: string;
}

export interface ClassifiedInquiry {
  id: string;
  classified_id: string;
  sender_id: string;
  message: string;
  inquiry_type: 'question' | 'offer' | 'interest';
  offer_amount?: number;
  status: 'pending' | 'accepted' | 'rejected' | 'responded';
  created_at: string;
  updated_at: string;

  // Joined data
  sender?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
  classified?: Classified;
}

export interface ClassifiedFormData {
  title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  condition: string;
  images: string[];
  contact_email: string;
  contact_phone?: string;
  club_id?: string;
  is_public: boolean;
  boat_class?: string;
  featured?: boolean;
  expires_at?: string;
  is_external?: boolean;
  external_contact_name?: string;
  external_contact_email?: string;
  external_contact_phone?: string;
}

export const CLASSIFIED_CATEGORIES = [
  { value: 'yachts', label: 'Yachts & Boats', icon: '⛵' },
  { value: 'sails', label: 'Sails', icon: '🪂' },
  { value: 'equipment', label: 'Equipment & Gear', icon: '⚓' },
  { value: 'parts', label: 'Parts & Accessories', icon: '🔧' },
  { value: 'electronics', label: 'Electronics', icon: '📡' },
  { value: 'safety', label: 'Safety Equipment', icon: '🦺' },
  { value: 'clothing', label: 'Clothing & Apparel', icon: '👕' },
  { value: 'trailers', label: 'Trailers', icon: '🚚' },
  { value: 'moorings', label: 'Moorings & Storage', icon: '⚓' },
  { value: 'other', label: 'Other', icon: '📦' }
] as const;

export const CLASSIFIED_CONDITIONS = [
  { value: 'new', label: 'Brand New' },
  { value: 'like new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'used', label: 'Used' }
] as const;

export interface Venue {
  id: string;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  image: string | null;
  isDefault?: boolean;
  created_at: string;
  updated_at: string;
  club_id?: string;
  clubs?: {
    name: string;
    abbreviation: string;
  };
  shared_clubs?: {
    name: string;
    abbreviation: string;
  }[];
}

export interface VenueFormData {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  image: string | null;
  isDefault?: boolean;
}
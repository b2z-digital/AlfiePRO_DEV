export interface BoatClass {
  id: string;
  name: string;
  description: string | null;
  class_image: string | null;
  gallery_images: string[];
  created_by_type: 'national' | 'state';
  created_by_association_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClubBoatClass {
  id: string;
  club_id: string;
  boat_class_id: string;
  created_at: string;
  boat_class?: BoatClass;
}

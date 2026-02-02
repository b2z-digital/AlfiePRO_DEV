import { supabase } from './supabase';
import { BoatClass, ClubBoatClass } from '../types/boatClass';

/**
 * Get all active boat classes (National and State level)
 */
export async function getBoatClasses(): Promise<BoatClass[]> {
  const { data, error } = await supabase
    .from('boat_classes')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching boat classes:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get boat classes for a specific association
 */
export async function getBoatClassesByAssociation(
  associationType: 'national' | 'state',
  associationId: string
): Promise<BoatClass[]> {
  const { data, error } = await supabase
    .from('boat_classes')
    .select('*')
    .eq('created_by_type', associationType)
    .eq('created_by_association_id', associationId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching association boat classes:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create a new boat class
 */
export async function createBoatClass(
  boatClass: Omit<BoatClass, 'id' | 'created_at' | 'updated_at' | 'is_active'>
): Promise<BoatClass> {
  const { data, error } = await supabase
    .from('boat_classes')
    .insert([boatClass])
    .select()
    .single();

  if (error) {
    console.error('Error creating boat class:', error);
    throw error;
  }

  return data;
}

/**
 * Update a boat class
 */
export async function updateBoatClass(
  id: string,
  updates: Partial<Omit<BoatClass, 'id' | 'created_at' | 'updated_at'>>
): Promise<BoatClass> {
  const { data, error } = await supabase
    .from('boat_classes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating boat class:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a boat class (soft delete by setting is_active to false)
 */
export async function deleteBoatClass(id: string): Promise<void> {
  const { error } = await supabase
    .from('boat_classes')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting boat class:', error);
    throw error;
  }
}

/**
 * Get boat classes for a specific club
 */
export async function getClubBoatClasses(clubId: string): Promise<BoatClass[]> {
  const { data, error } = await supabase
    .from('club_boat_classes')
    .select(`
      boat_class_id,
      boat_classes (*)
    `)
    .eq('club_id', clubId);

  if (error) {
    console.error('Error fetching club boat classes:', error);
    throw error;
  }

  return data?.map(item => (item as any).boat_classes).filter(Boolean) || [];
}

/**
 * Add a boat class to a club
 */
export async function addBoatClassToClub(
  clubId: string,
  boatClassId: string
): Promise<ClubBoatClass> {
  const { data, error } = await supabase
    .from('club_boat_classes')
    .insert([{ club_id: clubId, boat_class_id: boatClassId }])
    .select()
    .single();

  if (error) {
    console.error('Error adding boat class to club:', error);
    throw error;
  }

  return data;
}

/**
 * Remove a boat class from a club
 */
export async function removeBoatClassFromClub(
  clubId: string,
  boatClassId: string
): Promise<void> {
  const { error } = await supabase
    .from('club_boat_classes')
    .delete()
    .eq('club_id', clubId)
    .eq('boat_class_id', boatClassId);

  if (error) {
    console.error('Error removing boat class from club:', error);
    throw error;
  }
}

/**
 * Upload boat class image to storage
 */
export async function uploadBoatClassImage(
  file: File,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('boat-classes')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    console.error('Error uploading boat class image:', error);
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('boat-classes')
    .getPublicUrl(data.path);

  return publicUrl;
}

/**
 * Delete boat class image from storage
 */
export async function deleteBoatClassImage(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from('boat-classes')
    .remove([path]);

  if (error) {
    console.error('Error deleting boat class image:', error);
    throw error;
  }
}

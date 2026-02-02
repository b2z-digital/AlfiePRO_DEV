import { Club, ClubFormData } from '../types/club';
import { supabase } from './supabase';
import { createClub } from './auth';

export const getStoredClubs = async (): Promise<Club[]> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || currentClubId === 'undefined' || currentClubId === 'null') {
      return [];
    }
    
    const { data, error } = await supabase
      .from('clubs')
      .select(`
        *,
        committeePositions: committee_positions (*)
      `)
      .eq('id', currentClubId); // Only get the current club

    if (error) {
      console.error('Error fetching clubs:', error);
      return [];
    }

    return data.map(club => ({
      ...club,
      committeePositions: club.committeePositions || []
    }));
  } catch (error) {
    console.error('Error in getStoredClubs:', error);
    return [];
  }
};

export const addClub = async (formData: ClubFormData): Promise<Club | null> => {
  // Use regular supabase client - RLS policies will handle permissions
  const { data: clubData, error: clubError } = await supabase
    .from('clubs')
    .insert({
      name: formData.name,
      abbreviation: formData.abbreviation,
      logo: formData.logo,
      cover_image_url: '/lmryc_slide.jpeg' // Default cover image
    })
    .select()
    .single();

  if (clubError || !clubData) {
    console.error('Error adding club:', clubError);
    return null;
  }

  if (formData.committeePositions.length > 0) {
    const { error: positionsError } = await supabase
      .from('committee_positions')
      .insert(
        formData.committeePositions.map(position => ({
          club_id: clubData.id,
          title: position.title,
          name: position.name,
          email: position.email || null,
          phone: position.phone || null
        }))
      );

    if (positionsError) {
      console.error('Error adding committee positions:', positionsError);
      return null;
    }
  }

  const { data: completeClub, error: fetchError } = await supabase
    .from('clubs')
    .select(`
      *,
      committeePositions: committee_positions (*)
    `)
    .eq('id', clubData.id)
    .single();

  if (fetchError || !completeClub) {
    console.error('Error fetching complete club data:', fetchError);
    return null;
  }

  return {
    ...completeClub,
    committeePositions: completeClub.committeePositions || []
  };
};

export const updateClub = async (id: string, formData: ClubFormData): Promise<Club | null> => {
  // Get current club from localStorage
  const currentClubId = localStorage.getItem('currentClubId');
  if (!currentClubId || currentClubId === 'undefined' || currentClubId === 'null' || id !== currentClubId) {
    console.error('Cannot update club: not the current club');
    return null;
  }
  
  const { error: clubError } = await supabase
    .from('clubs')
    .update({
      name: formData.name,
      abbreviation: formData.abbreviation,
      logo: formData.logo
    })
    .eq('id', id);

  if (clubError) {
    console.error('Error updating club:', clubError);
    return null;
  }

  const { error: deleteError } = await supabase
    .from('committee_positions')
    .delete()
    .eq('club_id', id);

  if (deleteError) {
    console.error('Error deleting committee positions:', deleteError);
    return null;
  }

  if (formData.committeePositions.length > 0) {
    const { error: positionsError } = await supabase
      .from('committee_positions')
      .insert(
        formData.committeePositions.map(position => ({
          club_id: id,
          title: position.title,
          name: position.name,
          email: position.email || null,
          phone: position.phone || null
        }))
      );

    if (positionsError) {
      console.error('Error updating committee positions:', positionsError);
      return null;
    }
  }

  const { data: updatedClub, error: fetchError } = await supabase
    .from('clubs')
    .select(`
      *,
      committeePositions: committee_positions (*)
    `)
    .eq('id', id)
    .single();

  if (fetchError || !updatedClub) {
    console.error('Error fetching updated club data:', fetchError);
    return null;
  }

  return {
    ...updatedClub,
    committeePositions: updatedClub.committeePositions || []
  };
};

export const deleteClub = async (id: string): Promise<boolean> => {
  // Get current club from localStorage
  const currentClubId = localStorage.getItem('currentClubId');
  if (!currentClubId || currentClubId === 'undefined' || currentClubId === 'null' || id !== currentClubId) {
    console.error('Cannot delete club: not the current club');
    return false;
  }
  
  const { error } = await supabase
    .from('clubs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting club:', error);
    return false;
  }

  return true;
};
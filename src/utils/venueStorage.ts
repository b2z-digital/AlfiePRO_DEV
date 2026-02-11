import { Venue, VenueFormData } from '../types/venue';
import { supabase } from './supabase';
import { isValidUUID } from './storage';
import { protectedQuery, QUERY_TIMEOUTS } from './queryHelpers';

// Local function to get current club ID - replace with actual implementation
const getCurrentClubId = (): string | null => {
  // This is a placeholder - replace with actual club ID retrieval logic
  return localStorage.getItem('currentClubId');
};

// Helper function to get current organization context
const getCurrentOrganization = (): { id: string; type: 'club' | 'state' | 'national' } | null => {
  try {
    const stored = localStorage.getItem('currentOrganization');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

// Note: withRetry is now imported from queryHelpers as protectedQuery

// Test Supabase connection
const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('venues').select('count').limit(1);
    return !error;
  } catch {
    return false;
  }
};

// Local storage fallback functions
const getVenuesFromLocalStorage = (): Venue[] => {
  try {
    const stored = localStorage.getItem('venues');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveVenuesToLocalStorage = (venues: Venue[]): void => {
  try {
    localStorage.setItem('venues', JSON.stringify(venues));
  } catch (error) {
    console.error('Error saving venues to local storage:', error);
  }
};

export const getStoredVenues = async (): Promise<Venue[]> => {
  try {
    const currentOrg = getCurrentOrganization();
    const clubId = getCurrentClubId();

    // Check if we're in an association context
    if (currentOrg && (currentOrg.type === 'state' || currentOrg.type === 'national')) {
      // Fetch venues from all clubs under this association
      return await getAssociationVenues(currentOrg.id, currentOrg.type);
    }

    // Regular club context
    if (!clubId) return [];

    // Test connection first
    const isConnected = await testSupabaseConnection();

    if (!isConnected) {
      console.warn('Supabase connection failed, using local storage');
      const allVenues = getVenuesFromLocalStorage();
      return allVenues.filter(venue => venue.club_id === clubId);
    }

    try {
      // Query venues through the junction table to get all shared venues
      const { data, error } = await protectedQuery(
        () => supabase
          .from('club_venues')
          .select('venue_id, is_primary, venues(*)')
          .eq('club_id', clubId)
          .order('is_primary', { ascending: false }),
        { timeout: QUERY_TIMEOUTS.SLOW, queryName: 'fetch venues' }
      );

      if (error) {
        console.error('Error fetching venues:', error);
        // Fallback to local storage
        const allVenues = getVenuesFromLocalStorage();
        return allVenues.filter(venue => venue.club_id === clubId);
      }

      // Extract venues from the junction table results
      const venues = (data || [])
        .map((cv: any) => cv.venues)
        .filter(Boolean) as Venue[];

      // Save to local storage as backup
      if (venues) {
        saveVenuesToLocalStorage(venues);
      }

      return venues;
    } catch (error) {
      console.error('Network error fetching venues:', error);
      const allVenues = getVenuesFromLocalStorage();
      return allVenues.filter(venue => venue.club_id === clubId);
    }
  } catch (error) {
    console.error('Error in getStoredVenues:', error);
    return [];
  }
};

// New function to get venues for an association (all venues from member clubs)
const getAssociationVenues = async (
  associationId: string,
  associationType: 'state' | 'national'
): Promise<Venue[]> => {
  try {
    let clubIds: string[] = [];

    if (associationType === 'state') {
      // For state associations, get clubs directly
      const { data: clubs, error: clubsError } = await supabase
        .from('clubs')
        .select('id')
        .eq('state_association_id', associationId);

      if (clubsError) {
        console.error('Error fetching clubs for state association:', clubsError);
        return [];
      }

      if (!clubs || clubs.length === 0) {
        return [];
      }

      clubIds = clubs.map(club => club.id);
    } else {
      // For national associations, get clubs through state associations
      // First get all state associations under this national association
      const { data: stateAssocs, error: stateError } = await supabase
        .from('state_associations')
        .select('id')
        .eq('national_association_id', associationId);

      if (stateError) {
        console.error('Error fetching state associations for national association:', stateError);
        return [];
      }

      if (!stateAssocs || stateAssocs.length === 0) {
        return [];
      }

      const stateAssocIds = stateAssocs.map(sa => sa.id);

      // Then get all clubs under these state associations
      const { data: clubs, error: clubsError } = await supabase
        .from('clubs')
        .select('id')
        .in('state_association_id', stateAssocIds);

      if (clubsError) {
        console.error('Error fetching clubs for national association:', clubsError);
        return [];
      }

      if (!clubs || clubs.length === 0) {
        return [];
      }

      clubIds = clubs.map(club => club.id);
    }

    const { data: clubVenues, error: venuesError } = await supabase
      .from('club_venues')
      .select('venue_id, is_primary, club_id, clubs(name, abbreviation), venues(*, clubs(name, abbreviation))')
      .in('club_id', clubIds)
      .order('is_primary', { ascending: false });

    if (venuesError) {
      console.error('Error fetching venues for association:', venuesError);
      return [];
    }

    const venueMap = new Map<string, Venue>();
    for (const cv of (clubVenues || []) as any[]) {
      if (!cv.venues) continue;
      const venue = cv.venues as Venue;
      const clubInfo = cv.clubs as { name: string; abbreviation: string } | null;

      if (!venueMap.has(venue.id)) {
        venueMap.set(venue.id, { ...venue, shared_clubs: clubInfo ? [clubInfo] : [] });
      } else if (clubInfo) {
        const existing = venueMap.get(venue.id)!;
        const alreadyAdded = existing.shared_clubs?.some(
          c => c.abbreviation === clubInfo.abbreviation && c.name === clubInfo.name
        );
        if (!alreadyAdded) {
          existing.shared_clubs = [...(existing.shared_clubs || []), clubInfo];
        }
      }
    }

    return Array.from(venueMap.values());
  } catch (error) {
    console.error('Error in getAssociationVenues:', error);
    return [];
  }
};

export const addVenue = async (formData: VenueFormData, explicitClubId?: string): Promise<Venue | null> => {
  try {
    const clubId = explicitClubId || getCurrentClubId();
    if (!clubId) throw new Error('No club selected');
    
    // Test connection first
    const isConnected = await testSupabaseConnection();
    
    if (!isConnected) {
      console.warn('Supabase connection failed, saving to local storage');
      const venues = getVenuesFromLocalStorage();
      const newVenue: Venue = {
        id: crypto.randomUUID(),
        name: formData.name,
        description: formData.description,
        address: formData.address,
        latitude: formData.latitude,
        longitude: formData.longitude,
        image: formData.image,
        club_id: clubId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      venues.push(newVenue);
      saveVenuesToLocalStorage(venues);
      return newVenue;
    }

    try {
      // If this venue is being set as default, unset any existing default
      if (formData.isDefault) {
        await supabase
          .from('venues')
          .update({ is_default: false })
          .eq('club_id', clubId);
      }

      const { data, error } = await supabase
        .from('venues')
        .insert({
          club_id: clubId,
          name: formData.name,
          description: formData.description,
          address: formData.address,
          latitude: formData.latitude,
          longitude: formData.longitude,
          image: formData.image,
          is_default: formData.isDefault || false
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding venue:', error);
        // Fallback to local storage
        const venues = getVenuesFromLocalStorage();
        const newVenue: Venue = {
          id: crypto.randomUUID(),
          name: formData.name,
          description: formData.description,
          address: formData.address,
          latitude: formData.latitude,
          longitude: formData.longitude,
          image: formData.image,
          club_id: clubId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        venues.push(newVenue);
        saveVenuesToLocalStorage(venues);
        return newVenue;
      }

      // Create the junction table entry for the primary club
      const venueId = (data as Venue).id;
      const { error: junctionError } = await supabase
        .from('club_venues')
        .insert({
          club_id: clubId,
          venue_id: venueId,
          is_primary: true
        });

      if (junctionError) {
        console.error('Error creating venue-club relationship:', junctionError);
      }

      // Update local storage
      const venues = getVenuesFromLocalStorage();
      venues.push(data as Venue);
      saveVenuesToLocalStorage(venues);

      return data as Venue;
    } catch (error) {
      console.error('Network error adding venue:', error);
      // Fallback to local storage
      const venues = getVenuesFromLocalStorage();
      const newVenue: Venue = {
        id: crypto.randomUUID(),
        name: formData.name,
        description: formData.description,
        address: formData.address,
        latitude: formData.latitude,
        longitude: formData.longitude,
        image: formData.image,
        club_id: clubId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      venues.push(newVenue);
      saveVenuesToLocalStorage(venues);
      return newVenue;
    }
  } catch (error) {
    console.error('Error in addVenue:', error);
    return null;
  }
};

export const updateVenue = async (id: string, formData: VenueFormData, venueClubId?: string): Promise<Venue | null> => {
  try {
    const clubId = venueClubId || getCurrentClubId();
    if (!clubId) throw new Error('No club selected');
    
    // Test connection first
    const isConnected = await testSupabaseConnection();
    
    if (!isConnected) {
      console.warn('Supabase connection failed, updating local storage');
      const venues = getVenuesFromLocalStorage();
      const venueIndex = venues.findIndex(v => v.id === id && v.club_id === clubId);
      if (venueIndex !== -1) {
        venues[venueIndex] = {
          ...venues[venueIndex],
          name: formData.name,
          description: formData.description,
          address: formData.address,
          latitude: formData.latitude,
          longitude: formData.longitude,
          image: formData.image,
          updated_at: new Date().toISOString()
        };
        saveVenuesToLocalStorage(venues);
        return venues[venueIndex];
      }
      return null;
    }

    try {
      // If this venue is being set as default, unset any existing default
      if (formData.isDefault) {
        await supabase
          .from('venues')
          .update({ is_default: false })
          .eq('club_id', clubId)
          .neq('id', id);
      }

      const { data, error } = await supabase
        .from('venues')
        .update({
          name: formData.name,
          description: formData.description,
          address: formData.address,
          latitude: formData.latitude,
          longitude: formData.longitude,
          image: formData.image,
          is_default: formData.isDefault || false
        })
        .eq('id', id)
        .eq('club_id', clubId) // Ensure we only update venues from current club
        .select()
        .single();

      if (error) {
        console.error('Error updating venue:', error);
        // Fallback to local storage
        const venues = getVenuesFromLocalStorage();
        const venueIndex = venues.findIndex(v => v.id === id && v.club_id === clubId);
        if (venueIndex !== -1) {
          venues[venueIndex] = {
            ...venues[venueIndex],
            name: formData.name,
            description: formData.description,
            address: formData.address,
            latitude: formData.latitude,
            longitude: formData.longitude,
            image: formData.image,
            updated_at: new Date().toISOString()
          };
          saveVenuesToLocalStorage(venues);
          return venues[venueIndex];
        }
        return null;
      }

      // Update local storage
      const venues = getVenuesFromLocalStorage();
      const venueIndex = venues.findIndex(v => v.id === id);
      if (venueIndex !== -1) {
        venues[venueIndex] = data as Venue;
        saveVenuesToLocalStorage(venues);
      }

      return data as Venue;
    } catch (error) {
      console.error('Network error updating venue:', error);
      // Fallback to local storage
      const venues = getVenuesFromLocalStorage();
      const venueIndex = venues.findIndex(v => v.id === id && v.club_id === clubId);
      if (venueIndex !== -1) {
        venues[venueIndex] = {
          ...venues[venueIndex],
          name: formData.name,
          description: formData.description,
          address: formData.address,
          latitude: formData.latitude,
          longitude: formData.longitude,
          image: formData.image,
          updated_at: new Date().toISOString()
        };
        saveVenuesToLocalStorage(venues);
        return venues[venueIndex];
      }
      return null;
    }
  } catch (error) {
    console.error('Error in updateVenue:', error);
    return null;
  }
};

export const deleteVenue = async (id: string): Promise<boolean> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      throw new Error('No club selected or invalid club ID');
    }
    
    // Test connection first
    const isConnected = await testSupabaseConnection();
    
    if (!isConnected) {
      console.warn('Supabase connection failed, deleting from local storage');
      const venues = getVenuesFromLocalStorage();
      const filteredVenues = venues.filter(v => !(v.id === id && v.club_id === currentClubId));
      saveVenuesToLocalStorage(filteredVenues);
      return venues.length !== filteredVenues.length;
    }

    try {
      const { error } = await supabase
        .from('venues')
        .delete()
        .eq('id', id)
        .eq('club_id', currentClubId); // Ensure we only delete venues from current club

      if (error) {
        console.error('Error deleting venue:', error);
        // Fallback to local storage
        const venues = getVenuesFromLocalStorage();
        const filteredVenues = venues.filter(v => !(v.id === id && v.club_id === currentClubId));
        saveVenuesToLocalStorage(filteredVenues);
        return venues.length !== filteredVenues.length;
      }

      // Update local storage
      const venues = getVenuesFromLocalStorage();
      const filteredVenues = venues.filter(v => !(v.id === id && v.club_id === currentClubId));
      saveVenuesToLocalStorage(filteredVenues);

      return true;
    } catch (error) {
      console.error('Network error deleting venue:', error);
      // Fallback to local storage
      const venues = getVenuesFromLocalStorage();
      const filteredVenues = venues.filter(v => !(v.id === id && v.club_id === currentClubId));
      saveVenuesToLocalStorage(filteredVenues);
      return venues.length !== filteredVenues.length;
    }
  } catch (error) {
    console.error('Error in deleteVenue:', error);
    return false;
  }
};

export const getDefaultVenue = async (): Promise<Venue | null> => {
  try {
    const clubId = getCurrentClubId();
    if (!clubId) return null;

    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_default', true)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      image: data.image,
      club_id: data.club_id,
      isDefault: data.is_default || false,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  } catch (error) {
    console.error('Error getting default venue:', error);
    return null;
  }
};

// Share a venue with another club
export const shareVenueWithClub = async (venueId: string, targetClubId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('club_venues')
      .insert({
        club_id: targetClubId,
        venue_id: venueId,
        is_primary: false
      });

    if (error) {
      // Check if it's a duplicate key error (venue already shared)
      if (error.code === '23505') {
        console.log('Venue already shared with this club');
        return true;
      }
      console.error('Error sharing venue:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sharing venue:', error);
    return false;
  }
};

// Unshare a venue from a club (only if not primary)
export const unshareVenueFromClub = async (venueId: string, clubId: string): Promise<boolean> => {
  try {
    // Check if this is the primary club - can't unshare from primary
    const { data: relationship } = await supabase
      .from('club_venues')
      .select('is_primary')
      .eq('club_id', clubId)
      .eq('venue_id', venueId)
      .single();

    if (relationship?.is_primary) {
      console.error('Cannot unshare venue from primary club');
      return false;
    }

    const { error } = await supabase
      .from('club_venues')
      .delete()
      .eq('club_id', clubId)
      .eq('venue_id', venueId);

    if (error) {
      console.error('Error unsharing venue:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error unsharing venue:', error);
    return false;
  }
};

// Get clubs that have access to a venue
export const getVenueClubs = async (venueId: string): Promise<Array<{id: string, name: string, abbreviation: string, is_primary: boolean}>> => {
  try {
    const { data, error } = await supabase
      .from('club_venues')
      .select('club_id, is_primary, clubs(id, name, abbreviation)')
      .eq('venue_id', venueId);

    if (error) {
      console.error('Error fetching venue clubs:', error);
      return [];
    }

    return (data || []).map((cv: any) => ({
      id: cv.clubs.id,
      name: cv.clubs.name,
      abbreviation: cv.clubs.abbreviation,
      is_primary: cv.is_primary
    }));
  } catch (error) {
    console.error('Error fetching venue clubs:', error);
    return [];
  }
};

export const findSimilarVenues = async (name: string, address: string, currentClubId: string): Promise<Venue[]> => {
  try {
    if (!name && !address) return [];

    const { data, error } = await supabase
      .from('venues')
      .select('*, clubs(name, abbreviation)')
      .or(`name.ilike.%${name}%,address.ilike.%${address}%`)
      .neq('club_id', currentClubId)
      .limit(10);

    if (error) {
      console.error('Error searching for similar venues:', error);
      return [];
    }

    const { data: clubVenues, error: cvError } = await supabase
      .from('club_venues')
      .select('venue_id')
      .eq('club_id', currentClubId);

    if (cvError) {
      console.error('Error fetching club venues:', cvError);
      return (data as Venue[]) || [];
    }

    const existingVenueIds = new Set((clubVenues || []).map(cv => cv.venue_id));

    return ((data as Venue[]) || []).filter(venue => !existingVenueIds.has(venue.id));
  } catch (error) {
    console.error('Error finding similar venues:', error);
    return [];
  }
};

export const getDiscoverableVenues = async (clubId: string, searchQuery?: string): Promise<Venue[]> => {
  try {
    const { data: clubVenues, error: cvError } = await supabase
      .from('club_venues')
      .select('venue_id')
      .eq('club_id', clubId);

    if (cvError) {
      console.error('Error fetching club venues:', cvError);
      return [];
    }

    const existingVenueIds = (clubVenues || []).map(cv => cv.venue_id);

    let query = supabase
      .from('venues')
      .select('*, clubs(name, abbreviation)')
      .order('name');

    if (existingVenueIds.length > 0) {
      query = query.not('id', 'in', `(${existingVenueIds.join(',')})`);
    }

    if (searchQuery && searchQuery.trim()) {
      query = query.or(`name.ilike.%${searchQuery.trim()}%,address.ilike.%${searchQuery.trim()}%`);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('Error fetching discoverable venues:', error);
      return [];
    }

    return (data as Venue[]) || [];
  } catch (error) {
    console.error('Error in getDiscoverableVenues:', error);
    return [];
  }
};

export const linkExistingVenue = async (venueId: string, clubId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('club_venues')
      .insert({
        club_id: clubId,
        venue_id: venueId,
        is_primary: false
      });

    if (error) {
      if (error.code === '23505') return true;
      console.error('Error linking venue:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error linking venue:', error);
    return false;
  }
};

export const unlinkVenueFromClub = async (venueId: string, clubId: string): Promise<boolean> => {
  try {
    const { data: relationship } = await supabase
      .from('club_venues')
      .select('is_primary')
      .eq('club_id', clubId)
      .eq('venue_id', venueId)
      .maybeSingle();

    if (relationship?.is_primary) {
      console.error('Cannot unlink venue from primary owner');
      return false;
    }

    const { error } = await supabase
      .from('club_venues')
      .delete()
      .eq('club_id', clubId)
      .eq('venue_id', venueId);

    if (error) {
      console.error('Error unlinking venue:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error unlinking venue:', error);
    return false;
  }
};

export const setVenueAsClubDefault = async (venueId: string, clubId: string): Promise<boolean> => {
  try {
    await supabase
      .from('venues')
      .update({ is_default: false })
      .eq('club_id', clubId);

    const { data: venue } = await supabase
      .from('venues')
      .select('club_id')
      .eq('id', venueId)
      .maybeSingle();

    if (venue?.club_id === clubId) {
      const { error } = await supabase
        .from('venues')
        .update({ is_default: true })
        .eq('id', venueId)
        .eq('club_id', clubId);

      if (error) {
        console.error('Error setting venue as default:', error);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error setting venue as default:', error);
    return false;
  }
};

export const isVenueOwnedByClub = (venue: Venue, clubId: string): boolean => {
  return venue.club_id === clubId;
};

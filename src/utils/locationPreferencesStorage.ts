import { supabase } from './supabase';
import { LocationPreferences, SavedLocation, RecentSearch } from './locationUtils';

export const getLocationPreferences = async (userId: string): Promise<LocationPreferences | null> => {
  try {
    const { data, error } = await supabase
      .from('user_location_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching location preferences:', error);
      return null;
    }

    if (!data) {
      return {
        defaultSearchRadius: 50,
        favoriteLocations: [],
        recentSearches: [],
        showTravelTime: true,
        preferredDistanceUnit: 'km'
      };
    }

    return {
      defaultSearchRadius: data.default_search_radius || 50,
      favoriteLocations: data.favorite_locations || [],
      recentSearches: data.recent_searches || [],
      showTravelTime: data.show_travel_time !== false,
      preferredDistanceUnit: data.preferred_distance_unit || 'km'
    };
  } catch (err) {
    console.error('Error in getLocationPreferences:', err);
    return null;
  }
};

export const saveLocationPreferences = async (
  userId: string,
  preferences: Partial<LocationPreferences>
): Promise<boolean> => {
  try {
    const updateData: any = {};

    if (preferences.defaultSearchRadius !== undefined) {
      updateData.default_search_radius = preferences.defaultSearchRadius;
    }
    if (preferences.favoriteLocations !== undefined) {
      updateData.favorite_locations = preferences.favoriteLocations;
    }
    if (preferences.recentSearches !== undefined) {
      updateData.recent_searches = preferences.recentSearches;
    }
    if (preferences.showTravelTime !== undefined) {
      updateData.show_travel_time = preferences.showTravelTime;
    }
    if (preferences.preferredDistanceUnit !== undefined) {
      updateData.preferred_distance_unit = preferences.preferredDistanceUnit;
    }

    const { error } = await supabase
      .from('user_location_preferences')
      .upsert({
        user_id: userId,
        ...updateData
      });

    if (error) {
      console.error('Error saving location preferences:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in saveLocationPreferences:', err);
    return false;
  }
};

export const addRecentSearch = async (
  userId: string,
  search: Omit<RecentSearch, 'timestamp'>
): Promise<boolean> => {
  try {
    const preferences = await getLocationPreferences(userId);
    if (!preferences) return false;

    const newSearch: RecentSearch = {
      ...search,
      timestamp: Date.now()
    };

    const recentSearches = [
      newSearch,
      ...preferences.recentSearches.filter(s => s.name !== search.name)
    ].slice(0, 10);

    return await saveLocationPreferences(userId, { recentSearches });
  } catch (err) {
    console.error('Error in addRecentSearch:', err);
    return false;
  }
};

export const addFavoriteLocation = async (
  userId: string,
  location: SavedLocation
): Promise<boolean> => {
  try {
    const preferences = await getLocationPreferences(userId);
    if (!preferences) return false;

    const favoriteLocations = [
      ...preferences.favoriteLocations.filter(l => l.name !== location.name),
      location
    ];

    return await saveLocationPreferences(userId, { favoriteLocations });
  } catch (err) {
    console.error('Error in addFavoriteLocation:', err);
    return false;
  }
};

export const removeFavoriteLocation = async (
  userId: string,
  locationName: string
): Promise<boolean> => {
  try {
    const preferences = await getLocationPreferences(userId);
    if (!preferences) return false;

    const favoriteLocations = preferences.favoriteLocations.filter(
      l => l.name !== locationName
    );

    return await saveLocationPreferences(userId, { favoriteLocations });
  } catch (err) {
    console.error('Error in removeFavoriteLocation:', err);
    return false;
  }
};

export const getSavedRaceLocations = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('saved_race_locations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching saved race locations:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getSavedRaceLocations:', err);
    return [];
  }
};

export const saveTravelLocation = async (
  userId: string,
  location: {
    locationName: string;
    latitude: number;
    longitude: number;
    searchRadius?: number;
    notes?: string;
  }
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('saved_race_locations')
      .insert({
        user_id: userId,
        location_name: location.locationName,
        latitude: location.latitude,
        longitude: location.longitude,
        search_radius: location.searchRadius || 50,
        notes: location.notes || null
      });

    if (error) {
      console.error('Error saving travel location:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in saveTravelLocation:', err);
    return false;
  }
};

export const deleteSavedLocation = async (locationId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('saved_race_locations')
      .delete()
      .eq('id', locationId);

    if (error) {
      console.error('Error deleting saved location:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in deleteSavedLocation:', err);
    return false;
  }
};

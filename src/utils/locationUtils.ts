import { Venue } from '../types/venue';
import { RaceEvent } from '../types/race';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface SavedLocation {
  name: string;
  lat: number;
  lng: number;
  searchRadius?: number;
  notes?: string;
}

export interface RecentSearch {
  name: string;
  lat: number;
  lng: number;
  timestamp: number;
}

export interface LocationPreferences {
  defaultSearchRadius: number;
  favoriteLocations: SavedLocation[];
  recentSearches: RecentSearch[];
  showTravelTime: boolean;
  preferredDistanceUnit: 'km' | 'miles';
}

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'km' | 'miles' = 'km'
): number => {
  const R = unit === 'km' ? 6371 : 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10;
};

const toRad = (value: number): number => {
  return (value * Math.PI) / 180;
};

export const formatDistance = (distance: number, unit: 'km' | 'miles' = 'km'): string => {
  const unitLabel = unit === 'km' ? 'km' : 'mi';

  if (distance < 1) {
    const meters = Math.round(distance * 1000);
    return unit === 'km' ? `${meters}m` : `${Math.round(distance * 5280)}ft`;
  }

  return `${distance}${unitLabel}`;
};

export const estimateTravelTime = (distanceKm: number): string => {
  const averageSpeedKmh = 60;
  const hours = distanceKm / averageSpeedKmh;

  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  } else if (hours < 24) {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return minutes > 0 ? `${wholeHours}h ${minutes}m` : `${wholeHours}h`;
  } else {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
};

export interface EventWithDistance extends RaceEvent {
  distance?: number;
  distanceFormatted?: string;
  travelTime?: string;
  venueCoordinates?: LocationCoordinates;
}

export const enrichEventsWithDistance = (
  events: RaceEvent[],
  venues: Venue[],
  searchLocation: LocationCoordinates,
  unit: 'km' | 'miles' = 'km'
): EventWithDistance[] => {
  return events
    .map(event => {
      // Try exact match first, then case-insensitive with trimmed whitespace
      let venue = venues.find(v => v.name === event.venue);
      if (!venue) {
        const eventVenueLower = (event.venue || '').toLowerCase().trim();
        venue = venues.find(v =>
          (v.name || '').toLowerCase().trim() === eventVenueLower
        );
      }

      if (!venue || !venue.latitude || !venue.longitude) {
        console.warn('No venue coordinates found for event:', event.title, 'venue:', event.venue);
        return { ...event, distance: Infinity };
      }

      const distance = calculateDistance(
        searchLocation.lat,
        searchLocation.lng,
        venue.latitude,
        venue.longitude,
        unit
      );

      return {
        ...event,
        distance,
        distanceFormatted: formatDistance(distance, unit),
        travelTime: estimateTravelTime(unit === 'km' ? distance : distance * 1.60934),
        venueCoordinates: {
          lat: venue.latitude,
          lng: venue.longitude
        },
        venueImage: venue.image
      };
    })
    .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
};

export const filterEventsByRadius = (
  events: EventWithDistance[],
  radiusKm: number
): EventWithDistance[] => {
  return events.filter(event => {
    // If event has venue coordinates but distance is Infinity, it means the venue wasn't matched properly
    // In this case, skip it
    if (event.distance === Infinity) return false;

    // If no distance calculated at all, skip it
    if (!event.distance) return false;

    const distanceKm = event.distance;
    return distanceKm <= radiusKm;
  });
};

export const filterEventsByDateRange = (
  events: EventWithDistance[],
  startDate: Date | null,
  endDate: Date | null
): EventWithDistance[] => {
  if (!startDate && !endDate) return events;

  return events.filter(event => {
    const eventDate = new Date(event.date);

    if (startDate && eventDate < startDate) return false;
    if (endDate && eventDate > endDate) return false;

    return true;
  });
};

export const getCurrentLocation = (): Promise<LocationCoordinates> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
};

export const geocodeAddress = async (address: string): Promise<LocationCoordinates | null> => {
  if (!window.google || !window.google.maps) {
    console.error('Google Maps not loaded');
    return null;
  }

  const geocoder = new google.maps.Geocoder();

  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const location = results[0].geometry.location;
        resolve({
          lat: location.lat(),
          lng: location.lng()
        });
      } else {
        resolve(null);
      }
    });
  });
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  if (!window.google || !window.google.maps) {
    console.error('Google Maps not loaded');
    return null;
  }

  const geocoder = new google.maps.Geocoder();

  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        resolve(results[0].formatted_address);
      } else {
        resolve(null);
      }
    });
  });
};

export const groupEventsByVenue = (events: EventWithDistance[]): Map<string, EventWithDistance[]> => {
  const venueGroups = new Map<string, EventWithDistance[]>();

  events.forEach(event => {
    const existing = venueGroups.get(event.venue) || [];
    venueGroups.set(event.venue, [...existing, event]);
  });

  return venueGroups;
};

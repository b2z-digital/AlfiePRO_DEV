import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  MapPin,
  Search,
  Navigation,
  Calendar,
  SlidersHorizontal,
  Heart,
  Clock,
  MapIcon,
  List,
  Bookmark,
  Star,
  Navigation2,
  Filter,
  ChevronDown,
  Trash2,
  Grid
} from 'lucide-react';
import { RaceEvent } from '../types/race';
import { Venue } from '../types/venue';
import { useAuth } from '../contexts/AuthContext';
import { loadGoogleMaps } from '../utils/googleMaps';
import { supabase } from '../utils/supabase';
import {
  LocationCoordinates,
  enrichEventsWithDistance,
  filterEventsByRadius,
  filterEventsByDateRange,
  getCurrentLocation,
  reverseGeocode,
  EventWithDistance,
  formatDistance,
  groupEventsByVenue
} from '../utils/locationUtils';
import {
  getLocationPreferences,
  saveLocationPreferences,
  addRecentSearch,
  addFavoriteLocation,
  removeFavoriteLocation,
  getSavedRaceLocations,
  saveTravelLocation,
  deleteSavedLocation
} from '../utils/locationPreferencesStorage';
import { getBoatClassBadge, getRaceFormatBadge } from '../constants/colors';
import { formatDate } from '../utils/date';

interface LocationExplorerProps {
  events: RaceEvent[];
  venues: Venue[];
  darkMode: boolean;
  onClose: () => void;
  onEventClick: (event: RaceEvent) => void;
}

export const LocationExplorer: React.FC<LocationExplorerProps> = ({
  events,
  venues,
  darkMode,
  onClose,
  onEventClick
}) => {
  const { user } = useAuth();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState<LocationCoordinates | null>(null);
  const [searchLocationName, setSearchLocationName] = useState('');
  const [searchRadius, setSearchRadius] = useState(200);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filteredEvents, setFilteredEvents] = useState<EventWithDistance[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventWithDistance | null>(null);
  const [view, setView] = useState<'split' | 'map' | 'list'>('map');
  const [showFilters, setShowFilters] = useState(false);
  const [recentSearches, setRecentSearches] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [savedLocations, setSavedLocations] = useState<any[]>([]);
  const [showSaveLocationModal, setShowSaveLocationModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [clubsMap, setClubsMap] = useState<Map<string, any>>(new Map());

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadGoogleMaps(() => {
      setMapLoaded(true);
    });

    if (user) {
      loadUserPreferences();
      loadSavedLocations();
      loadDefaultClubLocation();
    }
  }, [user]);

  useEffect(() => {
    const fetchClubs = async () => {
      const clubIds = [...new Set(events.map(e => e.clubId).filter(Boolean))];
      if (clubIds.length === 0) return;

      const { data } = await supabase
        .from('clubs')
        .select('id, name, logo_url')
        .in('id', clubIds);

      if (data) {
        const map = new Map();
        data.forEach(club => map.set(club.id, club));
        setClubsMap(map);
      }
    };

    fetchClubs();
  }, [events]);

  const loadUserPreferences = async () => {
    if (!user) return;

    const prefs = await getLocationPreferences(user.id);
    if (prefs) {
      setSearchRadius(prefs.defaultSearchRadius);
      setRecentSearches(prefs.recentSearches || []);
      setFavorites(prefs.favoriteLocations || []);
    }
  };

  const loadSavedLocations = async () => {
    if (!user) return;

    const locations = await getSavedRaceLocations(user.id);
    setSavedLocations(locations);
  };

  const loadDefaultClubLocation = async () => {
    if (!user || searchLocation) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('default_club_id')
        .eq('id', user.id)
        .single();

      if (!profile?.default_club_id) return;

      const { data: venue } = await supabase
        .from('venues')
        .select('name, latitude, longitude, city, state')
        .eq('club_id', profile.default_club_id)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();

      const venueToUse = venue || await supabase
        .from('venues')
        .select('name, latitude, longitude, city, state')
        .eq('club_id', profile.default_club_id)
        .limit(1)
        .maybeSingle()
        .then(result => result.data);

      if (venueToUse) {
        const coords = { lat: venueToUse.latitude, lng: venueToUse.longitude };
        const locationName = venueToUse.state || venueToUse.city || (await reverseGeocode(coords.lat, coords.lng)) || venueToUse.name;
        setSearchLocation(coords);
        setSearchLocationName(locationName);
      }
    } catch (error) {
      console.error('Error loading default club location:', error);
    }
  };

  useEffect(() => {
    if (mapLoaded && mapRef.current && !mapInstanceRef.current) {
      initializeMap();
    }
  }, [mapLoaded, view]);

  useEffect(() => {
    if (searchLocation) {
      const eventsWithDistance = enrichEventsWithDistance(
        events,
        venues,
        searchLocation,
        'km'
      );

      let filtered = filterEventsByRadius(eventsWithDistance, searchRadius);

      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      filtered = filterEventsByDateRange(filtered, start, end);

      setFilteredEvents(filtered);
      updateMapMarkers(filtered);
    }
  }, [searchLocation, searchRadius, startDate, endDate, events, venues]);

  useEffect(() => {
    if (searchLocation && favorites.length > 0) {
      const isFav = favorites.some(
        fav => Math.abs(fav.lat - searchLocation.lat) < 0.001 &&
               Math.abs(fav.lng - searchLocation.lng) < 0.001
      );
      setIsFavorite(isFav);
    } else {
      setIsFavorite(false);
    }
  }, [searchLocation, favorites]);

  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: -33.8688, lng: 151.2093 },
      zoom: 8,
      styles: getGreyscaleMapStyles(),
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

    mapInstanceRef.current = map;

    if (searchInputRef.current) {
      const searchBox = new google.maps.places.SearchBox(searchInputRef.current);
      searchBoxRef.current = searchBox;

      map.addListener('bounds_changed', () => {
        searchBox.setBounds(map.getBounds() as google.maps.LatLngBounds);
      });

      searchBox.addListener('places_changed', () => {
        const places = searchBox.getPlaces();
        if (places && places.length > 0) {
          const place = places[0];
          if (place.geometry && place.geometry.location) {
            handleLocationSelected({
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            }, place.name || place.formatted_address || 'Selected Location');
          }
        }
      });
    }

    if (searchLocation) {
      map.setCenter(searchLocation);
      map.setZoom(10);
    }

    if (filteredEvents.length > 0) {
      updateMapMarkers(filteredEvents);
    }
  };

  const handleLocationSelected = async (coords: LocationCoordinates, name: string) => {
    setSearchLocation(coords);
    setSearchLocationName(name);

    if (view === 'list') {
      setView('map');
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(coords);
      mapInstanceRef.current.setZoom(10);
    }

    if (user) {
      await addRecentSearch(user.id, { name, lat: coords.lat, lng: coords.lng });
      await loadUserPreferences();
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsLoadingLocation(true);
    try {
      const coords = await getCurrentLocation();
      const name = await reverseGeocode(coords.lat, coords.lng) || 'Current Location';
      handleLocationSelected(coords, name);
    } catch (error) {
      console.error('Error getting current location:', error);
      alert('Could not get your current location. Please ensure location services are enabled.');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const updateMapMarkers = (events: EventWithDistance[]) => {
    if (!mapInstanceRef.current) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasValidMarkers = false;

    if (searchLocation) {
      bounds.extend(searchLocation);
      hasValidMarkers = true;

      new google.maps.Circle({
        map: mapInstanceRef.current,
        center: searchLocation,
        radius: searchRadius * 1000,
        strokeColor: darkMode ? '#60a5fa' : '#3b82f6',
        strokeOpacity: 0.4,
        strokeWeight: 2,
        fillColor: darkMode ? '#60a5fa' : '#3b82f6',
        fillOpacity: 0.1
      });

      const searchMarker = new google.maps.Marker({
        position: searchLocation,
        map: mapInstanceRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3
        },
        title: searchLocationName
      });

      markersRef.current.push(searchMarker);
    }

    const venueGroups = groupEventsByVenue(events);

    venueGroups.forEach((venueEvents, venueName) => {
      const firstEvent = venueEvents[0];
      if (!firstEvent.venueCoordinates) return;

      bounds.extend(firstEvent.venueCoordinates);
      hasValidMarkers = true;

      const marker = new google.maps.Marker({
        position: firstEvent.venueCoordinates,
        map: mapInstanceRef.current,
        title: `${venueName} (${venueEvents.length} event${venueEvents.length > 1 ? 's' : ''})`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8 + Math.min(venueEvents.length * 2, 12),
          fillColor: getEventColor(firstEvent),
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      const infoWindow = new google.maps.InfoWindow({
        content: createMarkerInfoWindow(venueEvents, clubsMap)
      });

      google.maps.event.addListener(infoWindow, 'domready', () => {
        venueEvents.forEach(event => {
          const button = document.querySelector(`[data-event-id="${event.id}"]`);
          if (button) {
            button.addEventListener('click', () => {
              onEventClick(event);
              onClose();
            });
          }
        });
      });

      marker.addListener('click', () => {
        infoWindow.open(mapInstanceRef.current, marker);
        setSelectedEvent(firstEvent);
      });

      marker.addListener('mouseover', () => {
        infoWindow.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
    });

    if (hasValidMarkers) {
      mapInstanceRef.current.fitBounds(bounds);
      const zoom = mapInstanceRef.current.getZoom();
      if (zoom && zoom > 12) {
        mapInstanceRef.current.setZoom(12);
      }
    }
  };

  const createMarkerInfoWindow = (events: EventWithDistance[], clubsMap: Map<string, any>): string => {
    const venueName = events[0].venue;
    const venueImage = events[0].venueImage;
    const distance = events[0].distanceFormatted || '';
    const travelTime = events[0].travelTime || '';

    // Helper to format date parts
    const getDateParts = (dateString: string) => {
      const date = new Date(dateString);
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      return { month, day };
    };

    const eventsList = events.map((e, idx) => {
      const club = clubsMap.get(e.clubId);
      const { month, day } = getDateParts(e.date);
      const clubLogo = club?.logo_url || '';

      return `
      <button
        data-event-id="${e.id}"
        style="
          width: 100%;
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          gap: 12px;
          align-items: start;
        "
        onmouseover="this.style.backgroundColor='#f9fafb'; this.style.transform='translateX(4px)'"
        onmouseout="this.style.backgroundColor='transparent'; this.style.transform='translateX(0)'"
      >
        <div style="
          flex-shrink: 0;
          width: 50px;
          height: 50px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
          <div style="font-size: 10px; font-weight: 500; text-transform: uppercase;">${month}</div>
          <div style="font-size: 18px; font-weight: 700; line-height: 1;">${day}</div>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 14px;">${e.eventName || 'Unnamed Event'}</div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            ${clubLogo ? `
              <img src="${clubLogo}" style="width: 20px; height: 20px; border-radius: 4px; object-fit: cover;" />
            ` : ''}
            <span style="font-size: 12px; color: #6b7280; font-weight: 500;">${e.clubName}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            <span style="
              font-size: 10px;
              padding: 2px 8px;
              border-radius: 12px;
              background: ${e.raceFormat === 'handicap' ? '#ede9fe' : '#dbeafe'};
              color: ${e.raceFormat === 'handicap' ? '#7c3aed' : '#2563eb'};
              font-weight: 500;
            ">${e.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}</span>
            ${e.raceClass ? `
              <span style="
                font-size: 10px;
                padding: 2px 8px;
                border-radius: 12px;
                background: #f3f4f6;
                color: #374151;
                font-weight: 500;
              ">${e.raceClass}</span>
            ` : ''}
          </div>
        </div>
      </button>
    `;
    }).join('');

    return `
      <div style="padding: 0; min-width: 280px; max-width: 380px; font-family: system-ui, -apple-system, sans-serif;">
        ${venueImage ? `
          <div style="
            width: 100%;
            height: 120px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url('${venueImage}');
            background-size: cover;
            background-position: center;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            padding: 16px;
            position: relative;
          ">
            <div style="
              position: absolute;
              top: 12px;
              right: 12px;
              background: rgba(255,255,255,0.95);
              padding: 4px 10px;
              border-radius: 20px;
              font-size: 11px;
              font-weight: 600;
              color: #2563eb;
              backdrop-filter: blur(8px);
            ">
              📍 ${distance} away
            </div>
            <h3 style="color: white; margin: 0; font-size: 16px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${venueName}</h3>
            ${travelTime ? `<p style="color: rgba(255,255,255,0.9); margin: 4px 0 0 0; font-size: 12px; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">🚗 ${travelTime}</p>` : ''}
          </div>
        ` : `
          <div style="padding: 16px; border-bottom: 2px solid #e5e7eb; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);">
            <h3 style="font-weight: 700; font-size: 16px; margin: 0 0 6px 0; color: #111827;">${venueName}</h3>
            <div style="font-size: 12px; color: #6b7280; font-weight: 500;">
              📍 ${distance} away ${travelTime ? `• 🚗 ${travelTime}` : ''}
            </div>
          </div>
        `}
        <div style="max-height: 320px; overflow-y: auto;">
          ${eventsList}
        </div>
        <div style="
          padding: 10px 16px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #6b7280;
          font-weight: 600;
        ">
          ${events.length} event${events.length > 1 ? 's' : ''} at this venue
        </div>
      </div>
    `;
  };

  const getEventColor = (event: EventWithDistance): string => {
    if (event.raceFormat === 'handicap') return '#a855f7';
    if (event.raceFormat === 'scratch') return '#3b82f6';
    return '#6b7280';
  };

  const handleToggleFavorite = async () => {
    if (!user || !searchLocation || !searchLocationName) return;

    if (isFavorite) {
      await removeFavoriteLocation(user.id, searchLocationName);
    } else {
      await addFavoriteLocation(user.id, {
        name: searchLocationName,
        lat: searchLocation.lat,
        lng: searchLocation.lng,
        searchRadius
      });
    }

    await loadUserPreferences();
  };

  const handleSaveLocation = async () => {
    if (!user || !searchLocation || !searchLocationName) return;

    await saveTravelLocation(user.id, {
      locationName: searchLocationName,
      latitude: searchLocation.lat,
      longitude: searchLocation.lng,
      searchRadius
    });

    await loadSavedLocations();
    setShowSaveLocationModal(false);
  };

  const handleDeleteSavedLocation = async (locationId: string) => {
    await deleteSavedLocation(locationId);
    await loadSavedLocations();
  };

  const getGreyscaleMapStyles = () => [
    { elementType: 'geometry', stylers: [{ color: darkMode ? '#1a1a1a' : '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: darkMode ? '#6b7280' : '#9ca3af' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: darkMode ? '#1a1a1a' : '#ffffff' }] },
    {
      featureType: 'administrative',
      elementType: 'geometry',
      stylers: [{ color: darkMode ? '#374151' : '#e5e7eb' }]
    },
    {
      featureType: 'administrative.country',
      elementType: 'labels.text.fill',
      stylers: [{ color: darkMode ? '#9ca3af' : '#6b7280' }]
    },
    {
      featureType: 'administrative.locality',
      elementType: 'labels.text.fill',
      stylers: [{ color: darkMode ? '#d1d5db' : '#4b5563' }]
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: darkMode ? '#6b7280' : '#9ca3af' }]
    },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ color: darkMode ? '#1f2937' : '#e5e7eb' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry.fill',
      stylers: [{ color: darkMode ? '#2d3748' : '#ffffff' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry.stroke',
      stylers: [{ color: darkMode ? '#1f2937' : '#e5e7eb' }]
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: darkMode ? '#374151' : '#f3f4f6' }]
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry.stroke',
      stylers: [{ color: darkMode ? '#4b5563' : '#d1d5db' }]
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: darkMode ? '#0f172a' : '#cbd5e1' }]
    },
    {
      featureType: 'water',
      elementType: 'labels.text.fill',
      stylers: [{ color: darkMode ? '#6b7280' : '#9ca3af' }]
    }
  ];

  return createPortal(
    <div
      className={`fixed inset-0 z-50 overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
    >
          {/* Header */}
          <div className={`
            flex items-center justify-between p-4 border-b
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
          `}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <MapIcon className="text-white" size={24} />
              </div>
              <div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Location Explorer
                </h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Discover racing events near you or while traveling
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`
                p-2 rounded-lg transition-colors
                ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}
              `}
            >
              <LogOut size={24} />
            </button>
          </div>

          {/* Search Bar */}
          <div className={`
            p-4 border-b
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}
          `}>
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search location (e.g., Sydney, Melbourne, Gold Coast)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`
                      w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
                    `}
                  />
                </div>

                <button
                  onClick={handleUseCurrentLocation}
                  disabled={isLoadingLocation}
                  className={`
                    px-4 py-3 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-2
                    ${darkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'}
                    ${isLoadingLocation ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <Navigation size={18} />
                  {isLoadingLocation ? 'Locating...' : 'Near Me'}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`
                    px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-2
                    ${darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-300'}
                  `}
                >
                  <SlidersHorizontal size={18} />
                  Filters
                </button>

                {searchLocation && (
                  <>
                    <button
                      onClick={handleToggleFavorite}
                      className={`
                        p-3 rounded-lg transition-colors
                        ${isFavorite
                          ? 'bg-pink-500 text-white'
                          : darkMode
                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            : 'bg-white hover:bg-slate-50 border border-slate-300 text-slate-600'}
                      `}
                    >
                      {isFavorite ? <Heart size={18} fill="currentColor" /> : <Heart size={18} />}
                    </button>

                    <button
                      onClick={() => setShowSaveLocationModal(true)}
                      className={`
                        p-3 rounded-lg transition-colors
                        ${darkMode
                          ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                          : 'bg-white hover:bg-slate-50 border border-slate-300 text-slate-600'}
                      `}
                    >
                      <Bookmark size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Filters Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 p-4 rounded-lg bg-slate-800/50 space-y-4">
                    <div>
                      <label className={`text-sm font-medium mb-2 block ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Search Radius: {searchRadius}km
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="500"
                        step="10"
                        value={searchRadius}
                        onChange={(e) => setSearchRadius(Number(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>10km</span>
                        <span>250km</span>
                        <span>500km</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`text-sm font-medium mb-2 block ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className={`
                            w-full px-3 py-2 rounded-lg border
                            ${darkMode
                              ? 'bg-slate-700 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'}
                          `}
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium mb-2 block ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          End Date
                        </label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className={`
                            w-full px-3 py-2 rounded-lg border
                            ${darkMode
                              ? 'bg-slate-700 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'}
                          `}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recent & Favorites */}
            {!searchLocation && (recentSearches.length > 0 || favorites.length > 0) && (
              <div className="mt-4 space-y-3">
                {recentSearches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={14} className="text-slate-400" />
                      <span className={`text-xs font-semibold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Recent Searches
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.slice(0, 5).map((search, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleLocationSelected({ lat: search.lat, lng: search.lng }, search.name)}
                          className={`
                            px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2
                            ${darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-white hover:bg-slate-50 border border-slate-300 text-slate-700'}
                          `}
                        >
                          <MapPin size={14} />
                          {search.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {favorites.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Star size={14} className="text-yellow-500" />
                      <span className={`text-xs font-semibold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Favorites
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {favorites.map((fav, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleLocationSelected({ lat: fav.lat, lng: fav.lng }, fav.name)}
                          className={`
                            px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2
                            ${darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-white hover:bg-slate-50 border border-slate-300 text-slate-700'}
                          `}
                        >
                          <Heart size={14} className="text-pink-500" fill="currentColor" />
                          {fav.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className={`
            flex items-center justify-between px-4 py-2 border-b
            ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}
          `}>
            <div className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {searchLocation && (
                <span>
                  {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} near {searchLocationName}
                </span>
              )}
              {!searchLocation && (
                <span>Search for a location to discover events</span>
              )}
            </div>

            <div className={`
              flex items-center gap-1 rounded-lg border
              ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'}
            `}>
              <button
                onClick={() => setView('map')}
                className={`
                  px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1
                  ${view === 'map'
                    ? darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'
                    : darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}
                `}
              >
                <MapIcon size={16} />
                <span className="hidden sm:inline">Map</span>
              </button>
              <button
                onClick={() => setView('split')}
                className={`
                  hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${view === 'split'
                    ? darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'
                    : darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}
                `}
              >
                <Grid size={16} />
                Split
              </button>
              <button
                onClick={() => setView('list')}
                className={`
                  px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1
                  ${view === 'list'
                    ? darkMode ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-900'
                    : darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}
                `}
              >
                <List size={16} />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex h-[calc(100%-240px)]">
            {/* Map */}
            {(view === 'split' || view === 'map') && (
              <div className={`${view === 'split' ? 'hidden lg:block lg:w-2/5' : 'w-full'} h-full relative`}>
                {mapLoaded ? (
                  <div ref={mapRef} className="absolute inset-0 w-full h-full" />
                ) : (
                  <div className={`
                    absolute inset-0 w-full h-full flex items-center justify-center
                    ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'}
                  `}>
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                      <p>Loading map...</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Events List */}
            {(view === 'split' || view === 'list') && (
              <div className={`${view === 'split' ? 'w-full lg:w-3/5' : 'w-full'} h-full overflow-y-auto ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                {searchLocation && filteredEvents.length > 0 ? (
                  <div className="p-4 space-y-3">
                    {filteredEvents.map((event, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          onEventClick(event);
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedEvent(event)}
                        className={`
                          w-full text-left p-4 rounded-xl transition-all
                          ${darkMode
                            ? 'bg-slate-800 hover:bg-slate-700 hover:ring-2 hover:ring-blue-500'
                            : 'bg-white hover:bg-slate-50 border border-slate-200 hover:ring-2 hover:ring-blue-500'}
                          ${selectedEvent?.id === event.id ? 'ring-2 ring-blue-500' : ''}
                        `}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {event.eventName}
                          </h3>
                          <div className="flex items-center gap-2 text-sm">
                            <span className={`flex items-center gap-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'} font-medium`}>
                              <Navigation2 size={14} />
                              {event.distanceFormatted}
                            </span>
                            {event.travelTime && (
                              <span className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                • {event.travelTime}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          <MapPin size={14} className="text-slate-400" />
                          <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {event.venue}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <Calendar size={14} className="text-slate-400" />
                          <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {formatDate(event.date)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className={getRaceFormatBadge(event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', darkMode).className}>
                            {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                          </span>
                          <span className={getBoatClassBadge(event.raceClass, darkMode).className}>
                            {event.raceClass}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : searchLocation && filteredEvents.length === 0 ? (
                  <div className={`
                    h-full flex flex-col items-center justify-center p-8 text-center
                    ${darkMode ? 'text-slate-400' : 'text-slate-600'}
                  `}>
                    <MapPin size={48} className="mb-4 opacity-20" />
                    <p className="text-lg font-medium mb-2">No Events Found</p>
                    <p className="text-sm">Try increasing the search radius or adjusting the date range</p>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className={`text-center max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                        <Search size={40} className="opacity-40" />
                      </div>
                      <h3 className={`text-xl font-bold mb-3 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        Start Your Search
                      </h3>
                      <p className="text-sm leading-relaxed">
                        Enter a location or use "Near Me" to discover racing events near you or while traveling
                      </p>
                      <div className={`mt-6 p-4 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                        <p className="text-xs font-medium mb-2">Quick Tips:</p>
                        <ul className="text-xs space-y-1 text-left">
                          <li>• Search for any city or venue</li>
                          <li>• Adjust the radius to expand your search</li>
                          <li>• Set date ranges for trip planning</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

      {/* Save Location Modal */}
      <AnimatePresence>
        {showSaveLocationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
            onClick={() => setShowSaveLocationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className={`
                w-full max-w-md rounded-xl p-6
                ${darkMode ? 'bg-slate-800' : 'bg-white'}
              `}
            >
              <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Save Travel Location
              </h3>
              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Save this location for quick access when planning future trips
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSaveLocationModal(false)}
                  className={`
                    flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                    ${darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}
                  `}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLocation}
                  className="flex-1 px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Save Location
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>,
    document.body
  );
};

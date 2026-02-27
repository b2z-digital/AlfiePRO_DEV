import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Navigation, FileText, Loader2 } from 'lucide-react';
import { loadGoogleMaps } from '../../../utils/googleMaps';
import { StepProps } from './types';

const toTitleCase = (str: string): string => {
  return str.replace(/\b\w+/g, (word) => {
    const lowerWords = ['of', 'the', 'and', 'in', 'on', 'at', 'to', 'for', 'a', 'an'];
    if (lowerWords.includes(word.toLowerCase()) && str.indexOf(word) !== 0) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
};

export const VenueStep: React.FC<StepProps> = ({
  formData,
  updateFormData,
  darkMode
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadGoogleMaps(() => {
      setMapLoaded(true);
      geocoderRef.current = new google.maps.Geocoder();
    });
  }, []);

  useEffect(() => {
    if (mapLoaded && mapContainerRef.current && !mapRef.current) {
      initializeMap();
    }
  }, [mapLoaded]);

  const initializeMap = () => {
    if (!mapContainerRef.current || !window.google) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: { lat: formData.venueLatitude, lng: formData.venueLongitude },
      zoom: 14,
      mapTypeId: google.maps.MapTypeId.HYBRID,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      zoomControl: true,
    });

    const marker = new google.maps.Marker({
      map,
      position: { lat: formData.venueLatitude, lng: formData.venueLongitude },
      draggable: true,
      animation: google.maps.Animation.DROP,
    });

    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (position) {
        updateFormData({
          venueLatitude: position.lat(),
          venueLongitude: position.lng(),
        });

        if (geocoderRef.current) {
          geocoderRef.current.geocode({ location: position }, (results, status) => {
            if (status === 'OK' && results?.[0]) {
              updateFormData({ venueAddress: results[0].formatted_address });
            }
          });
        }
      }
    });

    const input = document.getElementById('onboarding-venue-address') as HTMLInputElement;
    if (input) {
      const searchBox = new google.maps.places.SearchBox(input);

      map.addListener('bounds_changed', () => {
        searchBox.setBounds(map.getBounds() as google.maps.LatLngBounds);
      });

      searchBox.addListener('places_changed', () => {
        const places = searchBox.getPlaces();
        if (!places || places.length === 0) return;

        const place = places[0];
        if (!place.geometry || !place.geometry.location) return;

        map.setCenter(place.geometry.location);
        marker.setPosition(place.geometry.location);

        updateFormData({
          venueLatitude: place.geometry.location.lat(),
          venueLongitude: place.geometry.location.lng(),
          venueAddress: place.formatted_address || formData.venueAddress,
        });
      });
    }

    mapRef.current = map;
    markerRef.current = marker;
  };

  const lookupAddressFromName = useCallback((name: string) => {
    if (!name.trim() || !window.google || !mapRef.current) return;
    setLookingUp(true);
    const service = new google.maps.places.PlacesService(mapRef.current);
    service.findPlaceFromQuery(
      { query: name, fields: ['formatted_address', 'geometry', 'name'] },
      (results, status) => {
        setLookingUp(false);
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const place = results[0];
          const updates: any = {};
          if (place.formatted_address) {
            updates.venueAddress = place.formatted_address;
          }
          if (place.geometry?.location) {
            updates.venueLatitude = place.geometry.location.lat();
            updates.venueLongitude = place.geometry.location.lng();
            if (mapRef.current && markerRef.current) {
              mapRef.current.setCenter(place.geometry.location);
              markerRef.current.setPosition(place.geometry.location);
            }
          }
          if (Object.keys(updates).length > 0) {
            updateFormData(updates);
          }
        }
      }
    );
  }, [updateFormData]);

  const handleVenueNameChange = (value: string) => {
    const titleCased = toTitleCase(value);
    updateFormData({ venueName: titleCased });

    if (lookupTimerRef.current) {
      clearTimeout(lookupTimerRef.current);
    }
    if (titleCased.trim().length >= 5) {
      lookupTimerRef.current = setTimeout(() => {
        lookupAddressFromName(titleCased);
      }, 1000);
    }
  };

  const inputClass = `w-full px-4 py-3 rounded-xl border transition-all duration-200 ${
    darkMode
      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:bg-slate-700 focus:border-emerald-500'
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500'
  } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`;

  const labelClass = `block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`;

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-orange-500/20' : 'bg-orange-50'
        }`}>
          <MapPin className="text-orange-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Default Venue
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Set up your club's primary racing venue
        </p>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-2 mb-4">
          <Navigation className={darkMode ? 'text-orange-400' : 'text-orange-500'} size={18} />
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Venue Details
          </h4>
        </div>

        <div className="space-y-5">
          <div>
            <label className={labelClass}>Venue Name</label>
            <div className="relative">
              <input
                type="text"
                value={formData.venueName}
                onChange={(e) => handleVenueNameChange(e.target.value)}
                className={inputClass}
                placeholder="e.g., Teralba Sailing Club"
              />
              {lookingUp && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-emerald-500" size={18} />
              )}
            </div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Address will auto-detect after you type the venue name
            </p>
          </div>

          <div>
            <label className={labelClass}>Address</label>
            <div className="relative">
              <MapPin className={`absolute left-3 top-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
              <input
                id="onboarding-venue-address"
                type="text"
                value={formData.venueAddress}
                onChange={(e) => updateFormData({ venueAddress: e.target.value })}
                className={`${inputClass} pl-10`}
                placeholder="Search for address..."
              />
            </div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Start typing to search - select from suggestions for accurate map positioning
            </p>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-600/50">
            <div
              ref={mapContainerRef}
              className="w-full h-48"
              style={{ minHeight: '192px' }}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <div className="relative">
              <FileText className={`absolute left-3 top-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={16} />
              <textarea
                value={formData.venueDescription}
                onChange={(e) => updateFormData({ venueDescription: e.target.value })}
                rows={3}
                className={`${inputClass} pl-10 resize-none`}
                placeholder="Brief description of the venue, facilities, parking, etc."
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`p-4 rounded-xl border ${
        darkMode ? 'bg-slate-700/20 border-slate-600/30' : 'bg-blue-50 border-blue-200'
      }`}>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          You can add more venues later from the Venues page. Drag the map marker to fine-tune the exact position.
        </p>
      </div>
    </div>
  );
};

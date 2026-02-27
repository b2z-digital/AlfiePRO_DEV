import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { loadGoogleMaps } from '../../../utils/googleMaps';

const toTitleCase = (str: string): string => {
  return str.replace(/\b\w+/g, (word) => {
    const lowerWords = ['of', 'the', 'and', 'in', 'on', 'at', 'to', 'for', 'a', 'an'];
    if (lowerWords.includes(word.toLowerCase()) && str.indexOf(word) !== 0) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
};

interface ClubVenueStepProps {
  data: {
    name: string;
    description?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    image?: string;
  };
  onUpdate: (data: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export const ClubVenueStep: React.FC<ClubVenueStepProps> = ({
  data,
  onUpdate,
  onNext,
  onBack,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set default coordinates if not set
  useEffect(() => {
    if (!data.latitude || !data.longitude) {
      onUpdate({
        latitude: -32.9688,
        longitude: 151.7174,
      });
    }
  }, []);

  useEffect(() => {
    loadGoogleMaps(() => {
      setMapLoaded(true);
      geocoder.current = new google.maps.Geocoder();
    });
  }, []);

  useEffect(() => {
    if (mapLoaded) {
      initializeMap();
    }
  }, [mapLoaded]);

  const initializeMap = () => {
    const mapElement = document.getElementById('onboarding-venue-map');
    if (!mapElement || !window.google) return;

    const lat = data.latitude || -32.9688;
    const lng = data.longitude || 151.7174;

    const map = new google.maps.Map(mapElement, {
      center: { lat, lng },
      zoom: 15,
      mapTypeId: google.maps.MapTypeId.HYBRID,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT
      },
      fullscreenControl: true,
      streetViewControl: true,
      zoomControl: true
    });

    const marker = new google.maps.Marker({
      map,
      position: { lat, lng },
      draggable: true,
      animation: google.maps.Animation.DROP
    });

    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (position) {
        onUpdate({
          latitude: position.lat(),
          longitude: position.lng()
        });

        if (geocoder.current) {
          geocoder.current.geocode({ location: position }, (results, status) => {
            if (status === 'OK' && results?.[0]) {
              onUpdate({
                address: results[0].formatted_address
              });
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

        onUpdate({
          latitude: place.geometry!.location.lat(),
          longitude: place.geometry!.location.lng(),
          address: place.formatted_address || data.address
        });
      });
    }

    mapRef.current = map;
    markerRef.current = marker;
  };

  const autoResizeTextarea = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(textarea.scrollHeight, 80) + 'px';
    }
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [data.description]);

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
            updates.address = place.formatted_address;
          }
          if (place.geometry?.location) {
            updates.latitude = place.geometry.location.lat();
            updates.longitude = place.geometry.location.lng();
            if (mapRef.current && markerRef.current) {
              mapRef.current.setCenter(place.geometry.location);
              markerRef.current.setPosition(place.geometry.location);
            }
          }
          if (Object.keys(updates).length > 0) {
            onUpdate(updates);
          }
        }
      }
    );
  }, [onUpdate]);

  const handleVenueNameChange = (value: string) => {
    const titleCased = toTitleCase(value);
    onUpdate({ name: titleCased });

    if (lookupTimerRef.current) {
      clearTimeout(lookupTimerRef.current);
    }
    if (titleCased.trim().length >= 5) {
      lookupTimerRef.current = setTimeout(() => {
        lookupAddressFromName(titleCased);
      }, 1000);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrors({ image: 'Please upload an image file' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onUpdate({ image: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.name.trim()) {
      newErrors.name = 'Venue name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  const handleSkip = () => {
    onNext();
  };

  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-6 sm:p-8 md:p-12">
      <h2 className="text-2xl font-bold text-white mb-2">Primary Venue</h2>
      <p className="text-slate-300 mb-6">
        Where does your club primarily hold races and events? You can add more venues later.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Venue Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={data.name}
              onChange={(e) => handleVenueNameChange(e.target.value)}
              placeholder="Enter venue name"
              className={`w-full px-4 py-3 bg-slate-800 text-white border ${
                errors.name ? 'border-red-500' : 'border-slate-700'
              } rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent`}
            />
            {lookingUp && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-green-500" size={18} />
            )}
          </div>
          <p className="text-xs mt-1 text-slate-500">
            Address will auto-detect after you type the venue name
          </p>
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Description
          </label>
          <textarea
            ref={textareaRef}
            value={data.description || ''}
            onChange={(e) => {
              onUpdate({ description: e.target.value });
              autoResizeTextarea();
            }}
            placeholder="Enter venue description"
            className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            style={{ minHeight: '80px', resize: 'vertical' }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Address <span className="text-red-500">*</span>
          </label>
          <input
            id="onboarding-venue-address"
            type="text"
            value={data.address || ''}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder="Search for address"
            className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Location
          </label>
          <div
            id="onboarding-venue-map"
            className="w-full h-[300px] rounded-lg overflow-hidden"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Venue Image
          </label>
          <div className="flex items-center gap-4">
            {data.image && (
              <img
                src={data.image}
                alt="Venue"
                className="w-32 h-32 object-cover rounded-lg border border-slate-700"
              />
            )}
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors bg-slate-700 text-slate-200 hover:bg-slate-600">
              <Upload size={18} />
              Upload Image
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>
          {errors.image && (
            <p className="text-red-500 text-sm mt-1">{errors.image}</p>
          )}
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="px-6 py-2 text-slate-400 hover:text-slate-200 font-medium transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

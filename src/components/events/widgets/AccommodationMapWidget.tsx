import React, { useEffect, useState, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { supabase } from '../../../utils/supabase';

interface Accommodation {
  id: string;
  name: string;
  type: string;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  website_url: string;
  booking_url: string;
  phone: string;
  email: string;
  price_range: string;
  star_rating: number;
  amenities: any;
  distance_from_venue: number;
  is_featured: boolean;
}

interface AccommodationMapWidgetProps {
  settings: any;
  eventData: any;
  eventWebsiteId: string;
  darkMode?: boolean;
}

export const AccommodationMapWidget: React.FC<AccommodationMapWidgetProps> = ({
  settings,
  eventData,
  eventWebsiteId,
  darkMode = false
}) => {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  // Fetch accommodations for this event
  useEffect(() => {
    const fetchAccommodations = async () => {
      try {
        const { data, error } = await supabase
          .from('event_accommodations')
          .select('*')
          .eq('event_website_id', eventWebsiteId)
          .eq('is_published', true)
          .order('display_order', { ascending: true });

        if (error) throw error;

        // Filter to only accommodations with valid coordinates
        const validAccommodations = (data || []).filter(
          a => a.latitude && a.longitude
        );

        setAccommodations(validAccommodations);
      } catch (error) {
        console.error('Error fetching accommodations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAccommodations();
  }, [eventWebsiteId]);
  // Handle both old format (number + unit) and new format (string like "100vh")
  let mapHeight = settings.map_height || '500px';
  if (typeof mapHeight === 'number') {
    const unit = settings.map_height_unit || 'px';
    mapHeight = `${mapHeight}${unit}`;
  }
  const zoomLevel = settings.zoom_level || 13;
  const showBorder = settings.show_border !== false;
  const borderRadius = settings.border_radius || 8;
  const venueMarkerColor = settings.venue_marker_color || '#0ea5e9';
  const accommodationMarkerColor = settings.accommodation_marker_color || '#ef4444';
  const grayscaleStyle = settings.grayscale_style !== false;

  // Get venue coordinates
  let venueLat = null;
  let venueLng = null;
  let venueName = '';

  if (eventData?.venues?.latitude && eventData?.venues?.longitude) {
    venueLat = parseFloat(eventData.venues.latitude);
    venueLng = parseFloat(eventData.venues.longitude);
    venueName = eventData.venues.name || eventData.venue || '';
  } else if (eventData?.venue_latitude && eventData?.venue_longitude) {
    venueLat = parseFloat(eventData.venue_latitude);
    venueLng = parseFloat(eventData.venue_longitude);
    venueName = eventData.venue || '';
  }

  // Initialize Google Maps with custom markers
  useEffect(() => {
    if (!mapRef.current || !venueLat || !venueLng || loading) return;

    const initMap = async () => {
      try {
        // Load Google Maps script if not already loaded
        if (!window.google) {
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
          script.async = true;
          script.defer = true;
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        // Calculate center and bounds
        const allLats = [venueLat, ...accommodations.map(a => Number(a.latitude))];
        const allLngs = [venueLng, ...accommodations.map(a => Number(a.longitude))];
        const centerLat = allLats.reduce((sum, lat) => sum + lat, 0) / allLats.length;
        const centerLng = allLngs.reduce((sum, lng) => sum + lng, 0) / allLngs.length;

        // Create map with optional grayscale styling
        const mapOptions: google.maps.MapOptions = {
          center: { lat: centerLat, lng: centerLng },
          zoom: zoomLevel,
          mapTypeId: 'roadmap',
        };

        // Apply grayscale style if enabled
        if (grayscaleStyle) {
          mapOptions.styles = [
            {
              stylers: [{ saturation: -100 }]
            }
          ];
        }

        const map = new google.maps.Map(mapRef.current, mapOptions);

        mapInstanceRef.current = map;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        // Add venue marker with custom color and teardrop icon
        const venueMarker = new google.maps.Marker({
          position: { lat: venueLat, lng: venueLng },
          map: map,
          title: venueName || 'Event Venue',
          label: {
            text: 'V',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
          },
          icon: {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
            fillColor: venueMarkerColor,
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
            scale: 1.8,
            anchor: new google.maps.Point(12, 22),
            labelOrigin: new google.maps.Point(12, 10),
          },
        });

        // Add info window for venue
        const venueInfo = new google.maps.InfoWindow({
          content: `<div class="p-2"><strong>${venueName || 'Event Venue'}</strong></div>`,
        });
        venueMarker.addListener('click', () => {
          venueInfo.open(map, venueMarker);
        });

        markersRef.current.push(venueMarker);

        // Add accommodation markers with custom color and teardrop icon
        accommodations.forEach((acc, index) => {
          const marker = new google.maps.Marker({
            position: { lat: Number(acc.latitude), lng: Number(acc.longitude) },
            map: map,
            title: acc.name,
            label: {
              text: String(index + 1),
              color: 'white',
              fontWeight: 'bold',
              fontSize: '12px',
            },
            icon: {
              path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
              fillColor: accommodationMarkerColor,
              fillOpacity: 1,
              strokeColor: 'white',
              strokeWeight: 2,
              scale: 1.5,
              anchor: new google.maps.Point(12, 22),
              labelOrigin: new google.maps.Point(12, 9),
            },
          });

          // Create enhanced info window content
          let infoContent = `<div class="p-3" style="max-width: 300px;">
            <h3 class="font-bold text-base mb-1">${acc.name}</h3>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-sm text-gray-600">${acc.type}</span>`;

          // Add star rating
          if (acc.star_rating && acc.star_rating > 0) {
            infoContent += `<span class="flex items-center text-yellow-500">`;
            for (let i = 0; i < Math.floor(acc.star_rating); i++) {
              infoContent += `<span style="color: #EAB308;">★</span>`;
            }
            // Half star if needed
            if (acc.star_rating % 1 >= 0.5) {
              infoContent += `<span style="color: #EAB308;">☆</span>`;
            }
            infoContent += `</span>`;
          }

          infoContent += `</div>`;

          // Address
          if (acc.address) {
            infoContent += `<p class="text-sm text-gray-700 mb-1">📍 ${acc.address}</p>`;
          }

          // Distance from venue
          if (acc.distance_from_venue) {
            infoContent += `<p class="text-sm text-gray-600 mb-1">📏 ${acc.distance_from_venue} km from venue</p>`;
          }

          // Price range
          if (acc.price_range) {
            infoContent += `<p class="text-sm font-semibold text-green-600 mb-2">💰 ${acc.price_range}</p>`;
          }

          // Description
          if (acc.description) {
            const shortDesc = acc.description.length > 120
              ? acc.description.substring(0, 120) + '...'
              : acc.description;
            infoContent += `<p class="text-sm text-gray-700 mb-2">${shortDesc}</p>`;
          }

          // Amenities
          if (acc.amenities && Array.isArray(acc.amenities) && acc.amenities.length > 0) {
            infoContent += `<div class="mb-2">
              <p class="text-xs font-semibold text-gray-600 mb-1">Amenities:</p>
              <div class="flex flex-wrap gap-1">`;
            acc.amenities.slice(0, 6).forEach((amenity: string) => {
              infoContent += `<span class="text-xs bg-gray-100 px-2 py-0.5 rounded">${amenity}</span>`;
            });
            if (acc.amenities.length > 6) {
              infoContent += `<span class="text-xs text-gray-500">+${acc.amenities.length - 6} more</span>`;
            }
            infoContent += `</div></div>`;
          }

          // Contact info
          const contactItems = [];
          if (acc.phone) {
            contactItems.push(`<a href="tel:${acc.phone}" class="text-blue-600 hover:underline">📞 ${acc.phone}</a>`);
          }
          if (acc.email) {
            contactItems.push(`<a href="mailto:${acc.email}" class="text-blue-600 hover:underline">✉️ ${acc.email}</a>`);
          }
          if (contactItems.length > 0) {
            infoContent += `<div class="text-sm mb-2">${contactItems.join(' • ')}</div>`;
          }

          // Booking/Website links
          if (acc.booking_url) {
            infoContent += `<a href="${acc.booking_url}" target="_blank" rel="noopener noreferrer"
              class="inline-block bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors">
              Book Now →
            </a>`;
          } else if (acc.website_url) {
            infoContent += `<a href="${acc.website_url}" target="_blank" rel="noopener noreferrer"
              class="inline-block bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-700 transition-colors">
              Visit Website →
            </a>`;
          }

          infoContent += '</div>';

          const infoWindow = new google.maps.InfoWindow({
            content: infoContent,
          });

          marker.addListener('click', () => {
            infoWindow.open(map, marker);
          });

          markersRef.current.push(marker);
        });

        // Fit bounds to show all markers if there are accommodations
        if (accommodations.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend({ lat: venueLat, lng: venueLng });
          accommodations.forEach(acc => {
            bounds.extend({ lat: Number(acc.latitude), lng: Number(acc.longitude) });
          });
          map.fitBounds(bounds);

          // Apply the user's zoom level setting after fitBounds
          const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            // Use the zoom level from settings
            map.setZoom(zoomLevel);
          });
        }
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    initMap();
  }, [venueLat, venueLng, venueName, accommodations, loading, zoomLevel, venueMarkerColor, accommodationMarkerColor, grayscaleStyle]);

  if (!venueLat || !venueLng) {
    return (
      <div
        className={`rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-100'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'} p-6 flex items-center justify-center`}
        style={{
          height: mapHeight,
          borderRadius: showBorder ? `${borderRadius}px` : '0'
        }}
      >
        <div className="text-center">
          <MapPin className={`w-12 h-12 ${darkMode ? 'text-slate-600' : 'text-slate-400'} mx-auto mb-2`} />
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Venue location not configured
          </p>
          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'} mt-1`}>
            Please add venue coordinates to display the accommodation map
          </p>
        </div>
      </div>
    );
  }


  return (
    <div
      className={`overflow-hidden ${showBorder ? `border ${darkMode ? 'border-slate-700' : 'border-slate-200'}` : ''}`}
      style={{
        height: mapHeight,
        borderRadius: showBorder ? `${borderRadius}px` : '0',
        position: 'relative'
      }}
    >
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
};

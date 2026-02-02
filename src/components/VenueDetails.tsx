import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowLeft, MapPin } from 'lucide-react';
import { getStoredVenues } from '../utils/venueStorage';
import { Venue } from '../types/venue';
import { loadGoogleMaps } from '../utils/googleMaps';
import { WindyWeatherWidget } from './WindyWeatherWidget';

interface VenueDetailsProps {
  venueName: string;
  darkMode: boolean;
  onClose: () => void;
}

export const VenueDetails: React.FC<VenueDetailsProps> = ({
  venueName,
  darkMode,
  onClose
}) => {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'weather'>('details');
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchVenueDetails();
    loadGoogleMaps(() => {
      setMapLoaded(true);
    });
  }, [venueName]);

  useEffect(() => {
    if (mapLoaded && venue && mapRef.current && activeTab === 'details') {
      initializeMap();
    }
  }, [mapLoaded, venue, activeTab]);

  const fetchVenueDetails = async () => {
    try {
      setLoading(true);
      const venues = await getStoredVenues();
      const foundVenue = venues.find(v => v.name === venueName);
      setVenue(foundVenue || null);
    } catch (error) {
      console.error('Error fetching venue details:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeMap = () => {
    if (!venue || !mapRef.current || !window.google) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: venue.latitude, lng: venue.longitude },
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

    new google.maps.Marker({
      map,
      position: { lat: venue.latitude, lng: venue.longitude },
      title: venue.name,
      animation: google.maps.Animation.DROP
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className={`
          max-w-md w-full mx-4 rounded-xl shadow-xl p-6
          ${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'}
        `}>
          <p>Venue not found</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header with venue image */}
        <div
          className="relative w-full h-64 bg-cover bg-center"
          style={{
            backgroundImage: venue.image
              ? `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.7)), url(${venue.image})`
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }}
        >
          <div className="absolute top-4 left-4">
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="absolute bottom-4 left-6">
            <h2 className="text-2xl font-bold text-white drop-shadow-md">
              {venue.name}
            </h2>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'details'
                ? darkMode
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50'
                  : 'text-blue-600 border-b-2 border-blue-600 bg-gray-50'
                : darkMode
                ? 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('weather')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'weather'
                ? darkMode
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50'
                  : 'text-blue-600 border-b-2 border-blue-600 bg-gray-50'
                : darkMode
                ? 'text-slate-400 hover:text-white hover:bg-slate-700/30'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Weather
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* About section */}
              {venue.description && (
                <div>
                  <h3 className={`text-lg font-medium mb-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    About This Venue
                  </h3>
                  <p className={`${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    {venue.description}
                  </p>
                </div>
              )}

              {/* Location section with address */}
              <div>
                <h3 className={`text-lg font-medium mb-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Location
                </h3>
                <div className="flex items-start gap-3 mb-4">
                  <div className={`
                    p-2 rounded-lg
                    ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
                  `}>
                    <MapPin size={20} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <div>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      {venue.address}
                    </p>
                  </div>
                </div>

                {/* Embedded Map */}
                <div className="w-full h-80 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
                  <div ref={mapRef} className="w-full h-full" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'weather' && (
            <div className="h-[600px]">
              <WindyWeatherWidget
                latitude={venue.latitude}
                longitude={venue.longitude}
                locationName={venue.name}
                height="100%"
                showMarker={true}
                showPressure={true}
                zoom={11}
                overlay="wind"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

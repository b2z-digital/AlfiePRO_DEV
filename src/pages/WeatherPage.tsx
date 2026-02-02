import React, { useState, useEffect, useRef } from 'react';
import { Wind, MapPin, Compass, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStoredVenues } from '../utils/venueStorage';
import type { Venue } from '../types/venue';

export default function WeatherPage() {
  const { currentClub } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadVenues();
  }, [currentClub]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadVenues = async () => {
    if (!currentClub) return;

    try {
      const venueData = await getStoredVenues(currentClub);
      setVenues(venueData);

      // Auto-select first venue with coordinates
      const venueWithCoords = venueData.find(v => v.latitude && v.longitude);
      if (venueWithCoords) {
        setSelectedVenue(venueWithCoords);
      } else if (venueData.length > 0) {
        setSelectedVenue(venueData[0]);
      }
    } catch (error) {
      console.error('Error loading venues:', error);
    } finally {
      setLoading(false);
    }
  };

  // Default coordinates (Sydney, Australia) if no venue selected
  const latitude = selectedVenue?.latitude || -33.8688;
  const longitude = selectedVenue?.longitude || 151.2093;
  const locationName = selectedVenue?.name || 'Default Location';

  // Build Windy URL with optimal settings for full-screen display
  const windyUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt&zoom=11&overlay=wind&product=ecmwf&level=surface&lat=${latitude}&lon=${longitude}&detailLat=${latitude}&detailLon=${longitude}&marker=true&pressure=true&message=true`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading weather data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full">
      {/* Header */}
      <div className="bg-slate-800/30 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4 flex-shrink-0 relative z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-700/50 rounded-lg">
              <Wind size={28} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Weather Forecast</h1>
              <p className="text-slate-400 text-sm">Live marine weather conditions</p>
            </div>
          </div>

          {/* Modern Venue Selector */}
          {venues.length > 0 && (
            <div className="relative z-50" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 rounded-xl px-4 py-2.5 text-white hover:bg-slate-700/70 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-w-[320px]"
              >
                <MapPin size={18} className="text-blue-400 flex-shrink-0" />

                {selectedVenue?.image ? (
                  <img
                    src={selectedVenue.image}
                    alt={selectedVenue.name}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-slate-600/50 flex items-center justify-center flex-shrink-0">
                    <MapPin size={16} className="text-slate-400" />
                  </div>
                )}

                <span className="font-medium text-sm flex-1 text-left truncate">
                  {selectedVenue?.name}
                </span>

                <ChevronDown
                  size={18}
                  className={`text-blue-400 transition-transform duration-200 flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-[320px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-[9999] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="max-h-[400px] overflow-y-auto">
                    {venues.map((venue) => (
                      <button
                        key={venue.id}
                        onClick={() => {
                          setSelectedVenue(venue);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors duration-150 ${
                          selectedVenue?.id === venue.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        {venue.image ? (
                          <img
                            src={venue.image}
                            alt={venue.name}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <MapPin size={20} className="text-blue-600" />
                          </div>
                        )}

                        <div className="flex-1 text-left min-w-0">
                          <div className="font-medium text-gray-900 text-sm truncate">
                            {venue.name}
                          </div>
                          {venue.address && (
                            <div className="text-xs text-gray-500 truncate mt-0.5">
                              {venue.address}
                            </div>
                          )}
                        </div>

                        {selectedVenue?.id === venue.id && (
                          <Check size={18} className="text-blue-600 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedVenue && (
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-1">
              <Compass size={16} />
              <span>
                {latitude.toFixed(4)}°, {longitude.toFixed(4)}°
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Weather Widget */}
      <div className="flex-1 relative bg-gray-50 overflow-hidden">
        {/* Overlay to block clicks on Windy logo (top-left corner) */}
        <div
          className="absolute top-0 left-0 z-10 bg-transparent"
          style={{
            width: '200px',
            height: '70px',
            pointerEvents: 'auto',
            cursor: 'default'
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />

        <iframe
          src={windyUrl}
          className="absolute inset-0 w-full h-full border-0"
          title={`Weather forecast for ${locationName}`}
          allow="geolocation"
          sandbox="allow-scripts allow-same-origin"
          style={{ display: 'block' }}
        />
      </div>

      {/* Info Footer */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            <span className="font-medium">Wind Speed:</span> Knots (kt) •
            <span className="ml-2"><span className="font-medium">Temperature:</span> Celsius (°C) • </span>
            <span className="ml-2"><span className="font-medium">Data:</span> ECMWF Model</span>
          </div>
          <div className="text-gray-500 text-xs">
            Powered by Windy.com
          </div>
        </div>
      </div>
    </div>
  );
}

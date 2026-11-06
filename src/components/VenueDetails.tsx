import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowLeft, MapPin , Info, Wind } from 'lucide-react';
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
      <section className="a-sheet w-full max-w-[640px] overflow-hidden flex flex-col max-h-[90vh]" role="dialog" aria-modal="true" aria-label={venue.name}>
        {/* Header with venue image */}
        <div className="a-sheet-hero relative w-full flex-shrink-0" style={{ height: 200 }}>
          {venue.image ? (
            <img src={venue.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"><MapPin size={44} className="a-dim" /></div>
          )}
          <button onClick={onClose} className="a-gb absolute top-3.5 left-3.5 z-[2]" style={{ width: 38, height: 38 }} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <button onClick={onClose} className="a-gb absolute top-3.5 right-3.5 z-[2]" style={{ width: 38, height: 38 }} aria-label="Close">
            <X size={18} />
          </button>
          <div className="absolute left-6 right-6 bottom-4 z-[1] pointer-events-none">
            {((venue as any).is_default || (venue as any).isDefault) && <span className="a-glass" style={{ color: '#FFC56B' }}>★ Main venue</span>}
            <h2 className="a-display a-ink text-[28px] font-bold mt-2.5">
              {venue.name}
            </h2>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0" style={{ padding: '4px 24px 0' }}>
          <div className="a-seg" style={{ display: 'flex' }} role="tablist">
            <button role="tab" aria-selected={activeTab === 'details'} onClick={() => setActiveTab('details')} className={`a-seg-i flex-1 justify-center ${activeTab === 'details' ? 'a-seg-on' : ''}`}>
              <Info size={15} />Details
            </button>
            <button role="tab" aria-selected={activeTab === 'weather'} onClick={() => setActiveTab('weather')} className={`a-seg-i flex-1 justify-center ${activeTab === 'weather' ? 'a-seg-on' : ''}`}>
              <Wind size={15} />Weather
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '18px 24px 24px' }}>
          {activeTab === 'details' && (
            <div className="flex flex-col gap-4">
              {/* About section */}
              {venue.description && (
                <p className="a-mute m-0 text-[14px] leading-[1.6]">
                  {venue.description}
                </p>
              )}

              {/* Location section with address */}
              <div className="a-grp">
                <div className="a-ir">
                  <span className="a-tile a-tile-sm"><MapPin size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="a-ink text-[14.5px] font-semibold">{venue.address}</div>
                  </div>
                </div>
                {/* Embedded Map */}
                <div className="w-full h-72">
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
      </section>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, ArrowRight, ArrowLeft, Loader, Map as MapIcon, List, ExternalLink, X, Send } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { supabase } from '../../../utils/supabase';
import { loadGoogleMaps } from '../../../utils/googleMaps';
import { useNotifications } from '../../../contexts/NotificationContext';

interface Club {
  id: string;
  name: string;
  abbreviation?: string;
  logo?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  state_association_id?: string;
  state_association_name?: string;
}

interface ClubDiscoveryStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack: () => void;
  isFirstStep: boolean;
}

export const ClubDiscoveryStep: React.FC<ClubDiscoveryStepProps> = ({
  darkMode,
  formData,
  onNext,
  onBack,
}) => {
  const { addNotification } = useNotifications();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [filteredClubs, setFilteredClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestClubName, setRequestClubName] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    fetchClubs();
    initializeMap();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = clubs.filter(
        (club) =>
          club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          club.abbreviation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          club.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          club.state_association_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredClubs(filtered);
    } else {
      setFilteredClubs(clubs);
    }
  }, [searchQuery, clubs]);

  // Group clubs by state association
  const groupedClubs = React.useMemo(() => {
    const groups: { [key: string]: Club[] } = {};

    filteredClubs.forEach(club => {
      const groupKey = club.state_association_name || 'Other Clubs';
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(club);
    });

    // Sort group keys alphabetically, but keep "Other Clubs" at the end
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Other Clubs') return 1;
      if (b === 'Other Clubs') return -1;
      return a.localeCompare(b);
    });

    return sortedKeys.map(key => ({
      name: key,
      clubs: groups[key].sort((a, b) => a.name.localeCompare(b.name))
    }));
  }, [filteredClubs]);

  useEffect(() => {
    if (mapLoaded && filteredClubs.length > 0) {
      updateMapMarkers();
    }
  }, [filteredClubs, mapLoaded]);

  const fetchClubs = async () => {
    try {
      // Fetch all clubs with their state associations and venues
      const { data, error } = await supabase
        .from('clubs')
        .select(`
          id,
          name,
          abbreviation,
          logo,
          bank_name,
          bsb,
          account_number,
          state_association_id,
          state_associations!state_association_id(
            id,
            name
          ),
          venues(
            address,
            latitude,
            longitude,
            is_default
          )
        `)
        .order('name');

      if (error) {
        console.error('Error fetching clubs:', error);
        throw error;
      }

      const clubsData = (data || []).map((club: any) => {
        // Find default venue or use first venue
        const defaultVenue = club.venues?.find((v: any) => v.is_default) || club.venues?.[0];

        return {
          id: club.id,
          name: club.name,
          abbreviation: club.abbreviation,
          logo: club.logo,
          bank_name: club.bank_name,
          bsb: club.bsb,
          account_number: club.account_number,
          address: defaultVenue?.address,
          latitude: defaultVenue?.latitude,
          longitude: defaultVenue?.longitude,
          state_association_id: club.state_association_id,
          state_association_name: club.state_associations?.name,
        };
      });

      console.log('Fetched clubs:', clubsData.length);

      setClubs(clubsData);
      setFilteredClubs(clubsData);

      if (formData.clubId) {
        const preselected = clubsData.find((c) => c.id === formData.clubId);
        if (preselected) setSelectedClub(preselected);
      }
    } catch (error) {
      console.error('Error fetching clubs:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeMap = () => {
    if (!mapRef.current) {
      setTimeout(initializeMap, 100);
      return;
    }

    try {
      loadGoogleMaps(() => {
        if (!mapRef.current) return;

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: -33.8688, lng: 151.2093 }, // Sydney center for better initial view
          zoom: 8, // Zoomed out to show regional area
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#0ea5e9' }],
            },
            {
              featureType: 'water',
              elementType: 'labels.text.fill',
              stylers: [{ color: '#94a3b8' }],
            },
          ],
        });

        mapInstanceRef.current = map;
        setMapLoaded(true);
      });
    } catch (error) {
      console.error('Error loading map:', error);
    }
  };

  const updateMapMarkers = () => {
    if (!mapInstanceRef.current) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();

    // Teardrop pin SVG path
    const pinPath = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z';

    filteredClubs.forEach((club) => {
      if (club.latitude && club.longitude) {
        const position = { lat: club.latitude, lng: club.longitude };

        const marker = new google.maps.Marker({
          position,
          map: mapInstanceRef.current!,
          title: club.name,
          icon: {
            path: pinPath,
            scale: selectedClub?.id === club.id ? 1.8 : 1.5,
            fillColor: selectedClub?.id === club.id ? '#3b82f6' : '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            anchor: new google.maps.Point(12, 22),
          },
        });

        marker.addListener('click', () => {
          // Reset all markers to red
          markersRef.current.forEach((m) => {
            const icon = m.getIcon() as google.maps.Symbol;
            if (icon) {
              m.setIcon({
                path: pinPath,
                scale: 1.5,
                fillColor: '#ef4444',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                anchor: new google.maps.Point(12, 22),
              });
            }
          });

          // Set clicked marker to blue and larger
          setSelectedClub(club);
          marker.setIcon({
            path: pinPath,
            scale: 1.8,
            fillColor: '#3b82f6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            anchor: new google.maps.Point(12, 22),
          });
        });

        markersRef.current.push(marker);
        bounds.extend(position);
      }
    });

    if (filteredClubs.length > 0 && filteredClubs.some(c => c.latitude && c.longitude)) {
      const padding = { top: 50, right: 50, bottom: 50, left: 50 };
      mapInstanceRef.current!.fitBounds(bounds, padding);

      // Prevent zooming in too close for single or few clubs
      google.maps.event.addListenerOnce(mapInstanceRef.current!, 'bounds_changed', () => {
        const currentZoom = mapInstanceRef.current!.getZoom();
        if (currentZoom && currentZoom > 12) {
          mapInstanceRef.current!.setZoom(12);
        }
      });
    }
  };

  const handleSelectClub = (club: Club) => {
    if (selectedClub?.id === club.id) {
      setSelectedClub(null);

      if (mapInstanceRef.current && filteredClubs.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        filteredClubs.forEach((c) => {
          if (c.latitude && c.longitude) {
            bounds.extend({ lat: c.latitude, lng: c.longitude });
          }
        });
        const padding = { top: 50, right: 50, bottom: 50, left: 50 };
        mapInstanceRef.current.fitBounds(bounds, padding);
      }
    } else {
      setSelectedClub(club);

      if (club.latitude && club.longitude && mapInstanceRef.current) {
        mapInstanceRef.current.panTo({ lat: club.latitude, lng: club.longitude });
        mapInstanceRef.current.setZoom(10); // Moderate zoom to show surrounding area
      }
    }
  };

  const handleContinue = () => {
    if (selectedClub) {
      onNext({
        clubId: selectedClub.id,
        clubName: selectedClub.name,
        clubLogo: selectedClub.logo,
        clubBankName: (selectedClub as any).bank_name,
        clubBsb: (selectedClub as any).bsb,
        clubAccountNumber: (selectedClub as any).account_number,
      });
    }
  };

  const handleSubmitRequest = async () => {
    if (!requestClubName.trim()) return;

    setSubmittingRequest(true);
    try {
      const { data: insertData, error: insertError } = await supabase
        .from('club_requests')
        .insert({
          club_name: requestClubName.trim(),
          message: requestMessage.trim(),
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      await fetch(`${supabaseUrl}/functions/v1/send-club-request-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          club_name: requestClubName.trim(),
          message: requestMessage.trim(),
          request_id: insertData.id,
        }),
      });

      addNotification('success', 'Thank you! Your club request has been submitted. We\'ll review it and add the club soon.');
      setShowRequestModal(false);
      setRequestClubName('');
      setRequestMessage('');
    } catch (error) {
      console.error('Error submitting club request:', error);
      addNotification('error', 'Failed to submit request. Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <Loader className="animate-spin text-blue-500" size={32} />
        <span className={`ml-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Loading clubs...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="p-3 sm:p-4 md:p-6 border-b border-slate-700">
        <h2 className={`text-xl sm:text-2xl font-bold mb-1 sm:mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Find Your Club
        </h2>
        <p className={`text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Search for your sailing club or select it on the map
        </p>

        <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by club name or location..."
              className={`w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base ${
                darkMode
                  ? 'bg-slate-800 text-white border-slate-700'
                  : 'bg-slate-50 text-slate-900 border-slate-300'
              } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
          </div>

          <div className={`flex rounded-lg overflow-hidden border ${darkMode ? 'border-slate-700' : 'border-slate-300'} self-start sm:self-auto`}>
            <button
              onClick={() => setViewMode('map')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-center gap-1.5 sm:gap-2 transition-colors ${
                viewMode === 'map'
                  ? 'bg-green-500 text-white'
                  : darkMode
                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MapIcon size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Map</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-center gap-1.5 sm:gap-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-green-500 text-white'
                  : darkMode
                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <List size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">List</span>
            </button>
          </div>
        </div>
      </div>

      <div className={viewMode === 'map' ? 'flex flex-col md:grid md:grid-cols-2 gap-0' : ''}>
        {viewMode === 'map' && (
          <div className="h-[250px] sm:h-[350px] md:h-[500px] bg-slate-900 order-2 md:order-1">
            <div ref={mapRef} className="w-full h-full" />
          </div>
        )}

        <div className={`h-[400px] sm:h-[450px] md:h-[500px] overflow-y-auto p-3 sm:p-4 md:p-6 order-1 md:order-2 ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          {filteredClubs.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <MapPin className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} size={40} />
              <p className={`text-base sm:text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                No clubs found
              </p>
              <p className={`text-xs sm:text-sm ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                Try adjusting your search
              </p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {groupedClubs.map((group) => (
                <div key={group.name}>
                  <div className={`sticky top-0 px-2 sm:px-3 py-1.5 sm:py-2 mb-2 sm:mb-3 rounded-lg ${
                    darkMode ? 'bg-slate-700/80 backdrop-blur-sm' : 'bg-slate-200/80 backdrop-blur-sm'
                  }`}>
                    <h4 className={`text-xs sm:text-sm font-semibold uppercase tracking-wide ${
                      darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      {group.name}
                      <span className={`ml-1 sm:ml-2 text-[10px] sm:text-xs font-normal ${
                        darkMode ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        ({group.clubs.length} {group.clubs.length === 1 ? 'club' : 'clubs'})
                      </span>
                    </h4>
                  </div>

                  <div className="space-y-2">
                    {group.clubs.map((club) => (
                      <button
                        key={club.id}
                        onClick={() => handleSelectClub(club)}
                        className={`w-full text-left p-3 sm:p-4 rounded-lg transition-all ${
                          selectedClub?.id === club.id
                            ? 'bg-green-500 text-white shadow-lg scale-[1.02]'
                            : darkMode
                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'bg-white text-slate-700 hover:bg-slate-100 shadow'
                        }`}
                      >
                        <div className="flex items-start gap-2 sm:gap-3">
                          {club.logo ? (
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex-shrink-0">
                              <img
                                src={club.logo}
                                alt={club.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.className = `w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-lg sm:text-xl ${
                                      selectedClub?.id === club.id ? 'bg-green-600' : 'bg-slate-700'
                                    }`;
                                    parent.innerHTML = club.name.charAt(0).toUpperCase();
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-lg sm:text-xl ${
                              selectedClub?.id === club.id ? 'bg-green-600' : 'bg-slate-700'
                            }`}>
                              {club.name.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm sm:text-base font-semibold mb-0.5 sm:mb-1 truncate">{club.name}</h3>
                            {club.address && (
                              <div className="flex items-center gap-1 text-xs sm:text-sm opacity-90">
                                <MapPin size={12} className="sm:w-[14px] sm:h-[14px] flex-shrink-0" />
                                <span className="truncate">
                                  {club.address}
                                </span>
                              </div>
                            )}
                          </div>

                          {selectedClub?.id === club.id && (
                            <div className="flex-shrink-0">
                              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 flex items-center justify-center">
                                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white"></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={`mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg border ${
            darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
          }`}>
            <p className={`text-xs sm:text-sm mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Can't find your club?
            </p>
            <button
              onClick={() => setShowRequestModal(true)}
              className={`text-xs sm:text-sm font-medium flex items-center gap-1 ${
                darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
              }`}
            >
              Request to add your club
              <ExternalLink size={12} className="sm:w-[14px] sm:h-[14px]" />
            </button>
          </div>
        </div>
      </div>

      <div className={`p-3 sm:p-4 md:p-6 border-t flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between ${darkMode ? 'border-slate-700' : 'border-slate-300'}`}>
        <button
          onClick={onBack}
          className={`flex items-center justify-center sm:justify-start gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base ${
            darkMode
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
          Back
        </button>

        <button
          onClick={handleContinue}
          disabled={!selectedClub}
          className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-all text-sm sm:text-base ${
            selectedClub
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-lg'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          Continue
          <ArrowRight size={18} className="sm:w-5 sm:h-5" />
        </button>
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" style={{ zIndex: 9999 }}>
          <div className={`bg-slate-800 rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
              <h3 className="text-lg sm:text-xl font-bold text-white">Request to Add Your Club</h3>
              <button
                onClick={() => setShowRequestModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} className="sm:w-6 sm:h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 sm:p-4">
                <p className="text-xs sm:text-sm text-blue-300">
                  Alfie is a new platform and we're actively adding sailing clubs from Australia, New Zealand, and around the world.
                  Your request will help us prioritize which clubs to add next!
                </p>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
                  Club Name *
                </label>
                <input
                  type="text"
                  value={requestClubName}
                  onChange={(e) => setRequestClubName(e.target.value)}
                  placeholder="e.g., Sydney Harbour Yacht Club"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">
                  Additional Information (Optional)
                </label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Club location, website, or any other helpful details..."
                  rows={4}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 border-t border-slate-700 sticky bottom-0 bg-slate-800">
              <button
                onClick={() => setShowRequestModal(false)}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRequest}
                disabled={!requestClubName.trim() || submittingRequest}
                className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                  requestClubName.trim() && !submittingRequest
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-lg'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                {submittingRequest ? (
                  <>
                    <Loader className="animate-spin w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                    <span className="hidden sm:inline">Submitting...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
                    Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

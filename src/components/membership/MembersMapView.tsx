import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Navigation, Mail, Phone, Sailboat, User } from 'lucide-react';
import { Member } from '../../types/member';
import { loadGoogleMaps } from '../../utils/googleMaps';

interface MembersMapViewProps {
  members: Member[];
  darkMode: boolean;
  onClose: () => void;
  onMemberClick?: (member: Member) => void;
}

interface MemberWithCoordinates extends Member {
  lat?: number;
  lng?: number;
  geocodeFailed?: boolean;
}

export const MembersMapView: React.FC<MembersMapViewProps> = ({
  members,
  darkMode,
  onClose,
  onMemberClick
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [geocodedMembers, setGeocodedMembers] = useState<MemberWithCoordinates[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberWithCoordinates | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(true);
  const [geocodeProgress, setGeocodeProgress] = useState({ current: 0, total: 0 });

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    loadGoogleMaps(() => {
      setMapLoaded(true);
    });
  }, []);

  // Geocode member addresses
  useEffect(() => {
    if (!mapLoaded) return;

    const geocodeMembers = async () => {
      setIsGeocoding(true);
      const geocoder = new google.maps.Geocoder();
      const results: MemberWithCoordinates[] = [];
      const membersWithAddresses = members.filter(m =>
        m.street || m.city || m.state || m.postcode
      );

      setGeocodeProgress({ current: 0, total: membersWithAddresses.length });

      for (let i = 0; i < membersWithAddresses.length; i++) {
        const member = membersWithAddresses[i];
        const addressParts = [
          member.street,
          member.city,
          member.state,
          member.postcode
        ].filter(Boolean);

        if (addressParts.length === 0) {
          results.push({ ...member, geocodeFailed: true });
          setGeocodeProgress({ current: i + 1, total: membersWithAddresses.length });
          continue;
        }

        const address = addressParts.join(', ');

        try {
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
          const response = await geocoder.geocode({ address });

          if (response.results && response.results.length > 0) {
            const location = response.results[0].geometry.location;
            results.push({
              ...member,
              lat: location.lat(),
              lng: location.lng()
            });
          } else {
            results.push({ ...member, geocodeFailed: true });
          }
        } catch (error) {
          console.error(`Geocoding failed for ${member.first_name} ${member.last_name}:`, error);
          results.push({ ...member, geocodeFailed: true });
        }

        setGeocodeProgress({ current: i + 1, total: membersWithAddresses.length });
      }

      setGeocodedMembers(results);
      setIsGeocoding(false);
    };

    geocodeMembers();
  }, [members, mapLoaded]);

  // Initialize map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return;

    // Default center (will be adjusted when markers are added)
    const map = new google.maps.Map(mapRef.current, {
      zoom: 10,
      center: { lat: -37.8136, lng: 144.9631 }, // Melbourne default
      styles: darkMode ? [
        { elementType: 'geometry', stylers: [{ color: '#212121' }] },
        { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
        {
          featureType: 'administrative',
          elementType: 'geometry',
          stylers: [{ color: '#757575' }]
        },
        {
          featureType: 'administrative.country',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#9e9e9e' }]
        },
        {
          featureType: 'poi',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#757575' }]
        },
        {
          featureType: 'poi.park',
          elementType: 'geometry',
          stylers: [{ color: '#181818' }]
        },
        {
          featureType: 'poi.park',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#616161' }]
        },
        {
          featureType: 'road',
          elementType: 'geometry.fill',
          stylers: [{ color: '#2c2c2c' }]
        },
        {
          featureType: 'road',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#8a8a8a' }]
        },
        {
          featureType: 'water',
          elementType: 'geometry',
          stylers: [{ color: '#000000' }]
        },
        {
          featureType: 'water',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#3d3d3d' }]
        }
      ] : []
    });

    mapInstanceRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
  }, [mapLoaded, darkMode]);

  // Add markers for members
  useEffect(() => {
    if (!mapInstanceRef.current || isGeocoding) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const validMembers = geocodedMembers.filter(m => m.lat && m.lng);

    if (validMembers.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    validMembers.forEach((member) => {
      if (!member.lat || !member.lng) return;

      const position = { lat: member.lat, lng: member.lng };

      // Create custom marker with avatar
      const markerSize = 40;
      const initials = `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();

      // Create a canvas to draw the avatar marker
      const canvas = document.createElement('canvas');
      canvas.width = markerSize * 2; // Retina display support
      canvas.height = markerSize * 2;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // Draw outer circle (border)
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(markerSize, markerSize, markerSize, 0, 2 * Math.PI);
        ctx.fill();

        // Draw inner circle (background)
        ctx.fillStyle = member.avatar_url ? '#ffffff' : '#1e293b';
        ctx.beginPath();
        ctx.arc(markerSize, markerSize, markerSize - 4, 0, 2 * Math.PI);
        ctx.fill();

        if (member.avatar_url) {
          // Load and draw avatar image
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(markerSize, markerSize, markerSize - 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, 4, 4, (markerSize - 4) * 2, (markerSize - 4) * 2);
            ctx.restore();

            // Update marker icon
            marker.setIcon({
              url: canvas.toDataURL(),
              scaledSize: new google.maps.Size(markerSize, markerSize),
              anchor: new google.maps.Point(markerSize / 2, markerSize / 2)
            });
          };
          img.src = member.avatar_url;
        } else {
          // Draw initials
          ctx.fillStyle = '#94a3b8';
          ctx.font = `bold ${markerSize * 0.8}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initials, markerSize, markerSize);
        }
      }

      const marker = new google.maps.Marker({
        position,
        map: mapInstanceRef.current!,
        title: `${member.first_name} ${member.last_name}`,
        icon: {
          url: canvas.toDataURL(),
          scaledSize: new google.maps.Size(markerSize, markerSize),
          anchor: new google.maps.Point(markerSize / 2, markerSize / 2)
        }
      });

      marker.addListener('click', () => {
        setSelectedMember(member);
      });

      markersRef.current.push(marker);
      bounds.extend(position);
    });

    // Fit map to show all markers
    if (validMembers.length > 0) {
      mapInstanceRef.current.fitBounds(bounds);
      // Adjust zoom if only one marker
      if (validMembers.length === 1) {
        mapInstanceRef.current.setZoom(14);
      }
    }
  }, [geocodedMembers, isGeocoding]);

  const getMemberInitials = (member: Member) => {
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  };

  const handleViewDetails = (member: MemberWithCoordinates) => {
    if (onMemberClick) {
      onMemberClick(member);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`relative w-full h-full max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl overflow-hidden ${
            darkMode ? 'bg-slate-900' : 'bg-white'
          }`}
        >
          {/* Header */}
          <div className={`absolute top-0 left-0 right-0 z-10 ${
            darkMode ? 'bg-slate-900/95' : 'bg-white/95'
          } backdrop-blur-sm border-b ${
            darkMode ? 'border-slate-700' : 'border-slate-200'
          }`}>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  darkMode ? 'bg-blue-500/20' : 'bg-blue-50'
                }`}>
                  <MapPin className="text-blue-500" size={24} />
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}>
                    Members Map
                  </h2>
                  <p className={`text-sm ${
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    {isGeocoding
                      ? `Locating members... ${geocodeProgress.current}/${geocodeProgress.total}`
                      : `${geocodedMembers.filter(m => m.lat && m.lng).length} members located`
                    }
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'hover:bg-slate-800 text-slate-400'
                    : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Map Container */}
          <div ref={mapRef} className="w-full h-full" />

          {/* Loading Overlay */}
          {isGeocoding && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className={`text-center ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-lg font-medium">Locating members...</p>
                <p className="text-sm opacity-75 mt-1">
                  {geocodeProgress.current} of {geocodeProgress.total}
                </p>
              </div>
            </div>
          )}

          {/* Member Detail Card */}
          {selectedMember && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className={`absolute top-20 right-4 w-96 rounded-xl shadow-2xl overflow-hidden ${
                darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
              }`}
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedMember(null)}
                className={`absolute top-2 right-2 p-1.5 rounded-lg transition-colors z-10 ${
                  darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <X size={16} />
              </button>

              {/* Member Header */}
              <div className={`p-6 ${
                darkMode ? 'bg-gradient-to-br from-blue-900/40 to-slate-800' : 'bg-gradient-to-br from-blue-50 to-slate-50'
              }`}>
                <div className="flex items-start gap-4">
                  {selectedMember.avatar_url ? (
                    <img
                      src={selectedMember.avatar_url}
                      alt={`${selectedMember.first_name} ${selectedMember.last_name}`}
                      className="w-16 h-16 rounded-full object-cover border-2 border-blue-500"
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-2 border-blue-500 ${
                      darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {getMemberInitials(selectedMember)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className={`text-lg font-bold truncate ${
                      darkMode ? 'text-white' : 'text-slate-900'
                    }`}>
                      {selectedMember.first_name} {selectedMember.last_name}
                    </h3>
                    {selectedMember.membership_level && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {selectedMember.membership_level}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Member Details */}
              <div className="p-6 space-y-4">
                {/* Contact Info */}
                {selectedMember.email && (
                  <div className="flex items-start gap-3">
                    <Mail size={18} className={darkMode ? 'text-slate-400 mt-0.5' : 'text-slate-500 mt-0.5'} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${
                        darkMode ? 'text-slate-500' : 'text-slate-600'
                      }`}>
                        Email
                      </p>
                      <a
                        href={`mailto:${selectedMember.email}`}
                        className={`text-sm break-all hover:underline ${
                          darkMode ? 'text-slate-300' : 'text-slate-900'
                        }`}
                      >
                        {selectedMember.email}
                      </a>
                    </div>
                  </div>
                )}

                {selectedMember.phone && (
                  <div className="flex items-start gap-3">
                    <Phone size={18} className={darkMode ? 'text-slate-400 mt-0.5' : 'text-slate-500 mt-0.5'} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${
                        darkMode ? 'text-slate-500' : 'text-slate-600'
                      }`}>
                        Phone
                      </p>
                      <a
                        href={`tel:${selectedMember.phone}`}
                        className={`text-sm hover:underline ${
                          darkMode ? 'text-slate-300' : 'text-slate-900'
                        }`}
                      >
                        {selectedMember.phone}
                      </a>
                    </div>
                  </div>
                )}

                {/* Address */}
                {(selectedMember.street || selectedMember.city || selectedMember.state || selectedMember.postcode) && (
                  <div className="flex items-start gap-3">
                    <Navigation size={18} className={darkMode ? 'text-slate-400 mt-0.5' : 'text-slate-500 mt-0.5'} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${
                        darkMode ? 'text-slate-500' : 'text-slate-600'
                      }`}>
                        Address
                      </p>
                      <p className={`text-sm ${
                        darkMode ? 'text-slate-300' : 'text-slate-900'
                      }`}>
                        {[selectedMember.street, selectedMember.city, selectedMember.state, selectedMember.postcode]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Boats */}
                {selectedMember.boats && selectedMember.boats.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Sailboat size={18} className={darkMode ? 'text-slate-400 mt-0.5' : 'text-slate-500 mt-0.5'} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium mb-2 ${
                        darkMode ? 'text-slate-500' : 'text-slate-600'
                      }`}>
                        Boats
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedMember.boats.map((boat) => (
                          <span
                            key={boat.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {boat.boat_type} {boat.sail_number && `#${boat.sail_number}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Financial Status */}
                <div className="flex items-center gap-3 pt-2 border-t border-slate-700/50">
                  <div className={`flex-1 text-center py-2 rounded-lg ${
                    selectedMember.is_financial
                      ? darkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-700'
                      : darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-700'
                  }`}>
                    <p className="text-xs font-medium">
                      {selectedMember.is_financial ? 'Financial' : 'Not Financial'}
                    </p>
                  </div>
                </div>

                {/* View Details Button */}
                {onMemberClick && (
                  <button
                    onClick={() => handleViewDetails(selectedMember)}
                    className={`w-full mt-4 py-2.5 px-4 rounded-lg font-medium transition-colors ${
                      darkMode
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    View Full Details
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, Trash2, Upload, X, Edit2, Map, Eye, Search, Star, ArrowUpDown, LayoutGrid, List, Building, Share2, Users, AlertCircle } from 'lucide-react';
import { Venue, VenueFormData } from '../../types/venue';
import { getStoredVenues, addVenue, updateVenue, deleteVenue, shareVenueWithClub, unshareVenueFromClub, getVenueClubs, findSimilarVenues } from '../../utils/venueStorage';
import { loadGoogleMaps } from '../../utils/googleMaps';
import { ConfirmationModal } from '../ConfirmationModal';
import { VenueDetails } from '../VenueDetails';
import { useNotifications } from '../../contexts/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface VenuesPageProps {
  darkMode: boolean;
}

export const VenuesPage: React.FC<VenuesPageProps> = ({
  darkMode
}) => {
  const { can } = usePermissions();
  const { currentClub, currentOrganization } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [venueToDelete, setVenueToDelete] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<VenueFormData>({
    name: '',
    description: '',
    address: '',
    latitude: -32.9688,
    longitude: 151.7174,
    image: null,
    isDefault: false
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showVenueDetails, setShowVenueDetails] = useState(false);
  const [selectedVenueForDetails, setSelectedVenueForDetails] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const { addNotification } = useNotifications();
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const [showHeaderSearch, setShowHeaderSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [clubs, setClubs] = useState<Array<{id: string, name: string, abbreviation: string}>>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [venueToShare, setVenueToShare] = useState<Venue | null>(null);
  const [venueClubs, setVenueClubs] = useState<Array<{id: string, name: string, abbreviation: string, is_primary: boolean}>>([]);
  const [sharingClubs, setSharingClubs] = useState<string[]>([]);
  const [similarVenues, setSimilarVenues] = useState<Venue[]>([]);
  const [showSimilarVenuesModal, setShowSimilarVenuesModal] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to check if user can edit/delete a specific venue
  const canModifyVenue = (venue: Venue): boolean => {
    // If we're in a club context, check if the venue belongs to current club
    if (currentClub && !currentOrganization) {
      return venue.club_id === currentClub.clubId && can('venues.create');
    }
    // If we're in a state association context, check if venue belongs to a club in this association
    if (currentOrganization && currentOrganization.type === 'state') {
      const venueClub = clubs.find(c => c.id === venue.club_id);
      return !!venueClub && can('venues.create');
    }
    return can('venues.create');
  };

  // Helper to check if we're in association view
  const isAssociationView = (): boolean => {
    return !!currentOrganization && (currentOrganization.type === 'state' || currentOrganization.type === 'national');
  };

  useEffect(() => {
    fetchVenues();
    if (currentOrganization?.type === 'state') {
      fetchAssociationClubs();
    }
  }, [currentOrganization]);

  const fetchAssociationClubs = async () => {
    if (!currentOrganization) return;

    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, abbreviation')
        .eq('state_association_id', currentOrganization.id)
        .order('name');

      if (error) throw error;
      setClubs(data || []);
    } catch (err) {
      console.error('Error fetching clubs:', err);
    }
  };

  const fetchVenues = async () => {
    try {
      setLoading(true);
      const storedVenues = await getStoredVenues();
      setVenues(storedVenues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-resize textarea function
  const autoResizeTextarea = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(textarea.scrollHeight, 80) + 'px';
    }
  };

  // Auto-resize on content change
  useEffect(() => {
    autoResizeTextarea();
  }, [formData.description]);

  // Auto-resize on mount
  useEffect(() => {
    if (showForm) {
      setTimeout(autoResizeTextarea, 100);
    }
  }, [showForm]);

  useEffect(() => {
    if (showForm) {
      loadGoogleMaps(() => {
        setMapLoaded(true);
        geocoder.current = new google.maps.Geocoder();
      });
    }
  }, [showForm]);

  useEffect(() => {
    if (mapLoaded && showForm) {
      initializeMap();
    }
  }, [mapLoaded, showForm]);

  const initializeMap = () => {
    const mapElement = document.getElementById('venue-map');
    if (!mapElement || !window.google) return;

    const map = new google.maps.Map(mapElement, {
      center: { lat: formData.latitude, lng: formData.longitude },
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
      position: { lat: formData.latitude, lng: formData.longitude },
      draggable: true,
      animation: google.maps.Animation.DROP
    });

    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (position) {
        setFormData(prev => ({
          ...prev,
          latitude: position.lat(),
          longitude: position.lng()
        }));

        if (geocoder.current) {
          geocoder.current.geocode({ location: position }, (results, status) => {
            if (status === 'OK' && results?.[0]) {
              setFormData(prev => ({
                ...prev,
                address: results[0].formatted_address
              }));
            }
          });
        }
      }
    });

    const input = document.getElementById('venue-address') as HTMLInputElement;
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

      setFormData(prev => ({
        ...prev,
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        address: place.formatted_address || prev.address
      }));
    });

    mapRef.current = map;
    markerRef.current = marker;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({
        ...prev,
        image: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate club selection for state association admins
    if (currentOrganization?.type === 'state' && !selectedClubId && !selectedVenue) {
      setError('Please select a club');
      return;
    }

    try {
      if (selectedVenue) {
        const updatedVenue = await updateVenue(selectedVenue.id, formData, selectedVenue.club_id);
        if (!updatedVenue) {
          throw new Error('Failed to update venue');
        }
      } else {
        const newVenue = await addVenue(formData, selectedClubId || undefined);
        if (!newVenue) {
          throw new Error('Failed to add venue');
        }
      }

      await fetchVenues();
      setSelectedVenue(null);
      setShowForm(false);
      addNotification('success', selectedVenue ? 'Venue updated successfully' : 'Venue added successfully');
      setFormData({
        name: '',
        description: '',
        address: '',
        latitude: -32.9688,
        longitude: 151.7174,
        image: null,
        isDefault: false
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleEdit = (venue: Venue) => {
    setSelectedVenue(venue);
    setSelectedClubId(venue.club_id || '');
    setFormData({
      name: venue.name,
      description: venue.description || '',
      address: venue.address,
      latitude: venue.latitude,
      longitude: venue.longitude,
      image: venue.image,
      isDefault: venue.is_default || false
    });
    setShowForm(true);
  };

  const handleDeleteClick = (venue: Venue) => {
    setVenueToDelete(venue);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (venueToDelete) {
      try {
        const success = await deleteVenue(venueToDelete.id);
        if (!success) {
          throw new Error('Failed to delete venue');
        }
        addNotification('success', 'Venue deleted successfully');
        await fetchVenues();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
    setShowDeleteConfirm(false);
    setVenueToDelete(null);
  };

  const handleViewVenue = (venue: Venue) => {
    setSelectedVenueForDetails(venue.name);
    setShowVenueDetails(true);
  };

  const handleShareVenue = async (venue: Venue) => {
    setVenueToShare(venue);
    const existingClubs = await getVenueClubs(venue.id);
    setVenueClubs(existingClubs);
    setSharingClubs(existingClubs.map(c => c.id));
    setShowShareModal(true);
  };

  const handleToggleClubShare = async (clubId: string) => {
    if (!venueToShare) return;

    if (sharingClubs.includes(clubId)) {
      // Remove share
      const success = await unshareVenueFromClub(venueToShare.id, clubId);
      if (success) {
        setSharingClubs(prev => prev.filter(id => id !== clubId));
        addNotification('success', 'Venue unshared successfully');
      } else {
        addNotification('error', 'Failed to unshare venue');
      }
    } else {
      // Add share
      const success = await shareVenueWithClub(venueToShare.id, clubId);
      if (success) {
        setSharingClubs(prev => [...prev, clubId]);
        addNotification('success', 'Venue shared successfully');
      } else {
        addNotification('error', 'Failed to share venue');
      }
    }

    // Refresh venue clubs list
    const updatedClubs = await getVenueClubs(venueToShare.id);
    setVenueClubs(updatedClubs);
  };

  // Check for similar venues when name or address changes
  const checkForSimilarVenues = async () => {
    if (!currentClub || selectedVenue) return; // Don't check when editing existing venue
    if (!formData.name && !formData.address) return;

    const similar = await findSimilarVenues(formData.name, formData.address, currentClub.clubId);
    if (similar.length > 0) {
      setSimilarVenues(similar);
      setShowSimilarVenuesModal(true);
    }
  };

  // Debounced similar venue check
  useEffect(() => {
    if (!showForm || selectedVenue) return;

    const timer = setTimeout(() => {
      checkForSimilarVenues();
    }, 1000); // Wait 1 second after user stops typing

    return () => clearTimeout(timer);
  }, [formData.name, formData.address, showForm]);

  const handleUseExistingVenue = async (venue: Venue) => {
    if (!currentClub) return;

    // Share the existing venue with this club
    const success = await shareVenueWithClub(venue.id, currentClub.clubId);
    if (success) {
      addNotification('success', `${venue.name} is now available for your club`);
      setShowSimilarVenuesModal(false);
      setShowForm(false);
      setFormData({
        name: '',
        description: '',
        address: '',
        latitude: -32.9688,
        longitude: 151.7174,
        image: null,
        isDefault: false
      });
      await fetchVenues();
    } else {
      addNotification('error', 'Failed to add venue to your club');
    }
  };

  const handleCreateNewVenue = () => {
    setShowSimilarVenuesModal(false);
    setSimilarVenues([]);
  };

  const filteredVenues = venues.filter(venue =>
    venue.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    venue.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (venue.description && venue.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedVenues = [...filteredVenues].sort((a, b) => {
    // Always show default venue first
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;

    // Then sort by selected criteria
    if (sortBy === 'name') {
      const comparison = a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? comparison : -comparison;
    } else {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    }
  });

  const toggleSort = () => {
    if (sortBy === 'name') {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortBy('date');
        setSortOrder('desc');
      }
    } else {
      setSortBy('name');
      setSortOrder('asc');
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <MapPin className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Venues</h1>
              <p className="text-slate-400">
                {venues.length} {venues.length === 1 ? 'venue' : 'venues'} registered
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Expandable Search */}
            <div className="relative">
              {showHeaderSearch ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search venues..."
                    className="w-64 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setShowHeaderSearch(false);
                      setSearchTerm('');
                    }}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowHeaderSearch(true)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Search venues"
                >
                  <Search size={20} />
                </button>
              )}
            </div>

            {/* Sort Button */}
            <button
              onClick={toggleSort}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title={`Sort by ${sortBy === 'name' ? 'name' : 'date'} (${sortOrder === 'asc' ? 'ascending' : 'descending'})`}
            >
              <ArrowUpDown size={20} />
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Thumbnail view"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>

            {can('venues.create') && (
              <button
                onClick={() => {
                  setFormData({
                    name: '',
                    description: '',
                    address: '',
                    latitude: -32.9688,
                    longitude: 151.7174,
                    image: null,
                    isDefault: false
                  });
                  setSelectedClubId('');
                  setShowForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 font-medium transition-all shadow-lg hover:shadow-xl animate-pulse"
              >
                <Plus size={18} />
                Add Venue
              </button>
            )}
          </div>
        </div>

        {showForm ? (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">
                    Venue Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg transition-colors bg-slate-700 text-slate-200"
                    placeholder="Enter venue name"
                  />
                </div>

                {/* Club Selector for State Association Admins */}
                {currentOrganization?.type === 'state' && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-300">
                      <Building className="inline mr-1" size={14} />
                      Club *
                    </label>
                    <select
                      required
                      value={selectedClubId}
                      onChange={(e) => setSelectedClubId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg transition-colors bg-slate-700 text-slate-200 border border-slate-600 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">Select a club...</option>
                      {clubs.map((club) => (
                        <option key={club.id} value={club.id}>
                          {club.name} {club.abbreviation ? `(${club.abbreviation})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">
                    Description
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={formData.description}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, description: e.target.value }));
                      autoResizeTextarea();
                    }}
                    className="w-full px-3 py-2 rounded-lg transition-colors bg-slate-700 text-slate-200"
                    placeholder="Enter venue description"
                    style={{ minHeight: '80px', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">
                    Address *
                  </label>
                  <input
                    id="venue-address"
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg transition-colors bg-slate-700 text-slate-200"
                    placeholder="Search for address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">
                    Location
                  </label>
                  <div 
                    id="venue-map" 
                    className="w-full h-[300px] rounded-lg overflow-hidden"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-slate-300">
                      Set as default venue for your club
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">
                    Venue Image
                  </label>
                  <div className="flex items-center gap-4">
                    {formData.image && (
                      <img 
                        src={formData.image} 
                        alt="Venue" 
                        className="w-32 h-32 object-cover rounded-lg"
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
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-900/10 text-red-500 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setSelectedVenue(null);
                    setFormData({
                      name: '',
                      description: '',
                      address: '',
                      latitude: -32.9688,
                      longitude: 151.7174,
                      image: null,
                      isDefault: false
                    });
                  }}
                  className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  {selectedVenue ? 'Update Venue' : 'Save Venue'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            {loading ? (
              <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-slate-400">Loading venues...</p>
              </div>
            ) : sortedVenues.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
                <MapPin size={48} className="mx-auto mb-4 text-slate-600" />
                <h3 className="text-lg font-medium text-slate-300 mb-2">No Venues Found</h3>
                <p className="text-slate-400 mb-6">
                  {searchTerm ? 'Try a different search term' : 'Add your first venue to get started'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => {
                      setFormData({
                        name: '',
                        description: '',
                        address: '',
                        latitude: -32.9688,
                        longitude: 151.7174,
                        image: null,
                        isDefault: false
                      });
                      setShowForm(true);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl animate-pulse"
                  >
                    Add Venue
                  </button>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {sortedVenues.map(venue => (
                  <button
                    key={venue.id}
                    onClick={() => handleViewVenue(venue)}
                    className="group relative rounded-2xl overflow-hidden transition-all duration-500 transform hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-500/20 text-left cursor-pointer w-full"
                  >
                    {/* Card Background with Glassmorphism */}
                    <div className="absolute inset-0 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-2xl group-hover:border-blue-500/30 transition-colors duration-300" />

                    {/* Image Container with Parallax Effect */}
                    <div className="relative h-64 w-full overflow-hidden rounded-t-2xl">
                      {venue.image ? (
                        <img
                          src={venue.image}
                          alt={venue.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                          <MapPin size={48} className="text-slate-500" />
                        </div>
                      )}

                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent opacity-80" />

                      {/* Hover Eye Icon */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20">
                        <div className="p-4 rounded-full bg-blue-600/90 backdrop-blur-sm shadow-2xl transform scale-90 group-hover:scale-100 transition-transform duration-300">
                          <Eye size={32} className="text-white" />
                        </div>
                      </div>

                      {/* Badges in Top Right Corner */}
                      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                        {/* Club Label Badge (for association views) */}
                        {isAssociationView() && venue.clubs && (
                          <div className="bg-blue-600/90 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg border border-blue-500/30">
                            {venue.clubs.abbreviation || venue.clubs.name}
                          </div>
                        )}

                        {/* Default Badge with Shimmer */}
                        {venue.is_default && (
                          <div className="animate-pulse">
                            <div className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
                              <Star size={14} fill="currentColor" />
                              Main Venue
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Floating Action Buttons */}
                      <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-y-2 group-hover:translate-y-0 z-10">
                        {canModifyVenue(venue) && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(venue);
                              }}
                              className="p-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all duration-300 hover:scale-110 shadow-lg"
                              title="Edit venue"
                            >
                              <Edit2 size={16} />
                            </button>
                            {currentOrganization?.type === 'state' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShareVenue(venue);
                                }}
                                className="p-2.5 rounded-xl bg-blue-500/20 backdrop-blur-md border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-all duration-300 hover:scale-110 shadow-lg"
                                title="Share with clubs"
                              >
                                <Share2 size={16} />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(venue);
                              }}
                              className="p-2.5 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all duration-300 hover:scale-110 shadow-lg"
                              title="Delete venue"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Title Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <h3 className="text-xl font-bold text-white mb-1 drop-shadow-lg">
                          {venue.name}
                        </h3>
                      </div>
                    </div>

                    {/* Content Section */}
                    <div className="relative p-5 space-y-3">
                      {/* Address with Icon */}
                      <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-slate-300 line-clamp-2 leading-relaxed">
                          {venue.address}
                        </span>
                      </div>

                      {/* Description */}
                      {venue.description && (
                        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                          {venue.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {sortedVenues.map(venue => (
                  <button
                    key={venue.id}
                    onClick={() => handleViewVenue(venue)}
                    className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-blue-500/10 w-full text-left cursor-pointer"
                  >
                    {/* Glassmorphism Background */}
                    <div className="absolute inset-0 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-2xl group-hover:border-blue-500/30 transition-colors duration-300" />

                    <div className="relative flex items-center gap-5 p-5">
                      {/* Image Container with Zoom Effect */}
                      <div className="relative w-36 h-36 flex-shrink-0 rounded-xl overflow-hidden shadow-lg">
                        {venue.image ? (
                          <img
                            src={venue.image}
                            alt={venue.name}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                            <MapPin size={36} className="text-slate-500" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent" />

                        {/* Hover Eye Icon for List View */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20">
                          <div className="p-3 rounded-full bg-blue-600/90 backdrop-blur-sm shadow-2xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                            <Eye size={24} className="text-white" />
                          </div>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-xl font-bold text-white truncate">
                                {venue.name}
                              </h3>
                              {venue.is_default && (
                                <div className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 shadow-lg">
                                  <Star size={12} fill="currentColor" />
                                  Main Venue
                                </div>
                              )}
                              {isAssociationView() && venue.clubs && (
                                <div className="bg-blue-600/90 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-xs font-medium shadow-lg border border-blue-500/30 flex-shrink-0">
                                  {venue.clubs.abbreviation || venue.clubs.name}
                                </div>
                              )}
                            </div>
                            <div className="flex items-start gap-2 text-sm text-slate-300 mb-2">
                              <MapPin size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">
                                {venue.address}
                              </span>
                            </div>
                            {venue.description && (
                              <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                                {venue.description}
                              </p>
                            )}
                          </div>

                          {/* Action Buttons */}
                          {canModifyVenue(venue) && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(venue);
                                }}
                                className="p-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-300 hover:scale-110"
                                title="Edit venue"
                              >
                                <Edit2 size={16} />
                              </button>
                              {currentOrganization?.type === 'state' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShareVenue(venue);
                                  }}
                                  className="p-2.5 rounded-xl bg-blue-500/10 backdrop-blur-md border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all duration-300 hover:scale-110"
                                  title="Share with clubs"
                                >
                                  <Share2 size={16} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(venue);
                                }}
                                className="p-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all duration-300 hover:scale-110"
                                title="Delete venue"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Venue"
        message="Are you sure you want to delete this venue? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

    {showVenueDetails && selectedVenueForDetails && (
      <VenueDetails
        venueName={selectedVenueForDetails}
        darkMode={darkMode}
        onClose={() => {
          setShowVenueDetails(false);
          setSelectedVenueForDetails(null);
        }}
      />
    )}

      {/* Share Venue Modal */}
      {showShareModal && venueToShare && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-blue-500/20">
                    <Share2 className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100">
                      Share Venue
                    </h3>
                    <p className="text-sm text-slate-400">
                      {venueToShare.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowShareModal(false);
                    setVenueToShare(null);
                    fetchVenues(); // Refresh to show updated sharing
                  }}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <p className="text-sm text-slate-400 mb-4">
                Select which clubs can access this venue. The primary club ({venueClubs.find(c => c.is_primary)?.name}) cannot be removed.
              </p>

              <div className="space-y-2">
                {clubs.map((club) => {
                  const isShared = sharingClubs.includes(club.id);
                  const isPrimary = venueClubs.find(c => c.id === club.id)?.is_primary;

                  return (
                    <div
                      key={club.id}
                      className={`p-4 rounded-lg border transition-all ${
                        isShared
                          ? 'bg-blue-500/10 border-blue-500/30'
                          : 'bg-slate-700/50 border-slate-600/50 hover:border-slate-500'
                      }`}
                    >
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Building size={20} className={isShared ? 'text-blue-400' : 'text-slate-400'} />
                          <div>
                            <div className="font-medium text-slate-200">
                              {club.name}
                              {club.abbreviation && (
                                <span className="text-slate-400 ml-2">({club.abbreviation})</span>
                              )}
                            </div>
                            {isPrimary && (
                              <div className="text-xs text-blue-400 mt-1">Primary Owner</div>
                            )}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isShared}
                          disabled={isPrimary}
                          onChange={() => handleToggleClubShare(club.id)}
                          className="w-5 h-5 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowShareModal(false);
                    setVenueToShare(null);
                    fetchVenues(); // Refresh to show updated sharing
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Similar Venues Modal */}
      {showSimilarVenuesModal && similarVenues.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-yellow-500/20">
                    <AlertCircle className="text-yellow-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100">
                      Similar Venues Found
                    </h3>
                    <p className="text-sm text-slate-400">
                      We found {similarVenues.length} similar venue{similarVenues.length > 1 ? 's' : ''} already in the system
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSimilarVenuesModal(false)}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <p className="text-sm text-slate-400 mb-4">
                Instead of creating a duplicate, you can use an existing venue. Select one below to add it to your club:
              </p>

              <div className="space-y-3 mb-6">
                {similarVenues.map((venue) => (
                  <div
                    key={venue.id}
                    className="p-4 rounded-lg border border-slate-600/50 bg-slate-700/30 hover:bg-slate-700/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start gap-3">
                          {venue.image && (
                            <img
                              src={venue.image}
                              alt={venue.name}
                              className="w-20 h-20 rounded-lg object-cover"
                            />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-slate-100 mb-1">
                              {venue.name}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                              <MapPin size={14} />
                              {venue.address}
                            </div>
                            {venue.description && (
                              <p className="text-sm text-slate-500 line-clamp-2">
                                {venue.description}
                              </p>
                            )}
                            <div className="mt-2 text-xs text-slate-500">
                              Primary club: {(venue as any).clubs?.name || 'Unknown'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleUseExistingVenue(venue)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        Use This Venue
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400">
                  None of these match?
                </p>
                <button
                  onClick={handleCreateNewVenue}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Create New Venue Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
  </div>
  );
};
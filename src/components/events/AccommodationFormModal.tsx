import React, { useState, useEffect } from 'react';
import { LogOut, MapPin, Upload, Star, Wifi, Car, Utensils, Waves, DollarSign, Phone, Mail, ExternalLink } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface AccommodationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventWebsiteId: string;
  accommodation?: any;
  onSaved: () => void;
  venueCoordinates?: { lat: number; lng: number };
}

const ACCOMMODATION_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'motel', label: 'Motel' },
  { value: 'bnb', label: 'Bed & Breakfast' },
  { value: 'holiday_rental', label: 'Holiday Rental' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'camping', label: 'Camping/Caravan' },
  { value: 'resort', label: 'Resort' },
  { value: 'other', label: 'Other' }
];

const AMENITIES_OPTIONS = [
  { value: 'wifi', label: 'WiFi', icon: Wifi },
  { value: 'parking', label: 'Free Parking', icon: Car },
  { value: 'breakfast', label: 'Breakfast Included', icon: Utensils },
  { value: 'pool', label: 'Pool', icon: Waves },
  { value: 'gym', label: 'Gym' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar' },
  { value: 'spa', label: 'Spa' },
  { value: 'pet_friendly', label: 'Pet Friendly' },
  { value: 'air_conditioning', label: 'Air Conditioning' },
  { value: 'laundry', label: 'Laundry Service' },
  { value: 'wheelchair_accessible', label: 'Wheelchair Accessible' }
];

export const AccommodationFormModal: React.FC<AccommodationFormModalProps> = ({
  isOpen,
  onClose,
  eventWebsiteId,
  accommodation,
  onSaved,
  venueCoordinates
}) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'hotel',
    address: '',
    latitude: '',
    longitude: '',
    description: '',
    website_url: '',
    booking_url: '',
    phone: '',
    email: '',
    price_range: '',
    star_rating: 0,
    amenities: [] as string[],
    image_url: '',
    distance_from_venue: '',
    display_order: 0,
    is_featured: false,
    is_published: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');

  useEffect(() => {
    if (accommodation) {
      setFormData({
        name: accommodation.name || '',
        type: accommodation.type || 'hotel',
        address: accommodation.address || '',
        latitude: accommodation.latitude?.toString() || '',
        longitude: accommodation.longitude?.toString() || '',
        description: accommodation.description || '',
        website_url: accommodation.website_url || '',
        booking_url: accommodation.booking_url || '',
        phone: accommodation.phone || '',
        email: accommodation.email || '',
        price_range: accommodation.price_range || '',
        star_rating: accommodation.star_rating || 0,
        amenities: Array.isArray(accommodation.amenities) ? accommodation.amenities : [],
        image_url: accommodation.image_url || '',
        distance_from_venue: accommodation.distance_from_venue?.toString() || '',
        display_order: accommodation.display_order || 0,
        is_featured: accommodation.is_featured || false,
        is_published: accommodation.is_published !== false
      });
    }
  }, [accommodation]);

  const handleAddressSearch = async () => {
    if (!addressSearch.trim()) return;

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressSearch)}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();

      if (data.results && data.results[0]) {
        const result = data.results[0];
        const location = result.geometry.location;

        setFormData(prev => ({
          ...prev,
          address: result.formatted_address,
          latitude: location.lat.toString(),
          longitude: location.lng.toString()
        }));

        // Calculate distance from venue if available
        if (venueCoordinates) {
          const distance = calculateDistance(
            venueCoordinates.lat,
            venueCoordinates.lng,
            location.lat,
            location.lng
          );
          setFormData(prev => ({
            ...prev,
            distance_from_venue: distance.toFixed(1)
          }));
        }
      }
    } catch (error) {
      console.error('Address search error:', error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const dataToSave = {
        event_website_id: eventWebsiteId,
        name: formData.name,
        type: formData.type,
        address: formData.address || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        description: formData.description || null,
        website_url: formData.website_url || null,
        booking_url: formData.booking_url || null,
        phone: formData.phone || null,
        email: formData.email || null,
        price_range: formData.price_range || null,
        star_rating: formData.star_rating || null,
        amenities: formData.amenities,
        image_url: formData.image_url || null,
        distance_from_venue: formData.distance_from_venue ? parseFloat(formData.distance_from_venue) : null,
        display_order: formData.display_order,
        is_featured: formData.is_featured,
        is_published: formData.is_published
      };

      if (accommodation) {
        const { error } = await supabase
          .from('event_accommodations')
          .update(dataToSave)
          .eq('id', accommodation.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('event_accommodations')
          .insert([dataToSave]);

        if (error) throw error;
      }

      onSaved();
      onClose();
    } catch (error) {
      console.error('Error saving accommodation:', error);
      alert('Failed to save accommodation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            {accommodation ? 'Edit Accommodation' : 'Add Accommodation'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Accommodation Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="e.g., Seaside Hotel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type *
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                {ACCOMMODATION_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 mt-4">Location</h3>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addressSearch}
                  onChange={(e) => setAddressSearch(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="Enter address to search"
                />
                <button
                  type="button"
                  onClick={handleAddressSearch}
                  className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  Search
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="123 Main St, City, State ZIP"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="-33.8688"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Longitude
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="151.2093"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Distance from Venue (km)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.distance_from_venue}
                onChange={(e) => setFormData({ ...formData, distance_from_venue: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="2.5"
              />
            </div>

            {/* Details */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 mt-4">Details</h3>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Brief description of the accommodation..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Range
              </label>
              <input
                type="text"
                value={formData.price_range}
                onChange={(e) => setFormData({ ...formData, price_range: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="$100-$150 per night"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Star Rating
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormData({ ...formData, star_rating: star })}
                    className="transition-colors"
                  >
                    <Star
                      className={`w-8 h-8 ${star <= formData.star_rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Contact & Links */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 mt-4">Contact & Links</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="+61 2 1234 5678"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="info@hotel.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website URL
              </label>
              <input
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="https://www.hotel.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Booking URL
              </label>
              <input
                type="url"
                value={formData.booking_url}
                onChange={(e) => setFormData({ ...formData, booking_url: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="https://booking.com/hotel"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image URL
              </label>
              <input
                type="url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="https://example.com/image.jpg"
              />
            </div>

            {/* Amenities */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 mt-4">Amenities</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {AMENITIES_OPTIONS.map(amenity => (
                  <label
                    key={amenity.value}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.amenities.includes(amenity.value)
                        ? 'bg-cyan-50 border-cyan-500'
                        : 'border-gray-300 hover:border-cyan-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.amenities.includes(amenity.value)}
                      onChange={() => toggleAmenity(amenity.value)}
                      className="rounded text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-gray-700">{amenity.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 mt-4">Options</h3>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_featured}
                  onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-gray-700">Featured</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_published}
                  onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-gray-700">Published</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Order
              </label>
              <input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : accommodation ? 'Update Accommodation' : 'Add Accommodation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

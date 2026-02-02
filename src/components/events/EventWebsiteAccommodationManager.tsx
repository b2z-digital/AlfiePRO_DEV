import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, Star, ExternalLink, Eye, EyeOff, Award } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { AccommodationFormModal } from './AccommodationFormModal';

interface EventWebsiteAccommodationManagerProps {
  eventWebsiteId: string;
  venueCoordinates?: { lat: number; lng: number };
  darkMode?: boolean;
}

export const EventWebsiteAccommodationManager: React.FC<EventWebsiteAccommodationManagerProps> = ({
  eventWebsiteId,
  venueCoordinates,
  darkMode = false
}) => {
  const [accommodations, setAccommodations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedAccommodation, setSelectedAccommodation] = useState<any>(null);

  useEffect(() => {
    loadAccommodations();
  }, [eventWebsiteId]);

  const loadAccommodations = async () => {
    try {
      const { data, error } = await supabase
        .from('event_accommodations')
        .select('*')
        .eq('event_website_id', eventWebsiteId)
        .order('is_featured', { ascending: false })
        .order('display_order')
        .order('name');

      if (error) throw error;
      setAccommodations(data || []);
    } catch (error) {
      console.error('Error loading accommodations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (accommodation: any) => {
    setSelectedAccommodation(accommodation);
    setIsFormModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedAccommodation(null);
    setIsFormModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('event_accommodations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadAccommodations();
    } catch (error) {
      console.error('Error deleting accommodation:', error);
      alert('Failed to delete accommodation. Please try again.');
    }
  };

  const togglePublished = async (accommodation: any) => {
    try {
      const { error } = await supabase
        .from('event_accommodations')
        .update({ is_published: !accommodation.is_published })
        .eq('id', accommodation.id);

      if (error) throw error;
      loadAccommodations();
    } catch (error) {
      console.error('Error toggling published status:', error);
    }
  };

  const toggleFeatured = async (accommodation: any) => {
    try {
      const { error } = await supabase
        .from('event_accommodations')
        .update({ is_featured: !accommodation.is_featured })
        .eq('id', accommodation.id);

      if (error) throw error;
      loadAccommodations();
    } catch (error) {
      console.error('Error toggling featured status:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Loading accommodations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Accommodations</h2>
          <p className={`mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            Manage accommodation listings for your event website
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Accommodation
        </button>
      </div>

      {accommodations.length === 0 ? (
        <div className={`border-2 border-dashed rounded-lg p-12 text-center ${
          darkMode
            ? 'bg-slate-800 border-slate-600'
            : 'bg-white border-gray-300'
        }`}>
          <MapPin className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>No accommodations yet</h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            Add accommodation listings to help attendees find places to stay near your event
          </p>
          <button
            onClick={handleAdd}
            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Your First Accommodation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accommodations.map((accommodation) => (
            <div
              key={accommodation.id}
              className={`rounded-lg overflow-hidden hover:shadow-lg transition-shadow ${
                darkMode
                  ? 'bg-slate-800 border border-slate-700'
                  : 'bg-white border border-gray-200'
              }`}
            >
              {accommodation.image_url && (
                <div className={`h-48 overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                  <img
                    src={accommodation.image_url}
                    alt={accommodation.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{accommodation.name}</h3>
                    <p className={`text-sm capitalize ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>{accommodation.type.replace('_', ' ')}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {accommodation.is_featured && (
                      <Award className="w-5 h-5 text-yellow-500" title="Featured" />
                    )}
                    {!accommodation.is_published && (
                      <EyeOff className="w-5 h-5 text-gray-400" title="Unpublished" />
                    )}
                  </div>
                </div>

                {accommodation.star_rating > 0 && (
                  <div className="flex items-center gap-1 mb-2">
                    {[...Array(accommodation.star_rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                )}

                {accommodation.address && (
                  <p className={`text-sm mb-2 line-clamp-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    {accommodation.address}
                  </p>
                )}

                {accommodation.distance_from_venue && (
                  <p className={`text-sm mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    <MapPin className="w-4 h-4 inline mr-1" />
                    {accommodation.distance_from_venue} km from venue
                  </p>
                )}

                {accommodation.price_range && (
                  <p className="text-sm font-semibold text-green-600 mb-3">
                    {accommodation.price_range}
                  </p>
                )}

                {accommodation.amenities && Array.isArray(accommodation.amenities) && accommodation.amenities.length > 0 && (
                  <div className="mb-3">
                    <div className="flex flex-wrap gap-1">
                      {accommodation.amenities.slice(0, 3).map((amenity: string) => (
                        <span
                          key={amenity}
                          className={`text-xs px-2 py-1 rounded ${
                            darkMode
                              ? 'bg-slate-700 text-slate-300'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {amenity.replace('_', ' ')}
                        </span>
                      ))}
                      {accommodation.amenities.length > 3 && (
                        <span className={`text-xs px-2 py-1 rounded ${
                          darkMode
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          +{accommodation.amenities.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className={`flex items-center gap-2 pt-3 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  <button
                    onClick={() => togglePublished(accommodation)}
                    className={`flex-1 px-3 py-2 text-sm rounded transition-colors flex items-center justify-center gap-2 ${
                      accommodation.is_published
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                    title={accommodation.is_published ? 'Published' : 'Unpublished'}
                  >
                    {accommodation.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => toggleFeatured(accommodation)}
                    className={`flex-1 px-3 py-2 text-sm rounded transition-colors flex items-center justify-center gap-2 ${
                      accommodation.is_featured
                        ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                    title={accommodation.is_featured ? 'Featured' : 'Not Featured'}
                  >
                    <Award className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleEdit(accommodation)}
                    className="flex-1 px-3 py-2 text-sm bg-cyan-50 text-cyan-700 rounded hover:bg-cyan-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(accommodation.id, accommodation.name)}
                    className="flex-1 px-3 py-2 text-sm bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {(accommodation.website_url || accommodation.booking_url) && (
                  <div className="flex items-center gap-2 mt-2">
                    {accommodation.website_url && (
                      <a
                        href={accommodation.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-3 py-2 text-sm bg-gray-50 text-gray-700 rounded hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Website
                      </a>
                    )}
                    {accommodation.booking_url && (
                      <a
                        href={accommodation.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-3 py-2 text-sm bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Book
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AccommodationFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedAccommodation(null);
        }}
        eventWebsiteId={eventWebsiteId}
        accommodation={selectedAccommodation}
        onSaved={loadAccommodations}
        venueCoordinates={venueCoordinates}
      />
    </div>
  );
};

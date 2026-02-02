import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Navigation } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';

interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  facilities?: string[];
  image_url?: string;
  isDefault?: boolean;
}

const getClubInitials = (clubName: string): string => {
  return clubName.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 3);
};

export const PublicVenuesPage: React.FC = () => {
  const { clubId: paramClubId } = useParams<{ clubId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [club, setClub] = useState<Club | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [clubRes, venuesRes] = await Promise.all([
        supabase.from('clubs').select('*').eq('id', clubId).maybeSingle(),
        supabase.from('venues').select('*').eq('club_id', clubId)
      ]);

      if (clubRes.data) setClub(clubRes.data as any);
      if (venuesRes.data) {
        const sortedVenues = (venuesRes.data as any).sort((a: any, b: any) => {
          if (a.is_default && !b.is_default) return -1;
          if (!a.is_default && b.is_default) return 1;
          return a.name.localeCompare(b.name);
        });
        setVenues(sortedVenues);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGoogleMapsUrl = (venue: Venue) => {
    if (venue.latitude && venue.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`;
    }
    const address = `${venue.address}, ${venue.city}, ${venue.state} ${venue.postcode}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  };

  const clubInitials = club?.name ? getClubInitials(club.name) : '';
  const clubName = club?.name || 'Loading...';

  return (
    <div className="min-h-screen bg-white">
      <GoogleAnalytics measurementId={club?.google_analytics_id} />
      <PublicHeader club={club} activePage="venues" />

      <div className="pt-20">

      <div className="relative h-64 bg-gradient-to-br from-blue-900 to-blue-700">
        <div className="absolute inset-0 bg-black/30"></div>
        <div className="relative h-full flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-wider">VENUES</h1>
            <p className="text-gray-200 text-lg">Our racing locations and facilities</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading venues...</p>
          </div>
        ) : venues.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No venues have been added yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {venues.map((venue) => (
              <div key={venue.id} className="bg-white rounded-sm shadow-md hover:shadow-xl transition-shadow overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                  <div className="relative h-64 md:h-full bg-gray-100">
                    {(venue as any).image ? (
                      <img src={(venue as any).image} alt={venue.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                        <MapPin className="h-16 w-16 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4 tracking-wide uppercase">{venue.name}</h2>
                    {venue.description && <p className="text-gray-600 mb-6">{venue.description}</p>}
                    <div className="space-y-3 mb-6">
                      <div className="flex items-start">
                        <MapPin className="h-5 w-5 text-gray-400 mt-0.5 mr-3 flex-shrink-0" />
                        <div>
                          <p className="text-gray-900">{venue.address}</p>
                        </div>
                      </div>
                    </div>
                    <a href={getGoogleMapsUrl(venue)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-6 py-3 bg-gray-900 text-white text-sm font-semibold rounded hover:bg-gray-800 transition-colors uppercase tracking-wider">
                      <Navigation className="h-4 w-4 mr-2" />
                      Get Directions
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PublicFooter club={club} />
      </div>
    </div>
  );
};

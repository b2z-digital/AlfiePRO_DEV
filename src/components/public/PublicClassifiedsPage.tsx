import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Search, Tag, Filter, MapPin, Calendar } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { formatDate } from '../../utils/date';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';

interface Classified {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition?: string;
  location?: string;
  images?: string[];
  contact_name: string;
  contact_phone?: string;
  contact_email?: string;
  created_at: string;
  status: string;
  boat_class?: string;
}

const getClubInitials = (clubName: string): string => {
  return clubName.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 3);
};

const CATEGORIES = ['Boats', 'Parts', 'Accessories', 'Equipment', 'Other'];
const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'For Parts'];

export const PublicClassifiedsPage: React.FC = () => {
  const { clubId: paramClubId } = useParams<{ clubId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [club, setClub] = useState<Club | null>(null);
  const [classifieds, setClassifieds] = useState<Classified[]>([]);
  const [filteredClassifieds, setFilteredClassifieds] = useState<Classified[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId]);

  useEffect(() => {
    filterClassifieds();
  }, [classifieds, searchTerm, selectedCategory, selectedCondition]);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('Loading classifieds for club:', clubId);

      const [clubRes, classifiedsRes] = await Promise.all([
        supabase.from('clubs').select('*').eq('id', clubId).maybeSingle(),
        supabase.from('classifieds').select('*').eq('club_id', clubId).eq('status', 'active').order('created_at', { ascending: false })
      ]);

      console.log('Classifieds query result:', { data: classifiedsRes.data, error: classifiedsRes.error });

      if (clubRes.data) setClub(clubRes.data as any);
      if (classifiedsRes.data) {
        console.log(`Found ${classifiedsRes.data.length} classifieds`);
        setClassifieds(classifiedsRes.data as any);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterClassifieds = () => {
    let filtered = [...classifieds];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.boat_class?.toLowerCase().includes(term)
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    if (selectedCondition) {
      filtered = filtered.filter(item => item.condition === selectedCondition);
    }

    setFilteredClassifieds(filtered);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0
    }).format(price);
  };

  const clubInitials = club?.name ? getClubInitials(club.name) : '';
  const clubName = club?.name || 'Loading...';

  return (
    <div className="min-h-screen bg-white">
      <GoogleAnalytics measurementId={club?.google_analytics_id} />
      <PublicHeader club={club} activePage="classifieds" />

      <div className="pt-20">

      <div className="relative h-64 bg-gradient-to-br from-blue-900 to-blue-700">
        <div className="absolute inset-0 bg-black/30"></div>
        <div className="relative h-full flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-wider">CLASSIFIEDS</h1>
            <p className="text-gray-200 text-lg">Browse boats and equipment for sale</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="text" placeholder="Search classifieds..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center justify-center px-6 py-3 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
              <Filter className="h-5 w-5 mr-2" />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSelectedCategory(null)} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${selectedCategory === null ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>All</button>
                    {CATEGORIES.map(category => (
                      <button key={category} onClick={() => setSelectedCategory(category === selectedCategory ? null : category)} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${selectedCategory === category ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>{category}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Condition</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSelectedCondition(null)} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${selectedCondition === null ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>All</button>
                    {CONDITIONS.map(condition => (
                      <button key={condition} onClick={() => setSelectedCondition(condition === selectedCondition ? null : condition)} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${selectedCondition === condition ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>{condition}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-12">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading classifieds...</p>
          </div>
        ) : filteredClassifieds.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">{searchTerm || selectedCategory || selectedCondition ? 'No classifieds found matching your criteria.' : 'No classifieds available at the moment.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredClassifieds.map((item) => (
              <div key={item.id} className="bg-white rounded-sm overflow-hidden shadow-md hover:shadow-xl transition-shadow group">
                <div className="relative h-56 bg-gray-100">
                  {item.images && item.images.length > 0 ? (
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tag className="h-16 w-16 text-gray-300" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <span className="bg-white px-3 py-1 rounded text-sm font-semibold text-gray-900">{formatPrice(item.price)}</span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">{item.category}</span>
                    {item.condition && (
                      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">{item.condition}</span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 uppercase tracking-wide line-clamp-2 group-hover:text-gray-700 transition-colors">{item.title}</h3>
                  {item.boat_class && <p className="text-sm text-gray-600 mb-2">Class: {item.boat_class}</p>}
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{item.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    {item.location && (
                      <div className="flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        {item.location}
                      </div>
                    )}
                    <div className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDate(item.created_at)}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-900 mb-1">Contact: {item.contact_name}</p>
                    {item.contact_phone && (
                      <a href={`tel:${item.contact_phone}`} className="text-sm text-gray-600 hover:text-gray-900">{item.contact_phone}</a>
                    )}
                    {item.contact_email && (
                      <a href={`mailto:${item.contact_email}`} className="block text-sm text-gray-600 hover:text-gray-900">{item.contact_email}</a>
                    )}
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

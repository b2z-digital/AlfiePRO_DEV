import React, { useState, useEffect } from 'react';
import { MapPin, Search, X, Plus, Building, Loader2 } from 'lucide-react';
import { Venue } from '../../types/venue';
import { getDiscoverableVenues, linkExistingVenue } from '../../utils/venueStorage';

interface AddExistingVenueModalProps {
  clubId: string;
  onClose: () => void;
  onVenueLinked: () => void;
}

export const AddExistingVenueModal: React.FC<AddExistingVenueModalProps> = ({
  clubId,
  onClose,
  onVenueLinked
}) => {
  const [search, setSearch] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    fetchVenues();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVenues();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchVenues = async () => {
    setLoading(true);
    const results = await getDiscoverableVenues(clubId, search || undefined);
    setVenues(results);
    setLoading(false);
  };

  const handleLink = async (venue: Venue) => {
    setLinking(venue.id);
    const success = await linkExistingVenue(venue.id, clubId);
    if (success) {
      onVenueLinked();
    }
    setLinking(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <MapPin className="text-blue-400" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-100">
                  Add Existing Venue
                </h3>
                <p className="text-sm text-slate-400">
                  Browse venues already in the system
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={20} className="text-slate-400" />
            </button>
          </div>

          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or address..."
              className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-blue-400 animate-spin" />
              <span className="ml-3 text-slate-400">Searching venues...</span>
            </div>
          ) : venues.length === 0 ? (
            <div className="text-center py-12">
              <MapPin size={48} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No venues found</p>
              <p className="text-sm text-slate-500 mt-1">
                {search
                  ? 'Try a different search term'
                  : 'No other venues are available to add'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {venues.map((venue) => (
                <div
                  key={venue.id}
                  className="group p-4 rounded-xl border border-slate-700/50 bg-slate-700/20 hover:bg-slate-700/40 hover:border-blue-500/30 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-slate-700">
                      {venue.image ? (
                        <img
                          src={venue.image}
                          alt={venue.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MapPin size={24} className="text-slate-500" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-100 mb-1">
                        {venue.name}
                      </h4>
                      <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-1">
                        <MapPin size={14} className="flex-shrink-0" />
                        <span className="truncate">{venue.address}</span>
                      </div>
                      {(venue as any).clubs && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Building size={12} className="flex-shrink-0" />
                          <span>
                            Managed by {(venue as any).clubs.abbreviation || (venue as any).clubs.name}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleLink(venue)}
                      disabled={linking === venue.id}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium transition-colors flex-shrink-0"
                    >
                      {linking === venue.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Plus size={16} />
                      )}
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-700/50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Trophy } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';

interface RaceResult {
  position: number;
  skipperName: string;
  sailNumber: string;
  points: number;
}

interface Race {
  raceNumber: number;
  results: RaceResult[];
}

interface EventData {
  id: string;
  name: string;
  date: string;
  venue: string;
  race_class: string;
  races: Race[];
}

export const PublicResultsPage: React.FC = () => {
  const { clubId: paramClubId, eventId } = useParams<{ clubId: string; eventId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clubName, setClubName] = useState<string>('');
  const [isSeries, setIsSeries] = useState(false);

  useEffect(() => {
    loadEventData();
  }, [eventId]);

  const loadEventData = async () => {
    if (!eventId || !clubId) return;

    try {
      setLoading(true);

      // Load club name
      const { data: clubData } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .maybeSingle();

      if (clubData) {
        setClubName(clubData.name);
      }

      // Try to load as quick race first
      const { data: quickRaceData } = await supabase
        .from('quick_races')
        .select('id, name, date, venue, race_class, races')
        .eq('id', eventId)
        .maybeSingle();

      if (quickRaceData) {
        setEvent(quickRaceData as EventData);
        setIsSeries(false);
      } else {
        // Try to load as series
        const { data: seriesData } = await supabase
          .from('race_series')
          .select('id, series_name, created_at, race_class, results')
          .eq('id', eventId)
          .maybeSingle();

        if (seriesData) {
          // Convert series results format to match event format
          const seriesResults = seriesData.results || [];
          const races = seriesResults.length > 0 ? [{
            raceNumber: 1,
            results: seriesResults
          }] : [];

          setEvent({
            id: seriesData.id,
            name: seriesData.series_name,
            date: seriesData.created_at,
            venue: '',
            race_class: seriesData.race_class || '',
            races: races
          } as EventData);
          setIsSeries(true);
        }
      }
    } catch (error) {
      console.error('Error loading event data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading results...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Event not found</p>
          <Link
            to={`/club/${clubId}/public`}
            className="text-blue-600 hover:underline"
          >
            Back to Homepage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GoogleAnalytics measurementId={null} />
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Link
            to={`/club/${clubId}/public`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {clubName || 'Club Homepage'}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(event.date)}</span>
            </div>
            {event.venue && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{event.venue}</span>
              </div>
            )}
            {event.race_class && (
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                <span>Class: {event.race_class}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Results */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {event.races && event.races.length > 0 ? (
          <div className="space-y-8">
            {event.races.map((race, index) => (
              <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-900 text-white px-6 py-4">
                  <h2 className="text-xl font-semibold">
                    {isSeries ? 'Series Standings' : `Race ${race.raceNumber}`}
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Position
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Skipper
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Sail Number
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Points
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {race.results && race.results.length > 0 ? (
                        race.results.map((result, resultIndex) => (
                          <tr key={resultIndex} className={result.position === 1 ? 'bg-yellow-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {result.position === 1 && (
                                  <Trophy className="w-4 h-4 text-yellow-600" />
                                )}
                                <span className="text-sm font-medium text-gray-900">
                                  {result.position}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{result.skipperName}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">{result.sailNumber}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{result.points}</div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                            No results recorded for this race
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">No race results available</p>
          </div>
        )}
      </main>
    </div>
  );
};

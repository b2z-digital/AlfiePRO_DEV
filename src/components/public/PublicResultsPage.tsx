import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Trophy } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { formatDate } from '../../utils/date';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { EventResultsDisplay } from '../EventResultsDisplay';
import { RaceEvent } from '../../types/race';

export const PublicResultsPage: React.FC = () => {
  const { clubId: paramClubId, eventId } = useParams<{ clubId: string; eventId: string }>();
  const { clubId: contextClubId, buildPublicUrl } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [searchParams] = useSearchParams();
  const roundParam = searchParams.get('round');
  const [club, setClub] = useState<Club | null>(null);
  const [raceEvent, setRaceEvent] = useState<RaceEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [seriesName, setSeriesName] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadEventData();
  }, [eventId, roundParam, clubId]);

  const loadEventData = async () => {
    if (!eventId || !clubId) return;

    try {
      setLoading(true);

      const { data: clubData } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .maybeSingle();

      if (clubData) {
        setClub(clubData as any);
      }

      const clubDisplayName = clubData?.name || '';

      const quickRaceEvent = await loadQuickRace(eventId, clubDisplayName);
      if (quickRaceEvent) {
        setRaceEvent(quickRaceEvent);
        return;
      }

      const roundEvent = await loadSeriesRound(eventId, clubDisplayName);
      if (roundEvent) {
        setRaceEvent(roundEvent);
        return;
      }

      if (roundParam !== null) {
        const seriesRoundEvent = await loadSeriesRoundByIndex(eventId, parseInt(roundParam), clubDisplayName);
        if (seriesRoundEvent) {
          setRaceEvent(seriesRoundEvent);
          return;
        }
      }
    } catch (error) {
      console.error('Error loading event data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQuickRace = async (id: string, clubDisplayName: string): Promise<RaceEvent | null> => {
    const { data } = await supabase
      .from('quick_races')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!data) return null;

    return {
      id: data.id,
      eventName: data.event_name || undefined,
      clubName: clubDisplayName,
      date: data.race_date,
      venue: data.race_venue || '',
      raceClass: data.race_class || '',
      raceFormat: data.race_format || 'handicap',
      skippers: data.skippers || [],
      raceResults: data.race_results || [],
      lastCompletedRace: data.last_completed_race || 0,
      hasDeterminedInitialHcaps: data.has_determined_initial_hcaps || false,
      isManualHandicaps: data.is_manual_handicaps || false,
      completed: data.completed || false,
      numRaces: data.num_races || undefined,
      dropRules: data.drop_rules || undefined,
      clubId: data.club_id || clubId,
      heatManagement: data.heat_management || undefined,
      multiDay: data.multi_day || false,
      dayResults: data.day_results || {},
      show_flag: data.show_flag ?? true,
      show_country: data.show_country ?? true,
      show_club_state: data.show_club_state ?? false,
      show_category: data.show_category ?? false,
    } as RaceEvent;
  };

  const loadSeriesRound = async (id: string, clubDisplayName: string): Promise<RaceEvent | null> => {
    const { data } = await supabase
      .from('race_series_rounds')
      .select('*, race_series!inner(series_name)')
      .eq('id', id)
      .maybeSingle();

    if (!data) return null;

    const sName = (data as any).race_series?.series_name || '';
    setSeriesName(sName);

    return {
      id: data.id,
      eventName: `${data.round_name} - ${sName}`,
      clubName: clubDisplayName,
      date: data.date,
      venue: data.venue || '',
      raceClass: data.race_class || '',
      raceFormat: data.race_format || 'handicap',
      skippers: data.skippers || [],
      raceResults: data.race_results || [],
      lastCompletedRace: data.last_completed_race || 0,
      hasDeterminedInitialHcaps: data.has_determined_initial_hcaps || false,
      isManualHandicaps: data.is_manual_handicaps || false,
      completed: data.completed || false,
      numRaces: data.num_races || undefined,
      dropRules: data.drop_rules || undefined,
      clubId: data.club_id || clubId,
      heatManagement: data.heat_management || undefined,
      multiDay: data.multi_day || false,
      dayResults: data.day_results || {},
      isSeriesEvent: true,
      seriesId: data.series_id,
      roundName: data.round_name,
    } as RaceEvent;
  };

  const loadSeriesRoundByIndex = async (seriesId: string, roundIndex: number, clubDisplayName: string): Promise<RaceEvent | null> => {
    const { data } = await supabase
      .from('race_series_rounds')
      .select('*, race_series!inner(series_name)')
      .eq('series_id', seriesId)
      .eq('round_index', roundIndex)
      .maybeSingle();

    if (!data) return null;

    const sName = (data as any).race_series?.series_name || '';
    setSeriesName(sName);

    return {
      id: data.id,
      eventName: `${data.round_name} - ${sName}`,
      clubName: clubDisplayName,
      date: data.date,
      venue: data.venue || '',
      raceClass: data.race_class || '',
      raceFormat: data.race_format || 'handicap',
      skippers: data.skippers || [],
      raceResults: data.race_results || [],
      lastCompletedRace: data.last_completed_race || 0,
      hasDeterminedInitialHcaps: data.has_determined_initial_hcaps || false,
      isManualHandicaps: data.is_manual_handicaps || false,
      completed: data.completed || false,
      numRaces: data.num_races || undefined,
      dropRules: data.drop_rules || undefined,
      clubId: data.club_id || clubId,
      heatManagement: data.heat_management || undefined,
      multiDay: data.multi_day || false,
      dayResults: data.day_results || {},
      isSeriesEvent: true,
      seriesId: data.series_id,
      roundName: data.round_name,
    } as RaceEvent;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading results...</div>
      </div>
    );
  }

  if (!raceEvent) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PublicHeader club={club} activePage="results" />
        <div className="pt-24 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Event not found</p>
            <Link
              to={buildPublicUrl('/')}
              className="text-blue-600 hover:underline"
            >
              Back to Homepage
            </Link>
          </div>
        </div>
        <PublicFooter clubId={clubId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GoogleAnalytics measurementId={null} />
      <PublicHeader club={club} activePage="results" />

      <div className="pt-24">
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Link
              to={buildPublicUrl('/results')}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              All Results
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              {raceEvent.eventName || 'Race Results'}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-gray-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(raceEvent.date)}</span>
              </div>
              {raceEvent.venue && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{raceEvent.venue}</span>
                </div>
              )}
              {raceEvent.raceClass && (
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  <span>Class: {raceEvent.raceClass}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 py-8">
          <EventResultsDisplay
            event={raceEvent}
            darkMode={true}
            seriesName={seriesName}
          />
        </main>
      </div>

      <PublicFooter clubId={clubId} />
    </div>
  );
};

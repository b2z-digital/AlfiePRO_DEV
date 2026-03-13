import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Trophy } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { EventResultsDisplay } from './EventResultsDisplay';
import { RaceEvent } from '../types/race';
import { Skipper } from '../types';

interface CompetitorResult {
  position: number | null;
  name: string;
  club: string;
  sailNo: string;
  boatDesign: string;
  nett: number | null;
  total: number | null;
  races: (string | null)[];
  isDiscard: boolean[];
}

interface ExternalResultEvent {
  id: string;
  event_name: string;
  event_date: string | null;
  event_end_date: string | null;
  venue: string | null;
  boat_class_raw: string | null;
  boat_class_mapped: string | null;
  competitor_count: number;
  race_count: number;
  display_category: 'national' | 'world';
  source_url: string;
  results_json: CompetitorResult[] | null;
  last_scraped_at: string | null;
}

interface ExternalResultsDisplayProps {
  event: ExternalResultEvent;
  darkMode?: boolean;
  isExportMode?: boolean;
}

const parseScore = (raw: string | null): { position: number | null; letterScore: string | undefined } => {
  if (raw === null || raw === undefined || raw === '') return { position: null, letterScore: undefined };
  const trimmed = String(raw).trim();
  const num = parseFloat(trimmed);
  if (!isNaN(num) && isFinite(num)) {
    return { position: Math.round(num), letterScore: undefined };
  }
  const upper = trimmed.toUpperCase().replace(/[^A-Z]/g, '');
  if (upper === 'DNC' || upper === 'DNS' || upper === 'DNF' || upper === 'OCS' ||
      upper === 'BFD' || upper === 'SCP' || upper === 'DNE' || upper === 'RDG' ||
      upper === 'DGM' || upper === 'DPI') {
    return { position: null, letterScore: upper };
  }
  if (upper === 'RET') return { position: null, letterScore: 'DNF' };
  if (upper === 'DSQ' || upper === 'UFD') return { position: null, letterScore: 'BFD' };
  return { position: null, letterScore: 'DNC' };
};

const buildRaceEvent = (externalEvent: ExternalResultEvent, competitors: CompetitorResult[]): RaceEvent => {
  const skippers: Skipper[] = competitors.map(c => ({
    name: c.name || '',
    sailNo: c.sailNo || '',
    club: c.club || '',
    boatModel: c.boatDesign || '',
    hull: c.boatDesign || '',
    startHcap: 0,
  }));

  const raceCount = Math.max(...competitors.map(c => c.races?.length || 0), 0);
  const raceResults: any[] = [];

  competitors.forEach((competitor, skipperIndex) => {
    for (let raceIdx = 0; raceIdx < raceCount; raceIdx++) {
      const rawScore = competitor.races?.[raceIdx] ?? null;
      const { position, letterScore } = parseScore(rawScore);
      raceResults.push({
        race: raceIdx + 1,
        skipperIndex,
        position: position,
        letterScore: letterScore ?? (position === null ? 'DNC' : undefined),
      });
    }
  });

  const boatClass = (externalEvent.boat_class_mapped || externalEvent.boat_class_raw || 'Unknown') as any;

  return {
    id: externalEvent.id,
    eventName: externalEvent.event_name,
    clubName: externalEvent.venue || '',
    date: externalEvent.event_date || new Date().toISOString().split('T')[0],
    endDate: externalEvent.event_end_date || undefined,
    venue: externalEvent.venue || '',
    raceClass: boatClass,
    raceFormat: 'Scratch' as any,
    skippers,
    raceResults,
    lastCompletedRace: raceCount,
    completed: true,
    dropRules: [],
    eventLevel: 'national',
  };
};

const ExternalResultsDisplay: React.FC<ExternalResultsDisplayProps> = ({
  event,
  darkMode = true,
  isExportMode = false,
}) => {
  const [competitors, setCompetitors] = useState<CompetitorResult[]>(
    Array.isArray(event.results_json) && event.results_json.length > 0 ? event.results_json : []
  );
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const needsFetch = competitors.length === 0;

  useEffect(() => {
    setCompetitors(
      Array.isArray(event.results_json) && event.results_json.length > 0 ? event.results_json : []
    );
    setFetchError(null);
  }, [event.id]);

  useEffect(() => {
    if (needsFetch) {
      fetchResults();
    }
  }, [event.id, needsFetch]);

  const fetchResults = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-external-results`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ event_row_id: event.id }),
          signal: AbortSignal.timeout(30000),
        }
      );

      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || `HTTP ${res.status}`);

      if (Array.isArray(result.competitors) && result.competitors.length > 0) {
        setCompetitors(result.competitors);
      } else {
        setFetchError('No results found on the source page yet.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load results';
      setFetchError(msg.includes('timeout') ? 'Timed out loading results. Try again.' : msg);
    } finally {
      setFetching(false);
    }
  };

  const textSecondary = darkMode ? 'text-slate-400' : 'text-gray-500';

  if (fetching) {
    return (
      <div className={`py-20 text-center ${textSecondary}`}>
        <Loader2 size={36} className="mx-auto mb-3 animate-spin opacity-60" />
        <p className="text-sm">Loading results from source...</p>
      </div>
    );
  }

  if (competitors.length === 0) {
    return (
      <div className={`py-16 text-center ${textSecondary}`}>
        <Trophy size={36} className="mx-auto mb-3 opacity-30" />
        {fetchError ? (
          <>
            <p className="text-sm mb-4">{fetchError}</p>
            <button
              type="button"
              onClick={fetchResults}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
            >
              <RefreshCw size={14} />
              Try again
            </button>
          </>
        ) : (
          <p>No results data available for this event.</p>
        )}
      </div>
    );
  }

  const raceEvent = buildRaceEvent(event, competitors);

  return (
    <EventResultsDisplay
      event={raceEvent}
      darkMode={darkMode}
      isExportMode={isExportMode}
    />
  );
};

export default ExternalResultsDisplay;

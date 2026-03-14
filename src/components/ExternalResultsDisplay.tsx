import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Trophy, Globe, Calendar, MapPin, ExternalLink } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { formatDate } from '../utils/date';

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
  display_category: string;
  source_url: string;
  results_json: any[] | null;
  last_scraped_at: string | null;
}

interface ExternalResultsDisplayProps {
  event: ExternalResultEvent;
  darkMode?: boolean;
  isExportMode?: boolean;
}

const ExternalResultsDisplay: React.FC<ExternalResultsDisplayProps> = ({
  event,
  darkMode = true,
  isExportMode = false,
}) => {
  const [rawTableHtml, setRawTableHtml] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [competitorCount, setCompetitorCount] = useState(event.competitor_count || 0);
  const [raceCount, setRaceCount] = useState(event.race_count || 0);
  const [eventDate, setEventDate] = useState(event.event_date);
  const [eventEndDate, setEventEndDate] = useState(event.event_end_date);
  const [venue, setVenue] = useState(event.venue);

  useEffect(() => {
    setRawTableHtml(null);
    setFetchError(null);
    setCompetitorCount(event.competitor_count || 0);
    setRaceCount(event.race_count || 0);
    setEventDate(event.event_date);
    setEventEndDate(event.event_end_date);
    setVenue(event.venue);
    fetchResults();
  }, [event.id]);

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

      if (result.raw_table_html) {
        setRawTableHtml(result.raw_table_html);
        if (result.competitor_count) setCompetitorCount(result.competitor_count);
        if (result.race_count) setRaceCount(result.race_count);
        if (result.event_date) setEventDate(result.event_date);
        if (result.event_end_date) setEventEndDate(result.event_end_date);
        if (result.venue) setVenue(result.venue);
      } else {
        setFetchError('No results table found on the source page yet.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load results';
      setFetchError(msg.includes('timeout') ? 'Timed out loading results. Try again.' : msg);
    } finally {
      setFetching(false);
    }
  };

  const formatEventDate = () => {
    if (!eventDate) return null;
    if (eventEndDate && eventEndDate !== eventDate) {
      const start = new Date(eventDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      const end = new Date(eventEndDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${start} – ${end}`;
    }
    return formatDate(eventDate);
  };

  const isState = event.display_category?.startsWith('state_');
  const accentColor = event.display_category === 'world' ? 'text-amber-400' : isState ? 'text-green-400' : 'text-blue-400';
  const accentBg = event.display_category === 'world' ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' : isState ? 'bg-green-500/20 border-green-500/30 text-green-300' : 'bg-blue-500/20 border-blue-500/30 text-blue-300';
  const categoryLabel = event.display_category === 'world' ? 'World Event' : isState ? 'State Event' : 'National Event';

  return (
    <div className="space-y-0 rounded-xl overflow-hidden border border-slate-700/50">
      {/* Header */}
      <div className="bg-slate-900/80 px-6 py-5 border-b border-slate-700/50">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${accentBg}`}>
            <Globe size={10} />
            {categoryLabel}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-400 border border-slate-600/30">
            External Results
          </span>
          {(event.boat_class_mapped || event.boat_class_raw) && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {event.boat_class_mapped || event.boat_class_raw}
            </span>
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-3">
          {event.event_name}
        </h2>

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
          {formatEventDate() && (
            <span className="flex items-center gap-1.5">
              <Calendar size={13} />
              {formatEventDate()}
            </span>
          )}
          {venue && (
            <span className="flex items-center gap-1.5">
              <MapPin size={13} />
              {venue}
            </span>
          )}
          {competitorCount > 0 && (
            <span className="flex items-center gap-1.5">
              <Trophy size={13} />
              {competitorCount} competitors · {raceCount} races
            </span>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="bg-slate-800/40">
        {fetching ? (
          <div className="py-20 text-center text-slate-400">
            <Loader2 size={36} className="mx-auto mb-3 animate-spin opacity-60" />
            <p className="text-sm">Loading results from source...</p>
          </div>
        ) : rawTableHtml ? (
          <div className="overflow-x-auto external-results-table">
            <style>{`
              .external-results-table table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
                color: #e2e8f0;
              }
              .external-results-table th {
                background: #1e293b;
                color: #94a3b8;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 10px 12px;
                text-align: left;
                border-bottom: 1px solid rgba(148,163,184,0.15);
                white-space: nowrap;
              }
              .external-results-table td {
                padding: 9px 12px;
                border-bottom: 1px solid rgba(148,163,184,0.08);
                white-space: nowrap;
                color: #cbd5e1;
              }
              .external-results-table tr:nth-child(even) td {
                background: rgba(30,41,59,0.4);
              }
              .external-results-table tr:hover td {
                background: inherit;
              }
              .external-results-table td:first-child,
              .external-results-table th:first-child {
                font-weight: 700;
                color: #f8fafc;
                min-width: 40px;
              }
              .external-results-table td strike,
              .external-results-table td s {
                color: #64748b;
                text-decoration: line-through;
              }
              .external-results-table td b,
              .external-results-table td strong {
                color: #f1f5f9;
                font-weight: 700;
              }
              .external-results-table a {
                color: #60a5fa;
                text-decoration: none;
              }
              .external-results-table a:hover {
                text-decoration: underline;
              }
            `}</style>
            <div dangerouslySetInnerHTML={{ __html: rawTableHtml }} />
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400">
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
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-700/30 flex items-center justify-between bg-slate-900/60">
        <p className="text-xs text-slate-500">
          Source:{' '}
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
          >
            {event.source_url}
            <ExternalLink size={10} />
          </a>
        </p>
        {event.last_scraped_at && (
          <p className="text-xs text-slate-500">
            Updated {new Date(event.last_scraped_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
};

export default ExternalResultsDisplay;

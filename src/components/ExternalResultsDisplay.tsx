import React from 'react';
import { Trophy, MapPin, Calendar, Users, Globe, Tag } from 'lucide-react';
import { formatDate } from '../utils/date';

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

const ExternalResultsDisplay: React.FC<ExternalResultsDisplayProps> = ({
  event,
  darkMode = true,
  isExportMode = false,
}) => {
  const competitors: CompetitorResult[] = Array.isArray(event.results_json) ? event.results_json : [];

  // Determine race count from data
  const raceCount = competitors.length > 0
    ? Math.max(...competitors.map(c => c.races?.length || 0), event.race_count || 0)
    : (event.race_count || 0);

  const raceLabels = Array.from({ length: raceCount }, (_, i) => `R${i + 1}`);

  const bg = isExportMode ? 'bg-white' : darkMode ? 'bg-slate-800/50' : 'bg-white';
  const border = isExportMode ? 'border-gray-200' : darkMode ? 'border-slate-700/50' : 'border-gray-200';
  const textPrimary = isExportMode ? 'text-gray-900' : darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isExportMode ? 'text-gray-500' : darkMode ? 'text-slate-400' : 'text-gray-500';
  const tableBg = isExportMode ? 'bg-white' : darkMode ? 'bg-slate-900/50' : 'bg-gray-50';
  const tableHeaderBg = isExportMode ? 'bg-gray-100' : darkMode ? 'bg-slate-800' : 'bg-gray-100';
  const tableRowHover = isExportMode ? '' : darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-gray-50';
  const tableRowAlt = isExportMode ? 'bg-gray-50/50' : darkMode ? 'bg-slate-800/20' : 'bg-gray-50/50';
  const tableBorder = isExportMode ? 'border-gray-200' : darkMode ? 'border-slate-700/30' : 'border-gray-200';

  const formatEventDate = () => {
    if (!event.event_date) return null;
    if (event.event_end_date && event.event_end_date !== event.event_date) {
      const start = new Date(event.event_date);
      const end = new Date(event.event_end_date);
      const startStr = start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      const endStr = end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startStr} – ${endStr}`;
    }
    return formatDate(event.event_date);
  };

  return (
    <div className={`${bg} rounded-xl border ${border} overflow-hidden`}>
      {/* Header */}
      <div className={`${isExportMode ? 'bg-gray-900' : darkMode ? 'bg-slate-900/70' : 'bg-gray-900'} px-6 py-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            {/* Source badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                event.display_category === 'world'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                <Globe size={10} />
                {event.display_category === 'world' ? 'World Event' : 'National Event'}
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-400 border border-slate-600/30">
                External Results
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              {event.event_name}
            </h2>

            <div className="flex flex-wrap items-center gap-4 mt-3">
              {formatEventDate() && (
                <div className="flex items-center gap-1.5 text-sm text-slate-300">
                  <Calendar size={14} className="text-slate-400" />
                  {formatEventDate()}
                </div>
              )}
              {event.venue && (
                <div className="flex items-center gap-1.5 text-sm text-slate-300">
                  <MapPin size={14} className="text-slate-400" />
                  {event.venue}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-slate-300">
                <Users size={14} className="text-slate-400" />
                {competitors.length} competitors
              </div>
              {raceCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-slate-300">
                  <Trophy size={14} className="text-slate-400" />
                  {raceCount} races
                </div>
              )}
            </div>
          </div>

          {(event.boat_class_mapped || event.boat_class_raw) && (
            <div className="flex-shrink-0 text-right">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30">
                <Tag size={14} className="text-blue-400" />
                <span className="text-blue-300 font-semibold text-sm">
                  {event.boat_class_mapped || event.boat_class_raw}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results Table */}
      {competitors.length > 0 ? (
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${tableBg}`}>
            <thead>
              <tr className={`${tableHeaderBg} border-b ${tableBorder}`}>
                <th className={`px-3 py-3 text-left text-xs font-semibold ${textSecondary} uppercase tracking-wider w-12`}>
                  Pos
                </th>
                <th className={`px-3 py-3 text-left text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>
                  Name / Club
                </th>
                <th className={`px-3 py-3 text-left text-xs font-semibold ${textSecondary} uppercase tracking-wider`}>
                  Sail No
                </th>
                <th className={`px-3 py-3 text-left text-xs font-semibold ${textSecondary} uppercase tracking-wider hidden md:table-cell`}>
                  Design
                </th>
                <th className={`px-3 py-3 text-center text-xs font-semibold ${textSecondary} uppercase tracking-wider w-16`}>
                  Nett
                </th>
                <th className={`px-3 py-3 text-center text-xs font-semibold ${textSecondary} uppercase tracking-wider w-16 hidden sm:table-cell`}>
                  Total
                </th>
                {raceLabels.map(label => (
                  <th key={label} className={`px-2 py-3 text-center text-xs font-semibold ${textSecondary} uppercase tracking-wider w-12`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${tableBorder}`}>
              {competitors.map((competitor, idx) => {
                const isTop3 = (competitor.position || 99) <= 3;
                const posColors = ['text-amber-400', 'text-slate-300', 'text-amber-600'];
                const posColor = isTop3 ? posColors[(competitor.position || 1) - 1] : textSecondary;

                return (
                  <tr
                    key={idx}
                    className={`${idx % 2 === 0 ? '' : tableRowAlt} ${tableRowHover} transition-colors`}
                  >
                    {/* Position */}
                    <td className="px-3 py-3 text-center">
                      <span className={`text-sm font-bold ${posColor}`}>
                        {competitor.position ?? '—'}
                      </span>
                      {isTop3 && !isExportMode && (
                        <div className={`w-1 h-1 rounded-full mx-auto mt-0.5 ${
                          competitor.position === 1 ? 'bg-amber-400' :
                          competitor.position === 2 ? 'bg-slate-300' : 'bg-amber-600'
                        }`} />
                      )}
                    </td>

                    {/* Name / Club */}
                    <td className="px-3 py-3">
                      <div className={`font-medium ${textPrimary} text-sm`}>{competitor.name || '—'}</div>
                      {competitor.club && (
                        <div className={`text-xs ${textSecondary} mt-0.5`}>{competitor.club}</div>
                      )}
                    </td>

                    {/* Sail No */}
                    <td className="px-3 py-3">
                      <span className={`text-sm font-mono ${textPrimary}`}>{competitor.sailNo || '—'}</span>
                    </td>

                    {/* Design */}
                    <td className={`px-3 py-3 hidden md:table-cell`}>
                      <span className={`text-sm ${textSecondary}`}>{competitor.boatDesign || '—'}</span>
                    </td>

                    {/* Nett */}
                    <td className="px-3 py-3 text-center">
                      <span className={`text-sm font-bold ${
                        isTop3 ? posColor : textPrimary
                      }`}>
                        {competitor.nett !== null ? competitor.nett : '—'}
                      </span>
                    </td>

                    {/* Total */}
                    <td className={`px-3 py-3 text-center hidden sm:table-cell`}>
                      <span className={`text-sm ${textSecondary}`}>
                        {competitor.total !== null ? competitor.total : '—'}
                      </span>
                    </td>

                    {/* Race scores */}
                    {raceLabels.map((_, raceIdx) => {
                      const score = competitor.races?.[raceIdx] ?? null;
                      const isDiscard = competitor.isDiscard?.[raceIdx] ?? false;
                      return (
                        <td key={raceIdx} className="px-2 py-3 text-center">
                          {score !== null ? (
                            <span className={`text-xs font-mono ${
                              isDiscard
                                ? `${textSecondary} line-through`
                                : textPrimary
                            }`}>
                              {score}
                            </span>
                          ) : (
                            <span className={`text-xs ${textSecondary}`}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`py-12 text-center ${textSecondary}`}>
          <Trophy size={36} className="mx-auto mb-3 opacity-30" />
          <p>No results data available for this event.</p>
        </div>
      )}

      {/* Footer */}
      <div className={`px-5 py-3 border-t ${tableBorder} flex items-center justify-between`}>
        <p className={`text-xs ${textSecondary}`}>
          Source:{' '}
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {event.source_url}
          </a>
        </p>
        {event.last_scraped_at && (
          <p className={`text-xs ${textSecondary}`}>
            Updated {new Date(event.last_scraped_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
};

export default ExternalResultsDisplay;

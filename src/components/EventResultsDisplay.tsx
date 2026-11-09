import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Award, ChevronDown, ChevronUp, FileText, SquarePen as Edit2, Trash2, Settings } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { RaceEvent } from '../types/race';
import { formatDate } from '../utils/date';
import { LetterScore } from '../types';
import { HeatDesignation } from '../types/heat';
import { getLetterScorePointsForRace, compareWithCountback, resolveCustomPoints } from '../utils/scratchCalculations';
import { calculateSHRSDiscards } from '../utils/shrsHeatSystem';
import { computeEventResults } from '../utils/eventResultsEngine';
import { SkipperPerformanceInsights } from './SkipperPerformanceInsights';
import { RaceReportModal } from './RaceReportModal';
import { ConfirmationModal } from './ConfirmationModal';
import { getCountryName, getCountryFlag } from '../utils/countryFlags';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/results-export.css';

interface EventResultsDisplayProps {
  event: RaceEvent;
  darkMode?: boolean;
  isExportMode?: boolean;
  showHandicapsProp?: boolean;
  seriesName?: string;
  onEventUpdate?: (event: RaceEvent) => void;
  clubLogoUrl?: string;
  clubAbbreviation?: string;
  onShowHandicapsChange?: (show: boolean) => void;
}

export const EventResultsDisplay: React.FC<EventResultsDisplayProps> = ({
  event,
  darkMode = true,
  isExportMode = false,
  showHandicapsProp,
  seriesName,
  onEventUpdate,
  onShowHandicapsChange,
  clubLogoUrl,
  clubAbbreviation
}) => {
  const [expandedSkipper, setExpandedSkipper] = useState<number | null>(null);
  const [raceReport, setRaceReport] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [enrichedEvent, setEnrichedEvent] = useState<RaceEvent>(event);
  const [rosteredCROName, setRosteredCROName] = useState<string | null>(null);
  const [scratchWinBonus, setScratchWinBonus] = useState<number | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHandicaps, setShowHandicapsState] = useState(showHandicapsProp !== undefined ? showHandicapsProp : true);
  const setShowHandicaps = (val: boolean) => {
    setShowHandicapsState(val);
    onShowHandicapsChange?.(val);
  };

  useEffect(() => {
    if (event.proMemberName || !event.clubId || !event.date) return;
    const fetchRosteredCRO = async () => {
      try {
        const eventDate = event.date?.split('T')[0];
        if (!eventDate) return;
        const { data } = await supabase
          .from('pro_roster_rounds')
          .select('id, roster_id, pro_roster_assignments(member_id, status)')
          .eq('date', eventDate)
          .limit(5);
        if (!data || data.length === 0) return;
        const rosterIds = [...new Set(data.map((r: any) => r.roster_id))];
        const { data: rosters } = await supabase
          .from('pro_rosters')
          .select('id, club_id')
          .in('id', rosterIds)
          .eq('club_id', event.clubId!);
        if (!rosters || rosters.length === 0) return;
        const clubRosterIds = new Set(rosters.map((r: any) => r.id));
        for (const round of data as any[]) {
          if (!clubRosterIds.has(round.roster_id)) continue;
          const assignments = round.pro_roster_assignments || [];
          const active = assignments.find((a: any) => a.status === 'assigned' || a.status === 'confirmed');
          if (active) {
            const { data: member } = await supabase
              .from('members')
              .select('first_name, last_name')
              .eq('id', active.member_id)
              .maybeSingle();
            if (member) {
              const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ');
              if (fullName) {
                setRosteredCROName(fullName);
                return;
              }
            }
          }
        }
      } catch (err) {
        // Silently fail - CRO name is optional
      }
    };
    fetchRosteredCRO();
  }, [event.proMemberName, event.clubId, event.date]);

  useEffect(() => {
    if (event.raceFormat !== 'handicap' || !event.clubId) return;
    const loadRulesetConfig = async () => {
      try {
        const { data: club } = await supabase
          .from('clubs')
          .select('default_handicap_ruleset_id')
          .eq('id', event.clubId!)
          .maybeSingle();
        if (!club?.default_handicap_ruleset_id) return;
        const { data: config } = await supabase
          .from('handicap_ruleset_config')
          .select('scratch_boat_win_bonus')
          .eq('ruleset_id', club.default_handicap_ruleset_id)
          .maybeSingle();
        if (config) {
          setScratchWinBonus(config.scratch_boat_win_bonus ?? 30);
        }
      } catch {
        // Fall back to default
      }
    };
    loadRulesetConfig();
  }, [event.clubId, event.raceFormat]);

  // Enrich skipper data with member information
  useEffect(() => {
    const enrichSkipperData = async () => {
      if (!event.skippers || event.skippers.length === 0) {
        setEnrichedEvent(event);
        return;
      }

      try {
        // Fetch member data for all skippers
        // First try by memberId, then fallback to matching by name
        const memberIds = event.skippers.map(s => s.memberId).filter(Boolean);

        let members: any[] = [];

        if (memberIds.length > 0) {
          const { data, error } = await supabase
            .from('members')
            .select('id, first_name, last_name, country, country_code, category, state')
            .eq('club_id', event.clubId)
            .in('id', memberIds);

          if (error) {
            console.error('Error fetching member data by ID:', error);
          } else {
            members = data || [];
          }
        }

        // Also fetch by name for skippers without memberIds
        const skippersWithoutIds = event.skippers.filter(s => !s.memberId);
        if (skippersWithoutIds.length > 0 && event.clubId) {
          const { data, error } = await supabase
            .from('members')
            .select('id, first_name, last_name, country, country_code, category, state')
            .eq('club_id', event.clubId);

          if (!error && data) {
            // Match by name
            skippersWithoutIds.forEach(skipper => {
              const match = data.find(m => {
                const fullName = `${m.first_name} ${m.last_name}`.trim();
                return fullName === skipper.name;
              });
              if (match && !members.find(m => m.id === match.id)) {
                members.push(match);
              }
            });
          }
        }

        // Create maps for easy lookup
        const memberMapById = new Map(members.map(m => [m.id, m]));
        const memberMapByName = new Map(
          members.map(m => [`${m.first_name} ${m.last_name}`.trim(), m])
        );

        console.log('📊 Member data from database:', members);

        // Enrich skippers with member data
        const enrichedSkippers = event.skippers.map(skipper => {
          let member = memberMapById.get(skipper.memberId);
          if (!member) {
            member = memberMapByName.get(skipper.name);
          }

          if (member) {
            const countryName = member.country || (member.country_code ? getCountryName(member.country_code) : null);
            console.log(`👤 Enriching ${skipper.name}:`, {
              memberCountry: member.country,
              memberCountryCode: member.country_code,
              derivedCountryName: countryName,
              memberCategory: member.category,
              memberState: member.state,
              skipperBefore: { country: skipper.country, category: (skipper as any).category, clubState: (skipper as any).clubState }
            });
            return {
              ...skipper,
              country: countryName || skipper.country,
              countryCode: member.country_code || skipper.countryCode,
              category: member.category || (skipper as any).category,
              clubState: member.state || (skipper as any).clubState
            };
          }
          console.log(`⚠️ No member data found for ${skipper.name}`);
          return skipper;
        });

        console.log('🎯 Enriched skippers with member data:', enrichedSkippers);

        setEnrichedEvent({
          ...event,
          skippers: enrichedSkippers
        });
      } catch (error) {
        console.error('Error enriching skipper data:', error);
        setEnrichedEvent(event);
      }
    };

    enrichSkipperData();
  }, [event]);

  // Fetch race report if published
  useEffect(() => {
    const fetchRaceReport = async () => {
      if (!event.id) return;

      const { data, error } = await supabase
        .from('race_reports')
        .select('*')
        .eq('event_id', event.id)
        .eq('event_type', 'quick_race')
        .eq('is_published', true)
        .maybeSingle();

      if (data && !error) {
        setRaceReport(data);
      }
    };

    fetchRaceReport();
  }, [event.id]);

  const handleDeleteReport = async () => {
    if (!raceReport?.id) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('race_reports')
        .delete()
        .eq('id', raceReport.id);

      if (error) throw error;

      setRaceReport(null);
      setShowReport(false);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Error deleting race report:', error);
      alert('Failed to delete race report. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSkipperExpansion = (skipperIndex: number) => {
    if (isExportMode) return;
    setExpandedSkipper(expandedSkipper === skipperIndex ? null : skipperIndex);
  };
  // Helper function to get letter score value
  // Standings: shared with the phone app (utils/eventResultsEngine.ts)
  const { totals, drops, resolvedScores, hasRODScoring, getScoringSystemName, shrsFleetMap, shrsHasFinals, displaySkippers, SHRS_FLEET_NAMES, SHRS_FLEET_COLORS, getShrsRaceLabel, isShrsFinalsRace, resultsByRace, raceNumbers, sortedSkippersResolved, calculateTotals, isShrsEvent } = computeEventResults(event, enrichedEvent);

  const lastCompletedRace = raceNumbers.length > 0 ? Math.max(...raceNumbers) : 0;

  const MAX_RACES_PER_ROW = 12;
  const needsTwoRows = isExportMode && raceNumbers.length > MAX_RACES_PER_ROW;
  const row1Races = needsTwoRows ? raceNumbers.slice(0, MAX_RACES_PER_ROW) : raceNumbers;
  const row2Races = needsTwoRows ? raceNumbers.slice(MAX_RACES_PER_ROW) : [];

  // Get position for a specific race and skipper
  const getPositionForRace = (race: number, skipperIndex: number) => {
    const raceResults = resultsByRace[race] || [];
    const result = raceResults.find(r => r.skipperIndex === skipperIndex);
    return result ? { position: result.position, letterScore: result.letterScore, handicap: result.handicap, adjustedHcap: result.adjustedHcap } : { position: null };
  };

  // Get the handicap that was USED for a specific race
  const getHandicapUsedForRace = (race: number, skipperIndex: number): number | null => {
    const skipper = enrichedEvent.skippers?.[skipperIndex];
    if (!skipper) return null;

    // For Race 1, use the starting handicap
    if (race === 1) {
      return skipper.startHcap || 0;
    }

    // For Race 2+, check if the result has the handicap stored
    const raceResults = resultsByRace[race] || [];
    const result = raceResults.find(r => r.skipperIndex === skipperIndex);
    if (result) {
      // First check if handicap is stored in the result
      if (result.handicap !== undefined && result.handicap !== null && !isNaN(result.handicap)) {
        return result.handicap;
      }
    }

    // Otherwise, get the adjusted handicap from the previous race
    for (let prevRace = race - 1; prevRace >= 1; prevRace--) {
      const prevResults = resultsByRace[prevRace] || [];
      const prevResult = prevResults.find(r => r.skipperIndex === skipperIndex);
      if (prevResult) {
        if (prevResult.adjustedHcap !== undefined && prevResult.adjustedHcap !== null && !isNaN(prevResult.adjustedHcap)) {
          return prevResult.adjustedHcap;
        }
      }
    }

    // Fallback to starting handicap
    return skipper.startHcap || 0;
  };
  
  // Get club abbreviation for a skipper
  const getClubAbbreviation = (skipper: any) => {
    if (!skipper.club) return '';
    
    // If club is already an abbreviation (less than 6 chars), return it
    if (skipper.club.length <= 6) return skipper.club;
    
    // Otherwise, try to create an abbreviation from the club name
    // Example: "Lake Macquarie Radio Yacht Club" -> "LMRYC"
    return skipper.club
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase())
      .join('');
  };
  
  // Get hull design for a skipper
  const getHullDesign = (skipper: any) => {
    return skipper.hull || '';
  };

  // Get country flag emoji
  const getCountryFlag = (countryCode: string | undefined) => {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  // Abbreviate category names
  const abbreviateCategory = (category: string | undefined) => {
    if (!category) return '';
    const abbreviations: { [key: string]: string } = {
      'Junior': 'J',
      'Open': 'O',
      'Master': 'M',
      'Grand Master': 'GM',
      'Legend': 'L'
    };
    return abbreviations[category] || category;
  };

  // Abbreviate country names to 3-character codes
  const abbreviateCountry = (country: string | undefined) => {
    if (!country) return '';
    const abbreviations: { [key: string]: string } = {
      'Australia': 'AUS',
      'New Zealand': 'NZL',
      'United States': 'USA',
      'United Kingdom': 'GBR',
      'Canada': 'CAN',
      'Brazil': 'BRA',
      'Argentina': 'ARG',
      'France': 'FRA',
      'Germany': 'GER',
      'Italy': 'ITA',
      'Spain': 'ESP',
      'Portugal': 'POR',
      'Netherlands': 'NED',
      'Belgium': 'BEL',
      'Switzerland': 'SUI',
      'Austria': 'AUT',
      'Denmark': 'DEN',
      'Sweden': 'SWE',
      'Norway': 'NOR',
      'Finland': 'FIN',
      'Poland': 'POL',
      'Russia': 'RUS',
      'China': 'CHN',
      'Japan': 'JPN',
      'South Korea': 'KOR',
      'India': 'IND',
      'South Africa': 'RSA',
      'Mexico': 'MEX',
      'Chile': 'CHI',
      'Uruguay': 'URU',
      'Ireland': 'IRL',
      'Greece': 'GRE',
      'Turkey': 'TUR',
      'Egypt': 'EGY',
      'Thailand': 'THA',
      'Singapore': 'SGP',
      'Malaysia': 'MAS',
      'Indonesia': 'INA',
      'Philippines': 'PHI',
      'Vietnam': 'VIE',
      'Hong Kong': 'HKG'
    };
    // If we have a mapping, use it; otherwise take first 3 letters and uppercase
    return abbreviations[country] || country.substring(0, 3).toUpperCase();
  };

  // Get display settings from enrichedEvent
  const showFlag = (enrichedEvent as any).show_flag || false;
  const showCountry = (enrichedEvent as any).show_country || false;
  const showClub = (enrichedEvent as any).show_club !== false;
  const showClubState = (enrichedEvent as any).show_club_state || false;
  const showCategory = (enrichedEvent as any).show_category || false;

  // Debug logging
  console.log('🔍 EventResultsDisplay - Display Settings:', {
    eventName: enrichedEvent.eventName,
    showFlag,
    showCountry,
    showClubState,
    showCategory,
    rawEvent: {
      show_flag: (enrichedEvent as any).show_flag,
      show_country: (enrichedEvent as any).show_country,
      show_club_state: (enrichedEvent as any).show_club_state,
      show_category: (enrichedEvent as any).show_category
    }
  });

  if (!enrichedEvent.skippers || enrichedEvent.skippers.length === 0 || !enrichedEvent.raceResults || enrichedEvent.raceResults.length === 0) {
    return (
      <div className={`${isExportMode ? 'bg-white' : 'bg-slate-800/50'} rounded-lg border ${isExportMode ? 'border-slate-200' : 'border-slate-700/50'} p-12`}>
        <div className="flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-24 h-24 ${isExportMode ? 'bg-blue-500/5' : 'bg-blue-500/10'} rounded-full animate-pulse`}></div>
              </div>
              <div className="relative">
                <Trophy size={48} className={`mx-auto ${isExportMode ? 'text-slate-400' : 'text-blue-400/80'}`} strokeWidth={1.5} />
              </div>
            </div>

            <h3 className={`text-xl font-bold mb-3 ${isExportMode ? 'text-slate-900' : 'text-white'}`}>
              No Results Available
            </h3>
            <p className={`leading-relaxed ${isExportMode ? 'text-slate-600' : 'text-slate-400'}`}>
              Results will appear here once the race has been completed and scores have been entered.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const containerClass = isExportMode ? 'results-export-container' : '';
  const tableClass = isExportMode ? 'export-table' : '';
  const exportThStyle: React.CSSProperties = isExportMode ? { backgroundColor: '#12192a', color: 'white', whiteSpace: 'nowrap', padding: '0 8px', lineHeight: '30px', height: '30px', verticalAlign: 'middle' } : {};
  const exportSubThStyle: React.CSSProperties = isExportMode ? { backgroundColor: '#12192a', color: '#aaa' } : {};
  const exportTdBase: React.CSSProperties = isExportMode ? { padding: '0 6px', fontSize: '13px', fontWeight: 600, color: '#000', lineHeight: '28px', height: '28px', verticalAlign: 'middle' } : {};

  return (
    <div className={`${isExportMode ? 'bg-white text-black' : 'bg-slate-800'} p-6 rounded-lg ${containerClass}`}>
      {isExportMode ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
            {clubLogoUrl && (
              <img
                src={clubLogoUrl}
                alt="Club logo"
                style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }}
                crossOrigin="anonymous"
              />
            )}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className="event-title" style={{ textAlign: 'center' }}>
                {event.eventName || event.clubName}
              </div>
              {seriesName ? (
                <div className="event-series-name" style={{ textAlign: 'center' }}>
                  {seriesName}
                </div>
              ) : (
                <div className="event-subtitle" style={{ textAlign: 'center' }}>
                  {event.raceClass} - {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                </div>
              )}
              <div className="event-details" style={{ textAlign: 'center' }}>
                {formatDate(event.date)} - {event.venue}{clubAbbreviation ? ` - ${clubAbbreviation}` : ''}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-2xl font-bold ${isExportMode ? 'text-black' : 'text-white'}`}>
                {event.eventName || event.clubName}
              </h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400">
                  {event.raceClass}
                </div>
                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-900/30 text-purple-400">
                  {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                </div>
              </div>
              <div className="text-sm mt-2 text-slate-400">
                {formatDate(event.date)} - {event.venue}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {event.raceFormat === 'handicap' && (
                <button
                  onClick={() => setShowHandicaps(!showHandicaps)}
                  className={`p-3 rounded-lg transition-colors flex items-center gap-2 ${
                    !showHandicaps
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                  title={showHandicaps ? 'Hide handicap values' : 'Show handicap values'}
                >
                  <span className="text-sm">{showHandicaps ? 'Handicaps Off' : 'Handicaps On'}</span>
                </button>
              )}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                title="Score Display Settings"
              >
                <Settings size={18} />
                <span className="text-sm">Score Display Settings</span>
              </button>
            </div>
          </div>

          {/* Race Report Section */}
          {raceReport && (
            <div className="mt-6 p-5 bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border-2 border-cyan-500/50 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <FileText className="text-cyan-400" size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-cyan-200">Race Report</h3>
                    <p className="text-sm text-cyan-300/80">Professional race summary</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isExportMode && (
                    <>
                      <button
                        onClick={() => setShowEditModal(true)}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        title="Edit report"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isDeleting}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        title="Delete report"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowReport(!showReport)}
                    className="btn-primary-green px-4 py-2 from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white rounded-lg font-medium transition-all shadow-lg text-sm flex items-center gap-2"
                  >
                    <FileText size={16} />
                    {showReport ? 'Hide Report' : 'View Report'}
                  </button>
                </div>
              </div>

              {showReport && (
                <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-cyan-500/20">
                  <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {raceReport.report_content}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className={`text-left ${tableClass}`} style={{ minWidth: '100%', width: 'max-content' }}>
          <thead>
            <tr className={isExportMode ? '' : 'bg-gradient-to-r from-slate-700 to-slate-800 border-b-2 border-blue-500/30'}>
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-0 z-20 ${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'POS' : 'Pos'}</th>
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[60px] z-20 ${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '70px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'SAIL' : 'Sail'}</th>
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[120px] z-20 ${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '135px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'SKIPPER' : 'Skipper'}</th>
              {showClub && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[255px] z-20 ${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '75px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'CLUB' : 'Club'}</th>
              )}
              {showClubState && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '75px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'STATE' : 'State'}</th>
              )}
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[330px] z-20 ${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '90px', boxShadow: isExportMode ? undefined : '2px 0 4px rgba(0,0,0,0.1)', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'DESIGN' : 'Design'}</th>
              {showCategory && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'CATEGORY' : 'Category'}</th>
              )}
              {shrsHasFinals && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '50px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'FLEET' : 'Fleet'}</th>
              )}
              {row1Races.map(raceNum => (
                <th key={raceNum} className={`${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider text-center ${
                  isShrsFinalsRace(raceNum)
                    ? isExportMode ? '' : 'text-yellow-300'
                    : isExportMode ? '' : 'text-blue-200'
                }`} style={{ minWidth: '60px', ...exportThStyle }}>{getShrsRaceLabel(raceNum)}</th>
              ))}
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'GROSS' : 'Gross'}</th>
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`${isExportMode ? '' : 'sticky right-0 z-20 px-3 py-3 bg-slate-800 shadow-[-2px_0_4px_rgba(0,0,0,0.2)]'} text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>{isExportMode ? 'NET' : 'Net'}</th>
            </tr>
            {needsTwoRows && (
              <tr className={isExportMode ? '' : 'bg-gradient-to-r from-slate-700 to-slate-800'}>
                {row2Races.map(raceNum => (
                  <th key={raceNum} className={`${isExportMode ? '' : 'px-3 py-3'} text-sm font-bold uppercase tracking-wider text-center ${
                    isShrsFinalsRace(raceNum)
                      ? isExportMode ? '' : 'text-yellow-300'
                      : isExportMode ? '' : 'text-blue-200'
                  }`} style={{ minWidth: '60px', ...exportThStyle }}>{getShrsRaceLabel(raceNum)}</th>
                ))}
              </tr>
            )}
            {/* Scratch bonus row - shows handicap seconds carried over when scratch boats finish in top 3 */}
            {event.raceFormat === 'handicap' && showHandicaps && !needsTwoRows && (
              <tr>
                <th className={`sticky left-0 z-20 ${isExportMode ? '' : 'bg-slate-800'}`} style={exportSubThStyle}></th>
                <th className={`sticky left-[60px] z-20 ${isExportMode ? '' : 'bg-slate-800'}`} style={exportSubThStyle}></th>
                <th className={`sticky left-[120px] z-20 ${isExportMode ? '' : 'bg-slate-800'}`} style={exportSubThStyle}></th>
                {showClub && <th className={`sticky left-[255px] z-20 ${isExportMode ? '' : 'bg-slate-800'}`} style={exportSubThStyle}></th>}
                {showClubState && <th className={`${isExportMode ? '' : 'bg-slate-800'}`} style={exportSubThStyle}></th>}
                <th className={`sticky left-[330px] z-20 ${isExportMode ? '' : 'bg-slate-800'}`} style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.1)', ...exportSubThStyle }}></th>
                {showCategory && <th className={`${isExportMode ? '' : 'bg-slate-800'}`} style={exportSubThStyle}></th>}
                {shrsHasFinals && <th className={`${isExportMode ? '' : 'bg-slate-800'}`} style={exportSubThStyle}></th>}
                {raceNumbers.map(raceNum => {
                  // Get all results for this race
                  const raceData = resultsByRace[raceNum] || [];

                  // Calculate handicaps as they were at the START of this race
                  const currentHcaps = (event.skippers || []).map((skipper, idx) => {
                    if (raceNum === 1) {
                      const r1Result = raceData.find(r => r.skipperIndex === idx);
                      if (r1Result && r1Result.handicap !== undefined) return r1Result.handicap;
                      return skipper.startHcap || 0;
                    }

                    // Look for adjusted handicap from previous race
                    for (let prevRace = raceNum - 1; prevRace >= 1; prevRace--) {
                      const prevRaceResults = resultsByRace[prevRace] || [];
                      const prevResult = prevRaceResults.find(r => r.skipperIndex === idx);
                      if (prevResult?.adjustedHcap !== undefined && prevResult?.adjustedHcap !== null) {
                        return prevResult.adjustedHcap;
                      }
                    }
                    return skipper.startHcap || 0;
                  });

                  // Find if a scratch boat (handicap 0) won the race
                  const positions = raceData
                    .filter(r => r.position !== null || r.letterScore === 'RDGfix')
                    .map(r => ({
                      position: r.position,
                      skipperIndex: r.skipperIndex,
                      skipperName: event.skippers?.[r.skipperIndex]?.name || '',
                      isOnScratch: currentHcaps[r.skipperIndex] === 0
                    }))
                    .sort((a, b) => (a.position || 999) - (b.position || 999));

                  const allOnScratch = positions.every(p => p.isOnScratch);

                  const scratchBoatWinner = !allOnScratch ? positions
                    .find(p => p.isOnScratch && p.position === 1) : undefined;

                  let scratchBoatBonus = 0;
                  if (scratchBoatWinner) {
                    scratchBoatBonus = scratchWinBonus !== null ? scratchWinBonus : 30;
                  }

                  return (
                    <th key={raceNum} className={`text-center px-2 py-1 ${isExportMode ? '' : 'text-slate-400'}`} style={exportSubThStyle}>
                      {scratchBoatBonus > 0 && scratchBoatWinner && (
                        <div
                          className="text-[10px]"
                          style={{ fontStyle: 'italic', fontWeight: 'normal', color: isExportMode ? '#aaa' : undefined }}
                          title={`${scratchBoatWinner.skipperName} won on scratch`}
                        >
                          <i>+{scratchBoatBonus}s</i>
                        </div>
                      )}
                    </th>
                  );
                })}
                <th colSpan={2} style={exportSubThStyle}></th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-700">
            {(() => {
              let currentFleet: string | null = null;
              let fleetPositionCounter = 0;
              return displaySkippers.map((skipper, position) => {
                const skipperFleet = shrsHasFinals ? (shrsFleetMap.get(skipper.index) || 'Z') : null;
                let fleetSeparator: React.ReactNode = null;

                if (shrsHasFinals && skipperFleet !== currentFleet) {
                  currentFleet = skipperFleet;
                  fleetPositionCounter = 0;
                  const fleetName = SHRS_FLEET_NAMES[skipperFleet!] || `Fleet ${skipperFleet}`;
                  const fleetColor = SHRS_FLEET_COLORS[skipperFleet!];
                  const raceCols = needsTwoRows ? row1Races.length : raceNumbers.length;
                  const totalCols = raceCols + 6 + (showClub ? 1 : 0) + (showClubState ? 1 : 0) + (showCategory ? 1 : 0) + 1;
                  fleetSeparator = (
                    <tr key={`fleet-${skipperFleet}`} style={isExportMode ? { backgroundColor: fleetColor?.exportBg || '#f1f5f9' } : undefined}>
                      <td
                        colSpan={totalCols}
                        className={isExportMode ? '' : `px-4 py-1.5 font-bold text-sm border-t-2 ${fleetColor?.border || 'border-slate-600'} ${fleetColor?.bg || 'bg-slate-700'} ${fleetColor?.text || 'text-slate-300'}`}
                        style={isExportMode ? {
                          padding: '6px 12px',
                          fontWeight: 'bold',
                          fontSize: '13px',
                          textAlign: 'center',
                          borderTop: `2px solid ${fleetColor?.exportBorder || '#666'}`,
                          backgroundColor: fleetColor?.exportBg || '#f1f5f9',
                          color: fleetColor?.exportText || '#333',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          height: '32px',
                          lineHeight: '32px',
                        } : undefined}
                      >
                        {fleetName}
                      </td>
                    </tr>
                  );
                }

                const isFleetTopThree = shrsHasFinals && fleetPositionCounter < 3 && skipperFleet === 'A';
                fleetPositionCounter++;

                return (
              <React.Fragment key={skipper.index}>
                {fleetSeparator}
                <tr
                  onClick={() => toggleSkipperExpansion(skipper.index)}
                  className={`
                    ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'}
                    ${isExportMode ? '' : 'hover:bg-slate-700/30 cursor-pointer transition-colors'}
                    ${expandedSkipper === skipper.index ? 'bg-slate-700/50' : ''}
                  `}
                  style={isExportMode ? { verticalAlign: 'middle' } : undefined}
                >
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-0 z-10 px-3 ${isExportMode ? '' : 'py-1.5'} ${isExportMode ? 'text-black' : 'text-white bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} font-semibold`}
                  style={isExportMode ? { ...exportTdBase, textAlign: 'center' } : undefined}
                >
                  {isExportMode ? (
                    position + 1
                  ) : (
                  <div className="flex items-center gap-2">
                    {(
                      expandedSkipper === skipper.index ?
                        <ChevronUp size={14} className="text-slate-400" /> :
                        <ChevronDown size={14} className="text-slate-400" />
                    )}
                    <div className={shrsHasFinals && isFleetTopThree ? 'text-yellow-500 font-bold' : ''}>
                      {position + 1}
                      {!isExportMode && !shrsHasFinals && (
                        <>
                          {position === 0 && <Trophy className="inline ml-1 text-yellow-400 position-icon" size={14} />}
                          {position === 1 && <Medal className="inline ml-1 text-gray-400 position-icon" size={14} />}
                          {position === 2 && <Medal className="inline ml-1 text-amber-700 position-icon" size={14} />}
                        </>
                      )}
                      {!isExportMode && shrsHasFinals && isFleetTopThree && (
                        <>
                          {fleetPositionCounter - 1 === 1 && <Trophy className="inline ml-1 text-yellow-400 position-icon" size={14} />}
                          {fleetPositionCounter - 1 === 2 && <Medal className="inline ml-1 text-gray-400 position-icon" size={14} />}
                          {fleetPositionCounter - 1 === 3 && <Medal className="inline ml-1 text-amber-700 position-icon" size={14} />}
                        </>
                      )}
                    </div>
                  </div>
                  )}
                </td>
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-[60px] z-10 px-3 ${isExportMode ? '' : 'py-1.5'} ${isExportMode ? 'text-black' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} font-semibold`}
                  style={isExportMode ? { ...exportTdBase, whiteSpace: 'nowrap' } : undefined}
                >
                  {isExportMode ? (
                    <>{showCountry && skipper.country ? `${abbreviateCountry(skipper.country)} ` : ''}{skipper.sailNo}</>
                  ) : (
                    <>{showCountry && skipper.country ? `${abbreviateCountry(skipper.country)} ` : ''}{skipper.sailNo}</>
                  )}
                </td>
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-[120px] z-10 px-3 ${isExportMode ? '' : 'py-1.5'} ${isExportMode ? 'text-black' : 'text-white bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} text-left font-semibold`}
                  style={isExportMode ? { ...exportTdBase, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' } : undefined}
                >
                  <div className={isExportMode ? '' : 'flex items-center gap-2'}>
                    {showFlag && skipper.countryCode && (
                      <span className="text-2xl">{getCountryFlag(skipper.countryCode)}</span>
                    )}
                    {!isExportMode && (
                      skipper.avatarUrl ? (
                        <img
                          src={skipper.avatarUrl}
                          alt={skipper.name}
                          className="w-8 h-8 rounded-full object-cover border-2 border-slate-600"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-slate-700 text-slate-300">
                          {skipper.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                      )
                    )}
                    <span className={isExportMode ? 'text-xs' : 'text-sm'}>{skipper.name}</span>
                  </div>
                </td>
                {showClub && (
                  <td
                    rowSpan={needsTwoRows ? 2 : undefined}
                    className={`sticky left-[255px] z-10 px-3 ${isExportMode ? '' : 'py-1.5'} ${isExportMode ? 'text-black' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} font-semibold`}
                    style={isExportMode ? { ...exportTdBase, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' } : undefined}
                  >
                    {getClubAbbreviation(skipper)}
                  </td>
                )}
                {showClubState && (
                  <td
                    rowSpan={needsTwoRows ? 2 : undefined}
                    className={`px-3 ${isExportMode ? '' : 'py-1.5'} font-semibold ${isExportMode ? 'text-black' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'}`}
                    style={isExportMode ? { ...exportTdBase } : undefined}
                  >
                    {skipper.clubState || ''}
                  </td>
                )}
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-[330px] z-10 px-3 ${isExportMode ? '' : 'py-1.5'} font-semibold ${isExportMode ? 'text-black' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'}`}
                  style={isExportMode ? { ...exportTdBase, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px' } : { boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}
                >
                  {getHullDesign(skipper)}
                </td>
                {showCategory && (
                  <td
                    rowSpan={needsTwoRows ? 2 : undefined}
                    className={`px-3 ${isExportMode ? '' : 'py-1.5'} text-center font-semibold ${isExportMode ? 'text-black' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'}`}
                    style={isExportMode ? { ...exportTdBase } : undefined}
                  >
                    {abbreviateCategory(skipper.category)}
                  </td>
                )}
                {shrsHasFinals && (
                  <td
                    rowSpan={needsTwoRows ? 2 : undefined}
                    className={`px-3 ${isExportMode ? '' : 'py-1.5'} text-center text-xs font-bold ${
                      SHRS_FLEET_COLORS[skipperFleet!]?.text || (isExportMode ? '' : 'text-slate-400')
                    }`}
                    style={isExportMode ? { ...exportTdBase, fontSize: '12px', fontWeight: 'bold' } : undefined}
                  >
                    {skipperFleet === 'A' ? 'G' : skipperFleet === 'B' ? 'S' : skipperFleet === 'C' ? 'B' : skipperFleet}
                  </td>
                )}
                {row1Races.map(raceNum => {
                  const { position, letterScore } = getPositionForRace(raceNum, skipper.index);
                  const isDropped = drops[`${skipper.index}-${raceNum}`];
                  const raceHandicap = enrichedEvent.raceFormat === 'handicap' ? getHandicapUsedForRace(raceNum, skipper.index) : null;

                  // Check if skipper withdrew from this race
                  const skipperWithdrewAtRace = skipper.withdrawnFromRace &&
                                                typeof skipper.withdrawnFromRace === 'number' &&
                                                raceNum >= skipper.withdrawnFromRace;
                  const skipperWithdrawn = skipperWithdrewAtRace && position === null && !letterScore;
                  const withdrawnScore = skipperWithdrawn ? (enrichedEvent.skippers?.length || 0) + 1 : null;

                  if (skipperWithdrewAtRace && raceNum >= 6) {
                    console.log(`Skipper ${skipper.name} R${raceNum}: withdrawnFromRace=${skipper.withdrawnFromRace}, position=${position}, letterScore=${letterScore}, skipperWithdrawn=${skipperWithdrawn}, withdrawnScore=${withdrawnScore}`);
                  }

                  let displayValue: string | number = '-';
                  const resolved = resolvedScores[`${skipper.index}-${raceNum}`];
                  if (resolved !== undefined) {
                    displayValue = !Number.isInteger(resolved) ? Math.round(resolved * 100) / 100 : resolved;
                  } else if (letterScore) {
                    const lsPoints = getLetterScorePointsForRace(letterScore, raceNum, event.raceResults || [], event.skippers || [], skipper.index);
                    displayValue = event.raceFormat === 'handicap' ? lsPoints : (hasRODScoring && !Number.isInteger(lsPoints) ? Math.round(lsPoints * 100) / 100 : Math.round(lsPoints));
                  } else if (position !== null) {
                    displayValue = event.raceFormat === 'handicap' ? position : Math.round(position);
                  } else if (withdrawnScore !== null) {
                    displayValue = withdrawnScore;
                  }

                  return (
                    <td
                      key={raceNum}
                      className={`px-3 ${isExportMode ? '' : 'py-1.5'} text-center font-semibold ${
                        isDropped
                          ? isExportMode ? 'dropped-score' : 'text-red-400 line-through'
                          : isExportMode ? '' : 'text-slate-300'
                      } ${event.raceFormat === 'handicap' && showHandicaps && !letterScore ? 'split-cell' : ''}`}
                      style={isExportMode ? {
                        ...exportTdBase,
                        ...(event.raceFormat === 'handicap' && showHandicaps && !letterScore ? { padding: 0, height: '44px', lineHeight: 'normal' } : {}),
                        ...(isDropped ? { backgroundColor: '#848484', color: '#ffffff' } : {})
                      } : undefined}
                    >
                      {letterScore ? (
                        (() => {
                          const resolved = resolvedScores[`${skipper.index}-${raceNum}`];
                          const points = resolved !== undefined
                            ? (!Number.isInteger(resolved) ? Math.round(resolved * 100) / 100 : resolved)
                            : (() => { const rawPts = getLetterScorePointsForRace(letterScore, raceNum, event.raceResults || [], event.skippers || [], skipper.index); return event.raceFormat === 'handicap' ? rawPts : (hasRODScoring && !Number.isInteger(rawPts) ? Math.round(rawPts * 100) / 100 : Math.round(rawPts)); })();
                          return isExportMode ? <>{points}</> : <span>{points}</span>;
                        })()
                      ) : event.raceFormat === 'handicap' && showHandicaps && (position || withdrawnScore) ? (
                        isExportMode ? (
                          <div style={{
                            position: 'relative',
                            width: '100%',
                            height: '44px',
                            margin: '0',
                            padding: '0',
                            overflow: 'visible'
                          }}>
                            {/* SVG diagonal line - top-left to bottom-right */}
                            <svg
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                zIndex: 1
                              }}
                            >
                              <line
                                x1="0"
                                y1="0"
                                x2="100"
                                y2="100"
                                stroke={isDropped ? '#ffffff' : '#888888'}
                                strokeWidth="1"
                                vectorEffect="non-scaling-stroke"
                              />
                            </svg>
                            {/* Handicap at top-right */}
                            <span style={{
                              position: 'absolute',
                              top: '2px',
                              right: '6px',
                              fontSize: '10px',
                              fontWeight: '600',
                              color: isDropped ? '#ffffff' : '#333333',
                              lineHeight: '1',
                              zIndex: 3
                            }}>
                              {raceHandicap !== null ? `${raceHandicap}s` : ''}
                            </span>
                            {/* Position at bottom-left - use top instead of bottom for html2canvas */}
                            <span style={{
                              position: 'absolute',
                              top: '22px',
                              left: '6px',
                              fontSize: '18px',
                              fontWeight: 'bold',
                              color: isDropped ? '#ffffff' : '#000000',
                              lineHeight: '1',
                              zIndex: 3
                            }}>
                              {position || withdrawnScore}
                            </span>
                          </div>
                        ) : (
                          <div className="relative split-cell-content" style={{ minHeight: '32px' }}>
                            <div
                              className="absolute inset-0 pointer-events-none diagonal-line screen-diagonal"
                            />
                            <span
                              className={`absolute top-0 right-1 text-[10px] font-semibold ${
                                isDropped ? 'text-red-400 line-through' : 'text-slate-400 opacity-70'
                              }`}
                              style={{ zIndex: 2, position: 'absolute' }}
                            >
                              {raceHandicap !== null ? `${raceHandicap}s` : ''}
                            </span>
                            <span
                              className={`absolute bottom-0 left-1 font-bold ${
                                isDropped ? 'text-red-400 line-through' : 'text-white'
                              }`}
                              style={{ zIndex: 2, position: 'absolute' }}
                            >
                              {position || withdrawnScore}
                            </span>
                          </div>
                        )
                      ) : withdrawnScore ? (
                        isExportMode ? <>{withdrawnScore}</> : <span>{withdrawnScore}</span>
                      ) : (
                        isExportMode ? <>{position || '-'}</> : <span>{position || '-'}</span>
                      )}
                    </td>
                  );
                })}
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`px-3 ${isExportMode ? '' : 'py-1.5'} text-center font-semibold ${isExportMode ? 'text-black' : 'text-slate-300'}`}
                  style={isExportMode ? { ...exportTdBase } : undefined}
                >
                  {totals[skipper.index]?.gross ? (event.raceFormat === 'handicap' ? Number(totals[skipper.index].gross.toFixed(1)) : (hasRODScoring ? totals[skipper.index].gross.toFixed(2) : Math.round(totals[skipper.index].gross))) : 0}
                </td>
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`px-3 ${isExportMode ? '' : 'py-1.5 sticky right-0 z-10 bg-slate-800 shadow-[-2px_0_4px_rgba(0,0,0,0.2)]'} text-center font-bold ${isExportMode ? 'net-total' : 'text-blue-400'}`}
                  style={isExportMode ? { ...exportTdBase, fontWeight: 'bold' } : undefined}
                >
                  {totals[skipper.index]?.net ? (event.raceFormat === 'handicap' ? Number(totals[skipper.index].net.toFixed(1)) : (hasRODScoring ? totals[skipper.index].net.toFixed(2) : Math.round(totals[skipper.index].net))) : 0}
                </td>
              </tr>
              {needsTwoRows && (
                <tr style={isExportMode ? { verticalAlign: 'middle' } : undefined}>
                  {row2Races.map(raceNum => {
                    const { position: pos, letterScore: ls } = getPositionForRace(raceNum, skipper.index);
                    const isDropped = drops[`${skipper.index}-${raceNum}`];
                    const skipperWithdrewAtRace = skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number' && raceNum >= skipper.withdrawnFromRace;
                    const skipperWithdrawn = skipperWithdrewAtRace && pos === null && !ls;
                    const withdrawnScore = skipperWithdrawn ? (enrichedEvent.skippers?.length || 0) + 1 : null;
                    let displayVal: string | number = '-';
                    if (ls) {
                      const lsPts = getLetterScorePointsForRace(ls, raceNum, event.raceResults || [], event.skippers || [], skipper.index);
                      displayVal = event.raceFormat === 'handicap' ? lsPts : Math.round(lsPts);
                    } else if (pos !== null) {
                      displayVal = event.raceFormat === 'handicap' ? pos : Math.round(pos);
                    } else if (withdrawnScore !== null) {
                      displayVal = withdrawnScore;
                    }
                    return (
                      <td
                        key={raceNum}
                        className={`px-3 ${isExportMode ? '' : 'py-1.5'} text-center font-semibold ${
                          isDropped ? isExportMode ? 'dropped-score' : 'text-red-400 line-through' : isExportMode ? '' : 'text-slate-300'
                        }`}
                        style={isExportMode ? {
                          ...exportTdBase,
                          ...(isDropped ? { backgroundColor: '#848484', color: '#ffffff' } : {})
                        } : undefined}
                      >
                        {isExportMode ? <>{displayVal}</> : <span>{displayVal}</span>}
                      </td>
                    );
                  })}
                </tr>
              )}
              {!isExportMode && expandedSkipper === skipper.index && (
                <tr>
                  <td colSpan={
                    raceNumbers.length + 7 +
                    (showCountry ? 1 : 0) +
                    (showClubState ? 1 : 0) +
                    (showCategory ? 1 : 0) +
                    (shrsHasFinals ? 1 : 0)
                  }>
                    <SkipperPerformanceInsights
                      skipper={skipper}
                      skipperIndex={skipper.index}
                      event={event}
                      darkMode={darkMode}
                      allSkippers={event.skippers || []}
                      raceResults={event.raceResults || []}
                      onClose={() => setExpandedSkipper(null)}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* Scoring System & CRO Display */}
      <div className="mt-4 px-4 flex items-center justify-between">
        {(event.proMemberName || rosteredCROName) ? (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
            isExportMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-700/50 text-slate-300'
          }`}>
            <span className="text-sm font-medium">CRO:</span>
            <span className="text-sm">{event.proMemberName || rosteredCROName}</span>
          </div>
        ) : <div />}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
          isExportMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-700/50 text-slate-300'
        }`}>
          <Award size={16} />
          <span className="text-sm font-medium">Scoring System:</span>
          <span className="text-sm">{getScoringSystemName()}</span>
        </div>
      </div>

      {isExportMode && (
        <div className="footer">
          Results generated by Alfie PRO - RC Yacht Management Software
        </div>
      )}

      {/* Race Report Edit Modal */}
      {showEditModal && raceReport && (
        <RaceReportModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          darkMode={darkMode}
          eventId={event.id}
          eventType="quick_race"
          clubId={event.clubId || ''}
          eventData={{
            title: event.name,
            date: event.date,
            venue: event.venue,
            raceClass: event.raceClass,
            raceFormat: event.raceFormat
          }}
          raceResults={event.raceResults || []}
          skippers={event.skippers || []}
          existingReport={{
            id: raceReport.id,
            report_content: raceReport.report_content,
            weather_conditions: raceReport.weather_conditions,
            key_highlights: raceReport.key_highlights,
            people_to_congratulate: raceReport.people_to_congratulate,
            is_published: raceReport.is_published
          }}
          onReportGenerated={() => {
            // Refetch the race report after editing
            const fetchUpdatedReport = async () => {
              const { data } = await supabase
                .from('race_reports')
                .select('*')
                .eq('event_id', event.id)
                .eq('event_type', 'quick_race')
                .eq('is_published', true)
                .maybeSingle();
              if (data) setRaceReport(data);
            };
            fetchUpdatedReport();
            setShowEditModal(false);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteReport}
          title="Delete Race Report"
          message="Are you sure you want to delete this race report? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          darkMode={darkMode}
          variant="danger"
        />
      )}

      {/* Display Settings Modal */}
      {showSettingsModal && (
        <DisplaySettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          event={enrichedEvent}
          onUpdate={(updatedEvent) => {
            setEnrichedEvent(updatedEvent);
            // Also notify parent component if callback provided
            if (onEventUpdate) {
              onEventUpdate(updatedEvent);
            }
            setShowSettingsModal(false);
          }}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};

// Display Settings Modal Component
interface DisplaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: RaceEvent;
  onUpdate: (event: RaceEvent) => void;
  darkMode?: boolean;
}

const DisplaySettingsModal: React.FC<DisplaySettingsModalProps> = ({
  isOpen,
  onClose,
  event,
  onUpdate,
  darkMode = true
}) => {
  const { addNotification } = useNotifications();
  const [settings, setSettings] = useState({
    show_flag: (event as any).show_flag || false,
    show_country: (event as any).show_country || false,
    show_club: (event as any).show_club !== false,
    show_club_state: (event as any).show_club_state || false,
    show_category: (event as any).show_category || false,
    show_design: (event as any).show_design !== false
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('quick_races')
        .update(settings)
        .eq('id', event.id);

      if (error) throw error;

      onUpdate({
        ...event,
        ...settings
      });

      addNotification('success', 'Display settings saved successfully');
      onClose();
    } catch (error) {
      console.error('Error saving display settings:', error);
      addNotification('error', 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl border ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Display Settings
            </h3>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Choose which columns to display in the results table:
            </p>

            <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
              darkMode ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-slate-50 hover:bg-slate-100'
            }`}>
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Flag
              </span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_flag: !settings.show_flag })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.show_flag ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.show_flag ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
              darkMode ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-slate-50 hover:bg-slate-100'
            }`}>
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Country
              </span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_country: !settings.show_country })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.show_country ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.show_country ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
              darkMode ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-slate-50 hover:bg-slate-100'
            }`}>
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Club
              </span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_club: !settings.show_club })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.show_club ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.show_club ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
              darkMode ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-slate-50 hover:bg-slate-100'
            }`}>
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                State
              </span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_club_state: !settings.show_club_state })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.show_club_state ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.show_club_state ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
              darkMode ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-slate-50 hover:bg-slate-100'
            }`}>
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Category
              </span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_category: !settings.show_category })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.show_category ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.show_category ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
              darkMode ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-slate-50 hover:bg-slate-100'
            }`}>
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Design
              </span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_design: !settings.show_design })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.show_design ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.show_design ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventResultsDisplay;
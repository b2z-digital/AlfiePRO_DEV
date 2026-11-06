import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Trophy, TrendingUp, Search, Calendar, MapPin, Users, CircleCheck as CheckCircle2, Clock, ChevronRight, X, Grid2x2 as GridIcon, List as ListIcon, Download, ChevronDown, FileImage, FileText, Table, Circle as XCircle, Send, SquarePen as Edit2, Globe, Map as MapIcon, ArrowUpDown, ListFilter as Filter, FlaskConical, Sailboat } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Papa from 'papaparse';
import { RaceSeries, RaceEvent } from '../types/race';
import { HeatDesignation } from '../types/heat';
import { LetterScore, getLetterScoreValue } from '../types';
import { getLetterScorePointsForRace } from '../utils/scratchCalculations';
import { mergeSeriesSkippersByName, findRoundSkipperIndex, MergedSeriesSkipper } from '../utils/seriesSkipperMerge';
import { getStoredRaceSeries, getStoredRaceEvents, getSimulatedRaceEvents, combineAllDayResults, storeRaceSeries } from '../utils/raceStorage';
import { getPublicEvents, convertToRaceEvent } from '../utils/publicEventStorage';
import { formatDate } from '../utils/date';
import { getBoatClassBadge, getRaceFormatBadge } from '../constants/colors';
import { getBoatClassImage } from '../utils/boatClassImages';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { boatTypeColors, defaultColorScheme } from '../constants/colors';
import EventResultsDisplay from '../components/EventResultsDisplay';
import SeriesResultsDisplay from '../components/SeriesResultsDisplay';
import ExternalResultsDisplay from '../components/ExternalResultsDisplay';
import { getStoredVenues } from '../utils/venueStorage';
import { Venue } from '../types/venue';
import { supabase } from '../utils/supabase';
import { CreateReportSplitButton } from '../components/CreateReportSplitButton';
import { RaceReportModal } from '../components/RaceReportModal';
import { EventDetails } from '../components/EventDetails';
import { PublishToMetaModal } from '../components/PublishToMetaModal';
import { ShareResultsExternalModal } from '../components/scoring/ShareResultsExternalModal';
import { HeatRaceResultsModal } from '../components/HeatRaceResultsModal';
import { SeriesEditModal } from '../components/SeriesEditModal';

type MainTab = 'events' | 'leaderboards' | 'simulated' | 'national' | 'state' | 'world';
type StatusFilter = 'all' | 'completed' | 'in-progress';
type SortOption = 'date-asc' | 'date-desc' | 'name-asc' | 'name-desc' | 'status';

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
type ViewMode = 'list' | 'grid';

interface RoundResult {
  id: string;
  seriesId: string;
  seriesName: string;
  roundName: string;
  roundIndex: number;
  date: string;
  venue: string;
  raceClass: string;
  raceFormat: string;
  completed: boolean;
  raceResults: any[];
  skippers: any[];
  clubName: string;
  clubId?: string;
  dropRules?: number[] | string;
  heatManagement?: any;
  numRaces?: number;
  lastCompletedRace?: number;
}

interface StandingsRow {
  isFleetSeparator: boolean;
  fleetLabel?: string;
  position?: number;
  sailNumber: string;
  skipper: string;
  club: string;
  design: string;
  fleet?: string;
  raceCells: string[];
  gross: number;
  net: number;
}

interface EventStandings {
  raceLabels: string[];
  rows: StandingsRow[];
  hasFleets: boolean;
}

const FLEET_NAMES: Record<string, string> = {
  A: 'Gold Fleet', B: 'Silver Fleet', C: 'Bronze Fleet',
  D: 'Copper Fleet', E: 'Emerald Fleet', F: 'Pewter Fleet',
};

const computeEventStandings = (event: RaceEvent): EventStandings => {
  const isShrs = event.heatManagement?.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = event.heatManagement?.configuration?.shrsQualifyingRounds || 0;
  const skippers = event.skippers || [];
  const raceResults = event.raceResults || [];

  const resultsByRace: Record<number, any[]> = {};
  if (raceResults.length && skippers.length) {
    const hasRaceProperty = raceResults.some(r => r.race !== undefined);
    if (hasRaceProperty) {
      raceResults.forEach(result => {
        const raceNum = result.race;
        if (!resultsByRace[raceNum]) resultsByRace[raceNum] = [];
        resultsByRace[raceNum].push(result);
      });
    } else {
      let currentRace = 1;
      let skippersSeen = 0;
      raceResults.forEach(result => {
        if (!resultsByRace[currentRace]) resultsByRace[currentRace] = [];
        resultsByRace[currentRace].push({ ...result, race: currentRace });
        skippersSeen++;
        if (skippersSeen === skippers.length) { currentRace++; skippersSeen = 0; }
      });
    }
  }

  const allRaceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);
  const activeSkippers = skippers.filter(s => !s.withdrawnFromRace || typeof s.withdrawnFromRace !== 'number');
  const activeSkipperCount = activeSkippers.length;
  const raceNumbers = allRaceNumbers.filter(raceNum => {
    const rr = resultsByRace[raceNum] || [];
    const activeCount = rr.filter(result => {
      const sk = skippers[result.skipperIndex];
      if (!sk) return false;
      return !sk.withdrawnFromRace || typeof sk.withdrawnFromRace !== 'number' || raceNum < sk.withdrawnFromRace;
    }).length;
    return activeCount >= activeSkipperCount;
  });

  const totals: Record<number, { gross: number; net: number }> = {};
  const drops: Record<string, boolean> = {};

  skippers.forEach((skipper, idx) => {
    const scores = raceNumbers.map(raceNum => {
      const rr = resultsByRace[raceNum] || [];
      const result = rr.find((r: any) => r.skipperIndex === idx);
      if (!result) {
        return { race: raceNum, score: skippers.length + 1, isDNE: false, isLetterScore: false };
      }
      if (result.letterScore) {
        if ((result.letterScore === 'RDG' || result.letterScore === 'DPI' || result.letterScore === 'RDGfix') && result.customPoints !== undefined) {
          return { race: raceNum, score: result.customPoints, isDNE: false, isLetterScore: true };
        }
        const raceFinishers = rr.filter((res: any) => res.position !== null && !res.letterScore).length;
        return { race: raceNum, score: getLetterScoreValue(result.letterScore as LetterScore, raceFinishers, skippers.length), isDNE: result.letterScore === 'DNE', isLetterScore: true };
      }
      if (result.position !== null) return { race: raceNum, score: result.position, isDNE: false, isLetterScore: false };
      return { race: raceNum, score: skippers.length + 1, isDNE: false, isLetterScore: false };
    });

    const gross = scores.reduce((sum, r) => sum + r.score, 0);
    let numDrops = 0;
    const rawDropRules = event.dropRules || [4, 8, 16, 24, 32, 40];
    const dropRules = Array.isArray(rawDropRules) ? rawDropRules : [4, 8, 16, 24, 32, 40];
    for (const threshold of dropRules) {
      if (scores.length >= threshold) numDrops++;
      else break;
    }
    if (numDrops === 0) { totals[idx] = { gross, net: gross }; return; }
    const droppableScores = scores.filter(s => !s.isDNE);
    const sortedDroppable = [...droppableScores].sort((a, b) => b.score - a.score);
    sortedDroppable.slice(0, numDrops).forEach(r => { drops[`${idx}-${r.race}`] = true; });
    let net = gross;
    scores.forEach(r => { if (drops[`${idx}-${r.race}`]) net -= r.score; });
    totals[idx] = { gross, net };
  });

  const sortedSkippers = skippers.map((skipper, index) => ({
    ...skipper, index, netTotal: totals[index]?.net || 0
  })).sort((a, b) => {
    if (a.netTotal !== b.netTotal) return a.netTotal - b.netTotal;
    return a.index - b.index;
  });

  const shrsFleetMap = new Map<number, HeatDesignation>();
  if (isShrs && event.heatManagement) {
    const finalsRounds = (event.heatManagement.rounds || []).filter(r => r.round > shrsQualifyingRounds && r.completed);
    if (finalsRounds.length > 0) {
      (finalsRounds[0].heatAssignments || []).forEach(assignment => {
        (assignment.skipperIndices || []).forEach(idx => {
          shrsFleetMap.set(idx, assignment.heatDesignation);
        });
      });
    }
  }
  const shrsHasFinals = isShrs && shrsFleetMap.size > 0;

  const displaySkippers = shrsHasFinals
    ? [...sortedSkippers].sort((a, b) => {
        const fleetA = shrsFleetMap.get(a.index) || 'Z';
        const fleetB = shrsFleetMap.get(b.index) || 'Z';
        if (fleetA !== fleetB) return fleetA.localeCompare(fleetB);
        if (a.netTotal !== b.netTotal) return a.netTotal - b.netTotal;
        return a.index - b.index;
      })
    : sortedSkippers;

  const getRaceLabel = (raceNum: number) => {
    if (!isShrs) return `R${raceNum}`;
    return raceNum <= shrsQualifyingRounds ? `Q${raceNum}` : `F${raceNum - shrsQualifyingRounds}`;
  };

  const rows: StandingsRow[] = [];
  let currentFleet: string | null = null;
  let posCounter = 0;

  displaySkippers.forEach(skipper => {
    const skipperFleet = shrsHasFinals ? (shrsFleetMap.get(skipper.index) || 'Z') : null;

    if (shrsHasFinals && skipperFleet !== currentFleet) {
      currentFleet = skipperFleet;
      posCounter = 0;
      rows.push({
        isFleetSeparator: true,
        fleetLabel: FLEET_NAMES[skipperFleet!] || `Fleet ${skipperFleet}`,
        sailNumber: '', skipper: '', club: '', design: '',
        raceCells: raceNumbers.map(() => ''), gross: 0, net: 0,
      });
    }

    posCounter++;
    const raceCells = raceNumbers.map(raceNum => {
      const rr = resultsByRace[raceNum] || [];
      const result = rr.find((r: any) => r.skipperIndex === skipper.index);
      const isDropped = drops[`${skipper.index}-${raceNum}`];
      let val = '-';
      if (result) {
        if (result.letterScore) {
          val = `${getLetterScorePointsForRace(result.letterScore, raceNum, raceResults, skippers, skipper.index)}`;
        } else if (result.position !== null) {
          val = `${result.position}`;
        }
      } else {
        const skipperWithdrew = skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number' && raceNum >= skipper.withdrawnFromRace;
        if (skipperWithdrew) val = `${skippers.length + 1}`;
      }
      return isDropped ? `[${val}]` : val;
    });

    rows.push({
      isFleetSeparator: false,
      position: posCounter,
      sailNumber: skipper.sailNo || '',
      skipper: skipper.name || '',
      club: skipper.club || '',
      design: skipper.hull || skipper.boatModel || '',
      fleet: shrsHasFinals ? (skipperFleet === 'A' ? 'Gold' : skipperFleet === 'B' ? 'Silver' : skipperFleet === 'C' ? 'Bronze' : skipperFleet || '') : undefined,
      raceCells,
      gross: totals[skipper.index]?.gross || 0,
      net: totals[skipper.index]?.net || 0,
    });
  });

  return { raceLabels: raceNumbers.map(getRaceLabel), rows, hasFleets: shrsHasFinals };
};

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const triggerDownload = (content: string, mimeType: string, filename: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const buildResultsHtml = (
  standings: EventStandings,
  meta: { eventName: string; venue?: string; date?: string; raceClass?: string; clubName?: string }
): string => {
  const { raceLabels, rows, hasFleets } = standings;
  const columnCount = 5 + (hasFleets ? 1 : 0) + raceLabels.length + 2;

  const headerCells = [
    '<th class="pos">Rank</th>',
    '<th>Sail No</th>',
    '<th class="left">Skipper</th>',
    '<th class="left">Club</th>',
    '<th class="left">Design</th>',
    ...(hasFleets ? ['<th>Fleet</th>'] : []),
    ...raceLabels.map(label => `<th>${escapeHtml(label)}</th>`),
    '<th>Gross</th>',
    '<th>Nett</th>',
  ].join('');

  const bodyRows = rows.map(row => {
    if (row.isFleetSeparator) {
      return `<tr class="fleet-row"><td colspan="${columnCount}">${escapeHtml(row.fleetLabel || '')}</td></tr>`;
    }
    const cells = [
      `<td class="pos">${row.position ?? ''}</td>`,
      `<td>${escapeHtml(row.sailNumber)}</td>`,
      `<td class="left">${escapeHtml(row.skipper)}</td>`,
      `<td class="left">${escapeHtml(row.club)}</td>`,
      `<td class="left">${escapeHtml(row.design)}</td>`,
      ...(hasFleets ? [`<td>${escapeHtml(row.fleet || '')}</td>`] : []),
      ...row.raceCells.map(cell => {
        const dropped = cell.startsWith('[') && cell.endsWith(']');
        return `<td class="${dropped ? 'drop' : ''}">${escapeHtml(cell)}</td>`;
      }),
      `<td class="total">${row.gross}</td>`,
      `<td class="total nett">${row.net}</td>`,
    ].join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  const subtitleParts = [meta.raceClass, meta.venue, meta.date].filter(Boolean).map(p => escapeHtml(p as string));
  const generated = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.eventName)} - Results</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; background: #ffffff; }
  .wrap { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { color: #555; font-size: 14px; margin: 0 0 2px; }
  .club { color: #777; font-size: 13px; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #d0d0d0; padding: 6px 8px; text-align: center; white-space: nowrap; }
  th { background: #1f3a5f; color: #fff; font-weight: 600; }
  td.left, th.left { text-align: left; }
  td.pos, th.pos { font-weight: 700; }
  tbody tr:nth-child(even) { background: #f5f7fa; }
  td.drop { color: #999; }
  td.total { font-weight: 600; }
  td.nett { background: #eef3f9; }
  .fleet-row td { background: #dfe7f1; font-weight: 700; text-align: left; }
  footer { margin-top: 16px; color: #999; font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(meta.eventName)}</h1>
  ${subtitleParts.length ? `<p class="subtitle">${subtitleParts.join(' &middot; ')}</p>` : ''}
  ${meta.clubName ? `<p class="club">${escapeHtml(meta.clubName)}</p>` : ''}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
  <footer>Generated ${escapeHtml(generated)} &middot; [ ] denotes discarded score</footer>
</div>
</body>
</html>`;
};


type ResultStatus = 'completed' | 'in-progress' | 'upcoming' | 'not-scored';
/** Completed if marked done; In progress once any race is scored; otherwise Upcoming until the date passes, then Not scored. */
const getResultStatus = (item: { completed?: boolean; date?: string; raceResults?: any[]; lastCompletedRace?: number }): ResultStatus => {
  if (item.completed) return 'completed';
  if ((item.raceResults && item.raceResults.length > 0) || ((item as any).results && (item as any).results.length > 0) || (item.lastCompletedRace || 0) > 0) return 'in-progress';
  if (item.date) {
    const d = new Date(item.date); d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    if (d.getTime() >= t.getTime()) return 'upcoming';
  }
  return 'not-scored';
};
const RESULT_STATUS_LABEL: Record<ResultStatus, string> = { completed: 'Completed', 'in-progress': 'In Progress', upcoming: 'Upcoming', 'not-scored': 'Not scored' };

export const ResultsPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentClub, currentOrganization, isRaceOfficer } = useAuth();
  const { can } = usePermissions();
  const resultsRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>('events');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedResultGroups, setExpandedResultGroups] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [filterEventType, setFilterEventType] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Data
  const [allEvents, setAllEvents] = useState<RaceEvent[]>([]);
  const [allSeries, setAllSeries] = useState<RaceSeries[]>([]);
  const [simulatedEvents, setSimulatedEvents] = useState<RaceEvent[]>([]);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [clubFeaturedImage, setClubFeaturedImage] = useState<string | null>(null);
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(null);
  const [clubAbbreviation, setClubAbbreviation] = useState<string | null>(null);
  const [previousSidebarState, setPreviousSidebarState] = useState<string | null>(null);
  const [externalNationalEvents, setExternalNationalEvents] = useState<ExternalResultEvent[]>([]);
  const [externalStateEvents, setExternalStateEvents] = useState<ExternalResultEvent[]>([]);
  const [externalWorldEvents, setExternalWorldEvents] = useState<ExternalResultEvent[]>([]);
  const [stateAssociationNames, setStateAssociationNames] = useState<Record<string, string>>({});

  // Selected item for detail view
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<RaceSeries | null>(null);
  const [selectedRound, setSelectedRound] = useState<RoundResult | null>(null);
  const [selectedExternalEvent, setSelectedExternalEvent] = useState<ExternalResultEvent | null>(null);

  // Export and modal state
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showRaceReportModal, setShowRaceReportModal] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showHeatResultsModal, setShowHeatResultsModal] = useState(false);
  const [showSeriesEditModal, setShowSeriesEditModal] = useState(false);
  const [showShareExternalModal, setShowShareExternalModal] = useState(false);
  const [handicapsVisible, setHandicapsVisible] = useState(true);

  useEffect(() => {
    loadData();
    loadClubFeaturedImage();
    loadExternalResults();
  }, [currentClub]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadClubFeaturedImage = async () => {
    if (!currentClub?.clubId) return;
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('featured_image_url, logo, abbreviation')
        .eq('id', currentClub.clubId)
        .maybeSingle();

      if (!error && data) {
        if (data.logo) {
          setClubLogoUrl(data.logo);
        }
        if (data.abbreviation) {
          setClubAbbreviation(data.abbreviation);
        }
        setClubFeaturedImage(data.featured_image_url);
      }
    } catch (err) {
      console.error('Error loading club featured image:', err);
    }
  };

  const loadExternalResults = async () => {
    try {
      const { data } = await supabase
        .from('external_result_events')
        .select('id,event_name,event_date,event_end_date,venue,boat_class_raw,boat_class_mapped,competitor_count,race_count,display_category,source_url,results_json,last_scraped_at')
        .eq('is_visible', true)
        .order('event_date', { ascending: false });
      if (data) {
        setExternalNationalEvents(data.filter((e: ExternalResultEvent) => e.display_category === 'national'));
        setExternalStateEvents(data.filter((e: ExternalResultEvent) => e.display_category?.startsWith('state_')));
        setExternalWorldEvents(data.filter((e: ExternalResultEvent) => e.display_category === 'world'));
      }

      const { data: stateAssocs } = await supabase
        .from('state_associations')
        .select('id, name, abbreviation');
      if (stateAssocs) {
        const nameMap: Record<string, string> = {};
        stateAssocs.forEach((sa: any) => {
          nameMap[sa.id] = sa.abbreviation || sa.name;
        });
        setStateAssociationNames(nameMap);
      }
    } catch (err) {
      console.error('Error loading external results:', err);
    }
  };

  // Auto-collapse sidebar when viewing individual results
  useEffect(() => {
    if (id && (selectedSeries || selectedEvent || selectedRound)) {
      // We're viewing individual results - collapse sidebar
      const currentState = localStorage.getItem('sidebarCollapsed');

      // Save the current state before we change it
      if (previousSidebarState === null) {
        setPreviousSidebarState(currentState);
      }

      // Force collapse
      localStorage.setItem('sidebarCollapsed', 'true');
      window.dispatchEvent(new Event('storage'));
    } else {
      // We're not viewing results anymore - restore previous state
      if (previousSidebarState !== null) {
        if (previousSidebarState) {
          localStorage.setItem('sidebarCollapsed', previousSidebarState);
        } else {
          localStorage.removeItem('sidebarCollapsed');
        }
        window.dispatchEvent(new Event('storage'));
        setPreviousSidebarState(null);
      }
    }
  }, [id, selectedSeries, selectedEvent, selectedRound]);

  useEffect(() => {
    const navState = location.state as any;

    if (navState?.mainTab) {
      setMainTab(navState.mainTab);
    }

    if (navState?.externalEventId) {
      const allExternal = [...externalNationalEvents, ...externalStateEvents, ...externalWorldEvents];
      const extEvent = allExternal.find(e => e.id === navState.externalEventId);
      if (extEvent) {
        setSelectedExternalEvent(extEvent);
        setSelectedEvent(null);
        setSelectedSeries(null);
        setSelectedRound(null);
        return;
      }
    }

    let targetId = id;

    if (navState?.eventId) {
      targetId = navState.eventId;
    }

    if (targetId) {
      if (targetId.includes('-round-')) {
        const parts = targetId.split('-round-');
        const seriesId = parts[0];
        const roundIndex = parseInt(parts[parts.length - 1]);
        const round = roundResults.find(r => r.seriesId === seriesId && r.roundIndex === roundIndex);
        if (round) {
          setSelectedRound(round);
          setSelectedEvent(null);
          setSelectedSeries(null);
          return;
        }
      }

      if (navState?.isSeriesEvent && navState?.seriesId) {
        const series = allSeries.find(s => s.id === navState.seriesId);
        if (series) {
          setSelectedSeries(series);
          setSelectedEvent(null);
          setSelectedRound(null);
          return;
        }
      }

      const series = allSeries.find(s => s.id === targetId);
      if (series) {
        setSelectedSeries(series);
        setSelectedEvent(null);
        setSelectedRound(null);
        return;
      }

      const event = allEvents.find(e => e.id === targetId) || simulatedEvents.find(e => e.id === targetId);
      if (event) {
        setSelectedEvent(event);
        setSelectedSeries(null);
        setSelectedRound(null);
      }
    } else if (!navState?.externalEventId) {
      setSelectedEvent(null);
      setSelectedSeries(null);
      setSelectedRound(null);
    }
  }, [id, location.state, allEvents, allSeries, roundResults, externalNationalEvents, externalStateEvents, externalWorldEvents, simulatedEvents]);

  const enrichSeriesWithRoundData = async (series: RaceSeries[]): Promise<RaceSeries[]> => {
    try {
      if (!currentClub?.clubId || series.length === 0) return series;

      const seriesIds = series.map(s => s.id);
      const { data: roundsData, error: roundsError } = await supabase
        .from('race_series_rounds')
        .select('series_id, round_name, skippers, race_results, last_completed_race, completed, average_points_applied, manual_score_overrides, drop_rules, heat_management, num_races')
        .eq('club_id', currentClub.clubId)
        .in('series_id', seriesIds);

      if (roundsError || !roundsData) {
        console.error('Error fetching round data:', roundsError);
        return series;
      }

      const { data: seriesData, error: seriesError } = await supabase
        .from('race_series')
        .select('id, skippers')
        .eq('club_id', currentClub.clubId)
        .in('id', seriesIds);

      const seriesSkippersMap: Record<string, any[]> = {};
      if (seriesData && !seriesError) {
        seriesData.forEach(s => {
          seriesSkippersMap[s.id] = s.skippers || [];
        });
      }

      const roundDataMap: Record<string, any> = {};
      roundsData.forEach(round => {
        const key = `${round.series_id}-${round.round_name}`;
        roundDataMap[key] = round;
      });

      return series.map(s => ({
        ...s,
        skippers: seriesSkippersMap[s.id] || s.skippers || [],
        rounds: s.rounds.map(round => {
          const key = `${s.id}-${round.name}`;
          const roundData = roundDataMap[key];
          if (roundData) {
            const enrichedRound = {
              ...round,
              skippers: roundData.skippers || round.skippers || [],
              raceResults: roundData.race_results || round.raceResults || [],
              lastCompletedRace: roundData.last_completed_race || round.lastCompletedRace || 0,
              completed: roundData.completed !== undefined ? roundData.completed : round.completed,
              averagePointsApplied: roundData.average_points_applied || round.averagePointsApplied,
              manualScoreOverrides: roundData.manual_score_overrides || round.manualScoreOverrides,
              dropRules: roundData.drop_rules || round.dropRules,
              heatManagement: roundData.heat_management || round.heatManagement,
              numRaces: roundData.num_races || round.numRaces
            };
            // Debug log for Round 3
            if (round.name === 'Round 3') {
              console.log('=== ENRICHING ROUND 3 ===');
              console.log('DB average_points_applied:', roundData.average_points_applied);
              console.log('Final averagePointsApplied:', enrichedRound.averagePointsApplied);
            }
            return enrichedRound;
          }
          return round;
        })
      }));
    } catch (err) {
      console.error('Error enriching series:', err);
      return series;
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [events, series, venuesData] = await Promise.all([
        getStoredRaceEvents(),
        getStoredRaceSeries(),
        getStoredVenues()
      ]);

      // Also fetch approved state/national public events to display
      let publicEvents: RaceEvent[] = [];
      try {
        const approvedPublicEvents = await getPublicEvents(
          false, // only approved events
          currentOrganization?.type as 'state' | 'national' | undefined,
          currentOrganization?.id
        );

        if (approvedPublicEvents) {
          publicEvents = approvedPublicEvents.map(pe => convertToRaceEvent(pe));

          // Fetch local copies of public events (for scoring data)
          if (currentClub?.clubId) {
            try {
              const { data: localCopies } = await supabase
                .from('quick_races')
                .select('id, public_event_id, skippers, race_results, last_completed_race, completed')
                .eq('club_id', currentClub.clubId)
                .not('public_event_id', 'is', null)
                .neq('is_simulated', true);

              console.log('📋 [ResultsPage] Found', localCopies?.length || 0, 'local copies of public events');

              // Merge local copy data into public events
              if (localCopies && localCopies.length > 0) {
                publicEvents = publicEvents.map(pe => {
                  const localCopy = localCopies.find(lc => lc.public_event_id === pe.publicEventId);
                  if (localCopy) {
                    console.log(`✅ [ResultsPage] Merging local copy data for ${pe.eventName}:`, {
                      skipperCount: localCopy.skippers?.length || 0,
                      resultCount: localCopy.race_results?.length || 0,
                      lastCompletedRace: localCopy.last_completed_race || 0
                    });
                    return {
                      ...pe,
                      id: localCopy.id,
                      skippers: localCopy.skippers || pe.skippers || [],
                      raceResults: localCopy.race_results || [],
                      lastCompletedRace: localCopy.last_completed_race || 0,
                      completed: localCopy.completed || false
                    };
                  }
                  return pe;
                });
              }
            } catch (err) {
              console.error('Error fetching local copies of public events:', err);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching public events:', err);
      }

      const nonSimulatedEvents = events.filter(e => !(e as any).is_simulated);

      // Fetch simulated events separately (they are excluded from getStoredRaceEvents query)
      try {
        const simEvents = await getSimulatedRaceEvents();
        setSimulatedEvents(simEvents.filter(e => e.completed || e.lastCompletedRace > 0));
      } catch (err) {
        console.error('Error fetching simulated events:', err);
        setSimulatedEvents([]);
      }

      const allEvents = (currentOrganization?.type === 'state' || currentOrganization?.type === 'national')
        ? publicEvents
        : [...nonSimulatedEvents, ...publicEvents];

      // For state/national associations, don't show club series
      const filteredSeries = (currentOrganization?.type === 'state' || currentOrganization?.type === 'national')
        ? []
        : series;

      const enrichedSeries = await enrichSeriesWithRoundData(filteredSeries);

      // Fetch member avatars if online
      let memberAvatarMap: Record<string, string> = {};
      if (navigator.onLine && currentClub?.clubId) {
        try {
          const { data: members } = await supabase
            .from('members')
            .select('first_name, last_name, avatar_url')
            .eq('club_id', currentClub.clubId);

          if (members) {
            members.forEach(m => {
              const fullName = `${m.first_name} ${m.last_name}`.trim();
              if (m.avatar_url) {
                memberAvatarMap[fullName] = m.avatar_url;
              }
            });
          }
        } catch (error) {
          console.error('Error fetching member avatars:', error);
        }
      }

      // Enrich events with avatar URLs (including public events with merged data)
      const enrichedEvents = allEvents.map(event => ({
        ...event,
        skippers: (event.skippers || []).map(skipper => ({
          ...skipper,
          avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
        }))
      }));

      // Extract round results from series
      const rounds: RoundResult[] = [];
      enrichedSeries.forEach(s => {
        s.rounds?.forEach((round, index) => {
          const hasResults = (round.raceResults && round.raceResults.length > 0) ||
                           (round.lastCompletedRace && round.lastCompletedRace > 0);

          if (hasResults) {
            rounds.push({
              id: `${s.id}-round-${index}`,
              seriesId: s.id,
              seriesName: s.seriesName,
              roundName: round.name,
              roundIndex: index,
              date: round.date,
              venue: round.venue,
              raceClass: s.raceClass,
              raceFormat: s.raceFormat,
              completed: round.completed || false,
              raceResults: round.raceResults || [],
              lastCompletedRace: (round as any).lastCompletedRace || 0,
              skippers: (round.skippers || []).map(skipper => ({
                ...skipper,
                avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
              })),
              clubName: s.clubName,
              clubId: currentClub?.clubId,
              dropRules: round.dropRules,
              heatManagement: round.heatManagement,
              numRaces: round.numRaces
            });
          }
        });
      });

      // Enrich series-level skippers with avatar URLs
      const enrichedSeriesWithAvatars = enrichedSeries.map(series => ({
        ...series,
        skippers: (series.skippers || []).map(skipper => ({
          ...skipper,
          avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
        })),
        rounds: series.rounds.map(round => ({
          ...round,
          skippers: (round.skippers || []).map(skipper => ({
            ...skipper,
            avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
          }))
        }))
      }));

      setAllEvents(enrichedEvents);
      setAllSeries(enrichedSeriesWithAvatars);
      setRoundResults(rounds);
      setVenues(venuesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getVenueImage = (venueName: string): string | null => {
    const venue = venues.find(v => v.name === venueName);
    return venue?.image || null;
  };

  const getDefaultImage = (isSeries: boolean, series?: RaceSeries): string | null => {
    if (isSeries && series) {
      // First try club featured image
      if (clubFeaturedImage) {
        return clubFeaturedImage;
      }

      // Otherwise, find the most used venue in the series
      if (series.rounds && series.rounds.length > 0) {
        const venueCounts: Record<string, number> = {};
        series.rounds.forEach(round => {
          if (round.venue) {
            venueCounts[round.venue] = (venueCounts[round.venue] || 0) + 1;
          }
        });

        let mostUsedVenue = '';
        let highestCount = 0;
        Object.entries(venueCounts).forEach(([venue, count]) => {
          if (count > highestCount) {
            mostUsedVenue = venue;
            highestCount = count;
          }
        });

        if (mostUsedVenue) {
          return getVenueImage(mostUsedVenue);
        }
      }
    }
    return null;
  };

  const renderSkipperAvatarStack = (skippers: any[], maxVisible: number = 3) => {
    if (!skippers || skippers.length === 0) return null;

    const visibleSkippers = skippers.slice(0, maxVisible);
    const remainingCount = skippers.length - maxVisible;

    return (
      <div className="flex items-center">
        <div className="flex -space-x-2">
          {visibleSkippers.map((skipper, index) => {
            const initials = skipper.name
              ? skipper.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
              : '?';

            return (
              <div
                key={index}
                className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium border-2 border-slate-800"
                title={skipper.name}
              >
                {skipper.avatarUrl ? (
                  <img
                    src={skipper.avatarUrl}
                    alt={skipper.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
            );
          })}
          {remainingCount > 0 && (
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-medium border-2 border-slate-800">
              +{remainingCount}
            </div>
          )}
        </div>
      </div>
    );
  };

  const boatClasses = Array.from(new Set([
    ...allEvents.map(e => e.raceClass),
    ...roundResults.map(r => r.raceClass),
    ...allSeries.map(s => s.raceClass)
  ])).filter(Boolean) as string[];

  const filterItems = <T extends { eventName?: string; seriesName?: string; raceClass?: string; raceFormat?: string; completed?: boolean; date?: string; rounds?: any[]; isSeriesEvent?: boolean }>(
    items: T[],
    search: string,
    status: StatusFilter,
    year: number
  ): T[] => {
    return items.filter(item => {
      // Year filter
      if (item.date) {
        const eventDate = new Date(item.date);
        if (eventDate.getFullYear() !== year) {
          return false;
        }
      } else if (item.rounds && Array.isArray(item.rounds)) {
        const hasRoundsInYear = item.rounds.some(round => {
          if (round.date) {
            const roundDate = new Date(round.date);
            return roundDate.getFullYear() === year;
          }
          return false;
        });
        if (!hasRoundsInYear) {
          return false;
        }
      }

      // Search filter
      const name = item.eventName || item.seriesName || '';
      if (search && !name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // Status filter
      if (status === 'completed' && !item.completed) return false;
      if (status === 'in-progress' && ('seriesName' in item && !('roundName' in item) ? item.completed : getResultStatus(item) !== 'in-progress')) return false;

      // Class filter
      if (filterClass !== 'all' && item.raceClass !== filterClass) return false;

      // Format filter
      if (filterFormat !== 'all' && item.raceFormat !== filterFormat) return false;

      // Event type filter
      if (filterEventType !== 'all') {
        const isSeries = 'rounds' in item || item.isSeriesEvent || ('seriesId' in item);
        if (filterEventType === 'single' && isSeries) return false;
        if (filterEventType === 'series' && !isSeries) return false;
      }

      return true;
    });
  };

  const sortItems = <T extends { date?: string; eventName?: string; seriesName?: string; completed?: boolean; rounds?: any[] }>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
      const getDate = (item: T): string => {
        if (item.date) return item.date;
        if (item.rounds && Array.isArray(item.rounds) && item.rounds[0]) return item.rounds[0].date || '';
        return '';
      };

      switch (sortBy) {
        case 'date-asc':
          return new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime();
        case 'date-desc':
          return new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime();
        case 'name-asc': {
          const nameA = a.seriesName || a.eventName || '';
          const nameB = b.seriesName || b.eventName || '';
          return nameA.localeCompare(nameB);
        }
        case 'name-desc': {
          const nameA = a.seriesName || a.eventName || '';
          const nameB = b.seriesName || b.eventName || '';
          return nameB.localeCompare(nameA);
        }
        case 'status': {
          const statusA = a.completed ? 2 : 0;
          const statusB = b.completed ? 2 : 0;
          return statusA - statusB;
        }
        default:
          return 0;
      }
    });
  };

  // Get unique years from all events, rounds, series rounds, and external events
  const availableYears = Array.from(
    new Set([
      // Years from events and extracted round results
      ...[...allEvents, ...roundResults]
        .map(item => new Date(item.date || '').getFullYear())
        .filter(year => !isNaN(year)),
      // Years from series rounds
      ...allSeries.flatMap(series =>
        (series.rounds || [])
          .map(round => new Date(round.date || '').getFullYear())
          .filter(year => !isNaN(year))
      ),
      ...[...externalNationalEvents, ...externalStateEvents, ...externalWorldEvents]
        .map(ev => {
          if (ev.event_date) return new Date(ev.event_date).getFullYear();
          const m = ev.event_name?.match(/\b(20\d{2})\b/);
          return m ? parseInt(m[1]) : NaN;
        })
        .filter(year => !isNaN(year))
    ])
  ).sort((a, b) => b - a); // Sort descending (newest first)

  const filteredEvents = sortItems(filterItems([...allEvents, ...roundResults], searchTerm, statusFilter, selectedYear));
  const filteredSeries = sortItems(filterItems(allSeries, searchTerm, statusFilter, selectedYear));

  const getExternalEventYear = (ev: ExternalResultEvent): number | null => {
    if (ev.event_date) return new Date(ev.event_date).getFullYear();
    const yearMatch = ev.event_name?.match(/\b(20\d{2})\b/);
    if (yearMatch) return parseInt(yearMatch[1]);
    return null;
  };

  const getStateAssociationLabel = (ev: ExternalResultEvent): string | null => {
    if (!ev.display_category?.startsWith('state_')) return null;
    const assocId = ev.display_category.replace('state_', '');
    return stateAssociationNames[assocId] || null;
  };

  // Build a set of local event fingerprints (date + class keyword) to deduplicate against external results
  const localEventFingerprints = useMemo(() => {
    const prints = new Set<string>();
    const allLocalEvents = [...allEvents, ...roundResults];
    for (const ev of allLocalEvents) {
      if ((ev.raceResults?.length || 0) > 0 && ev.date) {
        const dateStr = typeof ev.date === 'string' ? ev.date.slice(0, 10) : '';
        if (dateStr) {
          prints.add(dateStr);
        }
      }
    }
    return prints;
  }, [allEvents, roundResults]);

  const filterExternalEvents = (events: ExternalResultEvent[]) => events.filter(ev => {
    const year = getExternalEventYear(ev);
    if (year !== null && year !== selectedYear) return false;
    if (year === null) return false;
    if (searchTerm && !ev.event_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    // Hide external results when a local Alfie-scored event exists on the same date
    if (ev.event_date) {
      const extDate = ev.event_date.slice(0, 10);
      if (localEventFingerprints.has(extDate)) return false;
    }
    return true;
  });

  const filteredNationalEvents = filterExternalEvents(externalNationalEvents);
  const filteredStateEvents = filterExternalEvents(externalStateEvents);
  const filteredWorldEvents = filterExternalEvents(externalWorldEvents);

  // Group series by class
  const groupedSeries = filteredSeries.reduce((acc, series) => {
    const className = series.raceClass || 'Other';
    if (!acc[className]) {
      acc[className] = [];
    }
    acc[className].push(series);
    return acc;
  }, {} as Record<string, RaceSeries[]>);

  const renderCard = (
    item: RaceEvent | RoundResult | RaceSeries,
    type: 'event' | 'round' | 'series'
  ) => {
    const isEvent = type === 'event';
    const isRound = type === 'round';
    const isSeries = type === 'series';

    const name = isEvent
      ? (item as RaceEvent).eventName || ''
      : isRound
      ? (item as RoundResult).roundName || ''
      : (item as RaceSeries).seriesName;

    const date = isEvent || isRound ? (item as RaceEvent | RoundResult).date : '';
    const venue = isEvent || isRound ? (item as RaceEvent | RoundResult).venue : '';
    const raceClass = item.raceClass || '';
    const completed = item.completed || false;
    const status = isSeries ? (completed ? 'completed' : 'in-progress') : getResultStatus(item as RaceEvent | RoundResult);

    const colors = raceClass ? boatTypeColors[raceClass] || defaultColorScheme : defaultColorScheme;
    const venueImage = venue ? getVenueImage(venue) : null;
    const seriesItem = isSeries ? (item as RaceSeries) : undefined;
    const displayImage = venueImage || getDefaultImage(isSeries, seriesItem);

    const skippers = isEvent
      ? (item as RaceEvent).skippers || []
      : isRound
      ? (item as RoundResult).skippers || []
      : [];

    const competitorsCount = isEvent
      ? (item as RaceEvent).skippers?.length || 0
      : isRound
      ? (item as RoundResult).skippers?.length || 0
      : isSeries && (item as RaceSeries).rounds
      ? (item as RaceSeries).rounds.reduce((sum, r) => sum + (r.completed ? 1 : 0), 0)
      : 0;

    const handleClick = () => {
      navigate(`/results/${item.id}`);
    };

    if (viewMode === 'grid') {
      return (
        <button
          key={item.id}
          onClick={handleClick}
          className="group relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] text-left flex flex-col"
        >
          <div className="relative h-40 flex-shrink-0 overflow-hidden bg-slate-900">
            {displayImage ? (
              <img
                src={displayImage}
                alt={venue || 'Event'}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                style={{ objectPosition: '50% 50%' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                {isSeries ? <TrendingUp className="text-slate-600" size={40} /> : <Trophy className="text-slate-600" size={40} />}
              </div>
            )}

            {completed && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/90 text-white backdrop-blur-sm">
                <CheckCircle2 size={12} />
                Completed
              </div>
            )}
            {!completed && !isSeries && (
              <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white backdrop-blur-sm ${status === 'upcoming' ? 'bg-blue-500/90' : status === 'not-scored' ? 'bg-slate-600/90' : 'bg-amber-500/90'}`}>
                <Clock size={12} />
                {RESULT_STATUS_LABEL[status]}
              </div>
            )}

            {/* Date Badge - matching dashboard style */}
            {!isSeries && date && (
              <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg">
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-900">
                    {new Date(date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                  </div>
                  <div className="text-lg font-bold text-slate-900 leading-none">
                    {new Date(date).getDate()}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4">
            {isSeries && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 mb-2">
                Series Leaderboard
              </div>
            )}
            {isRound && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 mb-2">
                Series Round
              </div>
            )}

            <h4 className="text-white font-medium mb-2 line-clamp-2 text-left">
              {isRound && `${(item as RoundResult).roundName} - ${(item as RoundResult).seriesName}`}
              {!isRound && name}
            </h4>

            <div className="flex flex-wrap gap-2 mb-3">
              {raceClass && (
                <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.darkBg} ${colors.darkText}`}>
                  {raceClass}
                </div>
              )}
              {!isSeries && (item as RaceEvent | RoundResult).raceFormat && (
                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                  {(item as RaceEvent | RoundResult).raceFormat}
                </div>
              )}
              {isSeries && (item as RaceSeries).raceFormat && (
                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                  {(item as RaceSeries).raceFormat}
                </div>
              )}
            </div>

            {date && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                <Calendar size={14} />
                <span>{formatDate(date)}</span>
              </div>
            )}
            {venue && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                <MapPin size={14} />
                <span>{venue}</span>
              </div>
            )}
            {!isSeries && skippers.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                {renderSkipperAvatarStack(skippers, 3)}
                <span className="ml-1">{skippers.length} competitors</span>
              </div>
            )}
            {isSeries && competitorsCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Users size={14} />
                <span>{competitorsCount} rounds completed</span>
              </div>
            )}
          </div>
        </button>
      );
    }

    // List view
    return (
      <button
        key={item.id}
        onClick={handleClick}
        className="group w-full flex items-center gap-4 p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 transition-all duration-200"
      >
        <div className="relative w-32 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900">
          {displayImage ? (
            <img
              src={displayImage}
              alt={venue || 'Event'}
              className="w-full h-full object-cover"
              style={{ objectPosition: '50% 50%' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              {isSeries ? <TrendingUp className="text-slate-600" size={24} /> : <Trophy className="text-slate-600" size={24} />}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            {isSeries && (
              <div className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                Series Leaderboard
              </div>
            )}
            {isRound && (
              <div className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                Series Round
              </div>
            )}
            {completed && !isSeries && (
              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300">
                <CheckCircle2 size={12} />
                Completed
              </div>
            )}
            {!completed && !isSeries && (
              <div className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status === 'upcoming' ? 'bg-blue-500/20 text-blue-300' : status === 'not-scored' ? 'bg-slate-500/20 text-slate-300' : 'bg-amber-500/20 text-amber-300'}`}>
                <Clock size={12} />
                {RESULT_STATUS_LABEL[status]}
              </div>
            )}
          </div>

          <h4 className="text-white font-medium mb-1 truncate text-left">
            {isRound && `${(item as RoundResult).roundName} - ${(item as RoundResult).seriesName}`}
            {!isRound && name}
          </h4>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            {date && (
              <div className="flex items-center gap-1">
                <Calendar size={14} />
                <span>{formatDate(date)}</span>
              </div>
            )}
            {venue && (
              <div className="flex items-center gap-1">
                <MapPin size={14} />
                <span>{venue}</span>
              </div>
            )}
            {!isSeries && skippers.length > 0 && (
              <div className="flex items-center gap-2">
                {renderSkipperAvatarStack(skippers, 3)}
                <span className="ml-1">{skippers.length} competitors</span>
              </div>
            )}
            {isSeries && competitorsCount > 0 && (
              <div className="flex items-center gap-1">
                <Users size={14} />
                <span>{competitorsCount} rounds</span>
              </div>
            )}
            {raceClass && (
              <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.darkBg} ${colors.darkText}`}>
                {raceClass}
              </div>
            )}
            {!isSeries && (item as RaceEvent | RoundResult).raceFormat && (
              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                {(item as RaceEvent | RoundResult).raceFormat}
              </div>
            )}
            {isSeries && (item as RaceSeries).raceFormat && (
              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                {(item as RaceSeries).raceFormat}
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="text-slate-400 group-hover:text-white transition-colors flex-shrink-0" size={20} />
      </button>
    );
  };

  // Export helper functions
  const handleExportJPG = async () => {
    const tempContainer = document.createElement('div');

    try {
      const event = selectedEvent || (selectedRound ? {
        ...selectedRound,
        eventName: selectedRound.roundName
      } as RaceEvent : null);

      if (!selectedSeries && !event) {
        console.log('No series or event selected for export');
        return;
      }

      // Create temporary container for export-mode rendering
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = 'fit-content';
      document.body.appendChild(tempContainer);

      // Create export div with proper structure - fit to content
      const exportDiv = document.createElement('div');
      exportDiv.style.width = 'fit-content';
      exportDiv.style.display = 'inline-block';
      tempContainer.appendChild(exportDiv);

      // Render the component in export mode
      if (selectedSeries) {
        const seriesComponent = React.createElement(SeriesResultsDisplay, {
          series: selectedSeries,
          darkMode: false,
          isExportMode: true
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(seriesComponent);
      } else if (event) {
        const displayEvent = event.multiDay && event.dayResults
          ? { ...event, raceResults: combineAllDayResults(event) }
          : event;
        const eventComponent = React.createElement(EventResultsDisplay, {
          event: displayEvent,
          darkMode: false,
          isExportMode: true,
          showHandicapsProp: handicapsVisible,
          seriesName: selectedRound?.seriesName,
          clubLogoUrl: clubLogoUrl || undefined,
          clubAbbreviation: clubAbbreviation || undefined
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(eventComponent);
      }

      // Wait for render to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(exportDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        scrollX: 0,
        scrollY: 0
      });

      const link = document.createElement('a');
      link.download = `${selectedSeries ? selectedSeries.seriesName : event?.eventName || 'race'}_results.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      console.error('Error exporting JPG:', error);
      alert(`Failed to export JPG: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Cleanup
      if (tempContainer.parentNode) {
        document.body.removeChild(tempContainer);
      }
    }
  };

  const handleExportPDF = async () => {
    const tempContainer = document.createElement('div');

    try {
      const event = selectedEvent || (selectedRound ? {
        ...selectedRound,
        eventName: selectedRound.roundName
      } as RaceEvent : null);

      if (!selectedSeries && !event) {
        console.log('No series or event selected for export');
        return;
      }

      // Create temporary container for export-mode rendering
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = 'fit-content';
      document.body.appendChild(tempContainer);

      // Create export div with proper structure - fit to content
      const exportDiv = document.createElement('div');
      exportDiv.style.width = 'fit-content';
      exportDiv.style.display = 'inline-block';
      tempContainer.appendChild(exportDiv);

      // Render the component in export mode
      if (selectedSeries) {
        const seriesComponent = React.createElement(SeriesResultsDisplay, {
          series: selectedSeries,
          darkMode: false,
          isExportMode: true
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(seriesComponent);
      } else if (event) {
        const displayEvent = event.multiDay && event.dayResults
          ? { ...event, raceResults: combineAllDayResults(event) }
          : event;
        const eventComponent = React.createElement(EventResultsDisplay, {
          event: displayEvent,
          darkMode: false,
          isExportMode: true,
          showHandicapsProp: handicapsVisible,
          seriesName: selectedRound?.seriesName,
          clubLogoUrl: clubLogoUrl || undefined,
          clubAbbreviation: clubAbbreviation || undefined
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(eventComponent);
      }

      // Wait for render to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(exportDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        scrollX: 0,
        scrollY: 0
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${selectedSeries ? selectedSeries.seriesName : event?.eventName || 'race'}_results.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Cleanup
      if (tempContainer.parentNode) {
        document.body.removeChild(tempContainer);
      }
    }
  };

  const getExportEvent = (): RaceEvent | null =>
    selectedEvent || (selectedRound ? {
      ...selectedRound,
      eventName: selectedRound.roundName,
    } as RaceEvent : null);

  const buildSeriesCsvRows = (series: RaceSeries): Record<string, any>[] => {
    const rounds = series.rounds || [];

    // Build effective skippers from rounds when series.skippers is empty
    // (mirrors SeriesResultsDisplay's effectiveSkippers logic)
    let skippers = series.skippers && series.skippers.length > 0 ? [...series.skippers] : [];
    if (skippers.length === 0) {
      const skipperMap = new Map<string, any>();
      rounds.forEach(round => {
        if (round.completed && ((round.results && round.results.length > 0) || ((round as any).raceResults && (round as any).raceResults.length > 0))) {
          (round.skippers || []).forEach((skipper: any) => {
            const sailNum = skipper.sailNumber || skipper.sailNo;
            if (sailNum && !skipperMap.has(sailNum)) skipperMap.set(sailNum, skipper);
          });
        }
      });
      skippers = Array.from(skipperMap.values());
    }

    if (skippers.length === 0) {
      return [{ Position: '', Name: 'No results available', 'Sail Number': '', Club: '', Design: '', 'Total Points': '' }];
    }

    const completedRounds = rounds.filter(r => r.completed);

    const calcRoundNet = (roundIndex: number): Record<number, number> => {
      const round = rounds[roundIndex];
      if (!round?.completed) return {};
      const roundResults = round.results || (round as any).raceResults || [];
      if (roundResults.length === 0) return {};

      const roundSkippers = round.skippers || skippers;
      const skipperCount = roundSkippers.length || skippers.length;
      const processed = roundResults.map((r: any, idx: number) => (r.race !== undefined ? r : { ...r, race: Math.floor(idx / skipperCount) + 1 }));
      const groups: Record<number, any[]> = {};
      processed.forEach((r: any) => { if (!groups[r.skipperIndex]) groups[r.skipperIndex] = []; groups[r.skipperIndex].push(r); });

      const totals: Record<number, number> = {};
      Object.entries(groups).forEach(([si, results]) => {
        const idx = parseInt(si);
        const scores = results.map((r: any) => {
          if (r.position !== null && !r.letterScore) return r.position;
          return skipperCount + 1;
        });
        const dropRules = (round.dropRules?.length ? round.dropRules : series.dropRules?.length ? series.dropRules : [4, 8, 16, 24, 32, 40]) as number[];
        let numDrops = 0;
        for (const t of dropRules) { if (scores.length >= t) numDrops++; else break; }
        if (numDrops > 0) {
          const sorted = [...scores].sort((a: number, b: number) => b - a);
          const kept = sorted.slice(numDrops);
          totals[idx] = kept.reduce((s: number, v: number) => s + v, 0);
        } else {
          totals[idx] = scores.reduce((s: number, v: number) => s + v, 0);
        }
      });
      return totals;
    };

    const sortRoundSkippers = (roundIndex: number, netScores: Record<number, number>): number[] => {
      const round = rounds[roundIndex];
      const roundResults = round?.results || (round as any)?.raceResults || [];
      return Object.entries(netScores)
        .map(([idx, net]) => ({ idx: parseInt(idx), net }))
        .sort((a, b) => {
          if (a.net !== b.net) return a.net - b.net;
          const aPos = roundResults
            .filter((r: any) => r.skipperIndex === a.idx && r.position !== null && !r.letterScore)
            .map((r: any) => r.position as number).sort((x: number, y: number) => x - y);
          const bPos = roundResults
            .filter((r: any) => r.skipperIndex === b.idx && r.position !== null && !r.letterScore)
            .map((r: any) => r.position as number).sort((x: number, y: number) => x - y);
          const maxP = Math.max(...aPos, ...bPos, 1);
          for (let p = 1; p <= maxP; p++) {
            const ac = aPos.filter((v: number) => v === p).length;
            const bc = bPos.filter((v: number) => v === p).length;
            if (ac !== bc) return bc - ac;
          }
          return a.idx - b.idx;
        })
        .map(s => s.idx);
    };

    type SkipperRow = { idx: number; merged: MergedSeriesSkipper; name: string; sailNo: string; club: string; design: string; roundPoints: (number | null)[]; total: number; positionCounts: Record<number, number> };

    const skipperRows: SkipperRow[] = mergeSeriesSkippersByName(skippers).map((skipper, idx: number) => ({
      idx,
      merged: skipper,
      name: (skipper.name || '').trim(),
      sailNo: skipper.displaySailNo,
      club: skipper.club || skipper.clubName || '',
      design: skipper.displayHull,
      roundPoints: [],
      total: 0,
      positionCounts: {},
    }));

    rounds.forEach((round, roundIndex) => {
      if (!round.completed) {
        skipperRows.forEach(sd => { sd.roundPoints[roundIndex] = null; });
        return;
      }

      const roundSkippers = round.skippers || skippers;
      const roundNetScores = calcRoundNet(roundIndex);
      const roundSorted = sortRoundSkippers(roundIndex, roundNetScores);
      const roundResults = round.results || (round as any).raceResults || [];
      const roundCompetitors = new Set(roundResults.map((r: any) => r.skipperIndex)).size;

      skipperRows.forEach(sd => {
        const roundSkipperIndex = findRoundSkipperIndex(roundSkippers, sd.merged);

        const participated = roundSkipperIndex !== -1 && roundResults.some((r: any) => r.skipperIndex === roundSkipperIndex);

        if (!participated) {
          const pts = roundCompetitors + 1;
          sd.roundPoints[roundIndex] = pts;
          sd.total += pts;
          return;
        }

        const hasAvg = round.averagePointsApplied?.[roundSkipperIndex] !== undefined;
        const hasManual = round.manualScoreOverrides?.[roundSkipperIndex] !== undefined;

        let netPoints: number;
        let position: number;

        if (hasAvg) {
          netPoints = round.averagePointsApplied![roundSkipperIndex];
          position = netPoints;
        } else if (hasManual) {
          netPoints = round.manualScoreOverrides![roundSkipperIndex];
          position = netPoints;
        } else {
          position = roundSorted.indexOf(roundSkipperIndex) + 1;
          netPoints = roundNetScores[roundSkipperIndex] ?? (roundCompetitors + 1);
        }

        if (position > 0) {
          sd.roundPoints[roundIndex] = position;
          sd.total += position;
          sd.positionCounts[position] = (sd.positionCounts[position] || 0) + 1;
        } else {
          const pts = roundCompetitors + 1;
          sd.roundPoints[roundIndex] = pts;
          sd.total += pts;
        }
      });
    });

    const numCompleted = completedRounds.length;
    const seriesDropRules = (series.dropRules?.length ? series.dropRules : [4, 8, 16, 24, 32, 40]) as number[];
    let seriesDrops = 0;
    for (const t of seriesDropRules) { if (numCompleted >= t) seriesDrops++; }

    if (seriesDrops > 0) {
      skipperRows.forEach(sd => {
        const pts = sd.roundPoints.filter((p): p is number => p !== null).sort((a, b) => b - a);
        const dropsTotal = pts.slice(0, seriesDrops).reduce((s, v) => s + v, 0);
        sd.total -= dropsTotal;
      });
    }

    skipperRows.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      for (let pos = 1; pos <= 20; pos++) {
        const ac = a.positionCounts[pos] || 0;
        const bc = b.positionCounts[pos] || 0;
        if (ac !== bc) return bc - ac;
      }
      return 0;
    });

    return skipperRows.map((sd, position) => {
      const row: Record<string, any> = {
        Position: position + 1,
        Name: sd.name,
        'Sail Number': sd.sailNo,
        Club: sd.club,
        Design: sd.design,
      };
      rounds.forEach((round, ri) => {
        const label = (round as any).roundName || (round as any).name || `Round ${ri + 1}`;
        row[label] = sd.roundPoints[ri] !== null ? sd.roundPoints[ri] : '';
      });
      row['Total Points'] = sd.total;
      return row;
    });
  };

  const buildEventCsvRows = (standings: EventStandings): Record<string, string | number>[] => {
    const { raceLabels, rows, hasFleets } = standings;
    return rows.map(row => {
      const record: Record<string, string | number> = {
        Position: row.isFleetSeparator ? '' : (row.position ?? ''),
        'Sail Number': row.sailNumber,
        Skipper: row.isFleetSeparator ? (row.fleetLabel || '') : row.skipper,
        Club: row.club,
        Design: row.design,
      };
      if (hasFleets) record['Fleet'] = row.isFleetSeparator ? '' : (row.fleet || '');
      raceLabels.forEach((label, i) => { record[label] = row.isFleetSeparator ? '' : (row.raceCells[i] ?? ''); });
      record['Gross'] = row.isFleetSeparator ? '' : row.gross;
      record['Net'] = row.isFleetSeparator ? '' : row.net;
      return record;
    });
  };

  const handleExportCSV = () => {
    try {
      const event = getExportEvent();
      if (!selectedSeries && !event) {
        console.log('No series or event selected for CSV export');
        return;
      }

      if (selectedSeries) {
        const csv = Papa.unparse(buildSeriesCsvRows(selectedSeries));
        triggerDownload(csv, 'text/csv;charset=utf-8;', `${selectedSeries.seriesName}_leaderboard_${Date.now()}.csv`);
      } else if (event) {
        const standings = computeEventStandings(event);
        const csv = Papa.unparse(buildEventCsvRows(standings));
        const eventName = event.eventName || (event as any).name || 'results';
        triggerDownload(csv, 'text/csv;charset=utf-8;', `${eventName.replace(/\s+/g, '_')}_results_${Date.now()}.csv`);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert(`Failed to export CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExportHTML = () => {
    try {
      const event = getExportEvent();
      if (!event) {
        alert('HTML export is available for individual event and round results.');
        return;
      }
      const standings = computeEventStandings(event);
      const eventName = event.eventName || (event as any).name || 'Results';
      const html = buildResultsHtml(standings, {
        eventName,
        venue: (event as any).venue,
        date: event.date ? formatDate(event.date) : undefined,
        raceClass: (event as any).raceClass,
        clubName: (event as any).clubName,
      });
      triggerDownload(html, 'text/html;charset=utf-8;', `${eventName.replace(/\s+/g, '_')}_results_${Date.now()}.html`);
    } catch (error) {
      console.error('Error exporting HTML:', error);
      alert(`Failed to export HTML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resultPodium = (item: RaceEvent | RoundResult) => {
    if (!item.completed) return [] as { name: string; avatarUrl?: string; pos: number }[];
    try {
      const st = computeEventStandings(item as unknown as RaceEvent);
      const rows = st.rows.filter(r => !r.isFleetSeparator).slice(0, 3);
      return rows.map((r, i) => ({ name: r.skipper, avatarUrl: (item.skippers || []).find((s: any) => s.name === r.skipper)?.avatarUrl, pos: i + 1 }));
    } catch {
      return [];
    }
  };

  const plInitials = (n: string) => n.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const renderResultsBoardList = (items: (RaceEvent | RoundResult)[]) => {
    if (items.length === 0) return <div className="a-card a-empty a-dim text-center" style={{ padding: 48 }}>No events found</div>;
    const open = (id: string) => navigate(`/results/${id}`);
    const inProgress = items.filter(i => getResultStatus(i) === 'in-progress');
    const groups: { key: string; series?: RaceSeries; name: string; items: (RaceEvent | RoundResult)[] }[] = [];
    const standalone: (RaceEvent | RoundResult)[] = [];
    items.forEach(i => {
      if ('seriesId' in i && (i as RoundResult).seriesId) {
        const r = i as RoundResult;
        let g = groups.find(x => x.key === r.seriesId);
        if (!g) { g = { key: r.seriesId, series: allSeries.find(s => s.id === r.seriesId), name: r.seriesName, items: [] }; groups.push(g); }
        g.items.push(i);
      } else standalone.push(i);
    });
    const dChip = (d: string) => {
      const dt = new Date(d);
      return <div className="a-dc a-dc-sm"><b>{dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</b><span>{dt.getDate()}</span></div>;
    };
    const status = (i: RaceEvent | RoundResult) => {
      const st = getResultStatus(i);
      if (st === 'completed') return <span className="a-st a-txt-g"><span className="a-light a-light-g" />Completed</span>;
      if (st === 'in-progress') return <span className="a-st a-txt-a"><span className="a-light a-light-a" />In Progress</span>;
      if (st === 'upcoming') return <span className="a-st a-txt-b"><span className="a-light a-light-b" />Upcoming</span>;
      return <span className="a-st a-mute"><span className="a-ring-dot a-ring-dot-a" />Not scored</span>;
    };
    const row = (i: RaceEvent | RoundResult, inSeries: boolean) => {
      const pod = resultPodium(i);
      const n = (i.skippers || []).length;
      const title = 'seriesId' in i ? (i as RoundResult).roundName : (i as RaceEvent).eventName;
      return (
        <div key={i.id} className="a-rrow" onClick={() => open(i.id)} role="button" tabIndex={0}>
          {i.date ? dChip(i.date) : <span />}
          <div className="min-w-0">
            <p className="a-ink m-0 text-[14.5px] font-semibold truncate">{title}</p>
            {inSeries ? (
              i.date && <p className="a-dim m-0 mt-0.5 text-[12.5px]">{new Date(i.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
            ) : (
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {i.raceClass && <span className={getBoatClassBadge(i.raceClass, true).className}>{i.raceClass}</span>}
                {i.raceFormat && <span className={getRaceFormatBadge(i.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', true).className}>{i.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}</span>}
              </div>
            )}
          </div>
          <span className="max-sm:hidden">{status(i)}</span>
          <span className="a-rrow-pod max-md:hidden">
            {pod.length > 0 ? pod.map(p => (
              <span key={p.pos} className={`a-pl a-p${p.pos}`} style={{ width: 30, height: 30 }} title={`${p.pos}. ${p.name}`}>
                <span className="a-pl-face">{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : plInitials(p.name)}</span>
                <span className="a-pl-n">{p.pos}</span>
              </span>
            )) : <span className="a-dim text-[12.5px]">{getResultStatus(i) === 'in-progress' ? 'Scoring' : ''}</span>}
          </span>
          <span className="a-mute inline-flex items-center gap-1.5 text-[12.5px] max-lg:hidden"><Users size={14} />{n} competitors</span>
          <ChevronRight size={16} className="a-dim" />
        </div>
      );
    };
    const seriesBar = (s: RaceSeries | undefined) => {
      if (!s || !s.rounds?.length) return null;
      const total = s.rounds.length;
      const done = s.rounds.filter(r => r.completed).length;
      return (
        <>
          <span className="a-segbar max-sm:hidden" aria-label={`${done} of ${total} rounds`}>
            {s.rounds.map((r, k) => <i key={k} style={r.completed ? { background: `color-mix(in srgb, #2E7BFF ${100 - Math.round((k / Math.max(1, total - 1)) * 100)}%, #FF3E9A)` } : undefined} />)}
          </span>
          <span className="a-mute text-[12.5px] whitespace-nowrap">{done === total ? `${total} rounds` : `${done} of ${total}`}</span>
        </>
      );
    };

    const yearItems = items;
    const months = (() => {
      const m: Record<number, number> = {};
      yearItems.forEach(i => { if (i.date) { const k = new Date(i.date).getMonth(); m[k] = (m[k] || 0) + 1; } });
      const max = Math.max(1, ...Object.values(m));
      return Object.entries(m).map(([k, v]) => ({ k: Number(k), v, w: (v / max) * 100 })).sort((a, b) => b.k - a.k);
    })();
    const monthName = (k: number) => new Date(2000, k, 1).toLocaleDateString('en-US', { month: 'short' });

    return (
      <div className="flex flex-wrap gap-6 items-start">
        <div className="flex flex-col gap-[18px]" style={{ flex: '999 1 640px', minWidth: 0 }}>
          {inProgress.length > 0 && statusFilter !== 'completed' && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5 px-1"><span className="a-light a-light-a" /><p className="a-cap a-txt-a m-0">In progress · finish scoring</p></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {inProgress.slice(0, 4).map(i => (
                  <div key={i.id} className="a-card flex items-center gap-3.5" style={{ padding: '14px 16px', borderColor: 'rgba(255,179,64,0.28)' }}>
                    {i.date && dChip(i.date)}
                    <div className="flex-1 min-w-0">
                      <p className="a-ink m-0 text-[14.5px] font-semibold truncate">{'seriesId' in i ? `${(i as RoundResult).roundName} - ${(i as RoundResult).seriesName}` : (i as RaceEvent).eventName}</p>
                      <p className="a-dim m-0 mt-0.5 text-[12.5px]">{(i.skippers || []).length} competitors</p>
                    </div>
                    <button onClick={() => open(i.id)} className="a-btn a-btn-p">Open</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {groups.map(g => {
            const expanded = expandedResultGroups.includes(g.key);
            const shown = expanded ? g.items : g.items.slice(0, 4);
            const hidden = g.items.length - shown.length;
            const cls = g.series?.raceClass || g.items[0]?.raceClass;
            const fmt = g.series?.raceFormat || g.items[0]?.raceFormat;
            return (
              <section key={g.key} className="a-card overflow-hidden">
                <div className="a-grp-h">
                  <span className="a-tile" style={{ width: 36, height: 36 }}><TrendingUp size={17} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="a-display a-ink m-0 text-[17px] font-semibold">{g.name}</h2>
                      {cls && <span className={getBoatClassBadge(cls, true).className}>{cls}</span>}
                      {fmt && <span className={getRaceFormatBadge(fmt === 'handicap' ? 'Handicap' : 'Scratch', true).className}>{fmt === 'handicap' ? 'Handicap' : 'Scratch'}</span>}
                    </div>
                  </div>
                  {seriesBar(g.series)}
                  {g.series && <button onClick={() => open(g.series!.id)} className="a-link text-[13px] font-medium whitespace-nowrap">Leaderboard</button>}
                </div>
                {shown.map(i => row(i, true))}
                {hidden > 0 && (
                  <button onClick={() => setExpandedResultGroups(p => [...p, g.key])} className="a-grp-more">Show {hidden} earlier {hidden === 1 ? 'round' : 'rounds'}</button>
                )}
              </section>
            );
          })}

          {standalone.length > 0 && (
            <section className="a-card overflow-hidden">
              <div className="a-grp-h">
                <span className="a-tile" style={{ width: 36, height: 36 }}><Trophy size={17} /></span>
                <div className="flex-1"><h2 className="a-display a-ink m-0 text-[17px] font-semibold">Standalone events</h2></div>
                <span className="a-mute inline-flex items-center gap-2 text-[12.5px]"><span className="a-cnt">{standalone.length}</span>events</span>
              </div>
              {standalone.map(i => row(i, false))}
            </section>
          )}
        </div>

        <aside className="a-card flex flex-col gap-[18px]" style={{ flex: '1 1 280px', maxWidth: 340, padding: 20 }}>
          <div>
            <p className="a-cap m-0">{selectedYear} season</p>
            <div className="grid grid-cols-3 gap-2.5 mt-3">
              <div><p className="a-display a-ink m-0 text-[26px] font-semibold">{items.length}</p><p className="a-dim m-0 mt-0.5 text-[12px]">Events</p></div>
              <div><p className="a-display a-ink m-0 text-[26px] font-semibold">{groups.length}</p><p className="a-dim m-0 mt-0.5 text-[12px]">Series</p></div>
              <div><p className="a-display a-txt-a m-0 text-[26px] font-semibold">{items.filter(i => getResultStatus(i) === 'in-progress').length}</p><p className="a-dim m-0 mt-0.5 text-[12px]">In progress</p></div>
            </div>
          </div>
          {months.length > 0 && (
            <>
              <div className="a-month-rule" />
              <div>
                <p className="a-cap m-0 mb-2">By month</p>
                {months.map(mo => (
                  <div key={mo.k} className="a-mo"><span style={{ width: 34 }}>{monthName(mo.k)}</span><i><s style={{ width: `${mo.w}%` }} /></i><span className="a-cnt">{mo.v}</span></div>
                ))}
              </div>
            </>
          )}
          {groups.length > 0 && (
            <>
              <div className="a-month-rule" />
              <div className="flex flex-col gap-2.5">
                <p className="a-cap m-0">Series</p>
                {groups.map(g => {
                  const total = g.series?.rounds?.length || g.items.length;
                  const done = g.series?.rounds?.filter(r => r.completed).length ?? g.items.filter(i => i.completed).length;
                  return (
                    <button key={g.key} onClick={() => g.series && open(g.series.id)} className="flex items-center gap-2.5 text-[13px] text-left">
                      <TrendingUp size={15} className="a-dim flex-shrink-0" />
                      <span className="a-ink flex-1 truncate">{g.name.replace(/\s*(Club Championship )?Series\s*-?\s*\d{4}$/i, '').replace(/\s*-\s*\d{4}$/, '')}</span>
                      <span className="a-dim whitespace-nowrap">{done === total ? `${total} rounds` : `${done} of ${total}`}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </aside>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        </div>
      );
    }

    // Viewing specific event
    if (selectedEvent) {
      const displayEvent = selectedEvent.multiDay && selectedEvent.dayResults
        ? { ...selectedEvent, raceResults: combineAllDayResults(selectedEvent) }
        : selectedEvent;

      const hasResultsData = displayEvent.skippers && displayEvent.skippers.length > 0 && displayEvent.raceResults && displayEvent.raceResults.length > 0;

      return (
        <div className="space-y-4">
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="rotate-180" size={16} />
            Back to results
          </button>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-end items-center gap-2 mb-4">
            {/* Event Details Button */}
            <button
              onClick={() => setShowEventDetails(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Trophy size={18} />
              Event Details
            </button>

            {/* Export Results Dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => hasResultsData && setShowExportDropdown(!showExportDropdown)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  hasResultsData
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download size={18} />
                <span>Export Results</span>
                <ChevronDown size={16} />
              </button>

              {showExportDropdown && hasResultsData && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      handleExportJPG();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <FileImage className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as JPG</div>
                      <div className="text-slate-400 text-xs">Download results as image</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-red-600/20">
                      <FileText className="text-red-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as PDF</div>
                      <div className="text-slate-400 text-xs">Download results as PDF document</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-green-600/20">
                      <Table className="text-green-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as CSV</div>
                      <div className="text-slate-400 text-xs">Download results as spreadsheet</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportHTML();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-amber-600/20">
                      <Globe className="text-amber-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as HTML</div>
                      <div className="text-slate-400 text-xs">Download results as web page</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Heat Results Button - Only for heat scored events */}
            {selectedEvent?.heatManagement && (
              <button
                onClick={() => setShowHeatResultsModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <GridIcon size={18} />
                Heat Results
              </button>
            )}

            {/* Share Results Button */}
            {can('reports.create') && (
              <button
                onClick={() => hasResultsData && setShowPublishModal(true)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  !hasResultsData
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
                Share Results
              </button>
            )}

            {/* Share Externally - standalone race officers */}
            {isRaceOfficer && !currentClub && (
              <button
                onClick={() => hasResultsData && setShowShareExternalModal(true)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  !hasResultsData
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-sky-600 text-white hover:bg-sky-700'
                }`}
              >
                <Globe size={18} />
                Share Externally
              </button>
            )}

            {/* Exit Button */}
            <button
              onClick={() => navigate('/results')}
              className="btn-primary-green flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors"
            >
              <XCircle size={18} />
              Exit
            </button>
          </div>

          <div ref={resultsRef}>
            <EventResultsDisplay
              event={displayEvent}
              darkMode={true}
              isExportMode={false}
              onShowHandicapsChange={setHandicapsVisible}
              onEventUpdate={(updatedEvent) => {
                setSelectedEvent(updatedEvent);
                // Also update the event in the allEvents array
                setAllEvents(prevEvents =>
                  prevEvents.map(e => e.id === updatedEvent.id ? updatedEvent : e)
                );
              }}
            />
          </div>
        </div>
      );
    }

    // Viewing specific series leaderboard
    if (selectedSeries) {
      // Check if series has any results data - either skippers at series level OR in any round
      const hasAnyResults = selectedSeries.rounds?.some(r =>
        (r.raceResults && r.raceResults.length > 0) ||
        (r.results && r.results.length > 0) ||
        (r.skippers && r.skippers.length > 0 && r.completed)
      );

      const hasSeriesData = (selectedSeries.skippers && selectedSeries.skippers.length > 0 &&
                            selectedSeries.rounds && selectedSeries.rounds.length > 0) ||
                            (hasAnyResults && selectedSeries.rounds && selectedSeries.rounds.length > 0);

      return (
        <div className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap justify-end items-center gap-2 mb-4">
            {/* Export Results Dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => hasSeriesData && setShowExportDropdown(!showExportDropdown)}
                disabled={!hasSeriesData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  hasSeriesData
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download size={18} />
                <span>Export Results</span>
                <ChevronDown size={16} />
              </button>

              {showExportDropdown && hasSeriesData && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      handleExportJPG();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <FileImage className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as JPG</div>
                      <div className="text-slate-400 text-xs">Download results as image</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-red-600/20">
                      <FileText className="text-red-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as PDF</div>
                      <div className="text-slate-400 text-xs">Download results as PDF</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-green-600/20">
                      <Table className="text-green-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as CSV</div>
                      <div className="text-slate-400 text-xs">Download results as spreadsheet</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportHTML();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-amber-600/20">
                      <Globe className="text-amber-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as HTML</div>
                      <div className="text-slate-400 text-xs">Download results as web page</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Share Results Button */}
            {can('reports.create') && (
              <button
                onClick={() => hasSeriesData && setShowPublishModal(true)}
                disabled={!hasSeriesData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  !hasSeriesData
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
                Share Results
              </button>
            )}

            {/* Edit Series Results Button */}
            <button
              onClick={() => setShowSeriesEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Edit2 size={18} />
              Edit Series
            </button>

            {/* Exit Button */}
            <button
              onClick={() => navigate('/results')}
              className="btn-primary-green flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors"
            >
              <XCircle size={18} />
              Exit
            </button>
          </div>

          <div ref={resultsRef}>
            <SeriesResultsDisplay series={selectedSeries} darkMode={true} isExportMode={false} />
          </div>
        </div>
      );
    }

    // Viewing specific round result
    if (selectedRound) {
      // Convert round to event format for display
      const roundAsEvent: RaceEvent = {
        id: selectedRound.id,
        eventName: `${selectedRound.roundName} - ${selectedRound.seriesName}`,
        clubName: selectedRound.clubName,
        date: selectedRound.date,
        venue: selectedRound.venue,
        raceClass: selectedRound.raceClass,
        raceFormat: selectedRound.raceFormat as any,
        completed: selectedRound.completed,
        raceResults: selectedRound.raceResults,
        skippers: selectedRound.skippers,
        dropRules: Array.isArray(selectedRound.dropRules) ? selectedRound.dropRules : undefined,
        heatManagement: selectedRound.heatManagement,
        numRaces: selectedRound.numRaces,
        clubId: selectedRound.clubId
      };

      const hasResultsData = roundAsEvent.skippers && roundAsEvent.skippers.length > 0 && roundAsEvent.raceResults && roundAsEvent.raceResults.length > 0;

      return (
        <div className="space-y-4">
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="rotate-180" size={16} />
            Back to results
          </button>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-end items-center gap-2 mb-4">
            {/* Event Details Button */}
            <button
              onClick={() => setShowEventDetails(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Trophy size={18} />
              Event Details
            </button>

            {/* Export Results Dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => hasResultsData && setShowExportDropdown(!showExportDropdown)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  hasResultsData
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download size={18} />
                <span>Export Results</span>
                <ChevronDown size={16} />
              </button>

              {showExportDropdown && hasResultsData && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      handleExportJPG();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <FileImage className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as JPG</div>
                      <div className="text-slate-400 text-xs">Download results as image</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-red-600/20">
                      <FileText className="text-red-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as PDF</div>
                      <div className="text-slate-400 text-xs">Download results as PDF document</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-green-600/20">
                      <Table className="text-green-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as CSV</div>
                      <div className="text-slate-400 text-xs">Download results as spreadsheet</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportHTML();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-amber-600/20">
                      <Globe className="text-amber-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as HTML</div>
                      <div className="text-slate-400 text-xs">Download results as web page</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Share Results Button */}
            {can('reports.create') && (
              <button
                onClick={() => hasResultsData && setShowPublishModal(true)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  !hasResultsData
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
                Share Results
              </button>
            )}

            {/* Exit Button */}
            <button
              onClick={() => navigate('/results')}
              className="btn-primary-green flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors"
            >
              <XCircle size={18} />
              Exit
            </button>
          </div>

          <div ref={resultsRef}>
            <EventResultsDisplay
              event={roundAsEvent}
              darkMode={true}
              isExportMode={false}
              onShowHandicapsChange={setHandicapsVisible}
              onEventUpdate={(updatedEvent) => {
                // Update the round with the new display settings
                const updatedRound = {
                  ...selectedRound,
                  ...updatedEvent
                } as RoundResult;
                setSelectedRound(updatedRound);

                // Also update the round in the roundResults array
                setRoundResults(prevRounds =>
                  prevRounds.map(r =>
                    r.seriesId === updatedRound.seriesId && r.roundIndex === updatedRound.roundIndex
                      ? updatedRound
                      : r
                  )
                );
              }}
            />
          </div>
        </div>
      );
    }

    // External event detail view
    if (selectedExternalEvent) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedExternalEvent(null)}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="rotate-180" size={16} />
            Back to results
          </button>
          <ExternalResultsDisplay event={selectedExternalEvent} darkMode={true} isExportMode={false} />
        </div>
      );
    }

    // Main list view
    const eventsToShow = mainTab === 'events' ? filteredEvents : [];
    const seriesToShow = mainTab === 'leaderboards' ? filteredSeries : [];

    const tabs: { key: MainTab; label: string; icon: React.ReactNode; count: number; show: boolean }[] = [
      { key: 'events', label: 'Individual Events & Rounds', icon: <Trophy size={15} />, count: filteredEvents.length, show: true },
      { key: 'leaderboards', label: 'Series Leaderboards', icon: <TrendingUp size={15} />, count: filteredSeries.length, show: true },
      { key: 'state', label: 'State Events', icon: <MapIcon size={15} />, count: filteredStateEvents.length, show: externalStateEvents.length > 0 },
      { key: 'national', label: 'National Events', icon: <Globe size={15} />, count: filteredNationalEvents.length, show: externalNationalEvents.length > 0 },
      { key: 'world', label: 'World Events', icon: <Globe size={15} />, count: filteredWorldEvents.length, show: externalWorldEvents.length > 0 },
      { key: 'simulated', label: 'Simulated Events', icon: <FlaskConical size={15} />, count: simulatedEvents.length, show: can('manage_races') && simulatedEvents.length > 0 },
    ];
    const statusCounts = {
      all: filterItems([...allEvents, ...roundResults], searchTerm, 'all', selectedYear).length,
      completed: filterItems([...allEvents, ...roundResults], searchTerm, 'completed', selectedYear).length,
      'in-progress': filterItems([...allEvents, ...roundResults], searchTerm, 'in-progress', selectedYear).length,
    };
    const classCounts = (() => {
      const base = [...allEvents, ...roundResults].filter(e => e.date && new Date(e.date).getFullYear() === selectedYear);
      const m: Record<string, number> = {};
      base.forEach(e => { if (e.raceClass) m[e.raceClass] = (m[e.raceClass] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    })();

    return (
      <div className="flex flex-col gap-[22px]">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Trophy size={22} /></span>
          <div className="flex-1" style={{ minWidth: 180 }}>
            <h1 className="a-display a-ink m-0 text-[32px] font-semibold leading-[1.1]">Results</h1>
            <p className="a-mute mt-0.5 text-[14px]">
              {mainTab === 'events' ? eventsToShow.length : mainTab === 'leaderboards' ? seriesToShow.length : mainTab === 'simulated' ? simulatedEvents.length : mainTab === 'national' ? filteredNationalEvents.length : mainTab === 'state' ? filteredStateEvents.length : filteredWorldEvents.length} {mainTab === 'leaderboards' ? 'leaderboards' : 'events'}
            </p>
          </div>

          <div className="a-tbar flex-wrap">
            <div className="a-field a-field-sunk" style={{ height: 36, width: 240 }}>
              <Search size={16} />
              <input type="text" placeholder="Search results, skippers…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              {searchTerm && <button onClick={() => { setSearchTerm(''); setShowSearch(false); }} className="a-dim" aria-label="Clear search"><X size={14} /></button>}
            </div>

            <div className="relative" ref={sortDropdownRef}>
              <button onClick={() => { setShowSortDropdown(!showSortDropdown); setShowFilterDropdown(false); }} className="a-tb-btn">
                <ArrowUpDown size={15} />Sort<ChevronDown size={15} className="a-dim" />
              </button>
              {showSortDropdown && (
                <div className="a-pop absolute right-0 mt-2 w-56 z-50" style={{ padding: 6 }}>
                  {[
                    { value: 'date-desc', label: 'Date (newest first)' },
                    { value: 'date-asc', label: 'Date (oldest first)' },
                    { value: 'name-asc', label: 'Name (A–Z)' },
                    { value: 'name-desc', label: 'Name (Z–A)' },
                    { value: 'status', label: 'Status' },
                  ].map((option) => (
                    <button key={option.value} onClick={() => { setSortBy(option.value as SortOption); setShowSortDropdown(false); }} className={`a-pop-item ${sortBy === option.value ? 'a-pop-item-on' : ''}`}>
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" ref={filterDropdownRef}>
              <button onClick={() => { setShowFilterDropdown(!showFilterDropdown); setShowSortDropdown(false); }} className="a-tb-btn">
                <Filter size={15} />Filters
                {(filterClass !== 'all' || filterFormat !== 'all' || filterEventType !== 'all') && <span className="a-light a-light-b" />}
              </button>
              {showFilterDropdown && (
                <div className="a-pop absolute right-0 mt-2 w-80 z-50 flex flex-col gap-3" style={{ padding: 14 }}>
                  <div>
                    <p className="a-cap mb-2">Race type</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterFormat(filterFormat === 'scratch' ? 'all' : 'scratch')} className={`a-fchip ${filterFormat === 'scratch' ? 'a-fchip-on' : ''}`}>Scratch</button>
                      <button onClick={() => setFilterFormat(filterFormat === 'handicap' ? 'all' : 'handicap')} className={`a-fchip ${filterFormat === 'handicap' ? 'a-fchip-on' : ''}`}>Handicap</button>
                    </div>
                  </div>
                  <div className="a-pop-rule" style={{ margin: 0 }} />
                  <div>
                    <p className="a-cap mb-2">Class</p>
                    <div className="flex flex-wrap gap-1.5">
                      {boatClasses.map(boatClass => (
                        <button key={boatClass} onClick={() => setFilterClass(filterClass === boatClass ? 'all' : boatClass)} className={`a-fchip ${filterClass === boatClass ? 'a-fchip-on' : ''}`}>{boatClass}</button>
                      ))}
                      {boatClasses.length === 0 && <span className="a-dim text-[12px]">No classes available</span>}
                    </div>
                  </div>
                  <div className="a-pop-rule" style={{ margin: 0 }} />
                  <div>
                    <p className="a-cap mb-2">Event type</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterEventType(filterEventType === 'single' ? 'all' : 'single')} className={`a-fchip ${filterEventType === 'single' ? 'a-fchip-on' : ''}`}><Trophy size={13} />Single events</button>
                      <button onClick={() => setFilterEventType(filterEventType === 'series' ? 'all' : 'series')} className={`a-fchip ${filterEventType === 'series' ? 'a-fchip-on' : ''}`}><Calendar size={13} />Race series</button>
                    </div>
                  </div>
                  {(filterClass !== 'all' || filterFormat !== 'all' || filterEventType !== 'all') && (
                    <button onClick={() => { setFilterClass('all'); setFilterFormat('all'); setFilterEventType('all'); }} className="a-link text-[12.5px] text-left">Clear all filters</button>
                  )}
                </div>
              )}
            </div>
            <span className="a-tb-sep" />
            <div className="a-seg" style={{ padding: 2, borderRadius: 10 }}>
              <button onClick={() => setViewMode('list')} className={`a-seg-i ${viewMode === 'list' ? 'a-seg-on' : ''}`} style={{ width: 34, height: 30, padding: 0, justifyContent: 'center', borderRadius: 8 }} aria-label="List view" title="List view"><ListIcon size={16} /></button>
              <button onClick={() => setViewMode('grid')} className={`a-seg-i ${viewMode === 'grid' ? 'a-seg-on' : ''}`} style={{ width: 34, height: 30, padding: 0, justifyContent: 'center', borderRadius: 8 }} aria-label="Grid view" title="Grid view"><GridIcon size={16} /></button>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="overflow-x-auto">
          <div className="a-seg" role="tablist" aria-label="Result types" style={{ flexWrap: 'nowrap' }}>
            {tabs.filter(t => t.show).map(t => (
              <button key={t.key} role="tab" aria-selected={mainTab === t.key} onClick={() => { setMainTab(t.key); setSelectedExternalEvent(null); }} className={`a-seg-i ${mainTab === t.key ? 'a-seg-on' : ''}`}>
                {t.icon}{t.label}<span className="a-cnt">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="a-inp font-semibold" style={{ width: 'auto', height: 36, minWidth: 92 }} aria-label="Year">
            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          <div className="a-seg" style={{ padding: 2, borderRadius: 11 }}>
            {([['all', 'All'], ['completed', 'Completed'], ['in-progress', 'In Progress']] as [StatusFilter, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setStatusFilter(k)} className={`a-seg-i ${statusFilter === k ? 'a-seg-on' : ''}`} style={{ height: 32 }}>
                {l}{mainTab === 'events' && <span className="a-cnt">{statusCounts[k]}</span>}
              </button>
            ))}
          </div>
          {mainTab === 'events' && classCounts.length > 1 && (
            <>
              <span className="a-tb-sep" style={{ margin: '0 4px' }} />
              {classCounts.slice(0, 6).map(([cls, n]) => (
                <button key={cls} onClick={() => setFilterClass(filterClass === cls ? 'all' : cls)} className={`a-fchip ${filterClass === cls ? 'a-fchip-on' : ''}`}>
                  <Sailboat size={13} />{cls}<span className="a-cnt">{n}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Results Grid/List */}
        {mainTab === 'events' && viewMode === 'list' && renderResultsBoardList(eventsToShow)}
        {mainTab === 'events' && viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {eventsToShow.length === 0 ? (
              <div className="a-dim col-span-full text-center py-12">No events found</div>
            ) : (
              eventsToShow.map(item =>
                'seriesId' in item
                  ? renderCard(item, 'round')
                  : renderCard(item, 'event')
              )
            )}
          </div>
        )}

        {mainTab === 'leaderboards' && (
          <div className="space-y-8">
            {Object.keys(groupedSeries).length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No series leaderboards found
              </div>
            ) : (
              Object.entries(groupedSeries).map(([className, seriesList]) => (
                <div key={className}>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-400" />
                    {className}
                    <span className="text-sm font-normal text-slate-400">({seriesList.length})</span>
                  </h3>
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
                    {seriesList.map(series => renderCard(series, 'series'))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {mainTab === 'simulated' && (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
            {simulatedEvents.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-400">
                No simulated events found
              </div>
            ) : (
              simulatedEvents.map(item => renderCard(item, 'event'))
            )}
          </div>
        )}

        {(mainTab === 'national' || mainTab === 'state' || mainTab === 'world') && (() => {
          const extEvents = mainTab === 'national' ? filteredNationalEvents : mainTab === 'state' ? filteredStateEvents : filteredWorldEvents;
          const accentColor = mainTab === 'national' ? 'amber' : mainTab === 'state' ? 'green' : 'orange';
          return (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
              {extEvents.length === 0 ? (
                <div className="col-span-full text-center py-12 text-slate-400">
                  No {mainTab === 'national' ? 'national' : mainTab === 'state' ? 'state' : 'world'} events found
                </div>
              ) : (
                extEvents.map(ev => {
                  if (viewMode === 'grid') {
                    const classImg = getBoatClassImage(ev.boat_class_mapped || ev.boat_class_raw);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelectedExternalEvent(ev)}
                        className="group relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] text-left flex flex-col"
                      >
                        <div className="relative h-40 flex-shrink-0 overflow-hidden bg-slate-900">
                          <img
                            src={classImg || '/results_tile.jpg'}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-slate-900/10" />
                          <div className="absolute top-2 right-2 flex items-center gap-1.5">
                            {mainTab === 'state' && getStateAssociationLabel(ev) && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-800/90 text-green-300 backdrop-blur-sm border border-green-500/30">
                                {getStateAssociationLabel(ev)}
                              </div>
                            )}
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-${accentColor}-500/90 text-white backdrop-blur-sm`}>
                              {mainTab === 'state' ? <MapIcon size={12} /> : <Globe size={12} />}
                              {mainTab === 'national' ? 'National' : mainTab === 'state' ? 'State' : 'World'}
                            </div>
                          </div>
                          {ev.event_date && (
                            <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg">
                              <div className="text-center">
                                <div className="text-xs font-semibold text-slate-900">
                                  {new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                </div>
                                <div className="text-lg font-bold text-slate-900 leading-none">
                                  {new Date(ev.event_date).getDate()}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <h4 className="text-white font-medium mb-2 line-clamp-2 text-left">{ev.event_name}</h4>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {(ev.boat_class_mapped || ev.boat_class_raw) && (
                              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                                {ev.boat_class_mapped || ev.boat_class_raw}
                              </div>
                            )}
                          </div>
                          {ev.event_date && (
                            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                              <Calendar size={14} />
                              <span>{formatDate(ev.event_date)}</span>
                            </div>
                          )}
                          {ev.venue && (
                            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                              <MapPin size={14} />
                              <span>{ev.venue}</span>
                            </div>
                          )}
                          {ev.competitor_count > 0 && (
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                              <Users size={14} />
                              <span>{ev.competitor_count} competitors</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  }
                  // List view
                  const listClassImg = getBoatClassImage(ev.boat_class_mapped || ev.boat_class_raw);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedExternalEvent(ev)}
                      className="group w-full flex items-center gap-4 p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 transition-all duration-200"
                    >
                      <div className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 ${!listClassImg ? `bg-${accentColor}-500/20` : ''}`}>
                        {listClassImg ? (
                          <img src={listClassImg} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {mainTab === 'state' ? <MapIcon className={`text-${accentColor}-400`} size={20} /> : <Globe className={`text-${accentColor}-400`} size={20} />}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <h4 className="font-medium text-white truncate">{ev.event_name}</h4>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                          {ev.event_date && <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(ev.event_date)}</span>}
                          {ev.venue && <span className="flex items-center gap-1"><MapPin size={12} />{ev.venue}</span>}
                          {ev.competitor_count > 0 && <span className="flex items-center gap-1"><Users size={12} />{ev.competitor_count} competitors</span>}
                          {(ev.boat_class_mapped || ev.boat_class_raw) && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                              {ev.boat_class_mapped || ev.boat_class_raw}
                            </span>
                          )}
                          {mainTab === 'state' && getStateAssociationLabel(ev) && (
                            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                              {getStateAssociationLabel(ev)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="text-slate-400 group-hover:text-white transition-colors flex-shrink-0" size={20} />
                    </button>
                  );
                })
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-16 lg:pl-9">
        {renderContent()}
      </div>

      {/* Modals */}
      {showEventDetails && (selectedEvent || selectedRound) && (
        <EventDetails
          event={selectedEvent || {
            ...selectedRound,
            eventName: selectedRound?.roundName,
            id: selectedRound?.id
          } as RaceEvent}
          onClose={() => setShowEventDetails(false)}
          darkMode={true}
        />
      )}

      {showRaceReportModal && (selectedSeries || selectedEvent || selectedRound) && (
        <RaceReportModal
          isOpen={showRaceReportModal}
          onClose={() => setShowRaceReportModal(false)}
          darkMode={true}
          eventId={selectedEvent?.id || selectedRound?.id || selectedSeries?.id || ''}
          eventType={selectedSeries ? 'race_series' : (selectedEvent?.isPublicEvent || selectedRound) ? 'public_event' : 'quick_race'}
          clubId={currentClub?.clubId || ''}
          eventData={{
            title: selectedSeries ? selectedSeries.seriesName : selectedRound ? `${selectedRound.roundName} - ${selectedRound.seriesName}` : (selectedEvent?.eventName || selectedEvent?.clubName || ''),
            date: selectedSeries ? (selectedSeries.rounds[0]?.date || '') : selectedRound?.date || (selectedEvent?.date || ''),
            venue: selectedSeries ? (selectedSeries.rounds[0]?.venue || '') : selectedRound?.venue || (selectedEvent?.venue || ''),
            raceClass: selectedSeries ? selectedSeries.raceClass : selectedRound?.raceClass || (selectedEvent?.raceClass || ''),
            raceFormat: selectedSeries ? selectedSeries.raceFormat : selectedRound?.raceFormat || (selectedEvent?.raceFormat || '')
          }}
          raceResults={selectedEvent?.raceResults || selectedRound?.raceResults || []}
          skippers={
            selectedEvent?.skippers ||
            selectedRound?.skippers ||
            selectedSeries?.skippers ||
            // For series, collect skippers from rounds if not at series level
            (selectedSeries?.rounds?.reduce((acc, round) => {
              if (round.completed && round.skippers) {
                const skipperMap = new Map(acc.map(s => [s.sailNo || s.sailNumber, s]));
                round.skippers.forEach((skipper: any) => {
                  const sailNum = skipper.sailNumber || skipper.sailNo;
                  if (sailNum && !skipperMap.has(sailNum)) {
                    skipperMap.set(sailNum, skipper);
                  }
                });
                return Array.from(skipperMap.values());
              }
              return acc;
            }, [] as any[]) || [])
          }
        />
      )}

      {showPublishModal && (selectedSeries || selectedEvent || selectedRound) && (
        <PublishToMetaModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          darkMode={true}
          pageName=""
          pageId=""
          eventData={{
            title: selectedSeries ? selectedSeries.seriesName : selectedRound ? `${selectedRound.roundName} - ${selectedRound.seriesName}` : (selectedEvent?.eventName || selectedEvent?.clubName || ''),
            date: selectedSeries ? (selectedSeries.rounds[0]?.date || '') : selectedRound?.date || (selectedEvent?.date || ''),
            venue: selectedSeries ? (selectedSeries.rounds[0]?.venue || '') : selectedRound?.venue || (selectedEvent?.venue || ''),
            raceClass: selectedSeries ? selectedSeries.raceClass : selectedRound?.raceClass || (selectedEvent?.raceClass || ''),
            raceFormat: selectedSeries ? selectedSeries.raceFormat : selectedRound?.raceFormat || (selectedEvent?.raceFormat || ''),
            clubId: currentClub?.clubId || selectedSeries?.clubId || selectedRound?.clubId || selectedEvent?.clubId,
            eventId: selectedEvent?.id || selectedRound?.id || selectedSeries?.id
          }}
          resultsRef={resultsRef}
          eventResults={selectedEvent?.raceResults || selectedRound?.raceResults}
          eventSkippers={selectedEvent?.skippers || selectedRound?.skippers}
          eventMedia={selectedEvent?.media || selectedRound?.media || selectedSeries?.media || []}
          showHandicaps={handicapsVisible}
        />
      )}

      {showHeatResultsModal && selectedEvent?.heatManagement && (
        <HeatRaceResultsModal
          isOpen={showHeatResultsModal}
          onClose={() => setShowHeatResultsModal(false)}
          darkMode={true}
          heatManagement={selectedEvent.heatManagement}
          skippers={selectedEvent.skippers}
          currentEvent={selectedEvent}
        />
      )}

      {/* Series Edit Modal */}
      {selectedSeries && (
        <SeriesEditModal
          isOpen={showSeriesEditModal}
          onClose={() => setShowSeriesEditModal(false)}
          series={selectedSeries}
          onSave={async (updatedSeries) => {
            // Save the updated series to storage
            await storeRaceSeries(updatedSeries);
            // Reload data to refresh the leaderboard
            await loadData();
            // Find and set the refreshed series from allSeries
            setAllSeries(prevSeries => {
              const refreshedSeries = prevSeries.find(s => s.id === updatedSeries.id);
              if (refreshedSeries) {
                setSelectedSeries(refreshedSeries);
              }
              return prevSeries;
            });
            setShowSeriesEditModal(false);
          }}
          darkMode={true}
        />
      )}

      {showShareExternalModal && (selectedEvent || selectedSeries) && (
        <ShareResultsExternalModal
          isOpen={showShareExternalModal}
          onClose={() => setShowShareExternalModal(false)}
          eventId={selectedEvent?.id || selectedSeries?.id || ''}
          eventName={selectedEvent?.eventName || selectedSeries?.seriesName || ''}
        />
      )}
    </div>
  );
};

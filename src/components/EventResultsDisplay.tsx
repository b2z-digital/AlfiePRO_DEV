import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Award, ChevronDown, ChevronUp, FileText, Edit2, Trash2, Settings } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { RaceEvent } from '../types/race';
import { formatDate } from '../utils/date';
import { LetterScore } from '../types';
import { HeatDesignation } from '../types/heat';
import { getLetterScorePointsForRace } from '../utils/scratchCalculations';
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
  seriesName?: string;
  onEventUpdate?: (event: RaceEvent) => void;
}

export const EventResultsDisplay: React.FC<EventResultsDisplayProps> = ({
  event,
  darkMode = true,
  isExportMode = false,
  seriesName,
  onEventUpdate
}) => {
  const [expandedSkipper, setExpandedSkipper] = useState<number | null>(null);
  const [raceReport, setRaceReport] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [enrichedEvent, setEnrichedEvent] = useState<RaceEvent>(event);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
  const getLetterScoreValue = (
    letterScore: LetterScore | undefined,
    numFinishers: number,
    totalCompetitors: number
  ): number => {
    if (!letterScore) return 0;

    // RRS Appendix A scoring: all letter scores = number of starters + 1
    // This ensures consistency across all scoring displays
    return totalCompetitors + 1;
  };

  // Group results by race number
  const groupResultsByRace = () => {
    const resultsByRace: Record<number, any[]> = {};
    
    if (!event.raceResults || !event.skippers) return resultsByRace;
    
    // Determine race numbers from results
    // If race property is missing, infer it from the pattern of results
    const skipperCount = event.skippers.length;
    if (skipperCount === 0) return resultsByRace;
    
    // If race property exists, use it directly
    const hasRaceProperty = event.raceResults.some(r => r.race !== undefined);
    
    if (hasRaceProperty) {
      // Group by existing race property
      event.raceResults.forEach(result => {
        const raceNum = result.race;
        if (!resultsByRace[raceNum]) {
          resultsByRace[raceNum] = [];
        }
        resultsByRace[raceNum].push(result);
      });
    } else {
      // Infer race numbers based on the pattern of results
      // Assuming results are grouped by race in order
      let currentRace = 1;
      let skippersSeen = 0;
      
      event.raceResults.forEach((result, index) => {
        if (!resultsByRace[currentRace]) {
          resultsByRace[currentRace] = [];
        }
        
        resultsByRace[currentRace].push({
          ...result,
          race: currentRace
        });
        
        skippersSeen++;
        
        // When we've seen all skippers for this race, move to the next race
        if (skippersSeen === skipperCount) {
          currentRace++;
          skippersSeen = 0;
        }
      });
    }
    
    return resultsByRace;
  };

  // Calculate totals for each skipper
  const calculateTotals = () => {
    const { skippers, raceResults } = event;
    if (!skippers || skippers.length === 0 || !raceResults || raceResults.length === 0) {
      return { totals: {}, drops: {} };
    }

    const totals: Record<number, { gross: number; net: number }> = {};
    const drops: Record<string, boolean> = {};

    // Group results by skipper
    const skipperGroups: Record<number, any[]> = {};

    // Determine race numbers from results
    const resultsByRace = groupResultsByRace();
    const allRaceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);

    // Get list of active (non-withdrawn) skippers
    const activeSkippers = skippers.filter(s => !s.withdrawnFromRace || typeof s.withdrawnFromRace !== 'number');
    const activeSkipperCount = activeSkippers.length;

    // Filter to only include COMPLETED races (where all active skippers have results)
    // This prevents phantom races like R13 from being included in scoring
    const raceNumbers = allRaceNumbers.filter(raceNum => {
      const raceResults = resultsByRace[raceNum] || [];

      // Count how many active skippers have results for this race
      const activeSkipperResultsCount = raceResults.filter(result => {
        const skipper = skippers[result.skipperIndex];
        if (!skipper) return false;

        // Skipper is active for this race if they didn't withdraw, or withdrew after this race
        const isActive = !skipper.withdrawnFromRace ||
                        typeof skipper.withdrawnFromRace !== 'number' ||
                        raceNum < skipper.withdrawnFromRace;
        return isActive;
      }).length;

      // Only include races where ALL active skippers have results
      return activeSkipperResultsCount >= activeSkipperCount;
    });
    
    // Prepare results with race numbers if missing
    const processedResults = raceResults.map((result, index) => {
      if (result.race !== undefined) return result;
      
      // Calculate race number based on index and skipper count
      const raceNum = Math.floor(index / skippers.length) + 1;
      return { ...result, race: raceNum };
    });
    
    // Group by skipper
    processedResults.forEach(result => {
      if (!skipperGroups[result.skipperIndex]) {
        skipperGroups[result.skipperIndex] = [];
      }
      skipperGroups[result.skipperIndex].push(result);
    });

    // Add withdrawn scores for skippers who withdrew
    // Only add withdrawn scores for races where at least one active skipper has results
    skippers.forEach((skipper, skipperIndex) => {
      if (skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number') {
        if (!skipperGroups[skipperIndex]) {
          skipperGroups[skipperIndex] = [];
        }

        // Find all races this skipper should have results for
        const skipperResults = skipperGroups[skipperIndex];
        const racesWithResults = new Set(skipperResults.map(r => r.race));

        // Add withdrawn results for races >= withdrawnFromRace
        // BUT only if at least one active (non-withdrawn) skipper has results for that race
        raceNumbers.forEach(raceNum => {
          if (raceNum >= skipper.withdrawnFromRace && !racesWithResults.has(raceNum)) {
            // Check if any active skipper has results for this race
            const activeSkipperHasResults = processedResults.some(result => {
              const resultSkipper = skippers[result.skipperIndex];
              if (!resultSkipper) return false;

              // Check if this is an active skipper for this race
              const isActive = !resultSkipper.withdrawnFromRace ||
                              typeof resultSkipper.withdrawnFromRace !== 'number' ||
                              raceNum < resultSkipper.withdrawnFromRace;

              return result.race === raceNum && isActive;
            });

            // Only add withdrawn score if an active skipper has sailed this race
            if (activeSkipperHasResults) {
              skipperGroups[skipperIndex].push({
                skipperIndex,
                race: raceNum,
                position: null,
                letterScore: null,
                isWithdrawn: true
              });
            }
          }
        });
      }
    });

    // Calculate drops and totals
    Object.entries(skipperGroups).forEach(([skipperIndex, results]) => {
      const idx = parseInt(skipperIndex);

      // Calculate scores for each race - but ONLY for completed races
      // Filter out any races that aren't in the raceNumbers list (e.g., incomplete races like R13)
      const scores = results
        .filter(r => raceNumbers.includes(r.race)) // Only include completed races
        .map(r => {
          if (r.position !== null && !r.letterScore) {
            return { race: r.race, score: r.position, isDNE: false, isLetterScore: false };
          }

          if (r.letterScore) {
            // Special case for RDGfix
            if (r.letterScore === 'RDGfix' && r.position !== null) {
              return { race: r.race, score: r.position, isDNE: false, isLetterScore: true };
            }

            // For RDG and DPI with custom points, use the custom points
            if ((r.letterScore === 'RDG' || r.letterScore === 'DPI') && r.customPoints !== undefined && r.customPoints !== null) {
              return {
                race: r.race,
                score: r.customPoints,
                isDNE: false,
                isLetterScore: true
              };
            }

            // Count finishers (skippers with positions, not letter scores) for standard letter scores
            const raceFinishers = processedResults
              .filter(res => res.race === r.race && res.position !== null && !res.letterScore)
              .length;

            return {
              race: r.race,
              score: getLetterScoreValue(r.letterScore as LetterScore, raceFinishers, skippers.length),
              isDNE: r.letterScore === 'DNE',
              isLetterScore: true
            };
          }

          return { race: r.race, score: skippers.length + 1, isDNE: false, isLetterScore: false }; // Default for missing results
        });

      console.log(`Skipper ${idx} (${skippers[idx]?.name}): ${scores.length} races, scores:`, scores.map(s => `R${s.race}=${s.score}`));

      // Calculate gross score
      const gross = scores.reduce((sum, r) => sum + r.score, 0);

      // Determine number of drops based on event's drop rules
      let numDrops = 0;
      const dropRules = event.dropRules || [4, 8, 16, 24, 32, 40]; // Default to HMS rules if not set

      for (const threshold of dropRules) {
        if (scores.length >= threshold) {
          numDrops++;
        } else {
          break;
        }
      }

      console.log(`Skipper ${idx} (${skippers[idx]?.name}): numDrops=${numDrops} based on ${scores.length} races and dropRules=${dropRules.join(',')}`);

      if (numDrops === 0) {
        totals[idx] = { gross, net: gross };
        return;
      }

      // Separate DNE scores (not droppable) from droppable scores
      const dneScores = scores.filter(s => s.isDNE);
      const letterScores = scores.filter(s => s.isLetterScore && !s.isDNE);
      const regularScores = scores.filter(s => !s.isLetterScore);

      // Letter scores (except DNE) and regular scores are droppable
      const droppableScores = [...letterScores, ...regularScores];

      // Sort droppable scores by worst (highest) first and drop the worst N
      const sortedDroppableScores = [...droppableScores].sort((a, b) => b.score - a.score);
      sortedDroppableScores.slice(0, numDrops).forEach(r => {
        drops[`${idx}-${r.race}`] = true;
      });

      console.log(`Skipper ${idx} (${skippers[idx]?.name}): Dropping races:`, sortedDroppableScores.slice(0, numDrops).map(r => `R${r.race}=${r.score}`));

      let net = gross;
      scores.forEach(r => {
        if (drops[`${idx}-${r.race}`]) {
          net -= r.score;
        }
      });

      totals[idx] = { gross, net };
    });
    
    return { totals, drops };
  };

  const { totals, drops } = calculateTotals();

  // Get scoring system name based on drop rules
  const getScoringSystemName = () => {
    const dropRules = event.dropRules || [4, 8, 16, 24, 32, 40];

    // Check if heat management has a scoring system specified
    if (event.heatManagement?.configuration?.scoringSystem) {
      const heatScoringSystem = event.heatManagement.configuration.scoringSystem;
      if (heatScoringSystem === 'hms') {
        return 'HMS Heat System';
      } else if (heatScoringSystem === 'shrs') {
        const mode = event.heatManagement.configuration.shrsAssignmentMode;
        return `SHR-${mode === 'preset' ? 'B' : 'P'} - Structured Heat Racing`;
      }
    }

    // Handle heat racing scoring systems (strings)
    if (typeof dropRules === 'string') {
      if (dropRules === 'hms') {
        return 'HMS Heat System';
      } else if (dropRules === 'shrs') {
        const mode = event?.heatManagement?.configuration?.shrsAssignmentMode;
        return `SHR-${mode === 'preset' ? 'B' : 'P'} - Structured Heat Racing`;
      }
    }

    // Handle array-based scoring systems
    const rulesString = JSON.stringify(dropRules);

    if (rulesString === '[]') {
      return 'No Discards';
    } else if (rulesString === '[4,8,16,24,32,40]') {
      return 'RRS - Appendix A Scoring System';
    } else if (rulesString === '[4,8,12,16,20,24,28,32,36,40]') {
      return 'Low Point System';
    } else if (Array.isArray(dropRules)) {
      return `Custom - ${dropRules.join(', ')}`;
    } else {
      return 'RRS - Appendix A Scoring System';
    }
  };

  // Countback comparison function for tied net scores
  const compareSkippersWithCountback = (a: any, b: any): number => {
    // First compare by net score (lower is better)
    if (a.netTotal !== b.netTotal) {
      return a.netTotal - b.netTotal;
    }

    // If net scores are tied, apply countback rules (excluding dropped races)
    // Count the number of 1st places, 2nd places, 3rd places, etc.
    const aPositionCounts: number[] = [];
    const bPositionCounts: number[] = [];
    let lastRaceAPosition: number | null = null;
    let lastRaceBPosition: number | null = null;

    const resultsByRaceMap = groupResultsByRace();
    const raceNums = Object.keys(resultsByRaceMap).map(Number).sort((a, b) => a - b);

    for (const raceNum of raceNums) {
      const raceResults = resultsByRaceMap[raceNum] || [];
      const aResult = raceResults.find(r => r.skipperIndex === a.index);
      const bResult = raceResults.find(r => r.skipperIndex === b.index);

      const aIsDropped = drops[`${a.index}-${raceNum}`];
      const bIsDropped = drops[`${b.index}-${raceNum}`];

      // Only count actual finishing positions (not letter scores) for countback, excluding dropped races
      if (aResult && aResult.position !== null && !aResult.letterScore && !aIsDropped) {
        aPositionCounts.push(aResult.position);
      }

      if (bResult && bResult.position !== null && !bResult.letterScore && !bIsDropped) {
        bPositionCounts.push(bResult.position);
      }

      // Track last race positions (including dropped, for final tiebreaker)
      if (aResult && aResult.position !== null && !aResult.letterScore) {
        lastRaceAPosition = aResult.position;
      }
      if (bResult && bResult.position !== null && !bResult.letterScore) {
        lastRaceBPosition = bResult.position;
      }
    }

    // Sort positions (best to worst)
    aPositionCounts.sort((x, y) => x - y);
    bPositionCounts.sort((x, y) => x - y);

    // Count how many 1sts, 2nds, 3rds, etc. each skipper has
    const maxPosition = Math.max(...aPositionCounts, ...bPositionCounts, 1);

    for (let pos = 1; pos <= maxPosition; pos++) {
      const aCount = aPositionCounts.filter(p => p === pos).length;
      const bCount = bPositionCounts.filter(p => p === pos).length;

      if (aCount !== bCount) {
        // More of this position is better (so reverse the comparison)
        return bCount - aCount;
      }
    }

    // If still tied after countback, use last race position as tiebreaker
    if (lastRaceAPosition !== null && lastRaceBPosition !== null && lastRaceAPosition !== lastRaceBPosition) {
      return lastRaceAPosition - lastRaceBPosition;
    }

    // If still tied after last race tiebreaker, maintain original order
    return a.index - b.index;
  };

  // Sort skippers by net total with countback for ties
  const sortedSkippers = enrichedEvent.skippers ? [...enrichedEvent.skippers].map((skipper, index) => ({
    ...skipper,
    index,
    netTotal: totals[index]?.net || 0
  })).sort(compareSkippersWithCountback) : [];

  const isShrs = event.heatManagement?.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = event.heatManagement?.configuration?.shrsQualifyingRounds || 0;

  const shrsFleetMap = (() => {
    if (!isShrs || !event.heatManagement) return new Map<number, HeatDesignation>();
    const map = new Map<number, HeatDesignation>();
    const finalsRounds = event.heatManagement.rounds
      .filter(r => r.round > shrsQualifyingRounds && r.completed);
    if (finalsRounds.length === 0) return map;
    finalsRounds[0].heatAssignments.forEach(assignment => {
      assignment.skipperIndices.forEach(idx => {
        map.set(idx, assignment.heatDesignation);
      });
    });
    return map;
  })();

  const shrsHasFinals = isShrs && shrsFleetMap.size > 0;

  const shrsFleetSortedSkippers = shrsHasFinals
    ? [...sortedSkippers].sort((a, b) => {
        const fleetA = shrsFleetMap.get(a.index) || 'Z';
        const fleetB = shrsFleetMap.get(b.index) || 'Z';
        if (fleetA !== fleetB) return fleetA.localeCompare(fleetB);
        return compareSkippersWithCountback(a, b);
      })
    : sortedSkippers;

  const displaySkippers = shrsHasFinals ? shrsFleetSortedSkippers : sortedSkippers;

  const SHRS_FLEET_NAMES: Record<string, string> = {
    'A': 'Gold Fleet', 'B': 'Silver Fleet', 'C': 'Bronze Fleet',
    'D': 'Copper Fleet', 'E': 'Fleet E', 'F': 'Fleet F',
  };
  const SHRS_FLEET_COLORS: Record<string, { border: string; text: string; bg: string; exportBorder: string; exportText: string; exportBg: string }> = {
    'A': { border: 'border-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/10', exportBorder: '#b8960c', exportText: '#ffffff', exportBg: '#c9a70c' },
    'B': { border: 'border-slate-400', text: 'text-slate-300', bg: 'bg-slate-400/10', exportBorder: '#8a8a8a', exportText: '#ffffff', exportBg: '#a8a8a8' },
    'C': { border: 'border-amber-600', text: 'text-amber-500', bg: 'bg-amber-700/10', exportBorder: '#8B5E2F', exportText: '#ffffff', exportBg: '#b87a3d' },
    'D': { border: 'border-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', exportBorder: '#f97316', exportText: '#ffffff', exportBg: '#f97316' },
    'E': { border: 'border-pink-500', text: 'text-pink-400', bg: 'bg-pink-500/10', exportBorder: '#ec4899', exportText: '#ffffff', exportBg: '#ec4899' },
    'F': { border: 'border-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500/10', exportBorder: '#06b6d4', exportText: '#ffffff', exportBg: '#06b6d4' },
  };

  const getShrsRaceLabel = (raceNum: number): string => {
    if (!isShrs) return `R${raceNum}`;
    if (raceNum <= shrsQualifyingRounds) return `Q${raceNum}`;
    return `F${raceNum - shrsQualifyingRounds}`;
  };

  const isShrsFinalsRace = (raceNum: number): boolean => {
    return isShrs && raceNum > shrsQualifyingRounds;
  };

  // Get the maximum race number
  const resultsByRace = groupResultsByRace();
  const allRaceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);

  // Get list of active (non-withdrawn) skippers
  const activeSkippers = enrichedEvent.skippers?.filter(s => !s.withdrawnFromRace || typeof s.withdrawnFromRace !== 'number') || [];
  const activeSkipperCount = activeSkippers.length;

  console.log('Total skippers:', enrichedEvent.skippers?.length);
  console.log('Active skippers:', activeSkipperCount);
  console.log('Withdrawn skippers:', enrichedEvent.skippers?.filter(s => s.withdrawnFromRace && typeof s.withdrawnFromRace === 'number').map(s => ({ name: s.name, withdrawnFromRace: s.withdrawnFromRace })));

  // Show all races, but exclude races that have NO active skipper results or incomplete races
  const raceNumbers = allRaceNumbers.filter(raceNum => {
    const raceResults = resultsByRace[raceNum] || [];

    // Count how many active skippers have results for this race
    // Active skippers are those who haven't withdrawn, or haven't withdrawn yet at this race
    const activeSkipperResultsCount = raceResults.filter(result => {
      const skipper = enrichedEvent.skippers?.[result.skipperIndex];
      if (!skipper) return false;

      // Skipper is active for this race if they didn't withdraw, or withdrew after this race
      const isActive = !skipper.withdrawnFromRace ||
                      typeof skipper.withdrawnFromRace !== 'number' ||
                      raceNum < skipper.withdrawnFromRace;
      return isActive;
    }).length;

    console.log(`Race ${raceNum}: ${activeSkipperResultsCount} out of ${activeSkipperCount} active skippers have results`);

    // Show the race only if ALL active skippers have results
    // This prevents showing partially completed races like R13
    return activeSkipperResultsCount >= activeSkipperCount;
  });

  console.log('Races to display:', raceNumbers);

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
  const exportThStyle: React.CSSProperties = isExportMode ? { backgroundColor: '#12192a', color: 'white' } : {};
  const exportSubThStyle: React.CSSProperties = isExportMode ? { backgroundColor: '#12192a', color: '#aaa', height: '28px', lineHeight: '28px' } : {};

  return (
    <div className={`${isExportMode ? 'bg-white text-black' : 'bg-slate-800'} p-6 rounded-lg ${containerClass}`}>
      {isExportMode ? (
        <>
          <div className="event-title">
            {event.eventName || event.clubName}
          </div>
          {seriesName ? (
            <div className="event-series-name">
              {seriesName}
            </div>
          ) : (
            <div className="event-subtitle">
              {event.raceClass} - {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
            </div>
          )}
          <div className="event-details">
            {formatDate(event.date)} - {event.venue}
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
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              title="Score Display Settings"
            >
              <Settings size={18} />
              <span className="text-sm">Score Display Settings</span>
            </button>
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
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white rounded-lg font-medium transition-all shadow-lg text-sm flex items-center gap-2"
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
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-0 z-20 px-3 py-3 text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Pos</th>
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[60px] z-20 px-3 py-3 text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '70px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Sail</th>
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[120px] z-20 px-3 py-3 text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '135px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Skipper</th>
              {showClub && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[255px] z-20 px-3 py-3 text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '75px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Club</th>
              )}
              {showClubState && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`px-3 py-3 text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '75px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>State</th>
              )}
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`sticky left-[330px] z-20 px-3 py-3 text-sm font-bold uppercase tracking-wider ${isExportMode ? '' : 'text-blue-200 bg-gradient-to-r from-slate-700 to-slate-800'}`} style={{ minWidth: '90px', boxShadow: '2px 0 4px rgba(0,0,0,0.1)', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Design</th>
              {showCategory && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`px-3 py-3 text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Category</th>
              )}
              {shrsHasFinals && (
                <th rowSpan={needsTwoRows ? 2 : undefined} className={`px-3 py-3 text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '50px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Fleet</th>
              )}
              {row1Races.map(raceNum => (
                <th key={raceNum} className={`px-3 py-3 text-sm font-bold uppercase tracking-wider text-center ${
                  isShrsFinalsRace(raceNum)
                    ? isExportMode ? '' : 'text-yellow-300'
                    : isExportMode ? '' : 'text-blue-200'
                }`} style={{ minWidth: '60px', ...exportThStyle }}>{getShrsRaceLabel(raceNum)}</th>
              ))}
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`px-3 py-3 text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Gross</th>
              <th rowSpan={needsTwoRows ? 2 : undefined} className={`px-3 py-3 text-sm font-bold uppercase tracking-wider text-center ${isExportMode ? '' : 'text-blue-200'}`} style={{ minWidth: '60px', ...exportThStyle, ...(needsTwoRows ? { verticalAlign: 'middle' } : {}) }}>Net</th>
            </tr>
            {needsTwoRows && (
              <tr className={isExportMode ? '' : 'bg-gradient-to-r from-slate-700 to-slate-800'}>
                {row2Races.map(raceNum => (
                  <th key={raceNum} className={`px-3 py-3 text-sm font-bold uppercase tracking-wider text-center ${
                    isShrsFinalsRace(raceNum)
                      ? isExportMode ? '' : 'text-yellow-300'
                      : isExportMode ? '' : 'text-blue-200'
                  }`} style={{ minWidth: '60px', ...exportThStyle }}>{getShrsRaceLabel(raceNum)}</th>
                ))}
              </tr>
            )}
            {/* Scratch bonus row - shows handicap seconds carried over when scratch boats finish in top 3 */}
            {event.raceFormat === 'handicap' && !needsTwoRows && (
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

                  // Calculate current handicaps for all skippers at the start of this race
                  const currentHcaps = (event.skippers || []).map((skipper, idx) => {
                    if (raceNum === 1) return skipper.startHcap || 0;

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

                  // Find scratch boats in top 3
                  const positions = raceData
                    .filter(r => r.position !== null || r.letterScore === 'RDGfix')
                    .map(r => ({
                      position: r.position,
                      skipperIndex: r.skipperIndex,
                      skipperName: event.skippers?.[r.skipperIndex]?.name || '',
                      isOnScratch: currentHcaps[r.skipperIndex] <= 10
                    }))
                    .sort((a, b) => (a.position || 999) - (b.position || 999));

                  const bestScratchInTop3 = positions
                    .filter(p => p.isOnScratch && p.position && p.position >= 1 && p.position <= 3)
                    .sort((a, b) => (a.position || 999) - (b.position || 999))[0];

                  let scratchBoatBonus = 0;
                  if (bestScratchInTop3 && bestScratchInTop3.position) {
                    const scratchBoatHandicap = currentHcaps[bestScratchInTop3.skipperIndex];
                    const baseBonus = 30 - scratchBoatHandicap;
                    if (bestScratchInTop3.position === 1) scratchBoatBonus = baseBonus;
                    else if (bestScratchInTop3.position === 2) scratchBoatBonus = Math.max(0, baseBonus - 10);
                    else if (bestScratchInTop3.position === 3) scratchBoatBonus = Math.max(0, baseBonus - 20);
                  }

                  return (
                    <th key={raceNum} className={`text-center px-2 py-1 ${isExportMode ? '' : 'text-slate-400'}`} style={exportSubThStyle}>
                      {scratchBoatBonus > 0 && bestScratchInTop3 && bestScratchInTop3.position && (
                        <div
                          className="text-[10px]"
                          style={{ fontStyle: 'italic', fontWeight: 'normal', color: isExportMode ? '#aaa' : undefined }}
                          title={`${bestScratchInTop3.skipperName} finished ${bestScratchInTop3.position}${bestScratchInTop3.position === 1 ? 'st' : bestScratchInTop3.position === 2 ? 'nd' : 'rd'} on scratch`}
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
                  style={isExportMode ? { backgroundColor: '#ffffff' } : undefined}
                >
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-0 z-10 px-3 py-1.5 ${isExportMode ? 'text-black bg-white' : 'text-white bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} font-semibold`}
                  style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', height: '32px', verticalAlign: 'middle', fontSize: '13px', fontWeight: 600 } : undefined}
                >
                  <div className="flex items-center gap-2">
                    {!isExportMode && (
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
                </td>
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-[60px] z-10 px-3 py-1.5 ${isExportMode ? 'text-black bg-white' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} font-semibold`}
                  style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', height: '32px', verticalAlign: 'middle', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' } : undefined}
                >
                  {showCountry && skipper.country ? `${abbreviateCountry(skipper.country)} ` : ''}{skipper.sailNo}
                </td>
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-[120px] z-10 px-3 py-1.5 ${isExportMode ? 'text-black bg-white' : 'text-white bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} text-left font-semibold`}
                  style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', height: '32px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } : undefined}
                >
                  <div className="flex items-center gap-2">
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
                    className={`sticky left-[255px] z-10 px-3 py-1.5 ${isExportMode ? 'text-black bg-white' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'} font-semibold`}
                    style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', height: '32px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', fontWeight: 600 } : undefined}
                  >
                    {getClubAbbreviation(skipper)}
                  </td>
                )}
                {showClubState && (
                  <td
                    rowSpan={needsTwoRows ? 2 : undefined}
                    className={`px-3 py-1.5 font-semibold ${isExportMode ? 'text-black bg-white' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'}`}
                    style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', height: '32px', verticalAlign: 'middle', fontWeight: 600 } : undefined}
                  >
                    {skipper.clubState || ''}
                  </td>
                )}
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`sticky left-[330px] z-10 px-3 py-1.5 font-semibold ${isExportMode ? 'text-black bg-white' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'}`}
                  style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', boxShadow: '2px 0 4px rgba(0,0,0,0.1)', height: '32px', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '12px', fontWeight: 600 } : { boxShadow: '2px 0 4px rgba(0,0,0,0.1)' }}
                >
                  {getHullDesign(skipper)}
                </td>
                {showCategory && (
                  <td
                    rowSpan={needsTwoRows ? 2 : undefined}
                    className={`px-3 py-1.5 text-center font-semibold ${isExportMode ? 'text-black bg-white' : 'text-slate-300 bg-slate-800'} ${position % 2 === 0 ? '' : isExportMode ? '' : 'bg-slate-700/50'}`}
                    style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', height: '32px', verticalAlign: 'middle', fontWeight: 600 } : undefined}
                  >
                    {abbreviateCategory(skipper.category)}
                  </td>
                )}
                {shrsHasFinals && (
                  <td
                    rowSpan={needsTwoRows ? 2 : undefined}
                    className={`px-3 py-1.5 text-center text-xs font-bold ${
                      SHRS_FLEET_COLORS[skipperFleet!]?.text || (isExportMode ? '' : 'text-slate-400')
                    }`}
                    style={isExportMode ? {
                      backgroundColor: '#ffffff',
                      color: '#000',
                      height: '32px',
                      verticalAlign: 'middle',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    } : undefined}
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
                  if (letterScore) {
                    // Show points for letter scores (with custom points support for RDG/DPI)
                    displayValue = getLetterScorePointsForRace(letterScore, raceNum, event.raceResults || [], event.skippers || [], skipper.index);
                  } else if (position !== null) {
                    displayValue = position;
                  } else if (withdrawnScore !== null) {
                    displayValue = withdrawnScore;
                  }

                  return (
                    <td
                      key={raceNum}
                      className={`px-3 py-1.5 text-center font-semibold ${
                        isDropped
                          ? isExportMode ? 'dropped-score' : 'text-red-400 line-through'
                          : isExportMode ? '' : 'text-slate-300'
                      } ${event.raceFormat === 'handicap' && !letterScore ? 'split-cell' : ''}`}
                      style={isExportMode ? {
                        backgroundColor: isDropped ? '#848484' : '#ffffff',
                        color: isDropped ? '#ffffff' : '#000',
                        padding: '2px 8px',
                        height: '32px',
                        verticalAlign: 'middle',
                        fontWeight: 600
                      } : undefined}
                    >
                      {letterScore ? (
                        (() => {
                          const points = getLetterScorePointsForRace(letterScore, raceNum, event.raceResults || [], event.skippers || [], skipper.index);
                          return <span>{points}</span>;
                        })()
                      ) : event.raceFormat === 'handicap' && (position || withdrawnScore) ? (
                        isExportMode ? (
                          <div style={{
                            position: 'relative',
                            width: '100%',
                            height: '44px',
                            margin: '0',
                            padding: '0'
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
                              top: '4px',
                              right: '6px',
                              fontSize: '10px',
                              fontWeight: '600',
                              color: isDropped ? '#ffffff' : '#333333',
                              lineHeight: '1',
                              zIndex: 3
                            }}>
                              {raceHandicap !== null ? `${raceHandicap}s` : ''}
                            </span>
                            {/* Position at bottom-left */}
                            <span style={{
                              position: 'absolute',
                              bottom: '12px',
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
                        <span>{withdrawnScore}</span>
                      ) : (
                        <span>{position || '-'}</span>
                      )}
                    </td>
                  );
                })}
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`px-3 py-1.5 text-center font-semibold ${isExportMode ? 'text-black' : 'text-slate-300'}`}
                  style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', height: '32px', verticalAlign: 'middle', fontSize: '13px', fontWeight: 600 } : undefined}
                >
                  {totals[skipper.index]?.gross ? Number(totals[skipper.index].gross.toFixed(1)) : 0}
                </td>
                <td
                  rowSpan={needsTwoRows ? 2 : undefined}
                  className={`px-3 py-1.5 text-center font-bold ${isExportMode ? 'net-total' : 'text-blue-400'}`}
                  style={isExportMode ? { backgroundColor: '#ffffff', color: '#000', fontWeight: 'bold', height: '32px', verticalAlign: 'middle', fontSize: '13px' } : undefined}
                >
                  {totals[skipper.index]?.net ? Number(totals[skipper.index].net.toFixed(1)) : 0}
                </td>
              </tr>
              {needsTwoRows && (
                <tr style={isExportMode ? { backgroundColor: '#ffffff' } : undefined}>
                  {row2Races.map(raceNum => {
                    const { position: pos, letterScore: ls } = getPositionForRace(raceNum, skipper.index);
                    const isDropped = drops[`${skipper.index}-${raceNum}`];
                    const skipperWithdrewAtRace = skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number' && raceNum >= skipper.withdrawnFromRace;
                    const skipperWithdrawn = skipperWithdrewAtRace && pos === null && !ls;
                    const withdrawnScore = skipperWithdrawn ? (enrichedEvent.skippers?.length || 0) + 1 : null;
                    let displayVal: string | number = '-';
                    if (ls) {
                      displayVal = getLetterScorePointsForRace(ls, raceNum, event.raceResults || [], event.skippers || [], skipper.index);
                    } else if (pos !== null) {
                      displayVal = pos;
                    } else if (withdrawnScore !== null) {
                      displayVal = withdrawnScore;
                    }
                    return (
                      <td
                        key={raceNum}
                        className={`px-3 py-1.5 text-center font-semibold ${
                          isDropped ? isExportMode ? 'dropped-score' : 'text-red-400 line-through' : isExportMode ? '' : 'text-slate-300'
                        }`}
                        style={isExportMode ? {
                          backgroundColor: isDropped ? '#848484' : '#ffffff',
                          color: isDropped ? '#ffffff' : '#000',
                          padding: '2px 8px',
                          height: '32px',
                          verticalAlign: 'middle',
                          fontWeight: 600
                        } : undefined}
                      >
                        <span>{displayVal}</span>
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

      {/* Scoring System Display */}
      <div className="mt-4 px-4 flex justify-end">
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
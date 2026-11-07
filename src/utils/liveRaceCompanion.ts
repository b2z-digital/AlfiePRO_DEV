import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { resolveSeriesRound, getRaceStatusEventId } from './livestreamEventIds';
import { getRaceStatus } from './liveTrackingStorage';
import { calculateEventStandings } from './standingsCalculator';
import type { RaceEvent } from '../types/race';

/**
 * What scoring is doing for a broadcast's linked race, for viewers: the race being
 * sailed, its finishing order, standings and each race's winner. Read straight from
 * the scoring tables, so it only shows what the viewer is allowed to read (series
 * rounds are visible to the club's members).
 */

export interface CompanionBoat { index: number; sail: string; name: string; hull: string }
export interface CompanionPlace extends CompanionBoat { position: number }
export interface CompanionStanding extends CompanionBoat { rank: number; net: number | null }

export interface RaceCompanion {
  /** The race being sailed, or the last one when racing is done */
  race: number;
  raceLabel: string;
  status: string;
  statusLabel: string;
  statusNotes: string | null;
  finishers: CompanionPlace[];
  stillRacing: CompanionBoat[];
  total: number;
  /** Null for heat racing, where standings need the heat system */
  standings: CompanionStanding[] | null;
  racesDone: number;
  winners: Record<number, CompanionBoat | null>;
  heatRacing: boolean;
}

const COLUMNS = 'skippers, race_results, last_completed_race, heat_management, drop_rules, race_format, completed';

export function companionStatusLabel(status: string): string {
  return status === 'live' || status === 'in_progress' ? 'Racing'
    : status === 'on_hold' ? 'On hold'
    : status === 'completed_for_day' ? 'Done for today'
    : status === 'event_complete' || status === 'completed' ? 'Finished'
    : '';
}

export async function loadRaceCompanion(eventId: string): Promise<RaceCompanion | null> {
  const round = await resolveSeriesRound(eventId);
  let row: any = null;
  if (round) {
    if (!round.roundId) return null;
    const { data } = await supabase.from('race_series_rounds').select(COLUMNS).eq('id', round.roundId).maybeSingle();
    row = data;
  } else {
    const { data } = await supabase.from('quick_races').select(COLUMNS).eq('id', eventId).maybeSingle();
    row = data;
  }
  if (!row) return null;

  const statusData = await getRaceStatusEventId(eventId).then(getRaceStatus).catch(() => null);
  const status = statusData?.status || (row.completed ? 'event_complete' : '');

  const boats: CompanionBoat[] = (Array.isArray(row.skippers) ? row.skippers : []).map((s: any, index: number) => ({
    index,
    sail: String(s?.sailNo ?? s?.sail_number ?? s?.sailNumber ?? ''),
    name: s?.name || s?.skipper_name || '',
    hull: s?.hull || s?.boatModel || '',
  }));
  const results: any[] = Array.isArray(row.race_results) ? row.race_results : [];
  const lastCompleted = Number(row.last_completed_race) || 0;
  const hm = row.heat_management as any;
  const heatRacing = !!((hm?.rounds?.length) || (hm?.heats?.length));
  const doneForNow = status === 'completed_for_day' || status === 'event_complete' || !!row.completed;
  const race = doneForNow ? Math.max(1, lastCompleted) : lastCompleted + 1;

  const finishers: CompanionPlace[] = results
    .filter(r => Number(r?.race) === race && typeof r?.position === 'number' && r.position > 0 && boats[r.skipperIndex])
    .sort((a, b) => a.position - b.position)
    .map(r => ({ ...boats[r.skipperIndex], position: r.position }));
  const finished = new Set(finishers.map(f => f.index));
  const stillRacing = doneForNow ? [] : boats.filter(b => !finished.has(b.index));

  const winners: Record<number, CompanionBoat | null> = {};
  for (let r = 1; r <= lastCompleted; r++) {
    const w = results.find(x => Number(x?.race) === r && x?.position === 1);
    winners[r] = w && boats[w.skipperIndex] ? boats[w.skipperIndex] : null;
  }

  let standings: CompanionStanding[] | null = null;
  if (!heatRacing && lastCompleted > 0 && boats.length) {
    try {
      const sorted = calculateEventStandings({
        skippers: row.skippers,
        raceResults: results,
        // Missing drop rules fall back to the scoring default, as on the results page
        dropRules: Array.isArray(row.drop_rules) && row.drop_rules.length ? row.drop_rules : undefined,
        raceFormat: row.race_format,
      } as unknown as RaceEvent);
      standings = sorted.map((s: any, i: number) => ({
        ...(boats[s.index] || { index: s.index, sail: '', name: s.name || '', hull: '' }),
        rank: i + 1,
        net: Number.isFinite(s.netTotal) && s.netTotal < Number.MAX_SAFE_INTEGER ? s.netTotal : null,
      }));
    } catch (err) {
      console.warn('[liveRaceCompanion] Standings unavailable', err);
    }
  }

  return {
    race,
    raceLabel: `Race ${race}`,
    status,
    statusLabel: companionStatusLabel(status),
    statusNotes: statusData?.notes ?? null,
    finishers,
    stillRacing,
    total: boats.length,
    standings,
    racesDone: lastCompleted,
    winners,
    heatRacing,
  };
}

/** Keeps a broadcast's race companion fresh (every 10 seconds) while it's on screen. */
export function useRaceCompanion(eventId: string | null | undefined) {
  const [data, setData] = useState<RaceCompanion | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setData(null);
    setLoaded(false);
    if (!eventId) { setLoaded(true); return; }
    let cancelled = false;
    const load = () => loadRaceCompanion(eventId)
      .then(result => { if (!cancelled) { setData(result); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    load();
    const timer = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [eventId]);
  return { companion: data, loaded };
}

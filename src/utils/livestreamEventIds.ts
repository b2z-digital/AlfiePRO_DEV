import { supabase } from './supabase';

/**
 * A livestream can be linked to a series round in two ways:
 *  - "<seriesId>-<roundIndex>", the id scoring and the race calendar use for a round
 *  - the round's own row id in race_series_rounds (older Live setup wizard links)
 * These helpers translate between the two so overlays, race status and event
 * lookups work whichever one a session was saved with.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const SERIES_ROUND_RE = new RegExp(`^(${UUID})-(\\d+)$`, 'i');

export interface SeriesRoundRef {
  /** "<seriesId>-<roundIndex>" */
  eventId: string;
  seriesId: string;
  roundIndex: number;
  /** race_series_rounds.id, when the round row exists */
  roundId: string | null;
}

export function parseSeriesRoundEventId(eventId: string): { seriesId: string; roundIndex: number } | null {
  const m = SERIES_ROUND_RE.exec(eventId || '');
  return m ? { seriesId: m[1], roundIndex: parseInt(m[2], 10) } : null;
}

export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

/** Finds the series round an event id points at, or null for anything else (quick races, public events). */
export async function resolveSeriesRound(eventId: string | null | undefined): Promise<SeriesRoundRef | null> {
  if (!eventId) return null;
  try {
    const parsed = parseSeriesRoundEventId(eventId);
    if (parsed) {
      const { data } = await supabase
        .from('race_series_rounds')
        .select('id')
        .eq('series_id', parsed.seriesId)
        .eq('round_index', parsed.roundIndex)
        .maybeSingle();
      return { eventId, seriesId: parsed.seriesId, roundIndex: parsed.roundIndex, roundId: data?.id ?? null };
    }
    if (isUuid(eventId)) {
      const { data } = await supabase
        .from('race_series_rounds')
        .select('id, series_id, round_index')
        .eq('id', eventId)
        .maybeSingle();
      if (data?.series_id && data.round_index !== null && data.round_index !== undefined) {
        return {
          eventId: `${data.series_id}-${data.round_index}`,
          seriesId: data.series_id,
          roundIndex: data.round_index,
          roundId: data.id,
        };
      }
    }
  } catch (err) {
    console.warn('[livestreamEventIds] Could not resolve series round for', eventId, err);
  }
  return null;
}

/** The id to save on a livestream session: series rounds use "<seriesId>-<roundIndex>", everything else is unchanged. */
export async function toLivestreamEventId(eventId: string | null | undefined): Promise<string | undefined> {
  if (!eventId) return undefined;
  const round = await resolveSeriesRound(eventId);
  return round ? round.eventId : eventId;
}

/** Every id a session for this event may have been saved with (always includes the id given). */
export async function getEquivalentEventIds(eventId: string): Promise<string[]> {
  const ids = new Set<string>([eventId]);
  const round = await resolveSeriesRound(eventId);
  if (round) {
    ids.add(round.eventId);
    if (round.roundId) ids.add(round.roundId);
  }
  return [...ids];
}

/** The id race status (live_tracking_events) is stored under for this event. */
export async function getRaceStatusEventId(eventId: string): Promise<string> {
  const parsed = parseSeriesRoundEventId(eventId);
  if (parsed) return parsed.seriesId;
  if (isUuid(eventId)) {
    const round = await resolveSeriesRound(eventId);
    if (round) return round.seriesId;
  }
  return eventId;
}

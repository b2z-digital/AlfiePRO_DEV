/**
 * Scoring sessions ("Score together"): a 6-digit PIN anyone at the pond can join, for one event.
 * Moved out of the desktop ShareScoringSessionModal so the phone race desk opens the same
 * sessions (scoring_sessions / scoring_session_participants, join_scoring_session RPC).
 */
import { supabase } from './supabase';

export interface ScoringSessionRow {
  id: string;
  club_id: string;
  event_id: string;
  event_name: string;
  pin_code: string;
  created_by: string;
  expires_at: string;
  is_active: boolean;
  max_collaborators: number;
}

export interface SessionParticipant {
  id: string;
  display_name: string;
  is_active: boolean;
  last_active_at: string;
}

export const generatePin = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const joinUrlFor = (pin: string, origin = window.location.origin) => `${origin}/join-scoring/${pin}`;

/** The creator's active session for the event, or a new one with a unique PIN. */
export async function createOrFetchSession(eventId: string, clubId: string, eventName: string): Promise<{ session: ScoringSessionRow | null; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { session: null };

  // Check for existing active session
  const { data: existing } = await supabase
    .from('scoring_sessions')
    .select('*')
    .eq('event_id', eventId)
    .eq('club_id', clubId)
    .eq('created_by', user.id)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing) return { session: existing as ScoringSessionRow };

  // Create new session with unique PIN
  let pin = generatePin();
  let attempts = 0;

  while (attempts < 5) {
    const { data, error: insertError } = await supabase
      .from('scoring_sessions')
      .insert({
        club_id: clubId,
        event_id: eventId,
        event_name: eventName,
        pin_code: pin,
        created_by: user.id,
      })
      .select()
      .maybeSingle();

    if (insertError?.code === '23505') {
      pin = generatePin();
      attempts++;
    } else if (insertError) {
      throw insertError;
    } else {
      return { session: data as ScoringSessionRow };
    }
  }

  return { session: null, error: 'Could not generate a unique PIN. Please try again.' };
}

export async function fetchParticipants(sessionId: string): Promise<SessionParticipant[]> {
  const { data } = await supabase
    .from('scoring_session_participants')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });
  return (data || []) as SessionParticipant[];
}

export async function endScoringSession(sessionId: string): Promise<void> {
  await supabase
    .from('scoring_sessions')
    .update({ is_active: false })
    .eq('id', sessionId);
}

export interface JoinedSession { sessionId: string; eventId: string; eventName: string; clubId: string; isCreator: boolean }

/** join_scoring_session: works signed in or not; the name is shown to the scorer. */
export async function joinScoringSession(pin: string, displayName: string): Promise<{ joined: JoinedSession | null; error?: string }> {
  const { data, error } = await supabase.rpc('join_scoring_session', { p_pin_code: pin, p_display_name: displayName });
  if (error) throw error;
  if (!data?.success) return { joined: null, error: data?.error || 'Failed to join session' };
  return { joined: { sessionId: data.session_id, eventId: data.event_id, eventName: data.event_name, clubId: data.club_id, isCreator: !!data.is_creator } };
}

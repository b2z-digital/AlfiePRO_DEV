import { supabase } from './supabase';
import type {
  LiveTrackingSession,
  SessionSkipperTracking,
  SkipperNotification,
  LiveTrackingEvent,
  NotificationPreferences,
  PushSubscriptionData,
} from '../types/liveTracking';

// Normalize event ID for live tracking (removes day suffix for series rounds)
// Series rounds have IDs like "uuid-0", "uuid-1" but live tracking uses the base UUID
function normalizeEventIdForLiveTracking(eventId: string): string {
  // Check if the event ID has a day suffix (e.g., "uuid-0", "uuid-1")
  const parts = eventId.split('-');
  if (parts.length === 6 && !isNaN(parseInt(parts[5]))) {
    // Remove the last part (day index) to get the base UUID
    return parts.slice(0, 5).join('-');
  }
  return eventId;
}

// Generate a device fingerprint for guest tracking
export function generateDeviceFingerprint(): string {
  const stored = localStorage.getItem('alfie_device_fingerprint');
  if (stored) return stored;

  const fingerprint = `${navigator.userAgent}-${screen.width}x${screen.height}-${new Date().getTime()}-${Math.random()}`;
  const hash = btoa(fingerprint).substring(0, 32);
  localStorage.setItem('alfie_device_fingerprint', hash);
  return hash;
}

// Create a new tracking session
export async function createTrackingSession(
  eventId: string,
  skipperName: string,
  sailNumber: string,
  memberId?: string
): Promise<LiveTrackingSession | null> {
  try {
    const deviceFingerprint = generateDeviceFingerprint();

    // First, expire any existing active sessions for this event/skipper/sail combination
    // This prevents 409 conflicts from duplicate active sessions
    await supabase
      .from('live_tracking_sessions')
      .update({ is_expired: true })
      .eq('event_id', eventId)
      .eq('selected_skipper_name', skipperName)
      .eq('selected_sail_number', sailNumber)
      .eq('is_expired', false);

    const sessionData: any = {
      event_id: eventId,
      selected_skipper_name: skipperName,
      selected_sail_number: sailNumber,
      device_fingerprint: deviceFingerprint,
      last_active_at: new Date().toISOString(),
    };

    if (memberId) {
      sessionData.member_id = memberId;
    }

    const { data, error } = await supabase
      .from('live_tracking_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error creating tracking session:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    if (!data) throw new Error('No data returned');

    // Store session ID locally for quick access
    localStorage.setItem('alfie_current_tracking_session', data.id);
    localStorage.setItem(
      'alfie_tracking_skipper',
      JSON.stringify({ name: skipperName, sail_number: sailNumber })
    );

    return data as LiveTrackingSession;
  } catch (error) {
    console.error('Error creating tracking session:', error);
    return null;
  }
}

// Get current active session
export async function getCurrentTrackingSession(
  eventId: string
): Promise<LiveTrackingSession | null> {
  try {
    const sessionId = localStorage.getItem('alfie_current_tracking_session');

    // Only check for existing session if we have a sessionId in localStorage
    if (sessionId) {
      const { data, error } = await supabase
        .from('live_tracking_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('event_id', eventId)
        .eq('is_expired', false)
        .maybeSingle();

      if (!error && data) {
        await updateSessionActivity(sessionId);
        return data as LiveTrackingSession;
      } else {
        // Session no longer valid, clear localStorage
        localStorage.removeItem('alfie_current_tracking_session');
      }
    }

    // No valid session found - user needs to select a skipper
    return null;
  } catch (error) {
    console.error('Error getting tracking session:', error);
    return null;
  }
}

// Update session activity timestamp
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    await supabase
      .from('live_tracking_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionId);
  } catch (error) {
    console.error('Error updating session activity:', error);
  }
}

// Update notification preferences
export async function updateNotificationPreferences(
  sessionId: string,
  preferences: NotificationPreferences
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('live_tracking_sessions')
      .update({ notification_preferences: preferences })
      .eq('id', sessionId);

    return !error;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return false;
  }
}

// Save push subscription
export async function savePushSubscription(
  sessionId: string,
  subscription: PushSubscriptionData
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('live_tracking_sessions')
      .update({ push_subscription: subscription })
      .eq('id', sessionId);

    return !error;
  } catch (error) {
    console.error('Error saving push subscription:', error);
    return false;
  }
}

// Get skipper tracking status
export async function getSkipperTrackingStatus(
  sessionId: string
): Promise<SessionSkipperTracking | null> {
  try {
    const { data, error } = await supabase
      .from('session_skipper_tracking')
      .select('*')
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as SessionSkipperTracking | null;
  } catch (error) {
    console.error('Error getting skipper tracking status:', error);
    return null;
  }
}

// Update skipper tracking status
export async function updateSkipperTrackingStatus(
  sessionId: string,
  eventId: string,
  skipperName: string,
  sailNumber: string,
  status: Partial<SessionSkipperTracking>
): Promise<boolean> {
  try {
    // Check if tracking record exists
    const { data: existing } = await supabase
      .from('session_skipper_tracking')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('session_skipper_tracking')
        .update({ ...status, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      return !error;
    } else {
      // Create new
      const { error } = await supabase
        .from('session_skipper_tracking')
        .insert({
          session_id: sessionId,
          event_id: eventId,
          skipper_name: skipperName,
          sail_number: sailNumber,
          ...status,
        });

      return !error;
    }
  } catch (error) {
    console.error('Error updating skipper tracking status:', error);
    return false;
  }
}

// Get notifications for session
export async function getSessionNotifications(
  sessionId: string,
  limit: number = 50
): Promise<SkipperNotification[]> {
  try {
    const { data, error } = await supabase
      .from('skipper_notifications_sent')
      .select('*')
      .eq('session_id', sessionId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as SkipperNotification[];
  } catch (error) {
    console.error('Error getting session notifications:', error);
    return [];
  }
}

// Mark notification as opened
export async function markNotificationOpened(
  notificationId: string
): Promise<void> {
  try {
    await supabase
      .from('skipper_notifications_sent')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', notificationId);
  } catch (error) {
    console.error('Error marking notification as opened:', error);
  }
}

// Mark notification as clicked
export async function markNotificationClicked(
  notificationId: string
): Promise<void> {
  try {
    await supabase
      .from('skipper_notifications_sent')
      .update({ clicked: true })
      .eq('id', notificationId);
  } catch (error) {
    console.error('Error marking notification as clicked:', error);
  }
}

// Get live tracking event configuration
export async function getLiveTrackingEvent(
  eventId: string
): Promise<LiveTrackingEvent | null> {
  try {
    const normalizedEventId = normalizeEventIdForLiveTracking(eventId);
    const { data, error } = await supabase
      .from('live_tracking_events')
      .select('*')
      .eq('event_id', normalizedEventId)
      .maybeSingle();

    if (error) throw error;
    return data as LiveTrackingEvent | null;
  } catch (error) {
    console.error('Error getting live tracking event:', error);
    return null;
  }
}

// Get live tracking event by token (for QR code access)
export async function getLiveTrackingEventByToken(
  token: string
): Promise<LiveTrackingEvent | null> {
  try {
    const { data, error } = await supabase
      .from('live_tracking_events')
      .select('*')
      .eq('access_token', token)
      .eq('enabled', true)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as LiveTrackingEvent;

    const { data: shortData, error: shortError } = await supabase
      .from('live_tracking_events')
      .select('*')
      .eq('short_code', token.toUpperCase())
      .eq('enabled', true)
      .maybeSingle();

    if (shortError) throw shortError;
    return shortData as LiveTrackingEvent | null;
  } catch (error) {
    console.error('Error getting live tracking event by token:', error);
    return null;
  }
}

// Get live tracking event by event ID (for widget access)
export async function getLiveTrackingEventByEventId(
  eventId: string
): Promise<LiveTrackingEvent | null> {
  try {
    console.log('🔎 getLiveTrackingEventByEventId called with eventId:', eventId);
    const normalizedEventId = normalizeEventIdForLiveTracking(eventId);

    const { data, error } = await supabase
      .from('live_tracking_events')
      .select('*')
      .eq('event_id', normalizedEventId)
      .eq('enabled', true)
      .maybeSingle();

    console.log('📊 Query result - data:', data, 'error:', error);

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }

    return data as LiveTrackingEvent | null;
  } catch (error) {
    console.error('❌ Error getting live tracking event by event ID:', error);
    return null;
  }
}

// Create or update live tracking event
export async function createOrUpdateLiveTrackingEvent(
  eventId: string,
  clubId?: string | null,
  enabled: boolean = true,
  stateAssociationId?: string | null,
  nationalAssociationId?: string | null
): Promise<LiveTrackingEvent | null> {
  try {
    console.log('createOrUpdateLiveTrackingEvent called with:', {
      eventId,
      clubId,
      stateAssociationId,
      nationalAssociationId,
      enabled
    });

    // Validate that at least one organization ID is provided
    if (!clubId && !stateAssociationId && !nationalAssociationId) {
      console.error('At least one organization ID (club, state, or national) must be provided');
      throw new Error('At least one organization ID must be provided');
    }

    // Check if exists
    const existing = await getLiveTrackingEvent(eventId);
    console.log('Existing tracking event:', existing);

    if (existing) {
      // Update
      console.log('Updating existing tracking event...');
      const { data, error } = await supabase
        .from('live_tracking_events')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating tracking event:', error);
        throw error;
      }
      console.log('Tracking event updated:', data);
      return data as LiveTrackingEvent;
    } else {
      // Create with upsert to handle race conditions
      console.log('Creating new tracking event...');
      const insertData: any = {
        event_id: eventId,
        enabled
      };

      if (clubId) insertData.club_id = clubId;
      if (stateAssociationId) insertData.state_association_id = stateAssociationId;
      if (nationalAssociationId) insertData.national_association_id = nationalAssociationId;

      const { data, error } = await supabase
        .from('live_tracking_events')
        .upsert(
          insertData,
          { onConflict: 'event_id' }
        )
        .select()
        .single();

      if (error) {
        console.error('Error creating tracking event:', error);
        throw error;
      }
      console.log('Tracking event created:', data);
      return data as LiveTrackingEvent;
    }
  } catch (error: any) {
    console.error('Error in createOrUpdateLiveTrackingEvent:', error);
    console.error('Error message:', error?.message);
    console.error('Error details:', error?.details);
    console.error('Error hint:', error?.hint);
    // Return null so the caller knows it failed
    return null;
  }
}

// Get active sessions for an event (for race officers)
export async function getActiveSessionsForEvent(
  eventId: string
): Promise<LiveTrackingSession[]> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('live_tracking_sessions')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_expired', false)
      .gte('last_active_at', oneHourAgo)
      .order('last_active_at', { ascending: false });

    if (error) throw error;
    return (data || []) as LiveTrackingSession[];
  } catch (error) {
    console.error('Error getting active sessions:', error);
    return [];
  }
}

// Get engagement statistics for an event
export async function getEventEngagementStats(eventId: string): Promise<{
  active_sessions: number;
  total_sessions: number;
  notifications_sent: number;
  notification_open_rate: number;
}> {
  try {
    const trackingEvent = await getLiveTrackingEvent(eventId);
    const sessions = await getActiveSessionsForEvent(eventId);

    let openRate = 0;
    if (trackingEvent) {
      const { data: notifData } = await supabase
        .from('notifications')
        .select('read')
        .like('subject', `[LiveTracking:${trackingEvent.id}]%`);

      if (notifData && notifData.length > 0) {
        const readCount = notifData.filter((n) => n.read).length;
        openRate = (readCount / notifData.length) * 100;
      }
    }

    return {
      active_sessions: sessions.length,
      total_sessions: trackingEvent?.total_sessions_created || 0,
      notifications_sent: trackingEvent?.total_notifications_sent || 0,
      notification_open_rate: openRate,
    };
  } catch (error) {
    console.error('Error getting engagement stats:', error);
    return {
      active_sessions: 0,
      total_sessions: 0,
      notifications_sent: 0,
      notification_open_rate: 0,
    };
  }
}

// Clear local session data
export function clearLocalTrackingSession(): void {
  localStorage.removeItem('alfie_current_tracking_session');
  localStorage.removeItem('alfie_tracking_skipper');
}

// Race Status Management
export type RaceStatus = 'live' | 'on_hold' | 'completed_for_day' | 'event_complete';

export async function updateRaceStatus(
  eventId: string,
  status: RaceStatus,
  notes?: string
): Promise<boolean> {
  try {
    const normalizedEventId = normalizeEventIdForLiveTracking(eventId);
    const { data, error } = await supabase.rpc('update_live_tracking_status', {
      p_event_id: normalizedEventId,
      p_status: status,
      p_notes: notes || null,
    });

    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error('Error updating race status:', error);
    return false;
  }
}

export async function getRaceStatus(eventId: string): Promise<{
  status: RaceStatus;
  lastUpdate: string | null;
  notes: string | null;
} | null> {
  try {
    const normalizedEventId = normalizeEventIdForLiveTracking(eventId);
    const { data, error } = await supabase
      .from('live_tracking_events')
      .select('race_status, last_status_update, status_notes')
      .eq('event_id', normalizedEventId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      status: (data.race_status as RaceStatus) || 'on_hold',
      lastUpdate: data.last_status_update,
      notes: data.status_notes,
    };
  } catch (error) {
    console.error('Error getting race status:', error);
    return null;
  }
}

// Subscribe to race status changes
export function subscribeToRaceStatus(
  eventId: string,
  callback: (status: RaceStatus, notes: string | null) => void
) {
  const channel = supabase
    .channel(`race_status_${eventId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_tracking_events',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        const newData = payload.new as any;
        if (newData.race_status) {
          callback(newData.race_status as RaceStatus, newData.status_notes);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

import { supabase } from './supabase';
import { PublicEvent, RaceEvent } from '../types/race';

// Get all public events (only approved events for regular users)
export const getPublicEvents = async (
  includeAllStatuses = false,
  organizationType?: 'state' | 'national',
  organizationId?: string
): Promise<PublicEvent[]> => {
  // Skip if offline - public events not critical for offline functionality
  if (!navigator.onLine) {
    console.log('Offline - skipping public events fetch');
    return [];
  }

  try {
    let query = supabase
      .from('public_events')
      .select('*, venues!venue_id(id, name, image)');

    // Only return approved events unless explicitly requested otherwise
    if (!includeAllStatuses) {
      query = query.eq('approval_status', 'approved');
    }

    // Filter based on organization type
    if (organizationType === 'state' && organizationId) {
      // State associations: only show their events
      query = query.eq('state_association_id', organizationId);
    } else if (organizationType === 'national' && organizationId) {
      // National associations: show national events + all state events from their state associations
      // First get all state association IDs
      const { data: stateAssocs } = await supabase
        .from('state_associations')
        .select('id')
        .eq('national_association_id', organizationId);

      const stateAssocIds = (stateAssocs || []).map(s => s.id);

      if (stateAssocIds.length > 0) {
        query = query.or(`national_association_id.eq.${organizationId},state_association_id.in.(${stateAssocIds.join(',')})`);
      } else {
        // No state associations, just show national events
        query = query.eq('national_association_id', organizationId);
      }
    }
    // For clubs or no organization context, show all approved events (no additional filter)

    query = query.order('date', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching public events:', error);
      return [];
    }

    // Fetch registrations for all public events
    const events = data || [];
    if (events.length > 0) {
      const eventIds = events.map(e => e.id);

      const { data: registrations, error: regError } = await supabase
        .from('event_registrations')
        .select('event_id, user_id, guest_first_name, guest_last_name, registration_type, status, payment_status')
        .in('event_id', eventIds)
        .in('status', ['pending', 'confirmed'])
        .in('payment_status', ['paid', 'pay_at_event']);

      if (regError) {
        console.error('Error loading public event registrations:', regError);
      }

      // Get unique user IDs to fetch profiles
      const userIds = [...new Set((registrations || [])
        .filter(r => r.user_id)
        .map(r => r.user_id))];

      // Fetch profiles separately
      let profilesData: any[] = [];
      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);

        if (profileError) {
          console.error('Error loading profiles:', profileError);
        }
        profilesData = profiles || [];
      }

      // Create profile map
      const profileMap: Record<string, any> = {};
      profilesData.forEach(profile => {
        profileMap[profile.id] = profile;
      });

      // Build registration map
      const registrationsMap: Record<string, any[]> = {};
      (registrations || []).forEach(reg => {
        if (!registrationsMap[reg.event_id]) {
          registrationsMap[reg.event_id] = [];
        }

        const profile = reg.user_id ? profileMap[reg.user_id] : null;
        const name = profile
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
          : `${reg.guest_first_name || ''} ${reg.guest_last_name || ''}`.trim();

        if (name) {
          registrationsMap[reg.event_id].push({
            name,
            sailNo: reg.user_id ? `REG-${reg.user_id.substring(0, 8)}` : 'GUEST',
            club: '',
            boatModel: '',
            startHcap: 0,
            avatarUrl: profile?.avatar_url
          });
        }
      });

      console.log('[PublicEvents] Loaded registrations for', Object.keys(registrationsMap).length, 'events');

      // Add registrations to events
      return events.map(event => ({
        ...event,
        registrations: registrationsMap[event.id] || []
      }));
    }

    return events;
  } catch (error) {
    console.error('Error in getPublicEvents:', error);
    return [];
  }
};

// Convert PublicEvent to RaceEvent format for display
export const convertToRaceEvent = (publicEvent: PublicEvent): RaceEvent => {
  // Extract venue image from joined venues data
  const venueImage = (publicEvent as any).venues?.image || null;

  return {
    id: publicEvent.id,
    eventName: publicEvent.event_name,
    clubName: publicEvent.is_interclub ? 'Interclub Event' : (publicEvent.club_name || 'National Event'),
    date: publicEvent.date,
    endDate: publicEvent.end_date,
    venue: publicEvent.venue,
    venueImage: venueImage, // Include venue image from joined data
    raceClass: publicEvent.race_class as any, // Type conversion
    raceFormat: publicEvent.race_format as any, // Type conversion
    multiDay: publicEvent.multi_day,
    numberOfDays: publicEvent.number_of_days,
    isPaid: publicEvent.is_paid,
    entryFee: publicEvent.entry_fee,
    noticeOfRaceUrl: publicEvent.notice_of_race_url,
    sailingInstructionsUrl: publicEvent.sailing_instructions_url,
    isInterclub: publicEvent.is_interclub,
    otherClubName: publicEvent.other_club_name,
    media: publicEvent.media,
    livestreamUrl: publicEvent.livestream_url,
    isPublicEvent: true, // Mark as public event
    publicEventId: publicEvent.id, // Store reference to original public event
    clubId: publicEvent.club_id, // CRITICAL: Include hosting club ID for registration and finance
    state_association_id: publicEvent.state_association_id,
    national_association_id: publicEvent.national_association_id,
    attendees: (publicEvent as any).registrations || [], // Pass through registrations as attendees
    eventLevel: publicEvent.event_level,
    show_flag: (publicEvent as any).show_flag ?? false,
    show_country: (publicEvent as any).show_country ?? false,
    show_club_state: (publicEvent as any).show_club_state ?? false,
    show_design: (publicEvent as any).show_design ?? false,
    show_category: (publicEvent as any).show_category ?? false,
    showFlag: (publicEvent as any).show_flag ?? false,
    showCountry: (publicEvent as any).show_country ?? false,
    showClubState: (publicEvent as any).show_club_state ?? false,
    showDesign: (publicEvent as any).show_design ?? false,
    showCategory: (publicEvent as any).show_category ?? false
  };
};

// Create a local copy of a public event in the club's quick_races table
// This allows clubs to score and manage the event while maintaining a link to the original
export const createLocalCopyOfPublicEvent = async (publicEvent: PublicEvent, clubId: string): Promise<string | null> => {
  try {
    // Generate a new ID for the local copy
    const localEventId = `${clubId}-public-${publicEvent.id}`;

    // Check if local copy already exists
    const { data: existing } = await supabase
      .from('quick_races')
      .select('id')
      .eq('id', localEventId)
      .maybeSingle();

    if (existing) {
      // Local copy already exists, return its ID
      return localEventId;
    }

    // Create the local copy
    const { data, error } = await supabase
      .from('quick_races')
      .insert({
        id: localEventId,
        club_id: clubId,
        event_name: publicEvent.event_name,
        club_name: publicEvent.is_interclub ? 'Interclub Event' : 'National Event',
        race_date: publicEvent.date,
        end_date: publicEvent.end_date,
        race_venue: publicEvent.venue,
        race_class: publicEvent.race_class,
        race_format: publicEvent.race_format,
        multi_day: publicEvent.multi_day || false,
        number_of_days: publicEvent.number_of_days || 1,
        is_paid: publicEvent.is_paid || false,
        entry_fee: publicEvent.entry_fee,
        notice_of_race_url: publicEvent.notice_of_race_url,
        sailing_instructions_url: publicEvent.sailing_instructions_url,
        is_interclub: publicEvent.is_interclub || false,
        other_club_name: publicEvent.other_club_name,
        media: publicEvent.media || [],
        livestream_url: publicEvent.livestream_url,
        skippers: [],
        race_results: [],
        last_completed_race: 0,
        has_determined_initial_hcaps: false,
        is_manual_handicaps: false,
        completed: false,
        // Store reference to original public event
        public_event_id: publicEvent.id
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating local copy of public event:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('Error in createLocalCopyOfPublicEvent:', error);
    return null;
  }
};

export interface ClashingEvent {
  id: string;
  event_name: string;
  date: string;
  end_date?: string;
  event_level: string;
  venue?: string;
  race_class?: string;
}

export const checkEventDateClashes = async (
  startDate: string,
  endDate: string | null,
  excludeEventId?: string
): Promise<ClashingEvent[]> => {
  try {
    const effectiveEnd = endDate || startDate;

    let query = supabase
      .from('public_events')
      .select('id, event_name, date, end_date, event_level, venue, race_class')
      .in('event_level', ['state', 'national'])
      .lte('date', effectiveEnd);

    if (excludeEventId) {
      query = query.neq('id', excludeEventId);
    }

    const { data, error } = await query;

    if (error || !data) return [];

    return data.filter(evt => {
      const evtEnd = evt.end_date || evt.date;
      return evtEnd >= startDate;
    });
  } catch {
    return [];
  }
};

// Add a new public event
export const addPublicEvent = async (eventData: Omit<PublicEvent, 'id' | 'created_at' | 'updated_at'>): Promise<PublicEvent | null> => {
  try {
    console.log('Attempting to create public event with data:', eventData);

    const { data, error } = await supabase
      .from('public_events')
      .insert(eventData)
      .select()
      .single();

    if (error) {
      console.error('Error adding public event:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return null;
    }

    console.log('Successfully created public event:', data);
    return data;
  } catch (error) {
    console.error('Error in addPublicEvent:', error);
    return null;
  }
};

// Update an existing public event
export const updatePublicEvent = async (id: string, eventData: Partial<PublicEvent>): Promise<PublicEvent | null> => {
  try {
    const { data, error } = await supabase
      .from('public_events')
      .update(eventData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating public event:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in updatePublicEvent:', error);
    return null;
  }
};

// Delete a public event
// Check how many clubs have scored this public event
export const getPublicEventScoringClubCount = async (publicEventId: string): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from('quick_races')
      .select('club_id', { count: 'exact', head: true })
      .eq('public_event_id', publicEventId);

    if (error) {
      console.error('Error counting clubs scoring event:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('Error in getPublicEventScoringClubCount:', error);
    return 0;
  }
};

// Delete a public event
// WARNING: This will CASCADE DELETE all local copies from clubs that have scored this event
// All scoring data, results, and skipper information will be permanently removed
export const deletePublicEvent = async (id: string): Promise<boolean> => {
  try {
    // Note: The database trigger cascade_delete_public_event_copies_trigger
    // will automatically delete all quick_races entries referencing this public event
    // This ensures the event is completely removed from all club calendars and dashboards

    const { error } = await supabase
      .from('public_events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting public event:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deletePublicEvent:', error);
    return false;
  }
};
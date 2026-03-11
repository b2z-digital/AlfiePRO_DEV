import { supabase } from './supabase';
import { Meeting, MeetingAgendaItem, MeetingFormData, MeetingAttendee, MeetingGuest, MeetingCategory, RecurrenceType } from '../types/meeting';

// Get all meetings for a club or association
export const getMeetings = async (
  clubId?: string,
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<Meeting[]> => {
  try {
    let query = supabase
      .from('meetings')
      .select(`
        *,
        chairperson:chairperson_id(first_name, last_name, avatar_url),
        minute_taker:minute_taker_id(first_name, last_name, avatar_url)
      `);

    if (clubId) {
      query = query.eq('club_id', clubId);
    } else if (associationId && associationType) {
      const idColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';
      query = query.eq(idColumn, associationId);
    } else {
      throw new Error('Either clubId or associationId with associationType must be provided');
    }

    const { data, error } = await query.order('date', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching meetings:', error);
    throw error;
  }
};

// Get a single meeting by ID
export const getMeetingById = async (meetingId: string): Promise<Meeting | null> => {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        chairperson:chairperson_id(first_name, last_name, avatar_url),
        minute_taker:minute_taker_id(first_name, last_name, avatar_url)
      `)
      .eq('id', meetingId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No meeting found
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching meeting:', error);
    throw error;
  }
};

function generateRecurringDates(startDate: string, recurrenceType: RecurrenceType, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let current = new Date(start);

  const advance = (d: Date): Date => {
    const next = new Date(d);
    switch (recurrenceType) {
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'fortnightly': next.setDate(next.getDate() + 14); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'quarterly': next.setMonth(next.getMonth() + 3); break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
      default: return next;
    }
    return next;
  };

  current = advance(current);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current = advance(current);
  }
  return dates;
}

export const createMeeting = async (
  clubId: string | undefined,
  meetingData: MeetingFormData,
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<Meeting> => {
  try {
    const insertData: any = {
      name: meetingData.name,
      location: meetingData.location,
      date: meetingData.date,
      start_time: meetingData.start_time,
      end_time: meetingData.end_time,
      conferencing_url: meetingData.conferencing_url,
      description: meetingData.description,
      chairperson_id: meetingData.chairperson_id || null,
      minute_taker_id: meetingData.minute_taker_id || null,
      meeting_category: meetingData.meeting_category || 'general',
      meeting_type: meetingData.meeting_type || 'in_person',
      visible_to_member_clubs: meetingData.visible_to_member_clubs ?? false,
      recurrence_type: meetingData.recurrence_type || 'none',
      recurrence_end_date: meetingData.recurrence_end_date || null,
      recurrence_index: 0,
      status: 'upcoming',
      minutes_status: 'not_started',
      members_present: [],
      guests_present: []
    };

    if (clubId) {
      insertData.club_id = clubId;
    } else if (associationId && associationType) {
      const idColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';
      insertData[idColumn] = associationId;
    } else {
      throw new Error('Either clubId or associationId with associationType must be provided');
    }

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert(insertData)
      .select()
      .single();

    if (meetingError) throw meetingError;

    if (meetingData.agenda_items && meetingData.agenda_items.length > 0) {
      const agendaItems = meetingData.agenda_items.map(item => ({
        meeting_id: meeting.id,
        item_number: item.item_number,
        item_name: item.item_name,
        owner_id: item.owner_id || null,
        type: item.type,
        duration: item.duration || null,
        minutes_content: ''
      }));

      const { error: agendaError } = await supabase
        .from('meeting_agendas')
        .insert(agendaItems);

      if (agendaError) throw agendaError;
    }

    const recurrenceType = meetingData.recurrence_type || 'none';
    const recurrenceEndDate = meetingData.recurrence_end_date;

    if (recurrenceType !== 'none' && recurrenceEndDate) {
      const futureDates = generateRecurringDates(meetingData.date, recurrenceType, recurrenceEndDate);

      for (let i = 0; i < futureDates.length; i++) {
        const childData: any = {
          ...insertData,
          date: futureDates[i],
          recurrence_parent_id: meeting.id,
          recurrence_index: i + 1,
        };
        delete childData.recurrence_end_date;

        const { data: childMeeting, error: childError } = await supabase
          .from('meetings')
          .insert(childData)
          .select()
          .single();

        if (childError) {
          console.error(`Error creating recurring meeting ${i + 1}:`, childError);
          continue;
        }

        if (meetingData.agenda_items && meetingData.agenda_items.length > 0) {
          const childAgenda = meetingData.agenda_items.map(item => ({
            meeting_id: childMeeting.id,
            item_number: item.item_number,
            item_name: item.item_name,
            owner_id: item.owner_id || null,
            type: item.type,
            duration: item.duration || null,
            minutes_content: ''
          }));
          await supabase.from('meeting_agendas').insert(childAgenda);
        }
      }
    }

    return meeting;
  } catch (error) {
    console.error('Error creating meeting:', error);
    throw error;
  }
};

// Update an existing meeting
export const updateMeeting = async (meetingId: string, meetingData: MeetingFormData): Promise<Meeting> => {
  try {
    // First, update the meeting
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .update({
        name: meetingData.name,
        location: meetingData.location,
        date: meetingData.date,
        start_time: meetingData.start_time,
        end_time: meetingData.end_time,
        conferencing_url: meetingData.conferencing_url,
        description: meetingData.description,
        chairperson_id: meetingData.chairperson_id,
        minute_taker_id: meetingData.minute_taker_id,
        meeting_category: meetingData.meeting_category || 'general',
        meeting_type: meetingData.meeting_type || 'in_person',
        ...(meetingData.visible_to_member_clubs !== undefined && {
          visible_to_member_clubs: meetingData.visible_to_member_clubs
        }),
      })
      .eq('id', meetingId)
      .select()
      .single();

    if (meetingError) throw meetingError;

    // Delete existing agenda items
    const { error: deleteError } = await supabase
      .from('meeting_agendas')
      .delete()
      .eq('meeting_id', meetingId);

    if (deleteError) throw deleteError;

    // Create new agenda items
    if (meetingData.agenda_items && meetingData.agenda_items.length > 0) {
      const agendaItems = meetingData.agenda_items.map(item => ({
        meeting_id: meetingId,
        item_number: item.item_number,
        item_name: item.item_name,
        owner_id: item.owner_id,
        type: item.type,
        duration: item.duration,
        minutes_content: ''
      }));

      const { error: agendaError } = await supabase
        .from('meeting_agendas')
        .insert(agendaItems);

      if (agendaError) throw agendaError;
    }

    return meeting;
  } catch (error) {
    console.error('Error updating meeting:', error);
    throw error;
  }
};

// Delete a meeting
export const deleteMeeting = async (meetingId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('meetings')
      .delete()
      .eq('id', meetingId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting meeting:', error);
    throw error;
  }
};

// Get agenda items for a meeting
export const getMeetingAgenda = async (meetingId: string): Promise<MeetingAgendaItem[]> => {
  try {
    const { data, error } = await supabase
      .from('meeting_agendas')
      .select(`
        *,
        owner:owner_id(first_name, last_name, avatar_url)
      `)
      .eq('meeting_id', meetingId)
      .order('item_number', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching meeting agenda:', error);
    throw error;
  }
};

// Update meeting status
export const updateMeetingStatus = async (meetingId: string, status: 'upcoming' | 'completed' | 'cancelled'): Promise<void> => {
  try {
    const { error } = await supabase
      .from('meetings')
      .update({ status })
      .eq('id', meetingId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating meeting status:', error);
    throw error;
  }
};

// Start a meeting (update minutes_status and record attendees)
export const startMeeting = async (
  meetingId: string, 
  membersPresent: { id: string; name: string }[], 
  guestsPresent: { name: string }[]
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('meetings')
      .update({
        minutes_status: 'in_progress',
        members_present: membersPresent,
        guests_present: guestsPresent
      })
      .eq('id', meetingId);

    if (error) throw error;
  } catch (error) {
    console.error('Error starting meeting:', error);
    throw error;
  }
};

// Update minutes for an agenda item
export const updateAgendaItemMinutes = async (
  agendaItemId: string, 
  minutesContent: string,
  minutesDecision?: string,
  minutesTasks?: string,
  minutesAttachments?: any[]
): Promise<void> => {
  try {
    const updates: any = { minutes_content: minutesContent };
    
    if (minutesDecision !== undefined) {
      updates.minutes_decision = minutesDecision;
    }
    
    if (minutesTasks !== undefined) {
      updates.minutes_tasks = minutesTasks;
    }
    
    if (minutesAttachments !== undefined) {
      updates.minutes_attachments = minutesAttachments;
    }
    
    const { error } = await supabase
      .from('meeting_agendas')
      .update(updates)
      .eq('id', agendaItemId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating agenda item minutes:', error);
    throw error;
  }
};

// Complete meeting minutes
export const completeMeetingMinutes = async (meetingId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('meetings')
      .update({
        minutes_status: 'completed',
        status: 'completed'
      })
      .eq('id', meetingId);

    if (error) throw error;
  } catch (error) {
    console.error('Error completing meeting minutes:', error);
    throw error;
  }
};

// Lock meeting minutes
export const lockMeetingMinutes = async (meetingId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('meetings')
      .update({
        minutes_locked: true
      })
      .eq('id', meetingId);

    if (error) throw error;
  } catch (error) {
    console.error('Error locking meeting minutes:', error);
    throw error;
  }
};

// Add a new agenda item during a meeting
export const addAgendaItemToMeeting = async (
  meetingId: string,
  item: {
    item_number: number;
    item_name: string;
    owner_id?: string;
    type: 'for_noting' | 'for_action' | 'for_discussion';
    duration?: number;
  }
): Promise<MeetingAgendaItem> => {
  try {
    const { data, error } = await supabase
      .from('meeting_agendas')
      .insert({
        meeting_id: meetingId,
        item_number: item.item_number,
        item_name: item.item_name,
        owner_id: item.owner_id,
        type: item.type,
        duration: item.duration,
        minutes_content: ''
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding agenda item:', error);
    throw error;
  }
};

// Update an existing agenda item
export const updateAgendaItem = async (
  agendaItemId: string,
  updates: Partial<MeetingAgendaItem>
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('meeting_agendas')
      .update(updates)
      .eq('id', agendaItemId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating agenda item:', error);
    throw error;
  }
};

// Delete an agenda item
export const deleteAgendaItem = async (agendaItemId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('meeting_agendas')
      .delete()
      .eq('id', agendaItemId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting agenda item:', error);
    throw error;
  }
};

export const updateMeetingRsvp = async (
  meetingId: string,
  userId: string,
  status: 'attending' | 'not_attending' | 'pending'
): Promise<void> => {
  try {
    const { data: existing } = await supabase
      .from('meeting_attendance')
      .select('id')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('meeting_attendance')
        .update({ status })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('meeting_attendance')
        .insert({ meeting_id: meetingId, user_id: userId, status });
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error updating meeting RSVP:', error);
    throw error;
  }
};

export const getMeetingRsvpStatus = async (
  meetingId: string,
  userId: string
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('meeting_attendance')
      .select('status')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data?.status || null;
  } catch (error) {
    console.error('Error fetching meeting RSVP:', error);
    return null;
  }
};

export const getMeetingAttendees = async (
  meetingId: string
): Promise<{ user_id: string; status: string; name: string; avatar_url?: string }[]> => {
  try {
    const { data, error } = await supabase
      .from('meeting_attendance')
      .select(`
        user_id,
        status,
        member_id,
        profiles:user_id(first_name, last_name, avatar_url)
      `)
      .eq('meeting_id', meetingId);

    if (error) throw error;

    return (data || []).map((att: any) => ({
      user_id: att.user_id,
      status: att.status,
      name: att.profiles ? `${att.profiles.first_name} ${att.profiles.last_name}` : 'Unknown',
      avatar_url: att.profiles?.avatar_url
    }));
  } catch (error) {
    console.error('Error fetching meeting attendees:', error);
    return [];
  }
};

export const getClubMembersForMeeting = async (
  clubId?: string,
  associationId?: string,
  associationType?: 'state' | 'national',
  meetingCategory?: MeetingCategory
): Promise<MeetingAttendee[]> => {
  try {
    if (clubId) {
      if (meetingCategory === 'committee') {
        const { data: positions, error: posError } = await supabase
          .from('committee_positions')
          .select('member_id')
          .eq('club_id', clubId)
          .not('member_id', 'is', null);

        if (posError) throw posError;

        const memberIds = [...new Set((positions || []).map(p => p.member_id).filter(Boolean))];
        if (memberIds.length === 0) return [];

        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, avatar_url')
          .in('id', memberIds)
          .order('first_name', { ascending: true });

        if (error) throw error;

        return (data || []).map(member => ({
          id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          avatar_url: member.avatar_url,
          isPresent: false
        }));
      }

      const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, avatar_url')
        .eq('club_id', clubId)
        .order('first_name', { ascending: true });

      if (error) throw error;

      return (data || []).map(member => ({
        id: member.id,
        name: `${member.first_name} ${member.last_name}`,
        avatar_url: member.avatar_url,
        isPresent: false
      }));
    } else if (associationId && associationType) {
      if (meetingCategory === 'committee') {
        const assocColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';
        const { data: positions, error: posError } = await supabase
          .from('committee_positions')
          .select('member_id')
          .eq(assocColumn, associationId)
          .not('member_id', 'is', null);

        if (posError) throw posError;

        const memberIds = [...new Set((positions || []).map(p => p.member_id).filter(Boolean))];
        if (memberIds.length === 0) return [];

        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, avatar_url')
          .in('id', memberIds)
          .order('first_name', { ascending: true });

        if (error) throw error;

        return (data || []).map(member => ({
          id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          avatar_url: member.avatar_url,
          isPresent: false
        }));
      }

      if (associationType === 'state') {
        const { data: clubs, error: clubsError } = await supabase
          .from('clubs')
          .select('id')
          .eq('state_association_id', associationId);

        if (clubsError) throw clubsError;

        const clubIds = (clubs || []).map(c => c.id);
        if (clubIds.length === 0) return [];

        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, avatar_url')
          .in('club_id', clubIds)
          .order('first_name', { ascending: true });

        if (error) throw error;

        return (data || []).map(member => ({
          id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          avatar_url: member.avatar_url,
          isPresent: false
        }));
      }

      const tableName = 'user_national_associations';
      const idColumn = 'national_association_id';

      const { data, error } = await supabase
        .from(tableName)
        .select(`
          user_id,
          profiles:user_id(id, first_name, last_name)
        `)
        .eq(idColumn, associationId);

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.profiles.id,
        name: `${item.profiles.first_name} ${item.profiles.last_name}`,
        isPresent: false
      }));
    } else {
      throw new Error('Either clubId or associationId with associationType must be provided');
    }
  } catch (error) {
    console.error('Error fetching members:', error);
    throw error;
  }
};
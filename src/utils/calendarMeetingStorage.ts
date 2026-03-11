import { supabase } from './supabase';
import { Meeting } from '../types/meeting';

export interface MeetingAttendee {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export interface CalendarMeeting extends Meeting {
  organizationLevel: 'club' | 'state_association' | 'national_association';
  attendingCount: number;
  attendees: MeetingAttendee[];
}

export const getCalendarMeetings = async (
  clubId?: string,
  stateAssociationId?: string | null,
  nationalAssociationId?: string | null
): Promise<CalendarMeeting[]> => {
  try {
    if (!clubId && !stateAssociationId && !nationalAssociationId) return [];

    const filters: string[] = [];

    if (clubId) {
      filters.push(`club_id.eq.${clubId}`);
      filters.push(`and(state_association_id.not.is.null,visible_to_member_clubs.eq.true)`);
      filters.push(`and(national_association_id.not.is.null,visible_to_member_clubs.eq.true)`);
    }

    if (stateAssociationId) {
      filters.push(`state_association_id.eq.${stateAssociationId}`);
    }

    if (nationalAssociationId) {
      filters.push(`national_association_id.eq.${nationalAssociationId}`);
    }

    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        chairperson:chairperson_id(first_name, last_name, avatar_url),
        minute_taker:minute_taker_id(first_name, last_name, avatar_url)
      `)
      .or(filters.join(','))
      .in('status', ['upcoming', 'completed'])
      .order('date', { ascending: true });

    if (error) throw error;

    const meetings = (data || []).map((m: any) => {
      let organizationLevel: 'club' | 'state_association' | 'national_association' = 'club';
      if (m.national_association_id) {
        organizationLevel = 'national_association';
      } else if (m.state_association_id) {
        organizationLevel = 'state_association';
      }

      return {
        ...m,
        organizationLevel,
        attendingCount: 0,
        attendees: [],
      } as CalendarMeeting;
    });

    if (meetings.length > 0) {
      const meetingIds = meetings.map(m => m.id);
      const { data: attendanceData } = await supabase
        .from('meeting_attendance')
        .select('meeting_id, user_id, profiles:user_id(first_name, last_name, avatar_url)')
        .in('meeting_id', meetingIds)
        .eq('status', 'attending');

      if (attendanceData) {
        const attendeeMap: Record<string, MeetingAttendee[]> = {};
        attendanceData.forEach((a: any) => {
          if (!attendeeMap[a.meeting_id]) attendeeMap[a.meeting_id] = [];
          attendeeMap[a.meeting_id].push({
            user_id: a.user_id,
            first_name: a.profiles?.first_name || '',
            last_name: a.profiles?.last_name || '',
            avatar_url: a.profiles?.avatar_url || null,
          });
        });
        meetings.forEach(m => {
          m.attendees = attendeeMap[m.id] || [];
          m.attendingCount = m.attendees.length;
        });
      }
    }

    return meetings;
  } catch (error) {
    console.error('Error fetching calendar meetings:', error);
    return [];
  }
};

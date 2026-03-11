import { supabase } from './supabase';
import { Meeting } from '../types/meeting';

export interface CalendarMeeting extends Meeting {
  organizationLevel: 'club' | 'state_association' | 'national_association';
  attendingCount: number;
}

export const getCalendarMeetings = async (
  clubId?: string,
  stateAssociationId?: string | null,
  nationalAssociationId?: string | null
): Promise<CalendarMeeting[]> => {
  try {
    if (!clubId) return [];

    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        chairperson:chairperson_id(first_name, last_name, avatar_url),
        minute_taker:minute_taker_id(first_name, last_name, avatar_url)
      `)
      .or(
        `club_id.eq.${clubId},and(state_association_id.not.is.null,visible_to_member_clubs.eq.true),and(national_association_id.not.is.null,visible_to_member_clubs.eq.true)`
      )
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
      } as CalendarMeeting;
    });

    if (meetings.length > 0) {
      const meetingIds = meetings.map(m => m.id);
      const { data: attendanceCounts } = await supabase
        .from('meeting_attendance')
        .select('meeting_id, status')
        .in('meeting_id', meetingIds)
        .eq('status', 'attending');

      if (attendanceCounts) {
        const countMap: Record<string, number> = {};
        attendanceCounts.forEach(a => {
          countMap[a.meeting_id] = (countMap[a.meeting_id] || 0) + 1;
        });
        meetings.forEach(m => {
          m.attendingCount = countMap[m.id] || 0;
        });
      }
    }

    return meetings;
  } catch (error) {
    console.error('Error fetching calendar meetings:', error);
    return [];
  }
};

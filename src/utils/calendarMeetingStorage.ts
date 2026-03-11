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

    return (data || []).map((m: any) => {
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
  } catch (error) {
    console.error('Error fetching calendar meetings:', error);
    return [];
  }
};

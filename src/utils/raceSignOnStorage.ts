import { supabase } from './supabase';

export interface RaceDaySignOn {
  id: string;
  event_id: string;
  club_id: string;
  race_day: string;
  skipper_name: string;
  sail_number: string;
  member_id: string | null;
  user_id: string | null;
  signed_on_at: string;
  signed_off_at: string | null;
  signed_on_by: 'self' | 'admin';
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

export const getSignOnSheet = async (eventId: string, raceDay?: string): Promise<RaceDaySignOn[]> => {
  let query = supabase
    .from('race_day_sign_on')
    .select('*')
    .eq('event_id', eventId)
    .order('signed_on_at', { ascending: true });

  if (raceDay) {
    query = query.eq('race_day', raceDay);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch sign-on sheet:', error);
    return [];
  }
  return data || [];
};

export const signOn = async (entry: Omit<RaceDaySignOn, 'id' | 'created_at' | 'signed_on_at' | 'signed_off_at'>): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('race_day_sign_on')
    .insert({ ...entry, signed_on_at: new Date().toISOString() });

  if (error) {
    console.error('Failed to sign on:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const signOff = async (id: string): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('race_day_sign_on')
    .update({ signed_off_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Failed to sign off:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const signOffAll = async (eventId: string, raceDay: string): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('race_day_sign_on')
    .update({ signed_off_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('race_day', raceDay)
    .is('signed_off_at', null);

  if (error) {
    console.error('Failed to sign off all:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const deleteSignOn = async (id: string): Promise<{ success: boolean }> => {
  const { error } = await supabase
    .from('race_day_sign_on')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete sign-on:', error);
    return { success: false };
  }
  return { success: true };
};

export const getStillOnWater = async (eventId: string, raceDay: string): Promise<RaceDaySignOn[]> => {
  const { data, error } = await supabase
    .from('race_day_sign_on')
    .select('*')
    .eq('event_id', eventId)
    .eq('race_day', raceDay)
    .is('signed_off_at', null)
    .order('signed_on_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch boats on water:', error);
    return [];
  }
  return data || [];
};

import { supabase } from './supabase';

export interface EventProtest {
  id: string;
  event_id: string;
  club_id: string;
  protest_type: 'boat_vs_boat' | 'race_committee' | 'redress_request' | 'scoring_enquiry';
  status: 'filed' | 'scheduled' | 'heard' | 'decided' | 'withdrawn';
  filed_by_user_id: string | null;
  filed_by_name: string;
  filed_by_sail_number: string | null;
  protestee_sail_number: string | null;
  protestee_name: string | null;
  race_number: number;
  incident_description: string;
  rules_alleged_broken: string | null;
  witnesses: string | null;
  hearing_time: string | null;
  hearing_location: string | null;
  decision: string | null;
  decision_summary: string | null;
  penalty_applied: string | null;
  decided_at: string | null;
  decided_by: string | null;
  protest_time_limit: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoringEnquiry {
  id: string;
  event_id: string;
  club_id: string;
  submitted_by_user_id: string | null;
  submitted_by_name: string;
  sail_number: string;
  race_number: number;
  issue_type: 'wrong_position' | 'missing_result' | 'wrong_penalty' | 'other';
  description: string;
  status: 'pending' | 'under_review' | 'resolved' | 'rejected';
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export const getProtests = async (eventId: string): Promise<EventProtest[]> => {
  const { data, error } = await supabase
    .from('event_protests')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch protests:', error);
    return [];
  }
  return data || [];
};

export const createProtest = async (protest: Omit<EventProtest, 'id' | 'created_at' | 'updated_at' | 'status'>): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('event_protests')
    .insert({ ...protest, status: 'filed' });

  if (error) {
    console.error('Failed to create protest:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const updateProtest = async (id: string, updates: Partial<EventProtest>): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('event_protests')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Failed to update protest:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const deleteProtest = async (id: string): Promise<{ success: boolean }> => {
  const { error } = await supabase
    .from('event_protests')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete protest:', error);
    return { success: false };
  }
  return { success: true };
};

export const getScoringEnquiries = async (eventId: string): Promise<ScoringEnquiry[]> => {
  const { data, error } = await supabase
    .from('event_scoring_enquiries')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch scoring enquiries:', error);
    return [];
  }
  return data || [];
};

export const createScoringEnquiry = async (enquiry: Omit<ScoringEnquiry, 'id' | 'created_at' | 'status' | 'resolution' | 'resolved_by' | 'resolved_at'>): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('event_scoring_enquiries')
    .insert({ ...enquiry, status: 'pending' });

  if (error) {
    console.error('Failed to create scoring enquiry:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const updateScoringEnquiry = async (id: string, updates: Partial<ScoringEnquiry>): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('event_scoring_enquiries')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Failed to update scoring enquiry:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

export const deleteScoringEnquiry = async (id: string): Promise<{ success: boolean }> => {
  const { error } = await supabase
    .from('event_scoring_enquiries')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete scoring enquiry:', error);
    return { success: false };
  }
  return { success: true };
};

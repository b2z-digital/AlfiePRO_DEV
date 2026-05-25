import { supabase } from './supabase';
import type { HeatManagement } from '../types/heat';
import type { Skipper } from '../types/index';

export interface ScoringCheckpoint {
  id: string;
  event_id: string;
  club_id: string;
  round_number: number;
  checkpoint_type: 'auto_round_complete' | 'manual';
  label: string;
  heat_management: HeatManagement;
  race_results: any[];
  skippers: Skipper[];
  last_completed_race: number;
  drop_rules: number[];
  num_races: number;
  created_at: string;
  created_by: string | null;
}

export const createCheckpoint = async (params: {
  eventId: string;
  clubId: string;
  roundNumber: number;
  checkpointType: 'auto_round_complete' | 'manual';
  label: string;
  heatManagement: HeatManagement;
  raceResults: any[];
  skippers: Skipper[];
  lastCompletedRace: number;
  dropRules: number[];
  numRaces: number;
}): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { error } = await supabase
      .from('scoring_checkpoints')
      .insert({
        event_id: params.eventId,
        club_id: params.clubId,
        round_number: params.roundNumber,
        checkpoint_type: params.checkpointType,
        label: params.label,
        heat_management: params.heatManagement as any,
        race_results: params.raceResults as any,
        skippers: params.skippers as any,
        last_completed_race: params.lastCompletedRace,
        drop_rules: params.dropRules as any,
        num_races: params.numRaces,
        created_by: user.id,
      });

    if (error) {
      console.error('Failed to create scoring checkpoint:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error creating scoring checkpoint:', err);
    return { success: false, error: err.message };
  }
};

export const getCheckpoints = async (eventId: string): Promise<ScoringCheckpoint[]> => {
  const { data, error } = await supabase
    .from('scoring_checkpoints')
    .select('*')
    .eq('event_id', eventId)
    .order('round_number', { ascending: false });

  if (error) {
    console.error('Failed to fetch scoring checkpoints:', error);
    return [];
  }

  return (data || []) as ScoringCheckpoint[];
};

export const deleteCheckpoint = async (checkpointId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('scoring_checkpoints')
    .delete()
    .eq('id', checkpointId);

  if (error) {
    console.error('Failed to delete scoring checkpoint:', error);
    return false;
  }

  return true;
};

export const getLatestCheckpoint = async (eventId: string): Promise<ScoringCheckpoint | null> => {
  const { data, error } = await supabase
    .from('scoring_checkpoints')
    .select('*')
    .eq('event_id', eventId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch latest checkpoint:', error);
    return null;
  }

  return data as ScoringCheckpoint | null;
};

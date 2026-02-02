import { supabase } from './supabase';
import type {
  LivestreamSession,
  LivestreamCamera,
  LivestreamOverlay,
  LivestreamSponsorRotation,
  LivestreamArchive,
  OverlayConfig
} from '../types/livestream';

export const livestreamStorage = {
  // Livestream Sessions
  async getSessions(clubId: string): Promise<LivestreamSession[]> {
    const { data, error } = await supabase
      .from('livestream_sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getSession(id: string): Promise<LivestreamSession | null> {
    const { data, error } = await supabase
      .from('livestream_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getActiveSession(clubId: string): Promise<LivestreamSession | null> {
    const { data, error } = await supabase
      .from('livestream_sessions')
      .select('*')
      .eq('club_id', clubId)
      .in('status', ['testing', 'live'])
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getSessionByEventId(eventId: string): Promise<{ data: LivestreamSession | null; error: any }> {
    console.log('🔍 [livestreamStorage] getSessionByEventId - Searching for:', {
      eventId,
      note: 'Using FULL event ID including round suffix for series events'
    });

    // Query for sessions matching the FULL event_id
    // For series rounds: "uuid-round-2", "uuid-day-3", etc.
    // For single events: just the UUID
    // This ensures each series round has its own independent livestream session
    const { data, error } = await supabase
      .from('livestream_sessions')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .maybeSingle();

    console.log('🔍 [livestreamStorage] Query result:', {
      found: !!data,
      sessionId: data?.id,
      sessionEventId: data?.event_id,
      matched: data?.event_id === eventId,
      error: error?.message
    });

    return { data, error };
  },

  async createSession(session: Partial<LivestreamSession>): Promise<LivestreamSession> {
    const { data, error } = await supabase
      .from('livestream_sessions')
      .insert([session])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateSession(id: string, updates: Partial<LivestreamSession>): Promise<LivestreamSession> {
    const { data, error } = await supabase
      .from('livestream_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase
      .from('livestream_sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async updateSessionStatus(id: string, status: LivestreamSession['status']): Promise<void> {
    const updates: Partial<LivestreamSession> = { status };

    if (status === 'live' && !updates.actual_start_time) {
      updates.actual_start_time = new Date().toISOString();
    }

    if (status === 'ended' && !updates.end_time) {
      updates.end_time = new Date().toISOString();
    }

    await this.updateSession(id, updates);
  },

  // Livestream Cameras
  async getCameras(sessionId: string): Promise<LivestreamCamera[]> {
    const { data, error } = await supabase
      .from('livestream_camera_sources')
      .select('*')
      .eq('livestream_session_id', sessionId)
      .order('position', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createCamera(camera: Partial<LivestreamCamera>): Promise<LivestreamCamera> {
    const { data, error } = await supabase
      .from('livestream_camera_sources')
      .insert([camera])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateCamera(id: string, updates: Partial<LivestreamCamera>): Promise<LivestreamCamera> {
    const { data, error } = await supabase
      .from('livestream_camera_sources')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteCamera(id: string): Promise<void> {
    const { error } = await supabase
      .from('livestream_camera_sources')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async setPrimaryCamera(sessionId: string, cameraId: string): Promise<void> {
    await supabase
      .from('livestream_camera_sources')
      .update({ is_primary: false })
      .eq('livestream_session_id', sessionId);

    await supabase
      .from('livestream_camera_sources')
      .update({ is_primary: true })
      .eq('id', cameraId);
  },

  async updateCameraStatus(id: string, status: 'connected' | 'disconnected' | 'streaming' | 'error'): Promise<void> {
    const updates: any = { status };

    if (status === 'connected') {
      updates.last_connected_at = new Date().toISOString();
    }

    await this.updateCamera(id, updates);
  },

  // Livestream Overlays
  async getOverlays(sessionId: string): Promise<LivestreamOverlay[]> {
    const { data, error } = await supabase
      .from('livestream_overlays')
      .select('*')
      .eq('session_id', sessionId)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createOverlay(overlay: Partial<LivestreamOverlay>): Promise<LivestreamOverlay> {
    const { data, error } = await supabase
      .from('livestream_overlays')
      .insert([overlay])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateOverlay(id: string, updates: Partial<LivestreamOverlay>): Promise<LivestreamOverlay> {
    const { data, error } = await supabase
      .from('livestream_overlays')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteOverlay(id: string): Promise<void> {
    const { error } = await supabase
      .from('livestream_overlays')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async toggleOverlayVisibility(id: string, isVisible: boolean): Promise<void> {
    await this.updateOverlay(id, { is_visible: isVisible });
  },

  // Sponsor Rotations
  async getSponsorRotations(sessionId: string): Promise<LivestreamSponsorRotation[]> {
    const { data, error } = await supabase
      .from('livestream_sponsor_rotations')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .order('rotation_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createSponsorRotation(rotation: Partial<LivestreamSponsorRotation>): Promise<LivestreamSponsorRotation> {
    const { data, error } = await supabase
      .from('livestream_sponsor_rotations')
      .insert([rotation])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateSponsorRotation(id: string, updates: Partial<LivestreamSponsorRotation>): Promise<LivestreamSponsorRotation> {
    const { data, error } = await supabase
      .from('livestream_sponsor_rotations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteSponsorRotation(id: string): Promise<void> {
    const { error } = await supabase
      .from('livestream_sponsor_rotations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async incrementSponsorImpression(id: string): Promise<void> {
    const { error } = await supabase.rpc('increment', {
      table_name: 'livestream_sponsor_rotations',
      row_id: id,
      column_name: 'impressions'
    });

    if (error) {
      const rotation = await this.getSponsorRotation(id);
      if (rotation) {
        await this.updateSponsorRotation(id, {
          impressions: rotation.impressions + 1
        });
      }
    }
  },

  async getSponsorRotation(id: string): Promise<LivestreamSponsorRotation | null> {
    const { data, error } = await supabase
      .from('livestream_sponsor_rotations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Archives
  async getArchives(clubId: string): Promise<LivestreamArchive[]> {
    const { data, error } = await supabase
      .from('livestream_archives')
      .select('*')
      .eq('club_id', clubId)
      .order('recorded_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getArchivesByEvent(eventId: string): Promise<LivestreamArchive[]> {
    const { data, error } = await supabase
      .from('livestream_archives')
      .select('*')
      .eq('event_id', eventId)
      .order('heat_number', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createArchive(archive: Partial<LivestreamArchive>): Promise<LivestreamArchive> {
    const { data, error } = await supabase
      .from('livestream_archives')
      .insert([archive])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateArchive(id: string, updates: Partial<LivestreamArchive>): Promise<LivestreamArchive> {
    const { data, error } = await supabase
      .from('livestream_archives')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteArchive(id: string): Promise<void> {
    const { error } = await supabase
      .from('livestream_archives')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Realtime subscriptions
  subscribeToSession(sessionId: string, callback: (session: LivestreamSession) => void) {
    return supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'livestream_sessions',
          filter: `id=eq.${sessionId}`
        },
        (payload) => callback(payload.new as LivestreamSession)
      )
      .subscribe();
  },

  subscribeToSessionCameras(sessionId: string, callback: (cameras: LivestreamCamera[]) => void) {
    return supabase
      .channel(`cameras:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'livestream_camera_sources',
          filter: `livestream_session_id=eq.${sessionId}`
        },
        async () => {
          const cameras = await this.getCameras(sessionId);
          callback(cameras);
        }
      )
      .subscribe();
  }
};

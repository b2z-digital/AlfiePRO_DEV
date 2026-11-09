/**
 * Data calls for the phone camera page (/mobile-stream/:sessionId).
 *
 * With a camera key (?k=… from the QR code) every call goes through key-checked database
 * functions, so the phone does not need to be signed in. Without a key (old QR codes) it falls
 * back to the direct table calls, which only work when the phone is signed in to AlfiePRO.
 */
import { supabase } from './supabase';

export interface ViewerSignal {
  id: string;
  signal_type: string;
  signal_data: any;
  created_at: string;
}

export const createMobileCameraLink = async (sessionId: string): Promise<{ key: string; expiresAt: string }> => {
  const { data, error } = await supabase.rpc('create_mobile_camera_link', { p_session: sessionId });
  if (error) throw error;
  return { key: (data as any).key, expiresAt: (data as any).expires_at };
};

export const makeMobileCamApi = (sessionId: string, key: string | null) => {
  const k = key || null;

  return {
    usesKey: !!k,

    async getSession(): Promise<{ id: string; title: string; status: string } | null> {
      if (k) {
        const { data, error } = await supabase.rpc('mobile_cam_session', { p_session: sessionId, p_key: k });
        if (error) throw error;
        return (Array.isArray(data) ? data[0] : data) || null;
      }
      const { data, error } = await supabase.from('livestream_sessions').select('id, title, status').eq('id', sessionId).maybeSingle();
      if (error) throw error;
      return data;
    },

    /** Registers this phone as a camera (or reconnects it) and returns the camera id. */
    async registerCamera(fingerprint: string, deviceName: string): Promise<string> {
      if (k) {
        const { data, error } = await supabase.rpc('mobile_cam_register', {
          p_session: sessionId, p_key: k, p_fingerprint: fingerprint, p_device_name: deviceName,
        });
        if (error) throw error;
        return data as string;
      }

      const { data: existingCameras } = await supabase
        .from('livestream_camera_sources').select('id')
        .eq('livestream_session_id', sessionId).eq('camera_type', 'mobile');
      const { data: existing } = await supabase
        .from('livestream_camera_sources').select('id')
        .eq('livestream_session_id', sessionId).eq('camera_type', 'mobile').eq('device_fingerprint', fingerprint)
        .maybeSingle();

      if (existing) {
        await supabase.from('webrtc_signaling').delete().eq('camera_id', existing.id);
        const { data: updated, error: updateError } = await supabase.from('livestream_camera_sources')
          .update({ status: 'connected', last_connected_at: new Date().toISOString() })
          .eq('id', existing.id).select('id');
        if (!updateError && updated?.length) return existing.id;
      }

      const count = (existingCameras?.length || 0) + 1;
      const { data: created, error: insertError } = await supabase.from('livestream_camera_sources')
        .insert({
          livestream_session_id: sessionId,
          camera_name: count > 1 ? `Mobile ${count} - ${deviceName}` : `Mobile - ${deviceName}`,
          camera_type: 'mobile', status: 'connected', is_primary: false, position: count,
          device_fingerprint: fingerprint,
        })
        .select('id').single();
      if (insertError) throw insertError;
      return created.id;
    },

    async setStatus(cameraId: string, status: 'connected' | 'streaming' | 'disconnected'): Promise<void> {
      if (k) {
        await supabase.rpc('mobile_cam_set_status', { p_session: sessionId, p_key: k, p_camera: cameraId, p_status: status });
        return;
      }
      await supabase.from('livestream_camera_sources').update({ status }).eq('id', cameraId);
    },

    async sendSignal(cameraId: string, type: 'offer' | 'ice_candidate', data: any): Promise<void> {
      if (k) {
        const { error } = await supabase.rpc('mobile_cam_signal', { p_session: sessionId, p_key: k, p_camera: cameraId, p_type: type, p_data: data });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('webrtc_signaling').insert({
        camera_id: cameraId, session_id: sessionId, signal_type: type, signal_data: data, from_role: 'camera',
      });
      if (error) throw error;
    },

    /** The viewer's signals for this camera, oldest first. */
    async viewerSignals(cameraId: string, type: 'answer' | 'ice_candidate'): Promise<ViewerSignal[]> {
      if (k) {
        const { data, error } = await supabase.rpc('mobile_cam_viewer_signals', { p_session: sessionId, p_key: k, p_camera: cameraId, p_type: type });
        if (error) throw error;
        return (data as ViewerSignal[]) || [];
      }
      const { data, error } = await supabase.from('webrtc_signaling').select('id, signal_type, signal_data, created_at')
        .eq('camera_id', cameraId).eq('signal_type', type).eq('from_role', 'viewer')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as ViewerSignal[]) || [];
    },
  };
};

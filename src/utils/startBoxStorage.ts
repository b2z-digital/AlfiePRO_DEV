import { supabase } from './supabase';
import type { StartBoxSound, StartSequence, StartSequenceSound } from '../types/startBox';

export async function getSounds(clubId: string | null): Promise<StartBoxSound[]> {
  try {
    let query = supabase
      .from('start_box_sounds')
      .select('*')
      .order('is_system_default', { ascending: false })
      .order('name');

    if (clubId) {
      query = query.or(`club_id.is.null,club_id.eq.${clubId}`);
    } else {
      query = query.is('club_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching start box sounds:', err);
    return [];
  }
}

export async function uploadSound(
  clubId: string | null,
  file: File,
  name: string,
  description?: string,
  userId?: string,
  isSystemDefault?: boolean
): Promise<StartBoxSound | null> {
  try {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const prefix = isSystemDefault ? 'system' : (clubId || 'global');
    const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('start-box-sounds')
      .upload(fileName, file, {
        contentType: file.type || 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('start-box-sounds')
      .getPublicUrl(fileName);

    const duration = await getAudioDuration(file);

    const { data, error } = await supabase
      .from('start_box_sounds')
      .insert({
        club_id: isSystemDefault ? null : clubId,
        name,
        description: description || null,
        file_path: fileName,
        file_url: publicUrl,
        file_size: file.size,
        duration_ms: duration,
        mime_type: file.type || 'audio/mpeg',
        is_system_default: isSystemDefault || false,
        created_by: userId || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error uploading sound:', err);
    return null;
  }
}

export async function deleteSound(soundId: string, forceSystem?: boolean): Promise<boolean> {
  try {
    const { data: sound } = await supabase
      .from('start_box_sounds')
      .select('file_path, is_system_default')
      .eq('id', soundId)
      .maybeSingle();

    if (!sound || (sound.is_system_default && !forceSystem)) return false;

    if (sound.file_path && !sound.file_path.startsWith('system/')) {
      await supabase.storage.from('start-box-sounds').remove([sound.file_path]);
    }

    const { error } = await supabase
      .from('start_box_sounds')
      .delete()
      .eq('id', soundId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting sound:', err);
    return false;
  }
}

export async function getSequences(clubId: string | null): Promise<StartSequence[]> {
  try {
    let query = supabase
      .from('start_sequences')
      .select(`
        *,
        sounds:start_sequence_sounds(
          *,
          sound:start_box_sounds(*)
        )
      `)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (clubId) {
      query = query.or(`club_id.is.null,club_id.eq.${clubId}`);
    } else {
      query = query.is('club_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(seq => ({
      ...seq,
      sounds: (seq.sounds || []).sort(
        (a: StartSequenceSound, b: StartSequenceSound) => b.trigger_time_seconds - a.trigger_time_seconds
      ),
    }));
  } catch (err) {
    console.error('Error fetching sequences:', err);
    return [];
  }
}

export async function getSequence(sequenceId: string): Promise<StartSequence | null> {
  try {
    const { data, error } = await supabase
      .from('start_sequences')
      .select(`
        *,
        sounds:start_sequence_sounds(
          *,
          sound:start_box_sounds(*)
        )
      `)
      .eq('id', sequenceId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      ...data,
      sounds: (data.sounds || []).sort(
        (a: StartSequenceSound, b: StartSequenceSound) => b.trigger_time_seconds - a.trigger_time_seconds
      ),
    };
  } catch (err) {
    console.error('Error fetching sequence:', err);
    return null;
  }
}

export async function createSequence(
  data: Omit<StartSequence, 'id' | 'created_at' | 'updated_at' | 'sounds'>
): Promise<StartSequence | null> {
  try {
    const { data: created, error } = await supabase
      .from('start_sequences')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return { ...created, sounds: [] };
  } catch (err) {
    console.error('Error creating sequence:', err);
    return null;
  }
}

export async function updateSequence(
  sequenceId: string,
  updates: Partial<Omit<StartSequence, 'id' | 'created_at' | 'sounds'>>
): Promise<StartSequence | null> {
  try {
    const { data, error } = await supabase
      .from('start_sequences')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', sequenceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error updating sequence:', err);
    return null;
  }
}

export async function deleteSequence(sequenceId: string, forceSystem?: boolean): Promise<boolean> {
  try {
    let query = supabase
      .from('start_sequences')
      .delete()
      .eq('id', sequenceId);

    if (!forceSystem) {
      query = query.eq('is_system_default', false);
    }

    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting sequence:', err);
    return false;
  }
}

export async function addSequenceSound(
  data: Omit<StartSequenceSound, 'id' | 'created_at' | 'sound'>
): Promise<StartSequenceSound | null> {
  try {
    const { data: created, error } = await supabase
      .from('start_sequence_sounds')
      .insert(data)
      .select(`*, sound:start_box_sounds(*)`)
      .single();

    if (error) throw error;
    return created;
  } catch (err) {
    console.error('Error adding sequence sound:', err);
    return null;
  }
}

export async function updateSequenceSound(
  id: string,
  updates: Partial<Omit<StartSequenceSound, 'id' | 'created_at' | 'sound'>>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('start_sequence_sounds')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error updating sequence sound:', err);
    return false;
  }
}

export async function removeSequenceSound(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('start_sequence_sounds')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error removing sequence sound:', err);
    return false;
  }
}

export async function getDefaultSequenceForRaceType(
  clubId: string | null,
  raceType: 'scratch' | 'handicap'
): Promise<StartSequence | null> {
  try {
    let query = supabase
      .from('start_sequences')
      .select(`
        *,
        sounds:start_sequence_sounds(
          *,
          sound:start_box_sounds(*)
        )
      `)
      .eq('race_type_default', raceType)
      .eq('is_active', true)
      .order('is_system_default', { ascending: true })
      .limit(1);

    if (clubId) {
      query = query.or(`club_id.is.null,club_id.eq.${clubId}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data?.[0] || null;
  } catch (err) {
    console.error('Error fetching default sequence:', err);
    return null;
  }
}

export async function duplicateSequence(
  sequenceId: string,
  clubId: string,
  newName: string,
  userId?: string
): Promise<StartSequence | null> {
  try {
    const original = await getSequence(sequenceId);
    if (!original) return null;

    const created = await createSequence({
      club_id: clubId,
      name: newName,
      description: original.description,
      sequence_type: original.sequence_type,
      total_duration_seconds: original.total_duration_seconds,
      is_system_default: false,
      is_active: true,
      race_type_default: original.race_type_default,
      sort_order: original.sort_order + 100,
      created_by: userId,
    });

    if (!created) return null;

    if (original.sounds?.length) {
      for (const snd of original.sounds) {
        await addSequenceSound({
          sequence_id: created.id,
          sound_id: snd.sound_id,
          trigger_time_seconds: snd.trigger_time_seconds,
          label: snd.label,
          repeat_count: snd.repeat_count,
          repeat_interval_ms: snd.repeat_interval_ms,
          volume_override: snd.volume_override,
          sort_order: snd.sort_order,
        });
      }
    }

    return getSequence(created.id);
  } catch (err) {
    console.error('Error duplicating sequence:', err);
    return null;
  }
}

export async function uploadSequenceAudio(
  sequenceId: string,
  clubId: string | null,
  file: File
): Promise<{ audio_file_path: string; audio_file_url: string } | null> {
  try {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const prefix = clubId || 'global';
    const fileName = `${prefix}/sequences/${sequenceId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('start-box-sounds')
      .upload(fileName, file, {
        contentType: file.type || 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('start-box-sounds')
      .getPublicUrl(fileName);

    const { error } = await supabase
      .from('start_sequences')
      .update({
        audio_file_path: fileName,
        audio_file_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sequenceId);

    if (error) throw error;
    return { audio_file_path: fileName, audio_file_url: publicUrl };
  } catch (err) {
    console.error('Error uploading sequence audio:', err);
    return null;
  }
}

export async function removeSequenceAudio(sequenceId: string): Promise<boolean> {
  try {
    const { data: seq } = await supabase
      .from('start_sequences')
      .select('audio_file_path')
      .eq('id', sequenceId)
      .maybeSingle();

    if (seq?.audio_file_path) {
      await supabase.storage.from('start-box-sounds').remove([seq.audio_file_path]);
    }

    const { error } = await supabase
      .from('start_sequences')
      .update({
        audio_file_path: null,
        audio_file_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sequenceId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error removing sequence audio:', err);
    return false;
  }
}

function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.addEventListener('loadedmetadata', () => {
        const durationMs = Math.round(audio.duration * 1000);
        URL.revokeObjectURL(url);
        resolve(durationMs);
      });
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        resolve(null);
      });
      audio.src = url;
    } catch {
      resolve(null);
    }
  });
}

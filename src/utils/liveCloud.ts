import { supabase } from './supabase';

/** Calls the live-cloud edge function (cloud production engine). Throws with the function's message. */
export async function liveCloud<T = Record<string, any>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('live-cloud', { body: { action, ...payload } });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** The RealtimeKit client is large, so it's only loaded on the live pages that need it. */
export async function loadRealtimeKit() {
  const mod = await import('@cloudflare/realtimekit');
  return mod.default;
}

export type RtkMeeting = Awaited<ReturnType<Awaited<ReturnType<typeof loadRealtimeKit>>['init']>>;

export const CAMERA_PRESET = 'alfie_camera';
export const PROGRAM_MESSAGE = 'alfie-program';
/** A note from the control room to one camera ({ to: participantId }) or all of them ({ to: 'all' }) */
export const NOTE_MESSAGE = 'alfie-note';
/** The broadcast has ended: cameras stop sending and say so */
export const ENDED_MESSAGE = 'alfie-ended';
/** Control room → program page: show the title card / the last race's results / hold on or off */
export const TITLE_MESSAGE = 'alfie-title';
export const RESULTS_MESSAGE = 'alfie-results';
export const HOLD_MESSAGE = 'alfie-hold';

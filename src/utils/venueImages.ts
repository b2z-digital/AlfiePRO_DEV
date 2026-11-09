/**
 * Venue photos live in Storage (public "media" bucket), not in the venues table.
 *
 * Venue photos used to be saved as base64 data URLs in venues.image, so every page that loaded
 * venues downloaded every photo again (egress). Now a photo is resized, uploaded once, and the
 * row keeps only its public URL. The browser caches the image like any other file.
 */
import { supabase } from './supabase';

const BUCKET = 'media';
const MAX_SIDE = 1920;

const isDataUrl = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/');

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Scales a photo down to at most 1920px on its longest side and re-encodes it as JPEG. */
async function shrink(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/svg+xml' || blob.type === 'image/gif') return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    // Keep the original if re-encoding made it bigger (already small or a PNG graphic)
    return out && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

const extFor = (type: string) => (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : type === 'image/svg+xml' ? 'svg' : 'jpg');

/** Uploads a photo (data URL or File) and returns its public URL. */
export async function uploadVenueImage(source: string | Blob, clubId?: string | null): Promise<string> {
  const original = typeof source === 'string' ? await dataUrlToBlob(source) : source;
  const blob = await shrink(original);
  const path = `venues/${clubId || 'shared'}/${crypto.randomUUID()}.${extFor(blob.type)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * For saving a venue: a data URL is uploaded and replaced by its URL; anything else is returned
 * as it is. If the upload fails the data URL is kept, so the save still works.
 */
export async function ensureVenueImageUrl<T extends string | null | undefined>(image: T, clubId?: string | null): Promise<T | string> {
  if (!isDataUrl(image)) return image;
  try {
    return await uploadVenueImage(image, clubId);
  } catch (err) {
    console.warn('[Venue photo] Upload to storage failed; keeping the embedded photo for now:', err);
    return image;
  }
}

/** Number of venues that still hold an embedded (base64) photo. */
export async function countEmbeddedVenueImages(): Promise<number> {
  const { count, error } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .like('image', 'data:%');
  if (error) return 0;
  return count || 0;
}

/**
 * Moves every embedded venue photo the signed-in user may edit into Storage, one venue at a time
 * (so the browser never holds all the photos at once). Returns how many moved and how many failed.
 */
export async function migrateVenueImages(onProgress?: (done: number, total: number) => void): Promise<{ moved: number; failed: number }> {
  const { data: rows, error } = await supabase.from('venues').select('id, club_id').like('image', 'data:%');
  if (error) throw error;
  const list = rows || [];
  let moved = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i++) {
    const { id, club_id } = list[i] as { id: string; club_id: string | null };
    try {
      const { data: row } = await supabase.from('venues').select('image').eq('id', id).maybeSingle();
      const image = (row as { image?: string } | null)?.image;
      if (isDataUrl(image)) {
        const url = await uploadVenueImage(image, club_id);
        const { data: updated, error: upErr } = await supabase.from('venues').update({ image: url }).eq('id', id).select('id');
        if (upErr || !updated?.length) throw upErr || new Error('No permission to update this venue');
        moved++;
      }
    } catch (err) {
      console.warn('[Venue photo] Could not move photo for venue', id, err);
      failed++;
    }
    onProgress?.(i + 1, list.length);
  }
  return { moved, failed };
}

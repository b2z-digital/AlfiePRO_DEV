/**
 * Is a YouTube video still there? AlfieTV replays point at YouTube, so a race video deleted
 * (or made private) on the channel must drop out of AlfieTV too.
 *
 * YouTube answers a missing video's thumbnail with a 120×90 grey placeholder instead of the real
 * 320×180 picture, so loading the thumbnail tells us without an API key or a server call.
 * A network failure counts as "still there" (never hide a video on a hiccup).
 */
const cache = new Map<string, Promise<boolean>>();

export function isYouTubeVideoGone(videoId: string): Promise<boolean> {
  if (!videoId) return Promise.resolve(false);
  const hit = cache.get(videoId);
  if (hit) return hit;
  const check = new Promise<boolean>(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), 8000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0 && img.naturalWidth <= 120); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
  });
  cache.set(videoId, check);
  return check;
}

/** Ids from the list whose YouTube video no longer exists. Videos uploaded in the last hour are
 *  skipped: YouTube may still be making their thumbnail. */
export async function goneYouTubeIds(items: { youtube_video_id?: string | null; created_at?: string | null; recorded_at?: string | null }[]): Promise<Set<string>> {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const toCheck = items.filter(i => {
    if (!i.youtube_video_id) return false;
    const t = new Date(i.created_at || i.recorded_at || 0).getTime();
    return !t || t < hourAgo;
  });
  const results = await Promise.all(toCheck.map(async i => [i.youtube_video_id!, await isYouTubeVideoGone(i.youtube_video_id!)] as const));
  return new Set(results.filter(([, gone]) => gone).map(([id]) => id));
}

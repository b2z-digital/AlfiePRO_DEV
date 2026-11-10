// Today's wind at a venue, from the app's weather service (cached in Supabase for an hour), so you
// can race your club's water in the breeze that's blowing there now.
import type { VenueDef } from '@/sim/venue';

export interface VenueWind { kn: number; from: number; at: string }

const got = new Map<string, Promise<VenueWind | null>>();

export function fetchVenueWind(def: VenueDef): Promise<VenueWind | null> {
  let p = got.get(def.id);
  if (!p) {
    p = import('@/utils/weatherAPI')
      .then(m => m.getCurrentWeather(def.lat, def.lon, def.short))
      .then(w => (w && Number.isFinite(w.windSpeed) && Number.isFinite(w.windDirection)
        ? { kn: Math.max(2, Math.min(22, w.windSpeed)), from: ((w.windDirection % 360) + 360) % 360, at: w.updatedAt }
        : null))
      .catch(() => null);
    got.set(def.id, p);
    // Ask again next time if it didn't work.
    void p.then(r => { if (!r) got.delete(def.id); });
  }
  return p;
}

// Your skipper profile: the last races you sailed and a simple score for each part of racing,
// worked out from them. Kept on this device, and in your account when you're signed in (sync.ts).
import type { RaceSummary } from './stats';

const KEY = 'alfie-race-sim-profile-v1';

export interface Profile { races: RaceSummary[] }

export function loadProfile(): Profile {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const p = JSON.parse(s); if (Array.isArray(p.races)) return p; }
  } catch { /* storage unavailable */ }
  return { races: [] };
}

export function saveRace(sum: RaceSummary): Profile {
  const p = loadProfile();
  p.races = [sum, ...p.races].slice(0, 30);
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  return p;
}

export function clearProfile() { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

/** Add the races from your account that this device hasn't seen (the newest 30 are kept). Nothing from before `since` (when you last started again). */
export function mergeRaces(remote: RaceSummary[], since = 0): Profile {
  const p = loadProfile();
  const byAt = new Map(p.races.filter(r => r.at >= since).map(r => [r.at, r]));
  for (const r of remote) if (r.at >= since && !byAt.has(r.at)) byAt.set(r.at, r);
  p.races = [...byAt.values()].sort((a, b) => b.at - a.at).slice(0, 30);
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  return p;
}

export interface Skills { starts: number; upwind: number; roundings: number; downwind: number; rules: number; races: number; avgPlace: number | null; wins: number }

const clamp = (v: number) => Math.round(Math.max(5, Math.min(99, v)));

export function skills(p: Profile): Skills | null {
  const rs = p.races.slice(0, 12);
  if (!rs.length) return null;
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const late = avg(rs.map(r => r.late));
  const ocs = rs.filter(r => r.ocs).length / rs.length;
  const lifted = avg(rs.map(r => r.upwind.liftedPct));
  const gained = avg(rs.map(r => (r.roundings.count ? r.roundings.gained / r.roundings.count : null)));
  const dn = avg(rs.map(r => r.downwind.spdPct));
  const inc = avg(rs.map(r => r.incidents.filter(i => i.mine).length));
  const races = rs.filter(r => r.mode === 'race');
  const places = races.map(r => (r.place ? r.place / r.of : null));
  return {
    starts: clamp(90 - (late ?? 3) * 9 - ocs * 45),
    upwind: clamp(((lifted ?? 0.55) - 0.3) * 160),
    roundings: clamp(55 + (gained ?? 0) * 18),
    downwind: clamp(((dn ?? 0.85) - 0.55) * 220),
    rules: clamp(95 - (inc ?? 0.5) * 22),
    races: rs.length,
    avgPlace: avg(places),
    wins: races.filter(r => r.place === 1).length,
  };
}
